# CLAUDE_EXEC.md - EXEC Phase Operations

**Generated**: 2025-11-26 6:24:18 PM
**Protocol**: LEO v4.2.0_story_gates
**Purpose**: EXEC agent implementation requirements and testing (20-25k chars)

---

## 🚨 EXEC Agent Implementation Requirements

### MANDATORY Pre-Implementation Verification
Before writing ANY code, EXEC MUST:

0. **AMBIGUITY RESOLUTION** 🔍 CRITICAL FIRST STEP
   - Review PRD for unclear requirements, missing details, or conflicting specifications
   - Do NOT proceed with implementation if ANY ambiguity exists
   - Use 3-tier escalation to resolve:
     1. **Re-read PRD**: Check acceptance_criteria, functional_requirements, test_scenarios
     2. **Query database context**: Check user stories, implementation_context, SD strategic_objectives
     3. **Ask user**: Use AskUserQuestion tool with specific, focused questions
   - Document resolution: "Ambiguity in [area] resolved via [method]: [resolution]"
   - **If still unclear after escalation**: BLOCK implementation and await user clarification

**Common Ambiguities to Watch For**:
- Vague feature descriptions ("improve UX", "make it better")
- Missing edge case handling ("what if user inputs invalid data?")
- Unclear success criteria ("should be fast", "should look good")
- Conflicting requirements between PRD sections
- Undefined behavior for error states

**Example Ambiguity Resolution**:
```
❌ BAD: Guess at implementation based on similar feature
✅ GOOD:
  - Tier 1: Re-read PRD section 3.2 → Still unclear on validation rules
  - Tier 2: Query user_stories table → Found implementation_context with validation spec
  - Resolution: "Email validation will use regex pattern from US-002 context"
```

1. **APPLICATION CHECK** ⚠️ CRITICAL
   - Confirm target app: `/mnt/c/_EHG/ehg/` (NOT EHG_Engineer!)
   - Verify: `cd /mnt/c/_EHG/ehg && pwd` should show `/mnt/c/_EHG/ehg`
   - Check GitHub: `git remote -v` should show `rickfelix/ehg.git`
   - If you're in EHG_Engineer, you're in the WRONG place for implementation!

2. **URL Verification** ✅
   - Navigate to the EXACT URL specified in the PRD
   - Confirm the page loads and is accessible
   - Take a screenshot for evidence
   - Document: "Verified: [URL] is accessible"

3. **Component Identification** 🎯
   - Identify the exact file path of the target component
   - Confirm component exists at specified location
   - Document: "Target component: [full/path/to/component.tsx]"

4. **Application Context** 📁
   - Verify correct application directory
   - Confirm port number matches PRD
   - Document: "Application: [/path/to/app] on port [XXXX]"

5. **Visual Confirmation** 📸
   - Screenshot current state BEFORE changes
   - Identify exact location for new features
   - Document: "Current state captured, changes will go at [location]"

### Implementation Checklist Template
```markdown
## EXEC Pre-Implementation Checklist
- [ ] **Ambiguity Check**: All requirements clear and unambiguous
- [ ] **Ambiguity Resolution**: [NONE FOUND | Resolved via Tier X: description]
- [ ] **Application verified**: [/mnt/c/_EHG/ehg/ confirmed]
- [ ] **URL verified**: [exact URL from PRD]
- [ ] **Page accessible**: [YES/NO]
- [ ] **Component identified**: [path/to/component]
- [ ] **Port confirmed**: [port number]
- [ ] **Screenshot taken**: [timestamp]
- [ ] **Target location confirmed**: [where changes go]
```

### Common Mistakes to AVOID
- ❌ Assuming component location based on naming similarity
- ❌ Implementing without navigating to the URL first
- ❌ Ignoring port numbers in URLs
- ❌ Pattern matching without verification
- ❌ Starting to code before completing checklist
- ❌ Not restarting dev servers after changes
- ❌ **CRITICAL**: Creating files for PRDs, handoffs, or documentation
- ❌ **CRITICAL**: Proceeding with implementation when requirements are ambiguous

## 📦 Database-First Progress Tracking (MANDATORY)

### ⚠️ CRITICAL: Update Tracking Tables During Implementation

**Root Cause of SD Completion Failures**: Work gets done but database tracking records aren't updated. The `enforce_sd_completion_protocol` trigger validates ALL tracking records before allowing SD completion.

**Evidence**: SD-FOUND-DATA-004 blocked at 55% despite complete implementation because:
- 4 user stories remained `pending` instead of `validated`
- 7 deliverables remained `pending` instead of `completed`
- Missing sub-agent execution results

### Required Database Updates During EXEC

