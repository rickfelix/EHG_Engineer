# Worktree-First Isolation Integration

**SD**: SD-LEO-INFRA-INTEGRATE-WORKTREE-CREATION-001
**Commit**: f70d27633
**Status**: Implemented

## Overview

This document describes the integration of git worktree creation into the PLAN-TO-EXEC handoff flow and worktree cleanup into LEAD-FINAL-APPROVAL, implementing a worktree-first model where the main repository stays on the `main` branch and SD work happens in isolated `.worktrees/<sdKey>/` directories.

## Architecture

### Worktree-First Model

**Core Principle**: Main repository never leaves `main` branch. All SD work happens in dedicated worktrees.

**Directory Structure**:
```
EHG_Engineer/                   (main repo, always on 'main')
├── .worktrees/
│   ├── SD-XXX-001/             (worktree for SD-XXX-001)
│   │   ├── .worktree.json      (metadata)
│   │   └── node_modules/       (junction/symlink to main)
│   └── SD-YYY-002/             (worktree for SD-YYY-002)
└── ...
```

**Benefits**:
- **True isolation**: Multiple SDs can be worked on simultaneously
- **Branch safety**: No accidental commits to wrong SD branch
- **Multi-session safe**: Each SD has dedicated workspace
- **Fast switching**: `cd .worktrees/<sdKey>` instead of branch checkout
- **Clean history**: No stash/unstash cycles when switching SDs

**Trade-offs**:
- **Disk space**: ~50MB per worktree (node_modules junction mitigates this)
- **Cleanup required**: Automated on SD completion, but orphaned worktrees possible if process interrupted

## Integration Points

### 1. PLAN-TO-EXEC Handoff: Worktree Creation

**File**: `scripts/modules/handoff/executors/plan-to-exec/index.js`

**Flow**:
1. **GATE6_BRANCH_ENFORCEMENT** passes (branch exists but not checked out in main repo)
2. **State transitions** complete (SD → EXEC phase, PRD → exec_phase)
3. **createWorktree()** called with `sdKey` and `branch`
4. **symlinkNodeModules()** links node_modules from main repo
5. **Display helpers** show worktree path and `cd` command

**Key Code** (lines 227-260):
```javascript
// Merge validation details (needed for worktree creation)
const branchResults = gateResults.gateResults.GATE6_BRANCH_ENFORCEMENT?.details || {};

// SD-LEO-INFRA-INTEGRATE-WORKTREE-CREATION-001: Create worktree after state transitions
let worktreeResult = null;
const sdKey = sd.sd_key || sdId;
const worktreeBranch = branchResults.expectedBranch;

if (worktreeBranch) {
  try {
    worktreeResult = createWorktree({ sdKey, branch: worktreeBranch });
    symlinkNodeModules(worktreeResult.path, getRepoRoot());
  } catch (worktreeError) {
    // Non-blocking: failures emit warnings but don't block handoff
    console.warn(`Worktree creation failed: ${worktreeError.message}`);
  }
}
```

**Non-Blocking Design**: Worktree creation failures do NOT block handoff completion. Fallback instructions are displayed.

### 2. GATE6: Branch Enforcement Gate

**File**: `scripts/modules/handoff/executors/plan-to-exec/gates/branch-enforcement.js`

**Integration**: Passes `worktreeMode: true` to `GitBranchVerifier` (line 125):
```javascript
const branchVerifier = new GitBranchVerifier(ctx.sdId, sd.title, appPath, {
  worktreeMode: true
});
```

### 3. GitBranchVerifier: Worktree Mode

**File**: `scripts/verify-git-branch-status.js`

**Worktree Mode Behavior** (constructor option, line 48-51):
- `worktreeMode: false` (default): Creates branch AND checks it out in main repo
- `worktreeMode: true`: Creates branch WITHOUT checkout (worktree handles checkout)

**Key Logic**:

**Branch Creation** (lines 326-351):
```javascript
if (this.worktreeMode) {
  // Create branch WITHOUT checking it out
  const createResult = await this.gitCommand(`git branch ${this.expectedBranchName}`);

  // Push branch to remote (without -u since we're not on it)
  const pushResult = await this.gitCommand(`git push origin ${this.expectedBranchName}`);

  return true;
}
```

**Current Branch Check** (lines 198-216):
```javascript
// In worktree mode, if main repo is ON the feature branch, switch to main
// (git constraint: a branch can only be checked out in one location at a time)
if (this.worktreeMode) {
  if (currentBranch === this.expectedBranchName) {
    this.results.actions.push('switch_to_main');
    return false; // Will switch away from feature branch
  }

  console.log(`WORKTREE MODE: Staying on "${currentBranch}"`);
  this.results.onCorrectBranch = true; // "correct" means we DON'T switch
  return true;
}
```

