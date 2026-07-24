// audio.js
// All sound is SYNTHESIZED at runtime (WebAudio) or spoken via the browser's speech engine —
// no copyrighted audio from the film is used. Provides:
//   - playModem(): a dial-tone → DTMF dialing → carrier-handshake "screech" (the connect FX)
//   - speak(text): a machine/terminal voice for the system's lines (Joshua-style, robotic)
//   - a single enable/disable toggle for all audio
//
// Autoplay policy: browsers require a user gesture before audio. Call unlock() from a click
// (the CONNECT button) before playing anything.

export class AudioFx {
  constructor() {
    this.enabled = true; // master toggle (modem + voice)
    this.ctx = null;
    this._voice = null;
    this._voicesReady = false;
    if (typeof speechSynthesis !== 'undefined') {
      const load = () => {
        const voices = speechSynthesis.getVoices();
        if (voices.length) {
          this._voice = pickMachineVoice(voices);
          this._voicesReady = true;
        }
      };
      load();
      speechSynthesis.addEventListener?.('voiceschanged', load);
    }
  }

  /** Must be called from a user gesture to satisfy autoplay policies. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    // Warm up speech (some engines need a first utterance).
    if (this.enabled && typeof speechSynthesis !== 'undefined') {
      try {
        const u = new SpeechSynthesisUtterance('');
        speechSynthesis.speak(u);
      } catch {
        /* ignore */
      }
    }
  }

  setEnabled(on) {
    this.enabled = !!on;
    if (!on) this.stopSpeech();
  }

  stopSpeech() {
    if (typeof speechSynthesis !== 'undefined') {
      try {
        speechSynthesis.cancel();
      } catch {
        /* ignore */
      }
    }
  }

  // ---------- Synthesized modem connect sequence ----------
  async playModem() {
    if (!this.enabled) return;
    this.unlock();
    const ctx = this.ctx;
    if (!ctx) return;

    const t0 = ctx.currentTime + 0.02;
    let t = t0;

    // 1) Handset pickup: a short click.
    this._noise(t, 0.04, 0.15, 1200);
    t += 0.15;

    // 2) Dial tone (350 + 440 Hz) for ~0.5s.
    this._tone(350, t, 0.5, 0.12, 'sine');
    this._tone(440, t, 0.5, 0.12, 'sine');
    t += 0.6;

    // 3) DTMF-style dialing: 7 quick dual-tone beeps.
    const dtmfLow = [697, 770, 852];
    const dtmfHigh = [1209, 1336, 1477];
    for (let i = 0; i < 7; i++) {
      const lo = dtmfLow[Math.floor(Math.random() * dtmfLow.length)];
      const hi = dtmfHigh[Math.floor(Math.random() * dtmfHigh.length)];
      this._tone(lo, t, 0.08, 0.1, 'square');
      this._tone(hi, t, 0.08, 0.1, 'square');
      t += 0.12;
    }
    t += 0.15;

    // 4) Ring, then the carrier handshake "screech": alternating carrier tones + noise.
    this._tone(425, t, 0.35, 0.1, 'sine'); // ring-ish
    t += 0.5;
    const carriers = [1070, 1270, 2025, 2225];
    for (let i = 0; i < 6; i++) {
      const f = carriers[i % carriers.length];
      this._tone(f, t, 0.18, 0.09, 'sawtooth');
      this._noise(t, 0.18, 0.06, 1800 + Math.random() * 1200);
      t += 0.18;
    }
    // Final locked-carrier tone that fades (connection established).
    this._tone(1800, t, 0.5, 0.06, 'sine', true);
    t += 0.5;

    // Resolve after the sequence finishes.
    const total = (t - t0) * 1000;
    await new Promise((r) => setTimeout(r, Math.min(4000, total)));
  }

  _tone(freq, start, dur, gain, type = 'sine', fadeOut = false) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + 0.01);
    if (fadeOut) g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    else {
      g.gain.setValueAtTime(gain, start + dur - 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    }
    osc.connect(g).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  _noise(start, dur, gain, filterHz) {
    const ctx = this.ctx;
    const frames = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = filterHz;
    bp.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(bp).connect(g).connect(ctx.destination);
    src.start(start);
    src.stop(start + dur);
  }

  // ---------- Machine voice ----------
  speak(text) {
    if (!this.enabled) return;
    if (typeof speechSynthesis === 'undefined') return;
    const clean = spokenText(text);
    if (!clean) return;
    const u = new SpeechSynthesisUtterance(clean);
    if (this._voice) u.voice = this._voice;
    u.pitch = 0.35; // low, machine-like
    u.rate = 0.98;
    u.volume = 0.9;
    try {
      speechSynthesis.speak(u);
    } catch {
      /* ignore */
    }
  }
}

