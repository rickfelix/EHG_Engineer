# Ship Command

Commit your changes and create a pull request.

## Instructions

### Step 0: Two-Stage Intelligent Branch Cleanup (AUTOMATED)

Before shipping, run the v2 cleanup script to handle orphaned branches intelligently.

**Multi-Repo Support (v2.1.0):**

The script now auto-discovers all git repositories in `/mnt/c/_EHG/`:

```bash
# List all discovered repos
node scripts/branch-cleanup-v2.js --discover

# Process ALL repos at once (recommended)
node scripts/branch-cleanup-v2.js --all

# Process specific repo
node scripts/branch-cleanup-v2.js --repo EHG
node scripts/branch-cleanup-v2.js --repo EHG_Engineer
```

**The script performs two-stage analysis:**

**Stage 1 (Auto-safe):**
- Branches with 0 commits (empty placeholders)
- SD mismatch + 100% superseded on main
- These are auto-deleted with `--execute`

**Stage 2 (Analyzed + Tabled):**
- Branches with commits that need judgment
- Script analyzes: commits, superseded %, age, SD status
- Outputs a table with LIKELY_SAFE or UNCERTAIN recommendations
- LIKELY_SAFE deleted with `--execute --stage2`

**Execution commands:**

```bash
# Preview all repos
node scripts/branch-cleanup-v2.js --all

# Delete Stage 1 in all repos
node scripts/branch-cleanup-v2.js --all --execute

# Delete Stage 1 + LIKELY_SAFE in all repos
node scripts/branch-cleanup-v2.js --all --execute --stage2

# Include remote deletion in all repos
node scripts/branch-cleanup-v2.js --all --execute --stage2 --remote

# Single repo commands (legacy)
node scripts/branch-cleanup-v2.js --repo EHG --execute
node scripts/branch-cleanup-v2.js --repo EHG --execute --stage2
```

**UNCERTAIN branches are preserved** - these may have unique work worth reviewing.

**If many branches found, show the user the aggregated summary:**
```
┌─────────────────────────┬──────────┬──────────┬──────────┬──────────┐
│ Repository              │ Total    │ Stage 1  │ Stage 2  │ Kept     │
├─────────────────────────┼──────────┼──────────┼──────────┼──────────┤
│ EHG                     │ 45       │ 30       │ 10       │ 5        │
│ EHG_Engineer            │ 12       │ 8        │ 3        │ 1        │
├─────────────────────────┼──────────┼──────────┼──────────┼──────────┤
│ TOTAL                   │ 57       │ 38       │ 13       │ 6        │
└─────────────────────────┴──────────┴──────────┴──────────┴──────────┘
```

**Then proceed to Step 1.**

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

### Example 1: With Branches Detected

```bash
# Step 0: Run two-stage cleanup
node scripts/branch-cleanup-v2.js --repo EHG

# Output:
# ════════════════════════════════════════════════════════════
# 📊 ANALYSIS RESULTS
# ════════════════════════════════════════════════════════════
#
# ✅ STAGE 1: Safe to Delete (45 branches)
#    • docs/SD-DOCS-001-api-documentation... - Empty placeholder (0 commits)
#    • feat/SD-UAT-002-testing... - SD mismatch + 100% superseded
#    ... and 43 more
#
# ⚠️  STAGE 2: Needs Review (12 branches)
#    • feat/SD-ARTIFACT-001... - 26 commits (20% superseded)
#    ... and 11 more
#
# 📋 STAGE 2 ANALYSIS TABLE
# ┌──────────────────────────────────────────────────┬────────┬────────────┬───────────────┬────────────┐
# │ Branch                                           │ Commits│ Superseded │ Age (days)    │ Recommend  │
# ├──────────────────────────────────────────────────┼────────┼────────────┼───────────────┼────────────┤
# │ docs/SD-DOCS-ARCH-002-architecture-documentation │ 2      │ 100%       │ 17            │ LIKELY_SAFE│
# │ feat/SD-ARTIFACT-INTEGRATION-001-artifact-panel  │ 26     │ 20%        │ 26            │ UNCERTAIN  │
# └──────────────────────────────────────────────────┴────────┴────────────┴───────────────┴────────────┘
#
# 📊 Stage 2 Summary:
#    LIKELY_SAFE: 8 branches (recommend deletion)
#    UNCERTAIN:   4 branches (may have unique work)

# User chooses to execute cleanup
node scripts/branch-cleanup-v2.js --repo EHG --execute --stage2
# Output: ✅ Deleted 53 branches (45 Stage 1 + 8 LIKELY_SAFE)
# ⚠️ 4 UNCERTAIN branches preserved

# Proceed to Step 1
```

### Example 2: Standard Flow (Clean Repo)

```bash
# Step 0: Run cleanup - no branches found
node scripts/branch-cleanup-v2.js --repo EHG
# Output: ✅ No unmerged branches

# Step 1: Check state
git status
git log origin/main..HEAD --oneline

# Step 2: Commit
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

## Test plan
- [ ] Verify email notifications arrive

🤖 Generated with [Claude Code](https://claude.com/claude-code)"

# Step 5: Return PR URL
# Output: https://github.com/user/repo/pull/123

# Step 6: ASK USER: "PR created successfully! Do you want to merge it now?"
# User chooses: "Yes, merge now"

gh pr merge 123 --merge --delete-branch
git checkout main && git pull
# Output: ✅ PR #123 merged and branch deleted.
```

## Branch Cleanup Scripts Reference

```bash
# Multi-repo commands (recommended for full cleanup)
node scripts/branch-cleanup-v2.js --discover                    # List repos
node scripts/branch-cleanup-v2.js --all                         # Preview all
node scripts/branch-cleanup-v2.js --all --execute               # Delete Stage 1
node scripts/branch-cleanup-v2.js --all --execute --stage2      # + LIKELY_SAFE
node scripts/branch-cleanup-v2.js --all --execute --stage2 --remote  # + remote

# Single repo commands
node scripts/branch-cleanup-v2.js --repo EHG                    # Preview
node scripts/branch-cleanup-v2.js --repo EHG --execute          # Stage 1 only
node scripts/branch-cleanup-v2.js --repo EHG --execute --stage2 # + LIKELY_SAFE

# Single branch analysis
node scripts/branch-analyze-single.js <branch-name> --repo EHG

# Manual deletion
git branch -D <branch-name>              # Local
git push origin --delete <branch-name>   # Remote
```
