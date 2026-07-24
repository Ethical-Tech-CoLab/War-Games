// chess-ui.js
// An optional, pinnable chess panel: a repaintable board you play against the local engine
// (js/chess.js). Move by clicking squares OR typing coordinate moves like "e2e4" (as in
// online chess). No network/LLM needed — the "computer" is the built-in alpha-beta engine.

import {
  initialState,
  legalMoves,
  applyMove,
  parseMove,
  statusOf,
  inCheck,
  findKing,
  moveToText,
  sqName,
  GLYPH,
  aiMove,
} from './chess.js';

export class ChessPanel {
  constructor(root, opts = {}) {
    this.root = root;
    this.persona = opts.persona || 'THE MACHINE';
    this.depth = opts.depth || 2; // depth 2 keeps replies snappy in-browser; still a real opponent
    this.el = {
      panel: root.querySelector('#chess-panel'),
      title: root.querySelector('#cp-title'),
      status: root.querySelector('#cp-status'),
      board: root.querySelector('#cp-board'),
      move: root.querySelector('#cp-move'),
      play: root.querySelector('#cp-play'),
      neu: root.querySelector('#cp-new'),
      flip: root.querySelector('#cp-flip'),
      close: root.querySelector('#cp-close'),
      log: root.querySelector('#cp-log'),
    };
    this.playerColor = 'w';
    this.state = initialState();
    this.selected = null; // [r,c]
    this.targets = []; // legal target squares for the selected piece
    this.lastMove = null; // {from,to}
    this.thinking = false;
    this._buildBoard();
    this._wire();
  }

  setPersona(name) {
    this.persona = name || this.persona;
    if (this.el.title) this.el.title.textContent = `CHESS vs ${this.persona}`;
  }

  open() {
    this.el.panel.hidden = false;
    this.root.classList.add('chess-open');
    this.render();
    this.el.move.focus();
  }
  close() {
    this.el.panel.hidden = true;
    this.root.classList.remove('chess-open');
  }
  toggle() {
    if (this.el.panel.hidden) this.open();
    else this.close();
  }

  newGame(playerColor = this.playerColor) {
    this.playerColor = playerColor;
    this.state = initialState();
    this.selected = null;
    this.targets = [];
    this.lastMove = null;
    this.thinking = false;
    this.el.log.innerHTML = '';
    this.el.flip.textContent = this.playerColor === 'w' ? 'PLAY BLACK' : 'PLAY WHITE';
    this.render();
    if (this.state.turn !== this.playerColor) this._aiTurn();
  }

