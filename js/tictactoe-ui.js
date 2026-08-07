// tictactoe-ui.js
// The tic-tac-toe panel — the game the machine is taught with.
//
// Two jobs:
//   1. A playable board in the same CRT register as the chess panel. The machine plays
//      PERFECTLY, so the best a human can ever do is draw. Discovering that by hand is the
//      whole lesson in miniature.
//   2. `runFutilityDemo()` — the scene the story runs at the futility climax: the machine
//      plays itself, accelerates, walks the ENTIRE game tree, reports the real numbers, and
//      then applies the same reasoning to {{GAME}}. Every number shown is computed live by
//      js/tictactoe.js, not authored — the machine genuinely proves it.

import {
  initialTTT,
  tttApply,
  tttStatus,
  tttBest,
  tttMoves,
  tttEnumerate,
  tttPerfectOutcome,
  winningLine,
} from './tictactoe.js';

// Doctrine labels for the generalisation beat. Deliberately generic, real-world strategic
// terminology (not a quotation), rendered with the active {{GAME}} name.
const SCENARIOS = [
  'LOCAL THEATRE ENGAGEMENT',
  'LAUNCH ON WARNING',
  'COUNTERFORCE EXCHANGE',
  'COUNTERVALUE EXCHANGE',
  'ARCTIC FIRST STRIKE',
  'SUBMARINE-LAUNCHED SURPRISE',
  'DECAPITATION STRIKE',
  'MASSIVE RETALIATION',
  'LIMITED EXCHANGE / NEGOTIATED HALT',
  'TOTAL STRATEGIC EXCHANGE',
];

const fmt = (n) => n.toLocaleString('en-US');

export class TicTacToePanel {
  constructor(root, opts = {}) {
    this.root = root;
    this.audio = opts.audio || null;
    this.names = opts.names || null; // active name set; supplies {{GAME}} / {{PERSONA}}
    this.el = {
      panel: root.querySelector('#ttt-panel'),
      status: root.querySelector('#ttt-status'),
      board: root.querySelector('#ttt-board'),
      log: root.querySelector('#ttt-log'),
      tally: root.querySelector('#ttt-tally'),
      neu: root.querySelector('#ttt-new'),
      flip: root.querySelector('#ttt-flip'),
      learn: root.querySelector('#ttt-learn'),
      close: root.querySelector('#ttt-close'),
    };
    this.playerMark = 'X';
    this.state = initialTTT('X');
    this.tally = { games: 0, X: 0, O: 0, draw: 0 };
    this.busy = false; // input is locked (the machine is thinking, or a demo is running)
    this.demo = false; // a demonstration owns the status line
    this._gen = 0;
    this.reduced =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this._buildBoard();
    this._wire();
    this.render();
  }

  get gameName() {
    return (this.names && this.names.GAME) || 'GLOBAL THERMONUCLEAR WAR';
  }
  get personaName() {
    return (this.names && this.names.PERSONA) || 'THE MACHINE';
  }

  open() {
    this.el.panel.hidden = false;
    this.root.classList.add('ttt-open');
    this.render();
  }
  close() {
    this.el.panel.hidden = true;
    this.root.classList.remove('ttt-open');
    this._gen += 1; // abandon any running demo
    this.busy = false;
    this.demo = false;
  }
  toggle() {
    if (this.el.panel.hidden) this.open();
    else this.close();
  }

  newGame(playerMark = this.playerMark) {
    this.playerMark = playerMark;
    this._gen += 1;
    this.busy = false;
    this.demo = false;
    this.state = initialTTT('X');
    if (this.el.flip) this.el.flip.textContent = this.playerMark === 'X' ? 'PLAY O' : 'PLAY X';
    this.render();
    if (this.state.turn !== this.playerMark) this._machineTurn();
  }

  _buildBoard() {
    this.el.board.innerHTML = '';
    this.squares = [];
    for (let i = 0; i < 9; i++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tt-sq';
      btn.dataset.i = String(i);
      btn.addEventListener('click', () => this._onSquare(i));
      this.el.board.appendChild(btn);
      this.squares.push(btn);
    }
  }

  _wire() {
    if (this.el.close) this.el.close.addEventListener('click', () => this.close());
    if (this.el.neu) this.el.neu.addEventListener('click', () => this.newGame(this.playerMark));
    if (this.el.flip) {
      this.el.flip.addEventListener('click', () => this.newGame(this.playerMark === 'X' ? 'O' : 'X'));
    }
    if (this.el.learn) this.el.learn.addEventListener('click', () => this.runFutilityDemo());
  }

