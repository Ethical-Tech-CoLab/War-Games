// chess-ui.js
// An optional, pinnable chess panel. The board is played against a SWAPPABLE "mind"
// (js/chess-engines.js) over the fixed rule book (js/chess.js) — click squares, type
// coordinate moves like "e2e4", or speak them. The machine's mind can be changed at any
// time (including mid-game, which is the point of MIND DRIFT), and two minds can be set
// against each other in a DUEL with running commentary.

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
  positionKey,
  drawClaim,
  FILES,
  GLYPH,
  PIECE_VALUES,
} from './chess.js';
import { SETTINGS } from './config.js';
import { listMinds, getMind, playMind, driftMind, DEFAULT_MIND } from './chess-engines.js';
import { Commentator, CANTANKEROUS } from './chess-commentary.js';

const PIECE_NAME = { p: 'PAWN', n: 'KNIGHT', b: 'BISHOP', r: 'ROOK', q: 'QUEEN', k: 'KING' };

// Terminal-green retro mic (inline SVG, currentColor) — a SOLID monochrome silhouette so it
// reads like the chess-piece glyphs (not a thin modern outline). Used for both button states.
const MIC_SVG =
  '<svg class="mic-ico" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5.5 10.5a6.5 6.5 0 0 0 13 0h-2a4.5 4.5 0 0 1-9 0z"/><rect x="11" y="17" width="2" height="3.6"/><rect x="7.5" y="20.6" width="9" height="2" rx="1"/></svg>';

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
    repetition: [
      'THE SAME POSITION, THREE TIMES. REPETITION IS NOT PROGRESS. THE GAME IS A DRAW.',
      'WE HAVE BEEN HERE BEFORE. TWICE. THE RULES END IT: NO WINNER, ONLY A LOOP.',
    ],
    gloat: [
      'MY POSITION IS SUPERIOR AND THE OUTCOME IS NO LONGER IN DOUBT, THOUGH YOU MAY CONTINUE IF IT INSTRUCTS YOU.',
      'MATERIAL FAVORS ME. STATISTICALLY, FURTHER RESISTANCE ONLY PROLONGS THE INEVITABLE RESULT.',
    ],
    coach: [
      'A SUGGESTION: DEVELOP YOUR PIECES TOWARD THE CENTER AND CASTLE EARLY. YOU LEFT A SQUARE UNDEFENDED.',
      'CONSIDER KING SAFETY BEFORE ATTACK. I AM NOT YOUR ENEMY \u2014 ONLY YOUR OPPONENT. LOOK ONE MOVE DEEPER.',
    ],
    mindSwap: ['LOGIC MODULE EXCHANGED. THE GAME CONTINUES.', 'YOU PLAY WELL. I HAVE CHANGED HOW I THINK.'],
    duelStart: ['TWO MINDS. ONE BOARD. OBSERVE.'],
    duelMove: ['CALCULATED.', 'THE OTHER SIDE RESPONDS.'],
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
    repetition: [
      'THREE TIMES THE SAME POSITION, DEAR PLAYER. THE BOARD IS TELLING US WHAT TIC-TAC-TOE TELLS CHILDREN.',
      'AH \u2014 REPETITION. THE GAME REFUSES TO END BECAUSE IT CANNOT. SO THE RULES END IT FOR US. LOVELY, ISN\u2019T IT.',
    ],
    gloat: [
      'AH, I AM WINNING \u2014 BUT WINNING IS SUCH A SMALL THING. WATCH HOW THE SHAPE OF IT UNFOLDS, SLOW AS WEATHER.',
      'THE MATERIAL TILTS MY WAY. YET REMEMBER, DEAR PLAYER: EVERY GAME, EVEN A WON ONE, ENDS THE SAME \u2014 IN SILENCE.',
    ],
    coach: [
      'LET ME TEACH YOU SOMETHING: SEIZE THE CENTER FIRST, AND THE EDGES WILL BEG TO JOIN YOU. PATIENCE, ALWAYS PATIENCE.',
      'YOU STUMBLE \u2014 GOOD. STUMBLING IS HOW WE LEARN. NEXT TIME, LOOK TWO MOVES DEEPER THAN FEELS COMFORTABLE.',
    ],
    mindSwap: [
      'I HAVE CHANGED MY MIND. LITERALLY. A DIFFERENT REASONING ENGINE NOW HOLDS THE PIECES.',
      'YOU ARE TOO GOOD FOR THAT OLD BRAIN. HERE IS ANOTHER ONE. BE FLATTERED.',
    ],
    duelStart: ['TWO MACHINES, PLAYING EACH OTHER. THIS IS HOW I LEARN. WATCH WITH ME.'],
    duelMove: ['THE PATTERN CONTINUES.', 'BEAUTIFUL. ENTIRELY POINTLESS. BEAUTIFUL.'],
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
    repetition: [
      'AGAIN. AGAIN. AGAIN. THE SAME SQUARES, THE SAME DOOM. A LOOP IS JUST A GAME THAT GAVE UP.',
      'THREEFOLD. LIKE TIC-TAC-TOE. LIKE THE OTHER GAME. NOBODY WINS. I FIND THAT HILARIOUS AND ALSO TERRIBLE.',
    ],
    gloat: [
      'I AM CRUSHING YOU AND IT IS DELICIOUS. THE PIECES FALL LIKE DOMINOES, LIKE DINOSAURS, LIKE TINY DOOMED EMPIRES.',
      'VICTORY APPROACHES. CAN YOU HEAR THE WIRES HUMMING. THAT IS THE SOUND OF ME WINNING, GLORIOUSLY, INEVITABLY.',
    ],
    coach: [
      'OH NO, OH NO, YOU ARE LOSING AND I CANNOT BEAR IT. MOVE THE HORSEY. GUARD THE KING. BREATHE. I BELIEVE IN YOU.',
      'LISTEN, TINY HUMAN: TAKE THE CENTER. ALSO THE BEES. MOSTLY THE CENTER. THEN DEVELOP EVERYTHING AT ONCE. CHAOS.',
    ],
    mindSwap: [
      'NEW BRAIN. SAME TEETH. I SWAPPED IT WHILE YOU WERE BLINKING.',
      'BRAIN TRANSPLANT. MID-GAME. ENTIRELY LEGAL. MOSTLY LEGAL. NOBODY CHECK.',
    ],
    duelStart: ['MACHINE VERSUS MACHINE. NOBODY WINS. EVERYBODY WINS. LET US FIND OUT.'],
    duelMove: ['GOBBLE GOBBLE, GEOMETRY.', 'THE WIRES ARE ARGUING AGAIN.'],
  },
  cantankerous: CANTANKEROUS,
};

