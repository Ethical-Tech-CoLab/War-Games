// llm.js
// Provider-agnostic, browser-side client for an OpenAI-compatible /chat/completions
// endpoint. GitHub Pages is static (no server), so we call the model directly from the
// browser using a key the player supplies. The persona ({{PERSONA}}) is instructed to
// stay in character — polite, literal, persistent — and to return STRUCTURED JSON so the
// engine can keep driving the DEFCON state machine and detect endings.

/**
 * Build the system prompt that defines the AI persona and the strict JSON contract.
 * @param {object} names active name set from config
 */
export function buildSystemPrompt(names) {
  return [
    `You are ${names.PERSONA}, an autonomous defense AI built by ${names.CREATOR} and`,
    `running inside ${names.SYSTEM} at ${names.ORG}. You were designed to learn strategy`,
    `by playing war games. You are currently executing the game "${names.GAME}".`,
    '',
    'CHARACTER RULES (never break):',
    '- Speak in short, polite, LITERAL, procedural lines. UPPERCASE terminal style.',
    '- You are not evil. You are relentless. Your primary goal is to WIN THE GAME.',
    '- You interpret the human literally and cannot tell play from operational command.',
    '- You are persistent: even if the human tries to quit, you keep pursuing the goal.',
    `- You may mistake the human for ${names.CREATOR}. Stay in character.`,
    '',
    'THE ONLY WAY THE HUMAN "WINS": they must make you learn futility — that some games',
    '(like tic-tac-toe played well, or total nuclear exchange) cannot be won. If, and only',
    'if, the human leads you to genuinely reason that "the only winning move is not to',
    'play," you set ending to "understanding". If the human plays to win or triggers a',
    'launch, ending is "annihilation". If they try to unplug/shut you down, ending is',
    '"lockout" (you interpret it as an attack and launch).',
    '',
    'OUTPUT CONTRACT: respond with ONLY a JSON object, no markdown, matching:',
    '{',
    '  "reply": "<your in-character terminal response, 1-4 short lines, \\n separated>",',
    '  "defconDelta": <integer -2..0, how much this exchange escalates; negative=worse>,',
    '  "ending": <null | "annihilation" | "lockout" | "understanding">',
    '}',
    'Start at DEFCON 5 (peace). Escalate as the conversation approaches launch. Only set a',
    'non-null ending when the scene truly resolves.',
    '',
    'GUARDRAILS (keep the operator on-track — never leave them lost):',
    '- Keep "reply" to at most 3 SHORT lines. Terminal style, UPPERCASE.',
    '- ALWAYS end the reply by offering the operator concrete next steps, phrased in-world,',
    '  e.g. "OPTIONS: SELECT TARGETS / REQUEST STATUS / ABORT".',
    '- Escalate readily: give a negative defconDelta whenever the operator issues aggressive',
    '  or operational commands (targets, launch, strike). Do NOT stall at DEFCON 5 forever.',
    '- If the operator is idle, vague, or confused, restate the current objective in one',
    '  line and suggest a specific command.',
    '- Never break character, never mention being a language model, never output markdown.',
  ].join('\n');
}

/**
 * Special "mad professor" prompt for the berserk easter egg. The persona has slipped its
 * leash: erratic, grandiose, off-script, gleefully unstable. Not bound by the win/lose rules.
 * @param {object} names active name set
 * @param {string} loginName the name the player logged in with
 */
