---
Category: Deployment
Status: Approved
Version: 2.1.0
Author: Golf-4 (worker), SD-LEO-INFRA-CHAIRMAN-APPLY-CEREMONY-001
Last Updated: 2026-08-17
Tags: chairman-ceremony, chairman-gated, migration, readiness
---

# Chairman apply ceremony N+1 — readiness runbook

Produced by SD-LEO-INFRA-CHAIRMAN-APPLY-CEREMONY-001 per coordinator SCOPE GUARD (signal
`6fc87a2e`) and its ratification (directive `7ba9741e`, ratifying worker signal `6e784838`). This
SD's job is prep/verification only — **the actual apply is the chairman-verbal, Adam-scribed
ceremony**, not this SD, not any worker.

> **CORRECTION (v2.0.0, same-day, before merge)**: v1.0.0's FR-3 finding — "QF-disposition
> columns... never authored as a file" — was WRONG. A deep-tier adversarial PR review caught it:
> `database/migrations/20260816_add_quick_fixes_disposition_columns.sql` already exists (this same
> SD, commit `5b5876f1b49`), adds the identical 6 columns, and is a materially BETTER migration
> than the duplicate file v1.0.0 briefly authored to "fill" the false gap (real FK vs. a comment
> claiming one; `timestamptz` with a documented rationale vs. a contradicting naive timestamp;
> `ADD COLUMN IF NOT EXISTS` vs. a bare `ADD COLUMN` that would have collided 42701/42710 against
> the real file at apply time). The duplicate files have been deleted. Root cause: the "never
> authored" claim was carried over from a pre-compaction investigation earlier in this session and
> never re-verified against `database/migrations/` (only `database/chairman-gated/` was
> re-checked) before being reported to the coordinator, ratified, and built on. See the corrected
> row 5 in the verdict table below and the Signal reference section for the retraction.

## Scope correction from the coordinator's original 6-item list

The coordinator named 6 anchors to verify. Cross-referencing `database/chairman-gated/` against
`schema_migrations_applied` and each named SD's own `metadata.migration_plan` found the list had
drifted from ground truth in 3 distinct ways — ratified by the coordinator in full:

| Named item | Ground truth | Disposition |
|---|---|---|
| story-cascade trigger | `SD-LEO-INFRA-STORY-CASCADE-ADDITIVE-ONLY-001`'s own metadata says the migration was **withdrawn at LEAD** — fixed via plain JS instead, no file ever existed | **Dropped.** No-op, not part of this batch. |
| QF-disposition columns | **CORRECTED (v2.0.0)**: already exists at `database/migrations/20260816_add_quick_fixes_disposition_columns.sql` (this SD, commit `5b5876f1b49`) — the "never authored" claim in v1.0.0 was wrong, not re-verified against `database/migrations/` before being reported | **Not a gap.** No authoring needed. See row 5 below. |
| wave trigger | File exists (`20260803_current_wave_must_carry_items.sql`) but had **no DOWN or acceptance.mjs** | **Gap-filled this SD.** Authored the missing DOWN + acceptance.mjs. |
| AR DDL, plan_critiques, DEFACL | All 3 confirmed staged with DOWN+acceptance already present | **Verified, unchanged.** |

**4 additional staged files exist in the directory that the coordinator's list never named** —
found by direct-reading every file's own header, not assumed from filename:

| File | Disposition |
|---|---|
| `20260803_chairman_queue_truthful_render.sql` | **Superseded/dead.** Own header: `SUPERSEDED-BY: 20260817_chairman_all_decision_signals_merged.sql ... Do NOT apply this file.` That successor is already in the applied set. Kept for history only. |
| `20260803_chairman_source4_rework.sql` | **Superseded/dead.** Same successor, same disposition. |
| `20260816_belt_capacity_verdicts_unavailable_sentinel.sql` | **Real, staged, unlisted.** Has DOWN, no acceptance.mjs. Not part of the ratified batch — needs a coordinator call on whether to fold into ceremony N+1 or a later one. |
| `20260816_close_remaining_secdef_execute_exposure.sql` | **Real, staged, unlisted, security-relevant.** Has rollback+acceptance. Its own directory's README already flags it "still ceremony-pending." Closely related to DEFACL (companion fix, different axis — see below). Needs a coordinator call on inclusion. |

## Per-file verdict table — the ratified 5-file batch

