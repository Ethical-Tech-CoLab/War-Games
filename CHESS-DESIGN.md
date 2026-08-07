# CHESS-DESIGN.md

Design notes for the chess module in the WarGames-inspired terminal game. Chess is a
self-contained mini-game: play a **swappable machine mind** on an optional board panel, by mouse,
keyboard, or voice, with optional in-character commentary — or set two minds against each other
and just watch.

---

## Quick answers

**1. Is AI used for the chess *dialogue* (commentary)?**
Both, by choice. The default is **deterministic, canned tone banks** (see `COMMENTARY` in
[js/chess-ui.js](js/chess-ui.js) and `CANTANKEROUS` in
[js/chess-commentary.js](js/chess-commentary.js)) so chess works fully offline and never blocks a
move. Turning on **Live model commentary** (Console → CHESS CONFIG) sends the *actual position* to
the configured Live-AI model and prints its bespoke, bad-tempered line instead — rate-limited,
hard-timeout, fire-and-forget, with the canned bank as the fallback on every failure.

**2. Can moves be made by voice?**
Yes. A **🎤 SPEAK** button uses the browser **Web Speech API** (`SpeechRecognition`) to
transcribe a spoken move and play it. It accepts lenient phrasings — `"e2 e4"`,
`"e two e four"`, `"knight f3"`, `"bishop to c4"`, `"castle kingside"`, `"echo two echo four"`.
The button is **feature-detected** and hidden in browsers without support (Chrome/Edge have
it; Firefox/Safari generally do not). Parsing lives in `parseSpokenMove()` in
[js/chess.js](js/chess.js).

**3. Is move logic AI or a deterministic rule book?**
Two separate things, and this separation is the architecture:
- **Move legality** = a **deterministic rule book** — full legal move generation (incl.
  castling, en passant, promotion, self-check filtering), validated by **perft** (from the
  start position perft(1..3) = 20 / 400 / 8902, the known-correct counts). **Nothing can break
  it** — not a new evaluator, not a language model.
- **The opponent's move choice** = a swappable **mind**. Most minds are classical search
  (negamax + alpha-beta over different evaluation functions); one mind is an actual **LLM**.
  Every mind's move is validated against the rule book before it is played.

**4. Can the model be changed mid-game?**
Yes — deliberately. Change the **MIND** dropdown at any time and the new brain plays the next
move. And with **MIND DRIFT** on (default), the machine *swaps itself* while you are winning: the
better you play, the stronger and stranger the thing you are facing becomes.

---

## Architecture

Four modules, zero dependencies, no build step:

| File | Role |
|---|---|
| [js/chess.js](js/chess.js) | **Rule book + generic search.** State, legal moves, make-move, status, notation (incl. FEN), spoken-move parsing, material, and an evaluation-agnostic `searchMove()`. |
| [js/chess-engines.js](js/chess-engines.js) | **The minds.** A registry of move-choosers over that rule book — evaluators, the LLM mind, and the `driftMind()` chaos rule. |
| [js/chess-commentary.js](js/chess-commentary.js) | **The commentator.** Cantankerous canned bank + the optional live-model line writer. |
| [js/chess-ui.js](js/chess-ui.js) | `ChessPanel`: board, input (click / type / voice), mind pickers, duel loop, move log, captured tray, status, commentary. |

### Board representation
- `board[r][c]` — an 8×8 array of single chars. **Uppercase = White, lowercase = Black, `.` = empty.**
- Row 0 is rank 8 (top); row 7 is rank 1 (bottom). White moves *up* (row decreases).
- State also tracks: `turn`, `castling` rights `{K,Q,k,q}`, `ep` (en-passant target square or null), `half`/`full` move counters.

### Move generation & legality (the "rule book")
- `pseudoMoves()` generates per-piece moves (pawn pushes/captures/promotions, knight, king,
  sliding bishop/rook/queen, castling).
- **Castling** checks rights, empty path, and that the king is not in/through/into check.
- **En passant** uses the `ep` target set after a double pawn push.
- **Promotion** generates all of Q/R/B/N (UI auto-queens; voice/typed can specify).
- `legalMoves()` = pseudo-legal moves filtered by "does not leave your own king in check"
  (via `applyMove` + `inCheck`).
