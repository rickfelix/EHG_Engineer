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
by `LEO_MIGRATION_TIER_GATE`, which is **unset in this repo**, and `tierGateEnabled()` returns true
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

## The underlying finding, which outlives this SD

`LEO_MIGRATION_TIER_GATE` being off means the TIER-2 default-deny protection is currently inert
repo-wide. Any worker adding non-additive DDL to `database/migrations/` today gets it auto-applied,
gate or no gate. That is worth deciding on its own merits — either turn the gate on, or stop
describing TIER-2 as deferred — and it is out of scope for this SD.
