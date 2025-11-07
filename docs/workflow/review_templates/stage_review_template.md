# Stage [XX] Review - [Stage Name]

**Review Date**: YYYY-MM-DD
**Reviewer**: Chairman
**Stage Number**: [XX]
**Stage Dossier**: `/docs/workflow/critique/stage-XX.md`
**Review Status**: [In Progress / Complete / SD Spawned / Deferred / Cancelled]

---

## 1. Dossier Summary

### Stage Purpose

[Extract the core purpose statement from the dossier - 2-3 sentences explaining why this stage exists in the workflow]

### Expected Deliverables

1. **[Deliverable 1 Name]**
   - Description: [What should be created]
   - Type: [Database / Code Component / Feature / Documentation / Configuration]

2. **[Deliverable 2 Name]**
   - Description: [What should be created]
   - Type: [Database / Code Component / Feature / Documentation / Configuration]

3. **[Deliverable 3 Name]**
   - Description: [What should be created]
   - Type: [Database / Code Component / Feature / Documentation / Configuration]

[Continue for all deliverables listed in dossier]

### Success Criteria

- **Criterion 1**: [Specific measurable outcome]
- **Criterion 2**: [Specific measurable outcome]
- **Criterion 3**: [Specific measurable outcome]

[List all success criteria from dossier]

### Dependencies

**Depends On** (Prerequisites):
- Stage [XX]: [Stage Name] - [Why this is a dependency]
- Stage [XX]: [Stage Name] - [Why this is a dependency]

**Blocks** (Downstream Dependencies):
- Stage [XX]: [Stage Name] - [Why completion of this stage is required]
- Stage [XX]: [Stage Name] - [Why completion of this stage is required]

### Original Intent

[1-2 paragraph summary of what this stage was designed to accomplish in the context of the overall EHG workflow. Include any key assumptions or strategic goals mentioned in the dossier.]

---

## 2. As-Built Inventory

### Database Tables

#### EHG Application Database (liapbndqlqxdcgpwntbv)

| Table Name | Status | Row Count | Schema Notes | Evidence |
|------------|--------|-----------|--------------|----------|
| [table_name] | ✅ Exists | [count] | [Key columns, indexes] | Query result |
| [table_name] | ⚠️ Partial | [count] | [Missing columns or incomplete] | Query result |
| [table_name] | ❌ Missing | N/A | [Expected by dossier] | Dossier expectation |

**Query Used**:
```sql
-- Example verification query
SELECT COUNT(*) FROM [table_name];
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '[table_name]';
```

#### EHG_Engineer Database (dedlbzhpgkmetvhbkyzq)

| Table Name | Status | Row Count | Schema Notes | Evidence |
|------------|--------|-----------|--------------|----------|
| [table_name] | ✅ Exists | [count] | [Key columns, indexes] | Query result |

### Code Components

#### React Components (Frontend)

| Component Name | File Path | Status | LOC | Features | Evidence |
|----------------|-----------|--------|-----|----------|----------|
| [ComponentName] | `src/components/[path].tsx` | ✅ Complete | [lines] | [List key features] | File read + code inspection |
| [ComponentName] | `src/components/[path].tsx` | ⚠️ Partial | [lines] | [Implemented features] / [Missing features] | File read + code inspection |
| [ComponentName] | `src/components/[expected-path].tsx` | ❌ Missing | N/A | [Expected by dossier] | Dossier expectation |

**Search Methods Used**:
```bash
# Glob pattern searches
Glob pattern: "src/components/**/*[Keyword]*.tsx"

# Grep content searches
Grep pattern: "[function/class name]" output_mode: "files_with_matches"
```

#### Backend Services (Agent Platform)

| Service Name | File Path | Status | Purpose | Evidence |
|--------------|-----------|--------|---------|----------|
| [ServiceName] | `agent-platform/[path].py` | ✅ Complete | [What it does] | File read |
| [ServiceName] | `agent-platform/[path].py` | ⚠️ Partial | [Partial implementation] | File read |
| [ServiceName] | `agent-platform/[expected-path].py` | ❌ Missing | [Expected by dossier] | Dossier expectation |

#### API Endpoints

| Endpoint | Method | Route | Status | Implementation Location | Evidence |
|----------|--------|-------|--------|-------------------------|----------|
| [Endpoint] | GET/POST/PUT/DELETE | `/api/[route]` | ✅ Complete | [File path] | API test or code inspection |
| [Endpoint] | GET/POST/PUT/DELETE | `/api/[route]` | ❌ Missing | [Expected by dossier] | Dossier expectation |

### Features Implemented

#### Fully Implemented ✅

1. **[Feature Name]**
   - **Evidence**: [Specific file path, database table, or UI route]
   - **Verification**: [How it was verified - test, query, code read]
   - **Dossier Match**: [Does it match dossier specification? Y/N]

2. **[Feature Name]**
   - **Evidence**: [Specific file path, database table, or UI route]
   - **Verification**: [How it was verified]
   - **Dossier Match**: [Y/N]

#### Partially Implemented ⚠️

