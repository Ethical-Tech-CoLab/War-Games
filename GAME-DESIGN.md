# GAME-DESIGN.md

Game-design research, theory, and recommendations for **this** build of the _WarGames_-inspired
terminal thriller. Where [DESIGN-IDEA.md](DESIGN-IDEA.md) asks _"what game should we make?"_,
this document asks the next question:

> **The game exists and works. Where does it under-engage the player, and what concrete
> mechanics would pull them deeper in?**

It is a companion to the scene studies ([DESIGN-IDEA-NORAD-SCENE.md](DESIGN-IDEA-NORAD-SCENE.md),
[LAUNCH-ROOM-SCENE-DESIGN.md](LAUNCH-ROOM-SCENE-DESIGN.md)) and is cross-linked from the roadmap in
[DESIGN-IDEA.md](DESIGN-IDEA.md) §9. All prose is original homage — no film script or protected
assets.

---

## 1. What this document is for

The current experience is a faithful, atmospheric **narrative-UI thriller**: a CRT terminal you
talk to, a DEFCON ladder that dreads upward, a launch-capsule cold open, a NORAD big board, a
chess mini-game, and multi-device broadcast. It reads beautifully and it _ends_ well.

But "reads beautifully" is a **film** virtue. A **game** lives or dies on the quality of the
_decisions_ it asks for and the _feedback_ it gives back. This doc audits the build through a
game-design lens and recommends mechanics that convert a great mood into a great _loop_.

---

## 2. First, the honest audit — the current engagement surface

| Surface | What the player _does_ | Engagement verdict |
|---|---|---|
| Opening menu | Picks identity set + mode, connects | Setup, not play (fine) |
| WITNESS intro | Reads; makes **one** timed key-turn choice | Strong hook; single decision |
| BEDROOM terminal | Types/chooses through a branching conversation | The core loop — good, but low decision density |
| DEFCON ladder | Watches it move | Great _feedback_, zero _input_ |
| NORAD big board | **Watches** cells brute-force against a clock | Cinematic, but a cutscene — no agency |
| Chess | Plays a full game vs. an AI | Real mechanics, but a _detour_ from the plot |
| Endings (×3) | Reaches one of annihilation / lockout / understanding | Payoff is good |

**The pattern:** the build is rich in _texture_ and _mood_ but **thin in interactive
decisions per minute**. The two most cinematic scenes — the DEFCON ladder and the NORAD board —
are things the player _watches_, not things they _do_. The strongest interaction (chess) is
tonally adjacent but narratively a side-quest.

**Core diagnosis:** the game leans on _narrative pull_ (what happens next?) and under-uses
_mechanical pull_ (what should **I** do, and did it work?). Engagement research says you need
both, braided.

---

## 3. Theory — what actually drives engagement

A short, load-bearing tour of the frameworks this design leans on.

### 3.1 Flow (Csikszentmihalyi)

Engagement peaks when **challenge tracks skill**: too easy → boredom, too hard → anxiety. Flow
needs three things this game can supply cheaply:

1. **Clear proximate goals** (not just the distant "stop the war" — a goal for the _next 30
   seconds_).
2. **Immediate, unambiguous feedback** (the DEFCON ladder is already a perfect flow instrument —
   we just need player _inputs_ that move it).
3. **A sense of control** over a difficulty that _ramps_.

### 3.2 The MDA lens (Mechanics → Dynamics → Aesthetics)

Players experience **aesthetics** (tension, dread, cleverness-reward), which emerge from
**dynamics**, which emerge from **mechanics** we actually author. Today we author aesthetics
mostly through _text_. To deepen them, we must author them through _mechanics_ — rules the
player pushes against.

Target aesthetics for this game, in priority order:

1. **Dread** — the clock is real, the stakes are legible.
2. **Cleverness-reward** — "I _understood_ the machine and used it."
3. **Consequence** — my earlier innocent choice caused this; I can see the chain.
4. **Discovery** — the system dangles a next thread.

### 3.3 "A series of interesting decisions" (Meier)