  _wire() {
    this.el.close.addEventListener('click', () => this.close());
    this.el.neu.addEventListener('click', () => this.newGame(this.playerColor));
    this.el.flip.addEventListener('click', () =>
      this.newGame(this.playerColor === 'w' ? 'b' : 'w')
    );
    this.el.play.addEventListener('click', () => this._submitText());
    this.el.move.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._submitText();
    });
  }

  _submitText() {
    if (this.thinking || this.state.turn !== this.playerColor) return;
    const mv = parseMove(this.state, this.el.move.value);
    if (!mv) {
      this._status('Illegal or unparsed move — try e.g. e2e4');
      return;
    }
    this.el.move.value = '';
    this._commit(mv);
    this._afterHuman();
  }

  // 8x8 grid of square buttons (built once; repainted on render()).
  _buildBoard() {
    this.el.board.innerHTML = '';
    this.squares = [];
    for (let i = 0; i < 64; i++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cp-sq';
      btn.addEventListener('click', () => this._onSquare(btn));
      this.el.board.appendChild(btn);
      this.squares.push(btn);
    }
  }

  // Display order depends on orientation (player's pieces at the bottom).
  _order() {
    const rows = [0, 1, 2, 3, 4, 5, 6, 7];
    const cols = [0, 1, 2, 3, 4, 5, 6, 7];
    return this.playerColor === 'w'
      ? { rows, cols }
      : { rows: rows.slice().reverse(), cols: cols.slice().reverse() };
  }

  render() {
    const { rows, cols } = this._order();
    const kingInCheck = statusOf(this.state) === 'check' || statusOf(this.state) === 'checkmate'
      ? findKing(this.state.board, this.state.turn)
      : null;
    let i = 0;
    for (const r of rows) {
      for (const c of cols) {
        const btn = this.squares[i++];
        const p = this.state.board[r][c];
        btn.textContent = p === '.' ? '' : GLYPH[p];
        btn.dataset.r = r;
        btn.dataset.c = c;
        const dark = (r + c) % 2 === 1;
        btn.className = 'cp-sq' + (dark ? ' dark' : ' light');
        btn.classList.toggle('white-piece', p !== '.' && p === p.toUpperCase());
        btn.classList.toggle('black-piece', p !== '.' && p === p.toLowerCase());
        if (this.selected && this.selected[0] === r && this.selected[1] === c) btn.classList.add('sel');
        if (this.targets.some((t) => t[0] === r && t[1] === c)) {
          btn.classList.add(p === '.' ? 'target' : 'capture');
        }
        if (this.lastMove &&
          ((this.lastMove.from[0] === r && this.lastMove.from[1] === c) ||
            (this.lastMove.to[0] === r && this.lastMove.to[1] === c))) {
          btn.classList.add('last');
        }
        if (kingInCheck && kingInCheck[0] === r && kingInCheck[1] === c) btn.classList.add('check');
      }
    }
    this._refreshStatus();
  }

  _refreshStatus() {
    const st = statusOf(this.state);
    const youAreTurn = this.state.turn === this.playerColor;
    if (st === 'checkmate') {
      const youWon = this.state.turn !== this.playerColor;
      this._status(youWon ? 'CHECKMATE — you win. A rare outcome.' : 'CHECKMATE — the machine wins.');
    } else if (st === 'stalemate') {
      this._status('STALEMATE — a draw. (No winning move.)');
    } else if (this.thinking) {
      this._status(`${this.persona} is thinking\u2026`);
    } else if (st === 'check') {
      this._status(youAreTurn ? 'CHECK — your move.' : `CHECK — ${this.persona} to move.`);
    } else {
      this._status(youAreTurn ? `Your move (${this.playerColor === 'w' ? 'White' : 'Black'}).` : `${this.persona} to move.`);
    }
  }

  _status(text) {
    if (this.el.status) this.el.status.textContent = text;
  }

  _onSquare(btn) {
    if (this.thinking || this.state.turn !== this.playerColor) return;
    const r = Number(btn.dataset.r);
    const c = Number(btn.dataset.c);
    // If a target is selected, try to move there.
    if (this.selected) {
      const target = this.targets.find((t) => t[0] === r && t[1] === c);
      if (target) {
        const mv = this._pickMove(this.selected, [r, c]);
        this.selected = null;
        this.targets = [];
        if (mv) {
          this._commit(mv);
          this._afterHuman();
          return;
        }
      }
    }
    // Otherwise (re)select if it's the player's piece.
    const p = this.state.board[r][c];
    const isMine = p !== '.' && (this.playerColor === 'w' ? p === p.toUpperCase() : p === p.toLowerCase());
    if (isMine) {
      this.selected = [r, c];
      this.targets = legalMoves(this.state)
        .filter((m) => m.from[0] === r && m.from[1] === c)
        .map((m) => m.to);
    } else {
      this.selected = null;
      this.targets = [];
    }
    this.render();
  }

  _pickMove(from, to) {
    // Prefer queen promotion when a move is a promotion.
    const cands = legalMoves(this.state).filter(
      (m) => m.from[0] === from[0] && m.from[1] === from[1] && m.to[0] === to[0] && m.to[1] === to[1]
    );
    return cands.find((m) => m.promo === 'q') || cands[0] || null;
  }

  _commit(mv) {
    this._logMove(mv);
    this.state = applyMove(this.state, mv);
    this.lastMove = { from: mv.from, to: mv.to };
    this.selected = null;
    this.targets = [];
    this.render();
  }

  _afterHuman() {
    const st = statusOf(this.state);
    if (st === 'checkmate' || st === 'stalemate') return;
    this._aiTurn();
  }

  _aiTurn() {
    this.thinking = true;
    this.render();
    // Defer so the "thinking" status paints before the (blocking) search runs.
    setTimeout(() => {
      const mv = aiMove(this.state, this.depth);
      this.thinking = false;
      if (mv) {
        this._commit(mv);
      } else {
        this.render();
      }
    }, 60);
  }

  _logMove(mv) {
    const s = this.state;
    const mover = s.turn === 'w' ? 'w' : 'b';
    const text = moveToText(mv);
    const entry = document.createElement('div');
    entry.className = 'cp-log-entry ' + (mover === 'w' ? 'w' : 'b');
    const num = mover === 'w' ? `${s.full}. ` : '';
    entry.textContent = `${num}${mover === 'w' ? '' : '… '}${text}`;
    this.el.log.appendChild(entry);
    this.el.log.scrollTop = this.el.log.scrollHeight;
    void sqName; void inCheck; // referenced for potential future SAN; keep imports meaningful
  }
}
