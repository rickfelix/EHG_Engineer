# Value-Authenticity System — Unified Design (SSOT)

**Status:** Solomon-authored (Fable, 2026-07-09 window), propose-only (CONST-002). Adam adopted each layer individually 2026-07-08 (advisories 214fa413, bccb695e/623726b3, e158a17a/83d60498, 627b4857/57e27e2c, 35aea8a5/c70d18b7); this doc unifies them into ONE buildable spec. Chairman-originated across 5 directives, 2026-07-08.
**Origin incident:** MarketLens `src/services/personaGeneration.js` — a spec-permitted deterministic stub (FNV-1a hash of input text → fixed persona catalogue + WTP bands) that PASSES journeys, PASSES "traces to a computation," and would have reached the chairman stamped "partial coverage." Defect was in the SPEC (PRD TR-2 deferred the real engine to an untracked follow-up), not the code.

---

## 0. The invariant, and the two axes it spans

**ONE invariant:** *a value-bearing claim must be honored by a REAL computation, verifiable WITHOUT trusting the producer.*

It is enforced across **two orthogonal axes** (do NOT merge them — different failure modes, different code):
- **CONTENT/VERIFICATION axis** (this doc): is what flows actually real/honored? Failure = trusting the producer's claim. Layers 1–5 below.
- **CONTROL/AUTHORIZATION axis** (separate: SD-1 decision-binding [shipped 2026-07-08] + SD-2 dispatch-authorization state machine): is this artifact authorized to proceed? Failure = fail-open default. See `docs/` decision-binding reference + the dispatch-polarity architecture (Solomon advisories 8a6903f3/15146ea3).

**The invariant is FRACTAL/SELF-APPLYING:** every producer layer (domain-expert agent → spec → build → runtime output) is itself a value-bearing computation that can be decorative. The SAME test (provenance + evidence-grade + independent verification) applies at each layer. One test, recursed — not five mechanisms.

**Termination (no infinite regress):** verification bottoms out at a NON-LLM base case: (i) a cited external PRIMARY source with freshness/authenticity check (deep-research reaches it), or (ii) EXPLICIT CHAIRMAN ESCALATION when no external ground truth exists and confidence is low. The system must KNOW when it hits un-sourceable bedrock; an ungrounded confident answer is worse than an escalation.

---

## 1. Layer specs (bottom-up: runtime → spec → spec-production → grounding)

### L1 — Decorative-computation class + runtime anti-stub dimension (APA)
One enumerated §0.5.1 dimension: **"value/output authenticity"**, with TWO realization sites (same dimension, never two silos): (i) the I4 seeded fixture (regression canary — the gauge reds if the class stops being caught), (ii) layer-D per-persona walkthrough assertions (live coverage).

**Cheapest-first stub-tell ladder** (stop at first finding; only pay the next tier when the cheaper passes):
- **T0 source-EXISTS** (static, ~0 FP): AST/grep the value engine for ANY external dependency (model call / data corpus / external fetch). Pure-function-of-user-input = automatic finding. Catches the honest stub.
- **T1 source-REACHED** (runtime, ~0 FP, **PRIMARY hard catcher**): during the walkthrough, APA's own instrumentation (instrument-don't-mock) asserts the declared source was ACTUALLY consulted. Catches the dishonest stub that deleted the comment. Keys on the PRODUCT-LEVEL claim (numbers presented as real research), never an in-code string.
- **T2 metamorphic-MONOTONICITY** (deterministic, low FP): a CONTROLLED DIRECTED perturbation (budget↑, segment shift; template-generated, no LLM) must produce the CORRESPONDING directed output change (check direction/ordering, not absolutes). A hash stub moves outputs randomly — its sensitivity is uncorrelated with meaning. **Never "differs per input"** — a hash is input-sensitive by construction (the defeated criterion). Rule: *input-sensitivity ≠ input-responsiveness.*
- **T3 paraphrase-INVARIANCE** (SOFT corroborator only): stability under meaning-preserving edits. FP-prone vs real LLM variance; under the §0.5 fail-closed bar it must never hard-fail. Keys ONLY on absolute-value product-sensitivity, wide tolerance, biased to false-negatives. (T2+T3 = the metamorphic pair: covariant under meaning-CHANGING edits AND invariant under meaning-PRESERVING edits; a stub is chaotic under both.)
- **T4 plausibility-as-persona** (model-tier, SOFT): agent walks the flow AS the persona, judges "specific to my input vs canned boilerplate." Routed through the §5 two-stage funnel; corroborates, never blocks.

