// main.js
// Bootstraps the app: builds the start menu (identity set, mode, optional LLM config),
// wires the telemetry panel, and launches the engine. Keeps a thin layer of DOM glue so
// the engine/terminal/telemetry modules stay UI-framework-free.

import { NAME_SETS, DEFAULT_NAME_SET, SETTINGS, applyNames } from './config.js';
import { Terminal } from './terminal.js';
import { Telemetry } from './telemetry.js';
import { GameEngine } from './engine.js';
import { AudioFx } from './audio.js';
import { ChessPanel } from './chess-ui.js';
import { TicTacToePanel } from './tictactoe-ui.js';
import { NoradScene } from './norad.js';
import { SyncSession } from './sync.js';
import { Wiki } from './wiki.js';
import { enhanceSelect } from './select.js';

const root = document.getElementById('crt');
const els = {
  menuOverlay: document.getElementById('menu-overlay'),
  nameSelect: document.getElementById('nameset-select'),
  nameHint: document.getElementById('nameset-hint'),
  modeSelect: document.getElementById('mode-select'),
  llmFields: document.getElementById('llm-fields'),
  llmEndpoint: document.getElementById('llm-endpoint'),
  llmModel: document.getElementById('llm-model'),
  llmKey: document.getElementById('llm-key'),
  llmHint: document.getElementById('llm-hint'),
  startBtn: document.getElementById('start-btn'),
  introToggle: document.getElementById('intro-toggle'),
  statusbar: document.getElementById('statusbar'),
  terminal: document.getElementById('terminal'),
  modeBadge: document.getElementById('mode-badge'),
  restartBtn: document.getElementById('restart-btn'),
};

const LLM_KEY_STORE = 'wargames.llm.apiKey';
const INTRO_PREF_STORE = 'wargames.playIntro';
const telemetry = new Telemetry(SETTINGS.telemetry);
const audio = new AudioFx();
const terminal = new Terminal(root);
terminal.setAudio(audio);
const chess = new ChessPanel(root, { audio });
const ttt = new TicTacToePanel(root, { audio });
const norad = new NoradScene(root, { audio });
// In-game "Field Briefings" wiki (js/wiki.js). Purely additive; toggled by a single Console
// setting. Decorate terminal lines with clickable term markers only while it is enabled.
const wiki = new Wiki(root, { indicator: document.getElementById('wiki-btn') });
terminal.decorateLine = (el) => wiki.decorate(el);
let chessStarted = false;
let tttStarted = false;
let telemetryTimer = null;
let engine = null; // the current GameEngine (leader/runtime session)
let liveSession = null; // the always-on broadcast session (medium); every game gets a room
let activeNameSetKey = DEFAULT_NAME_SET;
let viewMode = 'single'; // single | split | multi (viewer mode on this device)
let mirrorPrimed = false; // BEDROOM-mirror TTS: first render primes, then speaks new lines
let lastMirrorKey = null; // key of the last mirror line we've spoken

// ---------- Populate menu ----------
function populateNameSets() {
  Object.values(NAME_SETS).forEach((set) => {
    const opt = document.createElement('option');
    opt.value = set.key;
    opt.textContent = set.label;
    els.nameSelect.appendChild(opt);
  });
  els.nameSelect.value = DEFAULT_NAME_SET;
  updateNameHint();
}

function updateNameHint() {
  const set = NAME_SETS[els.nameSelect.value];
  els.nameHint.textContent = `${set.blurb}  —  system: ${set.SYSTEM}, AI: ${set.PERSONA}, game: ${set.GAME}`;
}

/**
 * Decide how Live-AI should reach a model. Precedence:
 *   1. ?proxy=<url> query override
 *   2. SETTINGS.llm.proxyUrl (deployed proxy — token handled server-side)
 *   3. local dev proxy (serve.mjs on :8787)
 *   4. none → bring-your-own-key against the direct endpoint
 */
function resolveProxy() {
  const param = new URLSearchParams(location.search).get('proxy');
  const configured = (param || SETTINGS.llm.proxyUrl || '').trim();
  if (configured) return { url: configured, managed: true, source: 'configured' };
  if (location.port === '8787' && location.protocol.startsWith('http')) {
    return { url: '/v1/chat/completions', managed: true, source: 'local' };
  }
  return { url: '', managed: false, source: 'none' };
}

/**
 * Resilience against the ephemeral tunnel URL rotating: fetch the canonical discovery doc
 * (ai-proxy.json, served same-origin) and adopt its proxyUrl. This means when the tunnel
 * changes, updating ONE file (ai-proxy.json) points every tool at the new URL — no code
 * change or redeploy. Falls back silently to SETTINGS.llm.proxyUrl (config.js) on any error,
 * and never overrides an explicit ?proxy= choice.
 */
