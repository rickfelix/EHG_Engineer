<!-- Archived from: docs/plans/sd-man-infra-ehg-supabase-migration-ci-plan.md -->
<!-- SD Key: SD-LEO-INFRA-EHG-REPO-ADD-001 -->
<!-- Archived at: 2026-04-28T16:06:59.375Z -->

# EHG repo: add `supabase db push` CI workflow + backfill 20260427 migration drift

## Type

infrastructure

## Priority

high

## Target Application

EHG (`.github/workflows/`, `supabase/migrations/`, live DB project `dedlbzhpgkmetvhbkyzq`, `supabase_migrations.schema_migrations` ledger)

## Summary

The EHG repo has CI workflows for typecheck, stage-contract-drift, and stage-contract-lint, but **no CI step that applies Supabase migrations on merge to `main`**. Every Supabase migration in `supabase/migrations/` lands via out-of-band manual `psql` apply (or fails to land at all), and `supabase_migrations.schema_migrations` is never updated to reflect what's applied. This has produced four documented drift incidents in a single day (2026-04-27):

**Concrete evidence:**

1. **PR #536 column unapplied for 5 hours** — `chairman_decisions.approval_type` column was added in PR #536 (merged 2026-04-27T14:54Z) but the live DB returned `column does not exist` for 5h. Caused EXEC pre-flight failure for `SD-EHG-AI-GEN-GUARDRAILS-001` (FR-7 types regen + FR-6 audit-trail integration both blocked).
2. **`supabase_migrations.schema_migrations` ledger has zero `20260427_*` entries** despite multiple migrations existing in `supabase/migrations/`. Every product session that checks "is migration X applied?" gets the wrong answer.
3. **`chairman_unified_decisions` view PR #536 Part 5 deferred** — the migration's Part 5 was a view rewrite that drops the `escalation` branch (live: 4 branches incl. agent_messages-driven escalation; PR #536: 3 branches with venture_decision shape + new approval_type). Downstream consumers reading `details->>'approval_type'` from the view get NULL because live view's chairman_approval branch lacks the column.
4. **Migration `20260427000002_revert_decided_by_user_id` never applied** — siblings 000001/000003/000004 did apply, but 000002 was skipped. `decided_by_user_id` column still present + functions reference it.

**Existing CI confirms the gap is migration-deploy specifically:**
EHG `main` has `.github/workflows/typecheck.yml`, `stage-contract-drift.yml`, `stage-contract-lint.yml` — no supabase-deploy workflow.

## Depends On

None. Self-contained CI fix + 3 remediation migrations.

## Files

| Path | Action | Purpose |
|------|--------|---------|
| `ehg/.github/workflows/supabase-deploy.yml` | CREATE | Workflow to run `supabase db push` on push-to-main |
| `ehg/docs/operations/supabase-deploy-secrets.md` | CREATE | Operator runbook for GH Secrets |
| `ehg/supabase/migrations/20260427_002_restore_chairman_unified_decisions_escalation_branch.sql` | CREATE | Backfill: restore view with 4 branches + approval_type |
| `ehg/scripts/check-migration-ledger-drift.cjs` | CREATE | Drift detection between schema_migrations and migrations dir |
| `ehg/supabase/migrations/20260427000002_revert_decided_by_user_id.sql` | APPLY | Backfill: apply existing migration to live DB |

## Success Criteria