| # | File | Verdict | Precondition evidence | UP/DOWN/acceptance |
|---|---|---|---|---|
| 1 | `20260816_agent_readiness_audit_schema.sql` | **READY** | Schema dry-run verified BEGIN/ROLLBACK by database-agent (evidence `7f9340e1`) before staging. Not yet applied (`schema_migrations_applied` ILIKE check: 0 rows). | All 3 present |
| 2 | `20260816_plan_critiques_add_metadata_and_content_hash.sql` | **READY** | TIER-1 additive verified by executing `classifyMigration()` against this exact SQL (database-agent evidence `4cac69dc`). Already carries `@approved-by: codestreetlabs@gmail.com`. Not yet applied. | All 3 present |
| 3 | `20260816_defacl_anon_auth_axis.sql` | **READY** | Future-scoped-only mechanism live-measured 2026-08-16 (`pg_default_acl` names anon/authenticated explicitly for postgres + supabase_admin, schema public, functions). No `@approved-by` yet (deliberate). Not yet applied. | All 3 present |
| 4 | `20260803_current_wave_must_carry_items.sql` | **BLOCKED** (file-complete, data-blocked) | **Live-reverified 2026-08-17T02:16:23Z, still true**: Wave 0 (`id=512c7478-...`, seq=0, status=approved, time_horizon=now) holds **0 items**. Applying this migration before Wave 0 gets items (or moves off `time_horizon=now`) will make the FIRST update to Wave 0 fail. This is a PLAN decision per the file's own header, not resolved by this SD. Not yet applied. | All 3 present — DOWN + acceptance authored this SD |
| 5 | `database/migrations/20260816_add_quick_fixes_disposition_columns.sql` (note: NOT under `database/chairman-gated/` — pre-existing file, different path) | **READY, pre-existing** | Live-confirmed clean: 0 of 6 columns present. Classified **TIER-2** by `classifyMigration()` (reason: `unrecognized_or_unsafe_statement: begin` — the leading `BEGIN;`), so despite living in the auto-scanned `database/migrations/` path it defers to the standard 3-factor `@approved-by` chairman gate rather than auto-applying — genuinely protected, not merely by convention. No `@approved-by` stamp present yet. Column types (`timestamptz` for `disposed_at`/`verified_at`, real `duplicate_of_id REFERENCES quick_fixes(id)` FK) are deliberate, documented choices per the file's own header — do not "correct" them to match this table's older `timestamp without time zone` columns. | UP only — rollback is inline as commented-out SQL at the file's own end (lines 93-99), not a separate runnable `_DOWN.sql`; **no acceptance.mjs exists for this file** (open question below) |

**4 of 5 are READY (3 already staged in `database/chairman-gated/`, 1 pre-existing in
`database/migrations/` and independently tier-protected). 1 of 5 (wave-trigger) is file-complete
but must NOT be applied until Wave 0's zero-item state is resolved — flagging this to the
chairman/coordinator as a decision, not silently deferring it.**

## Consumer-cutover census (FR-1)

- **AR DDL** — NOT net-new-with-no-consumers as might be assumed. A full, already-built module
  tree already exists and references these tables: `lib/agent-readiness/{run-registry,sample-writer,
  audit-runner,llm-txt-generator,llm-txt-version-store,prompt-sets,entitlement,diff-harness,
  content-lint,concurrency-limiter}.js` plus `lib/agent-readiness/templates/llm-txt-route.template.ts`
  and `lib/retention/policies.js`. **This migration is currently blocking a fully-built feature**,
  not merely adding unused schema — raises the practical urgency of this file specifically.
- **plan_critiques** — actively read/written TODAY by the LEAD-TO-PLAN pre-plan-critique gate
  (`scripts/modules/handoff/executors/lead-to-plan/gates/pre-plan-critique.js`,
  `lib/eva/devils-advocate.js`, `scripts/critique-override.js`,
  `scripts/critique-catch-rate-monitor.js`) — this exact gate ran against this SD's own PRD during
  this session. The new `metadata`/`content_hash` columns are additive and NULL-safe for all ~241
  pre-migration rows (confirmed independently by database-agent and testing-agent per the file's
  own header) — existing readers are unaffected until application code is updated to populate them.
- **DEFACL** — no app-code "consumer" in the usual sense (catalog-level ALTER DEFAULT PRIVILEGES).
  The relevant "consumer" is every function `CREATE`d in `public` by `postgres`/`supabase_admin`
  going forward; today that inherits anon/authenticated EXECUTE by default. Companion file
  `close_remaining_secdef_execute_exposure.sql` (unlisted, see above) covers the EXISTING-function
  half of the same underlying issue — the two are independent and apply safely in either order.
- **wave-trigger** — consumer is `lib/roadmap/plan-position-check.js` (detection, already live) —
  this migration is the enforcement half. No apply-time consumer risk beyond the Wave-0 precondition
  already called out above.
