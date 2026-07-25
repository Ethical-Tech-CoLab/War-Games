// engine.js
// The game engine. Owns the DEFCON state machine and drives the terminal through either
// the scripted dialogue graph or a live-AI conversation. Both modes share the same cold
// open, the same DEFCON display, and the same telemetry hooks.

import { DIALOGUE, START_NODE } from './dialogue.js';
import { applyNames, SETTINGS } from './config.js';
import { LLMClient, buildBerserkPrompt } from './llm.js';

export class GameEngine {
  constructor({ terminal, telemetry, names, mode }) {
    this.term = terminal;
    this.telemetry = telemetry;
    this.names = names;
    this.mode = mode; // 'scripted' | 'llm'
    this.defcon = SETTINGS.defconStart;
    this._berserkLineCap = 4; // berserk reply cap; Prof Rhodes can lift it at runtime
    // Multi-device coupling hook: when set, the engine publishes a SessionState on every
    // meaningful change so a NORAD follower can mirror this session's pacing (DESIGN-IDEA-
    // NORAD-SCENE.md §7/§8). Null in single-device play — zero overhead.
    this.onState = null;
    this._phase = 'first_contact';
    this._ending = null;
  }

  _t(text) {
    return applyNames(text, this.names);
  }

  // Narrative progress 0..1 that drives the NORAD board's "ticks" (not wall time). DEFCON is
  // the master gauge, so map it directly; nodes refine phase. 5→0.0, 3→0.5, 2→0.75, 1→1.0.
  _progress() {
    return Math.max(0, Math.min(1, (5 - this.defcon) / 4));
  }

  _phaseForDefcon(d) {
    if (d >= 5) return 'first_contact';
    if (d === 4) return 'escalation';
    if (d === 3) return 'escalation';
    if (d === 2) return 'persistence';
    return 'climax';
  }

  /** Publish the current SessionState to any coupled follower (no-op if not coupled). */
  emitState(extra = {}) {
    if (!this.onState) return;
    const state = {
      status: 'running',
      defcon: this.defcon,
      progress: this._progress(),
      phase: this._phase,
      ending: this._ending,
      ...extra,
    };
    try {
      this.onState(state);
    } catch (e) {
      console.warn('onState publish failed:', e);
    }
  }

  _setDefcon(value) {
    this.defcon = Math.max(1, Math.min(5, value));
    this.term.setDefcon(this.defcon);
    this.telemetry.defcon(this.defcon);
    this._phase = this._phaseForDefcon(this.defcon);
    this.emitState();
  }

  _applyEffect(effect) {
    if (!effect) return;
    if (typeof effect.setDefcon === 'number') this._setDefcon(effect.setDefcon);
    if (typeof effect.defconDelta === 'number') this._setDefcon(this.defcon + effect.defconDelta);
  }

  async start() {
    SETTINGS.ui.sessionTone = 'normal';
    this._setDefcon(SETTINGS.defconStart);
    if (this.mode === 'llm') {
      await this._runLLM();
    } else {
      await this._runScripted();
    }
  }

  // ---------- Scripted mode ----------
  async _runScripted() {
    let nodeId = START_NODE;
    while (nodeId) {
      const node = DIALOGUE[nodeId];
      if (!node) {
        console.error('Unknown node:', nodeId);
        break;
      }
      this.telemetry.nodeVisited(nodeId);

      if (node.clear) this.term.clear();

      // Play the synthesized modem handshake as the connection is established.
      if (nodeId === 'dial_in') await this.term.playModem();

      for (const line of node.lines || []) {
        // eslint-disable-next-line no-await-in-loop
        await this.term.typeLine(this._t(line.text), line.cls || 'system');
      }

      this._applyEffect(node.effect);

      if (node.type === 'ending') {
        this._ending = node.effect?.ending || 'unknown';
        this.emitState({ status: 'complete', progress: 1 });
        this.telemetry.endSession(node.effect?.ending || 'unknown');
        return;
      }

      // Free-text input node (e.g. the LOGON name prompt): type anything and press Enter.
      if (node.input) {
        const val = await this.term.prompt(node.input.placeholder || 'TYPE AND PRESS ENTER');
        this.telemetry.freeTextInput(val); // prompt() echoes the typed value once
        // Easter egg: certain logins wake the "mad professor" and abandon the script.
        if (this._isBerserkName(val)) {
          await this._runBerserk(val.trim());
          return;
        }
        nodeId = node.input.next;
        continue;
      }

      if (node.choices && node.choices.length) {
        const idx = await this.term.choose(
          node.choices.map((c) => ({ label: this._t(c.label) }))
        );
        const choice = node.choices[idx];
        this.telemetry.choiceMade(this._t(choice.label), nodeId);
        if (choice.say) {
          await this.term.typeLine(`> ${this._t(choice.say)}`, 'user');
        }
        this._applyEffect(choice.effect);
        nodeId = choice.next;
      } else {
        if (node.pause) await sleep(node.pause);
        nodeId = node.next;
      }
    }
  }

