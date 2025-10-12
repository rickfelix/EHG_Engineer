# Checkpoint Pattern for Large Strategic Directives

**Status**: ACTIVE
**Last Updated**: 2025-10-12
**Evidence**: Lessons learned from SD-SETTINGS-2025-10-12 (12 user stories)

---

## Overview

The Checkpoint Pattern breaks large Strategic Directives (12+ user stories) into manageable chunks with interim validation points. This reduces context consumption, enables incremental progress tracking, and allows for mid-execution course corrections.

## Problem Statement

**Traditional Approach** (Full Implementation):
- Implement all 12 user stories
- Build + test at the end
- Single massive EXEC→PLAN handoff
- High risk if issues found late

**Issues**:
- Context can exceed 150K tokens for large SDs
- Debugging is harder (too many changes)
- No way to pause/resume without losing progress
- Human cannot review until everything is done

**Solution**: Break into 3-4 checkpoints with validation gates

---

## When to Use Checkpoints

### Size Thresholds

| User Stories | Estimated LOC | Checkpoint Strategy | Rationale |
|--------------|---------------|---------------------|-----------|
| **1-4** | <500 LOC | No checkpoints | Small enough for single pass |
| **5-8** | 500-1500 LOC | Optional (2 checkpoints) | Can be done in one session if focused |
| **9-12** | 1500-3000 LOC | Recommended (3 checkpoints) | Reduces context and risk |
| **13+** | >3000 LOC | Mandatory (4+ checkpoints) | Too large without breaks |

### Complexity Indicators

Use checkpoints if ANY of these apply:
- Multiple components need creation (4+)
- Database migrations required
- Third-party integrations involved
- Multiple team members reviewing
- Implementation spans >8 hours
- Related to critical business logic

---

## Checkpoint Structure

### Example: SD-SETTINGS-2025-10-12 (12 User Stories)

**Total Scope**: Split SystemConfiguration.tsx + implement NotificationSettings
**Estimated Effort**: 6-8 hours
**Recommendation**: 3 checkpoints

#### Checkpoint 1: Component Splitting (US-001 to US-004)

**Scope**:
- US-001: Split SystemConfiguration.tsx into focused components
- US-002: Create GeneralSettings.tsx (300-600 LOC)
- US-003: Create DatabaseSettings.tsx (300-600 LOC)
- US-004: Create IntegrationSettings.tsx (300-600 LOC)

**Deliverables**:
- 3 new component files created
- SystemConfiguration.tsx refactored
- All components within optimal LOC range
- TypeScript compilation passes
- Build completes successfully

**Validation**:
```bash
# Quick validation
npm run type-check
npm run build:skip-checks
wc -l src/components/settings/*.tsx
```

**Exit Criteria**:
- ✅ All 4 files created
- ✅ LOC within 300-600 range per component
- ✅ No TypeScript errors
- ✅ Build completes

**Mini-Handoff** (Optional):
- Create checkpoint summary in handoff tracking table
- Document what's complete, what's pending
- PLAN can optionally review before continuing

**Time**: 2-3 hours

---

#### Checkpoint 2: New Feature Implementation (US-005 to US-008)

**Scope**:
- US-005: Implement NotificationSettings.tsx (400-500 LOC)
- US-006: Add global notification controls
- US-007: Implement per-category settings
- US-008: Add digest preferences

**Deliverables**:
- NotificationSettings.tsx complete
- All notification features functional
- State management working
- Dev server tested

**Validation**:
```bash
# Build + restart
npm run build
pkill -f "vite"
npm run dev

# Manual smoke test
# Navigate to /settings → Notifications tab
# Toggle settings, verify persistence
```

**Exit Criteria**:
- ✅ NotificationSettings.tsx complete (400-500 LOC)
- ✅ All features implemented
- ✅ Manual smoke test passed
- ✅ No console errors

**Mini-Handoff** (Optional):
- Update checkpoint status
- Screenshot evidence of working features
- Note any issues discovered

