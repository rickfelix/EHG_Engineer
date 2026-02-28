---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# Git Commit Recovery Guide


## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Usage](#usage)
  - [Scan Mode (Default)](#scan-mode-default)
  - [Recovery Mode](#recovery-mode)
- [How It Works](#how-it-works)
  - [Detection Algorithm](#detection-algorithm)
  - [Reachability Check](#reachability-check)
  - [Time Window](#time-window)
  - [Recovery Process](#recovery-process)
- [Use Cases](#use-cases)
  - [Use Case 1: Cross-Session Branch Contamination](#use-case-1-cross-session-branch-contamination)
  - [Use Case 2: Session Crash During Handoff](#use-case-2-session-crash-during-handoff)
  - [Use Case 3: Accidental Branch Deletion](#use-case-3-accidental-branch-deletion)
- [False Positives](#false-positives)
  - [Merge Commits on Remote](#merge-commits-on-remote)
  - [Worktree Commits](#worktree-commits)
- [Limitations](#limitations)
  - [Reflog Expiration](#reflog-expiration)
  - [Already Garbage Collected](#already-garbage-collected)
  - [Remote-Only Branches](#remote-only-branches)
- [Troubleshooting](#troubleshooting)
  - [Issue: "No orphaned commits found" but I know one exists](#issue-no-orphaned-commits-found-but-i-know-one-exists)
  - [Issue: "Commit already exists on a branch" during recovery](#issue-commit-already-exists-on-a-branch-during-recovery)
  - [Issue: Recovery branch has wrong content](#issue-recovery-branch-has-wrong-content)
- [Integration with Ship Safety](#integration-with-ship-safety)
- [Best Practices](#best-practices)
- [Performance](#performance)
- [Related Documentation](#related-documentation)
- [Support](#support)
  - [Log Files](#log-files)
  - [Escalation](#escalation)
  - [Common Issues](#common-issues)

**Category**: Reference
**Status**: Approved
**Version**: 1.0.0
**Author**: Claude (Infrastructure Agent)
**Last Updated**: 2026-02-11
**Tags**: git, recovery, multi-session, troubleshooting, ship-safety
**SD**: SD-LEO-FIX-MULTI-SESSION-SHIP-001

## Overview

The Git Commit Recovery tool (`scripts/git-commit-recovery.js`) automates detection and recovery of orphaned commits in multi-session Claude Code environments.

**Orphaned Commits**: Commits that exist in `git reflog` but are not reachable from any branch (local or remote). These typically occur when:
- Cross-session branch contamination (another session ran `git checkout`, leaving commits behind)
- Interrupted sessions (crash before PR merged)
- Accidental branch deletion

## Quick Start

```bash
# Scan for orphaned commits (last 24 hours)
npm run git:recover

# Scan longer time window
npm run git:recover -- --hours 72  # Last 3 days

# Recover specific commit
npm run git:recover -- --recover abc1234
```

## Usage

### Scan Mode (Default)

Scans `git reflog` for orphaned commits without making any changes.

```bash
npm run git:recover              # Last 24 hours
npm run git:recover -- --hours 48    # Last 48 hours
npm run git:recover -- --hours 168   # Last 7 days
```

**Output (when orphaned commits found)**:
```
═══════════════════════════════════════════════════════════
  GIT COMMIT RECOVERY
═══════════════════════════════════════════════════════════

Scanning reflog for orphaned commits...
Time window: Last 24 hours

Found 2 orphaned commit(s):

────────────────────────────────────────────────────────────
Commit: f5498e6
Date: 2026-02-11 11:32:15
Author: Claude Opus 4.6

Message:
feat(SD-LEO-FIX-MULTI-SESSION-SHIP-001): implement multi-session ship safety

Files changed: 8
  database/migrations/20260211_ship_safety_branch_tracking.sql
  database/migrations/20260211_ship_safety_branch_tracking_v2.sql
  lib/session-manager.mjs
  package.json
  scripts/generate-checkpoint-plan.js
  scripts/git-commit-recovery.js
  scripts/hooks/concurrent-session-worktree.cjs
  scripts/modules/shipping/ShippingExecutor.js

To recover: npm run git:recover -- --recover f5498e6
────────────────────────────────────────────────────────────
```

**Output (when clean)**:
```
═══════════════════════════════════════════════════════════
  GIT COMMIT RECOVERY
═══════════════════════════════════════════════════════════

Scanning reflog for orphaned commits...
Time window: Last 24 hours

✅ No orphaned commits found
```

### Recovery Mode

Creates a new branch from an orphaned commit, preserving all work.

```bash
npm run git:recover -- --recover <SHA>
```

**Example**:
```bash
npm run git:recover -- --recover f5498e6

# Output:
✅ Recovery branch created: recovery/f5498e6-1739289135
   You are now on branch 'recovery/f5498e6-1739289135'

Next steps:
1. Review the recovered commit: git show
2. Cherry-pick to target branch: git cherry-pick <commit>
   OR merge into current work: git checkout main && git merge recovery/f5498e6-1739289135
3. Delete recovery branch when done: git branch -d recovery/f5498e6-1739289135
```

**Branch Name Format**: `recovery/<short-sha>-<unix-timestamp>`

## How It Works

### Detection Algorithm

1. **Scan reflog**: Parse `git reflog` for commits in time window (default: 24 hours)
2. **Extract commit list**: Unique SHA-1 hashes from reflog entries
3. **Check reachability**: For each commit, run `git branch -a --contains <SHA>`
   - `-a` includes remote branches (prevents false positives from remote-only branches)
4. **Filter orphans**: Commits with empty `git branch` output are orphaned
5. **Enrich metadata**: For each orphaned commit, fetch message, date, author, files changed

### Reachability Check

**Why `git branch -a`?**

```bash
# WRONG: Only checks local branches (many false positives)
git branch --contains <SHA>

# CORRECT: Checks local + remote branches
git branch -a --contains <SHA>
```

**Example**:
```
Commit abc123 exists on remote/main but not local main
→ With `git branch`: ORPHANED (false positive)
→ With `git branch -a`: NOT ORPHANED (correct)
```

### Time Window

Default scan window is **24 hours** (86400 seconds from now).

**Rationale**:
- Catches recent contamination quickly
- Avoids overwhelming output from old reflog entries
- Git reflog default retention: 90 days (configurable via `gc.reflogExpire`)

**Extend for older orphans**:
```bash
npm run git:recover -- --hours 168  # 7 days
npm run git:recover -- --hours 720  # 30 days
```

### Recovery Process

When `--recover <SHA>` is invoked:

1. **Validate commit exists**: Check `git reflog` contains SHA
2. **Create recovery branch**: `git checkout -b recovery/<short-sha>-<timestamp> <full-sha>`
3. **Switch to branch**: Working directory now points to recovered commit
4. **Report next steps**: Cherry-pick or merge guidance

**Safety**:
- **Non-destructive**: Never modifies existing refs
- **Explicit**: Requires `--recover` flag with specific SHA
- **Reversible**: Recovery branch can be deleted if unwanted

## Use Cases

### Use Case 1: Cross-Session Branch Contamination

**Scenario**: Session A ran `/ship` which executed `git checkout main`, switching Session B's working directory mid-commit. Session B's commit landed on a random branch.

**Detection**:
```bash
npm run git:recover
```

**Output**:
```
Found 1 orphaned commit:
  Commit: f5498e6
  Message: feat(SD-XXX-001): my feature work
  Branch: Was on feat/SD-XXX-001, now orphaned
```

**Recovery**:
```bash
# Recover commit
npm run git:recover -- --recover f5498e6

# Merge into correct branch
git checkout feat/SD-XXX-001
git merge recovery/f5498e6-<timestamp>

# Or cherry-pick if merge not desired
git checkout feat/SD-XXX-001
git cherry-pick f5498e6

# Cleanup
git branch -d recovery/f5498e6-<timestamp>
```

### Use Case 2: Session Crash During Handoff

**Scenario**: Session crashed during PLAN→EXEC handoff after committing but before pushing. Work is in reflog but not on any branch.

**Detection**:
```bash
npm run git:recover -- --hours 48  # Crash was yesterday
```

**Recovery**:
```bash
npm run git:recover -- --recover abc1234
git push -u origin recovery/abc1234-<timestamp>  # Push recovered work
```

### Use Case 3: Accidental Branch Deletion

**Scenario**: Ran `git branch -D feat/old-work` but forgot it had unpushed commits.

**Detection**:
```bash
npm run git:recover -- --hours 168  # Branch was deleted days ago
```

**Recovery**:
```bash
npm run git:recover -- --recover def5678
git checkout -b feat/old-work-restored  # Rename recovery branch
git push -u origin feat/old-work-restored
```

## False Positives

### Merge Commits on Remote

**Scenario**: Merge commit exists on `remote/main` but not local `main`. Tool may report as orphaned if it only checks local branches.

**Mitigation**: Tool uses `git branch -a --contains` (includes remotes), reducing false positives.

**Verification**:
```bash
# If tool reports commit as orphaned, verify manually
git branch -a --contains <SHA>

# If output shows remote/main, commit is NOT orphaned (false positive)
# If output is empty, commit IS orphaned (true positive)
```

### Worktree Commits

**Scenario**: Commit exists in a worktree on a branch not yet pushed.

**Behavior**: Tool sees commit in reflog but not in `git branch -a` output (worktree branches may not be registered).

**Resolution**: If recovering commits from worktrees, ensure worktree branches are registered or use `git worktree list` to verify.

## Limitations

### Reflog Expiration

**Git reflog retention**: Default 90 days (`gc.reflogExpire`)

**Impact**: Commits older than 90 days are purged from reflog and cannot be recovered.

**Check reflog expiration**:
```bash
git config gc.reflogExpire       # Default: 90.days
git config gc.reflogExpireUnreachable  # Default: 30.days
```

**Extend retention** (if needed):
```bash
git config gc.reflogExpire 180.days
```

### Already Garbage Collected

**Scenario**: Commit was orphaned >30 days ago AND `git gc` ran.

**Behavior**: Commit is purged from reflog and object database — unrecoverable.

**Prevention**: Run `npm run git:recover` regularly (weekly recommended).

### Remote-Only Branches

**Scenario**: Commit exists on `remote/feature-branch` but not locally.

**Behavior**: With `git branch -a`, tool correctly identifies commit as NOT orphaned.

**Note**: Earlier tool versions used `git branch` (local only), causing false positives for remote-only commits.

## Troubleshooting

### Issue: "No orphaned commits found" but I know one exists

**Diagnosis**:
```bash
# Check if commit is in reflog
git reflog | grep <short-sha>

# Check if commit is actually reachable
git branch -a --contains <full-sha>
```

**Possible Causes**:
1. **Commit outside time window**: Use `--hours` to extend
2. **Commit is reachable from remote branch**: Not orphaned (remote/main, remote/feature, etc.)
3. **Reflog expired**: Commit older than `gc.reflogExpire` setting

**Resolution**:
```bash
# Extend time window
npm run git:recover -- --hours 720  # 30 days

# Manual recovery if found in reflog
git checkout -b manual-recovery <full-sha>
```

### Issue: "Commit already exists on a branch" during recovery

**Symptom**: `git checkout -b recovery/... <SHA>` fails with "already on branch"

**Cause**: Commit is actually reachable from current branch or another branch.

**Resolution**: This is correct behavior — commit is not orphaned. Verify with:
```bash
git branch --contains <SHA>
```

### Issue: Recovery branch has wrong content

**Symptom**: Recovered commit doesn't match expected files/changes

**Diagnosis**:
```bash
git checkout recovery/<sha>-<timestamp>
git show
git log -1 --stat
```

**Possible Causes**:
1. **Wrong SHA recovered**: Verify SHA from scan output
2. **Expected commit not orphaned**: May be on a different branch

**Resolution**: Delete recovery branch and re-scan with extended time window.

## Integration with Ship Safety

This tool is **Pillar 3** of the Multi-Session Ship Safety system (SD-LEO-FIX-MULTI-SESSION-SHIP-001).

**Pillars**:
1. **Ship Process Safety**: Replace `git checkout main` with `git fetch origin main:main` (prevents contamination)
2. **Branch-Aware Session Tracking**: Track current branch in heartbeat (detect concurrent sessions by branch)
3. **Recovery Tooling**: This tool (recover orphaned commits when contamination occurs)

**Related Components**:
- **ShippingExecutor**: `scripts/modules/shipping/ShippingExecutor.js` (safe git fetch pattern)
- **Session Manager**: `lib/session-manager.mjs` (branch-aware heartbeat)
- **Concurrent Session Hook**: `scripts/hooks/concurrent-session-worktree.cjs` (branch filtering)
- **Ops Runbook**: [Multi-Session Coordination](../06_deployment/multi-session-coordination-ops.md)

## Best Practices

1. **Run weekly scans**: Schedule `npm run git:recover` as part of weekly maintenance
2. **Extend time window for thorough scans**: Use `--hours 168` (7 days) monthly
3. **Immediate scan after contamination**: If cross-session branch switch detected, run scan immediately
4. **Verify before recovery**: Check `git branch -a --contains` to confirm commit is truly orphaned
5. **Document recovery**: Add note to recovered branch (e.g., `git commit --amend` with context)

## Performance

**Scan Time**:
- **Small repos (<1000 commits in reflog)**: <1 second
- **Medium repos (1000-5000 commits)**: 1-3 seconds
- **Large repos (>5000 commits)**: 3-10 seconds

**Bottlenecks**:
- `git reflog` parsing: O(n) where n = reflog entries
- `git branch -a --contains`: O(m) where m = orphaned commits (typically <10)

**Optimization**: Tool only checks reachability for commits NOT found in any branch (skips check for commits that appear in initial `git branch -a` output).

## Related Documentation

- **Multi-Session Coordination Ops**: [Ship Process Safety](../06_deployment/multi-session-coordination-ops.md#ship-process-safety)
- **NPM Scripts Guide**: [Git Operations](npm-scripts-guide.md#git-operations)
- **ShippingExecutor Source**: `scripts/modules/shipping/ShippingExecutor.js`
- **Recovery Tool Source**: `scripts/git-commit-recovery.js`

## Support

### Log Files

Tool outputs to stdout only (no log files).

### Escalation

1. **Manual reflog inspection**: `git reflog --all --date=iso`
2. **Manual reachability check**: `git branch -a --contains <SHA>`
3. **Manual recovery**: `git checkout -b manual-recovery <SHA>`

### Common Issues

| Issue | Resolution |
|-------|------------|
| Commit not found | Extend time window with `--hours` |
| False positive (commit on remote) | Verify with `git branch -a --contains` |
| Recovery branch exists | Delete existing recovery branch first |
| Reflog expired | Cannot recover (commit purged by gc) |

---

*Part of LEO Protocol v4.3.3 - Multi-Session Ship Safety*
*SD: SD-LEO-FIX-MULTI-SESSION-SHIP-001*
