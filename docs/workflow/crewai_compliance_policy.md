# CrewAI Compliance Policy - Formal Governance Document

**Version**: 1.0
**Effective Date**: 2025-11-07
**Authority**: Chairman
**Protocol**: LEO Protocol v4.2.0
**Supersedes**: "Optional CrewAI enhancements" framing (deprecated)
**Policy Type**: **MANDATORY** for all stages

---

## Executive Summary

CrewAI is **MANDATORY** for all stages in the EHG automation roadmap (Stages 1-40). This policy establishes CrewAI as foundational infrastructure, not an optional enhancement. All stage implementations must comply with dossier-prescribed agents, crews, and APIs unless an explicit Chairman-approved exception is granted.

---

## Policy Statement

**CrewAI multi-agent orchestration is a core architectural requirement for EHG's 40-stage automation roadmap.**

All stage implementations MUST include prescribed CrewAI components per the stage dossier specification. Functional completion of a stage without CrewAI components is **NOT COMPLIANT** and does not satisfy stage success criteria.

---

## Scope

This policy applies to:
- **All 40 workflow stages** in `/docs/workflow/critique/stage-01.md` through `stage-40.md`
- **All Strategic Directives** implementing stage functionality
- **All code reviews and pull requests** for stage implementations
- **All handoffs** through LEO Protocol (LEAD, PLAN, EXEC phases)
- **All stage reviews** conducted per `/docs/workflow/review_process.md`

This policy does NOT apply to:
- Non-stage-related features (e.g., UI-only enhancements without automation)
- Proof-of-concept code explicitly marked as experimental
- Strategic directives unrelated to the 40-stage roadmap

---

## Requirements

### 1. Dossier Compliance

Each stage's dossier prescribes CrewAI components. These prescriptions are **binding specifications**, not suggestions.

**Dossier MUST specify**:
- **Required agents**: Name, role, goal, backstory, tools
- **Required crews**: Name, orchestration pattern (Sequential/Hierarchical/Parallel), agent assignments
- **Required APIs/endpoints**: Routes for agent/crew invocation
- **Success criteria**: CrewAI-specific validation (e.g., "Agents autonomously execute research pipeline")
- **RAG/knowledge sources**: Data access requirements for agents

**Example Dossier Prescription** (Stage 4):
```markdown
### Required CrewAI Components

**Agents**:
1. **Research Agent**
   - Role: "Venture Research Specialist"
   - Goal: "Conduct comprehensive research on venture opportunities using web scraping and API tools"
   - Backstory: "Expert analyst with 10+ years experience in venture evaluation"
   - Tools: Web scraper, API client, document analyzer

2. **Validation Agent**
   - Role: "Data Quality Validator"
   - Goal: "Verify research findings for accuracy, completeness, and relevance"
   - Backstory: "Detail-oriented quality assurance specialist"
   - Tools: Fact checker, data validator

**Crew**:
- **Deep Research Crew**
  - Orchestration: Sequential (Research Agent → Validation Agent)
  - Purpose: Autonomous deep dive research on shortlisted ventures
  - API Endpoint: POST `/api/ventures/:id/deep-research`
```

### 2. Implementation Verification

Stage reviews MUST verify CrewAI implementation using these methods:

#### A. Database Verification
Query EHG application database for agent/crew registrations:

```sql
-- Verify agents registered
SELECT id, name, role, goal, stage, version
FROM crewai_agents
WHERE stage = [STAGE_NUMBER];

-- Verify crews configured
SELECT id, name, orchestration_type, stage
FROM crewai_crews
WHERE stage = [STAGE_NUMBER];

-- Verify agent-crew assignments
SELECT ca.name as agent_name, cc.name as crew_name,
       caa.agent_order, caa.role_in_crew
FROM crewai_agent_assignments caa
JOIN crewai_agents ca ON ca.id = caa.agent_id
JOIN crewai_crews cc ON cc.id = caa.crew_id
WHERE cc.stage = [STAGE_NUMBER]
ORDER BY cc.name, caa.agent_order;
```

