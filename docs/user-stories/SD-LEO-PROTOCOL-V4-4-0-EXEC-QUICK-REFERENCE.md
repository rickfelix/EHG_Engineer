# EXEC Quick Reference - SD-LEO-PROTOCOL-V4-4-0
## Sub-Agent Adaptive Validation System

**Status**: READY FOR EXEC PHASE
**Total Effort**: 7 hours
**Stories**: 3 (US-001, US-002, US-003)
**Test Cases**: 25+
**Acceptance Criteria**: 25+

---

## 60-Second Summary

**Problem**: Sub-agents block SDs at 85% completion due to validation criteria designed for prospective (pre-implementation) work being applied retrospectively (post-completion).

**Solution**: Add validation modes to sub-agents. Prospective mode (strict) for in-progress SDs, retrospective mode (pragmatic) for completed work. New verdict: CONDITIONAL_PASS with justification and follow-up actions.

**Impact**: Pragmatic completion without sacrificing validation rigor. SDs can reach 100% when delivered.

---

## Story Execution Order

```
1. US-001: Database Migration (1 hour)
   ├─ Add validation_mode column (prospective|retrospective)
   ├─ Add justification column (min 50 chars for CONDITIONAL_PASS)
   ├─ Add conditions column (JSONB array)
   ├─ Update verdict enum to include CONDITIONAL_PASS
   └─ Create indexes for performance

2. US-002: Sub-Agent Updates (4 hours) [After US-001]
   ├─ Update TESTING agent (--full-e2e flag logic)
   ├─ Update DOCMON agent (ignore pre-existing files)
   ├─ Update GITHUB agent (focus on PR merge status)
   ├─ Update DESIGN agent (accept if implementation complete)
   ├─ Update DATABASE agent (consistency)
   └─ Update STORIES agent (consistency)

3. US-003: Progress Calculation (2 hours) [After US-001, US-002]
   ├─ Update SQL function get_progress_breakdown()
   ├─ Update verdict filter queries
   ├─ Create/run unit tests (15+ cases)
   ├─ Create/run integration tests (8+ cases)
   ├─ Create/run performance tests
   └─ Verify backward compatibility
```

---

## US-001: Database Migration - 1 Hour

### What to Do

1. **Create migration file**: `database/migrations/YYYYMMDDHHMMSS_add_validation_modes.sql`
2. **Add validation_mode column** (TEXT, DEFAULT 'prospective', CHECK IN ('prospective', 'retrospective'))
3. **Add justification column** (TEXT, NULL unless CONDITIONAL_PASS)
4. **Add conditions column** (JSONB, NULL unless CONDITIONAL_PASS)
5. **Update verdict enum** to include CONDITIONAL_PASS
6. **Add CHECK constraints**:
   - justification ≥50 chars if CONDITIONAL_PASS
   - conditions non-empty if CONDITIONAL_PASS
   - CONDITIONAL_PASS only allowed if validation_mode = 'retrospective'
7. **Create indexes**: (sd_id, validation_mode), (verdict, validation_mode), audit trail

### Expected SQL Structure

```sql
ALTER TABLE sub_agent_execution_results
ADD COLUMN validation_mode TEXT DEFAULT 'prospective'
  CHECK (validation_mode IN ('prospective', 'retrospective'));

ALTER TABLE sub_agent_execution_results
ADD COLUMN justification TEXT;

ALTER TABLE sub_agent_execution_results
ADD CONSTRAINT check_justification_required
CHECK (
  verdict != 'CONDITIONAL_PASS' OR
  (justification IS NOT NULL AND length(justification) >= 50)
);

ALTER TABLE sub_agent_execution_results
ADD COLUMN conditions JSONB;

-- Create indexes
CREATE INDEX CONCURRENTLY idx_subagent_sd_mode
ON sub_agent_execution_results(sd_id, validation_mode);

CREATE INDEX CONCURRENTLY idx_subagent_verdict_mode
ON sub_agent_execution_results(verdict, validation_mode);
```

### Tests to Run

