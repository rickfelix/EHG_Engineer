# Codex Handoff - Staging Execution Sequence

## NEW: No npm or psql Required!

Codex can now execute database operations without any tool installation:

### Option 1: Use the bundled dbexec tool (no npm needed)

```bash
# Test connection
echo "SELECT version();" > /tmp/test.sql
node tools/dbexec/dbexec.bundle.mjs /tmp/test.sql --env .env.staging

# Run any SQL file
node tools/dbexec/dbexec.bundle.mjs ops/checks/verify_objects.sql --env .env.staging
node tools/dbexec/dbexec.bundle.mjs ops/checks/verify_rls.sql --env .env.staging
```

### Option 2: Ask Rick to trigger GitHub Actions

Tell Rick to:
1. Go to GitHub Actions → "Housekeeping Staging"
2. Click "Run workflow"
3. Select dry_run: true/false
4. Click "Run workflow"

The workflow will run all scripts automatically and update the audit log.

### Option 3: Use psql wrapper scripts (if Docker is available)

Execute the previously defined steps in this order:
1) `bash ops/scripts/staging_apply.sh`
2) `bash ops/scripts/run_checks.sh`
3) `bash ops/scripts/run_backfills.sh`
4) `bash ops/jobs/hydrate_vh_linkage.sh`
5) Dry-run ingest: `VH_INGEST_ENABLED=true VH_INGEST_DRY_RUN=true node apps/ingest/vh_governance_ingest.ts`

---

## Original Message for Codex

Copy and paste this exact message to Codex:

Use these staging credentials:
```
PGHOST=127.0.0.1
PGPORT=5434
PGDATABASE=ehg_stage
PGUSER=codex_staging
PGPASSWORD=cdx_K9mN3pQ7wL5xR2vT8bF6hJ4sD1aG
```

Execute the previously defined steps in this order:
1) `bash ops/scripts/staging_apply.sh`
2) `bash ops/scripts/run_checks.sh`
3) `bash ops/scripts/run_backfills.sh`
4) `bash ops/jobs/hydrate_vh_linkage.sh`
5) Dry-run ingest: `VH_INGEST_ENABLED=true VH_INGEST_DRY_RUN=true node apps/ingest/vh_governance_ingest.ts`

Append results to `ops/audit/2025-09-22.md` under `## Automation Close-Out`.

---

## Quick Copy Block

For easy environment variable export:
```bash
export PGHOST=127.0.0.1
export PGPORT=5434
export PGDATABASE=ehg_stage
export PGUSER=codex_staging
export PGPASSWORD=cdx_K9mN3pQ7wL5xR2vT8bF6hJ4sD1aG
```

## Notes for Codex

1. **Time limit**: Your credentials expire in 8 hours from creation
2. **Permissions**: You have INSERT/UPDATE on eng_* and vh_* tables, but no DDL rights
3. **Audit trail**: All changes are logged to audit.change_log
4. **Dry run default**: The environment has DRY_RUN_DEFAULT=true set
5. **RLS active**: Row-level security is enforced on all tables

## Validation Checklist for Codex

Before starting:
- [ ] Test connection: `psql $DATABASE_URL -c "SELECT current_user, now()"`
- [ ] Verify schemas exist: `psql $DATABASE_URL -c "\dn"`
- [ ] Check user permissions: `psql $DATABASE_URL -c "\du codex_staging"`

After each step:
- [ ] Record row counts affected
- [ ] Note any warnings or errors
- [ ] Verify audit.change_log has entries

## Expected Outcomes

1. **staging_apply.sh**: All migrations applied without errors
2. **run_checks.sh**: Schema validation passes, RLS confirmed
3. **run_backfills.sh**: Historical data populated correctly
4. **hydrate_vh_linkage.sh**: Cross-app linkages established
5. **vh_governance_ingest.ts**: Dry run shows expected transformations

## Failure Handling

If any step fails:
1. Document the exact error in ops/audit/2025-09-22.md
2. Do NOT proceed to next step
3. Report back with:
   - Step that failed
   - Error message
   - Query/command that triggered failure
   - Suggested fix

## Success Criteria

All steps complete with:
- Zero ERROR level messages
- All assertions pass
- Audit trail shows expected operations
- Dry run ingest produces valid output