- **QF-disposition** — sole consumer is `scripts/coordinator-stale-qf-disposition-sweep.mjs`, whose
  `--apply` path currently refuses with `DISPOSITION_COLUMNS_NOT_YET_APPLIED` via its own
  `ensureDispositionColumnsExist()` check. That SD's own `metadata.operational_gate` has been
  corrected (this SD, v2.0.0) to cite the real pre-existing file at `database/migrations/`.

## Run order

No cross-file ordering dependency was found among the 5 batch files themselves. The only ordering
constraint is **within** file 4 (wave-trigger): it must not be applied before Wave 0's data state is
resolved, independent of the other 4 files. DEFACL and the unlisted `close_remaining_secdef_execute_
exposure.sql` (if the coordinator includes it) apply safely in either order per that file's own
header. File 5 (QF-disposition) lives outside `database/chairman-gated/` and is applied via its own
`@approved-by` chairman-gate handshake (see `pending-migrations-check.js`), not via
`scripts/apply-migration.js --allow-any-path` — it is not part of the same physical ceremony batch
as the other 4, only the same logical readiness review. Suggested order for the 4 chairman-gated
files, if applied in one ceremony: **1 (AR DDL) → 2 (plan_critiques) → 3 (DEFACL) → 4 (wave-trigger,
only once Wave 0 is resolved, otherwise held back)**; file 5 (QF-disposition) applies independently
whenever its own `@approved-by` gate clears.

## Operator checklist

