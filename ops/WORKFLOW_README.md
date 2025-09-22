# Housekeeping Workflows Guide

## Overview

Two GitHub Actions workflows provide complete database operations without any local tool installation:

1. **Staging (Self-Contained)**: Ephemeral Postgres for testing
2. **Production Promotion**: Guarded production database updates

## 1. Staging Workflow

**File**: `.github/workflows/housekeeping-staging-selfcontained.yml`

### Purpose
- Test database changes in isolated environment
- Verify CI smoke tests
- Validate boundary enforcement
- No external dependencies

### How to Run
1. Go to: Actions → "Housekeeping Staging (Self-Contained)"
2. Click "Run workflow"
3. Click green "Run workflow" button

### What It Does
- Spins up ephemeral Postgres 16 container
- Applies all migrations/views/policies
- Seeds test data
- Runs verification checks
- Tests boundary tripwire
- Commits audit log

### Success Criteria
✅ All steps green
✅ Audit log auto-committed
✅ No boundary violations

## 2. Production Promotion Workflow

**File**: `.github/workflows/housekeeping-prod-promotion.yml`

### Purpose
- Safely promote database changes to production
- Create audit trail via PR
- Enforce all safety checks

### Prerequisites
Set these GitHub Secrets:
- `PGHOST_PROD`
- `PGPORT_PROD`
- `PGDATABASE_PROD`
- `PGUSER_PROD`
- `PGPASSWORD_PROD`

### How to Run
1. Go to: Actions → "Housekeeping Prod Promotion"
2. Click "Run workflow"
3. Type exactly: `PROMOTE` in confirmation field
4. Click green "Run workflow" button

### What It Does
1. **Precheck**: Verify connectivity
2. **Backup**: Schema-only snapshot
3. **Apply**: Transactional migration batch
4. **Verify**: Objects and RLS checks
5. **Audit**: Create PR with changes

### Safety Features
- Requires explicit "PROMOTE" confirmation
- Schema backup before changes
- Transactional (all-or-nothing)
- RLS fail-closed enforcement
- Boundary violation detection
- Audit via PR (not direct push)

## For Codex

### Staging Operations
```bash
# Trigger via GitHub UI or API
gh workflow run housekeeping-staging-selfcontained.yml
```

### Production Operations
```bash
# Requires confirmation
gh workflow run housekeeping-prod-promotion.yml -f confirm=PROMOTE
```

### Check Results
```bash
# View latest runs
gh run list --workflow housekeeping-staging-selfcontained.yml
gh run list --workflow housekeeping-prod-promotion.yml

# View specific run
gh run view [RUN_ID]
```

## Boundary Enforcement

Both workflows enforce two-app separation:
- ❌ Venture code → Governance tables (forbidden)
- ❌ Venture code → Engineering schema (forbidden)
- ✅ Engineering → Engineering (allowed)
- ✅ Venture → Venture (allowed)

## Rollback Procedures

### Staging
No rollback needed - ephemeral container destroyed after run.

### Production
1. Locate backup: `ops/audit/prod_schema_before_*.sql`
2. Review and apply relevant rollback statements
3. Create incident report
4. Update audit log

## Support

- Workflow issues: Check Actions tab for logs
- Database issues: Review audit files in `ops/audit/`
- Permission issues: Verify GitHub Secrets are set