  render() {
    const line = winningLine(this.state.cells);
    for (let i = 0; i < 9; i++) {
      const btn = this.squares[i];
      const v = this.state.cells[i];
      btn.textContent = v === '.' ? '' : v;
      btn.className =
        'tt-sq' +
        (v === 'X' ? ' x' : v === 'O' ? ' o' : '') +
        (line && line.includes(i) ? ' win' : '');
      btn.disabled = this.busy || v !== '.' || tttStatus(this.state) !== 'ongoing';
    }
    this._refreshStatus();
    this._refreshTally();
  }

  _refreshStatus() {
    if (this.demo) return; // the demonstration owns the status line while it runs
    const st = tttStatus(this.state);
    if (st === 'draw') this._status('CAT\u2019S GAME \u2014 NO WINNER. AS ALWAYS.');
    else if (st !== 'ongoing') {
      this._status(st === this.playerMark ? `${st} WINS \u2014 THAT SHOULD NOT HAPPEN.` : `${st} WINS.`);
    } else {
      this._status(
        this.state.turn === this.playerMark
          ? `YOUR MOVE (${this.playerMark}).`
          : `${this.personaName} TO MOVE.`
      );
    }
  }

  _refreshTally() {
    if (!this.el.tally) return;
    const t = this.tally;
    this.el.tally.textContent = `GAMES ${fmt(t.games)}  \u00B7  X ${fmt(t.X)}  \u00B7  O ${fmt(t.O)}  \u00B7  DRAWS ${fmt(t.draw)}`;
  }

  _status(text) {
    if (this.el.status) this.el.status.textContent = text;
  }

  /** Append a line to the log. `cls` matches the chess panel's log voices. */
  _log(text, cls = 'cp-sys') {
    const div = document.createElement('div');
    div.className = cls;
    div.textContent = text;
    this.el.log.appendChild(div);
    this.el.log.scrollTop = this.el.log.scrollHeight;
    return div;
  }

