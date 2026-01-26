<!-- ARCHIVED: 2026-01-26T16:26:54.312Z
     Reason: Duplicate of canonical file
     Original location: docs\workflow\dossiers\stage-09\10_gaps-backlog.md
     See: docs/fixes/duplicate-consolidation-manifest.json for details
-->

# Stage 9: Gaps & Backlog


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, api, unit, schema

**Purpose**: Document identified gaps from critique and map to Strategic Directives where applicable.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-09.md:22-71 "Weaknesses, Specific Improvements, Recommendations"

---

## Gap Categories

**Gaps identified from critique rubric and recommendations**:
1. Automation gaps
2. Metrics definition gaps
3. Data flow gaps
4. Rollback procedure gaps
5. Customer integration gaps
6. Recursion logic gaps

---

## Gap 1: Limited Automation

**Source**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-09.md:30-33 "Enhance Automation: Manual → 80% automation"

**Current State**: Manual process (analyst-driven capability assessment, gap identification, opportunity modeling)

**Target State**: 80% automation with AI-assisted analysis

**Impact**:
- **Efficiency**: Manual Stage 9 takes 3-5 days, automated could be <1 day
- **Consistency**: Human analysts vary in gap identification rigor
- **Scalability**: Cannot scale to high venture throughput with manual process

**Severity**: HIGH (automation is core to LEO Protocol vision)

**Proposed Solution**:
1. **Phase 1**: AI-assisted capability assessment
   - LLM reviews Stage 8 WBS and suggests required capabilities
   - Analyst validates suggestions
2. **Phase 2**: Automated gap identification
   - Compare current vs required capabilities programmatically
   - Auto-calculate gap severity based on WBS critical path
3. **Phase 3**: AI-generated opportunity modeling
   - LLM scrapes market research, estimates TAM/SAM/SOM
   - Auto-generates ROI projections

**Proposed Artifacts**:
- `agents/gap_analysis_agent.py` (CrewAI agent) - Documented in File 06
- `tasks/stage_09_tasks.py` (CrewAI tasks) - Documented in File 06
- `tools/capability_inventory_tool.py` (query internal DB)
- `tools/market_research_tool.py` (scrape market data)
- `tools/roi_calculator_tool.py` (calculate ROI)

**SD Cross-Reference**: **(Feeds SD-AUTOMATION-003 if exists)** - "Automate Stage 9 gap analysis and opportunity modeling"

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-09.md:30-33 "Build automation workflows"

---

## Gap 2: Undefined Metric Thresholds

**Source**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-09.md:35-38 "Define Clear Metrics: Missing threshold values, measurement frequency"

**Current State**: 3 metrics defined (Gap coverage, Opportunity size, Capability score) but no thresholds

**Target State**: Concrete KPIs with pass/fail thresholds and measurement frequency

**Impact**:
- **Governance**: Cannot programmatically validate Stage 9 exit gates without thresholds
- **Consistency**: Subjective interpretation of "good" gap coverage varies
- **Automation**: Blocking gates cannot be automated without numeric thresholds

**Severity**: HIGH (blocks exit gate automation)

**Proposed Solution**:
Define thresholds for each metric:
- **Gap Coverage**: Target ≥80%, Blocker <60%
- **Opportunity Size**: Target ≥$2M SOM, Blocker <$1M
- **Capability Score**: Target ≥3.0/5.0, Blocker <2.5/5.0
- **Measurement Frequency**: Once per Stage 9 completion

**Proposed Artifacts**:
- `config/stage_09_thresholds.yaml` (threshold configuration) - Documented in File 08
- `validation/stage_09_gates.py` (exit gate validation logic) - Documented in File 06
- `metrics/stage_09_metrics.py` (metric calculation) - Documented in File 09

**SD Cross-Reference**: **(Feeds SD-VALIDATION-004 if exists)** - "Define and enforce Stage 9 metric thresholds"

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-09.md:35-38 "Establish concrete KPIs with targets"

---

## Gap 3: Unclear Data Flow

**Source**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-09.md:40-44 "Improve Data Flow: Data transformation and validation rules"

**Current State**: Inputs/outputs defined but data transformation rules missing

**Target State**: Documented schemas, transformation logic, and validation rules

