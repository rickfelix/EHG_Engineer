# GitHub Actions Setup for Database Housekeeping

## Required Steps to Enable CI Execution

### 1. Add Repository Secrets

Navigate to: **Settings → Secrets and variables → Actions**

Add these repository secrets:

| Secret Name | Example Value | Description |
|------------|---------------|-------------|
| `PGHOST_STAGING` | `db.staging.example.com` | Staging database host |
| `PGPORT_STAGING` | `5432` | Database port (usually 5432) |
| `PGDATABASE_STAGING` | `ehg_stage` | Database name |
| `PGUSER_STAGING` | `codex_staging` | Database user |
| `PGPASSWORD_STAGING` | `[secure password]` | Database password |

### 2. Trigger the Workflow

1. Go to the **Actions** tab in your repository
2. Click on **"Housekeeping Staging"** in the left sidebar
3. Click **"Run workflow"** button
4. Select options:
   - **dry_run**: Choose `true` for safe testing, `false` for actual execution
5. Click **"Run workflow"** (green button)

### 3. Monitor Execution

The workflow will:
1. ✅ Set up PostgreSQL client
2. ✅ Test database connection
3. ✅ Apply staging migrations
4. ✅ Run verification checks
5. ✅ Backfill governance data
6. ✅ Hydrate venture linkages
7. ✅ Test dbexec bundle
8. ✅ Generate audit report
9. ✅ Upload artifacts
10. ✅ Commit audit updates

### 4. Review Results

After completion:
- Check the workflow run summary
- Download the audit log artifact
- Review the automated commit to `ops/audit/2025-09-22.md`

## Alternative: Local Execution with Docker

If you have Docker installed locally:

```bash
# 1. Start staging database
cd ops/stage
docker-compose up -d

# 2. Wait for database to be ready
docker-compose ps

# 3. Run the full sequence
cd ../..
bash ops/scripts/staging_apply.sh
bash ops/scripts/run_checks.sh
bash ops/scripts/run_backfills.sh
bash ops/jobs/hydrate_vh_linkage.sh

# 4. Test ingest (dry-run)
VH_INGEST_ENABLED=true VH_INGEST_DRY_RUN=true node apps/ingest/vh_governance_ingest.ts
```

## Troubleshooting

### Workflow fails at "Test database connection"
- Verify all 5 secrets are set correctly
- Check that the staging database is accessible from GitHub Actions runners
- Ensure the database user has proper permissions

### Workflow succeeds but no audit commit
- Check if the branch has protection rules
- Verify the workflow has write permissions to the repository
- Look for the audit artifact in the workflow run

### Database operations fail
- Review the workflow logs for specific SQL errors
- Check that the database schema matches expected structure
- Verify RLS policies aren't blocking operations

## Security Notes

- Secrets are masked in logs automatically
- Use time-boxed credentials when possible
- Review audit logs regularly
- Never commit actual credentials to the repository