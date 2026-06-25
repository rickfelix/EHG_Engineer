# EHG Top-Down Vision Assessment — v2 (2026-06-24, cross-repo)

**Run:** `wf_53b71104-2be`, 31 agents, ~24 min, 3.17M tokens. Method: [`docs/process/top-down-vision-assessment.md`](../process/top-down-vision-assessment.md). This run audited **cross-repo from the start** (app + EHG_Engineer harness + shared DB) and was seeded with v1's confirmed-built ledger so it wouldn't re-chase ghosts.

## Diff vs v1 baseline
| | v1 (app-only — WRONG) | v2 (cross-repo — accurate) |
|---|---|---|
| BUILT | 0 | **9** |
| PARTIAL | 7 | 9 |
| SHELL | 11 | **2** |

v1's "EHG is hollow lipstick" was a measurement artifact. **The engine spine is real and ~70% built** — and v2 found the real story: the chain breaks not in the middle but at the **revenue ends**.

## Headline
**EHG can BUILD ventures; it has never EARNED a dollar from one.** The 26-stage factory (idea → validate → blueprint → build → launch → growth-playbook) genuinely executes — `DataDistill` is living proof one venture went end-to-end. But working backwards from the North Star (operator-salary-replacing income), the chain is unreachable today for three compounding reasons:

1. **No real economics has ever flowed.** Every income/exit substrate table is empty: `venture_revenue_entries=0`, `venture_asset_registry=0`, `venture_data_room_artifacts=0`, `venture_exit_readiness=0`, `marketing_campaigns=0`, `app_rankings=0`. The one real launch wrote honest t=0 zeros. **Every "BUILT" back-half engine (exit, learning) is computing on zeros** — so it can be built and still never move the needle.
2. **The operator can't fully drive the arc from the app.** The chairman directive command-bus records a row + returns a canned string, never invoking its own parser/dispatcher (the EVA command-bus gap). (Note: the Stage-24 launch route handler IS built — v2's audit initially flagged it missing off a stale working-tree dir; verify corrected that.)
3. **The front of the arc stopped feeding itself.** Stage-zero ideation went dormant 2026-05-31 after a 131-duplicate runaway; the nursery is a 3-way schema split-brain (errors, 0 rows); distillation converts ~0/627 captures.

## Genuinely BUILT (9 — verified cross-repo)
Truth-phase kill gates (S1–5); Business-Model & exit-thesis engine (S6–9); Identity+Blueprint review (S10–17); marketing-first build loop → real strategic_directives + clone/scan (S18–22); polling Stage-Execution Worker; 26-stage SSOT; post-launch review/growth playbook; operator cockpit + honesty contract; North-Star/VDR honest accounting.

## Confirmed buildable gaps (4 — survived skeptical cross-repo verify)
1. **HIGH · fix-not-build** — Separability split-brain + empty `venture_asset_registry`: every exit score is the zero-asset baseline, and scores live on `eva_ventures` while the UI reads `ventures` (0 overlap) → **chairman sees NULL exit-readiness for every venture**. Likely a join/view + asset-population fix, not new product.
2. **HIGH** — Wire one cross-venture learning/calibration caller on a scheduler + fix the `'killed'` enum throw (the compounding "moat" never runs). Buildable now, but **starved** — produces thin output until real terminal ventures exist.
3. **MEDIUM** — Wire the acquirability soft-gate + "should-we-sell?" trigger into the stage multiplexer (orphaned code). Starved until real ARR/customer metrics exist.
4. **MEDIUM** — Stabilize stage-zero ideation + repair nursery schema split-brain (keep the idea belt renewable).

## Rejected by verify (cross-repo discipline working)
- "Wire a first-customer revenue path" → **needs-chairman-input**: 2 of 3 components already built+merged; `venture_revenue_entries` is empty because **there is no paying customer yet**, not because code is missing.
- "Build the Stage-24 go-live route" → **already-built**: handler is implemented + committed; the empty dir cited was a stale working-tree artifact.

## The strategic conclusion
The binding constraint is **not code** — it's that **no venture has acquired a paying customer**, so the back-half engines (exit, learning) compute on zeros no matter how well-built. Building more back-half engine is premature (starved). The highest-value *code* work is the cheap **fix-not-build** bugs (#1 split-brain → real exit-readiness; #4 ideation/nursery → renewable belt). The genuine product question — automated go-to-market/distribution (currently shells) vs. manually selling the first venture — is a chairman strategy call. The EVA command-bus is real-but-partial (operator leverage) but ranks **below** the revenue path.

**Diff target for v3:** re-run after a venture earns its first real dollar — the back-half engines will then have real data, and their true (vs. starved) state becomes visible.
