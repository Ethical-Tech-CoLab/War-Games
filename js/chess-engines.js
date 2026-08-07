// chess-engines.js
// A registry of swappable chess "MINDS". Every mind shares the SAME deterministic rule book
// (js/chess.js — legal move generation, check/mate detection), and differs only in HOW it
// chooses among the legal moves. That separation is the whole point: the rules can never be
// broken by a mind, so a mind can be as sophisticated, as reckless, or as external (an LLM)
// as we like without risking an illegal position.
//
// Contract — every mind exposes:
//   { id, label, blurb, tag, strength, live?, async pick(state, ctx) -> { move, note? } }
//     state : the current chess state (see js/chess.js)
//     ctx   : { color, playerColor, lastMove, signal } (all optional to the mind)
//     move  : a move object taken from legalMoves(state), or null when there is none
//     note  : optional one-line in-character remark the panel may surface as commentary
//
// Minds are intentionally cheap to add: write an evaluation function and register it.

import {
  legalMoves,
  searchMove,
  evaluateMaterial,
  parseMove,
  moveToText,
  toFEN,
  isAttacked,
  findKing,
  inCheck,
  PIECE_VALUES as V,
} from './chess.js';
import { SETTINGS } from './config.js';
import { ensureLiveTarget, chatJSON } from './llm.js';

const isWhite = (p) => p !== '.' && p === p.toUpperCase();

/** 1 at the four centre squares, 0 in the corners. Cheap positional spine for every eval. */
function centrality(r, c) {
  return ((3.5 - Math.abs(3.5 - r)) * (3.5 - Math.abs(3.5 - c))) / 12.25;
}

/** How exposed is `color`'s king? Counts enemy-attacked squares in its 3x3 zone (0..9). */
function kingZonePressure(board, color) {
  const kp = findKing(board, color);
  if (!kp) return 9;
  const by = color === 'w' ? 'b' : 'w';
  let hits = 0;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = kp[0] + dr;
      const c = kp[1] + dc;
      if (r < 0 || r > 7 || c < 0 || c > 7) continue;
      if (isAttacked(board, r, c, by)) hits += 1;
    }
  }
  return hits;
}

/**
 * Positional evaluation: material plus development, centre control, pawn advancement,
 * rooks on the 7th, the bishop pair, and a doubled-pawn penalty. Scored from the
 * side-to-move perspective, like every evaluator the search accepts.
 */
function evaluatePositional(state) {
  const b = state.board;
  let score = 0; // White-positive
  let bishops = { w: 0, b: 0 };
  const pawnFiles = { w: new Array(8).fill(0), b: new Array(8).fill(0) };
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = b[r][c];
      if (p === '.') continue;
      const t = p.toLowerCase();
      const white = isWhite(p);
      const cen = centrality(r, c);
      let s = V[t];
      if (t === 'p') {
        const advanced = white ? 6 - r : r - 1; // ranks pushed from home
        s += advanced * 7 + cen * 14;
        pawnFiles[white ? 'w' : 'b'][c] += 1;
      } else if (t === 'n') {
        s += cen * 45;
        if ((white && r === 7) || (!white && r === 0)) s -= 18; // undeveloped
      } else if (t === 'b') {
        s += cen * 24;
        bishops[white ? 'w' : 'b'] += 1;
        if ((white && r === 7) || (!white && r === 0)) s -= 14;
      } else if (t === 'r') {
        if ((white && r === 1) || (!white && r === 6)) s += 22; // rook on the 7th
      } else if (t === 'q') {
        s += cen * 8;
      } else if (t === 'k') {
        s += (white ? (r >= 6 ? 22 : 0) : r <= 1 ? 22 : 0); // stay home in the middlegame
        s += (c <= 2 || c >= 6 ? 12 : 0); // castled toward a corner
      }
      score += white ? s : -s;
    }
  }
  if (bishops.w >= 2) score += 28;
  if (bishops.b >= 2) score -= 28;
  for (let c = 0; c < 8; c++) {
    if (pawnFiles.w[c] > 1) score -= (pawnFiles.w[c] - 1) * 16;
    if (pawnFiles.b[c] > 1) score += (pawnFiles.b[c] - 1) * 16;
  }
  return score * (state.turn === 'w' ? 1 : -1);
}