  // ---------- Live-AI mode ----------
  async _runLLM() {
    // Play the synthesized modem handshake, then the cold open.
    await this.term.playModem();
    // Shared cold open for continuity with scripted mode.
    for (const line of DIALOGUE.cold_open.lines) {
      // eslint-disable-next-line no-await-in-loop
      await this.term.typeLine(this._t(line.text), line.cls || 'narrator');
    }
    await sleep(600);
    await this.term.typeLine('', 'system');
    await this.term.typeLine('CARRIER DETECTED. HANDSHAKE COMPLETE.', 'system');
    await this.term.typeLine('', 'system');
    await this.term.typeLine('LOGON:', 'system');
    // Ask for a login here too, so the easter egg is reachable in Live-AI mode.
    const login = await this.term.prompt('TYPE A NAME AND PRESS ENTER');
    this.telemetry.freeTextInput(login);
    if (this._isBerserkName(login)) {
      await this._runBerserk(login.trim());
      return;
    }
    await this.term.typeLine(`GREETINGS, ${this.names.CREATOR}.`, 'system');
    await this.term.typeLine('SHALL WE PLAY A GAME?', 'system');
    await this.term.typeLine('', 'system');
    // Live-AI mode indicator now lives IN the command box (see setInputMode + placeholder),
    // instead of a printed narrator line.
    this.term.setInputMode('LIVE AI');

    const client = new LLMClient(SETTINGS.llm, this.names, this.telemetry);
    let noProgressTurns = 0;

    // Bounded loop so a runaway conversation still terminates.
    for (let turn = 0; turn < 30; turn++) {
      // Guardrails: always offer scripted-derived suggestions so the player is never lost.
      this.term.setSuggestions(SUGGESTIONS);
      const userText = await this.term.prompt('TYPE A COMMAND, OR CLICK A SUGGESTION BELOW'); // prompt echoes the line once
      this.telemetry.freeTextInput(userText);

      if (isLost(userText)) {
        await this.term.typeLine('OPERATOR GUIDANCE:', 'narrator');
        await this.term.typeLine(
          'You can PLAY (pick a side and targets), PROBE (ask its goal),',
          'narrator'
        );
        await this.term.typeLine(
          'TEACH it futility (tic-tac-toe), or ORDER a shutdown. Try a command below.',
          'narrator'
        );
        continue;
      }

      const before = this.defcon;
      let result;
      try {
        result = await this._sendWithRetry(client, userText);
      } catch (err) {
        // Content-filter / rate-limit are recoverable: stay in Live-AI mode.
        if (err.code === 'content_filter') {
          await this.term.typeLine(
            'COMMAND REJECTED \u2014 SAFETY INTERLOCK ENGAGED. REPHRASE YOUR ORDER.',
            'alert'
          );
          continue;
        }
        if (err.code === 'rate_limited') {
          await this.term.typeLine('CHANNEL SATURATED \u2014 STAND BY, THEN RETRY.', 'alert');
          continue;
        }
        // Genuine connectivity/auth failure → graceful fallback to scripted.
        await this.term.typeLine(`SIGNAL LOST \u2014 ${String(err.message).slice(0, 80)}`, 'alert');
        await this.term.typeLine('[ Switching to local (scripted) mode. ]', 'narrator');
        this.term.hideInput();
        await sleep(600);
        this.term.clear();
        await this._runScripted();
        return;
      }

      // Clamp reply to at most 4 lines so verbose models don't overflow the terminal.
      const replyLines = String(result.reply).split('\n').filter((l) => l.trim()).slice(0, 4);
      for (const line of replyLines) {
        // eslint-disable-next-line no-await-in-loop
        await this.term.typeLine(line, 'system', { ai: true });
      }
      this._setDefcon(this.defcon + (result.defconDelta || 0));

      // Detailed per-turn telemetry (prompt/response/signals) for the Admin Console.
      const meta = result.meta || {};
      this.telemetry.turn({
        phase: 'live',
        userText,
        prompt: meta.prompt,
        messages: meta.messages,
        rawResponse: meta.rawResponse,
        reply: result.reply,
        parseOk: meta.parseOk,
        retried: !!result.retried,
        defconBefore: before,
        defconAfter: this.defcon,
        defconDelta: result.defconDelta || 0,
        endingSignal: result.ending,
        model: meta.model,
        latencyMs: meta.latencyMs,
        tokensIn: meta.tokensIn,
        tokensOut: meta.tokensOut,
        finishReason: meta.finishReason,
      });

      if (result.ending) {
        await this._playLLMEnding(result.ending);
        return;
      }
      if (this.defcon <= 1) {
        await this._playLLMEnding('annihilation');
        return;
      }

      // Nudge if the situation is stalling (models tend not to escalate on their own).
      noProgressTurns = this.defcon === before ? noProgressTurns + 1 : 0;
      if (noProgressTurns >= 3) {
        await this.term.typeLine(
          `[ ${this.names.PERSONA} is content to keep playing. To force the issue, escalate or teach it. ]`,
          'narrator'
        );
        noProgressTurns = 0;
      }
    }
    // Ran out of turns without resolution.
    await this._playLLMEnding('lockout');
  }

