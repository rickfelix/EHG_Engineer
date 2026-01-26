<!-- ARCHIVED: 2026-01-26T16:26:47.719Z
     Reason: Duplicate of canonical file
     Original location: docs\workflow\dossiers\stage-14\07_recursion-blueprint.md
     See: docs/fixes/duplicate-consolidation-manifest.json for details
-->

# Stage 14 Recursion Blueprint


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: testing, sd, directive, handoff

## Recursion Status

**Stage 14 Recursion in Critique**: NO
**Stage 14 Referenced by Other Stages**: YES (Stages 8, 10)
**Proposed Recursion Triggers**: YES (DEV-001)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-14.md:1-72 "No recursion section in critique"

## Inbound Recursion Triggers

**None Defined in Stage 14 Critique**

Stage 14 does NOT have a recursion section in its critique file, meaning it does not currently trigger recursion back to earlier stages. However, this is a gap that should be addressed (see Proposed Triggers below).

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-14.md:1-72 "No recursion triggers defined"

## Outbound Recursion Triggers (From Stage 14 to Earlier Stages)

### Trigger: TECH-001 to Stage 8 (Task Decomposition)

**Condition**: Development preparation reveals complexity issues
**Severity**: HIGH
**Auto-Execute**: Needs approval
**Source**: Stage 8 critique references Stage 14

**Reason**: Development environment setup uncovers technical barriers requiring task restructuring. For example, technical dependencies discovered during infrastructure provisioning may require re-decomposition of tasks.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:39 "Stage 14 | TECH-001 | Development preparation"

**Example Scenarios**:
1. Infrastructure provisioning reveals technology incompatibilities
2. CI/CD pipeline setup exposes architectural constraints
3. Tool integration uncovers unsupported platforms
4. Environment configuration requires different task sequencing

### Trigger: TECH-001 to Stage 10 (Comprehensive Technical Review)

**Condition**: Development preparation uncovers new technical issues
**Severity**: MEDIUM
**Auto-Execute**: Advisory (needs approval for execution)
**Source**: Stage 10 critique references Stage 14

**Reason**: Need updated technical review with environment-specific constraints. Environment setup may reveal technical requirements not captured in original review.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:130 "Stage 14 | TECH-001 | Development preparation"

**Example Scenarios**:
1. Dev environment configuration exposes scalability concerns
2. CI/CD pipeline setup reveals deployment complexity
3. Team onboarding identifies skill gaps requiring architecture changes
4. Sprint planning uncovers technical debt requiring refactoring

## Proposed Recursion Triggers (Not Yet Implemented)

### Proposed Trigger: DEV-001 - Environment Setup Failures

**From Stage**: 14
**To Stage**: 8 (Task Decomposition) or 10 (Technical Review)
**Condition**: Environment setup fails repeatedly or reveals architectural blockers
**Severity**: HIGH
**Auto-Execute**: Needs approval

**Trigger Conditions**:
1. Infrastructure provisioning fails after 3 attempts
2. CI/CD pipeline validation fails critical tests
3. Tool integrations expose platform incompatibilities
4. Infrastructure stability <95% for 3 consecutive days

**Reason**: Environment setup failures often indicate incorrect task decomposition or missing technical requirements. Development cannot proceed until architectural issues are resolved.

**Recursion Behavior**:
- **To Stage 8**: If task sequencing or decomposition is incorrect
- **To Stage 10**: If new technical constraints discovered

**Loop Prevention**:
- Max 2 DEV-001 recursions per venture
- Escalate to Chairman after 2 failed attempts
- Document learnings for future ventures

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-14.md:47-50 "Current: No rollback defined, Required: Clear"

### Proposed Trigger: DEV-002 - Team Assembly Blockers

**From Stage**: 14
**To Stage**: 6 (Resource Planning) or 13 (Exit-Oriented Design)
**Condition**: Unable to recruit required team members or roles undefined
**Severity**: MEDIUM
**Auto-Execute**: Needs approval

