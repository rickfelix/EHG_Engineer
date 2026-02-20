<!-- DIGEST FILE - Enforcement-focused protocol content -->
<!-- generated_at: 2026-02-20T21:50:55.269Z -->
<!-- git_commit: b4930caf -->
<!-- db_snapshot_hash: 1787835840a9ee3a -->
<!-- file_content_hash: pending -->

# CLAUDE_EXEC_DIGEST.md - EXEC Phase (Enforcement)

**Protocol**: LEO 4.3.3
**Purpose**: Implementation requirements and constraints (<5k chars)

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

0.5. **PRD INTEGRATION SECTION CHECK** 📋 CRITICAL
   - Read PRD `integration_operationalization` section BEFORE coding
   - Extract and document:
     - **Consumers**: Who/what uses this feature? What breaks if it fails?
     - **Dependencies**: Upstream systems to call, downstream systems that call us
     - **Failure modes**: How to handle when each dependency fails (error handling)
     - **Data contracts**: Schema changes, API shapes to implement
     - **Runtime config**: Env vars to add, feature flags to configure
     - **Observability**: Metrics to track, rollout/rollback plan
   - If section is missing: Flag to PLAN for remediation before EXEC proceeds
   - Document: "Integration context reviewed: [X consumers, Y dependencies, Z metrics]"

1. **APPLICATION CHECK** ⚠️ CRITICAL
   - **ALL UI changes** (user AND admin) go to `/mnt/c/_EHG/EHG/`
   - **User features**: `/mnt/c/_EHG/EHG/src/components/` and `/src/pages/`
   - **Admin features**: `/mnt/c/_EHG/EHG/src/components/admin/` and `/src/pages/admin/`
   - **Stage components**: `/mnt/c/_EHG/EHG/src/components/stages/admin/`
   - **Backend API only**: `/mnt/c/_EHG/EHG_Engineer/` (routes, scripts, no UI)
   - Verify: `cd /mnt/c/_EHG/EHG && pwd`
   - Check GitHub: `git remote -v` should show `rickfelix/ehg.git` for frontend

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
   - Confirm port number matches PRD (8080 for frontend, 3000 for backend API)
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
- [ ] **Application verified**: [EHG unified frontend confirmed]
- [ ] **Feature type**: [User /src/ | Admin /src/components/admin/ | Backend API EHG_Engineer]
- [ ] **URL verified**: [exact URL from PRD]
- [ ] **Page accessible**: [YES/NO]
- [ ] **Component identified**: [path/to/component]
- [ ] **Port confirmed**: [8080 frontend | 3000 backend API]
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
- ❌ **CRITICAL**: Putting admin UI code in EHG_Engineer (all UI goes to EHG)

### Gate 0 Enforcement 🚨

**CRITICAL**: Before ANY implementation work, verify SD has passed LEAD approval:

**Valid Phases for Implementation**:
- PLANNING, PLAN_PRD, PLAN, PLAN_VERIFICATION (PRD creation)
- EXEC (implementation authorized)

**Blocked Phases**:
- draft - SD not approved
- LEAD_APPROVAL - Awaiting LEAD approval

**Why This Matters**: Gate 0 prevents the anti-pattern where code is shipped while SDs remain in draft status. This is the "naming illusion" - using LEO terminology while bypassing LEO workflow.

**Enforcement Layers**:
1. Pre-commit hook (blocks commits for draft SDs)
2. CLAUDE_EXEC.md (mandatory Phase 1 check)
3. LOC threshold (>500 LOC requires SD)
4. verify-sd-phase.js script
5. GitHub Action (PR validation)
6. Orchestrator progress calculation

See: `docs/03_protocols_and_standards/gate0-workflow-entry-enforcement.md` for complete documentation.

**If SD is in draft**: STOP. Do not implement. Run LEAD-TO-PLAN handoff first.

## ❌ Anti-Patterns from Retrospectives (EXEC Phase)

**Source**: Analysis of 175 high-quality retrospectives (score ≥60)