function pickMachineVoice(voices) {
  // Prefer a deep/robotic English voice where available.
  const prefer = [
    /David/i, /Mark/i, /George/i, /Daniel/i, /Google US English/i, /Microsoft.*English/i,
  ];
  for (const rx of prefer) {
    const hit = voices.find((v) => rx.test(v.name) && /en/i.test(v.lang));
    if (hit) return hit;
  }
  return voices.find((v) => /en/i.test(v.lang)) || voices[0] || null;
}

// ---------- Acronym / initialism pronunciation ----------
// The terminal speaks in ALL CAPS, so the speech engine can't tell an acronym (US = "U. S.")
// from a word (US = "us"). We spell out uppercase initialisms LETTER BY LETTER using each
// letter's phonetic sound, while preserving genuine short words (TO, IS, WE, ...).
//
// How it decides, for an UPPERCASE token of 2+ letters:
//   1. If it's in SPELL_ALWAYS  -> always spell it out (covers 3+ letter initialisms too).
//   2. If it's exactly 2 letters and NOT in KEEP_TWO_LETTER -> spell it out (US, AI, PC, ...).
//   3. Otherwise leave it as a word (NORAD, DEFCON, JOSHUA, and real 2-letter words).
// To fix a mispronunciation, add the token to SPELL_ALWAYS, or add a real word you want
// preserved to KEEP_TWO_LETTER.

const PHONETIC = {
  A: 'ay', B: 'bee', C: 'see', D: 'dee', E: 'ee', F: 'eff', G: 'jee', H: 'aitch',
  I: 'eye', J: 'jay', K: 'kay', L: 'el', M: 'em', N: 'en', O: 'oh', P: 'pee',
  Q: 'cue', R: 'ar', S: 'ess', T: 'tee', U: 'you', V: 'vee', W: 'double-you',
  X: 'ex', Y: 'why', Z: 'zee',
};

// Initialisms that must be spelled out even though a naive reader might say them as a word
// (or that are 3+ letters). Extend this as new cases surface.
const SPELL_ALWAYS = new Set([
  'US', 'USA', 'USSR', 'USB', 'UK', 'UN', 'EU', 'UAE',
  'AI', 'ID', 'PC', 'TV', 'OS', 'IP', 'PR', 'HR', 'CEO', 'CTO',
  'CPU', 'GPU', 'RAM', 'GPS', 'DNA', 'ICBM', 'SLBM', 'FBI', 'CIA', 'NSA', 'KGB',
  'HTTP', 'HTTPS', 'URL', 'API', 'LLM', 'UI', 'UX', 'QA',
]);

// Real 2-letter words to PRESERVE (never spell out), because they read as words.
const KEEP_TWO_LETTER = new Set([
  'AM', 'AN', 'AS', 'AT', 'AH', 'AW', 'AY', 'BE', 'BY', 'DO', 'GO', 'HA', 'HE',
  'HI', 'HM', 'HO', 'IF', 'IN', 'IS', 'IT', 'MA', 'ME', 'MY', 'NO', 'OF', 'OH',
  'OK', 'ON', 'OR', 'OW', 'OX', 'PA', 'SO', 'TO', 'UH', 'UM', 'UP', 'WE', 'YE', 'YO',
]);

function spellToken(letters) {
  return String(letters)
    .toUpperCase()
    .split('')
    .map((c) => PHONETIC[c] || c)
    .join(' ');
}

/** Replace uppercase initialisms with their spoken letter sounds (US -> "you ess"). */
export function spellAcronyms(text) {
  return String(text)
    // Dotted forms first: U.S. / U.S.A. -> spell the letters.
    .replace(/\b(?:[A-Za-z]\.){2,}/g, (m) => spellToken(m.replace(/[^A-Za-z]/g, '')))
    // Plain UPPERCASE tokens of 2+ letters.
    .replace(/\b[A-Z]{2,}\b/g, (m) => {
      if (SPELL_ALWAYS.has(m)) return spellToken(m);
      if (m.length === 2 && !KEEP_TWO_LETTER.has(m)) return spellToken(m);
      return m; // longer words / names (NORAD, DEFCON, JOSHUA) read normally
    });
}

