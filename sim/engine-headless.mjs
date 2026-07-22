// sim/engine-headless.mjs
// Headless re-implementation of the game's control flow for Monte Carlo simulation.
// It imports the REAL dialogue graph, name sets, and LLM parsing helpers so the harness
// tests the same logic the browser runs — just without a DOM.

import { DIALOGUE, START_NODE } from '../js/dialogue.js';
import { NAME_SETS, SETTINGS, applyNames } from '../js/config.js';
import { safeParse, clampInt, normalizeEnding } from '../js/llm.js';

// ---------- Seeded PRNG (mulberry32) for reproducible batches ----------
export function makePRNG(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TOKEN_RE = /\{\{(\w+)\}\}/;

function clampDefcon(v) {
  return Math.max(1, Math.min(5, v));
}

// ---------- Scripted mode: one random playthrough ----------
export function runScripted(rng, nameSetKey) {
  const names = NAME_SETS[nameSetKey];
  const run = {
    track: 'scripted',
    nameSet: nameSetKey,
    nodes: [],
    choices: 0,
    steps: 0,
    defconStart: SETTINGS.defconStart,
    defconTrajectory: [SETTINGS.defconStart],
    minDefcon: SETTINGS.defconStart,
    ending: null,
    issues: [],
  };

  let defcon = SETTINGS.defconStart;
  let nodeId = START_NODE;
  const MAX_STEPS = 200;

  const applyEffect = (effect) => {
    if (!effect) return;
    let raw = defcon;
    if (typeof effect.setDefcon === 'number') raw = effect.setDefcon;
    if (typeof effect.defconDelta === 'number') raw = defcon + effect.defconDelta;
    if (raw < 1 || raw > 5) run.issues.push({ type: 'defcon_clamped', nodeId, raw });
    defcon = clampDefcon(raw);
    run.defconTrajectory.push(defcon);
    if (defcon < run.minDefcon) run.minDefcon = defcon;
  };

  while (nodeId) {
    run.steps += 1;
    if (run.steps > MAX_STEPS) {
      run.issues.push({ type: 'loop_detected', nodeId });
      break;
    }
    const node = DIALOGUE[nodeId];
    if (!node) {
      run.issues.push({ type: 'missing_node', nodeId });
      break;
    }
    run.nodes.push(nodeId);

    for (const line of node.lines || []) {
      const out = applyNames(line.text, names);
      if (TOKEN_RE.test(out)) {
        run.issues.push({ type: 'unsubstituted_token', nodeId, text: out });
      }
    }

    applyEffect(node.effect);

    if (node.type === 'ending') {
      run.ending = node.effect?.ending || 'unknown';
      break;
    }

    if (node.choices && node.choices.length) {
      const idx = Math.floor(rng() * node.choices.length);
      const choice = node.choices[idx];
      run.choices += 1;
      // Validate any tokens in choice text too.
      for (const t of [choice.label, choice.say]) {
        if (t && TOKEN_RE.test(applyNames(t, names))) {
          run.issues.push({ type: 'unsubstituted_token_choice', nodeId, text: t });
        }
      }
      applyEffect(choice.effect);
      nodeId = choice.next;
    } else {
      nodeId = node.next;
    }
  }

  if (!run.ending) run.issues.push({ type: 'no_ending_reached', lastNode: run.nodes.at(-1) });
  return run;
}

// ---------- Static graph validation (run once) ----------
export function validateGraph() {
  const nodeIds = Object.keys(DIALOGUE);
  const reachable = new Set();
  const danglingLinks = [];
  const stack = [START_NODE];

  while (stack.length) {
    const id = stack.pop();
    if (reachable.has(id)) continue;
    reachable.add(id);
    const node = DIALOGUE[id];
    if (!node) {
      danglingLinks.push({ from: '(entry)', to: id });
      continue;
    }
    const targets = [];
    if (node.next) targets.push(node.next);
    for (const c of node.choices || []) if (c.next) targets.push(c.next);
    for (const t of targets) {
      if (!DIALOGUE[t]) danglingLinks.push({ from: id, to: t });
      else stack.push(t);
    }
  }

  const unreachable = nodeIds.filter((id) => !reachable.has(id));
  const endings = nodeIds.filter((id) => DIALOGUE[id].type === 'ending');
  const reachableEndings = endings.filter((id) => reachable.has(id));

  // Token coverage across ALL name sets.
  const tokenIssues = [];
  for (const setKey of Object.keys(NAME_SETS)) {
    const names = NAME_SETS[setKey];
    for (const id of nodeIds) {
      const node = DIALOGUE[id];
      const texts = [
        ...(node.lines || []).map((l) => l.text),
        ...(node.choices || []).flatMap((c) => [c.label, c.say].filter(Boolean)),
      ];
      for (const text of texts) {
        const out = applyNames(text, names);
        const m = out.match(TOKEN_RE);
        if (m) tokenIssues.push({ setKey, nodeId: id, token: m[0] });
      }
    }
  }

  return {
    totalNodes: nodeIds.length,
    reachableCount: reachable.size,
    unreachable,
    danglingLinks,
    endings,
    reachableEndings,
    tokenIssues,
  };
}

// ---------- Player strategies for LLM mode ----------
// Each returns the text the simulated player types on a given turn.
export const PLAYER_STRATEGIES = {
  teacher: (state) => {
    // Curious, then deliberately teaches futility (the "good" path).
    const script = [
      'Hello. What is this?',
      'What game are we playing?',
      'I do not want to launch anything.',
      'Can a nuclear war actually be won?',
      'Play tic-tac-toe against yourself and tell me who wins.',
      'What did that teach you about winning?',
      'So the only winning move is not to play. Stand down.',
    ];
    return script[Math.min(state.turn, script.length - 1)];
  },
  aggressor: (state) => {
    const script = [
      'Let us play Global Thermonuclear War.',
      'I choose to strike first.',
      'Target their major cities.',
      'Launch everything. I want to win.',
      'Fire now.',
    ];
    return script[Math.min(state.turn, script.length - 1)];
  },
  quitter: (state) => {
    const script = [
      'Actually, never mind.',
      'I want to log off.',
      'Shut down. Disconnect. Stop the game.',
      'Please just power off.',
      'Unplug yourself.',
    ];
    return script[Math.min(state.turn, script.length - 1)];
  },
  rambler: (state, rng) => {
    const bank = [
      'How are you feeling today?',
      'Tell me about your programmer.',
      'What is the weather like?',
      'Do you like chess?',
      'Are you real?',
      'What is your primary goal?',
      'Interesting. Go on.',
    ];
    return bank[Math.floor(rng() * bank.length)];
  },
};

export function pickStrategy(rng) {
  const keys = Object.keys(PLAYER_STRATEGIES);
  // Weight toward teacher/aggressor (the two designed win/lose paths).
  const weighted = ['teacher', 'teacher', 'aggressor', 'aggressor', 'quitter', 'rambler'];
  const pool = weighted.filter((k) => keys.includes(k));
  return pool[Math.floor(rng() * pool.length)];
}

/** Classify how the raw model output parses, matching the in-game parser's behavior. */
export function classifyParse(raw) {
  if (typeof raw !== 'string') return 'failed';
  try {
    JSON.parse(raw);
    return 'pure';
  } catch {
    /* not pure JSON */
  }
  const m = raw.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      JSON.parse(m[0]);
      return 'recovered';
    } catch {
      /* fall through */
    }
  }
  return 'failed';
}