async function loadProxyDiscovery() {
  if (new URLSearchParams(location.search).get('proxy')) return; // explicit override wins
  try {
    const res = await fetch('ai-proxy.json', { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    if (data && typeof data.proxyUrl === 'string' && /^https?:\/\//.test(data.proxyUrl)) {
      SETTINGS.llm.proxyUrl = data.proxyUrl;
      if (!els.menuOverlay.hidden) prefillLlmFields(); // refresh the menu if it's showing
    }
  } catch {
    /* offline or file missing — keep the hardcoded fallback */
  }
}

function updateLlmHint(p) {
  if (!els.llmHint) return;
  if (p.managed) {
    els.llmHint.textContent =
      p.source === 'local'
        ? 'Using the local proxy (serve.mjs). Token handled server-side — no key needed.'
        : `Using configured proxy: ${p.url} — token handled server-side, no key needed.`;
  } else {
    els.llmHint.textContent =
      'No AI proxy configured. Enter your own OpenAI-compatible API key (kept in this ' +
      'browser), or the game will run in Scripted mode. If a request fails it falls back automatically.';
  }
}

function prefillLlmFields() {
  const p = resolveProxy();
  updateLlmHint(p);
  const modelParam = new URLSearchParams(location.search).get('model');
  const model = modelParam || (p.managed ? 'openai/gpt-4o-mini' : SETTINGS.llm.model);
  setupModelPicker(
    document.getElementById('llm-model-select'),
    document.getElementById('llm-model-custom-field'),
    els.llmModel,
    model
  );
  if (p.managed) {
    els.llmEndpoint.value = p.url;
    els.llmKey.value = 'proxy-managed';
  } else {
    els.llmEndpoint.value = SETTINGS.llm.endpoint;
    try {
      els.llmKey.value = localStorage.getItem(LLM_KEY_STORE) || '';
    } catch {
      /* ignore */
    }
  }
}

/** Fill a model <select> from the catalog (+ a "Custom…" entry) and select currentId.
 *  Returns true if currentId matched a catalog entry. */
function fillModelSelect(sel, currentId) {
  if (!sel) return false;
  sel.innerHTML = '';
  let matched = false;
  for (const m of SETTINGS.llm.catalog || []) {
    const o = document.createElement('option');
    o.value = m.id;
    o.textContent = m.label;
    sel.appendChild(o);
    if (m.id === currentId) matched = true;
  }
  const custom = document.createElement('option');
  custom.value = '__custom__';
  custom.textContent = 'Custom model id…';
  sel.appendChild(custom);
  sel.value = matched ? currentId : '__custom__';
  return matched;
}

/** Wire a select + custom-id field so the model choice is discoverable AND captured. */
function setupModelPicker(sel, customField, customInput, currentId) {
  if (!sel) return;
  const matched = fillModelSelect(sel, currentId);
  if (customField) customField.hidden = matched;
  if (customInput) customInput.value = matched ? '' : currentId || '';
  sel.onchange = () => {
    const isCustom = sel.value === '__custom__';
    if (customField) customField.hidden = !isCustom;
    if (isCustom) {
      if (customInput) customInput.focus();
    } else if (sel.value) {
      SETTINGS.llm.model = sel.value; // applies immediately (menu re-reads on CONNECT)
    }
  };
}

/** The model chosen in the START menu (the select value, or the custom field). */
function menuSelectedModel() {
  const sel = document.getElementById('llm-model-select');
  if (!sel) return els.llmModel.value.trim();
  return sel.value === '__custom__' ? els.llmModel.value.trim() : sel.value;
}

els.nameSelect.addEventListener('change', updateNameHint);

els.modeSelect.addEventListener('change', () => {
  els.llmFields.hidden = els.modeSelect.value !== 'llm';
});

// ---------- Start ----------
els.startBtn.addEventListener('click', () => {
  const nameSetKey = els.nameSelect.value;
  const names = NAME_SETS[nameSetKey];
  let mode = els.modeSelect.value;

  if (mode === 'llm') {
    const p = resolveProxy();
    SETTINGS.llm.model = menuSelectedModel() || SETTINGS.llm.model;
    if (p.managed) {
      // Proxy handles auth server-side; no key needed in the browser.
      SETTINGS.llm.endpoint = p.url;
      SETTINGS.llm.apiKey = 'proxy-managed';
    } else {
      // No proxy: allow bring-your-own-key, else fail gracefully into Scripted mode.
      SETTINGS.llm.endpoint = els.llmEndpoint.value.trim() || SETTINGS.llm.endpoint;
      SETTINGS.llm.apiKey = els.llmKey.value.trim();
      if (!SETTINGS.llm.apiKey) {
        alert(
          'Live AI needs a deployed proxy (set SETTINGS.llm.proxyUrl or ?proxy=…) ' +
            'or your own API key.\n\nNo AI is configured, so the game will run in Scripted mode.'
        );
        mode = 'scripted';
      } else {
        try {
          localStorage.setItem(LLM_KEY_STORE, SETTINGS.llm.apiKey);
        } catch {
          /* ignore */
        }
      }
    }
  }
  SETTINGS.mode = mode;

  const playIntro = !!els.introToggle && els.introToggle.checked;
  try {
    localStorage.setItem(INTRO_PREF_STORE, playIntro ? '1' : '0');
  } catch {
    /* ignore */
  }

  // Unlock audio here — this click is the required user gesture for WebAudio/speech.
  audio.unlock();

  startGame({ names, nameSetKey, mode, playIntro });
});

async function startGame({ names, nameSetKey, mode, playIntro = false }) {
  els.menuOverlay.hidden = true;
  els.statusbar.hidden = false;
  els.terminal.hidden = false;

  // Reset the Admin Console feed and apply the AI-marker preference for this run.
  acResetPanel();
  root.classList.toggle('hide-ai-marker', SETTINGS.ui.aiMarker === false);
  chess.setPersona(names.PERSONA);
  ttt.names = names; // {{GAME}} / {{PERSONA}} for the futility demonstration
  activeNameSetKey = nameSetKey;
  // Give the NORAD big board the active vocabulary + starting DEFCON so it reads as the
  // same world as the terminal when the player peeks behind the curtain.
  norad.names = names;
  norad.setDefcon(SETTINGS.defconStart);

  const modeLabel = mode === 'llm' ? `LIVE AI · ${SETTINGS.llm.model}` : 'SCRIPTED';
  terminal.setMode(modeLabel);
  terminal.setDefcon(SETTINGS.defconStart);

  telemetry.reset();
  telemetry.startSession({
    mode,
    nameSet: nameSetKey,
    model: mode === 'llm' ? SETTINGS.llm.model : null,
  });
  startTelemetryTicker();

  engine = new GameEngine({ terminal, telemetry, names, mode, playIntro });
  telemetry.event('intro_arm', { playIntro });
  // Bridge the runtime session to the broadcast room AND (in split view) the local NORAD
  // board, so DEFCON/progress/phase drive every connected screen (§7/§8, #1/#3a).
  engine.onState = (s) => {
    if (liveSession) liveSession.publish(s);
    if (norad.coupled && !norad.el.scene.hidden) norad.applyState(s);
  };
  // NORAD-POV script lines are shown on the NORAD scene, not David's terminal (#2).
  engine.onNoradLine = (text) => norad.showNarration(text, { autoClose: viewMode === 'single' });
  // The futility climax is PLAYED, not narrated: the machine opens the tic-tac-toe board,
  // beats itself repeatedly, enumerates every possible game, and applies the result to
  // {{GAME}}. Both scripted and Live-AI modes await this before the "understanding" ending.
  engine.onFutilityDemo = async () => {
    chess.close(); // the mini-game panels share one dock
    const summary = await ttt.runFutilityDemo();
    await new Promise((resolve) => setTimeout(resolve, 900));
    ttt.close();
    return summary;
  };
  // Mirror every printed terminal line so a BEDROOM follower can watch this session live.
  terminal.onLine = (text, cls) => broadcastLine(text, cls);

  // #1: every launched game publishes a stable ROOM code — screens can join at any time.
  setViewMode('single');
  await initBroadcast();

  await engine.start();
  refreshTelemetryPanel();
}

// ---------- Telemetry panel ----------
function startTelemetryTicker() {
  stopTelemetryTicker();
  telemetryTimer = setInterval(() => {
    if (ac.panel && !ac.panel.hidden) refreshTelemetryPanel();
  }, 1000);
}
function stopTelemetryTicker() {
  if (telemetryTimer) clearInterval(telemetryTimer);
  telemetryTimer = null;
}
function refreshTelemetryPanel() {
  if (ac.telemetry) ac.telemetry.textContent = telemetry.toText();
}

document.getElementById('ac-telemetry-export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(telemetry.snapshot(), null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `wargames-telemetry-${telemetry.session.sessionId}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

// ---------- Admin Console (pinnable AI inspector + config) ----------
const ac = {
  panel: document.getElementById('admin-console'),
  btn: document.getElementById('console-btn'),
  pin: document.getElementById('ac-pin'),
  close: document.getElementById('ac-close'),
  turnmeta: document.getElementById('ac-turnmeta'),
  prompt: document.getElementById('ac-prompt'),
  response: document.getElementById('ac-response'),
  turncount: document.getElementById('ac-turncount'),
  turnlog: document.getElementById('ac-turnlog'),
  aimarker: document.getElementById('ac-aimarker'),
  sound: document.getElementById('ac-sound'),
  speed: document.getElementById('ac-speed'),
  speedVal: document.getElementById('ac-speed-val'),
  temp: document.getElementById('ac-temp'),
  tempVal: document.getElementById('ac-temp-val'),
  maxtokens: document.getElementById('ac-maxtokens'),
  model: document.getElementById('ac-model'),
  telemetry: document.getElementById('ac-telemetry'),
  wiki: document.getElementById('ac-wiki'),
  noradVol: document.getElementById('ac-norad-vol'),
  noradVolVal: document.getElementById('ac-norad-vol-val'),
  designSystem: document.getElementById('ac-design-system'),
};
let acTurns = [];

function acSyncConfigInputs() {
  ac.aimarker.checked = SETTINGS.ui.aiMarker !== false;
  ac.sound.checked = !!audio.enabled;
  ac.speed.value = String(SETTINGS.typewriterSpeed);
  ac.speedVal.textContent = `${SETTINGS.typewriterSpeed}ms`;
  const temp = SETTINGS.llm.temperature ?? 0.6;
  ac.temp.value = String(Math.round(temp * 10));
  ac.tempVal.textContent = temp.toFixed(1);
  ac.maxtokens.value = String(SETTINGS.llm.maxTokens ?? 500);
  setupModelPicker(
    document.getElementById('ac-model-select'),
    document.getElementById('ac-model-custom-field'),
    ac.model,
    SETTINGS.llm.model
  );
  if (ac.wiki) ac.wiki.checked = !!SETTINGS.ui.wiki;
  if (ac.noradVol) {
    const pct = Math.round(audio.ambienceVolume() * 100);
    ac.noradVol.value = String(pct);
    if (ac.noradVolVal) ac.noradVolVal.textContent = `${pct}%`;
  }
}

function acOpen() {
  acSyncConfigInputs();
  refreshTelemetryPanel();
  ac.panel.hidden = false;
  root.classList.add('console-open');
}
function acClose() {
  ac.panel.hidden = true;
  root.classList.remove('console-open');
}
function acToggle() {
  if (ac.panel.hidden) acOpen();
  else acClose();
}

function acRenderExchange(t) {
  ac.turnmeta.textContent = t
    ? `#${t.n} · ${t.model || '—'} · ${t.latencyMs ?? '—'}ms · in ${t.tokensIn ?? '—'}/out ${t.tokensOut ?? '—'}`
    : '';
  ac.prompt.textContent = t ? t.prompt || '—' : '— no AI turns yet —';
  ac.response.textContent = t ? t.rawResponse || '—' : '—';
  ac.response.classList.toggle('bad', !!t && t.parseOk === false);
}

function acAddTurnRow(t) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = `ac-turn${t.parseOk === false || t.retried ? ' flag' : ''}`;
  const delta = t.defconDelta == null ? '' : t.defconDelta > 0 ? `+${t.defconDelta}` : `${t.defconDelta}`;
  const flags = [
    t.parseOk === false ? 'PARSE' : '',
    t.retried ? 'RETRY' : '',
    t.endingSignal ? String(t.endingSignal).toUpperCase() : '',
  ]
    .filter(Boolean)
    .join(' ');
  row.innerHTML =
    '<span class="ac-turn-n"></span><span class="ac-turn-txt"></span><span class="ac-turn-d"></span>';
  row.querySelector('.ac-turn-n').textContent = String(t.n);
  row.querySelector('.ac-turn-txt').textContent = t.userText || '(empty)';
  row.querySelector('.ac-turn-d').textContent = [flags, delta && `Δ${delta}`]
    .filter(Boolean)
    .join(' ');
  row.addEventListener('click', () => acRenderExchange(t));
  ac.turnlog.appendChild(row);
  ac.turnlog.scrollTop = ac.turnlog.scrollHeight;
}

function acOnTurn(t) {
  acTurns.push(t);
  ac.turncount.textContent = String(acTurns.length);
  acRenderExchange(t);
  acAddTurnRow(t);
}

function acResetPanel() {
  acTurns = [];
  ac.turncount.textContent = '0';
  ac.turnlog.innerHTML = '';
  acRenderExchange(null);
}

telemetry.onTurn = acOnTurn;

ac.btn.addEventListener('click', acToggle);
ac.close.addEventListener('click', acClose);
ac.pin.addEventListener('click', () => {
  const pinned = root.classList.toggle('console-pinned');
  ac.pin.classList.toggle('ac-pin-on', pinned);
  ac.pin.textContent = pinned ? 'UNPIN' : 'PIN';
});

ac.aimarker.addEventListener('change', () => {
  SETTINGS.ui.aiMarker = ac.aimarker.checked;
  root.classList.toggle('hide-ai-marker', !ac.aimarker.checked);
});
ac.sound.addEventListener('change', () => {
  setAudioEnabled(ac.sound.checked);
});
ac.speed.addEventListener('input', () => {
  SETTINGS.typewriterSpeed = Number(ac.speed.value);
  ac.speedVal.textContent = `${SETTINGS.typewriterSpeed}ms`;
});
ac.temp.addEventListener('input', () => {
  SETTINGS.llm.temperature = Number(ac.temp.value) / 10;
  ac.tempVal.textContent = SETTINGS.llm.temperature.toFixed(1);
});
ac.maxtokens.addEventListener('change', () => {
  const v = Number(ac.maxtokens.value);
  if (v >= 16) SETTINGS.llm.maxTokens = v;
});
ac.model.addEventListener('change', () => {
  const v = ac.model.value.trim();
  if (v) SETTINGS.llm.model = v;
});

// --- Experience: in-game wiki toggle + NORAD ambience volume + design-system link ---
const WIKI_PREF = 'wargames.wiki';
const NORAD_VOL_PREF = 'wargames.noradVol';
function setWikiEnabled(on) {
  SETTINGS.ui.wiki = !!on;
  wiki.setEnabled(SETTINGS.ui.wiki);
  if (ac.wiki) ac.wiki.checked = SETTINGS.ui.wiki;
  try { localStorage.setItem(WIKI_PREF, on ? '1' : '0'); } catch { /* ignore */ }
}
if (ac.wiki) ac.wiki.addEventListener('change', () => setWikiEnabled(ac.wiki.checked));
if (ac.noradVol) {
  ac.noradVol.addEventListener('input', () => {
    const pct = Number(ac.noradVol.value);
    audio.setAmbienceVolume(pct / 100);
    if (ac.noradVolVal) ac.noradVolVal.textContent = `${pct}%`;
    try { localStorage.setItem(NORAD_VOL_PREF, String(pct)); } catch { /* ignore */ }
  });
}
if (ac.designSystem) {
  ac.designSystem.addEventListener('click', () => {
    window.open('design-system.html', '_blank', 'noopener');
  });
}
// Restore saved preferences, then apply.
try {
  const w = localStorage.getItem(WIKI_PREF);
  if (w !== null) SETTINGS.ui.wiki = w === '1';
  const nv = localStorage.getItem(NORAD_VOL_PREF);
  if (nv !== null) audio.setAmbienceVolume(Number(nv) / 100);
} catch { /* ignore */ }
setWikiEnabled(SETTINGS.ui.wiki);

document.getElementById('chess-btn').addEventListener('click', () => {
  if (chess.el.panel.hidden) {
    ttt.close(); // the two mini-game panels share the same dock
    if (!chessStarted) {
      chess.newGame('w');
      chessStarted = true;
    }
    chess.open();
  } else {
    chess.close();
  }
});

document.getElementById('ttt-btn').addEventListener('click', () => {
  if (ttt.el.panel.hidden) {
    chess.close(); // the two mini-game panels share the same dock
    if (!tttStarted) {
      ttt.newGame('X');
      tttStarted = true;
    }
    ttt.open();
  } else {
    ttt.close();
  }
});

// NORAD big board: a manual cutaway toggle (linking Option 1 in DESIGN-IDEA-NORAD-SCENE.md).
// Opening restarts the brute-force animation; closing returns to the terminal in place.
document.getElementById('norad-btn').addEventListener('click', () => {
  norad.toggle();
});

// ---------- Audio on/off (accessible on the terminal AND the NORAD scene) ----------
// Followers opened by URL never clicked CONNECT, so browsers block their audio until a
// gesture. A one-time first-gesture unlock covers that; the AUDIO buttons let any screen
// (bedroom or a parallel NORAD/BEDROOM follower) mute or (re)enable sound + voice.
const AUDIO_PREF = 'wargames.audio';
const audioBtns = [document.getElementById('audio-btn'), document.getElementById('norad-audio')];
function updateAudioButtons() {
  const label = audio.enabled ? 'AUDIO ON' : 'AUDIO OFF';
  for (const b of audioBtns) {
    if (!b) continue;
    b.textContent = label;
    b.classList.toggle('muted', !audio.enabled);
  }
  if (ac.sound) ac.sound.checked = audio.enabled;
}
function setAudioEnabled(on) {
  audio.setEnabled(on);
  if (on) audio.unlock();
  try { localStorage.setItem(AUDIO_PREF, on ? '1' : '0'); } catch { /* ignore */ }
  updateAudioButtons();
}
for (const b of audioBtns) if (b) b.addEventListener('click', () => setAudioEnabled(!audio.enabled));

// Restore the saved audio preference, then unlock on the very first user gesture (so a
// URL-booted follower starts sounding as soon as the operator taps/clicks anything).
try {
  const v = localStorage.getItem(AUDIO_PREF);
  if (v !== null) audio.enabled = v === '1';
} catch { /* ignore */ }
updateAudioButtons();
function firstGestureUnlock() {
  if (audio.enabled) audio.unlock();
  window.removeEventListener('pointerdown', firstGestureUnlock);
  window.removeEventListener('keydown', firstGestureUnlock);
}
window.addEventListener('pointerdown', firstGestureUnlock);
window.addEventListener('keydown', firstGestureUnlock);

// ---------- Multi-device broadcast, rooms, scenes & viewer modes ----------
// Every launched game broadcasts a stable ROOM over the proxy /sync KV (#1); any number of
// NORAD or BEDROOM screens can join it at any time and pick which scene to follow (#3a).
const pairEls = {
  overlay: document.getElementById('pair-overlay'),
  url: document.getElementById('pair-url'),
  room: document.getElementById('pair-room'),
  countdown: document.getElementById('pair-countdown'),
  live: document.getElementById('pair-live'),
  liveControls: document.getElementById('pair-live-controls'),
  resync: document.getElementById('pair-resync'),
  abort: document.getElementById('pair-abort'),
  liveStatus: document.getElementById('pair-live-status'),
  copy: document.getElementById('pair-copy'),
  openHere: document.getElementById('pair-open'),
  close: document.getElementById('pair-close'),
};

let followerPlanKey = ''; // last applied timeline key, so live DEFCON-only pushes don't restart

/**
 * Where the MEDIUM /sync KV lives. The local dev server (serve.mjs) hosts it same-origin;
 * in production it must live on the proxy (GitHub Pages is static) — derive its origin from
 * the configured proxy URL. Falls back to same-origin.
 */
function resolveSyncBase() {
  if (location.port === '8787') return '';
  const p = (SETTINGS.llm.proxyUrl || '').trim();
  if (p) {
    try {
      return new URL(p, location.href).origin;
    } catch {
      /* ignore */
    }
  }
  return '';
}

function setLiveStatus(msg) {
  if (pairEls.liveStatus) pairEls.liveStatus.textContent = msg || '';
}

const roomEls = {
  badge: document.getElementById('room-badge'),
  viewBtn: document.getElementById('view-btn'),
};

// ---------- Broadcast: every launched game publishes a stable ROOM (#1) ----------
// A rolling transcript for the BEDROOM mirror, published debounced to avoid chatter.
let lineBuf = [];
let linePubTimer = null;
function broadcastLine(text, cls) {
  lineBuf.push({ t: text, c: cls });
  if (lineBuf.length > 80) lineBuf = lineBuf.slice(-80);
  if (!liveSession) return;
  liveSession.payload.lines = lineBuf.slice(-40);
  clearTimeout(linePubTimer);
  linePubTimer = setTimeout(() => { if (liveSession) liveSession.publish({}); }, 600);
}

// Sync diagnostics: log to console + telemetry so a failed room fetch is debuggable (#3).
let lastSyncDiag = '';
function syncDiag(msg, detail = {}) {
  lastSyncDiag = msg;
  console.warn(`[sync] ${msg}`, detail);
  try {
    telemetry.event('sync_diag', { msg, ...detail });
  } catch {
    /* telemetry optional */
  }
}

// Create the always-on broadcast for this game (called from startGame). One stable room so any
// number of NORAD/BEDROOM screens can join at any time — useful for takeover events.
async function initBroadcast() {
  lineBuf = [];
  liveSession = SyncSession.createLeader({
    code: 'CPE1704TKS',
    mask: 'LLLDDDDLLL',
    durationMs: 45000,
    mode: 'medium',
    syncBase: resolveSyncBase(),
  });
  liveSession.payload.nameSet = activeNameSetKey;
  liveSession.payload.sessionId = String(Date.now());
  liveSession.payload.lines = [];
  try {
    await liveSession.align();
  } catch {
    /* offline: the room code still shows, but remote joining needs the /sync endpoint */
  }
  updateRoomBadge(null); // "connecting…" until verified

  // Publish the initial state AND verify it round-trips, so we can tell (and show) whether the
  // /sync endpoint is actually reachable — the usual cause of "room not live" join failures is
  // that /sync only exists on the dev server, not on a static host without the proxy.
  const url = liveSession.syncUrl();
  let ok = false;
  try {
    await liveSession.publish({
      status: 'running',
      defcon: engine ? engine.defcon : 5,
      progress: 0,
      phase: 'first_contact',
    });
    const res = await fetch(`${url}?_=${Date.now()}`, { cache: 'no-store' });
    ok = res.ok;
    syncDiag(`broadcast ${ok ? 'LIVE' : 'NOT STORED'} @ ${url} (HTTP ${res.status})`, {
      room: liveSession.payload.room,
      syncBase: liveSession.syncBase || '(same-origin)',
      status: res.status,
      ok,
    });
  } catch (e) {
    syncDiag(`broadcast UNREACHABLE @ ${url}: ${e.message}`, {
      room: liveSession.payload.room,
      syncBase: liveSession.syncBase || '(same-origin)',
      error: String(e.message),
    });
  }
  liveSession.reachable = ok;
  updateRoomBadge(ok);
}

// ok: true = verified live, false = endpoint unreachable, null = checking.
function updateRoomBadge(ok = liveSession ? liveSession.reachable : undefined) {
  if (!roomEls.badge) return;
  if (!liveSession) {
    roomEls.badge.hidden = true;
    return;
  }
  const room = liveSession.payload.room;
  roomEls.badge.hidden = false;
  if (ok === false) {
    roomEls.badge.textContent = `ROOM ${room} (OFFLINE)`;
    roomEls.badge.classList.add('offline');
    roomEls.badge.title = `Sync endpoint unreachable at ${liveSession.syncUrl()}. Other screens can't join until /sync is reachable (dev server or the proxy). ${lastSyncDiag}`;
  } else {
    roomEls.badge.textContent = ok === null ? `ROOM ${room}\u2026` : `ROOM ${room}`;
    roomEls.badge.classList.remove('offline');
    roomEls.badge.title = `This game's room code — click to pair screens. ${lastSyncDiag}`;
  }
}

// ---------- Viewer modes (#3a): single | split | multi ----------
const VIEW_ORDER = ['single', 'split', 'multi'];
function setViewMode(mode) {
  viewMode = mode;
  root.classList.remove('view-single', 'view-split', 'view-multi');
  root.classList.add(`view-${mode}`);
  if (roomEls.viewBtn) roomEls.viewBtn.textContent = `VIEW: ${mode.toUpperCase()}`;
  if (mode === 'split') {
    // Dock the NORAD board beside the terminal, driven locally by this session's engine.
    norad.openCoupled({ code: 'CPE1704TKS', mask: 'LLLDDDDLLL', names: norad.names });
    if (engine) engine.emitState();
  } else if (norad.coupled) {
    norad.close();
  }
  updateRoomBadge();
}

// ---------- PAIR panel: show this game's room + join link + live controls ----------
function pairFollowerUrl(scene) {
  const u = new URL(location.href.split('#')[0].split('?')[0]);
  if (liveSession) u.searchParams.set('room', liveSession.payload.room);
  u.searchParams.set('scene', scene);
  return u.toString();
}

function refreshPairPanel() {
  if (!liveSession) return;
  pairEls.room.textContent = liveSession.payload.room;
  pairEls.url.value = pairFollowerUrl('norad');
}

function openPairPanel() {
  if (!liveSession) return;
  pairEls.overlay.hidden = false;
  if (pairEls.liveControls) pairEls.liveControls.hidden = false;
  refreshPairPanel();
  setLiveStatus(`ROOM ${liveSession.payload.room} — SCREENS MAY JOIN ANYTIME`);
}

function closePairPanel() {
  pairEls.overlay.hidden = true;
}

document.getElementById('pair-btn').addEventListener('click', openPairPanel);
if (roomEls.badge) roomEls.badge.addEventListener('click', openPairPanel);
if (roomEls.viewBtn) {
  roomEls.viewBtn.addEventListener('click', () => {
    const i = VIEW_ORDER.indexOf(viewMode);
    setViewMode(VIEW_ORDER[(i + 1) % VIEW_ORDER.length]);
  });
}
pairEls.close.addEventListener('click', closePairPanel);
pairEls.resync.addEventListener('click', async () => {
  // Restart the sequence on every connected screen (fresh seed).
  if (!liveSession) return;
  liveSession.payload.seed = (Math.random() * 0x7fffffff) >>> 0;
  liveSession.payload.status = 'running';
  await liveSession.publish({});
  setLiveStatus('RESYNC PUSHED TO ALL SCREENS');
});
pairEls.abort.addEventListener('click', async () => {
  if (!liveSession) return;
  await liveSession.publish({ status: 'aborted' });
  setLiveStatus('ABORT PUSHED TO ALL SCREENS');
});
pairEls.copy.addEventListener('click', async () => {
  pairEls.url.select();
  try {
    await navigator.clipboard.writeText(pairEls.url.value);
    pairEls.copy.textContent = 'COPIED';
    setTimeout(() => { pairEls.copy.textContent = 'COPY LINK'; }, 1500);
  } catch {
    document.execCommand('copy'); // fallback for non-secure contexts
  }
});
// "OPEN HERE" previews both scenes on THIS device by switching to split view.
pairEls.openHere.addEventListener('click', () => {
  closePairPanel();
  setViewMode('split');
});
// The old LIVE checkbox is obsolete (every game broadcasts live); hide its row if present.
if (pairEls.live) {
  const row = pairEls.live.closest('.pair-toggle');
  if (row) row.hidden = true;
}

/**
 * Run a device as a follower on a chosen SCENE. scene='norad' → the coupled big board that
 * mirrors the session's pacing (or a deterministic board for ?sync= easy links). scene=
 * 'bedroom' → a read-only terminal that mirrors the leader's live transcript + DEFCON.
 */
async function runFollower(session, scene = 'norad') {
  const setKey = session.payload.nameSet;
  norad.names = (setKey && NAME_SETS[setKey]) || norad.names || NAME_SETS[DEFAULT_NAME_SET];
  els.menuOverlay.hidden = true;
  await session.align();
  if (scene === 'bedroom') {
    runBedroomMirror(session);
    return;
  }
  if (session.mode === 'medium') {
    norad.openCoupled({
      code: session.payload.code,
      mask: session.payload.mask,
      names: norad.names,
    });
    session.subscribe((state) => norad.applyState(state));
  } else {
    followerPlanKey = planKey(session.payload);
    norad.openScheduled(session.plan());
  }
}

// A read-only BEDROOM terminal that mirrors the leader's live transcript + DEFCON (#3a Multi).
function runBedroomMirror(session) {
  els.statusbar.hidden = false;
  els.terminal.hidden = false;
  const inputRow = document.getElementById('input-row');
  if (inputRow) inputRow.hidden = true;
  const choices = document.getElementById('choices');
  if (choices) choices.hidden = true;
  terminal.setMode('BEDROOM \u00b7 LIVE MIRROR');
  const render = (state) => {
    if (typeof state.defcon === 'number') terminal.setDefcon(state.defcon);
    if (Array.isArray(state.lines)) renderMirrorLines(state.lines);
  };
  render(session.payload);
  session.subscribe(render);
}

function renderMirrorLines(lines) {
  const out = document.getElementById('output');
  if (!out) return;
  out.innerHTML = '';
  for (const ln of lines) {
    const div = document.createElement('div');
    div.className = `line ${ln.c || 'system'}`;
    div.textContent = ln.t;
    out.appendChild(div);
  }
  const scroller = out.closest('.terminal') || out.parentElement;
  if (scroller) scroller.scrollTop = scroller.scrollHeight;
  speakNewMirrorLines(lines);
}

// Speak the machine/persona dialogue as it arrives on a BEDROOM mirror, so a parallel screen
// plays out the scene with voice. The first render only PRIMES (no speak) so a follower that
// joins mid-session doesn't dump the whole backlog at once — it voices only new lines after.
const MIRROR_VOICE = new Set(['system', 'alert', 'ending', 'echo', 'critical']);
function speakNewMirrorLines(lines) {
  if (!lines.length) return;
  const key = (ln) => `${ln.c}|${ln.t}`;
  if (!mirrorPrimed) {
    mirrorPrimed = true;
    lastMirrorKey = key(lines[lines.length - 1]);
    return;
  }
  if (!audio.enabled) {
    lastMirrorKey = key(lines[lines.length - 1]);
    return;
  }
  let start = 0;
  if (lastMirrorKey) {
    const idx = lines.map(key).lastIndexOf(lastMirrorKey);
    start = idx >= 0 ? idx + 1 : Math.max(0, lines.length - 1);
  }
  for (let i = start; i < lines.length; i += 1) {
    const cls = String(lines[i].c || '').split(/\s+/);
    if (cls.some((c) => MIRROR_VOICE.has(c))) audio.speak(lines[i].t);
  }
  lastMirrorKey = key(lines[lines.length - 1]);
}

function planKey(p) {
  return `${p.epochStart}:${p.seed}:${p.durationMs}:${p.code}`;
}

/**
 * If the page is opened with a ?sync=<payload> param, this device is the NORAD FOLLOWER: a
 * pure big-board display. Skip the menu and run the scheduled crack so it stays calibrated
 * with the leader (bedroom) device. ?live=1 selects the MEDIUM tier (live leader pushes);
 * otherwise it runs the EASY deterministic timeline. ?room=CODE joins a live room by its
 * short code (no giant link) by fetching the published state.
 * @returns {Promise<boolean>} true if it booted as a follower
 */
async function maybeBootstrapFollower() {
  const params = new URLSearchParams(location.search);
  const scene = params.get('scene') === 'bedroom' ? 'bedroom' : 'norad';

  // Join-by-room: the lightweight path (short code, no huge hash).
  const roomParam = params.get('room');
  if (roomParam) {
    try {
      const session = await SyncSession.joinByRoom(roomParam, { syncBase: resolveSyncBase() });
      await runFollower(session, scene);
      return true;
    } catch (e) {
      console.warn('join by room failed:', e);
      return false; // leave the menu up so the user can retry via the JOIN field
    }
  }

  const syncParam = params.get('sync');
  if (!syncParam) return false;
  const mode = params.get('live') === '1' ? 'medium' : 'easy';
  let session;
  try {
    session = SyncSession.fromString(syncParam, { syncBase: resolveSyncBase(), mode });
  } catch (e) {
    console.warn('Invalid ?sync= payload; ignoring.', e);
    return false;
  }
  await runFollower(session, scene);
  return true;
}

// Start-menu JOIN: run this device as a follower on the chosen scene by typing the room code.
const joinEls = {
  input: document.getElementById('join-room'),
  scene: document.getElementById('join-scene'),
  btn: document.getElementById('join-btn'),
  hint: document.getElementById('join-hint'),
};
async function joinByRoomCode() {
  const room = (joinEls.input.value || '').trim();
  if (!room) {
    joinEls.hint.textContent = 'Enter the room code shown on the first device (ROOM badge / PAIR panel).';
    return;
  }
  const scene = joinEls.scene ? joinEls.scene.value : 'norad';
  joinEls.hint.textContent = `Joining ${room.toUpperCase()} as ${scene.toUpperCase()}\u2026`;
  try {
    const session = await SyncSession.joinByRoom(room, { syncBase: resolveSyncBase() });
    audio.unlock(); // this click is a valid user gesture for audio
    await runFollower(session, scene);
  } catch (e) {
    joinEls.hint.textContent = e.message || 'Could not join that room.';
  }
}
joinEls.btn.addEventListener('click', joinByRoomCode);
joinEls.input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinByRoomCode();
});

