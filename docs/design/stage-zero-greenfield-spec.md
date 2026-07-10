# Stage Zero — Greenfield Requirements-Spec (Leg A, deep-challenge commission)

**Status:** Solomon-authored (Fable, 2026-07-10), propose-only (CONST-002). Written **cold** — deliberately without reading `lib/eva/stage-zero/*` (frame-independence per the commission method). This is the requirements-spec Leg B audits the implementation against; the greenfield-vs-actual delta falls out of that audit.
**Question answered:** *if Stage Zero did not exist, what must a venture-selection/creation front-end do for a SOLO OPERATOR whose factory builds and operates the ventures?*
**Chairman injections folded in:** process-proving Phase-1 posture (2a9977e3); posture-as-governed-phases upgrade (b1615ef2); web-vs-mobile form-factor gap (40d087eb/c4fcb2b2). Chairman-review gate + governed persistence: non-negotiable, preserved throughout.

---

## R1 — Purpose and WIP discipline
Stage Zero converts an idea stream into **at most one right-sized venture commitment at a time**. The factory's scarce resources are chairman attention and factory focus — not ideas. An explicit, chairman-adjustable **WIP limit** (default 1 live venture) is a first-class setting; the stage's job is as much *refusing* ventures as selecting them. Kill-cheap is the default posture: everything before chairman PICK must be discardable at zero regret.

## R2 — Governed selection POSTURE (first-class phases, not weights)
Selection criteria are **not fixed**: they are a **governed, chairman-ratified POSTURE** with named phases, explicit weights, and pre-declared transition conditions:
- **Phase 1 — "process-proving"** (ACTIVE now, chairman-directed): SIMPLICITY dominates (small scope, fast time-to-launch, minimal integrations); **full-26-stage traversability is a HARD criterion** — the candidate must plausibly traverse launch, distribution, operations, and *real revenue collection* (trivially small real revenue still proves the S20-26 + attribution path); revenue potential = tiebreaker only; **anti-goals** (auto-disqualify): long sales cycles, content moats, app-store distribution surface, regulatory surface. **Expires** when one venture completes all 26 stages through real launch/ops/revenue.
- **Phase 2 — "success-weighted"** (pre-declared): revenue/market-weighted ranking; activated only by chairman ratification.
Mechanics: the ACTIVE posture is **queryable at run time**, every selection run **stamps the posture-version it applied**, and a run **fails closed** if it cannot resolve the active posture — silently applying a stale phase's weights is the gauge-vs-action divergence class and must be structurally impossible.

## R3 — The output is a falsifiable THESIS, not a score
A selection run's product per surviving candidate: **who pays, for what, how they are reached, at what price** — plus (a) a **demand-test plan executable BEFORE build**, and (b) **pre-registered kill criteria** ("this venture dies if X by stage Y"). Downstream kill/decision gates consume these pre-registered criteria **as contracts** — the gate-realism fix: gates evaluate the thesis's own falsifiers, not generic thresholds invented later. A bare composite score with no thesis is not a valid Stage-Zero output.

## R4 — Evidence-graded inputs; no ungrounded numbers
Every ranking factor **traces to a declared source** carrying an E0–E3 evidence grade; the thesis inherits the **weakest-link** grade of its load-bearing claims. An LLM-generated market/revenue estimate with no external source is **E0 by definition and cannot dominate a ranking**. Model-generated judgments (fit, taste, archetype) are **triangulated** (independent lenses; convergence ≠ correctness) and high-stakes market claims require an external ground-truth source or an explicit chairman waiver. This is the value-authenticity invariant applied to selection's inputs.

## R5 — Explicit decisions, never silent assumptions
Any dimension the factory can currently build only ONE way must surface at selection as an **explicit, ratifiable DECISION with a declared default** — not a silent assumption discovered at Stage 14. Named instance (chairman-surfaced): **form factor** — sanctioned outcomes: *web-first default* → *PWA middle path* → *explicit criterion for when native is genuinely required* (in Phase 1, native surface is an anti-goal per R2). The same pattern governs pricing model and hosting (hosting already ratified = the template). General rule: **a constraint of the factory is a selection-time check, not a build-time surprise.**

## R6 — Capability-envelope input (factory honesty)
Selection consumes a **live map of what the 26 stages can genuinely deliver today** — fed by the deep-challenge ledgers and updated as capabilities ship. A candidate requiring undelivered capability **fails traversability regardless of its score**. This is the structural fix for selecting ventures the factory then fakes its way through (the MarketLens stub class begins at selection, not at build).

## R7 — Chairman authority points (non-negotiable)
The machine **RANKS; the chairman PICKS** — no auto-commit from ranking to venture creation, ever. Kill authority absolute and never times out. Posture transitions (R2) are chairman ratification points. A **nursery** holds parked ideas with explicit resurfacing conditions (never silent loss, never zombie resurrection without a condition firing). Governed persistence for every decision artifact.

## R8 — The selection engine passes its own authenticity gate
Stage Zero's own synthesis/scoring modules are **subject to the value-authenticity ladder**: scores must be mock-distinguishable (a hash-ranked or catalogue-sliced stub must FAIL mechanically — the personaGeneration lesson applied to selection itself); data-source provenance must be *reached* at runtime, not merely declared; the I4-style seeded-defect canary applies (a deliberately decorative scoring module in the calibration set must turn the gauge red).

## R9 — Run shape, reproducibility, provenance
Selection runs are **on-demand batches** (chairman- or event-triggered), never continuous background generation. Each run records: posture-version applied, evidence snapshot, candidate set, and **idea provenance** (chairman spark / market signal / competitor move / generated) — so any pick is reproducible and auditable after the fact. Discovery/generation modes are inputs *to* a run, not autonomous venture creators.

## R10 — Acceptance (the spec's own mock-distinguishing test)
1. A Phase-1 posture run over the current candidate pool must produce a **simple, process-proving pick** with a full-traversal plan and pre-registered kills — and the chairman's actual next-venture directive is the live fixture for this.
2. The spec itself is mock-distinguishing: a stubbed selection engine passes R1/R7 trivially but **must fail R4 (ungrounded scores) and R8 (provenance-reached) mechanically** — if it doesn't, the spec has failed its own bar.

---

## Delta-predictions for Leg B (what the audit will likely find — falsifiable)
The existing implementation likely: has **no posture concept** (hard-coded revenue-ish weights → fails R2); produces **scores, not theses** — no pre-registered kills, no pre-build demand-test plan (fails R3); carries **ungrounded LLM scoring** (`parseRevenuePotential`/strategic-fit realism → fails R4); assumes **web silently** (`venture-stack-policy.js:57` → fails R5); has **no capability-envelope input** (fails R6); and its 17 synthesis modules are **unaudited against R8**. Each confirmed prediction lands in the flaw ledger with file:line; each refuted one is evidence the greenfield spec, not the code, needs revision — the delta cuts both ways.

*Propose-only. Leg B (builder seats) audits against this spec + the anti-stub classes; Solomon adjudicates the resulting ledger; Adam packages for the chairman; SDs cut post-adjudication.*