#### B. Code Verification
Inspect agent/crew implementations:

- **Agent definitions**: `agent-platform/app/agents/[agent_name].py`
- **Crew orchestrations**: `agent-platform/app/crews/[crew_name].py`
- **API endpoints**: `agent-platform/app/api/` or FastAPI route files
- **Configuration**: Agent parameters must match CrewAI 1.3.0+ specification (67 parameters)

**Required Parameters** (subset):
- `role`, `goal`, `backstory` (core identity)
- `tools` (agent capabilities)
- `allow_delegation` (crew coordination)
- `max_rpm`, `max_iter` (execution limits)
- `verbose`, `memory` (observability and context)

#### C. API Endpoint Verification
Test endpoints for agent/crew invocation:

```bash
# Example test
curl -X POST http://localhost:8000/api/ventures/123/deep-research \
  -H "Content-Type: application/json" \
  -d '{"venture_id": "123", "depth": "comprehensive"}'

# Expected response: Job queued, agent crew executing
```

### 3. Compliance Classification

After verification, classify stage CrewAI compliance status:

| Status | Definition | Action Required |
|--------|------------|-----------------|
| ✅ **COMPLIANT** | All prescribed agents/crews implemented per dossier spec | None - proceed with review |
| ❌ **NON_COMPLIANT** | Missing or incorrectly implemented agents/crews | **MANDATORY**: Spawn SD OR obtain exception |
| ⚠️ **EXCEPTION** | Chairman-approved deviation documented with rationale and sunset date | Document exception, proceed with review |

### 4. Non-Compliance Resolution (MANDATORY)

If a stage is classified as **NON_COMPLIANT**, the reviewer MUST take ONE of these actions:

#### Option A: Spawn Strategic Directive
- Create SD to implement missing CrewAI components
- SD scope MUST address all CrewAI compliance gaps
- SD priority: Typically High or Critical (based on gap impact)
- SD metadata MUST include:
  ```json
  {
    "crewai_compliance_status": "non_compliant",
    "crewai_verified": false,
    "source_stage": [STAGE_NUMBER],
    "spawned_from_review": true
  }
  ```

#### Option B: Obtain Chairman Exception
- Submit exception request to Chairman with:
  - **Rationale**: Why deviation is necessary (technical constraints, business priority shift, etc.)
  - **Impact Analysis**: How non-compliance affects automation goals
  - **Alternatives Considered**: Why implementing CrewAI is not feasible
  - **Sunset Date**: Date when full compliance will be required
  - **Remediation Plan**: How/when compliance will be achieved

- Chairman reviews and either:
  - **Grants Exception**: Signs exception document, sets sunset date
  - **Denies Exception**: Requires SD creation per Option A

**No Bypass Permitted**: Reviews cannot proceed with NON_COMPLIANT status unless Option A or B is executed.

### 5. Exception Process

#### Exception Request Format

**File**: `/docs/governance/exceptions/stage-[XX]-crewai-exception.md`