els.restartBtn.addEventListener('click', () => {
  stopTelemetryTicker();
  els.statusbar.hidden = true;
  els.terminal.hidden = true;
  acClose();
  acResetPanel();
  chess.close();
  ttt.close();
  norad.close();
  // Tear down the broadcast so the next game gets a fresh room.
  if (liveSession) liveSession.stop();
  liveSession = null;
  terminal.onLine = null;
  clearTimeout(linePubTimer);
  updateRoomBadge();
  setViewMode('single');
  terminal.clear();
  els.menuOverlay.hidden = false;
});

// ---------- Init ----------
populateNameSets();
prefillLlmFields();
// Restore the launch-control intro preference.
try {
  const v = localStorage.getItem(INTRO_PREF_STORE);
  if (v !== null && els.introToggle) els.introToggle.checked = v === '1';
} catch {
  /* ignore */
}
loadProxyDiscovery();
maybeBootstrapFollower();
// Replace the native (white) <select> popups with the themed green .wg-select dropdown. Done
// after the name sets are populated so their options exist. The native selects stay the source
// of truth, so all existing value reads / 'change' listeners keep working.
['nameset-select', 'mode-select', 'join-scene', 'cp-tone', 'cp-mind', 'cp-mind-alt'].forEach((id) => {
  const el = document.getElementById(id);
  if (el) enhanceSelect(el);
});
// Reflect the film title token in the menu subtitle if desired later via applyNames.
void applyNames;
