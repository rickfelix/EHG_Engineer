# Audit: Migration `SET DEFAULT` vs Code-Override Drift (F12 sweep)

**SD:** SD-LEO-INFRA-AUDIT-MIGRATION-SET-001
**Date:** 2026-05-29
**Deliverable type:** Read-only audit. **Fixes are OUT OF SCOPE.**
**Outcome:** ✅ **No F12-shaped drift-bug found** — the original F12 (user_stories.status) is already remediated; all other overrides are intentional.

## What this audits

The **F12 pattern** (from SD-LEO-INFRA-AUTO-STORY-QUALITY-GATE-001): a migration changes a column's default to express an intent, but production code written *before* the migration hardcodes a different value at insert time, silently negating the new default. This sweep enumerates every `ALTER COLUMN ... SET DEFAULT` (the genuine F12-risk class — a default CHANGED on an existing table) and checks production writers for overrides.

**Scope note (TR-2):** `CREATE TABLE ... DEFAULT` statements are treated as a summarized lower-risk class, NOT deep-audited. F12-shaped drift requires the default to change *after* writers already exist; CREATE-TABLE defaults are co-created with their writers, so an "override" there is the intended initial value. With 457 default-bearing migrations of 1015 total, exhaustive CREATE-TABLE auditing is low-ROI; the **4 executable `ALTER ... SET DEFAULT` columns** are the high-signal set and are audited line-by-line below. (A 5th migration, `20260423_sd_array_defaults_reconciliation.sql`, was initially miscounted as a `SET DEFAULT` — it actually executes **`DROP DEFAULT`** on the SD array columns; a dropped default has zero F12-drift surface and is noted out-of-class below.)

## Classification key

- **(a) honors** — writer omits the column OR sets the same value as the new default.
- **(b) overrides** — writer sets a different literal. Sub-tagged: **(i) intentional** (justified) or **(ii) F12 drift-bug** (historical override silently negating the migration).
- **(c) ambiguous** — computed/variable value; review case-by-case.

## Per-migration table

| Migration | table.column | New default | Production writers (file:line → value) | Classification |
|-----------|--------------|-------------|----------------------------------------|----------------|
| `20260527_user_stories_status_default_draft.sql` | `user_stories.status` | `'draft'` | `lib/sub-agents/modules/stories/execute.js:300` → `allAcsBoilerplate(...) ? 'draft' : 'ready'`; `scripts/modules/user-stories-d6/stage-2{1,2,3}-stories.js` → `'draft'` (x9) | **(b)(i) intentional — F12 REMEDIATED** + (a) honors (d6 writers) |
| `20260528_retrospective_type_default_null.sql` | `retrospectives.retrospective_type` | `NULL` | `scripts/generate-retrospective.js:176` → `null`; `…/exec-to-plan/retrospective.js:384` → `'EXEC_TO_PLAN'`; `…/lead-to-plan/retrospective.js:284` & `…/plan-to-exec/retrospective.js:193` → `retrospectiveType` (var) | **(a) honors** (completion retros) + **(b)(i) intentional** (handoff retros tag their type) |
| `20260527_eva-support-decision-log-decision-kind-default.sql` | `eva_support_decision_log.decision_kind` | `'sd_recommendation'` | `lib/eva-support/sd-recommendation-emitter.js:210` → `'sd_recommendation'`; `lib/eva-support/sd-reader.js:88` → `'reader_disabled'`, `:127` → `'reader_error'` | **(a) honors** (emitter) + **(b)(i) intentional** (genuinely different event kinds) |
| `20251206_vision_transition_001c_stage_constraints.sql` | `compliance_checks.total_stages` | `25` (changed from 40) | *(none found in production)* | **(a) honors** — no production writer; the default fully governs |
| `20260423_sd_array_defaults_reconciliation.sql` | `strategic_directives_v2.{key_principles, success_metrics, success_criteria}` | **`DROP DEFAULT`** (not SET) | n/a — see note | **OUT OF F12 SCOPE** — this migration *drops* the `'[]'::jsonb` defaults (the `SET DEFAULT` text is only in its commented rollback block). A dropped default has no F12-drift surface (there is no new default a writer could silently negate). The many writers that populate these columns with real arrays do so by design. |

## Detail on the F12 case (`user_stories.status`)

**The original F12 drift is FIXED.** `lib/sub-agents/modules/stories/execute.js:300` now reads:
```js
// SD-LEO-INFRA-AUTO-STORY-QUALITY-GATE-001 Option B (PR #4019): 2nd writer
// parity — boilerplate ACs default to draft so PLAN-TO-EXEC USER_STORY_QUALITY
// gate doesn't block until a human promotes via promote-user-stories.js.
status: allAcsBoilerplate(storyContent.acceptance_criteria) ? 'draft' : 'ready',
```
The historical hardcoded `status: 'ready'` (which negated the `'draft'` default for boilerplate stories) is gone. The writer now sets `'draft'` for boilerplate ACs (honoring the migration's intent — boilerplate stays invisible to the gate until human promotion) and `'ready'` only for substantive content. This is an **intentional, documented override aligned with the migration**, not drift. The other 9 writers (`user-stories-d6/stage-2{1,2,3}-stories.js`) set `'draft'`, which **honors** the default.

## Findings summary

| Classification | Count | Notes |
|----------------|:---:|-------|
| (a) honors | 3 columns | user_stories.status (d6 writers), retrospective_type (completion), total_stages (no writers) |
| (b)(i) intentional override | 3 columns | user_stories.status (F12 fix), retrospective_type (handoff tagging), decision_kind (event kinds) |
| **(b)(ii) F12 drift-bug** | **0** | **None found** |
| (c) ambiguous | 0 | handoff `retrospectiveType` var is contextually intentional |

## Conclusion (FR-6: acceptable outcome)

**No F12-shaped drift-bug found.** The canonical F12 (user_stories.status overridden to `'ready'`) was remediated by PR #4019 (Option B 2nd-writer parity). Every remaining override across the `ALTER SET DEFAULT` set is intentional and justified by call-site context (different event kinds, handoff-type tagging, empty-array fallbacks populated with real content). **No follow-up QF is filed** — per FR-6 this documented "no F12-shaped drift found" is the acceptable outcome.

## Limitations

- Deep audit covers `ALTER ... SET DEFAULT` only; `CREATE TABLE` defaults are a summarized lower-risk class (TR-2) — a future pass could sample them, though the temporal-gap argument makes F12-drift there unlikely.
- Writer detection used object-literal / `.insert`/`.update` / INSERT-VALUES grep over `lib/ scripts/ server/ src/` excluding `archive/`, `one-off/`, `tests/`. Dynamic column names or ORM model-level defaults could evade grep; the affected columns here are all written via explicit object literals, so coverage is high for this set.
- A standing CI lint (compare each `ALTER SET DEFAULT` against same-column writers, flag literal mismatches) would turn this one-time sweep into a guard — recommended as the durable fix (noted for a future infra SD, not filed as a QF since there is no active drift to remediate).
