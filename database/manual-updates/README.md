# Manual Database Migrations

## Metadata
- **Category**: Database
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: Documentation Agent
- **Last Updated**: 2026-01-24
- **Tags**: database, migrations, manual-updates, SQL

## Overview

This directory contains **manual SQL migrations** that must be executed directly against the database, bypassing the normal Supabase migration system. These are typically used for:

1. **Hotfixes** - Critical production fixes that can't wait for normal deployment cycle
2. **Function Updates** - Modifications to existing PL/pgSQL functions and triggers
3. **Data Migrations** - Complex data transformations requiring review
4. **Trigger Fixes** - Updates to trigger logic that must be applied immediately

## When to Use Manual Migrations

### ✅ Use Manual Migrations For:
- Updating existing function definitions (CREATE OR REPLACE FUNCTION)
- Modifying trigger logic without dropping/recreating
- Critical production hotfixes
- Complex data transformations requiring human verification
- Schema changes that need immediate application

### ❌ Don't Use Manual Migrations For:
- New table creation (use Supabase migrations)
- Adding new columns (use Supabase migrations)
- Schema versioning (use Supabase migrations)
- Routine updates (use Supabase migrations)

## Execution Guidelines

### Pre-Execution Checklist
1. **Review SQL**: Carefully review the entire migration file
2. **Check Dependencies**: Ensure prerequisite migrations are applied
3. **Test in Staging**: If possible, test in staging environment first
4. **Backup**: Ensure recent database backup exists
5. **Rollback Plan**: Have rollback SQL ready if needed

### Execution Methods

#### Method 1: Supabase Dashboard (Recommended)
```
1. Navigate to Supabase Dashboard → SQL Editor
2. Open new query tab
3. Copy/paste migration SQL
4. Review carefully
5. Execute
6. Verify output/notices
```

#### Method 2: psql CLI
```bash
# Connect to database
psql $DATABASE_URL

# Execute migration file
\i database/manual-updates/20260124_fix_handoff_bypass_allowed_creators.sql

# Verify execution
\df enforce_handoff_system  -- Check function updated
```

#### Method 3: Node.js Script
```bash
# If provided with execution script
node scripts/execute-manual-migration.js database/manual-updates/FILENAME.sql
```

### Post-Execution Verification
1. **Check Notices**: Review RAISE NOTICE output in console
2. **Test Functions**: Execute test queries to verify behavior
3. **Check Logs**: Review database logs for errors
4. **Verify Data**: Query affected tables to confirm changes
5. **Document**: Update this README with execution status

## Migration Index

### 2026-01-24 - Handoff System Fixes

| File | Purpose | SD | Status | Executed By | Date |
|------|---------|----|----|-------------|------|
| `20260124_fix_handoff_bypass_allowed_creators.sql` | Add ORCHESTRATOR_AUTO_COMPLETE to allowed_creators in enforce_handoff_system trigger | SD-LEO-FIX-REMEDIATE-LEO-PROTOCOL-001 | ✅ Applied | System | 2026-01-24 |
| `20260124_fix_orchestrator_auto_complete_handoff_elements.sql` | Update complete_orchestrator_sd() to provide all 7 mandatory handoff elements | SD-LEO-FIX-REMEDIATE-LEO-PROTOCOL-001 | ✅ Applied | System | 2026-01-24 |

### Migration Details

#### `20260124_fix_handoff_bypass_allowed_creators.sql`
**Root Cause**: The enforce_handoff_system trigger blocked ORCHESTRATOR_AUTO_COMPLETE which is legitimately used by:
- complete_orchestrator_sd() function
- LeadFinalApprovalExecutor when completing child SDs

**Fix**: Updated allowed_creators array to include:
```sql
v_allowed_creators TEXT[] := ARRAY[
    'UNIFIED-HANDOFF-SYSTEM',
    'SYSTEM_MIGRATION',
    'ADMIN_OVERRIDE',
    'ORCHESTRATOR_AUTO_COMPLETE'  -- Added
];
```

**Impact**: Allows orchestrator SDs to auto-complete without handoff creation errors.

#### `20260124_fix_orchestrator_auto_complete_handoff_elements.sql`
**Root Cause**: complete_orchestrator_sd() inserted PLAN-TO-LEAD handoff with minimal fields, but auto_validate_handoff() trigger requires all 7 mandatory elements:
1. Executive Summary (>50 chars)
2. Completeness Report (non-empty JSONB)
3. Deliverables Manifest (non-empty JSONB/array)
4. Key Decisions & Rationale (non-empty JSONB/array)
5. Known Issues & Risks (non-empty JSONB/array)
6. Resource Utilization (non-empty JSONB)
7. Action Items for Receiver (non-empty JSONB/array)

**Fix**: Updated complete_orchestrator_sd() to generate all 7 elements with SD-specific content:
- Executive summary with child count and completion status
- Completeness report with metadata (children completed, dates)
- Deliverables manifest using child SD titles
- Key decisions with rationale
- Known issues (none for successful completion)
- Resource utilization with orchestrator metadata
- Action items for LEAD phase

**Impact**: Orchestrator SDs can now auto-complete through full handoff validation without errors.

## Rollback Procedures

### General Rollback Strategy
1. **Function Changes**: Use previous function definition from git history
2. **Trigger Changes**: Restore previous trigger definition
3. **Data Changes**: Use database backup or reverse transformation SQL
4. **Validation**: Test rollback in staging before production

### Specific Rollback SQL

For the 2026-01-24 migrations, rollback would involve:
```sql
-- Remove ORCHESTRATOR_AUTO_COMPLETE from allowed creators
-- (Restore to 3-item array instead of 4)
CREATE OR REPLACE FUNCTION enforce_handoff_system()
RETURNS TRIGGER AS $$
DECLARE
    v_allowed_creators TEXT[] := ARRAY[
        'UNIFIED-HANDOFF-SYSTEM',
        'SYSTEM_MIGRATION',
        'ADMIN_OVERRIDE'
        -- ORCHESTRATOR_AUTO_COMPLETE removed
    ];
BEGIN
    -- ... rest of function unchanged
END;
$$ LANGUAGE plpgsql;
```

**Note**: Rollback not recommended for these migrations as they fix critical bugs. Rolling back would re-introduce the orchestrator completion failures.

## Related Documentation

- [Strategic Directives Field Reference](../docs/database/strategic_directives_v2_field_reference.md)
- [Database Architecture](../docs/database/architecture.md)
- [LEO Protocol Handoffs](../docs/03_protocols_and_standards/LEO_v4.2_HYBRID_SUB_AGENTS.md)

## Lessons Learned

### From 2026-01-24 Migrations

**Key Learnings**:
1. **Trigger Alignment**: When multiple triggers operate on the same table (enforce_handoff_system + auto_validate_handoff), ensure their requirements are compatible
2. **Allowed Creators**: Any system-level process that creates handoffs must be in the allowed_creators whitelist
3. **7-Element Handoffs**: ALL handoff insertions must provide complete 7-element payload, even auto-generated ones
4. **Orchestrator Pattern**: Orchestrator SDs use ORCHESTRATOR_AUTO_COMPLETE as creator when completing via complete_orchestrator_sd()

**Pattern**: Dual-trigger enforcement (blocking + validation) requires centralized configuration to prevent conflicts.

**Application**: Future trigger designs should share configuration (like allowed_creators) rather than duplicating logic.

---

*Last Updated: 2026-01-24*
*Maintained by: Database Team & LEO Protocol Contributors*
