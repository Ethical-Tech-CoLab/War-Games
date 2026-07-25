// terminal.js
// The terminal "view": typewriter output, DEFCON display, choice buttons (clickable or
// number-keyed), and free-text prompts. It knows nothing about game logic — the engine
// drives it. All methods that produce output are async so the engine can await pacing.

import { SETTINGS } from './config.js';

export class Terminal {
  constructor(root) {
    this.root = root;
    this.scroller = root.querySelector('#terminal'); // the serial scroll flow
    this.output = root.querySelector('#output');
    this.choicesEl = root.querySelector('#choices');
    this.inputRow = root.querySelector('#input-row');
    this.textInput = root.querySelector('#text-input');
    this.inputMode = root.querySelector('#input-mode');
    this.defconValue = root.querySelector('#defcon-value');
    this.defconLadder = root.querySelector('#defcon-ladder');
    this.modeBadge = root.querySelector('#mode-badge');
    this._skip = false;
    this.audio = null;
    this._awaitingInput = false;
    this._promptResolve = null;
    this._awaitingChoice = null;
    this._suggestKey = null;
    this._voiceClasses = new Set(['system', 'alert', 'ending', 'echo', 'critical']);

    // Click anywhere fast-forwards the current typewriter line and focuses the input.
    this.output.addEventListener('click', () => {
      this._skip = true;
      if (this._awaitingInput) this.textInput.focus();
    });

    // One persistent input handler (avoids stacking listeners / double echo).
    this.textInput.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const value = this.textInput.value.trim();
      if (this._awaitingInput) {
        if (value) this._submit(value);
      } else if (this._awaitingChoice) {
        // Scripted mode: type a choice number (1..N) and press Enter.
        const n = parseInt(value, 10);
        if (n >= 1 && n <= this._awaitingChoice.count) {
          this.textInput.value = '';
          const pick = this._awaitingChoice.pick;
          pick(n - 1);
        }
      }
    });

    this._buildLadder();
  }

  setAudio(audio) {
    this.audio = audio;
  }

  clear() {
    this.output.innerHTML = '';
    if (this.audio) this.audio.stopSpeech();
  }

  setMode(label) {
    this.modeBadge.textContent = label;
  }

  /** Show/clear a persistent mode tag INSIDE the command box (e.g. "LIVE AI") so the
   * operator always knows which mode the input is driving. Pass '' to clear. */
  setInputMode(label) {
    if (!this.inputMode) return;
    if (label) {
      this.inputMode.textContent = label;
      this.inputMode.hidden = false;
      this.inputRow.classList.add('has-mode');
    } else {
      this.inputMode.textContent = '';
      this.inputMode.hidden = true;
      this.inputRow.classList.remove('has-mode');
    }
  }

  _buildLadder() {
    this.defconLadder.innerHTML = '';
    // Rungs 5..1 left to right; lit rungs indicate current threat depth.
    for (let i = 5; i >= 1; i--) {
      const rung = document.createElement('span');
      rung.className = 'rung';
      rung.dataset.level = String(i);
      this.defconLadder.appendChild(rung);
    }
  }

  setDefcon(value) {
    this.defconValue.textContent = String(value);
    const rungs = this.defconLadder.querySelectorAll('.rung');
    rungs.forEach((rung) => {
      const level = Number(rung.dataset.level);
      // Light rungs from 5 down to the current level (more lit = more dangerous).
      rung.classList.toggle('on', level >= value);
    });
    // Recolor the number as it approaches war.
    const color = value <= 2 ? 'var(--red)' : value <= 3 ? 'var(--amber)' : 'var(--fg)';
    this.defconValue.style.color = color;
  }

  /** Append a fully-typed line instantly (no animation). */
  printInstant(text, cls = 'system') {
    const div = document.createElement('div');
    div.className = `line ${cls}`;
    div.textContent = text;
    this.output.appendChild(div);
    this._scroll();
    if (this.onLine) this.onLine(text, cls);
    return div;
  }

  /** Type a line character-by-character. Click to skip to the end of the line.
   * opts.ai=true marks the line as model-generated (adds a single-character gutter marker
   * so a builder can instantly tell AI output from scripted/authored output). */
  async typeLine(text, cls = 'system', opts = {}) {
    if (text === '') {
      this.printInstant('\u00a0', cls);
      return;
    }
    // Speak the machine's lines (not narrator/user) if audio is on. `cls` may hold several
    // classes (e.g. "system ai"), so test each token against the voice set.
    const clsTokens = String(cls).split(/\s+/).filter(Boolean);
    if (this.audio && clsTokens.some((c) => this._voiceClasses.has(c))) this.audio.speak(text);

    const div = document.createElement('div');
    div.className = `line ${cls}`;
    if (opts.ai) {
      div.classList.add('ai');
      div.dataset.aiMarker = (SETTINGS.ui && SETTINGS.ui.aiMarkerChar) || '\u25C6';
    }
    this.output.appendChild(div);

    const speed = SETTINGS.typewriterSpeed;
    this._skip = false;
    for (let i = 0; i < text.length; i++) {
      if (this._skip) {
        div.textContent = text;
        break;
      }
      div.textContent = text.slice(0, i + 1);
      this._scroll();
      // Punctuation gets a slightly longer beat for rhythm.
      const ch = text[i];
      const delay = '.,!?'.includes(ch) ? speed * 6 : speed;
      // eslint-disable-next-line no-await-in-loop
      await sleep(delay);
    }
    div.textContent = text;
    this._scroll();
    // Notify any mirror/broadcast listener that a line finished printing.
    if (this.onLine) this.onLine(text, cls);
  }

  /** Type a line of text into an existing element, char-by-char at typewriter speed. */
  async _typeText(el, text) {
    const speed = SETTINGS.typewriterSpeed;
    this._skip = false;
    for (let i = 0; i < text.length; i++) {
      if (this._skip) {
        el.textContent = text;
        break;
      }
      el.textContent = text.slice(0, i + 1);
      this._scroll();
      const ch = text[i];
      // eslint-disable-next-line no-await-in-loop
      await sleep('.,!?'.includes(ch) ? speed * 6 : speed);
    }
    el.textContent = text;
    this._scroll();
  }

  /** Render choice options as a list that fills at TYPING speed (a list is no faster than a
   * prompt). Resolves with the chosen index. Supports number keys and typing the number. */
  choose(choices) {
    this.choicesEl.innerHTML = '';
    return new Promise((resolve) => {
      const pick = (idx) => {
        document.removeEventListener('keydown', onKey);
        this._awaitingChoice = null;
        this.choicesEl.innerHTML = '';
        this.hideInput();
        resolve(idx);
      };
      const onKey = (e) => {
        // Ignore digit shortcuts while the user is typing in the input field.
        if (document.activeElement === this.textInput) return;
        const n = Number(e.key);
        if (n >= 1 && n <= choices.length) {
          pick(n - 1);
        }
      };
      document.addEventListener('keydown', onKey);

      // Reveal each option at typing speed, one after another.
      (async () => {
        for (let idx = 0; idx < choices.length; idx++) {
          const btn = document.createElement('button');
          btn.className = 'choice-btn';
          btn.type = 'button';
          btn.innerHTML = `<span class="num">${idx + 1}.</span> <span class="lbl"></span>`;
          btn.addEventListener('click', () => pick(idx));
          this.choicesEl.appendChild(btn);
          // eslint-disable-next-line no-await-in-loop
          await this._typeText(btn.querySelector('.lbl'), choices[idx].label);
        }
        // Now show the entry cursor for a typed selection.
        this._awaitingChoice = { count: choices.length, pick };
        this.inputRow.hidden = false;
        this.textInput.placeholder = `TYPE 1-${choices.length} (OR CLICK ABOVE) AND PRESS ENTER`;
        this.textInput.value = '';
        this.textInput.focus();
        this._scroll();
      })();
    });
  }

  /**
   * A tense, timed choice: options appear instantly under a live countdown; resolves with
   * { index, timedOut } — on timeout it auto-picks defaultIdx. Cancelable via
   * cancelActiveChoice() (used by the intro SKIP). Number keys / clicks also pick.
   */
  chooseTimed(choices, { seconds = 12, defaultIdx = choices.length - 1, onTick } = {}) {
    this.choicesEl.innerHTML = '';
    return new Promise((resolve) => {
      let remaining = seconds;
      let timer = null;
      const finish = (index, timedOut) => {
        document.removeEventListener('keydown', onKey);
        clearInterval(timer);
        this._activeChoiceCancel = null;
        this.choicesEl.innerHTML = '';
        this.hideInput();
        resolve({ index, timedOut });
      };
      const onKey = (e) => {
        if (document.activeElement === this.textInput) return;
        const n = Number(e.key);
        if (n >= 1 && n <= choices.length) finish(n - 1, false);
      };
      document.addEventListener('keydown', onKey);
      this._activeChoiceCancel = (index) => finish(index, false);

      const clockLine = document.createElement('div');
      clockLine.className = 'line alert';
      this.output.appendChild(clockLine);
      const renderClock = () => {
        clockLine.textContent = `> ${String(Math.max(0, remaining)).padStart(2, '0')} SECONDS TO COMPLY`;
      };
      renderClock();

      choices.forEach((c, idx) => {
        const btn = document.createElement('button');
        btn.className = 'choice-btn';
        btn.type = 'button';
        const num = document.createElement('span');
        num.className = 'num';
        num.textContent = `${idx + 1}.`;
        const lbl = document.createElement('span');
        lbl.className = 'lbl';
        lbl.textContent = c.label;
        btn.append(num, document.createTextNode(' '), lbl);
        btn.addEventListener('click', () => finish(idx, false));
        this.choicesEl.appendChild(btn);
      });
      this._scroll();

      timer = setInterval(() => {
        remaining -= 1;
        if (onTick) onTick(remaining);
        if (remaining <= 0) {
          clockLine.textContent = '> TIME EXPIRED';
          finish(defaultIdx, true);
          return;
        }
        renderClock();
      }, 1000);
    });
  }

  /** Force-resolve an active chooseTimed (e.g. the SKIP button). No-op if none active. */
  cancelActiveChoice(index = 0) {
    if (this._activeChoiceCancel) this._activeChoiceCancel(index);
  }

  /**
   * Show a persistent, typeable input line; resolve with the entered string.
   * The typed line is echoed exactly once (here), so callers must NOT echo again.
   * @param {string} placeholder hint text shown in the input
   */
  prompt(placeholder = 'TYPE A COMMAND AND PRESS ENTER') {
    return new Promise((resolve) => {
      this._promptResolve = resolve;
      this._awaitingInput = true;
      this.inputRow.hidden = false;
      this.textInput.placeholder = placeholder;
      this.textInput.value = '';
      this.textInput.focus();
    });
  }

  _submit(value) {
    if (!this._awaitingInput) return;
    this._awaitingInput = false;
    this.printInstant(`> ${value}`, 'user'); // single echo
    this.textInput.value = '';
    // NOTE: suggestions are intentionally NOT cleared here so they persist across turns
    // (they were typed in once) instead of re-animating every prompt.
    const r = this._promptResolve;
    this._promptResolve = null;
    if (r) r(value);
  }

  hideInput() {
    this._awaitingInput = false;
    this.inputRow.hidden = true;
    this.setInputMode('');
    this.clearSuggestions();
  }

  /**
   * Render clickable suggestion chips (guardrails). Clicking one submits it as input.
   * @param {Array<{label:string,value:string}>} items
   */
  setSuggestions(items) {
    // Type the list in ONCE at typewriter speed, then keep it (a list is no faster than a
    // prompt). If the same set is requested again, leave it as-is instead of re-animating.
    const key = (items || []).map((i) => i.label).join('|');
    if (key === this._suggestKey && this.choicesEl.children.length) return;
    this._suggestKey = key;
    this.choicesEl.innerHTML = '';
    if (!items || !items.length) return;
    const hint = document.createElement('div');
    hint.className = 'suggest-hint';
    this.choicesEl.appendChild(hint);
    const build = async () => {
      await this._typeText(hint, 'SUGGESTED COMMANDS (click or type your own):');
      for (const it of items) {
        // Bail out if the suggestion set changed mid-animation.
        if (this._suggestKey !== key) return;
        const btn = document.createElement('button');
        btn.className = 'choice-btn suggest';
        btn.type = 'button';
        btn.innerHTML = '<span class="lbl"></span>';
        btn.addEventListener('click', () => {
          if (this._awaitingInput) this._submit(it.value);
        });
        this.choicesEl.appendChild(btn);
        // eslint-disable-next-line no-await-in-loop
        await this._typeText(btn.querySelector('.lbl'), it.label);
      }
    };
    build();
  }

  clearSuggestions() {
    this.choicesEl.innerHTML = '';
    this._suggestKey = null;
  }

  playModem() {
    return this.audio ? this.audio.playModem() : Promise.resolve();
  }

  /** Toggle the slow CRT "refresh roll" band (used in berserk mode). */
  setRolling(on) {
    this.root.classList.toggle('rolling', !!on);
  }

  /** Briefly glitch/tear the screen (RGB skew), then recover. */
  glitchPulse(ms = 280) {
    this.root.classList.add('glitch');
    setTimeout(() => this.root.classList.remove('glitch'), ms);
  }

  _scroll() {
    // Scroll the serial flow so the newest line (and the cursor) stays visible.
    if (this.scroller) this.scroller.scrollTop = this.scroller.scrollHeight;
    else this.output.scrollTop = this.output.scrollHeight;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
