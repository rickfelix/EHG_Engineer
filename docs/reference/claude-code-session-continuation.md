# Claude Code Session Continuation Best Practices


## Metadata
- **Category**: Reference
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-13
- **Tags**: database, testing, e2e, unit

**Status**: ACTIVE
**Last Updated**: 2025-10-12
**Evidence**: Proven effective in SD-SETTINGS-2025-10-12 continuation

---

## Overview

Session continuation is a critical skill for AI agents when context limits are reached or sessions need to pause/resume. This guide documents proven patterns from successful SD executions.

## Success Pattern: SD-SETTINGS-2025-10-12

This session demonstrated **exceptional continuation practices** that should become standard operating procedure.

### What Worked Well

#### 1. Comprehensive Summary Format

**Approach**:
- Chronological analysis of all actions taken
- File-by-file documentation with exact line counts
- Clear distinction between completed/pending tasks
- Technical details preserved for resume

**Structure Used**:
```markdown
## 1. Primary Request and Intent
[User's original goal and SD context]

## 2. Key Technical Concepts
[Technologies, patterns, frameworks]

## 3. Files and Code Sections
### File 1: /path/to/file.tsx (XXX LOC)
**Purpose**: What this file does
**Importance**: Why it matters
```typescript
// Key code snippets
```

## 4. Errors and Fixes
[Problems encountered and solutions]

## 5. Problem Solving
[Decisions made and rationale]

## 6. All User Messages
[Complete conversation log]

## 7. Pending Tasks
[Todo list with priorities]

## 8. Current Work
[Exact state when paused]

## 9. Optional Next Step
[What comes next with context]
```

**Context Impact**: 57K tokens for comprehensive summary (manageable)

**Benefits**:
- New session can resume immediately
- No loss of technical context
- Clear handoff of state
- Human can review progress

---

#### 2. Todo List Maintenance

**Pattern**: Update after each major task completion

**Example from SD-SETTINGS-2025-10-12**:
```json
[
  {"content": "Create GeneralSettings.tsx", "status": "completed"},
  {"content": "Create DatabaseSettings.tsx", "status": "completed"},
  {"content": "Create IntegrationSettings.tsx", "status": "completed"},
  {"content": "Refactor SystemConfiguration.tsx", "status": "completed"},
  {"content": "Implement NotificationSettings", "status": "in_progress"},
  {"content": "Run unit tests", "status": "pending"},
  {"content": "Run E2E tests", "status": "pending"},
  {"content": "Create EXEC→PLAN handoff", "status": "pending"}
]
```

**Benefits**:
- Quick orientation after context switch
- Clear progress tracking
- Easy to see what's left
- Human understands status at a glance

**Best Practice**: Update TodoWrite after EVERY major milestone, not in batches

---

#### 3. Incremental Implementation

**Anti-Pattern** (DO NOT DO):
```typescript
// Attempt to create all 4 components simultaneously
Write('GeneralSettings.tsx', content1);
Write('DatabaseSettings.tsx', content2);
Write('IntegrationSettings.tsx', content3);
Write('SystemConfiguration.tsx', content4);
// Problem: If one fails, hard to debug
```

**Best Practice** (DO THIS):
```typescript
// Create one component at a time
Write('GeneralSettings.tsx', content);
// Verify
Bash('wc -l GeneralSettings.tsx'); // Confirm: 105 LOC ✅

Write('DatabaseSettings.tsx', content);
// Verify
Bash('wc -l DatabaseSettings.tsx'); // Confirm: 143 LOC ✅

Write('IntegrationSettings.tsx', content);
// Verify
Bash('wc -l IntegrationSettings.tsx'); // Confirm: 143 LOC ✅

Write('SystemConfiguration.tsx', content);
// Verify
Bash('wc -l SystemConfiguration.tsx'); // Confirm: 503 LOC ✅
```

**Benefits**:
- Easier to debug failures
- Can checkpoint mid-process
- Clear progress markers
- Validation at each step

---

#### 4. Pre-Implementation Verification Checklist

**MANDATORY Before Writing ANY Code**:

```markdown
## EXEC Pre-Implementation Checklist
- [ ] Application: [EHG or EHG_Engineer - VERIFIED via pwd]
  ```bash
  cd ../ehg && pwd
  # Expected: EHG directory
  ```

- [ ] GitHub remote: [verified via git remote -v]
  ```bash
  git remote -v
  # Expected: origin  https://github.com/rickfelix/ehg.git
  ```

- [ ] URL: [exact URL from PRD - accessible: YES/NO]
  ```bash
  curl -I http://localhost:5173/settings
  # Expected: 200 OK or 302 Redirect
  ```

- [ ] Component: [path/to/component identified]
  ```bash
  ls -la src/components/settings/SystemConfiguration.tsx
  # Expected: File exists
  ```

- [ ] Screenshot: [BEFORE state captured]
  # Take screenshot of current state for comparison
```