#### 1. Update Deliverables as Work Completes
```javascript
// After completing each deliverable item:
await supabase
  .from('sd_scope_deliverables')
  .update({
    completion_status: 'completed',
    completion_evidence: 'Brief description of what was done',
    updated_at: new Date().toISOString()
  })
  .eq('sd_id', 'SD-XXX-YYY')
  .eq('deliverable_name', 'Name of completed item');
```

**When to update**: After each major implementation milestone (component created, tests written, API implemented, etc.)

#### 2. Validate User Stories as Acceptance Criteria Met
```javascript
// After meeting acceptance criteria for a user story:
await supabase
  .from('user_stories')
  .update({
    validation_status: 'validated',
    updated_at: new Date().toISOString()
  })
  .eq('sd_id', 'SD-XXX-YYY')
  .eq('story_key', 'US-XXX');
```

**When to update**: After tests pass that cover the user story's acceptance criteria

#### 3. Record Sub-Agent Verification Results
```javascript
// After completing implementation verification:
await supabase
  .from('sub_agent_execution_results')
  .insert({
    sd_id: 'SD-XXX-YYY',
    sub_agent_code: 'QA',  // or ARCHITECT, SECURITY, TESTING, DOCMON
    sub_agent_name: 'QA Sub-Agent',
    verdict: 'PASS',
    confidence: 95,
    detailed_analysis: 'Implementation verified: [summary]',
    validation_mode: 'prospective'
  });
```

### EXEC Progress Tracking Checklist
```markdown
## Database Tracking Checklist
- [ ] Deliverables exist in `sd_scope_deliverables` (auto-created by PLAN→EXEC)
- [ ] User stories exist in `user_stories` (created during PLAN)
- [ ] As each deliverable completes → Update `completion_status = 'completed'`
- [ ] As each user story is validated → Update `validation_status = 'validated'`
- [ ] Before EXEC→PLAN handoff → Verify ALL tracking records updated
```

### Why This Matters
- **Trigger Validation**: `enforce_sd_completion_protocol` checks ALL tracking tables
- **Progress Calculation**: `get_progress_breakdown()` calculates % from tracking records
- **Blocking Issue**: SD cannot be marked complete if tracking records show incomplete work
- **Prevention**: Update records AS work happens, not after

## Component Sizing Guidelines

**Evidence from Retrospectives**: Proven pattern in SD-UAT-020 and SD-008.

### Optimal Component Size: 300-600 Lines

**Success Pattern** (SD-UAT-020):
> "Split settings into three focused components. Each ~500 lines. Easy to test and maintain."

### Sizing Rules

| Lines of Code | Action | Rationale |
|---------------|--------|-----------|
| **<200** | Consider combining | Too granular |
| **300-600** | ✅ **OPTIMAL** | Sweet spot |
| **>800** | **MUST split** | Too complex |

## TODO Comment Standard

## TODO Comment Standard (When Deferring Work)

**Evidence from Retrospectives**: Proven pattern in SD-UAT-003 saved 4-6 hours.

### Standard TODO Format

```typescript
// TODO (SD-ID): Action required
// Requires: Dependencies, prerequisites
// Estimated effort: X-Y hours
// Current state: Mock/temporary/placeholder
```

**Success Pattern** (SD-UAT-003):
> "Comprehensive TODO comments provided clear future work path. Saved 4-6 hours."

## EXEC Dual Test Requirement

### ⚠️ MANDATORY: Dual Test Execution

**CRITICAL**: "Smoke tests" means BOTH test types, not just one!

**Evidence**: SD-EXPORT-001 - Tests existed but weren't executed. 30-minute gap between "complete" and validation. SD-EVA-MEETING-002 - 67% E2E failure rate when finally run.

Before creating EXEC→PLAN handoff, EXEC MUST run:

#### 1. Unit Tests (Business Logic Validation)
```bash
cd /mnt/c/_EHG/ehg
npm run test:unit
```
- **What it validates**: Service layer, business logic, data transformations
- **Failure means**: Core functionality is broken
- **Required for**: EXEC→PLAN handoff
- **Framework**: Vitest

#### 2. E2E Tests (UI/Integration Validation)
```bash
cd /mnt/c/_EHG/ehg
npm run test:e2e
```
- **What it validates**: User flows, component rendering, integration
- **Failure means**: User-facing features don't work
- **Required for**: EXEC→PLAN handoff
- **Framework**: Playwright

#### Verification Checklist
- [ ] Unit tests executed: `npm run test:unit`
- [ ] Unit tests passed: [X/X tests]
- [ ] E2E tests executed: `npm run test:e2e`
- [ ] E2E tests passed: [X/X tests]
- [ ] Both test types documented in EXEC→PLAN handoff
- [ ] Screenshots captured for E2E test evidence
- [ ] Test results included in handoff "Deliverables Manifest"

**❌ BLOCKING**: Cannot create EXEC→PLAN handoff without BOTH test types passing.

