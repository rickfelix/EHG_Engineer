# US-002: Sub-Agent Updates - Implement Adaptive Validation Logic

## Story Summary
Update all 6 sub-agents (TESTING, DOCMON, GITHUB, DESIGN, DATABASE, STORIES) with adaptive validation logic that intelligently applies prospective or retrospective validation based on SD status, enabling pragmatic completion.

## Story Details

### User Persona
Sub-Agent Developer / Infrastructure Engineer

### Benefit Statement
Enable sub-agents to dynamically adapt validation criteria based on whether an SD is in development (prospective) or completed (retrospective), reducing false positives while maintaining quality gates.

### Complexity
Large (L) - 4 hours

---

## Acceptance Criteria

### AC-001: TESTING Agent - Prospective Mode
**Scenario**: Sub-agent requires strict E2E testing in prospective mode
**Given**: SD is in 'active' or 'in_progress' status (prospective mode)
**When**: TESTING agent executes
**Then**:
- Agent checks for `--full-e2e` flag in test command
- If missing, returns BLOCKED verdict
- If present, runs full E2E test suite
- Reports: number of unit tests, E2E tests, pass/fail counts
- Verdict: PASS (if all tests pass) or BLOCKED (if flag missing or tests fail)

**Test Evidence**:
```javascript
// Prospective mode (active SD)
const result = await testingAgent.validate({
  sd_status: 'active',
  test_command: 'npm test --full-e2e',
  validation_mode: 'prospective'
});
// Expected: PASS (tests ran with flag)

const result2 = await testingAgent.validate({
  sd_status: 'active',
  test_command: 'npm test', // Missing --full-e2e
  validation_mode: 'prospective'
});
// Expected: BLOCKED (required flag missing)
```

### AC-002: TESTING Agent - Retrospective Mode
**Scenario**: Sub-agent accepts passing tests without strict flag requirements
**Given**: SD is 'completed' or explicit `--retrospective` flag (retrospective mode)
**When**: TESTING agent executes
**Then**:
- Agent checks if E2E tests exist and pass (any method)
- If tests exist and pass: CONDITIONAL_PASS with confidence score
- If tests don't exist but manual validation provided: CONDITIONAL_PASS with lower confidence
- If no tests and no evidence: BLOCKED
- Justification documents: test count, pass rate, any gaps
- Conditions array includes follow-up actions

**Test Evidence**:
```javascript
// Retrospective mode (completed SD)
const result = await testingAgent.validate({
  sd_status: 'completed',
  test_results: { unit: 18, e2e: 32, pass_rate: 0.95 },
  validation_mode: 'retrospective'
});
// Expected: CONDITIONAL_PASS with justification about tests/gaps

const result2 = await testingAgent.validate({
  sd_status: 'completed',
  test_results: null,
  manual_evidence: 'Manual E2E validation completed by QA team',
  validation_mode: 'retrospective'
});
// Expected: CONDITIONAL_PASS with lower confidence (75-80%)
```

### AC-003: DOCMON Agent - Prospective Mode
**Scenario**: Document monitor blocks on ANY markdown files in prospective mode
**Given**: SD is in development (prospective mode)
**When**: DOCMON agent executes
**Then**:
- Agent scans for markdown files in SD working directory
- Returns BLOCKED if ANY markdown files found (pre-existing or new)
- Lists file paths and size
- Verdict: BLOCKED until directory cleaned

**Test Evidence**:
```javascript
// Prospective mode - strict documentation
const result = await docmonAgent.validate({
  sd_status: 'active',
  files: ['README.md', 'CHANGELOG.md', 'docs/api.md'],
  validation_mode: 'prospective'
});
// Expected: BLOCKED (any markdown blocks)
```

