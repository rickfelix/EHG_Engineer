# Quick-Fix Protocol Documentation

**Version:** 1.0
**Status:** ACTIVE
**Last Updated:** 2025-11-17

---

## ⚠️ CRITICAL: Read Before Executing Quick-Fix

**This document MUST be read in full before invoking the QUICKFIX sub-agent.**

---

## Philosophy

> "Quick-Fix refers to SCOPE, not QUALITY. Small changes demand the same rigor as large ones."

**What "Quick" Means:**
- ✅ Small scope (≤50 LOC)
- ✅ Localized impact (1-2 files)
- ✅ Clear root cause
- ✅ Fast to implement

**What "Quick" Does NOT Mean:**
- ❌ Rushed work
- ❌ Skip testing
- ❌ Lower quality standards
- ❌ Skip validation

## The Dual Nature of Quick-Fixes

**Speed Dimension:** Implementation is fast (minutes, not days)
**Quality Dimension:** Validation is thorough (same rigor as Strategic Directives)

Think of it like **emergency surgery** - fast execution, maximum precision.

---

## Quick-Fix vs Strategic Directive

| Attribute | Quick-Fix | Strategic Directive |
|-----------|-----------|-------------------|
| **Scope** | ≤50 LOC | >50 LOC |
| **Planning** | Lightweight (auto-triage) | Full LEAD→PLAN→EXEC |
| **Approval** | No LEAD approval needed | LEAD approval required |
| **PRD** | Auto-generated from error | Full PRD creation |
| **Implementation Speed** | Minutes | Hours to days |
| **Quality Standards** | **SAME** | **SAME** |
| **Testing Requirements** | **SAME** (unit + E2E) | **SAME** (full suite) |
| **Code Review** | PR required | PR required |
| **Compliance Rubric** | **100-point rubric** | Gate-based validation |

**Key Insight:** The only difference is SCOPE. Everything else is identical or enhanced.

---

## When to Use Quick-Fix

### ✅ Use Quick-Fix For:

1. **Bug Fixes** (≤50 LOC)
   - Runtime errors with clear stack traces
   - Typos in code or UI
   - Missing null checks
   - Incorrect event handlers

2. **Polish** (≤50 LOC)
   - UI alignment tweaks
   - Button state styling
   - Copy text changes
   - Minor accessibility improvements

3. **Documentation** (≤50 LOC)
   - README updates
   - Code comment additions
   - Inline documentation

### ❌ Escalate to SD For:

1. **Large Scope** (>50 LOC)
   - Automatically escalated by QUICKFIX

2. **Database Changes**
   - Schema migrations
   - RLS policy changes
   - Index additions

3. **Security/Auth**
   - Authentication logic
   - Authorization rules
   - Permission systems

4. **Architectural Changes**
   - New components
   - API endpoint creation
   - State management refactoring

5. **Pattern Detection**
   - Same error in 4+ files (systemic issue)

---

## Quick-Fix Workflow (8 Steps)

### Step 1: Issue Detection & Triage
- User reports error with console log
- QUICKFIX extracts context (file, line, error type)
- AI-powered LOC estimation
- Auto-classification (bug/polish/typo/documentation)

### Step 2: Intelligent Specialist Invocation
QUICKFIX acts as **mini-orchestrator**, calling specialists when needed:
- **DATABASE** - If keywords: migration, schema, SQL, RLS
- **SECURITY** - If keywords: auth, permission, token
- **TESTING** - Always invoked for test strategy
- **DESIGN** - If keywords: UI, layout, responsive, accessibility

### Step 3: Auto-Escalation Check
QUICKFIX evaluates:
- Estimated LOC > 50?
- Complexity = high?
- Risk = high?
- Specialist recommendation = escalate?

**If ANY true:** Auto-escalate to full SD workflow.

### Step 4: Implementation
- Auto-create QF-YYYYMMDD-NNN record
- Auto-create git branch: `quick-fix/QF-...`
- Implement fix (≤50 LOC)
- Follow established code patterns

### Step 5: Self-Verification (6 Checks)
Runs **before** claiming completion:
1. LOC constraint (actual ≤50)
2. Scope creep detection (files match description)
3. Test coverage reality check (tests actually pass)
4. Issue resolution (fixed the right thing)
5. Unintended consequences scan (no side effects)
6. Overconfidence detection (red flags)

### Step 6: Compliance Rubric (100-Point Scale)
**MANDATORY** self-scoring across 4 categories:

**Fix Quality (40 points):**
- Original error resolved (15 pts)
- No new errors introduced (10 pts)
- LOC constraint met (10 pts)
- Fix is targeted (5 pts)

**Testing & Validation (30 points):**
- Unit tests passing (10 pts)
- E2E tests passing (10 pts)
- No test regressions (10 pts)

**Code Quality (20 points):**
- TypeScript compiles (10 pts)
- Linting passes (5 pts)
- Follows code patterns (5 pts)

**Process Compliance (10 points):**
- Scope matches issue (5 pts)
- Properly classified (5 pts)

**Scoring Tiers:**
- **90-100:** PASS (can complete)
- **70-89:** WARN (user review recommended)
- **<70:** FAIL (must refine or escalate)

