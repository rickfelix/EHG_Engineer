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

**Then proceed to Step 0.1.**

---

### Step 0.1: Multi-Repo Uncommitted Changes Check (CRITICAL)

**IMPORTANT**: This step catches uncommitted changes across ALL repositories, preventing the common mistake of shipping backend changes while frontend changes sit uncommitted (or vice versa).

```bash
node scripts/multi-repo-status.js
```

**What it checks:**
- Scans all EHG repositories (EHG, EHG_Engineer, etc.)
- Detects uncommitted/unstaged changes in each repo
- Detects unpushed commits
- Categorizes changes by type (quality, api, ui, config, docs)

**Example output when changes found:**

```
═══════════════════════════════════════════════════════════
  MULTI-REPO STATUS CHECK
═══════════════════════════════════════════════════════════

  Scanned 2 repositories
  ⚠️  Found changes in 1 repo(s)

────────────────────────────────────────────────────────────
📂 ehg (branch: main)
   📝 3 uncommitted change(s):
      M src/components/quality/FeedbackDetailPanel.tsx
      M src/pages/quality/QualityInboxPage.tsx
      M src/components/navigation/BreadcrumbNavigation.tsx

═══════════════════════════════════════════════════════════
  RECOMMENDATIONS
═══════════════════════════════════════════════════════════

  📂 ehg:
     cd C:\Users\rickf\Projects\_EHG\ehg
     git checkout -b feat/SD-XXX-description  # Create feature branch
     git add .
     git commit -m "feat: description"
     git push -u origin HEAD

────────────────────────────────────────────────────────────
  ⚠️  Ship these changes before or with current work to avoid
     leaving related changes uncommitted across repositories.
```

**If changes found in OTHER repos:**

1. **Option A: Ship the other repo first**
   - Navigate to that repo
   - Run `/ship` there first
   - Return to original repo

2. **Option B: Ship together (coordinated)**
   - Use AskUserQuestion to confirm: "Found uncommitted changes in EHG repo. Ship those first?"
   - If yes, switch to that repo and complete the ship flow
   - Then return to original repo

3. **Option C: Intentionally skip (rare)**
   - If changes are unrelated, proceed with caution
   - Document why in commit message

**If all repos clean:**
```
═══════════════════════════════════════════════════════════
  MULTI-REPO STATUS CHECK
═══════════════════════════════════════════════════════════

  Scanned 2 repositories

  ✅ All repositories are clean
     No uncommitted changes or unpushed commits found
```

**Then proceed to Step 0.5.**

---

### Step 0.5: Pre-Ship Verification

Before committing, run the preflight verification to ensure all SD work is ready for shipping.

```bash
node scripts/ship-preflight.js
```

**This verifies three things:**

1. **Branch Verification** - No unmerged branches for current SD
   - Checks for open PRs that need merging
   - Detects branches with commits but no PR created

2. **State Reconciliation** - Database SD status matches git state
   - SD marked "completed" but branches unmerged → BLOCK
   - SD "in_progress" but work already merged → WARN
   - SD "in_progress" but no branch exists → WARN

3. **Multi-Repo Coordination** - Related branches across repos identified
   - Shows unified status table across EHG and EHG_Engineer
   - Identifies coordination order (infrastructure before frontend)

**Example output:**

```
═══════════════════════════════════════════════════════════
  SHIP PREFLIGHT VERIFICATION
═══════════════════════════════════════════════════════════

  SD: SD-LEO-001

📋 Pre-Ship Verification for SD-LEO-001
═══════════════════════════════════════════════════════════

✅ Branch Verification: PASS
   No unmerged branches or open PRs found

🔄 State Reconciliation
   SD State: in_progress (EXEC)
   Git State: 1 branch(es), all merged

✅ State Reconciliation: PASS

🔗 Multi-Repo Coordination
┌──────────────────┬─────────────────────────────┬─────────┬────────┬────────┐
│ Repository       │ Branch                      │ Commits │ PR #   │ Status │
├──────────────────┼─────────────────────────────┼─────────┼────────┼────────┤
│ EHG_Engineer     │ feat/SD-LEO-001-protocol    │ 0       │ -      │ Merged │
└──────────────────┴─────────────────────────────┴─────────┴────────┴────────┘

✅ Multi-Repo Coordination: PASS

═══════════════════════════════════════════════════════════
  PREFLIGHT SUMMARY
═══════════════════════════════════════════════════════════

  ✅ Branch Verification
     No unmerged branches

  ✅ State Reconciliation
     States consistent

  ✅ Multi-Repo Coordination
     1 branch(es) coordinated

----------------------------------------------------------
  ✅ RESULT: PROCEED
     All preflight checks passed
```

**Options:**

```bash
# Auto-create missing PRs for branches with commits
node scripts/ship-preflight.js --create-prs

# Auto-fix state mismatches (revert SD status, etc.)
node scripts/ship-preflight.js --fix

# JSON output for automation
node scripts/ship-preflight.js --json
```

