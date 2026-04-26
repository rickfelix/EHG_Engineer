# Stage Templates — Typed-Artifact Pattern

## Overview

When a `lifecycle_stage_config.required_artifacts` row declares more than one
required artifact type, the analysis step that produces that stage's output
should emit those types directly as a typed array instead of relying on the
orchestrator's `extractMultiArtifacts` heading-split fallback.

The orchestrator (`lib/eva/eva-orchestrator.js`) accepts two analysis-step
return forms:

| Form | Shape | Detection |
|------|-------|-----------|
| Legacy single | `{ artifactType, payload, source, usage? }` | default — taken when no `artifacts` array present |
| Typed array | `{ artifacts: [{ artifactType, payload, source, gaps? }, ...], usage? }` | `Array.isArray(stepResult.artifacts) && stepResult.artifacts.length > 0` |

When the typed-array form is detected, the orchestrator pushes each entry
directly to its local artifacts list (with auto-filled `stageId` and
`createdAt`) and **bypasses `extractMultiArtifacts` entirely** for that step.
This eliminates the `Stage N multi-artifact extraction incomplete (X/N)`
warning that fires whenever a stage produces JSON that cannot be split by
markdown `## headings`.

## Canonical reference

Stage 14 (`lib/eva/stage-templates/analysis-steps/stage-14-technical-architecture.js`)
is the first migrated stage. The carving helper lives at
`lib/eva/stage-templates/analysis-steps/stage-14-projections.js` and exports
`projectStage14Artifacts(payload)`. Tests:

- Unit: `tests/unit/eva/stage-templates/analysis-steps/stage-14-projections.test.js`
- Integration: `tests/integration/eva/stage-14-typed-artifacts.test.js`

The carving logic was lifted verbatim from
`scripts/one-shot-recover-s14-lexiguard.mjs::buildProjections` (the
production-tested LexiGuard recovery script). That script remains valid for
historical recovery of pre-fix venture data; new ventures going forward
produce 5 typed artifacts at the source.

## When to migrate a stage

Migrate a stage analysis step to typed-artifact form when **all** of these are
true:

1. `lifecycle_stage_config.required_artifacts` for the stage has length > 1.
2. The current analysis step returns a single `{ artifactType, payload, ... }`
   object that the orchestrator's extractMultiArtifacts fallback splits
   ineffectively (look for `Multi-artifact extraction incomplete` warnings in
   logs filtered by stage).
3. The required types share enough structure that they can be carved from a
   single LLM call's payload — adding one LLM call per type is the
   alternative; per-type projection is preferred for cost.

## Migration recipe (4 phases, ~90 minutes)

1. **Extract & test the projection helper** (~30 min) — Create
   `lib/eva/stage-templates/analysis-steps/stage-N-projections.js` exporting
   `projectStageNArtifacts(payload) -> Array<{artifactType, payload, gaps?}>`.
   Use `ARTIFACT_TYPES` constants from `lib/eva/artifact-types.js` (no
   hardcoded strings). Write unit tests against the helper before wiring.

2. **Rewire the analysis step** (~20 min) — In `analyzeStageN`, after the
   existing payload assembly, build the legacy payload object, then build
   `artifacts: [{ artifactType: PRIMARY, payload: legacyPayload, source: 'analysis-step:stage-N' },
   ...projections.map(p => ({ ...p, source: 'analysis-step:stage-N-projection' }))]`.
   Spread `legacyPayload` at the top level of the return for backward-compat
   with direct callers (chain test, scripts) that read top-level keys.

3. **Verify orchestrator wiring** (~5 min) — No orchestrator changes are
   required after Stage 14's pattern; the dual-form detection at
   `eva-orchestrator.js` line 391-425 already handles new typed-array
   returns. Confirm by running an end-to-end test with the new stage.

4. **Coverage & docs** (~25 min) — Add unit tests covering at minimum:
   full-fidelity input → N artifacts, missing-input edge cases that record
   gaps[], idempotency (calling twice deep-equals), and explicit
   `artifactType` constant usage. Add an integration test asserting the new
   return form is detected by the orchestrator predicate
   `Array.isArray(stepResult.artifacts) && length > 0`.

## Backward-compat contract

The migrated analysis step **MUST** preserve the legacy payload at two
locations to avoid breaking existing consumers:

1. `result.artifacts[0].payload` — preserves the exact key set the legacy
   single-payload return carried, for the orchestrator's persistence path
   (`venture_artifacts` rows by artifact_type).
2. Top-level spread of `legacyPayload` — for direct callers that read
   `result.layers`, `result.dataEntities`, etc. (e.g. the stage-chain
   integration test, ad-hoc scripts).

## Cross-stage consumer audit (DATABASE sub-agent finding)

`lib/eva/eva-orchestrator-helpers.js::loadUpstreamArtifacts` merges all
artifact rows for a stage via spread in `created_at ASC` order. If a
projection's payload contains a key that also exists in the legacy
artifact's payload at the top level, last-row-wins clobbering can drop the
legacy value. Today this affects `integration_points` and `constraints` on
Stage 14 — the regression test asserts the legacy values survive merge.

When migrating a new stage, audit projection payload key sets against the
legacy artifact's payload top-level keys. If collisions exist, either
rename projection keys with type prefixes (e.g. `api_integration_points`)
or document that projections write a filtered subset that downstream
spread-mergers will see.

## Rollback

The change is purely additive at the persistence layer (more artifact rows,
not fewer). Rollback path: git revert the producer change. Already-persisted
projection rows can be deleted by `source = 'analysis-step:stage-N-projection'`
filter while leaving the `analysis-step:stage-N` (legacy) rows untouched.

---

*SD-LEO-INFRA-STAGE-PER-TYPE-001 — established the pattern. Future stages
that need migration: search for `Multi-artifact extraction incomplete` in
EVA logs filtered by stage to identify candidates.*
