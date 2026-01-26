# Ship Command Reference Guide

## Metadata
- **Category**: Reference
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: Claude Code (LEO Protocol)
- **Last Updated**: 2026-01-09
- **Tags**: ship, git, branch, pr, workflow

## Overview

The `/ship` command is the primary way to commit changes, create pull requests, and manage git branches in the LEO Protocol workflow.

## Quick Start

```bash
# In Claude Code, simply type:
/ship
```

This triggers the Ship command which handles:
1. Intelligent branch cleanup (orphaned branches)
2. Staging and committing changes
3. Creating feature branches if needed
4. Pushing to remote
5. Creating pull requests
6. Merging and cleanup

## Command Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         /ship WORKFLOW                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Step 0: Intelligent Branch Cleanup (AUTOMATED)                     │
│  ├─ Run: node scripts/branch-cleanup-intelligent.js                 │
│  ├─ Identifies orphaned branches (0 unique commits)                 │
│  ├─ Skips active branches (< 2 hours old)                          │
│  ├─ Cross-references SD database                                    │
│  └─ Deletes safe branches automatically                             │
│                                                                     │
│  Step 1: Check Current State                                        │
│  ├─ git status (uncommitted changes)                                │
│  └─ git log origin/main..HEAD (unpushed commits)                    │
│                                                                     │
│  Step 2: Commit Changes                                             │
│  ├─ git add .                                                       │
│  └─ git commit -m "feat(SD-XXX): description"                       │
│                                                                     │
│  Step 3: Push to Remote                                             │
│  ├─ Create feature branch if on main                                │
│  └─ git push -u origin HEAD                                         │
│                                                                     │
│  Step 4: Create Pull Request                                        │
│  └─ gh pr create --title "..." --body "..."                         │
│                                                                     │
│  Step 5: Return PR URL                                              │
│                                                                     │
│  Step 6: Ask About Merging                                          │
│  ├─ "Yes, merge now" → gh pr merge --merge --delete-branch          │
│  └─ "No, I'll review first" → End                                   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Intelligent Branch Cleanup

The Ship command includes automated cleanup of orphaned branches before shipping new work.

### What Gets Cleaned

| Branch Type | Action |
|-------------|--------|
| **Orphaned** (0 unique commits, > 2h old) | Auto-deleted |
| **Active** (< 2h old) | Skipped (may be parallel work) |
| **Has work** (> 0 unique commits) | Skipped (prompts user) |
| **In-progress SD** | Skipped (cross-referenced with DB) |
| **Open PR exists** | Skipped |

### Manual Cleanup

You can also run the cleanup script directly:

```bash
# Preview what would be deleted (dry run)
node scripts/branch-cleanup-intelligent.js

# Delete orphaned branches (local only)
node scripts/branch-cleanup-intelligent.js --execute

# Delete orphaned branches (local + remote)
node scripts/branch-cleanup-intelligent.js --execute --remote

# Target specific repo
node scripts/branch-cleanup-intelligent.js --execute --repo EHG
```

### Safety Guarantees

The cleanup script has multiple safety checks:

1. **Age check**: Never deletes branches modified within 2 hours
2. **Commit check**: Never deletes branches with unique commits
3. **SD check**: Cross-references database to protect in-progress work
4. **PR check**: Checks for open PRs before deleting
5. **Protected branches**: Never deletes main, master, develop, staging, production

## Commit Message Format

The Ship command uses conventional commit format:

```
<type>(<scope>): <description>

[optional body]

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

### Types

| Type | Use Case |
|------|----------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `refactor` | Code restructuring |
| `test` | Adding tests |
| `chore` | Maintenance |
| `infra` | Infrastructure changes |

### Examples

```bash
# Feature
feat(SD-EHG-WEBSITE-001): add dark mode E2E tests

# Bug fix
fix(SD-UAT-020): resolve authentication redirect loop

# Infrastructure
infra(SD-LEO-001): add intelligent branch cleanup
```

## Pull Request Format

### Title

```
<type>(<SD-ID>): <short description>
```

### Body

```markdown
## Summary
- Bullet points of changes

## Test plan
- [ ] How to verify changes

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

## Integration with LEO Protocol

### Branch Creation

**Previous behavior (REMOVED):**
- Branches were created proactively at LEAD-TO-PLAN handoff
- This caused 192+ orphaned branches

**Current behavior:**
- Branches are created just-in-time when `/ship` is invoked
- Ship Step 3 creates branch if on main

### After Merge

When "Yes, merge now" is selected:
1. `gh pr merge --merge --delete-branch` deletes remote branch
2. Local branch is deleted via cleanup
3. `git checkout main && git pull` syncs local

## Troubleshooting

### "Found X unmerged branches"

This is normal. The intelligent cleanup will handle orphaned branches automatically.

### Branches with unique commits

If branches have actual work, you'll be prompted:
- **Skip for now**: Focus on current ship
- **Show me the list**: See branch details

### CI/CD failures

If the pipeline fails after PR creation:
1. Fix the issues locally
2. Run `/ship` again - it will update the existing PR

## Related Commands

| Command | Purpose |
|---------|---------|
| `/ship` | Ship current changes |
| `node scripts/branch-cleanup-intelligent.js` | Manual branch cleanup |
| `npm run sd:branch <SD-ID>` | Create branch for SD (if needed) |

## Configuration

The cleanup script uses these defaults:

```javascript
// Minimum age before branch is considered stale
const MIN_STALE_HOURS = 2;

// Protected branches (never deleted)
const PROTECTED_BRANCHES = ['main', 'master', 'develop', 'staging', 'production'];

// Repos to scan (relative paths from EHG_Engineer)
const REPO_PATHS = {
  EHG: '../ehg',
  EHG_Engineer: './'
};
```

## Related Documentation

- [Branch Management Guide](./branch-management-guide.md) - Comprehensive branch lifecycle
- [Git Commit Guidelines](../03_protocols_and_standards/leo_git_commit_guidelines_v4.2.0.md) - Commit message standards
- [Handoff System Guide](../leo/handoffs/handoff-system-guide.md) - LEO Protocol handoff process

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-09 | Initial release with intelligent branch cleanup |

---

*Part of LEO Protocol v4.4+*
*Maintained by: LEO Protocol Team*