**Result from SD-SETTINGS-2025-10-12**: **ZERO "wrong directory" errors** ✅

**Time Investment**: 2-3 minutes
**Time Saved**: 30-60 minutes of debugging wrong-repo changes

---

#### 5. Build + Restart After All Components Complete

**Pattern**: Don't build after each component (wasteful)

**Anti-Pattern**:
```bash
Write('Component1.tsx', ...);
npm run build; # 1m 4s
Write('Component2.tsx', ...);
npm run build; # 1m 4s
Write('Component3.tsx', ...);
npm run build; # 1m 4s
# Total: 3m 12s of build time
```

**Best Practice**:
```bash
Write('Component1.tsx', ...);
Write('Component2.tsx', ...);
Write('Component3.tsx', ...);
# Now build once
npm run build; # 1m 4s
# Total: 1m 4s of build time
```

**Time Saved**: 2m 8s in the example above

**After Build**:
```bash
# Kill old server
pkill -f "vite"

# Restart server
npm run dev

# Wait for ready message
# "VITE v5.4.20 ready in 1093 ms"

# Hard refresh browser
# Ctrl+Shift+R (Windows) / Cmd+Shift+R (Mac)
```

---

## Session Continuation Checklist

### Ending a Session

**Before Running Out of Context**:

1. **Update Todo List**:
   ```bash
   TodoWrite([
     {content: "Task 1", status: "completed"},
     {content: "Task 2", status: "in_progress"}, // Current task
     {content: "Task 3", status: "pending"}
   ]);
   ```

2. **Document Current State**:
   - What file you're working on
   - What line/function you're in
   - What the next step is
   - Any pending decisions

3. **Create Checkpoint Commit** (if mid-implementation):
   ```bash
   git commit -m "chore(SD-XXX): WIP checkpoint - [brief description]

   Current status:
   - [x] Component 1 complete
   - [ ] Component 2 in progress (50% done)
   - [ ] Component 3 pending

   Next steps:
   1. Finish Component 2 state management
   2. Add error handling
   3. Test Component 2

   🤖 Generated with [Claude Code](https://claude.com/claude-code)

   Co-Authored-By: Claude <noreply@anthropic.com>"
   ```

4. **Notify User**:
   ```markdown
   ## Session Context Warning

   **Context Usage**: 185K tokens (92.5% of budget)
   **Status**: CRITICAL - Need to pause for handoff

   **Completed**:
   - ✅ Task 1
   - ✅ Task 2

   **In Progress**:
   - 🔄 Task 3 (50% complete)

   **Pending**:
   - ⏳ Task 4
   - ⏳ Task 5

   **Resume Point**: Continue with Task 3 - state management for NotificationSettings

   Would you like me to create a summary for session continuation?
   ```

### Starting a New Session

**When Resuming**:

1. **Read Continuation Summary** (provided by user or previous session)

2. **Verify Application State**:
   ```bash
   cd ../ehg && pwd  # Confirm directory
   git status                  # Check for uncommitted changes
   git log -1                  # See last commit
   ```

3. **Read Current Files**:
   ```bash
   # Read files mentioned in summary
   Read('src/components/settings/NotificationSettings.tsx');
   ```

4. **Check Build Status**:
   ```bash
   npm run type-check  # Verify TypeScript compiles
   npm run lint        # Check for linting errors
   ```

5. **Resume Todo List**:
   ```bash
   TodoWrite([
     {content: "Task 1", status: "completed"},     # From summary
     {content: "Task 2", status: "completed"},     # From summary
     {content: "Task 3", status: "in_progress"},   # Resume here
     {content: "Task 4", status: "pending"}
   ]);
   ```

6. **Confirm Resume Point with User**:
   ```markdown
   I've reviewed the session summary and current state:

   **Completed**: Tasks 1-2 (Components A, B, C created)
   **Current**: Task 3 (NotificationSettings - 50% complete)
   **Pending**: Tasks 4-5 (Testing + handoff)

   I'll continue with Task 3: Completing NotificationSettings component.
   Is this correct, or would you like me to focus on something else?
   ```

---

## Context Health Monitoring

### Proactive Monitoring

**Check context periodically** (every 30-60 minutes):

```markdown
## Context Health Check

**Current Usage**: 120K tokens (60% of 200K budget)
**Status**: 🟢 HEALTHY
**Recommendation**: Continue normally

**Breakdown**:
- Conversation: 40K
- Code reads: 50K
- Tool outputs: 30K

**Remaining Capacity**: 80K tokens
**Estimated time left**: 2-3 hours of work
```

**Thresholds**:
- 0-70% (0-140K): HEALTHY - Continue normally
- 70-90% (140K-180K): WARNING - Start planning handoff
- 90-95% (180K-190K): CRITICAL - Must create handoff soon
- 95%+ (>190K): EMERGENCY - Stop and handoff immediately