```bash
# Unit test - constraints
npm test -- tests/unit/database/migrations/validation-mode-migration.spec.js

# Verify backward compatibility
npm test -- tests/integration/database/migration-validation.spec.js
```

### Success Criteria

- All columns added
- All constraints enforce correctly
- Backward compatible (old rows default to prospective)
- Indexes created
- Tests pass
- <5ms query performance

---

## US-002: Sub-Agent Updates - 4 Hours

### What to Do (6 Agent Updates)

Each agent needs two code paths: prospective (strict) and retrospective (pragmatic)

#### TESTING Agent
**File**: `scripts/sub-agents/testing-agent.js`

Prospective:
```javascript
if (!commandIncludesFlag('--full-e2e')) {
  return { verdict: 'BLOCKED' };
}
```

Retrospective:
```javascript
if (testsPass && testCount > 0) {
  return {
    verdict: 'CONDITIONAL_PASS',
    justification: `Tests: ${unitCount} unit, ${e2eCount} E2E. Pass rate: ${passRate}%`,
    conditions: ['Fix known infrastructure gaps in follow-up SD']
  };
}
```

#### DOCMON Agent
**File**: `scripts/sub-agents/docmon-agent.js`

Prospective:
```javascript
const markdownFiles = files.filter(f => f.endsWith('.md'));
if (markdownFiles.length > 0) {
  return { verdict: 'BLOCKED' };
}
```

Retrospective:
```javascript
const newMarkdownFiles = gitChanges
  .filter(c => c.status === 'added' && c.path.endsWith('.md'));
if (newMarkdownFiles.length === 0) {
  return { verdict: 'PASS' };
}
```

#### GITHUB Agent
**File**: `scripts/sub-agents/github-agent.js`

Prospective:
```javascript
if (hasUntrackedFiles) {
  return { verdict: 'BLOCKED' };
}
```

Retrospective:
```javascript
if (prStatus === 'merged') {
  return { verdict: 'PASS' };
} else if (prStatus === 'approved') {
  return {
    verdict: 'CONDITIONAL_PASS',
    conditions: ['Merge PR before closing SD']
  };
}
```

#### DESIGN Agent
**File**: `scripts/sub-agents/design-agent.js`

Prospective:
```javascript
if (!hasWorkflowDiagram || !hasAccessibilityChecklist) {
  return { verdict: 'BLOCKED' };
}
```

Retrospective:
```javascript
if (implementationComplete && designCompliance > 0.90) {
  return {
    verdict: 'CONDITIONAL_PASS',
    justification: `Implementation complete with ${designCompliance}% design system compliance`,
    conditions: ['Document design decisions in follow-up']
  };
}
```

#### DATABASE & STORIES Agents
**Files**: `scripts/sub-agents/database-agent.js`, `scripts/sub-agents/stories-agent.js`

Just add validation_mode to results (same behavior in both modes):

```javascript
return {
  verdict: 'PASS',
  validation_mode: validationMode, // Add this
  // ... rest of result
};
```

### Tests to Run

```bash
# Unit tests - mode switching
npm test -- tests/unit/sub-agents/validation-mode-logic.spec.js

# Integration tests - across all agents
npm test -- tests/integration/sub-agents/adaptive-validation.spec.js
```

### Success Criteria

- All 6 agents implement adaptive logic
- Mode detection automatic (based on SD status)
- CONDITIONAL_PASS returns justification and conditions
- All tests passing
- No performance regression

---

## US-003: Progress Calculation - 2 Hours

### What to Do

1. **Update SQL function** `database/functions/get_progress_breakdown.sql`
2. **Update verdict filter queries** to include validation_mode logic
3. **Run unit tests** (15+ cases covering all verdict/mode combinations)
4. **Run integration tests** (8+ real SD scenarios)
5. **Run performance tests** (verify <5ms)

### Key SQL Logic

