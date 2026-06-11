<!-- Archived from: C:/Users/rickf/.claude/plans/claim-sd-terminal-status-guard.md -->
<!-- SD Key: SD-LEO-FIX-CLAIM-RPC-TERMINAL-001 -->
<!-- Archived at: 2026-06-09T11:32:06.807Z -->

# Plan: claim_sd RPC terminal-status guard — reject claiming completed/cancelled/deferred SDs (PAT-OPTIMISTIC-RPC residual)

## Priority
high

## Goal

Add a TERMINAL-STATUS guard to the fleet-critical `claim_sd` Postgres RPC so it refuses to claim a Strategic Directive (or quick fix) whose status is already terminal — `completed`, `cancelled`, or `deferred` — instead of optimistically claiming it and stomping `claiming_session_id`. This is the next guard in the PAT-OPTIMISTIC-RPC family, orthogonal to the existing `sd_not_found` existence guard.

## Summary

A worker (Alpha, session 82a8f30e) signalled a HIGH-severity HARNESS-BUG at 11:19. The dispatch/assignment path surfaced TERMINAL-status SDs and within 2 ticks `claim_sd` claimed them:

1. **COMPLETED** `SD-LEO-INFRA-HARDEN-LEO-HANDOFF-001` (PRs #4410 + #4431 merged ~11:04–11:12). `claim_sd` CLAIMED it with NO terminal-status guard, stomping `claiming_session_id`. The worker had to verify the SD was already merged and release the claim manually.
2. **CANCELLED** `SD-LEO-FIX-GRANT-EXECUTE-GET-001`. The downstream `is_working_on` trigger blocked the write, but `claim_sd` still optimistically attempted the claim and retried on every tick.

A contributing trigger was a stale coordinator `WORK_ASSIGNMENT` pointing at HARDEN that went stale when HARDEN completed mid-flight (a stale-assignment race: an `in_progress` assignment target reaches a terminal status before the worker acts).

The completed `SD-FDBK-FIX-CLAIM-RPC-VALIDATE-001` already added the `sd_not_found` existence guard to `claim_sd`. This SD adds the ORTHOGONAL terminal-status guard. The two guards do not overlap — existence vs. lifecycle-state.

## Dedup

Confirmed against `strategic_directives_v2`:

- `SD-FDBK-FIX-CLAIM-RPC-VALIDATE-001` (status=completed) added ONLY the `sd_not_found` existence guard. It does NOT cover terminal status. This SD is the next, orthogonal guard in the same family.
- No OPEN (draft/active/in_progress) SD covers the terminal-status guard. This SD does NOT duplicate any existing work.
- Also relates to the broader PAT-OPTIMISTIC-RPC sweep (release_sd / assignment RPCs may share the missing-guard class) — tracked separately, not duplicated here.

## Functional Requirements

- **FR-1**: `claim_sd` RPC adds a TERMINAL-STATUS guard. When the target SD status is in `('completed','cancelled','deferred')`, `claim_sd` returns a clear failure (e.g. `{success:false, reason:'sd_terminal_status', status:<status>}`) instead of optimistically claiming and stomping `claiming_session_id`. Mirror the existing `sd_not_found` guard pattern added by the completed `SD-FDBK-FIX-CLAIM-RPC-VALIDATE-001`, and mirror the `is_working_on` trigger's terminal-status logic.
- **FR-2**: The coordinator dispatch/assignment path (`claim_sd` assignment plus any `WORK_ASSIGNMENT` generation) must not surface or act on terminal-status SDs. Stale `WORK_ASSIGNMENT` rows whose `target_sd` has gone terminal should be ignored or purged. This defends against the stale-assignment race where an `in_progress` target completes before the worker acts.
- **FR-3**: Apply via a `CREATE OR REPLACE` migration generated from the authoritative latest `claim_sd` defining migration. CRLF-normalize the source (`.sql` files are CRLF; naive `\n`-split breaks anchors), extract the `CREATE ... $function$;` body, exact-string-replace to insert the guard, and use `CREATE OR REPLACE` so grants are preserved. A DATABASE sub-agent must confirm live `pg_proc.prosrc` is byte-identical to the migration AND run a regression suite (claim a normal SD = success; claim a completed/cancelled/deferred SD = guarded failure) BEFORE and AFTER deploy.
- **FR-4**: Tests — `claim_sd` on a `draft`/`active` SD returns success; on `completed`/`cancelled`/`deferred` returns rejected with `sd_terminal_status`; no regression to the existing `sd_not_found` guard.

## Success Criteria

- [ ] claim_sd rejects claiming a `completed` SD with `{success:false, reason:'sd_terminal_status'}`
- [ ] claim_sd rejects claiming a `cancelled` SD with the same guarded failure
- [ ] claim_sd rejects claiming a `deferred` SD with the same guarded failure
- [ ] claim_sd on a `draft` or `active` SD still succeeds (no regression)
- [ ] The existing `sd_not_found` existence guard still fires for non-existent ids (no regression)
- [ ] Coordinator dispatch / WORK_ASSIGNMENT path does not surface or act on terminal-status SDs; stale assignments whose target went terminal are ignored or purged
- [ ] Migration is a `CREATE OR REPLACE` generated from the authoritative latest claim_sd migration (CRLF-normalized, exact-string-replace, grants preserved)
- [ ] DATABASE sub-agent confirms live `pg_proc.prosrc` is byte-identical to the migration AND regression suite passes BEFORE and AFTER deploy
- [ ] Tests cover draft/active success + completed/cancelled/deferred rejection + sd_not_found non-regression

## Scope

| path | ACTION |
| --- | --- |
| database/migrations/<new>_claim_sd_terminal_status_guard.sql | CREATE — CREATE OR REPLACE migration adding the terminal-status guard to claim_sd, generated from the authoritative latest claim_sd defining migration |
| coordinator dispatch / WORK_ASSIGNMENT generation path | MODIFY — exclude terminal-status SDs; ignore/purge stale assignments whose target went terminal |
| tests for claim_sd terminal-status guard | CREATE — draft/active success, completed/cancelled/deferred rejection, sd_not_found non-regression |

**In scope**: the terminal-status guard inside `claim_sd`; the dispatch/assignment exclusion + stale-assignment purge; the migration; the regression + unit tests.

**Out of scope**: the broader PAT-OPTIMISTIC-RPC sweep across `release_sd` and other assignment RPCs (tracked separately); the `is_working_on` trigger itself (reused as the reference logic, not modified); any schema/column changes (function body only).

## Risks

- **Risk**: `claim_sd` is fleet-critical — every worker claim path depends on it. A malformed `CREATE OR REPLACE` could break all claims fleet-wide. **Mitigation**: generate the migration programmatically from the authoritative latest defining migration with exact-string-replace; DATABASE sub-agent confirms live `pg_proc.prosrc` is byte-identical and runs the regression suite BEFORE and AFTER deploy.
- **Risk**: CRLF handling — `.sql` files are CRLF; a naive `\n`-split breaks function anchors and produces a corrupt body. **Mitigation**: CRLF-normalize before extracting and replacing the `CREATE ... $function$;` body, per the proven recipe from `SD-FDBK-FIX-CLAIM-RPC-VALIDATE-001`.
- **Risk**: `CREATE OR REPLACE` could drop EXECUTE grants if the function signature changes. **Mitigation**: preserve the exact signature; `CREATE OR REPLACE` (not `DROP` + `CREATE`) keeps grants; verify grants post-deploy.
- **Risk**: Over-broad terminal set could block legitimate re-claims of resumable SDs. **Mitigation**: restrict the guard to exactly `completed`, `cancelled`, `deferred`; mirror the `is_working_on` trigger's terminal-status definition; do not include `draft`/`active`/`in_progress`.
- **Risk**: Stale `WORK_ASSIGNMENT` purge could delete still-valid assignments in a race. **Mitigation**: only ignore/purge assignments whose `target_sd` is confirmed terminal at read time; idempotent and reversible.
