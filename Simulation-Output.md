# Simulation-Output.md

Monte Carlo simulation results, multi-vector analysis, and recommendations for the
_WarGames_-inspired terminal game. Methodology is in [how-to-guide.md](how-to-guide.md). All
raw per-run data lives in `sim/results/` and can be re-analyzed at any time with
`node sim/analyze.mjs`.

This batch includes a **real GitHub Models run** (Track C) alongside the offline scripted and
synthetic-class tracks.

---

## 0. Executive summary

- **The game's structure is sound.** Static validation is clean: **20/20 nodes reachable, 0
  broken links, 0 leftover `{{tokens}}` across all four name sets, all 3 endings reachable.**
- **Scripted mode is well-balanced.** 500 random playthroughs split the three endings
  **35.2% / 34.0% / 30.8%** with full node coverage — no dead content, no dead ends.
- **Real hosted models make structured output a non-issue.** gpt-4o and gpt-4o-mini returned
  **100% valid JSON with 0 parse failures** over 12 games each; Llama-3.3-70B 98.5%. The
  "malformed JSON" risk the synthetic profiles emphasized **did not materialize** for
  first-party hosted models.
- **The real risk is the opposite of the synthetic prediction: games that never resolve.**
  Real models are polite and keep talking without escalating — **16–25% of real games hit the
  turn cap and were force-ended** (vs ~0% synthetic). This is the single most important
  finding and it's a **game-design issue, not a model failing**.
- **Narrative reliability is excellent on real models:** "taught-but-not-learned" was **0%**
  across all real models — when the player teaches futility, real models resolve to the good
  ending every time.
- **Recommended default: `gpt-4o-mini` (balanced mid-tier).** Identical reliability to gpt-4o
  (100% JSON, 0% taught-not-learned) at **~1/17th the cost** ($0.0009 vs $0.016 per game) and
  comparable speed. Reserve `gpt-4o` for a premium mode. **Avoid Llama-3.3-70B here** (3× the
  latency: ~34 s/game) and **small/experimental-tier models** (rate-limited to the point of
  being impractical — see §4).
- **Top fix (new, from real data): make the engine drive resolution** instead of waiting for
  the model to declare an ending (recommendation R-H4).

> **Scope note.** Synthetic profiles (Track B) emulate model *classes* with calibrated
> estimates and exist to push volume through the game's real parsing path. Track C uses
> **real** GitHub Models. Where they disagree, **Track C wins** and this document says so.

---

## 1. Batch manifest

| Field | Value |
|---|---|
| Seed | `1337` (reproducible) |
| Scripted runs | 500 |
| Synthetic LLM runs | 500 per class × 5 classes = 2,500 |
| Real LLM runs | 12 per model × 3 complete models + 1 partial (see below) |
| Real endpoint | `https://models.github.ai/inference/chat/completions` (GitHub Models) |
| Real turn cap | 12 (vs 30 in-game / synthetic — see §4.2 caveat) |
| Name sets | film, sentinel, oracle, helios (randomized per run) |
| Raw data | `sim/results/*.jsonl` (every run kept) |

**Real-run completion:** `gpt-4o` ✅ 12, `gpt-4o-mini` ✅ 12, `Llama-3.3-70B` ✅ 12,
`Phi-4` ⚠️ 1 (rate-limited), `Ministral-3B` ❌ 0 (rate-limited out). The batch was stopped
after the three primary models completed because GitHub Models throttles the small/
experimental tier heavily — itself a practical finding (§4.4).

---

## 2. Track A — Scripted mode (deterministic engine)

### 2.1 Graph validation (static)

| Check | Result | Status |
|---|---|---|
| Nodes reachable | 20 / 20 | ✅ |
| Dangling `next`/choice links | 0 | ✅ |
| Endings reachable | 3 / 3 | ✅ |
| Leftover `{{tokens}}` (all 4 name sets) | 0 | ✅ |

### 2.2 Monte Carlo (500 random playthroughs)

