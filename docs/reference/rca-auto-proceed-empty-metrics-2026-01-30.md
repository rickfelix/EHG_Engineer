---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# RCA: AUTO-PROCEED Stopped by Empty success_metrics


## Table of Contents

- [Metadata](#metadata)
- [Overview](#overview)
- [Timeline](#timeline)
- [Symptoms](#symptoms)
  - [Primary Symptom](#primary-symptom)
  - [Secondary Symptoms](#secondary-symptoms)
- [Root Cause Analysis](#root-cause-analysis)
  - [5-Whys Investigation](#5-whys-investigation)
- [Impact Assessment](#impact-assessment)
  - [Immediate Impact](#immediate-impact)
  - [Systemic Risk](#systemic-risk)
- [Fix Implementation](#fix-implementation)
  - [Fix 1: JavaScript Array Validation](#fix-1-javascript-array-validation)
  - [Fix 2: Child SD Metric Generation](#fix-2-child-sd-metric-generation)
  - [Fix 3: Protocol File Loading](#fix-3-protocol-file-loading)
  - [Fix 4: Database Constraint](#fix-4-database-constraint)
  - [Fix 5: Data Healing](#fix-5-data-healing)
- [Verification](#verification)
  - [Before Fix](#before-fix)
  - [After Data Healing](#after-data-healing)
  - [Constraint Application](#constraint-application)
  - [Test New SD Creation](#test-new-sd-creation)
- [Lessons Learned](#lessons-learned)
  - [Technical Lessons](#technical-lessons)
  - [Process Lessons](#process-lessons)
- [Prevention Measures](#prevention-measures)
  - [Code Review Checklist](#code-review-checklist)
  - [Gate Enhancement](#gate-enhancement)
  - [Monitoring](#monitoring)
- [Related Documentation](#related-documentation)
- [Contributors](#contributors)
- [Version History](#version-history)

## Metadata
- **Category**: Reference
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: LEO Protocol Team / Claude Opus 4.5
- **Last Updated**: 2026-01-30
- **Tags**: rca, auto-proceed, validation, empty-array, root-cause
- **SD**: SD-LEO-INFRA-HARDENING-001
- **Pattern**: PAT-AUTOPROCEED-EMPTY-ARRAY
- **PR**: https://github.com/rickfelix/EHG_Engineer/pull/688

## Overview

Root Cause Analysis for AUTO-PROCEED mode stopping unexpectedly when trying to start the next Strategic Directive in the queue. Investigation revealed a cascade of three root causes related to empty array validation, child SD inheritance, and protocol file loading.

## Timeline

| Time | Event |
|------|-------|
| T0 | Completed SD-LEO-INFRA-INTEGRATE-VERCEL-REACT-001 successfully |
| T1 | AUTO-PROCEED attempted to start next SD in queue |
| T2 | GATE_SD_TRANSITION_READINESS validation failed |
| T3 | Error: "success_metrics AND success_criteria are both empty" |
| T4 | AUTO-PROCEED stopped, manual intervention required |

## Symptoms

### Primary Symptom
```
❌ GATE_SD_TRANSITION_READINESS validation failed
   Blocking issue: success_metrics AND success_criteria are both empty - must define at least one measurable success metric
```

### Secondary Symptoms
- Next SD in queue had `success_metrics: []` (empty array)
- SD was a child of an orchestrator
- Created via direct database insert (not via leo-create-sd.js)
- Database default was `'[]'::jsonb` for success_metrics

## Root Cause Analysis

### 5-Whys Investigation

#### Root Cause 1: JavaScript Truthy Check Bug

**Why 1**: Why did AUTO-PROCEED stop?
- **Answer**: GATE_SD_TRANSITION_READINESS validation failed

**Why 2**: Why did the gate validation fail?
- **Answer**: SD had empty success_metrics array (`[]`)

**Why 3**: Why did the SD have an empty array instead of populated metrics?
- **Answer**: JavaScript truthy check bug in SD creation code

**Why 4**: Why did the truthy check fail to catch empty arrays?
- **Answer**: In JavaScript, `[]` is truthy, so `metrics || buildDefaults()` returns `[]` instead of `buildDefaults()`

**Why 5**: Why was the code using truthy checks instead of explicit length validation?
- **Answer**: Common JavaScript pattern that works for primitive types but fails for arrays

**Root Cause**: JavaScript empty array truthy behavior not handled correctly

#### Root Cause 2: Child SD Inheritance Design Flaw

**Why 1**: Why were success_metrics empty instead of inherited from parent?
- **Answer**: Parent SD's success_metrics were inappropriate for child work

**Why 2**: Why would parent metrics be inappropriate?
- **Answer**: Parent metrics like "all children complete" don't apply to individual child deliverables

**Why 3**: Should children inherit success_metrics from parents?
- **Answer**: No - each child has unique deliverables requiring specific, measurable targets

**Why 4**: Why was the code set up to inherit parent metrics?
- **Answer**: Initial design assumption that parent context is helpful for children

**Why 5**: What's the correct pattern for child success_metrics?
- **Answer**: Generate child-specific metrics based on the child's title, type, and phase

**Root Cause**: Child SDs should NOT inherit parent success_metrics; they need their own

#### Root Cause 3: Protocol File Loading Gap

**Why 1**: Why didn't the agent proactively invoke the database-agent when creating the migration?
- **Answer**: Agent didn't recognize the trigger keywords "created migration"

**Why 2**: Why didn't the agent recognize the trigger keywords?
- **Answer**: CLAUDE.md (which contains sub-agent trigger keywords) wasn't loaded at session start

**Why 3**: Why wasn't CLAUDE.md being loaded?
- **Answer**: core-protocol-gate.js only required CLAUDE_CORE.md, not CLAUDE.md

**Why 4**: Why was CLAUDE.md missing from required files?
- **Answer**: Trigger keywords were only in CLAUDE.md, but gates didn't enforce reading it

**Why 5**: What's the impact of not having trigger keywords loaded?
- **Answer**: Agents can't proactively invoke sub-agents, requiring manual invocation

**Root Cause**: CLAUDE.md must be loaded alongside CLAUDE_CORE.md for sub-agent trigger keywords

## Impact Assessment

### Immediate Impact
- AUTO-PROCEED workflow interrupted
- Required manual investigation and intervention
- Lost autonomous execution capability
- Affected 8 SDs with empty success_metrics

### Systemic Risk
- **Code Quality**: JavaScript truthy checks used incorrectly elsewhere
- **Data Integrity**: Database allows invalid states (empty arrays)
- **Protocol Compliance**: Agents missing proactive sub-agent triggers
- **Child SD Quality**: Children inheriting inappropriate parent metrics

## Fix Implementation

### Fix 1: JavaScript Array Validation

**Files Modified**:
- `scripts/leo-create-sd.js`
- `scripts/modules/child-sd-template.js`

**Change**:
```javascript
// BEFORE (INCORRECT)
const finalSuccessMetrics = success_metrics || buildDefaultSuccessMetrics(type, title);

// AFTER (CORRECT)
const finalSuccessMetrics = (Array.isArray(success_metrics) && success_metrics.length > 0)
  ? success_metrics
  : buildDefaultSuccessMetrics(type, title);
```

**Impact**: Prevents empty arrays from bypassing default generation

### Fix 2: Child SD Metric Generation

**File Modified**: `scripts/modules/child-sd-template.js`

**Change**: Always generate child-specific success_metrics instead of inheriting from parent

```javascript
// DO NOT inherit success_metrics from parent - always generate child-specific metrics
// Reason: Parent metrics like "all children complete" don't apply to individual children
// Each child has unique deliverables that require specific, measurable targets
inherited.success_metrics = [
  { metric: `${phaseTitle} implementation complete`, target: '100%', measurement: 'Deliverables checklist' },
  { metric: 'Quality gate pass rate', target: '≥85%', measurement: 'Handoff validation score' },
  { metric: 'Test coverage for new code', target: '≥80%', measurement: 'Jest/Playwright coverage' },
  { metric: 'Regressions introduced', target: '0', measurement: 'CI test results' }
];
```

**Impact**: Children always get appropriate metrics for their specific work

### Fix 3: Protocol File Loading

**Files Modified**:
- `scripts/modules/handoff/gates/core-protocol-gate.js`
- `.claude/commands/leo.md`
- `.claude/commands/context-compact.md`

**Change**: Require CLAUDE.md alongside CLAUDE_CORE.md at all trigger points

```javascript
const CORE_PROTOCOL_REQUIREMENTS = {
  SD_START: ['CLAUDE.md', 'CLAUDE_CORE.md'],
  POST_COMPACTION: ['CLAUDE.md', 'CLAUDE_CORE.md'],
  SESSION_START: ['CLAUDE.md', 'CLAUDE_CORE.md']
};
```

**Impact**: Agents have access to sub-agent trigger keywords for proactive invocation

### Fix 4: Database Constraint

**File Created**: `database/migrations/20260130_add_success_metrics_constraint.sql`

**Change**: Add check constraint to prevent empty arrays

```sql
ALTER TABLE strategic_directives_v2
ADD CONSTRAINT success_metrics_not_empty
CHECK (
  success_metrics IS NULL
  OR
  jsonb_array_length(success_metrics) >= 1
);

ALTER TABLE strategic_directives_v2
ADD CONSTRAINT success_criteria_not_empty
CHECK (
  success_criteria IS NULL
  OR
  jsonb_array_length(success_criteria) >= 1
);
```

**Impact**: Database-level prevention of invalid states

### Fix 5: Data Healing

**File Created**: `scripts/heal-empty-success-metrics.js`

**Features**:
- GPT-powered intelligent metric generation
- Gathers full SD context (title, description, scope, type, parent, PRD)
- Uses OpenAI GPT-4.1 with JSON mode
- Falls back to type-based defaults if LLM fails
- Supports `--dry-run` and `--limit` flags

**Execution**:
```bash
node scripts/heal-empty-success-metrics.js
```

**Results**: Successfully healed 8 SDs with context-appropriate metrics

## Verification

### Before Fix
```sql
SELECT COUNT(*) FROM strategic_directives_v2
WHERE success_metrics = '[]'::jsonb OR success_criteria = '[]'::jsonb;
-- Result: 8 SDs
```

### After Data Healing
```sql
SELECT COUNT(*) FROM strategic_directives_v2
WHERE success_metrics = '[]'::jsonb OR success_criteria = '[]'::jsonb;
-- Result: 0 SDs
```

### Constraint Application
```bash
# Apply migration via Supabase SQL Editor
# Migration file: database/migrations/20260130_add_success_metrics_constraint.sql
```

### Test New SD Creation
```bash
# Test that new SDs get proper success_metrics
node scripts/leo-create-sd.js --title "Test SD" --type feature
# Verify: success_metrics array is non-empty
```

## Lessons Learned

### Technical Lessons

1. **JavaScript Array Validation**
   - Empty arrays are truthy in JavaScript
   - Always use explicit `Array.isArray(arr) && arr.length > 0` checks
   - Never rely on truthy operator `||` for array validation

2. **Child SD Design**
   - Children should NOT inherit parent success_metrics
   - Each child needs metrics specific to its deliverables
   - Strategic objectives can be contextualized from parent, but metrics must be unique

3. **Protocol File Loading**
   - Sub-agent trigger keywords are critical for autonomous operation
   - CLAUDE.md must be loaded alongside CLAUDE_CORE.md
   - Gates should enforce both files at all trigger points

4. **Database Constraints**
   - Schema-level validation prevents invalid states
   - Check constraints are appropriate for array length validation
   - Constraints complement application-level validation

### Process Lessons

1. **5-Whys Effectiveness**
   - Revealed three distinct root causes
   - Each "why" layer uncovered a deeper systemic issue
   - Led to comprehensive fix rather than surface patch

2. **Data Healing Strategy**
   - LLM-powered healing provides context-appropriate fixes
   - Dry-run mode enables safe preview before applying
   - Fallback defaults ensure script never fails completely

3. **Documentation Importance**
   - Pattern documentation prevents recurrence
   - RCA reference provides institutional knowledge
   - Command file updates ensure correct protocol usage

## Prevention Measures

### Code Review Checklist

For any code touching JSONB array fields:
- [ ] Use explicit array length check
- [ ] Add database constraint if appropriate
- [ ] Avoid inheritance of array fields between parent/child entities
- [ ] Validate array content, not just presence

### Gate Enhancement

- CLAUDE.md now required at:
  - SESSION_START
  - SD_START
  - POST_COMPACTION

### Monitoring

Watch for these indicators:
- Empty JSONB arrays in database
- Validation gate failures on array fields
- SDs created with `created_by=NULL` (bypass of leo-create-sd.js)

## Related Documentation

- **Pattern**: [PAT-AUTOPROCEED-EMPTY-ARRAY](../patterns/pat-autoproceed-empty-array.md)
- **Session Gate**: [session-start-gate-implementation.md](./session-start-gate-implementation.md)
- **Migration**: database/migrations/20260130_add_success_metrics_constraint.sql
- **Data Healing Script**: scripts/heal-empty-success-metrics.js
- **PR**: https://github.com/rickfelix/EHG_Engineer/pull/688

## Contributors

- **Investigation**: Claude Opus 4.5
- **Root Cause Analysis**: 5-Whys methodology
- **Implementation**: Claude Opus 4.5
- **Data Healing**: OpenAI GPT-4.1 (with Claude Opus 4.5 orchestration)
- **Strategic Direction**: User feedback and guidance

## Version History

- **v1.0.0** (2026-01-30): Initial RCA documentation
  - Documented three root causes (array validation, inheritance, protocol loading)
  - Documented five-part fix implementation
  - Included verification results and lessons learned
  - Created pattern documentation (PAT-AUTOPROCEED-EMPTY-ARRAY)