**Impact**:
- **Integration**: Downstream Stage 10 may receive malformed gap analysis data
- **Quality**: No validation ensures gap analysis report meets schema requirements
- **Debugging**: Difficult to troubleshoot data issues without documented transformations

**Severity**: MEDIUM (does not block execution but reduces quality)

**Proposed Solution**:
1. Define JSON schemas for:
   - `current_capabilities` array schema
   - `required_capabilities` array schema
   - `capability_gaps` array schema
   - `opportunity_matrix` array schema
   - `capability_roadmap` array schema
2. Document transformation rules:
   - How Stage 8 WBS tasks map to required capabilities
   - How gap severity is calculated (formula: required - current maturity)
   - How ROI is calculated (formula: (revenue - cost) / cost)
3. Implement validation layer:
   - JSON schema validation on Stage 9 outputs
   - Data quality checks (e.g., no negative ROI, no gaps without severity)

**Proposed Artifacts**:
- `schemas/stage_09_schemas.json` (JSON schemas for all outputs)
- `validation/stage_09_data_validation.py` (validation logic)
- `docs/stage_09_data_flow.md` (transformation documentation)

**SD Cross-Reference**: **(Feeds SD-DATA-QUALITY-002 if exists)** - "Document and enforce Stage 9 data schemas"

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-09.md:40-44 "Document data schemas and transformations"

---

## Gap 4: Missing Rollback Procedures

**Source**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-09.md:46-49 "Add Rollback Procedures: No rollback defined"

**Current State**: No rollback triggers or steps defined

**Target State**: Clear rollback decision tree with triggers and procedures

**Impact**:
- **Risk Management**: If Stage 9 produces invalid outputs, no process to revert
- **Governance**: Chairman cannot roll back to earlier stage if gap analysis is incorrect
- **Audit Trail**: No tracking of rollback events for post-mortem analysis

**Severity**: MEDIUM (low-frequency event but high-impact when needed)

**Proposed Solution**:
Define rollback triggers:
1. **ROLLBACK-001**: Gap analysis reveals critical gaps missed in earlier stages
   - **Action**: Return to Stage 8 (Problem Decomposition) to update WBS with new constraints
2. **ROLLBACK-002**: Market opportunity size invalidates Stage 5 profitability model
   - **Action**: Return to Stage 5 (Profitability) to update financial projections
3. **ROLLBACK-003**: Chairman rejects gap analysis outputs
   - **Action**: Re-run Stage 9 with updated parameters (e.g., different risk profile)

**Rollback Procedure**:
1. Chairman triggers rollback via UI
2. System logs rollback event in `venture_rollbacks` table
3. Venture state reverts to target stage (e.g., Stage 8)
4. Stage 9 outputs marked as `SUPERSEDED` in database
5. Notification sent to Product Lead

**Proposed Artifacts**:
- `rollback/stage_09_rollback_logic.py` (rollback orchestration)
- `docs/stage_09_rollback_procedures.md` (rollback decision tree)
- Database table: `venture_rollbacks` (audit trail)

**SD Cross-Reference**: **(Feeds SD-ROLLBACK-001 if exists)** - "Implement rollback procedures for all stages"

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-09.md:46-49 "Define rollback decision tree"

---

## Gap 5: No Customer Integration

**Source**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-09.md:51-54 "Customer Integration: No customer interaction"

**Current State**: Internal analysis stage with no customer touchpoint

**Target State**: Customer validation checkpoint in Stage 9.3 (Opportunity Modeling)

**Impact**:
- **Market Validation**: Gap analysis is based on assumptions, not customer feedback
- **Product-Market Fit**: Opportunity prioritization may not align with customer needs
- **Risk**: Building capabilities customers don't value

**Severity**: LOW (customer validation exists in other stages, but would strengthen Stage 9)

**Proposed Solution**:
Add optional customer validation step in Stage 9.3:
1. After opportunity matrix is created, send survey to target customers:
   - "Which opportunities are most valuable to you?"
   - "Which capabilities are must-haves vs nice-to-haves?"
2. Incorporate customer feedback into opportunity prioritization:
   - Weight opportunities by customer votes
   - Adjust gap priority based on customer importance ratings
3. Update opportunity matrix with customer validation scores

**Proposed Artifacts**:
- `tools/customer_survey_tool.py` (send surveys, collect feedback)
- `tasks/stage_09_3_customer_validation.py` (optional CrewAI task)
- `docs/stage_09_customer_validation.md` (when to use, survey templates)

