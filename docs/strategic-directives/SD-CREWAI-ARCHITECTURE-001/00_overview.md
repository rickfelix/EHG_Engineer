# SD-CREWAI-ARCHITECTURE-001 — Overview

**Strategic Directive ID**: SD-CREWAI-ARCHITECTURE-001
**Title**: CrewAI Architecture Assessment & Agent/Crew Registry Consolidation
**Status**: draft
**Current Phase**: LEAD_APPROVAL
**Category**: infrastructure
**Priority**: critical
**Target Application**: EHG
**Progress**: 0%

**Created**: 2025-11-05 13:14:10 GMT-0500
**Updated**: 2025-11-05 13:14:10 GMT-0500

---

## Executive Summary

Comprehensive assessment of CrewAI infrastructure to resolve duplication between Python code (`/ehg/agent-platform/`) and empty database tables (`crewai_agents`, `crewai_crews`, etc.). Establish clean agent/crew registry architecture as foundation for Stage Operating Dossier system.

### Discovery Context

During Phase 0 discovery for Stage Operating Dossier project, found operational Python CrewAI platform (`/ehg/agent-platform/`, port 8000) with 15+ crews and 15+ agents in code, but ALL related database tables empty (0 rows). This creates:

- No single source of truth for agent/crew registry
- Cannot query which agents/crews exist
- Cannot map stages → agents/crews
- Cannot track execution history
- Blocks Stage Dossier generation

**Estimated Effort**: 80 hours (2 weeks)

---

## Scope

### INCLUDED IN SCOPE

#### 1. Discovery & Documentation (Phase 1) — **IN PROGRESS**

- Audit all Python agents in `/ehg/agent-platform/app/agents/`
- Audit all Python crews in `/ehg/agent-platform/app/crews/`
- Document current CrewAI table schemas (both databases)
- Map which stages use which agents/crews (known: Stages 1-3)

#### 2. Architecture Decision (Phase 2)

- Source of truth: Python code vs. database vs. hybrid?
- Agent/crew registration strategy (manual vs. auto-scan)
- Execution tracking approach (DB only or code+DB)
- Stage → agent/crew mapping storage location

#### 3. Database Consolidation (Phase 3)

- Populate `crewai_agents` table (scan Python or manual)
- Populate `crewai_crews` table
- Populate `crew_members` table (agent-to-crew mappings)
- Create `stage_agent_mappings` table (new)
- Seed initial data for operational agents/crews

#### 4. Integration Layer (Phase 4)

- Python registration script (scan code → insert DB)
- Query layer for Stage Dossiers (DB → agent metadata)
- Execution tracking (`crewai_flow_executions`)
- Documentation of patterns for future agents

### EXCLUDED FROM SCOPE

- Refactoring Python code to read from DB (future iteration)
- Building visual workflow UI (uses `crewai_flows`, future work)
- Migrating Node.js sub-agents to database (separate system)
- Agent performance optimization (SD-AGENT-OPTIMIZATION-002)

---

## Systems Affected

- `/ehg/agent-platform/` (Python CrewAI platform, port 8000)
- `crewai_agents`, `crewai_crews`, `crew_members` tables (EHG DB)
- `crewai_flows`, `crewai_flow_executions` tables (EHG_Engineer DB)
- Stage Operating Dossier generation system (blocked)
- Future stage → agent orchestration automation

---

## Current Phase: Phase 1 — Discovery & Documentation

**Status**: IN PROGRESS (as of 2025-11-06)

**Objectives**:
1. ✅ Create SD folder structure
2. ✅ Generate `00_overview.md` (this document)
3. ⏳ Dual-database analysis (EHG_Engineer + EHG Application)
4. ⏳ Python platform inventory (crews and agents)
5. ⏳ Gap analysis
6. ⏳ Discovery report with recommendations

**Deliverables**:
- `discovery/database_analysis.md` — Dual-database schema and data analysis
- `discovery/crew_inventory_python.csv` — Complete Python crew inventory
- `discovery/agent_inventory_python.csv` — Complete Python agent inventory
- `discovery/gap_analysis.md` — Discrepancies and recommendations
- `discovery/crewai_alignment_report.md` — Executive summary for LEAD gate

**LEAD Gate Decision**: After discovery phase completion, Chairman will review findings and decide whether to proceed to Phase 2 (Architecture Decision), defer, or cancel.

---

## Evidence & Citations

**Database Record Source**:
```bash
node scripts/query-strategic-directives.js --id SD-CREWAI-ARCHITECTURE-001
```

**Related Documentation**:
- `/docs/workflow/stage4_review/00_foundation_verification_CORRECTED.md` — P0 SD verification
- `/docs/workflow/stage4_review/01_p0_dependency_analysis.md` — Dependency analysis
- `/docs/workflow/stage4_review/02_chairman_decision_summary.md` — Strategic context

**Database Locations**:
- **EHG_Engineer** (dedlbzhpgkmetvhbkyzq): Governance, SDs, LEO Protocol
- **EHG Application** (liapbndqlqxdcgpwntbv): CrewAI platform, venture management

---

**LEO Protocol Compliance**: All work under this SD follows LEAD→PLAN→EXEC governance structure. Phase 1 is documentation-only (no code changes, no schema modifications).

---

<!-- SD-CREWAI-ARCHITECTURE-001 Overview | Generated 2025-11-06 -->
