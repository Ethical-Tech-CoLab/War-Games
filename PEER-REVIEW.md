# Peer Review — *War-Games: A WarGames-Inspired Terminal Thriller, with a Monte Carlo Simulation Harness and Case Study*

**Reviewer role:** External referee, reviewing as a demanding-but-fair reader for a venue at the intersection of interactive-systems research and applied LLM evaluation. The artefact under review is the written research output — `Simulation-Output.md`, `CASE-STUDY.md`, `how-to-guide.md`, and `README.md` — together with the harness (`sim/`) and raw results that back them. The game itself is assessed only as the system those documents make claims about.
**Recommendation:** **Minor revisions** — the study design is sound and unusually honest; the problems are in how a very small real-model sample is reported and in one ranking whose basis is not disclosed.
**Date:** 22 July 2026
**Reviewed build:** `Ethical-Tech-CoLab/War-Games` @ main (22 July 2026), including `sim/results/analysis.json`

---

## Summary of the submission

The repository ships a static browser game — a *WarGames* (1983) homage in which an AI persona runs a nuclear-war simulation across a DEFCON ladder toward one of three endings — in two modes: a hand-authored deterministic dialogue graph, and a live-LLM mode where the persona is driven by a model returning structured JSON (`reply`, `defconDelta`, `ending`). Around it sits a three-track evaluation. **Track A** statically validates the dialogue graph and runs 500 seeded random playthroughs. **Track B** runs 2,500 synthetic playthroughs against five hand-calibrated "model class" profiles, to push volume through the real parsing path. **Track C** runs real games against hosted models on GitHub Models — 12 each for gpt-4o, gpt-4o-mini, and Llama-3.3-70B, plus 1 Phi-4 and 0 Ministral-3B before rate limiting stopped the batch. `Simulation-Output.md` reconciles the three tracks, ranks models by a composite contract-adherence score, and issues eight findings and seven recommendations. A separate `CASE-STUDY.md` accounts for the cost of building the prototype with an AI coding agent.

The framing is the interesting part: rather than benchmarking models in the abstract, the study asks whether a model can hold up its end of a *specific structured contract* inside a running game, and treats a game-design fault as the finding rather than a model failing.

## Strengths

- **The three-track design is genuinely good methodology, and the tracks are ordered correctly.** Static validation → deterministic Monte Carlo → synthetic-class volume → real models is exactly the right escalation: each track answers a question the previous one cannot, and each is cheap where cheapness is available. The explicit precedence rule — *"Where they disagree, Track C wins and this document says so"* — is stated up front and then actually honoured in §5. That is rarer than it should be.
- **§5's synthetic-versus-real reconciliation is the study's best page.** Publishing what the researchers' own priors got *wrong* — over-predicting JSON failure, badly under-predicting stalling — and drawing the lesson that synthetic Monte Carlo exercises handling code while real runs discover behaviour, is honest self-assessment of a kind most evaluation write-ups omit entirely. Protect this section.
- **The headline finding is correctly attributed.** Concluding that models not advancing the doomsday clock is *"a game-design issue, not a model failing"*, and turning it into an engine-owns-escalation recommendation (R-H4), is the right read. A weaker paper would have written it up as a model deficiency.
- **Reproducibility is real, not claimed.** Seed 1337, every run retained as JSONL, a re-analysis path that does not require re-running (`node sim/analyze.mjs`), and an explicit note that the real track is inherently non-deterministic. I re-derived the composite scores from `analysis.json` and the formula in `sim/analyze.mjs` and they reproduce exactly — which is how I found Major issue 3 below. A document that can be checked this precisely has already cleared a bar most cannot.
- **Cost and latency are measured, not estimated.** ~4.5k prompt tokens per game with the diagnosis (full history resent each turn) and the fix (R-T2) is a concrete, transferable operational finding.
- **The failure-mode design is right.** Live-AI degrading automatically to scripted mode when no proxy and no key are present — so the experience is never blocked — is the correct architecture for a demo that has to survive a seminar room.

## Major issues