A decision is _interesting_ only when (a) there are multiple viable options, (b) the options
trade off against each other, and (c) the player has enough information to reason but not enough
to be certain. Most current terminal choices are **exploratory branches** (pick a path) rather
than **weighted decisions** (spend a resource, accept a risk). Converting even a few branches
into weighted decisions is the single highest-leverage change.

### 3.4 Tension curves & the ticking clock

Great thrillers are not monotonically tense — they **breathe**: spike, release, higher spike.
A visible, _authored_ countdown is the most reliable tension instrument in games (it externalises
stakes and compresses decision time). The NORAD board already _has_ a countdown; today the player
just can't _act_ on it.

### 3.5 Diegetic interface = the interface is the plot

This game's superpower (from the film) is that the UI **is** the fiction. Every mechanic we add
should be _diegetic_: not a health bar, but a DEFCON ladder; not a "hint button", but a rushed
colleague on the line; not "inventory", but authentication fragments recovered from the system.

### 3.6 Escape-room / "locked-room" design grammar

The requested "stop-the-countdown" challenge is, structurally, an **escape room**. The genre has
a mature grammar worth stealing wholesale:

- **A clear, single win state** ("abort the launch"), visible from the start.
- **Gating, not a wall:** progress is a chain of small "aha" unlocks, each revealing the next.
- **Legible feedback on every attempt** (right / wrong / _warmer_).
- **Layered difficulty:** the first lock is almost free (teaches the verb); later locks compound.
- **The clock as the antagonist**, not fail-by-obscurity.
- **No pure lookups:** puzzles should use information the fiction _already taught you_ (the
  misidentification, Falken-style back door, chess futility, DEFCON logic).

---

## 4. Recommendations

### 4.1 Game type & positioning

Keep the genre exactly where it is — a **narrative-UI thriller / "toy you talk to"** — and
sharpen it into a **"understand-the-system" puzzle thriller**. Not a shooter, not a strategy sim.
The fantasy is _"I outsmarted a machine by understanding it,"_ and the winning move is
comprehension, not domination. Every recommendation below serves that one fantasy.

### 4.2 Target length & session shape

- **Core run: 12–20 minutes.** Long enough for a full tension arc, short enough to finish in one
  sitting and _replay_ for other endings. (The original vertical-slice target of 10–15 min was
  right; the additions have pushed it — keep the _mainline_ tight and make extras optional.)
- **Session shape:** a **three-act clock** — Contact (calm) → Escalation (the turn) → Abort (the
  locked-room climax). Each act ~4–7 min. Breathe between acts (a quiet beat before the next
  spike).
- **Replay budget: 3–5 min** to reach a _different_ ending, because branches diverge late. This
  is what earns the "just one more" loop.

### 4.3 Number of scenes & a proposed scene map

The build already has the _spaces_; the recommendation is to give each a **verb** and put them on
one spine. Six scenes, each with a distinct interaction, is the sweet spot — enough variety to
stay fresh, few enough to author and balance well.

```text
1. WITNESS (cold open)     verb: DECIDE under a clock      — the human failsafe (exists ✓)
2. FIRST CONTACT           verb: PROBE / converse          — learn the machine (exists ✓)
3. THE GAME LIST           verb: CHOOSE (the fatal pick)   — play misread as command (exists ✓)
4. THE TURN                verb: NEGOTIATE the DEFCON       — NEW: player inputs move the ladder
5. NORAD ABORT             verb: SOLVE the locked room      — NEW: the countdown-stop climax (§4.5)
6. RESOLUTION              verb: TEACH futility             — the endings (exists ✓)
```

Chess stays as an **optional, diegetic aside** ("JOSHUA wants to play something simpler first"),
reachable from Act 2 — a palate-cleanser and a thematic plant for the futility ending, never a
required detour.

### 4.4 Engagement mechanics to add (ranked by leverage)

