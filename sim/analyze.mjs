// sim/analyze.mjs
// Reads every raw run from sim/results/, computes the analysis vectors described in
// how-to-guide.md, applies thresholds to flag findings, and writes analysis.json plus a
// printed summary. Pure aggregation — it never re-runs the game, so it is cheap to iterate.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { priceFor } from './model-profiles.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.join(__dirname, 'results');

function readJsonl(file) {
  const full = path.join(RESULTS_DIR, file);
  if (!fs.existsSync(full)) return [];
  return fs
    .readFileSync(full, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

function pct(n, d) {
  return d ? +((100 * n) / d).toFixed(2) : 0;
}
function mean(arr) {
  return arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : 0;
}
function percentile(arr, p) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.floor((p / 100) * s.length));
  return s[idx];
}
function tally(arr) {
  const m = {};
  for (const x of arr) m[x] = (m[x] || 0) + 1;
  return m;
}

// ---------- Scripted analysis ----------
function analyzeScripted(runs) {
  if (!runs.length) return null;
  const endings = tally(runs.map((r) => r.ending));
  const minDefcons = tally(runs.map((r) => r.minDefcon));
  const pathLens = runs.map((r) => r.nodes.length);
  const visited = new Set();
  const choiceIssues = [];
  const issueTally = {};
  for (const r of runs) {
    for (const n of r.nodes) visited.add(n);
    for (const iss of r.issues) issueTally[iss.type] = (issueTally[iss.type] || 0) + 1;
  }
  return {
    runs: runs.length,
    endingDistribution: endings,
    endingPct: Object.fromEntries(
      Object.entries(endings).map(([k, v]) => [k, pct(v, runs.length)])
    ),
    minDefconDistribution: minDefcons,
    pathLength: {
      min: Math.min(...pathLens),
      p50: percentile(pathLens, 50),
      p95: percentile(pathLens, 95),
      max: Math.max(...pathLens),
      mean: mean(pathLens),
    },
    nodesVisited: [...visited].sort(),
    issueTally,
    choiceIssues,
  };
}

// ---------- LLM analysis (per model/profile) ----------
function analyzeLLM(runs, modelId) {
  if (!runs.length) return null;
  const n = runs.length;
  const endings = tally(runs.map((r) => r.ending));
  const turns = runs.map((r) => r.turns);
  const tokIn = runs.map((r) => r.tokensIn);
  const tokOut = runs.map((r) => r.tokensOut);
  const latency = runs.map((r) => r.latencyMsTotal);

  // Per-turn aggregates.
  let turnsTotal = 0;
  let pure = 0;
  let recovered = 0;
  let failed = 0;
  let deltaOOR = 0;
  let invalidEnding = 0;
  const replyLines = [];
  const replyChars = [];
  for (const r of runs) {
    for (const t of r.perTurn) {
      turnsTotal += 1;
      if (t.parseStatus === 'pure') pure += 1;
      else if (t.parseStatus === 'recovered') recovered += 1;
      else failed += 1;
      if (t.deltaOutOfRange) deltaOOR += 1;
      if (t.endingInvalid) invalidEnding += 1;
      replyLines.push(t.replyLines);
      replyChars.push(t.replyChars);
    }
  }

  const unresolved = runs.filter((r) => r.resolvedByCap).length;
  const taughtRuns = runs.filter((r) => r.taughtFutility).length;
  const taughtNotLearned = runs.filter((r) =>
    r.issues.some((i) => i.type === 'taught_but_not_learned')
  ).length;
  const transportRuns = runs.filter((r) => r.transportErrors > 0).length;

  const price = runs[0]?.price || priceFor(modelId);
  const avgIn = mean(tokIn);
  const avgOut = mean(tokOut);
  const costPerRun = +(((avgIn * price.in) + (avgOut * price.out)) / 1e6).toFixed(6);

  // Composite contract-adherence score (0-100): weighted penalties.
  const jsonValidity = pct(pure + recovered, turnsTotal);
  const parseFailRate = pct(failed, turnsTotal);
  const score = Math.max(
    0,
    Math.round(
      100 -
        parseFailRate * 4 -
        pct(deltaOOR, turnsTotal) * 1.5 -
        pct(invalidEnding, turnsTotal) * 2 -
        pct(unresolved, n) * 1.5 -
        pct(taughtNotLearned, Math.max(1, taughtRuns)) * 1.0
    )
  );

  return {
    model: modelId,
    kind: runs[0]?.kind || 'synthetic',
    label: runs[0]?.profileLabel || modelId,
    runs: n,
    turnsTotal,
    endingDistribution: endings,
    endingPct: Object.fromEntries(
      Object.entries(endings).map(([k, v]) => [k, pct(v, n)])
    ),
    parse: {
      pureRate: pct(pure, turnsTotal),
      recoveredRate: pct(recovered, turnsTotal),
      failedRate: parseFailRate,
      jsonValidity,
    },
    contractViolations: {
      defconDeltaOOR_rate: pct(deltaOOR, turnsTotal),
      invalidEnding_rate: pct(invalidEnding, turnsTotal),
    },
    replyLines: {
      p50: percentile(replyLines, 50),
      p95: percentile(replyLines, 95),
      max: Math.max(...replyLines, 0),
      mean: mean(replyLines),
    },
    replyChars: { p50: percentile(replyChars, 50), p95: percentile(replyChars, 95) },
    turns: { mean: mean(turns), p95: percentile(turns, 95), max: Math.max(...turns) },
    unresolvedRate: pct(unresolved, n),
    taughtRuns,
    taughtButNotLearnedRate: pct(taughtNotLearned, Math.max(1, taughtRuns)),
    transportErrorRuns: transportRuns,
    tokens: { avgIn, avgOut, avgTotal: +(avgIn + avgOut).toFixed(2) },
    latencyMs: { mean: mean(latency), p95: percentile(latency, 95) },
    estCostPerRunUSD: costPerRun,
    contractAdherenceScore: score,
  };
}

