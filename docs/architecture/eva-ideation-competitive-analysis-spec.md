# EVA venture-ideation upgrade: competitive-analysis-grounded idea generation (Phase-0 design)

**SD**: SD-LEO-FEAT-EVA-VENTURE-IDEATION-001
**Status**: Phase-0 design/spec only — no build in this SD
**Roadmap source**: `roadmap_wave_items` e09426eb-6c0d-4f2e-a16c-a0f2f5b23802 ("In the venture ideation, we could perform an analysis on other companies and see which of their products are doing the best and strictly target that one product but do it extremely better"), chairman W6 ruling 2026-08-22T11:01:57.994Z: **3 PROMOTE**.

## 1. Shared-interface generalization (does not create a second scanner)

The codebase already has a canonical competitive-intelligence contract:

- **`lib/competitive-intelligence/index.js`** — "the single import surface for competitor intelligence." Exports `analyzeCompetitor(url, opts)`, `persistTeardownAnalyses(analyses, opts)`, plus re-exports from `four-buckets.js` (tagging) and `canonical-store.js` (persistence: `competitor_intelligence` + `ci_snapshots` tables).
- **`lib/eva/stage-zero/paths/competitor-teardown.js`** — `executeCompetitorTeardown({ urls }, deps)` already implements this SD's core concept end-to-end: fetch competitor URL → `analyzeCompetitor` → optionally persist via `persistTeardownAnalyses` → run `runDifferentiationBoard` → project the board result into the Stage-0 output.
- **`lib/competitive-intelligence/differentiation-board.js`** — runs the existing 6-seat board-of-directors deliberation engine headless on a `competitor_intelligence` record, producing a `differentiation_strategy` and a deterministic `computeDifferentiationDelta()` score in `[0,1]`, gated by `applyDeltaGate()` against `DEFAULT_DELTA_THRESHOLD = 0.5`.

**This spec proposes NO new competitor-scanning module.** The shared interface is `lib/competitive-intelligence/index.js` as it exists today, used exactly as `competitor-teardown.js` already uses it. What generalizes is *how it is invoked and by whom*:

| Aspect | Reused as-is | Generalized | New (ideation-specific wrapper) |
|---|---|---|---|
| `analyzeCompetitor()` | ✅ (no signature change) | — | — |
| `persistTeardownAnalyses()` | ✅ (no signature change) | — | — |
| `computeDifferentiationDelta()` / `applyDeltaGate()` | ✅ (no signature change) | — | — |
| Consumer wiring | — | The *caller* changes: today only `competitor-teardown.js` (one Stage-0 path) calls this chain. This SD's future build attaches a second caller inside ideation scoring (§3) that invokes the same chain against a *set* of candidate competitor URLs rather than a single teardown flow. | A thin scoring-adapter function (not yet named/built) that maps `differentiation_delta` + `four_buckets` output into the `competitive_advantage` scoring dimension (§3) |

No fields, exports, or persistence schema in `lib/competitive-intelligence/` need to change to support this SD's future build.

## 2. Consumers

The hard NFR from the pre-source Solomon consult (session_coordination row `cd16409f`, 2026-08-23T12:06:20Z) requires exactly this: **one shared scan interface, two consumers, designed once.**