### Step 7: Auto-Refinement (If Needed)
If compliance score <90:
- Analyze failure reasons
- Attempt up to 3 refinements
- Re-run rubric after each refinement
- Escalate if still failing after 3 attempts

### Step 8: Completion & Review
- LEO stack restart (server reload)
  - **WSL Context:** Required because Vite dev server does not automatically detect changes and recompile in WSL environment due to file system watching limitations
  - Manual restart ensures code changes are picked up
- User performs manual UAT
- Create PR (always required, no direct merge)
- Commit/push with user confirmation
- Mark as completed in database

---

## Quality Standards (Non-Negotiable)

### Testing Requirements

**MANDATORY (Tier 1 - Smoke Tests):**
- ✅ Unit tests for changed components
- ✅ E2E tests for affected workflows
- ✅ All tests must pass before completion

**No Shortcuts:**
- ❌ Cannot skip tests
- ❌ Cannot ignore test failures
- ❌ Cannot claim "tests pass" without running them

### Code Quality Requirements

**MANDATORY:**
- ✅ TypeScript compilation succeeds
- ✅ Linting passes (warnings acceptable, errors block)
- ✅ No debug code left (console.log, commented code)
- ✅ No @ts-ignore or type suppression
- ✅ Follows established patterns

### Process Requirements

**MANDATORY:**
- ✅ PR creation (no direct merge to main)
- ✅ Git branch naming: `quick-fix/QF-YYYYMMDD-NNN`
- ✅ Commit message format: `fix(QF-ID): description`
- ✅ UAT verification by user
- ✅ Compliance rubric ≥90 score

---

## Self-Verification Checklist

Before claiming completion, QUICKFIX must verify:

- [ ] Original error no longer appears in console
- [ ] No new errors introduced
- [ ] Actual LOC ≤50 (hard cap)
- [ ] Changed files match issue description
- [ ] Both unit and E2E tests pass
- [ ] No test regressions
- [ ] TypeScript compiles
- [ ] Linting passes
- [ ] No anti-patterns (console.log, @ts-ignore, etc.)
- [ ] Scope appropriate (1-2 files changed)
- [ ] PR created
- [ ] Compliance rubric score ≥90

---

## Anti-Patterns to Avoid

### ❌ Overconfidence Traps

1. **"Tests probably pass"** - MUST run tests, not assume
2. **"Simple fix, skip validation"** - ALL fixes require validation
3. **"Just one more file"** - Scope creep leads to escalation
4. **"I'll fix tests later"** - Tests MUST pass before completion
5. **"Close enough to 50 LOC"** - 50 is hard cap, not suggestion

### ❌ Quality Shortcuts