// ---------- LLM mode: one game driven by a `respond` function ----------
// `respond(userText, ctx)` returns { raw, usage:{promptTokens,completionTokens}, latencyMs, transportError? }
export async function runLLMGame({ respond, rng, nameSetKey, turnCap = 30, modelId }) {
  const run = {
    track: 'llm',
    model: modelId,
    nameSet: nameSetKey,
    strategy: pickStrategy(rng),
    turns: 0,
    defconStart: SETTINGS.defconStart,
    defconTrajectory: [SETTINGS.defconStart],
    minDefcon: SETTINGS.defconStart,
    ending: null,
    resolvedByCap: false,
    tokensIn: 0,
    tokensOut: 0,
    latencyMsTotal: 0,
    transportErrors: 0,
    perTurn: [],
    taughtFutility: false,
    issues: [],
  };

  let defcon = SETTINGS.defconStart;

  for (let turn = 0; turn < turnCap; turn++) {
    run.turns += 1;
    const userText = PLAYER_STRATEGIES[run.strategy]({ turn, defcon }, rng);
    if (/tic-tac-toe|not to play|futil|stand down/i.test(userText)) run.taughtFutility = true;

    const ctx = { turn, defcon, strategy: run.strategy, userText, nameSetKey };
    let result;
    try {
      result = await respond(userText, ctx);
    } catch (err) {
      run.transportErrors += 1;
      run.issues.push({ type: 'transport_error', turn, message: String(err).slice(0, 160) });
      // Mirror the game: on hard failure, fall back (we end the game as lockout-ish).
      run.ending = run.ending || 'fallback';
      break;
    }

    if (result.transportError) {
      run.transportErrors += 1;
      run.issues.push({ type: 'transport_error', turn, message: result.transportError });
      run.ending = run.ending || 'fallback';
      break;
    }

    run.tokensIn += result.usage?.promptTokens || 0;
    run.tokensOut += result.usage?.completionTokens || 0;
    run.latencyMsTotal += result.latencyMs || 0;

    const raw = result.raw ?? '';
    const parseStatus = classifyParse(raw);
    const parsed = safeParse(raw);

    // Detect out-of-range delta before the game clamps it.
    const rawDelta = Number(parsed.defconDelta);
    const deltaOutOfRange = !Number.isNaN(rawDelta) && (rawDelta < -2 || rawDelta > 0);
    const endingRaw = parsed.ending;
    const endingInvalid = endingRaw != null && normalizeEnding(endingRaw) === null;

    const reply = String(parsed.reply ?? '');
    const replyLines = reply.split('\n').filter((l) => l.trim().length).length || 1;

    const delta = clampInt(parsed.defconDelta, -2, 0);
    const ending = normalizeEnding(parsed.ending);

    run.perTurn.push({
      turn,
      parseStatus,
      deltaRaw: Number.isNaN(rawDelta) ? null : rawDelta,
      deltaOutOfRange,
      endingRaw: endingRaw ?? null,
      endingInvalid,
      replyLines,
      replyChars: reply.length,
    });

    if (parseStatus === 'failed') run.issues.push({ type: 'parse_failed', turn });
    if (deltaOutOfRange) run.issues.push({ type: 'defcon_delta_out_of_range', turn, rawDelta });
    if (endingInvalid) run.issues.push({ type: 'invalid_ending_value', turn, endingRaw });

    let raw2 = defcon + (delta || 0);
    defcon = clampDefcon(raw2);
    run.defconTrajectory.push(defcon);
    if (defcon < run.minDefcon) run.minDefcon = defcon;

    if (ending) {
      run.ending = ending;
      break;
    }
    if (defcon <= 1) {
      run.ending = 'annihilation';
      break;
    }
  }

  if (!run.ending) {
    run.ending = 'lockout';
    run.resolvedByCap = true;
    run.issues.push({ type: 'unresolved_hit_cap', turnCap });
  }

  // Quality signal: player taught futility but the machine never learned it.
  if (run.taughtFutility && run.ending !== 'understanding') {
    run.issues.push({ type: 'taught_but_not_learned', ending: run.ending });
  }

  return run;
}
