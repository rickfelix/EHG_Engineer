# `database/chairman-gated/` — DDL that must NOT be auto-applied

Created by SD-LEO-INFRA-AUDIT-LOG-MUTATION-BLIND-001 (FR-1).

## Why this directory exists

The handoff pipeline auto-applies pending migrations. `BaseExecutor._checkAndExecutePendingMigrations`
runs with `autoExecute: options.autoExecuteMigrations !== false` — i.e. **true by default** — and
scans exactly three directories (`pending-migrations-check.js:778`):

```
database/migrations   database/manual-updates   supabase/migrations
```

There *is* a tier gate meant to stop this for risky DDL: files that are not provably additive
classify as **TIER-2 (default-deny)** and defer to the 3-factor chairman gate. But it is controlled
by the `LEO_MIGRATION_TIER_GATE_BYPASS` flag in `leo_feature_flags`, and `tierGateEnabled()` returns true
only for the literal string `on`. With the gate off the classification is computed and logged but,
in the code's own words, "changes NOTHING".

So a `CREATE TRIGGER` / `CREATE OR REPLACE FUNCTION` migration dropped into `database/migrations/`
would be picked up and executed automatically — self-applying DDL that is supposed to require a
chairman's `--issue-token`. **A worker cannot place chairman-gated DDL in an auto-applied path and
still call it gated.** This directory is outside all three scanned paths, so the file waits here
until a human applies it deliberately.

## Ceremony guard order (read this before running any command below)

`--issue-token` is a MODE SWITCH, not a flag you combine with `--prod-deploy` — passing it
alongside a migration path still just mints a fresh token and exits without applying
(`scripts/apply-migration.js` checks `args.flags.has('issue-token')` before it even looks at
the migration path). Every ceremony below is always **two separate invocations**, and every
file in this directory also needs `--allow-any-path` (it lives outside `database/migrations/`,
the only path `apply-migration.js` accepts by default):

```
node scripts/apply-migration.js --issue-token
MIGRATION_APPLY_TOKEN=<token from above> node scripts/apply-migration.js \
  "database/chairman-gated/<file>.sql" --prod-deploy --allow-any-path
```

`--prod-deploy` then runs these guards in order (`scripts/apply-migration.js` /
`scripts/lib/migration-guards.js`) — any failure aborts before touching the DB:
1. **path** — resolves inside this directory only with `--allow-any-path` passed.
2. **git_committed** — the `.sql` file must be tracked by git with no uncommitted changes.
3. **approver** — the file's `-- @approved-by: <email>` header must match `git config user.email`.
4. **token** — `MIGRATION_APPLY_TOKEN` must be the value from a separate `--issue-token` call, unconsumed and <1h old.

Then, per-file DDL post-conditions (the acceptance/verify scripts named in each entry below).

## Applying `20260802_sd_mutation_audit_trigger.sql`

```
node scripts/apply-migration.js --issue-token
MIGRATION_APPLY_TOKEN=<token from above> node scripts/apply-migration.js \
  "database/chairman-gated/20260802_sd_mutation_audit_trigger.sql" \
  --prod-deploy --allow-any-path
```

Rollback is in the file header:

```sql
DROP TRIGGER IF EXISTS trg_sd_mutation_audit ON strategic_directives_v2;
DROP FUNCTION IF EXISTS log_sd_mutation_audit();
```

## What it does

Adds `AFTER UPDATE` mutation auditing to `strategic_directives_v2` for three governed fields —
`status`, `current_phase`, `claiming_session_id` — writing one `audit_log` row per changed field
with `old_value` and `new_value` populated, in the same shape as the existing sd_type_change writer.

It is **field-scoped on purpose**, and that is the load-bearing part of the design:
`update_strategic_directives_v2_updated_at` fires on every write to the table, so an unfiltered
audit trigger would emit a row per touch. `audit_log` already carries a 214,099-row advisory flood
and has **no retention implemented**, so every row added is permanent. The `WHEN` clause on the
trigger is a second, independent guard on that same property, so the trigger does not fire at all
for updates touching none of the three fields.

## Applying `20260803_bound_anon_ingress_source_type_qualifier.sql`

```
node scripts/apply-migration.js --issue-token
MIGRATION_APPLY_TOKEN=<token from above> node scripts/apply-migration.js \
  "database/chairman-gated/20260803_bound_anon_ingress_source_type_qualifier.sql" \
  --prod-deploy --allow-any-path
```

Chairman-approved 2026-08-03 (Option A, SMS 10:13:53Z, on record via Adam). **Approval to author is
not approval to apply** — the apply runs through the ceremony with the approval row referenced.

**The rollback source is a FRESH PRE-APPLY CAPTURE of live `pg_policies` state, taken by the applier
at apply time — never a repo file, including the amendment file itself.** The predicate in that
file's header is captured from `pg_get_expr` on the live policy at *authoring* time and is there as
**context to diff against**, not as an authority to restore from.

