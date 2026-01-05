# Ship Command

Commit your changes and create a pull request.

## Instructions

### Step 0: Check for Unmerged Branches (MANDATORY)

Before proceeding with the current branch, check for stale unmerged branches that may need attention.

**Run this quick check first:**

```bash
# Get all local branches that haven't been merged into main
git branch --no-merged main
```

**If unmerged branches exist, use AskUserQuestion to prompt:**

```
Question: "Found X unmerged branch(es). Would you like me to do a deeper analysis?"
Options:
- "Yes, analyze branches" - Full analysis with categorization and cleanup options
- "No, skip to shipping" - Proceed directly to Step 1
```

**If user chooses "Yes, analyze branches", run the detailed analysis:**

```bash
# For each unmerged branch, get the last commit date
git for-each-ref --sort=-committerdate --format='%(refname:short) %(committerdate:relative) %(committerdate:iso8601)' refs/heads/ | grep -v "^main "
```

**Analyze the results:**

1. **Identify "Possibly Active" branches** (modified within last 2 hours):
   - These may be in use by a parallel Claude Code instance
   - Do NOT suggest deleting or merging these without explicit confirmation
   - Mark them with a ⚠️ warning

2. **Identify "Stale" branches** (not modified in > 2 hours):
   - These are candidates for cleanup
   - Check if they have unmerged commits using: `git log main..<branch> --oneline`

3. **Categorize each unmerged branch**:
   - `ACTIVE`: Last commit < 2 hours ago (possibly parallel instance)
   - `STALE_WITH_COMMITS`: Last commit > 2 hours, has unmerged work
   - `STALE_EMPTY`: Last commit > 2 hours, no unique commits (safe to delete)

**If unmerged branches exist, use AskUserQuestion to prompt:**

Present the user with a summary like:
```
Found X unmerged branches:

⚠️ POSSIBLY ACTIVE (may be parallel Claude Code instance):
  - feature/xyz (modified 45 minutes ago) - 3 commits ahead

📦 STALE WITH WORK (has unmerged commits):
  - feature/abc (modified 3 days ago) - 5 commits ahead

🗑️ STALE EMPTY (safe to delete):
  - feature/old (modified 1 week ago) - 0 commits ahead
```

**Ask the user how to proceed with each category:**

For ACTIVE branches:
- Option 1: "Skip these branches (leave for parallel instance)"
- Option 2: "Include specific branch in this ship (I know it's safe)"

For STALE WITH WORK branches:
- Option 1: "Create separate PRs for each"
- Option 2: "Merge into current branch and ship together"
- Option 3: "Delete without merging (abandon work)"
- Option 4: "Skip for now"

For STALE EMPTY branches:
- Option 1: "Delete all empty stale branches"
- Option 2: "Keep them"

**Handle the user's choices before proceeding to Step 1.**

---

### Step 1: Check current state
   - Run `git status` to see uncommitted changes
   - Run `git log origin/main..HEAD` to see unpushed commits

### Step 2: If there are uncommitted changes:
   - Stage all changes: `git add .`
   - Create a commit with a descriptive message summarizing the changes
   - Follow the commit message format with the 🤖 Generated footer

### Step 3: Push to remote
   - If on main branch, create a new feature branch first
   - Push the branch to origin with `-u` flag

### Step 4: Create Pull Request
   - Use `gh pr create` with:
     - A clear, concise title
     - A body with `## Summary` (bullet points of changes) and `## Test plan`
     - The 🤖 Generated footer

### Step 5: Return the PR URL to the user

### Step 6: Ask About Merging (MANDATORY)

**After presenting the PR URL, use AskUserQuestion to prompt:**

```
Question: "PR created successfully! Do you want to merge it now?"
Options:
- "Yes, merge now" - Run `gh pr merge <PR#> --merge --delete-branch` and confirm completion
- "No, I'll review first" - End the ship command, user will merge manually later
```

**If user chooses "Yes, merge now":**
1. Run `gh pr merge <PR#> --merge --delete-branch`
2. Run `git checkout main && git pull` to sync local
3. Confirm: "✅ PR #X merged and branch deleted. You're on main with latest changes."

---

## Example Flow

### Example 1: With Unmerged Branches Detected

```bash
# Step 0: Quick check for unmerged branches
git branch --no-merged main
# Output:
#   feature/old-experiment
#   fix/parallel-work

# ASK USER: "Found 2 unmerged branch(es). Would you like me to do a deeper analysis?"
# User chooses: "Yes, analyze branches"

# Run detailed analysis
git for-each-ref --sort=-committerdate --format='%(refname:short) %(committerdate:relative) %(committerdate:iso8601)' refs/heads/
# Output:
#   fix/parallel-work 30 minutes ago 2026-01-05T14:30:00-05:00
#   feature/old-experiment 5 days ago 2025-12-31T10:00:00-05:00
#   main 2 hours ago 2026-01-05T12:00:00-05:00

# Check commits ahead for stale branches
git log main..feature/old-experiment --oneline
# Output: 3 commits

# Present categorized summary to user via AskUserQuestion:
# ⚠️ POSSIBLY ACTIVE: fix/parallel-work (30 min ago) - likely parallel instance
# 📦 STALE WITH WORK: feature/old-experiment (5 days ago) - 3 commits ahead
#
# User chooses: Skip active branch, create separate PR for old-experiment
```

### Example 2: Standard Flow (No Issues)

```bash
# Step 0: Check unmerged branches
git branch --no-merged main
# Output: (empty - no unmerged branches)
# Proceed directly to Step 1

# Step 1: Check state
git status
git log origin/main..HEAD --oneline

# Step 2: Commit if needed
git add .
git commit -m "feat: add notification system

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"

# Step 3: Push
git push -u origin HEAD

# Step 4: Create PR
gh pr create --title "feat: add notification system" --body "## Summary
- Added email notifications via Resend
- Added SMS notifications via Twilio
- Updated Claude Code hooks

## Test plan
- [ ] Verify email notifications arrive
- [ ] Verify hooks trigger on Stop event

🤖 Generated with [Claude Code](https://claude.com/claude-code)"

# Step 5: Return PR URL
# Output: https://github.com/user/repo/pull/123

# Step 6: ASK USER: "PR created successfully! Do you want to merge it now?"
# User chooses: "Yes, merge now"

# Merge and sync
gh pr merge 123 --merge --delete-branch
git checkout main && git pull
# Output: ✅ PR #123 merged and branch deleted. You're on main with latest changes.
```

## Branch Cleanup Commands Reference

```bash
# Delete a local branch
git branch -d <branch-name>

# Force delete a local branch (if unmerged)
git branch -D <branch-name>

# Delete a remote branch
git push origin --delete <branch-name>

# Create PR for a specific branch
git checkout <branch-name> && gh pr create

# Merge another branch into current
git merge <branch-name>
```
