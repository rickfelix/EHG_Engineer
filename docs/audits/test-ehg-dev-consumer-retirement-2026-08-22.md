---
Category: Report
Status: Approved
Version: 1.0.0
Author: rickfelix
Last Updated: 2026-08-22
Tags: [audit, security, authz, decision-record]
---

# test@ehg.dev Consumer Retirement — Evidence Record

**SD:** SD-LEO-FIX-IDENTIFY-RETIRE-TEST-001 (escalated from QF-20260731-792)
**Date:** 2026-08-22
**Decision unblocked:** chairman decision `d11b99a0` (SMS reply 'A', 2026-07-31 07:40 ET) — HELD pending this consumer check
**Account:** `test@ehg.dev`, `auth.users.id = 48d7ec58-faf9-4772-ba72-fb0c2fb297da`, created 2025-12-01T20:33:21Z

## Summary

Decision `d11b99a0` approved deleting `test@ehg.dev`, held on a consumer check. This document records
that investigation, independently re-verified twice (validation-agent, risk-agent), and its conclusion:
**no live consumer blocks the deletion.** One residual risk was found and closed as part of this SD: the
staged-but-unapplied `20260716_a/_b/_c` migration trio remained a live one-command path to reverse an
already-shipped chairman-approved privilege fix — it is now hard-guarded (see the three migration files
and `docs/audits/fn-is-chairman-authz-audit.md`, both corrected by this same SD).

## Consumer 1 — `fn_is_chairman()` authz backfill dependency

The account's `raw_user_meta_data.role='owner'` was proposed for backfill into `raw_app_meta_data`
by `database/migrations/20260716_a_backfill_chairman_app_metadata.sql:1` ("to preserve the status quo",
per `docs/audits/fn-is-chairman-authz-audit.md`, pre-correction). That backfill was **staged but never
applied** (zero rows in `schema_migrations_applied` for that path).

**Disposition: RESOLVED, not a live consumer.** The dependency this account represented is independently
closed by the completed `SD-LEO-FIX-CHAIRMAN-PRIVILEGE-FROM-WRITABLE-METADATA-001`
(`database/migrations/20260731_fix_chairman_privilege_app_metadata.sql:2`, `@approved-by:
codestreetlabs@gmail.com`), which flips `fn_is_chairman()` and `is_chairman_role()` to read only
`raw_app_meta_data` — verified live via `pg_get_functiondef`. `test@ehg.dev`'s `raw_app_meta_data.role`
is absent (never backfilled), so it resolves `fn_is_chairman() = FALSE`. The migration's own header
(`database/migrations/20260731_fix_chairman_privilege_app_metadata.sql:26`) states this is intentional:
the account losing privilege is "already slated for deletion... losing its privilege is the INTENT here."

**Residual risk found and closed by this SD:** the staged trio remained a live one-command path to
*reverse* the 20260731 fix — applying `_a_` would copy `role='owner'` into `raw_app_meta_data`, re-granting
privilege across **29 RLS policies + 22 functions** (`database/migrations/20260731_fix_chairman_privilege_app_metadata.sql:16`)
to the account approved for deletion. All three files (`20260716_a`, `_b`, `_c`) now carry a hard
`RAISE EXCEPTION` guard making them permanently unrunnable, and `docs/audits/fn-is-chairman-authz-audit.md`
no longer instructs applying them.

## Consumer 2 — the 2026-07-26T11:29Z sign-in