**Time**: 2-3 hours

---

#### Checkpoint 3: Testing + Documentation (US-009 to US-012)

**Scope**:
- US-009: Unit tests for all components
- US-010: E2E tests for user flows
- US-011: Accessibility validation
- US-012: Documentation generation

**Deliverables**:
- Unit tests passing
- E2E tests passing (100% user story coverage)
- CI/CD green
- Documentation generated
- Final EXEC→PLAN handoff

**Validation**:
```bash
# Full test suite
npm run test:unit
npm run test:e2e
npm run test:a11y

# CI/CD check
gh run list --limit 5
```

**Exit Criteria**:
- ✅ All tests passing
- ✅ CI/CD green
- ✅ Documentation complete
- ✅ EXEC→PLAN handoff created

**Time**: 2-3 hours

---

## Checkpoint Workflow

### 1. Planning Phase (PLAN Agent)

**During PRD Creation**:
```markdown
## Implementation Checkpoints

**Checkpoint 1**: Component Splitting (US-001 to US-004)
- **Duration**: 2-3 hours
- **Deliverables**: 4 components created, build passes
- **Exit Criteria**: TypeScript clean, LOC optimal

**Checkpoint 2**: Feature Implementation (US-005 to US-008)
- **Duration**: 2-3 hours
- **Deliverables**: NotificationSettings complete, smoke test passed
- **Exit Criteria**: Features functional, no errors

**Checkpoint 3**: Testing & Docs (US-009 to US-012)
- **Duration**: 2-3 hours
- **Deliverables**: All tests passing, docs generated
- **Exit Criteria**: CI/CD green, handoff created
```

### 2. Execution Phase (EXEC Agent)

**At Each Checkpoint**:
1. Complete user stories for that checkpoint
2. Run checkpoint validation (build, quick tests)
3. Create checkpoint summary (brief update)
4. Take screenshots if UI changes
5. Update todo list to mark checkpoint complete
6. Optionally: Create mini-handoff for PLAN review

**Between Checkpoints**:
- Commit code with checkpoint marker:
  ```bash
  git commit -m "feat(SD-XXX): Checkpoint 1 complete - Component splitting

  - Created GeneralSettings.tsx (105 LOC)
  - Created DatabaseSettings.tsx (143 LOC)
  - Created IntegrationSettings.tsx (143 LOC)
  - Refactored SystemConfiguration.tsx (503 LOC)

  Checkpoint 1 of 3 complete.

  🤖 Generated with [Claude Code](https://claude.com/claude-code)

  Co-Authored-By: Claude <noreply@anthropic.com>"
  ```

- Brief pause to check context health
- Resume with next checkpoint

### 3. Verification Phase (PLAN Agent)

**Optional Incremental Review**:
- Review checkpoint summaries
- Spot-check code quality at each checkpoint
- Provide feedback before final checkpoint
- Reduces risk of major rework at the end

**Final Verification**:
- Standard PLAN verification process
- Reviews all checkpoints holistically
- Creates PLAN→LEAD handoff

---

## Benefits

### Context Management

**Without Checkpoints**:
```
Implementation: 60K tokens
Testing: 40K tokens
Debugging: 30K tokens
Total: 130K tokens (65% of budget)
```

**With Checkpoints** (3 checkpoints):
```
Checkpoint 1: 25K tokens (implementation + quick validation)
Checkpoint 2: 30K tokens (features + smoke test)
Checkpoint 3: 35K tokens (full testing + docs)
Total: 90K tokens (45% of budget)
Saved: 40K tokens (20% budget)
```

### Risk Reduction

- **Early Error Detection**: Catch issues in Checkpoint 1 before implementing Checkpoints 2-3
- **Incremental Validation**: Each checkpoint validated independently
- **Easier Debugging**: Smaller change sets per checkpoint
- **Clearer Progress**: Human can see partial completion

### Flexibility