### AC-004: DOCMON Agent - Retrospective Mode
**Scenario**: Document monitor only flags NEW markdown files, ignores pre-existing
**Given**: SD is completed (retrospective mode)
**When**: DOCMON agent executes
**Then**:
- Agent uses git tracking to identify NEW files (not in git history)
- Only NEW markdown files trigger verdict
- Pre-existing files are ignored
- Uses git diff to calculate: added, modified, deleted counts
- Returns PASS if no new markdown, or CONDITIONAL_PASS with justification
- Conditions include: documentation debt, follow-up SD recommendation

**Test Evidence**:
```javascript
// Retrospective mode - only NEW files matter
const result = await docmonAgent.validate({
  sd_status: 'completed',
  new_files: ['DESIGN_DECISIONS.md'], // New in this SD
  existing_files: ['README.md', 'CHANGELOG.md'], // Pre-existing
  validation_mode: 'retrospective'
});
// Expected: CONDITIONAL_PASS (only DESIGN_DECISIONS.md is new)

const result2 = await docmonAgent.validate({
  sd_status: 'completed',
  new_files: [],
  existing_files: ['README.md'],
  validation_mode: 'retrospective'
});
// Expected: PASS (no new markdown)
```

### AC-005: GITHUB Agent - Prospective Mode
**Scenario**: GitHub agent requires clean working directory in prospective mode
**Given**: SD is in development (prospective mode)
**When**: GITHUB agent executes
**Then**:
- Agent checks for untracked files
- Agent checks for unstaged changes
- Returns BLOCKED if working directory dirty
- Lists problematic files
- Verdict: BLOCKED until cleaned

**Test Evidence**:
```javascript
// Prospective mode - strict cleanliness
const result = await githubAgent.validate({
  sd_status: 'active',
  untracked_files: ['src/temp.ts'],
  validation_mode: 'prospective'
});
// Expected: BLOCKED (untracked files)
```

### AC-006: GITHUB Agent - Retrospective Mode
**Scenario**: GitHub agent ignores untracked files, focuses on PR merge status
**Given**: SD is completed (retrospective mode)
**When**: GITHUB agent executes
**Then**:
- Agent ignores untracked files (not blocking)
- Agent checks PR merge status: merged into main, approved, all checks passed
- Returns PASS if PR merged successfully
- Returns CONDITIONAL_PASS if PR approved but not yet merged (with conditions)
- Returns BLOCKED only if PR has failing checks or missing approvals
- Conditions include: "Merge PR before closing SD"

**Test Evidence**:
```javascript
// Retrospective mode - focus on PR status
const result = await githubAgent.validate({
  sd_status: 'completed',
  pr_status: 'merged',
  pr_checks: 'all_passed',
  validation_mode: 'retrospective'
});
// Expected: PASS (PR merged with checks passing)

const result2 = await githubAgent.validate({
  sd_status: 'completed',
  pr_status: 'approved',
  pr_merge_pending: true,
  untracked_files: ['temp.ts'], // Ignored in retrospective
  validation_mode: 'retrospective'
});
// Expected: CONDITIONAL_PASS with condition "Merge PR"
```

### AC-007: DESIGN Agent - Prospective Mode
**Scenario**: Design agent validates workflow completeness in prospective mode
**Given**: SD is in development (prospective mode)
**When**: DESIGN agent executes
**Then**:
- Agent checks PRD is complete with all required sections
- Agent checks workflow diagram exists
- Agent checks accessibility checklist completed
- Agent checks design system compliance
- Returns BLOCKED if any required section missing
- Verdict: PASS (workflow complete) or BLOCKED (gaps)

**Test Evidence**:
```javascript
// Prospective mode - strict workflow validation
const result = await designAgent.validate({
  sd_status: 'active',
  prd_sections: ['overview', 'requirements'], // Missing accessibility
  validation_mode: 'prospective'
});
// Expected: BLOCKED (incomplete workflow)
```

