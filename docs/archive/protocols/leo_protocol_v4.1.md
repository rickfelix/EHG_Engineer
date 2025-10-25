# LEO Protocol v4.1 - Complete Implementation Guide with Verification Cycles

**Version**: 4.1  
**Status**: ⚠️  SUPERSEDED BY LEO Protocol v4.1.2_database_first
**Superseded Date**: 2025-01-02
**Date**: 2025-09-01  
**Previous Version**: 4.0.0  
**Change Log**: Added verification cycles, EXEC→PLAN→LEAD handback process

---
## ⚠️  DEPRECATION NOTICE

**This version has been superseded by LEO Protocol v4.1.2.**
**Current active version**: `docs/03_protocols_and_standards/leo_protocol_v4.1.2_database_first.md`

---

## Executive Summary

LEO Protocol v4.1 addresses critical gaps in v4.0 by introducing proper verification cycles where EXEC hands back to PLAN for acceptance testing, and PLAN hands back to LEAD for strategic approval. This creates a complete quality assurance loop ensuring both technical and strategic objectives are met.

### Key Improvements from v4.0
- **Verification Cycles**: EXEC→PLAN→LEAD handback process
- **Acceptance Testing**: PLAN verifies EXEC's implementation
- **Strategic Approval**: LEAD confirms strategic objectives met
- **Failure Handling**: Rework cycles for failed verifications
- **Complete Workflow**: Full cycle from planning to deployment

---

## Valid Status Values for Database Documents

### Strategic Directive (SD) Status Values
```yaml
Valid SD Statuses (ALL VERIFIED):
  - draft       # Initial creation, not yet ready
  - active      # Approved and in progress (PREFERRED)
  - in_progress # Alternative to active
  - on_hold     # Temporarily paused
  - completed   # Successfully completed
  - complete    # Alternative to completed
  - approved    # Approved by LEAD
  - cancelled   # Cancelled before completion
  - archived    # Completed and archived (PREFERRED for done)
  
# RECOMMENDED Usage:
  - Use 'active' for SDs being worked on
  - Use 'archived' for completed SDs
  - Avoid 'in_progress' and 'complete' for consistency
```

### Product Requirements Document (PRD) Status Values
```yaml
Valid PRD Statuses (ALL VERIFIED):
  - draft       # Initial creation
  - planning    # PLAN agent working
  - ready       # Ready for EXEC
  - in_progress # EXEC implementing (PREFERRED)
  - testing     # PLAN verification phase
  - approved    # LEAD approved (PREFERRED terminal state)
  - completed   # Successfully completed
  - complete    # Alternative to completed
  - rejected    # Failed verification
  - on_hold     # Paused
  - cancelled   # Cancelled
  
# RECOMMENDED Usage:
  - Use 'planning' when PLAN is working
  - Use 'in_progress' when EXEC is implementing
  - Use 'testing' during verification
  - Use 'approved' as final success state
  - Avoid 'complete/completed' - use 'approved' instead
```

### Execution Sequence (EES) Status Values
```yaml
Valid EES Statuses (ALL VERIFIED):
  - pending     # Not yet started
  - in_progress # Currently executing
  - completed   # Successfully completed (PREFERRED)
  - failed      # Failed execution
  - blocked     # Blocked by dependency
  - skipped     # Skipped (not needed)
  - cancelled   # Cancelled (also valid)
  
# RECOMMENDED Usage:
  - Use 'pending' for unstarted sequences
  - Use 'in_progress' for active work
  - Use 'completed' for successful completion
  - Use 'failed' for errors requiring attention
```

---

## Core Architecture

### Complete Agent Workflow Cycle
```
LEAD Agent (Strategic Planning)
    ↓ [Handoff Control Point]
PLAN Agent (Technical Planning)
    ↓ [Handoff Control Point]
EXEC Agent (Implementation)
    ↓ [Handback Control Point]
PLAN Agent (Acceptance Testing) ← NEW
    ↓ [Approval Control Point]
LEAD Agent (Strategic Approval) ← NEW
    ↓
DEPLOYMENT
```

### Progress Weighting (NEW)
```yaml
Phase Weights:
  LEAD Planning: 20%        # Initial strategic planning
  PLAN Design: 20%          # Technical planning & PRD
  EXEC Implementation: 30%  # Development work
  PLAN Verification: 15%    # Acceptance testing
  LEAD Approval: 15%        # Strategic validation
  Total: 100%
```

---

## Agent Specifications

