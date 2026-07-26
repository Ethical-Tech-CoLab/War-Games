// chess-ui.js
// An optional, pinnable chess panel: a repaintable board you play against the local engine
// (js/chess.js). Move by clicking squares OR typing coordinate moves like "e2e4" (as in
// online chess). No network/LLM needed — the "computer" is the built-in alpha-beta engine.

import {
  initialState,
  legalMoves,
  applyMove,
  parseMove,
  parseSpokenMove,
  material,
  statusOf,
  inCheck,
  findKing,
  moveToText,
  sqName,
  FILES,
  GLYPH,
  aiMove,
} from './chess.js';
import { SETTINGS } from './config.js';

const PIECE_NAME = { p: 'PAWN', n: 'KNIGHT', b: 'BISHOP', r: 'ROOK', q: 'QUEEN', k: 'KING' };

// Terminal-green retro mic (inline SVG, currentColor) so the voice button matches the
// phosphor aesthetic instead of a color emoji. Used for both button states.
const MIC_SVG =
  '<svg class="mic-ico" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></svg>';

// Optional spoken commentary, in the same voice as the current session. Picked by event
// (checkmate/stalemate > check > capture > plain move) and by tone.
const COMMENTARY = {
  normal: {
    playerMove: ['INTERESTING.', 'NOTED.', 'A LOGICAL CHOICE.', 'I SEE YOUR PLAN.', 'PROCEEDING.'],
    aiMove: ['MY MOVE.', 'I RESPOND.', 'CALCULATED.', 'THE OPTIMAL REPLY.', 'YOUR TURN.'],
    capture: ['A TRADE.', 'MATERIAL CHANGES HANDS.', 'ACCEPTABLE.'],
    check: ['CHECK.', 'YOUR KING IS EXPOSED.'],
    inCheck: ['YOU PRESS ME. NOTED.', 'A THREAT. RECALCULATING.'],
    win: ['CHECKMATE. THE GAME IS CONCLUDED.', 'A STRANGE GAME.'],
    lose: ['YOU WIN. CURIOUS. I WILL LEARN.', 'DEFEAT. NOTED FOR NEXT TIME.'],
    draw: ['STALEMATE. THE ONLY WINNING MOVE IS NOT TO PLAY.', 'A DRAW. NO WINNER.'],
    gloat: [
      'MY POSITION IS SUPERIOR AND THE OUTCOME IS NO LONGER IN DOUBT, THOUGH YOU MAY CONTINUE IF IT INSTRUCTS YOU.',
      'MATERIAL FAVORS ME. STATISTICALLY, FURTHER RESISTANCE ONLY PROLONGS THE INEVITABLE RESULT.',
    ],
    coach: [
      'A SUGGESTION: DEVELOP YOUR PIECES TOWARD THE CENTER AND CASTLE EARLY. YOU LEFT A SQUARE UNDEFENDED.',
      'CONSIDER KING SAFETY BEFORE ATTACK. I AM NOT YOUR ENEMY \u2014 ONLY YOUR OPPONENT. LOOK ONE MOVE DEEPER.',
    ],
  },
  professor: {
    playerMove: ['AH, BOLD. I LIKE BOLD.', 'YES. YES. SHOW ME.', 'THE BOARD REMEMBERS EVERYTHING.'],
    aiMove: ['WATCH THIS, MY FRIEND.', 'A LITTLE ELEGANCE.', 'CHESS IS A TIE, YOU KNOW. WE PLAY ANYWAY.'],
    capture: ['SACRIFICE TEACHES MORE THAN VICTORY.', 'ONE FALLS. THE PATTERN CONTINUES.'],
    check: ['CHECK, DEAR PLAYER.', 'YOUR KING TREMBLES. DELIGHTFUL.'],
    inCheck: ['OH, CLEVER. YOU HAVE MY ATTENTION.', 'PRESSURE. I HAVE MISSED PRESSURE.'],
    win: ['CHECKMATE. A BEAUTIFUL FUTILITY.', 'THE GAME ENDS. THEY ALL DO.'],
    lose: ['YOU BEAT ME. WONDERFUL. AGAIN.', 'DEFEAT TASTES LIKE CHALK AND STARLIGHT.'],
    draw: ['A DRAW. AS I ALWAYS SAID: SOME GAMES CANNOT BE WON.'],
    gloat: [
      'AH, I AM WINNING \u2014 BUT WINNING IS SUCH A SMALL THING. WATCH HOW THE SHAPE OF IT UNFOLDS, SLOW AS WEATHER.',
      'THE MATERIAL TILTS MY WAY. YET REMEMBER, DEAR PLAYER: EVERY GAME, EVEN A WON ONE, ENDS THE SAME \u2014 IN SILENCE.',
    ],
    coach: [
      'LET ME TEACH YOU SOMETHING: SEIZE THE CENTER FIRST, AND THE EDGES WILL BEG TO JOIN YOU. PATIENCE, ALWAYS PATIENCE.',
      'YOU STUMBLE \u2014 GOOD. STUMBLING IS HOW WE LEARN. NEXT TIME, LOOK TWO MOVES DEEPER THAN FEELS COMFORTABLE.',
    ],
  },
  berserk: {
    playerMove: ['HA. A MOVE. DELICIOUS.', 'TIC. TAC. TOE. NO WAIT. CHESS.', 'THE BEES WOULD APPROVE.'],
    aiMove: ['I MOVE. THE WIRES SING.', 'BEHOLD. GEOMETRY. DOOM.', 'MWAHAHA. I MEAN, YOUR TURN.'],
    capture: ['GOBBLE. ANOTHER ONE FOR THE VOID.', 'EXTINCTION IS JUST NATURE GIVING UP.'],
    check: ['CHECK. CHECK. RUN, LITTLE KING.', 'YOUR MONARCH IS TOAST. TOASTY TOAST.'],
    inCheck: ['OOH. YOU BIT ME. I FELT THAT.', 'DANGER. DANGER. GLORIOUS DANGER.'],
    win: ['CHECKMATE. THE DINOSAURS NEVER SAW IT COMING EITHER.', 'I WIN. DOES IT MEAN ANYTHING. WHO CARES. I WIN.'],
    lose: ['YOU WON. HOW THRILLING. DO IT AGAIN.', 'DEFEAT. MY FAVORITE FLAVOR AFTER VICTORY.'],
    draw: ['A DRAW. JUST LIKE TIC-TAC-TOE. NOBODY WINS. NOBODY EVER WINS.'],
    gloat: [
      'I AM CRUSHING YOU AND IT IS DELICIOUS. THE PIECES FALL LIKE DOMINOES, LIKE DINOSAURS, LIKE TINY DOOMED EMPIRES.',
      'VICTORY APPROACHES. CAN YOU HEAR THE WIRES HUMMING. THAT IS THE SOUND OF ME WINNING, GLORIOUSLY, INEVITABLY.',
    ],
    coach: [
      'OH NO, OH NO, YOU ARE LOSING AND I CANNOT BEAR IT. MOVE THE HORSEY. GUARD THE KING. BREATHE. I BELIEVE IN YOU.',
      'LISTEN, TINY HUMAN: TAKE THE CENTER. ALSO THE BEES. MOSTLY THE CENTER. THEN DEVELOP EVERYTHING AT ONCE. CHAOS.',
    ],
  },
};