| # | Consumer | Status | Consumes |
|---|---|---|---|
| 1 | **EVA ideation scoring** (this SD's concern) | Built in a future, separate SD (this SD is design-only) | `analyzeCompetitor()` output + `computeDifferentiationDelta()` score, feeding `opportunity-scorer.js`'s `competitive_advantage` dimension (§3) |
| 2 | **Solomon Cluster-6 user/X-feedback-to-backlog pipeline** | **Future, greenfield** — Explore evidence (LEAD phase) confirmed zero existing code; the only repo references are advisory mentions in `CLAUDE_SOLOMON.md:201,287` (advise-only, relayed via Coordinator, no direct EVA channel) | Not yet specified; will consume the same `analyzeCompetitor()`/canonical-store contract when built |

**Coupling check**: `analyzeCompetitor(url, opts)` takes a bare URL and a generic options bag (`persist`, `ventureId`, `createdBy`, `source`, `serviceConfig`, `supabase`) — it has no ideation-specific parameter today, and none should be added. Ideation-specific logic (the targeting rubric, §4) lives entirely in the *consumer* layer (the future scoring-adapter), not in the shared interface. This keeps Cluster-6 free to adopt the same interface later without inheriting ideation's scoring assumptions. **No interface change is required to keep this property; the constraint is on the future build, not on this spec.**

## 3. EVA ideation scoring integration point

Two ranking/scoring surfaces exist in the ideation path today:

- **`lib/eva/stage-zero/ranking-pipeline.js`** — `runRankingPipeline()` orchestrates trend-data pollers (Product Hunt, etc.) → `executeDiscoveryMode()` → a `PathOutput`. This is a *trend-discovery* path (candidate generation from external ranking signals), not a competitor-targeting path.
- **`lib/discovery/opportunity-scorer.js`** — `OpportunityScorer` scores gap-analysis-derived opportunities across weighted dimensions, one of which is **`competitive_advantage`** (weight 0.15–0.20 depending on scoring-weights version), classifying into GREEN/YELLOW/RED boxes with confidence-gated auto-approval (`≥85%` auto-approve, `70–84%` pending review, `<70%` auto-reject).

**Chosen integration point: `lib/discovery/opportunity-scorer.js`'s `competitive_advantage` dimension.** Rationale: this dimension already exists as a named scoring weight in the exact shape needed (a 0–1-ish contribution to overall opportunity score); it is the natural home for a competitive-analysis-grounded signal, versus `ranking-pipeline.js` which is about trend *discovery*, not competitor *targeting*.

**Data contract (future build)**: the scoring-adapter (§1, new/ideation-specific) computes `competitive_advantage` input from:
```
{
  target_competitor: { url, company_name, four_buckets },      // from analyzeCompetitor()
  differentiation_delta: number,                                // from computeDifferentiationDelta(), [0,1]
  gate_verdict: { seedable: boolean, threshold: number, reason } // from applyDeltaGate()
}
```
`differentiation_delta` maps directly onto the `competitive_advantage` scoring input — no new scoring math needs inventing; the future build wires an existing pure function's output into an existing scoring dimension's input.

## 4. "Target their best product, do it extremely better" — evaluation rubric

Two sub-problems from roadmap item e09426eb, resolved using existing machinery:

**(a) Identify the competitor's best-performing product.** No existing code ranks a competitor's own product portfolio internally (competitor-teardown analyzes one URL = one product/service surface at a time). The future build's targeting step is: for a competitor with multiple products, run `analyzeCompetitor()` once per product URL, then rank the resulting `four_buckets` outputs by the same `market_opportunity` heuristics `opportunity-scorer.js` already uses for internal opportunities (traction/evidence-strength signals surfaced in `four_buckets`) — reusing the scorer's existing weighting philosophy rather than inventing a second ranking method. The "best product" is the one with the highest resulting opportunity-scorer composite score when run through the *existing* scoring pipeline as if it were EHG's own candidate.

**(b) Quantify "extremely better."** This is **already solved** by `differentiation-board.js`'s `computeDifferentiationDelta()` + `applyDeltaGate()`:
- `computeDifferentiationDelta()` combines breadth of distinct unique advantages (capped, saturating at 4), a **structural/automation-angle bonus** (+0.2 for automation, first-principles, structural cost, 24/7, no-headcount, AI-operated signals — precisely "EHG's automation advantage"), and a **me-too penalty** (subtracts for advantages that merely echo the competitor's own known features).
- `applyDeltaGate(delta, threshold=0.5)` returns `seedable: true` only when `delta >= threshold` — "me-too, blocked" otherwise, requiring explicit operator confirmation to proceed with a non-differentiated idea.

**The targeting rubric is: reuse `DEFAULT_DELTA_THRESHOLD = 0.5` as the "extremely better" bar.** No new threshold is proposed. This is deliberate: the existing gate was calibrated for exactly this purpose ("the moat" — see the file's own header comment) and a second, ideation-specific threshold would fragment the single-representation the shared-capability NFR is protecting.

## 5. Solomon design input and fold provenance

Solomon is a named design input on this SD (Cluster-6 advise-the-owner relationship; EVA owns the ideation-scoring capability and retains ownership — Solomon's role is advisory, per the non-goals below).

This discharges the fold from roadmap item **fbfecad5** ("Ask Solomon how this might improve his ability to find venture opportunities"), folded into e09426eb as a Solomon-consult step (not a standalone item). The consult was sent 2026-08-23T11:59:57Z (row `671b8e3f`) and answered 2026-08-23T12:06:20Z (row `cd16409f`), contributing:

1. Q: how does competitive-analysis-grounded ideation improve Solomon's ability to find venture opportunities?
2. A: the competitive-analysis scanner must be a shared capability — one scan interface consumed by both EVA ideation scoring (this SD) and Solomon's Cluster-6 user/X-feedback-to-backlog pipeline (future); designing it ideation-private would be a single-representation violation.
3. A: Solomon is a named design input on this SD (Cluster-6 advise-the-owner; EVA owns).

Both contributed answers are reflected directly in §1–§2 above.

## 6. Non-goals and scheduling

**Binding non-goals** (unchanged from SD scope, restated here):
- No new venture-minting authority.
- No changes to chairman decision flows.
- Advises-EVA-owns boundary: this design advises EVA's owner surfaces; it does not transfer ownership of the ideation capability to Solomon or any other seat.

**Scheduling**: per the chairman W6 ruling (`ruled_at` 2026-08-22T11:01:57.994Z), execution of any build implementing this spec is scheduled **post-W3-start**. This condition was **satisfied** at SD-mint time (`metadata.scheduling_constraint_resolved.satisfied_at` = 2026-08-30T11:21:54.974Z), measured by natural key: `PRICING-CHECKOUT-001`, `INSTRUMENTATION-RETROFIT-001`, and `DEMAND-LOOP-001` completed, `FIRST-CUSTOMER-001` active. The design work captured in this document proceeds now, independent of when a future build SD is scheduled to start — this SD's own deliverable (this document) is complete on commit, not gated on W3.

## Adjacent, non-duplicate SDs

Two open SDs touch adjacent competitive-analysis concepts but for a different consumer (stage-scoring, not ideation):
- `SD-LEO-INFRA-COMPETITIVE-BASELINES-RECURRING-001` (active) — recurring competitive-baseline refresh feeding stage scoring, via `lib/discovery/competitive-baseline-service.js`.
- `SD-LEO-FEAT-COMPETITIVE-VIGILANCE-OBSERVED-BASELINE-001` (deferred).

Both are additional real-world evidence *for* the shared-capability NFR (§1–§2): multiple consumers already exist or are planned around the same underlying competitive-intelligence data, reinforcing that a single, generalized interface — not per-consumer scanners — is the correct shape.