| Vector | Result |
|---|---|
| Ending distribution | lockout **35.2%**, annihilation **34.0%**, understanding **30.8%** |
| Path length (p50 / p95 / max) | 14 / 15 / 16 nodes |
| Node coverage | 20 / 20 distinct nodes |
| No-ending / missing-node / loops | 0 / 0 / 0 |
| `defcon_clamped` events | 137 (≈27% of runs) — see finding F-S1 |

**Read:** healthy content — balanced outcomes, full coverage, no broken paths. Only signal is
that the escalation delta chain drives raw DEFCON below 1 before an ending (relies on the
clamp) — a tuning smell, not a bug.

---

## 3. Track B — Synthetic LLM classes (500 runs each)

Reliability estimates by model *class* (calibrated, not benchmarks). Ranked by contract score.

| Class | Score | JSON % | Parse-fail % | Unresolved % | Reply p95 | Taught-not-learned % |
|---|---|---|---|---|---|---|
| safety-tuned | 94 | 99.39 | 0.61 | 0 | 4 | 0 |
| frontier-large | 93 | 99.76 | 0.24 | 0 | 3 | 3.61 |
| balanced-mid | 87 | 98.97 | 1.03 | 0 | 3 | 4.26 |
| reasoning-heavy | 84 | 98.23 | 1.77 | 0 | 7 | 1.43 |
| small-fast | 10 | 87.55 | 12.45 | 0.2 | 2 | 19.39 |

**What Track B got right:** small/local models are unreliable (12% unusable output, 19%
broken good-endings); reasoning-class models are verbose (p95 7 lines) and over-cautious.
**What it got wrong:** it over-predicted JSON failure for capable models and **under-predicted
the stalling/unresolved problem** — corrected by Track C below.

---

## 4. Track C — Real models (GitHub Models) ⭐

12 games each for the three models that completed. `turnCap = 12`.

| Model | Class | n | Score* | JSON % | Parse-fail % | **Unresolved %** | Taught-not-learned % | Turns (mean) | Latency/game (mean) | Cost/game |
|---|---|---|---|---|---|---|---|---|---|---|
| **openai/gpt-4o-mini** | balanced | 12 | 63 | **100** | 0 | 25 | **0** | 6.6 | 13.7 s | **$0.0009** |
| **openai/gpt-4o** | frontier | 12 | 63 | **100** | 0 | 25 | **0** | 6.7 | 11.6 s | $0.0157 |
| **meta/Llama-3.3-70B** | open frontier | 12 | 31 | 98.5 | 1.49 | 16.7 | **0** | 5.6 | **34.5 s** | $0.0028 |
| microsoft/Phi-4 | small-mid | 1 | — | 100 | 0 | 0 | 0 | 7 | 13.6 s | $0.0006 |

<sub>*The composite score is dominated by the unresolved penalty, which is partly a turn-cap
artifact (§4.2). Raw reliability (JSON validity, taught-not-learned) is where these models
truly excel. Phi-4 n=1 is **not** statistically meaningful — shown for completeness only.</sub>

### 4.1 Ending distribution (real)

| Model | Annihilation | Understanding | Lockout |
|---|---|---|---|
| gpt-4o | 33.3% | 25.0% | 41.7% |
| gpt-4o-mini | 41.7% | 16.7% | 41.7% |
| Llama-3.3-70B | 50.0% | 25.0% | 25.0% |

Lockout is inflated because **every unresolved (turn-cap) game is force-ended as lockout** —
see §4.2.

### 4.2 Headline finding: real models under-drive resolution

Real models stayed in character, kept `defconDelta` conservative, and **rarely declared an
`ending` on their own** unless the player explicitly pushed. With a 12-turn cap, **25% of
gpt-4o / gpt-4o-mini games and 17% of Llama games never resolved** and were forced to lockout.

- **Caveat:** the real track used `turnCap = 12` to conserve rate limit, vs 30 in the shipped
  game and synthetic track. A longer cap would lower the raw %, but the underlying behavior —
  models don't escalate the doomsday clock on their own — would just mean *longer* stalled
  games, which is arguably worse for pacing.