### LEAD Agent
**Phase 1: Strategic Planning (20%)**
- Create Strategic Directive
- Define success criteria
- Set business objectives
- Complete LEAD Planning Checklist

**Phase 5: Strategic Approval (15%)** ← NEW
- Review PLAN's verification report
- Confirm strategic objectives met
- Validate business value delivered
- Authorize production deployment
- Complete LEAD Approval Checklist

**LEAD Planning Checklist** (9/9 required):
- [ ] SD created and saved
- [ ] Business objectives defined
- [ ] Success metrics measurable
- [ ] Constraints documented
- [ ] Risks identified
- [ ] Feasibility confirmed
- [ ] Environment health checked
- [ ] Context usage < 30%
- [ ] Summary created (500 tokens)

**LEAD Approval Checklist** (7/7 required) ← NEW:
- [ ] PLAN verification report reviewed
- [ ] Strategic objectives validated
- [ ] Business value confirmed
- [ ] Success metrics achieved
- [ ] Risk mitigation verified
- [ ] Deployment authorized
- [ ] Stakeholders notified

### PLAN Agent
**Phase 2: Technical Planning (20%)**
- Create PRD from SD
- Define technical approach
- Set acceptance criteria
- Complete PLAN Design Checklist

**Phase 4: Acceptance Testing (15%)** ← NEW
- Review EXEC's implementation
- Run acceptance tests
- Verify all criteria met
- Document findings
- Complete PLAN Verification Checklist

**PLAN Design Checklist** (9/9 required):
- [ ] PRD created and saved
- [ ] SD requirements mapped
- [ ] Technical specs complete
- [ ] Prerequisites verified
- [ ] Test requirements defined
- [ ] Acceptance criteria clear
- [ ] Risk mitigation planned
- [ ] Context usage < 40%
- [ ] Summary created (500 tokens)

**PLAN Verification Checklist** (8/8 required) ← NEW:
- [ ] Code review completed
- [ ] Acceptance tests passed
- [ ] PRD requirements verified
- [ ] Performance benchmarks met
- [ ] Security review passed
- [ ] Documentation reviewed
- [ ] Recommendation prepared
- [ ] Verification report created

### EXEC Agent
**Phase 3: Implementation (30%)**
- Implement PRD requirements
- Activate sub-agents as needed
- Complete development
- Prepare for handback
- Complete EXEC Implementation Checklist

**EXEC Implementation Checklist** (9/9 required):
- [ ] PRD requirements met
- [ ] Tests passing
- [ ] Lint checks passing
- [ ] Type checks passing
- [ ] Build successful
- [ ] CI/CD green
- [ ] Documentation updated
- [ ] Context usage < 60%
- [ ] Summary created (500 tokens)

**EXEC Handback Checklist** (6/6 required) ← NEW:
- [ ] All implementation complete
- [ ] Test suite executable
- [ ] Documentation accessible
- [ ] Known issues documented
- [ ] Deployment guide created
- [ ] Ready for PLAN review

---

## Handoff & Handback Control System

### Forward Handoffs (Planning → Implementation)
```
LEAD → PLAN: Strategic to Technical
PLAN → EXEC: Technical to Implementation
```

### Reverse Handbacks (Verification) ← NEW
```
EXEC → PLAN: Implementation to Acceptance
PLAN → LEAD: Verification to Approval
```

### Verification Failure Handling ← NEW

#### If PLAN Rejects EXEC's Work:
```markdown
1. PLAN documents rejection reasons
2. EXEC receives specific feedback
3. EXEC implements corrections
4. EXEC resubmits for verification
5. Cycle repeats until acceptance
```

#### If LEAD Rejects Final Delivery:
```markdown
1. LEAD documents strategic gaps
2. Returns to appropriate agent:
   - To PLAN if requirements wrong
   - To EXEC if implementation wrong
3. Corrections implemented
4. Full verification cycle repeats
```

---

## Complete Workflow Example

### Success Path
```markdown
1. LEAD creates SD (20% complete)
   ↓
2. PLAN creates PRD (40% complete)
   ↓
3. EXEC implements (70% complete)
   ↓
4. PLAN verifies ✅ (85% complete)
   ↓
5. LEAD approves ✅ (100% complete)
   ↓
6. DEPLOYMENT
```

### Failure & Rework Path
```markdown
1. LEAD creates SD (20%)
   ↓
2. PLAN creates PRD (40%)
   ↓
3. EXEC implements (70%)
   ↓
4. PLAN verifies ❌ (remains 70%)
   ↓
5. EXEC fixes issues (70%)
   ↓
6. PLAN verifies ✅ (85%)
   ↓
7. LEAD approves ✅ (100%)
   ↓
8. DEPLOYMENT
```

