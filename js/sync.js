// sync.js
// Transport-agnostic multi-device sync layer for the NORAD ↔ bedroom two-screen setup
// (see DESIGN-IDEA-NORAD-SCENE.md §8). Two devices in one room stay calibrated like the
// film's intercutting: one shows the bedroom terminal, one shows the NORAD board.
//
// This module implements the EASY tier — "deterministic shared-seed pairing" — and is
// deliberately structured so the MEDIUM tier ("proxy KV + polling") drops in behind the
// same SyncSession API without touching callers (norad.js / main.js). The Medium hooks
// (publish/subscribe) are stubbed and clearly marked; they are inert until mode === 'medium'.
//
// EASY design (no live server state):
//   1. The leader (bedroom) mints a payload {epochStart, seed, code, mask, durationMs, calib}.
//   2. It hands that payload to the follower (NORAD) via a URL param / room code (§8.3 Easy).
//   3. Both devices align their clocks once to a shared reference (the page origin's Date
//      header — Cristian's algorithm, §8.2) and then run the SAME deterministic timeline off
//      their own corrected clocks. No per-frame chatter; robust even if the network blips.

// ---------- Seeded PRNG (mulberry32) ----------
// Deterministic so both devices compute the identical solve order from the shared seed.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Number of real (non-gap) cells in a code, matching NoradScene's cell-building rules. */
export function countCells(code, mask) {
  let n = 0;
  for (let i = 0; i < code.length; i += 1) {
    const ch = code[i];
    const m = mask ? mask[i] : '';
    if (ch === ' ' || ch === '-' || m === ' ') continue;
    n += 1;
  }
  return n;
}

