# Validation Failure Patterns to Avoid

**Generated**: 2025-10-28T21:47:56.142Z
**Source**: Database (leo_protocol_sections)
**Context Tier**: REFERENCE

---

## ⚠️ Validation Failure Patterns to Avoid

**Problem**: Common anti-patterns where validation skipped or ignored
**Solution**: Recognize these patterns and invoke validation agent instead

### Anti-Pattern 1: "We'll Validate Later"

**What It Looks Like**:
```
LEAD: "Let's approve the SD, we can check for duplicates during PLAN phase"
PLAN: "Let's create the PRD, we can validate schema during EXEC"
EXEC: "Let's implement, we can validate during testing"
PLAN Verify: "Tests failing, now discovering issues that should have been caught earlier"
```

**Why It's Wrong**:
- Validation delayed = issues discovered late
- 4-6 hours rework required
- Scope creep risk increases
- Technical debt accumulates

**Right Approach**:
```
LEAD: "Before approval, let's run validation agent"
→ node scripts/systems-analyst-codebase-audit.js <SD-ID>
→ Discover duplicate implementation exists
→ Reject SD or pivot to enhancement of existing feature
→ 8-10 hours saved
```

**Evidence**: SD-UAT-020 - Discovered existing Supabase Auth during implementation, should have caught during LEAD approval

---

### Anti-Pattern 2: "Assume It Doesn't Exist"

**What It Looks Like**:
```
User: "We need authentication for this feature"
Agent: "I'll build a custom auth system"
[2 days later]
User: "Why didn't you use existing Supabase Auth?"
Agent: "I didn't know it existed"
```

**Why It's Wrong**:
- Duplicates existing functionality
- Wastes 8-10 hours
- Creates maintenance burden (two auth systems)
- Increases security risk (custom auth = more vulnerabilities)

**Right Approach**:
```bash
# BEFORE designing solution, search for existing
node scripts/systems-analyst-codebase-audit.js <SD-ID>

# Manual search if needed
grep -r "authentication|auth|login" ../ehg/src
find ../ehg/src -name "*auth*"

# Check both applications
grep -r "authentication" src
```

**Evidence**: SD-UAT-020 retrospective explicitly mentions this pattern

---

### Anti-Pattern 3: "Approve Without Backlog"

**What It Looks Like**:
```sql
-- SD marked as 'active'
SELECT * FROM strategic_directives_v2 WHERE id = 'SD-EXPORT-001';
-- status: active

-- Check backlog items
SELECT COUNT(*) FROM sd_backlog_map WHERE sd_id = 'SD-EXPORT-001';
-- Result: 0

-- Risk: Moving forward without user requirements = scope creep
```

**Why It's Wrong**:
- No documented user requirements
- Implementation based on assumptions
- Scope creep highly likely
- Cannot validate against actual needs

**Right Approach**:
```sql
-- Database constraint prevents this
ALTER TABLE strategic_directives_v2
ADD CONSTRAINT require_backlog_for_active
CHECK (status != 'active' OR EXISTS (
  SELECT 1 FROM sd_backlog_map WHERE sd_id = strategic_directives_v2.id
));

-- Now attempting to mark active without backlog:
UPDATE strategic_directives_v2 SET status = 'active' WHERE id = 'SD-XXX';
-- ERROR: new row violates check constraint "require_backlog_for_active"
-- BLOCKED until backlog items added
```

**Evidence**: SD-EXPORT-001 had 0 backlog items when approved (failure pattern)

---

### Anti-Pattern 4: "Trust Claims Without Verification"

**What It Looks Like**:
```
SD Description: "Dashboard has 5 critical UI issues:
1. Issue A (doesn't work)
2. Issue B (broken)
3. Issue C (missing feature)
4. Issue D (wrong behavior)
5. Issue E (performance problem)"

LEAD: "Sounds reasonable, approved"

[EXEC reads actual code]
EXEC: "Issues A, C, E don't exist in the code. Only B and D are real."
```

**Why It's Wrong**:
- 3/5 claims false = 60% wasted effort
- Implementation addresses non-existent issues
- Real issues might be missed
- 3-4 hours wasted on unnecessary work

**Right Approach**:
```bash
# LEAD code review for UI/UX SDs (MANDATORY)
# Read actual source code
cat ../ehg/src/components/Dashboard.tsx | grep -A 10 "Issue A description"

# Verify each claim
for issue in A B C D E; do
  echo "Verifying Issue $issue:"
  grep -n "relevant code pattern" /path/to/component.tsx
done
```