### AC-008: DESIGN Agent - Retrospective Mode
**Scenario**: Design agent accepts implementation-complete SDs even with placeholder PRD data
**Given**: SD is completed (retrospective mode)
**When**: DESIGN agent executes
**Then**:
- Agent checks implementation is complete (code exists, deployed)
- Agent checks design system was followed (CSS classes, component reuse)
- If implementation complete: CONDITIONAL_PASS with justification
- Conditions include: "Document design decisions in follow-up SD"
- If implementation incomplete: BLOCKED
- Justification documents: what was implemented vs. what was planned

**Test Evidence**:
```javascript
// Retrospective mode - implementation complete overrides placeholder PRD
const result = await designAgent.validate({
  sd_status: 'completed',
  prd_status: 'placeholder_data',
  implementation_complete: true,
  code_deployed: true,
  design_system_compliance: 0.95,
  validation_mode: 'retrospective'
});
// Expected: CONDITIONAL_PASS (implementation complete)

const result2 = await designAgent.validate({
  sd_status: 'completed',
  implementation_complete: false, // Implementation not done
  validation_mode: 'retrospective'
});
// Expected: BLOCKED (implementation required)
```

### AC-009: DATABASE and STORIES Agents - Consistency Updates
**Scenario**: Ensure DATABASE and STORIES agents support both modes (already mostly passing)
**Given**: Both agents execute
**When**: Mode is set (prospective or retrospective)
**Then**:
- DATABASE agent: Schema validation same in both modes (no change needed)
- STORIES agent: Schema validation same in both modes (no change needed)
- Both agents update to explicitly set validation_mode in results
- Both agents return PASS verdict (unchanged behavior)

**Test Evidence**:
```javascript
// Both modes work identically for DATABASE/STORIES
const result = await databaseAgent.validate({
  validation_mode: 'prospective'
});
// Expected: Same behavior as before

const result2 = await databaseAgent.validate({
  validation_mode: 'retrospective'
});
// Expected: Same behavior as before
```

---

## Implementation Context

### Architecture References

**Similar Components**:
- `scripts/sub-agents/testing-agent.js` - Existing structure to extend
- `scripts/sub-agents/docmon-agent.js` - File scanning patterns
- `scripts/sub-agents/github-agent.js` - API integration pattern
- `scripts/sub-agents/design-agent.js` - Validation logic pattern
- `database/schema/007_leo_protocol_schema.sql` - Verdict enum definition

**Patterns to Follow**:
1. **Mode Detection**: Read SD status → determine validation_mode automatically
   ```javascript
   const getValidationMode = (sdStatus) => {
     return ['completed', 'delivered'].includes(sdStatus) ? 'retrospective' : 'prospective';
   };
   ```

2. **Conditional Verdict Logic**: Return appropriate verdict based on mode
   ```javascript
   if (validationMode === 'prospective') {
     return verdict === 'PASS' ? { verdict: 'PASS' } : { verdict: 'BLOCKED', reason };
   } else {
     // retrospective: can return CONDITIONAL_PASS
     return { verdict: 'CONDITIONAL_PASS', justification, conditions };
   }
   ```

3. **Justification Format**: Clear, specific evidence
   ```javascript
   justification: `Tests executed: 7/18 unit, 4/32 E2E. ` +
     `Pass rate: ${passRate}%. Known issue: Mock API configured. ` +
     `Manual validation: Completed by QA team.`
   ```

4. **Conditions Array**: Actionable follow-up items
   ```javascript
   conditions: [
     'Follow-up SD: SD-TESTING-INFRASTRUCTURE-FIX-001 (fix timeouts)',
     'Update CI/CD to include --full-e2e flag',
     'Document testing strategy in wiki'
   ]
   ```

### Integration Points

**Each Sub-Agent Updates**:

```javascript
// Base pattern for each agent

async function executeValidation(params) {
  const {
    sd_id,
    sd_status,
    sd_phase,
    validation_mode_explicit, // Optional explicit override
    ...agentSpecificParams
  } = params;

  // 1. Determine validation mode (auto or explicit)
  const validationMode = validationMode_explicit ||
    (['completed', 'delivered'].includes(sd_status) ? 'retrospective' : 'prospective');

  // 2. Execute mode-specific validation
  const result = validationMode === 'prospective'
    ? await prospectiveValidation(params)
    : await retrospectiveValidation(params);

  // 3. Return with validation_mode included
  return {
    ...result,
    validation_mode: validationMode,
    timestamp: new Date().toISOString(),
    executed_by: 'SUB_AGENT_SYSTEM'
  };
}
```

### Example Code Patterns

**TESTING Agent - Adaptive Logic**:

```javascript
// scripts/sub-agents/testing-agent.js

async function validateTesting(params) {
  const { sd_id, sd_status, test_results, validation_mode } = params;

  if (validation_mode === 'prospective') {
    // Strict prospective validation
    return prospectiveTestValidation(test_results);
  } else {
    // Pragmatic retrospective validation
    return retrospectiveTestValidation(test_results);
  }
}

function prospectiveTestValidation(testResults) {
  // Require --full-e2e flag
  if (!testResults.fullE2eFlag) {
    return {
      verdict: 'BLOCKED',
      reason: 'E2E tests must be run with --full-e2e flag',
      confidence: 100
    };
  }

  // Check pass rate
  if (testResults.passRate < 1.0) {
    return {
      verdict: 'BLOCKED',
      reason: `Test pass rate ${testResults.passRate}% < 100%`,
      confidence: 100
    };
  }

  return { verdict: 'PASS', confidence: 95 };
}

function retrospectiveTestValidation(testResults) {
  // Accept any passing tests
  if (!testResults.testFiles) {
    return { verdict: 'BLOCKED', reason: 'No tests found' };
  }

  if (testResults.passRate >= 0.85) {
    return {
      verdict: 'CONDITIONAL_PASS',
      confidence: Math.round(testResults.passRate * 100),
      justification:
        `Tests executed: ${testResults.unitTests} unit, ` +
        `${testResults.e2eTests} E2E. Pass rate: ${Math.round(testResults.passRate * 100)}%. ` +
        `Manual validation evidence: ${testResults.manualEvidence || 'Not provided'}`,
      conditions: [
        'Fix failing tests in follow-up SD',
        'Update test infrastructure (mock API, timeouts)',
        'Add --full-e2e flag to CI/CD pipeline'
      ]
    };
  }

  return {
    verdict: 'BLOCKED',
    reason: `Pass rate ${testResults.passRate}% below retrospective threshold (85%)`
  };
}
```

**DOCMON Agent - File Change Detection**:

```javascript
// scripts/sub-agents/docmon-agent.js

async function validateDocumentation(params) {
  const { sd_id, validation_mode, files, gitChanges } = params;

  if (validation_mode === 'prospective') {
    // Block on any markdown
    return prospectiveDocValidation(files);
  } else {
    // Only block on NEW markdown
    return retrospectiveDocValidation(files, gitChanges);
  }
}

function prospectiveDocValidation(files) {
  const markdownFiles = files.filter(f => f.endsWith('.md'));
  if (markdownFiles.length > 0) {
    return {
      verdict: 'BLOCKED',
      reason: `Found ${markdownFiles.length} markdown files that must be cleaned up`,
      files: markdownFiles
    };
  }
  return { verdict: 'PASS' };
}

async function retrospectiveDocValidation(files, gitChanges) {
  // Use git to find NEW files
  const newMarkdownFiles = gitChanges
    .filter(change => change.status === 'added' && change.path.endsWith('.md'))
    .map(change => change.path);

  if (newMarkdownFiles.length === 0) {
    return { verdict: 'PASS' };
  }

  return {
    verdict: 'CONDITIONAL_PASS',
    justification:
      `Added ${newMarkdownFiles.length} markdown file(s): ` +
      newMarkdownFiles.join(', ') +
      `. Pre-existing markdown files ignored (git-tracked).`,
    conditions: [
      `Document design decisions in ${newMarkdownFiles[0]}`,
      'Update wiki with implementation notes',
      'Create SD-DOCUMENTATION-DEBT-001 for comprehensive docs'
    ]
  };
}
```