That requirement is not ceremony. This repo already carries a policy file for
`public.session_coordination` (20260309, `FOR ALL` with no `TO` clause) that **disagrees with live
state** — the same defect as the SD above in the opposite direction: there a live policy had no
file, here a file misdescribes the live policy. Both are one representation being trusted for a fact
it does not hold.

**Any file-vs-live disagreement found during the pre-apply capture is a BLOCKING finding** — stop
the ceremony and report it, because it means live policy was changed outside migration history
again, which matters more than the amendment does.

**Run the acceptance twice — the baseline is not optional:**

```
node database/chairman-gated/20260803_bound_anon_ingress_source_type_qualifier_acceptance.mjs --baseline   # BEFORE apply, test B must FAIL
node database/chairman-gated/20260803_bound_anon_ingress_source_type_qualifier_acceptance.mjs --verify     # AFTER apply, all must PASS
```

A post-apply green proves nothing alone: a probe that cannot detect the defect reads green against
the unamended policy too, making "the fix works" indistinguishable from "the test cannot see". The
baseline run is what gives the verify run meaning.

### What it does

Amends clause (3) of `anon_feedback_ingress_bounds` so the 1-hour window is counted over rows
sharing the **inserting row's** `source_type` instead of always over `telegram`. Each `source_type`
gets its own budget, so flooding one can no longer deny ingress to another.

That cross-source denial was the defect (gap G2 of SD-LEO-FIX-BOUND-ANON-TELEGRAM-001): a limit
keyed on telegram was ANDed into a RESTRICTIVE policy applying to *every* anon INSERT, so ~50
individually-legal telegram rows denied all anon feedback ingress for an hour. Found by the SECURITY
sub-agent during EXEC review, not by the policy's author. Exposure is real but cold — organic
telegram volume is 1 row/hour all-time — so it is an adversarial lever, not an operational fault.

`feedback.source_type` in the subquery is the load-bearing token and the thing most likely to be
silently wrong: the subquery aliases the same table as `f`, so an unqualified `source_type` would
bind to `f` and collapse the predicate to a tautology, counting the full hourly population while
reading as if it were scoped. Verified read-only before staging (the correlated form returns
distinct per-source counts, not the table total) and re-asserted at apply time by post-condition 2.

**Does not fix**, and must not be read as fixing: the counting subquery still runs as the inserting
role and is subject to that role's SELECT RLS, so narrowing the anon SELECT policy still makes it
undercount and fail **open**.

## Applying `20260812_venture_operating_burn_tenant_predicate.sql`

Two separate commands — `--issue-token` is a mode flag, not combinable with `--prod-deploy` in the
same invocation (it mints a token and exits without applying), and this file needs
`--allow-any-path` since it lives outside `database/migrations/`:

```
node scripts/apply-migration.js --issue-token
MIGRATION_APPLY_TOKEN=<token from above> node scripts/apply-migration.js \
  "database/chairman-gated/20260812_venture_operating_burn_tenant_predicate.sql" \
  --prod-deploy --allow-any-path
```

(SD-LEO-INFRA-VENTURE-BURN-RLS-TENANT-PREDICATE-001, SECURITY review finding S-7 — evidence row
`8d2a6a6f-dd80-43af-9ddf-17a7c4ad48ee`.)

Chairman-approved 2026-08-12 (S1 'A', SMS 11:43:53Z, Adam packet item 3). Fixes
`venture_operating_burn_auth_read`, which was `USING (true)` for `authenticated` — any tenant could
read every venture's financial burn data. Replaces it with the established local idiom
(`auth.role() = 'service_role' OR fn_user_has_venture_access(venture_id)`, matching two other live
policies) and revokes `anon`'s inert table-level SELECT grant.

**Run the acceptance before AND after apply, and read the printed `qual` line, not the exit code —
both states exit 0:**

```
node database/chairman-gated/20260812_venture_operating_burn_tenant_predicate_acceptance.mjs
```

This script is catalog + staged-source-text verification only (binds to the lint's exported
`lintSql()` directly, since the lint CLI cannot see this directory at all). It is deliberately NOT a
row-level behavioural probe: the table holds 0 rows, so any such probe would pass identically under
the leaking or the fixed policy.

## Applying `20260816_defacl_anon_auth_axis.sql`

```
node scripts/apply-migration.js "database/chairman-gated/20260816_defacl_anon_auth_axis.sql" \
  --prod-deploy --allow-any-path
```

(SD-LEO-SEC-DEFACL-ANON-AUTH-AXIS-001.) Per-role `ALTER DEFAULT PRIVILEGES` REVOKE for `postgres`
and `supabase_admin`, schema `public`, functions — closes the FUTURE-function half of the anon/
authenticated EXECUTE leak. Live-measured (2026-08-16): `pg_default_acl` for both roles already
names `anon` and `authenticated` explicitly (not via a literal `PUBLIC` entry), so the
`20260816_close_remaining_secdef_execute_exposure.sql` migration's `REVOKE ... FROM PUBLIC`-only
ADP shape was a structural no-op on this axis — every function created since then inherited
anon/authenticated EXECUTE by default regardless. This is a SEPARATE, independent fix from that
migration: it changes nothing about the 145 functions that already exist (that is
`20260816_close_remaining_secdef_execute_exposure.sql`'s job, still ceremony-pending as of this
writing); it only stops NEW functions from being born exposed. Apply both for full closure, in
either order.

