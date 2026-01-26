# Gate 0: Workflow Entry Enforcement


## Metadata
- **Category**: Protocol
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, api, testing, feature

**Version**: 1.0.0
**Date**: 2026-01-21
**Status**: Active
**Orchestrator SD**: SD-LEO-GATE0-001

---

## Executive Summary

Gate 0 is a multi-layered enforcement system that prevents implementation work from proceeding when Strategic Directives have not been properly approved through LEO Protocol workflow. It addresses the "naming illusion" anti-pattern where work is referenced in conversation but the SD remains in `draft` status in the database.

**Core Principle**: No code implementation until SD passes LEAD approval and transitions to EXEC phase.

---

## Problem Statement

### The Anti-Pattern

Before Gate 0, the following scenario was common:

```
User: "Let's work on Child 3 of the orchestrator"
Agent: [implements code, ships PR]
Database: SD-ORCHESTRATOR-CHILD-003 (status: draft, phase: LEAD_APPROVAL, progress: 0%)
```

**Result**: Code shipped to main while SD workflow never executed. No handoffs, no validation, no protocol enforcement.

### Root Cause

The **naming illusion**: Work proceeding based on conversational reference alone, without verifying database state.

---

## Gate 0 Architecture

Gate 0 consists of 6 enforcement mechanisms operating at different workflow stages:

### Layer 1: Pre-Commit Hook (Local)
**File**: `.husky/pre-commit`
**Script**: `scripts/validate-sd-commit.js`
**When**: Every `git commit`

**Enforcement**:
- Extracts SD ID from commit message or branch name
- Queries Supabase for SD status/phase
- **BLOCKS** commit if SD is in `draft` or `LEAD_APPROVAL` phase
- Fail-open if database unavailable (non-blocking)

**Output Example**:
```
❌ RESULT: BLOCK
   SD-LEO-GATE0-001 is in LEAD_APPROVAL phase (status: draft)

   Implementation cannot begin until SD passes LEAD approval.

   ACTION: Execute LEAD-TO-PLAN handoff first
   Run: node scripts/handoff.js execute LEAD-TO-PLAN SD-LEO-GATE0-001
```

**Code Location**: `.husky/pre-commit:277-318`

---

### Layer 2: CLAUDE_EXEC.md Mandatory Check (Agent)
**File**: `CLAUDE_EXEC.md`
**When**: Before any EXEC phase implementation

**Enforcement**:
- **MANDATORY** Gate 0 check as first pre-implementation step
- Agent must run `npm run sd:status <SD-ID>` before writing code
- **BLOCKS** if SD not in valid phase (EXEC, PLANNING, PLAN_PRD)

**Documentation**:
```markdown
**GATE 0: SD STATUS VERIFICATION** 🚫 BLOCKING FIRST STEP
   - **ALWAYS** verify SD is in EXEC phase before implementation
   - Run: `npm run sd:status <SD-ID>` to confirm SD status
   - **BLOCK** if SD is in `draft` status or `LEAD_APPROVAL` phase
```

**Code Location**: `CLAUDE_EXEC.md:12-27`

---

### Layer 3: LOC Threshold Trigger (Local)
**File**: `.husky/pre-commit`
**When**: Git commit with >500 lines of code

**Enforcement**:
- Calculates LOC added/deleted via `git diff --cached --numstat`
- If total LOC > 500 AND no SD reference found
- **BLOCKS** commit with remediation steps

**Rationale**: Large changes (refactors, infrastructure) must be tracked via SD.

**Output Example**:
```
❌ BLOCKED: Large change without SD reference!
   Changes: 687 lines (512 added, 175 deleted)
   Threshold: 500 lines

   REMEDIATION:
   1. Create an SD for this work: npm run sd:create
   2. Run LEAD-TO-PLAN then PLAN-TO-EXEC handoffs
   3. Retry commit with SD reference in branch name
```

**Code Location**: `.husky/pre-commit:320-373`

---

### Layer 4: Verification Script (Manual)
**File**: `scripts/verify-sd-phase.js`
**When**: Manual invocation before implementation

