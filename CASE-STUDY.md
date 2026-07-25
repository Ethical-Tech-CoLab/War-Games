# CASE STUDY — Building the _WarGames_-Inspired Game

A record of **how this project was produced**, for a case study on AI-assisted development.
It captures the build timeline, effort, cost, and — importantly — a side-by-side **model
evaluation** across **cloud** and **on-box GPU** backends, run through the game's real code.

> Companions: machine-readable [telemetry/dev-telemetry.json](telemetry/dev-telemetry.json),
> and the full model-evaluation report in [Simulation-Output.md](Simulation-Output.md)
> (methodology in [how-to-guide.md](how-to-guide.md)).

---

## Summary

| Field | Value |
|---|---|
| Project | Terminal thriller inspired by _WarGames_ (1983) with a modern AI-agent framing |
| Deliverables | Static web game (Scripted + Live-AI + Berserk) · chess mini-game (voice + commentary) · Admin Console · telemetry · a self-hosted AI proxy (`pages-ai-proxy`) · a Monte-Carlo sim harness · design docs |
| Build window | **2026-07-21 → 2026-07-24** (4 calendar days, 2 primary working sessions) |
| Build model | **Claude Opus 4.8** via GitHub Copilot (agent) |
| Effort signal | **52 agent turns**, **26 commits**, **~10.5k** tracked lines across **2 repos** |
| Modes delivered | Scripted (deterministic) · Live-AI (LLM persona) · Berserk (emergent) · Chess |
| Models evaluated | Cloud: GitHub Models (gpt-4o, gpt-4o-mini, Llama-3.3-70B, Phi-4). On-box GPU: B3IQ (gemma3:12b, qwen3:14b, deepseek-r1:8b, Qwen3-27B) |
| Real-model eval cost | **≈ $0.23 total** for 37 metered cloud games; **$0** marginal for on-box GPU |

---

## 1. Development effort & timeline (measured)

From the agent session log and git history.

| Day | Agent turns | Commits | Focus |
|---|---|---|---|
| 2026-07-21 (eve) | 14 | 5 | Research, design, scaffold, dialogue, engine, first Live-AI |
| 2026-07-22 (early) | 14 | — | Sim harness + Monte-Carlo model evaluation, hardening |
| 2026-07-23 | — | 3 | Proxy + B3IQ deployment iteration |
| 2026-07-24 → 25 | 24 | 18 | Chess (voice + commentary), Admin Console, berserk polish, TTS fixes, docs |
| **Total** | **52** | **26** | |

_(Session windows: night of 07-21→22 ≈ 17:34–02:43; 07-24→25 ≈ 14:47–00:41. Spans include
human review, so they exceed pure agent compute time.)_

**Codebase size (tracked, War-Games repo):**

| Type | Files | Lines |
|---|---|---|
| App JS (`js/*.js`) | 10 | 3,324 |
| Sim harness + dev server (`*.mjs`) | 5 | 1,121 |
| Sim raw results (`*.jsonl`) | 10 | 3,037 |
| Docs (`*.md`) | 7 | 1,070 |
| CSS | 1 | 895 |
| JSON (config / analysis / telemetry) | 4 | 721 |
| HTML | 1 | 192 |
| **Total** | **42** | **~10,503** |