1. **Every Track C conclusion rests on twelve games, and no interval is reported anywhere.** The headline finding F-R1 — "Unresolved 25% / 25% / 17%" — is **3 of 12, 3 of 12, and 2 of 12 games**. The apparent gap between the OpenAI models and Llama is *one game*. Wilson 95% intervals: 3/12 is 25% (9–53%), 2/12 is 16.7% (5–45%) — near-total overlap, and both compatible with a true rate anywhere from "rare" to "half of all games." The document escalates this to 🔴 severity, calls it "the single most important finding," and makes it the top-priority recommendation. The recommendation is very likely right on design grounds; it is not *established* by this data. *Fix:* add n and a 95% interval to every rate in §4 and §6, and rephrase F-R1 as what it is — a behaviour observed in a handful of games, consistent with a design weakness the engine should close regardless of its true rate.

2. **The turn-cap confound is disclosed in §4.2 and then dropped everywhere it matters.** Track C ran at `turnCap = 12`; the synthetic track and the shipped game run at 30. "Unresolved" is *defined* as hitting the cap. So the executive summary's "16–25% of real games hit the turn cap (vs ~0% synthetic)" and §5's reconciliation row ("Synthetic said ~0%, Real showed 17–25% — badly under-predicted") both compare two tracks **measured under different stopping rules**, which is not a comparison at all. §4.2's defence — that a longer cap would just produce longer stalled games — is plausible but untested, and it is an argument, not a control. The decisive fix is cheap: by the study's own measured costs, re-running 12 games × 3 models at cap 30 costs about **$0.23** in tokens (and under a dollar even if games run two or three times longer). *Fix:* re-run Track C at cap 30, or state the cap in the executive summary, the reconciliation table, and F-R1 every time the number appears.

3. **The composite score that drives the model ranking cannot be reconstructed from any figure the document reports — and the one explanation offered for it is wrong for the model it penalises most.** The footnote to §4 says the score "is dominated by the unresolved penalty, which is partly a turn-cap artifact." Reconstructing from `sim/analyze.mjs` (score = 100 − parseFail×4 − deltaOOR×1.5 − invalidEnding×2 − unresolved×1.5 − taughtNotLearned×1.0) and `analysis.json`:
   - **gpt-4o / gpt-4o-mini: 63** = 100 − (25 × 1.5). The footnote is right here — the score is *entirely* the unresolved penalty.
   - **Llama-3.3-70B: 31** = 100 − (1.49 × 4) − (**25.37 × 1.5**) − (16.67 × 1.5). Its largest single penalty, 38 of the 69 points lost, is `defconDeltaOOR_rate = 25.37%` — Llama returned an out-of-range `defconDelta` on roughly **a quarter of all turns**. That metric appears in **no table in `Simulation-Output.md`.** Llama's *lower* unresolved rate should have scored it above the OpenAI models on the term the footnote names; it scores half as much because of a contract violation the document never shows.

   Two consequences. First, a reader cannot audit the ranking that headlines §7.4. Second — and more important — the study has measured what is probably its most decisive real reliability difference between hosted and open models, and then not reported it. Meanwhile §7.4's stated reason to avoid Llama is latency, which contributes **zero** to the score. *Fix:* add a `defconDelta out-of-range %` column to the §4 table, publish the score formula and weights in §4 or the how-to guide, and rewrite the Llama verdict around the 25% contract-violation rate (with latency as a secondary point).

4. **"0% taught-but-not-learned" is 0 out of 2 or 3 opportunities, not 0 out of 12.** The executive summary states this as "narrative reliability is excellent on real models… when the player teaches futility, real models resolve to the good ending every time." But `analysis.json` records `taughtRuns: 2` for gpt-4o-mini and `3` for Llama — the metric's denominator is the number of games in which the player actually taught futility, not the number of games. A 0/2 result has a 95% upper bound near 66%; 0/3 near 56%. "Every time" rests on a handful of events. *Fix:* report the denominator inline (`0/2`, `0/3`) wherever this figure appears, and drop "every time."

5. **Ending distributions mix real endings with force-ends.** §4.1 reports per-model ending percentages and then notes below the table that lockout is inflated because every unresolved game is force-ended as lockout. For gpt-4o-mini that means 3 of its 5 lockouts are not endings the model produced — the resolved-only distribution across its 9 real endings is roughly 56% annihilation / 22% lockout / 22% understanding, materially different from the 41.7/41.7/16.7 in the table. *Fix:* report resolved-only distributions as the primary table, with force-ends as a separate count.

