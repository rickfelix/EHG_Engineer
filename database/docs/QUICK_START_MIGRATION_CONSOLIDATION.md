# Quick Start: Migration Consolidation

## TL;DR - Execute in 3 Commands

```bash
# 1. Preview what will happen (safe, no changes)
node scripts/consolidate-migrations.cjs --dry-run

# 2. Execute the consolidation
node scripts/consolidate-migrations.cjs --execute

# 3. Verify results
ls supabase/ehg_engineer/migrations/ | wc -l  # Should be 77
ls supabase/ehg_app/migrations/ | wc -l       # Should be 52
```

## What This Does

**Before**: 192 migrations scattered across 7+ directories
**After**: Organized into 2 database-specific directories + manual review folder

## Results Summary

| Directory | Count | Purpose |
|-----------|-------|---------|
| `supabase/ehg_engineer/migrations/` | 77 | EHG_Engineer database (dedlbzhpgkmetvhbkyzq) |
| `supabase/ehg_app/migrations/` | 52 | EHG App database (liapbndqlqxdcgpwntbv) |
| `archive/migrations/manual_review/` | 63 | Needs manual categorization |
| `archive/migrations/legacy/` | 26 | Legacy files (already done) |

## After Consolidation

### Next Steps (2-4 hours)

1. **Review unknown migrations** in `archive/migrations/manual_review/`
2. **Move to correct directory** (ehg_engineer or ehg_app)
3. **Test migration path** on fresh databases
4. **Archive old directories** once validated

### Creating New Migrations

**Format**: `YYYYMMDDHHMMSS_category_description.sql`

**EHG_Engineer migrations** (SD/PRD/LEO/UAT):
```bash
# Place in: supabase/ehg_engineer/migrations/
# Example: 20251005140000_schema_add_retrospectives_table.sql
```

**EHG App migrations** (Companies/Portfolios/Ventures):
```bash
# Place in: supabase/ehg_app/migrations/
# Example: 20251005140000_schema_add_portfolio_metrics.sql
```

## Safety Notes

✅ **Safe**: Consolidation script only COPIES files, never deletes
✅ **Reversible**: Original files remain untouched
⚠️ **Verify**: Always test on staging before production

## Full Documentation

See `database/docs/MIGRATION_CONSOLIDATION_README.md` for complete details.