**Template**:
```markdown
# CrewAI Compliance Exception - Stage [XX]

**Exception ID**: EX-STAGE-XX-CREWAI
**Requested By**: [Reviewer Name]
**Request Date**: YYYY-MM-DD
**Stage**: [XX] - [Stage Name]

## Rationale

[2-3 paragraphs explaining why CrewAI deviation is necessary]

**Key Reasons**:
1. [Reason 1 - e.g., "Technical constraint: Stage operates in offline mode"]
2. [Reason 2 - e.g., "Business priority: Manual oversight required by regulation"]
3. [Reason 3 - e.g., "Temporary: Awaiting CrewAI 1.4.0 feature release"]

## Impact Analysis

**Automation Impact**: [How does non-compliance affect automation goals?]
**Downstream Impact**: [Do later stages depend on this stage's agents?]
**User Impact**: [Does manual fallback exist? UX implications?]

## Alternatives Considered

1. [Alternative 1 and why it was rejected]
2. [Alternative 2 and why it was rejected]

## Remediation Plan

**Target Compliance Date**: YYYY-MM-DD
**Approach**: [How will compliance be achieved?]
**Trigger**: [What event/milestone triggers remediation?]
**Linked SD** (if planned): [SD-XXX-XXX-XXX]

## Chairman Decision

**Decision**: [GRANTED / DENIED]
**Decision Date**: YYYY-MM-DD
**Signature**: Chairman

**Conditions** (if granted):
1. [Condition 1]
2. [Condition 2]

**Sunset Date**: YYYY-MM-DD
[Date when exception expires and full compliance required]

**Review Schedule**: [When exception will be re-evaluated]

---

**Exception Status**: [ACTIVE / EXPIRED / REMEDIATED]
**Last Updated**: YYYY-MM-DD
```

#### Exception Tracking

Query all active exceptions:
```sql
SELECT sd.id, sd.title,
       sd.metadata->>'source_stage' as stage,
       sd.metadata->>'crewai_compliance_status' as status,
       (sd.metadata->'crewai_exception'->>'sunset_date')::date as expires
FROM strategic_directives_v2 sd
WHERE sd.metadata->>'crewai_compliance_status' = 'exception'
  AND (sd.metadata->'crewai_exception'->>'status') = 'ACTIVE'
ORDER BY expires ASC;
```

#### Exception Expiration Handling

When sunset date is reached:
1. **Automated reminder**: System flags expired exceptions (future enhancement)
2. **Manual review**: Chairman reviews exception status
3. **Decision**:
   - **Extend**: Update sunset date with new rationale
   - **Remediate**: Create SD to implement CrewAI components
   - **Permanent Deviation**: Update dossier to reflect new reality (rare)

---

## Enforcement

### Stage Reviews
**Process**: `/docs/workflow/review_process.md` Step 2.5

- All future stage reviews MUST include **Section 2.6: CrewAI Agent & Crew Registry**
- Compliance status must be explicitly selected (COMPLIANT / NON_COMPLIANT / EXCEPTION)
- Reviews with NON_COMPLIANT status and no exception/SD are **REJECTED**

### Pull Requests
**Responsibility**: Code reviewers

- PRs implementing stage features MUST include CrewAI agent/crew registrations
- Reviewers MUST verify dossier compliance before approval
- PRs missing CrewAI components MUST link to exception or be blocked

### Strategic Directives
**Responsibility**: LEAD and PLAN phase agents

- SDs for stage implementations MUST include CrewAI tasks in EXEC plan
- Handoffs MUST verify CrewAI compliance before LEAD→PLAN or PLAN→EXEC gates
- Non-compliant handoffs require Chairman override

### Handoffs (LEO Protocol)
**Integration Points**:
- **LEAD→PLAN**: Verify dossier includes CrewAI prescriptions
- **PLAN→EXEC**: Verify EXEC plan includes agent/crew implementation tasks
- **EXEC→Complete**: Verify CrewAI components deployed and registered in database

**Handoff Metadata** (JSONB):
```json
{
  "crewai_compliance_verified": true,
  "crewai_components_planned": ["Research Agent", "Validation Agent", "Deep Research Crew"],
  "crewai_implementation_tasks": ["task-id-1", "task-id-2"]
}
```

---

## Rationale

CrewAI is foundational to EHG's automation strategy for these reasons:

### 1. Multi-Agent Orchestration
Complex workflows (40 stages) require autonomous agents collaborating through crews. Single-agent or manual approaches do not scale.

### 2. RAG Integration
Agents must be grounded in venture-specific knowledge (documents, data, prior research). CrewAI provides standardized RAG integration patterns.

