# Audit: `metadata.is_*` Orphan & Phantom Flags

**SD:** SD-LEO-INFRA-AUDIT-METADATA-ORPHAN-001
**Date:** 2026-05-29
**Scope:** EHG_Engineer codebase (`*.js/*.mjs/*.cjs/*.ts` + `database/migrations/*.sql`)
**Deliverable type:** Read-only static-analysis audit. **Fixes are OUT OF SCOPE** — this report enumerates findings and recommends follow-ups; it changes no behavior.

## What this audits

Every boolean flag stored *inside the `metadata` JSONB column* (pattern `metadata.is_*`), paired writer↔reader, classified as:

- **HEALTHY** — ≥1 production writer AND ≥1 production reader.
- **ORPHAN** — written but never read (a dead write; the behavior the write implies never happens).
- **PHANTOM** — read but never written (the reader silently always sees `undefined`/`false`; a code path gated off by accident or made vestigial by a different mechanism).
- **SCAFFOLDING-ONLY** — only ever written/read in non-production paths (`archive/`, `scripts/one-off/`, `scripts/archive/`, `.rca/`, `*.test.js`).

> **Real columns excluded** (NOT metadata flags): `is_working_on`, `is_active` are real columns on `strategic_directives_v2` / sessions — they are not part of this audit and are excluded to avoid false classification.

## Detection method

Static grep over the tree:
- **JS reads:** `metadata\??\.is_[a-z_]+`, `metadata['is_x']`
- **SQL reads:** `metadata->>'is_x'`, `metadata->'is_x'`
- **JS writes:** `is_x:` object-literal keys, `metadata.is_x =`, `{...metadata, is_x}`
- **SQL writes:** `jsonb_set(... '{is_x}' ...)`, `UPDATE ... SET metadata`

**Excluded false positives:** `details: { is_orchestrator: true }` in `plan-to-lead/gates/*.js` builds a *local result object* — it is neither a read nor a write of `metadata.is_orchestrator`. All such local-object constructions were excluded from writer/reader counts.

**Limitations:** Dynamic keys (`metadata[\`is_${x}\`]`), destructuring reads (`const { is_x } = metadata`), and cross-repo reads (the EHG frontend consuming EHG_Engineer-written flags) are not captured by these patterns. PHANTOM/ORPHAN classifications below were spot-verified by reading the cited lines; cross-repo consumption is called out where relevant.

## Summary table

| Flag | Classification | Prod writers | Prod readers | Notes |
|------|----------------|:---:|:---:|-------|
| `is_parent` | **HEALTHY** | yes | yes | Core orchestrator/parent detection. |
| `is_orchestrator` | **HEALTHY** | yes | yes | Type detection + orchestrator preflight. |
| `is_orchestrator_prd` | **HEALTHY** | yes | yes | PRD-validation parent path. |
| `is_coordinator` | **HEALTHY** | yes | yes | Fleet coordinator resolution. |
| `is_consolidated` | **HEALTHY (write-heavy)** | yes (many) | 1 | Many writers, single real reader — see detail. |
| `is_venture` | **PHANTOM (production)** | **none** | yes | Read in type-detection; never written. **Top finding.** |
| `is_production_deployment` | **PHANTOM (production)** | none (archive only) | yes | Read by adaptive-threshold-calculator; written only in an archived seed script. |
| `is_emergency_hotfix` | **PHANTOM (production)** | none (archive only) | yes | Same as above. |
| `is_test` | **PHANTOM-ish (data-driven)** | none (set out-of-band) | yes | Read by sd-next display filters; no code writer (set via manual/test data). |
| `is_fallback` | **ORPHAN within EHG_Engineer** | yes | none (tests + cross-repo only) | Written by stage18 route; consumed by the EHG frontend, not EHG_Engineer. |
| `is_official` | **SCAFFOLDING-ONLY** | no | no (archive read only) | Only in `scripts/archive/.../create-implementation-specification.mjs`. |
| `is_parent_change_history` | **NAMESPACE EDGE CASE** | governance obj | 1 migration | Written to `governance_metadata`, read from `metadata` — see detail. |

## Per-flag detail

### HEALTHY

**`is_parent`** — writers: `scripts/modules/sd-creation/ideation-milestone/vision-parent-sd.js:89`, `scripts/modules/orchestrator-creation-template.js`, `scripts/correct-sd-is-parent.mjs:105` (+ many archive/seed). readers: `lib/handoff/parent-detection.js:8,12,36,66`, `lib/sd/type-detection.js:55,70,102`, `scripts/phase-preflight.js:248`, `lib/leo/venture-pipeline-pointer.js:16,25`, `scripts/modules/handoff/orchestrator-completion-guardian.js:78`, `scripts/modules/parent-orchestrator-handler.js:56`, SQL migrations `fix_calculate_sd_progress_parent_support.sql:46,154`, `20260521_guard_auto_set_is_parent_corrected_parent.sql`.

**`is_orchestrator`** — writers: `lib/eva/create-orchestrator-from-plan.js:250`, `scripts/modules/orchestrator-creation-template.js:86`, `scripts/modules/ai-quality-evaluator.js:163`. readers: `lib/sd/type-detection.js:54,69,101,159,168`, `scripts/orchestrator-preflight.js:18,135`, `lib/analysis/scope-complexity-scorer.js:157`.

**`is_orchestrator_prd`** — writer: `scripts/modules/parent-orchestrator-handler.js:207`. readers: `scripts/modules/handoff/verifiers/plan-to-exec/prd-validation.js:169,213,216`, `scripts/modules/handoff/executors/plan-to-exec/parent-orchestrator.js:50`.

