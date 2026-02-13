# Working with Worktrees

**Quick Reference**: How to use the worktree-first workflow for SD work

## Overview

The LEO Protocol uses git worktrees to isolate work for each Strategic Directive (SD). This prevents branch conflicts and allows multiple SDs to be worked on simultaneously.

## Quick Start

### Automatic Worktree Creation

When you run a PLAN-TO-EXEC handoff, a worktree is automatically created:

```bash
node scripts/handoff.js execute PLAN-TO-EXEC SD-XXX-001
```

**Result**:
```
✅ GATE 6 PASSED: Branch ready for worktree creation
   Branch: feat/SD-XXX-001-title

🌲 Step 4: Worktree Creation
   ✅ Worktree created: .worktrees/SD-XXX-001
   📂 Path: /repo/path/.worktrees/SD-XXX-001
   🌿 Branch: feat/SD-XXX-001-title
   ✅ node_modules linked
```

### Switching to Worktree

```bash
cd .worktrees/SD-XXX-001

# Verify you're on the correct branch
git branch --show-current
# Output: feat/SD-XXX-001-title
```

### Main Repo Never Moves

```bash
# In main repo
git branch --show-current
# Output: main  (always stays on main)
```

## Manual Worktree Management

### Create Worktree Manually

If automatic creation failed:

```bash
npm run session:worktree -- --sd-key SD-XXX-001 --branch feat/SD-XXX-001-title
```

### List Active Worktrees

```bash
git worktree list
```

**Output**:
```
/repo/path                        abc123 [main]
/repo/path/.worktrees/SD-XXX-001  def456 [feat/SD-XXX-001-title]
/repo/path/.worktrees/SD-YYY-002  ghi789 [feat/SD-YYY-002-title]
```

### Remove Worktree Manually

If automatic cleanup failed:

```bash
git worktree remove --force .worktrees/SD-XXX-001
```

Or use the alias:

```bash
npm run session:cleanup -- --sd-key SD-XXX-001
```

## Common Workflows

### Working on Multiple SDs

**Scenario**: You need to switch between SD-AAA-001 and SD-BBB-002.

**Without worktrees** (old way):
```bash
# Switch to SD-AAA-001
git stash
git checkout feat/SD-AAA-001
# ... work ...
git add . && git commit -m "WIP"

# Switch to SD-BBB-002
git checkout feat/SD-BBB-002
# ... work ...
git add . && git commit -m "WIP"

# Back to SD-AAA-001
git checkout feat/SD-AAA-001
```

**With worktrees** (new way):
```bash
# Work on SD-AAA-001
cd .worktrees/SD-AAA-001
# ... work ...
git add . && git commit -m "feat: implement feature A"

# Switch to SD-BBB-002
cd ../.worktrees/SD-BBB-002
# ... work ...
git add . && git commit -m "feat: implement feature B"

# Back to SD-AAA-001
cd ../SD-AAA-001
```

**Benefits**:
- No stashing required
- No branch checkout overhead
- Each SD has its own uncommitted changes

### IDE Integration

**VSCode/Cursor**: Open worktree folder directly

```bash
code .worktrees/SD-XXX-001
```

**Multi-window editing**:
- Main repo in window 1
- SD-AAA-001 worktree in window 2
- SD-BBB-002 worktree in window 3

### Terminal Session Management

**tmux/screen users**: Create dedicated sessions per worktree

```bash
# Session for SD-AAA-001
tmux new-session -s SD-AAA-001 -c .worktrees/SD-AAA-001

# Session for SD-BBB-002
tmux new-session -s SD-BBB-002 -c .worktrees/SD-BBB-002

# Switch between sessions
tmux attach -t SD-AAA-001
tmux attach -t SD-BBB-002
```

## Troubleshooting

### "CONFLICT: Another active session is already working on SD-XXX-001"

**Error**:
```
CONFLICT: Another active session is already working on SD-XXX-001
   Session: session_abc123_tty1_1234
   Pick a different SD or wait for that session to finish.
```

**Cause**: A concurrent Claude instance on the same terminal is actively working on this SD (heartbeat <5 min).

**Solution**:
```bash
# Option 1: Wait for the other session to finish
# Check session health in database:
# SELECT session_id, sd_id, heartbeat_age_human FROM v_active_sessions WHERE sd_id = 'SD-XXX-001';

# Option 2: Pick a different SD
npm run sd:next  # Find another ready SD

# Option 3: If you ARE the other session, close it first
# Close the other Claude terminal/instance

# Option 4: If other session is stale (heartbeat >5 min), manually release:
# SELECT release_sd('SD-XXX-001');  # Then retry
```