- `statusOf()` → `ongoing` | `check` | `checkmate` | `stalemate`.
- **Validated by `perft()`** — the standard correctness test for a move generator.

### Draws — the rule that proves the game's thesis

A game does not only end when someone wins. `drawClaim(state, history)` in
[js/chess.js](js/chess.js) detects three ways a game ends with **no winner at all**:

| Rule | Trigger | Why it matters here |
|---|---|---|
| **Threefold repetition** | the same position (pieces, side to move, castling rights, en-passant square) occurs three times | **You cannot make the same moves forever and call it a game.** The rule exists precisely because two competent opponents will otherwise shuffle until the heat death of the universe. |
| **Fifty-move rule** | 100 plies with no capture and no pawn move | Motion without progress is not progress. |
| **Insufficient material** | neither side can possibly deliver mate (K v K, K+minor v K, same-colour K+B v K+B) | The game is dead even though pieces remain. |

This is the **chess-board statement of the tic-tac-toe lesson**, and it is not decoration: it is
the same conclusion the machine reaches in the futility climax, arrived at by a completely
different route. A player who grinds a repetition out of the machine has *made the board say the
thesis*: some sequences cannot be won, only repeated.

It is also load-bearing engineering. Before repetition detection, a machine-vs-machine **duel
could shuffle forever** — two defensive minds will happily repeat a position until the tab is
closed. In a 24-duel headless run across every local mind pair, **7 duels (29%) ended in
threefold repetition** and every single duel terminated by a rule rather than by a safety cap.

The panel tracks `positionKey()` for every position in `this.history`, calls `drawClaim()` after
each move, prints the rule that ended the game, and reacts with a dedicated `repetition`
commentary bank. `_over()` is the single "is the game finished?" gate used by the human turn, the
machine turn, the duel loop, and panel re-open — so nothing can move after a draw.

> Related fix: the half-move clock now resets on **any** capture. The move generator does not
> flag captures on the move object, so `applyMove` reads the target square before moving —
> without that, the fifty-move rule could never fire correctly.

### The generic search
`searchMove(state, { depth, evaluate, tieBreak, blunder })` is negamax with **alpha-beta pruning**
and capture-first ordering (MVV-ish). It takes the **evaluation function as a parameter**, so a new
opponent personality is just a new `evaluate()` — same search, same rules, different judgement.
`aiMove(state, depth)` remains as a thin material-only wrapper for back-compatibility.

---

## The minds (js/chess-engines.js)

Every mind implements the same contract:

```js
{ id, label, blurb, tag, strength, live?, async pick(state, ctx) -> { move, note? } }
```

`pick()` is **async** so a local search and a network model are interchangeable to the caller.
`playMind(id, state, ctx)` never throws: any failure degrades to the classic search and the panel
logs `MODEL UNREACHABLE — LOCAL SEARCH SUBSTITUTED`.

| id | Label | How it chooses | Str |
|---|---|---|---|
| `drunk` | SEQUENCE FAULT — random | Uniform random legal move. Pure chaos. | 1 |
| `greedy` | MATERIALIST — 1-ply grab | Depth 1 on material, 12% chance of a random blunder. | 2 |
| `classic` | WOPR CLASSIC — 2-ply material | The original opponent: depth 2, material only. | 3 |
| `strategist` | STRATEGIC CORE — 2-ply positional | Adds development, centre control, rook-on-7th, bishop pair, doubled-pawn penalty. | 4 |
| `deep` | DEEP THREAT — 3-ply positional | Same judgement, one ply deeper (~70 ms/move in-browser). | 5 |
| `berserk` | FIRST STRIKE — attacking | Pays material for initiative: enemy king-zone pressure + checks. | 4 |
| `fortress` | FORTRESS — defensive | Own king safety dominates; material weighted down. Grinds. | 3 |
| `llm` | LIVE MODEL — language model | Sends FEN + the **complete legal move list** to the configured model and plays the move it names. | 3 |

