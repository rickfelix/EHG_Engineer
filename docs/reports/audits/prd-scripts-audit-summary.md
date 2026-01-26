# PRD Scripts Audit Summary


## Metadata
- **Category**: Report
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, migration, schema, guide

**Date**: 2025-10-19
**Audit Tool**: `scripts/audit-all-prd-scripts.js`
**Full Report**: `docs/prd-audit-results.json`

---

## 📊 Executive Summary

| Metric | Count | Percentage |
|--------|-------|------------|
| **Total PRD Scripts** | 75 | 100% |
| **✅ Clean Scripts** | 7 | 9% |
| **⚠️ Scripts with Issues** | 68 | **91%** |
| **🔴 Critical Issues (Missing sd_uuid)** | 61 | **81%** |

**Status**: 🔴 **CRITICAL - Immediate Action Required**

---

## 🚨 Top Issues

### 1. Missing `sd_uuid` Field (61 scripts - CRITICAL)

**Impact**: Handoff validation will fail, PRDs can't be linked to Strategic Directives

**Scripts Affected**: 61 out of 75 (81%)

**Fix Pattern**:
```javascript
// BEFORE creating PRD, fetch SD uuid_id
const { data: sdData, error: sdError } = await supabase
  .from('strategic_directives_v2')
  .select('uuid_id')
  .eq('id', sdId)
  .single();

if (sdError || !sdData) {
  console.log(`❌ Strategic Directive ${sdId} not found`);
  process.exit(1);
}

// THEN include in PRD insert
const prdData = {
  id: prdId,
  directive_id: sdId,  // Legacy field
  sd_uuid: sdData.uuid_id,  // ✅ CRITICAL: Required for handoffs
  title: '...',
  // ... rest of fields
};
```

**Reference**: `scripts/add-prd-to-database.js:76-99`

---

### 2. Using `user_stories` Field (28 scripts)