**Final Verification** (lines 584-592):
```javascript
if (this.worktreeMode) {
  // Verify branch EXISTS (not that we're on it)
  const branchExistsCheck = await this.gitCommand(`git rev-parse --verify ${this.expectedBranchName}`);

  this.results.verdict = branchExistsCheck.success ? 'PASS' : 'FAIL';
}
```

### 4. Display Helpers: Worktree Path

**File**: `scripts/modules/handoff/executors/plan-to-exec/display-helpers.js`

**Worktree Info Display** (lines 95-102):
```javascript
if (options.worktreePath) {
  console.log(`🌲 Worktree: .worktrees/${options.sdKey}`);
  console.log(`   cd ${options.worktreePath}`);
} else if (options.sdKey) {
  console.log('⚠️  Worktree: not created');
  console.log(`   Create manually: npm run session:worktree -- --sd-key ${options.sdKey} --branch <branch>`);
}
```

### 5. LEAD-FINAL-APPROVAL: Worktree Cleanup

**File**: `scripts/modules/handoff/executors/lead-final-approval/index.js`

**Flow** (lines 191-208):
1. **SD marked completed** (status → 'completed', progress → 100%)
2. **Automated shipping** runs (PR merge + branch cleanup)
3. **cleanupWorktree()** called (safe mode — aborts if uncommitted changes detected)
4. **Worktree removed** from filesystem and git tracking

**Key Code**:
```javascript
// SD-LEO-INFRA-INTEGRATE-WORKTREE-CREATION-001: Cleanup worktree on SD completion
let worktreeCleanupResult = null;
const sdKey = sd.sd_key || sdId;
try {
  validateSdKey(sdKey);
  worktreeCleanupResult = cleanupWorktree(sdKey);

  if (worktreeCleanupResult.cleaned) {
    console.log(`✅ Worktree .worktrees/${sdKey} removed`);
  } else if (worktreeCleanupResult.reason === 'worktree_not_found') {
    console.log(`ℹ️  No worktree found for ${sdKey}`);
  } else if (worktreeCleanupResult.reason === 'dirty_worktree') {
    console.warn(`⚠️  Worktree has uncommitted changes — run /ship first`);
  }
} catch (worktreeError) {
  // Non-blocking: cleanup failures don't block completion
  console.warn(`Worktree cleanup failed: ${worktreeError.message}`);
}
```

**Safe Cleanup**: Uses default `force: false` so the dirty-state check protects uncommitted changes. If automated shipping has already committed and merged, the worktree will be clean and cleanup proceeds normally. If changes are still uncommitted, cleanup aborts with `dirty_worktree` and prompts the user to run `/ship` first.

## Configuration

### worktreeMode Flag

**Type**: Boolean (default: `false`)
**Scope**: `GitBranchVerifier` constructor option
**Set by**: `createBranchEnforcementGate()` in PLAN-TO-EXEC executor

**Effect**:
- `false`: Standard mode (create + checkout branch in main repo)
- `true`: Worktree mode (create branch only, no checkout)

**Why a flag?**: Enables gradual rollout and supports non-worktree workflows for special cases.

## Failure Handling

### Non-Blocking Design

**Philosophy**: Worktree creation/cleanup failures should NOT block SD progress. The system should provide clear fallback paths.

**Worktree Creation Failures** (PLAN-TO-EXEC):
- **Logged as warnings** (not errors)
- **Handoff continues** (SD transitions to EXEC phase)
- **Fallback displayed**: Manual creation command shown
- **User unblocked**: Can work in main repo or create worktree manually

**Worktree Cleanup Failures** (LEAD-FINAL-APPROVAL):
- **Logged as warnings** (not errors)
- **Completion continues** (SD marked completed, feedback auto-closed)
- **Manual cleanup**: `git worktree remove --force .worktrees/<sdKey>`

**Why non-blocking?**: Worktree management is a convenience feature. Core SD workflows (PRD creation, implementation, verification) should never be blocked by filesystem issues.

### Common Failure Scenarios

