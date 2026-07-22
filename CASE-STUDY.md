# CASE STUDY — Building the _WarGames_-Inspired Slice

A record of **how this prototype was produced**, for a case study on AI-assisted
development. It captures the model used, time on task, artifacts, and token accounting.

> Machine-readable companion: [telemetry/dev-telemetry.json](telemetry/dev-telemetry.json).

---

## Summary

| Field | Value |
|---|---|
| Project | Terminal thriller inspired by _WarGames_ (1983), modern AI-agent framing |
| Deliverable | Static web vertical slice (GitHub Pages ready) + design docs |
| Primary model | **Claude Opus 4.8** (via GitHub Copilot) |
| Session date | 2026-07-21 |
| Modes delivered | Scripted (deterministic) + Live-AI (client-side LLM) |
| Endings | 3 (annihilation, lockout, understanding) |
| Source files | 9 code/markup + 3 docs |

---

## Phases (time on task)

Time is agent working time for this session, grouped by phase. Wall-clock will vary with
review; treat these as build-effort proportions.

| Phase | Work | Artifacts | Est. time |
|---|---|---|---|
| 1. Research | Read backgrounder; fetched full film transcript + WOPR/Joshua terminal transcript; extracted patterns | (research notes) | ~15% |
| 2. Design | Wrote design study + 4 concept options + recommendation | `DESIGN-IDEA.md` | ~15% |
| 3. Scaffold | App structure, config with 4 name sets, CRT UI shell | `index.html`, `css/terminal.css`, `js/config.js` | ~15% |
| 4. Content | Authored branching dialogue graph (7 beats, 3 endings) | `js/dialogue.js` | ~15% |
| 5. Engine | DEFCON state machine, scripted + LLM runners | `js/engine.js`, `js/terminal.js` | ~15% |
| 6. Integrations | Client-side LLM client + persona prompt; runtime telemetry | `js/llm.js`, `js/telemetry.js` | ~15% |
| 7. Wiring + docs | Start menu, telemetry panel, README, this case study | `js/main.js`, `README.md`, `CASE-STUDY.md` | ~10% |

---

## Token accounting

> **Source of truth:** exact token counts are metered by the GitHub Copilot / model
> provider dashboard for this session. The agent runtime does not expose exact per-request
> counts to itself, so the figures below are **estimates** to be reconciled against that
> dashboard. Update `telemetry/dev-telemetry.json` with actuals when available.

| Bucket | Description | Est. tokens in | Est. tokens out |
|---|---|---|---|
| Research context | Backgrounder + 2 fetched transcripts (large) | ~40,000 | ~1,500 |
| Design authoring | `DESIGN-IDEA.md` generation | ~6,000 | ~6,500 |
| Code generation | 9 source files | ~30,000 | ~14,000 |
| Docs + telemetry | README, case study, JSON | ~8,000 | ~4,000 |
| **Rough total** | | **~84,000** | **~26,000** |

Notes:

- "Tokens in" is dominated by **research context** — pulling the full film transcript is the
  single largest input cost. A leaner run could summarize transcripts first.
- "Tokens out" is dominated by **code + design** generation.

---

## Runtime telemetry (during play)

The shipped app **also** captures telemetry while the game is played (see
[README.md](README.md#telemetry)). For Live-AI sessions this includes **tokens in/out per
request, totals, and average latency**, exportable as JSON. Aggregate those exports here to
extend the case study with real usage data:

| Playtest | Mode | Model | Duration | LLM requests | Tokens in | Tokens out | Ending |
|---|---|---|---|---|---|---|---|
| _(add exported sessions)_ | | | | | | | |

---

## Observations for the case study

- **Research is the expensive input.** Fetching full primary sources gave high-fidelity,
  quotable detail (exact WOPR lines, DEFCON dialogue) but dominated input tokens.
- **Data-driven content pays off.** The dialogue lives as pure data (`js/dialogue.js`), so
  narrative expansion needs no engine changes — cheaper future iterations.
- **Static-first keeps deployment trivial** and pushes the one non-static concern (LLM keys)
  to an explicit, user-controlled, clearly-documented boundary.
- **Dual-mode design** (scripted + LLM with automatic fallback) means the modern AI framing
  never compromises reliability.