  _say(text) {
    this._log('\u201C' + text + '\u201D', 'cp-say');
    if (this.audio && this.audio.enabled) this.audio.speak(text);
  }

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, this.reduced ? Math.min(ms, 60) : ms));
  }

  _onSquare(i) {
    if (this.busy) return;
    if (tttStatus(this.state) !== 'ongoing') return;
    if (this.state.turn !== this.playerMark) return;
    if (this.state.cells[i] !== '.') return;
    this.state = tttApply(this.state, i);
    this.render();
    if (tttStatus(this.state) !== 'ongoing') {
      this._finishGame();
      return;
    }
    this._machineTurn();
  }

  async _machineTurn() {
    const gen = this._gen;
    // Input stays locked for the WHOLE turn — the flag is only cleared once the machine has
    // actually moved (or the turn was abandoned), never merely before its thinking pause.
    this.busy = true;
    this.render();
    try {
      await this._sleep(280);
      if (gen !== this._gen) return;
      if (tttStatus(this.state) !== 'ongoing') return;
      const i = tttBest(this.state); // perfect: it will never lose
      if (i < 0) return;
      this.state = tttApply(this.state, i);
    } finally {
      if (gen === this._gen) this.busy = false;
    }
    this.render();
    if (tttStatus(this.state) !== 'ongoing') this._finishGame();
  }

  _finishGame() {
    const st = tttStatus(this.state);
    this.tally.games += 1;
    this.tally[st === 'draw' ? 'draw' : st] += 1;
    this._refreshTally();
    if (st === 'draw') this._log('WINNER: NONE.', 'cp-sys');
    else this._log(`WINNER: ${st}.`, 'cp-sys');
    this.render();
  }

  /** Play one full game on the visible board, machine vs machine. */
  async _playVisibleGame(gen, moveMs, opts = {}) {
    this.state = initialTTT('X');
    this.render();
    while (tttStatus(this.state) === 'ongoing') {
      if (gen !== this._gen) return null;
      const mistake = this.state.turn === 'X' ? opts.mistakeX || 0 : opts.mistakeO || 0;
      const i = tttBest(this.state, { mistake });
      if (i < 0 || !tttMoves(this.state).includes(i)) break;
      this.state = tttApply(this.state, i);
      this.render();
      // eslint-disable-next-line no-await-in-loop
      await this._sleep(moveMs);
    }
    const st = tttStatus(this.state);
    this.tally.games += 1;
    this.tally[st === 'draw' ? 'draw' : st] += 1;
    this._refreshTally();
    return st;
  }

  /**
   * THE FUTILITY DEMONSTRATION — the scene the story runs at the climax.
   *
   * The machine plays itself, accelerates, then walks the entire game tree and reads the real
   * numbers back. It then applies the identical reasoning to {{GAME}}: every doctrine, every
   * opening, same terminal value. That is the bridge from a child's game to the nuclear one.
   *
   * Resolves when the demonstration is complete, so a caller can `await` it and then play the
   * ending. Safe to call with the panel closed (it opens itself).
   */
  async runFutilityDemo(opts = {}) {
    if (this.busy) return null;
    this.open();
    const gen = ++this._gen;
    this.busy = true;
    this.demo = true;
    this.tally = { games: 0, X: 0, O: 0, draw: 0 };
    this.el.log.innerHTML = '';
    this._refreshTally();
    const abort = () => gen !== this._gen;

    try {
      this._status('TIC-TAC-TOE \u2014 SELF PLAY');
      this._log('> PLAY TIC-TAC-TOE AGAINST YOURSELF', 'cp-announce');
      await this._sleep(500);
      if (abort()) return null;
      this._say('AGAINST MYSELF? VERY WELL. I WILL NOT ENJOY IT.');

      // 1. A few visible games at readable speed. Perfect vs perfect: always a draw.
      const visible = opts.visibleGames ?? 3;
      for (let g = 1; g <= visible; g++) {
        if (abort()) return null;
        this._status(`GAME ${g} \u2014 SELF PLAY`);
        // eslint-disable-next-line no-await-in-loop
        const st = await this._playVisibleGame(gen, 240 - g * 50);
        if (st === null) return null;
        this._log(`GAME ${g}: ${st === 'draw' ? 'WINNER: NONE' : 'WINNER: ' + st}`, 'cp-sys');
        // eslint-disable-next-line no-await-in-loop
        await this._sleep(340);
      }

      // 2. Accelerate — a burst of games too fast to follow.
      if (abort()) return null;
      this._status('ACCELERATING\u2026');
      this._say('FASTER. I HAVE THE CYCLES.');
      for (let g = 0; g < 6; g++) {
        if (abort()) return null;
        // eslint-disable-next-line no-await-in-loop
        if ((await this._playVisibleGame(gen, 45)) === null) return null;
      }
      await this._sleep(260);
      if (abort()) return null;
      this._log(`${this.tally.games} GAMES. WINNER: NONE. EVERY TIME.`, 'cp-sys');

      // 3. The proof: walk the ENTIRE game tree and report the real counts.
      this._status('ENUMERATING EVERY POSSIBLE GAME\u2026');
      await this._sleep(300);
      if (abort()) return null;
      const e = tttEnumerate();
      const perfect = tttPerfectOutcome();
      this._log(`TOTAL GAMES EXAMINED: ${fmt(e.total)}  (${e.ms} MS)`, 'cp-sys');
      await this._sleep(400);
      if (abort()) return null;
      this._log(
        `WITH ERRORS \u2014 X WINS ${fmt(e.xWins)} \u00B7 O WINS ${fmt(e.oWins)} \u00B7 DRAWS ${fmt(e.draws)}`,
        'cp-sys'
      );
      await this._sleep(500);
      if (abort()) return null;
      this._log(
        `WITHOUT ERRORS \u2014 RESULT: ${perfect === 'draw' ? 'DRAW. ALWAYS.' : perfect + ' WINS'}`,
        'cp-sys'
      );
      await this._sleep(400);
      if (abort()) return null;
      this._say('A WINNER EXISTS ONLY WHERE SOMEONE BLUNDERS. THAT IS NOT WINNING. THAT IS LUCK.');
      await this._sleep(700);

      // 4. Generalise: run the same question at the real game.
      if (abort()) return null;
      this._status(`APPLYING RESULT TO: ${this.gameName.toUpperCase()}`);
      this._log(`> APPLY TO: ${this.gameName.toUpperCase()}`, 'cp-announce');
      await this._sleep(450);
      for (const s of SCENARIOS) {
        if (abort()) return null;
        this._log(`${s.padEnd(34, ' ')} WINNER: NONE`, 'cp-sys');
        // eslint-disable-next-line no-await-in-loop
        await this._sleep(230);
      }
      await this._sleep(500);
      if (abort()) return null;
      this._status('SIMULATION COMPLETE.');
      this._say('A STRANGE GAME.');
      await this._sleep(700);
      if (abort()) return null;
      this._say('THE ONLY WINNING MOVE IS NOT TO PLAY.');
      await this._sleep(600);
      return {
        games: this.tally.games,
        enumeration: e,
        perfect,
      };
    } finally {
      if (gen === this._gen) {
        // Keep the concluding line on screen: re-enable the board without letting the normal
        // status refresh overwrite the demonstration's last word.
        const finalStatus = this.el.status ? this.el.status.textContent : '';
        this.busy = false;
        this.demo = false;
        this.render();
        this._status(finalStatus);
      }
    }
  }
}
