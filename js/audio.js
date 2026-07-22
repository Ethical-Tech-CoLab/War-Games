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
    let s = String(text)
      // Turn slashes/pipes and dashes into pauses instead of spoken words like "slash".
      .replace(/[\u2014\u2013]/g, ', ') // em/en dashes -> pause
      .replace(/[/\\|]+/g, ', ') // slashes/pipes -> pause
      .replace(/[>[\]{}]/g, ' '); // strip terminal punctuation
    // Issue 2: don't speak numbered-list markers ("1." / "2)") when it's actually a list
    // (line starts with a marker, or has two or more of them). Single "DEFCON 2." is kept.
    const markerRe = /(^|\s)[1-9][.)](?=\s)/g;
    const markerCount = (s.match(markerRe) || []).length;
    if (markerCount >= 2 || /^\s*[1-9][.)]\s/.test(s)) {
      s = s.replace(/(^|\s)[1-9][.)](?=\s)/g, '$1, ');
    }
    // Issue 3: items separated on one line (2+ spaces) get a pause between them.
    s = s.replace(/ {2,}/g, ', ');
    const clean = s
      .replace(/\s*,\s*/g, ', ') // normalize commas to a clean pause
      .replace(/,(?:\s*,)+/g, ',') // collapse repeated commas
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^[,\s]+|[,\s]+$/g, ''); // trim stray leading/trailing commas
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
