---
Category: Reference
Status: Approved
Version: 1.0.0
Author: SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001
Last Updated: 2026-08-16
Tags: security, postgresql, security-definer, execute-grant, rls-adjacent
---

# SECURITY DEFINER EXECUTE exposure: what it is, how this repo closes it, and what's still open

## The exposure class

A `SECURITY DEFINER` function runs with the privileges of its owner (typically `postgres`),
not the caller's role. If `EXECUTE` on that function is available to `PUBLIC`, `anon`, or
`authenticated`, any caller — including an unauthenticated one — can invoke owner-privileged
logic. This is a distinct exposure from RLS: RLS governs row visibility inside a query;
`SECURITY DEFINER` + a permissive `EXECUTE` grant governs whether an unprivileged caller can
run privileged code at all, and RLS on the underlying tables does not protect against it (the
function runs as the owner, so table-level RLS may not even apply).

The recurring root cause in this codebase: `CREATE [OR REPLACE] FUNCTION ... SECURITY DEFINER`
statements historically shipped with **no accompanying `REVOKE`**, so the function inherited
whatever the default ACL granted — which, in this database's actual live state, is
`PUBLIC`-executable by default (see "The default-ACL finding" below).

## What SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001 closed

A live audit found 16 residual `SECURITY DEFINER` functions with unintended `anon`/`PUBLIC`
`EXECUTE`. The fix migration
(`database/chairman-gated/20260816_close_remaining_secdef_execute_exposure.sql`, staged —
chairman-gated, requires the 3-factor `apply-migration.js --prod-deploy` ceremony to actually
apply) closes them in two buckets:

- **Bucket A** (6 functions): `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated`, `GRANT ...
  TO service_role` only. No legitimate caller needs these outside privileged backend code.
- **Bucket B** (10 functions): `REVOKE EXECUTE ... FROM PUBLIC, anon`, with `authenticated`
  explicitly re-granted. These are genuinely used by logged-in users, just never needed
  anonymous/public access.
- **Bucket C** (11 functions, deliberately untouched): anon-facing-policy-backed or
  genuinely-external-integration functions (e.g. an inbound webhook receiver) where revoking
  would break real functionality. Excluding these correctly is itself a verified acceptance
  criterion — the migration asserts byte-identical ACL state for all 11 in-transaction.

A drift-check pattern worth reusing: **use `has_function_privilege(role, oid, 'EXECUTE')` and
`IS DISTINCT FROM`, never a bare `<>` or a text/`ILIKE` match against `pg_proc.proacl`.**
`<>` returns `NULL` (not `TRUE`) when either side is `NULL` — and `proacl` legitimately becomes
`NULL` when the ACL exactly equals `acldefault()`, a real, silent state. A naive `<>`
comparison never fires in that case. Separately, `PUBLIC` renders in `proacl`'s text form as
the *empty-grantee* token (`=X/postgres`), not the literal string `PUBLIC` — a text/`ILIKE`
match for the word `PUBLIC` matches **zero** real PUBLIC grants in this database (verified
live: 0/19 matches against functions that actually carried a PUBLIC grant).

## Recurrence prevention (what's live)

`scripts/lint/secdef-execute-revoke-lint.mjs`, wired as `npm run lint:secdef-execute-revoke`
and blocking in CI via `.github/workflows/secdef-execute-revoke-lint.yml`. It requires: every
new `CREATE ... SECURITY DEFINER` function have a same-file `REVOKE` that explicitly names
`PUBLIC` (omitting `PUBLIC` from a `REVOKE ... FROM anon, authenticated` is a no-op — `anon`
and `authenticated` inherit `PUBLIC`'s grant, so the "fix" changes nothing), **and** that
`anon`/`authenticated` are either revoked in that same list or explicitly re-granted later in
the file (a direct role grant, e.g. `GRANT EXECUTE ... TO anon`, cannot be undone by revoking
`PUBLIC` alone — a lint that only checked for a `PUBLIC` mention would pass a function that's
still directly `anon`-executable).

Diff-mode scope note: the lint's `--diff` mode uses `--diff-filter=AR` (Added/Renamed only) —
**not** `ACMR`. A `Modified`-inclusive filter would re-scan the *whole file* on any edit,
meaning a one-line comment change to an old migration with a pre-existing, unrelated SECDEF
finding would block that PR on a violation it didn't introduce. `--all` mode (full-corpus
sweep) exists separately and is advisory-only, precisely because the pre-existing backlog
(hundreds of legacy findings) must never block an unrelated PR.