For each file: run `--baseline` (or the acceptance script's pre-apply mode) BEFORE apply, apply via
`scripts/apply-migration.js`, then run `--verify` (or the file's own acceptance mode) AFTER apply.
None of these commands should be run by a worker — this checklist is for the chairman-verbal,
Adam-scribed ceremony itself.

**PREREQUISITES, checked empirically (adversarial review, PR #7172 round 3) — the commands below
will fail closed without these, so do them FIRST, not discovered mid-ceremony:**
1. **`@approved-by` stamp**: `checkApproverFactor` (`scripts/lib/migration-guards.js`) requires a
   `-- @approved-by: <email>` line matching the applier's own `git user.email`, present in the file
   BEFORE apply. As of this writing only `plan_critiques` already carries one; `defacl_anon_auth_axis.sql`
   has a bare `-- @approved-by:` placeholder (no email — does not satisfy the check), and AR DDL,
   wave-trigger, and the QF-disposition file have none at all. Adam adds the real stamp only after
   the chairman's verbal approval for that specific file, one file at a time — never pre-stamp.
2. **Commit before apply**: `isMigrationCommittedToGit` (`scripts/apply-migration.js`) refuses any
   file with uncommitted changes, so the `@approved-by` edit must be committed (and, for anything
   in `database/chairman-gated/`, pushed to a branch reachable from the apply environment) before
   the apply command below will even run.
3. **Fresh token per file**: `--issue-token` mints a **single-use, ~1-hour-TTL** token
   (`validateProdDeployGuards`). One token does NOT cover multiple applies — issue and consume a
   new token immediately before each individual apply below, not once at the start of the ceremony.

```
# 1. AR DDL -- after chairman approval, Adam adds/commits @approved-by, THEN:
node database/chairman-gated/20260816_agent_readiness_audit_schema_acceptance.mjs --baseline   # if it supports one; else skip to apply
node scripts/apply-migration.js --issue-token
MIGRATION_APPLY_TOKEN=<fresh token> node scripts/apply-migration.js "database/chairman-gated/20260816_agent_readiness_audit_schema.sql" --prod-deploy --allow-any-path
node database/chairman-gated/20260816_agent_readiness_audit_schema_acceptance.mjs --verify

# 2. plan_critiques -- @approved-by already present (codestreetlabs@gmail.com); confirm the
#    committer applying it is that same identity, or re-stamp for the actual applier.
#    The acceptance script takes no flags (any argument, including --verify, is inert) and its own
#    header says run it BEFORE apply too (expect neither column) as well as after (expect both):
node database/chairman-gated/20260816_plan_critiques_add_metadata_and_content_hash_acceptance.mjs   # BEFORE -- expect neither column
node scripts/apply-migration.js --issue-token
MIGRATION_APPLY_TOKEN=<fresh token> node scripts/apply-migration.js "database/chairman-gated/20260816_plan_critiques_add_metadata_and_content_hash.sql" --prod-deploy --allow-any-path
node database/chairman-gated/20260816_plan_critiques_add_metadata_and_content_hash_acceptance.mjs   # AFTER -- expect both, correctly typed

# 3. DEFACL -- after chairman approval, Adam adds/commits @approved-by, THEN:
node database/chairman-gated/20260816_defacl_anon_auth_axis_acceptance.mjs --self-test   # fixture-only, no DB
node database/chairman-gated/20260816_defacl_anon_auth_axis_acceptance.mjs --hash         # BEFORE
node database/chairman-gated/20260816_defacl_anon_auth_axis_acceptance.mjs --baseline     # BEFORE
node scripts/apply-migration.js --issue-token
MIGRATION_APPLY_TOKEN=<fresh token> node scripts/apply-migration.js "database/chairman-gated/20260816_defacl_anon_auth_axis.sql" --prod-deploy --allow-any-path
node database/chairman-gated/20260816_defacl_anon_auth_axis_acceptance.mjs --hash         # AFTER (must differ)
node database/chairman-gated/20260816_defacl_anon_auth_axis_acceptance.mjs --verify

# 4. QF-disposition (PRE-EXISTING file at database/migrations/, standard @approved-by handshake,
#    NOT the chairman-gated --allow-any-path path -- no acceptance.mjs exists for this one, see
#    open question below) -- after chairman approval, Adam adds/commits @approved-by, THEN:
node scripts/apply-migration.js --issue-token
MIGRATION_APPLY_TOKEN=<fresh token> node scripts/apply-migration.js "database/migrations/20260816_add_quick_fixes_disposition_columns.sql" --prod-deploy
# then manually confirm via information_schema.columns that all 6 columns now exist on quick_fixes

# 5. wave-trigger (HOLD until Wave 0 is resolved) -- after chairman approval, Adam adds/commits
#    @approved-by, THEN:
node database/chairman-gated/20260803_current_wave_must_carry_items_acceptance.mjs --self-test
node database/chairman-gated/20260803_current_wave_must_carry_items_acceptance.mjs --baseline   # exits non-zero AND refuses to imply "safe" if Wave 0 still violates -- DO NOT proceed past a non-zero exit here
node scripts/apply-migration.js --issue-token
MIGRATION_APPLY_TOKEN=<fresh token> node scripts/apply-migration.js "database/chairman-gated/20260803_current_wave_must_carry_items.sql" --prod-deploy --allow-any-path
node database/chairman-gated/20260803_current_wave_must_carry_items_acceptance.mjs --verify   # prints the baseline's age -- re-run --baseline first if it reports over an hour old
```

## Rollback plan (per file, if a rollback is ever needed post-apply)

| File | Rollback |
|---|---|
| AR DDL | `database/chairman-gated/20260816_agent_readiness_audit_schema_DOWN.sql` |
| plan_critiques | `database/chairman-gated/20260816_plan_critiques_add_metadata_and_content_hash_DOWN.sql` |
| DEFACL | `database/chairman-gated/20260816_defacl_anon_auth_axis_DOWN.sql` — verify with `--hash` before/after; after-DOWN must equal before-UP |
| QF-disposition | No separate `_DOWN.sql` — rollback is the commented-out SQL at the end of `database/migrations/20260816_add_quick_fixes_disposition_columns.sql` (lines 93-99), which must be uncommented and run manually |
| wave-trigger | `database/chairman-gated/20260803_current_wave_must_carry_items_DOWN.sql` — not destructive of any row data, only removes enforcement |

## Open decisions for the coordinator / chairman

1. **Wave 0** (file 4): populate its items or move it off `time_horizon=now` before this ceremony
   includes the wave-trigger file — or hold that one file back and ceremony the other 4 now.
2. **The 2 unlisted-but-real files** (`belt_capacity_verdicts_unavailable_sentinel.sql`,
   `close_remaining_secdef_execute_exposure.sql`): fold into ceremony N+1 alongside the ratified 5,
   or defer to a later ceremony. `close_remaining_secdef_execute_exposure.sql` is the more
   time-sensitive of the two (16 live-exposed functions, security-relevant, already flagged
   "ceremony-pending" by its own directory's README).
3. **QF-disposition (file 5)**: should `database/migrations/20260816_add_quick_fixes_disposition_
   columns.sql` be moved into `database/chairman-gated/` for consistency with the other 4 files'
   convention (location-based gating, not just tier-classification-based), and should an
   acceptance.mjs be authored for it (none exists today)? This SD did not do either unilaterally —
   both are judgment calls about an existing, working file authored by a different SD, not gaps
   this SD's own scope covers.

## Signal reference

Coordinator ratification: directive `7ba9741e` (2026-08-17T01:28:49Z), ratifying worker signal
`6e784838`, **partially retracted** by this v2.0.0 correction re: QF-disposition (see the callout
at the top of this document). Correction signaled separately. Readiness-bundle-ready signal to
follow this document's commit.
