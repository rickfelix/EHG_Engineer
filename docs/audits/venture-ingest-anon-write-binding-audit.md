# Venture-ingest anon-write binding audit (ownership-bound RPC replacement)

**SD:** SD-LEO-INFRA-FEEDBACK-ANON-RLS-GAPS-001 (security) — public.feedback anon-write RLS:
venture-ID spoofing, rate-limit bypass, forgeable workflow columns
**Date:** 2026-08-12
**Class:** OWNERSHIP-BINDING gap — anon-callable ingress RPCs validated `venture_id` by
*existence* only, not by *possession of a secret bound to that venture*. Any caller holding
one venture's rate-limit headroom could spoof writes attributed to any other venture.
**Status:** Design complete, migration staged, **NOT YET APPLIED** — chairman ratification
required before this closes anything live. See "Apply / rollback" below.

## Finding (live-grounded, EXEC-phase measurement)

Two live anon-reachable surfaces had no per-venture ownership check:

| Surface | Gap | Live-measured (not assumed) |
|---------|-----|------------------------------|
| `telegram_bot_insert_feedback` (public.feedback anon INSERT policy) | No `venture_id` predicate at all | Confirmed via direct policy read — the initially-suspected `venture_user_insert_feedback` was NOT the vulnerable one |
| `record_venture_error` RPC | `venture_id` validated by `venture_exists_and_active()` only — no secret/ownership check | Confirmed exploitable: any caller can attribute error volume to any real venture |

A third, narrower gap (G2 — cross-source-type rate-limit bypass) was found to be **already
fixed** in production via `database/chairman-gated/20260804_ingress_bound_definer_basis.sql`,
whose own header incorrectly claimed "not applied" — a file-vs-live drift, separately signaled.
A residual cross-**venture** rate-limit gap (that fix scopes by `source_type`, not `venture_id`)
remained open and is closed by this SD.

## Fix — new ownership-bound RPCs, existing surfaces left untouched

`database/chairman-gated/20260812_venture_ingest_key_binding.sql` (staged, chairman-gated):

- **FR-1**: `venture_ingest_keys` (per-venture SHA-256-hashed secret, RLS-deny-all, explicit
  `REVOKE ALL ... FROM PUBLIC, anon, authenticated` on both the table AND its three internal
  functions — this instance's `ALTER DEFAULT PRIVILEGES` auto-grants full privileges to
  `anon`/`authenticated`/`postgres`/`service_role` on every new `public`-schema object, tables
  and functions alike; closing only the table half would have left `fn_provision_venture_ingest_key`
  directly anon-callable).
- **FR-2**: `fn_submit_venture_feedback` — new anon-callable RPC validating the caller's secret
  against the specific `venture_id` claimed, replacing the raw unauthenticated INSERT path.
  Uniform `28000` rejection for both a wrong secret and a nonexistent venture (TS-6), so the
  error surface cannot be used to enumerate valid venture IDs.
- **FR-3**: `fn_submit_venture_error` — a **new, separately-named** RPC (not an added parameter
  on `record_venture_error`'s existing signature, which would create a PostgREST same-name
  overload / PGRST203 collision breaking every unmigrated caller instantly). `record_venture_error`
  itself is completely untouched by this migration; its anon-EXECUTE grant is revoked only as an
  explicit future follow-on, once FR-5's migration plan confirms all known callers have moved.
- **FR-4**: Per-venture rate limiting (`fn_venture_ingest_prior_hour_count`, 50/hour) composed
  with the existing global per-source-type cap (raised to 500/hour, a 10x multiplier reasoned
  from `venture_worker`'s current zero measured traffic) — live-validated: venture A flooding to
  50/hour is rejected on the 51st call; sibling venture B is unaffected.
- **FR-5**: `fn_provision_venture_ingest_key` (service_role-only) mints/rotates a venture's
  secret; a companion per-`(venture,error_hash)` 1-second cooldown (`clock_timestamp()`-based,
  peer-review addition) caps unbounded `occurrence_count` incrementing on the aggregation path.

## Standing verification (three independent tiers)

- **Tier A** (`tests/ddl/venture-ingest-key-binding-ddl.db.test.js`, ephemeral Postgres, CI):
  proves the new functions' own logic — ownership binding, uniform rejection, rate limiting,
  cooldown behavior. Does **not** prove production grant posture (vanilla Postgres doesn't
  reproduce Supabase's `ALTER DEFAULT PRIVILEGES`) or PostgREST RPC resolution.
- **Tier B** (`database/chairman-gated/20260812_venture_ingest_key_binding_acceptance.mjs
  --baseline` / `--verify`): behavioral acceptance through `supabase-js`/PostgREST, the same
  surface real callers use — proves TS-5 (`record_venture_error`'s original signature stays
  unambiguous, no PGRST203) and the full RPC contract, which a direct Postgres connection cannot.
  `--baseline` has run and passed pre-apply; `--verify` requires the migration to be applied.
- **Tier C** (`scripts/venture-ingest-keys-anon-probe.mjs`): live anon-probe on the real
  instance proving `venture_ingest_keys` is unreachable by anon via any of the four DML forms,
  attributed to `GRANT_DENIED` (no table-level privilege at all) rather than the weaker
  `POLICY_DENIED`. Exits `PROBE_INCONCLUSIVE` (not a pass) while the table doesn't exist yet.

## Apply / rollback

- **Apply authority:** CHAIRMAN-ONLY / non-delegatable — this is a chairman-gated migration
  (`database/chairman-gated/`), staged with no `@approved-by`. **The design is complete and
  merged to `main` as an unapplied artifact; the fix itself is not live until the chairman
  ratifies and applies it.**
- **Rollback:** the migration's own `$verify$` self-verification block asserts the full grant
  posture (all 4 DML privileges × `anon`/`authenticated`, on both the table and all three
  internal functions) before `COMMIT` — a partial re-apply that loses a REVOKE fails closed
  rather than silently shipping a gap. An accidental full-production apply during EXEC-phase
  dry-run validation (a `client.query()` multi-statement transaction bug, not a migration defect)
  was caught, fully reverted, and independently re-verified same-day; recorded in
  `strategic_directives_v2.metadata.incident_20260812_unratified_apply` for this SD.
