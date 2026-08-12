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

## The underlying finding, which outlives this SD

SUPERSEDED (SD-LEO-INFRA-TIER-GATE-FLAG-001): the TIER-2 default-deny protection is now ACTIVE by default — the gate reads the `LEO_MIGRATION_TIER_GATE_BYPASS` flag and fails CLOSED, so it holds unless a bypass is deliberately enabled. The text below described the prior state, in which the protection was inert
repo-wide. Any worker adding non-additive DDL to `database/migrations/` today gets it auto-applied,
gate or no gate. That is worth deciding on its own merits — either turn the gate on, or stop
describing TIER-2 as deferred — and it is out of scope for this SD.