---

## Progress Calculation Formula

```javascript
function calculateProgress() {
  let progress = 0;
  
  // Phase 1: LEAD Planning
  if (leadPlanningComplete) progress += 20;
  
  // Phase 2: PLAN Design
  if (planDesignComplete) progress += 20;
  
  // Phase 3: EXEC Implementation
  if (execImplementationComplete) progress += 30;
  
  // Phase 4: PLAN Verification
  if (planVerificationComplete) progress += 15;
  
  // Phase 5: LEAD Approval
  if (leadApprovalComplete) progress += 15;
  
  return progress; // 0-100%
}
```

---

## Quality Gates

### Handoff Gates (Forward)
1. Checklist validation (9/9 items)
2. Context check (<threshold)
3. Boundary compliance
4. Summary generation
5. Archive completion

### Handback Gates (Reverse) ← NEW
1. Implementation complete
2. Tests executable
3. Documentation ready
4. Issues documented
5. Verification prepared

---

## Status Transition Rules

### SD Status Transitions
```yaml
State Machine:
  draft:
    - can_transition_to: [active, cancelled]
    - triggered_by: LEAD approval or cancellation
  
  active:
    - can_transition_to: [on_hold, cancelled, archived]
    - triggered_by: LEAD decision or completion
  
  on_hold:
    - can_transition_to: [active, cancelled]
    - triggered_by: LEAD resumption or cancellation
  
  cancelled:
    - can_transition_to: [] # Terminal state
    - triggered_by: N/A
  
  archived:
    - can_transition_to: [] # Terminal state
    - triggered_by: N/A
```

### PRD Status Transitions
```yaml
State Machine:
  draft:
    - can_transition_to: [planning, cancelled]
    - triggered_by: PLAN begins work
  
  planning:
    - can_transition_to: [ready, on_hold, cancelled]
    - triggered_by: PLAN completion
  
  ready:
    - can_transition_to: [in_progress, on_hold, cancelled]
    - triggered_by: EXEC acceptance
  
  in_progress:
    - can_transition_to: [testing, on_hold, cancelled]
    - triggered_by: EXEC completion
  
  testing:
    - can_transition_to: [approved, rejected, on_hold]
    - triggered_by: PLAN verification
  
  approved:
    - can_transition_to: [] # Terminal state
    - triggered_by: LEAD approval
  
  rejected:
    - can_transition_to: [in_progress, cancelled]
    - triggered_by: EXEC rework or cancellation
```

### EES Status Transitions
```yaml
State Machine:
  pending:
    - can_transition_to: [in_progress, blocked, skipped]
    - triggered_by: EXEC starts or dependency check
  
  in_progress:
    - can_transition_to: [completed, failed, blocked]
    - triggered_by: EXEC completion or issue
  
  completed:
    - can_transition_to: [] # Terminal state
    - triggered_by: N/A
  
  failed:
    - can_transition_to: [pending, skipped]
    - triggered_by: Retry decision
  
  blocked:
    - can_transition_to: [pending, skipped]
    - triggered_by: Dependency resolution
  
  skipped:
    - can_transition_to: [] # Terminal state
    - triggered_by: N/A
```

### Agent Responsibilities for Status Updates

**LEAD Agent**:
- MUST set SD status to 'active' when approving SD
- MUST set SD status to 'archived' when PRD is approved
- SHOULD use 'active' over 'in_progress' for consistency
- SHOULD use 'archived' over 'completed/complete' for finished SDs

**PLAN Agent**:
- MUST set PRD status to 'planning' when starting work
- MUST set PRD status to 'ready' when handing to EXEC
- MUST set PRD status to 'testing' when receiving from EXEC
- MUST set PRD status to 'approved' or 'rejected' after testing
- SHOULD NOT use 'completed/complete' - use 'approved' instead

**EXEC Agent**:
- MUST set PRD status to 'in_progress' when accepting work
- MUST set PRD status to 'testing' when handing back to PLAN
- MUST set EES status to 'in_progress' when starting sequence
- MUST set EES status to 'completed' or 'failed' when done
- SHOULD update EES status promptly as work progresses

---

## Sub-Agent Integration

### Mandatory Sub-Agent Activation Criteria ← ENHANCED

Sub-agents MUST be activated when PRD contains:

#### Design Sub-Agent (REQUIRED when):
- UI/UX requirements specified (>3 UI components)
- Accessibility standards mentioned (WCAG compliance)
- Responsive design requirements
- Animation or interaction specifications
- Design system implementation
- **Activation Threshold**: Any 2 of above = MUST activate

#### Security Sub-Agent (REQUIRED when):
- Authentication/authorization implementation
- Handling sensitive data (PII, payments, passwords)
- API security requirements
- Encryption requirements
- OWASP compliance mentioned
- **Activation Threshold**: ANY security mention = MUST activate

#### Performance Sub-Agent (REQUIRED when):
- Specific performance metrics defined (load time <2s)
- Scalability requirements (>1000 users)
- Bundle size constraints
- Memory usage limits
- Real-time processing needs
- **Activation Threshold**: Any metric defined = MUST activate

#### Testing Sub-Agent (REQUIRED when):
- Coverage requirements specified (>80%)
- E2E testing mentioned
- Regression test suite needed
- Performance testing required
- Complex test scenarios (>10 test cases)
- **Activation Threshold**: Coverage >80% OR E2E = MUST activate

#### Database Sub-Agent (REQUIRED when):
- New schema creation
- Migration scripts needed
- Query optimization required
- Index management
- Data integrity constraints
- **Activation Threshold**: ANY database change = MUST activate

### Sub-Agent Activation Decision Tree ← NEW
```
EXEC reads PRD
  ↓
Contains security keywords? → YES → Activate Security Sub-Agent
  ↓ NO
Contains performance metrics? → YES → Activate Performance Sub-Agent
  ↓ NO
Contains UI/UX requirements? → YES → Activate Design Sub-Agent
  ↓ NO
Contains database changes? → YES → Activate Database Sub-Agent
  ↓ NO
Contains test requirements? → YES → Activate Testing Sub-Agent
  ↓ NO
Proceed with standard EXEC implementation
```

### Sub-Agent Verification Process
1. Sub-agent completes specialized work
2. Sub-agent creates verification report
3. EXEC validates sub-agent work
4. EXEC integrates into main deliverable
5. Included in PLAN's verification

### Sub-Agent Handoff Requirements ← NEW
Each sub-agent must provide:
- [ ] Completion report
- [ ] Test results specific to domain
- [ ] Performance metrics
- [ ] Known limitations
- [ ] Integration instructions

---

## Context Management Updates

### Token Budget with Verification Cycles
```yaml
Total Context: 200,000 tokens
Safety Margin: 20,000 tokens
Usable Context: 180,000 tokens

Phase Allocations:
  LEAD Planning: 30,000 (16%)
  PLAN Design: 40,000 (22%)
  EXEC Implementation: 60,000 (33%)
  PLAN Verification: 30,000 (16%)
  LEAD Approval: 20,000 (11%)
```

---

## Handoff Communication Standards ← NEW

### Mandatory Handoff Package Structure

Every handoff MUST include these 7 elements:

#### 1. Executive Summary (100-200 tokens)
```markdown
HANDOFF SUMMARY
From: [Agent Name]
To: [Agent Name]
Date: [ISO Date]
Phase: [Current Phase]
Status: [Complete/Partial/Blocked]
Key Achievement: [One sentence]
Next Action Required: [One sentence]
```

#### 2. Completeness Report
```markdown
COMPLETION STATUS
Total Requirements: [N]
Completed: [N]
Partial: [N]
Blocked: [N]
Completion Rate: [%]

Checklist Status: [X/9 items complete]
```

#### 3. Deliverables Manifest
```markdown
DELIVERABLES
Primary:
- [Deliverable 1]: [path/location]
- [Deliverable 2]: [path/location]

Supporting Documents:
- [Document 1]: [path/location]
- [Document 2]: [path/location]

Test Artifacts:
- [Test Results]: [path/location]
- [Coverage Report]: [path/location]
```

#### 4. Key Decisions & Rationale
```markdown
KEY DECISIONS MADE
1. Decision: [What was decided]
   Rationale: [Why]
   Impact: [Consequences]

2. Decision: [What was decided]
   Rationale: [Why]
   Impact: [Consequences]
```

#### 5. Known Issues & Risks
```markdown
KNOWN ISSUES
Critical: [Count]
- Issue: [Description]
  Workaround: [If any]
  Owner: [Who should fix]

Warnings: [Count]
- Warning: [Description]
  Mitigation: [Approach]

RISKS FORWARD
- Risk: [Description]
  Probability: [High/Medium/Low]
  Impact: [High/Medium/Low]
  Mitigation: [Recommended action]
```