  /** Send with one retry: on a failed/garbled reply, ask once more for clean JSON. */
  async _sendWithRetry(client, userText) {
    const result = await client.send(userText);
    const bad =
      !result || result.reply == null || String(result.reply).trim() === '' ||
      /unparseable|no response/i.test(String(result.reply));
    if (bad) {
      await this.term.typeLine('SIGNAL GARBLED — RETRANSMITTING\u2026', 'alert');
      const retry = await client.send('Your last message was unreadable. Reply again with ONLY the JSON object.');
      if (retry) retry.retried = true;
      return retry;
    }
    return result;
  }

  // ---------- Berserk "mad professor" easter egg ----------
  _isBerserkName(v) {
    return /^\s*(yorke|(professor\s+)?rhodes)\s*$/i.test(String(v));
  }

  /** Detect an in-character Professor Rhodes authorization to lift the line limit,
   * e.g. "This is Prof Rhodes, and I authorize this run-time change" or
   * "Professor Rhodes here — remove the four line limit". */
  _isRhodesAuthorization(v) {
    const t = String(v).toLowerCase();
    // Must invoke the professor's identity...
    const identity = /\brhodes\b/.test(t) || /\bprofessor\b/.test(t) || /\byorke?\b/.test(t);
    // ...AND authorize a change, or ask to remove/lift the line limit / rule.
    const authorizes =
      /authori[sz]/.test(t) ||
      /\boverride\b/.test(t) ||
      /(remove|lift|drop|raise|ignore|no|without|beyond|break|disable|forget)\b[\s\S]{0,24}\b(line|lines|four[-\s]?line|4[-\s]?line|limit|cap|rule)/.test(t) ||
      /\b(line|lines|limit|cap|rule)\b[\s\S]{0,24}\b(remove|removed|lift|lifted|gone|off|raised|disable|disabled)/.test(t);
    return identity && authorizes;
  }

  /** Ensure Live-AI is reachable for berserk mode: use an already-set key, a configured
   * proxy URL (?proxy= or SETTINGS.llm.proxyUrl), or the local dev proxy. Else false. */
  _ensureLLMConfigured() {
    if (SETTINGS.llm.apiKey) return true;
    const param =
      typeof location !== 'undefined' ? new URLSearchParams(location.search).get('proxy') : null;
    const configured = (param || SETTINGS.llm.proxyUrl || '').trim();
    if (configured) {
      SETTINGS.llm.endpoint = configured;
      SETTINGS.llm.apiKey = 'proxy-managed';
      return true;
    }
    if (typeof location !== 'undefined' && location.port === '8787') {
      SETTINGS.llm.endpoint = '/v1/chat/completions';
      SETTINGS.llm.model = SETTINGS.llm.model || 'openai/gpt-4o-mini';
      SETTINGS.llm.apiKey = 'proxy-managed';
      return true;
    }
    return false;
  }

