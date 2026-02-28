---
category: database
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [database, auto-generated]
---
# US-001 Developer Guide


## Table of Contents

- [Metadata](#metadata)
- [Using Validation Modes in Sub-Agent Results](#using-validation-modes-in-sub-agent-results)
- [What Changed?](#what-changed)
- [Using the New Columns](#using-the-new-columns)
  - [Column 1: validation_mode](#column-1-validation_mode)
  - [Column 2: justification](#column-2-justification)
  - [Column 3: conditions](#column-3-conditions)
- [Real-World Examples](#real-world-examples)
  - [Example 1: QA Agent - Prospective Pass](#example-1-qa-agent---prospective-pass)
  - [Example 2: Testing Agent - Retrospective Conditional Pass](#example-2-testing-agent---retrospective-conditional-pass)
  - [Example 3: Design Agent - Retrospective Conditional Pass](#example-3-design-agent---retrospective-conditional-pass)
- [Error Scenarios & How to Fix](#error-scenarios-how-to-fix)
  - [Error 1: CONDITIONAL_PASS in prospective mode](#error-1-conditional_pass-in-prospective-mode)
  - [Error 2: Missing justification for CONDITIONAL_PASS](#error-2-missing-justification-for-conditional_pass)
  - [Error 3: Justification too short](#error-3-justification-too-short)
  - [Error 4: Empty conditions array](#error-4-empty-conditions-array)
- [Querying Results with New Columns](#querying-results-with-new-columns)
  - [Query 1: Get all CONDITIONAL_PASS entries](#query-1-get-all-conditional_pass-entries)
  - [Query 2: Filter by validation mode](#query-2-filter-by-validation-mode)
  - [Query 3: Get completion status (including CONDITIONAL_PASS)](#query-3-get-completion-status-including-conditional_pass)
  - [Query 4: Get audit trail of all conditional passes by agent](#query-4-get-audit-trail-of-all-conditional-passes-by-agent)
- [Best Practices](#best-practices)
  - [✓ DO:](#-do)
  - [✗ DON'T:](#-dont)
- [When to Use Each Verdict](#when-to-use-each-verdict)
- [Need Help?](#need-help)

## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, api, testing, e2e

## Using Validation Modes in Sub-Agent Results

**Quick Reference for Implementation**

---

## What Changed?

The `sub_agent_execution_results` table now supports two validation modes:

1. **Prospective Mode** (default) - Pre-execution validation
   - Standard validation gates must pass
   - Existing behavior preserved

2. **Retrospective Mode** (new) - Post-execution review
   - Work is allowed to complete
   - Validated later with justification
   - Conditions/follow-ups tracked for audit

---

## Using the New Columns

### Column 1: validation_mode

```javascript
// Prospective (default - will be set automatically)
await supabase.from('sub_agent_execution_results').insert({
  sd_id: 'SD-001',
  sub_agent_code: 'QA',
  sub_agent_name: 'QA_DIRECTOR',
  verdict: 'PASS',
  // validation_mode: 'prospective' // Optional - defaults to this
  confidence: 95
});

// Retrospective (explicitly set)
await supabase.from('sub_agent_execution_results').insert({
  sd_id: 'SD-002',
  sub_agent_code: 'TESTING',
  sub_agent_name: 'TESTING_AGENT',
  verdict: 'CONDITIONAL_PASS',
  validation_mode: 'retrospective', // Required for CONDITIONAL_PASS
  confidence: 85
});
```

**Valid Values**: `'prospective'` | `'retrospective'`

**Default**: `'prospective'` (backward compatible)

---

### Column 2: justification

Required when using `CONDITIONAL_PASS` verdict in retrospective mode.

```javascript
// CONDITIONAL_PASS must include justification (≥50 chars)
await supabase.from('sub_agent_execution_results').insert({
  sd_id: 'SD-003',
  sub_agent_code: 'TESTING',
  sub_agent_name: 'TESTING_AGENT',
  verdict: 'CONDITIONAL_PASS',
  validation_mode: 'retrospective',
  justification: 'E2E tests pass and cover all critical paths. Infrastructure gap has been identified and will be addressed in follow-up SD.',
  confidence: 85
});

// ERROR: justification too short
await supabase.from('sub_agent_execution_results').insert({
  verdict: 'CONDITIONAL_PASS',
  validation_mode: 'retrospective',
  justification: 'Too short' // ✗ Only 9 characters
});
```

**Requirements**:
- Required for `CONDITIONAL_PASS` verdicts only
- Minimum 50 characters
- Should explain why work is complete despite gaps
- Should reference follow-up SDs if applicable

**Good Examples**:
```
"Unit tests pass 95%. Integration tests have 3 known gaps documented in SD-TESTING-INFRASTRUCTURE-FIX-001 with timeline."

"Component implementation complete. E2E coverage pending infrastructure setup. Follow-up: SD-INFRASTRUCTURE-SETUP-001."

"API contract meets specification. Performance optimization deferred to backlog (SD-PERF-OPT-001). Baseline meets SLA requirements."
```

---

### Column 3: conditions

Required when using `CONDITIONAL_PASS` verdict. Stores follow-up actions as JSONB array.

```javascript
// CONDITIONAL_PASS must include conditions array (non-empty)
await supabase.from('sub_agent_execution_results').insert({
  sd_id: 'SD-004',
  sub_agent_code: 'TESTING',
  sub_agent_name: 'TESTING_AGENT',
  verdict: 'CONDITIONAL_PASS',
  validation_mode: 'retrospective',
  justification: 'Feature complete. Performance baseline testing deferred to next phase.',
  conditions: [
    'Create SD-PERFORMANCE-BASELINE-001',
    'Add performance gates to CI/CD pipeline',
    'Document SLA thresholds in design docs'
  ],
  confidence: 80
});

// ERROR: empty conditions array
await supabase.from('sub_agent_execution_results').insert({
  verdict: 'CONDITIONAL_PASS',
  validation_mode: 'retrospective',
  conditions: [] // ✗ Must have at least 1 item
});
```

**Requirements**:
- Array of strings describing follow-up actions
- At least 1 item in array
- Each item should be actionable (not just "Fix this")
- Can reference SD IDs for traceability

**Good Examples**:
```json
["Create SD-INFRASTRUCTURE-FIX-001", "Add --full-e2e flag to CI/CD pipeline"]

["Implement error boundary component (SD-ERROR-HANDLING-REFACTOR-001)", "Add Sentry monitoring (SD-MONITORING-SETUP-001)"]

["Database migration for new schema (linked to parent SD)", "Performance tests to be added in Sprint N+1"]
```

---

## Real-World Examples

### Example 1: QA Agent - Prospective Pass

```javascript
// Normal case: All tests pass in prospective mode
const qaResult = await supabase
  .from('sub_agent_execution_results')
  .insert({
    sd_id: 'SD-AUTH-REFACTOR-001',
    sub_agent_code: 'QA',
    sub_agent_name: 'QA_ENGINEERING_DIRECTOR',
    verdict: 'PASS', // ✓ All tests pass
    validation_mode: 'prospective', // Standard validation
    confidence: 98,
    detailed_analysis: 'Unit: 127 pass, Integration: 45 pass, E2E: 23 pass',
    execution_time: 180
  });
```

### Example 2: Testing Agent - Retrospective Conditional Pass

```javascript
// Pragmatic case: E2E tests exist but infrastructure incomplete
const testResult = await supabase
  .from('sub_agent_execution_results')
  .insert({
    sd_id: 'SD-PAYMENT-INTEGRATION-001',
    sub_agent_code: 'TESTING',
    sub_agent_name: 'QA_ENGINEERING_DIRECTOR',
    verdict: 'CONDITIONAL_PASS', // ⚠ Work complete, gaps documented
    validation_mode: 'retrospective', // Allowed with justification
    justification: `
      Component implementation complete with 94% test coverage.
      E2E integration tests exist and pass against staging API.
      Known gap: Load testing under 10k concurrent users deferred to
      SD-PAYMENT-PERF-OPTIMIZATION-001 (scheduled next sprint).
      This does not block current feature release per tech lead approval.
    `,
    conditions: [
      'Create SD-PAYMENT-PERF-OPTIMIZATION-001 for load testing',
      'Add load test results to architecture documentation',
      'Schedule performance review gate for next sprint'
    ],
    confidence: 87,
    execution_time: 210
  });
```

### Example 3: Design Agent - Retrospective Conditional Pass

```javascript
// Design complete but one interaction deferred
const designResult = await supabase
  .from('sub_agent_execution_results')
  .insert({
    sd_id: 'SD-DASHBOARD-REDESIGN-001',
    sub_agent_code: 'DESIGN',
    sub_agent_name: 'DESIGN_AGENT',
    verdict: 'CONDITIONAL_PASS',
    validation_mode: 'retrospective',
    justification: `
      Primary dashboard redesign complete and validated with 5 users.
      Advanced analytics view deferred to SD-ANALYTICS-ENHANCEMENTS-001
      based on stakeholder feedback prioritization.
      Accessibility audit passed (WCAG 2.1 AA).
    `,
    conditions: [
      'Schedule analytics view design for Q4 planning',
      'Add accessibility checklist to design review process',
      'Document deferred features in backlog'
    ],
    confidence: 92,
    execution_time: 120
  });
```

---

## Error Scenarios & How to Fix

### Error 1: CONDITIONAL_PASS in prospective mode

```javascript
// ✗ WRONG - This will fail
const result = await supabase.from('sub_agent_execution_results').insert({
  verdict: 'CONDITIONAL_PASS',
  validation_mode: 'prospective', // ✗ Invalid combination
  justification: '...',
  conditions: ['...']
});
// Error: check_conditional_pass_retrospective

// ✓ CORRECT - Use retrospective mode
const result = await supabase.from('sub_agent_execution_results').insert({
  verdict: 'CONDITIONAL_PASS',
  validation_mode: 'retrospective', // ✓ Correct
  justification: '...',
  conditions: ['...']
});
```

### Error 2: Missing justification for CONDITIONAL_PASS

```javascript
// ✗ WRONG - No justification
const result = await supabase.from('sub_agent_execution_results').insert({
  verdict: 'CONDITIONAL_PASS',
  validation_mode: 'retrospective',
  conditions: ['Create SD-FIX-001']
  // Missing: justification
});
// Error: check_justification_required

// ✓ CORRECT - Include justification
const result = await supabase.from('sub_agent_execution_results').insert({
  verdict: 'CONDITIONAL_PASS',
  validation_mode: 'retrospective',
  justification: 'Feature complete. Infrastructure follow-up scheduled.',
  conditions: ['Create SD-FIX-001']
});
```

### Error 3: Justification too short

```javascript
// ✗ WRONG - Only 9 characters
const result = await supabase.from('sub_agent_execution_results').insert({
  verdict: 'CONDITIONAL_PASS',
  validation_mode: 'retrospective',
  justification: 'Too short', // Only 9 chars, need 50+
  conditions: ['Create SD-FIX-001']
});
// Error: check_justification_required

// ✓ CORRECT - Write meaningful justification
const result = await supabase.from('sub_agent_execution_results').insert({
  verdict: 'CONDITIONAL_PASS',
  validation_mode: 'retrospective',
  justification: `Feature implementation complete with all core requirements met.
    Deferred optimization work documented in follow-up SD.`,
  conditions: ['Create SD-FIX-001']
});
```

### Error 4: Empty conditions array

```javascript
// ✗ WRONG - Empty array
const result = await supabase.from('sub_agent_execution_results').insert({
  verdict: 'CONDITIONAL_PASS',
  validation_mode: 'retrospective',
  justification: 'Feature complete.',
  conditions: [] // ✗ Must have at least 1 item
});
// Error: check_conditions_required

// ✓ CORRECT - At least 1 follow-up action
const result = await supabase.from('sub_agent_execution_results').insert({
  verdict: 'CONDITIONAL_PASS',
  validation_mode: 'retrospective',
  justification: 'Feature complete.',
  conditions: ['Create SD-FOLLOW-UP-001'] // ✓ At least 1 item
});
```

---

## Querying Results with New Columns

### Query 1: Get all CONDITIONAL_PASS entries

```javascript
const { data: conditionals } = await supabase
  .from('sub_agent_execution_results')
  .select('*')
  .eq('verdict', 'CONDITIONAL_PASS')
  .order('created_at', { ascending: false });

conditionals.forEach(entry => {
  console.log(`SD: ${entry.sd_id}`);
  console.log(`Justification: ${entry.justification}`);
  console.log(`Follow-ups: ${entry.conditions.join(', ')}`);
});
```

### Query 2: Filter by validation mode

```javascript
// Get all retrospective validations
const { data: retrospective } = await supabase
  .from('sub_agent_execution_results')
  .select('*')
  .eq('validation_mode', 'retrospective');

// Get all prospective validations (default)
const { data: prospective } = await supabase
  .from('sub_agent_execution_results')
  .select('*')
  .eq('validation_mode', 'prospective');
```

### Query 3: Get completion status (including CONDITIONAL_PASS)

```javascript
// Old way (before migration) - doesn't count CONDITIONAL_PASS
const { data: completed } = await supabase
  .from('sub_agent_execution_results')
  .select('*')
  .eq('sd_id', 'SD-001')
  .in('verdict', ['PASS']);

// New way (after migration) - includes CONDITIONAL_PASS
const { data: completed } = await supabase
  .from('sub_agent_execution_results')
  .select('*')
  .eq('sd_id', 'SD-001')
  .in('verdict', ['PASS', 'CONDITIONAL_PASS']);
```

### Query 4: Get audit trail of all conditional passes by agent

```javascript
const { data: agentConditionals } = await supabase
  .from('sub_agent_execution_results')
  .select('*')
  .eq('sub_agent_code', 'TESTING')
  .eq('verdict', 'CONDITIONAL_PASS')
  .order('created_at', { ascending: false });
```

---

## Best Practices

### ✓ DO:
- Use prospective mode for standard validation flows
- Use retrospective mode only for pragmatic completions
- Provide detailed, meaningful justification (explain the gap)
- List actionable follow-up items in conditions
- Reference SD IDs in conditions for traceability
- Document decisions in justification

### ✗ DON'T:
- Use CONDITIONAL_PASS when prospective validation will pass
- Write vague justifications ("work is done")
- Leave empty conditions arrays
- Use CONDITIONAL_PASS for workarounds (use BLOCKED instead)
- Skip justification field for CONDITIONAL_PASS

---

## When to Use Each Verdict

| Verdict | Mode | When to Use | Example |
|---------|------|----------|---------|
| PASS | prospective | All validation gates pass | All tests pass, no blockers |
| FAILED | prospective | Critical blocker found | Unit tests failing |
| BLOCKED | prospective | Unresolvable issue | Database down, missing dependency |
| WARNING | prospective | Passed with warnings | Tests pass but coverage <80% |
| CONDITIONAL_PASS | retrospective | Complete with documented gaps | Tests pass, performance optimization deferred |

---

## Need Help?

**Questions about the migration?** See: `/docs/migrations/US-001-migration-summary.md`

**Need to run verification?** Execute:
```bash
node scripts/verify-validation-modes-migration.js
```

**Have issues?** Check:
1. Error message matches one of the 4 error scenarios above
2. Justification is 50+ characters
3. Conditions array has at least 1 item
4. Using retrospective mode for CONDITIONAL_PASS

---

**Last Updated**: 2025-11-15
**For**: SD-LEO-PROTOCOL-V4-4-0 Implementation