**If BLOCKED, follow the remediation steps before proceeding to Step 0.6.**

---

### Step 0.6: Code Simplification (OPTIONAL)

Before committing, consider running `/simplify` to clean up code without changing behavior.

**When to run:**
- Session had rapid iteration (multiple debug cycles)
- Code works but feels "messy"
- Pre-PR polish desired

**Quick check:**
```javascript
import { SimplificationEngine } from './lib/simplifier/simplification-engine.js';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const engine = new SimplificationEngine(supabase);
const files = engine.getSessionChangedFiles();

if (files.length > 0) {
  console.log(`📝 ${files.length} files changed - consider /simplify`);
  const results = await engine.simplify(files, { dryRun: true });
  if (results.totalChanges > 0) {
    console.log(`   🔧 ${results.totalChanges} simplifications available`);
  }
}
```

**If changes found:**
1. Run `/simplify` to preview
2. Review changes (especially `logic` type rules)
3. Run `/simplify --apply` if acceptable
4. Proceed to Step 1

**Skip if:**
- No simplifications found
- Time-sensitive shipping
- Changes are too risky (manual cleanup preferred)

See `/simplify` command for full details.

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

**AUTO-PROCEED Detection**: Before asking, check if AUTO-PROCEED mode is active:

```bash
# Check for AUTO-PROCEED context (uses claude_sessions.metadata.auto_proceed)
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.from('claude_sessions')
  .select('metadata')
  .eq('status', 'active')
  .order('heartbeat_at', { ascending: false })
  .limit(1)
  .single()
  .then(({data}) => {
    const autoProceed = data?.metadata?.auto_proceed ?? true;
    if (autoProceed) console.log('AUTO-PROCEED: ACTIVE');
    else console.log('AUTO-PROCEED: INACTIVE');
  });
"
```

**If AUTO-PROCEED is ACTIVE:**
- Skip AskUserQuestion
- Output status: `🤖 AUTO-PROCEED: Auto-merging PR #X...`
- Auto-execute: `gh pr merge <PR#> --merge --delete-branch`
- Continue to Step 7 automatically

**If AUTO-PROCEED is INACTIVE:**
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

### Step 7: Post-Merge Command Ecosystem (NEW)

**After a successful merge, present contextual suggestions using AskUserQuestion:**

```
✅ PR #X merged and branch deleted.
```

**AUTO-PROCEED Detection**: Check if AUTO-PROCEED mode is active (same check as Step 6).

**If AUTO-PROCEED is ACTIVE:**
- Skip AskUserQuestion
- Get post-completion sequence from SD type:
  ```bash
  node -e "
  const { getPostCompletionSequence } = require('./lib/utils/post-completion-requirements.js');
  const sequence = getPostCompletionSequence('SD_TYPE_HERE', { source: 'SOURCE_HERE' });
  console.log('POST-COMPLETION SEQUENCE:', sequence.join(' -> '));
  "
  ```
- Output status: `🤖 AUTO-PROCEED: Continuing to next command in sequence...`
- Auto-invoke the next command in sequence (e.g., `/document`, `/learn`, or `/leo next`)

**If AUTO-PROCEED is INACTIVE:**
**Use AskUserQuestion with these options (adapt based on context):**

```javascript
// Standard post-merge options
{
  "question": "What would you like to do next?",
  "header": "Next Step",
  "multiSelect": false,
  "options": [
    {"label": "/learn", "description": "Capture learnings from this session"},
    {"label": "/document", "description": "Update documentation (feature/API work)"},
    {"label": "/leo next", "description": "Continue with next SD in queue"},
    {"label": "Done for now", "description": "End session, no further action"}
  ]
}
```

**Auto-invoke behavior:** When user selects a command option (e.g., "/learn"), immediately invoke that skill using the Skill tool. Do NOT just acknowledge - execute the command.

**Context-aware option filtering:**
| Condition | Include Option |
|-----------|----------------|
| Always | `/learn`, "Done for now" |
| Feature/API SD just completed | `/document` |
| More SDs in queue | `/leo next` |
| Long session (>2 hours) | `/restart` |

**Why:** The command ecosystem connects related workflows. `/ship` is often the end of one work unit but the beginning of another.

---

### Cross-Reference

This command is part of the **Command Ecosystem**. For full workflow context, see:
- **[Command Ecosystem Reference](../../docs/reference/command-ecosystem.md)** - Complete inter-command flow diagram and relationships

---

### Pre-Ship: /restart for UI Work (IMPORTANT)

**If the SD involved UI changes**, suggest running `/restart` BEFORE shipping to verify visual changes in a clean environment:

```
🎯 UI Changes Detected

Before shipping, consider:
1. Run /restart - Clean server environment
2. Visual review - Verify UI renders correctly
3. Then proceed with /ship

This catches render issues that may only appear after server restart.
```

**When to suggest:**
- SD type is `feature` with UI components
- Files modified include `*.tsx`, `pages/`, `components/`
- PRD mentions UI, dashboard, or visual changes

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