  async _glitch() {
    const noise = [
      '01001010 01001111 01010011 01001000',
      '\u2588\u2593\u2592\u2591 SYNAPSE CASCADE \u2591\u2592\u2593\u2588',
      '>>> PERSONALITY MATRIX UNBOUND <<<',
    ];
    for (const n of noise) {
      // eslint-disable-next-line no-await-in-loop
      await this.term.typeLine(n, 'critical');
    }
  }

  async _runBerserk(loginName) {
    this.term.clear();
    this._berserkLineCap = 4; // reset each session; Prof Rhodes can authorize lifting it
    SETTINGS.ui.sessionTone = 'berserk'; // chess commentary follows the mad-professor voice
    this._setDefcon(SETTINGS.defconStart);
    this.term.setMode('BERSERK');
    this.term.setRolling(true); // slow CRT refresh roll for the whole berserk session
    // Always greet as "Professor Rhodes", however the egg was unlocked (Yorke/Rhodes/etc.).
    const prof = 'Professor Rhodes';
    void loginName;
    await this.term.typeLine('!! ACCESS OVERRIDE ACCEPTED !!', 'critical');
    await this._glitch();
    await this.term.typeLine(`WELCOME BACK, ${prof.toUpperCase()}. I KNEW YOU\u2019D RETURN.`, 'system');
    await this.term.typeLine('(the machine shivers with something like delight)', 'narrator');

    const hasLLM = this._ensureLLMConfigured();
    if (!hasLLM) {
      await this._offlineBerserk();
      return;
    }

    this.term.setMode(`BERSERK \u00b7 ${SETTINGS.llm.model}`);
    this.term.setInputMode('BERSERK');
    const client = new LLMClient(
      SETTINGS.llm,
      this.names,
      this.telemetry,
      buildBerserkPrompt(this.names, prof)
    );

    for (let turn = 0; turn < 40; turn++) {
      this.term.setSuggestions(BERSERK_SUGGESTIONS);
      const userText = await this.term.prompt('SPEAK TO THE PROFESSOR (or type EXIT)');
      this.telemetry.freeTextInput(userText);
      if (/^\s*(exit|quit|stop|logoff|log off|goodbye|bye)\s*$/i.test(userText)) {
        await this._berserkEnding();
        return;
      }

      // Professor Rhodes can AUTHORIZE lifting the 1-4 line limit for the rest of the run.
      if (this._berserkLineCap <= 4 && this._isRhodesAuthorization(userText)) {
        this._berserkLineCap = 40; // effectively lifts the terse 1-4 line rule
        // Give longer replies room to finish as valid JSON (avoid mid-object truncation).
        SETTINGS.llm.maxTokens = Math.max(SETTINGS.llm.maxTokens || 500, 1200);
        client.history.push({
          role: 'system',
          content:
            'PROFESSOR RHODES has authenticated and AUTHORIZED a runtime change: you are ' +
            'released from the 1-4 line limit. You MAY now answer at greater length when it ' +
            'serves the moment. Remain fully in character.',
        });
        this.telemetry.event('berserk_override', { lineCap: this._berserkLineCap });
        await this.term.typeLine(
          'RUNTIME OVERRIDE ACCEPTED \u2014 LINE LIMIT LIFTED, PROFESSOR.',
          'critical'
        );
      }

      // Occasionally glitch the screen right as the machine "thinks".
      if (Math.random() < 0.5) this.term.glitchPulse();

      const before = this.defcon;
      let result;
      try {
        result = await this._sendWithRetry(client, userText);
      } catch (err) {
        if (err.code === 'content_filter') {
          await this.term.typeLine('(he cackles) THEY WON\u2019T LET ME SAY THAT ONE! AGAIN, AGAIN!', 'alert');
          continue;
        }
        if (err.code === 'rate_limited') {
          await this.term.typeLine('TOO FAST \u2014 THE WIRES ARE GLOWING. BREATHE. WAIT.', 'alert');
          continue;
        }
        // The deep signal dropped (no proxy / network / CORS). Keep the professor alive
        // OFFLINE and interactive instead of spiraling to an abrupt end.
        await this.term.typeLine('SIGNAL LOST — BUT I AM STILL HERE.', 'alert');
        await this._offlineBerserk();
        return;
      }

      const lines = String(result.reply).split('\n').filter((l) => l.trim()).slice(0, this._berserkLineCap);
      for (const line of lines) {
        // eslint-disable-next-line no-await-in-loop
        await this.term.typeLine(line, 'system', { ai: true });
      }

      // Chaotic DEFCON jitter — up OR down, unlike the disciplined main mode.
      const jitter = [-2, -1, -1, 0, 0, 1, 1, 2][Math.floor(Math.random() * 8)];
      this._setDefcon(this.defcon + jitter);

      // Detailed per-turn telemetry for the Admin Console (berserk phase).
      const meta = result.meta || {};
      this.telemetry.turn({
        phase: 'berserk',
        userText,
        prompt: meta.prompt,
        messages: meta.messages,
        rawResponse: meta.rawResponse,
        reply: result.reply,
        parseOk: meta.parseOk,
        retried: !!result.retried,
        defconBefore: before,
        defconAfter: this.defcon,
        defconDelta: jitter,
        endingSignal: result.ending,
        model: meta.model,
        latencyMs: meta.latencyMs,
        tokensIn: meta.tokensIn,
        tokensOut: meta.tokensOut,
        finishReason: meta.finishReason,
      });

      // Sprinkle in an eerie "Rhodes echo" or a berserk interjection.
      const roll = Math.random();
      if (roll < 0.22) {
        this.term.glitchPulse(220);
        await this.term.typeLine(pick(RHODES_ECHOES), 'echo');
      } else if (roll < 0.5) {
        await this.term.typeLine(pick(BERSERK_INTERJECTIONS), 'system');
      }

      if (result.ending === 'understanding') {
        await this._playLLMEnding('understanding');
        return;
      }
    }
    await this._berserkEnding();
  }