**Common Mistakes** (from SD-EXPORT-001):
- ❌ "Tests exist" ≠ "Tests passed"
- ❌ Running only E2E tests and claiming "all tests passed"
- ❌ Marking SD complete before running any tests
- ❌ Creating handoff without test evidence documentation
- ✅ Run BOTH unit AND E2E tests explicitly
- ✅ Document pass/fail counts in handoff
- ✅ Include screenshots for visual evidence

### Why This Matters
- **SD-EXPORT-001**: 30-minute gap between marking "complete" and discovering tests weren't run
- **SD-EVA-MEETING-002**: 67% E2E failure rate revealed only when tests finally executed
- **Impact**: Testing enforcement prevents claiming "done" without proof

## E2E Testing: Dev Mode vs Preview Mode

**E2E Testing Mode**: Default to dev mode (port 5173) for reliable tests.

**Issue**: Preview mode (4173) may have rendering problems
**Solution**: Use dev mode for tests, preview only for production validation
```typescript
baseURL: 'http://localhost:5173'  // Dev mode
```

**Full Guide**: See `docs/reference/e2e-testing-modes.md`

## Playwright MCP Integration

## 🎭 Playwright MCP Integration

**Status**: ✅ READY (Installed 2025-10-12)

### Overview
Playwright MCP (Model Context Protocol) provides browser automation capabilities for testing, scraping, and UI verification.

### Installed Components
- **Chrome**: Google Chrome browser for MCP operations
- **Chromium**: Chromium 141.0.7390.37 (build 1194) for standard Playwright tests
- **Chromium Headless Shell**: Headless browser for CI/CD pipelines
- **System Dependencies**: All required Linux libraries installed

### Available MCP Tools

#### Navigation
- `mcp__playwright__browser_navigate` - Navigate to URL
- `mcp__playwright__browser_navigate_back` - Go back to previous page

#### Interaction
- `mcp__playwright__browser_click` - Click elements
- `mcp__playwright__browser_fill` - Fill form fields
- `mcp__playwright__browser_select` - Select dropdown options
- `mcp__playwright__browser_hover` - Hover over elements
- `mcp__playwright__browser_type` - Type text into elements

#### Verification
- `mcp__playwright__browser_snapshot` - Capture accessibility snapshot
- `mcp__playwright__browser_take_screenshot` - Take screenshots
- `mcp__playwright__browser_evaluate` - Execute JavaScript

#### Management
- `mcp__playwright__browser_close` - Close browser
- `mcp__playwright__browser_tabs` - Manage tabs

### Testing Integration

**When to Use Playwright MCP**:
1. ✅ Visual regression testing
2. ✅ UI component verification
3. ✅ Screenshot capture for evidence
4. ✅ Accessibility tree validation
5. ✅ Cross-browser testing

**When to Use Standard Playwright**:
1. ✅ E2E test suites (`npm run test:e2e`)
2. ✅ CI/CD pipeline tests
3. ✅ Automated test runs
4. ✅ User story validation

### Usage Example

```javascript
// Using Playwright MCP for visual verification
await mcp__playwright__browser_navigate({ url: 'http://localhost:3000/dashboard' });
await mcp__playwright__browser_snapshot(); // Get accessibility tree
await mcp__playwright__browser_take_screenshot({ name: 'dashboard-state' });
await mcp__playwright__browser_click({ element: 'Submit button', ref: 'e5' });
```

### QA Director Integration

The QA Engineering Director sub-agent now has access to:
- Playwright MCP for visual testing
- Standard Playwright for E2E automation
- Both Chrome (MCP) and Chromium (tests) browsers

**Complete Guide**: See `docs/reference/playwright-mcp-guide.md`

## Edge Case Testing Checklist

When implementing tests, ensure coverage for:

### Input Validation Edge Cases
- [ ] Empty strings, null values, undefined
- [ ] Maximum length inputs (overflow testing)
- [ ] Special characters (SQL injection, XSS vectors)
- [ ] Unicode and emoji inputs
- [ ] Whitespace-only inputs

### Boundary Conditions
- [ ] Zero, negative, and maximum numeric values
- [ ] Array min/max lengths (empty, single item, very large)
- [ ] Date boundaries (leap years, timezone edge cases)

### Concurrent Operations
- [ ] Race conditions (simultaneous updates)
- [ ] Database transaction rollbacks
- [ ] Cache invalidation timing

### Error Scenarios
- [ ] Network failures (timeout, disconnect)
- [ ] Database connection errors
- [ ] Invalid authentication tokens
- [ ] Permission denied scenarios

### State Transitions
- [ ] Idempotency (repeated operations)
- [ ] State rollback on error
- [ ] Partial success scenarios

---

*Generated from database: 2025-11-26*
*Protocol Version: v4.2.0_story_gates*
*Load when: User mentions EXEC, implementation, coding, or testing*
