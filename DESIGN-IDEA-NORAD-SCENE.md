# DESIGN-IDEA-NORAD-SCENE.md

A focused design study for a **swappable NORAD "big board" scene** — the war-room
counterpart to the terminal experience described in [DESIGN-IDEA.md](DESIGN-IDEA.md).

This scene dramatizes the **end-of-film crisis**: while David thinks he is still playing a
game in his bedroom, `{{ORG}}` is watching `{{SYSTEM}}` / `{{PERSONA}}` **brute-force the
missile launch code** on a giant projected display, with a countdown to when the code will
be solved and the birds fly. It is deliberately a *completely different visual register*
from the green-on-black terminal: cavernous, cold, institutional, and dominated by one
enormous readout.

> **North-star for this scene (one line):**
> The terminal is where you *play*. The big board is where you *see the cost* — the machine
> solving a lock nobody asked it to pick, one glyph at a time, against a clock.

This document has three jobs, mirroring the request:

1. **§1–§4 — Design options + recommendation** for the scene (feeds back into the main
   design docs).
2. **§5 — The build**: what the shipped prototype does, the font strategy, and how the
   animation works.
3. **§6 — Linking strategy**: concrete ways to cut from David's bedroom to NORAD and back,
   with a recommendation and a shipped default.

---

## 1. Research: what the film's launch-code sequence actually shows

The climactic NORAD shots (the reference stills) are one of the most memorable UI moments
in film. What makes them work:

- **One dominant readout.** The frame is almost entirely a single, wall-sized alphanumeric
  display. Scale *is* the drama — a lock this big means stakes this big.
- **A segmented, glowing display font.** The glyphs are drawn on a **14-segment
  "starburst" display** (the alphanumeric cousin of the 7-segment digital-clock font). It
  can render letters *and* digits, which is why the codes read like `CPE 1704 TKS`.
- **A fixed code format.** The reference frames show a `LLL DDDD LLL` shape — three letters,
  four digits, three letters (e.g. `IPN 1704 CHS`, `PPN 1804 SES`, `DPC 1004 DUS`).
- **Per-position solving in random order.** Individual character cells **lock** (stop
  rolling) while their neighbors keep flickering through candidates. The audience reads
  progress as "more cells have gone solid." Crucially the cells do **not** solve
  left-to-right — the randomness is what sells "brute force," not "typing."
- **Rolling churn on unsolved cells.** Unsolved cells cycle rapidly through plausible
  glyphs. The motion is fast, mechanical, and slightly arrhythmic.
- **An implied clock.** The dread is *time*: how long until the machine finishes. The film
  externalizes this as the shrinking set of unsolved cells; a modern build can make the
  clock explicit.
- **Sterile chrome, not phosphor.** The war room reads as blue-white/steel and amber
  warnings — not the warm CRT green of David's bedroom. That contrast is the point.

### 1.1 Why this is worth building

- It delivers the film's **dramatic irony** as a *visual*, not just narration: the player
  literally sees the consequence of the "game" running in parallel.
- It's a **high-impact, low-logic** scene — a self-contained animation with a timer, not a
  new rules system. Great effort-to-payoff ratio.
- It gives the project a **second visual identity** (war room vs. terminal), which makes
  the whole experience feel bigger without new mechanics.

---

## 2. Design options for the scene

Four buildable directions, ordered most-focused → most-ambitious.

### Option A — "THE LOCK": single-readout brute-force + countdown ⭐ (recommended, shipped)

**Pitch:** The whole screen is the launch-code display and a countdown clock. Cells roll and
lock in random order; the clock estimates time-to-solve. Minimal chrome: a header
(`{{ORG}} — LAUNCH CODE SEQUENCE`), the giant readout, the clock, a DEFCON strip, and one or
two supporting status lines. When the last cell locks, the board flips to a launch/abort
state.

**Why it wins:** It is the exact iconic image, it's self-contained, and it needs no new game
systems — just a well-tuned animation and a timer. It's the most shippable and the most
faithful. **This is what the prototype implements.**

