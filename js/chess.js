// chess.js
// A dependency-free chess engine: legal move generation (incl. castling, en passant,
// promotion), check/checkmate/stalemate detection, and a small alpha-beta AI opponent.
// Board representation: an 8x8 array of single chars. Uppercase = White, lowercase = Black,
// '.' = empty. Row 0 is rank 8 (top); row 7 is rank 1 (bottom). White moves UP (row--).
//
// Correctness is validated by perft() in test — from the start position perft(1..3) must
// equal 20, 400, 8902.

export const FILES = 'abcdefgh';
const WHITE = 'w';
const BLACK = 'b';

const START_ROWS = [
  ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
  ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
  ['.', '.', '.', '.', '.', '.', '.', '.'],
  ['.', '.', '.', '.', '.', '.', '.', '.'],
  ['.', '.', '.', '.', '.', '.', '.', '.'],
  ['.', '.', '.', '.', '.', '.', '.', '.'],
  ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
  ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'],
];

const VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

export function initialState() {
  return {
    board: START_ROWS.map((row) => row.slice()),
    turn: WHITE,
    castling: { K: true, Q: true, k: true, q: true }, // White KQ, Black kq
    ep: null, // en-passant target [r,c] or null
    half: 0,
    full: 1,
  };
}

const isWhite = (p) => p !== '.' && p === p.toUpperCase();
const isBlack = (p) => p !== '.' && p === p.toLowerCase();
const colorOf = (p) => (p === '.' ? null : isWhite(p) ? WHITE : BLACK);
const inside = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;

export function cloneState(s) {
  return {
    board: s.board.map((row) => row.slice()),
    turn: s.turn,
    castling: { ...s.castling },
    ep: s.ep ? [s.ep[0], s.ep[1]] : null,
    half: s.half,
    full: s.full,
  };
}

const SLIDES = {
  b: [[-1, -1], [-1, 1], [1, -1], [1, 1]],
  r: [[-1, 0], [1, 0], [0, -1], [0, 1]],
  q: [[-1, -1], [-1, 1], [1, -1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]],
};
const KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KING = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

/** Is square (r,c) attacked by side `by` ('w'|'b')? */
export function isAttacked(board, r, c, by) {
  // Pawns: a white pawn attacks upward (from r+1); black pawn attacks downward (from r-1).
  const pr = by === WHITE ? r + 1 : r - 1;
  for (const dc of [-1, 1]) {
    const cc = c + dc;
    if (inside(pr, cc)) {
      const p = board[pr][cc];
      if (p !== '.' && colorOf(p) === by && p.toLowerCase() === 'p') return true;
    }
  }
  // Knights
  for (const [dr, dc] of KNIGHT) {
    const rr = r + dr, cc = c + dc;
    if (inside(rr, cc)) {
      const p = board[rr][cc];
      if (p !== '.' && colorOf(p) === by && p.toLowerCase() === 'n') return true;
    }
  }
  // King
  for (const [dr, dc] of KING) {
    const rr = r + dr, cc = c + dc;
    if (inside(rr, cc)) {
      const p = board[rr][cc];
      if (p !== '.' && colorOf(p) === by && p.toLowerCase() === 'k') return true;
    }
  }
  // Sliding: bishop/queen (diagonals), rook/queen (orthogonals)
  const check = (dirs, types) => {
    for (const [dr, dc] of dirs) {
      let rr = r + dr, cc = c + dc;
      while (inside(rr, cc)) {
        const p = board[rr][cc];
        if (p !== '.') {
          if (colorOf(p) === by && types.includes(p.toLowerCase())) return true;
          break;
        }
        rr += dr; cc += dc;
      }
    }
    return false;
  };
  if (check(SLIDES.b, ['b', 'q'])) return true;
  if (check(SLIDES.r, ['r', 'q'])) return true;
  return false;
}

export function findKing(board, color) {
  const k = color === WHITE ? 'K' : 'k';
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (board[r][c] === k) return [r, c];
  return null;
}

export function inCheck(state, color) {
  const kp = findKing(state.board, color);
  if (!kp) return false;
  return isAttacked(state.board, kp[0], kp[1], color === WHITE ? BLACK : WHITE);
}