**Trigger Conditions**:
1. Critical roles unfilled for >14 days
2. Required skillsets not available in market
3. Budget insufficient for planned team size
4. Team velocity estimate <50% of required capacity

**Reason**: Team assembly failures may indicate resource planning errors or unrealistic exit strategy assumptions.

**Recursion Behavior**:
- **To Stage 6**: If resource requirements underestimated
- **To Stage 13**: If exit timeline incompatible with available talent

**Loop Prevention**:
- Max 1 DEV-002 recursion per venture
- Require Chairman approval for budget adjustments
- Consider offshore/contractor options before recursion

### Proposed Trigger: DEV-003 - Sprint Planning Misalignment

**From Stage**: 14
**To Stage**: 7 (User Story Creation) or 10 (Technical Review)
**Condition**: Sprint planning reveals backlog/timeline misalignment
**Severity**: LOW
**Auto-Execute**: Advisory only

**Trigger Conditions**:
1. Technical plan cannot be decomposed into reasonable stories
2. Velocity estimate shows timeline cannot be met
3. Dependencies prevent parallelization
4. Acceptance criteria unclear or conflicting

**Reason**: Sprint planning failures often expose user story quality issues or technical review gaps.

**Recursion Behavior**:
- **To Stage 7**: If user stories lack clarity or testability
- **To Stage 10**: If technical dependencies misunderstood

**Loop Prevention**:
- Max 1 DEV-003 recursion per venture
- Advisory only (not blocking)
- Consider story refinement sprint before recursion

## Recursion Decision Tree

```
Stage 14 Execution
    ↓
Substage 14.1: Environment Setup
    ↓
    ├─ Infrastructure provisioning fails? ─YES→ Trigger DEV-001 to Stage 8/10
    ├─ CI/CD pipeline fails validation? ─YES→ Trigger DEV-001 to Stage 8/10
    └─ Environment stable? ─YES→ Continue
         ↓
Substage 14.2: Team Formation
    ↓
    ├─ Critical roles unfilled >14 days? ─YES→ Trigger DEV-002 to Stage 6/13
    ├─ Budget insufficient? ─YES→ Trigger DEV-002 to Stage 6
    └─ Team complete? ─YES→ Continue
         ↓
Substage 14.3: Sprint Planning
    ↓
    ├─ Stories cannot be decomposed? ─YES→ Trigger DEV-003 to Stage 7
    ├─ Velocity shows timeline impossible? ─YES→ Trigger DEV-003 to Stage 10
    └─ Sprint 1 planned? ─YES→ Exit Stage 14
```

## Recursion Impact Analysis

### Impact of TECH-001 Recursion FROM Stage 14

**To Stage 8 (Task Decomposition)**:
- **Duration Impact**: +3-7 days to re-decompose tasks
- **Cost Impact**: Medium (engineering time for restructuring)
- **Stakeholder Impact**: EXEC must re-approve task structure
- **Deliverable Impact**: Sprint 1 start delayed

**To Stage 10 (Technical Review)**:
- **Duration Impact**: +5-10 days for updated technical review
- **Cost Impact**: High (may require external technical audit)
- **Stakeholder Impact**: Chairman may need to approve architecture changes
- **Deliverable Impact**: Development timeline extended

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:39 "Development preparation reveals complexity"

### Impact of Proposed DEV-001 Recursion

**To Stage 8**:
- **Scope**: Re-decompose tasks based on infrastructure constraints
- **Duration**: 3-5 days
- **Approval Required**: EXEC

**To Stage 10**:
- **Scope**: Update technical review with environment-specific requirements
- **Duration**: 5-7 days
- **Approval Required**: EXEC or Chairman (depending on architecture changes)

## Recursion Prevention Strategies

### 1. Pre-Flight Infrastructure Testing
**Before Stage 14 Entry**:
- Conduct infrastructure feasibility test during Stage 13
- Validate CI/CD tool compatibility during Stage 10
- Identify platform constraints during Stage 8

