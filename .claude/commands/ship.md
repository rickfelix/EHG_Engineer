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

### Step 0.6: Code Simplification (MANDATORY)

Before committing, run `/simplify` to clean up code without changing behavior. This step is **mandatory** to prevent technical debt accumulation.

**Procedure:**
1. Run `/simplify` to preview available simplifications
2. Review changes (especially `logic` type rules)
3. Run `/simplify --apply` if acceptable
4. If no simplifications found, proceed to Step 0.9
5. Proceed to Step 0.9

**Quick check:**
```javascript
import { SimplificationEngine } from './lib/simplifier/simplification-engine.js';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const engine = new SimplificationEngine(supabase);
const files = engine.getSessionChangedFiles();

if (files.length > 0) {
  console.log(`${files.length} files changed - running /simplify`);
  const results = await engine.simplify(files, { dryRun: true });
  if (results.totalChanges > 0) {
    console.log(`   ${results.totalChanges} simplifications available`);
  }
}
```

**Escape hatch (`--skip-simplify`):**

For time-sensitive shipping, use `--skip-simplify` to bypass this step. The bypass is logged:
```
[SIMPLIFY-SKIP] /simplify skipped via --skip-simplify flag. Reason: <provide reason>
```
Only use this escape hatch when shipping is genuinely time-sensitive. Habitual skipping defeats the purpose of enforcement.

See `/simplify` command for full details.

---

### Step 0.9: Worktree Validation (MANDATORY - PAT-WORKTREE-LIFECYCLE-001)

Before committing, verify you are working in the correct worktree for the active SD.

**Check if a worktree exists for the current SD:**

```bash
node -e "
const { resolve } = require('./scripts/resolve-sd-workdir.js');
const { execSync } = require('child_process');
const repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
// Get active SD from session or git branch
const branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
resolve(process.argv[2] || branch, 'ship', repoRoot).then(r => {
  if (r?.success && r?.worktree?.exists) {
    const cwd = process.cwd().replace(/\\\\/g, '/');
    const wtPath = r.cwd.replace(/\\\\/g, '/');
    if (cwd !== wtPath) {
      console.log('WORKTREE_MISMATCH=true');
      console.log('WORKTREE_CWD=' + r.cwd);
      console.log('CURRENT_CWD=' + process.cwd());
    } else {
      console.log('WORKTREE_OK=true');
    }
  } else {
    console.log('NO_WORKTREE=true');
  }
}).catch(() => console.log('NO_WORKTREE=true'));
" <SD-ID>
```

**If `WORKTREE_MISMATCH=true`:**
- You are NOT in the worktree but one exists for this SD
- **STOP** and `cd` to the worktree path shown in `WORKTREE_CWD`
- Verify your changes are in the worktree (they may need to be moved)
- Resume shipping from the worktree directory

**If `WORKTREE_OK=true` or `NO_WORKTREE=true`:**
- Proceed to Step 1

**Why this matters:** Without this check, changes get committed to the main repo on `main` branch instead of the SD's isolated worktree branch, bypassing branch isolation.

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

### Step 5.5: Adaptive Review Gate (MANDATORY)

After the PR is created, run the adaptive code review gate before merging.

**1. Compute risk tier:**

Gather diff stats from the PR and compute the review tier:

```javascript
import { computeRiskScore } from './lib/ship/review-risk-scorer.js';

// diffStats from `gh pr diff <PR#> --stat` or git diff
const result = computeRiskScore(
  { linesChanged: <LOC>, filesChanged: [<file paths>] },
  <sdTier>,        // 1, 2, or 3 from SD metadata
  undefined,       // auto-infer change type
  '<sd description>' // for risk keyword scanning
);
// result = { tier: 'light'|'standard'|'deep', score, signals, riskKeywordOverride }
```

**2. Run review gate:**

```javascript
import { runReview, evaluateFindings, parseReviewFindings } from './lib/ship/review-gate.js';

const gateResult = runReview(diffContent, result.tier);

if (gateResult.verdict === 'block') {
  // CRITICAL finding from closed enumeration — merge blocked
  console.log('CRITICAL:', gateResult.criticalFindings.map(f => f.name));
  // HALT — do not proceed to merge
}