**Impact**: Data not stored (field doesn't exist in product_requirements_v2)

**Why Wrong**: User stories belong in separate `user_stories` table, not PRD table

**Fix**: Remove from PRD insert, use separate table:
```javascript
// ❌ DON'T DO THIS
const prd = {
  id: 'PRD-...',
  user_stories: [...]  // Field doesn't exist!
};

// ✅ DO THIS INSTEAD
// 1. Create PRD without user_stories
// 2. Create user stories separately in user_stories table
// 3. Link via foreign key: user_stories.prd_id = prd.id
```

---

### 3. Using `success_metrics` Field (14 scripts)

**Impact**: Data silently dropped (field doesn't exist)

**Fix**: Store in `metadata` JSONB field:
```javascript
// ❌ WRONG
const prd = {
  success_metrics: [...]  // Doesn't exist
};

// ✅ CORRECT
const prd = {
  metadata: {
    success_metrics: [
      { metric: '...', target: '...', measurement: '...' }
    ]
  }
};
```

---

### 4. Using `prd_id` Field (7 scripts)

**Impact**: Redundant field, use `id` instead

**Fix**: Simple rename:
```javascript
// ❌ WRONG
const prd = {
  id: randomUUID(),
  prd_id: 'PRD-SD-001',  // Redundant!
  // ...
};

// ✅ CORRECT
const prd = {
  id: 'PRD-SD-001',  // Just use id
  // ...
};
```

---

### 5. Using `strategic_directive_id` Field (2 scripts)

**Impact**: Wrong field name, should be `sd_uuid`

**Fix**:
```javascript
// ❌ WRONG
const prd = {
  strategic_directive_id: 'SD-001'  // Wrong field
};

// ✅ CORRECT
const prd = {
  sd_uuid: sdData.uuid_id  // UUID from strategic_directives_v2
};
```

---

## 📋 Complete Field Mapping Guide

| ❌ Invalid Field | ✅ Correct Field | Type | Notes |
|-----------------|-----------------|------|-------|
| `strategic_directive_id` | `sd_uuid` | UUID | Fetch from strategic_directives_v2.uuid_id |
| `prd_id` | `id` | VARCHAR | Primary key, no separate prd_id |
| `user_stories` | (separate table) | N/A | Use user_stories table with foreign key |
| `success_metrics` | `metadata.success_metrics` | JSONB | Store in metadata object |
| `database_changes` | `metadata.database_changes` | JSONB | Store in metadata object |
| `complexity_score` | `metadata.complexity_score` | JSONB | Store in metadata object |
| `ui_components` | `metadata.ui_components` | JSONB | Store in metadata object |
| `objectives` | `metadata.objectives` | JSONB | Store in metadata object |
| `risks_and_mitigations` | `risks` | JSONB | Use standard field |
| `technical_architecture` | `system_architecture` | TEXT | Renamed field |
| `problem_statement` | `business_context` | TEXT | Semantic mapping |
| `deployment_plan` | `metadata.deployment_plan` | JSONB | Store in metadata |
| `documentation_requirements` | `metadata.docs` | JSONB | Store in metadata |
| `estimated_effort_hours` | `metadata.estimated_hours` | JSONB | Store in metadata |
| `target_completion_date` | `planned_end` | TIMESTAMP | Use standard field |

---

## 🔧 Scripts Already Fixed

1. ✅ **add-prd-to-database.js** - Fixed ui_components to use metadata
2. ✅ **audit-all-prd-scripts.js** - Created for batch auditing
3. ✅ **lib/prd-schema-validator.js** - Created for validation

---

## 📝 Scripts Requiring Critical Fixes (Missing sd_uuid)

### High Priority (Create/Update PRD Scripts)

1. `create-prd-sd-knowledge-001.js` (10 issues)
2. `create-prd-retro-enhance-001.js` (8 issues)
3. `create-prd-sd-agent-admin-002.js` (6 issues)
4. `create-prd-sd-backend-001.js` (6 issues)
5. `create-prd-sd-047a.js` (4 issues)
6. `create-prd-subagent-001.js` (4 issues)
7. `create-prd-sd-041b.js` (3 issues)
8. `create-prd-sd-uat-020.js` (3 issues)
9. `create-prd-knowledge-001-v2.js` (3 issues)
10. `create-prd-phase3-complete.js` (2 issues)

### Medium Priority (Helper/Utility Scripts)

- All other `create-prd-*.js` scripts
- `generate-prd-from-sd.js`
- `update-prd-*.js` scripts
- `populate-prd-*.js` scripts

---

## 🎯 Recommended Action Plan

### Phase 1: Immediate (1 day)
1. ✅ **DONE**: Fix add-prd-to-database.js
2. ✅ **DONE**: Create audit tool
3. ✅ **DONE**: Create validation library
4. **TODO**: Test main fix with real SD
5. **TODO**: Document fix patterns

### Phase 2: High Priority (2-3 days)
1. Fix top 10 most-used scripts (create-prd-sd-*.js)
2. Add sd_uuid population pattern to each
3. Move invalid fields to metadata
4. Test each fixed script

### Phase 3: Cleanup (1 week)
1. Fix remaining 58 scripts
2. Add schema validation to each script
3. Update script templates

### Phase 4: Prevention (Ongoing)
1. Add pre-commit hook for schema validation
2. Update documentation with correct patterns
3. Create PR template checklist for PRD scripts
4. Add CI/CD check for schema compliance

---

## 🛡️ Prevention Strategy

### 1. Pre-Commit Hook

Create `.husky/pre-commit`:
```bash
#!/bin/sh
# Check for schema validation in modified PRD scripts
node scripts/validate-prd-schema-in-changed-files.js
```

### 2. Script Template

Create `templates/prd-script-template.js`:
```javascript
import { validatePRDSchema, sanitizePRDData } from '../lib/prd-schema-validator.js';

// Fetch SD uuid_id
const { data: sdData } = await supabase
  .from('strategic_directives_v2')
  .select('uuid_id')
  .eq('id', sdId)
  .single();

// Build PRD data
const prdData = {
  id: `PRD-${sdId}`,
  sd_uuid: sdData.uuid_id,  // CRITICAL
  directive_id: sdId,
  title: '...',
  // ... use only valid fields
};

// Validate before insert
const validation = validatePRDSchema(prdData);
if (!validation.valid) {
  console.error('Schema validation failed:', validation.errors);
  process.exit(1);
}

// Insert
const { data, error } = await supabase
  .from('product_requirements_v2')
  .insert(prdData);
```

### 3. Documentation

- ✅ Created: `docs/PRD_SCHEMA_AUDIT_REPORT.md`
- ✅ Created: `docs/PRD_SCRIPTS_AUDIT_SUMMARY.md`
- 🔜 TODO: `docs/PRD_SCRIPT_BEST_PRACTICES.md`
- 🔜 TODO: Update `docs/reference/database-agent-patterns.md`

---

## 📈 Success Metrics

| Metric | Current | Target | Timeline |
|--------|---------|--------|----------|
| Scripts with sd_uuid | 14 (19%) | 75 (100%) | 1 week |
| Scripts using invalid fields | 68 (91%) | 0 (0%) | 2 weeks |
| Schema validation coverage | 1 (1%) | 75 (100%) | 1 week |
| Clean audit pass rate | 7 (9%) | 75 (100%) | 2 weeks |

---

## 🔗 References

- **Main Audit Report**: `/docs/PRD_SCHEMA_AUDIT_REPORT.md`
- **Audit Results JSON**: `/docs/prd-audit-results.json`
- **Schema Validator**: `/lib/prd-schema-validator.js`
- **Audit Tool**: `/scripts/audit-all-prd-scripts.js`
- **Fixed Template**: `/scripts/add-prd-to-database.js`
- **Database Schema**: `/database/schema/004_prd_schema.sql`
- **Column Descriptions**: `/database/migrations/010_add_prd_column_descriptions.sql`

---

## ✅ Next Steps

1. Test add-prd-to-database.js fix with real SD creation
2. Create automated fix script for top 10 critical scripts
3. Run fixes and verify with audit tool
4. Update documentation
5. Add pre-commit hook
6. Train team on new validation process

---

**Generated**: 2025-10-19 by Claude Code
**Last Updated**: 2025-10-19