/** Pseudo-legal moves for the side to move (does not filter self-check). */
function pseudoMoves(state) {
  const { board, turn, ep, castling } = state;
  const moves = [];
  const enemy = turn === WHITE ? BLACK : WHITE;
  const add = (fr, fc, tr, tc, extra = {}) => moves.push({ from: [fr, fc], to: [tr, tc], ...extra });

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p === '.' || colorOf(p) !== turn) continue;
      const type = p.toLowerCase();

      if (type === 'p') {
        const dir = turn === WHITE ? -1 : 1;
        const startRow = turn === WHITE ? 6 : 1;
        const promoRow = turn === WHITE ? 0 : 7;
        // forward 1
        if (inside(r + dir, c) && board[r + dir][c] === '.') {
          if (r + dir === promoRow) for (const pr of ['q', 'r', 'b', 'n']) add(r, c, r + dir, c, { promo: pr });
          else add(r, c, r + dir, c);
          // forward 2
          if (r === startRow && board[r + 2 * dir][c] === '.') add(r, c, r + 2 * dir, c, { dbl: true });
        }
        // captures
        for (const dc of [-1, 1]) {
          const tr = r + dir, tc = c + dc;
          if (!inside(tr, tc)) continue;
          const target = board[tr][tc];
          if (target !== '.' && colorOf(target) === enemy) {
            if (tr === promoRow) for (const pr of ['q', 'r', 'b', 'n']) add(r, c, tr, tc, { promo: pr });
            else add(r, c, tr, tc);
          } else if (ep && tr === ep[0] && tc === ep[1]) {
            add(r, c, tr, tc, { ep: true });
          }
        }
      } else if (type === 'n') {
        for (const [dr, dc] of KNIGHT) {
          const tr = r + dr, tc = c + dc;
          if (inside(tr, tc) && colorOf(board[tr][tc]) !== turn) add(r, c, tr, tc);
        }
      } else if (type === 'k') {
        for (const [dr, dc] of KING) {
          const tr = r + dr, tc = c + dc;
          if (inside(tr, tc) && colorOf(board[tr][tc]) !== turn) add(r, c, tr, tc);
        }
        // Castling
        const homeRow = turn === WHITE ? 7 : 0;
        if (r === homeRow && c === 4 && !isAttacked(board, r, c, enemy)) {
          const kSide = turn === WHITE ? castling.K : castling.k;
          const qSide = turn === WHITE ? castling.Q : castling.q;
          if (kSide && board[homeRow][5] === '.' && board[homeRow][6] === '.' &&
            board[homeRow][7].toLowerCase() === 'r' && colorOf(board[homeRow][7]) === turn &&
            !isAttacked(board, homeRow, 5, enemy) && !isAttacked(board, homeRow, 6, enemy)) {
            add(r, c, homeRow, 6, { castle: 'K' });
          }
          if (qSide && board[homeRow][3] === '.' && board[homeRow][2] === '.' && board[homeRow][1] === '.' &&
            board[homeRow][0].toLowerCase() === 'r' && colorOf(board[homeRow][0]) === turn &&
            !isAttacked(board, homeRow, 3, enemy) && !isAttacked(board, homeRow, 2, enemy)) {
            add(r, c, homeRow, 2, { castle: 'Q' });
          }
        }
      } else {
        for (const [dr, dc] of SLIDES[type]) {
          let tr = r + dr, tc = c + dc;
          while (inside(tr, tc)) {
            const t = board[tr][tc];
            if (t === '.') add(r, c, tr, tc);
            else { if (colorOf(t) === enemy) add(r, c, tr, tc); break; }
            tr += dr; tc += dc;
          }
        }
      }
    }
  }
  return moves;
}

/** Apply a move, returning a new state. Handles castling, en passant, promotion, rights. */
export function applyMove(state, move) {
  const s = cloneState(state);
  const { board } = s;
  const [fr, fc] = move.from;
  const [tr, tc] = move.to;
  const piece = board[fr][fc];
  const turn = s.turn;
  const homeRow = turn === WHITE ? 7 : 0;

  s.ep = null;
  board[tr][tc] = piece;
  board[fr][fc] = '.';

  if (move.ep) {
    // Captured pawn sits on the mover's origin row, target column.
    board[fr][tc] = '.';
  }
  if (move.dbl) {
    s.ep = [(fr + tr) / 2, fc];
  }
  if (move.promo) {
    board[tr][tc] = turn === WHITE ? move.promo.toUpperCase() : move.promo;
  }
  if (move.castle === 'K') {
    board[homeRow][5] = board[homeRow][7];
    board[homeRow][7] = '.';
  } else if (move.castle === 'Q') {
    board[homeRow][3] = board[homeRow][0];
    board[homeRow][0] = '.';
  }

  // Update castling rights
  if (piece === 'K') { s.castling.K = false; s.castling.Q = false; }
  if (piece === 'k') { s.castling.k = false; s.castling.q = false; }
  const touch = (r, c) => {
    if (r === 7 && c === 0) s.castling.Q = false;
    if (r === 7 && c === 7) s.castling.K = false;
    if (r === 0 && c === 0) s.castling.q = false;
    if (r === 0 && c === 7) s.castling.k = false;
  };
  touch(fr, fc); touch(tr, tc);

  s.half = piece.toLowerCase() === 'p' || move.capture || move.ep ? 0 : s.half + 1;
  if (turn === BLACK) s.full += 1;
  s.turn = turn === WHITE ? BLACK : WHITE;
  return s;
}

