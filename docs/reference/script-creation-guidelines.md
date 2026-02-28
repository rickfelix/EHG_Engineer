---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# Script Creation Guidelines



## Table of Contents

- [Metadata](#metadata)
- [Critical Policy: No One-Off Scripts](#critical-policy-no-one-off-scripts)
- [Background: LEO 5.0 Cleanup (January 2026)](#background-leo-50-cleanup-january-2026)
  - [The Problem](#the-problem)
  - [The Impact](#the-impact)
- [Standard SD Creation Process](#standard-sd-creation-process)
  - [Use Standard CLI Only](#use-standard-cli-only)
  - [Features](#features)
  - [Example Usage](#example-usage)
- [Standard PRD Creation Process](#standard-prd-creation-process)
  - [Use Standard CLI Only](#use-standard-cli-only)
  - [Features](#features)
  - [Example Usage](#example-usage)
- [Why One-Off Scripts Are Prohibited](#why-one-off-scripts-are-prohibited)
  - [1. Bypass Validation](#1-bypass-validation)
  - [2. Inconsistent Data](#2-inconsistent-data)
  - [3. Maintenance Burden](#3-maintenance-burden)
  - [4. Poor Discoverability](#4-poor-discoverability)
  - [5. Technical Debt](#5-technical-debt)
- [Migration Path: Existing One-Off Scripts](#migration-path-existing-one-off-scripts)
  - [Current State (Post-LEO 5.0 Cleanup)](#current-state-post-leo-50-cleanup)
  - [If You Have a One-Off Script](#if-you-have-a-one-off-script)
  - [Example Migration](#example-migration)
- [When Scripts Are Allowed](#when-scripts-are-allowed)
  - [Approved Script Categories](#approved-script-categories)
  - [Approval Process](#approval-process)
- [Standard CLI Enhancement Process](#standard-cli-enhancement-process)
  - [If Standard CLI Lacks Features](#if-standard-cli-lacks-features)
  - [Example: Special Field Requirements](#example-special-field-requirements)
- [Enforcement](#enforcement)
  - [Pre-Commit Hooks](#pre-commit-hooks)
  - [Code Review Requirements](#code-review-requirements)
  - [CI/CD Validation](#cicd-validation)
- [Migration Commands Reference](#migration-commands-reference)
  - [For Developers with Local One-Off Scripts](#for-developers-with-local-one-off-scripts)
- [Success Metrics](#success-metrics)
  - [Post-LEO 5.0 Cleanup](#post-leo-50-cleanup)
  - [Ongoing Targets](#ongoing-targets)
- [FAQ](#faq)
  - [Q: What if I need a custom field?](#q-what-if-i-need-a-custom-field)
  - [Q: What if this is just a one-time data migration?](#q-what-if-this-is-just-a-one-time-data-migration)
  - [Q: What if I'm prototyping?](#q-what-if-im-prototyping)
  - [Q: What about the 200+ archived scripts?](#q-what-about-the-200-archived-scripts)
  - [Q: Can I modify an archived script and use it?](#q-can-i-modify-an-archived-script-and-use-it)
  - [Q: Who approves script creation?](#q-who-approves-script-creation)
- [Related Documentation](#related-documentation)
- [Version History](#version-history)

## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-23
- **Tags**: database, testing, e2e, migration

**LEO Protocol v4.3.3+ | Database-First Enforcement**

## Critical Policy: No One-Off Scripts

**PROHIBITED**: Creating one-off scripts for SD or PRD creation.

**REQUIRED**: Use standard CLI tools only.

---

## Background: LEO 5.0 Cleanup (January 2026)

### The Problem
Over the course of LEO Protocol development, **200+ one-off scripts** accumulated:
- ~100 SD creation scripts (create-*-sd.js, create-sd*.js)
- ~100 PRD creation scripts (create-prd-sd-*.js, insert-prd-*.js, enhance-prd-*.js)

### The Impact
**Technical Debt**:
- Bypassed validation and governance
- Created maintenance burden
- Inconsistent data quality
- Hard to audit and track

**LEO 5.0 Solution**:
- All one-off scripts archived to `scripts/archived-*-scripts/`
- Standard CLI tools enforced
- Database-first governance strengthened

---

## Standard SD Creation Process

### Use Standard CLI Only

**REQUIRED Command**:
```bash
node scripts/leo-create-sd.js
```

**Interactive Prompts**:
1. SD Key (auto-generated or custom)
2. Title
3. Description
4. Priority (1-5)
5. Type (feature, bugfix, refactor, etc.)
6. Dependencies (optional)
7. Parent SD (for child SDs)

### Features
- **Validation**: Automatic schema validation
- **Governance**: AEGIS protocol enforcement
- **Dependencies**: Dependency graph tracking
- **Hierarchy**: Parent-child relationship support
- **Database-First**: Direct insert to `strategic_directives_v2` table

### Example Usage
```bash
# Create new standalone SD
node scripts/leo-create-sd.js

# Create child SD (prompts for parent)
node scripts/leo-create-sd.js
# Select "yes" when prompted about parent SD
```

---

## Standard PRD Creation Process

### Use Standard CLI Only

**REQUIRED Command**:
```bash
node scripts/add-prd-to-database.js
```

**Interactive Prompts**:
1. PRD ID (auto-generated or custom)
2. SD Key (link to Strategic Directive)
3. Title
4. Executive Summary
5. Business Context
6. Technical Context
7. Functional Requirements
8. Non-Functional Requirements
9. Acceptance Criteria
10. Risks and Mitigations

### Features
- **Validation**: Automatic PRD quality validation
- **Linking**: Automatic SD-PRD linkage
- **Completeness**: Enforces minimum field requirements
- **Database-First**: Direct insert to `product_requirements_v2` table

### Example Usage
```bash
# Create new PRD for existing SD
node scripts/add-prd-to-database.js
# Follow prompts to enter PRD details
```

---

## Why One-Off Scripts Are Prohibited

### 1. Bypass Validation
One-off scripts often skip critical validation steps:
- Schema validation
- AEGIS governance checks
- Dependency validation
- Quality thresholds

### 2. Inconsistent Data
Each script implements its own logic:
- Different field mappings
- Inconsistent defaults
- Varying quality standards

### 3. Maintenance Burden
- 200+ scripts to maintain
- Code duplication
- Hard to update validation logic
- Difficult to audit

### 4. Poor Discoverability
- Developers don't know which script to use
- New team members confused
- Hidden features and options

### 5. Technical Debt
- Legacy scripts accumulate
- Breaking changes hard to propagate
- Version mismatches

---

## Migration Path: Existing One-Off Scripts

### Current State (Post-LEO 5.0 Cleanup)
All legacy scripts archived to:
- `scripts/archived-sd-scripts/` (~100 scripts)
- `scripts/archived-prd-scripts/` (~100 scripts)

### If You Have a One-Off Script
1. **DO NOT run it** - Use standard CLI instead
2. **Extract any unique logic** - If script has special validation, add to standard CLI
3. **Archive the script** - Move to appropriate archived directory
4. **Document rationale** - Add comment explaining why script was unique

### Example Migration
**Before (WRONG)**:
```javascript
// scripts/create-my-special-sd.js
// Custom SD creation with special fields
const sdData = {
  sd_key: 'SD-SPECIAL-001',
  title: 'My Special SD',
  // ... custom logic
};
```

**After (CORRECT)**:
```bash
# Use standard CLI
node scripts/leo-create-sd.js
# Enter details via interactive prompts
# OR enhance standard CLI if truly unique requirements
```

---

## When Scripts Are Allowed

### Approved Script Categories

**1. Database Migrations**
```bash
scripts/migrations/*.js
```
- One-time data transformations
- Schema updates
- Historical data fixes

**2. Maintenance Scripts**
```bash
scripts/maintenance/*.js
```
- Cleanup operations
- Data integrity checks
- Performance optimization

**3. Analysis Scripts**
```bash
scripts/analysis/*.js
```
- Reporting
- Metrics generation
- Audit reports

**4. Testing Scripts**
```bash
scripts/test-*.js
```
- UAT automation
- E2E test helpers
- Test data generation

### Approval Process
If you believe a one-off script is necessary:

1. **Document rationale** - Why can't standard CLI be used?
2. **Propose enhancement** - Can standard CLI be extended instead?
3. **Get approval** - From LEAD agent or protocol owner
4. **Add safeguards** - Include validation and governance
5. **Plan deprecation** - When can this be removed?

---

## Standard CLI Enhancement Process

### If Standard CLI Lacks Features

**DO NOT** create a one-off script. Instead:

1. **Identify the gap**
   - What does standard CLI not support?
   - Is this a common use case?

2. **Propose enhancement**
   - Create SD for CLI enhancement
   - Document requirements
   - Include validation rules

3. **Implement in standard CLI**
   - Add feature to `leo-create-sd.js` or `add-prd-to-database.js`
   - Include tests
   - Update documentation

4. **Use enhanced CLI**
   - All users benefit
   - Consistent behavior
   - Centralized validation

### Example: Special Field Requirements
**WRONG Approach**:
```javascript
// Create new script for special field
// scripts/create-sd-with-custom-field.js
```

**CORRECT Approach**:
```javascript
// Enhance standard CLI
// scripts/leo-create-sd.js
// Add prompt for custom field if applicable
```

---

## Enforcement

### Pre-Commit Hooks
Git hooks validate:
- New scripts in `scripts/create-*-sd.js` pattern → REJECT
- New scripts in `scripts/create-prd-*.js` pattern → REJECT
- Changes to archived scripts → REJECT

### Code Review Requirements
Pull requests adding scripts require:
- Justification for why standard CLI cannot be used
- Approval from protocol owner
- Deprecation plan

### CI/CD Validation
Pipeline checks:
- Script count in `scripts/` directory
- Naming patterns
- Archive compliance

---

## Migration Commands Reference

### For Developers with Local One-Off Scripts

```bash
# Find local one-off SD creation scripts
find scripts/ -name "create-*-sd.js" -not -path "*/archived-*"

# Find local one-off PRD creation scripts
find scripts/ -name "create-prd-*.js" -not -path "*/archived-*"

# Archive script (manual step)
mv scripts/create-my-sd.js scripts/archived-sd-scripts/
# or
mv scripts/create-prd-my-sd.js scripts/archived-prd-scripts/

# Use standard CLI instead
node scripts/leo-create-sd.js
node scripts/add-prd-to-database.js
```

---

## Success Metrics

### Post-LEO 5.0 Cleanup
- **Scripts Archived**: 200+
- **Standard CLI Usage**: 100%
- **Validation Bypasses**: 0
- **Maintenance Burden**: Reduced by 95%

### Ongoing Targets
- **One-Off Scripts Created**: 0 per quarter
- **Standard CLI Enhancements**: 2-3 per quarter (as needed)
- **Archive Violations**: 0
- **CI/CD Failures for Script Violations**: 0

---

## FAQ

### Q: What if I need a custom field?
**A**: Enhance the standard CLI to support it. Create an SD for the enhancement.

### Q: What if this is just a one-time data migration?
**A**: That's fine! Use `scripts/migrations/` directory, not SD/PRD creation patterns.

### Q: What if I'm prototyping?
**A**: Use standard CLI even for prototypes. It's faster and ensures valid data.

### Q: What about the 200+ archived scripts?
**A**: They are retained for historical reference only. DO NOT execute them.

### Q: Can I modify an archived script and use it?
**A**: No. Extract the unique logic into standard CLI or create a proper enhancement SD.

### Q: Who approves script creation?
**A**: LEAD agent or LEO Protocol owner. Requires strong justification.

---

## Related Documentation

- [PRD Creation Process](../guides/prd-creation-process.md) - Comprehensive PRD workflow
- [Database First Enforcement](database-first-enforcement-expanded.md) - Database governance
- [SD Schema Reference](strategic-directives-v2-schema.md) - SD table schema
- [LEO Protocol v4.3.3](../../CLAUDE.md) - Current protocol version

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-23 | Initial guidelines post-LEO 5.0 cleanup |

---

*Part of LEO Protocol v4.3.3 - Database-First Governance*
*Generated by DOCMON (Information Architecture Lead Sub-Agent)*
