# Branch Management Guide

## Metadata
- **Category**: Reference
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: Claude Code (LEO Protocol)
- **Last Updated**: 2026-01-09
- **Tags**: git, branch, cleanup, workflow

## Overview

This guide explains how branches are managed in the EHG ecosystem, including the LEO Protocol's approach to branch lifecycle. The EHG ecosystem uses a **just-in-time branch creation** strategy where branches are created only when actual code work is ready to be committed, not proactively when work is planned.

## Two Repositories

| Repository | Purpose | Branch Naming |
|------------|---------|---------------|
| **EHG** | Main application (React, Supabase) | `feat/SD-XXX-001-description` |
| **EHG_Engineer** | LEO Protocol, scripts, tooling | `feat/SD-XXX-001-description` |

## Branch Lifecycle

```
┌─────────────────────────────────────────────────────────────────────┐
│                     BRANCH LIFECYCLE                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. PLANNING (No branch yet)                                        │
│     ├─ LEAD phase: SD approved                                      │
│     ├─ PLAN phase: PRD created                                      │
│     └─ Work not started - NO branch created                         │
│                                                                     │
│  2. EXECUTION (Branch created on-demand)                            │
│     ├─ Developer starts coding                                      │
│     ├─ /ship command invoked                                        │
│     └─ Branch created: feat/<SD-ID>-<slug>                          │
│                                                                     │
│  3. REVIEW (Branch pushed, PR created)                              │
│     ├─ Changes committed to feature branch                          │
│     ├─ PR created via gh pr create                                  │
│     └─ CI/CD runs on PR                                             │
│                                                                     │
│  4. MERGE (Branch deleted)                                          │
│     ├─ PR approved and merged                                       │
│     ├─ Remote branch deleted (--delete-branch)                      │
│     └─ Local branch cleaned up                                      │
│                                                                     │
│  5. CLEANUP (Orphan detection)                                      │
│     ├─ Intelligent cleanup runs on next /ship                       │
│     ├─ Orphaned branches (0 commits) deleted                        │
│     └─ Branches with work preserved                                 │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Branch Naming Convention

```
<type>/<SD-ID>-<slug>
```

### Types

| Type | When to Use |
|------|-------------|
| `feat/` | New features (default) |
| `fix/` | Bug fixes |
| `docs/` | Documentation changes |
| `refactor/` | Code restructuring |
| `test/` | Test additions |
| `chore/` | Maintenance tasks |

### Examples

```
feat/SD-EHG-WEBSITE-001-external-ehg-public-website
fix/SD-UAT-020-auth-redirect-fix
docs/SD-DOCS-001-api-documentation
refactor/SD-REFACTOR-001-component-cleanup
```

## Why Not Proactive Branch Creation?

Previously, branches were created at LEAD-TO-PLAN handoff. This caused problems:

| Problem | Impact |
|---------|--------|
| **Orphaned branches** | 192+ branches with no commits |
| **Wrong repo** | Infrastructure SDs created branches in EHG instead of EHG_Engineer |
| **No tracking** | Only 3/87 completed SDs had branch metadata |
| **Never used** | SDs that didn't proceed to EXEC still had branches |

**Solution**: Just-in-time creation via `/ship` command.

## Intelligent Branch Cleanup

The `branch-cleanup-intelligent.js` script automatically identifies and removes orphaned branches.

### How It Works

1. **Scan**: Find all unmerged branches
2. **Analyze**: For each branch:
   - Check age (skip if < 2 hours old)
   - Count unique commits (skip if > 0)
   - Cross-reference SD database (skip if in-progress)
   - Check for open PRs (skip if exists)
3. **Clean**: Delete branches that are safe to delete

### Running Cleanup

```bash
# Preview (dry run)
node scripts/branch-cleanup-intelligent.js

# Execute cleanup
node scripts/branch-cleanup-intelligent.js --execute

# Include remote branches
node scripts/branch-cleanup-intelligent.js --execute --remote

# Target specific repo
node scripts/branch-cleanup-intelligent.js --repo EHG --execute
```

## Protected Branches

These branches are never deleted:

- `main`
- `master`
- `develop`
- `staging`
- `production`

## Working with Branches

### Creating a Branch (Automatic)

The `/ship` command creates branches automatically:

```bash
/ship
# If on main with uncommitted changes:
# 1. Creates feat/<SD-ID>-<description>
# 2. Commits changes
# 3. Pushes and creates PR
```

### Creating a Branch (Manual)

If you need to create a branch before shipping:

```bash
# In the target repo
git checkout -b feat/SD-XXX-001-description
```

Or use the SD branch script:

```bash
npm run sd:branch SD-XXX-001
```

### Switching Branches

```bash
git checkout <branch-name>
```

### Deleting a Branch

```bash
# Local only
git branch -d <branch-name>

# Force delete (unmerged)
git branch -D <branch-name>

# Remote
git push origin --delete <branch-name>
```

## Common Scenarios

### Scenario 1: Start New Feature

```
1. Run npm run sd:next to see available SDs
2. Begin coding in target repo
3. When ready: /ship
4. Ship command creates branch + PR
```

### Scenario 2: Continue Existing Work

```
1. /ship detects uncommitted changes
2. Commits to current branch (or creates new one)
3. Pushes and creates/updates PR
```

### Scenario 3: Clean Up Stale Branches

```
1. /ship runs intelligent cleanup first
2. Orphaned branches deleted automatically
3. Proceeds with shipping
```

### Scenario 4: Branch Has Unique Work

```
1. Cleanup script detects unique commits
2. Branch preserved (not deleted)
3. User prompted to handle manually if needed
```

## Integration with LEO Protocol

| Phase | Branch Action |
|-------|---------------|
| LEAD | No branch created |
| PLAN | No branch created |
| EXEC (start) | Branch created via /ship |
| EXEC (complete) | PR merged, branch deleted |
| Completion | Cleanup removes any orphans |

## Troubleshooting

### "Branch already exists"

The branch may have been created previously. Use:
```bash
git checkout <existing-branch>
```

### "Cannot delete branch - not fully merged"

The branch has commits not on main. Either:
1. Create a PR to merge the work
2. Force delete: `git branch -D <branch-name>`

### "192 unmerged branches found"

Run the intelligent cleanup:
```bash
node scripts/branch-cleanup-intelligent.js --execute --remote
```

## Related Documentation

- [Ship Command Guide](./ship-command-guide.md) - The /ship command reference
- [Git Commit Guidelines](../03_protocols_and_standards/leo_git_commit_guidelines_v4.2.0.md) - Commit message standards
- [Handoff System Guide](./handoff-system-guide.md) - LEO Protocol handoff process

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-09 | Initial release with just-in-time branch strategy |

---

*Part of LEO Protocol v4.4+*
*Maintained by: LEO Protocol Team*