### Context Compaction

**When to Use `/context-compact`**:
- Context reaches WARNING (70-90%)
- About to start large task (testing, documentation)
- Need to extend session beyond 3 hours

**How to Use**:
```bash
/context-compact [focus-area]
```

**Examples**:
```bash
/context-compact database-schema     # Compact DB-related context
/context-compact test-results        # Compact test output
/context-compact component-code      # Compact component implementations
```

---

## Anti-Patterns to Avoid

### ❌ Incomplete Summaries

**Bad**:
```markdown
## Summary
We implemented some components and now need to test.
```

**Good**:
```markdown
## Summary
- Created GeneralSettings.tsx (105 LOC)
- Created DatabaseSettings.tsx (143 LOC)
- Created IntegrationSettings.tsx (143 LOC)
- Refactored SystemConfiguration.tsx (790 LOC → 503 LOC)
- Currently implementing NotificationSettings.tsx (50% complete, 220/440 LOC)
- Next: Complete NotificationSettings, run tests, create handoff
```

### ❌ Batch Todo Updates

**Bad**:
```typescript
// Implement all 4 components
Write('Component1.tsx', ...);
Write('Component2.tsx', ...);
Write('Component3.tsx', ...);
Write('Component4.tsx', ...);

// Update todo once at the end
TodoWrite([all_tasks_marked_complete]);
```

**Good**:
```typescript
Write('Component1.tsx', ...);
TodoWrite([{content: "Component 1", status: "completed"}]);

Write('Component2.tsx', ...);
TodoWrite([{content: "Component 2", status: "completed"}]);

// Update after EACH task
```

### ❌ No Verification Steps

**Bad**:
```typescript
Write('Component.tsx', content);
// Assume it worked, move on
```

**Good**:
```typescript
Write('Component.tsx', content);
// Verify
Bash('wc -l Component.tsx');  // Check line count
Bash('cat Component.tsx | head -20');  // Verify content
```

---

## Templates

### Session Summary Template

```markdown
# Session Continuation Summary: SD-XXX

## Session Info
- **SD ID**: SD-XXX
- **Phase**: EXEC Implementation
- **Session Start**: [timestamp]
- **Session End**: [timestamp]
- **Context Used**: XK tokens (Y% of budget)

## Completed Work
1. ✅ [Task 1 description] - [file path] ([LOC])
2. ✅ [Task 2 description] - [file path] ([LOC])
3. ✅ [Task 3 description] - [evidence]

## Current Work (IN PROGRESS)
- 🔄 [Task description]
- **File**: /path/to/file.tsx
- **Status**: [percentage]% complete
- **Next Step**: [specific action]

## Pending Work
1. ⏳ [Task description]
2. ⏳ [Task description]
3. ⏳ [Task description]

## Technical Context
### Application
- **Path**: ../ehg (sibling directory)
- **Repository**: rickfelix/ehg.git
- **Branch**: [branch name]
- **Last Commit**: [commit SHA]

### Build Status
- **TypeScript**: PASS / FAIL
- **Build**: PASS / FAIL ([time])
- **Lint**: PASS / FAIL
- **Dev Server**: RUNNING on port [XXXX]

### Files Modified
1. /path/to/file1.tsx ([before LOC] → [after LOC])
2. /path/to/file2.tsx ([LOC])
3. /path/to/file3.tsx ([LOC])

## Issues Encountered
- [Issue 1 description and resolution]
- [Issue 2 description - PENDING]

## Resume Instructions
1. [Specific step 1]
2. [Specific step 2]
3. [Specific step 3]

## Context Health
- **Status**: HEALTHY / WARNING / CRITICAL
- **Recommendation**: Continue / Compact / Handoff
```

---

## Success Metrics

**From SD-SETTINGS-2025-10-12**:
- ✅ Zero "wrong directory" errors (pre-verification checklist)
- ✅ Clean component splits (incremental implementation)
- ✅ 57K token summary (efficient but comprehensive)
- ✅ Seamless resume (clear state documentation)

**Expected Outcomes** (when following this guide):
- 90% reduction in resume confusion
- 80% faster context recovery
- 95% accuracy in state reconstruction
- 100% of directory verification checks pass

---

## Related Documentation

- `CLAUDE.md` - LEO Protocol overview
- `docs/reference/context-monitoring.md` - Context management strategies
- `docs/reference/checkpoint-pattern.md` - Checkpoint implementation
- `docs/reference/unified-handoff-system.md` - Handoff creation

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-10-12 | Initial version from SD-SETTINGS-2025-10-12 success pattern |

---

**REMEMBER**: The goal of session continuation is to preserve intent, context, and progress. A well-written summary is worth 30-60 minutes of recovery time in the next session.