**Scope:** Small. One module, one CSS block, one panel.

### Option B — "THE WAR ROOM": multi-panel big board

**Pitch:** Option A's readout plus the surrounding NORAD furniture — a world map with
missile trajectories, multiple threat readouts, a DEFCON ladder, personnel chatter as
scrolling text. The launch-code lock is the centerpiece; everything else is atmosphere.

**Why consider it:** Maximum spectacle; sells "institutional catastrophe." Good for a
trailer or a climactic set-piece.

**Scope:** Medium–large (map rendering, several animated widgets). Risk: dilutes the single
powerful image; more art/tuning budget.

### Option C — "SPLIT BRAIN": bedroom + war room simultaneously

**Pitch:** A permanent (or toggled) split screen — David's green terminal on one side, the
NORAD board on the other — so the player watches their innocent inputs ripple into the war
room in real time. The two halves share the DEFCON state.

**Why consider it:** The dramatic-irony gap becomes *literal and continuous*. Extremely
strong thematically.

**Scope:** Medium. Mostly layout + shared state; the hard part is not overwhelming the
player. Best as an *optional* view or reserved for specific beats. (See §6, Option 3.)

### Option D — "YOU ARE THE BOARD": interactive de-escalation puzzle

**Pitch:** The board becomes playable — the player, now inside NORAD, races the countdown:
pull David off the line, sever the modem, feed the machine a futile game (tic-tac-toe) to
make it *stop solving*. The lock is the timer; player actions slow or halt it.

**Why consider it:** Turns spectacle into gameplay and ties directly to the film's "only
winning move is not to play" climax.

**Scope:** Medium–large (needs interaction rules + failure/success states). Best as a
*follow-up* to the shipped Option A prototype, reusing its display + clock.

---

## 3. Comparison & recommendation

| | A · THE LOCK | B · WAR ROOM | C · SPLIT BRAIN | D · YOU ARE THE BOARD |
|---|---|---|---|---|
| Faithfulness to the shot | ★★★★★ | ★★★★★ | ★★★★ | ★★★ |
| Dramatic-irony payoff | ★★★★ | ★★★★ | ★★★★★ | ★★★★ |
| Effort / scope | Low | Med–High | Med | Med–High |
| Reuses existing systems | ★★★★★ | ★★★ | ★★★★ | ★★★ |
| Shippable now | ★★★★★ | ★★ | ★★★ | ★★ |

**Recommendation:** Ship **Option A ("THE LOCK")** now as the prototype (done — see §5).
Keep **Option C** as the recommended *linking* mode (§6) because it needs no new scene, only
a layout. Treat **B** and **D** as later expansions that reuse Option A's display + clock
without a rewrite.

---

## 4. Aesthetic direction (how it should look/feel)

The scene must feel like **a different machine in a different room** from the terminal.

| Aspect | Terminal (bedroom) | NORAD board (this scene) |
|---|---|---|
| Palette | Warm phosphor green on near-black | Cold blue-white / steel, amber warnings, red on launch |
| Type | Monospace CRT text | Large **14-segment display** glyphs |
| Layout | Serial scroll, intimate | One dominant readout, vast negative space |
| Motion | Typewriter, gentle CRT roll | Fast glyph churn, hard cell "locks", ticking clock |
| Sound (optional) | Modem, key clicks | Low room hum, relay clacks on each lock, alarm as clock nears zero |
| Mood | Curious, playful | Institutional dread |

**Key visual rules**

1. The launch-code readout is the largest element on screen by far.
2. Unsolved cells roll fast; solved cells go **solid + brighter** with a subtle bloom and a
   one-frame "lock" flash.
3. Cells solve in **random order**, never left-to-right.
4. The countdown is prominent and legible; it *accelerates the pulse* of the scene as it
   approaches zero (color shifts amber → red, faster tick).
5. Respect `prefers-reduced-motion`: drop the churn to a slow step and disable glow
   pulsing.

### 4.1 Font strategy (important)