| Scenario | Impact | Resolution |
|----------|--------|------------|
| Permission denied (Windows junction) | Worktree creation skipped | Run as admin or create manually |
| Branch already checked out elsewhere | Creation fails | Release other worktree first |
| Disk space exhausted | Creation fails | Free up space, create manually |
| Git lock file present | Creation fails | Remove `.git/worktrees/<sdKey>/locked` |
| Worktree path doesn't exist | Cleanup skipped (idempotent) | No action needed |
| Uncommitted changes at cleanup | Cleanup aborts with `dirty_worktree` | Commit or `/ship` first, then re-run or use `--force` for manual cleanup |

## User-Facing Changes

### PLAN-TO-EXEC Handoff Output

**Before** (SD-LEO-INFRA-PROACTIVE-BRANCH-ENFORCEMENT-001):
```
✅ GATE 6: On correct branch, ready for EXEC work
   Branch: feat/SD-XXX-001-title
   Remote tracking: configured
```

**After** (SD-LEO-INFRA-INTEGRATE-WORKTREE-CREATION-001):
```
✅ GATE 6 PASSED: Branch ready for worktree creation
   Branch: feat/SD-XXX-001-title
   Mode: worktree-first (main repo stays on current branch)
   Next: Worktree will be created at .worktrees/<sdKey>/

🌲 Step 4: Worktree Creation
--------------------------------------------------
   ✅ Worktree created: .worktrees/SD-XXX-001
   📂 Path: /path/to/EHG_Engineer/.worktrees/SD-XXX-001
   🌿 Branch: feat/SD-XXX-001-title
   ✅ node_modules linked

📋 EXEC PHASE REQUIREMENTS
======================================================================
   🌲 Worktree: .worktrees/SD-XXX-001
      cd /path/to/EHG_Engineer/.worktrees/SD-XXX-001

   □ Implement 3 user stories:
     ○ US-001: First user story
     ○ US-002: Second user story
```

### LEAD-FINAL-APPROVAL Output

**Added Section**:
```
🌲 Worktree Cleanup
--------------------------------------------------
   ✅ Worktree .worktrees/SD-XXX-001 removed
```

**Or, if not found**:
```
🌲 Worktree Cleanup
--------------------------------------------------
   ℹ️  No worktree found for SD-XXX-001 (may not have been created)
```

## Testing Approach

### Unit Tests

**File**: `tests/unit/worktree-handoff-integration.test.js`
**Coverage**: 11 tests

**Test Categories**:
1. **Display helpers** (2 tests):
   - Worktree path display when created
   - Fallback display when not created

2. **createWorktree contract** (3 tests):
   - Successful creation with sdKey and branch
   - Failure handling (non-throwing)
   - Reused worktree handling

3. **cleanupWorktree contract** (4 tests):
   - Successful cleanup (safe mode, no force flag)
   - `worktree_not_found` handling
   - Failure handling (non-throwing)
   - sdKey validation

4. **symlinkNodeModules** (2 tests):
   - Successful symlink creation
   - Failure handling (non-blocking)

**Mocking Strategy**: `worktree-manager.js` module is mocked to avoid filesystem operations. Tests validate call contracts and error handling paths.

### Integration Tests

**Manual Testing Scenarios**:
1. **Happy path**: PLAN-TO-EXEC → work in worktree → LEAD-FINAL-APPROVAL
2. **Creation failure**: Simulate permission denied, verify handoff continues
3. **Reused worktree**: Run PLAN-TO-EXEC twice for same SD
4. **Cleanup failure**: Simulate locked worktree, verify completion continues
5. **Multi-SD isolation**: Create worktrees for SD-A and SD-B, verify no conflicts

## Related Documentation

- **Worktree Manager API**: `lib/worktree-manager.js`
- **Branch Enforcement Pattern**: `docs/patterns/PAT-BRANCH-ENFORCEMENT-001.md`
- **Handoff Architecture**: `scripts/modules/handoff/README.md`
- **Database Schema**: `database/schema/strategic_directives_v2.sql`

## Implementation Commits

- **f70d27633**: feat(handoff): worktree-first isolation for SD work
- Related SDs:
  - SD-LEO-INFRA-REFACTOR-WORKTREE-MANAGER-001 (worktree-manager foundation)
  - SD-LEO-INFRA-PROACTIVE-BRANCH-ENFORCEMENT-001 (branch gate foundation)

## Future Enhancements

- **Automatic stale worktree cleanup**: Detect and remove worktrees for completed SDs
- **Worktree size reporting**: Show disk usage per worktree
- **Worktree migration**: Move worktree to different disk (for space management)
- **Session-worktree binding**: Track which session created which worktree
- **Auto-switch IDE**: Integrate with VSCode/Cursor to open worktree folder