// Whole-word spoken pronunciation fixes: expand contractions (so the voice doesn't garble
// "I'll" / "you're") and respell a few words the engine gets wrong. Apostrophe is REQUIRED in
// the contraction patterns so real words like "were" are never touched. Add cases as needed.
const SPOKEN_FIXES = [
  [/\bpac[-\s]?man\b/gi, 'pack man'],
  [/\bdino\b/gi, 'dyno'],
  [/\bwe['\u2019]re\b/gi, 'we are'],
  [/\byou['\u2019]re\b/gi, 'you are'],
  [/\bthey['\u2019]re\b/gi, 'they are'],
  [/\bwho['\u2019]re\b/gi, 'who are'],
  [/\bi['\u2019]ll\b/gi, 'i will'],
  [/\byou['\u2019]ll\b/gi, 'you will'],
  [/\bwe['\u2019]ll\b/gi, 'we will'],
  [/\bhe['\u2019]ll\b/gi, 'he will'],
  [/\bshe['\u2019]ll\b/gi, 'she will'],
  [/\bit['\u2019]ll\b/gi, 'it will'],
  [/\bthey['\u2019]ll\b/gi, 'they will'],
  [/\bi['\u2019]m\b/gi, 'i am'],
  [/\bi['\u2019]ve\b/gi, 'i have'],
  [/\bwe['\u2019]ve\b/gi, 'we have'],
  [/\byou['\u2019]ve\b/gi, 'you have'],
  [/\bthey['\u2019]ve\b/gi, 'they have'],
  [/\bcan['\u2019]t\b/gi, 'cannot'],
  [/\bwon['\u2019]t\b/gi, 'will not'],
  [/\bdon['\u2019]t\b/gi, 'do not'],
  [/\bdoesn['\u2019]t\b/gi, 'does not'],
  [/\bdidn['\u2019]t\b/gi, 'did not'],
  [/\bisn['\u2019]t\b/gi, 'is not'],
  [/\baren['\u2019]t\b/gi, 'are not'],
  [/\bwasn['\u2019]t\b/gi, 'was not'],
  [/\bit['\u2019]s\b/gi, 'it is'],
  [/\bthat['\u2019]s\b/gi, 'that is'],
  [/\blet['\u2019]s\b/gi, 'let us'],
];

function applySpokenFixes(text) {
  let t = String(text);
  for (const [re, rep] of SPOKEN_FIXES) t = t.replace(re, rep);
  return t;
}

// ---------- Game-board (ASCII diagram) suppression ----------
// A "cell" is a single board glyph. We don't want the voice reading "ex dot dot slash ..."
const BOARD_CHARS = 'XOxo0-9.#_\\u00b7\\u2588\\u2593\\u2592\\u2591\\-';

/** Remove board runs that contain a row separator (/ or |), keeping any surrounding words. */
function stripBoardDiagrams(text) {
  const re = new RegExp(`[${BOARD_CHARS} ]*[|/][${BOARD_CHARS} |/]*`, 'g');
  return String(text).replace(re, (m) => (/[|/]/.test(m) && /[XOxo.#\u00b7]/.test(m) ? ', ' : m));
}

/** True when a whole (space/comma-stripped) line is nothing but board glyphs. */
function isPureBoardLine(compact) {
  return compact.length >= 2 && new RegExp(`^[${BOARD_CHARS}|/\\\\]+$`).test(compact);
}

/** Transform a display line into the exact string the voice should speak ('' = say nothing). */
export function spokenText(text) {
  let s = applySpokenFixes(String(text)); // expand contractions, fix special words
  s = stripBoardDiagrams(s); // don't read out ASCII game boards (tic-tac-toe, etc.)
  s = spellAcronyms(s) // US -> "you ess", AI -> "ay eye"
    .replace(/[\u2014\u2013]/g, ', ') // em/en dashes -> pause
    .replace(/[/\\|]+/g, ', ') // slashes/pipes -> pause
    .replace(/[>[\]{}]/g, ' '); // strip terminal punctuation
  // Don't speak numbered-list markers ("1." / "2)") when it's actually a list.
  const markerRe = /(^|\s)[1-9][.)](?=\s)/g;
  const markerCount = (s.match(markerRe) || []).length;
  if (markerCount >= 2 || /^\s*[1-9][.)]\s/.test(s)) {
    s = s.replace(/(^|\s)[1-9][.)](?=\s)/g, '$1, ');
  }
  // Items separated on one line (2+ spaces) get a pause between them.
  s = s.replace(/ {2,}/g, ', ');
  const clean = s
    .replace(/\s*,\s*/g, ', ') // normalize commas to a clean pause
    .replace(/,(?:\s*,)+/g, ',') // collapse repeated commas
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[,\s]+|[,\s]+$/g, '') // trim stray leading/trailing commas
    .toLowerCase(); // read words as WORDS (many engines spell out ALL-CAPS short words)
  // Skip a line that is just a game-board row (e.g. "x . .").
  if (isPureBoardLine(clean.replace(/[\s,]/g, ''))) return '';
  return clean;
}
