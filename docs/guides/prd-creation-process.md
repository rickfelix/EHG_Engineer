# Professional PRD Creation Process


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-23
- **Tags**: database, api, testing, e2e

**LEO Protocol v4.3.3+ | UPDATED January 2026**

> **CRITICAL UPDATE (LEO 5.0)**: One-off PRD creation scripts are now PROHIBITED.
> Use standard CLI only: `node scripts/add-prd-to-database.js`
>
> See [Script Creation Guidelines](../reference/script-creation-guidelines.md) for policy details.

---

## Overview
This document defines the improved PRD (Product Requirements Document) creation process for LEO Protocol, ensuring every PRD meets professional standards and guides successful implementation.

---

## REQUIRED: Standard PRD Creation Process

### Use Standard CLI Only

**MANDATORY Command** (LEO 5.0+):
```bash
node scripts/add-prd-to-database.js
```

**Why**:
- Enforces validation and governance
- Consistent data quality
- No maintenance burden
- Database-first compliance

**Interactive Workflow**:
1. PRD ID (auto-generated or custom)
2. Strategic Directive linkage (SD Key)
3. Title and executive summary
4. Business and technical context
5. Functional requirements (minimum 5)
6. Non-functional requirements (minimum 3)
7. Technical specifications
8. Acceptance criteria (minimum 5)
9. Performance requirements
10. Risks and mitigations (minimum 3)

### Features
- **Schema Validation**: Automatic field validation
- **Quality Checks**: Enforces minimum completeness thresholds
- **Database-First**: Direct insert to `product_requirements_v2` table
- **SD Linkage**: Automatic relationship to Strategic Directive
- **Version Control**: Built-in versioning and audit trail

---

## Historical Context: SDIP Case Study

### The Problem (Pre-LEO 5.0)
The SDIP Strategic Directive had a comprehensive PRD script (`create-sdip-prd.js`) containing:
- ✅ 8 detailed functional requirements
- ✅ Complete technical specifications
- ✅ 5 API endpoints defined
- ✅ Performance requirements
- ✅ Risk assessments
- ✅ Sub-agent triggers

**But this script was never executed!** The database contained only a minimal placeholder PRD with empty fields.

### Root Cause
**Process Gap**: One-off PRD creation scripts:
1. Existed but were not integrated into standard workflow
2. Bypassed validation and governance
3. Created maintenance burden (200+ scripts accumulated)
4. Led to incomplete PRDs reaching implementation

### LEO 5.0 Solution
- **All one-off scripts archived** to `scripts/archived-prd-scripts/`
- **Standard CLI enforced** via `add-prd-to-database.js`
- **Database-first governance** strengthened
- **Pre-commit hooks** prevent new one-off scripts

---

## PRD Creation Workflow (PLAN Phase)

### Step 1: Prepare PRD Content
Before running the CLI, prepare:
- Executive summary (150+ characters)
- Business context (problem statement, opportunity)
- Technical context (architecture, integration requirements)
- Functional requirements (minimum 5, detailed)
- Non-functional requirements (minimum 3, with sub-agent triggers)
- Acceptance criteria (minimum 5, measurable)
- Performance requirements (response times, throughput, reliability)
- Risks and mitigations (minimum 3, with severity levels)

### Step 2: Execute Standard CLI
```bash
node scripts/add-prd-to-database.js
```

Follow interactive prompts to enter all PRD data.

### Step 3: Validate PRD Quality
```bash
node scripts/prd-validation-checklist.js PRD-XXXXXXXXX
```

**Quality Thresholds**:
- **Excellent**: 95%+ (Production ready)
- **Good**: 80%+ (Minor improvements needed)
- **Acceptable**: 65%+ (Minimum for implementation)
- **Needs Work**: <65% (Must improve before EXEC handoff)

### Step 4: Fix Issues (If Any)
If validation fails:
1. Identify missing or incomplete fields
2. Re-run CLI to update PRD
3. Re-validate until threshold met

### Step 5: Document Handoff
Include PRD validation results in PLAN-to-EXEC handoff.

---

## PRD Validation Checklist

### Critical Fields (Must Pass)
- [ ] **Title**: Descriptive and specific
- [ ] **Executive Summary**: 150+ characters
- [ ] **Business Context**: Problem and opportunity defined
- [ ] **Technical Context**: Integration requirements clear
- [ ] **Functional Requirements**: 5+ detailed requirements
- [ ] **Non-Functional Requirements**: 3+ with sub-agent triggers
- [ ] **Technical Requirements**: Comprehensive specifications
- [ ] **Acceptance Criteria**: 5+ measurable criteria
- [ ] **Performance Requirements**: Defined metrics
- [ ] **Risks**: 3+ risks with mitigation strategies

### Quality Indicators
- [ ] **Strategic Alignment**: Linked to Strategic Directive
- [ ] **Risk Assessment**: Comprehensive risk analysis
- [ ] **Performance Defined**: Clear performance metrics
- [ ] **Timeline Realistic**: Effort estimation provided