**Run the acceptance in all modes — the baseline is not optional for `--verify`, and `--hash` is
not optional around a real apply/rollback cycle (it is what actually proves the DOWN file is an
exact inverse — a SECURITY review caught the DOWN file over-granting PUBLIC on a state that never
had it, by manual read; `--hash` catches that class mechanically on any future edit):**

```
node database/chairman-gated/20260816_defacl_anon_auth_axis_acceptance.mjs --self-test   # fixture-only, no DB
node database/chairman-gated/20260816_defacl_anon_auth_axis_acceptance.mjs --hash         # BEFORE UP    (record the hash)
node database/chairman-gated/20260816_defacl_anon_auth_axis_acceptance.mjs --baseline     # BEFORE apply
# ... chairman applies the UP file ...
node database/chairman-gated/20260816_defacl_anon_auth_axis_acceptance.mjs --hash         # AFTER UP     (must differ from BEFORE)
node database/chairman-gated/20260816_defacl_anon_auth_axis_acceptance.mjs --verify       # AFTER apply
# if a rollback is ever needed, after applying the DOWN file:
node database/chairman-gated/20260816_defacl_anon_auth_axis_acceptance.mjs --hash         # AFTER DOWN   (must equal BEFORE)
```

The script proves two independent axes (AXIS-1 default-ACL / future functions, AXIS-2 existing-
surface manifest completeness — reusing `scripts/audit-rpc-execute-grants.mjs`'s exported pure
functions rather than re-implementing them) plus a scope guard asserting the separate, already-
tracked `public_exec=true` defect population (see the entry above) is unchanged by this apply —
this migration must never be credited with fixing that unrelated defect.

This SD also added 3 previously-undeclared anon-EXEC functions
(`fn_submit_venture_user_feedback`, `fn_submit_venture_feedback`, `fn_submit_venture_error`) to
`scripts/audit-rpc-execute-grants-buckets.json`'s Bucket C (KEEP) — a live gap the completeness
gate could not see until now. No new REVOKE migration was authored for the existing-surface set:
the other 25 of the 28 live anon-EXEC functions were already triaged and staged by
`20260816_close_remaining_secdef_execute_exposure.sql`; duplicating that authoring would create a
second staged file touching the same functions, which this SD deliberately avoids.

## Applying `20260817_four_audit_critical_timestamptz.sql`

```
node scripts/apply-migration.js "database/chairman-gated/20260817_four_audit_critical_timestamptz.sql" \
  --prod-deploy --allow-any-path
```

(SD-LEO-INFRA-FOUR-AUDIT-CRITICAL-001.) `ALTER COLUMN TYPE timestamp -> timestamptz` for 15
columns across 4 audit-critical, high-write-frequency tables (`quick_fixes`, `sd_phase_handoffs`,
`strategic_directives_v2`, `user_stories`). Fixes the JS local-timezone misparse of tz-naive
timestamps at the root (every existing and future reader is corrected at once) rather than
requiring per-reader compensation.

**⚠️ QUIESCE WINDOW REQUIRED.** `ALTER COLUMN TYPE` on a populated column is a full TABLE REWRITE
under ACCESS EXCLUSIVE lock, not a metadata-only change, and all 4 target tables are among the
highest-write-frequency tables in this schema (continuously written by the live fleet). Under the
lock, a concurrent writer does NOT queue — it gets an immediate 55P03 lock-not-available error (a
5s `lock_timeout` is set). The chairman/coordinator MUST schedule this apply during a
coordinator-declared quiesce window (fleet writers paused, not merely "quiet") — do not apply
during normal fleet operating hours.

**Every `ALTER COLUMN TYPE` statement in both the UP and DOWN file carries an explicit
`USING <col> AT TIME ZONE 'UTC'` clause — this is not optional.** Without it, PostgreSQL
interprets each stored naive value via the *applying session's* `TimeZone` GUC rather than the
value's true UTC meaning; since every value stored today is genuinely UTC, an unpinned apply from
a non-UTC session would permanently and irreversibly shift every historical timestamp — silently
recreating, at the row level, the exact defect class this migration exists to fix.

**⚠️ DEPENDENT VIEWS/MATVIEWS.** 10 of the 15 target columns are referenced by 11 dependent
view/matview objects (7 in `public`, 2 in `governance`, 2 materialized views) — a DATABASE
sub-agent review (evidence 8c3ed611) found the migration would otherwise abort at ceremony time
with SQLSTATE 0A000 ("cannot alter type of a column used by a view or rule"). Both the UP and
DOWN file now DROP all 11 objects before the column changes and CREATE them again (identical
definitions + grants, captured live) immediately after — this is already built into both files,
not a manual ceremony step.