### 3. Scalability
40 stages × multiple ventures = thousands of operations. Only multi-agent orchestration enables this scale without exponential human intervention.

### 4. Protocol Compliance
LEO Protocol assumes agent-based execution. Stages without agents break protocol assumptions and handoff contracts.

### 5. Interoperability
Consistent CrewAI architecture ensures agents from different stages can share knowledge, delegate tasks, and compose into higher-level workflows.

### 6. Maintainability
Standardized agent patterns (role/goal/backstory) make code reviewable, debuggable, and evolvable across 40 stages.

**Bottom Line**: "Optional" or "enhancement" framing undermines strategic intent. CrewAI is infrastructure, like databases or APIs.

---

## Examples

### Example 1: Compliant Stage (Stage 2 - Research)

**Dossier Prescription**:
- Agents: Web Research Agent, Market Analysis Agent
- Crew: Research Crew (Sequential orchestration)
- API: POST `/api/ventures/:id/research`

**Verification**:
```sql
SELECT * FROM crewai_agents WHERE stage = 2;
-- Result: 2 rows (Web Research Agent, Market Analysis Agent)

SELECT * FROM crewai_crews WHERE stage = 2;
-- Result: 1 row (Research Crew, orchestration_type='sequential')
```

**Code Check**:
- `agent-platform/app/agents/web_research_agent.py` ✅ Exists
- `agent-platform/app/agents/market_analysis_agent.py` ✅ Exists
- `agent-platform/app/crews/research_crew.py` ✅ Exists
- API endpoint `/api/ventures/:id/research` ✅ Functional

**Compliance Status**: ✅ COMPLIANT

---

### Example 2: Non-Compliant Stage (Stage 4 - Deep Research)

**Dossier Prescription**:
- Agents: Deep Research Agent, Validation Agent
- Crew: Deep Research Crew
- API: POST `/api/ventures/:id/deep-research`

**Verification**:
```sql
SELECT * FROM crewai_agents WHERE stage = 4;
-- Result: 0 rows ❌

SELECT * FROM crewai_crews WHERE stage = 4;
-- Result: 0 rows ❌
```

**Code Check**:
- `agent-platform/app/agents/deep_research_agent.py` ❌ Not found
- `agent-platform/app/agents/validation_agent.py` ❌ Not found
- `agent-platform/app/crews/deep_research_crew.py` ❌ Not found
- API endpoint `/api/ventures/:id/deep-research` ❌ Returns 404

**Compliance Status**: ❌ NON_COMPLIANT

**Action Taken**: Spawned **SD-CREWAI-ARCHITECTURE-001** to implement missing components

**SD Metadata**:
```json
{
  "source_stage": 4,
  "spawned_from_review": true,
  "crewai_compliance_status": "non_compliant",
  "crewai_verified": false,
  "review_date": "2025-11-06"
}
```

---

### Example 3: Exception Granted (Stage 38 - Manual Oversight)

**Dossier Prescription**:
- Agents: Compliance Auditor Agent
- Crew: Audit Crew

**Rationale for Exception**:
Stage 38 involves legal compliance audits requiring human judgment per regulatory requirements. Fully autonomous agents cannot satisfy legal liability constraints.

**Exception Granted By**: Chairman
**Exception ID**: EX-STAGE-38-CREWAI
**Sunset Date**: 2026-06-30 (pending regulatory guidance update)

**Conditions**:
1. Manual fallback process documented and tested
2. Agent assists (not replaces) human auditor
3. Exception expires when regulation allows AI-assisted compliance

**Compliance Status**: ⚠️ EXCEPTION

**Remediation Plan**: SD-COMPLIANCE-AUTOMATION-001 scoped for H2 2026 to implement hybrid human-agent model.

---

## Integration with LEO Protocol

### LEAD Phase
**Responsibility**: LEAD agent validates dossier quality

