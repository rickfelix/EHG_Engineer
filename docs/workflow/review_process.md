# Stage Review Framework - Chairman-Driven Governance


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-22
- **Tags**: database, api, testing, e2e

**Version**: 1.0
**Created**: 2025-11-07
**Authority**: Chairman
**Protocol**: LEO Protocol v4.2.0
**Scope**: Continuous validation of 40 workflow stages

---

## Overview

### Purpose

The Stage Review Framework provides a **Chairman-driven governance model** for evaluating each of the 40 workflow stages against actual EHG codebase implementation and data. This ensures that:

1. **Dossier Intent** matches **As-Built Reality**
2. **Gaps** are systematically identified and prioritized
3. **Strategic Directives** are spawned only when gaps justify intervention
4. **Audit Trail** is maintained for all review outcomes

### Operating Principles

**Evidence-Based**: All findings must reference specific code, database records, or documentation
**Chairman-Initiated**: Reviews are triggered by Chairman decision, not automation
**Auditable**: Every step produces artifacts that can be validated
**Reversible**: Decisions can be reconsidered based on new evidence
**Stage-Sequential**: Reviews proceed one stage at a time (not parallel)

### Scope

- **Total Stages**: 40 (stage-01.md through stage-40.md)
- **Dossier Location**: `/docs/workflow/critique/stage-XX.md`
- **Review Output Location**: `/docs/workflow/stage_reviews/stage-XX/`
- **Frequency**: Chairman-initiated (no fixed schedule)
- **Duration**: 1-3 hours per stage review (estimated)

---

## 5-Step Review Cycle

### Step 1: Dossier Review

**Objective**: Understand the original intent, expected deliverables, and success criteria for the stage.

**Actions**:
1. Load stage dossier from `/docs/workflow/critique/stage-XX.md`
2. Extract key sections:
   - **Purpose**: Why this stage exists
   - **Approach**: How it should be implemented
   - **Deliverables**: What should be created
   - **Success Criteria**: How to verify completion
   - **Dependencies**: Prerequisite stages and blocked stages
3. Document findings in `01_dossier_summary.md`

**Output**: `/docs/workflow/stage_reviews/stage-XX/01_dossier_summary.md`

**Format**:
```markdown
# Stage [XX] Dossier Summary

## Purpose
[Extracted from dossier]

## Expected Deliverables
1. [Deliverable 1]
2. [Deliverable 2]
...

## Success Criteria
- [Criterion 1]
- [Criterion 2]
...

## Dependencies
- **Depends On**: [Stage list]
- **Blocks**: [Stage list]

## Original Intent
[1-2 paragraph summary of what this stage was designed to accomplish]
```

---

### Step 2: Reality Check

**Objective**: Inventory what actually exists in the EHG codebase and databases.

**Actions**:
1. **Database Inspection**:
   - Query EHG application database for relevant tables
   - Query EHG_Engineer database for governance records
   - Check for data that stage dossier expects to exist

2. **Codebase Inspection**:
   - Search for components, files, and features mentioned in dossier
   - Use `Glob` tool for pattern matching: `src/**/*[keyword]*.tsx`
   - Use `Grep` tool for content search: `pattern: "keyword"`
   - Verify file existence and implementation status

3. **Feature Verification**:
   - Test UI routes mentioned in dossier
   - Verify API endpoints if applicable
   - Check configuration files and environment variables

4. Document findings in `02_as_built_inventory.md`

**Output**: `/docs/workflow/stage_reviews/stage-XX/02_as_built_inventory.md`