The film's exact display font is a proprietary asset; we **recreate the style**, we do not
reproduce the original. The authentic look is a **14-segment alphanumeric display**. Options:

- **Recommended (shipped): a free 14-segment web font** — the open-source **DSEG** family
  (`DSEG14 Classic`), licensed **SIL Open Font License 1.1** (free for any use). Loaded via
  a CDN `@font-face` with a **monospace fallback**, so the scene still works offline (it
  just falls back to a blocky monospace look). This gives the authentic starburst glyphs for
  both letters and digits.
- **Alternative (zero-dependency): pure CSS/monospace** — style the existing `--font`
  monospace with heavy letter-spacing, glow, and a "dim segment" ghost layer. Lower
  fidelity, but no external asset. Kept as the automatic fallback.
- **Alternative (max fidelity): self-hosted font file** — vendor a `.woff2` of an
  OFL-licensed 14-segment font into `/assets/fonts/`. Best offline fidelity; adds a binary
  to the repo. Recommended if the scene graduates from prototype to shipped feature.

> **IP note:** consistent with [DESIGN-IDEA.md §6](DESIGN-IDEA.md), this is an *homage*. Use
> an OFL font and original code strings; do not ship the film's exact font or its exact
> launch code as a claim of authenticity.

---

## 5. The build (shipped prototype — Option A)

A self-contained, swappable scene living alongside the terminal and chess panels. No build
step, no new dependencies beyond an optional CDN font.

**Files**

- [js/norad.js](js/norad.js) — the `NoradScene` class: owns the readout, the lock
  scheduler, and the countdown clock.
- [css/terminal.css](css/terminal.css) — a `NORAD big board` block (`.norad-*` classes) with
  the `@font-face` for the segmented display + monospace fallback.
- [index.html](index.html) — a hidden `<section class="norad-scene">` panel (mirrors the
  chess panel pattern) and a **NORAD** button in the status bar.
- [js/main.js](js/main.js) — wires the NORAD button to toggle the scene.

**What it does**

1. Renders `{{ORG}} — LAUNCH CODE SEQUENCE` as a full-screen overlay in the war-room
   palette, completely covering the terminal.
2. Shows a launch-code readout in the `LLL DDDD LLL` format using the 14-segment font.
3. **Rolls** every unsolved cell through plausible glyphs (letters cycle letters, digits
   cycle digits) on a fast interval.
4. **Locks** cells one at a time in **random order** at a computed cadence, each with a
   brief flash + relay-style emphasis and a bump to a "cells solved" readout.
5. Runs a **countdown clock** ("ESTIMATED TIME TO SEQUENCE" `MM:SS`) synced to the number of
   remaining cells; it shifts amber then red as it nears zero.
6. Drives a small **DEFCON strip** and status lines for atmosphere, themed by the active
   name set (`{{ORG}}`, `{{SYSTEM}}`, `{{PERSONA}}`).
7. On the final lock: flips to a **`SEQUENCE COMPLETE`** launch state (or an **`ABORT`**
   state if aborted), and emits a callback so the host game can react (e.g. jump to an
   ending).

**Configurable knobs** (constructor options): the target code, the format mask, the total
crack duration, roll speed, palette/theme tokens, reduced-motion behavior, and an
`onComplete` callback.

**Determinism:** the solve *order* and rolling glyphs are randomized for feel, but the
*final* code and the total duration are fixed inputs — so a scripted beat can rely on "this
takes ~45s and ends with launch."

---

## 6. Linking the scene to the early game (recommendations)

The request: let the player "see what is going on outside of the bedroom" and switch back
and forth. Three linking strategies, most-shippable first.

### Option 1 — Manual cutaway toggle ⭐ (shipped default)

A **NORAD** button in the status bar (next to CONSOLE/CHESS) opens the big board as a
full-screen overlay; closing it returns to the terminal exactly where it was. This is the
lowest-risk hook: it exists immediately, works in every mode, and lets the player *choose*
to peek behind the curtain.