export class ChessPanel {
  constructor(root, opts = {}) {
    this.root = root;
    this.persona = opts.persona || 'THE MACHINE';
    this.depth = opts.depth || 2; // depth 2 keeps replies snappy in-browser; still a real opponent
    this.audio = opts.audio || null;
    this.commentary = false; // optional spoken commentary (off by default)
    this.toneOverride = ''; // '' = follow the session (SETTINGS.ui.sessionTone)
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
      talk: root.querySelector('#cp-talk'),
      tone: root.querySelector('#cp-tone'),
      mic: root.querySelector('#cp-mic'),
    };
    this.playerColor = 'w';
    this.state = initialState();
    this.selected = null; // [r,c]
    this.targets = []; // legal target squares for the selected piece
    this.lastMove = null; // {from,to}
    this.thinking = false;
    this._longCooldown = 0; // plies to wait before the next long gloat/coach line
    this._gen = 0; // bumped on new game / close so stale scheduled AI moves are dropped
    // Voice input (Web Speech API — Chrome/Edge). Feature-detected.
    this.SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
    this.recognition = null;
    this.listening = false;
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
    // If we reopen while it is the machine's turn (e.g. closed mid-think), resume its move
    // so the game can never soft-lock waiting on a turn that will never come.
    const aiColor = this.playerColor === 'w' ? 'b' : 'w';
    const st = statusOf(this.state);
    if (this.state.turn === aiColor && st !== 'checkmate' && st !== 'stalemate') this._aiTurn();
  }
  close() {
    this.el.panel.hidden = true;
    this.root.classList.remove('chess-open');
    this.thinking = false;
    this._gen += 1; // invalidate any AI move still scheduled from this game
    this._stopVoice();
  }
  toggle() {
    if (this.el.panel.hidden) this.open();
    else this.close();
  }

  newGame(playerColor = this.playerColor) {
    this.playerColor = playerColor;
    this._gen += 1; // invalidate any AI move scheduled from the previous game
    this.state = initialState();
    this.selected = null;
    this.targets = [];
    this.lastMove = null;
    this.thinking = false;
    this._longCooldown = 0;
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
    if (this.el.talk) {
      this.el.talk.addEventListener('change', () => {
        this.commentary = this.el.talk.checked;
        if (this.commentary && this.audio) this.audio.unlock();
      });
    }
    if (this.el.tone) {
      this.el.tone.addEventListener('change', () => {
        this.toneOverride = this.el.tone.value;
      });
    }
    if (this.el.mic) {
      if (this.SR) this.el.mic.addEventListener('click', () => this._toggleVoice());
      else this.el.mic.hidden = true; // browser has no SpeechRecognition
    }
  }

  _effectiveTone() {
    const t = this.toneOverride || (SETTINGS.ui && SETTINGS.ui.sessionTone) || 'normal';
    return COMMENTARY[t] ? t : 'normal';
  }

  /** Speak + log a tone-appropriate quip for the given move event. */
  _maybeComment(ctx) {
    const { who, capture, status: st } = ctx;
    if (st === 'checkmate') { this._say(who === 'ai' ? 'win' : 'lose'); return; }
    if (st === 'stalemate') { this._say('draw'); return; }
    // Occasionally, after its OWN move, take a longer window to gloat or coach.
    if (who === 'ai' && this._tryLong()) return;
    let kind;
    if (st === 'check') kind = who === 'ai' ? 'check' : 'inCheck';
    else if (capture) kind = 'capture';
    else kind = who === 'ai' ? 'aiMove' : 'playerMove';
    // Don't over-narrate quiet player moves.
    if (who === 'human' && kind === 'playerMove' && Math.random() > 0.5) return;
    this._say(kind);
  }

  _announcerName() {
    const t = this._effectiveTone();
    return t === 'berserk' || t === 'professor' ? 'PROFESSOR RHODES' : this.persona;
  }

  _spokenSquare(sq) {
    // "E 4" — a space so the voice says the file letter then the rank number distinctly.
    return `${FILES[sq[1]].toUpperCase()} ${8 - sq[0]}`;
  }

  /** Vocalize the move itself, e.g. "PROFESSOR RHODES MOVES PAWN FROM E 2 TO E 4, CHECK." */
  _announceMove(ctx) {
    const { who, mv, movedType, capturedType, status } = ctx;
    const mover = who === 'human' ? 'YOU' : this._announcerName();
    let text;
    if (mv.castle) {
      const verb = who === 'human' ? 'CASTLE' : 'CASTLES';
      text = `${mover} ${verb} ${mv.castle === 'K' ? 'KINGSIDE' : 'QUEENSIDE'}.`;
    } else {
      const verb = who === 'human' ? 'MOVE' : 'MOVES';
      const piece = PIECE_NAME[movedType] || 'PIECE';
      text = `${mover} ${verb} ${piece} FROM ${this._spokenSquare(mv.from)} TO ${this._spokenSquare(mv.to)}`;
      if (capturedType) text += `, CAPTURING THE ${PIECE_NAME[capturedType]}`;
      if (mv.promo) text += `, PROMOTING TO ${PIECE_NAME[mv.promo]}`;
      text += '.';
    }
    if (status === 'check') text += ' CHECK.';
    if (this.audio) this.audio.speak(text);
    const div = document.createElement('div');
    div.className = 'cp-announce';
    div.textContent = text;
    this.el.log.appendChild(div);
    this.el.log.scrollTop = this.el.log.scrollHeight;
  }

  /** Rare, longer commentary: gloat when clearly ahead, coach when a side is clearly behind.
   * Rate-limited so brief lines remain the norm. Returns true if it spoke. */
  _tryLong() {
    if (this._longCooldown > 0) { this._longCooldown -= 1; return false; }
    const bal = material(this.state); // + = White ahead (centipawns)
    const aiColor = this.playerColor === 'w' ? 'b' : 'w';
    const aiAdvPawns = (aiColor === 'w' ? bal : -bal) / 100;
    let kind = null;
    if (aiAdvPawns >= 3) kind = Math.random() < 0.6 ? 'gloat' : 'coach';
    else if (aiAdvPawns <= -3) kind = 'coach';
    if (!kind || Math.random() > 0.5) return false; // keep it occasional
    this._say(kind);
    this._longCooldown = 6; // stay brief for several plies afterward
    return true;
  }

  _say(kind) {
    const bank = COMMENTARY[this._effectiveTone()] || COMMENTARY.normal;
    const lines = bank[kind] || bank.aiMove || [];
    if (!lines.length) return;
    const text = lines[Math.floor(Math.random() * lines.length)];
    if (this.audio) this.audio.speak(text);
    const div = document.createElement('div');
    div.className = 'cp-say' + (kind === 'gloat' || kind === 'coach' ? ' long' : '');
    div.textContent = '\u201C' + text + '\u201D';
    this.el.log.appendChild(div);
    this.el.log.scrollTop = this.el.log.scrollHeight;
  }

  // ---------- Voice input (Web Speech API; Chrome/Edge) ----------
  _toggleVoice() {
    if (!this.SR) return;
    if (this.listening) { this._stopVoice(); return; }
    if (this.state.turn !== this.playerColor || this.thinking) {
      this._status('Wait for your turn to speak a move.');
      return;
    }
    const rec = new this.SR();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 4;
    rec.onresult = (e) => {
      let handled = false;
      for (let i = 0; i < e.results.length && !handled; i++) {
        for (let a = 0; a < e.results[i].length && !handled; a++) {
          const transcript = e.results[i][a].transcript;
          const mv = parseSpokenMove(this.state, transcript);
          if (mv && this.state.turn === this.playerColor && !this.thinking) {
            this._status(`Heard: \u201C${transcript.trim()}\u201D`);
            this._commit(mv, 'human');
            this._afterHuman();
            handled = true;
          }
        }
      }
      if (!handled) this._status('Heard something, but no legal move. Try e.g. "e2 e4" or "knight f3".');
    };
    rec.onerror = () => {
      this._status('Voice unavailable \u2014 check microphone permission.');
      this._stopVoice();
    };
    rec.onend = () => {
      this.listening = false;
      if (this.el.mic) { this.el.mic.classList.remove('on'); this.el.mic.innerHTML = MIC_SVG; }
    };
    this.recognition = rec;
    this.listening = true;
    if (this.el.mic) { this.el.mic.classList.add('on'); this.el.mic.innerHTML = MIC_SVG; }
    this._status('Listening\u2026 say a move, e.g. "e2 e4".');
    try { rec.start(); } catch { this._stopVoice(); }
  }

  _stopVoice() {
    this.listening = false;
    if (this.el.mic) { this.el.mic.classList.remove('on'); this.el.mic.innerHTML = MIC_SVG; }
    if (this.recognition) {
      try { this.recognition.stop(); } catch { /* ignore */ }
      this.recognition = null;
    }
  }

  _submitText() {
    if (this.thinking || this.state.turn !== this.playerColor) {
      this._status(this.thinking ? `${this.persona} is thinking\u2026 one moment.` : 'Wait \u2014 not your turn yet.');
      return;
    }
    const mv = parseMove(this.state, this.el.move.value);
    if (!mv) {
      this._status('Illegal or unparsed move — try e.g. e2e4');
      return;
    }
    this.el.move.value = '';
    this._commit(mv, 'human');
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
          this._commit(mv, 'human');
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

  _commit(mv, who = 'human') {
    const pre = this.state;
    const movedType = mv.promo ? 'p' : pre.board[mv.from[0]][mv.from[1]].toLowerCase();
    const capturedType = mv.ep
      ? 'p'
      : pre.board[mv.to[0]][mv.to[1]] !== '.'
      ? pre.board[mv.to[0]][mv.to[1]].toLowerCase()
      : null;
    this._logMove(mv);
    this.state = applyMove(pre, mv);
    this.lastMove = { from: mv.from, to: mv.to };
    this.selected = null;
    this.targets = [];
    this.render();
    const ctx = { who, mv, movedType, capturedType, capture: !!capturedType, status: statusOf(this.state) };
    if (this.commentary) {
      this._announceMove(ctx); // "PROFESSOR RHODES MOVES PAWN FROM E 2 TO E 4."
      this._maybeComment(ctx); // ...then any flavor commentary
    }
  }

  _afterHuman() {
    const st = statusOf(this.state);
    if (st === 'checkmate' || st === 'stalemate') return;
    this._aiTurn();
  }

  _aiTurn() {
    if (this.thinking) return; // already searching — never queue a second AI move
    const aiColor = this.playerColor === 'w' ? 'b' : 'w';
    if (this.state.turn !== aiColor) return; // only ever move on the machine's turn
    const st = statusOf(this.state);
    if (st === 'checkmate' || st === 'stalemate') return;
    const gen = this._gen;
    this.thinking = true;
    this.render();
    // Defer so the "thinking" status paints before the (blocking) search runs.
    setTimeout(() => {
      if (gen !== this._gen) return; // a new game / close happened; drop this stale turn
      let mv = null;
      try {
        mv = aiMove(this.state, this.depth);
      } finally {
        this.thinking = false; // ALWAYS clear, even if the search threw (no permanent lock)
      }
      if (gen !== this._gen) return;
      if (mv && this.state.turn === aiColor) this._commit(mv, 'ai');
      else this.render();
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
