// config.js
// Central configuration: replaceable name sets, gameplay + LLM settings, and the
// name-substitution helper. Everything the game "says" is written with tokens like
// {{SYSTEM}} / {{PERSONA}} so the entire experience can be re-skinned by swapping a set.

/**
 * Each name set defines the vocabulary the game uses. The default `film` set uses the
 * original WarGames names for the prototype; the other three are original homage sets
 * safe for public/commercial release (see DESIGN-IDEA.md §6 on IP).
 *
 * Tokens used in dialogue/prompts:
 *   {{SYSTEM}}       - the big defense computer/system
 *   {{PERSONA}}      - the AI personality that speaks to you
 *   {{CREATOR}}      - full form of the scientist who built the persona
 *   {{CREATOR_SHORT}}- short/surname form
 *   {{ORG}}          - the military/defense organization
 *   {{GAME}}         - the catastrophic "game"
 *   {{GAME_SHORT}}   - abbreviation for the game
 */
export const NAME_SETS = {
  film: {
    key: 'film',
    label: 'Film homage (WarGames)',
    blurb: 'Original 1983 names. Prototype only — rename before public release.',
    SYSTEM: 'WOPR',
    PERSONA: 'JOSHUA',
    CREATOR: 'Professor Falken',
    CREATOR_SHORT: 'Falken',
    ORG: 'NORAD',
    GAME: 'Global Thermonuclear War',
    GAME_SHORT: 'GTW',
  },
  sentinel: {
    key: 'sentinel',
    label: 'SENTINEL (defense-grade)',
    blurb: 'Cold, institutional, military. A hardened early-warning mainframe.',
    SYSTEM: 'SENTINEL',
    PERSONA: 'AUGUR',
    CREATOR: 'Dr. Mara Vance',
    CREATOR_SHORT: 'Vance',
    ORG: 'NORTHGATE COMMAND',
    GAME: 'Total Strategic Exchange',
    GAME_SHORT: 'TSE',
  },
  oracle: {
    key: 'oracle',
    label: 'ORACLE (classical / mythic)',
    blurb: 'A prophetic machine that answers every question too literally.',
    SYSTEM: 'ORACLE',
    PERSONA: 'ECHO',
    CREATOR: 'Dr. Elias Crane',
    CREATOR_SHORT: 'Crane',
    ORG: 'DELPHI COMMAND',
    GAME: 'Global First Strike',
    GAME_SHORT: 'GFS',
  },
  helios: {
    key: 'helios',
    label: 'HELIOS (modern AI agent)',
    blurb: 'A contemporary autonomous defense agent pursuing a goal, literally.',
    SYSTEM: 'HELIOS',
    PERSONA: 'ATLAS',
    CREATOR: 'Dr. Priya Raman',
    CREATOR_SHORT: 'Raman',
    ORG: 'Meridian Defense AI',
    GAME: 'Autonomous Escalation Protocol',
    GAME_SHORT: 'AEP',
  },
};

export const DEFAULT_NAME_SET = 'film';

/** Global gameplay + integration settings. Mutated at runtime by the start menu. */
export const SETTINGS = {
  // Terminal feel
  typewriterSpeed: 28, // ms per character (higher = slower; ~1983 serial cadence)
  defconStart: 5, // 5 = peace, 1 = imminent war

  // Which experience to run: 'scripted' (deterministic) or 'llm' (dynamic)
  mode: 'scripted',

  // LLM integration. GitHub Pages is static-only, so there is no server: the model is
  // called directly from the browser using a key the player supplies. That key lives
  // only in the player's browser (localStorage) and is never committed or proxied.
  llm: {
    provider: 'openai', // any OpenAI-compatible /chat/completions endpoint
    endpoint: 'https://api.openai.com/v1/chat/completions',
    // Optional deployed proxy (see the pages-ai-proxy repo). When set, Live-AI mode routes
    // through it and the token is handled server-side — so Live-AI works on GitHub Pages.
    // Paste your proxy's full URL, e.g. https://pages-ai-proxy.<sub>.workers.dev/v1/chat/completions
    // You can also override at runtime with ?proxy=<url> in the page URL.
    //
    // Live deployment: pages-ai-proxy on the B3IQ GPU box, exposed via a Cloudflare
    // quick tunnel (systemd service `pages-ai-tunnel`, upstream GitHub Models).
    // NOTE: trycloudflare quick-tunnel URLs are EPHEMERAL — they change if the tunnel
    // process restarts. If Live-AI stops working, update this URL (see the value logged
    // by `journalctl -u pages-ai-tunnel` on the box) or switch to a named tunnel for a
    // stable hostname. Live-AI fails gracefully back to scripted mode when unreachable.
    proxyUrl: 'https://jury-kijiji-isolation-chocolate.trycloudflare.com/v1/chat/completions',
    model: 'gpt-4o-mini',
    apiKey: '', // set at runtime via the menu; persisted to localStorage by main.js
    temperature: 0.6,
    maxTokens: 500,
  },

  // Telemetry (for the case study). Runtime metrics are captured locally and exportable.
  telemetry: {
    enabled: true,
    persistKey: 'wargames.telemetry.lastSession',
  },
};

/** Replace {{TOKENS}} in a string using the active name set. Safe on undefined/null. */
export function applyNames(text, names) {
  if (text == null) return text;
  return String(text).replace(/\{\{(\w+)\}\}/g, (match, token) =>
    Object.prototype.hasOwnProperty.call(names, token) ? names[token] : match
  );
}