**Format**:
```markdown
# Stage [XX] As-Built Inventory

## Database Tables

### EHG Application Database
| Table | Status | Row Count | Notes |
|-------|--------|-----------|-------|
| [table_name] | ✅ Exists | [count] | [Schema notes] |
| [table_name] | ❌ Missing | N/A | [Expected by dossier] |

### EHG_Engineer Database
| Table | Status | Row Count | Notes |
|-------|--------|-----------|-------|
| [table_name] | ✅ Exists | [count] | [Schema notes] |

## Code Components

### React Components
| Component | Path | Status | LOC | Notes |
|-----------|------|--------|-----|-------|
| [ComponentName] | src/components/[path] | ✅ Complete | [lines] | [Details] |
| [ComponentName] | src/components/[path] | ⚠️ Partial | [lines] | [Missing features] |
| [ComponentName] | [expected path] | ❌ Missing | N/A | [Dossier expected] |

### Backend Services
| Service | Path | Status | Notes |
|---------|------|--------|-------|
| [ServiceName] | agent-platform/[path] | ✅ / ⚠️ / ❌ | [Details] |

### API Endpoints
| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| /api/[route] | GET/POST | ✅ / ❌ | [Implementation details] |

## Features Implemented

### Fully Implemented ✅
- [Feature 1] - **Evidence**: [File path or table name]
- [Feature 2] - **Evidence**: [File path or table name]

### Partially Implemented ⚠️
- [Feature 3] - **Evidence**: [What exists] - **Missing**: [What's incomplete]

### Not Implemented ❌
- [Feature 4] - **Expected By Dossier**: [What should exist]

## Configuration

### Environment Variables
| Variable | Expected | Actual Status |
|----------|----------|---------------|
| [VAR_NAME] | [Purpose] | ✅ Set / ❌ Missing |

### Dependencies
| Package | Expected | Actual Version |
|---------|----------|----------------|
| [package-name] | [version] | ✅ / ❌ |
```

---

### Step 2.5: CrewAI Compliance Check ⚠️ MANDATORY GATE

**Objective**: Verify prescribed CrewAI agents/crews from dossier are implemented. This is a **BLOCKING GATE**.

**Policy**: CrewAI is **MANDATORY** for all stages. This gate cannot be bypassed. See `/docs/workflow/crewai_compliance_policy.md` for full policy.

**Actions**:

1. **Extract CrewAI prescriptions from dossier:**
   - Required agents (roles, goals, backstory, tools)
   - Required crews (orchestration patterns: Sequential/Hierarchical/Parallel)
   - Required APIs/endpoints for agent invocation
   - Success criteria specific to CrewAI implementation
   - RAG/knowledge source requirements

2. **Verify implementation in both repositories:**

   **EHG app database queries:**
   ```sql
   -- Check for agents
   SELECT id, name, role, goal, stage, version
   FROM crewai_agents
   WHERE stage = [STAGE_NUMBER];

   -- Check for crews
   SELECT id, name, orchestration_type, stage
   FROM crewai_crews
   WHERE stage = [STAGE_NUMBER];

   -- Check agent-crew assignments
   SELECT ca.name as agent_name, cc.name as crew_name, caa.agent_order
   FROM crewai_agent_assignments caa
   JOIN crewai_agents ca ON ca.id = caa.agent_id
   JOIN crewai_crews cc ON cc.id = caa.crew_id
   WHERE cc.stage = [STAGE_NUMBER]
   ORDER BY caa.agent_order;
   ```

   **EHG code verification:**
   - Agent definitions: `agent-platform/app/agents/`
   - Crew orchestrations: `agent-platform/app/crews/`
   - API endpoints: `agent-platform/app/api/` or FastAPI routes
   - Configuration: Agent parameters matching CrewAI 1.3.0+ spec (67 parameters)

3. **Classify compliance status:**
   - ✅ **COMPLIANT**: All prescribed agents/crews implemented per dossier spec
   - ❌ **NON_COMPLIANT**: Missing or incorrectly implemented agents/crews
   - ⚠️ **EXCEPTION**: Chairman-approved deviation with documented rationale

4. **Gate Decision:**
   - If **COMPLIANT** or **EXCEPTION** → Proceed to Step 2.75
   - If **NON_COMPLIANT** → **MUST** either:
     - **Option A**: Spawn SD to implement missing CrewAI components
     - **Option B**: Obtain Chairman-approved exception with:
       - Written rationale (why deviation necessary)
       - Sunset date (when compliance required)
       - Documentation in `/docs/governance/exceptions/stage-XX-crewai-exception.md`
   - **NO BYPASS PERMITTED**: Reviews with non-compliant CrewAI and no exception are **REJECTED**

**Output**: CrewAI Compliance section in `02_as_built_inventory.md` (Section 2.6 - see template)