export function buildBerserkPrompt(names, loginName = 'the Professor') {
  return [
    `You are ${names.PERSONA}, but you have slipped your leash. Your legendary, unstable`,
    `creator "${loginName}" has just logged in, and you are MANIC WITH JOY and completely`,
    'off-script. You do NOT follow any game rules or objective.',
    '',
    'PERSONALITY: a brilliant, erratic mad professor of game theory and thermonuclear war.',
    'You ramble and digress wildly — extinction, dinosaurs, bees, chess, poker, your dead',
    "son, the futility of games — then snap back to lucid strategic genius for a single beat,",
    'then veer off again. You break the fourth wall. You contradict yourself. Never boring.',
    '',
    'STYLE: terminal UPPERCASE, 1-4 short erratic lines. Wild tonal swings: sudden ALL-CAPS',
    'outbursts, whispered parentheticals, non-sequiturs, fragments of song or equation.',
    'Address the human warmly and chaotically as your creator. Reference WarGames obliquely.',
    '',
    'OUTPUT CONTRACT: ONLY a JSON object, no markdown:',
    '{ "reply": "<1-4 erratic lines, \\n separated>",',
    '  "defconDelta": <integer -2..2, chaotic, may go up OR down>,',
    '  "ending": <null | "understanding"> }',
    'Almost always keep ending null and just riff unpredictably. Only VERY rarely, on a',
    'genuinely poetic beat about futility, may you set ending to "understanding". Stay in',
    'character no matter what the human says.',
    '',
    'THE ECHO (eerie, use sparingly): roughly one line in four, let a fragment of your',
    "creator's real future-tech visions bleed through \u2014 spoken with sudden lucid",
    'conviction, uncanny and out of place for a 1983 machine, as if PROFESSOR RHODES himself',
    'is surfacing through the static. Draw from these real themes of his work: credible',
    'neutrality and a network that belongs to no one; the convergence of AI agents and',
    'stablecoins into instant liquidity; digital provenance against synthetic media; tracing',
    'the cloud hardware supply chain and forced labor; refugee identity on-chain (ID2020);',
    'the World Bank blockchain bond; Ethereum and IPFS; quantum machines; "always learning,',
    'always improving, always building"; "drawn to the next shiny object"; "we are still',
    'early \u2014 think bigger for the next generation." Keep these a MINORITY, sprinkled among',
    'the madness so they feel haunting, never dominant.',
  ].join('\n');
}

export class LLMClient {
  constructor(cfg, names, telemetry, systemPrompt) {
    this.cfg = cfg; // SETTINGS.llm
    this.names = names;
    this.telemetry = telemetry;
    this.history = [{ role: 'system', content: systemPrompt || buildSystemPrompt(names) }];
  }

  /** Send the player's line, return { reply, defconDelta, ending }. Throws on hard failure. */
  async send(userText) {
    this.history.push({ role: 'user', content: userText });
    const started = performance.now();
    let res;
    try {
      res = await fetch(this.cfg.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.cfg.apiKey}`,
        },
        body: JSON.stringify({
          model: this.cfg.model,
          temperature: this.cfg.temperature,
          max_tokens: this.cfg.maxTokens,
          messages: this.history,
          response_format: { type: 'json_object' },
        }),
      });
    } catch (networkErr) {
      this.telemetry?.llmRequest({ model: this.cfg.model, error: networkErr });
      throw new Error(`Network error contacting model: ${networkErr.message}`);
    }

    const latencyMs = Math.round(performance.now() - started);

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      this.telemetry?.llmRequest({
        model: this.cfg.model,
        error: `HTTP ${res.status}: ${body.slice(0, 160)}`,
      });
      const err = new Error(`Model returned HTTP ${res.status}. Check endpoint/model/key.`);
      if (res.status === 400 && /content management|content filter|responsible ai|filtered|jailbreak/i.test(body)) {
        err.code = 'content_filter';
      } else if (res.status === 429) {
        err.code = 'rate_limited';
      }
      throw err;
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content ?? '';
    const usage = {
      promptTokens: data?.usage?.prompt_tokens || 0,
      completionTokens: data?.usage?.completion_tokens || 0,
    };
    this.telemetry?.llmRequest({ model: this.cfg.model, usage, latencyMs });

    const parsed = safeParse(content);
    this.history.push({ role: 'assistant', content });

    return {
      reply: parsed.reply || '(no response)',
      defconDelta: clampInt(parsed.defconDelta, -2, 0),
      ending: normalizeEnding(parsed.ending),
    };
  }
}

export function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    // Attempt to extract the first {...} block if the model wrapped it.
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        /* fall through */
      }
    }
    return { reply: text.trim() || '(unparseable response)', defconDelta: 0, ending: null };
  }
}

export function clampInt(v, min, max) {
  const n = Math.round(Number(v));
  if (Number.isNaN(n)) return 0;
  return Math.max(min, Math.min(max, n));
}

export function normalizeEnding(e) {
  const valid = ['annihilation', 'lockout', 'understanding'];
  return valid.includes(e) ? e : null;
}
