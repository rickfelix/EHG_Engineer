---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# SD Script Validation Report



## Table of Contents

- [Metadata](#metadata)
- [Executive Summary](#executive-summary)
- [Schema Requirements](#schema-requirements)
  - [Required Fields (Database Constraints)](#required-fields-database-constraints)
  - [Strongly Recommended Fields (LEO Protocol Compliance)](#strongly-recommended-fields-leo-protocol-compliance)
  - [Optional But Useful Fields](#optional-but-useful-fields)
- [Critical Issues (Must Fix)](#critical-issues-must-fix)
  - [Scripts Missing Required Fields](#scripts-missing-required-fields)
- [High Priority Issues](#high-priority-issues)
  - [Missing `target_application` (24 scripts)](#missing-target_application-24-scripts)
  - [Missing `sd_key` (17 scripts)](#missing-sd_key-17-scripts)
- [Medium Priority Issues](#medium-priority-issues)
  - [Missing `current_phase` (32 scripts)](#missing-current_phase-32-scripts)
- [Best Practices](#best-practices)
  - [1. Use the Template](#1-use-the-template)
  - [2. Standard Field Values](#2-standard-field-values)
  - [3. Validation Before Running](#3-validation-before-running)
  - [4. Field Type Guidelines](#4-field-type-guidelines)
- [Validation Tool](#validation-tool)
  - [Running the Validator](#running-the-validator)
  - [Output Sections](#output-sections)
  - [Example Output](#example-output)
- [Migration Guide](#migration-guide)
  - [For Existing Scripts](#for-existing-scripts)
  - [Quick Fix Template](#quick-fix-template)
- [Scripts with Perfect Compliance](#scripts-with-perfect-compliance)
- [Field Usage Statistics](#field-usage-statistics)
- [Next Steps](#next-steps)
  - [Immediate Actions (Critical)](#immediate-actions-critical)
  - [Short-term Actions (High Priority)](#short-term-actions-high-priority)
  - [Long-term Actions (Quality Improvement)](#long-term-actions-quality-improvement)
- [Resources](#resources)

## Metadata
- **Category**: Report
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, testing, migration, schema

**Generated**: 2025-10-19
**Purpose**: Ensure all SD creation scripts have proper fields per strategic_directives_v2 schema

---

## Executive Summary

**Status**: ⚠️ **30 of 41 scripts (73%) have issues**

- **16 scripts** missing required database fields (CRITICAL)
- **24 scripts** missing `target_application` (HIGH priority)
- **17 scripts** missing `sd_key` unique identifier (HIGH priority)
- **32 scripts** missing `current_phase` for workflow tracking (MEDIUM priority)

**Impact**: Scripts with missing required fields will fail at database insert. Scripts missing recommended fields reduce LEO Protocol compliance and make tracking/filtering difficult.

---

## Schema Requirements

### Required Fields (Database Constraints)

These fields have NOT NULL constraints in the database. Missing any will cause insertion failure:

| Field | Type | Purpose |
|-------|------|---------|
| `id` | VARCHAR(50) | Unique identifier (e.g., SD-XXX-YYY-ZZZ) |
| `title` | VARCHAR(500) | Short descriptive title |
| `description` | TEXT | Detailed description of the SD |
| `rationale` | TEXT | Why this SD is necessary |
| `scope` | TEXT | What's included/excluded |
| `category` | VARCHAR(50) | Classification (product_feature, infrastructure, etc.) |
| `priority` | VARCHAR(20) | critical, high, medium, low |
| `status` | VARCHAR(50) | draft, active, superseded, archived |

### Strongly Recommended Fields (LEO Protocol Compliance)

These fields are critical for LEO Protocol workflow tracking and multi-application environments:

| Field | Type | Purpose | Usage |
|-------|------|---------|-------|
| `sd_key` | TEXT | Human-readable unique key | 59% of scripts |
| `target_application` | TEXT | EHG or EHG_engineer | 41% of scripts |
| `current_phase` | TEXT | IDEATION, LEAD, PLAN, EXEC, etc. | 22% of scripts |
| `strategic_intent` | TEXT | High-level strategic goal | 51% of scripts |
| `strategic_objectives` | JSONB | Array of specific objectives | 61% of scripts |
| `success_criteria` | JSONB | Array of success criteria | 59% of scripts |
| `key_changes` | JSONB | Array of major changes | 24% of scripts |
| `key_principles` | JSONB | Guiding principles | 46% of scripts |
| `created_by` | VARCHAR(100) | Creator identification | 63% of scripts |
| `created_at` | TIMESTAMP | Creation timestamp | 49% of scripts |
| `updated_at` | TIMESTAMP | Last update timestamp | 46% of scripts |

### Optional But Useful Fields

| Field | Type | Purpose |
|-------|------|---------|
| `uuid_id` | UUID | Optional UUID identifier |
| `version` | VARCHAR(20) | Version number (default: '1.0') |
| `phase_progress` | INTEGER | Progress within current phase (0-100) |
| `progress` | INTEGER | Overall progress (0-100) |
| `is_active` | BOOLEAN | Whether SD is currently active |
| `metadata` | JSONB | Flexible JSON for additional data |
| `dependencies` | JSONB | Array of dependencies |
| `risks` | JSONB | Array of risks and mitigation |
| `success_metrics` | JSONB | Array of measurable metrics |
| `implementation_guidelines` | JSONB | Implementation guidance |

---

## Critical Issues (Must Fix)

### Scripts Missing Required Fields

**Affected**: 16 scripts
**Severity**: CRITICAL
**Impact**: Database insertion will FAIL

1. **apply-strategic-directive-id-migration.js** - Missing ALL required fields
2. **complete-strategic-directive.js** - Missing 7/8 required fields
3. **create-sd-design-007-prd.js** - Missing 7/8 required fields
4. **create-sd-test-mock-001.js** - Missing ALL required fields
5. **create-sd-timeline-tracking.js** - Missing 7/8 required fields
6. **new-strategic-directive.js** - Missing ALL required fields
7. **insert-uat-strategic-directive.js** - Missing 7/8 required fields
8. **uat-to-strategic-directive-ai.js** - Missing 5/8 required fields

**Action Required**: Update these scripts immediately to include all required fields.

---

## High Priority Issues

### Missing `target_application` (24 scripts)

**Why Critical**: Cannot distinguish between:
- `EHG` - Customer-facing business application implementations
- `EHG_engineer` - LEO Protocol management dashboard features

**Impact**:
- Cannot filter SDs by application
- Dashboard queries return mixed results
- Unclear where to implement features

**Top Offenders**:
- create-infrastructure-quality-sds.js
- create-sd-041c.js
- create-sd-047a-timeline.js
- create-sd-047b-documents.js
- create-sd-agent-admin-001.js
- create-sd-agent-platform-001.js
- create-vif-strategic-directives.js

**Fix**:
```javascript
strategicDirective: {
  // ... other fields
  target_application: 'EHG',  // or 'EHG_engineer'
  // ... rest
}
```

### Missing `sd_key` (17 scripts)

**Why Critical**: Unique human-readable identifier for referencing SDs

**Impact**:
- Hard to reference SDs in documentation
- URLs less readable
- Vision Alignment Pipeline compatibility issues

**Fix**:
```javascript
strategicDirective: {
  // ... other fields
  sd_key: 'SD-YOUR-FEATURE-001',
  // ... rest
}
```

---

## Medium Priority Issues

### Missing `current_phase` (32 scripts)

**Why Important**: LEO Protocol workflow tracking

**Impact**:
- Cannot track SD progress through LEAD→PLAN→EXEC workflow
- Dashboard phase filters don't work properly
- Progress reporting incomplete

**Fix**:
```javascript
strategicDirective: {
  // ... other fields
  current_phase: 'IDEATION',  // or 'LEAD', 'PLAN', 'EXEC', 'VERIFICATION', 'COMPLETE'
  // ... rest
}
```

---

## Best Practices

### 1. Use the Template

**Location**: `scripts/templates/sd-creation-template.js`

This template includes:
- All required fields with descriptions
- All recommended fields with examples
- Proper field types and validations
- Error handling and existence checking

### 2. Standard Field Values

**Status Values**:
- `draft` - New SD, not yet active
- `active` - Currently being worked on
- `superseded` - Replaced by newer SD
- `archived` - Completed or no longer relevant

**Priority Values**:
- `critical` - Must do immediately
- `high` - Important, schedule soon
- `medium` - Normal priority
- `low` - Nice to have

**Category Values**:
- `product_feature` - New customer-facing feature
- `infrastructure` - Backend/system improvements
- `bug_fix` - Fixing existing issues
- `performance` - Optimization work
- `security` - Security enhancements
- `documentation` - Documentation updates
- `testing` - Test improvements
- `LEO Protocol Infrastructure` - LEO system enhancements

**Phase Values**:
- `IDEATION` - Initial concept stage
- `LEAD` - Strategic validation phase
- `PLAN` - Technical planning and PRD creation
- `EXEC` - Implementation phase
- `VERIFICATION` - Testing and validation
- `COMPLETE` - Fully done and approved

### 3. Validation Before Running

Run validation script before creating new SDs:

```bash
node scripts/validate-sd-scripts.js
```

This will show:
- Missing required fields
- Missing recommended fields
- Field usage statistics
- Specific recommendations

### 4. Field Type Guidelines

**Text Fields** (id, title, description, etc.):
- Use strings, not objects
- Keep titles concise (<500 chars)
- Make descriptions detailed but focused

**JSONB Arrays** (strategic_objectives, success_criteria, etc.):
- Use JavaScript arrays: `['item1', 'item2']`
- Keep items specific and measurable
- Aim for 3-7 items per array

**JSONB Objects** (metadata, risks, etc.):
- Use JavaScript objects: `{ key: 'value' }`
- Keep structure flat when possible
- Document non-obvious keys

**Timestamps** (created_at, updated_at):
- Use `new Date().toISOString()`
- Database will handle timezone conversion

**Booleans** (is_active):
- Use `true` or `false`, not strings
- Default to `true` for new SDs

---

## Validation Tool

### Running the Validator

```bash
# Validate all SD creation scripts
node scripts/validate-sd-scripts.js
```

### Output Sections

1. **Summary**: Overview of issues found
2. **Scripts with Issues**: Detailed breakdown of missing fields
3. **Scripts with Good Coverage**: Well-formed scripts
4. **Field Usage Statistics**: Which fields are commonly used/missing
5. **Recommendations**: Prioritized action items

### Example Output

```
📊 Summary:
  Total scripts: 41
  Scripts with issues: 30
  Missing required fields: 16
  Missing recommended fields: 40

⚠️  Scripts with Issues:
================================================================================

📄 create-backend-stub-sds.js
   ⚠️  Missing recommended fields: sd_key, target_application, current_phase
   ✅ Has 99 fields total
```

---

## Migration Guide

### For Existing Scripts

**Step 1**: Run validator to identify issues
```bash
node scripts/validate-sd-scripts.js
```

**Step 2**: For each script with issues:

1. Add missing required fields (prevents DB errors)
2. Add `target_application` (critical for filtering)
3. Add `sd_key` (improves readability)
4. Add `current_phase` (enables workflow tracking)
5. Test the script

**Step 3**: Re-run validator to confirm fixes

### Quick Fix Template

Add these fields to your SD object:

```javascript
const strategicDirective = {
  // REQUIRED FIELDS
  id: 'SD-YOUR-ID',
  title: 'Your Title',
  description: 'Detailed description...',
  rationale: 'Why this is needed...',
  scope: 'What is included and excluded...',
  category: 'product_feature',  // or other category
  priority: 'high',  // critical, high, medium, low
  status: 'draft',

  // RECOMMENDED FIELDS
  sd_key: 'SD-YOUR-KEY',
  target_application: 'EHG',  // or 'EHG_engineer'
  current_phase: 'IDEATION',
  strategic_intent: 'High-level goal...',
  strategic_objectives: ['Objective 1', 'Objective 2'],
  success_criteria: ['Criterion 1', 'Criterion 2'],
  key_changes: ['Change 1', 'Change 2'],
  key_principles: ['Principle 1', 'Principle 2'],
  created_by: 'LEAD',  // or 'System', 'Chairman', etc.
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),

  // OPTIONAL (add as needed)
  version: '1.0',
  phase_progress: 0,
  progress: 0,
  is_active: true,
  uuid_id: randomUUID(),
  metadata: { /* additional data */ }
};
```

---

## Scripts with Perfect Compliance

These scripts demonstrate best practices:

✅ **create-sd-retro-enhance-001.js** - All recommended fields present

Good examples with minor gaps:

- create-backend-stub-sds.js (3 missing recommended)
- create-infrastructure-quality-sds-fixed.js (3 missing)
- create-sd-test-001.js (1 missing)
- create-vif-strategic-directives.js (2 missing)

---

## Field Usage Statistics

Based on analysis of 41 SD creation scripts:

| Field | Coverage | Assessment |
|-------|----------|------------|
| metadata | 93% | ✅ Excellent |
| status | 88% | ✅ Excellent |
| title | 83% | ✅ Good |
| priority | 83% | ✅ Good |
| description | 80% | ✅ Good |
| category | 78% | ✅ Good |
| rationale | 76% | ✅ Good |
| id | 73% | ✅ Good |
| scope | 71% | ✅ Good |
| created_by | 63% | ⚠️ Moderate |
| strategic_objectives | 61% | ⚠️ Moderate |
| sd_key | 59% | ⚠️ Moderate |
| success_criteria | 59% | ⚠️ Moderate |
| strategic_intent | 51% | ⚠️ Moderate |
| created_at | 49% | ⚠️ Moderate |
| key_principles | 46% | ⚠️ Moderate |
| updated_at | 46% | ⚠️ Moderate |
| target_application | 41% | ❌ Low |
| key_changes | 24% | ❌ Low |
| current_phase | 22% | ❌ Low |

**Goal**: Achieve ≥80% coverage for all recommended fields

---

## Next Steps

### Immediate Actions (Critical)

1. ✅ Fix 16 scripts with missing required fields
2. ✅ Add `target_application` to 24 scripts
3. ✅ Add `sd_key` to 17 scripts

### Short-term Actions (High Priority)

4. Add `current_phase` to 32 scripts
5. Improve coverage of `key_changes` (currently 24%)
6. Standardize `created_at`/`updated_at` (currently ~46%)

### Long-term Actions (Quality Improvement)

7. Update documentation with new standards
8. Add pre-commit hook to validate SD scripts
9. Create automated migration tool for bulk updates
10. Add SD script linter to CI/CD pipeline

---

## Resources

- **Template**: `scripts/templates/sd-creation-template.js`
- **Validator**: `scripts/validate-sd-scripts.js`
- **Schema**: `supabase/ehg_engineer/migrations/20250829194251_schema_initial_schema.sql`
- **Best Practices**: `docs/SD-CREATION-BEST-PRACTICES.md` (if exists)

---

**Generated**: 2025-10-19
**Validation Tool**: scripts/validate-sd-scripts.js
**Total Scripts Analyzed**: 41
**Scripts Requiring Updates**: 30 (73%)