/** Fully legal moves for the side to move. */
export function legalMoves(state) {
  const out = [];
  for (const m of pseudoMoves(state)) {
    const ns = applyMove(state, m);
    if (!inCheck(ns, state.turn)) out.push(m);
  }
  return out;
}

/** Game status string from the side-to-move perspective. */
export function statusOf(state) {
  const legal = legalMoves(state);
  const checked = inCheck(state, state.turn);
  if (legal.length === 0) return checked ? 'checkmate' : 'stalemate';
  return checked ? 'check' : 'ongoing';
}

// ---------- Notation ----------
export const sqName = (r, c) => FILES[c] + (8 - r);
export function moveToText(m) {
  return sqName(m.from[0], m.from[1]) + sqName(m.to[0], m.to[1]) + (m.promo ? m.promo : '');
}
/** Parse a coordinate move like "e2e4" / "e7e8q" and return the matching legal move. */
export function parseMove(state, str) {
  const s = String(str).trim().toLowerCase().replace(/[\s\-]/g, '');
  const m = s.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/);
  if (!m) return null;
  const from = [8 - Number(m[1][1]), FILES.indexOf(m[1][0])];
  const to = [8 - Number(m[2][1]), FILES.indexOf(m[2][0])];
  const promo = m[3] || null;
  return (
    legalMoves(state).find(
      (mv) =>
        mv.from[0] === from[0] && mv.from[1] === from[1] &&
        mv.to[0] === to[0] && mv.to[1] === to[1] &&
        (promo ? mv.promo === promo : !mv.promo || mv.promo === 'q')
    ) || null
  );
}

// ---------- AI (negamax + alpha-beta) ----------
function evaluate(state) {
  // From side-to-move perspective.
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = state.board[r][c];
      if (p === '.') continue;
      const v = VALUES[p.toLowerCase()];
      score += colorOf(p) === WHITE ? v : -v;
    }
  }
  const persp = state.turn === WHITE ? 1 : -1;
  return score * persp;
}

function orderMoves(state, moves) {
  // Captures first (MVV-LVA-ish) to help alpha-beta.
  return moves
    .map((m) => {
      const cap = state.board[m.to[0]][m.to[1]];
      const gain = cap !== '.' ? VALUES[cap.toLowerCase()] : 0;
      return { m, gain: gain + (m.promo ? 800 : 0) };
    })
    .sort((a, b) => b.gain - a.gain)
    .map((x) => x.m);
}

function negamax(state, depth, alpha, beta) {
  if (depth === 0) return evaluate(state);
  const moves = legalMoves(state);
  if (moves.length === 0) return inCheck(state, state.turn) ? -100000 + (5 - depth) : 0;
  let best = -Infinity;
  for (const m of orderMoves(state, moves)) {
    const val = -negamax(applyMove(state, m), depth - 1, -beta, -alpha);
    if (val > best) best = val;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

/** Choose the engine's move. depth 2-3 is a reasonable, snappy opponent. */
export function aiMove(state, depth = 3) {
  const moves = orderMoves(state, legalMoves(state));
  if (moves.length === 0) return null;
  let best = null, bestVal = -Infinity, alpha = -Infinity;
  for (const m of moves) {
    const val = -negamax(applyMove(state, m), depth - 1, -Infinity, -alpha);
    if (val > bestVal || (val === bestVal && Math.random() < 0.3)) { bestVal = val; best = m; }
    if (val > alpha) alpha = val;
  }
  return best;
}

// Unicode glyphs for rendering.
export const GLYPH = {
  K: '\u2654', Q: '\u2655', R: '\u2656', B: '\u2657', N: '\u2658', P: '\u2659',
  k: '\u265A', q: '\u265B', r: '\u265C', b: '\u265D', n: '\u265E', p: '\u265F',
};

/** Material balance in centipawns: positive = White ahead, negative = Black ahead. */
export function material(state) {
  let w = 0, b = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = state.board[r][c];
      if (p === '.') continue;
      const v = VALUES[p.toLowerCase()];
      if (isWhite(p)) w += v; else b += v;
    }
  }
  return w - b;
}