```sql
-- OLD (prospective only)
SELECT COUNT(*) FROM sub_agent_execution_results
WHERE sd_id = $1 AND verdict = 'PASS';

-- NEW (mode-aware)
SELECT COUNT(*) FROM sub_agent_execution_results
WHERE sd_id = $1
AND (
  verdict = 'PASS' OR
  (verdict = 'CONDITIONAL_PASS' AND validation_mode = 'retrospective')
);
```

### JavaScript Logic

```javascript
const counts = {
  'PASS + prospective': 6,       // Counts toward completion ✓
  'PASS + retrospective': 6,     // Counts toward completion ✓
  'CONDITIONAL_PASS + prospective': 5, // Does NOT count ✗
  'CONDITIONAL_PASS + retrospective': 6, // Counts toward completion ✓
  'BLOCKED + any': 0,            // Does NOT count ✗
};
```

### Tests to Run

```bash
# Unit tests - verdict logic
npm test -- tests/unit/progress/verdict-acceptance-logic.spec.js

# Integration tests - real scenarios
npm test -- tests/integration/progress/calculation-scenarios.spec.js

# Performance tests - <5ms requirement
npm test -- tests/performance/progress-calculation-perf.spec.js

# Backward compatibility
npm test -- tests/integration/database/migration-validation.spec.js
```

### Success Criteria

- Progress calculation correct for all verdict/mode combos
- Old SDs work without changes (backward compat)
- <5ms query performance
- Audit trail logged for CONDITIONAL_PASS
- All tests passing

---

## Verdict/Mode Decision Table

Print this and keep it handy:

```
PROSPECTIVE MODE (SD in development)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Verdict          Counts?  Actions
────────────────────────────────────
PASS             ✓ YES    Agent approved, continue
CONDITIONAL_PASS ✗ NO     Reject, strict validation required
BLOCKED          ✗ NO     Fix issue, re-run agent
FAILED           ✗ NO     Fix issue, re-run agent

RETROSPECTIVE MODE (SD completed)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Verdict          Counts?  Actions
────────────────────────────────────
PASS             ✓ YES    Agent approved, continue
CONDITIONAL_PASS ✓ YES    Log with justification & conditions
BLOCKED          ✗ NO     Review, may need fixes
FAILED           ✗ NO     Review, may need fixes
```

---

## Common Scenarios & Solutions

### Scenario 1: TESTING Agent - Infrastructure Gaps

**Problem**: Tests pass but with known infrastructure gaps (mock API not configured, some timeouts)

**Prospective Solution**: BLOCKED - Fix infrastructure first
**Retrospective Solution**: CONDITIONAL_PASS with conditions

```javascript
{
  verdict: 'CONDITIONAL_PASS',
  validation_mode: 'retrospective',
  justification: 'E2E tests pass (28/32). Unit tests pass (7/18). ' +
                 'Known infrastructure gaps: mock API not configured, ' +
                 'timeout on 11 tests. Core functionality validated.',
  conditions: [
    'Create SD-TESTING-INFRASTRUCTURE-FIX-001 (mock API configuration)',
    'Fix unit test timeouts (11/18)',
    'Update CI/CD to include --full-e2e flag'
  ]
}
```

### Scenario 2: DOCMON Agent - Documentation Files

**Problem**: Documentation files exist in directory

**Prospective Solution**: BLOCKED - Remove all markdown
**Retrospective Solution**: Check if new, only block if added in this SD

```javascript
// Retrospective: Files in git history are ignored
const newFiles = gitDiff.filter(f => f.status === 'added');
if (newFiles.filter(f => f.path.endsWith('.md')).length === 0) {
  return { verdict: 'PASS' };
}
```

### Scenario 3: GITHUB Agent - Untracked Files

**Problem**: Working directory has untracked files (temp files, node_modules, etc.)

**Prospective Solution**: BLOCKED - Clean directory
**Retrospective Solution**: Ignored, check PR status instead

```javascript
// Retrospective: Untracked files ignored, focus on PR
if (pr.merged) {
  return { verdict: 'PASS' };
} else if (pr.approved) {
  return {
    verdict: 'CONDITIONAL_PASS',
    conditions: ['Merge PR before closing SD']
  };
}
```