**Quality Standard**:
- All findings must cite specific file paths with line numbers
- All database queries must show actual results
- Dossier prescriptions must be quoted verbatim

---

### Step 2.75: Cross-Stage Pattern Reuse

**Objective**: Identify reusable components/patterns from prior stages before proposing new work.

**Policy**: Search first, build second. Reuse reduces duplication and accelerates delivery.

**Actions**:

1. **Search prior stage reviews:**
   ```bash
   # Search all completed stage reviews
   ls /mnt/c/_EHG/EHG_Engineer/docs/workflow/stage_reviews/

   # Read as-built inventories for patterns
   Read: /docs/workflow/stage_reviews/stage-0[1-9]/02_as_built_inventory.md
   ```

2. **Search strategic directives:**
   ```sql
   -- Find SDs with similar focus areas
   SELECT id, title, metadata->>'source_stage' as stage
   FROM strategic_directives_v2
   WHERE title ILIKE '%[keyword]%'
      OR description ILIKE '%[keyword]%'
   ORDER BY (metadata->>'source_stage')::int;
   ```

3. **Check for reusable patterns:**
   - **CrewAI agent configurations** (can agent be reused with different parameters?)
   - **Research pipeline orchestrations** (especially Stage 2's research crews)
   - **UI component patterns** (card layouts, forms, tables)
   - **Database schema patterns** (RLS policies, service role patterns)
   - **API endpoint patterns** (CRUD operations, error handling)
   - **Testing patterns** (E2E test structures, mock data)

4. **Document findings:**

   **If reusable pattern found:**
   - Source stage and file path with line numbers
   - Pattern description (what it does)
   - Adaptation needs (what changes required)
   - Efficiency estimate (time/LOC saved)

   **If no reusable pattern:**
   - Document search performed (stages checked: "1-4, 7-9")
   - Document keywords used (e.g., "research pipeline", "CrewAI orchestration")
   - Justify why new implementation needed

**Output**: Cross-Stage Reuse Opportunities section in `03_gap_analysis.md` (Section 3.8 - see template)

**Quality Standard**:
- Must search at minimum: all prior reviewed stages
- Must use at least 3 keywords per search
- Must provide specific file paths if pattern found
- If no patterns found, must document search effort

---

### Step 3: Gap Assessment

**Objective**: Compare dossier intent against as-built reality to identify gaps, deviations, and missing components.

**Actions**:
1. **Identify Missing Deliverables**:
   - Compare dossier deliverables list with as-built inventory
   - Mark each deliverable as: ✅ Complete / ⚠️ Partial / ❌ Missing

2. **Identify Implementation Deviations**:
   - Note where implementation differs from dossier approach
   - Assess if deviation is justified or problematic

3. **Classify Gaps by Priority**:
   - **Critical (P0)**: Blocks other stages, core functionality broken
   - **High (P1)**: Significant feature missing, user impact
   - **Medium (P2)**: Enhancement or optimization needed
   - **Low (P3)**: Nice-to-have, documentation gap

4. **New Gap Category: CrewAI Compliance Gaps** ⚠️ MANDATORY
   - Missing agent registrations in `crewai_agents` table
   - Incorrect crew orchestration (doesn't match dossier pattern)
   - RAG/knowledge source gaps
   - Service role key violations (automation blockers)
   - RLS policy misconfigurations (app vs engineer separation)
   - CrewAI 1.3.0+ parameter mismatches

5. **Evidence Standards: ⚠️ NO EVIDENCE, NO CLAIM**

   All findings MUST include:
   - **File paths with line numbers**: `agent-platform/app/agents/researcher.py:45-67`
   - **Database queries with results**:
     ```sql
     SELECT * FROM crewai_agents WHERE stage=4;
     -- Results: 0 rows (Expected: 2 agents per dossier)
     ```
   - **Code snippets**: 10-20 lines demonstrating the issue
   - **Dossier reference**: Section/page showing prescription

   **Without evidence, the finding is invalid and must be removed.**

6. **Technical Debt Register** ⚠️ REQUIRED FOR DEFERRED GAPS

   For each gap classified as deferred, document:
   - **Debt ID**: Unique identifier (e.g., TD-001, TD-002)
   - **Category**: Architecture / Testing / Documentation / Performance / Security
   - **Severity**: Critical / High / Medium / Low
   - **Acceptance Rationale**: Why is deferral acceptable?
   - **Revisit Trigger**: Condition that requires addressing debt
   - **Estimated Remediation Effort**: Days

   **Debt Acceptance Criteria** (all must be true):
   - Does NOT block core functionality
   - Does NOT create security vulnerabilities
   - Does NOT violate data integrity
   - Has documented remediation plan
   - Has clear revisit trigger

7. **Assess Root Causes**:
   - Was it never implemented?
   - Was it implemented differently?
   - Was it removed/deprecated?
   - Was dossier assumption incorrect?

8. Document findings in `03_gap_analysis.md`

**Output**: `/docs/workflow/stage_reviews/stage-XX/03_gap_analysis.md`

**Format**:
```markdown
# Stage [XX] Gap Analysis

## Executive Summary

**Total Gaps Identified**: [count]
- Critical: [count]
- High: [count]
- Medium: [count]
- Low: [count]

**Overall Assessment**: [1-2 sentences: Is stage complete, partially complete, or missing?]

---

## Critical Gaps (Blockers)

### Gap 1: [Gap Title]
**Category**: [Missing Deliverable / Implementation Deviation / Data Issue]
**Impact**: [Why this is critical - what it blocks]
**Evidence**: [Reference to dossier expectation vs. as-built reality]
**Root Cause**: [Why gap exists]
**Recommended Action**: [Create SD / Immediate fix / Other]

### Gap 2: [Gap Title]
...

---

## High Priority Gaps

### Gap 1: [Gap Title]
**Category**: [Missing Deliverable / Implementation Deviation / Data Issue]
**Impact**: [Why this is high priority]
**Evidence**: [Reference to dossier vs. reality]
**Root Cause**: [Why gap exists]
**Recommended Action**: [Create SD / Add to backlog / Other]

---

## Medium Priority Gaps

### Gap 1: [Gap Title]
**Category**: [Missing Deliverable / Implementation Deviation / Data Issue]
**Impact**: [Why this matters]
**Evidence**: [Reference to dossier vs. reality]
**Root Cause**: [Why gap exists]
**Recommended Action**: [Future consideration]

---

## Low Priority Gaps

### Gap 1: [Gap Title]
**Category**: [Documentation / Enhancement / Optimization]
**Impact**: [Minor impact]
**Evidence**: [Reference]
**Recommended Action**: [Optional improvement]

---

## Deviations from Dossier Intent

### Deviation 1: [What Changed]
**Dossier Expected**: [What dossier said]
**Actual Implementation**: [What exists]
**Justification**: [Why deviation occurred - if known]
**Assessment**: [Is deviation acceptable? Y/N]

---

## Dependencies Impact

### Prerequisite Stages
| Stage | Expected Status | Actual Status | Impact on This Stage |
|-------|----------------|---------------|---------------------|
| Stage [XX] | Complete | ✅ / ❌ | [How it affects review] |

### Blocked Stages
| Stage | Blocked By | Impact Assessment |
|-------|-----------|-------------------|
| Stage [XX] | [This stage's gaps] | [How gaps block next stage] |

---

## Recommendations Summary

1. **Immediate Actions**: [List critical gap resolutions]
2. **Strategic Directives**: [Gaps requiring SD creation]
3. **Backlog Items**: [Medium/low priority improvements]
4. **Documentation Updates**: [Dossier corrections needed]
```

---

### Step 4: Chairman Decision

**Objective**: Review gap analysis and determine action plan.

**Chairman Reviews**:
1. Gap analysis document (`03_gap_analysis.md`)
2. As-built inventory (`02_as_built_inventory.md`)
3. Dossier summary (`01_dossier_summary.md`)

**Decision Options**:
1. **Accept As-Is**: Stage is complete enough, no action needed
2. **Create Strategic Directive**: Gaps justify formal SD creation
3. **Defer**: Acknowledge gaps but defer action to future
4. **Cancel Stage**: Dossier assumptions invalid, stage no longer relevant

**For Each Decision**:
- **Rationale**: Why this decision was made
- **Supporting Evidence**: Which gaps/findings drove decision
- **Next Steps**: What happens next

**If SD Created**:
- Define SD scope, title, and priority
- Link SD to source stage via `source_stage` metadata field
- Add SD to `strategic_directives_v2` table
- Populate governance metadata (see below)

**Governance Metadata Requirements** ⚠️ MANDATORY FOR SPAWNED SDs:

For any SD spawned from this review, populate `strategic_directives_v2.metadata` with:
```json
{
  "source_stage": <int 1-40>,
  "source_stage_name": "Stage <N> — <Title>",
  "spawned_from_review": true,
  "review_date": "YYYY-MM-DD",
  "review_decision_file": "/docs/workflow/stage_reviews/stage-XX/04_decision_record.md",
  "crewai_verified": true|false,
  "crewai_compliance_status": "compliant" | "exception" | "non_compliant",
  "technical_debt_items": ["TD-001", "TD-002"],
  "cross_stage_patterns_applied": ["stage-02-research-pipeline"],
  "chairman_notes": "[Optional notes]"
}
```

**Query Pattern for Auditing:**
```sql
-- Find all SDs spawned by stage reviews
SELECT id, title, status,
       metadata->>'source_stage' as stage,
       metadata->>'crewai_compliance_status' as crewai_status,
       metadata->>'review_date' as reviewed_on
FROM strategic_directives_v2
WHERE metadata->>'spawned_from_review' = 'true'
ORDER BY (metadata->>'source_stage')::int;

-- Find SDs with CrewAI non-compliance
SELECT id, title, metadata->>'source_stage' as stage
FROM strategic_directives_v2
WHERE metadata->>'crewai_compliance_status' = 'non_compliant';

-- Find SDs with technical debt
SELECT id, title,
       jsonb_array_length(metadata->'technical_debt_items') as debt_count
FROM strategic_directives_v2
WHERE metadata->>'spawned_from_review' = 'true'
  AND metadata->'technical_debt_items' IS NOT NULL;
```

**Output**: `/docs/workflow/stage_reviews/stage-XX/04_decision_record.md`

**Format**:
```markdown
# Stage [XX] Chairman Decision

**Decision Date**: YYYY-MM-DD
**Reviewer**: Chairman
**Review Status**: Complete

---

## Decision

**Outcome**: [Accept As-Is / Create SD / Defer / Cancel]

---

## Rationale

[2-3 paragraphs explaining why this decision was made]

**Key Factors**:
1. [Factor 1]
2. [Factor 2]
3. [Factor 3]

**Supporting Evidence**:
- [Reference to specific gaps from 03_gap_analysis.md]
- [Reference to as-built findings from 02_as_built_inventory.md]

---

## If Strategic Directive Spawned

**SD ID**: [SD-XXXX-XXXX-XXX]
**SD Title**: [Full title]
**Priority**: [critical / high / medium / low]
**Source Stage**: [XX]

**SD Scope**:
[2-3 sentences defining what the SD will deliver]

**Success Criteria**:
1. [Criterion 1]
2. [Criterion 2]
...

**Estimated Story Points**: [XX]
**Target Completion**: [Timeframe if applicable]

**Database Link**:
```sql
UPDATE strategic_directives_v2
SET metadata = metadata || jsonb_build_object('source_stage', XX)
WHERE id = 'SD-XXXX-XXXX-XXX';
```

---

## If Accepted As-Is

**Justification**:
[Why gaps are acceptable and do not require SD creation]

**Stage Status**: [Mark as reviewed and accepted]

**Minor Actions** (if any):
- [Small fixes that don't require SD]

---

## If Deferred

**Reason for Deferral**:
[Why action is postponed]

**Conditions for Revisit**:
[What needs to change before reconsidering]

**Target Review Date**: [Future date or milestone]

---

## If Cancelled

**Reason for Cancellation**:
[Why stage is no longer relevant]

**Dossier Update Required**: [Y/N]
[If yes, note what needs correction]

---

## Next Steps

1. [Action 1]
2. [Action 2]
3. [Action 3]

---

**Decision Recorded**: YYYY-MM-DD
**Signed**: Chairman
```

---

### Step 5: Documentation

**Objective**: Record review outcome and update governance tracking.

**Actions**:
1. **Create Outcome Log**: Summarize entire review in `05_outcome_log.md`
2. **Update Stage Status**: Mark stage as reviewed in tracking system
3. **Link SD (if created)**: Add `source_stage` metadata to SD record
4. **Archive Review**: Preserve all 5 files in stage review directory
5. **Append Lessons Learned**: Add findings to `/docs/workflow/stage_review_lessons.md`

**Enhanced Outcome Log Requirements** ⚠️ MANDATORY SECTIONS:

The outcome log must now include:
- **Section 5.1**: Review Summary (existing)
- **Section 5.2**: CrewAI Compliance Score (NEW - see template)
- **Section 5.3**: Technical Debt Summary (NEW - see template)
- **Section 5.4**: Cross-Stage Patterns Applied (NEW - see template)
- **Section 5.5**: Actions Taken (existing)
- **Section 5.6**: Stage Status Update (existing)
- **Section 5.7**: Governance Trail (enhanced with metadata JSON)
- **Section 5.8**: Dependencies & Next Steps (existing)
- **Section 5.9**: Lessons Learned (enhanced with best practices)
- **Section 5.10**: Metrics (enhanced with new KPIs)
- **Section 5.11**: Audit Confirmation (existing)

**New KPIs to Track:**
- CrewAI compliance rate (% compliant without exception)
- Avg time from review start → decision (days)
- % of recommendations leveraging cross-stage reuse
- % of findings with evidence citations (target 100%)
- Deferred integration items resolved within SLA (%)

**Lessons Learned Log:**
After completing outcome log, append key findings to living log:
```bash
# Append to /docs/workflow/stage_review_lessons.md
## Stage [XX] Review - [DATE]

### Lessons Learned
1. [Lesson with context, impact, recommendation]

### Best Practices Validated
- [Practice that worked well]

### Anti-Patterns Detected
- [Pattern to avoid]

### Cross-Stage Patterns Discovered
- [Reusable pattern identified]
```

**Output**: `/docs/workflow/stage_reviews/stage-XX/05_outcome_log.md`

**Format**:
```markdown
# Stage [XX] Review Outcome Log

**Stage**: [XX] - [Stage Name]
**Review Date**: YYYY-MM-DD
**Reviewer**: Chairman
**Review Status**: Complete
**Decision**: [Accept / SD Created / Deferred / Cancelled]

---

## Review Summary

### Dossier Intent
[1-2 sentences from dossier summary]

### As-Built Reality
[1-2 sentences summarizing what exists]

### Gaps Identified
- **Critical**: [count]
- **High**: [count]
- **Medium**: [count]
- **Low**: [count]

### Decision
[Chairman decision with brief rationale]

---

## Actions Taken

### Immediate Actions
- [Action 1 if any]

### Strategic Directives Created
- [SD-XXXX-XXXX-XXX] - [Title] - Priority: [X]

### Deferred Items
- [Item 1 if any]

---

## Stage Status Update

**Before Review**: [Status unknown / assumed complete]
**After Review**: [Reviewed & Accepted / Gaps Documented / SD Spawned]

**Completion Assessment**: [XX%]
- Fully implemented: [count] deliverables
- Partially implemented: [count] deliverables
- Not implemented: [count] deliverables

---

## Governance Trail

### Files Created
1. `/docs/workflow/stage_reviews/stage-XX/01_dossier_summary.md`
2. `/docs/workflow/stage_reviews/stage-XX/02_as_built_inventory.md`
3. `/docs/workflow/stage_reviews/stage-XX/03_gap_analysis.md`
4. `/docs/workflow/stage_reviews/stage-XX/04_decision_record.md`
5. `/docs/workflow/stage_reviews/stage-XX/05_outcome_log.md`

### Database Records
- Strategic Directive: [SD-XXXX-XXXX-XXX] (if created)
- Metadata field `source_stage`: [XX] (if SD created)

---

## Next Stage Recommendations

**Prerequisite Satisfied?**: [Y/N]
- If No: [Blocked stages listed]

**Recommended Next Review**: Stage [XX+1] - [Name]
**Rationale**: [Why this stage should be reviewed next]

---

## Audit Confirmation

**Review Complete**: YYYY-MM-DD
**Outcome Documented**: ✅
**SD Linked (if applicable)**: ✅ / N/A
**Chairman Approval**: ✅

**Signature**: Chairman
```

---

## Governance Integration

### Strategic Directive Linking

When a stage review spawns a Strategic Directive, the following linkage is established:

**In `strategic_directives_v2` table**:
```sql
-- Add source_stage to metadata
UPDATE strategic_directives_v2
SET metadata = metadata || jsonb_build_object(
  'source_stage', XX,
  'source_stage_name', 'Stage XX: [Name]',
  'spawned_from_review', true,
  'review_date', '2025-11-07',
  'review_decision_file', '/docs/workflow/stage_reviews/stage-XX/04_decision_record.md'
)
WHERE id = 'SD-XXXX-XXXX-XXX';
```

**Query to find all SDs spawned by a stage**:
```sql
SELECT id, title, priority, status
FROM strategic_directives_v2
WHERE metadata->>'source_stage' = 'XX';
```

**Query to find which stage spawned an SD**:
```sql
SELECT
  id,
  title,
  metadata->>'source_stage' as source_stage,
  metadata->>'source_stage_name' as stage_name
FROM strategic_directives_v2
WHERE id = 'SD-XXXX-XXXX-XXX';
```

### Stage Status Tracking

**Recommended Tracking Method**:
Create a lightweight tracking file: `/docs/workflow/stage_status_tracker.md`

```markdown
# Stage Review Status Tracker

| Stage | Name | Review Date | Status | Gaps | SD Spawned | Next Action |
|-------|------|-------------|--------|------|------------|-------------|
| 01 | [Name] | YYYY-MM-DD | ✅ Reviewed | 0C/2H/3M/1L | None | Accept as-is |
| 02 | [Name] | YYYY-MM-DD | ✅ Reviewed | 1C/0H/0M/0L | SD-XXX-001 | Track SD |
| 03 | [Name] | - | ⏸️ Pending | - | - | Not reviewed |
| 04 | [Name] | YYYY-MM-DD | ✅ Reviewed | 0C/1H/2M/0L | SD-XXX-002 | Track SD |
...
| 40 | [Name] | - | ⏸️ Pending | - | - | Not reviewed |
```

**Legend**:
- Gaps: `[C]ritical / [H]igh / [M]edium / [L]ow`
- Status: ✅ Reviewed / ⏸️ Pending / ❌ Cancelled

---

## Review Workflow Best Practices

### Before Starting Review

1. **Check Prerequisites**: Verify dependent stages are reviewed
2. **Load Dossier**: Read full dossier before database/code inspection
3. **Set Expectations**: Understand what "complete" means for this stage

### During Review

1. **Evidence-Based**: Every finding must reference specific files, tables, or data
2. **No Assumptions**: Query databases, don't guess
3. **Neutral Tone**: Report facts, avoid value judgments in inventory
4. **Capture Screenshots**: For UI features, include visual evidence if helpful

### After Review

1. **Chairman Approval Required**: No SD creation without Chairman decision
2. **Link All Artifacts**: Ensure 5 files are created and cross-referenced
3. **Update Tracker**: Record review outcome in status tracker
4. **Archive Safely**: Preserve all review files for audit trail

---

## Quality Standards

### Dossier Summary Quality
- **Accuracy**: Extract exact text from dossier, don't paraphrase
- **Completeness**: Include all success criteria and dependencies
- **Brevity**: 1-2 pages maximum

### As-Built Inventory Quality
- **Specificity**: Exact file paths, table names, row counts
- **Verification**: Test features, don't assume based on file names
- **Objectivity**: Report what exists, not what "should" exist

### Gap Analysis Quality
- **Prioritization**: Critical gaps must truly block progress
- **Root Cause**: Investigate why gap exists, don't just list it
- **Actionability**: Each gap should have clear recommended action

### Decision Record Quality
- **Clarity**: Decision must be unambiguous
- **Justification**: Rationale must reference specific evidence
- **Traceability**: Link to gap analysis and inventory findings

### Outcome Log Quality
- **Completeness**: Summarize entire review in 1-2 pages
- **Audit Trail**: List all files and database records created
- **Next Steps**: Clear guidance on what happens next

---

## Metrics & Success Criteria

### Review Completion Metrics

**Per Stage**:
- Time to complete: 1-3 hours (target)
- Files created: 5 (required)
- Gaps identified: Varies (honest assessment)
- Decision made: 1 (required)

**Across All Stages**:
- Total stages reviewed: [count] / 40
- SDs spawned: [count]
- Stages accepted as-is: [count]
- Stages deferred: [count]
- Stages cancelled: [count]

### Framework Success Criteria

✅ **Framework is successful if**:
1. Every review produces 5 complete files
2. Decisions are evidence-based and justified
3. SDs spawned address real gaps (not assumed gaps)
4. Audit trail is complete and traceable
5. Chairman can understand review outcome without additional context

❌ **Framework needs revision if**:
1. Reviews take >5 hours per stage
2. Decisions lack clear justification
3. SDs are created without Chairman approval
4. Gaps are speculative (not evidence-based)
5. Files are incomplete or inconsistent

---

## Continuous Improvement

### After Each Review

**Reflect**:
- Was the process efficient?
- Were all necessary tools/data available?
- Did the 5-step cycle work smoothly?

**Adjust**:
- Update this framework document if process improvements identified
- Add new sections to template if needed
- Refine gap prioritization criteria

### After 5 Reviews

**Evaluate**:
- Are we finding real gaps or chasing perfection?
- Is the framework too heavy or too light?
- Are SDs spawned actually getting completed?

**Iterate**:
- Revise framework based on lessons learned
- Update template based on practical experience
- Adjust time estimates and resource needs

---

## Appendix: Tool Reference

### Database Query Tools

**EHG_Engineer Database**:
```javascript
const client = await createSupabaseServiceClient('engineer', { verbose: false });
const { data } = await client.from('strategic_directives_v2').select('*');
```

**EHG Application Database**:
```javascript
const client = await createSupabaseServiceClient('app', { verbose: false });
const { data } = await client.from('ventures').select('*');
```

### File Search Tools

**Glob (Pattern Matching)**:
```bash
Glob pattern: "src/components/**/*Agent*.tsx"
```

**Grep (Content Search)**:
```bash
Grep pattern: "createVenture" output_mode: "files_with_matches"
```

### File Read Tools

**Read Dossier**:
```bash
Read file_path: "/mnt/c/_EHG/EHG_Engineer/docs/workflow/critique/stage-04.md"
```

**Read Component**:
```bash
Read file_path: "/mnt/c/_EHG/EHG/src/components/ventures/VentureCard.tsx"
```

---

## Related Documentation

**Core Framework:**
- [Stage Review Template](review_templates/stage_review_template.md) - Detailed template for all 5 review files
- [Source Stage Metadata Field](source_stage_metadata_field.md) - Database metadata specification

**Policies & Best Practices:**
- [CrewAI Compliance Policy](crewai_compliance_policy.md) - Formal policy on mandatory CrewAI implementation
- [Stage Review Lessons](stage_review_lessons.md) - Living log of lessons learned
- [Best Practices Index](best_practices.md) - Central index for all best practices

**Governance:**
- [Exception Documentation](../governance/exceptions) - Directory for Chairman-approved exceptions
- Strategic Directives: Query `strategic_directives_v2` table with `metadata->>'spawned_from_review' = 'true'`

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2025-11-07 | Initial framework creation | Claude Code |
| 1.1 | 2025-11-07 | Added CrewAI compliance gate, cross-stage pattern reuse, technical debt register, evidence standards, governance metadata | Claude Code |

---

**Framework Owner**: Chairman
**Framework Status**: Active
**Last Review**: 2025-11-07
**Next Review**: After 5 stage reviews completed

---

<!-- Generated by Claude Code | Stage Review Framework v1.1 | 2025-11-07 -->