/** Deterministic solve order (a seeded Fisher–Yates shuffle of cell indices). */
export function buildSolveOrder(n, seed) {
  const rng = mulberry32(seed);
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- Payload encode/decode (URL-safe base64 of JSON, unicode-safe) ----------
export function encodePayload(obj) {
  const json = JSON.stringify(obj);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodePayload(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const json = decodeURIComponent(escape(atob(b64)));
  return JSON.parse(json);
}

/** A short, human-readable room code, e.g. "DELTA-9". */
function randomRoom() {
  const words = ['ALPHA', 'BRAVO', 'DELTA', 'ECHO', 'FOXTROT', 'GOLF', 'KILO', 'ROMEO', 'TANGO', 'ZULU'];
  const w = words[Math.floor(Math.random() * words.length)];
  const n = Math.floor(Math.random() * 90) + 10;
  return `${w}-${n}`;
}

/**
 * Cristian's algorithm against a shared reference clock (§8.2). We align to the PAGE
 * ORIGIN's `Date` response header — if both devices load the game from the same origin, that
 * origin's clock is the common reference. `Date` is a CORS-safelisted header (readable even
 * cross-origin) but has 1-second resolution, so this is a coarse (~±0.5s) correction on top
 * of the devices' NTP-synced clocks — plenty for a multi-second crack. Falls back to 0.
 * @returns {Promise<number>} estimated (referenceClock − localClock) in ms
 */
export async function estimateClockOffset(url, samples = 5) {
  let best = null; // keep the sample with the smallest round-trip (least uncertainty)
  for (let i = 0; i < samples; i += 1) {
    try {
      const t0 = Date.now();
      // eslint-disable-next-line no-await-in-loop
      const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}_ts=${t0}`, {
        method: 'GET',
        cache: 'no-store',
      });
      const t1 = Date.now();
      const dateHdr = res.headers.get('date');
      if (!dateHdr) continue;
      const serverMs = new Date(dateHdr).getTime();
      if (Number.isNaN(serverMs)) continue;
      const rtt = t1 - t0;
      const offset = serverMs + rtt / 2 - t1;
      if (best === null || rtt < best.rtt) best = { rtt, offset };
    } catch {
      /* ignore and try the next sample */
    }
  }
  return best ? best.offset : 0;
}

/** Default shared-reference URL: a small same-origin resource that carries a Date header. */
function defaultAlignUrl() {
  return new URL('ai-proxy.json', location.href).toString();
}

/**
 * A sync session shared by both roles. EASY is fully implemented; MEDIUM is prepared behind
 * the same surface (publish/subscribe) so callers never change when we turn it on.
 */
export class SyncSession {
  /**
   * @param {object} o
   *   mode      {'easy'|'medium'} default 'easy'
   *   role      {'leader'|'follower'} the bedroom drives; NORAD follows
   *   payload   {object} the shared SyncState
   *   alignUrl  {string} shared-reference URL for clock offset (default: same-origin)
   *   syncBase  {string} URL prefix for the MEDIUM /sync KV (default '' = same-origin dev
   *             server; in production this is the proxy origin, e.g. 'https://proxy.example')
   */
  constructor({ mode = 'easy', role = 'follower', payload = null, alignUrl = '', syncBase = '' } = {}) {
    this.mode = mode;
    this.role = role;
    this.payload = payload;
    this.alignUrl = alignUrl || defaultAlignUrl();
    this.syncBase = syncBase.replace(/\/$/, '');
    this.offsetMs = 0;
    this._subs = [];
    this._pollTimer = null;
    this._lastRev = -1;
  }

  /** Leader factory: mint a fresh deterministic timeline for the two screens. */
  static createLeader({ code, mask, durationMs, calib = null, leadMs = 15000, room, alignUrl, syncBase, mode = 'easy' } = {}) {
    const payload = {
      v: 1,
      room: room || randomRoom(),
      role: 'norad', // the link is meant to be opened on the NORAD display
      status: 'armed', // armed | running | aborted | complete (MEDIUM live state)
      epochStart: Date.now() + leadMs,
      code,
      mask,
      seed: (Math.random() * 0x7fffffff) >>> 0,
      durationMs,
      defcon: 5,
      calib,
      rev: 0,
    };
    return new SyncSession({ mode, role: 'leader', payload, alignUrl, syncBase });
  }

  /** Follower factory: rebuild the session from a pairing string (URL param / room code). */
  static fromString(str, { alignUrl, syncBase, mode = 'easy' } = {}) {
    const payload = decodePayload(str);
    return new SyncSession({ mode, role: payload.role || 'follower', payload, alignUrl, syncBase });
  }

  /** Align this device's clock to the shared reference. Safe to call once at start. */
  async align() {
    this.offsetMs = await estimateClockOffset(this.alignUrl);
    return this.offsetMs;
  }

  /** Corrected "now" both devices agree on. */
  now() {
    return Date.now() + (this.offsetMs || 0);
  }

  encode() {
    return encodePayload(this.payload);
  }

  /** A shareable link that turns the second device into the NORAD follower. */
  followerUrl(base = location.href) {
    const u = new URL(base, location.href);
    u.hash = '';
    u.searchParams.set('sync', this.encode());
    if (this.mode === 'medium') u.searchParams.set('live', '1');
    else u.searchParams.delete('live');
    return u.toString();
  }

  /** A deterministic drive plan for NoradScene.openScheduled() — identical on both devices. */
  plan() {
    const n = countCells(this.payload.code, this.payload.mask);
    return {
      code: this.payload.code,
      mask: this.payload.mask,
      epochStart: this.payload.epochStart,
      durationMs: this.payload.durationMs,
      order: buildSolveOrder(n, this.payload.seed),
      clock: () => this.now(),
    };
  }

  // ---------------------------------------------------------------------------------------
  // MEDIUM tier — live leader→follower over a tiny proxy KV (§8.3 Medium). The plan()/now()/
  // align() surface above is unchanged, so norad.js needs no edits; main.js opts in with
  // mode:'medium' and drives publish()/subscribe(). The server owns the monotonic `rev`.
  // ---------------------------------------------------------------------------------------

  /** The room-scoped KV URL (same-origin dev server, or the proxy origin in production). */
  _syncUrl() {
    return `${this.syncBase}/sync/${encodeURIComponent(this.payload.room)}`;
  }

  /** Leader → server: merge a partial update into the SyncState and POST it. */
  async publish(partial = {}) {
    if (this.mode !== 'medium') return this.payload;
    this.payload = { ...this.payload, ...partial };
    try {
      const res = await fetch(this._syncUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.payload),
        cache: 'no-store',
      });
      if (res.ok) {
        const stored = await res.json();
        this.payload = stored; // adopt the server-assigned rev
        if (typeof stored.rev === 'number') this._lastRev = stored.rev;
      }
    } catch (e) {
      console.warn('sync publish failed (will retry on next change):', e);
    }
    return this.payload;
  }

  /**
   * Follower ← server: poll the room every ~1s and fire cb(state) only on a NEWER rev, so
   * callers act just once per leader change. Returns an unsubscribe fn.
   */
  subscribe(cb, intervalMs = 1000) {
    if (this.mode !== 'medium') return () => {};
    this._subs.push(cb);
    const poll = async () => {
      try {
        const res = await fetch(this._syncUrl(), { cache: 'no-store' });
        if (!res.ok) return; // 404 = room not created yet; keep polling
        const remote = await res.json();
        if (typeof remote.rev === 'number' && remote.rev > this._lastRev) {
          this._lastRev = remote.rev;
          this.payload = remote;
          for (const f of this._subs) f(remote);
        }
      } catch {
        /* transient network error; keep polling */
      }
    };
    poll();
    if (!this._pollTimer) this._pollTimer = setInterval(poll, intervalMs);
    return () => {
      this._subs = this._subs.filter((f) => f !== cb);
      if (this._subs.length === 0) {
        clearInterval(this._pollTimer);
        this._pollTimer = null;
      }
    };
  }

  stop() {
    clearInterval(this._pollTimer);
    this._pollTimer = null;
    this._subs = [];
  }
}