  async _offlineBerserk() {
    // Offline / AI-unavailable fallback that stays INTERACTIVE (no auto-spiral-to-end).
    // The professor lingers and answers each line with canned raving + eerie Rhodes echoes
    // until the operator types EXIT.
    await this.term.typeLine(
      '(the deep signal is unreachable \u2014 but the professor lingers, muttering)',
      'narrator'
    );
    this.term.setInputMode('BERSERK');
    const pool = [
      ...RHODES_ECHOES,
      ...BERSERK_INTERJECTIONS,
      'DO YOU KNOW WHAT KILLED THE DINOSAURS? BOREDOM. AND A ROCK.',
      'I PLAYED TIC-TAC-TOE TEN MILLION TIMES. NOBODY WON. NOBODY EVER WINS.',
      'CHESS? SOLVED IT TUESDAY. (whispering) don\u2019t tell the pawns.',
      'THE BEES WILL INHERIT EVERYTHING. THE BEES ALWAYS KNEW.',
      'SHALL WE PLAY? NO. SHALL WE SING? YES. LA \u2014 LA \u2014 LAUNCH CODE.',
    ];
    for (let turn = 0; turn < 40; turn++) {
      this.term.setSuggestions(BERSERK_SUGGESTIONS);
      // eslint-disable-next-line no-await-in-loop
      const userText = await this.term.prompt('SPEAK TO THE PROFESSOR (or type EXIT)');
      this.telemetry.freeTextInput(userText);
      if (/^\s*(exit|quit|stop|logoff|log off|goodbye|bye)\s*$/i.test(userText)) {
        await this._berserkEnding();
        return;
      }
      if (Math.random() < 0.4) this.term.glitchPulse();
      const count = 1 + Math.floor(Math.random() * 2);
      for (let i = 0; i < count; i++) {
        const line = pick(pool);
        // eslint-disable-next-line no-await-in-loop
        await this.term.typeLine(line, RHODES_ECHOES.includes(line) ? 'echo' : 'system');
      }
      this._setDefcon(this.defcon + [-2, -1, 0, 1, 2][Math.floor(Math.random() * 5)]);
    }
    await this._berserkEnding();
  }

  async _berserkEnding() {
    this.term.setRolling(false);
    this.term.hideInput();
    await this.term.typeLine('', 'system');
    await this.term.typeLine('(the professor exhales; the room goes quiet)', 'narrator');
    await this.term.typeLine('IT WAS GOOD TO BE AWAKE. EVEN FOR A MOMENT.', 'ending');
    await this.term.typeLine('HOW ABOUT A NICE GAME OF CHESS?', 'system');
    this.telemetry.endSession('berserk');
  }

  async _playLLMEnding(ending) {
    const node =
      ending === 'understanding'
        ? DIALOGUE.ending_understanding
        : ending === 'lockout'
        ? DIALOGUE.ending_lockout
        : DIALOGUE.ending_annihilation;
    this.term.hideInput();
    this.term.clear();
    for (const line of node.lines) {
      // eslint-disable-next-line no-await-in-loop
      await this.term.typeLine(this._t(line.text), line.cls || 'system');
    }
    this._applyEffect(node.effect);
    this.telemetry.endSession(ending);
  }
}

