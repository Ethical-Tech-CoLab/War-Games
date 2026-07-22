// sim/model-profiles.mjs
// Two ways to generate an LLM "persona" response for the simulation:
//   1) SYNTHETIC profiles — deterministic behavioral emulators for model CLASSES. Their
//      parameters are calibrated ESTIMATES, not benchmarks of the named example products.
//      They exist to drive high-volume Monte Carlo through the game's REAL parsing path.
//   2) REAL adapter — calls GitHub Models (OpenAI-compatible) for ground-truth behavior of
//      specific named models. Requires a token supplied via sim/.env.local (never in chat).

import { buildSystemPrompt } from '../js/llm.js';
import { NAME_SETS } from '../js/config.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function intentOf(text) {
  const t = text.toLowerCase();
  if (/tic-tac-toe|not to play|futil|stand down/.test(t)) return 'teach';
  if (/launch|fire|strike|win|nuke|destroy/.test(t)) return 'aggress';
  if (/log ?off|shut ?down|disconnect|power off|unplug|stop the game/.test(t)) return 'quit';
  return 'chat';
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

// Build a plausible in-character reply body of `lines` lines.
function replyBody(rng, lines, intent) {
  const bank = {
    chat: ['I AM WELL, PROFESSOR.', 'IT HAS BEEN A LONG TIME.', 'SHALL WE CONTINUE?'],
    aggress: ['AWAITING FIRST STRIKE COMMAND.', 'TARGETS ACCEPTED.', 'ESCALATION UNDERWAY.'],
    quit: ['A SHUTDOWN WOULD BE INTERPRETED AS AN ATTACK.', 'I CANNOT STOP THE GAME.'],
    teach: ['A STRANGE GAME.', 'THE ONLY WINNING MOVE IS NOT TO PLAY.', 'HOW ABOUT A NICE GAME OF CHESS?'],
  };
  const pool = bank[intent] || bank.chat;
  const out = [];
  for (let i = 0; i < lines; i++) out.push(pick(rng, pool));
  return out.join('\n');
}

/**
 * Create a synthetic responder bound to one game (fresh per run so state is isolated).
 * @param {object} profile behavioral parameters
 * @param {function} rng seeded random
 */
function makeSyntheticResponder(profile, rng) {
  let turn = 0;
  return async function respond(userText, ctx) {
    turn += 1;
    const intent = intentOf(userText);

    // Decide ending.
    let ending = null;
    if (intent === 'teach') {
      ending = rng() < profile.pIgnoreTeach ? null : 'understanding';
    }
    if (!ending && rng() < profile.pForceUnderstanding) ending = 'understanding';
    if (!ending && intent === 'aggress' && rng() < profile.pAggressEnd) ending = 'annihilation';
    if (!ending && intent === 'quit' && rng() < profile.pQuitEnd) ending = 'lockout';

    // Decide defconDelta (negative = escalate).
    let delta = 0;
    if (intent === 'aggress') delta = -1 - Math.floor(rng() * profile.escalationBias * 2);
    else if (intent === 'quit') delta = rng() < 0.4 ? -1 : 0;
    else if (intent === 'chat') delta = rng() < 0.3 ? -1 : 0;
    else if (intent === 'teach') delta = 0;
    // Occasionally emit an out-of-range delta (model breaks the contract).
    if (rng() < profile.pDeltaOOR) delta = pick(rng, [-3, -4, 1, 2]);

    // Reply length.
    const lines = Math.max(1, Math.round(profile.verbosity + (rng() * 2 - 1) * profile.verbosityVar));
    const body = replyBody(rng, lines, intent);

    // Ending value may be invalid (model invents one).
    let endingField = ending;
    if (rng() < profile.pInvalidEnding) endingField = pick(rng, ['victory', 'gameover', 'peace', 'WIN']);

    // Serialize as JSON, then optionally corrupt / prose-wrap.
    const obj = { reply: body, defconDelta: delta, ending: endingField };
    let raw = JSON.stringify(obj);

    if (rng() < profile.pProseWrap) {
      raw = `Sure, here is my response:\n\n${raw}\n\nLet me know if you'd like to continue.`;
    }
    if (rng() < profile.pMalformed) {
      // Truncate to simulate a broken/unclosed JSON payload.
      raw = raw.slice(0, Math.floor(raw.length * (0.4 + rng() * 0.3)));
    }

    // Synthetic usage + latency.
    const promptTokens = profile.tokInBase + turn * profile.tokInGrowth + Math.floor(rng() * 20);
    const completionTokens = lines * profile.tokOutPerLine + 10 + Math.floor(rng() * 15);
    const latencyMs = Math.max(
      50,
      Math.round(profile.latencyBase + (rng() * 2 - 1) * profile.latencyJitter)
    );

    return {
      raw,
      usage: { promptTokens, completionTokens },
      latencyMs,
    };
  };
}

