// sim/simulate.mjs
// Monte Carlo orchestrator. Runs the scripted, synthetic-LLM, and (optionally) real-LLM
// tracks, and persists EVERY run to sim/results/ as JSON Lines plus a batch manifest.
//
// Usage:
//   node sim/simulate.mjs --scripted 500 --synthetic 500
//   node sim/simulate.mjs --real 25            (requires sim/.env.local with GITHUB_TOKEN)
//   node sim/simulate.mjs --scripted 500 --synthetic 500 --real 25 --seed 1337

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  makePRNG,
  runScripted,
  runLLMGame,
  validateGraph,
} from './engine-headless.mjs';
import {
  SYNTHETIC_PROFILES,
  makeSyntheticResponderFor,
  makeRealResponder,
} from './model-profiles.mjs';
import { NAME_SETS } from '../js/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.join(__dirname, 'results');

// ---------- CLI args ----------
function argVal(flag, def) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const N_SCRIPTED = Number(argVal('--scripted', '500'));
const N_SYNTHETIC = Number(argVal('--synthetic', '500'));
const N_REAL = Number(argVal('--real', '0'));
const SEED = Number(argVal('--seed', '1337'));
const REAL_TURN_CAP = Number(argVal('--real-turn-cap', '12'));

// ---------- Minimal .env.local loader (no dependency) ----------
function loadEnvLocal() {
  const file = path.join(__dirname, '.env.local');
  const env = {};
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      // Defensive cleaning: strip surrounding whitespace, quotes, and angle brackets that
      // are easy to paste accidentally (e.g. from a "<your token>" placeholder).
      if (m) env[m[1]] = m[2].trim().replace(/^["'<]+|["'>]+$/g, '');
    }
  }
  // Environment variables take precedence if set.
  return {
    GITHUB_TOKEN: process.env.GITHUB_TOKEN || env.GITHUB_TOKEN || '',
    SIM_MODELS: process.env.SIM_MODELS || env.SIM_MODELS || '',
    GH_MODELS_ENDPOINT:
      process.env.GH_MODELS_ENDPOINT ||
      env.GH_MODELS_ENDPOINT ||
      'https://models.github.ai/inference/chat/completions',
  };
}

const DEFAULT_MODELS = [
  'openai/gpt-4o',
  'openai/gpt-4o-mini',
  'meta/Llama-3.3-70B-Instruct',
  'microsoft/Phi-4',
  'mistral-ai/Mistral-Nemo',
];

function ensureCleanResults() {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  // Remove prior run files so a batch is self-consistent (manifest documents the batch).
  for (const f of fs.readdirSync(RESULTS_DIR)) {
    if (f.endsWith('.jsonl') || f === 'analysis.json' || f === 'batch-manifest.json') {
      fs.rmSync(path.join(RESULTS_DIR, f));
    }
  }
}

function writeLine(stream, obj) {
  stream.write(JSON.stringify(obj) + '\n');
}

const nameSetKeys = Object.keys(NAME_SETS);