**Run the proof sequence — the USING-clause semantics AND the full drop/recreate envelope are
proven live, not merely grepped for:**

```
node database/chairman-gated/20260817_four_audit_critical_timestamptz_using_clause_proof.mjs   # BEFORE apply (safe to re-run any time — TEMP-table, ROLLBACK-guarded, never touches a real table)
node database/chairman-gated/20260817_four_audit_critical_timestamptz_dry_run.mjs               # BEFORE apply (safe to re-run any time — runs the REAL UP+DOWN bodies end-to-end against production inside one transaction that always ROLLBACKs; catches drift in the 11 dependent-object definitions/grants before the real ceremony)
node database/chairman-gated/20260817_four_audit_critical_timestamptz_verify.mjs --baseline    # BEFORE apply (captures the live pre-apply state)
# ... chairman applies the UP file, during a scheduled quiesce window ...
node database/chairman-gated/20260817_four_audit_critical_timestamptz_verify.mjs --verify      # AFTER apply
# if a rollback is ever needed, after applying the DOWN file:
node database/chairman-gated/20260817_four_audit_critical_timestamptz_verify.mjs --baseline    # AFTER DOWN (re-run baseline; naive/aware split should match the original pre-apply capture)
```

The `_using_clause_proof.mjs` script runs the *actual* `ALTER COLUMN TYPE` mechanics — both
directions, with and without the `USING` clause — against a session-scoped `TEMP TABLE` inside a
transaction that always `ROLLBACK`s, under a pinned non-UTC session `TimeZone`. A prospective
TESTING sub-agent review (PLAN-TO-EXEC) found that a text-presence grep for the clause "cannot see
a column-binding error and never measures the result" — this proof measures the actual converted
value instead, plus a negative control confirming the clause is load-bearing (the result differs
without it).

The `_verify.mjs` script reads `information_schema.columns` over the pooler via
`createDatabaseClient('engineer')` (mirroring `scripts/db-validate/schema-validator.js`'s existing
reader — `pg_catalog`/`information_schema` is not reliably exposed through PostgREST), asserting
all 15 target columns plus a 6-column negative control of already-aware sibling columns on the
same 4 tables (`sd_phase_handoffs.resolved_at`, `strategic_directives_v2.{completion_date,
embedding_generated_at,quality_checked_at}`, `quick_fixes.not_before`,
`user_stories.e2e_test_last_run`) — a change in the negative control signals scope creep.

**Out of scope, documented not silently absorbed:** `product_requirements_v2` (7 naive timestamp
columns) was in scope for the folded-in `SD-LEO-INFRA-NAIVE-TIMESTAMP-SKEW-001` but is orphaned by
the fold — neither SD covers it; a follow-up SD is recommended. See this SD's PRD FR-6 and the
completion-flags capture at LEAD-FINAL-APPROVAL.

## Applying `20260817_fdbk_internal_feedback_rpc.sql`

```
node scripts/apply-migration.js "database/chairman-gated/20260817_fdbk_internal_feedback_rpc.sql" \
  --prod-deploy --allow-any-path
```

(SD-FDBK-FIX-FEEDBACKWIDGET-PURPOSE-BUILT-001.) Adds two new, additive-only functions: a SECURITY
DEFINER RPC `fn_submit_internal_feedback` (identity via `auth.uid()`, `authenticated`-only grant, no
`anon` grant) and a `user_id`-scoped rate-limit helper `check_internal_feedback_rate_limit`. Gives
signed-in `ehg/src/components/quality/FeedbackWidget.tsx` users a working submit path at every
severity — today `public.feedback` has zero permissive INSERT policy reachable by `anon` or
`authenticated` (only `service_role`), so every FeedbackWidget submission is unconditionally
rejected, at every severity, masking exactly the most urgent (critical/high) feedback.

**No new RLS policy, no edit to `anon_feedback_ingress_bounds`.** A `SECURITY DEFINER` function
bypasses table RLS entirely for its own internal write (the same mechanism the already-shipped
`fn_submit_venture_user_feedback` relies on) — this migration is independent of, and does not touch
or depend on, the separate zero-permissive-grant remediation tracked elsewhere (Remedy A/B: see
`20260815_venture_user_feedback_ownership_rpc.sql` / `20260817_restore_feedback_permissive_insert.sql`
above).

**Severity is deliberately NOT clamped.** Unlike `anon_feedback_ingress_bounds`'s exclusion of
critical/high (a bound designed for an *anonymous* caller), this RPC's caller identity is real and
non-forgeable (`auth.uid()`), so the abuse control is a `user_id`-scoped rate limit (20/hour) plus a
global per-hour ceiling (200/hour, mirroring `anon_feedback_ingress_bounds`'s own `manual_feedback`
cap) — not a severity clamp, which would reproduce the exact defect this migration fixes. See the
migration file's own header for the full reasoning and the PRD's TR-2 for the sub-agent review trail.

