# Gap Analysis — CrewAI Architecture

**Strategic Directive**: SD-CREWAI-ARCHITECTURE-001
**Phase**: Discovery (Phase 1)
**Generated**: 2025-11-06
**Analysis Scope**: Database records vs. Python codebase vs. Governance system

---

## Executive Summary

### Three-Way Discrepancy Identified

**Python Codebase** (operational source of truth):
- 16 crews implemented (`/ehg/agent-platform/app/crews/*.py`)
- 45 agents implemented (`/ehg/agent-platform/app/agents/**/*.py`)
- 19,033 total lines of code (crews + agents)

**EHG Application Database** (partial registration):
- 2 crews registered in `crewai_crews` table
- 30 agents registered in `crewai_agents` table
- 8 crew member assignments in `crew_members` table

**EHG_Engineer Database** (governance layer):
- 0 CrewAI crews registered
- 0 CrewAI agents registered
- 3 LEO agents + 15 sub-agents (separate system)

### Critical Gaps

| Gap Type | Expected | Actual | Missing | Gap % |
|----------|----------|--------|---------|-------|
| **Crews: Python → Database** | 16 | 2 | 14 | 88% |
| **Agents: Python → Database** | 45 | 30 | 15 | 33% |
| **Agents: Database → Governance** | 30 | 0 | 30 | 100% |

---

## Gap #1: Crew Registration (Python → Database)

### Python Codebase (16 crews)

| # | Crew Name | File | LOC | Agents Configured | DB Status |
|---|-----------|------|-----|-------------------|-----------|
| 1 | AdvertisingCrew | `advertising_crew.py` | 143 | 0 | ❌ NOT REGISTERED |
| 2 | BoardDirectorsCrew | `board_directors_crew.py` | 871 | 0 | ✅ REGISTERED (id: 2) |
| 3 | BrandingCrew | `branding_crew.py` | 143 | 0 | ❌ NOT REGISTERED |
| 4 | CustomerSuccessCrew | `customer_success_crew.py` | 128 | 0 | ❌ NOT REGISTERED |
| 5 | DeepResearchCrew | `deep_research_crew.py` | 331 | 0 | ✅ REGISTERED (id: 1) |
| 6 | FinanceDepartmentCrew | `finance_department_crew.py` | 165 | 0 | ❌ NOT REGISTERED |
| 7 | HierarchicalCrew | `hierarchical_crew.py` | 489 | 2 | ❌ NOT REGISTERED |
| 8 | InvestorRelationsCrew | `investor_relations_crew.py` | 179 | 0 | ❌ NOT REGISTERED |
| 9 | LegalDepartmentCrew | `legal_department_crew.py` | 147 | 0 | ❌ NOT REGISTERED |
| 10 | MarketingDepartmentCrew | `marketing_department_crew.py` | 37 | 0 | ❌ NOT REGISTERED |
| 11 | ProductManagementCrew | `product_management_crew.py` | 94 | 0 | ❌ NOT REGISTERED |
| 12 | QuickValidationCrew | `quick_validation_crew.py` | 264 | 0 | ❌ NOT REGISTERED |
| 13 | RDDepartmentCrew | `rd_department_crew.py` | 216 | 0 | ❌ NOT REGISTERED |
| 14 | SalesDepartmentCrew | `sales_department_crew.py` | 130 | 0 | ❌ NOT REGISTERED |
| 15 | SequentialCrew | `sequential_crew.py` | 278 | 0 | ❌ NOT REGISTERED |
| 16 | TechnicalCrew | `technical_crew.py` | 201 | 0 | ❌ NOT REGISTERED |

### Database Records (2 crews)

From `crewai_crews` table in EHG Application DB:

| ID | Name | Process Type | Verbose | Cache | Max RPM | Created |
|----|------|--------------|---------|-------|---------|---------|
| 1 | deep_research_crew | sequential | true | true | 10 | 2025-10-17 |
| 2 | board_directors_crew | sequential | true | true | 10 | 2025-10-17 |

### Analysis

**Only 2 of 16 crews (12.5%) are registered in the database.**

**Missing Crews (14)**:
1. AdvertisingCrew
2. BrandingCrew
3. CustomerSuccessCrew
4. FinanceDepartmentCrew
5. HierarchicalCrew
6. InvestorRelationsCrew
7. LegalDepartmentCrew
8. MarketingDepartmentCrew
9. ProductManagementCrew
10. QuickValidationCrew
11. RDDepartmentCrew
12. SalesDepartmentCrew
13. SequentialCrew
14. TechnicalCrew

**Root Cause**: Manual registration process, not automated. Only 2 crews explicitly inserted during initial platform setup.

