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

## Applying `20260802_sd_mutation_audit_trigger.sql`

```
node scripts/apply-migration.js "database/chairman-gated/20260802_sd_mutation_audit_trigger.sql" \
  --prod-deploy --issue-token <token>
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
node scripts/apply-migration.js "database/chairman-gated/20260803_bound_anon_ingress_source_type_qualifier.sql" \
  --prod-deploy --issue-token <token>
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
`8d2a6a6f-dd80-43af-9ddf-17a7c4ad48ee`. Note: the `20260803` entry above uses the older
`--issue-token <token> --prod-deploy` combined form, which has the same defect — read against the
live `apply-migration.js` source before running it, not against either README entry verbatim.)

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

## The underlying finding, which outlives this SD

SUPERSEDED (SD-LEO-INFRA-TIER-GATE-FLAG-001): the TIER-2 default-deny protection is now ACTIVE by default — the gate reads the `LEO_MIGRATION_TIER_GATE_BYPASS` flag and fails CLOSED, so it holds unless a bypass is deliberately enabled. The text below described the prior state, in which the protection was inert
repo-wide. Any worker adding non-additive DDL to `database/migrations/` today gets it auto-applied,
gate or no gate. That is worth deciding on its own merits — either turn the gate on, or stop
describing TIER-2 as deferred — and it is out of scope for this SD.