- **Pros:** trivial to ship (mirrors the chess panel), always available, no pacing risk.
- **Cons:** player-initiated, so it doesn't *force* the dramatic irony.
- **Status:** implemented in this prototype.

### Option 2 — Scripted cutaways at key beats (recommended next)

Add **cutaway nodes** to the scripted dialogue graph ([js/dialogue.js](js/dialogue.js)) that
auto-open the NORAD scene for a few seconds at story beats — e.g. the moment the player
selects `{{GAME}}`, each DEFCON step-down, and the persistence beat. The engine
([js/engine.js](js/engine.js)) already walks nodes and applies effects; a node effect like
`cutaway: { scene: 'norad', durationMs, code, crackMs }` would open the board, play, then
return to the terminal. This is where the parallel-worlds tension lands hardest, because the
game controls *when* you see it.

- **Pros:** delivers the irony on purpose, at the right moments; reuses the existing node +
  effect machinery.
- **Cons:** needs authoring + pacing tuning; small engine addition.
- **Effort:** low–medium.

### Option 3 — Persistent / peekable split screen (Option C from §2)

A toggle that docks the terminal and the NORAD board side by side, sharing DEFCON state, so
the player watches inputs ripple into the war room continuously. Best reserved for the
climax or as an optional "SPLIT" view rather than the default (it can overwhelm the intimate
terminal read).

- **Pros:** the strongest thematic statement; continuous dramatic irony.
- **Cons:** layout complexity; risks diluting the terminal's intimacy if always on.
- **Effort:** medium.

### Recommended path

1. **Now:** ship Option 1 (done) so the scene is reachable and testable.
2. **Next:** add Option 2 cutaway nodes at 2–3 authored beats for the intended
   parallel-worlds effect.
3. **Later:** offer Option 3 as an optional SPLIT view for the climax.

### Shared-state note

However it's linked, the scene should read the **same DEFCON value** the engine already
owns (`GameEngine.defcon` / `terminal.setDefcon`) so the board never contradicts the
terminal. The prototype accepts a `defcon` option and exposes `setDefcon()` for exactly this.

---

## 7. Coupling the countdown to the bedroom (calibration)

**Goal:** the NORAD countdown must feel like it belongs to the *same crisis* the player is
living in the terminal — DEFCON climbs, the script keeps the player busy — and it **must not
finish before the bedroom scene does**. In the film, the code is cracked at the last
possible second, never early. We engineer that with calibration variables instead of luck.

### 7.1 The core problem

The shipped prototype (§5) is **self-timed**: it runs a fixed `crackMs` wall clock and fires
`launch` when its own timer ends. That's perfect standalone, but if it runs *alongside* the
bedroom script it will drift — a slow reader, a pause, or a branch could let NORAD "win"
before the story reaches its climax. We need the **narrative to be authoritative** and the
**clock to be cosmetic but bounded**.

### 7.2 Design: two clocks + a narrative gate

Split the countdown into two coupled quantities:

- **Authoritative progress (narrative-gated).** How many cells are *allowed* to be solved is
  a function of the engine's state (DEFCON band + story phase), **not** elapsed time. NORAD
  can never solve past what the story has unlocked.
- **Display clock (dramatic).** The `MM:SS` readout the audience sees. It eases toward a
  target that is derived from *remaining narrative*, so it always looks plausible and tense,
  but it is not what triggers launch.

The final launch fires only when the engine reaches the climax/ending beat (or the player
fails a soft deadline that is itself gated so it can never *precede* the script).

```text
Engine (bedroom)                         NoradScene (coupled mode)
  DEFCON 5→1, story phase  ──sync()──▶   target solved-count = f(defcon, phase)
  climax / ending node     ──commit()─▶  release reserve cells → 'launch'
  player severs modem      ──abort()──▶  'abort'
```

### 7.3 Calibration variables

A single calibration object tunes the whole coupling. Suggested defaults for a 10-cell code:

```js
const NORAD_CALIB = {
  totalCells: 10,          // code length (e.g. LLL DDDD LLL)
  reserveCells: 2,         // NEVER solve until the climax beat — the hard guarantee
  // Cumulative cells allowed solved by the time the story REACHES this DEFCON.
  // Max at DEFCON 1 must equal totalCells - reserveCells, so it holds short of launch.
  defconCellBudget: { 5: 0, 4: 2, 3: 4, 2: 7, 1: 8 },
  displayClockMs: 45000,   // nominal duration shown on the MM:SS readout
  minHoldMs: 4000,         // clock is clamped ABOVE this until the climax releases launch
  driftEaseMs: 1200,       // how fast the display clock re-targets after each sync()
  lockJitter: 0.25,        // cosmetic randomness in per-cell lock cadence
  paceFloorMs: 6000,       // min real time a newly-unlocked batch takes to visibly lock in
};
```

**The load-bearing invariant:** `Σ defconCellBudget[1] === totalCells - reserveCells`. The
reserve cells are only released by an explicit `commit()` call on the climax node — so the
board is **structurally incapable** of completing before the bedroom scene's climax, no
matter how fast the player moves.

### 7.4 Proposed API (extends the shipped `NoradScene`)

Add a `mode: 'standalone' | 'coupled'` option and three engine-facing methods:

- `syncProgress({ defcon, phase, remainingBeats })` — engine calls this on every DEFCON
  change and phase transition. NORAD maps it to a target solved-count (via
  `defconCellBudget`) and a target display-clock (`remainingBeats / totalBeats *
  displayClockMs`, clamped to `≥ minHoldMs`), then eases toward both. Cells lock at
  `paceFloorMs`-limited cadence so a big jump still *looks* like brute-forcing.
- `commitLaunch()` — releases the reserve cells and resolves `launch`. Called by the engine
  on the annihilation ending node.
- `abort()` — already exists; called on the de-escalation / lockout endings.

In coupled mode NORAD's internal timer **never** fires `launch` on its own; it only rolls,
eases, and waits for the engine.

### 7.5 The engaging script (keeping the player busy against the clock)

The countdown only creates dread if the player has something urgent to *do*. Recommended
scripted additions to [js/dialogue.js](js/dialogue.js), each tied to a DEFCON band so the
terminal and the board tell one story:

| DEFCON | Board state (budget) | Terminal beat (engages the player) |
|---|---|---|
| 5→4 | 2/10 cells | `{{PERSONA}}` starts the "game"; first cutaway teases the board. |
| 4→3 | 4/10 | Player realizes it isn't a simulation; hunt for the backdoor begins. |
| 3→2 | 7/10 | Persistence beat — `{{PERSONA}}` calls back; urgency spikes, clock reddens. |
| 2→1 | 8/10 (reserve held) | Teach-futility puzzle: the *only* way to stop the last 2 cells. |
| climax | `commit()` or `abort()` | Launch (annihilation) **or** abort (understanding / lockout). |

Script principles: (1) every DEFCON step-down should be *caused* by a player choice so the
board's progress reads as consequence; (2) each band gives one concrete task with a
difficulty rising as cells fall; (3) `{{PERSONA}}` occasionally *narrates the board* into the
terminal (e.g. "`CODE 80% RESOLVED. SHALL WE CONTINUE?`") so the two scenes cross-reference
even without a cutaway.

### 7.6 Calibration workflow

1. Set `displayClockMs` to the *median* full-playthrough length from the Monte Carlo
   harness ([sim/](sim/)) so the shown clock matches real pacing.
2. Set `defconCellBudget` so the visible progress curve feels linear-ish across the run.
3. Keep `reserveCells ≥ 1` as the guarantee; tune `minHoldMs`/`paceFloorMs` so fast players
   still see a few seconds of held countdown before the climax resolves.
4. Validate: run the sim's fastest and slowest playthroughs; confirm NORAD never reports
   `SEQUENCE COMPLETE` before the climax node in either.

### 7.7 Status — implemented (progress-driven coupling)