// Spoken-move vocabulary (lenient, for browser speech recognition transcripts).
const WORD_NUM = { one: '1', two: '2', to: '2', too: '2', three: '3', four: '4', for: '4', fore: '4', five: '5', six: '6', seven: '7', eight: '8', ate: '8' };
const WORD_FILE = {
  alpha: 'a', bravo: 'b', charlie: 'c', delta: 'd', echo: 'e', foxtrot: 'f', golf: 'g', hotel: 'h',
  ay: 'a', bee: 'b', sea: 'c', see: 'c', dee: 'd', ee: 'e', eff: 'f', gee: 'g', aitch: 'h', haitch: 'h',
};
const WORD_PIECE = { pawn: 'p', knight: 'n', night: 'n', bishop: 'b', rook: 'r', rock: 'r', queen: 'q', king: 'k' };

/**
 * Parse a spoken move transcript into a legal move (or null). Lenient by design — accepts
 * "e2 e4", "e two e four", "knight f3", "bishop to c4", "castle kingside", "queen h5", etc.
 */
export function parseSpokenMove(state, text) {
  const t = String(text).toLowerCase();
  // Castling by spoken intent.
  if (/castl/.test(t)) {
    const rank = state.turn === WHITE ? 1 : 8;
    if (/(queen|long)/.test(t)) return parseMove(state, `e${rank}c${rank}`);
    if (/(king|short)/.test(t)) return parseMove(state, `e${rank}g${rank}`);
  }
  const toks = t.replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  let pieceType = null;
  let promo = null;
  const chars = [];
  for (const tok of toks) {
    if (WORD_PIECE[tok]) { if (!pieceType) pieceType = WORD_PIECE[tok]; continue; }
    if (/^[a-h][1-8]$/.test(tok)) { chars.push(tok[0], tok[1]); continue; }
    if (WORD_NUM[tok]) { chars.push(WORD_NUM[tok]); continue; }
    if (WORD_FILE[tok]) { chars.push(WORD_FILE[tok]); continue; }
    if (/^[a-h]$/.test(tok)) { chars.push(tok); continue; }
    if (/^[1-8]$/.test(tok)) { chars.push(tok); continue; }
    if (/^(queen|rook|bishop|knight)$/.test(tok)) promo = tok[0] === 'k' ? 'n' : tok[0];
  }
  // Pair each file letter with the next rank digit to form squares.
  const squares = [];
  for (let i = 0; i < chars.length; i++) {
    if (/[a-h]/.test(chars[i])) {
      for (let j = i + 1; j < chars.length; j++) {
        if (/[1-8]/.test(chars[j])) { squares.push(chars[i] + chars[j]); i = j; break; }
        if (/[a-h]/.test(chars[j])) break;
      }
    }
  }
  const legal = legalMoves(state);
  if (squares.length >= 2) {
    return parseMove(state, squares[0] + squares[1] + (promo || ''));
  }
  if (squares.length === 1) {
    const [tr, tc] = [8 - Number(squares[0][1]), FILES.indexOf(squares[0][0])];
    const matches = legal.filter((m) => m.to[0] === tr && m.to[1] === tc);
    if (matches.length === 0) return null;
    if (pieceType) {
      const byPiece = matches.filter((m) => state.board[m.from[0]][m.from[1]].toLowerCase() === pieceType);
      return byPiece[0] || null;
    }
    if (matches.length === 1) return matches[0];
    // Prefer a pawn move when ambiguous and no piece named.
    return matches.find((m) => state.board[m.from[0]][m.from[1]].toLowerCase() === 'p') || null;
  }
  return null;
}


// ---------- Test helper ----------
export function perft(state, depth) {
  if (depth === 0) return 1;
  let n = 0;
  for (const m of legalMoves(state)) n += perft(applyMove(state, m), depth - 1);
  return n;
}