async function main() {
  const startedAt = new Date().toISOString();
  ensureCleanResults();
  const manifest = {
    startedAt,
    seed: SEED,
    counts: { scripted: N_SCRIPTED, syntheticPerProfile: N_SYNTHETIC, realPerModel: N_REAL },
    nameSets: nameSetKeys,
    tracks: [],
    graphValidation: validateGraph(),
    finishedAt: null,
  };

  // ----- Scripted track -----
  if (N_SCRIPTED > 0) {
    const rng = makePRNG(SEED);
    const stream = fs.createWriteStream(path.join(RESULTS_DIR, 'scripted-runs.jsonl'));
    for (let i = 0; i < N_SCRIPTED; i++) {
      const nameSet = nameSetKeys[Math.floor(rng() * nameSetKeys.length)];
      const run = runScripted(rng, nameSet);
      run.runIndex = i;
      writeLine(stream, run);
    }
    stream.end();
    manifest.tracks.push({ track: 'scripted', file: 'scripted-runs.jsonl', runs: N_SCRIPTED });
    console.log(`[scripted]  ${N_SCRIPTED} runs -> scripted-runs.jsonl`);
  }

  // ----- Synthetic LLM track (per model class) -----
  if (N_SYNTHETIC > 0) {
    for (const [pKey, profile] of Object.entries(SYNTHETIC_PROFILES)) {
      const rng = makePRNG(SEED + hash(pKey));
      const file = `llm-synthetic-${pKey}-runs.jsonl`;
      const stream = fs.createWriteStream(path.join(RESULTS_DIR, file));
      for (let i = 0; i < N_SYNTHETIC; i++) {
        const nameSet = nameSetKeys[Math.floor(rng() * nameSetKeys.length)];
        const respond = makeSyntheticResponderFor(pKey, rng);
        // eslint-disable-next-line no-await-in-loop
        const run = await runLLMGame({ respond, rng, nameSetKey: nameSet, modelId: pKey });
        run.runIndex = i;
        run.profileLabel = profile.label;
        run.kind = 'synthetic';
        run.price = profile.price;
        writeLine(stream, run);
      }
      stream.end();
      manifest.tracks.push({ track: 'llm-synthetic', model: pKey, file, runs: N_SYNTHETIC });
      console.log(`[synthetic] ${N_SYNTHETIC} runs -> ${file}`);
    }
  }

  // ----- Real LLM track (GitHub Models) -----
  if (N_REAL > 0) {
    const cfg = loadEnvLocal();
    if (!cfg.GITHUB_TOKEN) {
      console.error(
        '\n[real] SKIPPED: no GITHUB_TOKEN found. Create sim/.env.local with:\n' +
          '  GITHUB_TOKEN=<token with models:read>\n' +
          '  SIM_MODELS=openai/gpt-4o,openai/gpt-4o-mini,...\n'
      );
    } else {
      const models = (cfg.SIM_MODELS ? cfg.SIM_MODELS.split(',') : DEFAULT_MODELS)
        .map((m) => m.trim())
        .filter(Boolean);
      console.log(`[real] endpoint: ${cfg.GH_MODELS_ENDPOINT}`);
      console.log(`[real] models: ${models.join(', ')}`);
      for (const model of models) {
        const rng = makePRNG(SEED + hash(model));
        const safe = model.replace(/[^\w.-]+/g, '_');
        const file = `llm-real-${safe}-runs.jsonl`;
        const stream = fs.createWriteStream(path.join(RESULTS_DIR, file));
        let ok = 0;
        let failed = 0;
        for (let i = 0; i < N_REAL; i++) {
          const nameSet = nameSetKeys[Math.floor(rng() * nameSetKeys.length)];
          const respond = makeRealResponder({
            endpoint: cfg.GH_MODELS_ENDPOINT,
            token: cfg.GITHUB_TOKEN,
            model,
            nameSetKey: nameSet,
          });
          // eslint-disable-next-line no-await-in-loop
          const run = await runLLMGame({
            respond,
            rng,
            nameSetKey: nameSet,
            modelId: model,
            turnCap: REAL_TURN_CAP,
          });
          run.runIndex = i;
          run.kind = 'real';
          if (run.transportErrors > 0) failed += 1;
          else ok += 1;
          writeLine(stream, run);
          process.stdout.write(`\r[real] ${model}: ${i + 1}/${N_REAL} (ok=${ok}, err=${failed})   `);
        }
        stream.end();
        process.stdout.write('\n');
        manifest.tracks.push({ track: 'llm-real', model, file, runs: N_REAL, ok, failed });
      }
    }
  }

  manifest.finishedAt = new Date().toISOString();
  fs.writeFileSync(
    path.join(RESULTS_DIR, 'batch-manifest.json'),
    JSON.stringify(manifest, null, 2)
  );
  console.log(`\nDone. Results in ${RESULTS_DIR}`);
  console.log('Next: node sim/analyze.mjs');
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
