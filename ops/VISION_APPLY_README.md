# 🎯 Vision Data Population Guide

## Overview

This guide covers safely populating Strategic Directives (SDs), Product Requirements (PRDs), and optionally User Stories to production database.

## 🚦 Pre-Flight Checklist

Run the readiness checker:
```bash
./scripts/vision-prod-ready-check.sh
```

Must pass ALL checks:
- [ ] GitHub Secrets configured (PGHOST_PROD, PGPORT_PROD, etc.)
- [ ] GitHub Variables set (APPLY_VISION_GOV=1)
- [ ] Manifests present in `ops/inbox/`
- [ ] Manifest validation passes
- [ ] Workflow files exist

## 📋 Manifest Requirements

### SD Manifest (`ops/inbox/vision_sd_manifest.csv`)
Required columns:
- `sd_key` - Unique identifier (SD-XXX format)
- `title` - Descriptive title
- `priority` - Integer 0-100
- `owner` - Email or team name
- `decision_log_ref` - Link to decision documentation
- `evidence_ref` - Link to supporting evidence

### PRD Manifest (`ops/inbox/vision_prd_manifest.csv`)
Required columns:
- `title` - PRD title
- `sd_key` - Links to SD (must exist)
- `completeness_score` - Integer 0-100
- `risk_rating` - low/medium/high
- `acceptance_criteria_json` - JSON array of criteria

## 🚀 Quick Start (Recommended Path)

```bash
# 1. Validate everything
./scripts/vision-prod-ready-check.sh

# 2. Run smoke test (dry-run preview)
./scripts/vision-smoke-test.sh

# 3. If everything looks good, apply to production
./scripts/apply-vision-to-prod.sh
```

## 📊 Execution Paths

### Path A: GitHub Actions (Triple-Guarded)

```bash
# Set up (one-time)
gh variable set APPLY_VISION_GOV -b "1"
gh variable set PROD_WRITE_OK -b "1"

# Dry-run preview
gh workflow run "Vision Governance Apply (Prod)" -f dry_run=true

# Production apply (requires PROMOTE)
gh workflow run "Vision Governance Apply (Prod)" -f dry_run=false -f confirm=PROMOTE
```

### Path B: Direct SQL (Immediate)

```bash
# Use connection string from secrets (don't hardcode)
export DATABASE_URL="postgresql://..."

# Apply SDs and PRDs
psql "$DATABASE_URL" \
  -v ON_ERROR_STOP=1 \
  -v DRY_RUN=0 \
  -f ops/jobs/vision_apply_governance_staging.sql

# Apply Stories (if applicable)
psql "$DATABASE_URL" \
  -v ON_ERROR_STOP=1 \
  -v DRY_RUN=0 \
  -f ops/jobs/vision_apply_stories_staging.sql
```

## ✅ Verification Queries

After apply, run these to verify:

```sql
-- New SDs (last hour)
SELECT sd_key, title, owner, created_at
FROM strategic_directives_v2
WHERE created_at >= now() - interval '1 hour'
ORDER BY created_at DESC;

-- New PRDs linked to SDs
SELECT p.title, p.sd_id, p.completeness_score, p.created_at
FROM product_requirements_v2 p
WHERE p.created_at >= now() - interval '1 hour'
ORDER BY p.created_at DESC;

-- Check linkage integrity
SELECT s.sd_key, COUNT(p.id) AS prd_count
FROM strategic_directives_v2 s
LEFT JOIN product_requirements_v2 p ON p.sd_id = s.id
WHERE s.created_at >= now() - interval '1 hour'
GROUP BY s.sd_key;
```

## 📈 Quality Impact Verification

After population, run these workflows to see improvements:

```bash
# Check gap reduction
gh workflow run "Vision Alignment (Prod, Read-Only)"

# Check WSJF score improvements
gh workflow run "WSJF Recommendations (Prod, Read-Only)"

# Check backlog integrity
gh workflow run "Backlog Integrity - Staging Read-Only"
```

Expected improvements:
- SD gaps ↓ (fewer SDs without PRDs)
- PRD gaps ↓ (fewer PRDs without stories)
- AC coverage ↑ (more acceptance criteria)
- WSJF scores improved (better completeness)

## 🔄 Rollback Procedures

### Option 1: Use Audit PR Rollback Script
```bash
# Find in audit/vision/{run_id}/rollback.sql
psql "$DATABASE_URL" -f audit/vision/{run_id}/rollback.sql
```

### Option 2: Time-Based Rollback
```sql
BEGIN;
-- Delete PRDs created in last hour
DELETE FROM product_requirements_v2
WHERE created_at >= now() - interval '1 hour';

-- Delete SDs created in last hour
DELETE FROM strategic_directives_v2
WHERE created_at >= now() - interval '1 hour';

-- Verify before committing
SELECT 'Will delete', COUNT(*), 'PRDs' FROM product_requirements_v2
WHERE created_at >= now() - interval '1 hour'
UNION ALL
SELECT 'Will delete', COUNT(*), 'SDs' FROM strategic_directives_v2
WHERE created_at >= now() - interval '1 hour';

-- COMMIT; -- Uncomment to execute
```

## ⚠️ Common Issues & Solutions

### Issue: "sd_key not found" error
**Solution**: Ensure SD exists before linking PRDs. Either include in same batch or pre-create.

### Issue: RLS/Permission denied
**Solution**: Use service-role credentials or ensure user has INSERT permissions on target tables.

### Issue: Duplicate sd_key
**Solution**: Check existing SDs with:
```sql
SELECT sd_key FROM strategic_directives_v2 WHERE sd_key LIKE 'SD-%';
```

### Issue: Invalid JSON in acceptance_criteria
**Solution**: Validate JSON format. Use `[]` for empty criteria.

### Issue: Workflow not running
**Solution**: Check variables are set:
```bash
gh variable list | grep VISION
```

## 📝 Manifest Generation

If you need to regenerate manifests from existing gaps:

```bash
# Run Vision Alignment to detect gaps
gh workflow run "Vision Alignment (Prod, Read-Only)"

# Download artifacts and find manifests in:
# - ops/checks/out/gap_sd_metadata.csv
# - ops/checks/out/gap_prd_contract.csv

# Copy to inbox and fill in required fields
cp ops/checks/out/gap_*.csv ops/inbox/
# Then edit to add owners, decision_log_ref, etc.
```

## 🎯 Success Criteria

After successful population:
1. ✅ All SDs have owners and decision references
2. ✅ All PRDs linked to valid SDs
3. ✅ Acceptance criteria present (>0 items)
4. ✅ Completeness scores realistic (40-90 range)
5. ✅ Risk ratings assigned (low/medium/high)
6. ✅ Audit PR created with full trail
7. ✅ Rollback script available

## 📞 Support

- **Workflow Issues**: Check GitHub Actions logs
- **Database Issues**: Verify connection with `psql $DATABASE_URL -c "SELECT 1"`
- **Manifest Issues**: Run `./scripts/validate-vision-manifests.sh`
- **Rollback Needed**: Use audit PR rollback.sql

---

*Last Updated: 2025-09-22*
*Pipeline Version: 1.0.0*