Shipped as a **coupled** board tier. The runtime session is authoritative:
[js/engine.js](js/engine.js) emits a `SessionState` (`{status, defcon, progress, phase,
ending}`) on every DEFCON change and at the ending via `engine.emitState()` → `engine.onState`.
[js/norad.js](js/norad.js) `openCoupled()` + `applyState()` map that live state onto the board:

- **`progress` drives the "ticks":** `cells solved = round(progress × solvable)`; `progress`
  currently derives from DEFCON (`(5−defcon)/4`), so the board advances *with the story*, not a
  wall clock. (Node-beat sub-progress is the noted refinement.)
- **The clock is a function of progress, eased** toward `(1−progress) × displayDuration` (18 %/
  tick) so it creeps between beats and never freezes or outruns the plot — the film "edited
  countdown" model.
- **Reserve cells are held** (default 2) until an ending arrives, so NORAD cannot complete
  before the bedroom's climax. `annihilation` → release + `SEQUENCE COMPLETE`; `lockout` /
  `understanding` → stand-down. DEFCON is mirrored 1:1.

> Verified two-tab: the follower mirrored DEFCON 5→3→1, locked 4/10 at progress 0.5 (2 held),
> eased the clock 00:45→00:23, and released to 10/10 launch on the annihilation ending.

---

## 8. Multi-device time-sync (two screens, one room)

**Intent:** run **two devices** in the same room (e.g. two Surfaces) — one showing the
**bedroom terminal**, one showing the **NORAD board** — playing in parallel and staying
**calibrated**, exactly like the film's intercutting. This is §7's calibrator, but shared
across machines. Constraint: **no backend except the proxy** ([pages-ai-proxy](ai-proxy.json))
— we must not stand up a new database or realtime service beyond what the proxy already is.

### 8.1 Roles

Designate one device the **leader (BEDROOM / DRIVER)** — the interactive one that owns the
authoritative narrative state (DEFCON, phase, beats) — and one the **follower (NORAD /
DISPLAY)** that mirrors it. This maps cleanly onto §7: narrative is authoritative, the board
reflects it. The shared payload is a small `SyncState`:

```js
const SyncState = {
  room: 'DELTA-9',        // short pairing code
  epochStart: 1753400000, // shared start time (unix ms), for deterministic timelines
  seed: 48271,            // seeds the PRNG so lock order matches on both screens
  defcon: 3,
  phase: 'persistence',
  remainingBeats: 4,
  calib: /* NORAD_CALIB from §7.3 */,
  rev: 12,                // monotonic revision so followers ignore stale reads
};
```

### 8.2 Clock alignment (works with just the proxy)

Co-located Surfaces are NTP-synced, so wall clocks are usually within tens of ms — often
good enough. To tighten it using **only the proxy**, run a one-time **Cristian's-algorithm**
handshake at pairing: fire N tiny requests, read the proxy response `Date` header, and
estimate `offset = serverTime + RTT/2 − localTime`. Store the offset and add it to every
local timestamp. No new endpoint required — any proxy response carries a `Date` header.

### 8.3 Three ways to solve it (easy → hard)

#### Easy — deterministic shared-seed pairing (no live server state) ⭐ recommended first

Pair once, then both devices run the **same deterministic timeline** off their own
(offset-corrected) clocks. Nothing is streamed during play.

- **Pairing:** the leader encodes `SyncState` (minus live fields) into a URL param
  (`?sync=<base64>`), shown as a **QR code** or a short room code; the follower scans/enters
  it. Both now share `epochStart`, `seed`, and `calib`.
- **Play:** both derive every visible thing (lock order via seeded PRNG, display-clock from
  `epochStart + displayClockMs`) purely from the shared payload + local clock. Because the
  timeline is deterministic and clocks are aligned (§8.2), the two screens stay in step for a
  10–15 min run with no server chatter.
- **Pros:** zero new infra; robust; works even if the proxy is briefly unreachable mid-run.
- **Cons:** it's a *fixed* timeline — the follower can't react to live player choices on the
  leader (DEFCON is on a schedule, not driven by the player in real time).