**Usage**:
```bash
node scripts/verify-sd-phase.js <SD-ID>
```

**Output**:
- ✅ **PASS**: SD is in valid phase (EXEC, PLANNING, PLAN_PRD)
- ❌ **BLOCK**: SD is in LEAD_APPROVAL or draft
- ⚠️ **INFO**: SD already completed

**Example**:
```bash
$ node scripts/verify-sd-phase.js SD-LEO-GATE0-001

════════════════════════════════════════════════════════════
  GATE 0: SD PHASE VERIFICATION
════════════════════════════════════════════════════════════

  Checking: SD-LEO-GATE0-001

  SD: SD-LEO-GATE0-001
  Title: Gate 0: Workflow Entry Enforcement
  Status: draft
  Phase: LEAD_APPROVAL
  Progress: 0%

────────────────────────────────────────────────────────────

❌ RESULT: BLOCK
   SD-LEO-GATE0-001 is in LEAD_APPROVAL phase (status: draft)

   Implementation cannot begin until SD passes LEAD approval.

   ACTION: Execute LEAD-TO-PLAN handoff first
   Run: node scripts/handoff.js execute LEAD-TO-PLAN SD-LEO-GATE0-001
```

**Code Location**: `scripts/verify-sd-phase.js:1-184`

---

### Layer 5: GitHub Action (CI/CD)
**File**: `.github/workflows/sd-validation.yml`
**When**: PR opened/updated targeting main branch

**Enforcement**:
- Extracts SD ID from PR title or branch name
- Queries Supabase REST API for SD status
- **BLOCKS** PR merge if SD in `draft` or `LEAD_APPROVAL`
- Skips validation if no SD reference (allows docs, quick-fixes)

**Required Secrets**:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

**Output Example**:
```
✗ Validate SD Phase

  ❌ SD SD-LEO-GATE0-001 is in DRAFT status
  ❌ PRs cannot be merged until SD passes LEAD approval

  REMEDIATION:
  1. Run LEAD-TO-PLAN handoff: node scripts/handoff.js execute LEAD-TO-PLAN SD-LEO-GATE0-001
  2. Run PLAN-TO-EXEC handoff: node scripts/handoff.js execute PLAN-TO-EXEC SD-LEO-GATE0-001
  3. Push changes and re-run this check
```

**Code Location**: `.github/workflows/sd-validation.yml:1-131`

---

### Layer 6: Orchestrator Progress Fix (Monitoring)
**File**: `scripts/update-orchestrator-progress.js`
**When**: Manual invocation or scheduled

**Purpose**: Correct orchestrator progress calculation based on actual child completions.

**Formula**:
```
progress = (children_with_PLAN-TO-LEAD_handoff / total_children) * 100
```

**Child Considered Complete When**:
- `status = 'completed'` AND `progress_percentage = 100`
- OR has `PLAN-TO-LEAD` handoff with `status = 'accepted'`

**Usage**:
```bash
# Update specific orchestrator
node scripts/update-orchestrator-progress.js SD-LEO-GATE0-001

# Update all orchestrators
node scripts/update-orchestrator-progress.js
```

**Output Example**:
```
Updating: SD-LEO-GATE0-001
  Children: 6
  Completed: 6/6 (100%)
    ✅ SD-LEO-GATE0-PRECOMMIT-001: Pre-commit Hook
    ✅ SD-LEO-GATE0-CLAUDEEXEC-001: CLAUDE_EXEC.md Update
    ✅ SD-LEO-GATE0-LOCTHRESHOLD-001: LOC Threshold Trigger
    ✅ SD-LEO-GATE0-VERIFYSCRIPT-001: verify-sd-phase.js Script
    ✅ SD-LEO-GATE0-GHACTION-001: GitHub Action
    ✅ SD-LEO-GATE0-ORCHPROGRESS-001: Orchestrator Progress Fix
  ✅ Progress updated to 100%
```

**Code Location**: `scripts/update-orchestrator-progress.js:1-213`

---

