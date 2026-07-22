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

function prefillLlmFields() {
  // When served by the local proxy (serve.mjs on :8787), route through it: the token is
  // injected server-side, so the browser never holds it.
  const servedByProxy = location.port === '8787';
  if (servedByProxy && location.protocol.startsWith('http')) {
    els.llmEndpoint.value = '/v1/chat/completions';
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
  const mode = els.modeSelect.value;

  if (mode === 'llm') {
    SETTINGS.llm.endpoint = els.llmEndpoint.value.trim() || SETTINGS.llm.endpoint;
    SETTINGS.llm.model = els.llmModel.value.trim() || SETTINGS.llm.model;
    SETTINGS.llm.apiKey = els.llmKey.value.trim();
    if (!SETTINGS.llm.apiKey) {
      alert('Live AI mode needs an API key (stored only in your browser). ' +
        'Or choose Scripted mode.');
      return;
    }
    try {
      localStorage.setItem(LLM_KEY_STORE, SETTINGS.llm.apiKey);
    } catch {
      /* ignore */
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

els.restartBtn.addEventListener('click', () => {
  stopTelemetryTicker();
  els.statusbar.hidden = true;
  els.terminal.hidden = true;
  els.telemetryOverlay.hidden = true;
  terminal.clear();
  els.menuOverlay.hidden = false;
});

// ---------- Init ----------
populateNameSets();
prefillLlmFields();
// Reflect the film title token in the menu subtitle if desired later via applyNames.
void applyNames;