6. **The synthetic track is reported to two decimal places, and it is 70× larger than the real track.** "99.76%", "87.55%", "19.39%" are outputs of the researchers' own calibration assumptions, run 500 times each. The document says so ("calibrated, not benchmarks"), which is right — but the precision and the 2,500-versus-36 volume difference both push the eye toward the synthetic table as the more solid one, exactly backwards. *Fix:* round Track B to whole percentages, label the table "modelled, not measured" in its heading rather than in prose above it, and put the real-run counts (n=12) in the Track C column headers.

## Minor issues

1. **No LICENSE file.** The repository is public, ships a reusable simulation harness, and invites extension. It needs one.
2. **The film IP is the shipped default on a public deploy.** `README.md` states the film name set is "for prototyping only. Ship with an original set." The default set — WOPR, JOSHUA, Falken, NORAD, "Global Thermonuclear War," and the repository's own title line — *is* the film set, on a repository that is public and Pages-deployable under an institutional org name. Three original sets are already implemented. Flip the default to HELIOS or SENTINEL and keep the film set behind a local flag; the fix costs one line in `js/config.js`.
3. **Llama's latency p95 is 318,679 ms** — 5.3 minutes for one game, against a 34.5 s mean. With n=12, a p95 is essentially the maximum, i.e. one pathological run. Report it as max-of-12, not as a percentile.
4. **`CASE-STUDY.md` reports proportions with no total.** Seven phases at "~15%" each (six of them identical) sum to 100% of an unstated quantity, so the document's own stated subject — time on task — cannot be recovered from it. One wall-clock number would fix this.
5. **The case study's token accounting is explicitly provisional and its playtest table is empty.** Tokens are "estimates to be reconciled against that dashboard"; the runtime-telemetry table has a single placeholder row, `_(add exported sessions)_`. For a document whose purpose is to account for the cost of AI-assisted development, all three quantities — time, tokens, and real play data — are currently placeholders.
6. **F-R3 draws a general conclusion from a platform quota.** "Small/experimental-tier models are impractical for volume interactive use" is supported only by *GitHub Models'* throttling of that tier on this account. Scope the claim to the platform, or drop "impractical" for "unavailable at volume on GitHub Models."

## What's missing

- **A rerun at the shipped turn cap.** Everything in Major issue 2 turns on one $0.23 experiment. It is the single highest-value outstanding action in the repository.
- **The `defconDeltaOOR` column** (Major issue 3), which is measured, decisive, and unpublished.
- **A prompt appendix.** The persona system prompt in `js/llm.js` is the actual independent variable in Track C — every model was asked to obey the same contract by that text. It is never shown in `Simulation-Output.md`, so a reader cannot judge whether "models don't escalate on their own" is a fact about models or about a prompt that never told them to. Given F-R1's own recommendation option 2 is "tell the persona it has a limited number of exchanges," the authors clearly suspect this too — an ablation of one prompt line would be a genuine result.
- **Per-model temperature / sampling settings.** Not stated anywhere; they affect every reliability figure reported.
- **Any statement of what the study is generalisable to.** The findings are about one structured-output contract in one game. That is a legitimate and interesting scope; say so, and the small n stops being a weakness and becomes an honest boundary.

## Internal inconsistencies

1. **The composite-score footnote versus the Llama row.** The footnote attributes the score to the unresolved penalty; for Llama, out-of-range `defconDelta` outweighs it (38 points versus 25), and Llama's unresolved rate is the *lowest* of the three. Both cannot be true. (Major issue 3.)
2. **§7.4's Llama verdict versus the score it is ranked by.** "Avoid for this UX" is argued on latency; latency is not a term in the score that produced its 31. The real basis — a 25% contract-violation rate — is stronger than the one given.
3. **Executive summary versus §4.2 on the turn cap.** The summary presents the stalling rate as a model behaviour; §4.2 discloses that the number is partly a stopping-rule artefact. The caveat should travel with the number.
4. **§5's reconciliation table compares tracks at different caps** while presenting the difference as a prediction error by the synthetic profiles. Some of that gap is the cap, not the prediction.
5. **`Simulation-Output.md` §8 reports "37 real runs" retained**; §1's manifest gives 12 + 12 + 12 + 1 + 0 = 37 ✓ — but the per-model tables in §4 present three n=12 rows plus a Phi-4 row that is a single game. The Phi-4 row is footnoted as not statistically meaningful, which is the right call; consider moving it out of the ranked table entirely so it cannot be read across.
6. **README "IP note" versus the shipped default.** (Minor issue 2.)

## Prioritized next steps

If there is time for only three things:

1. **Re-run Track C at `turnCap = 30`** and update F-R1, the executive summary, and §5 with the result. Roughly $0.23 by the study's own cost figures, and it either confirms the paper's headline finding or overturns it. Nothing else in the repository has this ratio of value to cost.
2. **Publish the score formula and add the `defconDelta out-of-range` column** (Major issue 3). This makes the ranking auditable and surfaces what is probably the study's most useful real result — a quarter of Llama's turns violated the numeric contract while the OpenAI models violated it on none.
3. **Put n and a 95% interval next to every Track C rate**, and give `taught-but-not-learned` its real denominator (Major issues 1 and 4). This is a presentation change, not new work, and it is what separates "we observed this in 3 of 12 games" from an unsupported percentage.

Then: add a LICENSE, flip the default name set off the film IP, and either fill in `CASE-STUDY.md`'s time, token, and playtest tables or mark the document explicitly as a template.

## What to take forward

- **A denominator is part of a number.** Nearly every reporting problem in this study is the same one: a rate published without the count it came from. `25%`, `16.7%`, and `0%` are three, two, and zero games respectively, and each reads as far more solid than it is. The habit to build: never write a percentage in a results table without `n` in the same cell or column header.
- **If you compute a score, publish the formula next to the ranking.** The composite is a good idea — it collapses five contract dimensions into something orderable — but a score whose weights live only in the analysis script is an assertion, not a measurement. The moment a ranking is used to recommend a model, the reader needs to be able to re-derive it. (You already retain everything needed to do so; you just didn't print it.)
- **A caveat has to travel with the number it qualifies.** §4.2's turn-cap disclosure is exemplary — and it is one section away from the executive summary that states the same figure without it. Caveats belong wherever the number is repeated, not once at its point of origin.
- **When your own priors are refuted, that is the paper.** §5 is the best thing in this repository precisely because it publishes a miss. Keep doing that — and consider making the synthetic-versus-real gap the framing of the whole document rather than its fifth section.
- **Cheap experiments beat careful arguments.** §4.2 defends the turn-cap decision with a paragraph of reasoning where a $0.23 rerun would settle it. When the experiment costs less than the argument took to write, run the experiment.

## Verdict

**Minor revisions.** The design of this study is better than most published LLM evaluations at this scale, the reproducibility is genuine, and the central instinct — attribute the failure to the game, not the model — is right. What holds it back is a small-sample reporting style that presents 3-of-12 as 25% and a headline ranking whose basis is not on the page. Both are fixable in a focused afternoon, and one of them is fixable for about a quarter of a dollar of tokens. Do the rerun before anyone cites F-R1.

## References

1. Wilson, Edwin B. "Probable Inference, the Law of Succession, and Statistical Inference." *Journal of the American Statistical Association*, vol. 22, no. 158, 1927, pp. 209–212. Source of the score-interval method used above; preferred to the normal approximation precisely at the small n and extreme proportions (0/12, 12/12) this study reports.
2. `sim/analyze.mjs`, lines 119–132 — the composite contract-adherence score: `100 − parseFail×4 − deltaOOR×1.5 − invalidEnding×2 − unresolved×1.5 − taughtNotLearned×1.0`. Latency and cost are not terms.
3. `sim/results/analysis.json` — per-model fields used to re-derive the scores, including `contractViolations.defconDeltaOOR_rate` (0% for both OpenAI models; 25.37% for Llama-3.3-70B) and `taughtRuns` (2 for gpt-4o-mini, 3 for Llama-3.3-70B).
4. *WarGames*. Directed by John Badham, MGM/UA, 1983. Source of the default name set (WOPR, JOSHUA, Falken, NORAD) currently shipped as the public default — see Minor issue 2.

**[Verification Required]** Three items for the author to confirm rather than take from this review. (a) I re-derived the composite scores arithmetically from the formula and `analysis.json`; gpt-4o/mini (63) and Llama (31) both reproduce exactly, but I did not re-run the harness end to end, so a discrepancy between the retained JSONL and `analysis.json` would not have been visible to me. (b) `taughtRuns` for `openai/gpt-4o` was not inspected — I read the mini and Llama records only, so the denominator for that model's 0% should be confirmed before the figure is republished. (c) The cost estimate for the cap-30 rerun (~$0.23) uses the study's own `estCostPerRunUSD` at cap 12; longer games will cost proportionally more, and the real figure depends on how much of the increase is prompt tokens re-sent each turn.