**SD Cross-Reference**: **(Feeds SD-CUSTOMER-FEEDBACK-001 if exists)** - "Integrate customer validation into Stage 9"

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-09.md:51-54 "Consider adding customer feedback loop"

---

## Gap 6: No Recursion Logic

**Source**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-09.md:28-71 "No Recursive Workflow Behavior section"

**Current State**: Stage 9 has no defined recursion triggers (outbound or inbound)

**Target State**: Recursion logic for Stage 9 to trigger recursion to Stage 7, 5, 8 when gap analysis reveals upstream assumption errors

**Impact**:
- **Feedback Loop**: Critical gaps cannot automatically trigger timeline/budget adjustments in Stage 7
- **Financial Validation**: Small market opportunities cannot trigger recursion to Stage 5 to update profitability model
- **Quality**: Ventures proceed with known gaps that invalidate earlier planning

**Severity**: HIGH (recursion is core to unified venture creation system)

**Proposed Solution**:
Implement 4 recursion triggers (as documented in File 07):
1. **GAP-001**: Critical gaps require 3+ months to close → Recurse to Stage 7 (timeline adjustment)
2. **GAP-002**: Gap closure costs exceed budget by 25%+ → Recurse to Stage 7 (budget adjustment)
3. **GAP-003**: Opportunity size (SOM) below break-even → Recurse to Stage 5 (financial model update)
4. **GAP-004**: Required capabilities reveal WBS underestimated complexity → Recurse to Stage 8 (re-decompose)

**Proposed Artifacts**:
- `recursion/stage_09_recursion_engine.py` (GAP-001, GAP-002, GAP-003, GAP-004 trigger logic)
- `recursion/recursion_thresholds.yaml` (configurable thresholds for each trigger)
- Database updates: Add recursion event logging to `recursion_events` table

**SD Cross-Reference**: **(Feeds SD-RECURSION-AI-002 if exists)** - "Design and implement Stage 9 recursion logic"

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-09.md:28-71 "No recursion section"
**Evidence**: File 07 documentation in this dossier (proposed recursion logic)

---

## Gap 7: Missing Tool Integrations

**Source**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-09.md:25 "Missing specific tool integrations"

**Current State**: No integrations with market research platforms, competitor analysis tools, or capability databases

**Target State**: API integrations with external data sources to automate market research

**Impact**:
- **Automation**: Cannot automate opportunity modeling without market data APIs
- **Accuracy**: Manual market research is slower and less accurate
- **Cost**: Paying analysts to manually gather data that could be automated

**Severity**: MEDIUM (blocks automation but manual workaround exists)

**Proposed Solution**:
Integrate with:
1. **Market Research APIs**:
   - Gartner API (market size estimates)
   - Forrester API (industry trends)
   - Google Trends API (search volume for keywords)
2. **Competitor Analysis Tools**:
   - BuiltWith API (competitor tech stack)
   - SimilarWeb API (competitor traffic/engagement)
   - Crunchbase API (competitor funding/valuation)
3. **Internal Capability Database**:
   - HR system API (employee skills, certifications)
   - Tooling inventory API (software licenses, infrastructure access)
   - Project history API (past project delivery metrics)

**Proposed Artifacts**:
- `integrations/market_research_apis.py` (Gartner, Forrester, Google Trends)
- `integrations/competitor_analysis_apis.py` (BuiltWith, SimilarWeb, Crunchbase)
- `integrations/capability_inventory_api.py` (HR, tooling, project history)

**SD Cross-Reference**: **(Feeds SD-INTEGRATIONS-003 if exists)** - "Integrate Stage 9 with market research and competitor analysis APIs"

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-09.md:25 "Missing specific tool integrations"

---

## Gap 8: No Error Handling

**Source**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-09.md:26 "No explicit error handling"

**Current State**: No documented error handling for Stage 9 failures

**Target State**: Comprehensive error handling with graceful degradation

**Impact**:
- **Reliability**: Stage 9 failures crash venture progression
- **User Experience**: No user-friendly error messages
- **Debugging**: Difficult to diagnose Stage 9 failures

**Severity**: MEDIUM (does not block implementation but reduces production-readiness)

**Proposed Solution**:
Define error handling for common failure modes:
1. **Insufficient Market Data**:
   - Error: `MARKET_DATA_INCOMPLETE`
   - Mitigation: Halt Stage 9, notify Product Lead to gather more data, retry