- **Best for:** a scripted, rehearsed demo / installation piece where the arc is fixed.
- **Status: shipped.** Implemented in [js/sync.js](js/sync.js) (`SyncSession`, `mulberry32`
  seeded PRNG, URL-safe payload encode/decode, `estimateClockOffset` via the page origin's
  `Date` header) and driven by `NoradScene.openScheduled(plan)` in [js/norad.js](js/norad.js).
  **How to use it:** on the bedroom (leader) device press **PAIR** in the status bar → it
  mints a deterministic timeline and shows a **FOLLOWER LINK** (+ room code + start
  countdown). Open that link on the second device: the `?sync=` param makes it skip the menu
  and boot straight into the NORAD board, aligned to the shared epoch. **OPEN HERE** previews
  the follower board on the leader device for single-machine testing. Any device opening the
  same link lands on the identical code (verified: both resolve to `CPE1704TKS`).

#### Medium — proxy KV + polling (live leader→follower) ⭐ recommended for interactivity

Add **one tiny endpoint** to the proxy we already run: a room-keyed key/value blob
(in-memory map or a single JSON file) with `POST /sync/:room` (leader writes `SyncState`) and
`GET /sync/:room` (follower reads). Reuse the proxy's existing **CORS origin allow-list** for
access control.

- **Flow:** leader `POST`s the new `SyncState` (bumping `rev`) on every DEFCON/phase change;
  follower `GET`s every ~1s and ignores any read whose `rev` isn't newer. The follower feeds
  the payload straight into `NoradScene.syncProgress()` from §7.4.