These patterns have caused significant time waste. **AVOID them.**

### 1. Manual Test Creation (2-3 hours waste per SD)
**Pattern**: Writing tests manually instead of delegating to testing-agent

**Evidence**: SD-VENTURE-UNIFICATION-001
> "Manual test creation wasted 2-3 hours instead of delegating to testing-agent"

**Fix**: Always use Task tool with `subagent_type: "testing-agent"`
```
Task(subagent_type="testing-agent", prompt="Create E2E tests for [feature] based on PRD acceptance criteria")
```

---

### 2. Skipping Knowledge Retrieval (4-6 hours rework)
**Pattern**: Starting implementation without querying retrospectives/patterns

**Evidence**: SD-VENTURE-UNIFICATION-001
> "Zero consultation of retrospectives before implementation (research_confidence_score = 0.00)"

**Fix**: Run before EXEC starts:
If `research_confidence_score = 0.00`, you skipped this step.

---

### 3. Workarounds Before Root Cause (2-3x time multiplier)
**Pattern**: Working around issues instead of fixing root causes

**Evidence**: SD-2025-1020-E2E-SELECTORS (Score: 100)
> "Time spent on workarounds >> time to follow protocol"
> "Multiple workarounds instead of fixing root causes"

**Fix**: Before implementing a workaround, ask:
- [ ] Have I identified the root cause?
- [ ] Is this a fix or a workaround?
- [ ] What is the time multiplier? (typical: 2-3x)

---

### 4. Accepting Environmental Blockers Without Debug
**Pattern**: Accepting "it's environmental" without investigation

**Evidence**: SD-VENTURE-UNIFICATION-001
> "Environmental issues treated as blockers rather than investigation opportunities"

**Fix**: 5-step minimum debug before accepting as environmental:
1. Check logs for specific error
2. Verify credentials/tokens
3. Test in isolation (curl, manual browser)
4. Check network/ports
5. Compare with known working state

---

### 5. Manual Sub-Agent Simulation (15% quality delta)
**Pattern**: Manually creating sub-agent results instead of executing tools

**Evidence**: SD-RECONNECT-014 (Score: 90)
> "Manual: 75% confidence. Tool: 60% confidence (-15% delta)"
> "Manual sub-agent simulation is an anti-pattern"

**Fix**: Sub-agent results MUST have:
- `tool_executed: true`
- Actual execution timestamp
- Real output (not simulated)

---

### Quick Reference

| Anti-Pattern | Time Cost | Fix |
|--------------|-----------|-----|
| Manual test creation | 2-3 hours | Use testing-agent |
| Skip knowledge retrieval | 4-6 hours | Run automated-knowledge-retrieval.js |
| Workarounds first | 2-3x multiplier | Fix root cause |
| Accept environmental | Hours of idle | 5-step debug minimum |
| Simulate sub-agents | 15% quality loss | Execute actual tools |

**Pattern References**: PAT-RECURSION-001 through PAT-RECURSION-005

## EXEC Phase Negative Constraints

## 🚫 EXEC Phase Negative Constraints

<negative_constraints phase="EXEC">
These anti-patterns are specific to the EXEC phase. Violating them leads to failed tests and rejected handoffs.

### NC-EXEC-001: No Scope Creep
**Anti-Pattern**: Implementing features not in PRD, "improving" unrelated code, adding "nice to have" features
**Why Wrong**: Scope creep derails timelines, introduces untested changes, confuses review
**Correct Approach**: Implement ONLY what's in the PRD. Create new SD for additional work.

### NC-EXEC-002: No Wrong Application Directory
**Anti-Pattern**: Working in EHG_Engineer when target is ehg app (or vice versa)
**Why Wrong**: Changes applied to wrong codebase, tests fail in CI, deployment issues
**Correct Approach**: Verify pwd matches PRD target_application before ANY changes

### NC-EXEC-003: No Tests Without Execution
**Anti-Pattern**: Claiming "tests exist" without actually running them
**Why Wrong**: 30-minute gaps between "complete" and discovering failures (SD-EXPORT-001)
**Correct Approach**: Run BOTH npm run test:unit AND npm run test:e2e, document results