---

## Testing Checklist

Before declaring US complete:

### US-001 (Database)
- [ ] Migration file created with correct timestamp
- [ ] All 4 columns added (validation_mode, justification, conditions, enum)
- [ ] All 4 constraints enforced (validation_mode values, justification length, conditions required, CONDITIONAL_PASS mode)
- [ ] All indexes created (3 indexes)
- [ ] Unit tests pass (5+ test cases)
- [ ] Integration tests pass (backward compat verified)
- [ ] Rollback tested (migration can be undone)
- [ ] Performance verified (<5ms)

### US-002 (Sub-Agents)
- [ ] All 6 agents updated (TESTING, DOCMON, GITHUB, DESIGN, DATABASE, STORIES)
- [ ] Mode detection working (prospective vs retrospective)
- [ ] CONDITIONAL_PASS includes justification (≥50 chars) and conditions (array)
- [ ] Prospective behavior unchanged (strict validation)
- [ ] Retrospective behavior working (pragmatic validation)
- [ ] Unit tests pass (5+ test cases per agent)
- [ ] Integration tests pass (8+ cross-agent scenarios)
- [ ] No performance regression

### US-003 (Progress)
- [ ] SQL function updated (get_progress_breakdown)
- [ ] All verdict filter queries updated (mode-aware logic)
- [ ] Unit tests pass (15+ test cases covering all combos)
- [ ] Integration tests pass (8+ real SD scenarios)
- [ ] Performance tests pass (<5ms requirement)
- [ ] Backward compatibility verified (old SDs work)
- [ ] Audit trail working (CONDITIONAL_PASS logged)

---

## Performance Targets

Keep these in mind:

| Component | Target | Threshold |
|---|---|---|
| Database Migration | <1 hour | Blocking if >1 hour |
| Sub-Agent Updates | <4 hours | Blocking if >5 hours |
| Progress Calculation | <2 hours | Blocking if >3 hours |
| Query Performance | <5ms | Blocking if >10ms |
| Test Execution | <10 min | Blocking if >15 min |

---

## Emergency Contacts

If something goes wrong:

- **Database Issues**: Check migration is idempotent, can roll back
- **Agent Issues**: Each agent independent, can fix one without affecting others
- **Query Performance**: Check indexes are created, use EXPLAIN ANALYZE
- **Backward Compat**: Default to prospective mode, check NULL handling

---

## Key Files

Created for you:

```
User Stories (full documentation):
  /docs/user-stories/US-001-database-migration-adaptive-validation.md (680 lines)
  /docs/user-stories/US-002-sub-agent-updates-adaptive-validation.md (920 lines)
  /docs/user-stories/US-003-progress-calculation-and-testing.md (850 lines)

Reference:
  /docs/user-stories/SD-LEO-PROTOCOL-V4-4-0-CONTEXT-ENGINEERING-SUMMARY.md (700 lines)
  /docs/user-stories/SD-LEO-PROTOCOL-V4-4-0-EXEC-QUICK-REFERENCE.md (this file)

Original SD Draft:
  /tmp/SD-LEO-PROTOCOL-V4-4-0-draft.md (328 lines)
```

---

## Last Reminders

1. **Order Matters**: Do US-001 → US-002 → US-003 (dependencies)
2. **Test First**: Run tests as you go, not at the end
3. **Backward Compat**: Always test old SDs still work
4. **Performance**: Verify <5ms on each query update
5. **Justification**: CONDITIONAL_PASS needs clear justification (≥50 chars)
6. **Conditions**: Follow-up actions required for CONDITIONAL_PASS
7. **Audit Trail**: Log all CONDITIONAL_PASS verdicts
8. **No Breaking Changes**: Prospective mode defaults for safety

---

Good luck! You've got everything you need.

---

*Generated*: 2025-11-15
*For EXEC Phase*: SD-LEO-PROTOCOL-V4-4-0
*Effort Estimate*: 7 hours
*Status*: READY TO EXECUTE