2. **Capability Inventory Missing**:
   - Error: `CAPABILITY_INVENTORY_UNAVAILABLE`
   - Mitigation: Run manual capability audit, bootstrap inventory, retry
3. **ROI Calculation Errors**:
   - Error: `ROI_CALCULATION_FAILED`
   - Mitigation: Use industry benchmarks, flag as estimates, proceed with warning
4. **API Failures** (market research APIs down):
   - Error: `EXTERNAL_API_FAILURE`
   - Mitigation: Fall back to manual data entry, retry API after timeout

**Proposed Artifacts**:
- `error_handling/stage_09_error_handlers.py` (error detection and recovery)
- `docs/stage_09_error_handling.md` (error codes, mitigation strategies)
- Monitoring: Log all Stage 9 errors to `venture_errors` table for analysis

**SD Cross-Reference**: **(Feeds SD-ERROR-HANDLING-001 if exists)** - "Implement comprehensive error handling for all stages"

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-09.md:26 "No explicit error handling"
**Evidence**: File 06 (Agent Orchestration) error handling section

---

## Backlog Summary

**Total Gaps**: 8
**Severity Breakdown**:
- HIGH: 3 (Automation, Metric Thresholds, Recursion Logic)
- MEDIUM: 4 (Data Flow, Rollback Procedures, Tool Integrations, Error Handling)
- LOW: 1 (Customer Integration)

**Estimated Effort**:
- Gap 1 (Automation): 4 weeks (CrewAI agents, tools, tasks)
- Gap 2 (Metric Thresholds): 1 week (configuration, validation logic)
- Gap 3 (Data Flow): 2 weeks (schemas, validation, documentation)
- Gap 4 (Rollback Procedures): 2 weeks (logic, UI, database)
- Gap 5 (Customer Integration): 2 weeks (surveys, feedback collection)
- Gap 6 (Recursion Logic): 3 weeks (4 triggers, thresholds, integration)
- Gap 7 (Tool Integrations): 3 weeks (API integrations, error handling)
- Gap 8 (Error Handling): 1 week (error handlers, logging)

**Total Estimated Effort**: 18 weeks (assumes sequential work, could parallelize)

**Priority Order** (based on severity and dependencies):
1. **Gap 2** (Metric Thresholds) - Unblocks automation and validation
2. **Gap 6** (Recursion Logic) - Core to unified venture system
3. **Gap 1** (Automation) - High ROI, reduces manual effort
4. **Gap 7** (Tool Integrations) - Enables automation
5. **Gap 3** (Data Flow) - Improves quality
6. **Gap 8** (Error Handling) - Production-readiness
7. **Gap 4** (Rollback Procedures) - Risk management
8. **Gap 5** (Customer Integration) - Nice-to-have enhancement

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-09.md:67-71 "Recommendations Priority"

---

## Cross-Reference: Strategic Directives

**Potential SDs that would address these gaps**:
- **SD-RECURSION-AI-002**: "Design and implement recursion logic for Stages 9, 11-40" (addresses Gap 6)
- **SD-AUTOMATION-003**: "Automate Stages 9-15 with AI agents" (addresses Gap 1)
- **SD-VALIDATION-004**: "Define and enforce metric thresholds for all stages" (addresses Gap 2)
- **SD-DATA-QUALITY-002**: "Document and enforce data schemas for all stages" (addresses Gap 3)
- **SD-ROLLBACK-001**: "Implement rollback procedures system-wide" (addresses Gap 4)
- **SD-INTEGRATIONS-003**: "Integrate with external market research and competitor analysis APIs" (addresses Gap 7)
- **SD-ERROR-HANDLING-001**: "Implement comprehensive error handling for all stages" (addresses Gap 8)
- **SD-CUSTOMER-FEEDBACK-001**: "Integrate customer validation checkpoints into ideation stages" (addresses Gap 5)

**Note**: These SD references are proposed based on logical system design. Actual SD IDs may differ.

---

## Sources Table

| Source | Repo | Commit | Path | Lines | Purpose |
|--------|------|--------|------|-------|---------|
| critique | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-09.md | 22-71 | Weaknesses, improvements, recommendations |

---

<!-- Generated by Claude Code Phase 5 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