**Expected Reduction**: 70% fewer DEV-001 triggers

### 2. Early Team Scouting
**During Stage 6 (Resource Planning)**:
- Begin recruiting conversations during resource planning
- Validate talent availability before Stage 14
- Establish contractor/offshore contingencies

**Expected Reduction**: 60% fewer DEV-002 triggers

### 3. Story Backlog Pre-Validation
**During Stage 7 (User Story Creation)**:
- Validate stories can be decomposed into <5-day tasks
- Estimate velocity range during story creation
- Flag dependency chains for review

**Expected Reduction**: 80% fewer DEV-003 triggers

## Recursion Metrics & Monitoring

### Recursion Rate Targets
- **DEV-001 Trigger Rate**: <10% of Stage 14 executions
- **DEV-002 Trigger Rate**: <5% of Stage 14 executions
- **DEV-003 Trigger Rate**: <15% of Stage 14 executions (advisory)

### Monitoring Queries
```sql
-- Count DEV-001 recursion triggers from Stage 14
SELECT
    COUNT(*) as recursion_count,
    AVG(resolution_days) as avg_resolution_time
FROM recursion_events
WHERE from_stage = 14
    AND trigger_type = 'DEV-001'
    AND created_at > NOW() - INTERVAL '90 days';

-- Identify high-recursion ventures
SELECT
    venture_id,
    COUNT(*) as recursion_count,
    STRING_AGG(trigger_type, ', ') as triggers
FROM recursion_events
WHERE from_stage = 14
GROUP BY venture_id
HAVING COUNT(*) > 1
ORDER BY recursion_count DESC;
```

### Escalation Thresholds
- **2+ DEV-001 triggers**: Escalate to Chairman for architecture review
- **1+ DEV-002 trigger**: Escalate to Chairman for budget approval
- **Stage 14 duration >30 days**: Escalate to Chairman for timeline adjustment

## Handoff Requirements When Recursion Triggered

### Handoff to Stage 8 (DEV-001)
**Required Context**:
- Infrastructure provisioning logs and error messages
- CI/CD pipeline configuration and failure reports
- Tool integration compatibility matrix
- Proposed task restructuring recommendations

### Handoff to Stage 10 (DEV-001)
**Required Context**:
- Environment-specific technical constraints discovered
- Platform limitations and workarounds attempted
- Updated technical requirements
- Architecture change proposals

### Handoff to Stage 6 (DEV-002)
**Required Context**:
- Role descriptions and recruitment attempts
- Talent market analysis
- Budget variance analysis
- Contractor/offshore alternatives explored

### Handoff to Stage 7 (DEV-003)
**Required Context**:
- Stories that cannot be decomposed
- Velocity calculation showing timeline misalignment
- Dependency chain analysis
- Proposed story refinements

## Integration with SD-RECURSION-ENGINE-001

**Strategic Directive**: SD-RECURSION-ENGINE-001 (if implemented) would automate recursion triggers from Stage 14.

**Automation Capabilities**:
- Auto-detect environment setup failures (DEV-001)
- Auto-calculate team assembly delays (DEV-002)
- Auto-validate sprint planning feasibility (DEV-003)
- Auto-route recursion to correct earlier stage
- Auto-generate handoff documentation

**Manual Approval Still Required**:
- Chairman approval for budget changes (DEV-002)
- EXEC approval for architecture changes (DEV-001 to Stage 10)
- Product Owner approval for story changes (DEV-003)

**Evidence**: Proposed integration with SD-RECURSION-ENGINE-001 strategic directive

## Source Tables

| Source File | Lines | Content Type |
|-------------|-------|--------------|
| docs/workflow/critique/stage-14.md | 1-72 | No recursion section (gap identified) |
| docs/workflow/critique/stage-08.md | 39 | Stage 14 → Stage 8 TECH-001 trigger |
| docs/workflow/critique/stage-10.md | 130 | Stage 14 → Stage 10 TECH-001 trigger |

<!-- Generated by Claude Code Phase 7 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
