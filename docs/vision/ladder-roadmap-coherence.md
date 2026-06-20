# Vision-ladder / roadmap coherence (backward enforcement) + the forward complement

**SD-LEO-INFRA-VISION-LADDER-ROADMAP-COHERENCE-001 (FR-6).**

The vision ladder places each capability on a rung — **V1** (foundation), **V2** (revenue/earning), **V3**.
The live VDR build gauge measures the active rung. When a capability is misfiled (e.g. a revenue
capability sitting on the V1 foundation rung), a single blended "built %" can be misread as income
progress. This SD installs the **backward enforcement** so that drift is caught and surfaced; the
**sourcing engine's classify-to-rung router** is the **forward complement** that prevents drift at the source.

## Backward enforcement (this SD)

| Piece | Where | What it does |
|-------|-------|--------------|
| `nature` classification | `vision_ladder_criteria.nature` (additive column) + `OPERATIONAL_NATURE` (source of truth, `lib/vision/vdr-registry.js`) | Persists each criterion as `buildable` or `operational`, so coherence can be asserted as data. |
| Placement rules | `lib/vision/placement-rules.js` | A pure, frozen registry. The `REVENUE-NOT-IN-FOUNDATION` rule flags the **4 named revenue capabilities** if they reappear on V1 — scoped by name, NOT to all operational-nature criteria (6 operational KR/governance caps correctly live on V1). |
| Coherence assertion | `assertLadderRoadmapCoherence` (`lib/vision/vdr-registry.js`) | Returns gating registry coherence + **advisory-only** placement / wave↔rung findings. Wired into `computeBuildGauge` as `ladder_coherence` **without gating `available`** — the new checks can never suppress the live chairman gauge. |
| CI + gauge hook | `scripts/vision-coherence-check.mjs` (`npm run vision:coherence`) + `.github/workflows/vision-ladder-coherence.yml` | Runs the assertion every push + daily; emits `::warning::` on advisory drift, never fails the build. |
| Honest reporting | `formatGaugeForSummary` per-rung/per-nature line + `scripts/adam-exec-summary.mjs` | "V1 foundation: NN% built (buildable) — NN% operational — income/north-star tracked separately on V2", so a blended % can't be misread as income progress. |

**Safety doctrine:** every NEW coherence check is **advisory-only**. Only the pre-existing
registry↔vision drift check (`assertRegistryCoherence`) withholds the gauge. This mirrors how
`assertRegistryCoherence` itself was made gating only after it was proven stable.

## Forward complement (the sourcing engine)

The **sourcing-engine classify-and-route router** (SD-LEO-INFRA-SOURCING-ROADMAP-ENGINE / its
register-first + router-core children) is the forward half: every NEW candidate is auto-classified
and filed to the correct rung + lane at creation time. Backward enforcement (this SD) catches existing
misplacement; the forward router prevents future misplacement — together they keep the ladder coherent
without manual rung audits.
