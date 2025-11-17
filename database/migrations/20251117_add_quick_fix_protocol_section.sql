-- Migration: Add Quick-Fix Workflow to LEO Protocol
-- Purpose: Document quick-fix workflow in CLAUDE_EXEC.md
-- Created: 2025-11-17

INSERT INTO leo_protocol_sections (
  protocol_id,
  section_type,
  title,
  content,
  order_index,
  metadata,
  context_tier,
  target_file
) VALUES (
  'leo-v4-2-0-story-gates',
  'quick_fix_workflow',
  '🎯 LEO Quick-Fix Workflow',
  E'## LEO Quick-Fix Workflow (≤50 LOC, UAT-Discovered Issues)

### Purpose
Lightweight issue resolution for small bugs/polish found during UAT/manual testing that don\'t require full SD workflow.

### Eligibility Criteria (ALL must be true)
- **LOC:** ≤50 lines of code (hard cap)
- **Type:** bug, polish, typo, or documentation (NOT features)
- **Risk:** No database schema changes, no auth/security changes
- **Testing:** Existing tests cover the change (no new test creation needed)
- **Complexity:** Single file/component preferred
- **Source:** Found during UAT or manual testing

### Auto-Escalation to Full SD
Quick-fixes auto-escalate if ANY of these are true:
- Estimated LOC >50 or actual LOC >50
- Database migration required
- Security/authentication changes
- Type is "feature" (not allowed)
- Description contains: migration, schema change, auth, security, RLS
- Severity is critical
- Multiple files changed (>3)

### 6-Step Quick-Fix Workflow

#### Step 1: Create Quick-Fix
```bash
# Interactive mode
node scripts/create-quick-fix.js --interactive

# CLI mode
node scripts/create-quick-fix.js \\
  --title "Fix broken save button" \\
  --type bug \\
  --severity high \\
  --description "Save button onClick handler missing" \\
  --steps "1. Navigate to settings 2. Click save" \\
  --estimated-loc 10
```

**Generates:** QF-YYYYMMDD-NNN (e.g., QF-20251117-001)

**Auto-escalates if:** Estimated LOC >50

#### Step 2: Classify (Validation)
```bash
node scripts/classify-quick-fix.js QF-YYYYMMDD-NNN
node scripts/classify-quick-fix.js QF-YYYYMMDD-NNN --auto-escalate  # Auto-escalate if fails
```

**Validates:**
- ✅ LOC ≤50
- ✅ Type allowed (bug/polish/typo/doc)
- ✅ No forbidden keywords
- ✅ Severity not critical

#### Step 3: Read Details
```bash
node scripts/read-quick-fix.js QF-YYYYMMDD-NNN
```

**Displays:**
- Title, type, severity, status
- Description and reproduction steps
- Expected vs actual behavior
- Screenshot path (if provided)
- Next steps based on status

#### Step 4: Implement Fix
```bash
# 1. Create branch
git checkout -b quick-fix/QF-YYYYMMDD-NNN

# 2. Make changes (≤50 LOC, single file preferred)
# Add inline comment: // Quick-fix QF-YYYYMMDD-NNN: Description

# 3. Restart server (MANDATORY)
pkill -f "npm run dev" && npm run dev

# 4. Run both test suites (REQUIRED)
npm run test:unit && npm run test:e2e

# 5. Manual UAT verification (REQUIRED)
# Navigate to issue location, verify fix works
```

#### Step 5: Create PR
```bash
# Always create PR (no direct merge)
gh pr create --title "fix(QF-YYYYMMDD-NNN): Brief description"
```

**PR Policy:** Quick-fixes ALWAYS require PR (no direct merge to main)

#### Step 6: Complete Quick-Fix
```bash
node scripts/complete-quick-fix.js QF-YYYYMMDD-NNN \\
  --pr-url https://github.com/.../pull/123
```

**Interactive prompts for:**
- Actual LOC (auto-detected from git diff)
- Tests passing confirmation
- UAT verified confirmation
- Verification notes (optional)

**Completion Requirements:**
- ✅ Both unit and E2E tests passing (Tier 1 smoke tests)
- ✅ UAT verified (manual confirmation)
- ✅ Actual LOC ≤50 (hard cap, auto-escalates if exceeded)
- ✅ PR created

**Auto-escalates if:** Actual LOC >50 during completion

### Quality Safeguards (Still Enforced)

**REQUIRED for quick-fixes:**
- Dual test requirement (unit + E2E smoke tests MUST pass)
- Server restart verification (prevent stale code issues)
- Manual UAT confirmation (user verifies fix works)
- PR creation (no direct merge policy)
- Database-first tracking (single source of truth)

**NOT required for quick-fixes:**
- LEAD approval (skip strategic validation)
- PRD creation (too heavy for small fixes)
- DESIGN/DATABASE/STORIES sub-agents (skip orchestration)
- Backlog validation (no ≥1 item requirement)
- Full validation gates (use only 2 of 4 gates)

### Available Scripts

**Creation:**
- `scripts/create-quick-fix.js` - Create quick-fix record
  - Interactive mode: `--interactive`
  - CLI mode: `--title`, `--type`, `--severity`, `--description`, etc.

**Classification:**
- `scripts/classify-quick-fix.js` - Validate eligibility
  - Auto-escalate: `--auto-escalate`

**Information:**
- `scripts/read-quick-fix.js` - Display details
  - JSON output: `--json`

**Completion:**
- `scripts/complete-quick-fix.js` - Mark complete
  - Auto-detect git info (commit SHA, branch, LOC)
  - Requires: `--pr-url`
  - Optional: `--actual-loc`, `--tests-pass`, `--uat-verified`

### Slash Command

```bash
/quick-fix [describe the issue]
```

**Triggers:** Interactive quick-fix creation workflow
- Asks for title, type, severity, description, steps
- Creates quick-fix record
- Provides next steps
- Auto-escalates if criteria not met

### Database Table

**Table:** `quick_fixes`

**Key Columns:**
- `id` - QF-YYYYMMDD-NNN format
- `title`, `type`, `severity`, `description`
- `steps_to_reproduce`, `expected_behavior`, `actual_behavior`
- `estimated_loc`, `actual_loc` (hard cap at 50)
- `status` - open, in_progress, completed, escalated
- `escalated_to_sd_id` - Reference to full SD if escalated
- `branch_name`, `commit_sha`, `pr_url`
- `tests_passing`, `uat_verified`

**Constraints:**
- LOC ≤200 (warning at 50, hard cap enforced in scripts)
- Escalated requires reason
- Completed requires tests_passing=TRUE and uat_verified=TRUE

### UAT Agent Integration

**Enhanced UAT Agent:** `lib/sub-agents/uat.js`

**New Function:** `executeQuickFix(issue, options)`

**Usage:**
```javascript
import { executeQuickFix } from \'./lib/sub-agents/uat.js\';

await executeQuickFix({
  title: "Fix broken button",
  description: "Save button not working",
  type: "bug",
  severity: "high",
  steps: "1. Navigate to settings 2. Click save",
  expected: "Settings should save",
  actual: "Nothing happens",
  estimatedLoc: 10
});
```

**Auto-escalates if:** estimatedLoc >50

### Comparison: Quick-Fix vs Full SD

| Aspect | Quick-Fix | Full SD |
|--------|-----------|---------|
| **Scope** | ≤50 LOC | >50 LOC or complex |
| **Trigger** | `/quick-fix` or script | LEAD approval |
| **Gates** | 2 (simplified) | 4 (full validation) |
| **Tests** | Tier 1 smoke | Tier 1 + Tier 2 |
| **Time** | <2 hours | Days to weeks |
| **Database** | `quick_fixes` table | Full PRD + stories |
| **LEAD Approval** | No | Yes (required) |
| **PRD** | No | Yes (required) |
| **Sub-Agents** | None | DESIGN, DATABASE, STORIES |
| **PR** | Always required | Always required |
| **Backlog** | Not required | ≥1 item required |

### Best Use Cases

**✅ Good for Quick-Fix:**
- UAT-discovered bugs during testing
- Typos in UI text
- Broken buttons/links (onClick/href missing)
- Minor style/alignment fixes
- Documentation updates
- Polish items (<50 LOC)

**❌ Requires Full SD:**
- New features (always full SD)
- Database schema changes (migration required)
- Security/authentication changes (critical risk)
- Complex refactoring (>50 LOC or multiple files)
- Changes requiring new test creation (not covered by existing tests)
- Critical severity issues (require full review)

### Example Workflow

```bash
# 1. Create quick-fix during UAT
node scripts/create-quick-fix.js --interactive
# Output: QF-20251117-001

# 2. Classify to verify eligibility
node scripts/classify-quick-fix.js QF-20251117-001
# Output: ✅ QUALIFIES FOR QUICK-FIX WORKFLOW

# 3. Read details
node scripts/read-quick-fix.js QF-20251117-001

# 4. Implement
git checkout -b quick-fix/QF-20251117-001
# ... make changes (15 LOC) ...
pkill -f "npm run dev" && npm run dev
npm run test:unit && npm run test:e2e
# ... manual UAT verification ...

# 5. Create PR
gh pr create --title "fix(QF-20251117-001): Fix save button onClick"
# Output: https://github.com/.../pull/456

# 6. Complete
node scripts/complete-quick-fix.js QF-20251117-001 --pr-url https://github.com/.../pull/456
# Output: ✅ Quick-fix completed successfully!
```

### Monitoring Quick-Fix Usage

**No tracking dashboard** (per design decision)

**Rely on:**
- Hard caps (50 LOC limit enforced by scripts)
- Test requirements (dual test suite MUST pass)
- UAT verification (manual confirmation required)
- PR policy (no direct merge)

**Periodic review:** Analyze `quick_fixes` table for patterns
- High escalation rate → Improve LOC estimation
- Recurring issues → Create full SD for systemic fix
- Frequently touched files → Consider refactoring (full SD)',
  900,
  '{"added_date": "2025-11-17", "author": "LEO_PROTOCOL", "version": "v4.2.1"}'::jsonb,
  'PHASE_EXEC',
  'CLAUDE_EXEC.md'
)
ON CONFLICT (protocol_id, section_type, order_index)
DO UPDATE SET
  content = EXCLUDED.content,
  metadata = EXCLUDED.metadata;

-- Add comment
COMMENT ON TABLE quick_fixes IS
  'LEO Quick-Fix Workflow: Lightweight issue tracking for UAT-discovered bugs/polish (≤50 LOC).
   Auto-escalates to full SD if criteria not met.
   Part of LEO Protocol v4.2.1';