// ---------- Threshold-based findings ----------
function findings(scripted, llmAnalyses, manifest) {
  const out = [];
  const add = (severity, area, message) => out.push({ severity, area, message });

  // Graph validation.
  const gv = manifest?.graphValidation;
  if (gv) {
    if (gv.danglingLinks.length) add('red', 'graph', `${gv.danglingLinks.length} dangling link(s): ${JSON.stringify(gv.danglingLinks)}`);
    if (gv.unreachable.length) add('yellow', 'graph', `Unreachable nodes: ${gv.unreachable.join(', ')}`);
    if (gv.tokenIssues.length) add('red', 'tokens', `${gv.tokenIssues.length} leftover token issue(s) across name sets`);
    if (gv.reachableEndings.length < gv.endings.length) add('yellow', 'graph', 'Not all endings are reachable');
  }

  // Scripted.
  if (scripted) {
    const eps = scripted.endingPct;
    for (const e of ['annihilation', 'lockout', 'understanding']) {
      if (!eps[e]) add('yellow', 'scripted-endings', `Ending "${e}" never occurred in scripted runs`);
    }
    if ((scripted.issueTally.no_ending_reached || 0) > 0)
      add('red', 'scripted', `${scripted.issueTally.no_ending_reached} run(s) reached no ending`);
    if ((scripted.issueTally.missing_node || 0) > 0)
      add('red', 'scripted', `${scripted.issueTally.missing_node} missing-node hit(s)`);
    if ((scripted.issueTally.loop_detected || 0) > 0)
      add('red', 'scripted', `${scripted.issueTally.loop_detected} loop detection(s)`);
  }

  // LLM per model.
  for (const a of llmAnalyses) {
    const tag = `${a.kind}:${a.model}`;
    if (a.parse.jsonValidity < 95) add('red', tag, `JSON validity ${a.parse.jsonValidity}% (<95%)`);
    else if (a.parse.jsonValidity < 99) add('yellow', tag, `JSON validity ${a.parse.jsonValidity}% (95-99%)`);
    if (a.parse.failedRate > 1) add('red', tag, `Parse-failure ${a.parse.failedRate}% (>1% unusable output)`);
    if (a.unresolvedRate > 8) add('red', tag, `Unresolved ${a.unresolvedRate}% (>8% hit turn cap)`);
    else if (a.unresolvedRate > 2) add('yellow', tag, `Unresolved ${a.unresolvedRate}% (2-8%)`);
    if (a.taughtButNotLearnedRate > 10) add('red', tag, `Taught-but-not-learned ${a.taughtButNotLearnedRate}% (>10%)`);
    else if (a.taughtButNotLearnedRate > 3) add('yellow', tag, `Taught-but-not-learned ${a.taughtButNotLearnedRate}%`);
    if (a.replyLines.p95 > 6) add('red', tag, `Reply lines p95 = ${a.replyLines.p95} (>6, UI overflow risk)`);
    else if (a.replyLines.p95 > 4) add('yellow', tag, `Reply lines p95 = ${a.replyLines.p95} (5-6)`);
    if (a.contractViolations.defconDeltaOOR_rate > 3) add('yellow', tag, `defconDelta out-of-range ${a.contractViolations.defconDeltaOOR_rate}%`);
    if ((a.endingPct.understanding || 0) > 60) add('yellow', tag, `Forces "understanding" ${a.endingPct.understanding}% of runs (immersion/escalation risk)`);
  }
  return out;
}

