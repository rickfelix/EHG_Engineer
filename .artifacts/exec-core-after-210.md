### MANDATORY Pre-Implementation Verification

_(procedure: MANUAL § Implementation requirements — ambiguity examples, checklist template, Gate 0 enforcement detail)_
Before writing ANY code, EXEC MUST:

0. **AMBIGUITY RESOLUTION** 🔍 CRITICAL FIRST STEP
   > Why: Ambiguous requirements produce code that solves the wrong problem. Discovering misalignment at EXEC-TO-PLAN costs far more to unwind than a 5-minute clarification upfront.
   - Review PRD for unclear requirements, missing details, or conflicting specifications
   - Do NOT proceed with implementation if ANY ambiguity exists
   - Use 3-tier escalation to resolve:
     1. **Re-read PRD**: Check acceptance_criteria, functional_requirements, test_scenarios
     2. **Query database context**: Check user stories, implementation_context, SD strategic_objectives
     3. **Ask user**: Use AskUserQuestion tool with specific, focused questions
   - Document resolution: "Ambiguity in [area] resolved via [method]: [resolution]"
   - **If still unclear after escalation**: BLOCK implementation and await user clarification

(Common ambiguities to watch for and a worked resolution example: MANUAL.)

0.5. **PRD INTEGRATION SECTION CHECK** 📋 CRITICAL
   > Why: This section defines who consumes the feature, what breaks if it fails, and what observability to wire in. Skipping it produces features that work in isolation but break downstream consumers or ship without rollback paths.
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
   > Why: `EHG_Engineer` is the backend API repo. Committing UI to it means CI runs in the wrong repo, changes never reach the frontend build pipeline, and the feature is invisible to users despite appearing "done."
   - **ALL UI changes** (user AND admin) go to `C:/Users/rickf/Projects/_EHG/ehg/`
   - **User features**: `C:/Users/rickf/Projects/_EHG/ehg/src/components/` and `/src/pages/`
   - **Admin features**: `C:/Users/rickf/Projects/_EHG/ehg/src/components/admin/` and `/src/pages/admin/`
   - **Stage components**: `C:/Users/rickf/Projects/_EHG/ehg/src/components/stages/admin/`
   - **Backend API only**: `C:/Users/rickf/Projects/_EHG/EHG_Engineer/` (routes, scripts, no UI)
   - Verify: `cd C:/Users/rickf/Projects/_EHG/ehg && pwd`
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

The checklist template lives in MANUAL; complete every line of it before writing code.

### Testability-Aware Implementation
> Why: Code that mixes logic and side effects forces the testing-agent to mock everything, producing brittle tests. Testable architecture — pure functions, injectable dependencies, clear seams — lets the testing-agent write unit tests that actually catch regressions.

Before writing code, review the PRD's `test_scenarios` and `testing_strategy` and design your implementation to be testable:

1. **Separate pure logic from side effects** — Extract business rules into pure functions that can be unit tested without mocking infrastructure
2. **Export key functions independently** — Pipeline stages, validators, and transforms should be importable/callable outside their runtime context
3. **Use injectable dependencies** — Database clients, API callers, and config should be parameters, not hardcoded imports, for functions that will need testing
4. **Design clear seams** — When building multi-step workflows, each step should be independently testable with well-defined inputs/outputs
5. **Uniformity audit (verify before EXEC-TO-PLAN)** — if you applied a client-injectable/testability pattern to some of the N functions this SD adds or modifies, enumerate all N and confirm the pattern is applied to EVERY one — especially the SD's own headline/CRITICAL-priority fix. Ask "which functions did NOT get the pattern?" and justify each exception explicitly. Partial application is how a core fix ships untested: in one SD, 3 of 4 new functions followed the pattern and the unpatterned 4th was the headline dedup gate.

Ask yourself: "If the testing-agent had to write tests for this, would the architecture make that easy or painful?"

Skip for: documentation SDs, config-only changes, trivial fixes (<15 LOC)

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

```bash
# Check SD phase status
node scripts/phase-preflight.js SD-XXX-001

# Or check via sd:status
npm run sd:status SD-XXX-001
```

**Valid Phases for Implementation**:
- PLANNING, PLAN_PRD, PLAN, PLAN_VERIFICATION (PRD creation)
- EXEC (implementation authorized)

**Blocked Phases**:
- draft - SD not approved
- LEAD_APPROVAL - Awaiting LEAD approval

Enforcement layers, the naming-illusion rationale and the full documentation pointer: MANUAL.

**If SD is in draft**: STOP. Do not implement. Run LEAD-TO-PLAN handoff first.