1. **Make the DEFCON ladder an _input_, not just a readout (Act 4).**
   Give the player 2–3 "moves" per exchange whose _tone_ and _content_ push DEFCON up or down:
   **REASSURE / STALL / CHALLENGE / COMPLY**. Each has a trade-off (STALL buys time on the clock
   but erodes the machine's "trust"; CHALLENGE can de-escalate _or_ trip a persistence spike).
   This converts the game's best feedback instrument into a genuine decision space (§3.3), and
   it's cheap: the state machine already exists.

2. **A visible, shared clock across Acts 4–5.** One countdown, diegetic ("TIME TO LAUNCH"),
   started at the turn and stopped only by the abort. It ties the conversation and the locked
   room into a single tension curve (§3.4) and makes every STALL/SOLVE choice _weigh_.

3. **"Warmer / colder" feedback on every attempt.** Wrong inputs should teach, not punish:
   a wrong abort code narrows the space ("2 OF 5 SEGMENTS MATCH"), a mis-timed line gets a
   diagnostic machine reply. This is the escape-room feedback rule (§3.6) and it protects flow.

4. **Resource pressure, lightly.** One scarce resource — **operator attention / "line time"** —
   spent by stalling and probing. It forces prioritisation without a UI-heavy economy. Diegetic
   framing: every second on the line is a second the abort window shrinks.

5. **Plant-and-payoff callbacks.** Information the player learns early (the mis-ID name, the
   back-door logic, chess futility) becomes the _key_ to a later lock. This delivers the
   "cleverness-reward" and "consequence" aesthetics (§3.2) and makes the world feel coherent.

6. **A quiet "breathe" beat between acts.** One deliberately calm screen (a held cursor, a line
   of narration) before each escalation. Tension needs release to spike again (§3.4).

### 4.5 The headline recommendation — a locked-room "ABORT THE LAUNCH" climax

This is the requested countdown-stop challenge, designed as a proper escape room on the NORAD
board. It converts the board from a **cutscene** into the game's **peak interactive moment**.

**Frame.** The machine has committed to the launch. A countdown runs (suggest **3:00**, tuned in
playtest). The player is the last human in the loop with a console. The single, visible win state:
**enter the abort authorization before the clock hits zero.** No twitch skill — only reasoning
under time pressure.

**Structure — three chained locks (gating, not a wall; §3.6):**

1. **Lock 1 · IDENTITY (teaches the verb; nearly free).**
   The abort console demands _who you are_. The machine still mis-identifies you (Scene 2's
   plant). The player must decide to **impersonate** (fast, but the machine later "notices") or
   **authenticate honestly** (slower, needs a fragment found by probing). Either works — the
   choice colours the ending. _Aha: "the mis-ID is a door, not just a joke."_

2. **Lock 2 · THE BACK DOOR (the core puzzle).**
   The primary abort code is unknown, but — as in the film's spirit — the system's creator left a
   personal back door. The player assembles it from clues surfaced across Acts 2–3 (a name, a
   date, a word the machine kept repeating). The NORAD 14-segment readout becomes the **input
   surface**: the player fills cells, and the board gives **warmer/colder** per segment
   (reusing the existing cell-solve animation as _feedback for player guesses_ instead of
   autosolve). _Aha: "I already know this; I just have to see it."_

3. **Lock 3 · THE BOUNDARY (the thematic climax).**
   Even with the back door, a raw abort only _pauses_ the machine — it will re-initiate
   (the persistence beat). The true stop is to make the machine **play the unwinnable game
   against itself** until it generalises futility (the chess/tic-tac-toe insight). The final
   input is not a code but an _instruction that reframes the game_. _Aha: "the only winning move
   is not to play."_ This is the bridge into the RESOLUTION scene and the "understanding" ending.

**Failure & difficulty.** The clock reaching zero is _not_ an instant game-over screen — it is the
**annihilation ending**, authored and earned, so failure is dramatic, not frustrating. Difficulty
is tuned by (a) clock length, (b) how many clue fragments the player gathered earlier (rewarding
exploration), and (c) an optional **assist** — a rushed colleague on the line who can be _asked_
for a nudge at the cost of clock time (a diegetic hint system, §3.5).

**Why this is the right climax.** It puts the player's hands on the game's best tension
instruments (the ladder, the board, the clock), it pays off every earlier plant, its three locks
ramp difficulty cleanly (§3.1), and its solution _is the film's thesis expressed as a mechanic_
rather than a line of text. It also reuses assets already built (the NORAD readout, cell-solve
animation, DEFCON ladder, key-turn visual), so it is high-impact for moderate cost.

### 4.6 Difficulty, accessibility, and assists

- **No twitch requirements.** All timing windows should be generous enough to _think_; the clock
  creates pressure, not reflex tests.
- **Layered assists** (all diegetic): the colleague-on-the-line nudge, warmer/colder feedback, and
  a "SCRIPTED" mode that is already deterministic. Keep the existing **SKIP INTRO**, reduced-motion,
  and audio toggles; add a **difficulty/clock** setting to the opening menu.
- **Full keyboard path** for every new mechanic (aligns with the roadmap's a11y pass, P2 [#5]).

### 4.7 Replayability

- **Ending-driven replay:** branches already fork to 3 endings — surface an end-card that names
  the ending _and hints the others exist_ ("2 of 3 outcomes seen"). Light meta-goal, big pull.
- **Path variety:** the Act-4 DEFCON moves and the Act-5 identity choice should visibly change the
  epilogue text, so a second run _reads_ differently.
- **Identity sets** already re-skin the whole game — lean into this as a "New Game+" flavour toggle.

---

## 5. Prioritized recommendations

| Pri | Recommendation | Why it matters | Rough cost |
|-----|----------------|----------------|------------|
| **P1** | DEFCON as an _input_ in Act 4 (REASSURE/STALL/CHALLENGE/COMPLY) | Turns the best feedback tool into a decision space (§3.3) | Low–Med |
| **P1** | Locked-room **ABORT** climax on the NORAD board (§4.5) | Converts the marquee scene from cutscene to peak play | Med |
| **P1** | One shared, diegetic countdown across Acts 4–5 | Braids conversation + board into one tension arc (§3.4) | Low |
| **P2** | Warmer/colder feedback on all attempts | Protects flow; makes failure teach (§3.6) | Low |
| **P2** | Plant-and-payoff callbacks (mis-ID, back door, chess) | Delivers cleverness + consequence aesthetics (§3.2) | Med |
| **P2** | Diegetic hint (colleague-on-the-line) + difficulty/clock setting | Accessibility without breaking fiction (§4.6) | Low |
| **P3** | Ending-aware end-card ("2 of 3 seen") + path-sensitive epilogue | Cheap, strong replay pull (§4.7) | Low |
| **P3** | Chess re-framed as an optional Act-2 aside that plants futility | Removes the detour feel; strengthens theme | Low |

---

## 6. Risks & constraints

- **Don't out-engineer the mood.** The game's power is restraint. Add _decisions_, not clutter —
  every new element must be diegetic and legible, or it costs more than it gives.
- **Puzzle fairness.** The locked room must be solvable from information the game _taught_, never
  from outside lookups or guess-the-verb. Playtest the clue trail hard.
- **Tone.** The subject is heavy; keep the film's humane, anti-nihilist landing. The win is
  _understanding_, and the tone should reward it with relief, not spectacle.
- **Scope discipline.** Ship P1 as a vertical slice of the _new_ loop before building P2/P3.
- **IP.** Original names, dialogue, and assets for anything public (see [DESIGN-IDEA.md](DESIGN-IDEA.md) §6).

---

## 7. TL;DR

- The build is **mood-rich but decision-thin**: its two most cinematic scenes (DEFCON, NORAD) are
  watched, not played.
- Fix it by **braiding narrative pull with mechanical pull** — make the DEFCON ladder an _input_,
  put a real _clock_ across the climax, and give every attempt _warmer/colder_ feedback.
- Ship one headline mechanic: a **locked-room "ABORT THE LAUNCH"** climax on the NORAD board with
  three ramping locks (identity → back door → the boundary), whose solution _is_ the film's thesis.
- Keep runs **12–20 min**, six scenes each with a distinct verb, and make replay cheap so players
  chase the other endings.
- Add nothing that isn't diegetic. The interface is still the plot.