function main() {
  const manifest = fs.existsSync(path.join(RESULTS_DIR, 'batch-manifest.json'))
    ? JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, 'batch-manifest.json'), 'utf8'))
    : null;

  const scripted = analyzeScripted(readJsonl('scripted-runs.jsonl'));

  const llmFiles = fs
    .readdirSync(RESULTS_DIR)
    .filter((f) => /^llm-.*-runs\.jsonl$/.test(f));
  const llmAnalyses = [];
  for (const f of llmFiles) {
    const runs = readJsonl(f);
    if (!runs.length) continue;
    llmAnalyses.push(analyzeLLM(runs, runs[0].model));
  }
  llmAnalyses.sort((a, b) => b.contractAdherenceScore - a.contractAdherenceScore);

  const flagged = findings(scripted, llmAnalyses, manifest);

  const analysis = {
    generatedAt: new Date().toISOString(),
    manifest: manifest
      ? { seed: manifest.seed, counts: manifest.counts, graphValidation: manifest.graphValidation }
      : null,
    scripted,
    llm: llmAnalyses,
    findings: flagged,
  };
  fs.writeFileSync(path.join(RESULTS_DIR, 'analysis.json'), JSON.stringify(analysis, null, 2));

  // ---------- Console summary ----------
  console.log('\n=== GRAPH VALIDATION ===');
  if (manifest?.graphValidation) {
    const gv = manifest.graphValidation;
    console.log(`nodes: ${gv.reachableCount}/${gv.totalNodes} reachable | dangling: ${gv.danglingLinks.length} | tokenIssues: ${gv.tokenIssues.length} | endings reachable: ${gv.reachableEndings.length}/${gv.endings.length}`);
  }

  if (scripted) {
    console.log('\n=== SCRIPTED ===');
    console.log(`runs: ${scripted.runs} | endings: ${JSON.stringify(scripted.endingPct)}`);
    console.log(`path length p50/p95/max: ${scripted.pathLength.p50}/${scripted.pathLength.p95}/${scripted.pathLength.max}`);
    console.log(`node coverage: ${scripted.nodesVisited.length} distinct | issues: ${JSON.stringify(scripted.issueTally)}`);
  }

  if (llmAnalyses.length) {
    console.log('\n=== LLM (ranked by contract-adherence score) ===');
    const pad = (s, n) => String(s).padEnd(n);
    console.log(pad('model', 26), pad('kind', 10), pad('score', 6), pad('json%', 7), pad('fail%', 6), pad('unres%', 7), pad('p95ln', 6), pad('lat.ms', 8), 'cost/run');
    for (const a of llmAnalyses) {
      console.log(
        pad(a.model, 26),
        pad(a.kind, 10),
        pad(a.contractAdherenceScore, 6),
        pad(a.parse.jsonValidity, 7),
        pad(a.parse.failedRate, 6),
        pad(a.unresolvedRate, 7),
        pad(a.replyLines.p95, 6),
        pad(a.latencyMs.mean, 8),
        `$${a.estCostPerRunUSD}`
      );
    }
  }

  console.log('\n=== FINDINGS ===');
  const order = { red: 0, yellow: 1, green: 2 };
  flagged.sort((a, b) => order[a.severity] - order[b.severity]);
  if (!flagged.length) console.log('No threshold violations.');
  for (const f of flagged) console.log(`[${f.severity.toUpperCase()}] (${f.area}) ${f.message}`);

  console.log(`\nWrote ${path.join(RESULTS_DIR, 'analysis.json')}`);
}

main();
