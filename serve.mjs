// serve.mjs
// Local play server for the WarGames-inspired game with a REAL model behind it.
// It does two jobs:
//   1) Serves the static game (index.html, css, js) from the project root.
//   2) Exposes an OpenAI-compatible POST /v1/chat/completions endpoint that PROXIES to
//      GitHub Models, injecting your token from sim/.env.local server-side. This keeps the
//      token out of the browser and avoids CORS entirely (same-origin request).
//
// Usage:
//   node serve.mjs            (defaults to http://localhost:8787)
//   node serve.mjs --port 9000
//
// The token is read from sim/.env.local (git-ignored). Nothing is logged except status.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function argVal(flag, def) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const PORT = Number(argVal('--port', '8787'));

// ---------- Load token from sim/.env.local (defensive cleaning) ----------
function loadEnv() {
  const file = path.join(__dirname, 'sim', '.env.local');
  const env = {};
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m) env[m[1]] = m[2].trim().replace(/^["'<]+|["'>]+$/g, '');
    }
  }
  return {
    token: process.env.GITHUB_TOKEN || env.GITHUB_TOKEN || '',
    endpoint:
      process.env.GH_MODELS_ENDPOINT ||
      env.GH_MODELS_ENDPOINT ||
      'https://models.github.ai/inference/chat/completions',
  };
}
const CFG = loadEnv();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function safeJoin(root, urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const p = path.normalize(path.join(root, decoded));
  if (!p.startsWith(root)) return null; // block path traversal
  return p;
}

async function handleProxy(req, res) {
  if (!CFG.token) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'No GITHUB_TOKEN in sim/.env.local' }));
    return;
  }
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', async () => {
    try {
      const payload = JSON.parse(body || '{}');
      const started = Date.now();
      const upstream = await fetch(CFG.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${CFG.token}`, // injected server-side
        },
        body: JSON.stringify(payload),
      });
      const text = await upstream.text();
      const model = payload.model || '?';
      console.log(`[proxy] ${model} -> ${upstream.status} in ${Date.now() - started}ms`);
      res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
      res.end(text);
    } catch (err) {
      console.error('[proxy] error:', err.message);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(err.message) }));
    }
  });
}

// ---------- Multi-device sync KV (MEDIUM tier — DESIGN-IDEA-NORAD-SCENE.md §8.3) ----------
// A tiny room-keyed key/value store so the bedroom (leader) device can push live SyncState
// and the NORAD (follower) device can poll it. In-memory only, monotonic rev per room, and
// idle rooms are pruned. This mirrors what the production pages-ai-proxy must expose; here it
// runs same-origin on the dev server so two localhost tabs can sync live.
const SYNC_ROOMS = new Map(); // room -> { state, rev, updatedAt }
const SYNC_ROOM_TTL_MS = 30 * 60 * 1000; // prune rooms idle > 30 min
const SYNC_MAX_BODY = 16 * 1024; // 16 KB cap on a SyncState payload

function pruneSyncRooms() {
  const now = Date.now();
  for (const [room, entry] of SYNC_ROOMS) {
    if (now - entry.updatedAt > SYNC_ROOM_TTL_MS) SYNC_ROOMS.delete(room);
  }
}

function syncCors(res) {
  // The production proxy gates by an origin allow-list; the dev server is permissive so two
  // localhost tabs (or a second LAN device) can reach it during testing.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function handleSync(req, res) {
  syncCors(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  pruneSyncRooms();
  const room = decodeURIComponent(req.url.split('?')[0].slice('/sync/'.length)).trim();
  if (!room) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'room required' }));
    return;
  }

  if (req.method === 'GET') {
    const entry = SYNC_ROOMS.get(room);
    if (!entry) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'no such room' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ...entry.state, rev: entry.rev }));
    return;
  }

  if (req.method === 'POST') {
    let body = '';
    let tooBig = false;
    req.on('data', (c) => {
      body += c;
      if (body.length > SYNC_MAX_BODY) {
        tooBig = true;
        req.destroy();
      }
    });
    req.on('end', () => {
      if (tooBig) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'payload too large' }));
        return;
      }
      let state;
      try {
        state = JSON.parse(body || '{}');
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid json' }));
        return;
      }
      const prev = SYNC_ROOMS.get(room);
      const rev = (prev ? prev.rev : 0) + 1; // server owns the monotonic rev
      SYNC_ROOMS.set(room, { state, rev, updatedAt: Date.now() });
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ...state, rev }));
    });
    return;
  }

  res.writeHead(405, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'method not allowed' }));
}

function handleStatic(req, res) {
  const pathOnly = req.url.split('?')[0];
  let urlPath = pathOnly === '/' ? '/index.html' : pathOnly;
  const full = safeJoin(__dirname, urlPath);
  if (!full || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
    return;
  }
  const ext = path.extname(full).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': 'no-store', // always serve fresh during local play/dev
  });
  fs.createReadStream(full).pipe(res);
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url.startsWith('/v1/chat/completions')) {
    return handleProxy(req, res);
  }
  if (req.url.startsWith('/sync/')) return handleSync(req, res);
  if (req.method === 'GET') return handleStatic(req, res);
  res.writeHead(405, { 'Content-Type': 'text/plain' });
  res.end('Method Not Allowed');
});

server.listen(PORT, () => {
  console.log(`\n  WarGames local play server`);
  console.log(`  ---------------------------------------------`);
  console.log(`  Game:   http://localhost:${PORT}`);
  console.log(`  Proxy:  POST /v1/chat/completions -> ${CFG.endpoint}`);
  console.log(`  Sync:   GET/POST /sync/:room (multi-device NORAD sync, in-memory)`);
  console.log(`  Token:  ${CFG.token ? 'loaded from sim/.env.local (server-side)' : 'MISSING'}`);
  console.log(`  ---------------------------------------------`);
  console.log(`  Open the URL, choose "Live AI", and the model fields are pre-filled.\n`);
});