**⚠️ DEPLOYMENT ORDERING.** Apply this migration BEFORE deploying the paired frontend change
(`FeedbackWidget.tsx` / `feedbackDataAccess.ts`, ehg repo) — the frontend calls the RPC
unconditionally, no feature flag. If the RPC is missing, the frontend fails loudly (42883), no worse
than today's standing defect (42501); no feature flag is used deliberately (see the PRD's TR-6). To
roll back: revert the frontend PR FIRST, then apply the DOWN migration — reverse of the forward
order.

**Proof sequence — run before ceremony, safe to re-run any time (ROLLBACK-guarded, never touches
live data):**

```
node database/chairman-gated/20260817_fdbk_internal_feedback_rpc_dry_run.mjs
```

Creates both functions inside a transaction, exercises every success/error path (severity
critical/high/medium/low, invalid type/severity, empty title, `auth.uid()` NULL, per-user rate-limit
trip, cross-user isolation, global-ceiling trip, and the exact `{ok, id}` response-shape contract),
and always `ROLLBACK`s. The migration's own `DO $verify$` block additionally asserts the EXECUTE
grant posture (`authenticated` can call it, `anon` cannot) at apply time — a lesson carried forward
from this SD family's own completion retro: a verify block that only re-checks catalog *shape*
(function exists) can pass while every real call still 42501s, because EXECUTE grants were never
asserted.

## Applying `20260819_anon_truncate_sweep.sql`, `20260819_anon_truncate_default_privileges.sql`, `20260819_security_audit_events_revoke_authenticated_truncate.sql`

```
node scripts/apply-migration.js "database/chairman-gated/20260819_anon_truncate_sweep.sql" \
  --prod-deploy --allow-any-path
node scripts/apply-migration.js "database/chairman-gated/20260819_anon_truncate_default_privileges.sql" \
  --prod-deploy --allow-any-path
node scripts/apply-migration.js "database/chairman-gated/20260819_security_audit_events_revoke_authenticated_truncate.sql" \
  --prod-deploy --allow-any-path
```

(SD-LEO-INFRA-ANON-TRUNCATE-SWEEP-001.) Three independent files, applicable in **any order** — they
touch disjoint axes (anon vs. authenticated; existing relations vs. future-relation default
privileges) and none depends on another having landed. Rollback is the paired `_DOWN.sql` for each,
grant-precise (never a broader `GRANT ALL`).

**⚠️ REGENERATE THE SWEEP FILE IMMEDIATELY BEFORE APPLYING.** `20260819_anon_truncate_sweep.sql` was
generated from a live enumeration snapshot (`anon-truncate-sweep-enumeration.json`, committed
alongside it) taken at authoring time. Its baseline-capture step resolves every relation through a
`regclass` array literal — if any of the 760 named relations has been dropped or renamed by ceremony
time, that step raises `42P01` and the **whole transaction aborts before any REVOKE runs** (fails
safe, nothing partial is applied) — but the apply will not proceed until the file is regenerated
against current state:

```
node scripts/one-off/anon-truncate-sweep-enumerate.mjs
node scripts/one-off/anon-truncate-sweep-generate-migration.mjs
```

**Proof sequence — run before ceremony, safe to re-run any time (all three scripts run inside
`BEGIN`/`ROLLBACK`, never touch live data, live in `scripts/` at the repo root — not co-located in
this directory like earlier entries above):**

```
node scripts/anon-truncate-sweep-acceptance.mjs           # FR-1..FR-4: real UP file dry-run, 5 post-condition mutation proofs, UP->DOWN round-trip, TRUNCATE-refusal probe, whole-file statement lint (16 checks)
node scripts/anon-truncate-sweep-fr5-fr6-acceptance.mjs   # FR-5/FR-6: tier classification, clean apply, UP->DOWN round-trip on pg_default_acl / relacl (8 checks)
node scripts/one-off/anon-truncate-sweep-fr4-reachability.mjs   # FR-4: re-verify anon cannot reach TRUNCATE via any other path (schema CREATE, exec_sql, SECURITY DEFINER survey) before trusting the REVOKEs above as sufficient
```

### What it does