A companion repo, [`pages-ai-proxy`](https://github.com/Ethical-Tech-CoLab/pages-ai-proxy)
(proxy core, Cloudflare Worker, Azure Function, and B3IQ deploy scripts), was built in the
same effort and is not counted above.

---

## 2. Cost & expense

| Bucket | Basis | Cost |
|---|---|---|
| **Build (agent)** | Claude Opus 4.8 via a GitHub Copilot subscription — flat-rate, not metered per token | subscription (no per-token charge) |
| **Cloud model evaluation** | 37 real games on GitHub Models (Track C), measured per-game cost | **≈ $0.23** |
| **On-box GPU inference** | B3IQ node (owned US hardware) running Ollama — no API/token fees | **$0 marginal** (electricity only) |
| **Hosting** | GitHub Pages (static) + Cloudflare tunnel | **$0** |

The economics headline: once Live-AI routes through the **owned B3IQ GPU**, it has **no
per-token cost and no rate limits** — the opposite of the metered cloud tier, and the reason
on-box models are attractive despite lower raw reliability (see §5).

Build-side token use (agent) is an **estimate** kept in
[telemetry/dev-telemetry.json](telemetry/dev-telemetry.json); exact counts are metered by the
Copilot/provider dashboard and should be reconciled there.

---

## 3. What was built (beyond the original slice)

The original vertical slice (Scripted + Live-AI + 3 endings) grew into:

- **Live-AI persona** over a DEFCON state machine, with graceful fallback to Scripted.
- **Berserk easter egg** — an emergent, unbounded persona (capped + clearly marked).
- **Chess mini-game** — deterministic rules + alpha-beta AI (perft-validated), playable by
  click / type / **voice**, with tone-aware commentary and spoken move announcements.
- **Admin Console** — exact last prompt + raw response, live config, per-turn log, telemetry.
- **Self-hosted `pages-ai-proxy`** on the B3IQ GPU node — server-side token injection, origin
  allow-list, and **model routing** (cloud vs on-box by model id), with URL discovery.
- **Monte-Carlo sim harness** — scripted + synthetic + real tracks feeding the evaluation
  below.

---

## 4. Model evaluation — cloud (measured)

Real games were run through the game's actual parsing/engine path on **GitHub Models**
(Track C in [Simulation-Output.md](Simulation-Output.md)); 12 games each, `turnCap = 12`.

| Model | JSON valid | Parse-fail | Unresolved\* | Taught-not-learned | Turns (mean) | Latency/game | Cost/game |
|---|---|---|---|---|---|---|---|
| **openai/gpt-4o-mini** | **100%** | 0% | 25% | **0%** | 6.6 | 13.7 s | **$0.0009** |
| openai/gpt-4o | **100%** | 0% | 25% | **0%** | 6.7 | 11.6 s | $0.0157 |
| meta/Llama-3.3-70B | 98.5% | 1.49% | 16.7% | **0%** | 5.6 | **34.5 s** | $0.0028 |
| microsoft/Phi-4 (n=1) | 100% | 0% | 0% | 0% | 7 | 13.6 s | $0.0006 |

<sub>\*"Unresolved" = hit the turn cap and force-ended — a **game-design** finding (real
models stay polite and under-drive escalation), not a model failure. Tracked as fix R-H4.</sub>

Alongside these, the harness ran **500 scripted** playthroughs (endings split 35/34/31, with
20/20 node coverage) and **2,500 synthetic** runs across 5 model *classes* to exercise the
handling code at volume. **Headline pick: `gpt-4o-mini`** — identical reliability to gpt-4o
at ~1/17th the cost. Full methodology, findings, and recommendations are in
[Simulation-Output.md](Simulation-Output.md).

**Key learning.** Synthetic profiles **over-predicted** JSON failure and **under-predicted**
stalling; only **real** runs surfaced the "games never resolve" behavior — real evaluation
was essential.

---

## 5. Model evaluation — GPU server (B3IQ, on-box)

Four on-box models are deployed on the **B3IQ GPU node** (owned US hardware) behind Ollama
and exposed through the same proxy — the model id alone selects cloud vs on-box:

| Model id | Class | Role in the game |
|---|---|---|
| `gemma3:12b` | small–mid instruct | Live-AI persona (on-box default candidate) |
| `qwen3:14b` | mid instruct | Live-AI persona |
| `deepseek-r1:8b` | reasoning | experimental (verbose / slow — see note) |
| `hf.co/unsloth/Qwen3.6-27B-GGUF:latest` | large instruct | premium on-box |

**Validated today (operational telemetry).** The proxy **routes** on-box model ids to local
Ollama and cloud ids to GitHub Models over one endpoint; on-box models **respond with valid
persona JSON** in interactive play; and inference runs at **$0 marginal cost with no rate
limits** — unlike the throttled small-tier cloud models (Phi-4 / Ministral were rate-limited
to 1 / 0 games; see [Simulation-Output.md](Simulation-Output.md) §4.4).

**Expected behavior by class** (from the synthetic tracks, to confirm at volume):
`deepseek-r1` is reasoning-class → verbose and slower (the synthetic reasoning class showed
p95 ≈ 7 reply lines); `gemma3` / `qwen3` are small–mid → watch JSON reliability and the
"taught-but-not-learned" rate that hurt the small-fast class. On-box models also benefit most
from the engine-owned escalation fix (R-H4), which removes reliance on the model to end the
game.

**Next measurement (rate-limit-free).** Because the B3IQ node has no per-token cost or
throttling, it is the ideal place to run the *same* Monte-Carlo at scale. Back up
`sim/results/` first (a run wipes it), then point the real track at the proxy:

```powershell
# sim/.env.local: GITHUB_TOKEN=<proxy token>, GH_MODELS_ENDPOINT=<proxy>/v1/chat/completions,
#                 SIM_MODELS=gemma3:12b,qwen3:14b,deepseek-r1:8b
node sim/simulate.mjs --scripted 0 --synthetic 0 --real 12
node sim/analyze.mjs
```

The results (JSON validity, unresolved %, latency/game, tokens) drop straight into the §4
table for a true cloud-vs-GPU comparison.

---

## 6. Runtime telemetry (in-app)

The shipped app captures telemetry while the game is played (open the **Admin Console** →
**TELEMETRY** → **EXPORT JSON**): duration, mode, identity set, model, min DEFCON, choices,
endings, and — in Live-AI — **tokens in/out, totals, and average latency per request**.
Aggregate real playtest exports here to extend the case study:

| Playtest | Mode | Model (cloud / GPU) | Duration | Requests | Tokens in/out | Ending |
|---|---|---|---|---|---|---|
| _(add exported sessions)_ | | | | | | |

---

## 7. Observations for the case study

- **Real evaluation beats synthetic** for behavior discovery — the stalling finding only
  appeared on real models.
- **Cloud vs GPU is a cost/control trade** — metered + rate-limited + turnkey (cloud) vs
  zero-marginal-cost + unthrottled + you-run-it (on-box). One proxy + a model id switches
  between them.
- **Research is the expensive input** on the build side (full primary-source transcripts
  dominated input tokens); **code + design** dominated output.
- **Data-driven content pays off** — dialogue and name sets are pure data, so re-skins and
  narrative expansion need no engine changes.
- **Static-first + a small proxy** keeps deployment trivial while hiding secrets and enabling
  the cloud/GPU routing at a single, well-documented boundary.

---

## 8. Reproducibility & data

- **Model evaluation:** full report in [Simulation-Output.md](Simulation-Output.md); raw runs
  in `sim/results/*.jsonl`; re-analyze with `node sim/analyze.mjs`.
- **Offline re-run:** `node sim/simulate.mjs --scripted 500 --synthetic 500 --seed 1337`
  (deterministic).
- **Real re-run (cloud):** `node sim/simulate.mjs --real 12` with `sim/.env.local`.
- **Dev telemetry:** [telemetry/dev-telemetry.json](telemetry/dev-telemetry.json) (reconcile
  token estimates against the Copilot/provider dashboard).