**`is_coordinator`** — writer: `lib/coordinator/resolve.cjs:99`. readers: `scripts/assign-fleet-identities.cjs:19,22`, `lib/coordinator/resolve.cjs:62`, `scripts/hooks/session-role-orient` path.

**`is_consolidated`** *(HEALTHY but write-heavy)* — writers (production, many): `scripts/leo-orchestrator/prd-generation.js:276,304`, `scripts/modules/orchestrator-generators.mjs:117,145`, `scripts/modules/orchestrator/prd-generator.js:288,316`, `scripts/modules/leo-orchestrator/prd-helpers.js:105,133`, `scripts/unified-consolidated-prd.js:143,217`, `scripts/prd-format-validator.js:121`. reader (production): `scripts/unified-consolidated-prd.js:50` (`metadata?.is_consolidated`); `scripts/archive/sd-scripts/execute-plan-sd008.js:138` is archive. **Note:** writer:reader ratio ~11:1 — most writers feed a single read site. Worth confirming the read still drives behavior; if not, the write fan-out is near-orphan.

### PHANTOM (production) — read, never written in production

**`is_venture`** ⭐ *top finding* — reader: `lib/sd/type-detection.js:113,127` (`sd.metadata?.is_venture === true`). **No production writer exists** (only `tests/unit/sd-type-detection/sd-type-detection.test.js:147` constructs it inline). The metadata-flag venture check is **vestigial** — venture detection in practice uses the `venture_id` column, so this branch never fires via the flag. Low risk (the column path works), but the dead check is misleading.

**`is_production_deployment`** and **`is_emergency_hotfix`** — readers: `scripts/modules/adaptive-threshold-calculator.js:133,153` (`metadata?.is_production_deployment`, `metadata?.is_emergency_hotfix`). Only writer: `scripts/archive/one-time/seed-validation-test-data.js:92,93` (archived). So the adaptive threshold calculator branches on flags that **no live code path ever sets** — the production-deployment / emergency-hotfix threshold adjustments are effectively dead unless these flags are set out-of-band. **Medium interest:** if those threshold behaviors are desired, a writer is missing; if not, the reads are dead.

**`is_test`** *(phantom-ish, data-driven)* — readers: `scripts/modules/sd-next/display/recommendations.js:264` (`sd.metadata?.is_test === true`), `tracks.js:22`, `fallback-queue.js:137` (QF-20260512-300, to exclude test-harness SDs from the queue). No **code** writer — `metadata.is_test=true` is set on test SDs via manual/seed data, not application code. This is an intentional data-driven filter, so it is **not a defect**, but it is a reader with no code writer (documented here for completeness).

### ORPHAN within EHG_Engineer (cross-repo consumer)

**`is_fallback`** — writers (production): `server/routes/stage18.js:66,164` (`metadata: { is_fallback: isFallback }` on marketing artifact rows). Readers **within EHG_Engineer**: only `tests/unit/stage18-fallback-metadata.test.js` + one-off PRD docs. **No EHG_Engineer production reader.** The intended consumer is the **EHG frontend** (different repo) displaying whether a marketing section was LLM-fallback-generated. So it is an orphan *within this repo* but likely healthy cross-repo. **Action:** confirm the EHG frontend reads it; if it does, no fix; if not, it is a true orphan.

### SCAFFOLDING-ONLY

**`is_official`** — only `scripts/archive/one-time/create-implementation-specification.mjs:61` (`metadata->>'is_official'`). No production writer or reader. Dead in archive; no action beyond noting it.

### NAMESPACE EDGE CASE

**`is_parent_change_history`** — written by `scripts/correct-sd-is-parent.mjs:106` into a **`governance_metadata`** object (`newGovernance`), but read by `database/migrations/20260521_guard_auto_set_is_parent_corrected_parent.sql:52` from **`metadata->'is_parent_change_history'`**. Possible namespace mismatch (governance vs metadata) — the migration reads a history array that the script writes to a different column. **Action:** verify the write target column matches the migration's read column.

## Prioritized follow-up list (NOT implemented here)

| Priority | Flag | Finding | Recommended action (future SD/QF) |
|:---:|------|---------|-----------------------------------|
| P2 | `is_production_deployment`, `is_emergency_hotfix` | Adaptive threshold calculator reads flags no live code sets | Decide intent: add a production writer (set the flags during real deploys/hotfixes) OR remove the dead threshold branches. |
| P2 | `is_parent_change_history` | Write target (`governance_metadata`) ≠ migration read source (`metadata`) | Verify/align the column; the change-history audit trail may be silently empty. |
| P3 | `is_venture` | Vestigial phantom (read, never written; `venture_id` column is the real path) | Remove the dead `metadata?.is_venture` check in `lib/sd/type-detection.js`, or document it as intentionally reserved. |
| P3 | `is_fallback` | Orphan within EHG_Engineer; EHG-frontend consumer assumed | Confirm the EHG frontend reads it. If yes, annotate as cross-repo; if no, remove the writes in `server/routes/stage18.js`. |
| P3 | `is_consolidated` | ~11 writers : 1 reader | Confirm the single reader drives real behavior; consider consolidating the write fan-out. |
| P4 | `is_official` | Scaffolding-only (archive) | No action (archive); optionally delete with archive cleanup. |

## Methodology note for re-runs

To reproduce/extend this audit, run the read/write grep patterns in "Detection method" above and re-classify. The flag universe found was 12 distinct `metadata.is_*` flags; a future SD could turn this into a CI lint (fail when a `metadata.is_*` reader has zero writers in production, modulo a known cross-repo allowlist).
