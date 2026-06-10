<!-- Archived from: C:\Users\rickf\AppData\Local\Temp\sd-lint-metadata-orphan.md -->
<!-- SD Key: SD-LEO-INFRA-LINT-METADATA-ORPHAN-001 -->
<!-- Archived at: 2026-05-30T12:47:54.180Z -->

# CI Lint: metadata.is_* Orphan / Phantom Flag Detector

## Type
infrastructure

## Target Application
EHG_Engineer

## Priority
medium

## Goal
The audit SD-LEO-INFRA-AUDIT-METADATA-ORPHAN-001 statically classified every `metadata.is_*` boolean flag as HEALTHY, ORPHAN (written, never read), PHANTOM (read, never written), or SCAFFOLDING-ONLY, and found `is_venture` is PHANTOM in production (a type-detection reader that always sees undefined because nothing writes it). That audit was a one-time snapshot. Codify its detection method into a recurring CI lint so new orphan/phantom flags are caught at PR time instead of accumulating as silent dead behavior.

## Changes
- Add a static-analysis lint script that scans `*.js/*.mjs/*.cjs/*.ts` + `database/migrations/*.sql` for `metadata.is_*` reads and writes (JS: `metadata?.is_x`, `is_x:` literals, `{...metadata, is_x}`; SQL: `metadata->>'is_x'`, `jsonb_set('{is_x}')`), pairs writer↔reader, and classifies each flag.
- Fail the lint when a flag is PHANTOM (≥1 production reader, 0 production writers) or ORPHAN (≥1 production writer, 0 production readers); treat SCAFFOLDING-ONLY and HEALTHY as passing.
- Exclude the documented false-positive classes (real columns like `is_working_on`/`is_active`; local result-object construction such as `details: { is_orchestrator: true }`; non-production paths archive/one-off/test).
- Provide an allow-list file for intentionally-cross-repo flags (read by the EHG frontend) so legitimate cross-repo readers don't false-fail, with each entry requiring a justification comment.
- Wire the lint into CI as a non-required check first (report-only) for one cycle, then promote to required.

## Objectives
- New PHANTOM/ORPHAN metadata flags are caught at PR time, not discovered in a later audit.
- The known `is_venture` PHANTOM is either resolved (writer added or reader removed) or explicitly allow-listed with justification.
- The lint is low-noise: documented false-positive classes are excluded so it does not block on legitimate patterns.

## Acceptance Criteria
- AC-1: a lint script enumerates every `metadata.is_*` flag with production writer/reader counts and a classification.
- AC-2: the lint exits non-zero on any PHANTOM or ORPHAN flag not in the allow-list.
- AC-3: real columns, local-object constructions, and non-production paths are excluded (no false classification).
- AC-4: an allow-list with per-entry justification suppresses known cross-repo readers.
- AC-5: CI runs the lint; the current tree passes (after `is_venture` is resolved or allow-listed).
- AC-6: a unit test feeds a synthetic ORPHAN and a synthetic PHANTOM and asserts both fail.

## Demo
1. Run the lint on the current tree → it reports `is_venture` PHANTOM and exits non-zero.
2. Add `is_venture` to the allow-list (or its writer) → lint passes.
3. Introduce a synthetic `metadata.is_test_orphan` write with no reader → lint fails, naming the flag.
