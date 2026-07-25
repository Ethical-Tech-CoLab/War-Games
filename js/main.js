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
import { NoradScene } from './norad.js';
import { SyncSession } from './sync.js';

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
  statusbar: document.getElementById('statusbar'),
  terminal: document.getElementById('terminal'),
  modeBadge: document.getElementById('mode-badge'),
  restartBtn: document.getElementById('restart-btn'),
};

const LLM_KEY_STORE = 'wargames.llm.apiKey';
const telemetry = new Telemetry(SETTINGS.telemetry);
const audio = new AudioFx();
const terminal = new Terminal(root);
terminal.setAudio(audio);
const chess = new ChessPanel(root, { audio });
const norad = new NoradScene(root);
let chessStarted = false;
let telemetryTimer = null;
let pairLeader = null; // SyncSession (leader) minted for the pairing panel
let pairCountdownTimer = null;

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

  // Unlock audio here — this click is the required user gesture for WebAudio/speech.
  audio.unlock();

  startGame({ names, nameSetKey, mode });
});

async function startGame({ names, nameSetKey, mode }) {
  els.menuOverlay.hidden = true;
  els.statusbar.hidden = false;
  els.terminal.hidden = false;

  // Reset the Admin Console feed and apply the AI-marker preference for this run.
  acResetPanel();
  root.classList.toggle('hide-ai-marker', SETTINGS.ui.aiMarker === false);
  chess.setPersona(names.PERSONA);
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

  const engine = new GameEngine({ terminal, telemetry, names, mode });
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
  audio.setEnabled(ac.sound.checked);
  if (ac.sound.checked) audio.unlock();
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

document.getElementById('chess-btn').addEventListener('click', () => {
  if (chess.el.panel.hidden) {
    if (!chessStarted) {
      chess.newGame('w');
      chessStarted = true;
    }
    chess.open();
  } else {
    chess.close();
  }
});

// NORAD big board: a manual cutaway toggle (linking Option 1 in DESIGN-IDEA-NORAD-SCENE.md).
// Opening restarts the brute-force animation; closing returns to the terminal in place.
document.getElementById('norad-btn').addEventListener('click', () => {
  norad.toggle();
});

// ---------- Device pairing (multi-device sync — DESIGN-IDEA-NORAD-SCENE.md §8) ----------
// EASY = deterministic shared-seed pairing (no live server state). MEDIUM = live
// leader→follower over the proxy /sync KV; the leader can push RESYNC/ABORT/DEFCON and the
// follower reacts within ~1s. The "LIVE SYNC" checkbox chooses the tier.
const LEAD_MS = 20000; // lead time to carry/scan the link to the second screen
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

function buildLeader(room) {
  return SyncSession.createLeader({
    code: 'CPE1704TKS',
    mask: 'LLLDDDDLLL',
    durationMs: 45000,
    leadMs: LEAD_MS,
    room,
    mode: pairEls.live.checked ? 'medium' : 'easy',
    syncBase: resolveSyncBase(),
  });
}

function setLiveStatus(msg) {
  if (pairEls.liveStatus) pairEls.liveStatus.textContent = msg || '';
}

function refreshPairUrl() {
  pairEls.url.value = pairLeader.followerUrl();
  pairEls.room.textContent = pairLeader.payload.room;
}

function restartPairCountdown() {
  stopPairCountdown();
  const tick = () => {
    const secs = Math.max(0, Math.ceil((pairLeader.payload.epochStart - pairLeader.now()) / 1000));
    pairEls.countdown.textContent = `${secs}S`;
    if (secs <= 0) stopPairCountdown();
  };
  tick();
  pairCountdownTimer = setInterval(tick, 500);
}

function stopPairCountdown() {
  clearInterval(pairCountdownTimer);
  pairCountdownTimer = null;
}

// (Re)mint the leader timeline in the currently-selected tier, aligning the clock so the
// shared epoch is expressed in the common reference frame. In MEDIUM it also creates the room.
async function armLeader(room) {
  pairLeader = buildLeader(room);
  await pairLeader.align();
  pairLeader.payload.epochStart = pairLeader.now() + LEAD_MS;
  refreshPairUrl();
  restartPairCountdown();
  if (pairLeader.mode === 'medium') {
    await pairLeader.publish({ status: 'running' });
    setLiveStatus(`ROOM ${pairLeader.payload.room} LIVE`);
  } else {
    setLiveStatus('');
  }
}

async function openPairPanel() {
  pairEls.overlay.hidden = false;
  pairEls.liveControls.hidden = !pairEls.live.checked;
  await armLeader();
}

function closePairPanel() {
  stopPairCountdown();
  pairEls.overlay.hidden = true;
}

document.getElementById('pair-btn').addEventListener('click', openPairPanel);
pairEls.close.addEventListener('click', closePairPanel);
pairEls.live.addEventListener('change', async () => {
  pairEls.liveControls.hidden = !pairEls.live.checked;
  await armLeader(); // rebuild in the newly-chosen tier
});
pairEls.resync.addEventListener('click', async () => {
  // Restart the sequence on every screen: new epoch (short lead) + new seed.
  pairLeader.payload.epochStart = pairLeader.now() + 8000;
  pairLeader.payload.seed = (Math.random() * 0x7fffffff) >>> 0;
  pairLeader.payload.status = 'running';
  await pairLeader.publish({});
  refreshPairUrl();
  restartPairCountdown();
  setLiveStatus('RESYNC PUSHED');
});
pairEls.abort.addEventListener('click', async () => {
  await pairLeader.publish({ status: 'aborted' });
  setLiveStatus('ABORT PUSHED');
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
// Preview the follower board on THIS device (useful for single-machine testing).
pairEls.openHere.addEventListener('click', () => {
  closePairPanel();
  const follower = SyncSession.fromString(pairLeader.encode(), {
    syncBase: resolveSyncBase(),
    mode: pairLeader.mode,
  });
  runFollower(follower);
});

/** Run a device as the NORAD follower: align, open the scheduled board, and (MEDIUM) react to
 *  live leader pushes. Shared by the same-device preview and the ?sync= bootstrap. */
async function runFollower(session) {
  norad.names = norad.names || NAME_SETS[DEFAULT_NAME_SET];
  await session.align();
  followerPlanKey = planKey(session.payload);
  norad.openScheduled(session.plan());
  if (session.mode === 'medium') {
    session.subscribe((state) => applyFollowerState(session, state));
  }
}

function planKey(p) {
  return `${p.epochStart}:${p.seed}:${p.durationMs}:${p.code}`;
}

// Apply a live leader push: DEFCON updates in place; abort halts; a changed timeline restarts.
function applyFollowerState(session, state) {
  if (typeof state.defcon === 'number') norad.setDefcon(state.defcon);
  if (state.status === 'aborted') {
    norad.abort();
    return;
  }
  const key = planKey(state);
  if (key !== followerPlanKey) {
    followerPlanKey = key;
    norad.openScheduled(session.plan());
  }
}

/**
 * If the page is opened with a ?sync=<payload> param, this device is the NORAD FOLLOWER: a
 * pure big-board display. Skip the menu and run the scheduled crack so it stays calibrated
 * with the leader (bedroom) device. ?live=1 selects the MEDIUM tier (live leader pushes);
 * otherwise it runs the EASY deterministic timeline.
 * @returns {Promise<boolean>} true if it booted as a follower
 */
async function maybeBootstrapFollower() {
  const params = new URLSearchParams(location.search);
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
  els.menuOverlay.hidden = true;
  await runFollower(session);
  return true;
}

els.restartBtn.addEventListener('click', () => {
  stopTelemetryTicker();
  els.statusbar.hidden = true;
  els.terminal.hidden = true;
  acClose();
  acResetPanel();
  chess.close();
  terminal.clear();
  els.menuOverlay.hidden = false;
});

// ---------- Init ----------
populateNameSets();
prefillLlmFields();
loadProxyDiscovery();
maybeBootstrapFollower();
// Reflect the film title token in the menu subtitle if desired later via applyNames.
void applyNames;