- **Pause/Resume**: Can stop after any checkpoint
- **Context Switch**: Easier to resume if interrupted
- **Course Correction**: PLAN can adjust strategy mid-execution
- **Incremental Review**: Human can review in chunks

---

## Anti-Patterns

### ❌ Too Many Checkpoints

**Bad**:
```
Checkpoint 1: US-001 only (30 minutes)
Checkpoint 2: US-002 only (30 minutes)
Checkpoint 3: US-003 only (30 minutes)
...
Checkpoint 12: US-012 only (30 minutes)
```

**Problem**: Overhead of checkpoint process exceeds benefits

**Better**: Group related user stories (3-4 per checkpoint)

### ❌ Uneven Checkpoint Distribution

**Bad**:
```
Checkpoint 1: US-001 to US-002 (1 hour)
Checkpoint 2: US-003 to US-010 (6 hours)
Checkpoint 3: US-011 to US-012 (1 hour)
```

**Problem**: Checkpoint 2 is too large, defeats the purpose

**Better**: Distribute evenly (2-3 hours per checkpoint)

### ❌ No Validation Between Checkpoints

**Bad**:
- Complete Checkpoint 1
- Complete Checkpoint 2
- Complete Checkpoint 3
- Run tests once at the end

**Problem**: Errors discovered late affect all checkpoints

**Better**: Quick validation after each checkpoint (build, type-check, smoke test)

---

## Checkpoint Decision Tree

```
SD has 12+ user stories?
├─ YES → Use checkpoints
│   ├─ Related features?
│   │   ├─ YES → Group by feature area (e.g., settings components)
│   │   └─ NO → Group by user story sequence
│   ├─ Complex implementation?
│   │   ├─ YES → 4 checkpoints (2 hours each)
│   │   └─ NO → 3 checkpoints (2.5 hours each)
│   └─ Database changes?
│       ├─ YES → Checkpoint 1 = schema, Checkpoint 2 = features, Checkpoint 3 = tests
│       └─ NO → Standard 3-checkpoint pattern
└─ NO → No checkpoints needed
    └─ Implement + test in single pass
```

---

## Templates

### Checkpoint Summary Template

```markdown
## Checkpoint [N] of [TOTAL]: [NAME]

**User Stories**: US-XXX to US-XXX
**Duration**: [actual time]
**Status**: COMPLETE ✅ / BLOCKED ❌

### Deliverables Completed
- ✅ [Deliverable 1]
- ✅ [Deliverable 2]
- ✅ [Deliverable 3]

### Validation Results
- **TypeScript**: PASS
- **Build**: PASS (1m 4s)
- **Quick Test**: PASS / SKIPPED / BLOCKED
- **Smoke Test**: PASS / N/A

### Issues Encountered
- None / [Issue description]

### Context Health
- **Current Usage**: XK tokens (Y%)
- **Status**: HEALTHY / WARNING

### Next Steps
- Proceed to Checkpoint [N+1]
- Resume implementation of US-XXX

### Evidence
- [Screenshots if applicable]
- [Commit SHA if committed]
```

---

## Success Metrics

**Expected Outcomes**:
- 30-40% reduction in context consumption
- 50% faster debugging (smaller change sets)
- 90% of checkpoints completed on first attempt
- 80% reduction in late-stage rework

**From SD-SETTINGS-2025-10-12 Analysis**:
- Would have benefited from 3 checkpoints
- Context at 85K tokens (42%) could have been 60K (30%)
- Mid-execution review could have caught issues earlier

---

## Related Documentation

- `docs/reference/test-timeout-handling.md` - Testing strategies
- `docs/reference/context-monitoring.md` - Context management
- `CLAUDE.md` - LEO Protocol 5-phase workflow
- `docs/reference/unified-handoff-system.md` - Handoff creation

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-10-12 | Initial version from SD-SETTINGS-2025-10-12 lessons |

---

**REMEMBER**: Checkpoints are not overhead - they're insurance against context explosion and late-stage rework. Use them for any SD with 9+ user stories or 1500+ LOC.
