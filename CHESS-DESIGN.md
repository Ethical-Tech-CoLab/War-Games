# CHESS-DESIGN.md

Design notes for the chess module in the WarGames-inspired terminal game. Chess is a
self-contained mini-game: play the built-in engine on an optional board panel, by mouse,
keyboard, or voice, with optional in-character audio commentary.

---

## Quick answers

**1. Is AI used for the chess *dialogue* (commentary)?**
No — the commentary is **deterministic, canned tone banks** (see `COMMENTARY` in
[js/chess-ui.js](js/chess-ui.js)), not a language model. Per-move lines are intentionally
**brief**. Occasionally the engine takes a **longer "window" to gloat or coach** (see
[Commentary](#commentary)) — those are still canned, just longer. No network/LLM call is made
for chess, so it works fully offline. (An optional LLM path is noted under
[Future ideas](#future-ideas), but is deliberately *not* wired today, to keep chess reliable
and instant.)

**2. Can moves be made by voice?**
Yes. A **🎤 SPEAK** button uses the browser **Web Speech API** (`SpeechRecognition`) to
transcribe a spoken move and play it. It accepts lenient phrasings — `"e2 e4"`,
`"e two e four"`, `"knight f3"`, `"bishop to c4"`, `"castle kingside"`, `"echo two echo four"`.
The button is **feature-detected** and hidden in browsers without support (Chrome/Edge have
it; Firefox/Safari generally do not). Parsing lives in `parseSpokenMove()` in
[js/chess.js](js/chess.js).

**3. Is move logic AI or a deterministic rule book?**
Two separate things:
- **Move legality** = a **deterministic rule book** — full legal move generation (incl.
  castling, en passant, promotion, self-check filtering), validated by **perft** (from the
  start position perft(1..3) = 20 / 400 / 8902, the known-correct counts).
- **The opponent's move choice** = a **deterministic search algorithm** (negamax with
  alpha-beta pruning + material evaluation). It's classical game "AI," **not** an LLM. Given
  the same position and RNG seed it behaves deterministically (a small random tie-break keeps
  games varied).

---

## Architecture

Two modules, zero dependencies, no network:

| File | Role |
|---|---|
| [js/chess.js](js/chess.js) | Engine: state, legal moves, make-move, status, notation, spoken-move parsing, material, and the alpha-beta AI. |
| [js/chess-ui.js](js/chess-ui.js) | `ChessPanel`: the board panel, input (click / type / voice), move log, status, and commentary. |

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

### The opponent (deterministic search AI)
- `aiMove(state, depth)` → `negamax` with **alpha-beta pruning** and capture-first move
  ordering (MVV-ish) for efficiency.
- **Evaluation**: material only (P=100, N=320, B=330, R=500, Q=900), from the side-to-move
  perspective; checkmate scored as ±100000.
- **Depth = 2 by default** — snappy in-browser while still a real opponent. A small random
  tie-break between equal-value moves keeps openings from being identical every game.

### Notation & parsing
- `moveToText()` → coordinate notation, e.g. `e2e4`, `e7e8q`.
- `parseMove(state, "e2e4")` → the matching legal move (auto-queen if a promotion isn't
  specified).
- `parseSpokenMove(state, transcript)` → lenient voice parser (see below).
- `material(state)` → centipawn balance (+ = White ahead) — drives gloat/coach triggers.

---

## The panel UI (`ChessPanel`)

- **Optional, dockable panel** on the left, opened by the **♟ CHESS** button in the status
  bar (mirrors the Admin Console pattern). Title shows the active persona, e.g. "CHESS vs JOSHUA".
- **Board** = an 8×8 grid of buttons, **repainted on every move** with Unicode piece glyphs
  (White = bright green, Black = amber, on the CRT palette). Highlights: selection, legal
  targets (dot) / captures (ring), last move, and king-in-check.
- **Orientation** flips when you play Black (your pieces at the bottom).
- **Status line** reports whose move, check, and result.
- **Move log** lists coordinate moves (numbered) interleaved with commentary lines.
- **NEW** starts a fresh game; **PLAY BLACK/WHITE** swaps sides (engine moves first when you're Black).

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

Optional, in-character audio + text commentary that follows the **session's tone**.

- **Off by default** — a **Commentary** checkbox enables it (and unlocks audio).
- **Move vocalization**: when commentary is on, every move (yours and the engine's) is first
  spoken aloud with its board coordinates, e.g. *"PROFESSOR RHODES MOVES PAWN FROM E 2 TO E 4,
  CHECK."* or *"YOU CASTLE KINGSIDE."* — including captures ("CAPTURING THE KNIGHT") and
  promotions. The mover is named by tone (the persona, or "PROFESSOR RHODES" in the
  professor/berserk voice); the player's moves are narrated as "YOU". Any flavor commentary
  follows the announcement.
- **Voice/tone selector**: `Auto (match session)` (default), `Normal — Joshua`, `Professor`,
  `Berserk`. *Auto* reads `SETTINGS.ui.sessionTone`, which the game engine sets to `berserk`
  when the mad-professor easter egg fires and `normal` otherwise — so chess inherits the mood
  of your session. A manual choice overrides it.
- **Brief by default**: one short line, chosen by event priority —
  `checkmate/stalemate` → `check` → `capture` → plain move — and phrased differently when
  *reacting to your move* vs *announcing its own*. Quiet player moves are only commented ~50%
  of the time to avoid chatter.
- **Occasional long window to gloat or coach**: after its own move, `_tryLong()` may emit a
  longer line when the material balance is decisive (≥ ~3 pawns): **gloat** when the engine is
  clearly ahead, **coach** (a genuine tip) when a side is clearly behind. This is
  **rate-limited** (a multi-ply cooldown) and probabilistic, so brief lines stay the norm.
- Delivered via the shared TTS pipeline in [js/audio.js](js/audio.js), so the pronunciation
  rules (US → "you, ess", contractions, game-board suppression, lowercasing) apply here too.
- **Deterministic** (canned banks), so it works offline and never blocks a move on a network call.

### Tones
- **Normal (Joshua)** — literal, procedural, calm.
- **Professor** — lucid, warm, visionary mad-professor.
- **Berserk** — manic, erratic, gleeful.

---

## Integration

- Wired in [js/main.js](js/main.js): the panel is constructed with the audio instance; the
  **♟ CHESS** status-bar button toggles it; `chess.setPersona(names.PERSONA)` on game start;
  the panel closes on RESTART.
- **No dependency on the LLM/proxy** — the engine and commentary are entirely local, so chess
  works even when Live-AI is unavailable.
- Styles live in [css/terminal.css](css/terminal.css) (`.chess-panel`, `.cp-*`).

---

## Future ideas (not built)

- **Optional LLM commentary** for the rare long gloat/coach window — generate a bespoke line
  via the configured proxy when reachable, falling back to the canned banks. Kept out for now
  to preserve instant, offline reliability.
- Selectable **difficulty** (search depth), **underpromotion** UI, **SAN** notation, threefold
  repetition / 50-move draw claims, and PGN export.