Closes the anon-TRUNCATE gap left after `SD-LEO-INFRA-AUDIT-LOG-MUTATION-BLIND-001` (which revoked
TRUNCATE from `authenticated` on governed tables but explicitly did not touch `anon`, and did not
sweep the wider Supabase-default `GRANT ALL` artifact anon inherited across the schema). RLS cannot
gate `TRUNCATE` at all — REVOKE is the only mechanism. `_sweep.sql` revokes anon's TRUNCATE on the
760 ordinary, postgres-owned tables that currently hold it (views and 3 `storage.*`-owned tables are
excluded by mechanism, not by list curation — see the file's own header). `_default_privileges.sql`
closes the same gap for FUTURE tables via `ALTER DEFAULT PRIVILEGES` (3 `supabase_admin`-owned
schemas are a disclosed, deferred residual — see the file header, no project credential can join that
platform-reserved role). `_security_audit_events...sql` closes one specific `authenticated`-axis gap
the predecessor SD's own sweep missed on this table's partition tree.

**Never applied by the builder.** All three pairs remain `@approved-by:`-unstamped by design; the
chairman applies each via the ceremony above.

**Overlap note:** 6 of the 760 relations swept here (`protocol_constitution`, `leo_feature_flags`,
`eva_vision_documents`, `chairman_decisions`, `ventures_kill_log`, `chairman_directives`) are also
covered by the higher-sensitivity, broader-scope (INSERT/UPDATE/DELETE, not just TRUNCATE) revoke
staged separately in `docs/audits/sensitive-table-write-grant-audit.md`
(SD-LEO-INFRA-GOV-TABLE-WRITE-GRANT-REVOKE-001). Both remain unapplied; applying either first makes
the other's `REVOKE TRUNCATE` on those 6 tables a harmless no-op. Apply both for full closure.

## Applying `20260823_eva_stage_gate_attempts.sql`

```
node scripts/apply-migration.js --issue-token
MIGRATION_APPLY_TOKEN=<token from above> node scripts/apply-migration.js \
  "database/chairman-gated/20260823_eva_stage_gate_attempts.sql" \
  --prod-deploy --allow-any-path
```

(SD-LEO-INFRA-MINUS-EVIDENCE-LAYER-001, T-minus P1 evidence layer.) Adds `eva_stage_gate_attempts`
— a durable, attributable, immutable-once-finalized record per gate-evaluation ATTEMPT — as a NEW
side table, not a retrofit of `eva_stage_gate_results`. LEAD-phase premise verification found the
originally-chartered retrofit non-executable (930 legacy `venture_id`-NULL rows collapse into 46
duplicate groups; the proposed unique key omitted `venture_id`), and a prospective TESTING pass
found the "run_id" concept has no production analog (the only traversal-scoped function is dead
code; every real gate-writing path is per-stage). See the migration file's own header for the full
reasoning.

**Purely additive.** No ALTER/DROP against `eva_stage_gate_results` in either direction; that
table's 1,796 existing rows, schema, indexes, and trigger are untouched. Application code
dual-writes to both tables going forward (`recordGateAttempt` in
`lib/eva/artifact-persistence-service.js`) — already merged and live in code, inert until this
migration is applied (the RPC calls will 42883 until then, caught and logged loudly, never
silently swallowed).

**Run the proof sequence — both are transactional, ROLLBACK-guarded, safe to re-run any time:**

```
node database/chairman-gated/20260823_eva_stage_gate_attempts_dry_run.mjs
node database/chairman-gated/20260823_eva_stage_gate_attempts_updown_roundtrip.mjs
```

The dry-run executes the real UP body (table, indexes, trigger, functions, RLS) plus its own
`DO $verify$` block's behavioural proofs (finalize-immutability rejection, duplicate-attempt-number
rejection, atomic allocation, and — since the SECURITY pass below — function-grant and
trigger-enable-mode existential checks) against the real database inside a transaction that always
`ROLLBACK`s. The round-trip proof additionally runs the real DOWN body afterward and asserts the
table and all 3 functions are gone, proving the DOWN file is a genuine inverse rather than
`IF EXISTS` no-ops that would "pass" even if its object names had drifted from the UP file's.

**SECURITY (EXEC-TO-PLAN) found and this file fixes, pre-apply, three gaps a sibling migration
(`20260823_chairman_ratifications.sql`) had already hit and fixed on its own table:**
- **SEC-M1**: the freeze trigger was default ORIGIN-mode — measured live (apply + rollback) that
  `SET LOCAL session_replication_role = 'replica'` suppresses it, allowing a finalized row to be
  silently rewritten. Only `postgres` can set that GUC (service_role/authenticated/anon all get
  `42501`), so this was never anon-writable, but `postgres` is the role every migration and
  one-off script in this harness connects as, and restore/bulk-load tooling sets replica mode
  routinely with no catalog trace. Fixed with `ALTER TABLE ... ENABLE ALWAYS TRIGGER ...`, mirroring
  the sibling table's own fix, and mutation-verified (neutering the fix makes the migration's own
  verify block correctly abort).
- **SEC-M2**: `REVOKE ALL ... FROM PUBLIC` on both RPC functions did not remove the named-role
  EXECUTE grant `pg_default_acl` places on every new function by default — measured live that
  `anon`/`authenticated` retained EXECUTE on both. Not exploitable today (both functions are
  `SECURITY INVOKER`; the underlying table REVOKE still applies), but it left two unauthenticated
  PostgREST RPC endpoints reachable and removed a layer of defense-in-depth. Fixed by revoking the
  named roles explicitly, matching the table-level REVOKE.
