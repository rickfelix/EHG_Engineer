# record_venture_error → fn_submit_venture_error Cutover Runbook

- **Category**: Runbook
- **Status**: Active (staged migration awaiting chairman ratification — see §0)
- **Author**: SD-LEO-INFRA-RECORD-VENTURE-ERROR-DEFINER-POSTURE-001
- **Last Updated**: 2026-08-13
- **Evidence basis**: LEAD-phase live catalog re-verification (this SD), independent SECURITY sub-agent
  pass (verdict FAIL, 95% confidence, fixture-proven), Explore sub-agent exhaustive census

## 0. The vulnerability this runbook closes

`public.record_venture_error` is `SECURITY DEFINER`, owned by role `postgres` (which has
`rolbypassrls=true`). It validates that `p_venture_id` names an *eligible venture* but never
that the *caller* has any relationship to that venture — there is no `auth.uid()`, `auth.jwt()`,
or shared secret anywhere in the function body. `anon`/`authenticated`/`service_role` all hold
EXECUTE. A sibling session independently reproduced the exploit live: an anon call with an
attacker-chosen `p_venture_id` returns `{ok:true, action:created}` against a venture the caller
has no relationship to.

**`FORCE ROW LEVEL SECURITY` on `public.feedback` would NOT fix this** — empirically proven via a
controlled fixture test: a role with the `BYPASSRLS` attribute (which `postgres` has) bypasses RLS
regardless of `FORCE`. Dropping `SECURITY DEFINER` for `INVOKER` would fail CLOSED for every real
caller (no permissive INSERT policy on `public.feedback` matches this function's write shape).
Constraining the write surface via a column allow-list is already implemented in the exploited
function and is insufficient on its own, because it validates the venture, never the caller.

The sound fix — caller-identity binding via a per-venture ingest secret — is already authored in
`database/chairman-gated/20260812_venture_ingest_key_binding.sql` (`fn_submit_venture_error`),
confirmed **not yet applied** (absent from `pg_proc` as of 2026-08-13).

## 1. The three live callers (out of this repo's direct control)

| Repo | File | Notes |
|---|---|---|
| altifyai | Cloudflare Worker (error-capture path) | Separate repository |
| apexniche-ai | `src/lib/error-capture.ts:151` | Separate repository |
| marketlens | `src/lib/errorCapture.js:65` | Separate repository, Express |

All three are **server-side** (Worker/Express) and hold only the `anon` key by construction — none
is browser code. Each currently POSTs to `record_venture_error` with a deployment-pinned
`venture_id`; that pinning is voluntary client-side convention, enforced nowhere in the database.

## 2. Cutover order — DO NOT REORDER

The two wrong orderings are both **outages**, not merely suboptimal:

- **Revoke-first outage**: if `REVOKE EXECUTE ON record_venture_error FROM anon` runs before all
  three callers have migrated to `fn_submit_venture_error`, every un-migrated caller's error
  telemetry silently stops (their RPC call starts failing with a permission error).
- **Retire-first outage**: dropping/renaming `record_venture_error` before all three callers have
  migrated has the identical effect — the un-migrated callers call a function that no longer exists.

**Correct sequence:**

1. **[CHAIRMAN-GATED DDL]** Apply `database/chairman-gated/20260812_venture_ingest_key_binding.sql`.
   This is additive-only: it creates `venture_ingest_keys`, `fn_provision_venture_ingest_key`,
   `fn_submit_venture_feedback`, and `fn_submit_venture_error`. It does **not** touch
   `record_venture_error` — its own `$verify$` block asserts that function's `pg_proc` row count
   is unchanged. Both old and new functions are live simultaneously after this step.
2. **[Service-role action]** For each of the ~146 currently-eligible ventures, call
   `fn_provision_venture_ingest_key(p_venture_id)` to mint a per-venture secret.
3. **[External repo work, tracked separately — see §3]** Update altifyai, apexniche-ai, and
   marketlens to call `fn_submit_venture_error(p_venture_id, p_ingest_secret, ...)` with their
   provisioned secret, replacing the `record_venture_error` call.
4. **[Verification]** Confirm all three callers are migrated via explicit confirmation from each
   repo's own deploy (e.g. a merged PR/release referencing the switch). A row-count check against
   `public.feedback` is NOT a valid substitute: `record_venture_error` and `fn_submit_venture_error`
   insert byte-identical rows (same columns, same `source_type='error_capture'` literal, `metadata`
   populated from caller-supplied `p_context` in both) — nothing in the written row distinguishes
   which function wrote it, so "zero new record_venture_error-originated rows" is unmeasurable and
   must not be used as the gate in front of step 5.
5. **[CHAIRMAN-GATED DDL, follow-up migration]** Only once step 4 is confirmed:
   `REVOKE EXECUTE ON FUNCTION record_venture_error FROM anon, authenticated;` and, optionally,
   drop the function. **Both roles, not `anon` alone** — §0 documents that `anon`, `authenticated`,
   AND `service_role` all currently hold EXECUTE, and the three known callers being anon-key
   server processes does not make `authenticated` safe to leave granted: any logged-in platform
   user could call the RPC directly via PostgREST with the identical cross-tenant forgery, a
   materially wider surface than the three named external callers. This is a **separate**, later
   migration — not part of the 20260812 file. `service_role` is intentionally left granted
   (trusted, not caller-identity-constrained by design).

**Known test-coverage gap**: TS-8 (this SD) exercises only the `anon` client — it will read green
once `anon` alone is revoked, which is NOT sufficient (see above). No `authenticated`-session test
fixture exists in this test harness today. Before declaring step 5 complete, verify the
`authenticated` vector is also closed — either by extending TS-8 with an authenticated-session
caller in a follow-up, or by an explicit live check that `authenticated` no longer holds EXECUTE
(`information_schema.routine_privileges`).

## 3. External-repo caller migration — tracked dependency, not this SD's scope

This repository (`EHG_Engineer`) cannot modify `altifyai`, `apexniche-ai`, or `marketlens` source
directly. Step 3 above must be escalated as explicit, discoverable follow-up work (coordinator
routing or sibling SDs scoped to each venture repo) — not left as an implicit assumption in this
runbook alone.

## 4. Rollback

Steps 1–2 are additive-only and reversible by construction (new table + new functions; nothing
about `record_venture_error` changes). Step 5 (the revoke) is the only irreversible-in-practice
step from a caller's perspective — reverting it (re-granting EXECUTE) is trivial DDL, but any
caller that had already fully cut over to `fn_submit_venture_error` by then would need no action.
