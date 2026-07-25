# LAUNCH-ROOM-SCENE-DESIGN.md

A design study for an **opening "launch-control" scene** — two crew members sealed in a
hardened missile-control capsule, bound by a **two-person turn-key rule**, who receive an
order to launch and must each choose whether to turn their key. It is the cold, human
counterweight to the playful teenager-at-a-home-computer story: before the player ever
touches a keyboard, they feel the weight of the thing the machine will later treat as a game.

> **North-star for this scene (one line):**
> Two people, two keys, one order, and no way to be sure it's real — the tension isn't the
> launch, it's the *obedience*. That is the question the whole game is really about.

This is an **homage** in the spirit of the film's opening, written with **original names,
dialogue, and staging** (see [DESIGN-IDEA.md](DESIGN-IDEA.md) §6 on IP). It complements the
[NORAD big-board scene](DESIGN-IDEA-NORAD-SCENE.md) and the terminal thriller.

Three jobs, mirroring the request:

1. **§1–§4 — What the scene is + interactive design options + recommendation.**
2. **§5 — How it transitions into gameplay** (must be seamless) and the **skip** option.
3. **§6 — The pivot**: "take the humans out of the loop" → the introduction of the machine
   (`{{SYSTEM}}` / `{{PERSONA}}`), plus the **A/B test** plan to measure whether it adds weight.

---

## 1. Why open here (the dramatic function)

The film opens *away* from its hero on purpose. The launch-capsule cold open does four things
a game desperately wants done before its first real choice:

- **Establishes the stakes as human and fragile.** The danger isn't a monster; it's two tired
  people following a procedure they can't fully verify. Command-and-control is shown to be
  *people under orders*, not infallible machinery.
- **Creates dramatic irony.** The audience learns "this is not a game" **before** the hero
  assumes it is. Every later innocent keystroke lands harder because we've already sat in the
  capsule.
- **Frames the thesis.** A launch that hinges on a human hesitating is exactly the "weak link"
  that motivates the fateful decision to hand the trigger to a machine. The scene *earns* the
  premise instead of stating it.
- **Sets tone by contrast.** Sterile concrete, fluorescent hum, and a checklist — so the smash
  cut to a messy teenage bedroom feels like whiplash (the good kind).

Design implication: the scene should be **short, claustrophobic, procedural, and morally
uncomfortable** — and it should hand its tension directly to the gameplay that follows.

### 1.1 Original premise (IP-safe staging)

- **Where:** a two-person launch-control capsule, deep underground, blast door sealed.
- **Who:** two crew — call them **Commander** and **Deputy** (or theme them from the active
  name set: `{{ORG}}` crew). The player is the **Deputy** (the one who hesitates); the
  Commander is authored/AI.