#### 6. Resource Utilization
```markdown
RESOURCE USAGE
Context Tokens Used: [N] ([%] of limit)
Compute Time: [Duration]
External Services: [List]
Dependencies Added: [List]
```

#### 7. Handoff Requirements
```markdown
ACTION REQUIRED BY [RECEIVING AGENT]
Immediate:
1. [Specific action with deadline]
2. [Specific action with deadline]

Review Required:
1. [Item needing review]
2. [Item needing review]

Decisions Needed:
1. [Decision required]
2. [Decision required]
```

### Handoff Communication Templates

#### LEAD → PLAN Handoff Template
```markdown
STRATEGIC HANDOFF TO TECHNICAL PLANNING

From: LEAD Agent
To: PLAN Agent
Re: [SD-ID]

STRATEGIC CONTEXT
Business Objective: [Clear statement]
Success Criteria: [Measurable outcomes]
Constraints: [Budget/Time/Technical]
Priority: [High/Medium/Low]

TECHNICAL REQUIREMENTS
Must Have: [Core requirements]
Should Have: [Desired features]
Could Have: [Nice to have]
Won't Have: [Out of scope]

PLAN AGENT ACTION ITEMS
1. Create PRD with technical specifications
2. Define acceptance criteria
3. Identify technical risks
4. Propose architecture
5. Estimate effort
```

#### PLAN → EXEC Handoff Template
```markdown
TECHNICAL HANDOFF TO IMPLEMENTATION

From: PLAN Agent
To: EXEC Agent
Re: [PRD-ID]

IMPLEMENTATION REQUIREMENTS
Architecture: [Approach]
Technology Stack: [Languages/Frameworks]
Dependencies: [External libraries]
Performance Targets: [Metrics]

ACCEPTANCE CRITERIA
Functional:
- [ ] Criteria 1
- [ ] Criteria 2

Non-Functional:
- [ ] Performance metric
- [ ] Security requirement

EXEC AGENT ACTION ITEMS
1. Implement core functionality
2. Create test suite (>80% coverage)
3. Document code
4. Prepare deployment guide
5. Activate sub-agents as needed
```

#### EXEC → PLAN Handback Template
```markdown
IMPLEMENTATION HANDBACK FOR VERIFICATION

From: EXEC Agent
To: PLAN Agent
Re: [PRD-ID] Implementation

IMPLEMENTATION COMPLETE
Core Features: [% Complete]
Tests Written: [Count]
Coverage: [%]
Documentation: [Complete/Partial]

VERIFICATION PACKAGE
Code Location: [Repository/Branch]
Test Command: [How to run tests]
Build Command: [How to build]
Deploy Guide: [Path to guide]

KNOWN DEVIATIONS
1. Deviation: [What differs from PRD]
   Reason: [Why changed]
   Impact: [Effect on requirements]

PLAN VERIFICATION REQUESTED
1. Run acceptance tests
2. Verify PRD requirements met
3. Review code quality
4. Validate performance metrics
5. Provide recommendation to LEAD
```

#### PLAN → LEAD Recommendation Template
```markdown
VERIFICATION COMPLETE - STRATEGIC APPROVAL REQUESTED

From: PLAN Agent
To: LEAD Agent
Re: [SD-ID] Verification Results

VERIFICATION SUMMARY
Technical Requirements: [PASS/FAIL]
Acceptance Tests: [X/Y Passing]
Performance Metrics: [MET/NOT MET]
Quality Standards: [MET/NOT MET]

STRATEGIC ALIGNMENT
Business Objectives: [Achieved/Partial/Failed]
Success Criteria: [Met/Unmet]
Value Delivered: [Description]
ROI Justification: [Analysis]

RECOMMENDATION
[ ] APPROVE for production deployment
[ ] APPROVE with conditions: [List]
[ ] REJECT - Requires rework: [Specify]

LEAD APPROVAL REQUESTED
1. Review strategic alignment
2. Validate business value
3. Authorize deployment
4. Notify stakeholders
```

### Handoff Validation & Rejection Protocol ← NEW

#### Automatic Handoff Validation
Upon receiving a handoff, agents MUST:

1. **Validate Format Compliance**
```markdown
CHECK: All 7 mandatory elements present?
→ NO: REJECT - "Missing required elements: [list]"

CHECK: Executive summary ≤ 200 tokens?
→ NO: REJECT - "Executive summary exceeds token limit"

CHECK: All deliverables accessible?
→ NO: REJECT - "Cannot access deliverables: [list]"

CHECK: Checklist status documented?
→ NO: REJECT - "Checklist completion status missing"
```