- **AC1**: New file `.github/workflows/supabase-deploy.yml` exists on EHG `main` and triggers on push-to-main with path filter `supabase/migrations/**`.
- **AC2**: Workflow successfully runs `supabase db push --include-all` against the live DB project (`dedlbzhpgkmetvhbkyzq`) using GH Secrets.
- **AC3**: `supabase_migrations.schema_migrations` ledger contains all 20260427_* entries (at least 4: 000001, 000002, 000003, 000004 + 20260427_001) after first successful run.
- **AC4**: `chairman_unified_decisions` view has the `escalation` branch restored (4 branches matching live, not 3 from PR #536) AND includes the `approval_type` field on the chairman_approval branch.
- **AC5**: Migration `20260427000002_revert_decided_by_user_id` is applied; `decided_by_user_id` column dropped from `chairman_decisions`; functions referencing it updated.
- **AC6**: A small drift check (CI step or nightly cron) compares `supabase_migrations.schema_migrations` against `git ls-files supabase/migrations/` and surfaces drift as a soft warning.
- **AC7**: PR description includes the operator-action runbook for adding `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF` GH Secrets.
- **AC8**: Idempotent: re-running on a fresh push with no new migrations is a no-op (no errors, no schema changes).

## Scope

### FR1 — `.github/workflows/supabase-deploy.yml` in EHG repo

- `on: push: branches: [main]` with `paths: ['supabase/migrations/**']`
- Steps: checkout → `supabase/setup-cli@v1` → `supabase link --project-ref ${{ secrets.SUPABASE_PROJECT_REF }}` → `supabase db push --include-all`
- Concurrency control: `group: supabase-deploy` to serialize runs
- Permissions: minimal (read contents only)

### FR2 — Operator runbook for GH Secrets

PR description AND `ehg/docs/operations/supabase-deploy-secrets.md`:

- `SUPABASE_ACCESS_TOKEN`: PAT from https://supabase.com/dashboard/account/tokens
- `SUPABASE_DB_PASSWORD`: project DB settings
- `SUPABASE_PROJECT_REF`: `dedlbzhpgkmetvhbkyzq`

### FR3 — Backfill: `chairman_unified_decisions` view restoration

Author `supabase/migrations/20260427_002_restore_chairman_unified_decisions_escalation_branch.sql` that re-creates the view with all 4 branches (chairman_approval, venture_decision, escalation, agent_messages) AND the new `approval_type` field on the chairman_approval branch.

### FR4 — Backfill: apply `20260427000002_revert_decided_by_user_id`

Apply existing migration to live DB via database-agent. Drops `decided_by_user_id` column; updates referencing functions. Updates `schema_migrations` ledger.

### FR5 — Ledger reconciliation

After FR3 + FR4 + first CI run, verify `supabase_migrations.schema_migrations` contains all 20260427_* entries. Audit log entry on completion.

### FR6 — Drift detection script

`ehg/scripts/check-migration-ledger-drift.cjs` diffs `supabase_migrations.schema_migrations` vs `git ls-files supabase/migrations/`. Wired into CI as non-blocking warning.

## Non-Goals

- `supabase db lint` / migration linting (separate SD if needed)
- Rollback automation (manual)
- Cross-environment promotion (single live env)
- Per-PR migration preview / dry-run
- Pre-merge migration policy (sub-agent review of every migration)

## Key Technical Decisions

- **`supabase db push --include-all` over `supabase migration up`** — `db push` reconciles fully against project schema. Safer for a repo with prior drift.
- **Path-filter only on `supabase/migrations/**`** — workflow shouldn't run on every main push.
- **Concurrency control `supabase-deploy`** — prevents race if two PRs land back-to-back.
- **Operator-action for secrets vs auto-provisioning** — GH org secret access is operator-only.

## Supporting Evidence

- `docs/harness-backlog.md` items 9-12 (all 2026-04-27)
- Live DB project: `dedlbzhpgkmetvhbkyzq`
- EHG repo CI: `.github/workflows/{typecheck,stage-contract-drift,stage-contract-lint}.yml` — no supabase-deploy.yml
- Memory: `project_sd_qf_822_npm_install_guard_completed.md` (concurrent npm install pattern is sibling concern)

## Risks

- **Live-DB blast radius (HIGH)**: backfill migrations modify production schema. Mitigation: each backfill is reviewed by database-agent + operator before apply; transaction-wrapped.
- **Secrets exposure**: GH Secrets encrypted at rest; documented runbook only.
- **Idempotency failure on first run**: possible if existing schema has untracked drift. Mitigation: dry-run first locally with `supabase db diff`; reconcile via FR5.
- **CI cost**: minimal (path-filtered).

## Estimated Scope

- Workflow YAML: ~40-60 LOC
- FR3 view restoration migration: ~30-50 LOC SQL
- FR4 backfill apply: 0 new LOC, just apply
- FR5 reconciliation: 0 new LOC, query + audit
- FR6 drift detection: ~30-50 LOC JS
- Operator runbook: ~50 LOC markdown
- **Total: ~150-200 LOC**. Tier 3 SD (infrastructure + migration keywords).
