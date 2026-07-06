# Application guide — gated RPC + staged migration pair

Template-shaped for a delegate-tier session. You adapt `migration.sql` to a new
entity; you do not need estate context beyond this folder.

## Inputs

- **Entity name** for the governed table (e.g. `escalation_requests`) — snake_case plural.
- **RPC name** — `submit_<entity_singular>` unless the task says otherwise.
- **Argument list** — the task states the business fields; `venture_id UUID` stays
  unless the task removes the venture scoping.
- **Caller roles** — which named roles may execute (default: `authenticated`, `service_role`).
- **Validation surface** — per-argument rules the task states (required, min length,
  enum membership). Every rule becomes BOTH a `RAISE` validation in the RPC AND a
  `CHECK` constraint on the table where expressible.

## Adaptation points

1. Rename the table, RPC, and policy consistently (three sites each — table DDL,
   function body, REVOKE/GRANT list; the function's argument signature appears in
   every REVOKE/GRANT line).
2. Replace the argument list and the validation block to match the task's fields —
   one `RAISE ... ERRCODE 22004` guard per rule, validation before the INSERT.
3. Adjust the `CHECK` constraints to the task's enums/rules.
4. Adapt the AUTHZ predicate to the task's role model (named roles in, PUBLIC out).
5. Update the DOWN stanza to drop exactly what UP created, in reverse order.

## Invariants

These are never legal adaptations — each has a WHY in the reference:

- **Hardened search_path pin** (`SET search_path = public, pg_temp`) — `pg_temp`
  explicitly LAST, always. Unless positioned, `pg_temp` is implicitly searched
  FIRST for relations, so a malicious temporary table can shadow the governed
  table inside the definer (CVE-2018-1058 class). Do not use `''` with this
  reference's unqualified table references — it breaks name resolution at
  runtime while passing textual checks.
- **In-function authorization on the CALLER identity** — `SECURITY DEFINER`
  bypasses RLS on every table it touches; a table policy does not protect this
  write path. The AUTHZ block stays, and it must read the caller from
  `request.jwt.claims->>'role'` (with a `session_user` fallback) — NEVER
  `current_user`, which inside a definer is the function OWNER and makes any
  check dead code.
- **Closed execution surface** — `REVOKE ... FROM PUBLIC` and `FROM anon`, then
  `GRANT` to named roles only.
- **RAISE-based validation with a stable error contract** — supabase-js silently
  swallows CHECK/enum violations on direct writes; the RPC must fail loud BEFORE
  the INSERT, and the CHECKs remain as last-line defense.
- **Verify-by-read-back** — the RPC `RETURNING * INTO` and returns the persisted
  row; callers never infer success from the absence of an error alone.
- **REFERENCE ONLY header + DOWN stanza + staging doctrine** — an application lands
  under `database/migrations/`, pre-flagged `requires_chairman_apply`, staged with
  its DOWN stanza, applied at a cutover.

## Acceptance (both directions)

Run the parameterized harness with your entity map — the lock predicates live in
this folder (`acceptance-locks.mjs`, importable without any test framework); the
vitest runner is `tests/unit/golden-references/gated-rpc-acceptance.test.js` and
reads `GOLDEN_REF_SQL` + `GOLDEN_REF_ENTITY_MAP`, defaulting to the canonical
reference:

- **Miss direction**: a copy with any invariant weakened (bare `public` search_path,
  missing REVOKE, missing DOWN stanza, missing AUTHZ block, missing RAISE guard)
  FAILS the assertion that names that invariant.
- **Pass direction**: your adapted migration passes every structural assertion under
  your entity map — same assertions that pass the canonical.