2. **Rejection Response Template**
```markdown
HANDOFF REJECTED - RESUBMISSION REQUIRED

From: [Receiving Agent]
To: [Sending Agent]
Date: [ISO Date]
Rejection ID: [REJ-YYYY-MM-DD-XXX]

REJECTION REASON
Primary Issue: [Format Non-Compliance/Missing Elements/Incomplete Work]

SPECIFIC DEFICIENCIES
Format Issues:
□ Missing executive summary
□ Missing completeness report
□ Missing deliverables manifest
□ Missing key decisions
□ Missing known issues
□ Missing resource usage
□ Missing action items

Content Issues:
□ Incomplete checklist (X/9 complete)
□ Deliverables not accessible
□ Requirements not mapped
□ No test results provided
□ Documentation missing

RESUBMISSION REQUIREMENTS
1. Address all deficiencies listed above
2. Use proper handoff template
3. Ensure all deliverables are accessible
4. Complete mandatory checklist items
5. Resubmit within [timeframe]

STATUS: Handoff Blocked - Work cannot proceed
```

3. **Handoff Acceptance Criteria**
```yaml
Acceptance Requirements:
  format_complete: All 7 elements present
  checklist_complete: 9/9 items checked
  deliverables_accessible: All paths valid
  token_limits_met: Summary ≤ 200 tokens
  dependencies_documented: All listed
  
Auto-Accept: ALL requirements met
Auto-Reject: ANY requirement failed
Human-Review: Edge cases only
```

4. **Escalation for Repeated Rejections**
```markdown
After 2 rejections:
→ Escalate to human supervisor
→ Document pattern of issues
→ Require remedial training
→ Consider agent replacement
```

## Inter-Agent Communication Protocol ← ENHANCED

### Required Communication Points

#### Questions & Clarifications
When an agent needs clarification:
```markdown
1. Document the ambiguity
2. Specify what decision is blocked
3. Propose 2-3 possible interpretations
4. Request specific guidance
5. Document the response
```

#### Blocker Notifications
When work is blocked:
```markdown
BLOCKER NOTIFICATION:
- Blocking Agent: [who is blocked]
- Blocker Type: [technical/requirement/resource]
- Required From: [which agent/human]
- Impact: [what can't proceed]
- Workaround: [if any exists]
```

#### Progress Updates
Mandatory progress communications:
- At 25% completion within phase
- At 50% completion within phase
- At 75% completion within phase
- When ready for handoff/handback

---

## Exception Process Updates

### Verification Exceptions ← NEW
When verification repeatedly fails:
```yaml
exception_request:
  phase: [PLAN_VERIFICATION or LEAD_APPROVAL]
  failure_count: [number of attempts]
  blocker: [specific issues]
  recommendation: [path forward]
  
human_intervention:
  decision: [override/escalate/terminate]
  conditions: [if override]
```

---

## Success Metrics

### Updated Target Performance
| Metric | Target | Notes |
|--------|--------|-------|
| First-pass Verification | > 80% | PLAN accepts EXEC work |
| Strategic Approval Rate | > 90% | LEAD approves delivery |
| Rework Cycles | < 2 | Average iterations |
| Total Cycle Time | < 10 days | Planning to deployment |

---

## Migration from v4.0

### Breaking Changes
1. EXEC must handback to PLAN (not direct to deploy)
2. PLAN must verify before LEAD approval
3. LEAD must approve before deployment
4. Progress calculation uses 5 phases not 3

### Migration Steps
1. Update progress calculations
2. Add verification checklists
3. Implement handback process
4. Train on new workflow
5. Update dashboards

---

## Best Practices

### DO's
✅ Always complete verification cycles
✅ Document rejection reasons clearly
✅ Test before handback
✅ Maintain verification evidence
✅ Follow complete workflow

### DON'Ts
❌ Skip verification phases
❌ Deploy without LEAD approval
❌ Bypass PLAN acceptance testing
❌ Ignore verification failures
❌ Rush handbacks

---

## Conclusion

LEO Protocol v4.1 provides a complete, cyclic workflow ensuring both technical excellence and strategic alignment through proper verification cycles. The addition of EXEC→PLAN→LEAD handback process creates accountability and quality assurance at every level.

---

*LEO Protocol v4.1 - Complete Cycles, Total Quality*
*For support: Create issue in EHG_Engineer repository*