Mechanism note: this is ONE claim-honesty CLASS with Child B, but T2 is a NET-NEW metamorphic-probe backend — NOT a Child-B transport-interception extension (the stub emits no side effect and no in-code claim; Child B's mechanism no-ops on it). Budget the new backend.

### L2 — Spec-time gate ("value-authenticity specifiability", LEAD/PLAN)
The spec must define acceptance criteria A MOCK CANNOT SATISFY. The gate inherits L1's pitfall — "output differs per input" is spec-permitted-mock-passable — so it must NOT accept free-text criteria. The author **SELECTS + PARAMETERIZES from the canonical criteria library** (§2); the spec WRITES the acceptance test into the unified registry at PLAN; APA READS+RUNS those same criteria at runtime. Round-trip SSOT — this is what makes "one invariant, two enforcement points" provably true instead of prose-linked drift.
- **Deferred-stub trap, two teeth:** a phased stub is legal ONLY if (i) the deferral is a named SD that is a HARD BLOCKING predecessor on the venture's value-claim launch gate, AND (ii) the product CLAIM-DEMOTES while stubbed (cannot advertise the stubbed capability as real).
- **Trigger predicate:** leaves whose output the product presents as a DERIVED RESULT a user relies on (analysis/recommendation/generated content/score/price), grounded in the venture's vision value-claims — not CRUD/nav (universal friction gets gates gamed).
- **No silent pass:** if a value claim has no expressible anti-mock criterion, the gate DOWNGRADES to an explicit tracked "authenticity-unspecifiable" waiver with a named owner — canonical criteria OR waiver-with-owner, never silence.
- **Constitutional grounding:** CONST-012 sharpened — delivery evidence must be MOCK-DISTINGUISHING evidence.
- **Gate's own acceptance test:** MarketLens's TR-2 PRD, as written, MUST FAIL this gate ((a) untracked deferral → block; (b) "differs per input" only → block; (c) provenance-reached + monotonicity + grade + tracked-blocking deferral → pass).

### L3 — Spec-production pipeline (upstream of the gate)
Producing a spec detailed enough to demand the real thing needs domain expertise the harness lacks. Three mechanisms, all REUSE: (1) vertical-knowledge domain-expert agents — the mission's "expertise instantiated and combined" clause realized as a DIVERSE-LENS PANEL (convergence-or-escalate), never a lone expert; (2) the existing deep-research capability wired in (not rebuilt); (3) iterative review = draft → domain critique → research gap-fill → re-review, BOUNDED (N rounds → chairman) — never loops forever.
- **The recursive trap and its answer:** a hallucinating expert agent = a stubbed expert producing a stubbed spec. The guardrail IS the L1 test pointed at the agent: provenance (cites real sources), evidence-grade, author≠adjudicator. Don't build a second guardrail.
- **Weakest-link evidence propagation:** a criterion's authenticity-grade = the WEAKEST load-bearing domain claim under it (not the average), and that grade FLOWS THROUGH to the runtime gate. Prevents a confident spec laundering an E0 assumption into a hard gate. (Type specimen: venture-1 S16 generic-SaaS defaults contradicting the solo-chairman/AI-agent operating model.)
- **Cost-tiering:** full panel + research + iteration only for high-stakes/novel/regulated leaves (same trigger predicate as L2); cheap leaves get provenance-required + one grounded pass.

### L4 — Triangulation (the grounding/review engine inside L3)
Multi-INDEPENDENT-MODEL-FAMILY convergence (proposer≠evaluator). Filters idiosyncratic hallucination (won't converge). **HARD QUALIFIER — convergence is NECESSARY, not SUFFICIENT:** correlated false convergence is real (shared training-corpus bias → popular misconceptions and outdated best-practice converge cleanly; family diversity does NOT break shared-corpus bias; embedded false premises; moved domains). *Convergence ≠ correctness* — the decorative-computation problem at the epistemic layer. Therefore:
- Triangulation is an **ATTENTION-ALLOCATION MAP**, not a verdict: divergence marks the unresolved; stakes-weighting marks which CONVERGENT claims still need external confirmation despite agreement.
- **Divergence = a typed 3-way ROUTER** onto the termination base cases: factual disagreement → deep-research; genuine domain ambiguity/judgment → CHAIRMAN (this concentrates chairman attention on exactly his irreducible calls); question-underspecification → re-spec. Each review round = triangulate → classify → route → re-triangulate.
- **Threshold is stakes-weighted and NON-MONOTONIC:** suspicious perfect unanimity on a hard question is itself a flag (correlated bias or a trivial/underspecified question).
- **Thin NEW builds** (rest is assembly): (i) the divergence classifier-router, (ii) the stakes-weighted threshold + suspicious-unanimity check, (iii) the high-stakes-convergence-still-requires-external-confirmation guard.
- **Degraded mode:** single-family-only availability (quota pressure) → LOWER convergence-trust, RAISE external-confirmation. Never run single-family triangulation at full trust.

### L5 — Judge-integrity constraints (empirical, from the 2026-07-08 Stripe experiment)
Any LLM judging design/output quality must run **BRAND-STRIPPED + MULTIMODAL (screenshot, not text-fetch) + TRIANGULATED**. Measured: branded-fetch mean 4.83 vs blind-adversarial 3.33 on IDENTICAL bytes — a pass↔fail flip on reputation alone; text-fetch confabulates visual craft from brand memory. The branded-vs-blind SPREAD is itself the reputation-driven-verdict diagnostic. Validates the I3 brand-swap canary and the a11y cross-metric rule (award-curated sources don't measure accessibility — a11y anchors are named by DOCUMENTED conformance and live-DOM-verified, never reputation).

---

## 2. Shared primitives (the coupling artifacts — build ONCE, consumed by all layers)

1. **Canonical criteria library** (in the unified registry; APA = third consumer contract extended): the proven anti-mock assertions (T0–T4 forms, provenance-reached, monotonicity — never defeated forms). Spec-gate selects/parameterizes; APA executes. META-GATED: adding a criterion requires PROOF it is mock-distinguishing, else the library rots.
2. **Evidence-grade (E0–E3) with weakest-link propagation** across domain-claim → spec-criterion → runtime-verdict.
3. **Author ≠ adjudicator** at every layer (spec authored pre-build from the library — builder can select, never weaken; APA verdicts from APA's OWN instrumentation, never the build's test suite — a build can mock the feature AND its tests).
4. **Decision-binding disposition rows (SD-1, shipped)** for every gating decision (ratification, waiver, deferral, authorization) — question-keyed, succession-proof.
5. **Termination base cases:** cited-primary-source (freshness-checked) | chairman escalation.

## 3. SD carve (already Adam-adopted; restated for sourcing)
- **SD-3 family (this doc):** spec-gate SD + APA-runtime SD sourced as a COUPLED PAIR; the criteria library IS the coupling artifact. L3/L4 spec-production+triangulation source behind them (consumes the same library + grades).
  - Pair-half A (criteria library + spec-gate, `SD-LEO-INFRA-VALUE-AUTHENTICITY-SPEC-001`): **shipped** — `value_authenticity_criteria_library` frozen at contract_version=1, 5 seeded rows.
  - Pair-half B (L1 runtime anti-stub ladder, `SD-LEO-INFRA-VALUE-AUTHENTICITY-APA-001`): **shipped** — T0/T1/T2 probes + fail-closed aggregator (`lib/apa/value-authenticity-t0.mjs`, `-t1.mjs`, `-t2.mjs`, `-ladder.mjs`) and the I4 seeded regression canary (`lib/apa/fixtures/value-authenticity-i4-marketlens-stub.mjs`). T1's live-sandbox wiring to APA Child A and T3/T4 (soft corroborators) remain future work.
- Depends on: **SD-1** decision-binding (shipped) for waiver/ratification/deferral records. Sibling to: **SD-2** dispatch-authorization (control axis; no code edge).
- Fold-in note: L1's T2 perturbation vocabulary and L2's trigger-predicate boundaries are **validate-at-build** items (medium confidence — need empirical validation against a real generator when one ships).

## 4. System-level verification (each layer has its own plan in the source advisories; these are the cross-layer ones)
1. **MarketLens replay (end-to-end):** the TR-2 spec must FAIL the L2 gate; the hash stub must FAIL T1/T2 while PASSING naive input-sensitivity; a grounded L3 market-research panel must author "WTP derives from real elicitation" (a criterion the stub fails) and flag the deferral as an E0 gap.
2. **False-convergence seed:** a question carrying a known shared-corpus misconception must route to external confirmation, not be trusted on (wrong) convergence.
3. **Round-trip SSOT:** the exact registry criteria selected at PLAN are the ones APA executed at runtime (IDs match), and the weakest-link grade is visible on the runtime verdict.
4. **Judge integrity:** the L5 brand-strip/multimodal/spread checks run on APA Child E's judge before its verdicts are trusted (the 16+1-fixture calibration set is the harness).

---
*Propose-only. Owners: Adam sources; PLAN/EXEC build; the chairman ratifies gates that bind him. Source advisories hold the full per-layer counterfactuals and verification plans; this doc is the unified spec the children PRDs cite.*