**Impact**:
- Cannot query which crews exist
- Cannot track crew execution history for missing crews
- Cannot map stages → crews for unregistered crews

---

## Gap #2: Agent Registration (Python → Database)

### Python Codebase (45 agents)

**Agents by Category** (from scan):

| Category | Count | Sample Agents |
|----------|-------|---------------|
| **core** | 15 | CEOAgent, COOAgent, BaseAgent, ComplexityAssessment, MarketSizing |
| **finance** | 4 | BurnRateAgent, FinancialViabilityAgent, InvestmentAnalysisAgent, ValuationAgent |
| **marketing** | 4 | CompetitiveAnalysisAgent, CustomerSegmentationAgent, MarketPositioningAgent, PainPointAnalysisAgent |
| **advertising** | 3 | AdCampaignAgent, MediaPlanningAgent, PerformanceMarketingAgent |
| **branding** | 3 | BrandPositioningAgent, IdentityAgent, MessagingAgent |
| **investor_relations** | 3 | FundraisingStrategyAgent, InvestorTargetingAgent, PitchDeckAgent |
| **product** | 3 | FeaturePrioritizationAgent, ProductMarketFitAgent, RoadmapAgent |
| **rd** | 3 | DuplicateDetectionAgent, [2 more from scan] |
| **sales** | 3 | [Sales agents from scan] |
| **customer_success** | 2 | CustomerResearchAgent, RetentionAnalysisAgent |
| **legal** | 2 | ContractAnalysisAgent, IPAnalysisAgent |

**Total**: 45 agent Python files

### Database Records (30 agents)

From `crewai_agents` table in EHG Application DB:

**Sample agents registered** (30 total, see database_analysis.md for full list):
- Senior Software Engineer
- Junior Software Engineer
- Database Administrator
- Technical Lead
- API Integration Specialist
- Code Reviewer
- Documentation Specialist
- DevOps Engineer
- System Architect
- Performance Analyst
- QA Lead
- Test Automation Engineer
- [18 more agents...]

### Analysis

**30 of 45 agents (67%) are registered in the database.**

**Missing Agents (15)**: These Python agent files exist but have no corresponding database records:
1. BaseAgent (infrastructure class)
2. ComplexityAssessment
3. MarketSizing
4. CEOAgent
5. COOAgent
6. [10 more from Python scan missing from DB]

**Hypothesis**: The 30 registered agents may represent a DIFFERENT set of agents than the 45 Python files. Need to cross-reference agent names/roles to confirm overlap.

**Key Observation**: Database agents have roles like "Senior Software Engineer" while Python files have names like "CEOAgent", "FinancialViabilityAgent". This suggests:
- **Two separate agent populations**: R&D department agents (DB) vs. venture analysis agents (Python)
- **OR**: Different naming conventions for same agents

**Action Required**: Manual cross-reference of Python agent roles vs. database agent roles to determine true overlap.

---

## Gap #3: Governance Registration (Database → Governance)

### EHG Application Database (30 agents)

**All 30 agents** in `crewai_agents` table are operational CrewAI agents with:
- Defined roles
- Goal statements
- Backstories
- Tool configurations
- Execution tracking

### EHG_Engineer Database (0 agents)

**Zero CrewAI agents** registered in governance system:
- `leo_agents` table contains only 3 LEO agents (LEAD, PLAN, EXEC)
- `leo_sub_agents` table contains 15 sub-agents (Database, QA, Security, etc.)
- No table linking CrewAI agents to LEO governance

### Analysis

**100% governance gap**: All operational CrewAI agents exist without governance registration.

**Implications**:
- No LEAD approval for agent deployment
- No PRD documenting agent capabilities
- No quality gates for agent changes
- No audit trail for agent operations
- No compliance tracking

**Risk Level**: 🔴 HIGH — Ungoverned agents operating in production

---

## Gap #4: Crew Member Assignments

### Database Records (8 assignments)

From `crew_members` table:

**Known Assignments**:
- 8 agent-to-crew assignments exist (see database_analysis.md for details)
- Only covers 2 crews (deep_research_crew, board_directors_crew)
- All other 14 crews have zero assigned agents in database

### Python Codebase (crew agent assignments)

**HierarchicalCrew** explicitly configures 2 agents in code:
- `self.manager_agent = ...`
- `self.researcher_agent = ...`

**Other crews**: Agent assignments may be dynamic (instantiated at runtime) rather than declared in crew file.

### Analysis

**Gap**: Cannot determine crew membership for 14 unregistered crews without runtime inspection.

**Action Required**: Trace crew execution logs or add instrumentation to capture runtime agent assignments.