Live `auth.sessions`/`auth.audit_log_entries` query: 5 sessions total for this account, ever, all
`user_agent="node"` from IP `108.24.1.103` — never a browser. A tight cluster on 2026-07-26
(`user_recovery_requested` → `login` pairs at 00:51:22, 01:11:47, 11:26:13, 11:29:37 — the last matches
the task's cited sign-in), each login preceded by a password-recovery request seconds earlier. Zero
sessions since.

**Ruled out — QF-20260726-423** ("add-session"/scoped-credential flow): its full body concerns the
fleet-ui `server/public/fleet-ui/fleet-panel.js` "Add-session" button 401ing against
`/api/fleet-actions/*`, and a tree-currency spawn guard — zero mentions of `test@ehg.dev` or any auth
identity. It escalated to `SD-LEO-FIX-UNOWNED-PARENT-SLICE-001` (completed 2026-07-31), an unrelated
fleet-panel architecture change.

**Ruled out — test-suite fixture:** `tests/`, `e2e/`, and all Playwright/Vitest configs contain zero
references to `test@ehg.dev`. `.env.test` sets `TEST_USER_EMAIL=rickfelix2000@gmail.com`.

**Disposition: HISTORICAL, not a live/ongoing consumer.** Best-evidence hypothesis: a one-off
diagnostic/PoC script (never committed to the repo) exercising the account's password-recovery flow,
consistent with the same-day chairman briefing on the "buyable NXDOMAIN domain + pre-confirmed email =
free authenticated session" exposure this account itself embodied. No cron, GitHub Actions workflow, or
committed script reproduces this pattern today. Stated as a best-evidence hypothesis, not a certainty —
see "Residual risks not eliminated" below.

## Consumer 3 — full-codebase literal-string references

11 files in the repo contain the literal string `test@ehg.dev`, all documentation, decision-record
scratchpad scripts, or session-state notes — zero runtime/production code paths. (`docs/audits/fn-is-chairman-authz-audit.md`,
`scripts/one-off/provision-stage-zero-service-principal.mjs:9` (comment only),
`scripts/one-off/_security-evidence-sd-leo-fix-extract-sec-out-001.mjs:39` (comment, explicitly notes no
shared code path), several `scratchpad/*.cjs` one-off decision-transcription scripts, and 2
`.claude/adam-session-state-*.md` notes.)

**Disposition: no retirement action needed.**

## Consumer 4 — database foreign-key references

**Scope note:** zero rows across the **25 public-schema columns** with an FK to `auth.users(id)`
(`chairman_decisions.decided_by_user_id`, `chairman_directives.issued_by`, `stage_zero_requests.requested_by`,
`ventures_kill_log.killed_by_user_id`, `venture_asset_registry.created_by`, `user_company_access.*`, and
19 others — all queried live for `48d7ec58-faf9-4772-ba72-fb0c2fb297da`, zero matches in every column).
This account has never created, owned, or been attributed on any application data row.

**Additionally present (not a blocker):** 6 rows in **auth-internal** tables — `auth.identities`=1,
`auth.sessions`=5, `auth.refresh_tokens`=5 — all `ON DELETE CASCADE`, removed automatically by
`supabase.auth.admin.deleteUser()`. Stated explicitly here so the "zero consumers" claim is scoped
precisely rather than an unqualified "zero everywhere."

**Two non-cascade FKs checked specifically** (`public.chairman_decisions`, `public.chairman_directives`,
both `NO ACTION`): zero rows for this account in either — affirmative evidence the delete will not be
blocked by a constraint violation.

**Disposition: no retirement action needed.**

## Decision `d11b99a0` — both parts

The decision record (`public.feedback` id `d11b99a0-1f68-4c5f-a250-1f53d736c4db`) approves two deletions:

1. **`svc-stage-zero-invoker@ehg.dev`** — unconditional, never held. Live `auth.users` has no row at that
   address; a re-provisioned `svc-stage-zero-invoker@execholdings.ai` exists (created 2026-08-05),
   indicating part 1 was executed and the service re-provisioned onto a registered domain.
2. **`test@ehg.dev`** — held pending this consumer check (the subject of this document and this SD).

Both halves of the decision are now accounted for.

## Residual risks not eliminated (disclosed, not asserted away)

- **External-system consumer:** this census covers this repo and this Supabase project only. An
  external system consuming this account would not be caught. Flagged for the chairman to weigh before
  executing the delete, not asserted as impossible.
- **`retention_archive.row_data`/`archived_by` columns:** timed out during the FK census and were never
  measured (disclosed by risk-agent, sub_agent_execution_results id `206960a0-7daa-4e1b-8546-9caa0bd2bbf0`).
- **07-26 sign-in source:** stated as a best-evidence hypothesis (dormant 27 days as of this writing), not
  a certainty.

## Chairman-executable delete command

```
supabase.auth.admin.deleteUser("48d7ec58-faf9-4772-ba72-fb0c2fb297da")
```

Cascades: 1 `auth.identities` row, 5 `auth.sessions` rows, 5 `auth.refresh_tokens` rows. No non-cascade
FK blocks the delete. **Execution is chairman-reserved** — no worker on this SD executes it; this
document and the accompanying chairman directive deliver the evidence and the ready-to-run command only.

## Evidence trail

- Explore agent investigation, 2026-08-22, session `0a9b54ba-830f-4424-ac74-ac71098375a7`
- validation-agent independent re-verification: `sub_agent_execution_results` id `ae7ef16c-f3dc-4d0f-9075-8e92527953c0`
- risk-agent independent re-verification (found the migration-guard residual risk, corrected the
  RLS-only 31/25 blast-radius figure to 29 policies/22 functions, disclosed the `retention_archive` gap):
  `sub_agent_execution_results` id `206960a0-7daa-4e1b-8546-9caa0bd2bbf0`
- testing-agent prospective EXEC-safety check (confirmed no test/CI content-pin on the guarded files;
  found the `-- requires-chairman-apply` marker must be preserved and the files must be edited in place,
  not renamed): `sub_agent_execution_results` id `e759ac5d-be7b-447c-8505-61ec49c544e9`
