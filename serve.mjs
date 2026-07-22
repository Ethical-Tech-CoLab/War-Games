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
  if (req.method === 'GET') return handleStatic(req, res);
  res.writeHead(405, { 'Content-Type': 'text/plain' });
  res.end('Method Not Allowed');
});

server.listen(PORT, () => {
  console.log(`\n  WarGames local play server`);
  console.log(`  ---------------------------------------------`);
  console.log(`  Game:   http://localhost:${PORT}`);
  console.log(`  Proxy:  POST /v1/chat/completions -> ${CFG.endpoint}`);
  console.log(`  Token:  ${CFG.token ? 'loaded from sim/.env.local (server-side)' : 'MISSING'}`);
  console.log(`  ---------------------------------------------`);
  console.log(`  Open the URL, choose "Live AI", and the model fields are pre-filled.\n`);
});
