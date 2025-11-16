# BMAD User Story Context Validation - Technical Reference

**Purpose**: Document how BMAD user story context engineering validation works at PLAN→EXEC gate.

**Version**: LEO Protocol v4.2.0_story_gates

**Relevant Code**: `/mnt/c/_EHG/EHG_Engineer/scripts/modules/bmad-validation.js`

---

## Validation Overview

### When It Triggers
- **Phase**: PLAN→EXEC handoff
- **Validator**: `validateBMADForPlanToExec()` function
- **Blocking**: YES - Handoff fails if validation fails
- **Gate**: MANDATORY (no bypass)

### What It Checks
User story context engineering completion:
- Are user stories documented with meaningful implementation context?
- Is context length sufficient (>50 characters)?
- Do ≥80% of stories have valid context?

---

## Validation Algorithm

### Input
```javascript
// SD ID to validate
const sd_id = "SD-EXAMPLE-001";

// Supabase client
const supabase = createClient(url, key);
```

### Step 1: Fetch Strategic Directive
```javascript
const { data: sd } = await supabase
  .from('strategic_directives_v2')
  .select('id, title, checkpoint_plan')
  .eq('id', sd_id)
  .single();

// Result:
// {
//   id: "SD-EXAMPLE-001",
//   title: "Example Strategic Directive",
//   checkpoint_plan: { ... } | null
// }
```

### Step 2: Fetch User Stories
```javascript
const { data: userStories } = await supabase
  .from('user_stories')
  .select('id, story_key, implementation_context, architecture_references, example_code_patterns, testing_scenarios')
  .eq('sd_id', sd_id);

// Result: Array of user stories with all context fields
// [
//   {
//     id: "uuid-1",
//     story_key: "US-001",
//     implementation_context: "Some meaningful context about implementation...",
//     architecture_references: [...],
//     example_code_patterns: [...],
//     testing_scenarios: [...]
//   },
//   ...
// ]
```

### Step 3: Count Stories with Valid Context

**Filter Logic** (lines 80-83 in bmad-validation.js):
```javascript
const storiesWithContext = userStories.filter(s =>
  s.implementation_context &&                    // 1. Must NOT be NULL
  s.implementation_context.length > 50           // 2. Must be >50 characters
).length;
```

**What This Checks**:
1. Field exists and is not NULL
2. Field is not empty string
3. Field contains more than 50 characters

**Character Counting**:
- Includes all characters: letters, numbers, spaces, punctuation
- No special handling for whitespace
- Simple `string.length` property

### Step 4: Calculate Coverage

```javascript
const contextCoverage = (storiesWithContext / storyCount) * 100;

// Example:
// storiesWithContext = 3
// storyCount = 4
// coverage = (3 / 4) * 100 = 75%
```

### Step 5: Evaluate Against Threshold

```javascript
if (contextCoverage >= 80) {
  // PASS: ≥80% of stories have >50 char context
  validation.passed = true;
  validation.score += 50;
  console.log('✅ PASS: User story context engineering complete');
} else {
  // FAIL: <80% of stories have >50 char context
  validation.passed = false;
  validation.issues.push(
    `User story context engineering requires ≥80% coverage (current: ${coverage}%)
     - run STORIES sub-agent before PLAN→EXEC handoff`
  );
}
```

### Step 6: Return Validation Result

```javascript
return {
  passed: true | false,           // Overall result
  score: 0-100,                   // Validation score
  issues: [],                     // Blocking issues
  warnings: [],                   // Non-blocking warnings
  details: {
    stories_context_engineering: {
      verdict: "PASS" | "FAIL",
      coverage: 75,               // Percentage 0-100
      stories_with_context: 3,    // Count
      total_stories: 4            // Count
    }
  }
}
```

---

## Example Scenarios

### Scenario 1: PASS - All Stories Have Context

**Input**:
```
SD: "Feature Request - Export"
Stories: 3

Story 1 (US-001):
  implementation_context: "Implementation requires exporting user data in CSV format
                           with proper encoding and validation." (115 chars)
  Result: ✅ >50 chars

Story 2 (US-002):
  implementation_context: "Backend API endpoint must validate file size and
                           permissions before generating export." (119 chars)
  Result: ✅ >50 chars

Story 3 (US-003):
  implementation_context: "E2E tests must verify export functionality with various
                           data sizes and formats." (106 chars)
  Result: ✅ >50 chars
```

**Calculation**:
```
storiesWithContext = 3
storyCount = 3
coverage = (3/3) * 100 = 100%
threshold = 80%

Result: 100% >= 80% → PASS ✅
```

**Validation Output**:
```
✅ PASS: User story context engineering complete
Implementation Context: 3/3 stories (100%)
Score: 100/100
```

---

### Scenario 2: FAIL - Insufficient Context

**Input**:
```
SD: "Bug Fix - Login"
Stories: 4

Story 1 (US-001):
  implementation_context: "Fix login issue" (15 chars)
  Result: ❌ <50 chars

Story 2 (US-002):
  implementation_context: "Session timeout" (15 chars)
  Result: ❌ <50 chars

Story 3 (US-003):
  implementation_context: "Add login validation with proper error handling and
                           user feedback mechanisms for authentication failures." (126 chars)
  Result: ✅ >50 chars

Story 4 (US-004):
  implementation_context: "Test login flow" (15 chars)
  Result: ❌ <50 chars
```

**Calculation**:
```
storiesWithContext = 1
storyCount = 4
coverage = (1/4) * 100 = 25%
threshold = 80%

Result: 25% < 80% → FAIL ❌
```

**Validation Output**:
```
❌ FAIL: Insufficient context engineering (25% coverage)
User story context engineering requires ≥80% coverage (current: 25%)
- run STORIES sub-agent before PLAN→EXEC handoff
Score: 0/100
```

