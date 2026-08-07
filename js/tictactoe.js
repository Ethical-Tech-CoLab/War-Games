// tictactoe.js
// A complete, dependency-free tic-tac-toe engine — and, more importantly, a FUTILITY PROVER.
//
// Tic-tac-toe is the game the film uses to teach a machine that some games cannot be won. That
// only lands if the machine actually *proves* it rather than being told, so this module can:
//   - play perfectly (minimax over the full tree — it never loses),
//   - play itself and report the result,
//   - ENUMERATE THE ENTIRE GAME TREE (all 255,168 distinct games) and count the outcomes,
//   - and report the game-theoretic value of the opening position (a draw).
//
// Board: a flat 9-cell array, index 0..8 reading left-to-right, top-to-bottom. 'X' | 'O' | '.'.

export const EMPTY = '.';

export const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
  [0, 4, 8], [2, 4, 6], // diagonals
];

export function initialTTT(first = 'X') {
  return { cells: new Array(9).fill(EMPTY), turn: first };
}

export const otherMark = (m) => (m === 'X' ? 'O' : 'X');

/** The winning line ([a,b,c]) for `cells`, or null. */
export function winningLine(cells) {
  for (const [a, b, c] of LINES) {
    if (cells[a] !== EMPTY && cells[a] === cells[b] && cells[b] === cells[c]) return [a, b, c];
  }
  return null;
}

export function winner(cells) {
  const line = winningLine(cells);
  return line ? cells[line[0]] : null;
}

export function tttMoves(state) {
  const out = [];
  for (let i = 0; i < 9; i++) if (state.cells[i] === EMPTY) out.push(i);
  return out;
}

export function tttApply(state, i) {
  const cells = state.cells.slice();
  cells[i] = state.turn;
  return { cells, turn: otherMark(state.turn) };
}

/** 'ongoing' | 'X' | 'O' | 'draw'. */
export function tttStatus(state) {
  const w = winner(state.cells);
  if (w) return w;
  return state.cells.includes(EMPTY) ? 'ongoing' : 'draw';
}

// ---------- Perfect play (minimax with memoisation) ----------
const memo = new Map();

function key(state) {
  return state.cells.join('') + state.turn;
}

/** Score from `state.turn`'s perspective: 0 for a draw, `depth - 10` when already lost. */
function minimax(state, depth = 0) {
  const st = tttStatus(state);
  if (st !== 'ongoing') {
    // A finished, non-drawn game means the PREVIOUS mover won — so the side to move has lost.
    // Sooner losses score worse, so the engine prefers the longest resistance.
    return st === 'draw' ? 0 : depth - 10;
  }
  const k = key(state) + depth;
  const hit = memo.get(k);
  if (hit !== undefined) return hit;
  let best = -Infinity;
  for (const i of tttMoves(state)) {
    const val = -minimax(tttApply(state, i), depth + 1);
    if (val > best) best = val;
  }
  memo.set(k, best);
  return best;
}

/**
 * The best move for the side to move.
 * @param {object} state
 * @param {object} [opts]
 * @param {number} [opts.mistake=0] 0..1 chance of playing a random legal move instead — the
 *        ONLY way a human ever beats this engine, and the knob that makes a demo lose on purpose.
 */
export function tttBest(state, opts = {}) {
  const moves = tttMoves(state);
  if (!moves.length) return -1;
  if (opts.mistake && Math.random() < opts.mistake) {
    return moves[Math.floor(Math.random() * moves.length)];
  }
  let best = moves[0];
  let bestVal = -Infinity;
  for (const i of moves) {
    const val = -minimax(tttApply(state, i), 1);
    // Random tie-break so repeated perfect games are not visually identical.
    if (val > bestVal || (val === bestVal && Math.random() < 0.4)) {
      bestVal = val;
      best = i;
    }
  }
  return best;
}

/**
 * Play one complete game.
 * @param {object} [opts] { first, mistakeX, mistakeO }
 * @returns {{ moves: number[], result: 'X'|'O'|'draw', cells: string[] }}
 */
export function tttSelfPlay(opts = {}) {
  let state = initialTTT(opts.first || 'X');
  const moves = [];
  while (tttStatus(state) === 'ongoing') {
    const mistake = state.turn === 'X' ? opts.mistakeX || 0 : opts.mistakeO || 0;
    const i = tttBest(state, { mistake });
    moves.push(i);
    state = tttApply(state, i);
  }
  return { moves, result: tttStatus(state), cells: state.cells };
}

/**
 * Walk the ENTIRE game tree from the empty board and count how every possible game ends.
 * This is the "it played itself ten million times" beat, made real and verifiable: the numbers
 * shown in-game are computed here at runtime, not typed in by an author.
 * Returns { total, xWins, oWins, draws, ms } — ~255k leaves, well under a second.
 */
export function tttEnumerate() {
  const started = Date.now();
  const cells = new Array(9).fill(EMPTY);
  let total = 0;
  let xWins = 0;
  let oWins = 0;
  let draws = 0;

  const walk = (turn, filled) => {
    const w = winner(cells);
    if (w) {
      total += 1;
      if (w === 'X') xWins += 1;
      else oWins += 1;
      return;
    }
    if (filled === 9) {
      total += 1;
      draws += 1;
      return;
    }
    for (let i = 0; i < 9; i++) {
      if (cells[i] !== EMPTY) continue;
      cells[i] = turn;
      walk(otherMark(turn), filled + 1);
      cells[i] = EMPTY;
    }
  };
  walk('X', 0);
  return { total, xWins, oWins, draws, ms: Date.now() - started };
}

/**
 * The game-theoretic value of the opening position: what happens when NOBODY makes a mistake.
 * Returns 'draw' for tic-tac-toe — the whole point.
 */
export function tttPerfectOutcome() {
  const v = minimax(initialTTT('X'));
  return v > 0 ? 'X' : v < 0 ? 'O' : 'draw';
}

/** Render a board as three terminal rows, e.g. "X . O". */
export function tttRows(cells) {
  return [0, 3, 6].map((i) => cells.slice(i, i + 3).join(' '));
}