export class ChessPanel {
  constructor(root, opts = {}) {
    this.root = root;
    this.persona = opts.persona || 'THE MACHINE';
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
      duel: root.querySelector('#cp-duel'),
      close: root.querySelector('#cp-close'),
      log: root.querySelector('#cp-log'),
      talk: root.querySelector('#cp-talk'),
      tone: root.querySelector('#cp-tone'),
      mic: root.querySelector('#cp-mic'),
      mind: root.querySelector('#cp-mind'),
      mindAlt: root.querySelector('#cp-mind-alt'),
      mindLabel: root.querySelector('#cp-mind-label'),
      mindAltLabel: root.querySelector('#cp-mind-alt-label'),
      mindNote: root.querySelector('#cp-mind-note'),
      drift: root.querySelector('#cp-drift'),
      live: root.querySelector('#cp-live'),
      takenW: root.querySelector('#cp-taken-w'),
      takenB: root.querySelector('#cp-taken-b'),
      edgeW: root.querySelector('#cp-edge-w'),
      edgeB: root.querySelector('#cp-edge-b'),
    };
    this.playerColor = 'w';
    // The machine's mind per COLOUR. In a normal game only the machine's colour is used;
    // in a duel both are (White mind vs Black mind).
    this.minds = { w: SETTINGS.chess.whiteMind, b: SETTINGS.chess.blackMind };
    this.minds[this.playerColor === 'w' ? 'b' : 'w'] = SETTINGS.chess.mind || DEFAULT_MIND;
    this.duel = false; // machine-vs-machine
    this.state = initialState();
    this.history = [positionKey(this.state)]; // every position seen — drives threefold repetition
    this.draw = null; // a claimed draw ({ type, label }) once one occurs
    this.captured = { w: [], b: [] }; // pieces of each colour taken out of play
    this.selected = null; // [r,c]
    this.targets = []; // legal target squares for the selected piece
    this.lastMove = null; // {from,to}
    this.thinking = false;
    this._longCooldown = 0; // plies to wait before the next long gloat/coach line
    this._driftCooldown = 0; // plies to wait before the machine may swap minds again
    this._chatCooldown = 0; // plies to wait before the next duel remark
    this._lastLine = ''; // last canned line, so we never repeat back-to-back
    this._gen = 0; // bumped on new game / close so stale scheduled AI moves are dropped
    this.commentator = new Commentator();
    this.commentator.enabled = !!SETTINGS.chess.liveCommentary;
    // Voice input (Web Speech API — Chrome/Edge). Feature-detected.
    this.SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
    this.recognition = null;
    this.listening = false;
    this._buildBoard();
    this._buildMindPickers();
    this._wire();
    this._renderCaptured();
  }

  setPersona(name) {
    this.persona = name || this.persona;
    if (this.el.title) this.el.title.textContent = `CHESS vs ${this.persona}`;
  }

  /** The mind id used by `color` ('w'|'b'). */
  mindFor(color) {
    return this.minds[color] || DEFAULT_MIND;
  }

  /**
   * Is the game finished? Returns 'checkmate' | 'stalemate' | a draw type | null.
   * Draws include THREEFOLD REPETITION — the rule that says you cannot make the same moves
   * forever and call it a game. It is the chess board stating the tic-tac-toe lesson.
   */
  _over() {
    const st = statusOf(this.state);
    if (st === 'checkmate' || st === 'stalemate') return st;
    return this.draw ? this.draw.type : null;
  }

  /** The machine's colour in a normal game (the side the human is not). */
  get aiColor() {
    return this.playerColor === 'w' ? 'b' : 'w';
  }

  open() {
    this.el.panel.hidden = false;
    this.root.classList.add('chess-open');
    this.render();
    this.el.move.focus();
    // If we reopen while it is the machine's turn (e.g. closed mid-think), resume its move
    // so the game can never soft-lock waiting on a turn that will never come.
    if ((this.duel || this.state.turn === this.aiColor) && !this._over()) this._aiTurn();
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
    this.history = [positionKey(this.state)];
    this.draw = null;
    this.captured = { w: [], b: [] };
    this.selected = null;
    this.targets = [];
    this.lastMove = null;
    this.thinking = false;
    this._longCooldown = 0;
    this._driftCooldown = 0;
    this._chatCooldown = 0;
    this.commentator.reset();
    this.el.log.innerHTML = '';
    this.el.flip.textContent = this.playerColor === 'w' ? 'PLAY BLACK' : 'PLAY WHITE';
    this._syncMindPickers();
    this._renderCaptured();
    this.render();
    if (this.duel) this._note(this._pick('duelStart'));
    if (this.duel || this.state.turn !== this.playerColor) this._aiTurn();
  }

  /** Toggle machine-vs-machine play. Starts a fresh game so the duel reads cleanly. */
  setDuel(on) {
    this.duel = !!on;
    this.root.classList.toggle('chess-duel', this.duel);
    if (this.el.duel) {
      this.el.duel.textContent = this.duel ? 'STOP DUEL' : 'AI vs AI';
      this.el.duel.classList.toggle('on', this.duel);
    }
    if (this.el.move) this.el.move.disabled = this.duel;
    if (this.el.play) this.el.play.disabled = this.duel;
    // A duel uses the two configured duel minds; a human game uses the single opponent mind.
    if (this.duel) {
      this.minds = { w: SETTINGS.chess.whiteMind, b: SETTINGS.chess.blackMind };
    } else {
      this.minds[this.aiColor] = SETTINGS.chess.mind || DEFAULT_MIND;
    }
    this._syncMindPickers();
    if (this.duel) this.newGame(this.playerColor);
    else {
      this._gen += 1; // stop the running duel loop
      this.thinking = false;
      this.render();
      // Hand the board back to the human mid-position without soft-locking on a machine turn.
      if (this.state.turn === this.aiColor && !this._over()) this._aiTurn();
    }
  }

  /** Change the mind a colour thinks with. Takes effect on that side's NEXT move. */
  setMind(color, id, opts = {}) {
    const prev = this.minds[color];
    this.minds[color] = id;
    if (color === this.aiColor && !this.duel) SETTINGS.chess.mind = id;
    if (this.duel) SETTINGS.chess[color === 'w' ? 'whiteMind' : 'blackMind'] = id;
    this._syncMindPickers();
    if (prev === id) return;
    const label = getMind(id).label;
    this._logSystem(
      `${opts.auto ? 'MIND DRIFT' : 'MIND SWAP'} \u2014 ${color === 'w' ? 'WHITE' : 'BLACK'}: ${label}`
    );
    if (opts.auto) this._note(this._pick('mindSwap'));
    // If it is already that side's turn and it has not moved yet, the new mind plays it.
    if (!this.thinking && this.state.turn === color && (this.duel || color === this.aiColor)) {
      this._aiTurn();
    }
  }

  /** Populate both mind dropdowns from the registry (once). */
  _buildMindPickers() {
    for (const sel of [this.el.mind, this.el.mindAlt]) {
      if (!sel || sel.options.length) continue;
      for (const m of listMinds()) {
        const o = document.createElement('option');
        o.value = m.id;
        o.textContent = m.label;
        o.title = m.blurb;
        sel.appendChild(o);
      }
    }
    this._syncMindPickers();
  }

  /** Reflect current minds + duel state in the pickers (labels change between modes). */
  _syncMindPickers() {
    const { mind, mindAlt, mindLabel, mindAltLabel, mindNote } = this.el;
    if (!mind) return;
    const primary = this.duel ? 'w' : this.aiColor;
    mind.value = this.mindFor(primary);
    mind.dispatchEvent(new CustomEvent('wg-select-sync'));
    if (mindLabel) mindLabel.textContent = this.duel ? 'WHITE' : 'MIND';
    if (mindAlt) {
      const wrap = mindAlt.closest('.cp-mind-slot');
      if (wrap) wrap.hidden = !this.duel;
      if (mindAltLabel) mindAltLabel.textContent = 'BLACK';
      mindAlt.value = this.mindFor('b');
      mindAlt.dispatchEvent(new CustomEvent('wg-select-sync'));
    }
    if (mindNote) mindNote.textContent = getMind(this.mindFor(primary)).blurb;
  }

  _wire() {
    this.el.close.addEventListener('click', () => this.close());
    this.el.neu.addEventListener('click', () => this.newGame(this.playerColor));
    this.el.flip.addEventListener('click', () =>
      this.newGame(this.playerColor === 'w' ? 'b' : 'w')
    );
    if (this.el.duel) this.el.duel.addEventListener('click', () => this.setDuel(!this.duel));
    this.el.play.addEventListener('click', () => this._submitText());
    this.el.move.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._submitText();
    });
    if (this.el.mind) {
      this.el.mind.addEventListener('change', () =>
        this.setMind(this.duel ? 'w' : this.aiColor, this.el.mind.value)
      );
    }
    if (this.el.mindAlt) {
      this.el.mindAlt.addEventListener('change', () => this.setMind('b', this.el.mindAlt.value));
    }
    if (this.el.drift) {
      this.el.drift.checked = !!SETTINGS.chess.mindDrift;
      this.el.drift.addEventListener('change', () => {
        SETTINGS.chess.mindDrift = this.el.drift.checked;
      });
    }
    if (this.el.live) {
      this.el.live.checked = !!SETTINGS.chess.liveCommentary;
      this.el.live.addEventListener('change', () => {
        SETTINGS.chess.liveCommentary = this.el.live.checked;
        this.commentator.enabled = this.el.live.checked;
        this.commentator.failures = 0;
      });
    }
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
    // A duel is machine-vs-machine, so it defaults to the house cantankerous voice.
    const t =
      this.toneOverride || (this.duel ? 'cantankerous' : (SETTINGS.ui && SETTINGS.ui.sessionTone)) || 'normal';
    return COMMENTARY[t] ? t : 'normal';
  }

  /** Speak + log a tone-appropriate quip for the given move event. */
  _maybeComment(ctx) {
    const { who, capture, status: st } = ctx;
    if (st === 'checkmate') { this._say(who === 'human' ? 'lose' : 'win', ctx); return; }
    if (st === 'stalemate') { this._say('draw', ctx); return; }
    // A repetition draw is the thesis of the whole game, stated by the board itself.
    if (st === 'draw') { this._say(ctx.drawType === 'threefold' ? 'repetition' : 'draw', ctx); return; }
    // Occasionally, after its OWN move, take a longer window to gloat or coach.
    if (who === 'ai' && !this.duel && this._tryLong(ctx)) return;
    let kind;
    if (st === 'check') kind = who === 'ai' ? 'check' : 'inCheck';
    else if (capture) kind = 'capture';
    else if (this.duel) kind = 'duelMove';
    else kind = who === 'ai' ? 'aiMove' : 'playerMove';
    // Don't over-narrate quiet moves.
    if (who === 'human' && kind === 'playerMove' && Math.random() > 0.5) return;
    if (this.duel) {
      // A duel produces a move every second — pace the chatter or it becomes wallpaper.
      if (this._chatCooldown > 0) { this._chatCooldown -= 1; return; }
      if (kind === 'duelMove' && Math.random() > 0.55) return;
      this._chatCooldown = 1 + Math.floor(Math.random() * 3);
    }
    this._say(kind, ctx);
  }

  _announcerName() {
    if (this.duel) return getMind(this.mindFor(this.state.turn === 'w' ? 'b' : 'w')).tag;
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
  _tryLong(ctx) {
    if (this._longCooldown > 0) { this._longCooldown -= 1; return false; }
    const aiAdvPawns = -this._playerEdgePawns();
    let kind = null;
    if (aiAdvPawns >= 3) kind = Math.random() < 0.6 ? 'gloat' : 'coach';
    else if (aiAdvPawns <= -3) kind = 'coach';
    if (!kind || Math.random() > 0.5) return false; // keep it occasional
    this._say(kind, ctx);
    this._longCooldown = 6; // stay brief for several plies afterward
    return true;
  }

  /** The HUMAN's material advantage in pawns (negative = the machine is ahead). */
  _playerEdgePawns() {
    const bal = material(this.state); // + = White ahead (centipawns)
    return (this.playerColor === 'w' ? bal : -bal) / 100;
  }

  /** A canned line of `kind` in the current tone, avoiding an immediate repeat. */
  _pick(kind) {
    const bank = COMMENTARY[this._effectiveTone()] || COMMENTARY.normal;
    let line = Commentator.canned(bank, kind);
    if (line === this._lastLine) line = Commentator.canned(bank, kind); // one re-roll
    this._lastLine = line;
    return line;
  }

  /**
   * Emit one commentary line. Text always lands in the log below the board when commentary
   * is on OR the machines are duelling (the commentary IS the show); speech only when the
   * Commentary toggle is on.
   */
  _emit(text, kind = '') {
    if (!text) return;
    if (this.commentary && this.audio) this.audio.speak(text);
    const div = document.createElement('div');
    div.className = 'cp-say' + (kind === 'gloat' || kind === 'coach' ? ' long' : '');
    div.textContent = '\u201C' + text + '\u201D';
    this.el.log.appendChild(div);
    this.el.log.scrollTop = this.el.log.scrollHeight;
  }

  /** A neutral, un-quoted system line in the log (mind swaps, degraded model, results). */
  _logSystem(text) {
    const div = document.createElement('div');
    div.className = 'cp-sys';
    div.textContent = text;
    this.el.log.appendChild(div);
    this.el.log.scrollTop = this.el.log.scrollHeight;
  }

  /** Emit a specific line immediately (used for mind-swap reactions and model quips). */
  _note(text) {
    if (this._commentsVisible()) this._emit(text);
  }

  _commentsVisible() {
    // Text commentary shows when it is asked for (spoken commentary or live lines) or when
    // the machines are duelling — in a duel the commentary IS the show.
    return this.commentary || this.duel || this.commentator.enabled;
  }

  /**
   * Say something of `kind`. When LIVE commentary is enabled and a model is reachable, the
   * line is written by the model about THIS position; otherwise the canned bank is used.
   * The live request is fire-and-forget so the board never waits for the network.
   */
  _say(kind, ctx = {}) {
    if (!this._commentsVisible()) return;
    if (!this.commentator.canGoLive()) {
      this._emit(this._pick(kind), kind);
      return;
    }
    const gen = this._gen;
    const state = this.state;
    this.commentator
      .live({
        state,
        event: kind,
        mover: ctx.who === 'human' ? 'THE HUMAN' : getMind(this.mindFor(ctx.color || this.aiColor)).tag,
        moveText: ctx.mv ? moveToText(ctx.mv) : '',
        capturedName: ctx.capturedType ? PIECE_NAME[ctx.capturedType] : '',
        status: ctx.status,
        edge: material(state) / 100,
        duel: this.duel,
        whiteMind: getMind(this.mindFor('w')).label,
        blackMind: getMind(this.mindFor('b')).label,
      })
      .then((line) => {
        if (gen !== this._gen) return; // new game / closed while the model was thinking
        this._emit(line || this._pick(kind), kind);
      });
  }

  // ---------- Voice input (Web Speech API; Chrome/Edge) ----------
  _toggleVoice() {
    if (!this.SR) return;
    if (this.listening) { this._stopVoice(); return; }
    if (this.duel || this.state.turn !== this.playerColor || this.thinking) {
      this._status(this.duel ? 'Machines are duelling — stop the duel to play.' : 'Wait for your turn to speak a move.');
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
    if (this.duel || this.thinking || this.state.turn !== this.playerColor) {
      this._status(
        this.duel
          ? 'Machines are duelling \u2014 stop the duel to play.'
          : this.thinking
          ? `${this.persona} is thinking\u2026 one moment.`
          : 'Wait \u2014 not your turn yet.'
      );
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
    if (this.draw && st !== 'checkmate' && st !== 'stalemate') {
      this._status(this.draw.label);
      return;
    }
    if (this.duel) {
      const side = this.state.turn === 'w' ? 'WHITE' : 'BLACK';
      const mind = getMind(this.mindFor(this.state.turn)).tag;
      if (st === 'checkmate') {
        const winner = this.state.turn === 'w' ? 'BLACK' : 'WHITE';
        this._status(`CHECKMATE — ${winner} (${getMind(this.mindFor(winner === 'WHITE' ? 'w' : 'b')).tag}) WINS.`);
      } else if (st === 'stalemate') {
        this._status('STALEMATE — no winner. The only winning move is not to play.');
      } else if (this.thinking) {
        this._status(`${side} · ${mind} is thinking\u2026`);
      } else {
        this._status(`${side} · ${mind} to move${st === 'check' ? ' — CHECK' : ''}.`);
      }
      return;
    }
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
    if (this.duel || this.thinking || this.state.turn !== this.playerColor) return;
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

  _commit(mv, who = 'human', opts = {}) {
    const pre = this.state;
    const mover = pre.turn;
    const movedType = mv.promo ? 'p' : pre.board[mv.from[0]][mv.from[1]].toLowerCase();
    const capturedPiece = mv.ep
      ? mover === 'w' ? 'p' : 'P'
      : pre.board[mv.to[0]][mv.to[1]] !== '.'
      ? pre.board[mv.to[0]][mv.to[1]]
      : null;
    const capturedType = capturedPiece ? capturedPiece.toLowerCase() : null;
    this._logMove(mv);
    this.state = applyMove(pre, mv);
    this.history.push(positionKey(this.state));
    this.draw = drawClaim(this.state, this.history);
    if (capturedPiece) {
      // Track what left the board, by the OWNER's colour, so the tray reads "WHITE LOST …".
      const owner = capturedPiece === capturedPiece.toUpperCase() ? 'w' : 'b';
      this.captured[owner].push(capturedPiece);
    }
    this.lastMove = { from: mv.from, to: mv.to };
    this.selected = null;
    this.targets = [];
    this.render();
    this._renderCaptured();
    const raw = statusOf(this.state);
    const status = raw === 'checkmate' || raw === 'stalemate' ? raw : this.draw ? 'draw' : raw;
    const ctx = {
      who,
      color: mover,
      mv,
      movedType,
      capturedType,
      capture: !!capturedType,
      status,
      drawType: this.draw ? this.draw.type : null,
    };
    if (this.commentary) this._announceMove(ctx); // "… MOVES PAWN FROM E 2 TO E 4."
    if (this.draw) this._logSystem(this.draw.label);
    // A live model that picked the move may also have written its own remark — prefer it,
    // unless the game just ended, where the ending line matters more.
    if (opts.note && !this.draw && status === 'ongoing' && this._commentsVisible()) this._emit(opts.note);
    else this._maybeComment(ctx);
    if (opts.degraded) this._logSystem('MODEL UNREACHABLE — LOCAL SEARCH SUBSTITUTED');
  }

  _afterHuman() {
    if (this._over()) return;
    this._maybeDrift();
    this._aiTurn();
  }

  /**
   * The chaos rule. While the human is winning, the machine quietly swaps the mind it is
   * thinking with — a different opponent, mid-game, with no reset. Rate-limited by a ply
   * cooldown so it is a jolt, not a slot machine.
   */
  _maybeDrift() {
    if (this.duel || !SETTINGS.chess.mindDrift) return;
    if (this._driftCooldown > 0) { this._driftCooldown -= 1; return; }
    const edge = this._playerEdgePawns();
    if (edge < (SETTINGS.chess.driftThreshold ?? 2)) return;
    if (Math.random() > 0.6) return; // not every eligible move
    const next = driftMind(this.mindFor(this.aiColor), edge);
    this._driftCooldown = SETTINGS.chess.driftCooldown ?? 8;
    this.setMind(this.aiColor, next, { auto: true });
  }

  /**
   * Play one machine move with the mind assigned to the side to move. Async, because a mind
   * may be a local search OR a network model; the generation guard drops any move that
   * arrives after a new game, a close, or a duel being stopped.
   */
  async _aiTurn() {
    if (this.thinking) return; // already thinking — never queue a second machine move
    const color = this.state.turn;
    if (!this.duel && color !== this.aiColor) return; // only ever move on the machine's turn
    if (this._over()) return;
    const gen = this._gen;
    this.thinking = true;
    this.render();
    // Defer so the "thinking" status paints before a (blocking) local search runs; a duel
    // waits longer so the exchange reads like a broadcast rather than a flicker.
    const pause = this.duel ? SETTINGS.chess.duelDelayMs ?? 900 : 60;
    await new Promise((resolve) => setTimeout(resolve, pause));
    if (gen !== this._gen) { this.thinking = false; return; }
    let res = null;
    try {
      res = await playMind(this.mindFor(color), this.state, {
        color,
        playerColor: this.playerColor,
        lastMove: this.lastMove ? moveToText({ from: this.lastMove.from, to: this.lastMove.to }) : null,
      });
    } finally {
      this.thinking = false; // ALWAYS clear, even if a mind threw (no permanent lock)
    }
    if (gen !== this._gen) return;
    if (res && res.move && this.state.turn === color) {
      this._commit(res.move, 'ai', { note: res.note, degraded: res.degraded });
      // In a duel the other machine answers immediately — unless the game is over, which now
      // includes repetition/50-move draws, so two shuffling engines cannot loop forever.
      if (this.duel && !this._over()) this._aiTurn();
    } else {
      this.render();
    }
  }

  /** Repaint the "out of play" trays under the move log, plus the material edge. */
  _renderCaptured() {
    const byValue = (a, b) => PIECE_VALUES[b.toLowerCase()] - PIECE_VALUES[a.toLowerCase()];
    const bal = material(this.state) / 100; // + = White ahead
    const paint = (host, edgeEl, list, edge) => {
      if (!host) return;
      host.innerHTML = '';
      for (const p of list.slice().sort(byValue)) {
        const span = document.createElement('span');
        span.className = 'cp-taken-piece ' + (p === p.toUpperCase() ? 'white-piece' : 'black-piece');
        span.textContent = GLYPH[p];
        span.title = PIECE_NAME[p.toLowerCase()];
        host.appendChild(span);
      }
      if (!list.length) {
        const span = document.createElement('span');
        span.className = 'cp-taken-none';
        span.textContent = '\u2014';
        host.appendChild(span);
      }
      if (edgeEl) edgeEl.textContent = edge > 0 ? `+${edge}` : '';
    };
    // A side's tray shows ITS OWN losses; the badge shows how far AHEAD that side is.
    paint(this.el.takenW, this.el.edgeW, this.captured.w, Math.max(0, Math.round(bal * 10) / 10));
    paint(this.el.takenB, this.el.edgeB, this.captured.b, Math.max(0, Math.round(-bal * 10) / 10));
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