- **The rule (two-person concept):** a valid launch needs **both** keys turned, at **separated
  stations** (you can't reach both), within a few seconds of each other. Neither person can do
  it alone; neither can stop it alone once both commit.
- **The order:** an Emergency Action Message arrives and authenticates. Procedure says turn the
  keys. Nothing in the room can tell them whether the war is real or a drill or an error.
- **The failsafe/threat (dramatized, not gratuitous):** doctrine treats a crew member who
  refuses a lawful, authenticated order as a failure of the deterrent. The scene surfaces the
  awful pressure — *comply, or be treated as the malfunction* — without glorifying violence
  (see tone note §7).

---

## 2. Interactive design options (how to play it)

Five options, ordered from most-restrained to most-interactive. Each says what the player
*does*, why it works, and its cost.

### Option A — "WITNESS": a paced, near-cinematic cold open (lowest interaction)

The scene plays as timed terminal narration + sound, with **one** interaction at the climax:
the launch order authenticates, the prompt `TURN KEY? (Y/N)` appears, and the player must act
under a visible countdown. Whatever they do (turn, refuse, freeze until the timer expires)
cuts to the bedroom.

- **Why it works:** maximum mood, minimum scope; the single choice is the whole point.
- **Cost:** low. Reuses the terminal typewriter + a countdown (already built for NORAD).
- **Best as:** the default cold open and the thing we A/B test first.

### Option B — "THE CHECKLIST": procedural micro-interactions

The player performs the **turn-key ritual** as 3–5 tiny prompts: acknowledge the message,
read back the authentication code, arm the station, place hand on key, and — on the
Commander's "on my mark" — turn. Each step is a keypress; the Commander (authored/AI) drives
cadence and pressure ("Deputy, confirm.").

- **Why it works:** the *procedure* is the horror. Making the player execute it implicates
  them; the final key-turn feels earned, not narrated.
- **Cost:** low–medium (a short scripted sub-graph + Commander voice lines).
- **Best as:** the recommended richer version once A sizes the appetite.

### Option C — "TWO KEYS, ONE PLAYER": the impossible-alone beat

Stage the two-person rule mechanically: the UI shows **two key stations**; the player controls
only the Deputy's. The Commander turns theirs and calls the mark; the player must turn within
the window. If they hesitate, the Commander escalates (pleads, orders, then — offscreen —
reaches for the sidearm the doctrine implies). The player can: **turn**, **refuse**, or
**stall**. Three outcomes, each a different cut into the game.

- **Why it works:** dramatizes "neither can act alone / neither can stop it alone" as a
  mechanic; the branching gives replay weight and seeds the A/B analysis.
- **Cost:** medium (branching + a second-station UI motif + timing).
- **Best as:** the "premium" cold open; a strong candidate if the A/B test shows the scene
  adds engagement.

### Option D — "SPLIT COLD OPEN": capsule on one screen, bedroom on the other

Use the existing **SPLIT view** ([DESIGN-IDEA-NORAD-SCENE.md](DESIGN-IDEA-NORAD-SCENE.md) §3a):
the capsule scene runs on one pane while the bedroom boots on the other, so the player sees
both worlds at once from second zero. Great for a **producer/showcase** or a multi-screen
takeover, less ideal as the intimate solo intro.

- **Why it works:** the dramatic irony becomes literal and simultaneous.
- **Cost:** medium (reuses SPLIT; needs the capsule as a scene the split can host).
- **Best as:** an installation/takeover variant, not the default solo path.

### Option E — "DRILL OR REAL?": the ambiguity puzzle (most interactive)

The player is given tools to *try to verify* the order (cross-check the code, request
confirmation, call the other capsule) under a countdown — and discovers the system **cannot
prove** it's real in time. The scene's lesson is epistemic: you will never have certainty; you
only have the rule. Ends on the forced choice.

- **Why it works:** turns the theme into gameplay and pre-teaches "the machine can't tell
  simulation from reality either" — the game's core.
- **Cost:** medium–high (verification sub-systems, more authoring).
- **Best as:** a later, deeper cut; possibly a "Director's mode" once the core ships.

---

## 3. Comparison & recommendation

| | A · Witness | B · Checklist | C · Two Keys | D · Split | E · Drill-or-Real |
|---|---|---|---|---|---|
| Emotional weight | ★★★★ | ★★★★ | ★★★★★ | ★★★★ | ★★★★★ |
| Interactivity | ★ | ★★★ | ★★★★ | ★★ | ★★★★★ |
| Scope / effort | Low | Low–Med | Med | Med | Med–High |
| Reuses existing systems | ★★★★★ | ★★★★ | ★★★ | ★★★★★ | ★★ |
| Good A/B baseline | ★★★★★ | ★★★★ | ★★★ | ★★ | ★★ |
| Risk of stalling the start | Low | Low | Med | Med | Med–High |

**Recommendation:** ship **Option A ("WITNESS")** as the default cold open and the A/B
baseline, authored so it can **grow into Option B ("THE CHECKLIST")** without a rewrite (A is
literally B with the middle steps collapsed). Keep **Option C** as the premium upgrade if the
data says the scene earns its keep, **Option D** as the takeover/showcase variant (it already
has SPLIT), and **Option E** as a later "Director's mode."

Rationale: A is cheap, reuses the terminal + countdown, delivers the irony, and is the cleanest
thing to toggle on/off for a real A/B measurement (§6.3). Everything richer is an additive
step on the same authored spine.

---

## 4. Beat sheet (Option A, growable to B)

Keep it **≤ 60–90 seconds**. All original text; `{{TOKENS}}` theme it to the active name set.

1. **Seal & hum.** Black. Low room tone. `[{{ORG}} LAUNCH CONTROL — CAPSULE SEALED]`. A cursor.
2. **Establish the two.** Terse two-hander: Commander and Deputy trade a dry, procedural line
   or two. Coffee, boredom, 03:xx local — ordinary, which is the point.
3. **The message.** An alert tone. `EMERGENCY ACTION MESSAGE — INBOUND`. Authentication scrolls
   and **matches**. The room's mood drops.
4. **The rule.** One line reminds us both keys are required and the stations are apart — no one
   acts alone. (In B, the player now does the read-back + arm steps.)
5. **The mark + the countdown.** `TURN KEY ON MY MARK.` A visible timer starts (reuse the NORAD
   countdown component). Prompt: `TURN KEY? (Y / N)`.
6. **The choice (single interaction in A):**
   - **Turn (Y):** keys turn; a beat of silence; `LAUNCH ENABLED`. Hard cut.
   - **Refuse (N) / Freeze (timeout):** the Commander escalates; the scene holds on the awful
     pressure of the failsafe, then a harder cut. (No on-screen gore; implication over depiction.)
7. **The pivot line.** A single authored line plants the seed for §6 — a superior or analyst,
   frustrated by the hesitation, mutters that the *humans* are the unreliable part.
8. **Smash cut** → the bedroom / `LOGON:` boot (§5).

> **Persisted signal:** record the player's choice (`turned` | `refused` | `timeout`) as a
> flag. It costs nothing now and lets later beats (or the ending) call back to it — "you
> hesitated once before," etc.

---

## 5. Transition into gameplay + the skip option

### 5.1 Seamless hand-off (must feel like one continuous piece)

The cold open and the game already share the **terminal** and its typewriter, so the cut is a
**clear + boot**, not a scene-load:

- On finish, `terminal.clear()` → play the existing modem handshake → `LOGON:` (the current
  [dialogue.js](js/dialogue.js) `dial_in` beat). The capsule was the *world*; the bedroom is
  the *hero* — same screen, same phosphor, hard contrast in content.
- Implementation fit: add the capsule as **new opening node(s)** in the scripted graph *before*
  `cold_open`, or as a small pre-scene the engine plays before `engine.start()`. The engine
  already walks nodes with `pause`/`clear`/`effect`, so this is authoring, not new plumbing.
- **DEFCON tie-in:** the scene can pre-set the mood at DEFCON, and — nicely — the routed
  **NORAD-POV** cold-open lines (§2 of the NORAD doc) can live on the big board while the
  capsule two-hander carries the terminal, so both scenes already cooperate.

### 5.2 Skip (yes — and remember it)

The scene is an *introduction*; respect the player's time.

- **A visible `SKIP INTRO` affordance** from the first second (a dim corner control or "press
  any key to skip"), consistent with the app's `.ghost-btn` style.
- **A menu toggle** — "Play the launch-control intro" (on/off) on the start screen, so repeat
  players default to skipping. Store the preference (localStorage) like the LLM key.
- **A/B override:** the experiment (§6.3) can force intro on/off regardless of the toggle for a
  clean measurement; outside the experiment, the toggle wins.
- **Skipping is instant** and drops straight to `LOGON:` — no penalty, no lost state.

---

## 6. The pivot: "take the humans out of the loop" → the machine

The scene's hesitation is the **argument** for the machine. Use it as the on-ramp to
`{{SYSTEM}}` / `{{PERSONA}}`.

### 6.1 The jumping-off line

Close the capsule on an authored beat where a scientist/analyst (original character — e.g.
`{{CREATOR}}`) concludes that human hesitation is the flaw and that judgment should be
**delegated** to an automated system. This is stated with *confidence and good intentions* —
the horror is that it sounds reasonable. It hands the baton directly to the machine's
introduction.

### 6.2 Introducing `{{SYSTEM}}` (full belief in its power)

Immediately after (or as the first thing the player later "discovers"), establish the machine
as the answer to the scene's problem: tireless, literal, certain — *"it does not hesitate."*
Its very virtue (never freezing at the key) is the trap. Two placements:

- **Adjacent:** a short "months later" title, then the machine is switched in — the player
  watches authority move from two anxious humans to one serene system.
- **Deferred (recommended):** end on the pivot line; let the machine's reveal happen through
  *play* (the terminal), so the game keeps its "learn the system through use" principle. The
  capsule just makes the later reveal land.

### 6.3 A/B test plan (does it add weight?)

Measure whether the intro helps, using the existing **telemetry** ([js/telemetry.js](js/telemetry.js))
and **sim harness** ([sim/](sim/)):

- **Arms:** `A0` no intro (straight to `LOGON:`) vs `A1` Option A intro. (Later: `A2` = Option B.)
- **Assignment:** deterministic 50/50 by a stored id or a URL/query flag; forceable for QA.
- **Primary metrics:** completion rate of the first act, time-to-first-choice, and reaching an
  ending; **drop-off during the intro** (did we lose people before the game?).
- **Secondary/qualitative:** which ending they reach, whether they engage the persistence beat,
  and a one-tap "did that feel tense?" prompt on the results screen.
- **Guardrail:** intro **skip rate** and any increase in early quits — if the intro raises
  drop-off more than it raises engagement, default it off.
- **Log:** emit an `introArm` + `keyChoice` (`turned`/`refused`/`timeout`) event per session so
  the sim's [analyze.mjs](sim/analyze.mjs) can slice outcomes by arm.

### 6.4 Simulated war, damage, casualties (handle with care)

The scene (and the later WOPR/`{{SYSTEM}}` sequences) can show **simulation** readouts —
projected exchanges, megatons, estimated casualties — but as **cold machine abstraction**, not
spectacle: numbers on the big board, a clinical voice, the horror living in the *tally* and the
machine's indifference to it. This reinforces the thesis (a system optimizing a goal without
context) and pays off the film's humane turn — that a game whose only winning move is not to
play is the only sane read of the numbers. Keep depiction implied and non-gratuitous (§7).

---

## 7. Constraints, risks, tone

- **IP:** original names/dialogue/staging only; evoke the film's *situation and theme*, never
  its script. Theme all copy through `{{TOKENS}}` so it re-skins with the identity set.
- **Tone:** nuclear command is heavy. Earn it with restraint and the film's anti-nihilist
  hope; **imply** the failsafe's threat and casualties rather than depicting violence.
- **Pacing risk:** an intro that delays play risks drop-off — hence the hard ≤90s cap, the
  always-available skip (§5.2), and the A/B guardrail (§6.3).
- **Accessibility:** the countdown choice needs a non-twitch fallback (generous timer, keyboard
  + click, reduced-motion), consistent with the rest of the app.

---

## 8. Open questions

1. **Default on or off?** Ship the intro on by default and let the A/B decide, or off with an
   opt-in until the data is in?
2. **Player role:** always the Deputy (the hesitator), or let the player pick a seat?
3. **How explicit is the failsafe threat?** A single implied line, or a fuller (still
   non-graphic) beat?
4. **Where does `{{SYSTEM}}` enter** — adjacent to the capsule (§6.2 "adjacent") or deferred to
   play (recommended)?
5. **Ship tier:** A only first, or A with the B checklist steps authored behind a flag?

---

## 9. TL;DR

- Open on a **two-person launch capsule** bound by a **turn-key failsafe**: two people, two
  keys, one unverifiable order — the tension is *obedience*, and it sets the human stakes the
  machine will later treat as a game.
- Build **Option A ("WITNESS")** — a ≤90s paced cold open with a single countdown key-turn
  choice — as the default and A/B baseline, authored to **grow into Option B ("THE
  CHECKLIST")**; keep **Two Keys / Split / Drill-or-Real** as richer upgrades.
- **Transition** by `clear` → modem → `LOGON:` (same terminal, hard content contrast); ship a
  first-second **SKIP** + a remembered start-menu toggle.
- **Pivot** on "the humans are the unreliable part" → introduce `{{SYSTEM}}` (certain, tireless,
  *never hesitates* — its virtue is the trap), and **A/B test** with telemetry to prove the
  intro adds weight without raising drop-off. Keep simulated war **clinical and implied**, not
  spectacle.