## Valid SD Phases for Implementation

### Blocking Phases (Cannot Implement)
| Phase | Status | Meaning | Remediation |
|-------|--------|---------|-------------|
| `LEAD_APPROVAL` | `draft` | SD not yet approved | Run LEAD-TO-PLAN handoff |
| `LEAD` | `draft` | SD in initial draft | Run LEAD-TO-PLAN handoff |

### Valid Phases (Can Implement)
| Phase | Status | Meaning |
|-------|--------|---------|
| `EXEC` | `active` or `in_progress` | Implementation phase |
| `PLANNING` | `in_progress` | PRD exists, can start coding |
| `PLAN_PRD` | `in_progress` | PRD in progress, can start coding |
| `PLAN` | `in_progress` | Planning phase |
| `PLAN_VERIFICATION` | `in_progress` | Verification phase |

### Completed Phases (Informational)
| Phase | Status | Action |
|-------|--------|--------|
| `COMPLETED` | `completed` | Create new SD for changes |
| `LEAD_FINAL_APPROVAL` | `completed` | Create new SD for changes |

---

## Enforcement Flow Diagram

```
┌─────────────────────────────────────────────────────────┐
│ Developer starts work on SD-XXX-001                     │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
          ┌────────────────────────────────┐
          │ Layer 2: Agent checks          │
          │ CLAUDE_EXEC.md Gate 0          │
          └────────────────────────────────┘
                           │
                           ▼
          ┌────────────────────────────────┐
          │ npm run sd:status SD-XXX-001   │
          └────────────────────────────────┘
                           │
                ┌──────────┴──────────┐
                │                     │
                ▼                     ▼
        ┌──────────────┐      ┌──────────────┐
        │ draft/LEAD   │      │ EXEC/PLAN    │
        │ ❌ BLOCKED   │      │ ✅ PROCEED   │
        └──────────────┘      └──────────────┘
                                       │
                                       ▼
                          ┌────────────────────────┐
                          │ Developer implements   │
                          └────────────────────────┘
                                       │
                                       ▼
                          ┌────────────────────────┐
                          │ git commit             │
                          └────────────────────────┘
                                       │
                                       ▼
                          ┌────────────────────────┐
                          │ Layer 1: Pre-commit    │
                          │ Hook validates SD      │
                          └────────────────────────┘
                                       │
                           ┌───────────┴───────────┐
                           ▼                       ▼
                  ┌──────────────┐        ┌──────────────┐
                  │ >500 LOC +   │        │ Valid SD     │
                  │ No SD ref    │        │ reference    │
                  │ ❌ BLOCKED   │        │ ✅ COMMIT    │
                  └──────────────┘        └──────────────┘
                                                   │
                                                   ▼
                                          ┌──────────────┐
                                          │ Push to      │
                                          │ remote       │
                                          └──────────────┘
                                                   │
                                                   ▼
                                          ┌──────────────┐
                                          │ Create PR    │
                                          └──────────────┘
                                                   │
                                                   ▼
                                          ┌──────────────┐
                                          │ Layer 5:     │
                                          │ GitHub Action│
                                          └──────────────┘
                                                   │
                                  ┌────────────────┴────────────────┐
                                  ▼                                 ▼
                         ┌──────────────┐                  ┌──────────────┐
                         │ SD in draft  │                  │ SD approved  │
                         │ ❌ BLOCK PR  │                  │ ✅ ALLOW     │
                         └──────────────┘                  └──────────────┘
                                                                    │
                                                                    ▼
                                                           ┌──────────────┐
                                                           │ Merge to     │
                                                           │ main         │
                                                           └──────────────┘
```

---

## Remediation Workflows

### Scenario 1: SD in Draft Status

```bash
# 1. Check current status
npm run sd:status SD-XXX-001

# Output: status=draft, phase=LEAD_APPROVAL

# 2. Execute LEAD-TO-PLAN handoff
node scripts/handoff.js execute LEAD-TO-PLAN SD-XXX-001

# 3. Execute PLAN-TO-EXEC handoff
node scripts/handoff.js execute PLAN-TO-EXEC SD-XXX-001

# 4. Verify status
npm run sd:status SD-XXX-001

# Output: status=in_progress, phase=EXEC ✅

# 5. Proceed with implementation
```