**When to use each option**:
- **Wait**: Other session is legitimately working (heartbeat fresh)
- **Pick different SD**: Common when using multiple Claude instances
- **Close other session**: Duplicate/forgotten Claude window
- **Manual release**: Other session crashed but hasn't reached stale threshold

### "Branch is already checked out"

**Error**:
```
fatal: 'feat/SD-XXX-001' is already checked out at '/repo/.worktrees/SD-XXX-001'
```

**Cause**: The branch is already checked out in another worktree (or main repo).

**Solution**:
```bash
# Find where the branch is checked out
git worktree list | grep feat/SD-XXX-001

# Remove the worktree
git worktree remove --force .worktrees/SD-XXX-001

# Or switch main repo away from the branch
git checkout main
```

### "node_modules not found"

**Error**:
```
Error: Cannot find module 'some-package'
```

**Cause**: node_modules symlink/junction is broken.

**Solution**:
```bash
# Re-link node_modules
cd .worktrees/SD-XXX-001
rm -rf node_modules  # Windows: rmdir /s node_modules
npm run session:worktree:link -- --sd-key SD-XXX-001

# Or run npm ci in the worktree (less efficient)
npm ci
```

### "Worktree creation failed"

**Error**:
```
⚠️  Worktree creation failed (non-blocking): Permission denied
```

**Windows Cause**: Requires admin privileges for junctions.

**Solution**:
```bash
# Run as administrator
npm run session:worktree -- --sd-key SD-XXX-001 --branch feat/SD-XXX-001-title

# Or work in main repo (fallback)
cd /repo/path
git checkout feat/SD-XXX-001-title
```

### "Cleanup failed: dirty worktree"

**Error**:
```
⚠️  Worktree cleanup failed: uncommitted changes detected
```

**Cause**: Worktree has uncommitted changes and `force: false`.

**Solution**:
```bash
# Commit changes first
cd .worktrees/SD-XXX-001
git add . && git commit -m "WIP"
cd ../..

# Then cleanup
npm run session:cleanup -- --sd-key SD-XXX-001 --force
```

## Best Practices

### Always Work in Worktrees

**Do**:
```bash
cd .worktrees/SD-XXX-001
npm run test
npm run dev
git commit -m "feat: implement feature"
```

**Don't**:
```bash
# Working in main repo on a feature branch
cd /repo/path
git checkout feat/SD-XXX-001-title  # ❌ Violates worktree-first model
```

### One Worktree Per SD

**Do**:
- Create worktree during PLAN-TO-EXEC
- Keep worktree until LEAD-FINAL-APPROVAL
- Use the same worktree across multiple sessions

**Don't**:
- Create multiple worktrees for the same SD
- Delete worktree before SD completion

### Main Repo Stays Clean

**Do**:
```bash
# Main repo should always be on 'main' branch
cd /repo/path
git branch --show-current  # Should output: main
git status  # Should output: nothing to commit, working tree clean
```

**Don't**:
```bash
# Avoid making changes in main repo
cd /repo/path
git checkout feat/SD-XXX-001  # ❌ Use worktree instead
```

## FAQ

### Why not just use `git checkout`?

**Answer**: Branch checkouts have limitations:
- Only one branch can be checked out at a time
- Switching branches requires committing or stashing
- Easy to accidentally commit to wrong branch
- Can't work on multiple SDs simultaneously

Worktrees solve all these issues.

### Do I need to install node_modules in each worktree?

**Answer**: No. The system automatically creates a symlink/junction to the main repo's `node_modules`. This saves disk space (~300MB per worktree).

### What happens to the worktree when the SD is completed?

**Answer**: Automatic cleanup during LEAD-FINAL-APPROVAL removes the worktree after PR merge and branch deletion.

### Can I create a worktree for non-SD work?

**Answer**: Yes, but use a different directory:

```bash
git worktree add ../my-experiment origin/some-branch
```

Don't create non-SD worktrees in `.worktrees/` (reserved for SD work).

### How do I know which worktrees exist?

**Answer**:
```bash
git worktree list
ls .worktrees/  # Shows SD keys
```

## Command Reference

| Command | Purpose |
|---------|---------|
| `npm run session:worktree -- --sd-key X --branch Y` | Create worktree manually |
| `npm run session:cleanup -- --sd-key X` | Remove worktree manually |
| `npm run session:worktree:link -- --sd-key X` | Re-link node_modules |
| `git worktree list` | List all worktrees |
| `git worktree remove --force .worktrees/X` | Force remove worktree |
| `git worktree prune` | Clean up stale worktree metadata |

## Related Documentation

- **Architecture**: `docs/architecture/worktree-first-isolation-integration.md`
- **Worktree Manager API**: `lib/worktree-manager.js`
- **Handoff Flow**: `docs/reference/handoff-architecture.md`