1. **Suppressing TypeScript errors** - Fix root cause, don't suppress
2. **Leaving debug code** - Clean up before completion
3. **Skipping E2E tests** - Both unit AND E2E required
4. **Direct merge to main** - PR always required
5. **Manual server restart skipped** - Server MUST reload to verify (WSL: Vite doesn't auto-detect changes)

### ❌ Process Violations

1. **No UAT verification** - User MUST test manually
2. **No PR creation** - Never bypass code review
3. **Auto-commit without consent** - User must approve commit/push
4. **Incomplete rubric** - ALL 10 criteria must be checked

---

## Specialist Sub-Agent Integration

QUICKFIX can invoke specialists intelligently:

### DATABASE Sub-Agent
**Triggered by:** migration, schema, SQL, table, column, RLS, postgres

**What it checks:**
- Are migrations needed? → Escalate
- Only data updates? → Safe for quick-fix
- RLS policy changes? → Escalate

**Escalation triggers:**
- Schema changes (ALTER TABLE, ADD COLUMN)
- Index creation/deletion
- RLS policy modifications

### SECURITY Sub-Agent
**Triggered by:** auth, authentication, authorization, permission, role, token, session

**What it checks:**
- Auth logic changes? → Escalate
- Only UI changes? → Safe for quick-fix
- Session handling? → Escalate

**Escalation triggers:**
- Authentication flow changes
- Permission system modifications
- Token/session management

### TESTING Sub-Agent
**Always invoked**

**What it checks:**
- Existing test coverage sufficient?
- Need new tests? → Escalate
- Test execution status

**Recommendations:**
- Run unit + E2E smoke tests
- No new test creation for quick-fix
- Verify coverage before completion

### DESIGN Sub-Agent
**Triggered by:** UI, UX, design, layout, responsive, mobile, alignment, button, color, accessibility, a11y

**What it checks:**
- Component sizing appropriate?
- Responsive behavior correct?
- Accessibility standards met?
- Design system consistency?

**Escalation triggers:**
- Large UI redesigns (>40 LOC)
- Accessibility rework needed
- Multiple component changes

---

## Automated Validation Features

### Console Error Monitoring
- Captures errors before fix (baseline)
- Monitors console for 30 seconds after fix
- Compares before/after error states
- Detects if original error persists
- Detects new errors introduced

### Test Execution Verification
- Runs unit tests (npm run test:unit)
- Runs E2E tests (npm run test:e2e)
- Compares pass/fail counts
- Detects test regressions
- Double-checks "tests pass" claims

### Git Diff Analysis
- Measures actual LOC changed
- Lists files modified
- Verifies files match issue description
- Detects scope creep
- Validates targeted fix

### Static Analysis
- TypeScript compilation check
- Linting validation
- Anti-pattern detection (console.log, @ts-ignore)
- Code pattern compliance

---

## Engagement Patterns

### User Says:
```
"I got this error when clicking Save button:
TypeError: Cannot read property 'onClick' of undefined
at Button (src/components/Button.tsx:42:10)

Please use the quick fix sub-agent."
```

### QUICKFIX Response Pattern:
```
1. Read this protocol document (if not read this session)
2. Extract error context (file, line, error type)
3. Estimate LOC with AI
4. Triage issue (detect specialists needed)
5. Invoke specialists if required
6. Check auto-escalation criteria
7. Implement fix (≤50 LOC)
8. Run self-verification (6 checks)
9. Run compliance rubric (100-point scale)
10. Auto-refine if score <90 (up to 3 attempts)
11. Report results to user
12. Prompt for UAT verification
13. Prompt for commit/push approval
```

---

## Success Metrics

A Quick-Fix is successful when:

1. ✅ **Original error resolved** - No longer appears in console
2. ✅ **No regressions** - No new errors, no test failures
3. ✅ **Compliance score ≥90** - Meets quality standards
4. ✅ **User verified** - Manual UAT confirms fix works
5. ✅ **PR created** - Code review opportunity provided
6. ✅ **Within scope** - Actual LOC ≤50
7. ✅ **Properly classified** - Not an escalation case

---

## Failure Modes & Recovery

### Compliance Score <70 (FAIL)
**Action:** Auto-refine up to 3 times
**If still failing:** Escalate to full SD
**Reason:** Issue more complex than quick-fix can handle

### Compliance Score 70-89 (WARN)
**Action:** Report warnings to user
**User decision:** Proceed or escalate
**Common warnings:** Test coverage gaps, minor anti-patterns

### Self-Verification Blockers
**Action:** Cannot complete until resolved
**Examples:**
- LOC >50 → Must escalate
- Tests failing → Must fix tests
- Original error persists → Must refine fix

### Auto-Refinement Strategies
1. **Different approach** - Try alternative implementation
2. **Expand scope** - Fix related files (may trigger escalation)
3. **Simplify** - Reduce complexity, remove unnecessary changes

---

## Database Schema

Quick-fixes are tracked in `quick_fixes` table:

```sql
CREATE TABLE quick_fixes (
  id TEXT PRIMARY KEY,                     -- QF-YYYYMMDD-NNN
  title TEXT NOT NULL,
  type TEXT,                               -- bug, polish, typo, documentation
  severity TEXT,                           -- critical, high, medium, low
  description TEXT,
  estimated_loc INTEGER,
  actual_loc INTEGER,
  status TEXT DEFAULT 'open',              -- open, in_progress, completed, escalated
  compliance_score INTEGER,                -- 0-100
  compliance_verdict TEXT,                 -- PASS, WARN, FAIL
  compliance_details JSONB,                -- Full rubric results
  tests_passing BOOLEAN DEFAULT FALSE,
  uat_verified BOOLEAN DEFAULT FALSE,
  branch_name TEXT,
  commit_sha TEXT,
  pr_url TEXT,
  files_changed TEXT[],
  escalated_to_sd_id TEXT,
  escalation_reason TEXT,
  found_during TEXT,                       -- uat, production, development
  created_by TEXT DEFAULT 'QUICKFIX_AGENT',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
```

---

## Key Reminders for Claude Code

1. **"Quick" = Scope, Not Quality** - Same rigor as Strategic Directives
2. **Compliance Rubric is Mandatory** - Cannot skip or shortcut
3. **User Approval Required** - For commit/push (combat overconfidence)
4. **PR Always Required** - No direct merge to main
5. **Tests Must Actually Run** - Don't assume, verify
6. **Auto-Refinement Limited** - Max 3 attempts, then escalate
7. **Specialist Invocation** - Call experts when keywords detected
8. **Self-Verification First** - Before claiming success
9. **Read This Document** - Every time QUICKFIX is invoked

---

## Common Questions

**Q: Why is compliance rubric so strict if it's a "quick" fix?**
A: Small bugs can cause big incidents. Scope ≠ Impact. Thoroughness prevents rework.

**Q: Can I skip tests if the fix is "obviously correct"?**
A: No. Tests are non-negotiable. "Obviously correct" is a cognitive bias.

**Q: What if I'm 90% sure the fix works?**
A: 90% confidence = 10% chance of failure = unacceptable. Verify with data.

**Q: Can I merge to main directly for urgent fixes?**
A: No. PR is always required. Urgency ≠ skip process. Fast PR review instead.

**Q: What if compliance score is 89 (just below PASS)?**
A: WARN tier - user review required. Don't round up. Standards exist for a reason.

---

**END OF PROTOCOL DOCUMENTATION**

*This document is authoritative. When in doubt, refer to this document.*