if (gateResult.verdict === 'review_needed') {
  // Use gateResult.reviewPrompt as self-review prompt
  // Parse the LLM response:
  const parsed = parseReviewFindings(llmResponse);
  const evaluation = evaluateFindings(parsed.findings, gateResult.tierEnforcement);

  if (evaluation.verdict === 'block') {
    // Auto-fix attempt (max 2 rounds), then halt if unfixable
  }
  // evaluation.verdict === 'pass' → proceed to merge
}
```

**3. Tier behavior summary:**

| Tier | Enforcement | CRITICAL | Warnings | Info |
|------|-------------|----------|----------|------|
| Light | Advisory | BLOCK | Log only | Log only |
| Standard | Blocking | BLOCK | BLOCK (auto-fix attempt) | Log only |
| Deep | Blocking | BLOCK | BLOCK (auto-fix attempt) | Log only |

**4. Output status:**

```
Review Gate: [TIER] tier (score: X.XX, keyword override: yes/no)
  Findings: N critical, M warnings, P info
  Verdict: PASS / BLOCK (reason)
```

**5. On BLOCK:**
- If auto-fixable: apply fix, re-run review (max 2 rounds)
- If unfixable CRITICAL: halt for chairman review
- If Deep tier agent failure/timeout: hard-fail (do NOT degrade to Standard)

---

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

### Step 6.5: Auto-Learning Capture (AUTOMATED)

**After successful merge, the system automatically captures learnings for non-SD work.**

This step runs automatically via PostToolUse hook - no manual action required.

**How it works:**
1. **Detects merge success**: Hook monitors `gh pr merge` commands
2. **Checks SD/QF status**: Queries database to determine if this is SD/QF work
   - Checks `v_active_sessions` for active SD claim
   - Checks `sd_claims` for recently completed SDs
   - Checks `quick_fixes` for in-progress QFs
   - Checks `is_working_on` flag
   - Greps commit messages for SD-*/QF-* patterns
3. **Skips if SD/QF work**: Existing retrospective flow handles SD/QF learning capture
4. **Captures for non-SD work**: Creates retrospective and issue pattern automatically

**What gets created:**
- **Retrospective**: With `generated_by: 'AUTO_HOOK'` and `trigger_event: 'NON_SD_MERGE'`
- **Issue Pattern**: If corrective action detected (fix, correction, docs update)

**Output you'll see:**
```
========================================
  AUTO-LEARNING CAPTURE TRIGGERED
========================================
   PR: #123
   Status: Non-SD work detected
   Action: Capturing learning automatically
========================================

========================================
  AUTO-LEARNING CAPTURE ENGINE
========================================
  PR: #123

  Files changed: 3
  Commits: 1
  Work type: documentation_correction
  Learning-worthy: protocol

  Creating retrospective...
    Created: retrospective abc-123

  Creating issue pattern...
    Created: PAT-AUTO-0001

========================================
  CAPTURE SUMMARY
========================================
  Retrospective: abc-123
  Pattern: PAT-AUTO-0001
  Learnings: 1 captured
========================================
```

**No action required**: The hook handles this automatically. Run `/learn` later to see captured patterns.

**Why this matters**: Previously, learnings from documentation fixes, ad-hoc improvements, and polish sessions were lost because they didn't go through the full SD workflow. Now all valuable work contributes to the learning system.

### Step 6.7: Worktree Cleanup (AUTOMATED)

**After a successful merge, if running inside a worktree, clean it up automatically.**

This prevents zombie worktree directories that point at deleted branches.

**CRITICAL (QF-20260404-445 / PAT-WORKTREE-LIFECYCLE-001):** You MUST `cd` to the main repo BEFORE running cleanup. Deleting a worktree while CWD is inside it corrupts the Windows shell — all subsequent commands (including handoff scripts) fail with ERR_MODULE_NOT_FOUND.

```bash
# STEP 1: cd to main repo FIRST (before cleanup deletes the directory)
cd C:\Users\rickf\Projects\_EHG\EHG_Engineer

# STEP 2: Clean up using --sdKey mode (resolves worktree path externally, not from CWD)
node scripts/modules/shipping/post-merge-worktree-cleanup.js --sdKey <SD-KEY-OR-QF-KEY>
```

**If output contains `"cleaned": true`:**
1. The worktree directory has been removed
2. You are already in the main repo (from Step 1 above)
3. Run `git checkout main && git pull` to sync

**If output contains `"cleaned": false`:**
- No action needed (worktree not found or already cleaned)
- Continue to Step 7

**Example outputs:**
```json
{"cleaned":true,"mainRepoPath":"C:/Users/rickf/Projects/_EHG/EHG_Engineer","workKey":"QF-20260211-001","sdKey":"QF-20260211-001","resolvedFrom":"scan"}
{"cleaned":false,"reason":"no_worktree_found","sdKey":"SD-XXX-001"}
```

**Note:** The existing LEAD-FINAL-APPROVAL cleanup is kept as a safety net. It is idempotent — if this step already cleaned up, it reports "worktree_not_found" and moves on.

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
