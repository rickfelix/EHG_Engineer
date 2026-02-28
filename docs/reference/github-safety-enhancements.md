---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# GitHub Sub-Agent Safety Enhancements



## Table of Contents

- [Metadata](#metadata)
- [Executive Summary](#executive-summary)
- [Problem Analysis](#problem-analysis)
  - [What Likely Caused the Data Loss?](#what-likely-caused-the-data-loss)
  - [What Was Missing?](#what-was-missing)
- [Safety Enhancements Detail](#safety-enhancements-detail)
  - [Phase 0: Pre-Flight Safety Checks (NEW)](#phase-0-pre-flight-safety-checks-new)
  - [Automatic Safety Backups](#automatic-safety-backups)
  - [Safe Git Pull](#safe-git-pull)
  - [Safe Git Push](#safe-git-push)
- [Risk Assessment System](#risk-assessment-system)
  - [Risk Levels](#risk-levels)
  - [Risk Indicators](#risk-indicators)
- [Comparison: Before vs After](#comparison-before-vs-after)
  - [Scenario 1: Pull with Uncommitted Changes](#scenario-1-pull-with-uncommitted-changes)
  - [Scenario 2: Push to Diverged Remote](#scenario-2-push-to-diverged-remote)
  - [Scenario 3: Force Push (Dangerous)](#scenario-3-force-push-dangerous)
- [Migration Guide](#migration-guide)
  - [Step 1: Review Current Usage](#step-1-review-current-usage)
  - [Step 2: Replace Current Version](#step-2-replace-current-version)
  - [Step 3: Update Sync Manager](#step-3-update-sync-manager)
  - [Step 4: Update All Git Operations](#step-4-update-all-git-operations)
  - [Step 5: Test Migration](#step-5-test-migration)
- [Configuration Options](#configuration-options)
  - [Safety Level Override](#safety-level-override)
  - [Backup Configuration](#backup-configuration)
- [Recovery Procedures](#recovery-procedures)
  - [Recovering from Backup Branch](#recovering-from-backup-branch)
  - [Recovering from Stash](#recovering-from-stash)
  - [Recovering Overwritten Commits](#recovering-overwritten-commits)
- [Best Practices](#best-practices)
  - [For Developers](#for-developers)
  - [For Operations](#for-operations)
- [Testing Strategy](#testing-strategy)
  - [Unit Tests](#unit-tests)
  - [Integration Tests](#integration-tests)
  - [E2E Tests](#e2e-tests)
- [Monitoring and Metrics](#monitoring-and-metrics)
  - [Safety Check Metrics](#safety-check-metrics)
  - [Useful Queries](#useful-queries)
- [Appendix A: Safety Check Algorithm](#appendix-a-safety-check-algorithm)
- [Appendix B: Force Push Decision Tree](#appendix-b-force-push-decision-tree)
- [Support and Feedback](#support-and-feedback)

## Metadata
- **Category**: Reference
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-13
- **Tags**: database, testing, e2e, unit

**Date**: 2025-11-17
**Initiative**: Data Loss Prevention
**Trigger**: 3-hour rework incident due to commits being overwritten

---

## Executive Summary

Enhanced the GitHub sub-agent with comprehensive safety checks to prevent data loss incidents. The enhanced version adds 6 layers of pre-flight validation, automatic backup creation, and user-friendly warnings before any destructive git operation.

**Key Improvements**:
- Pre-flight safety checks detect data loss risks before operations execute
- Automatic backup creation before destructive operations
- Merge conflict detection before pulling
- Remote divergence detection
- Force-push protection with mandatory confirmation
- Stash preservation mechanisms

---

## Problem Analysis

### What Likely Caused the Data Loss?

Based on investigation and common patterns, the 3-hour rework was likely caused by one of:

1. **Force Push Scenario** (Most Likely)
   - Remote had commits not in local
   - Push was forced (`--force` or `--force-with-lease`)
   - Remote commits were overwritten
   - Local work based on overwritten commits became orphaned

2. **Merge Conflict Scenario**
   - Pull without checking for conflicts first
   - Auto-merge resolved incorrectly
   - Local changes overwritten by remote version

3. **Branch Switch Scenario**
   - Switched branches with uncommitted changes
   - Changes lost or applied to wrong branch
   - Commit made in wrong context

4. **Stash Loss Scenario**
   - Work stashed but not applied
   - Subsequent operations cleared stash
   - Stashed work lost

### What Was Missing?

**Before Enhancement**:
- ❌ No pre-flight checks before destructive operations
- ❌ No automatic backup creation
- ❌ No merge conflict detection before pull
- ❌ No remote divergence detection
- ❌ No force-push protection
- ❌ No user warnings about data loss risks

**After Enhancement**:
- ✅ Comprehensive pre-flight safety checks
- ✅ Automatic backup branches + stashes
- ✅ Pre-pull merge conflict detection
- ✅ Remote divergence detection and warnings
- ✅ Force-push requires explicit confirmation
- ✅ Clear risk levels (LOW/MEDIUM/HIGH) shown to user

---

## Safety Enhancements Detail

### Phase 0: Pre-Flight Safety Checks (NEW)

Runs automatically before all operations. Detects:

#### Check 1: Uncommitted Changes
```bash
git status --porcelain
```
- Detects modified, staged, and untracked files
- **Risk Level**: HIGH if uncommitted changes exist
- **Action**: Blocks destructive operations, suggests commit/stash

#### Check 2: Unpushed Commits
```bash
git log @{u}.. --oneline
```
- Finds commits in local not in remote
- **Risk Level**: MEDIUM if unpushed commits exist
- **Action**: Warns user, suggests pushing before pull

#### Check 3: Stash Entries
```bash
git stash list
```
- Counts existing stashes
- **Risk Level**: LOW (informational)
- **Action**: Warns if >10 stashes (cleanup recommended)

#### Check 4: Remote Divergence
```bash
git fetch
git rev-list --left-right --count HEAD...@{u}
```
- Detects if local and remote have diverged
- Shows how many commits ahead/behind
- **Risk Level**: HIGH if remote is ahead
- **Action**: Requires pull before push

#### Check 5: Merge Conflicts
```bash
git ls-files -u
```
- Detects existing unresolved conflicts
- Checks if merge/rebase is in progress
- **Risk Level**: CRITICAL if conflicts exist
- **Action**: Blocks all operations, requires manual resolution

#### Check 6: Ongoing Git Operations
```bash
# Checks for existence of:
.git/MERGE_HEAD
.git/REBASE_HEAD
.git/CHERRY_PICK_HEAD
```
- Detects incomplete git operations
- **Risk Level**: CRITICAL
- **Action**: Requires operation completion/abort first

### Automatic Safety Backups

Before any destructive operation, automatically creates:

1. **Backup Branch**
   ```bash
   git branch safety-backup/[operation]/[timestamp]
   ```
   - Named with operation type and timestamp
   - Allows easy recovery: `git checkout safety-backup/...`

2. **Stash Backup**
   ```bash
   git stash push -u -m "Safety backup: [operation] @ [timestamp]"
   ```
   - Includes untracked files (`-u`)
   - Tagged with operation and timestamp
   - Recovery: `git stash pop` or `git stash apply stash@{n}`

### Safe Git Pull

Enhanced pull with protection:

```javascript
async function safeGitPull(repoPath, remote, branch) {
  // 1. Pre-flight checks
  const safety = await performPreflightSafetyChecks(repoPath);

  // 2. Create backup if high risk
  if (safety.data_loss_risk === 'HIGH') {
    await createSafetyBackup(repoPath, 'pull');
  }

  // 3. Fetch first
  await git fetch

  // 4. Check for merge conflicts BEFORE pulling
  const conflicts = await checkMergeConflicts();
  if (conflicts) {
    throw Error('Conflicts would occur - resolve manually');
  }

  // 5. Pull
  await git pull
}
```

**User Experience**:
```
🔄 Performing SAFE git pull from origin...
   🔍 Checking for uncommitted changes...
      ⚠️  3 uncommitted file(s)
   🚨 HIGH RISK - Creating backup before pull...
   ✅ Backup created: safety-backup/pull/2025-11-17T14-30-00
   ✅ Stash backup created
   📥 Fetching from remote...
   🔍 Pre-checking for conflicts...
   ⚠️  Merge conflicts would occur in:
      - src/components/Form.tsx
      - lib/utils/helpers.js

   ❌ BLOCKED: Resolve conflicts manually before pull
```

### Safe Git Push

Enhanced push with protection:

```javascript
async function safeGitPush(repoPath, remote, branch, options) {
  // 1. Pre-flight checks
  const safety = await performPreflightSafetyChecks(repoPath);

  // 2. Block if uncommitted changes
  if (safety.uncommitted_changes.detected) {
    throw Error('Cannot push with uncommitted changes');
  }

  // 3. Check remote divergence
  await git fetch
  const diverged = await checkDivergence();

  // 4. Require confirmation for force push
  if (diverged && options.force && !options.confirmed) {
    throw Error('Force push requires explicit confirmation');
  }

  // 5. Create backup before force push
  if (options.force) {
    await createSafetyBackup(repoPath, 'force-push');
  }

  // 6. Push with --force-with-lease (safer than --force)
  await git push --force-with-lease
}
```

**User Experience**:
```
🔄 Performing SAFE git push to origin...
   🔍 Checking for uncommitted changes...
      ✅ No uncommitted changes
   🔍 Checking for remote changes...
      ⚠️  Remote has diverged - push would be rejected
   🚨 FORCE PUSH REQUESTED - This will overwrite remote commits!

   ❌ BLOCKED: Force push requires explicit confirmation
   Remote commits would be lost. Pull and merge first, or confirm force push.

   To force push with confirmation:
   options.confirmed = true
```

---

## Risk Assessment System

### Risk Levels

**LOW** - Safe to proceed
- No uncommitted changes
- No unpushed commits
- In sync with remote
- No conflicts

**MEDIUM** - Proceed with caution
- Unpushed commits exist (push recommended)
- Remote is ahead (pull recommended)
- Multiple stashes (cleanup recommended)

**HIGH** - Create backup first
- Uncommitted changes exist
- Remote has diverged significantly
- Operation could cause data loss

**CRITICAL** - Block operation
- Merge conflicts detected
- Ongoing git operation incomplete
- Cannot proceed safely

### Risk Indicators

Each pre-flight check results in:

```javascript
{
  type: 'UNCOMMITTED_CHANGES',
  severity: 'HIGH',
  message: '3 uncommitted file(s)',
  recommendation: 'Commit or stash changes before pull/merge operations'
}
```

**Severity Levels**:
- `LOW` - Informational, can proceed
- `MEDIUM` - Warning, should address
- `HIGH` - Strong warning, backup recommended
- `CRITICAL` - Blocking, must resolve

---

## Comparison: Before vs After

### Scenario 1: Pull with Uncommitted Changes

**Before Enhancement**:
```bash
$ git pull origin main
From https://github.com/user/repo
 * branch            main       -> FETCH_HEAD
Updating abc123..def456
error: Your local changes would be overwritten by merge:
    src/component.tsx
Please commit your changes or stash them before merging.
Aborting
# User loses context, must manually recover
```

**After Enhancement**:
```
🔄 Performing SAFE git pull from origin...
   🔍 Pre-flight Safety Checks...
      ⚠️  1 uncommitted file(s)

   🚨 HIGH DATA LOSS RISK - Backup strongly recommended

   🛡️  Creating safety backup: safety-backup/pull/2025-11-17T14-30-00
      ✅ Backup created
      ✅ Stash backup created

   ❌ BLOCKED: Uncommitted changes detected

   Your changes are now safely backed up in:
   - Branch: safety-backup/pull/2025-11-17T14-30-00
   - Stash: "Safety backup: pull @ 2025-11-17T14:30:00"

   To proceed:
   1. Commit: git commit -am "Your message"
   2. Or stash: git stash
   3. Then retry pull

   To recover backup:
   - Branch: git checkout safety-backup/pull/2025-11-17T14-30-00
   - Stash: git stash list && git stash apply
```

### Scenario 2: Push to Diverged Remote

**Before Enhancement**:
```bash
$ git push origin main
To https://github.com/user/repo.git
 ! [rejected]        main -> main (non-fast-forward)
error: failed to push some refs
hint: Updates were rejected because the tip of your current branch is behind
hint: its remote counterpart. Integrate the remote changes (e.g.
hint: 'git pull ...') before pushing again.
# User might force push and lose remote commits
```

**After Enhancement**:
```
🔄 Performing SAFE git push to origin...
   🔍 Pre-flight Safety Checks...
      ✅ No uncommitted changes
      ⚠️  Remote ahead by 3 commit(s)

   ⚠️  MEDIUM DATA LOSS RISK - Proceed with caution

   🔍 Checking for remote changes...
      ⚠️  Remote has diverged - push would be rejected

   ❌ BLOCKED: Push rejected
   Remote has 3 commits not in local branch.

   Required actions:
   1. Pull remote changes: git pull origin main
   2. Review and merge changes
   3. Resolve any conflicts
   4. Then retry push

   To view remote commits:
   git fetch && git log HEAD..origin/main
```

### Scenario 3: Force Push (Dangerous)

**Before Enhancement**:
```bash
$ git push origin main --force
# No warnings, remote commits immediately lost
Total 5 (delta 2), reused 0 (delta 0)
To https://github.com/user/repo.git
 + abc123...def456 main -> main (forced update)
# Remote history overwritten, commits lost
```

**After Enhancement**:
```
🔄 Performing SAFE git push to origin...
   🔍 Pre-flight Safety Checks...
      ✅ No uncommitted changes
      ⚠️  Remote ahead by 5 commit(s)

   🚨 HIGH DATA LOSS RISK

   🔍 Checking for remote changes...
      ⚠️  Remote has diverged - push would be rejected
      🚨 FORCE PUSH REQUESTED - This will overwrite remote commits!

   ❌ BLOCKED: Force push requires explicit confirmation

   WARNING: This will permanently delete 5 remote commit(s):
   - abc1234 "Feature X implementation"
   - def5678 "Bug fix for Y"
   - ghi9012 "Update Z"
   ...

   These commits will be PERMANENTLY LOST.

   Recommended: Pull and merge instead

   To force push (NOT RECOMMENDED):
   1. Confirm you want to lose remote commits
   2. Add option: { confirmed: true }
   3. Automatic backup will be created first
```

---

## Migration Guide

### Step 1: Review Current Usage

Check where the GitHub sub-agent is currently used:

```bash
# Find all imports
grep -r "from.*github.js" lib/ scripts/

# Find all usages
grep -r "github\.execute\|github\.safeGitPull" lib/ scripts/
```

### Step 2: Replace Current Version

**Option A: Direct Replacement**
```bash
# Backup original
mv lib/sub-agents/github.js lib/sub-agents/github-original.js

# Use enhanced version
mv lib/sub-agents/github-enhanced.js lib/sub-agents/github.js
```

**Option B: Gradual Migration**
```javascript
// Keep both versions temporarily
import * as githubOriginal from './github-original.js';
import * as githubEnhanced from './github-enhanced.js';

// Use enhanced for critical operations
await githubEnhanced.execute(sdId, subAgent, options);

// Fall back to original if needed
await githubOriginal.execute(sdId, subAgent, options);
```

### Step 3: Update Sync Manager

In `lib/sync/sync-manager.js`:

**Before**:
```javascript
// Pull changes - NO SAFETY CHECKS
const { stdout: pullResult } = await execAsync(
  `cd ${codebasePath} && git pull origin ${config.github.branch}`
);
```

**After**:
```javascript
import { safeGitPull, safeGitPush } from '../sub-agents/github.js';

// Pull changes - WITH SAFETY CHECKS
try {
  const result = await safeGitPull(
    codebasePath,
    'origin',
    config.github.branch
  );
  console.log('✅ Pulled safely:', result.output);
} catch (error) {
  if (error.message.includes('BLOCKED')) {
    // Safety check prevented data loss
    console.error('🛡️  Operation blocked for safety:', error.message);
    // User can review and resolve
  } else {
    throw error;
  }
}
```

### Step 4: Update All Git Operations

Replace direct `execAsync` git commands:

**Before**:
```javascript
await execAsync('git pull origin main');
await execAsync('git push origin main');
await execAsync('git push origin main --force');
```

**After**:
```javascript
import { safeGitPull, safeGitPush } from './sub-agents/github.js';

await safeGitPull(repoPath, 'origin', 'main');
await safeGitPush(repoPath, 'origin', 'main');

// Force push requires explicit confirmation
await safeGitPush(repoPath, 'origin', 'main', {
  force: true,
  confirmed: true  // Must be explicit
});
```

### Step 5: Test Migration

Create test scenarios:

```javascript
// Test 1: Pull with uncommitted changes (should block)
// Test 2: Pull with conflicts (should detect and block)
// Test 3: Push to diverged remote (should detect and block)
// Test 4: Force push (should require confirmation)
// Test 5: Backup creation (should create branch + stash)
```

Run tests:
```bash
npm run test:github-safety
```

---

## Configuration Options

### Safety Level Override

For automated systems that need to bypass prompts:

```javascript
const options = {
  safety: {
    autoBackup: true,      // Always create backups
    blockOnRisk: true,     // Block on HIGH/CRITICAL risk
    requireConfirm: true,  // Require explicit confirmation
    minRiskLevel: 'MEDIUM' // Minimum risk to show warnings
  }
};

await execute(sdId, subAgent, options);
```

### Backup Configuration

```javascript
const backupOptions = {
  backupBranch: true,    // Create backup branch
  backupStash: true,     // Create backup stash
  keepBackups: 5,        // Keep last 5 backups
  backupPrefix: 'safety-backup' // Branch name prefix
};
```

---

## Recovery Procedures

### Recovering from Backup Branch

If operation went wrong:

```bash
# List safety backups
git branch | grep safety-backup

# View backup content
git log safety-backup/pull/2025-11-17T14-30-00

# Restore from backup
git checkout safety-backup/pull/2025-11-17T14-30-00

# Create new branch from backup
git checkout -b recovery-branch safety-backup/pull/2025-11-17T14-30-00
```

### Recovering from Stash

If backup was stashed:

```bash
# List stashes
git stash list

# View stash content
git stash show -p stash@{0}

# Apply stash
git stash apply stash@{0}

# Apply and remove stash
git stash pop stash@{0}
```

### Recovering Overwritten Commits

If commits were overwritten despite safety checks:

```bash
# Find lost commits
git reflog

# View lost commit
git show <commit-hash>

# Restore lost commit
git cherry-pick <commit-hash>

# Or create branch from lost commit
git branch recovery-branch <commit-hash>
```

---

## Best Practices

### For Developers

1. **Always Review Pre-Flight Warnings**
   - Don't ignore HIGH risk warnings
   - Create backups when suggested
   - Resolve issues before forcing operations

2. **Use Safe Operations by Default**
   ```javascript
   import { safeGitPull, safeGitPush } from './github.js';
   // Instead of raw execAsync
   ```

3. **Never Bypass Safety Without Reason**
   ```javascript
   // ❌ Bad
   { safety: { blockOnRisk: false } }

   // ✅ Good
   { safety: { blockOnRisk: true, autoBackup: true } }
   ```

4. **Clean Up Old Backups**
   ```bash
   # List old backups
   git branch | grep safety-backup

   # Delete backups older than 30 days
   git branch --merged | grep safety-backup | grep -v "$(date +%Y-%m)" | xargs git branch -d
   ```

### For Operations

1. **Monitor Data Loss Incidents**
   - Track safety check blocks
   - Review force push requests
   - Audit backup creation

2. **Set Organization Policies**
   ```javascript
   // Org-wide configuration
   const orgSafetyConfig = {
     blockForcesPush: true,
     requireBackups: true,
     auditOperations: true
   };
   ```

3. **Regular Backup Cleanup**
   ```bash
   # Automated cleanup script
   npm run cleanup-safety-backups --older-than=30d
   ```

---

## Testing Strategy

### Unit Tests

```javascript
// Test pre-flight checks
test('detects uncommitted changes', async () => {
  // Setup: Create uncommitted file
  await fs.writeFile('test.txt', 'content');

  const safety = await performPreflightSafetyChecks(testRepo);

  expect(safety.uncommitted_changes.detected).toBe(true);
  expect(safety.data_loss_risk).toBe('HIGH');
});

// Test backup creation
test('creates safety backup', async () => {
  const backup = await createSafetyBackup(testRepo, 'pull');

  expect(backup.success).toBe(true);
  expect(backup.backup_branch).toMatch(/safety-backup\/pull/);
});

// Test safe pull with conflicts
test('blocks pull with conflicts', async () => {
  // Setup: Create conflicting changes
  await setupConflictingBranches(testRepo);

  await expect(
    safeGitPull(testRepo, 'origin', 'main')
  ).rejects.toThrow('Merge conflicts would occur');
});
```

### Integration Tests

```javascript
// Test full workflow
test('safe pull-push workflow', async () => {
  // 1. Make local changes
  await makeLocalChanges(testRepo);

  // 2. Commit
  await git('add .');
  await git('commit -m "Test"');

  // 3. Safe push (should check remote first)
  const pushResult = await safeGitPush(testRepo, 'origin', 'test-branch');

  expect(pushResult.success).toBe(true);
});
```

### E2E Tests

```bash
# Manual test scenarios
npm run test:github-safety:e2e

# Scenarios tested:
# 1. Pull with uncommitted changes
# 2. Push to diverged remote
# 3. Force push with confirmation
# 4. Merge conflict detection
# 5. Backup creation and recovery
```

---

## Monitoring and Metrics

### Safety Check Metrics

Track in database:

```sql
CREATE TABLE github_safety_events (
  id UUID PRIMARY KEY,
  event_type VARCHAR(50), -- 'blocked', 'warned', 'backup_created'
  risk_level VARCHAR(20), -- 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
  operation VARCHAR(50),  -- 'pull', 'push', 'merge'
  repo_path TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Useful Queries

```sql
-- Data loss blocks (operations that would have lost data)
SELECT COUNT(*), operation, risk_level
FROM github_safety_events
WHERE event_type = 'blocked' AND risk_level IN ('HIGH', 'CRITICAL')
GROUP BY operation, risk_level
ORDER BY COUNT(*) DESC;

-- Backup effectiveness (backups that were used)
SELECT COUNT(*)
FROM github_safety_events
WHERE event_type = 'backup_created'
  AND details->>'recovered' = 'true';

-- Common risk patterns
SELECT details->>'risk_type', COUNT(*)
FROM github_safety_events
WHERE event_type = 'warned'
GROUP BY details->>'risk_type'
ORDER BY COUNT(*) DESC;
```

---

## Appendix A: Safety Check Algorithm

```
FUNCTION performPreflightSafetyChecks(repoPath):
  safety = {
    data_loss_risk: 'LOW',
    risks: [],
    safe_to_proceed: true
  }

  // Check 1: Uncommitted changes
  IF has_uncommitted_changes():
    safety.risks.append({
      type: 'UNCOMMITTED_CHANGES',
      severity: 'HIGH'
    })
    safety.data_loss_risk = 'HIGH'
    safety.backup_needed = true

  // Check 2: Unpushed commits
  IF has_unpushed_commits():
    safety.risks.append({
      type: 'UNPUSHED_COMMITS',
      severity: 'MEDIUM'
    })
    IF safety.data_loss_risk == 'LOW':
      safety.data_loss_risk = 'MEDIUM'

  // Check 3: Remote divergence
  fetch_remote()
  IF remote_ahead_of_local():
    safety.risks.append({
      type: 'REMOTE_AHEAD',
      severity: 'HIGH'
    })
    IF safety.data_loss_risk == 'LOW':
      safety.data_loss_risk = 'MEDIUM'

  // Check 4: Merge conflicts
  IF has_merge_conflicts():
    safety.risks.append({
      type: 'MERGE_CONFLICTS',
      severity: 'CRITICAL'
    })
    safety.data_loss_risk = 'HIGH'
    safety.safe_to_proceed = false

  // Check 5: Ongoing operations
  IF has_ongoing_git_operation():
    safety.risks.append({
      type: 'ONGOING_OPERATION',
      severity: 'CRITICAL'
    })
    safety.data_loss_risk = 'HIGH'
    safety.safe_to_proceed = false

  RETURN safety
```

---

## Appendix B: Force Push Decision Tree

```
Force push requested?
  ├─ YES
  │   ├─ Confirmed = true?
  │   │   ├─ YES
  │   │   │   ├─ Create backup
  │   │   │   └─ Execute push --force-with-lease
  │   │   └─ NO
  │   │       └─ BLOCK with error message
  │   └─ Check remote divergence
  │       ├─ Remote ahead?
  │       │   ├─ YES → WARN + suggest pull
  │       │   └─ NO → Allow push
  │       └─ Uncommitted changes?
  │           ├─ YES → BLOCK
  │           └─ NO → Allow push
  └─ NO (normal push)
      └─ Check remote divergence
          ├─ Remote ahead? → BLOCK + require pull
          └─ In sync → Allow push
```

---

## Support and Feedback

**Questions**: Contact LEO Protocol team
**Issues**: Create ticket with label `github-safety`
**Improvements**: Submit PR with safety enhancement

**Document Version**: 1.0
**Last Updated**: 2025-11-17
**Next Review**: 2025-12-17 (30 days)