### Scenario 2: Large Change (>500 LOC) Without SD

```bash
# 1. Create SD for the work
npm run sd:create

# 2. Follow the prompts to create SD

# 3. Run handoffs (LEAD-TO-PLAN then PLAN-TO-EXEC)

# 4. Create feature branch with SD reference
git checkout -b feat/SD-XXX-001-description

# 5. Retry commit (will pass LOC check with SD reference)
git commit -m "feat(SD-XXX-001): large refactor..."
```

### Scenario 3: PR Blocked by GitHub Action

```bash
# 1. Check the SD status in database
node scripts/verify-sd-phase.js SD-XXX-001

# 2. Run required handoffs if SD in draft
node scripts/handoff.js execute LEAD-TO-PLAN SD-XXX-001
node scripts/handoff.js execute PLAN-TO-EXEC SD-XXX-001

# 3. Push an empty commit to re-trigger the action
git commit --allow-empty -m "chore: re-trigger CI after SD approval"
git push

# 4. GitHub Action will re-run and pass
```

---

## Emergency Bypass Procedures

Gate 0 enforcement can be bypassed in emergency situations, but all bypasses are logged.

### Pre-Commit Hook Bypass

```bash
# Bypass with --no-verify (logged as emergency)
git commit --no-verify -m "fix: critical production bug"
```

**Note**: The bypass is logged in `.husky/pre-commit` execution, visible in git hook output.

### GitHub Action Bypass

PRs without SD references are automatically allowed (for docs, quick-fixes, reports).

**Pattern Detection**:
- No SD-XXX-NNN pattern in PR title or branch name
- Action logs: "No SD reference found - skipping validation"

### When to Bypass

| Scenario | Bypass OK? | Method |
|----------|------------|--------|
| Production hotfix (P0 incident) | ✅ Yes | `--no-verify` + manual follow-up |
| Documentation-only changes | ✅ Yes | No SD reference needed |
| Quick-fix reports | ✅ Yes | No SD reference needed |
| Refactoring without SD | ❌ No | Must create SD first |
| Feature work | ❌ No | Must go through workflow |

---

## Monitoring and Metrics

### Gate 0 Effectiveness Metrics

Track these metrics to measure Gate 0 effectiveness:

1. **Enforcement Rate**: % of commits with SD references
   ```sql
   SELECT
     COUNT(*) FILTER (WHERE commit_message ~ 'SD-[A-Z]+-[0-9]+') * 100.0 / COUNT(*)
   FROM git_commits
   WHERE created_at > NOW() - INTERVAL '30 days';
   ```

2. **Bypass Rate**: % of commits using `--no-verify`
   - Monitor via pre-commit hook logs
   - Target: <5%

3. **False Positive Rate**: Valid work blocked incorrectly
   - Track via developer feedback
   - Target: 0%

4. **SD Workflow Completion**: % of SDs completing full LEAD→PLAN→EXEC
   ```sql
   SELECT
     COUNT(*) FILTER (WHERE status = 'completed' AND progress_percentage = 100) * 100.0 / COUNT(*)
   FROM strategic_directives_v2
   WHERE created_at > NOW() - INTERVAL '90 days';
   ```

---

## Testing and Validation

### Manual Testing

Test each Gate 0 layer:

```bash
# Test Layer 1: Pre-commit hook
git checkout -b test/gate0-validation
echo "test" > test.txt
git add test.txt
git commit -m "test(SD-FAKE-001): test gate 0"
# Expected: Block if SD-FAKE-001 doesn't exist or is draft

# Test Layer 3: LOC threshold
# Create 501+ lines of change without SD reference
git checkout -b test/large-change
# ... add 501+ lines ...
git commit -m "chore: large refactor"
# Expected: Block due to LOC threshold

# Test Layer 4: Verification script
node scripts/verify-sd-phase.js SD-LEO-GATE0-001
# Expected: Output showing SD status and validation result

# Test Layer 6: Orchestrator progress
node scripts/update-orchestrator-progress.js SD-LEO-GATE0-001
# Expected: Progress recalculated based on children
```