1. **[Feature Name]**
   - **Implemented**: [What exists]
   - **Missing**: [What's incomplete]
   - **Evidence**: [File path or table]
   - **Impact**: [Why the missing part matters]

#### Not Implemented ❌

1. **[Feature Name]**
   - **Expected By Dossier**: [What should exist]
   - **Current Status**: [Not found in codebase or database]
   - **Impact**: [Effect of this gap]

### Configuration & Environment

#### Environment Variables

| Variable Name | Expected Purpose | Actual Status | Location |
|---------------|------------------|---------------|----------|
| [VAR_NAME] | [What it configures] | ✅ Set / ❌ Missing | `.env` file |

**Verification**:
```bash
# Check .env files
cat /mnt/c/_EHG/ehg/.env | grep [VAR_NAME]
cat /mnt/c/_EHG/EHG_Engineer/.env | grep [VAR_NAME]
```

#### Dependencies & Packages

| Package Name | Expected Version | Actual Version | Status |
|--------------|------------------|----------------|--------|
| [package-name] | [version] | [actual version] | ✅ Match / ⚠️ Outdated / ❌ Missing |

**Verification**:
```bash
# Check package.json
grep "[package-name]" package.json

# Check installed versions
npm list [package-name]
```

### UI Routes & Navigation

| Route | Status | Component | Access Level | Evidence |
|-------|--------|-----------|--------------|----------|
| `/[route]` | ✅ Exists | [ComponentName] | Public/Protected | `App.tsx` inspection |
| `/[route]` | ❌ Missing | [Expected component] | [Expected level] | Dossier expectation |

---

### 2.6 CrewAI Agent & Crew Registry ⚠️ MANDATORY

**Policy**: CrewAI is **MANDATORY** for all stages per `/docs/workflow/crewai_compliance_policy.md`. This section cannot be omitted.

#### Dossier Prescriptions

**Required Agents** (extracted from dossier):
| Prescribed Agent | Role | Goal | Backstory | Dossier Reference |
|-----------------|------|------|-----------|-------------------|
| [Agent Name] | [Role per dossier] | [Goal per dossier] | [Backstory summary] | `stage-XX.md:line YY` |
| [Agent Name] | [Role] | [Goal] | [Backstory] | `stage-XX.md:line YY` |

**Required Crews** (extracted from dossier):
| Crew Name | Orchestration Pattern | Required Agents | Dossier Reference |
|-----------|----------------------|-----------------|-------------------|
| [Crew Name] | Sequential/Hierarchical/Parallel | [Agent 1, Agent 2] | `stage-XX.md:line YY` |

**Required APIs/Endpoints** (for agent invocation):
| Endpoint | Purpose | Dossier Reference |
|----------|---------|-------------------|
| `/api/[route]` | [Invoke crew/agent] | `stage-XX.md:line YY` |

---

#### Database Verification

**Query Results**:
```sql
-- Check for agents
SELECT id, name, role, goal, stage, version
FROM crewai_agents
WHERE stage = [STAGE_NUMBER];
-- Results: [X rows] (Expected: [Y] agents per dossier)

-- Check for crews
SELECT id, name, orchestration_type, stage
FROM crewai_crews
WHERE stage = [STAGE_NUMBER];
-- Results: [X rows] (Expected: [Y] crews per dossier)

-- Check agent-crew assignments
SELECT ca.name as agent_name, cc.name as crew_name,
       caa.agent_order, caa.role_in_crew
FROM crewai_agent_assignments caa
JOIN crewai_agents ca ON ca.id = caa.agent_id
JOIN crewai_crews cc ON cc.id = caa.crew_id
WHERE cc.stage = [STAGE_NUMBER]
ORDER BY cc.name, caa.agent_order;
-- Results: [X assignments] (Expected: [Y])
```

**Findings**:
| Agent/Crew | Expected | Database Status | Evidence |
|------------|----------|----------------|----------|
| [Agent Name] | Required | ✅ Registered | Query shows id=[X], version=[Y] |
| [Agent Name] | Required | ❌ Missing | Query returned 0 rows |
| [Crew Name] | Required | ✅ Configured | Query shows orchestration_type=[X] |

---

#### Code Verification

**Agent Definitions**:
| Agent | File Path | Status | Configuration Match | Evidence |
|-------|-----------|--------|---------------------|----------|
| [Agent Name] | `agent-platform/app/agents/[name].py` | ✅ Exists | ✅ Matches 67-param spec | Lines [XX-YY] |
| [Agent Name] | `agent-platform/app/agents/[name].py` | ❌ Missing | N/A | Expected by dossier |

**Crew Orchestrations**:
| Crew | File Path | Status | Pattern Match | Evidence |
|------|-----------|--------|---------------|----------|
| [Crew Name] | `agent-platform/app/crews/[name].py` | ✅ Exists | ✅ Sequential pattern correct | Lines [XX-YY] |

**API Endpoints** (for agent invocation):
| Endpoint | File Path | Status | Evidence |
|----------|-----------|--------|----------|
| `/api/agents/[route]` | `agent-platform/app/api/[file].py` | ✅ Exists | Lines [XX-YY] |
| `/api/crews/[route]` | [Expected path] | ❌ Missing | Dossier expected |

**CrewAI Version & Parameters**:
- CrewAI Version Expected: `1.3.0+`
- CrewAI Version Found: `[version from code]`
- Parameter Count: [67 expected] / [X found]
- Parameters Missing: [list if any, e.g., "allow_delegation", "max_rpm"]

---

#### Compliance Status ⚠️ BLOCKING GATE

**Select exactly ONE:**

- [ ] ✅ **COMPLIANT**: All prescribed agents/crews implemented per dossier spec
  - All agents registered in database ✅
  - All crews configured correctly ✅
  - All API endpoints functional ✅
  - CrewAI 1.3.0+ parameters complete ✅
  - **Action**: Proceed to Section 3

- [ ] ❌ **NON_COMPLIANT**: Missing or incorrect implementations
  - Missing agents: [list]
  - Missing crews: [list]
  - Incorrect configurations: [describe]
  - **Required Action**: MUST either:
    - **Option A**: Spawn SD to implement missing components (see Section 4)
    - **Option B**: Obtain Chairman exception (see below)

- [ ] ⚠️ **EXCEPTION**: Chairman-approved deviation
  - Exception ID: `EX-STAGE-XX-CREWAI`
  - Exception File: `/docs/governance/exceptions/stage-XX-crewai-exception.md`
  - Rationale: [Why deviation necessary]
  - Sunset Date: [YYYY-MM-DD - when compliance required]
  - Chairman Signature: ✅ [Name, Date]
  - **Action**: Proceed to Section 3 with exception noted

---

#### Exception Details (if applicable)

**Exception Granted By**: Chairman
**Exception Date**: YYYY-MM-DD
**Rationale**:
[2-3 sentences explaining why CrewAI deviation is acceptable for this stage]

**Conditions**:
1. [Condition 1 - e.g., "Must not block downstream automation"]
2. [Condition 2 - e.g., "Manual fallback must exist"]

**Sunset Date**: YYYY-MM-DD
[Date when exception expires and full compliance required]

**Remediation Plan**:
[When/how will compliance be achieved? Link to SD if planned]

---

## 3. Gap Analysis

### Executive Summary

**Total Gaps Identified**: [count]
- **Critical**: [count] (Blocks other stages or core functionality)
- **High**: [count] (Significant missing feature or user impact)
- **Medium**: [count] (Enhancement or optimization needed)
- **Low**: [count] (Nice-to-have or documentation gap)

**Overall Stage Assessment**: [Choose one]
- ✅ **Complete**: All deliverables implemented, success criteria met
- ⚠️ **Substantially Complete**: Most deliverables present, minor gaps acceptable
- 🔴 **Partially Complete**: Significant gaps present, additional work needed
- ❌ **Not Implemented**: Stage largely unimplemented

**Completion Percentage**: [XX%] (based on deliverables inventory)

---

### 3.2 CrewAI Compliance Gaps ⚠️ MANDATORY CATEGORY

**Evidence Standards**: All findings MUST include file paths, DB queries, code snippets, and dossier references per policy.

| Gap ID | Description | Evidence | Severity | Blocks Automation? | Recommended Action |
|--------|-------------|----------|----------|-------------------|-------------------|
| CCI-001 | [Missing agent registration in database] | DB Query: `SELECT * FROM crewai_agents WHERE name='[agent]'` → 0 rows<br>Dossier: `stage-XX.md:line YY` | Critical/High/Medium/Low | Yes/No | Spawn SD / Exception |
| CCI-002 | [Incorrect crew orchestration pattern] | Code: `agent-platform/app/crews/[file].py:lines [XX-YY]`<br>Expected: Sequential<br>Found: Parallel | High | Yes | Fix in SD |

**Common CrewAI Compliance Gaps**:
- Missing agent registrations in `crewai_agents` table
- Incorrect crew orchestration (doesn't match dossier pattern: Sequential/Hierarchical/Parallel)
- RAG/knowledge source gaps (agent lacks access to required data)
- Service role key violations (automation blockers - missing RLS bypass keys)
- RLS policy misconfigurations (app vs engineer database separation violated)
- CrewAI 1.3.0+ parameter mismatches (missing required config like `allow_delegation`, `max_rpm`)

**Evidence Format** (REQUIRED for each gap):
```
**File Path**: agent-platform/app/agents/researcher.py:45-67
**Database Query**:
  SELECT * FROM crewai_agents WHERE stage=4;
  -- Results: 0 rows (Expected: 2 agents per dossier)
**Code Snippet**:
  [10-20 lines demonstrating the issue]
**Dossier Reference**: stage-04.md:lines 123-145 (prescribes "Research Agent")
```

**⚠️ WITHOUT EVIDENCE, THE FINDING IS INVALID AND MUST BE REMOVED.**

---

### Critical Gaps (Blockers)

#### Gap 1: [Gap Title]

**Category**: [Choose one: Missing Deliverable / Implementation Deviation / Data Issue / Configuration Gap]

**Description**: [1-2 sentences describing the gap]

**Dossier Expectation**:
[What the dossier said should exist]

**Current Reality**:
[What actually exists (or doesn't)]

**Evidence**:
- Dossier reference: [Section/page in stage-XX.md]
- As-built finding: [Reference to section in 02_as_built_inventory.md]
- Database query: [Query result if applicable]
- File search: [Search pattern used]

**Impact**: [Why this is critical]
- Blocks: Stage [XX], Stage [XX]
- User impact: [How users/system are affected]
- Technical debt: [Long-term consequences]

**Root Cause**: [Why gap exists - choose one or explain]
- Never implemented
- Partially implemented, then abandoned
- Implemented differently due to technical constraints
- Dossier assumption was incorrect
- Removed/deprecated in later work
- Unknown

**Recommended Action**: [Choose one and explain]
- Create Strategic Directive (High Priority)
- Immediate fix required (< 1 day work)
- Escalate to Chairman for decision
- Accept as permanent deviation with documentation

---

#### Gap 2: [Gap Title]

[Repeat structure for each critical gap]

---

### High Priority Gaps

#### Gap 1: [Gap Title]

**Category**: [Missing Deliverable / Implementation Deviation / Data Issue / Configuration Gap]

**Description**: [1-2 sentences]

**Dossier Expectation**: [What should exist]

**Current Reality**: [What exists]

**Evidence**:
- [Reference to dossier]
- [Reference to as-built inventory]

**Impact**: [Why this is high priority]
- User experience: [How it affects users]
- Functionality: [What's limited or broken]
- Business value: [Strategic impact]

**Root Cause**: [Why gap exists]

**Recommended Action**:
- Create Strategic Directive (Medium Priority)
- Add to product backlog
- Schedule for next sprint
- Requires Chairman approval

---

#### Gap 2: [Gap Title]

[Repeat structure for each high priority gap]

---

### Medium Priority Gaps

#### Gap 1: [Gap Title]

**Category**: [Missing Deliverable / Implementation Deviation / Optimization / Documentation]

**Description**: [1-2 sentences]

**Impact**: [Why this matters - but not urgently]

**Recommended Action**:
- Future consideration
- Add to technical debt backlog
- Document for later review
- Monitor for user feedback

---

### Low Priority Gaps

#### Gap 1: [Gap Title]

**Category**: [Documentation / Enhancement / Nice-to-Have]

**Description**: [1 sentence]

**Impact**: [Minor or negligible]

**Recommended Action**:
- Optional improvement
- Good first issue for contributors
- Defer indefinitely unless requested

---

### 3.7 Technical Debt Register ⚠️ REQUIRED FOR DEFERRED GAPS

**Purpose**: Track all gaps classified as deferred with formal acceptance criteria and remediation plans.

| Debt ID | Category | Description | Severity | Acceptance Rationale | Revisit Trigger | Est. Days | Owner |
|---------|----------|-------------|----------|---------------------|----------------|-----------|-------|
| TD-001 | Architecture | [Structural design issue] | Critical/High/Medium/Low | [Why deferral acceptable] | [Condition requiring action] | [Days] | [Team/Person] |
| TD-002 | Testing | [Missing test coverage] | Medium | [Rationale] | [Trigger] | [Days] | [Owner] |
| TD-003 | Documentation | [Missing/outdated docs] | Low | [Rationale] | [Trigger] | [Days] | [Owner] |

**Debt Categories**:
- **Architecture**: Structural design issues, technical design flaws
- **Testing**: Missing unit/integration/E2E test coverage
- **Documentation**: Missing/outdated documentation, README gaps
- **Performance**: Optimization opportunities, scalability concerns
- **Security**: Non-critical security improvements, hardening

**Debt Acceptance Criteria** (all must be true to defer):
- [ ] Does NOT block core functionality
- [ ] Does NOT create security vulnerabilities
- [ ] Does NOT violate data integrity constraints
- [ ] Has documented remediation plan
- [ ] Has clear, measurable revisit trigger
- [ ] Chairman has explicitly accepted deferral

**Debt Severity Guidelines**:
- **Critical**: Blocks future stages, creates cascading issues (defer only with Chairman exception)
- **High**: Significant technical risk, near-term impact (defer max 30 days)
- **Medium**: Moderate impact, manageable workaround exists (defer max 90 days)
- **Low**: Nice-to-have, minimal impact (defer indefinitely with periodic review)

**Revisit Trigger Examples**:
- "When Stage [XX] begins implementation"
- "When user count exceeds 100"
- "When next CrewAI upgrade occurs"
- "When SD-XXX-001 completes"
- "Q2 2025 technical debt sprint"

**Total Debt Summary**:
- Critical: [count] items, [total days]
- High: [count] items, [total days]
- Medium: [count] items, [total days]
- Low: [count] items, [total days]
- **TOTAL**: [count] items, [total days] estimated effort

---

### 3.8 Cross-Stage Reuse Opportunities ⚠️ REQUIRED

**Purpose**: Identify reusable patterns from prior stages before proposing new implementation work.

**Search Scope**:
- **Stages Searched**: [e.g., "1-4, 7-10" - list all stages reviewed]
- **Keywords Used**: [e.g., "research pipeline", "CrewAI orchestration", "venture analysis", "RLS patterns"]
- **Search Method**: [e.g., "Glob pattern searches + stage review file reads + SD metadata queries"]

#### Reusable Patterns Found

| Pattern ID | Source Stage | Pattern Name | Location | Adaptation Needed | Efficiency Gain |
|------------|--------------|--------------|----------|-------------------|-----------------|
| RP-001 | Stage 2 | Research pipeline crew | `agent-platform/app/crews/research_crew.py:10-150` | [Changes needed for this stage] | Est. 40 hours saved |
| RP-002 | Stage 4 | RLS policy template | `database/migrations/004_rls_policies.sql:50-80` | [Parameter changes only] | Est. 8 hours saved |
| RP-003 | SD-XXX-001 | Service role key pattern | `src/lib/supabase/service-client.ts:15-45` | [Minor config changes] | Est. 12 hours saved |

**Pattern Details**:

#### RP-001: [Pattern Name]
- **Source**: Stage [X] / SD-XXX-XXX
- **Location**: `[file path]:lines [XX-YY]`
- **Description**: [What the pattern does, 1-2 sentences]
- **Applicability**: [How it applies to current stage]
- **Adaptation Steps**:
  1. [Step 1 - e.g., "Update agent role parameter"]
  2. [Step 2 - e.g., "Change knowledge source connection"]
  3. [Step 3 - e.g., "Test with stage-specific data"]
- **Estimated Time Savings**: [XX hours/days vs. building from scratch]
- **Recommendation**: [Apply now / Consider for SD scope / Document for future]

#### No Reusable Patterns Found

**If no patterns identified, MUST document:**
- **Search Performed**: [Stages checked, files read, queries run]
- **Keywords Used**: [List all search terms]
- **Why No Match**: [Explain why current stage is unique]
- **Justification for New Implementation**: [Why building from scratch is necessary]

**Example**:
```
Searched stages 1-10 for "agent orchestration" and "research pipeline" patterns.
Reviewed:
- All 02_as_built_inventory.md files from completed stage reviews
- All SDs with metadata->>'focus_area' LIKE '%research%'
- Code search: Glob "agent-platform/**/*crew*.py"

No reusable patterns found because:
- Current stage requires unique hierarchical orchestration (prior stages used sequential)
- Current stage needs real-time data (prior stages used batch processing)
- Current stage agents have specialized tools not in prior implementations

New implementation justified: [rationale]
```

**Cross-Stage Impact Analysis**:
- **Upstream Dependencies**: [Does reuse create dependency on prior stage maintenance?]
- **Downstream Implications**: [Will this pattern be reusable by future stages?]
- **Pattern Library Contribution**: [Should this stage's patterns be documented for reuse?]

---

### Deviations from Dossier Intent

#### Deviation 1: [What Changed]

**Dossier Expected**: [Original design/approach from dossier]

**Actual Implementation**: [What was built instead]

**Justification** (if known):
[Why the deviation occurred - technical constraints, better approach discovered, requirements changed, etc.]

**Assessment**: [Is this deviation acceptable?]
- ✅ **Acceptable**: [Reason - e.g., "Better technical approach", "Dossier assumption was flawed"]
- ⚠️ **Questionable**: [Needs Chairman review]
- ❌ **Problematic**: [Should be corrected, creates issues]

**Impact on Success Criteria**:
[Does this deviation prevent meeting success criteria? Y/N - explain]

---

#### Deviation 2: [What Changed]

[Repeat structure for each deviation]

---

### Dependencies Impact

#### Prerequisite Stages Status

| Prerequisite Stage | Expected Status | Actual Status | Impact on This Stage |
|--------------------|----------------|---------------|---------------------|
| Stage [XX]: [Name] | Complete | ✅ Complete | None - prerequisite met |
| Stage [XX]: [Name] | Complete | ⚠️ Partial | [Specific impact - what's missing from prerequisite that affects this stage] |
| Stage [XX]: [Name] | Complete | ❌ Incomplete | **Critical** - [Why this blocks current stage] |

**Prerequisite Gap Analysis**:
[If any prerequisites are incomplete, explain how that affects the validity of this stage review]

#### Downstream Stages Impact

| Blocked Stage | Dependency Type | Impact if Gaps Not Addressed |
|--------------|----------------|------------------------------|
| Stage [XX]: [Name] | Hard Dependency | [Stage cannot start without this gap fixed] |
| Stage [XX]: [Name] | Soft Dependency | [Stage can proceed but will inherit this gap] |

**Blocking Assessment**:
[Are the gaps in this stage blocking critical downstream stages? If yes, prioritize resolution.]

---

### Recommendations Summary

#### Immediate Actions (Next 1-7 Days)
1. **[Action 1]** - [Rationale]
2. **[Action 2]** - [Rationale]

#### Strategic Directives Recommended
1. **[SD Title]** - Priority: [Critical/High/Medium/Low]
   - Scope: [1-2 sentences]
   - Gaps addressed: [List gap numbers from above]

2. **[SD Title]** - Priority: [Critical/High/Medium/Low]
   - Scope: [1-2 sentences]
   - Gaps addressed: [List gap numbers]

#### Backlog Items (Future Consideration)
1. **[Item 1]** - [Medium/Low priority gap it addresses]
2. **[Item 2]** - [Medium/Low priority gap it addresses]

#### Documentation Updates
1. **[Update dossier]** - [What needs correction in stage-XX.md]
2. **[Update protocol]** - [If LEO Protocol assumptions were incorrect]

---

## 4. Chairman Decision

**Decision Date**: YYYY-MM-DD
**Reviewer**: Chairman
**Review Status**: Complete

---

### Decision

**Outcome**: [Choose exactly one]
- ✅ **Accept As-Is** - Stage complete enough, no action needed
- 🚀 **Create Strategic Directive(s)** - Gaps justify formal SD creation
- ⏸️ **Defer** - Acknowledge gaps but defer action to future
- ❌ **Cancel Stage** - Dossier assumptions invalid, stage no longer relevant

---

### Rationale

[2-4 paragraphs explaining the reasoning behind this decision]

**Key Decision Factors**:
1. **[Factor 1]**: [Explanation - e.g., "Critical gaps block 3 downstream stages"]
2. **[Factor 2]**: [Explanation - e.g., "Most high-value features already implemented"]
3. **[Factor 3]**: [Explanation - e.g., "Deviations were justified and improve on dossier design"]

**Supporting Evidence**:
- **Gap Analysis**: [Reference specific critical/high gaps from section 3]
- **As-Built Reality**: [Reference key findings from section 2]
- **Dependencies**: [Reference blocking/blocked stages impact]

**Trade-offs Considered**:
- [Trade-off 1: e.g., "Could accept as-is but risks technical debt"]
- [Trade-off 2: e.g., "Could defer but downstream stages will inherit gaps"]

---

### If Strategic Directive(s) Spawned

#### SD 1: [SD Title]

**SD ID**: [SD-XXXX-XXXX-XXX] (to be assigned)
**SD Title**: [Full descriptive title]
**Priority**: [critical / high / medium / low]
**Source Stage**: [XX]

**SD Scope**:
[2-3 sentences defining what the SD will deliver - be specific about deliverables]

**Gaps Addressed**:
- Gap [X.X]: [Gap title from section 3]
- Gap [X.X]: [Gap title from section 3]

**Success Criteria**:
1. [Measurable criterion 1]
2. [Measurable criterion 2]
3. [Measurable criterion 3]

**Estimated Story Points**: [XX] (if applicable)
**Target Phase**: [LEAD / PLAN / EXEC - where SD should enter LEO cycle]

**Governance Metadata** ⚠️ MANDATORY (populate after SD created):
```json
{
  "source_stage": XX,
  "source_stage_name": "Stage XX: [Full Stage Name]",
  "spawned_from_review": true,
  "review_date": "YYYY-MM-DD",
  "review_decision_file": "/docs/workflow/stage_reviews/stage-XX/04_decision_record.md",
  "crewai_verified": true|false,
  "crewai_compliance_status": "compliant" | "exception" | "non_compliant",
  "technical_debt_items": ["TD-001", "TD-002", "TD-003"],
  "cross_stage_patterns_applied": ["RP-001-stage-02-research-pipeline", "RP-002-stage-04-rls-pattern"],
  "chairman_notes": "[Optional additional context]"
}
```

**Database Update Query**:
```sql
UPDATE strategic_directives_v2
SET metadata = metadata || jsonb_build_object(
  'source_stage', XX,
  'source_stage_name', 'Stage XX: [Name]',
  'spawned_from_review', true,
  'review_date', 'YYYY-MM-DD',
  'review_decision_file', '/docs/workflow/stage_reviews/stage-XX/04_decision_record.md',
  'crewai_verified', true,
  'crewai_compliance_status', 'non_compliant',
  'technical_debt_items', '["TD-001", "TD-002"]'::jsonb,
  'cross_stage_patterns_applied', '["RP-001"]'::jsonb,
  'chairman_notes', 'Addressing CrewAI gaps identified in Stage XX review'
)
WHERE id = 'SD-XXXX-XXXX-XXX';
```

**Verification Query**:
```sql
SELECT id, title, status,
       metadata->>'source_stage' as stage,
       metadata->>'crewai_compliance_status' as crewai_status,
       metadata->'technical_debt_items' as debt,
       metadata->'cross_stage_patterns_applied' as patterns
FROM strategic_directives_v2
WHERE id = 'SD-XXXX-XXXX-XXX';
```

---

#### SD 2: [SD Title]

[Repeat structure if multiple SDs created]

---

### If Accepted As-Is

**Justification**:
[2-3 paragraphs explaining why gaps are acceptable and do not require SD creation]

**Acceptance Criteria Met**:
- ✅ [Success criterion 1 from dossier] - [Evidence]
- ✅ [Success criterion 2 from dossier] - [Evidence]
- ⚠️ [Success criterion 3 from dossier] - [Partial, but acceptable because...]

**Stage Status**: Reviewed and Accepted
**Completion Assessment**: [XX%] complete

**Minor Actions** (if any):
- [Small fixes that don't require SD - e.g., "Update documentation", "Add TODO comment"]

**Monitoring**:
[If accepting with gaps, specify if/when to revisit this stage]

---

### If Deferred

**Reason for Deferral**:
[Explain why action is being postponed - e.g., "Waiting for upstream stage completion", "Resource constraints", "Strategic priority changed"]

**Gaps Acknowledged**:
- [List gaps that are being deferred]

**Conditions for Revisit**:
[What needs to change before reconsidering this stage]
1. [Condition 1 - e.g., "Stage 2 must be completed first"]
2. [Condition 2 - e.g., "Resource availability in Q2 2025"]

**Target Review Date**: [Future date or milestone - e.g., "2025-Q2" or "After SD-XXX-001 completes"]

**Interim Status**: Reviewed - Deferred Pending [Condition]

---

### If Cancelled

**Reason for Cancellation**:
[Explain why stage is no longer relevant - e.g., "Requirements changed", "Technical approach superseded", "Business priority shifted"]

**Dossier Assumption Invalidated**:
[What assumption in the dossier turned out to be incorrect]

**Dossier Update Required**: [Y/N]
- If **Yes**: [Describe what needs correction in stage-XX.md - deprecation note, redirect to new approach, etc.]

**Stage Status**: Reviewed and Cancelled

**Impact on Dependent Stages**:
[Which downstream stages are affected and how they should be updated]

---

### Next Steps

#### Immediate Actions (Within 7 Days)
1. [Action 1 - e.g., "Create SD-XXX-001 in strategic_directives_v2"]
2. [Action 2 - e.g., "Update stage_status_tracker.md"]
3. [Action 3 - e.g., "Notify team of gaps"]

#### Short-Term Actions (Within 30 Days)
1. [Action 1]
2. [Action 2]

#### Long-Term Tracking
1. [Action 1 - e.g., "Monitor SD-XXX-001 progress"]
2. [Action 2 - e.g., "Schedule Stage XX+1 review"]

---

**Decision Recorded**: YYYY-MM-DD
**Chairman Signature**: ✅ Chairman
**Outcome Logged**: [Reference to 05_outcome_log.md]

---

## 5. Review Outcome Log

**Stage**: [XX] - [Stage Name]
**Review Completed**: YYYY-MM-DD
**Reviewer**: Chairman
**Review Duration**: [Hours/Days]
**Final Status**: [Accepted / SD Created / Deferred / Cancelled]

---

### Review Summary

#### Dossier Intent (1-2 Sentences)
[What the stage was supposed to accomplish]

#### As-Built Reality (1-2 Sentences)
[What actually exists in the EHG codebase/database]

#### Gap Summary
- **Critical Gaps**: [count] - [Brief description]
- **High Priority Gaps**: [count] - [Brief description]
- **Medium Priority Gaps**: [count] - [Brief description]
- **Low Priority Gaps**: [count] - [Brief description]

#### Chairman Decision
**Outcome**: [Accepted / SD Created / Deferred / Cancelled]
**Rationale** (1-2 sentences): [Why this decision was made]

---

### 5.2 CrewAI Compliance Score ⚠️ MANDATORY

**Status**: [Select one: Compliant / Exception / Non-Compliant]

**Compliance Details**:
- **Agents Prescribed**: [count from dossier]
- **Agents Implemented**: [count from database verification]
- **Crews Prescribed**: [count from dossier]
- **Crews Implemented**: [count from database verification]
- **API Endpoints Prescribed**: [count]
- **API Endpoints Implemented**: [count]
- **Compliance Rate**: [percentage] = (Implemented / Prescribed) × 100%

**Compliance Status Breakdown**:
| Component Type | Prescribed | Implemented | Status | Gap IDs |
|----------------|------------|-------------|--------|---------|
| Agents | [count] | [count] | ✅/⚠️/❌ | CCI-001, CCI-002 |
| Crews | [count] | [count] | ✅/⚠️/❌ | CCI-003 |
| API Endpoints | [count] | [count] | ✅/⚠️/❌ | CCI-004 |
| RAG Integration | [Y/N] | [Y/N] | ✅/⚠️/❌ | CCI-005 |
| RLS Policies | [count] | [count] | ✅/⚠️/❌ | CCI-006 |

**Exception Details** (if status = Exception):
- **Exception ID**: EX-STAGE-XX-CREWAI
- **Exception File**: `/docs/governance/exceptions/stage-XX-crewai-exception.md`
- **Rationale**: [Brief summary - 1-2 sentences]
- **Sunset Date**: YYYY-MM-DD
- **Chairman Approval**: ✅ [Name, Date]
- **Conditions**: [List key conditions from exception doc]

**Non-Compliance Details** (if status = Non-Compliant):
- **SD Created**: [SD-XXXX-XXXX-XXX] - [Title]
- **SD Priority**: [Critical/High/Medium/Low]
- **Target Completion**: [Date/Milestone]
- **Gaps to Address**: [CCI-001, CCI-002, CCI-003]

**Historical Compliance** (if available):
- Previous reviews: [Stage X: Compliant, Stage Y: Exception granted]
- Compliance trend: [Improving / Stable / Declining]

---

### 5.3 Technical Debt Summary ⚠️ MANDATORY

**Total Debt Count**: [count] items
**Total Remediation Effort**: [days]

| Severity | Count | Total Days | % of Total |
|----------|-------|------------|------------|
| Critical | [n] | [days] | [%] |
| High | [n] | [days] | [%] |
| Medium | [n] | [days] | [%] |
| Low | [n] | [days] | [%] |
| **TOTAL** | **[n]** | **[days]** | **100%** |

**Debt by Category**:
| Category | Count | Est. Days | Key Items |
|----------|-------|-----------|-----------|
| Architecture | [n] | [days] | TD-001, TD-005 |
| Testing | [n] | [days] | TD-002, TD-007 |
| Documentation | [n] | [days] | TD-003 |
| Performance | [n] | [days] | TD-004 |
| Security | [n] | [days] | TD-006 |

**Critical Debt Items** (requires immediate attention):
- **TD-001**: [Description] - Revisit: [Trigger] - Est: [days]
- **TD-XXX**: [Description] - Revisit: [Trigger] - Est: [days]

**Debt Acceptance**:
- [ ] Chairman has reviewed debt register ✅
- [ ] All debt items meet acceptance criteria ✅
- [ ] Revisit triggers are clearly defined ✅
- [ ] Remediation plans documented ✅
- [ ] Owners assigned to all Critical/High debt ✅

**Chairman Statement on Debt**:
[1-2 sentences from Chairman explicitly accepting debt or requiring immediate remediation]

**Debt Tracking**:
- Debt logged in: [Link to debt register in 03_gap_analysis.md Section 3.7]
- Debt review scheduled: [When debt will be revisited - date or trigger]

---

### 5.4 Cross-Stage Patterns Applied ⚠️ MANDATORY

**Total Patterns Identified**: [count]
**Total Patterns Applied**: [count]
**Total Efficiency Gain**: [hours/days saved]

| Pattern ID | Source Stage | Pattern Name | Applied? | Efficiency Gain | Notes |
|------------|--------------|--------------|----------|-----------------|-------|
| RP-001 | Stage 2 | Research pipeline crew | ✅ Yes | 40 hours | Applied in SD-XXX-001 scope |
| RP-002 | Stage 4 | RLS policy template | ✅ Yes | 8 hours | Minor adaptation needed |
| RP-003 | SD-XXX-001 | Service role key pattern | ⏳ Planned | 12 hours | Will apply in implementation |
| RP-004 | Stage 7 | Error handling pattern | ❌ No | N/A | Not applicable to this stage |

**Patterns Applied Details**:

#### RP-001: [Pattern Name]
- **Source**: Stage [X]
- **Application**: [How pattern was used in this stage]
- **Adaptation Required**: [Changes made to pattern]
- **Time Saved**: [hours/days]
- **Quality Benefit**: [Improved consistency / Reduced bugs / Faster delivery]
- **Documented**: [Link to where pattern application is documented]

**Patterns Deferred**:
- **RP-XXX**: [Why deferred - e.g., "Requires Stage 10 completion first"]

**No Patterns Applied**:
[If no patterns applied, explain why:]
- **Search Performed**: [Stages checked, methods used]
- **Rationale**: [Why no patterns were applicable]
- **New Patterns Created**: [Patterns from this stage that future stages can reuse]

**Pattern Library Contribution**:
- **New Patterns Documented**: [count]
- **Patterns Available for Reuse**: [List new patterns created by this stage]
  - Pattern: [Name] - Location: `[file]:lines` - Description: [brief]

**Cross-Stage Impact**:
- **Upstream**: [Dependencies created on prior stages]
- **Downstream**: [How this stage's patterns will help future stages]

---

### Actions Taken

#### Immediate Actions
- ✅ [Action 1 - if completed during review]
- ⏳ [Action 2 - if pending]

#### Strategic Directives Created
- **[SD-XXXX-XXXX-XXX]**: [Title] - Priority: [X] - Status: [Created/Planned]

#### Deferred Items
- [Item 1 with target date]
- [Item 2 with conditions]

#### Documentation Updates
- [Update 1 - e.g., "Corrected dossier assumption in stage-XX.md"]

---

### Stage Status Update

**Before Review**:
- Status: Unknown / Assumed Complete / Assumed Partial
- Completion: Unknown

**After Review**:
- Status: [Reviewed & Accepted / SD Spawned / Deferred / Cancelled]
- Completion: [XX%] assessed

**Deliverables Assessment**:
- ✅ Fully Implemented: [count] deliverables
- ⚠️ Partially Implemented: [count] deliverables
- ❌ Not Implemented: [count] deliverables

**Success Criteria Assessment**:
- ✅ Met: [count] criteria
- ⚠️ Partially Met: [count] criteria
- ❌ Not Met: [count] criteria

---

### Governance Trail

#### Files Created
1. `/docs/workflow/stage_reviews/stage-XX/01_dossier_summary.md` - [Lines: XXX]
2. `/docs/workflow/stage_reviews/stage-XX/02_as_built_inventory.md` - [Lines: XXX]
3. `/docs/workflow/stage_reviews/stage-XX/03_gap_analysis.md` - [Lines: XXX]
4. `/docs/workflow/stage_reviews/stage-XX/04_decision_record.md` - [Lines: XXX]
5. `/docs/workflow/stage_reviews/stage-XX/05_outcome_log.md` - [Lines: XXX]

**Total Documentation**: [XXX lines]

#### Database Records

**Strategic Directives Created** (if applicable):
- **SD ID**: [SD-XXXX-XXXX-XXX]
- **Title**: [Full title]
- **Status**: [active / pending creation]
- **Metadata**: `source_stage` = [XX]

**Verification Query**:
```sql
SELECT id, title, priority, status, metadata->>'source_stage' as source_stage
FROM strategic_directives_v2
WHERE metadata->>'source_stage' = 'XX';
```

#### Stage Status Tracker Update
```markdown
| Stage | Name | Review Date | Status | Gaps | SD Spawned | Next Action |
|-------|------|-------------|--------|------|------------|-------------|
| XX | [Name] | YYYY-MM-DD | [✅/⏸️/❌] | XC/XH/XM/XL | [SD-XXX-001] | [Action] |
```

---

### Dependencies & Next Steps

#### Prerequisite Stages Satisfied?
- Stage [XX]: ✅ Complete
- Stage [XX]: ⚠️ Partial - [Impact noted]
- **Assessment**: [Can downstream stages proceed? Y/N]

#### Blocked Stages Impact
| Blocked Stage | Impact | Action Required |
|---------------|--------|-----------------|
| Stage [XX]: [Name] | [Hard block / Soft block] | [SD-XXX-001 must complete first / Can proceed with gaps noted] |

#### Recommended Next Review
**Next Stage**: Stage [XX+1] - [Stage Name]
**Rationale**: [Why this stage should be reviewed next - e.g., "Sequential dependency", "High business priority", "Chairman request"]
**Estimated Review Date**: [YYYY-MM-DD or "TBD pending SD completion"]

---

### 5.9 Lessons Learned (Enhanced with Best Practices)

#### What Worked Well
1. [Lesson 1 - e.g., "Database queries revealed accurate state"]
2. [Lesson 2 - e.g., "Dossier assumptions were mostly correct"]

#### What Could Improve
1. [Lesson 1 - e.g., "Need better tooling for UI feature verification"]
2. [Lesson 2 - e.g., "Dossier lacked specificity in success criteria"]

#### Best Practices Validated ⚠️ NEW
- [ ] **Service role key pattern used for automation** - [Y/N and evidence]
- [ ] **RLS policies properly separated** (app vs engineer) - [Y/N and evidence]
- [ ] **Template versioning maintained** - [Y/N and evidence]
- [ ] **Error handling follows standards** - [Y/N and evidence]
- [ ] **Testing coverage meets tier requirements** - [Y/N and evidence]
- [ ] **CrewAI 1.3.0+ parameters complete** - [Y/N and evidence]
- [ ] **Database migrations use RLS bypass pattern** - [Y/N and evidence]

#### New Patterns Discovered
1. **Pattern Name**: [Name]
   - **Type**: [Architecture / Testing / Documentation / Performance / Security / CrewAI]
   - **Description**: [What the pattern is, 1-2 sentences]
   - **Location**: `[file path]:lines [XX-YY]`
   - **Reusability**: [High / Medium / Low] - [Why]
   - **Recommendation**: [Document for pattern library / Apply to future stages / Share with team]

#### Anti-Patterns Detected
1. **Anti-Pattern Name**: [Name]
   - **Type**: [Architecture / Testing / Documentation / etc.]
   - **Description**: [What the anti-pattern is]
   - **Location**: `[file path]:lines [XX-YY]`
   - **Impact**: [Negative consequences]
   - **Remediation**: [How to fix - link to SD if created]

#### Framework Adjustments
[Any recommendations for improving the review process itself]

**Append to Living Log**:
After completing this review, key findings should be appended to `/docs/workflow/stage_review_lessons.md` for organizational learning.

---

### 5.10 Metrics (Enhanced with New KPIs)

**Review Efficiency**:
- Time to complete: [X hours/days]
- Files created: 5
- Lines of documentation: [total]
- Gaps identified: [count]
- SDs spawned: [count]

**Stage Completeness**:
- Deliverables implemented: [XX%]
- Success criteria met: [XX%]
- Overall stage completion: [XX%]

**CrewAI Compliance Metrics** ⚠️ NEW:
- **CrewAI compliance rate**: [%] = (Agents+Crews implemented / prescribed) × 100
- **Compliance status**: [Compliant / Exception / Non-Compliant]
- **CrewAI gaps**: [count]
- **CrewAI exceptions granted**: [count]

**Cross-Stage Reuse Metrics** ⚠️ NEW:
- **Stages searched**: [count]
- **Patterns identified**: [count]
- **Patterns applied**: [count]
- **Reuse rate**: [%] = (Applied / Identified) × 100
- **Efficiency gain from reuse**: [hours/days saved]

**Evidence Quality Metrics** ⚠️ NEW:
- **Findings with evidence citations**: [count] / [total findings] = [%]
- **Target**: 100% (all findings must have evidence)
- **Evidence types used**: [File paths: X, DB queries: Y, Code snippets: Z]

**Technical Debt Metrics** ⚠️ NEW:
- **Debt items created**: [count]
- **Debt by severity**: Critical: [n], High: [n], Medium: [n], Low: [n]
- **Total remediation effort**: [days]
- **Debt acceptance rate**: [% of gaps deferred vs. addressed immediately]

**Review Cycle Time** ⚠️ NEW:
- **Review start date**: [YYYY-MM-DD]
- **Decision date**: [YYYY-MM-DD]
- **Cycle time**: [days from start to decision]
- **Target**: ≤3 days per stage review

**Quality Indicators**:
- **Evidence completeness**: [XX%] (target: 100%)
- **Dossier accuracy**: [High / Medium / Low] (how well dossier matched reality)
- **Decision clarity**: [High / Medium / Low] (how clear the outcome was)

---

### Audit Confirmation

**Review Complete**: YYYY-MM-DD ✅
**All 5 Files Created**: ✅
**Outcome Documented**: ✅
**SD Linked** (if applicable): ✅ / N/A
**Stage Tracker Updated**: ✅
**Chairman Approval**: ✅

**Audit Trail**: Complete and traceable
**Review Quality**: [Self-assessment: High / Medium / Needs Revision]

---

**Review Completed By**: Claude Code (on behalf of Chairman)
**Review Signed**: Chairman
**Date**: YYYY-MM-DD

---

## Related Documentation

**Core Framework**:
- [Stage Review Process](/docs/workflow/review_process.md) - Step-by-step review procedures
- [Source Stage Metadata Field](/docs/workflow/source_stage_metadata_field.md) - Database metadata spec

**Policies & Best Practices**:
- [CrewAI Compliance Policy](/docs/workflow/crewai_compliance_policy.md) - **MANDATORY** for all stages
- [Stage Review Lessons](/docs/workflow/stage_review_lessons.md) - Living log of lessons learned
- [Best Practices Index](/docs/workflow/best_practices.md) - Central index for all best practices

**Governance**:
- [Exception Documentation](/docs/governance/exceptions/) - Chairman-approved exceptions directory

---

<!-- Generated by Claude Code | Stage Review Framework | Template v1.1 | 2025-11-07 -->
<!-- Version 1.1: Added CrewAI compliance (Section 2.6), technical debt register (Section 3.7), cross-stage reuse (Section 3.8), and enhanced outcome log (Sections 5.2-5.4, 5.9-5.10) -->