**Evidence**: SD-UAT-002 - LEAD code review rejected 3/5 false claims, saved 3-4 hours

---

### Anti-Pattern 5: "Skip Test Environment Validation"

**What It Looks Like**:
```bash
# EXEC starts implementation
npm run test:unit
# Error: Test database not configured

# Or
npm run test:e2e
# Error: Playwright not installed

# Or
npm run build
# Error: Missing dependency
```

**Why It's Wrong**:
- Discovers environment issues during implementation
- Blocks progress unexpectedly
- Wastes time troubleshooting environment
- Should have been caught during PLAN phase

**Right Approach**:
```bash
# PLAN phase pre-flight checks (MANDATORY)

# Check test databases
node -e "require('dotenv').config(); console.log('Unit Test DB:', process.env.TEST_DATABASE_URL ? 'OK' : 'MISSING');"

# Check test frameworks
npm run test:unit -- --version || echo "Unit tests not configured"
npm run test:e2e -- --version || echo "E2E tests not configured"

# Check build
npm run build:skip-checks || echo "Build fails, fix before EXEC"

# BLOCK PLAN→EXEC handoff if any fail
```

**Evidence**: SD-AGENT-ADMIN-002 - Missing pre-flight checks caused test failures

---

### Anti-Pattern 6: "No User Story Validation"

**What It Looks Like**:
```
PRD: "12 user stories defined"

[EXEC implements features]

PLAN Verify: "Running E2E tests"
E2E Tests: "0 tests found matching user story pattern"

Issue: User stories not mapped to tests
Result: Cannot verify implementation meets requirements
```

**Why It's Wrong**:
- User stories disconnected from tests
- Cannot prove requirements met
- Manual verification required (time-consuming)
- Acceptance criteria unclear

**Right Approach**:
```bash
# PLAN phase validation (MANDATORY)
# Check user story → E2E test mapping

# Query user stories
node -e "
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
supabase.from('user_stories').select('id').eq('strategic_directive_id', 'SD-XXX')
  .then(r => console.log('User stories:', r.data.length));
"

# Check E2E tests
grep -r "US-[0-9]\+" ../ehg/tests/e2e/*.spec.ts | wc -l

# Validate 100% coverage
# Every user story MUST have ≥1 E2E test
```

**Evidence**: SD-EVA-MEETING-001 - No enforcement of user story validation

---

### Detection Rules

**If you see these patterns, STOP and validate**:

1. **"Let's skip validation for now"** → NO, validate immediately
2. **"I'll search for duplicates later"** → NO, search now
3. **"We can add backlog items later"** → NO, add before approval
4. **"Claims sound reasonable"** → NO, verify with code review
5. **"Environment probably works"** → NO, validate pre-flight
6. **"Tests cover the features"** → NO, verify US-XXX mapping
7. **"Schema probably exists"** → NO, query database to confirm

---

### Success Stories (When Validation Used Properly)

**Success 1: Early Duplicate Detection** (SD-UAT-020)
- Validation agent found existing Supabase Auth during LEAD approval
- Pivoted from "build custom auth" to "use existing"
- **8-10 hours saved**

**Success 2: Code Review Catches False Claims** (SD-UAT-002)
- LEAD code review validated 5 claimed UI issues
- Found 3/5 didn't exist in actual code
- Rejected false claims, focused on real issues
- **3-4 hours saved**

**Success 3: Three-Checkpoint Validation** (SD-EVA-MEETING-001)
- QA validation + Handoff validation + Auto-trigger
- Caught issues at multiple gates
- **Early error detection**

---

### Quick Reference

| Anti-Pattern | Right Approach | Evidence |
|--------------|---------------|----------|
| "Validate later" | Validate at gate | 4-6 hrs saved |
| "Assume doesn't exist" | Search first | 8-10 hrs saved (SD-UAT-020) |
| "Approve without backlog" | Enforce constraint | SD-EXPORT-001 failure |
| "Trust claims" | Code review | 3-4 hrs saved (SD-UAT-002) |
| "Skip environment check" | Pre-flight validation | SD-AGENT-ADMIN-002 |
| "No US validation" | 100% mapping | SD-EVA-MEETING-001 |

**Remember**: Validation failures are caught cheaply at gates, expensively during implementation.

---

*This is reference documentation, load on-demand only*
*Generated from: scripts/generate-claude-md-from-db-v3.js*
