// main.js
// Bootstraps the app: builds the start menu (identity set, mode, optional LLM config),
// wires the telemetry panel, and launches the engine. Keeps a thin layer of DOM glue so
// the engine/terminal/telemetry modules stay UI-framework-free.

import { NAME_SETS, DEFAULT_NAME_SET, SETTINGS, applyNames } from './config.js';
import { Terminal } from './terminal.js';
import { Telemetry } from './telemetry.js';
import { GameEngine } from './engine.js';
import { AudioFx } from './audio.js';

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
  telemetryBtn: document.getElementById('telemetry-btn'),
  restartBtn: document.getElementById('restart-btn'),
  soundBtn: document.getElementById('sound-btn'),
  telemetryOverlay: document.getElementById('telemetry-overlay'),
  telemetryBody: document.getElementById('telemetry-body'),
  telemetryClose: document.getElementById('telemetry-close'),
  telemetryExport: document.getElementById('telemetry-export'),
};

const LLM_KEY_STORE = 'wargames.llm.apiKey';
const telemetry = new Telemetry(SETTINGS.telemetry);
const audio = new AudioFx();
const terminal = new Terminal(root);
terminal.setAudio(audio);
let telemetryTimer = null;

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
  if (p.managed) {
    els.llmEndpoint.value = p.url;
    els.llmModel.value = 'openai/gpt-4o-mini';
    els.llmKey.value = 'proxy-managed';
  } else {
    els.llmEndpoint.value = SETTINGS.llm.endpoint;
    els.llmModel.value = SETTINGS.llm.model;
    try {
      els.llmKey.value = localStorage.getItem(LLM_KEY_STORE) || '';
    } catch {
      /* ignore */
    }
  }
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
    SETTINGS.llm.model = els.llmModel.value.trim() || SETTINGS.llm.model;
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
    if (!els.telemetryOverlay.hidden) refreshTelemetryPanel();
  }, 1000);
}
function stopTelemetryTicker() {
  if (telemetryTimer) clearInterval(telemetryTimer);
  telemetryTimer = null;
}
function refreshTelemetryPanel() {
  els.telemetryBody.textContent = telemetry.toText();
}

els.telemetryBtn.addEventListener('click', () => {
  refreshTelemetryPanel();
  els.telemetryOverlay.hidden = false;
});
els.telemetryClose.addEventListener('click', () => {
  els.telemetryOverlay.hidden = true;
});

els.soundBtn.addEventListener('click', () => {
  const on = !audio.enabled;
  audio.setEnabled(on);
  if (on) audio.unlock();
  els.soundBtn.textContent = `SOUND: ${on ? 'ON' : 'OFF'}`;
});
els.telemetryExport.addEventListener('click', () => {
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
  ac.model.value = SETTINGS.llm.model || '';
}

function acOpen() {
  acSyncConfigInputs();
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
  els.soundBtn.textContent = `SOUND: ${ac.sound.checked ? 'ON' : 'OFF'}`;
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

els.restartBtn.addEventListener('click', () => {
  stopTelemetryTicker();
  els.statusbar.hidden = true;
  els.terminal.hidden = true;
  els.telemetryOverlay.hidden = true;
  acClose();
  acResetPanel();
  terminal.clear();
  els.menuOverlay.hidden = false;
});

// ---------- Init ----------
populateNameSets();
prefillLlmFields();
// Reflect the film title token in the menu subtitle if desired later via applyNames.
void applyNames;
