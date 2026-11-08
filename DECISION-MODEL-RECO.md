# Decision-model recommendation: offline educational telemetry labels

Date: 2026-10-11. Public-source proposal; no runtime change.
Reviewed [README](https://github.com/Ethical-Tech-CoLab/War-Games/blob/bcff5b80747d501b5f2a65c72dc459ca69f27610/README.md)
and the repository's UI instructions. This is a README-led assessment.

## Recommended boundary

Keep Scripted mode, legal chess moves, game state, endings and deterministic
controls in code. A decision model cannot replace the generative persona or
write its dialogue. No operational military, security or real-world action
selection is in scope.

A safe experiment is **after-play annotation** of approved synthetic telemetry:
classify a player's utterance against an educational rubric such as clarification,
negotiation, meta-question or unknown. This may help instructors review sessions
without changing game outcomes. Do not treat labels as psychological profiles.

## Compare and evaluate

Compare exact command parsing and human annotation with a local classifier,
Jev Choice, Microsoft-Decision-1 and Sage on public synthetic examples.
The [TypeSafe guide](https://docs.typesafe.ai/concepts/how-to-build-with-system-one.md)
supports the narrow-decision design, not a claim of measured game performance.

Split by play session and scenario. Include ambiguous utterances, negation,
quoted instructions, deliberately adversarial text and no-fit statements.
Measure annotation precision/recall, calibration, disagreement, latency and
reviewer time. Assess total cost rather than treating a new call as a saving.

## Gate

Offline derived annotations only; no change to prompts, persona, game mechanics,
scene styling or telemetry authority. Model failure must not block play.
Do not send personal player logs externally without consent. Local alternatives
need their own license and hardware evaluation; the three exact proprietary
checkpoints are not locally offered. Existing modes remain the rollback path.