### Sub-Agent Activation Triggers
- [ ] **Database**: Required if schema changes detected
- [ ] **Design**: Required if 2+ UI components
- [ ] **Security**: Required if security mentioned
- [ ] **Testing**: Required if coverage >80% or E2E testing

---

## Mandatory Process Steps

### For PLAN Agents
1. **Prepare PRD Content**: Gather all required information
2. **Execute Standard CLI**: Run `add-prd-to-database.js`
3. **Validate Quality**: Run validation checklist (must score 65%+)
4. **Fix Issues**: Address any validation failures
5. **Document Handoff**: Include PRD validation results in PLAN-to-EXEC handoff

### For LEAD Agents (Approval Phase)
1. **Review PRD**: Check PRD completeness in database
2. **Validate Against SD**: Ensure alignment with Strategic Directive
3. **Approve/Reject**: Based on PRD quality and implementation results

### Quality Gates
- **PLAN Phase**: PRD must score 65%+ to proceed to EXEC
- **EXEC Phase**: Implementation must align with PRD specifications
- **VERIFICATION Phase**: PRD acceptance criteria must be met
- **APPROVAL Phase**: Final validation against PRD success criteria

---

## Tools and Scripts

### PRD Creation (REQUIRED)
- **`scripts/add-prd-to-database.js`** - Standard CLI for PRD creation (USE THIS)

### PRD Validation
- **`scripts/prd-validation-checklist.js`** - Quality validation

### PRD Management
- **`scripts/update-prd-status.js`** - Update PRD progress
- **`scripts/complete-prd-validation.js`** - Mark PRD as complete

### DEPRECATED (Do Not Use)
- ❌ `scripts/create-{name}-prd.js` - One-off scripts (archived)
- ❌ `scripts/create-prd-sd-*.js` - Legacy scripts (archived)
- ❌ `scripts/insert-prd-*.js` - Legacy scripts (archived)
- ❌ `scripts/enhance-prd-*.js` - Legacy scripts (archived)

**All archived scripts** in `scripts/archived-prd-scripts/` (200+ scripts).

**Policy**: See [Script Creation Guidelines](../reference/script-creation-guidelines.md)

---

## Success Metrics

### PRD Quality Indicators (Post-LEO 5.0)
- 100% PRDs created via standard CLI
- 95%+ PRDs score "Good" or "Excellent" on validation
- Zero incomplete PRDs reach implementation
- 90%+ implementation-to-PRD alignment

### Process Efficiency
- PRD creation time: <30 minutes with standard CLI
- Validation time: <5 minutes automated
- Rework rate: <10% of PRDs need major revisions
- Zero validation bypasses

---

## Emergency Protocol

### If Incomplete PRD Detected
1. **Stop Implementation**: Halt EXEC phase work immediately
2. **Re-run Standard CLI**: Use `add-prd-to-database.js` to update PRD
3. **Validate**: Run validation checklist
4. **Update Database**: Ensure database has complete PRD
5. **Resume Implementation**: Continue with proper PRD guidance

### Recovery Commands
```bash
# Update incomplete PRD via standard CLI
node scripts/add-prd-to-database.js

# Validate PRD quality
node scripts/prd-validation-checklist.js PRD-XXXXXXXXX

# Verify database state
node scripts/query-prd.js PRD-XXXXXXXXX
```

---

## Migration from Legacy Scripts

### If You Have a Legacy PRD Script
**DO NOT execute it.**

Instead:
1. Extract the PRD content (requirements, context, etc.)
2. Run standard CLI: `node scripts/add-prd-to-database.js`
3. Enter content via interactive prompts
4. Archive legacy script: `mv script.js scripts/archived-prd-scripts/`

### If Legacy Script Has Unique Logic
1. Document what makes it unique
2. Create SD to enhance standard CLI with that feature
3. Implement feature in `add-prd-to-database.js`
4. Archive legacy script

---

## Implementation Notes

- **Database Schema**: `product_requirements_v2` table supports all required PRD fields
- **Real-time Sync**: Dashboard automatically reflects PRD updates
- **Version Control**: PRDs are versioned and tracked
- **Integration**: PRDs link to Strategic Directives and handoff documents
- **AEGIS Governance**: PRD creation subject to governance protocols

---

## Related Documentation

- [Script Creation Guidelines](../reference/script-creation-guidelines.md) - Policy for script creation
- [Strategic Directives Schema](../reference/strategic-directives-v2-schema.md) - SD table schema
- [Database First Enforcement](../reference/database-first-enforcement-expanded.md) - Database governance
- [PLAN Phase Guide](../../CLAUDE_PLAN.md) - PLAN phase operations

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | 2026-01-23 | LEO 5.0 update: Standard CLI enforcement, one-off scripts prohibited |
| 1.0 | 2025-XX-XX | Initial PRD process documentation |

---

*Part of LEO Protocol v4.3.3 - Database-First Governance*
*This process prevents the SDIP issue from recurring and ensures all PRDs meet professional standards before implementation begins.*
