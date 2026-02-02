<!-- DIGEST FILE - Enforcement-focused protocol content -->
<!-- generated_at: 2026-02-02T20:48:09.113Z -->
<!-- git_commit: 0451d647 -->
<!-- db_snapshot_hash: af69a0c7f9ed4e29 -->
<!-- file_content_hash: pending -->

# CLAUDE_EXEC_DIGEST.md - EXEC Phase (Enforcement)

**Protocol**: LEO 4.3.3
**Purpose**: Implementation requirements and constraints (<5k chars)

---

## 🚫 MANDATORY: Phase Transition Commands (BLOCKING)

**Anti-Bypass Protocol**: These commands MUST be run for ALL phase transitions. Do NOT use database-agent to create handoffs directly.

### ⛔ NEVER DO THIS:
- Using `database-agent` to directly insert into `sd_phase_handoffs`
- Creating handoff records without running validation scripts
- Skipping preflight knowledge retrieval

### ✅ ALWAYS DO THIS:

#### Pre-flight Batch Validation (RECOMMENDED)
#### LEAD → PLAN Transition
#### PLAN → EXEC Transition
#### EXEC → PLAN Transition (Verification)
#### PLAN → LEAD Transition (Final Approval)
### Emergency Bypass (SD-LEARN-010)
For emergencies ONLY. Bypasses require audit logging and are rate-limited.

**Rate Limits:**
- 3 bypasses per SD maximum
- 10 bypasses per day globally
- All bypasses logged to `audit_log` table with severity=warning

### What These Scripts Enforce
| Script | Validations |
|--------|-------------|
| `phase-preflight.js` | Loads context, patterns, and lessons from database |
| `handoff.js precheck` | **Batch validation** - runs ALL gates, git checks, reports ALL issues at once |
| `handoff.js LEAD-TO-PLAN` | SD completeness (100% required), strategic objectives |
| `handoff.js PLAN-TO-EXEC` | PRD exists (`ERR_NO_PRD`), chain completeness (`ERR_CHAIN_INCOMPLETE`) |
| `handoff.js EXEC-TO-PLAN` | TESTING enforcement (`ERR_TESTING_REQUIRED`), chain completeness |
| `handoff.js PLAN-TO-LEAD` | Traceability, workflow ROI, retrospective quality |

### Error Codes (SD-LEARN-010)
| Code | Meaning | Remediation |
|------|---------|-------------|
| `ERR_TESTING_REQUIRED` | TESTING sub-agent must run before EXEC-TO-PLAN (feature/qa SDs) | Run TESTING sub-agent first |
| `ERR_CHAIN_INCOMPLETE` | Missing prerequisite handoff in chain | Complete missing handoff first |
| `ERR_NO_PRD` | No PRD found for PLAN-TO-EXEC | Create PRD before proceeding |

### Compliance Marker
Valid handoffs are recorded with `created_by: 'UNIFIED-HANDOFF-SYSTEM'`. Handoffs with other `created_by` values indicate process bypass.

### Check Compliance
**FAILURE TO RUN THESE COMMANDS = LEO PROTOCOL VIOLATION**

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

## Migration Execution - DATABASE Sub-Agent Delegation

### CRITICAL: Delegate Migration Execution to DATABASE Sub-Agent

**CRITICAL**: When you need to execute a migration, INVOKE the DATABASE sub-agent rather than writing execution scripts yourself.

The DATABASE sub-agent handles common blockers automatically:
- **Missing SUPABASE_DB_PASSWORD**: Uses `SUPABASE_POOLER_URL` instead (no password required)
- **Connection issues**: Uses proven connection patterns
- **Execution failures**: Tries alternative scripts before giving up

**Never give up on migration execution** - the sub-agent has multiple fallback methods.

**Trigger the DATABASE sub-agent when you need to**:
- Apply a migration file to the database
- Execute schema changes
- Run SQL statements against Supabase

**Invocation pattern**:
```
Task tool with subagent_type="database-agent":
"Execute the migration file: database/migrations/YYYYMMDD_name.sql"
```

The DATABASE sub-agent (v1.3.0+) has autonomous execution capability and will:
1. Determine if operation is safe (AUTO-EXECUTE) or needs routing
2. Use the correct connection pattern (SUPABASE_POOLER_URL - no password needed)
3. Split and execute SQL statements properly
4. Verify success and report results

**Only write your own migration script if**:
- DATABASE sub-agent is unavailable
- You need custom pre/post processing logic
- The migration has special transaction requirements

The next section ("Migration Script Pattern") provides the FALLBACK pattern if sub-agent is unavailable.

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

*DIGEST generated: 2026-02-02 3:48:09 PM*
*Protocol: 4.3.3*