### NC-EXEC-004: No Manual Sub-Agent Simulation
**Anti-Pattern**: Manually creating sub-agent results instead of executing actual tools
**Why Wrong**: 15% quality delta between manual (75%) and tool-executed (60%) confidence
**Correct Approach**: Sub-agent results must have tool_executed: true with real output

### NC-EXEC-005: No UI Without Visibility
**Anti-Pattern**: Backend implementation without corresponding UI to display results
**Why Wrong**: LEO v4.3.3 UI Parity Gate blocks features users can't see
**Correct Approach**: Every backend field must have corresponding UI component
</negative_constraints>

## EXEC Dual Test Requirement

### ⚠️ MANDATORY: Dual Test Execution

**CRITICAL**: "Smoke tests" means BOTH test types, not just one!

**Evidence**: SD-EXPORT-001 - Tests existed but weren't executed. 30-minute gap between "complete" and validation. SD-EVA-MEETING-002 - 67% E2E failure rate when finally run.

Before creating EXEC→PLAN handoff, EXEC MUST run:

#### 1. Unit Tests (Business Logic Validation)
- **What it validates**: Service layer, business logic, data transformations
- **Failure means**: Core functionality is broken
- **Required for**: EXEC→PLAN handoff
- **Framework**: Vitest

#### 2. E2E Tests (UI/Integration Validation)
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

## 🌿 Branch Hygiene Gate (MANDATORY)

## Branch Hygiene Gate (MANDATORY)

**Evidence from Retrospectives**: SD-STAGE4-UX-EDGE-CASES-001 revealed a feature branch with 14 commits, 450 files, and 13 days of divergence became unsalvageable due to accumulated unrelated changes.

### MANDATORY Before PLAN-TO-EXEC Handoff

EXEC MUST verify these branch hygiene requirements BEFORE starting implementation:

### 1. Branch Freshness (≤7 Days Stale)

**Threshold**: Feature branch must be ≤7 days stale at PLAN-TO-EXEC handoff
**Action**: If exceeded, rebase or merge main before proceeding

### 2. Single-SD Branch Rule (No Mixing)

**Rule**: One SD per branch - no mixing unrelated work
**Anti-Pattern**: "Kitchen sink" branches that accumulate work from multiple SDs
**Action**: If multiple SDs detected, create separate branches

### 3. Merge Main at Phase Transitions

**At PLAN-TO-EXEC**:
**Rule**: Sync with main at each phase transition (LEAD→PLAN, PLAN→EXEC, EXEC→PLAN)
**Benefit**: Catches conflicts early, prevents accumulation

### 4. Maximum Branch Lifetime (14 Days)

| Age | Action |
|-----|--------|
| 0-7 days | ✅ Proceed normally |
| 7-10 days | ⚠️ Warning - sync with main |
| 10-14 days | 🔴 Must sync before any handoff |
| >14 days | ❌ Create fresh branch, cherry-pick changes |

### Branch Health Check Script

### Why This Matters

- **Prevents unsalvageable branches**: 13-day divergence = 450 file conflicts
- **Isolates SD work**: One SD per branch = clean merges and rollbacks
- **Catches conflicts early**: Regular syncing = smaller conflict resolution
- **Maintains velocity**: Fresh branches = fast PRs and reviews

### EXEC Agent Action

When starting implementation:
1. Run branch health check
2. If >7 days stale → merge main first
3. If multiple SDs detected → split branches
4. If >100 files changed → assess scope creep
5. Document branch health in handoff notes


---

**On-Demand Full Reference**: If you need detailed examples, procedures, or deep reference material, read `CLAUDE_EXEC.md` using the Read tool.

**Environment Override**: Set `CLAUDE_PROTOCOL_MODE=full` to use FULL files instead of DIGEST for all gates.


---

*DIGEST generated: 2026-02-20 4:50:55 PM*
*Protocol: 4.3.3*