### Automated Testing

```bash
# Run smoke tests (includes Gate 0 script validation)
npm run test:smoke

# Validate pre-commit hook syntax
bash -n .husky/pre-commit

# Validate GitHub Action workflow
gh workflow view sd-validation
```

---

## Troubleshooting

### Issue: Pre-commit hook blocks valid work

**Symptoms**: Commit blocked despite SD being in EXEC phase

**Diagnosis**:
```bash
# Check actual SD status in database
npm run sd:status SD-XXX-001

# Check what the hook detected
git commit -m "test" --dry-run 2>&1 | grep "SD reference"
```

**Resolution**:
- Ensure branch name OR commit message includes SD ID
- Pattern: `SD-[A-Z]+-[0-9]+` or `SD-[A-Z]+-[A-Z0-9]+-[0-9]+`

### Issue: GitHub Action fails with "SD not found"

**Symptoms**: Action error "SD SD-XXX-001 not found in database"

**Diagnosis**:
```bash
# Verify SD exists
node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.from('strategic_directives_v2')
  .select('id, sd_key, status')
  .eq('sd_key', 'SD-XXX-001')
  .then(({data}) => console.log(data));
"
```

**Resolution**:
- Create the SD first: `npm run sd:create`
- Or fix SD key in branch/PR title to match existing SD

### Issue: Orchestrator shows 0% despite children complete

**Symptoms**: Parent orchestrator progress stuck at 0% when children are done

**Resolution**:
```bash
# Run progress recalculation
node scripts/update-orchestrator-progress.js SD-ORCHESTRATOR-001

# Verify children have PLAN-TO-LEAD handoffs accepted
node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.from('sd_phase_handoffs')
  .select('sd_id, handoff_type, status')
  .eq('sd_id', 'SD-CHILD-001')
  .eq('handoff_type', 'PLAN-TO-LEAD')
  .then(({data}) => console.log(data));
"
```

---

## Related Documentation

- [LEO Protocol Git Commit Guidelines](./leo_git_commit_guidelines_v4.2.0.md)
- [LEO Protocol v4.3.3 Overview](./LEO_v4.3.3_overview.md)
- [Strategic Directive Workflow](../workflow/strategic-directive-workflow.md)
- [Handoff System Documentation](../leo/handoffs/handoff-system-guide.md)
- [Pre-Commit Hook Reference](../../.husky/pre-commit)

---

## Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-21 | Initial documentation of Gate 0 system (SD-LEO-GATE0-001) |

---

## Appendix: Implementation SDs

Gate 0 was implemented via orchestrator SD-LEO-GATE0-001 with 6 children:

| Child | SD Key | Title | PR | Status |
|-------|--------|-------|-----|--------|
| 1 | SD-LEO-GATE0-PRECOMMIT-001 | Pre-commit Hook: SD Phase Validation | #436 | ✅ Completed |
| 2 | SD-LEO-GATE0-CLAUDEEXEC-001 | CLAUDE_EXEC.md: Mandatory sd:status Check | #437 | ✅ Completed |
| 3 | SD-LEO-GATE0-LOCTHRESHOLD-001 | LOC Threshold Trigger for Large Changes | #438 | ✅ Completed |
| 4 | SD-LEO-GATE0-VERIFYSCRIPT-001 | verify-sd-phase.js Script (Gate 0) | #439 | ✅ Completed |
| 5 | SD-LEO-GATE0-GHACTION-001 | GitHub Action: PR Merge SD Validation | #440 | ✅ Completed |
| 6 | SD-LEO-GATE0-ORCHPROGRESS-001 | Orchestrator Progress Calculation Fix | #441 | ✅ Completed |

**Total Implementation**: 6 PRs merged, ~1,200 LOC across scripts, hooks, documentation, and GitHub Actions.