- **Check**: Does dossier include CrewAI prescriptions?
- **Gate**: If dossier lacks agent/crew specs, LEAD flags for correction before PLAN
- **Output**: LEAD handoff metadata includes `crewai_prescribed: true/false`

### PLAN Phase
**Responsibility**: PLAN agent designs implementation approach

- **Check**: Does EXEC plan include tasks for agent/crew implementation?
- **Gate**: If EXEC plan omits CrewAI, PLAN flags for revision or exception request
- **Output**: PLAN handoff includes `crewai_implementation_tasks: [...]` array

### EXEC Phase
**Responsibility**: EXEC agent implements and deploys

- **Check**: Are agents/crews registered in database post-deployment?
- **Gate**: EXEC cannot mark complete without database verification passing
- **Output**: EXEC handoff includes `crewai_deployed: true, crewai_endpoints: [...]`

### Stage Review Phase
**Responsibility**: Chairman-driven review process

- **Check**: Step 2.5 "CrewAI Compliance Check" mandatory gate
- **Gate**: Non-compliant stages require SD or exception before review proceeds
- **Output**: Outcome log Section 5.2 "CrewAI Compliance Score"

---

## References

### Core Documentation
- [Stage Review Process](/docs/workflow/review_process.md) - Step 2.5 (CrewAI Compliance Check)
- [Stage Review Template](/docs/workflow/review_templates/stage_review_template.md) - Section 2.6, 3.2, 5.2
- [Best Practices Index](/docs/workflow/best_practices.md) - CrewAI patterns and standards

### Technical References
- [CrewAI 1.3.0+ Documentation](https://docs.crewai.com/) - Official parameter specifications
- [EHG CrewAI Architecture](/docs/architecture/crewai/) - Internal design docs (if exists)
- [Stage Dossiers](/docs/workflow/critique/stage-01.md through stage-40.md) - Binding specifications

### Database Schema
- `crewai_agents` table: Agent registrations
- `crewai_crews` table: Crew configurations
- `crewai_agent_assignments` table: Agent-crew mappings
- `strategic_directives_v2.metadata`: Compliance status tracking

---

## FAQ

**Q: What if a stage doesn't need automation?**
**A**: If a stage is purely manual by design, the dossier should state "No CrewAI components required" and provide business justification. This is treated as an implicit exception and must be approved during dossier review (LEAD phase).

**Q: Can I implement partial CrewAI (e.g., agents but no crews)?**
**A**: No. Dossier prescriptions are binding. If dossier prescribes both agents and crews, both must be implemented. Partial implementation = NON_COMPLIANT.

**Q: What if CrewAI library has a bug preventing implementation?**
**A**: Request exception citing technical blocker. Exception should include workaround plan and target date when CrewAI upgrade resolves the issue.

**Q: Can I use a different agent framework (e.g., LangChain, AutoGPT)?**
**A**: No, unless Chairman grants architectural exception. EHG standardizes on CrewAI for consistency. Switching frameworks requires protocol-level decision.

**Q: How do I update a granted exception?**
**A**: Edit exception file, update "Last Updated" date, and notify Chairman. Significant changes (e.g., sunset date extension >30 days) require Chairman re-approval.

**Q: What happens if I deploy without CrewAI and it's caught in production?**
**A**: Post-deployment non-compliance triggers:
1. Incident report (governance issue)
2. Immediate SD creation to remediate
3. Rollback consideration if automation is blocked
4. Process review (why did code review/QA miss it?)

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2025-11-07 | Initial policy creation based on Stage 4 review insights | Claude Code |

---

**Policy Owner**: Chairman
**Policy Status**: Active
**Effective Date**: 2025-11-07
**Next Review**: 2025-Q2 or after 10 stage reviews, whichever comes first

---

<!-- Generated by Claude Code | CrewAI Compliance Policy | 2025-11-07 -->
<!-- This policy supersedes all prior "optional CrewAI" guidance -->