**The LLM mind, specifically.** It is handed the position in FEN, the last move, and every legal
move in coordinate notation, and must return `{"move": "<one of them>", "quip": "<a line>"}`. The
returned move is re-parsed through `parseMove()` — anything invented, late (9 s timeout), or
unreachable falls back to the local positional search. **A bad completion can never corrupt the
board**, which is why an LLM is safe to seat at this table at all. Its `quip` is surfaced as that
move's commentary.

### MIND DRIFT — the chaos rule
`driftMind(currentId, playerAdvPawns)` returns a *different* mind, biased upward in strength the
further ahead the human is (≥2 pawns → mid-tier; ≥3 → strong; ≥5 → the strongest only). The panel
checks it after each of your moves (`_maybeDrift`): if drift is on, you lead by
`SETTINGS.chess.driftThreshold` pawns (default 2), the ply cooldown has expired (default 8) and a
60% roll passes, the machine swaps brains mid-game, logs `MIND DRIFT — …`, and says something about
it. **Playing well summons something worse.** Live minds are excluded from drift so the board never
becomes network-dependent by accident.

### AI vs AI — the duel
**AI vs AI** starts a fresh game with a mind on each side (White/Black pickers appear; defaults
STRATEGIC CORE vs FIRST STRIKE) and alternates automatically with `SETTINGS.chess.duelDelayMs`
(default 900 ms) of pacing so it reads like a broadcast. Player input is disabled while it runs;
STOP DUEL hands the position back (and resumes the machine's turn if it is mid-move, so it can
never soft-lock). Duels default to the **cantankerous** commentary voice, and commentary is
rate-limited by a ply cooldown so it stays a colour commentary track, not wallpaper.

---

## The panel UI (`ChessPanel`)

- **Optional, dockable panel** opened by the **♞ CHESS** button in the status bar (mirrors the
  Admin Console pattern).
- **Board** = an 8×8 grid of buttons, **repainted on every move** with Unicode piece glyphs
  (White = bright green, Black = dim green, on the CRT palette). Highlights: selection, legal
  targets (dot) / captures (ring), last move, and king-in-check.
- **Orientation** flips when you play Black (your pieces at the bottom).
- **Status line** reports whose move, check, and result — in a duel it names the side and its mind
  (`WHITE · POSITIONAL is thinking…`).
- **Move log** lists coordinate moves (numbered) interleaved with commentary and system lines.
- **Captured tray** (below the log) lists the pieces each side has **lost**, largest first, with a
  material-edge badge (`+3.5`) on whichever side is ahead. Tracked at capture time (including en
  passant), so it is always exactly consistent with the board.
- **MIND row** — the machine's brain, changeable at any time, with a one-line description of what
  it does. In a duel it becomes two pickers (WHITE / BLACK).
- **NEW** starts a fresh game; **PLAY BLACK/WHITE** swaps sides; **AI vs AI** starts/stops a duel.

### Input methods
1. **Click-to-move** — click a piece (legal targets highlight), then click the destination.
2. **Type** — a coordinate move like `e2e4` in the text box (as in online chess), Enter or MOVE.
3. **Voice** — **🎤 SPEAK** listens and plays the spoken move. Accepted forms include:
   - coordinates: `"e2 e4"`, `"e two e four"`, `"echo two echo four"`
   - piece + target: `"knight f3"`, `"bishop to c4"`, `"queen h5"`
   - castling: `"castle kingside"`, `"castle queenside"` (played only when legal)
   The parser maps number-words, phonetic/NATO letters, and piece names, then resolves the
   result against the current legal moves. Unrecognized/illegal speech is reported, not played.

---

## Commentary

Optional in-character commentary that follows the **session's tone**.

- **Text** appears in the log whenever spoken commentary is on, live commentary is on, or a duel is
  running. **Speech** requires the **Spoken commentary** toggle (which also unlocks audio).
- **Move vocalization** (spoken commentary only): every move is announced with its board
  coordinates, e.g. *"PROFESSOR RHODES MOVES PAWN FROM E 2 TO E 4, CHECK."* or *"YOU CASTLE
  KINGSIDE."* — including captures ("CAPTURING THE KNIGHT") and promotions.