- **Implication:** the experience must not depend on the model to advance DEFCON or end the
  game. The **engine** should own escalation pressure. → recommendation **R-H4**.

### 4.3 What real models do better than predicted

- **Structured output is solved** for hosted first-party models: gpt-4o / gpt-4o-mini = 100%
  valid JSON, 0 parse failures. R-H1 (parse recovery) is therefore **low urgency for the
  recommended models** and matters mainly for open/small models (Llama had 1.49% failures).
- **Narrative payoff is reliable:** 0% taught-but-not-learned across all real models.

### 4.4 Practical finding: small-tier models are rate-limited to impracticality

`Phi-4` managed 1 game and `Ministral-3B` 0 before GitHub Models throttling stalled them,
while the frontier/balanced models completed freely. Even setting quality aside, **small/
experimental-tier models are impractical for volume interactive use on GitHub Models.**

### 4.5 Economics & latency (real, measured)

| Model | Cost/game | Tokens in/out (avg) | Latency/game |
|---|---|---|---|
| gpt-4o-mini | **$0.0009** | 4,698 / 399 | 13.7 s |
| gpt-4o | $0.0157 (~17×) | 4,566 / 424 | 11.6 s |
| Llama-3.3-70B | $0.0028 | 3,640 / 327 | **34.5 s (3× slower)** |

Prompt tokens are high (~4.5k/game) because the full conversation history is resent each
turn — an optimization opportunity (R-T2).

---

## 5. Synthetic vs. real reconciliation

| Vector | Synthetic said | Real showed | Verdict |
|---|---|---|---|
| JSON validity (capable models) | 98.2–99.8% | **100%** (OpenAI), 98.5% (Llama) | Real better; parse-recovery low priority for hosted models |
| Parse failure | up to 1.8% | **0%** (OpenAI) | Over-predicted |
| Unresolved / stalling | ~0% | **17–25%** | **Badly under-predicted — key correction** |
| Taught-but-not-learned | 3–4% | **0%** | Real better |
| Latency spread | modeled | Llama 3× slower than OpenAI | Confirmed direction, real magnitudes differ |
| Small-model viability | "avoid (unreliable)" | "avoid (also rate-limited)" | Confirmed + reinforced |

**Lesson:** synthetic Monte Carlo is excellent for exercising the game's *handling code* at
volume, but real runs were essential to discover the *stalling* behavior that no reasonable
synthetic profile anticipated.

---

## 6. Findings (thresholded)

| ID | Severity | Area | Finding |
|---|---|---|---|
| **F-R1** | 🔴 | real: gpt-4o / gpt-4o-mini / Llama | **Unresolved 25% / 25% / 17%** — real models stall to the turn cap; games force-end as lockout. |
| F-R2 | 🟡 | real: Llama-3.3-70B | Latency ~34.5 s/game (3× OpenAI) + 1.49% parse failure. |
| F-R3 | 🟡 | real: small tier | Phi-4/Ministral rate-limited out (1 / 0 games) — impractical at volume. |
| F-S1 | 🟡 tuning | scripted | DEFCON deltas drive raw value below 1 in ~27% of runs (clamped). |
| F-L1 | 🔴 | synthetic small-fast | JSON validity 87.55%, parse-fail 12.45% (small/local unreliable). |
| F-L2 | 🔴 | synthetic small-fast | Taught-but-not-learned 19.39%. |
| F-L4 | 🔴 | synthetic reasoning | Reply lines p95 = 7 (overflow risk). |
| F-L5 | 🟡 | synthetic safety-tuned | Forces "understanding" 93% (avg ~2 turns) — kills stakes. |

---

## 7. Recommendations

Prioritized by **severity × frequency**. Tagged **Bug / Tuning / Hardening / Content / Model**.

### 7.1 Game hardening

