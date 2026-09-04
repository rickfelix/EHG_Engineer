---
Category: Reference
Status: Approved
Version: 1.1.0
Author: SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001, SD-LEO-SEC-DEFACL-ANON-AUTH-AXIS-001
Last Updated: 2026-08-16
Tags: security, postgresql, security-definer, execute-grant, rls-adjacent, default-privileges
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

## The default-ACL finding — anon/authenticated axis: CLOSED (staged, ceremony-pending)

SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001 attempted a control on the **PUBLIC axis** —
`ALTER DEFAULT PRIVILEGES ... REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon` — so future
`CREATE SECURITY DEFINER` functions would never need the per-function `REVOKE` at all. That
was descoped after three independent, evidence-targeted fix attempts all failed identically:
live re-measurement showed the `pg_default_acl` row for `(postgres, public, functions)`
**already carries zero `PUBLIC` entries**, so a PUBLIC-axis REVOKE was removing a grant that
was never there — a wrong-axis fix, not an ineffective one.

**SD-LEO-SEC-DEFACL-ANON-AUTH-AXIS-001 identified and closed the actual axis.** Live
measurement (`scripts/one-off/verify-defacl-anon-auth-axis-mechanism-001.mjs`) found the same
`pg_default_acl` row grants `EXECUTE` to `anon` and `authenticated` **BY NAME** — explicit
grantees, not inherited from `PUBLIC` — for both roles that mint functions in `public`
(`postgres`, `supabase_admin`). This is why the PUBLIC-only fix above was a structural no-op:
the leak was never on the PUBLIC axis at all.

**Fix**: `database/chairman-gated/20260816_defacl_anon_auth_axis.sql` (+ paired `_DOWN.sql`) —
per-role `ALTER DEFAULT PRIVILEGES FOR ROLE <role> IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS
FROM anon, authenticated, PUBLIC` for both `postgres` and `supabase_admin`. **Staged,
chairman-gated, not yet applied** — closes the recurrence engine (new functions no longer
inherit `anon`/`authenticated` `EXECUTE` by default) once a chairman runs the ceremony.

**Critical distinction, easy to get wrong (caught by a prospective TESTING sub-agent review
before this SD's PRD was even finalized)**: `ALTER DEFAULT PRIVILEGES` is **future-scoped
only**. It does nothing to the 145 functions that already exist in `public` today — those are a
**separate mechanism** (explicit per-function grants), closed independently by the Bucket A/B
work above. A migration or acceptance script that conflates the two — e.g. asserting the
existing-function exposure count changed as proof the default-ACL fix worked — is measuring the
wrong thing. The two must be proven independently (see the acceptance script's AXIS-1/AXIS-2
split, linked below).

**A DOWN-migration correctness trap, worth reusing as a checklist item**: a first draft of the
DOWN file re-granted `PUBLIC` symmetrically with the UP file's `REVOKE ... FROM anon,
authenticated, PUBLIC` — but the live pre-apply baseline never had a `PUBLIC` default grant in
the first place (same finding as above). Re-granting it in DOWN would have left post-rollback
state **broader** than the true pre-apply baseline. Caught by SECURITY sub-agent review, not by
any automated check, because a diff-based reviewer sees UP and DOWN as symmetric by
construction and doesn't re-verify the DOWN grantee list against the *measured* baseline rather
than the UP statement it's inverting. Fixed, and mechanized going forward via the acceptance
script's `--hash` mode (fingerprints `pg_default_acl` state before-UP/after-UP/after-DOWN, so
this exact defect class fails a check instead of requiring a human to notice it again).

## The PUBLIC-axis / downstream `public_exec=true` finding — STILL OPEN, NOT closed by either SD

The blanket `public_exec=true` leak described below (84% of public-schema functions) is a
**separate, unrelated mechanism** from the default-ACL finding above and remains unfixed. Do
not read either SD as having closed it — SD-LEO-SEC-DEFACL-ANON-AUTH-AXIS-001's acceptance
script (`database/chairman-gated/20260816_defacl_anon_auth_axis_acceptance.mjs`) explicitly
asserts this population is *unchanged* by its own apply, as a scope guard against exactly this
conflation.

This database's default ACL — on the axis this section originally described — is active and
ongoing: 636 of 759 (84%) of all public-schema functions, and 19 of 139 (13.7%) of `SECURITY
DEFINER` functions specifically, are currently `PUBLIC`-executable, with new functions
continuing to arrive that way, via a mechanism **downstream** of `pg_default_acl` (confirmed:
that catalog row carries zero `PUBLIC` entries, for either axis).

A concrete, unverified lead for whoever picks this up:
`database/migrations/20260603_03_revoke_secdef_execute_from_anon_authenticated_rollback.sql:19`
contains a blanket `GRANT EXECUTE ON FUNCTION public.%I(%s) TO anon, authenticated, PUBLIC`
loop over every `SECURITY DEFINER` function in `public` — the only file in this repo observed
granting a function `TO PUBLIC` at all, and itself a live instance of the "over-granting
rollback" defect class both this file's own rollback AND SD-LEO-SEC-DEFACL-ANON-AUTH-AXIS-001's
DOWN file (above) were independently corrected for.

**Recommended approach for the follow-up investigation**: a dedicated, minimal harness — one
`ALTER DEFAULT PRIVILEGES` statement, one `CREATE FUNCTION`, read `pg_proc.proacl` directly —
isolated from any shared multi-function stub container.

## See also

- `database/chairman-gated/20260816_close_remaining_secdef_execute_exposure.sql` — full
  migration header with the complete investigation trail and exact live measurements
  (anon/PUBLIC-axis, existing-function triage).
- `database/chairman-gated/20260816_defacl_anon_auth_axis.sql` (+ `_DOWN.sql`,
  `_acceptance.mjs`) — the per-role default-ACL fix (future-function axis) and its two-axis
  acceptance proof.
- `product_requirements_v2` (`PRD-SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001`),
  `functional_requirements[FR-4].status = 'descoped'` and `metadata.fr4_descope` — the formal
  descope record for the PUBLIC-axis attempt.
- `product_requirements_v2` (`PRD-SD-LEO-SEC-DEFACL-ANON-AUTH-AXIS-001`) — the anon/authenticated
  axis fix's PRD, including the AXIS-1/AXIS-2 distinction and the corrected FR-2 scope (a full
  live census found 25 of 28 anon-EXEC functions already triaged by the predecessor SD; the true
  gap was 3 undeclared functions, not a full 145-function re-triage).
- `retrospectives` rows for both SDs (`retro_type='SD_COMPLETION'`) — full narratives, including
  the multi-agent adversarial review patterns that surfaced and fixed several independent
  defects (a rollback over-grant, two lint bypasses, a `--diff-filter` bug, a DOWN-file
  over-grant, and a PRD-text propagation gap) before each merge.