- **Pros:** genuinely *live* — real player choices in the bedroom drive the board within ~1s;
  still "no backend" in spirit (it's a ~30-line extension of the proxy they already host).
- **Cons:** ~1s polling latency; needs a trivial proxy change + a little state hygiene
  (expire stale rooms).
- **Best for:** an interactive two-screen experience where the player's actions matter.
- **Status: shipped (live).** Implemented end to end: a room-keyed KV (`GET`/`POST
  /sync/:room`, in-memory, server-owned monotonic `rev`, 30-min idle prune, permissive CORS)
  in [serve.mjs](serve.mjs); `SyncSession.publish()` / `subscribe()` in [js/sync.js](js/sync.js)
  (rev-gated ~1s polling); and follower reactions in [js/main.js](js/main.js) — DEFCON updates
  in place, RESYNC restarts the timeline in lockstep, ABORT halts mid-run. **How to use it:**
  tick **LIVE SYNC (medium)** in the PAIR panel — the follower link gains `&live=1`, the leader
  publishes the room, and **PUSH RESYNC** / **PUSH ABORT** appear to drive all screens live.
  Verified with two tabs: follower followed the crack, DEFCON changed live, and ABORT froze
  the board within ~1s.
- **Coupled to the live game (§7.7):** the follower now mirrors the *actual runtime session*,
  not just manual PAIR controls — `GameEngine` publishes `defcon`/`progress`/`phase`/`ending`
  and the follower opens in **coupled** mode (`openCoupled`/`applyState`), so DEFCON and
  narrative progress track the bedroom session in real time.
- **Production note:** the dev server hosts `/sync` same-origin; on GitHub Pages (static) the
  same endpoint must live on the **pages-ai-proxy** (reuse its origin allow-list). The client
  already targets the proxy origin via `resolveSyncBase()` when not on the local dev port, so
  only the proxy needs the ~30-line KV added.

#### Hard — push + tight clock discipline (SSE/WebSocket)

Promote the medium endpoint to a **push stream**: `GET /sync/:room/stream` as **Server-Sent
Events** (simpler than WebSockets, one-way leader→follower, native browser `EventSource`).
Add periodic re-running of the §8.2 offset estimate, a **leader election / heartbeat** so a
dropped leader can be replaced, and **late-joiner catch-up** (a follower that connects
mid-run gets the current `SyncState` immediately).

- **Pros:** near-frame-tight sync and instant reaction; the most "movie-accurate."
- **Cons:** the most proxy work (streaming, reconnection, liveness); overkill unless the two
  screens must animate in lockstep to the frame.
- **Best for:** a showcase installation where visible desync would break the illusion.

### 8.4 Recommendation

Start **Easy** (deterministic shared-seed pairing) — it needs no proxy changes and is
bulletproof for a fixed-arc demo. Move to **Medium** (proxy KV + polling) the moment you want
the follower to react to *live* player choices; it's a small, contained extension of the
existing proxy. Reserve **Hard** (SSE) for a polished installation where frame-tight lockstep
is worth the added moving parts. In all three, the synced object is the same §7 calibrator —
so the multi-device work is "run the calibrator across two machines," not a new system.

> **Current state:** **Easy and Medium are both shipped** (Easy = the default; Medium = the
> **LIVE SYNC** toggle). **Hard (SSE) is the only remaining tier** — a future upgrade of the
> already-shipped `/sync` KV to a push stream when frame-tight lockstep is needed.

---

## 9. Open questions

1. **Trigger policy:** which specific beats auto-cut to NORAD (Option 2), and for how long?
2. **Outcome coupling:** does finishing the crack force an ending, or is it purely
   atmospheric until the climax?
3. **Font commitment:** stay on the CDN DSEG font, or vendor an OFL `.woff2` for offline
   fidelity before this graduates from prototype?
4. **Sound:** add room hum + relay clacks + alarm, or keep it silent to preserve the
   terminal's audio identity?
5. **Interactivity:** promote to Option D (de-escalation puzzle) later, or keep it a
   non-interactive set-piece?
6. **Calibration source of truth:** derive `displayClockMs` / `defconCellBudget` from the
   Monte Carlo pacing data automatically, or hand-tune per identity set (§7.6)?
7. **Reserve size:** is `reserveCells = 2` the right guarantee, or should the held-back count
   scale with code length / difficulty?
8. **Sync mode to ship:** which multi-device tier (Easy / Medium / Hard, §8.3) is the target
   for the first two-screen demo, and does that justify the small proxy `/sync` addition?
9. **Leadership + failure modes:** if the leader device drops mid-run (Medium/Hard), does the
   follower freeze, fall back to the deterministic Easy timeline, or show a graceful "LINK
   LOST" state?

---

## 10. TL;DR

- Build the iconic **launch-code brute-force + countdown** as a **swappable full-screen
  NORAD scene** in a cold, institutional palette — the visual opposite of the terminal.
- Recreate the film's **14-segment display** look with a **free OFL font (DSEG)** + monospace
  fallback; solve cells in **random order** with a synced **countdown clock**.
- Ship it now as **Option A** behind a **NORAD toggle button** (Option 1 linking), then add
  **scripted cutaways** (Option 2) for the parallel-worlds dramatic irony, with an optional
  **split screen** (Option 3) for the climax.
- **Couple the countdown to the bedroom (§7):** make the **narrative authoritative** and the
  **clock cosmetic-but-bounded** — a two-clock model gated by DEFCON/phase, with calibration
  variables (`defconCellBudget`, `reserveCells`, `displayClockMs`, …). The invariant
  `Σ budget[DEFCON 1] = totalCells − reserveCells` makes it **structurally impossible** for
  NORAD to finish before the bedroom scene's climax.
- **Two screens, one room (§8):** share that same calibrator across devices using **only the
  proxy** — **Easy** = deterministic shared-seed pairing (QR/room code, no server state);
  **Medium** = a tiny proxy `/sync` KV + ~1s polling for live leader→follower updates;
  **Hard** = SSE push + Cristian's-algorithm clock offset for frame-tight lockstep. **Easy and
  Medium are shipped** (Medium = the LIVE SYNC toggle with PUSH RESYNC / PUSH ABORT); Hard is
  the only remaining tier.
- Keep it an **homage**: OFL font, original code strings, shared DEFCON state, and a clean
  fallback so it works offline and respects reduced-motion.