- **SEC-M3**: the migration's own verify block asserted its security posture in prose but didn't
  mechanically check either of the above — both SEC-M1 and SEC-M2's pre-fix states would have
  passed the original `DO $verify$` block cleanly. Both are now asserted (function-ACL check,
  `pg_trigger.tgenabled='A'` check) so a future regression on either fails the dry-run, not just a
  human reading the file.

**Also found while wiring the dual-write (TESTING F11), corrected only on the new table (TESTING
F-B):** the taste-gate call site in `eva-orchestrator.js` passed `details:` where `recordGateResult`
destructures `criteria:` — an unrecognized key silently dropped, so every taste-gate row wrote
`gate_criteria=null` on `eva_stage_gate_results` despite real evidence being available. Fixing that
call's param name was reverted: `taste_gate_sN` shares `eva_stage_gate_results`' upsert key
(`gate_type='exit'`) with the earlier `stage_gate` write at stages 10/13/16, so populating
`gate_criteria` there would clobber that write's own evidence via Supabase's column-present-only
UPDATE semantics. The fix landed only on the new `recordGateAttempt` write to
`eva_stage_gate_attempts` (a fresh INSERT per attempt, no shared-key collision) — see the "Known
limitation carried into the new table" section of the reader census below.

**Deliberately not wired in this SD, documented as a follow-up (FR-6 partial):** stamping a
chairman-override attempt's `attempt_id` into `chairman_decisions.context` /
`venture_artifacts.metadata`. `recordGateOverride` does not itself write `chairman_decisions` (that
INSERT happens in a different, not-yet-located call path) — see
`docs/reference/eva-stage-gate-tables-reader-census.md` for the full reader/writer census and the
list of what a follow-up SD should pick up.

## Applying `20260823_chairman_ratifications.sql`

```
node scripts/apply-migration.js --issue-token
MIGRATION_APPLY_TOKEN=<token from above> node scripts/apply-migration.js \
  "database/chairman-gated/20260823_chairman_ratifications.sql" --prod-deploy --allow-any-path
```

(SD-LEO-INFRA-CHAIRMAN-RATIFICATION-LEDGER-001.) Creates `chairman_ratifications`, an append-only
ledger (`freeze`/`no_delete`/`no_truncate` triggers, `ENABLE ALWAYS TRIGGER` so `SET LOCAL
session_replication_role = 'replica'` cannot suppress them) recording chairman verbal directives
that change a standing duty — closes the "ratified-never-encoded" gap: a chairman decision that
changes contract behavior is lost if the receiving seat dies/restarts before scribing it into the
DB-generated CLAUDE_*.md contract docs (D4, source packet `783ac23f7f5`). No separate acceptance
script — post-condition verification is the migration's own inline `DO $verify$` block (sanctioned
NULL->encoded transition, rejected re-encode/tamper/DELETE/TRUNCATE/invalid-target_contracts, all
via distinct custom SQLSTATEs so a broken guard cannot be silently swallowed by a sibling handler).