`scripts/audit-rpc-execute-grants.mjs` was extended with anon/PUBLIC-axis assertions and a
manifest-based completeness gate (`scripts/audit-rpc-execute-grants-buckets.json`) that fails
if any live anon-executable `SECURITY DEFINER` function is undeclared. **This completeness
check is currently a manual npm script only — it is not wired into CI or a scheduled job.**
Treat it as detective, not preventive, until that follow-up lands.

## The default-ACL finding (open, not closed by this SD)

This SD attempted a third control — `ALTER DEFAULT PRIVILEGES ... REVOKE EXECUTE ON FUNCTIONS
FROM PUBLIC, anon` — so future `CREATE SECURITY DEFINER` functions would never need the
per-function `REVOKE` at all. **This was descoped after three independent, evidence-targeted
fix attempts all failed identically** against the real CI Postgres environment.

The root cause, confirmed by independent live-production re-measurement (not a CI-fixture
artifact — an earlier hypothesis to that effect was explicitly retracted after measurement):
**this database's default ACL currently grants `PUBLIC` execute by default**, and this is
active and ongoing — 636 of 759 (84%) of all public-schema functions, and 19 of 139 (13.7%) of
`SECURITY DEFINER` functions specifically, are currently `PUBLIC`-executable, with new
functions continuing to arrive that way. Critically, the `pg_default_acl` row for
`(postgres, public, functions)` **already carries zero `PUBLIC` entries** — so the leak is not
coming from an ineffective `ALTER DEFAULT PRIVILEGES` statement at all. It enters **downstream**
of the default-ACL mechanism, by a mechanism not yet identified.

A concrete, unverified lead for whoever picks this up:
`database/migrations/20260603_03_revoke_secdef_execute_from_anon_authenticated_rollback.sql:19`
contains a blanket `GRANT EXECUTE ON FUNCTION public.%I(%s) TO anon, authenticated, PUBLIC`
loop over every `SECURITY DEFINER` function in `public` — the only file in this repo observed
granting a function `TO PUBLIC` at all, and itself a live instance of the "over-granting
rollback" defect class this SD's own rollback file was independently corrected for (see that
migration's paired rollback header).

**Recommended approach for the follow-up investigation**: a dedicated, minimal harness — one
`ALTER DEFAULT PRIVILEGES` statement, one `CREATE FUNCTION`, read `pg_proc.proacl` directly —
isolated from any shared multi-function stub container. This SD's own DDL test suite shares a
27-function stub schema across all its tests, which made isolating the default-ACL mechanism
from unrelated stub setup difficult during this investigation.

## See also

- `database/chairman-gated/20260816_close_remaining_secdef_execute_exposure.sql` — full
  migration header with the complete investigation trail and exact live measurements.
- `product_requirements_v2` (`PRD-SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001`),
  `functional_requirements[FR-4].status = 'descoped'` and `metadata.fr4_descope` — the formal
  descope record, routed through the standard PLAN-TO-LEAD/LEAD-FINAL-APPROVAL gates rather
  than a separate out-of-band sign-off.
- `retrospectives` row for this SD (`retro_type='SD_COMPLETION'`) — the full narrative,
  including the multi-agent adversarial review pattern that surfaced and fixed several
  independent defects (a rollback over-grant, two lint bypasses, a `--diff-filter` bug that
  would have re-swept modified legacy files) before merge.
