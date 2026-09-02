---
category: guide
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [guide, auto-generated]
---
# PRD Script Developer Guide



## Table of Contents

- [Metadata](#metadata)
- [🚀 Quick Start](#-quick-start)
  - [Creating a New PRD Script](#creating-a-new-prd-script)
- [📝 npm Scripts](#-npm-scripts)
  - [Audit & Validation](#audit-validation)
  - [Existing PRD Tools](#existing-prd-tools)
- [🛡️ Pre-Commit Hook](#-pre-commit-hook)
  - [What It Checks](#what-it-checks)
  - [If Validation Fails](#if-validation-fails)
  - [Bypass (Emergency Only)](#bypass-emergency-only)
- [📋 Valid Schema Fields Reference](#-valid-schema-fields-reference)
  - [✅ Always Valid Fields](#-always-valid-fields)
  - [❌ Invalid Fields (Use Instead)](#-invalid-fields-use-instead)
- [🔍 Using the Schema Validator](#-using-the-schema-validator)
  - [In Your Scripts](#in-your-scripts)
  - [Sanitize Data Automatically](#sanitize-data-automatically)
- [🎯 Required Pattern: sd_uuid Population](#-required-pattern-sd_uuid-population)
- [🏗️ Storing Custom Fields](#-storing-custom-fields)
- [🧪 Testing Your Script](#-testing-your-script)
  - [Before Committing](#before-committing)
  - [After Creating PRD](#after-creating-prd)
- [🔧 Common Issues & Fixes](#-common-issues-fixes)
  - [Issue: "Missing sd_uuid field"](#issue-missing-sd_uuid-field)
  - [Issue: "user_stories field doesn't exist"](#issue-user_stories-field-doesnt-exist)
  - [Issue: "strategic_directive_id not recognized"](#issue-strategic_directive_id-not-recognized)
- [📚 Additional Resources](#-additional-resources)
- [🎓 Best Practices Checklist](#-best-practices-checklist)

## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, api, testing, migration

**Quick Reference** for creating and maintaining PRD scripts

---

## 🚀 Quick Start

### Creating a New PRD Script

```bash
# 1. Copy the template
cp templates/prd-script-template.js scripts/create-prd-sd-XXX.js

# 2. Edit the new script
# - Replace TEMPLATE_SD_ID with your SD ID
# - Replace TEMPLATE PRD Title with your PRD title
# - Fill in TODO sections

# 3. Run the script
node scripts/create-prd-sd-XXX.js
```

The template includes:
- ✅ Automatic `sd_uuid` population
- ✅ Schema validation before insert
- ✅ All valid fields with examples
- ✅ Proper error handling
- ✅ Clear TODO markers

---

## 📝 npm Scripts

### Audit & Validation

```bash
# Audit all PRD scripts for schema compliance
npm run prd:audit

# See example usage of schema validator
npm run prd:schema

# Auto-fix common schema issues (creates .backup files)
npm run prd:audit:fix

# Preview fixes without applying (dry-run mode)
npm run prd:audit:dry
```

### Existing PRD Tools

```bash
npm run prd:validate     # Validate PRD format
npm run prd:fix          # Fix PRD format issues
npm run prd:health       # Health check
npm run prd:check        # SD check
npm run prd:report       # Format report
```

---

## 🛡️ Pre-Commit Hook

The pre-commit hook **automatically validates** PRD scripts before allowing commits:

### What It Checks

1. ✅ Smoke tests pass
2. ✅ No deprecated fields (strategic_directive_id, prd_id, etc.)
3. ✅ No invalid fields (user_stories, ui_components, etc.)
4. ⚠️  Warning if sd_uuid missing

### If Validation Fails

```bash
❌ PRD Schema Validation Failed: scripts/create-prd-bad.js

Found deprecated/invalid fields:
    strategic_directive_id: 'SD-001',
    user_stories: [...],

💡 Fix suggestions:
   - strategic_directive_id → sd_uuid
   - user_stories → (use separate table)

🔧 Run 'npm run prd:audit:fix scripts/create-prd-bad.js' to auto-fix
```

### Bypass (Emergency Only)

```bash
# NOT RECOMMENDED - only for emergencies
git commit --no-verify -m "message"
```

---

## 📋 Valid Schema Fields Reference

### ✅ Always Valid Fields

**Primary Keys & Foreign Keys:**
- `id` - PRD ID (e.g., 'PRD-SD-001')
- `sd_uuid` - **CRITICAL**: UUID from strategic_directives_v2
- `directive_id` - String SD ID (backward compatibility)
- `sd_id` - Alias for directive_id

**Core Metadata:**
- `title`, `version`, `status`, `category`, `priority`

**Content Fields:**
- `executive_summary`, `business_context`, `technical_context`
- `system_architecture`, `implementation_approach`
- `content`, `evidence_appendix`

**JSONB Fields:**
- `functional_requirements`, `non_functional_requirements`, `technical_requirements`
- `data_model`, `api_specifications`, `ui_ux_requirements`
- `technology_stack`, `dependencies`
- `test_scenarios`, `acceptance_criteria`, `performance_requirements`
- `plan_checklist`, `exec_checklist`, `validation_checklist`
- `risks`, `constraints`, `assumptions`
- `stakeholders`, `phase_progress`, `backlog_items`
- `metadata` - Store custom fields here!

**Dates:**
- `planned_start`, `planned_end`, `actual_start`, `actual_end`
- `approval_date`, `created_at`, `updated_at`

**Progress:**
- `progress` (0-100), `phase`

**Audit:**
- `created_by`, `updated_by`, `approved_by`

### ❌ Invalid Fields (Use Instead)

| ❌ Don't Use | ✅ Use Instead | Notes |
|-------------|---------------|-------|
| `strategic_directive_id` | `sd_uuid` | Must be UUID from SD table |
| `prd_id` | `id` | No separate prd_id field |
| `user_stories` | (separate table) | Use user_stories table |
| `ui_components` | `metadata.ui_components` | Store in metadata |
| `ui_components_summary` | `metadata.ui_components_summary` | Store in metadata |
| `success_metrics` | `metadata.success_metrics` | Store in metadata |
| `database_changes` | `metadata.database_changes` | Store in metadata |
| `complexity_score` | `metadata.complexity_score` | Store in metadata |
| `objectives` | `metadata.objectives` | Store in metadata |
| `deployment_plan` | `metadata.deployment_plan` | Store in metadata |
| `documentation_requirements` | `metadata.documentation_requirements` | Store in metadata |
| `estimated_effort_hours` | `metadata.estimated_hours` | Store in metadata |
| `risks_and_mitigations` | `risks` | Field renamed |
| `technical_architecture` | `system_architecture` | Field renamed |
| `problem_statement` | `business_context` | Semantic mapping |
| `target_completion_date` | `planned_end` | Field renamed |

---

## 🔍 Using the Schema Validator

### In Your Scripts

```javascript
import { validatePRDSchema, printValidationReport } from '../lib/prd-schema-validator.js';

const prdData = {
  id: 'PRD-SD-001',
  sd_uuid: sdData.uuid_id,  // From strategic_directives_v2
  title: 'My PRD',
  // ... rest of fields
};

// Validate before insert
const validation = validatePRDSchema(prdData);
printValidationReport(validation);

if (!validation.valid) {
  console.error('Validation failed!');
  process.exit(1);
}

// Safe to insert
await supabase.from('product_requirements_v2').insert(prdData);
```

### Sanitize Data Automatically

```javascript
import { sanitizePRDData } from '../lib/prd-schema-validator.js';

const rawData = {
  id: 'PRD-SD-001',
  strategic_directive_id: 'SD-001',  // Wrong field
  user_stories: [...],                // Wrong field
  title: 'My PRD'
};

// Auto-fix field names and move invalid fields to metadata
const cleanData = sanitizePRDData(rawData, {
  applyMappings: true,
  preserveInMetadata: true
});

// cleanData now has:
// - sd_uuid instead of strategic_directive_id
// - metadata.user_stories instead of user_stories
```

---

## 🎯 Required Pattern: sd_uuid Population

**Every PRD script MUST fetch and include sd_uuid:**

```javascript
// STEP 1: Fetch SD uuid_id
const { data: sdData, error: sdError } = await supabase
  .from('strategic_directives_v2')
  .select('uuid_id, id')
  .eq('id', SD_ID)  // e.g., 'SD-AUTH-001'
  .single();

if (sdError || !sdData) {
  console.error(`❌ SD ${SD_ID} not found`);
  process.exit(1);
}

// STEP 2: Include sd_uuid in PRD
const prdData = {
  id: `PRD-${SD_ID}`,
  sd_uuid: sdData.uuid_id,  // ✅ CRITICAL for handoff validation
  directive_id: SD_ID,       // Backward compatibility
  // ... rest of fields
};

// STEP 3: Insert
await supabase.from('product_requirements_v2').insert(prdData);
```

**Why Critical?**
- Handoff validation requires `sd_uuid` to link PRD to SD
- Without it, PLAN→EXEC handoffs will fail
- The trigger auto-populates it for `PRD-SD-*` pattern, but explicit is better

---

## 🏗️ Storing Custom Fields

If you need fields not in the official schema, use `metadata`:

```javascript
const prdData = {
  // ... standard fields ...

  // Custom fields in metadata JSONB
  metadata: {
    ui_components: [
      { name: 'Button', install: 'npx shadcn@latest add button' }
    ],
    success_metrics: [
      { metric: 'Page load time', target: '<2s' }
    ],
    database_changes: {
      new_tables: ['users', 'sessions'],
      migrations: ['001_add_auth.sql']
    },
    estimated_hours: 40,
    sprint_number: 5,
    // Any custom field you need
  }
};
```

---

## 🧪 Testing Your Script

### Before Committing

```bash
# 1. Run your script in dry-run mode (if supported)
node scripts/create-prd-sd-XXX.js --dry-run

# 2. Audit for schema compliance
npm run prd:audit

# 3. Try committing (pre-commit hook validates)
git add scripts/create-prd-sd-XXX.js
git commit -m "feat: Add PRD script for SD-XXX"

# If validation fails:
npm run prd:audit:fix scripts/create-prd-sd-XXX.js
```

### After Creating PRD

```bash
# Verify PRD in database
node -e "
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const { data } = await supabase
  .from('product_requirements_v2')
  .select('id, sd_uuid, title, status')
  .eq('id', 'PRD-SD-XXX')
  .single();

console.log(data);
" --input-type=module
```

---

## 🔧 Common Issues & Fixes

### Issue: "Missing sd_uuid field"

```javascript
// ❌ Wrong
const prdData = {
  id: 'PRD-SD-001',
  directive_id: 'SD-001',  // Not enough!
  // ... rest
};

// ✅ Correct
const { data: sdData } = await supabase
  .from('strategic_directives_v2')
  .select('uuid_id')
  .eq('id', 'SD-001')
  .single();

const prdData = {
  id: 'PRD-SD-001',
  sd_uuid: sdData.uuid_id,  // ✅ Required!
  directive_id: 'SD-001',
  // ... rest
};
```

### Issue: "user_stories field doesn't exist"

```javascript
// ❌ Wrong
const prdData = {
  user_stories: [...]  // Field doesn't exist!
};

// ✅ Correct - Use separate table
// After creating PRD, create user stories separately:
const userStories = [
  { prd_id: 'PRD-SD-001', story: 'As a user...' }
];
await supabase.from('user_stories').insert(userStories);
```

### Issue: "strategic_directive_id not recognized"

```javascript
// ❌ Wrong field name
strategic_directive_id: 'SD-001'

// ✅ Correct
sd_uuid: sdData.uuid_id
```

---

## 📚 Additional Resources

- **Complete Audit Report**: `/docs/PRD_SCHEMA_AUDIT_REPORT.md`
- **Field Mapping Guide**: `/docs/PRD_SCRIPTS_AUDIT_SUMMARY.md`
- **Fix Complete Report**: `/docs/PRD_FIX_COMPLETE_REPORT.md`
- **Schema Validator Code**: `/lib/prd-schema-validator.js`
- **Script Template**: `/templates/prd-script-template.js`
- **Database Schema**: `/database/schema/004_prd_schema.sql`

---

## 🎓 Best Practices Checklist

Before creating a new PRD script:

- [ ] Copy from `templates/prd-script-template.js`
- [ ] Import and use `validatePRDSchema` from validator library
- [ ] Fetch `sd_uuid` from `strategic_directives_v2` table
- [ ] Use only fields from the valid schema list
- [ ] Store custom fields in `metadata` JSONB
- [ ] Validate before insert with `validatePRDSchema()`
- [ ] Test script before committing
- [ ] Run `npm run prd:audit` to verify compliance
- [ ] Let pre-commit hook validate before commit
- [ ] Review validation errors and fix immediately

---

**Last Updated**: 2025-10-19
**Maintained By**: LEO Protocol Team
**Questions?** See docs/PRD_SCRIPTS_AUDIT_SUMMARY.md or ask the team