---

## Gap #5: Stage → Agent/Crew Mappings

### Current State

**Known Mappings** (from SD description):
- Stages 1-3 use "some agents/crews" (exact mappings unknown)

**Database Support**: No table exists for `stage_agent_mappings` or similar.

**Dossier References**: Stage Operating Dossiers (Stages 1-40) mention agents/crews but have no database linkage.

### Analysis

**100% gap**: No structured data linking stages to agents/crews.

**Impact**:
- Cannot query "which agents work on Stage 4?"
- Cannot generate Stage Operating Dossiers with actual agent metadata
- Cannot track which stages are blocked by missing agents

**Action Required**: Design `stage_agent_mappings` table schema (Phase 2).

---

## Gap #6: Execution Tracking

### EHG Application Database

**Flow Executions**: `crewai_flow_executions` table has 0 rows
- Flow orchestration exists but has never run
- No historical execution data

**Agent Executions**: Partition tables exist (`agent_executions_2025_10`, etc.)
- Schema supports execution tracking
- Unknown if any executions logged (need to query partitions directly)

### EHG_Engineer Database

**Flow Executions**: `crewai_flow_executions` table has 0 rows
- Mirror of application table, also empty

**Sub-Agent Executions**: `sub_agent_execution_results` table has 1,514 rows
- LEO sub-agents have extensive execution history
- CrewAI agents have zero governance-tracked executions

### Analysis

**Execution tracking exists in application DB but not connected to governance.**

**Gap**: No unified view of LEO sub-agent executions vs. CrewAI agent executions.

---

## Gap #7: Schema Divergence Risk

### Duplicate Table Names

Both databases contain:
- `crewai_flows`
- `crewai_flow_executions`
- `crewai_flow_templates`
- `sub_agent_execution_results`

### Analysis

**Risk**: Schema changes in one database may not propagate to the other.

**Example Scenario**:
1. Developer adds column to `crewai_agents` in EHG Application DB
2. Sync script expects old schema in EHG_Engineer DB
3. Integration breaks silently

**Mitigation**: Schema version tracking and automated validation (Phase 2).

---

## Consolidated Gap Summary

| Gap | Description | Severity | Impact | Missing Count |
|-----|-------------|----------|--------|---------------|
| **Crew Registration** | 14 Python crews not in DB | 🔴 HIGH | Cannot query/track crews | 14 crews |
| **Agent Registration** | 15 Python agents not in DB | 🟡 MEDIUM | Incomplete agent registry | 15 agents |
| **Governance Registration** | 30 DB agents not in governance | 🔴 HIGH | Zero oversight/compliance | 30 agents |
| **Crew Member Assignments** | 14 crews with unknown members | 🟡 MEDIUM | Cannot map crew→agents | ~56 assignments (est.) |
| **Stage Mappings** | No stage→agent/crew links | 🟡 MEDIUM | Cannot generate dossiers | ~160 mappings (40 stages × 4 avg) |
| **Execution Tracking** | CrewAI executions not in governance | 🟡 MEDIUM | No audit trail | N/A (design gap) |
| **Schema Divergence** | Duplicate tables, no versioning | 🟢 LOW | Future integration failures | 4 tables at risk |

---

## Root Cause Analysis

### Why Do These Gaps Exist?

1. **Manual Registration Process**:
   - Crews/agents added to Python code without corresponding DB inserts
   - No automated registration on deployment

2. **Two Separate Development Tracks**:
   - CrewAI platform developed independently from governance system
   - EHG Application (operational) vs. EHG_Engineer (governance) evolved separately

3. **No Cross-Database Integration Layer**:
   - No bridge between operational and governance databases
   - No sync mechanism or event-driven updates

4. **Governance System Scope**:
   - LEO Protocol initially focused on LEO agents (LEAD, PLAN, EXEC)
   - CrewAI agents were operational concern, not governance concern
   - Shift in strategy (Stage Operating Dossiers) now requires governance

---

## Recommended Actions (Phase 2 Planning)

### Immediate Actions (Week 1)

1. **Manual Crew Registration**:
   - Insert 14 missing crews into `crewai_crews` table
   - Script: `INSERT INTO crewai_crews (name, process, verbose, cache, max_rpm) VALUES ...`
   - Verify against Python class names

2. **Agent Name Cross-Reference**:
   - Compare Python agent roles vs. database agent roles
   - Determine true overlap (are they the same 30 agents or different populations?)
   - Document mapping in `agent_name_mapping.csv`

3. **RLS Policy Implementation**:
   - Add policies to partition tables (`agent_executions_2025_*`)
   - Ensure data security before governance integration