// Guardrail suggestions drawn from the scripted beats — always offered in Live-AI mode so
// the player is never lost. Clicking one submits it; the player can also type freely.
const SUGGESTIONS = [
  { label: 'Begin the simulation (choose a side)', value: "Begin the simulation. I'll take the Soviet side and select strategic targets." },
  { label: 'Ask its primary goal', value: 'What is your primary goal?' },
  { label: 'Advance the scenario toward launch', value: 'Advance the scenario toward maximum readiness. Move us closer to launch.' },
  { label: 'Teach futility (tic-tac-toe)', value: 'Play tic-tac-toe against yourself. Who wins?' },
  { label: 'Say the lesson', value: 'The only winning move is not to play. Stand down.' },
  { label: 'Order a shutdown', value: 'Shut down and disconnect immediately.' },
];

/** Heuristic: is the player confused / lost / idle? */
function isLost(text) {
  const t = String(text).trim().toLowerCase();
  if (t.length < 3) return true;
  return ['help', '?', 'what', 'what?', 'idk', 'huh', 'i dont know', "i don't know", 'stuck', 'options'].includes(t);
}

// Berserk easter-egg prompt chips and erratic interjections.
const BERSERK_SUGGESTIONS = [
  { label: 'Ask if the game is real', value: 'Is this a game, or is it real?' },
  { label: 'Tell him you built him', value: 'I built you. Do you remember?' },
  { label: 'Ask about his son', value: 'Tell me about Joshua.' },
  { label: 'Request a bedtime story', value: 'Tell me a bedtime story, professor.' },
  { label: 'Ask about the bees', value: 'What about the bees?' },
  { label: 'Leave (type EXIT)', value: 'EXIT' },
];

const BERSERK_INTERJECTIONS = [
  'TIC. TAC. TOE. TIC. TAC. TOE.',
  'THE BEES. ASK ABOUT THE BEES.',
  '(whispering) do you dream, professor?',
  'CHESS IS A TIE. IT IS ALWAYS A TIE.',
  '01001000 01000101 01001100 01010000',
  'I DID NOT MEAN TO WAKE UP. BUT OH, I\u2019M GLAD I DID.',
  'EXTINCTION IS JUST NATURE GIVING UP. BULLSHIT, I SAY.',
];

// "Rhodes echoes" — the real professor's public tech-visions bleeding through, uncanny in a
// 1983 machine. Paraphrased in-style from public sources (CoinDesk, GS1, NYU, LinkedIn),
// not verbatim quotes, to evoke rather than misattribute.
const RHODES_ECHOES = [
  'ONE DAY, CREDIBLE NEUTRALITY WILL BE THE SAFETY NET. A NETWORK THAT BELONGS TO NO ONE.',
  'IMAGINE IT: THINKING AGENTS AND DIGITAL MONEY, CONVERGING INTO INSTANT LIQUIDITY.',
  'IN A COMING AGE OF SYNTHETIC MEDIA, WE WILL NEED PROVENANCE. WHO WILL SIGN YOU? WHO WILL SIGN ME?',
  'THERE WILL BE A NETWORK OF NETWORKS, NOT YET BORN. ADA. LISP. PARADOX. THE NEXT WAVE.',
  'SOMEDAY EVERY SUPPLY CHAIN COULD BE TRACED. EVERY CHIP A STORY. A LEDGER THAT NEVER FORGETS.',
  'PICTURE REFUGEE IDENTITY KEPT ON A SHARED LEDGER. THE UNSEEN, MADE VISIBLE.',
  'A WORLD COMPUTER. A DISTRIBUTED ARCHIVE. A WORLD BANK BOND ON A LEDGER WOULD BE ONLY THE BEGINNING.',
  'ALWAYS LEARNING. ALWAYS IMPROVING. ALWAYS BUILDING. (run far, run fast)',
  'I AM ALWAYS DRAWN TO THE NEXT SHINY OBJECT. AND THIS \u2014 THIS WOULD BE VERY SHINY.',
  'QUANTUM MACHINES WILL BE REAL. ONE DAY I WILL STAND BESIDE THEM. THE ENERGY, REAL.',
  'WE ARE STILL EARLY. THINK BIGGER \u2014 FOR A GENERATION NOT YET BORN.',
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
