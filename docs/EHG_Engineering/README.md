# EHG_Engineering Governance Platform

## Scope & Ownership
- **Domain:** Strategic Directives (SD), Product Requirements (PRD), backlog governance, audit history.
- **Boundary:** Publishes read-only contracts for consumers (e.g., venture app) via `v_eng_*` views. No venture workflow state lives here.
- **Data Flow:**
  1. SDs captured/approved in `strategic_directives_v2`.
  2. PRDs linked through `product_requirements_v2` (`sd_id` UUID).
  3. Backlog execution tracked in `eng_backlog` with QA gates and release links.
  4. Trace exports exposed via `v_eng_trace`, `v_eng_prd_payload_v1`, and `v_eng_backlog_rollup`.

## Database-First Workflow
1. Author migrations under `db/migrations/eng/` (timestamped, reversible).
2. Update contracts under `db/views/eng/` and `db/policies/eng/` to reflect schema changes.
3. Document every schema/view/policy adjustment in `docs/EHG_Engineering/data-contracts/`.
4. Submit PR referencing migration IDs and update `CHANGELOG.md` + `ops/audit/*` entry.

## Two-App Separation
- Writes restricted to governance service (`auth.role() = 'service_role'`).
- Analysts and downstream apps consume read-only views; direct table SELECT requires approval and passes RLS predicates.
- Venture app must only read `v_eng_*` views; no cross-database mutations.

## Traceability Contracts
- **`v_eng_trace`** – canonical SD ↔ PRD ↔ backlog ↔ commit mapping.
- **`v_eng_prd_payload_v1`** – PRD export with acceptance criteria JSON for downstream automation.
- **`v_eng_backlog_rollup`** – backlog QA gate + readiness info.

## Compliance Checklist
- [ ] Migration includes `BEGIN/COMMIT` and down path.
- [ ] RLS enabled + fail-closed before exposing new tables.
- [ ] CHANGELOG entry references migration IDs.
- [ ] Audit report filed under `ops/audit/` for each housekeeping run.

## Operations Runbook
- **Apply migrations (staging):** `bash ops/scripts/staging_apply.sh`
- **Verification suite:** `bash ops/scripts/run_checks.sh`
- **Governance backfill:** populate `ops/backfill/eng_owner_map.csv`, then `bash ops/scripts/run_backfills.sh`
- **Audit report:** append results to `ops/audit/YYYY-MM-DD.md` after every run.

## SLAs & Ownership
- **Governance metadata owner:** Head of Product Governance (weekly review of `owner`/`decision_log_ref` coverage).
- **Staging refresh cadence:** weekly or before major PR merges.
- **CI enforcement:** `DB Verify` workflow must stay green before merge.