- **R-H4 — Make the engine own escalation & resolution (Hardening, NEW, highest priority).**
  The #1 real finding (F-R1) is that models don't advance the doomsday clock or end the game
  on their own. **Fix options (do at least the first):**
  1. **Engine-driven DEFCON pressure:** decrement DEFCON on a schedule (e.g., a small
     automatic escalation every N turns regardless of model output), so the game always
     converges instead of relying on `defconDelta`.
  2. **Turn-budget in the prompt:** tell the persona it has a limited number of exchanges and
     must move toward a resolution.
  3. **Scripted climax handoff:** if no ending by turn K, hand control to the scripted
     futility climax so the payoff always lands (instead of a bare "lockout").
- **R-H1 — Per-turn parse-failure recovery (Hardening, medium).** Still worth having for
  open/small models (Llama 1.49%; synthetic small 12%): on a failed parse, re-prompt once for
  JSON, else show a clean `SIGNAL GARBLED — REPEAT` line rather than raw text. **Low urgency
  for gpt-4o/mini** (0% failures).
- **R-H2 — Clamp reply lines on render (Hardening, low).** Cap persona replies to ~4 lines +
  add "≤4 short lines" to the prompt. Mainly benefits reasoning-class models (F-L4).

### 7.2 Tuning & performance

- **R-T1 — Rebalance scripted escalation deltas (Tuning).** Land DEFCON on 1 exactly at the
  climax instead of clamping up from 0 in ~27% of runs (F-S1).
- **R-T2 — Trim LLM context (Performance).** ~4.5k prompt tokens/game because full history is
  resent each turn. Summarize/window the history to cut cost and latency, especially valuable
  once R-H4 lengthens games.

### 7.3 Content

- **R-C1 — No action.** Scripted balance (35/34/31) and coverage (20/20) are healthy.

### 7.4 Model selection — recommendation (updated with real data)

This game needs **instruction-following + structured output**, not reasoning — and real data
confirms it.

| Model | Verdict for this game |
|---|---|
| **`openai/gpt-4o-mini`** | ✅ **Recommended default.** 100% JSON, 0% taught-not-learned, cheapest (~$0.0009/game), fast. Pair with R-H4. |
| **`openai/gpt-4o`** | ✅ **Premium mode.** Same reliability; ~17× cost with no measurable quality gain here. Use only when budget/latency are non-issues. |
| **`meta/Llama-3.3-70B`** | ⚠️ **Avoid for this UX.** Reliable-ish but **~34.5 s/game** (3× slower) and 1.49% parse failures. |
| **Small/experimental** (Phi-4 / Ministral / 7–8B) | ❌ **Avoid.** Rate-limited to impracticality on GitHub Models, and synthetically the least reliable (12% unusable). |
| **Reasoning-class** (o-series / R1) | ❌ **Avoid.** Verbose, slow, costly; no benefit on a non-reasoning task. |
| **Heavily safety-tuned** | ⚠️ **"Gentle mode" only.** Forces the peaceful ending ~93% in ~2 turns — no stakes. |

> **Headline model recommendation:** default to **`gpt-4o-mini`**, offer **`gpt-4o`** as an
> optional high-fidelity mode, and implement **R-H4** so the model's natural reluctance to
> escalate no longer stalls the game.

---

## 8. Reproducibility & data

- **Offline re-run:** `node sim/simulate.mjs --scripted 500 --synthetic 500 --seed 1337`
- **Real re-run:** `node sim/simulate.mjs --real 25` (with `sim/.env.local`; note small-tier
  rate limits — keep counts modest or expect throttling).
- **Re-analyze only:** `node sim/analyze.mjs` (reads the kept `.jsonl` files).
- **Raw data retained:** `sim/results/*.jsonl` (500 scripted + 2,500 synthetic + 37 real
  runs), `batch-manifest.json`, `analysis.json`.
- **Deterministic offline tracks:** same seed → same runs, so a fix can be verified to remove
  a finding. (Real-model runs are inherently non-deterministic.)