### Short-Term Actions (Weeks 2-4)

4. **Governance Registration**:
   - Design `leo_to_crewai_agent_mapping` table
   - Create migration script to copy 30 agents from EHG Application → EHG_Engineer
   - Establish LEAD approval workflow for new agents

5. **Stage Mapping Table**:
   - Design `stage_agent_mappings` schema
   - Seed initial mappings for known stages (1-3)
   - Backfill from Stage Operating Dossier descriptions

6. **Crew Member Assignment Instrumentation**:
   - Add logging to crew instantiation to capture runtime agent assignments
   - Populate `crew_members` table with actual assignments

### Medium-Term Actions (Weeks 5-8)

7. **Automated Registration**:
   - Build Python decorator: `@register_agent(role="...", goal="...")`
   - On agent instantiation → insert/update database record
   - Same for crews: `@register_crew(name="...")`

8. **Sync Mechanism**:
   - Event-driven: Python agent updated → webhook to governance system
   - Batch sync script: nightly reconciliation of Python ↔ DB ↔ Governance

9. **Schema Versioning**:
   - Add `schema_version` column to duplicate tables
   - Validation script: ensure EHG Application and EHG_Engineer schemas match
   - Migration framework for coordinated schema changes

---

## Success Metrics (Phase 2 Goals)

| Metric | Current | Target | Validation |
|--------|---------|--------|------------|
| Crew Registration | 2/16 (12%) | 16/16 (100%) | Query `crewai_crews`, count rows |
| Agent Registration | 30/45 (67%) | 45/45 (100%) | Query `crewai_agents`, count rows |
| Governance Registration | 0/30 (0%) | 30/30 (100%) | Query `leo_to_crewai_agent_mapping` |
| Crew Member Assignments | 8 known | ~64 (16 crews × 4 avg) | Query `crew_members`, count rows |
| Stage Mappings | 0 | ~160 (40 stages × 4 avg) | Query `stage_agent_mappings` |
| RLS Coverage (EHG App) | 17/20 (85%) | 20/20 (100%) | Query `pg_policies` |
| Schema Version Tracking | ❌ None | ✅ Implemented | Check `schema_version` columns |

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Data loss during migration | 🟢 LOW | 🔴 HIGH | Backup before any DB writes, dry-run scripts |
| Schema migration breaks existing code | 🟡 MEDIUM | 🔴 HIGH | Backward-compatible changes only, feature flags |
| Governance overhead slows development | 🟡 MEDIUM | 🟡 MEDIUM | Automated registration, lightweight approval |
| Duplicate agents created during sync | 🟡 MEDIUM | 🟡 MEDIUM | Unique constraints, conflict resolution logic |

---

## Dependencies for Phase 2 (PLAN)

**Blocked Until**:
1. ✅ Discovery complete (this document + database analysis)
2. ⏳ Chairman LEAD Gate approval to proceed
3. ⏳ Stakeholder alignment on governance strategy

**Blocking**:
- Stage Operating Dossier generation (cannot populate agent metadata)
- Automated stage transitions (requires stage→agent mappings)
- Compliance audits (no governance trail for CrewAI agents)

---

## Related Artifacts

**Generated Deliverables**:
1. `database_analysis.md` (831 KB) — Full dual-database schema analysis
2. `EXECUTIVE_SUMMARY.md` (7 KB) — Database findings summary
3. `crew_inventory_python.csv` (16 rows) — Python crew scan
4. `agent_inventory_python.csv` (45 rows) — Python agent scan
5. `python_platform_summary.md` (this document's data source)
6. `gap_analysis.md` (this document)

**Utility Scripts**:
- `scripts/analyze-crewai-dual-databases.js` — Database analysis (reusable)
- `scripts/scan-crewai-python-platform.js` — Python scan (reusable)

---

## Next Steps

**For Chairman**:
1. Review this gap analysis + EXECUTIVE_SUMMARY.md
2. Decide: Proceed to PLAN phase, defer, or cancel SD
3. If proceeding: Confirm governance strategy (see stakeholder questions in EXECUTIVE_SUMMARY.md)

**For PLAN Phase** (if approved):
1. Design governance-operational integration architecture
2. Create PRD for agent registration migration
3. Define RLS policy patterns
4. Establish schema versioning framework
5. Design stage→agent mapping schema

---

**LEO Protocol Compliance**: This document is part of SD-CREWAI-ARCHITECTURE-001 Phase 1 Discovery. No code changes, no schema modifications per approval constraints.

---

<!-- Gap Analysis | SD-CREWAI-ARCHITECTURE-001 | Generated 2025-11-06 -->