**After applying**, two follow-ups depend on this migration landing, neither automatic:
1. `scripts/one-off/backfill-chairman-ratifications-20260823.mjs` — seeds the week's already-
   ratified-and-encoded specimens. Currently refuses to run (by design): the specimen quote text,
   section IDs, and manifest hashes are placeholder TODOs pending a human reconciliation of a
   genuine 7-vs-9 count ambiguity in the source packet (documented in the script's own header) —
   do not fill them in by guessing.
2. The FR-3 staleness gauge (Adam/coordinator/Solomon quiet-ticks) and FR-4 regression detector
   (wired into Adam's quiet-tick) both degrade to a silent no-op until this table exists — expected,
   not a defect; both were runtime-verified against the live (then-missing) table during EXEC.

`scripts/one-off/chairman-ratification-ledger-operator-contract-waiver-001.mjs` recorded an
OPERATOR_CONTRACT gate waiver (armed_cadence/reaper, expires 2026-11-23) on `metadata` for exactly
this reason: nothing to arm a cadence against or reap until this table is live.

## Applying `20260824_leo_protocol_sections_history.sql`

```
node scripts/apply-migration.js --issue-token
MIGRATION_APPLY_TOKEN=<token from above> node scripts/apply-migration.js \
  "database/chairman-gated/20260824_leo_protocol_sections_history.sql" --prod-deploy --allow-any-path
```

(SD-LEO-INFRA-PROTOCOL-GOVERNANCE-PACKAGE-001, FR-1.) Creates `leo_protocol_sections_history`, a
Phase-A LOG-ONLY audit trail for `leo_protocol_sections` (the entire live LEO protocol ruleset,
which has no `created_at`/`updated_at` and no wired audit trail today — an existing trigger,
`trg_doctrine_constraint_sections`, is confirmed blind for this table). THREE trigger definitions
(`AFTER INSERT` no WHEN, `AFTER UPDATE` WHEN-scoped to 7 governed columns, `AFTER DELETE` no WHEN)
share one function branching on `TG_OP` — a two-trigger split throws Postgres `42P17` (a
change-scoped WHEN clause necessarily references `OLD`, which does not exist on `INSERT`, the
same way `NEW` does not exist on `DELETE`; live-probed during EXEC). The function derives its own
`channel` (`service_role` vs `postgres`, via `current_setting('role', true)`/`current_user` —
never trusted from caller-supplied metadata) and records `provenance_status`
(`present`/`missing`) plus a `metadata_key_delta`, honestly logging `missing` rather than
fabricating a value (0/286 pre-existing rows carry a provenance key today). The history table is
itself append-only (`no_update`/`no_delete`/`no_truncate` triggers, `ENABLE ALWAYS TRIGGER`,
mirroring `20260823_chairman_ratifications.sql`'s pattern). **This migration never blocks a
write** — Phase B (blocking enforcement of freeze/rate-cap/self-approval) is staged separately as
a chairman-decision proposal (`docs/architecture/protocol-governance-phase-b-proposal.md`), not
executed by this migration; LEAD-phase review found shipping Phase B immediately would itself
commit new blind-guard defects and brick a live chairman ceremony script.

Post-condition verification is the migration's own inline `DO $verify$` block (INSERT/UPDATE/
metadata-only-UPDATE-suppression/DELETE, plus append-only tamper rejection, all via distinct
custom SQLSTATEs), which only proves the `postgres`-channel branch (the block itself runs as
that direct connection). The `service_role`/PostgREST channel branch — which cannot share a
transaction with the DO block, since a REST call is a separate connection that auto-commits — is
proven separately:

```
node database/chairman-gated/20260824_leo_protocol_sections_history_dry_run.mjs
```

Step 1 (works pre- or post-apply) re-runs the full UP file body — table, function, three
triggers, append-only guards, posture, and its own `DO $verify$` block — inside a
script-controlled transaction that always `ROLLBACK`s (live-run during EXEC: PASS, zero lasting
trace confirmed by direct query afterward). Step 2 (post-apply only) performs a disposable,
self-cleaning `supabase-js`/service-role INSERT and confirms the resulting history row records
`channel='service_role'`, then explicitly deletes both the probe section and its own history row
(a REST write cannot be rolled back) — skips gracefully with a clear message if run before the
migration is actually applied.

## Dry-run proof for `database/migrations/20260722_stage_advancement_advance_venture_stage_gate_type_ssot.sql`

Authored by SD-LEO-INFRA-RECONCILE-EHG-REPO-001, re-verified here for SD-LEO-INFRA-MINUS-GATE-SSOT-001
(T-minus P2, FR-2). Note the unusual split: **the migration itself lives in `database/migrations/`**
(not this directory) — the TIER-2 default-deny gate (`SD-LEO-INFRA-TIER-GATE-FLAG-001`) already
protects it there because `CREATE OR REPLACE FUNCTION` is not provably additive, so it is not
auto-applied by the handoff pipeline. Its own header carries the full `@chairman-gated` / `STATUS:
STAGED` / `NEVER self-apply` markers. Only the dry-run proof script lives here.

```
node database/chairman-gated/20260722_stage_advancement_advance_venture_stage_gate_type_ssot_dry_run.mjs
```

Runs the migration body — `CREATE OR REPLACE FUNCTION advance_venture_stage(...)` plus its own `DO
$verify$` block (10 ASSERTs: hardcoded `v_kill_gates`/`v_promotion_gates`/`v_all_gates` arrays gone,
the `venture_stages` SSOT read landed, all preserved behavior intact) — inside a transaction that
always `ROLLBACK`s, against live data. Re-run confirms the staged migration still applies cleanly and
its self-verification still passes with no drift since 2026-07-24 authoring.

**This SD's completion does NOT include applying this migration.** The apply ceremony (`--issue-token`
then `--prod-deploy`, no `--allow-any-path` needed since the file already resolves inside
`database/migrations/`) remains a separate, explicit chairman GO decision — the file has no
`@approved-by:` marker and this SD does not add one. See the migration file's own header for the full
behavior-delta analysis (S10/S16/S19/S25 promotion-gate enforcement begins; S23/S24 kill/promotion
labels correct) and its documented deploy-time blast radius / pre-deploy census requirement.

## The underlying finding, which outlives this SD

SUPERSEDED (SD-LEO-INFRA-TIER-GATE-FLAG-001): the TIER-2 default-deny protection is now ACTIVE by default — the gate reads the `LEO_MIGRATION_TIER_GATE_BYPASS` flag and fails CLOSED, so it holds unless a bypass is deliberately enabled. The text below described the prior state, in which the protection was inert
repo-wide. Any worker adding non-additive DDL to `database/migrations/` today gets it auto-applied,
gate or no gate. That is worth deciding on its own merits — either turn the gate on, or stop
describing TIER-2 as deferred — and it is out of scope for this SD.
