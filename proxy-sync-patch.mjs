// proxy-sync-patch.mjs
// Idempotently add a multi-device room-sync KV (GET/POST /sync/:room) to the running
// pages-ai-proxy, reusing its existing CORS/origin allow-list. Safe to re-run: it no-ops if
// the endpoint is already present. Run on the proxy host:  node /tmp/proxy-sync-patch.mjs
import fs from 'node:fs';

const CORE = '/opt/pages-ai-proxy/src/proxy-core.mjs';
const SRV = '/opt/pages-ai-proxy/local-server.mjs';

// ---- 1) Core: add the KV store + routing + advertise GET in CORS ----
let core = fs.readFileSync(CORE, 'utf8');
if (core.includes('SYNC_ROOMS')) {
  console.log('proxy-core.mjs: already patched (SYNC_ROOMS present) — skipping');
} else {
  const storeAnchor = "const DEFAULT_UPSTREAM = 'https://models.github.ai/inference/chat/completions';";
  if (!core.includes(storeAnchor)) throw new Error('core: DEFAULT_UPSTREAM anchor not found');
  const storeCode = [
    '',
    '// ---------- Multi-device room sync KV (War Games NORAD/BEDROOM screens) ----------',
    '// A tiny in-memory, room-keyed state store so a static site can pair screens. Server owns',
    '// the monotonic rev; idle rooms are pruned. Reuses the proxy CORS/origin allow-list below.',
    'const SYNC_ROOMS = new Map(); // room -> { state, rev, updatedAt }',
    'const SYNC_TTL_MS = 30 * 60 * 1000;',
    'function pruneSyncRooms() {',
    '  const now = Date.now();',
    '  for (const [r, e] of SYNC_ROOMS) if (now - e.updatedAt > SYNC_TTL_MS) SYNC_ROOMS.delete(r);',
    '}',
  ].join('\n');
  core = core.replace(storeAnchor, storeAnchor + '\n' + storeCode);

  const optAnchor = "if (method === 'OPTIONS') return { status: 204, headers: cors, body: '' };";
  if (!core.includes(optAnchor)) throw new Error('core: OPTIONS anchor not found');
  const routeCode = [
    optAnchor,
    '',
    '  // Room sync KV: GET returns latest state; POST (origin-gated) stores it with a server rev.',
    '  if (path.includes(\'/sync/\')) {',
    '    const room = decodeURIComponent((path.split(\'/sync/\')[1] || \'\').split(\'?\')[0]).trim();',
    '    if (!room) return json(400, { error: \'room required\' }, cors);',
    '    if (method === \'GET\') {',
    '      pruneSyncRooms();',
    '      const e = SYNC_ROOMS.get(room);',
    '      if (!e) return json(404, { error: \'no such room\' }, cors);',
    '      return json(200, { ...e.state, rev: e.rev }, cors);',
    '    }',
    '    if (method === \'POST\') {',
    '      if (!originAllowed) return json(403, { error: \'Origin not allowed: \' + (origin || \'(none)\') }, cors);',
    '      const maxBytes = Number(env.MAX_BODY_BYTES) || 100000;',
    '      if (bodyText && bodyText.length > maxBytes) return json(413, { error: \'Request body too large.\' }, cors);',
    '      let state;',
    '      try { state = JSON.parse(bodyText || \'{}\'); } catch { return json(400, { error: \'Invalid JSON body.\' }, cors); }',
    '      pruneSyncRooms();',
    '      const prev = SYNC_ROOMS.get(room);',
    '      const rev = (prev ? prev.rev : 0) + 1;',
    '      SYNC_ROOMS.set(room, { state, rev, updatedAt: Date.now() });',
    '      return json(200, { ...state, rev }, cors);',
    '    }',
    '    return json(405, { error: \'Method not allowed.\' }, cors);',
    '  }',
  ].join('\n');
  core = core.replace(optAnchor, routeCode);

  core = core.replace(
    "'Access-Control-Allow-Methods': 'POST, OPTIONS',",
    "'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',"
  );

  fs.writeFileSync(CORE, core);
  console.log('proxy-core.mjs: PATCHED');
}

// ---- 2) Server: let /sync/ through the known-path gate ----
let srv = fs.readFileSync(SRV, 'utf8');
if (srv.includes("'/sync/'") || srv.includes('/sync/')) {
  console.log('local-server.mjs: already routes /sync/ — skipping');
} else {
  const gateAnchor = "p.endsWith('/healthz');";
  if (!srv.includes(gateAnchor)) throw new Error('server: /healthz gate anchor not found');
  srv = srv.replace(gateAnchor, "p.endsWith('/healthz') ||\n    p.includes('/sync/');");
  fs.writeFileSync(SRV, srv);
  console.log('local-server.mjs: PATCHED');
}

console.log('patch complete');
