---
description: Create quick-fix for UAT-discovered issue (bug/polish ≤50 LOC)
argument-hint: [describe the issue]
---

# 🎯 LEO Quick-Fix Workflow

**Issue:** $ARGUMENTS

## ⚠️ MANDATORY: Protocol Brief Required

**Before proceeding, you MUST read the Quick-Fix Protocol Documentation:**

```
Read file: docs/quick-fix-protocol.md
```

**This is non-negotiable. The protocol document contains:**
- Complete workflow (8 steps)
- Quality standards (same rigor as Strategic Directives)
- Compliance rubric (100-point scale)
- Self-verification checklist (6 checks)
- Specialist invocation patterns
- Anti-patterns to avoid
- Failure modes & recovery

**Key Philosophy:** "Quick-Fix refers to SCOPE (≤50 LOC), not QUALITY. Small changes demand the same rigor as large ones."

**After reading the protocol, confirm you understand:**
1. Compliance rubric is mandatory (cannot skip)
2. Tests must actually run (cannot assume)
3. PR created with auto-merge enabled (merges automatically when CI passes)
4. Auto-refinement limited to 3 attempts
5. Specialist sub-agents invoked intelligently

---

You are helping create a **quick-fix** for a UAT-discovered issue. This is a lightweight workflow for small fixes (≤50 LOC) that don't require a full Strategic Directive.

## Step 1: Capture Issue Details

Ask the user for:
1. **Title:** Brief description (e.g., "Fix broken save button")
2. **Type:** bug, polish, typo, or documentation
3. **Severity:** critical, high, medium, or low
4. **Description:** What's wrong?
5. **Steps to reproduce:** How to trigger the issue
6. **Expected behavior:** What should happen
7. **Actual behavior:** What actually happens
8. **Estimated LOC:** How many lines need to change (default: 10)

## Step 2: Create Quick-Fix

Run:
```bash
node scripts/create-quick-fix.js \
  --title "..." \
  --type bug \
  --severity high \
  --description "..." \
  --steps "..." \
  --expected "..." \
  --actual "..." \
  --estimated-loc 10
```

This will:
- Generate a quick-fix ID (QF-YYYYMMDD-NNN)
- Insert into `quick_fixes` table
- Auto-escalate to full SD if >50 LOC

## Step 3: Classify (Auto-Check Eligibility)

Run:
```bash
node scripts/classify-quick-fix.js QF-YYYYMMDD-NNN
```

This validates:
- LOC ≤ 50 ✅
- Type is allowed (bug/polish/typo/doc) ✅
- No forbidden keywords (migration, schema, auth) ✅
- Severity not critical ✅

**If escalation required:** User must create full SD via LEAD→PLAN→EXEC

## Step 4: Implement Fix

If qualified for quick-fix:

1. **Read details:**
   ```bash
   node scripts/read-quick-fix.js QF-YYYYMMDD-NNN
   ```

2. **Create branch:**
   ```bash
   git checkout -b quick-fix/QF-YYYYMMDD-NNN
   ```

3. **Implement fix:**
   - Keep changes ≤50 LOC (hard cap)
   - Single file preferred
   - Add inline comment: `// Quick-fix QF-YYYYMMDD-NNN: Description`

4. **Restart server (MANDATORY):**
   ```bash
   pkill -f "npm run dev" && npm run dev
   ```

5. **Run tests (BOTH required):**
   ```bash
   npm run test:unit && npm run test:e2e
   ```

6. **Verify UAT:**
   - Manually test the fix
   - Confirm issue is resolved

## Step 5: Complete & Create PR (Auto-Merge Enabled)

```bash
# Create PR with auto-merge enabled
gh pr create --title "fix(QF-YYYYMMDD-NNN): [description]" --body "[summary]"

# Enable auto-merge (merges when CI passes)
gh pr merge --auto --squash

# Complete the quick-fix record
node scripts/complete-quick-fix.js QF-YYYYMMDD-NNN \
  --pr-url https://github.com/.../pull/123
```

**✅ Auto-Merge Enabled**
Quick-fix PRs are pre-approved and will auto-merge when CI passes. This assumes:
- Smoke tests passed locally before commit
- Changes are within scope (≤50 LOC)
- Pre-commit hooks validated code quality

**Requirements for completion:**
- ✅ Both unit and E2E tests passing
- ✅ UAT verified (manual confirmation)
- ✅ Actual LOC ≤ 50 (hard cap)
- ✅ PR created with auto-merge enabled

## Auto-Escalation Triggers

Quick-fix will auto-escalate to full SD if:
- Estimated LOC > 50
- Actual LOC > 50 (measured from git diff)
- Type includes database migration
- Description contains: auth, schema change, security, RLS
- Severity is critical
- Multiple files changed (>3)

## Quality Safeguards

**Still enforced for quick-fixes:**
- Dual test requirement (unit + E2E smoke tests)
- Server restart verification
- Manual UAT confirmation
- PR creation with auto-merge enabled
- Database-first tracking
- RCA pattern detection (escalates systemic issues)
- Console error baseline capture

**Not required for quick-fixes:**
- LEAD approval
- PRD creation
- DESIGN/DATABASE/STORIES sub-agents
- Backlog validation
- Full validation gates (only 2 of 4)

---

## Command Ecosystem Integration

### Cross-Reference

This command is part of the **Command Ecosystem**. For full workflow context, see:
- **[Command Ecosystem Reference](../../docs/reference/command-ecosystem.md)** - Complete inter-command flow diagram and relationships

---

The `/quick-fix` command connects to other commands:

### After Quick-Fix Completion

**When PR is created with auto-merge:**
```
✅ Quick-Fix Complete: QF-YYYYMMDD-NNN

PR #XX created with auto-merge enabled.

💡 Next commands:
   • /learn - Capture any patterns from this fix (optional)
   • /leo next - Continue with next SD if queue has work
```

**If quick-fix was triggered by `/triangulation-protocol`:**
```
✅ Quick-Fix Complete

This fix addressed the issue identified during triangulation.
Consider running /learn if this revealed a systemic pattern.
```

### Related Commands

| Command | When to Use |
|---------|-------------|
| `/triangulation-protocol` | Before quick-fix, to confirm bug exists |
| `/ship` | Auto-merge handles this for quick-fixes |
| `/learn` | If fix reveals recurring pattern |
| `/leo next` | After fix, to continue SD work |

---

**Now proceed with Step 1 above to gather issue details from the user.**