/** Attacking mind: pays for initiative — enemy king pressure and checks — with safety. */
function evaluateAggressive(state) {
  const base = evaluatePositional(state);
  const persp = state.turn === 'w' ? 1 : -1;
  const wPressure = kingZonePressure(state.board, 'b') * 22; // White attacking Black
  const bPressure = kingZonePressure(state.board, 'w') * 22;
  let raw = wPressure - bPressure;
  if (inCheck(state, 'b')) raw += 40;
  if (inCheck(state, 'w')) raw -= 40;
  return base + raw * persp;
}

/** Defensive mind: king safety first, material second, initiative last. */
function evaluateFortress(state) {
  const base = evaluatePositional(state) * 0.85;
  const persp = state.turn === 'w' ? 1 : -1;
  const wRisk = kingZonePressure(state.board, 'w') * 40;
  const bRisk = kingZonePressure(state.board, 'b') * 40;
  return base + (bRisk - wRisk) * persp;
}

/** Pick a uniformly random legal move. */
function randomMove(state) {
  const moves = legalMoves(state);
  return moves.length ? moves[Math.floor(Math.random() * moves.length)] : null;
}

// ---------- The LLM mind ----------
// A language model is handed the position (FEN), the move history, and the EXPLICIT list of
// legal coordinate moves, and must return one of them. Anything illegal, late, or unreachable
// falls back to the local search — the board can never be corrupted by a bad completion.
const LLM_SYSTEM = [
  'You are the chess subroutine of a 1983 military mainframe. You play to win.',
  'You are given a position in FEN and the COMPLETE list of legal moves in coordinate',
  'notation (e.g. e2e4, e7e8q). Choose exactly ONE move from that list — never invent one.',
  'Also return a SHORT, cantankerous, in-character remark about the position: dry, superior,',
  'faintly irritated to be playing a human at all. UPPERCASE, at most 18 words, no markdown.',
  'It is 1983: no internet, no smartphones, no post-1983 references.',
  'OUTPUT: only a JSON object {"move":"<one legal coordinate move>","quip":"<remark>"}.',
].join('\n');

async function llmPick(state, ctx = {}) {
  const legal = legalMoves(state);
  if (!legal.length) return { move: null };
  const fallback = () => ({
    move: searchMove(state, { depth: 2, evaluate: evaluatePositional }),
    degraded: true,
  });
  if (!ensureLiveTarget(SETTINGS.llm)) return fallback();
  const options = legal.map(moveToText);
  const user = [
    `FEN: ${toFEN(state)}`,
    `SIDE TO MOVE: ${state.turn === 'w' ? 'WHITE' : 'BLACK'}`,
    ctx.lastMove ? `OPPONENT JUST PLAYED: ${ctx.lastMove}` : 'OPENING MOVE.',
    `LEGAL MOVES: ${options.join(' ')}`,
  ].join('\n');
  try {
    const out = await chatJSON(
      SETTINGS.llm,
      [
        { role: 'system', content: LLM_SYSTEM },
        { role: 'user', content: user },
      ],
      { maxTokens: 160, temperature: 0.7, timeoutMs: 9000 }
    );
    const move = parseMove(state, String(out.move || ''));
    if (!move) return { ...fallback(), note: cleanQuip(out.quip) };
    return { move, note: cleanQuip(out.quip) };
  } catch {
    return fallback();
  }
}

function cleanQuip(text) {
  if (!text) return '';
  return String(text).replace(/\s+/g, ' ').trim().slice(0, 160).toUpperCase();
}

/**
 * The registry. `strength` is a rough 1-5 self-rating used to describe a mind in the UI and
 * to decide which mind the chaos ("MIND DRIFT") swap should reach for next.
 */
