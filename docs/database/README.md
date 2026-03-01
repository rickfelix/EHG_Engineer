# Migration Documentation

This directory contains documentation about data migrations, system migrations, and architectural transitions.

## Purpose

Migration documentation captures:
- **Data migrations**: Moving data between systems or schemas
- **System migrations**: Platform or infrastructure changes
- **Architecture transitions**: Major refactoring efforts
- **Protocol upgrades**: LEO Protocol version migrations

## Difference from /database/migrations/

| Directory | Purpose |
|-----------|---------|
| `/database/migrations/` | SQL migration files (executable code) |
| `/docs/migrations/` | Migration documentation and guides |

## File Types

### Migration Guides
```
{SYSTEM}_{TYPE}_MIGRATION_GUIDE.md
```

Step-by-step instructions for performing migrations:
- Pre-migration checklist
- Migration steps
- Validation procedures
- Rollback instructions

### Migration Summaries
```
{SYSTEM}_migration-summary.md
```

Post-migration documentation:
- What was migrated
- Issues encountered
- Lessons learned
- Remaining work

### Migration Plans
```
{SYSTEM}_MIGRATION_PLAN.md
```

Upcoming migration planning:
- Scope and objectives
- Timeline and milestones
- Risk assessment
- Resource requirements

## Common Migration Types

### Database Schema Migrations
- Adding/removing columns
- Restructuring relationships
- Data type changes
- Index optimizations

### Data Migrations
- Moving data between tables
- Transforming data formats
- Consolidating duplicate data
- Archiving historical data

### System Migrations
- Framework upgrades
- Platform changes
- Infrastructure transitions
- Service consolidations

### Protocol Migrations
- LEO Protocol version upgrades
- Workflow process changes
- Tool and agent updates

## Migration Template

```markdown
# [System] Migration Guide

**Version**: [From] → [To]
**Date**: YYYY-MM-DD
**Owner**: [Name/Team]
**Status**: [Planned/In Progress/Complete]

## Overview
[Brief description of migration]

## Pre-Migration Checklist
- [ ] Backup current system
- [ ] Test migration in staging
- [ ] Communication sent to stakeholders
- [ ] Rollback plan documented

## Migration Steps
1. [Step 1]
2. [Step 2]
...

## Validation
- [ ] Data integrity verified
- [ ] Functionality tested
- [ ] Performance acceptable
- [ ] No errors in logs

## Rollback Procedure
[How to undo migration if needed]

## Post-Migration Tasks
- [ ] Update documentation
- [ ] Monitor for issues
- [ ] Retrospective scheduled
```

## Best Practices

1. **Always test in staging first**
2. **Create backup before migration**
3. **Document rollback procedures**
4. **Validate data after migration**
5. **Monitor system after changes**
6. **Create retrospective for large migrations**

## Related Documentation

- `/database/migrations/` - Actual SQL migration files
- `/docs/reference/database-migration-validation.md` - Validation patterns
- `/docs/summaries/implementations/` - Migration completion summaries

---

*Part of LEO Protocol v4.3.3 - Migration Management*
*Updated: 2025-12-29*

## Files

- [20251015 Progress Fix Report](20251015_progress_fix_report.md)
- [Column Rename Migration Notes](column-rename-migration-notes.md)
- [Feedback Quality Config Migration Report](feedback-quality-config-migration-report.md)
- [Lifecycle Gap Migrations Summary](lifecycle-gap-migrations-summary.md)
- [Loader Consolidation](loader-consolidation.md)
- [Migration Drift Resolution 2025 10 27](migration-drift-resolution-2025-10-27.md)
- [Prd Duplicates Audit 2026 02 06](prd-duplicates-audit-2026-02-06.md)
- [PRD TABLE CONSOLIDATION REPORT](prd-table-consolidation-report.md)
- [Sub Agent Verification Report](sub-agent-verification-report.md)
- [Supabase Connection Fixed](supabase-connection-fixed.md)
- [SUPABASE CLI README](supabase-cli-readme.md)
- [US 001 DELIVERABLES](us-001-deliverables.md)
- [US 001 Developer Guide](us-001-developer-guide.md)
- [US 001 Migration Summary](us-001-migration-summary.md)
- [Vision V2 Reset And Seed Report](vision-v2-reset-and-seed-report.md)
