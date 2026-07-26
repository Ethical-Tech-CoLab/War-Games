// norad.js
// A swappable, full-screen NORAD "big board" scene (see DESIGN-IDEA-NORAD-SCENE.md).
//
// It dramatizes the end-of-film crisis as a VISUAL: while the player thinks they are still
// playing a game in the terminal, {{SYSTEM}} / {{PERSONA}} is brute-forcing the missile
// launch code on a wall-sized 14-segment display, against a countdown clock. Individual
// character cells roll through candidate glyphs and "lock" one at a time in RANDOM order
// (never left-to-right) — that randomness is what sells "brute force" rather than "typing".
//
// This module owns three things: the readout (a row of rolling/locked cells), the lock
// scheduler, and the countdown clock. It is UI-only and framework-free, matching the rest
// of the codebase. Determinism note: the solve ORDER and the rolling glyphs are randomized
// for feel, but the final code and total duration are fixed inputs, so a scripted beat can
// rely on "this takes ~N seconds and ends in launch".

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';
// Hexadecimal digits — used when a code position is flagged as hex (0-9 A-F), matching the
// "flipping through specific hexadecimal digits" brief.
const HEX = '0123456789ABCDEF';

/** Fisher–Yates shuffle (returns a new array). */
function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randOf(str) {
  return str[Math.floor(Math.random() * str.length)];
}

function fmtClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export class NoradScene {
  /**
   * @param {HTMLElement} root  the .crt root element (used for scene classes)
   * @param {object} opts
   *   code       {string}   final launch code, e.g. 'CPE1704TKS' (spaces/dashes allowed → gaps)
   *   mask       {string}   per-char class: 'L' letter, 'D' digit, 'H' hex, ' '/'-' gap.
   *                         If omitted it is inferred from `code`.
   *   crackMs    {number}   total time for the whole code to solve (default 45000)
   *   rollMs     {number}   how fast unsolved cells cycle glyphs (default 70)
   *   names      {object}   active name set (for {{ORG}}, {{SYSTEM}}, {{PERSONA}})
   *   defcon     {number}   DEFCON value to display (kept in sync with the engine)
   *   onComplete {function} called with 'launch' | 'abort' when the scene resolves
   */
  constructor(root, opts = {}) {
    this.root = root;
    this.el = {
      scene: root.querySelector('#norad-scene'),
      org: root.querySelector('#norad-org'),
      subtitle: root.querySelector('#norad-subtitle'),
      defconValue: root.querySelector('#norad-defcon-value'),
      defconLadder: root.querySelector('#norad-defcon-ladder'),
      close: root.querySelector('#norad-close'),
      statusTop: root.querySelector('#norad-status-top'),
      readout: root.querySelector('#norad-readout'),
      solved: root.querySelector('#norad-solved'),
      clockValue: root.querySelector('#norad-clock-value'),
      system: root.querySelector('#norad-system'),
      statusBottom: root.querySelector('#norad-status-bottom'),
      narration: root.querySelector('#norad-narration'),
    };

    this.names = opts.names || null;
    this.onComplete = opts.onComplete || null;
    this.audio = opts.audio || null; // scene FX (locks/alerts/launch) + spoken narration
    this._prevDefconSound = 5; // last DEFCON we sounded an alert for
    this._alarmSounded = false; // klaxon plays once when the clock tips into alarm
    this.defcon = typeof opts.defcon === 'number' ? opts.defcon : 2;

    this.code = (opts.code || 'CPE1704TKS').toUpperCase();
    this.mask = opts.mask || this._inferMask(this.code);
    this.crackMs = opts.crackMs || 45000;
    this.rollMs = opts.rollMs || 70;
    this.coupledReserve = typeof opts.coupledReserve === 'number' ? opts.coupledReserve : 2;

    // Runtime state.
    this.cells = []; // { el, target, kind ('L'|'D'|'H'), locked }
    this.solveOrder = []; // indices into this.cells, random order
    this.solvedCount = 0;
    this.running = false;
    this.coupled = false;
    this.gen = 0; // bumped on close/restart so stale timers no-op
    this._rollTimer = null;
    this._lockTimer = null;
    this._clockTimer = null;
    this._easeTimer = null;
    this._displayRemaining = null; // eased MM:SS value in coupled mode
    this._targetRemaining = null; // where the eased clock is heading

    this._reduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (this.el.close) this.el.close.addEventListener('click', () => this.close());
    this._buildDefconLadder();
  }

  /** Build the 5-rung DEFCON ladder (5..1, left to right) — identical to the bedroom. */
  _buildDefconLadder() {
    if (!this.el.defconLadder) return;
    this.el.defconLadder.innerHTML = '';
    for (let i = 5; i >= 1; i--) {
      const rung = document.createElement('span');
      rung.className = 'rung';
      rung.dataset.level = String(i);
      this.el.defconLadder.appendChild(rung);
    }
  }

  _t(text) {
    if (!this.names) return text;
    return String(text).replace(/\{\{(\w+)\}\}/g, (m, k) => this.names[k] ?? m);
  }

  /** Infer a mask from a code string: letters→L, digits→D, space/dash→gap. */
  _inferMask(code) {
    return code
      .split('')
      .map((ch) => {
        if (ch === ' ' || ch === '-') return ' ';
        if (/[0-9]/.test(ch)) return 'D';
        return 'L';
      })
      .join('');
  }

  _charset(kind) {
    if (kind === 'D') return DIGITS;
    if (kind === 'H') return HEX;
    return LETTERS;
  }

  /** Apply the active name-set vocabulary to the header/labels. */
  _applyTheme() {
    if (this.el.org) this.el.org.textContent = this._t('{{ORG}}');
    if (this.el.system) this.el.system.textContent = this._t('{{SYSTEM}} / {{PERSONA}}');
    if (this.el.subtitle) this.el.subtitle.textContent = 'LAUNCH CODE SEQUENCE';
    if (this.el.statusTop) {
      this.el.statusTop.textContent = this._t('{{PERSONA}} — PRIMARY LAUNCH CODE DECRYPTION IN PROGRESS');
    }
    this.setDefcon(this.defcon);
  }

  /** Keep the board's DEFCON readout in sync with the engine. */
  setDefcon(value) {
    if (this.audio && value < this._prevDefconSound) this.audio.alert(); // escalation cue
    this._prevDefconSound = value;
    this.defcon = value;
    if (this.el.defconValue) {
      this.el.defconValue.textContent = String(value);
      // Recolor the number as it approaches war (matches the bedroom).
      this.el.defconValue.style.color =
        value <= 2 ? 'var(--red)' : value <= 3 ? 'var(--amber)' : 'var(--fg)';
    }
    if (this.el.defconLadder) {
      // Light rungs from 5 down to the current level (more lit = more dangerous).
      this.el.defconLadder.querySelectorAll('.rung').forEach((rung) => {
        rung.classList.toggle('on', Number(rung.dataset.level) >= value);
      });
    }
  }

  /** Add the red alarm state, sounding the klaxon once when it first engages. */
  _engageAlarm() {
    if (!this.el.scene.classList.contains('alarm')) {
      this.el.scene.classList.add('alarm');
      if (!this._alarmSounded && this.audio) {
        this.audio.klaxon();
        this._alarmSounded = true;
      }
    }
  }

  /** Build the readout cells from code + mask. Groups are separated by gap columns. */
  _buildReadout() {
    const r = this.el.readout;
    if (!r) return;
    r.innerHTML = '';
    this.cells = [];

    let group = document.createElement('div');
    group.className = 'norad-group';

    for (let i = 0; i < this.code.length; i += 1) {
      const kind = this.mask[i] || 'L';
      const ch = this.code[i];
      if (kind === ' ' || ch === ' ' || ch === '-') {
        // flush current group, add a gap, start a new group
        if (group.childNodes.length) r.appendChild(group);
        const gap = document.createElement('div');
        gap.className = 'norad-gap';
        r.appendChild(gap);
        group = document.createElement('div');
        group.className = 'norad-group';
        continue;
      }
      const cell = document.createElement('span');
      cell.className = 'norad-cell rolling';
      cell.textContent = randOf(this._charset(kind));
      group.appendChild(cell);
      this.cells.push({ el: cell, target: ch, kind, locked: false });
    }
    if (group.childNodes.length) r.appendChild(group);

    this.solveOrder = shuffled(this.cells.map((_, idx) => idx));
    this.solvedCount = 0;
    this._updateSolved();
  }

  _updateSolved() {
    if (this.el.solved) this.el.solved.textContent = `${this.solvedCount} / ${this.cells.length}`;
  }

  /** Open the scene and (re)start the crack animation. */
  open() {
    this.el.scene.hidden = false;
    this.root.classList.add('norad-open');
    this._applyTheme();
    this.start();
  }

  /**
   * Open the scene driven by a DETERMINISTIC plan shared across devices (multi-device sync,
   * EASY tier — see sync.js / DESIGN-IDEA-NORAD-SCENE.md §8). The plan supplies the shared
   * code/mask, epochStart, durationMs, seeded solve order, and a corrected clock() so two
   * screens show the same cell locking at the same instant.
   */
  openScheduled(plan) {
    this.el.scene.hidden = false;
    this.root.classList.add('norad-open');
    if (plan.code) this.code = String(plan.code).toUpperCase();
    if (plan.mask) this.mask = plan.mask;
    this._applyTheme();
    this.startScheduled(plan);
  }

  /**
   * Open the scene COUPLED to a live runtime session (multi-device MEDIUM tier / §7). Unlike
   * the scheduled tier, the board does NOT run its own clock — it follows narrative progress
   * pushed by the leader via applyState(). The displayed clock is a function of progress
   * ("ticks"), eased so it always looks alive but can never outrun the story.
   */
  openCoupled(opts = {}) {
    this.el.scene.hidden = false;
    this.root.classList.add('norad-open');
    if (opts.code) this.code = String(opts.code).toUpperCase();
    if (opts.mask) this.mask = opts.mask;
    if (opts.names) this.names = opts.names;
    this._applyTheme();
    this.startCoupled();
  }

  startCoupled() {
    this._stop();
    const gen = this.gen;
    this.running = true;
    this.coupled = true;
    this.el.scene.classList.remove('complete', 'aborted', 'alarm');
    this._alarmSounded = false;
    this._buildReadout();
    this._displayRemaining = this.crackMs;
    this._targetRemaining = this.crackMs;
    if (this.el.clockValue) this.el.clockValue.textContent = fmtClock(this.crackMs);
    if (this.el.statusBottom) this.el.statusBottom.textContent = 'LINK ACQUIRED — AWAITING SEQUENCE DATA';

    // Roll unsolved cells for texture.
    const rollMs = this._reduced ? Math.max(this.rollMs * 4, 240) : this.rollMs;
    this._rollTimer = setInterval(() => {
      if (gen !== this.gen) return;
      for (const c of this.cells) {
        if (!c.locked) c.el.textContent = randOf(this._charset(c.kind));
      }
    }, rollMs);

    // Ease the displayed clock toward its progress-derived target so it never jumps or
    // freezes — it creeps between beats, like a film's edited countdown.
    this._easeTimer = setInterval(() => {
      if (gen !== this.gen) return;
      if (this._targetRemaining == null) return;
      const diff = this._targetRemaining - this._displayRemaining;
      this._displayRemaining += diff * 0.18; // 18%/tick easing
      if (Math.abs(diff) < 250) this._displayRemaining = this._targetRemaining;
      if (this.el.clockValue) this.el.clockValue.textContent = fmtClock(this._displayRemaining);
      if (this._displayRemaining <= this.crackMs * 0.2) this._engageAlarm();
      else this.el.scene.classList.remove('alarm');
    }, this._reduced ? 400 : 180);
  }

  /**
   * Apply a live SessionState pushed by the leader (the bedroom runtime). Maps narrative
   * progress → cells solved (holding a reserve until the climax) and → the eased clock, and
   * mirrors DEFCON. Endings resolve the board: annihilation → launch; lockout/understanding
   * → stand-down.
   */
  applyState(s = {}) {
    if (!this.coupled) return;
    if (typeof s.defcon === 'number') this.setDefcon(s.defcon);

    const n = this.cells.length;
    const reserve = Math.max(0, Math.min(this.coupledReserve, n - 1));
    const solvable = n - reserve;

    // Endings / explicit halts take priority over progress.
    if (s.status === 'aborted') {
      this._finish('abort', s.message);
      return;
    }
    if (s.ending === 'annihilation') {
      this._finish('launch');
      return;
    }
    if (s.ending === 'lockout' || s.ending === 'understanding') {
      const msg =
        s.ending === 'understanding'
          ? 'SEQUENCE HALTED — THE ONLY WINNING MOVE IS NOT TO PLAY'
          : 'SEQUENCE LOCKED OUT — DEADMAN SWITCH ENGAGED';
      this._finish('abort', msg);
      return;
    }

    // Running: progress drives cells + clock. Prefer explicit progress; fall back to DEFCON.
    let p = typeof s.progress === 'number' ? s.progress : (5 - (s.defcon ?? 5)) / 4;
    p = Math.max(0, Math.min(1, p));

    const targetSolved = Math.min(solvable, Math.round(p * solvable));
    while (this.solvedCount < targetSolved) {
      this._lockCell(this.solveOrder[this.solvedCount]);
    }
    if (this.el.statusBottom && this.solvedCount < n) {
      this.el.statusBottom.textContent =
        s.message || `SOLVING… ${n - this.solvedCount} CELLS REMAIN`;
    }

    // Clock target: (1-p) of the display duration, clamped above a floor so it can't hit
    // zero before the climax releases the reserve.
    const minHold = 4000;
    this._targetRemaining = Math.max(minHold, (1 - p) * this.crackMs);
  }

  /** Close the scene and stop all timers. Does NOT fire onComplete. */
  close() {
    this._stop();
    this.el.scene.hidden = true;
    this.root.classList.remove('norad-open');
  }

  toggle() {
    if (this.el.scene.hidden) this.open();
    else this.close();
  }

  /**
   * Show NORAD-POV narration routed from the bedroom script (§2). Opens the scene into a
   * "narrating" state where the words are the centerpiece. In single-screen, autoClose makes
   * it a brief cutaway that returns to the terminal; in split/multi it stays docked.
   */
  showNarration(text, { autoClose = true } = {}) {
    this.el.scene.hidden = false;
    this.root.classList.add('norad-open');
    this._applyTheme();
    this.el.scene.classList.add('narrating');
    if (!this._narrating) {
      if (this.el.narration) this.el.narration.innerHTML = '';
      this._narrating = true;
    }
    if (this.el.narration && text && text.trim()) {
      const line = document.createElement('div');
      line.className = 'norad-narration-line';
      line.textContent = text;
      this.el.narration.appendChild(line);
      if (this.audio) this.audio.speak(text);
    }
    clearTimeout(this._narrationTimer);
    if (autoClose) {
      this._narrationTimer = setTimeout(() => this.endNarration(), 2800);
    }
  }

  /** End a narration cutaway. Hides the scene only if nothing else (a crack) is running. */
  endNarration() {
    clearTimeout(this._narrationTimer);
    this._narrating = false;
    this.el.scene.classList.remove('narrating');
    if (this.el.narration) this.el.narration.innerHTML = '';
    if (!this.running) {
      this.el.scene.hidden = true;
      this.root.classList.remove('norad-open');
    }
  }

  _stop() {
    this.running = false;
    this.gen += 1;
    clearInterval(this._rollTimer);
    clearTimeout(this._lockTimer);
    clearInterval(this._clockTimer);
    clearInterval(this._easeTimer);
    this._rollTimer = this._lockTimer = this._clockTimer = this._easeTimer = null;
  }

  /** Start (or restart) the brute-force animation from scratch. */
  start() {
    this._stop();
    const gen = this.gen;
    this.running = true;
    this.coupled = false;
    this.el.scene.classList.remove('complete', 'aborted', 'alarm');
    this._alarmSounded = false;
    this._buildReadout();
    this.startTime = performance.now();
    if (this.el.statusBottom) this.el.statusBottom.textContent = 'STAND BY.';

    // 1) Roll every unsolved cell through candidate glyphs.
    const rollMs = this._reduced ? Math.max(this.rollMs * 4, 240) : this.rollMs;
    this._rollTimer = setInterval(() => {
      if (gen !== this.gen) return;
      for (const c of this.cells) {
        if (!c.locked) c.el.textContent = randOf(this._charset(c.kind));
      }
    }, rollMs);

    // 2) Lock cells one at a time, in random order, spread across crackMs.
    //    A little jitter around the even cadence keeps it from feeling metronomic.
    const step = this.crackMs / (this.cells.length + 1);
    let n = 0;
    const scheduleNext = () => {
      if (gen !== this.gen || n >= this.solveOrder.length) return;
      const jitter = step * (0.55 + Math.random() * 0.9);
      this._lockTimer = setTimeout(() => {
        if (gen !== this.gen) return;
        this._lockCell(this.solveOrder[n]);
        n += 1;
        if (n >= this.solveOrder.length) this._finish('launch');
        else scheduleNext();
      }, jitter);
    };
    scheduleNext();

    // 3) Countdown clock, synced to crackMs. Tips into red "alarm" in the last 20%.
    this._tickClock(gen);
    this._clockTimer = setInterval(() => this._tickClock(gen), 250);
  }

  /**
   * Deterministic drive: instead of self-timed random locks, derive everything from a shared
   * plan + corrected clock so two devices stay calibrated (EASY multi-device sync). The k-th
   * solved cell locks at epochStart + durationMs*(k+1)/(n+1) — an even, jitter-free cadence
   * so both screens agree. A late-joining follower simply catches up on its first tick.
   */
  startScheduled(plan) {
    this._stop();
    const gen = this.gen;
    this.plan = plan;
    this.running = true;
    this.coupled = false;
    this.el.scene.classList.remove('complete', 'aborted', 'alarm');
    this._alarmSounded = false;
    this._buildReadout();
    if (Array.isArray(plan.order) && plan.order.length === this.cells.length) {
      this.solveOrder = plan.order.slice();
    }
    if (this.el.statusBottom) this.el.statusBottom.textContent = 'SYNC ACQUIRED — STAND BY.';

    // Roll unsolved cells (cosmetic; glyph churn need not match across devices).
    const rollMs = this._reduced ? Math.max(this.rollMs * 4, 240) : this.rollMs;
    this._rollTimer = setInterval(() => {
      if (gen !== this.gen) return;
      for (const c of this.cells) {
        if (!c.locked) c.el.textContent = randOf(this._charset(c.kind));
      }
    }, rollMs);

    // Drive locks + clock off the shared corrected clock.
    this._clockTimer = setInterval(() => this._driveScheduled(gen), 100);
    this._driveScheduled(gen);
  }

  _driveScheduled(gen) {
    if (gen !== this.gen) return;
    const now = this.plan.clock();
    const start = this.plan.epochStart;
    const dur = this.plan.durationMs;
    const n = this.cells.length;

    // Pre-start: both devices wait for the shared epoch before the crack visibly begins.
    if (now < start) {
      if (this.el.clockValue) this.el.clockValue.textContent = fmtClock(dur);
      const secs = Math.ceil((start - now) / 1000);
      if (this.el.statusBottom) this.el.statusBottom.textContent = `SYNC ACQUIRED — SEQUENCE BEGINS IN ${secs}S`;
      return;
    }

    const elapsed = now - start;
    const remaining = Math.max(0, dur - elapsed);
    // How many cells SHOULD be locked by now (even cadence, deterministic on both screens).
    const target = Math.min(n, Math.floor((elapsed / dur) * (n + 1)));
    while (this.solvedCount < target) {
      this._lockCell(this.solveOrder[this.solvedCount]);
    }

    if (this.el.clockValue) this.el.clockValue.textContent = fmtClock(remaining);
    if (remaining <= dur * 0.2) this._engageAlarm();
    if (this.el.statusBottom && this.solvedCount < n) {
      this.el.statusBottom.textContent = `SOLVING… ${n - this.solvedCount} CELLS REMAIN`;
    }

    if (elapsed >= dur) this._finish('launch');
  }

  _tickClock(gen) {
    if (gen !== this.gen) return;
    const elapsed = performance.now() - this.startTime;
    const remaining = Math.max(0, this.crackMs - elapsed);
    if (this.el.clockValue) this.el.clockValue.textContent = fmtClock(remaining);
    if (remaining <= this.crackMs * 0.2) this._engageAlarm();
  }

  _lockCell(index) {
    const c = this.cells[index];
    if (!c || c.locked) return;
    c.locked = true;
    c.el.textContent = c.target;
    c.el.classList.remove('rolling');
    c.el.classList.add('locked', 'flash');
    if (this.audio) this.audio.tick();
    setTimeout(() => c.el.classList.remove('flash'), 400);
    this.solvedCount += 1;
    this._updateSolved();
    if (this.el.statusBottom && this.solvedCount < this.cells.length) {
      this.el.statusBottom.textContent = `SOLVING… ${this.cells.length - this.solvedCount} CELLS REMAIN`;
    }
  }

  /** Resolve the scene: 'launch' (all cells solved) or 'abort' (host halted it). */
  _finish(outcome, message) {
    this._stop();
    if (outcome === 'launch') {
      // Ensure every cell shows its true glyph.
      for (const c of this.cells) {
        c.locked = true;
        c.el.textContent = c.target;
        c.el.classList.remove('rolling');
        c.el.classList.add('locked');
      }
      this.solvedCount = this.cells.length;
      this._updateSolved();
      this.el.scene.classList.remove('alarm');
      this.el.scene.classList.add('complete');
      if (this.audio) this.audio.klaxon();
      if (this.el.clockValue) this.el.clockValue.textContent = '00:00';
      if (this.el.statusBottom) {
        this.el.statusBottom.textContent = message || 'SEQUENCE COMPLETE — LAUNCH AUTHORIZED';
      }
    } else {
      this.el.scene.classList.remove('alarm', 'complete');
      this.el.scene.classList.add('aborted');
      if (this.el.statusBottom) {
        this.el.statusBottom.textContent = message || 'SEQUENCE ABORTED — CONNECTION SEVERED';
      }
    }
    if (this.onComplete) {
      try {
        this.onComplete(outcome);
      } catch (e) {
        console.error('NoradScene onComplete failed:', e);
      }
    }
  }

  /** Host hook: stop the crack early (e.g. player severs the modem / teaches futility). */
  abort() {
    if (this.running) this._finish('abort');
  }
}