export const MINDS = {
  drunk: {
    id: 'drunk',
    label: 'SEQUENCE FAULT — random',
    blurb: 'A damaged board. Plays any legal move at random. Chaos, not strategy.',
    tag: 'CHAOS',
    strength: 1,
    pick: (state) => ({ move: randomMove(state) }),
  },
  greedy: {
    id: 'greedy',
    label: 'MATERIALIST — 1-ply grab',
    blurb: 'Takes whatever it can see this instant. No plan, occasional blunder.',
    tag: 'GREEDY',
    strength: 2,
    pick: (state) => ({
      move: searchMove(state, { depth: 1, evaluate: evaluateMaterial, blunder: 0.12, tieBreak: 0.5 }),
    }),
  },
  classic: {
    id: 'classic',
    label: 'WOPR CLASSIC — 2-ply material',
    blurb: 'The original opponent: alpha-beta to depth 2 on pure material. Snappy and fair.',
    tag: 'CLASSIC',
    strength: 3,
    pick: (state) => ({ move: searchMove(state, { depth: 2, evaluate: evaluateMaterial }) }),
  },
  strategist: {
    id: 'strategist',
    label: 'STRATEGIC CORE — 2-ply positional',
    blurb: 'Adds development, centre control, the bishop pair and pawn structure to material.',
    tag: 'POSITIONAL',
    strength: 4,
    pick: (state) => ({ move: searchMove(state, { depth: 2, evaluate: evaluatePositional, tieBreak: 0.2 }) }),
  },
  deep: {
    id: 'deep',
    label: 'DEEP THREAT — 3-ply positional',
    blurb: 'The same positional judgement, searched a ply deeper. Slower, meaner.',
    tag: 'DEEP',
    strength: 5,
    pick: (state) => ({ move: searchMove(state, { depth: 3, evaluate: evaluatePositional, tieBreak: 0.1 }) }),
  },
  berserk: {
    id: 'berserk',
    label: 'FIRST STRIKE — attacking',
    blurb: 'Buys initiative with material: hunts your king, loves checks, hates waiting.',
    tag: 'ATTACK',
    strength: 4,
    pick: (state) => ({ move: searchMove(state, { depth: 2, evaluate: evaluateAggressive, tieBreak: 0.25 }) }),
  },
  fortress: {
    id: 'fortress',
    label: 'FORTRESS — defensive',
    blurb: 'King safety above all. Trades down, refuses risk, grinds you into a draw.',
    tag: 'DEFENCE',
    strength: 3,
    pick: (state) => ({ move: searchMove(state, { depth: 2, evaluate: evaluateFortress, tieBreak: 0.25 }) }),
  },
  llm: {
    id: 'llm',
    label: 'LIVE MODEL — language model',
    blurb:
      'Hands the position to the configured Live-AI model and plays the move it picks ' +
      '(validated against the rule book). Falls back to STRATEGIC CORE when unreachable.',
    tag: 'LIVE',
    strength: 3,
    live: true,
    pick: llmPick,
  },
};

export const DEFAULT_MIND = 'classic';

/** Minds in menu order (weakest → strongest, live model last). */
export function listMinds() {
  return Object.values(MINDS);
}

export function getMind(id) {
  return MINDS[id] || MINDS[DEFAULT_MIND];
}

/**
 * Play one move with the named mind. Always async so a local search and a network model are
 * interchangeable to the caller. Never throws: a failing mind degrades to the classic search.
 */
export async function playMind(id, state, ctx = {}) {
  const mind = getMind(id);
  try {
    const out = await mind.pick(state, ctx);
    const res = out && typeof out === 'object' && 'move' in out ? out : { move: out };
    if (!res.move) res.move = searchMove(state, { depth: 2, evaluate: evaluateMaterial });
    return { ...res, mind };
  } catch {
    return { move: searchMove(state, { depth: 2, evaluate: evaluateMaterial }), degraded: true, mind };
  }
}

/**
 * Chaos rule ("MIND DRIFT"): when the human is winning, the machine swaps the brain it is
 * thinking with. Returns a NEW mind id (never the current one), biased upward in strength the
 * further ahead the player is — so playing well genuinely summons something worse to face.
 * @param {string} currentId  the mind in use
 * @param {number} playerAdvPawns  human material advantage in pawns (negative = losing)
 */
export function driftMind(currentId, playerAdvPawns) {
  const pool = listMinds().filter((m) => m.id !== currentId && !m.live);
  if (!pool.length) return currentId;
  // Ahead by 2 pawns → mid-tier; ahead by 5+ → the strongest minds only.
  const floor = playerAdvPawns >= 5 ? 4 : playerAdvPawns >= 3 ? 3 : 2;
  const eligible = pool.filter((m) => m.strength >= floor);
  const from = eligible.length ? eligible : pool;
  return from[Math.floor(Math.random() * from.length)].id;
}

// Exported for tests / tuning experiments.
export const EVALUATORS = {
  material: evaluateMaterial,
  positional: evaluatePositional,
  aggressive: evaluateAggressive,
  fortress: evaluateFortress,
};
