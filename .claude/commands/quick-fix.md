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
3. PR always required (no direct merge)
4. User approval needed for commit/push
5. Auto-refinement limited to 3 attempts
6. Specialist sub-agents invoked intelligently

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

## Step 5: Complete & Create PR

```bash
node scripts/complete-quick-fix.js QF-YYYYMMDD-NNN \
  --pr-url https://github.com/.../pull/123
```

**Requirements for completion:**
- ✅ Both unit and E2E tests passing
- ✅ UAT verified (manual confirmation)
- ✅ Actual LOC ≤ 50 (hard cap)
- ✅ PR created (always required)

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
- PR creation (no direct merge)
- Database-first tracking

**Not required for quick-fixes:**
- LEAD approval
- PRD creation
- DESIGN/DATABASE/STORIES sub-agents
- Backlog validation
- Full validation gates (only 2 of 4)

---

**Now proceed with Step 1 above to gather issue details from the user.**