- **Voice/tone selector**: `Auto (match session)` (default), `Normal — Joshua`, `Professor`,
  `Berserk`, `Cantankerous`. *Auto* reads `SETTINGS.ui.sessionTone` (which the story engine sets to
  `berserk` for the mad-professor easter egg) — except in a duel, which defaults to
  **cantankerous**. A manual choice always overrides.
- **Brief by default**: one short line, chosen by event priority —
  `checkmate/stalemate` → `check` → `capture` → plain move — phrased differently when *reacting to
  your move* vs *announcing its own*, plus `mindSwap`, `duelStart` and `duelMove` banks. Quiet
  player moves are commented ~50% of the time; duel chatter has its own ply cooldown; a canned line
  never repeats back-to-back.
- **Occasional long window to gloat or coach**: after its own move, `_tryLong()` may emit a
  longer line when the material balance is decisive (≥ ~3 pawns): **gloat** when the engine is
  clearly ahead, **coach** (a genuine tip) when a side is clearly behind. Rate-limited.
- **Live model commentary** (opt-in): `Commentator.live()` sends the FEN, the event, the move, the
  material edge and the duel line-up, asking for ONE cantankerous line of ≤22 words. It keeps the
  last four lines to avoid repetition, enforces a 6 s minimum gap, gives up after 3 consecutive
  failures, and always falls back to the canned bank. It is never awaited by the move loop.
- Delivered via the shared TTS pipeline in [js/audio.js](js/audio.js), so the pronunciation
  rules apply here too.

### Tones
- **Normal (Joshua)** — literal, procedural, calm.
- **Professor** — lucid, warm, visionary mad-professor.
- **Berserk** — manic, erratic, gleeful.
- **Cantankerous** — bad-tempered, dry, superior; the house voice for machine-vs-machine.

---

## Settings (`SETTINGS.chess` in [js/config.js](js/config.js))

| Key | Default | Meaning |
|---|---|---|
| `mind` | `classic` | The mind you face in a normal game. |
| `whiteMind` / `blackMind` | `strategist` / `berserk` | The duel line-up. |
| `mindDrift` | `true` | Allow mid-game brain swaps while the human leads. |
| `driftThreshold` | `2` | Pawns of player advantage that arm a drift. |
| `driftCooldown` | `8` | Plies between drifts. |
| `liveCommentary` | `false` | Ask the Live-AI model for bespoke commentary. |
| `duelDelayMs` | `900` | Pacing between moves in a duel. |

---

## Integration

- Wired in [js/main.js](js/main.js): the panel is constructed with the audio instance; the
  **♞ CHESS** status-bar button toggles it; `chess.setPersona(names.PERSONA)` on game start;
  the panel closes on RESTART; the mind dropdowns are themed via `enhanceSelect`.
- **No hard dependency on the LLM/proxy** — every default mind and the whole commentary bank are
  local, so chess works offline. The live paths reuse `ensureLiveTarget()` / `chatJSON()` from
  [js/llm.js](js/llm.js), i.e. the same proxy resolution as the main game (`?proxy=` → configured
  proxy → local dev proxy → bring-your-own-key).
- Styles live in [css/terminal.css](css/terminal.css) (`.chess-panel`, `.cp-*`).

---

## Future ideas (not built)

- **Opening book** so the strong minds vary their first moves without random tie-breaks.
- **Quiescence search** (extend captures at the leaves) to stop 2-ply horizon effects.
- **SAN notation**, underpromotion UI, PGN export, and *claimable* (rather than automatic)
  threefold/fifty-move draws.
- **Mind-vs-mind tournament** in the simulation harness ([sim/](sim/)), scoring each mind so the
  drift ladder is tuned by data rather than by feel.

---

## See also

The chess board reaches "no winner" by rule (repetition). The **tic-tac-toe** module reaches the
same conclusion by exhaustion — it enumerates all 255,168 possible games and shows that perfect
play never produces a winner. That is the surface the story's futility climax runs on. See
[js/tictactoe.js](js/tictactoe.js), [js/tictactoe-ui.js](js/tictactoe-ui.js) and
[GAME-DESIGN.md](GAME-DESIGN.md) §4.8.