---

## Testing Strategy

### Unit Tests (Phase 1)

**Test File**: `tests/unit/sub-agents/validation-mode-logic.spec.js`

```javascript
describe('Sub-Agent Validation Mode Switching', () => {
  describe('TESTING Agent Mode Switching', () => {
    test('Prospective: should require --full-e2e flag', () => {
      const result = testingAgent.validateMode({
        validation_mode: 'prospective',
        command: 'npm test' // Missing flag
      });
      expect(result.verdict).toBe('BLOCKED');
    });

    test('Retrospective: should accept passing tests', () => {
      const result = testingAgent.validateMode({
        validation_mode: 'retrospective',
        pass_rate: 0.95,
        test_count: { unit: 20, e2e: 40 }
      });
      expect(result.verdict).toBe('CONDITIONAL_PASS');
      expect(result.justification).toBeDefined();
      expect(result.conditions).toBeDefined();
    });
  });

  describe('DOCMON Agent Mode Switching', () => {
    test('Prospective: should block on any markdown', () => {
      const result = docmonAgent.validateMode({
        validation_mode: 'prospective',
        files: ['docs/api.md']
      });
      expect(result.verdict).toBe('BLOCKED');
    });

    test('Retrospective: should ignore pre-existing files', () => {
      const result = docmonAgent.validateMode({
        validation_mode: 'retrospective',
        new_files: [],
        existing_files: ['README.md']
      });
      expect(result.verdict).toBe('PASS');
    });
  });
});
```

### Integration Tests (Phase 2)

**Test File**: `tests/integration/sub-agents/adaptive-validation.spec.js`

```javascript
describe('Adaptive Validation Across All Sub-Agents', () => {
  test('Should detect mode based on SD status', async () => {
    const sd = await querySD('SD-001');
    const mode = getValidationMode(sd.status);

    expect(['prospective', 'retrospective']).toContain(mode);
  });

  test('All 6 agents should honor validation_mode', async () => {
    const agents = [
      'TESTING', 'DOCMON', 'GITHUB', 'DESIGN', 'DATABASE', 'STORIES'
    ];

    for (const agent of agents) {
      const result = await executeAgent(agent, { validation_mode: 'retrospective' });
      expect(result).toHaveProperty('validation_mode');
      expect(result.validation_mode).toBe('retrospective');
    }
  });

  test('CONDITIONAL_PASS should only be allowed in retrospective mode', async () => {
    const prospectiveResult = await testingAgent.validate({
      validation_mode: 'prospective'
    });
    expect(['PASS', 'BLOCKED']).toContain(prospectiveResult.verdict);

    const retrospectiveResult = await testingAgent.validate({
      validation_mode: 'retrospective'
    });
    expect(['PASS', 'BLOCKED', 'CONDITIONAL_PASS']).toContain(
      retrospectiveResult.verdict
    );
  });
});
```

---

## Success Criteria

- All 6 sub-agents implement adaptive validation logic
- Mode detection is automatic (based on SD status)
- CONDITIONAL_PASS verdicts include justification and conditions
- Prospective mode behavior unchanged from baseline
- Retrospective mode accepts pragmatic completions with audit trail
- All tests passing (unit + integration)
- <5ms overhead for mode detection
- Backward compatible with existing SDs

---

## Story Dependencies

**Depends On**: US-001 (Database Migration)

**Blocks**: US-003 (Progress Calculation Update)

---

## References

- Draft: `/tmp/SD-LEO-PROTOCOL-V4-4-0-draft.md` (Phase 2: Sub-Agent Updates)
- Root Cause: `/tmp/leo-protocol-handoff-constraint-analysis.md`
- Agents: `scripts/sub-agents/` directory

**Created**: 2025-11-15
**Status**: READY FOR DEVELOPMENT
