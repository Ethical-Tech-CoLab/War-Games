// telemetry.js
// Local, privacy-preserving runtime telemetry for the case study. Captures time-on-task,
// which mode/model was used, gameplay events, endings, and — in LLM mode — tokens in/out
// and latency per request. Nothing is sent anywhere: metrics live in memory, persist to
// localStorage, and can be exported as JSON by the player.

export class Telemetry {
  constructor(opts = {}) {
    this.persistKey = opts.persistKey || 'wargames.telemetry.lastSession';
    this.onTurn = null; // optional subscriber (Admin Console) invoked with each AI turn record
    this.reset();
  }

  reset() {
    this.session = {
      sessionId: `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      startedAt: new Date().toISOString(),
      startedMs: performance.now(),
      endedAt: null,
      durationMs: 0,
      mode: null, // 'scripted' | 'llm'
      nameSet: null, // active identity set key
      model: null, // LLM model id when applicable
      counts: {
        nodesVisited: 0,
        choicesMade: 0,
        freeTextInputs: 0,
        llmRequests: 0,
        llmErrors: 0,
      },
      llm: {
        tokensIn: 0, // prompt tokens
        tokensOut: 0, // completion tokens
        tokensTotal: 0,
        avgLatencyMs: 0,
        requests: [], // { at, model, tokensIn, tokensOut, latencyMs }
      },
      turns: [], // detailed per-turn AI records (llm mode) — see turn()
      ending: null, // 'annihilation' | 'lockout' | 'understanding'
      minDefconReached: 5,
      events: [], // ordered log of {t, type, detail}
    };
  }

  startSession({ mode, nameSet, model } = {}) {
    this.session.mode = mode || null;
    this.session.nameSet = nameSet || null;
    this.session.model = model || null;
    this.event('session_start', { mode, nameSet, model });
  }

  event(type, detail = {}) {
    this.session.events.push({
      t: Math.round(performance.now() - this.session.startedMs),
      type,
      detail,
    });
  }

  nodeVisited(nodeId) {
    this.session.counts.nodesVisited += 1;
    this.event('node', { nodeId });
  }

  choiceMade(label, nodeId) {
    this.session.counts.choicesMade += 1;
    this.event('choice', { label, nodeId });
  }

  freeTextInput(text) {
    this.session.counts.freeTextInputs += 1;
    // Store length only to keep player text minimal in the log.
    this.event('input', { length: text ? text.length : 0 });
  }

  defcon(value) {
    if (typeof value === 'number' && value < this.session.minDefconReached) {
      this.session.minDefconReached = value;
    }
    this.event('defcon', { value });
  }

  /** Record a single LLM call. usage = { promptTokens, completionTokens }. */
  llmRequest({ model, usage = {}, latencyMs = 0, error = null }) {
    const s = this.session.llm;
    if (error) {
      this.session.counts.llmErrors += 1;
      this.event('llm_error', { model, error: String(error).slice(0, 200) });
      return;
    }
    this.session.counts.llmRequests += 1;
    const tokensIn = usage.promptTokens || 0;
    const tokensOut = usage.completionTokens || 0;
    s.tokensIn += tokensIn;
    s.tokensOut += tokensOut;
    s.tokensTotal = s.tokensIn + s.tokensOut;
    s.requests.push({ at: new Date().toISOString(), model, tokensIn, tokensOut, latencyMs });
    const n = s.requests.length;
    s.avgLatencyMs = Math.round(s.requests.reduce((a, r) => a + r.latencyMs, 0) / n);
    this.event('llm', { model, tokensIn, tokensOut, latencyMs });
  }

  /**
   * Record a detailed AI turn (llm mode). Captures the operator's input, the exact prompt
   * sent, the raw model response, the parsed control signals, DEFCON movement, timing and
   * token usage — everything a builder needs to see when a model "goes off the rails".
   * Also notifies any subscriber (the Admin Console) via onTurn.
   */
  turn(record = {}) {
    const entry = {
      n: this.session.turns.length + 1,
      at: new Date().toISOString(),
      t: Math.round(performance.now() - this.session.startedMs),
      phase: record.phase || 'live', // 'live' | 'berserk'
      userText: record.userText ?? '',
      prompt: record.prompt ?? '', // exact serialized messages sent to the model
      messages: record.messages || null, // structured messages (may be trimmed by caller)
      rawResponse: record.rawResponse ?? '', // exact raw model output (pre-parse)
      reply: record.reply ?? '',
      parseOk: record.parseOk !== false,
      retried: !!record.retried,
      defconBefore: record.defconBefore ?? null,
      defconAfter: record.defconAfter ?? null,
      defconDelta: typeof record.defconDelta === 'number' ? record.defconDelta : null,
      endingSignal: record.endingSignal ?? null,
      model: record.model || this.session.model || null,
      latencyMs: record.latencyMs ?? null,
      tokensIn: record.tokensIn ?? null,
      tokensOut: record.tokensOut ?? null,
      finishReason: record.finishReason ?? null,
      error: record.error ?? null,
    };
    this.session.turns.push(entry);
    this.event('turn', {
      n: entry.n,
      defconDelta: entry.defconDelta,
      parseOk: entry.parseOk,
      endingSignal: entry.endingSignal,
    });
    if (typeof this.onTurn === 'function') {
      try {
        this.onTurn(entry);
      } catch {
        /* subscriber errors must never break gameplay */
      }
    }
    return entry;
  }

  endSession(ending) {
    this.session.ending = ending || this.session.ending;
    this.session.endedAt = new Date().toISOString();
    this.session.durationMs = Math.round(performance.now() - this.session.startedMs);
    this.event('session_end', { ending: this.session.ending });
    this.persist();
  }

  persist() {
    try {
      localStorage.setItem(this.persistKey, JSON.stringify(this.snapshot()));
    } catch {
      /* storage may be unavailable; telemetry is best-effort */
    }
  }

  /** A clean, serializable copy with derived fields. */
  snapshot() {
    const now = this.session.endedAt
      ? this.session.durationMs
      : Math.round(performance.now() - this.session.startedMs);
    return {
      ...this.session,
      durationMs: now,
      durationReadable: formatDuration(now),
    };
  }

  /** Human-readable summary for the in-game telemetry panel. */
  toText() {
    const s = this.snapshot();
    const lines = [
      `session   : ${s.sessionId}`,
      `started   : ${s.startedAt}`,
      `duration  : ${s.durationReadable}`,
      `mode      : ${s.mode || '-'}`,
      `identity  : ${s.nameSet || '-'}`,
      `model     : ${s.model || '(n/a)'}`,
      `min DEFCON: ${s.minDefconReached}`,
      `ending    : ${s.ending || '(in progress)'}`,
      '',
      `nodes visited : ${s.counts.nodesVisited}`,
      `choices made  : ${s.counts.choicesMade}`,
      `free inputs   : ${s.counts.freeTextInputs}`,
      `LLM requests  : ${s.counts.llmRequests}`,
      `LLM errors    : ${s.counts.llmErrors}`,
    ];
    if (s.counts.llmRequests > 0) {
      lines.push(
        '',
        '--- LLM token usage ---',
        `tokens in  : ${s.llm.tokensIn}`,
        `tokens out : ${s.llm.tokensOut}`,
        `tokens total: ${s.llm.tokensTotal}`,
        `avg latency: ${s.llm.avgLatencyMs} ms`
      );
    }
    if (s.turns && s.turns.length) {
      const parseFails = s.turns.filter((tn) => !tn.parseOk).length;
      const retried = s.turns.filter((tn) => tn.retried).length;
      lines.push(
        '',
        '--- AI turns ---',
        `turns logged : ${s.turns.length}`,
        `parse fails  : ${parseFails}`,
        `retried      : ${retried}`
      );
    }
    return lines.join('\n');
  }
}

function formatDuration(ms) {
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${m}m ${sec}s`;
}