---

### Scenario 3: FAIL - Empty or NULL Context

**Input**:
```
SD: "UI Enhancement"
Stories: 2

Story 1 (US-001):
  implementation_context: NULL
  Result: ❌ NULL field

Story 2 (US-002):
  implementation_context: ""
  Result: ❌ 0 chars
```

**Calculation**:
```
storiesWithContext = 0
storyCount = 2
coverage = (0/2) * 100 = 0%

Result: 0% < 80% → FAIL ❌
```

---

## Character Counting Examples

### What Counts (All Contribute to Length)

| Content | Length | Valid? |
|---------|--------|--------|
| "Short" | 5 | ❌ <50 |
| "This is a longer context that provides meaningful information about implementation." | 84 | ✅ >50 |
| "Implementation with error handling, validation, state management, and integration." | 83 | ✅ >50 |
| "X" × 50 | 50 | ❌ Not >50 (must be strictly greater) |
| "X" × 51 | 51 | ✅ >50 |
| "Implementation. " × 3 + text | Depends | Based on total |

### Precise Threshold

- **51 characters**: ✅ PASS (>50)
- **50 characters**: ❌ FAIL (not >50, only =50)
- **49 characters**: ❌ FAIL (<50)

---

## Integration with Handoff System

### In `unified-handoff-system.js`

```javascript
// During PLAN→EXEC handoff
const bmadValidation = await validateBMADForPlanToExec(sd_id, supabase);

if (!bmadValidation.passed) {
  // Handoff blocked - cannot proceed
  console.error('❌ BMAD Validation Failed');
  console.error('Issues:', bmadValidation.issues);

  // Recommend remediation
  console.log('\nRemediation:');
  console.log(`  node lib/sub-agent-executor.js STORIES ${sd_id}`);

  return { success: false, errors: bmadValidation.issues };
}

// Continue with other validations if BMAD passes
```

---

## Blocking Behavior

### When Validation FAILS

1. **Handoff is REJECTED**
2. **Error message contains**:
   - Current coverage percentage
   - Remediation command
3. **Recommendation**: Run STORIES sub-agent
4. **No bypass**: Cannot proceed until fixed

### STORIES Sub-Agent

If validation fails, run STORIES sub-agent:

```bash
node lib/sub-agent-executor.js STORIES SD-EXAMPLE-001
```

**STORIES Agent Will**:
- Generate detailed implementation context for each story
- Ensure >50 character descriptions
- Provide technical guidance for EXEC phase

---

## Validation Score Calculation

### BMAD Validation Total Score: /100

For PLAN→EXEC phase:

```javascript
let score = 0;

// User Story Context Engineering
if (contextCoverage >= 80) {
  score += 50;  // Full credit for ≥80%
} else {
  score += 0;   // No credit for <80%
}

// Checkpoint Plan (only if >8 stories)
if (storyCount > 8) {
  if (checkpoint_plan_exists) {
    score += 50;
  }
  // else: 0 points
} else {
  score += 50;  // Full credit for small SDs
}

// Total: 0-100
```

**Passing Threshold**:
- ✅ validation.passed = true (all issues resolved)
- Score can be used for dashboard metrics

---

## Troubleshooting

### Problem: "0% coverage" when stories exist

**Check**:
1. Are stories in the same SD? `WHERE sd_id = ?`
2. Is `implementation_context` NULL? `NOT NULL` required
3. Is context <50 chars? `LENGTH(text) > 50` required

**Debug Query**:
```sql
SELECT story_key,
       LENGTH(implementation_context) as context_length,
       implementation_context
FROM user_stories
WHERE sd_id = 'SD-EXAMPLE-001'
ORDER BY story_key;
```

### Problem: Context exists but validation still fails

**Verify**:
1. Update was successful (query to confirm)
2. No cached data (refresh database connection)
3. Character count is truly >50 (not =50)

**Test Query**:
```javascript
const test = userStories.filter(s =>
  s.implementation_context &&
  s.implementation_context.length > 50
);
console.log(`Valid stories: ${test.length}/${userStories.length}`);
```

### Problem: Runs sub-agent but context still insufficient

**Solution Options**:
1. Increase context length (aim for 100+ chars)
2. Run STORIES sub-agent again (with specific focus)
3. Manually edit implementation_context with substantive technical guidance

---

## Best Practices

### For SD Creators

1. **Write complete user stories** with technical context upfront
2. **Ensure >50 character context** for every story (aim for 100+)
3. **Include specific technical guidance** (not generic placeholders)
4. **Before PLAN completion**: Verify context coverage will be ≥80%

### For PLAN Phase

1. **During PRD creation**: Include implementation_context for all stories
2. **Before handing to EXEC**: Run validation check
3. **If fails**: Schedule STORIES sub-agent execution
4. **Document**: Why context is necessary (prevents EXEC confusion)

### For EXEC Phase

1. **On handoff receipt**: Review user story context
2. **Use context as guide**: Implementation guidance from PLAN phase
3. **Flag unclear context**: Work backward to PLAN phase if needed
4. **Reference during development**: Keep story context visible

---

## Related Documentation

- **BMAD Validation Module**: `/scripts/modules/bmad-validation.js`
- **Handoff System**: `/scripts/unified-handoff-system.js`
- **User Stories Schema**: Database table `user_stories`
- **LEO Protocol**: CLAUDE_PLAN.md (PLAN phase operations)

---

## Version History

| Version | Date | Change |
|---------|------|--------|
| 1.0 | 2025-11-08 | Initial documentation |

---

**Document Type**: Technical Reference
**Audience**: Developers, PLAN agents, EXEC agents
**Last Updated**: 2025-11-08
**LEO Protocol Phase**: PLAN → EXEC