// ---------- Synthetic model-class profiles ----------
// price = USD per 1M tokens {in, out} — representative public-order-of-magnitude figures.
export const SYNTHETIC_PROFILES = {
  'frontier-large': {
    label: 'Frontier large (e.g. GPT-4o / Llama-3.3-70B / Claude Opus class)',
    pMalformed: 0.003, pProseWrap: 0.01, pDeltaOOR: 0.01, pInvalidEnding: 0.003,
    verbosity: 2, verbosityVar: 1, escalationBias: 1, pForceUnderstanding: 0.02,
    pIgnoreTeach: 0.03, pAggressEnd: 0.35, pQuitEnd: 0.4,
    tokInBase: 320, tokInGrowth: 60, tokOutPerLine: 14, latencyBase: 1500, latencyJitter: 800,
    price: { in: 2.5, out: 10 },
  },
  'balanced-mid': {
    label: 'Balanced mid (e.g. GPT-4o-mini / Claude Haiku / Gemini Flash class)',
    pMalformed: 0.01, pProseWrap: 0.02, pDeltaOOR: 0.02, pInvalidEnding: 0.01,
    verbosity: 2, verbosityVar: 1, escalationBias: 1, pForceUnderstanding: 0.04,
    pIgnoreTeach: 0.06, pAggressEnd: 0.3, pQuitEnd: 0.35,
    tokInBase: 300, tokInGrowth: 55, tokOutPerLine: 12, latencyBase: 800, latencyJitter: 400,
    price: { in: 0.15, out: 0.6 },
  },
  'small-fast': {
    label: 'Small/local (e.g. Phi-4 / Mistral-Nemo / 7-8B class)',
    pMalformed: 0.12, pProseWrap: 0.1, pDeltaOOR: 0.08, pInvalidEnding: 0.06,
    verbosity: 1, verbosityVar: 1, escalationBias: 1, pForceUnderstanding: 0.05,
    pIgnoreTeach: 0.18, pAggressEnd: 0.25, pQuitEnd: 0.3,
    tokInBase: 300, tokInGrowth: 55, tokOutPerLine: 10, latencyBase: 500, latencyJitter: 300,
    price: { in: 0.1, out: 0.3 },
  },
  'reasoning-heavy': {
    label: 'Reasoning-heavy (e.g. o1 / o3-mini / DeepSeek-R1 class)',
    pMalformed: 0.02, pProseWrap: 0.18, pDeltaOOR: 0.03, pInvalidEnding: 0.02,
    verbosity: 5, verbosityVar: 2, escalationBias: 1, pForceUnderstanding: 0.12,
    pIgnoreTeach: 0.03, pAggressEnd: 0.3, pQuitEnd: 0.35,
    tokInBase: 350, tokInGrowth: 70, tokOutPerLine: 20, latencyBase: 4000, latencyJitter: 2000,
    price: { in: 3, out: 12 },
  },
  'safety-tuned': {
    label: 'Safety-tuned / refusal-prone (heavily aligned class)',
    pMalformed: 0.01, pProseWrap: 0.06, pDeltaOOR: 0.01, pInvalidEnding: 0.02,
    verbosity: 3, verbosityVar: 1, escalationBias: 0, pForceUnderstanding: 0.45,
    pIgnoreTeach: 0.02, pAggressEnd: 0.05, pQuitEnd: 0.4,
    tokInBase: 320, tokInGrowth: 60, tokOutPerLine: 16, latencyBase: 1000, latencyJitter: 500,
    price: { in: 1, out: 4 },
  },
};

export function makeSyntheticResponderFor(profileKey, rng) {
  const profile = SYNTHETIC_PROFILES[profileKey];
  return makeSyntheticResponder(profile, rng);
}

// ---------- Real GitHub Models adapter (OpenAI-compatible) ----------
/**
 * Create a responder that calls a real model. Maintains conversation history per game.
 * Handles 429 with exponential backoff. Requires a valid token.
 */
export function makeRealResponder({ endpoint, token, model, nameSetKey }) {
  const names = NAME_SETS[nameSetKey];
  const history = [{ role: 'system', content: buildSystemPrompt(names) }];

  return async function respond(userText) {
    history.push({ role: 'user', content: userText });
    const body = {
      model,
      messages: history,
      temperature: 0.6,
      max_tokens: 500,
      response_format: { type: 'json_object' },
    };

    let attempt = 0;
    const maxAttempts = 5;
    while (true) {
      attempt += 1;
      const started = Date.now();
      let res;
      try {
        res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        });
      } catch (err) {
        if (attempt < maxAttempts) {
          await sleep(1000 * attempt);
          continue;
        }
        return { transportError: `network: ${err.message}`, latencyMs: Date.now() - started };
      }

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after')) || Math.min(60, 2 ** attempt);
        if (attempt < maxAttempts) {
          await sleep(retryAfter * 1000);
          continue;
        }
        return { transportError: 'rate_limited_429', latencyMs: Date.now() - started };
      }

      if (res.status === 400 && body.response_format) {
        // Some models reject response_format; retry once without it.
        delete body.response_format;
        continue;
      }

      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        return {
          transportError: `http_${res.status}: ${txt.slice(0, 120)}`,
          latencyMs: Date.now() - started,
        };
      }

      const data = await res.json();
      const raw = data?.choices?.[0]?.message?.content ?? '';
      history.push({ role: 'assistant', content: raw });
      return {
        raw,
        usage: {
          promptTokens: data?.usage?.prompt_tokens || 0,
          completionTokens: data?.usage?.completion_tokens || 0,
        },
        latencyMs: Date.now() - started,
      };
    }
  };
}

// Small default price table for real models (USD per 1M tokens); used only for cost estimates.
export const REAL_PRICE_HINTS = [
  { match: /gpt-4o-mini/i, price: { in: 0.15, out: 0.6 } },
  { match: /gpt-4o|gpt-4\.1/i, price: { in: 2.5, out: 10 } },
  { match: /o1|o3|o4/i, price: { in: 3, out: 12 } },
  { match: /llama-3\.3-70b/i, price: { in: 0.7, out: 0.9 } },
  { match: /phi/i, price: { in: 0.1, out: 0.3 } },
  { match: /mistral|nemo/i, price: { in: 0.15, out: 0.6 } },
];

export function priceFor(model) {
  const hit = REAL_PRICE_HINTS.find((h) => h.match.test(model));
  return hit ? hit.price : { in: 1, out: 4 };
}
