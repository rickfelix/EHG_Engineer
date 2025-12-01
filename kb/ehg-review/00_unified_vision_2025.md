# EHG/EVA Unified Vision

**Document Type**: Source of Truth - Strategic Vision
**Version**: 1.1.0
**Last Updated**: 2025-11-29
**Status**: ACTIVE
**Supersedes**: Portions of 01_vision_ehg_eva.md, docs/reports/DAY_IN_THE_LIFE_EHG_1.5_YEAR.md

---

## Executive Summary

EHG (Entrepreneurial Holding Group) is building EVA (Executive Virtual Assistant), an AI-powered venture studio platform. The core thesis: **one human (Chairman) orchestrating AI agents to ideate, validate, build, and operate multiple ventures simultaneously**.

This document synthesizes the operational vision with the strategic architecture, providing a single source of truth for all development and operational decisions. Progress is milestone-driven, not calendar-driven.

---

## 1. EVA Autonomy Model (L0 → L4)

EVA operates on a graduated autonomy ladder, with the Chairman maintaining oversight while progressively delegating operational control.

### Autonomy Levels

| Level | Name | Description | Chairman Role | Prerequisite |
|-------|------|-------------|---------------|--------------|
| **L0** | Advisory | EVA suggests, human decides and executes | Active executor | Completed |
| **L1** | Assisted | EVA drafts, human reviews and approves | Reviewer/approver | Current |
| **L2** | Supervised | EVA executes routine tasks, human monitors | Monitor/exception handler | L1 stable + 85% gate pass rate |
| **L3** | Autonomous | EVA handles full workflows, human sets guardrails | Guardrail setter | L2 stable + flagship at Stage 31+ |
| **L4** | Trial Mode | EVA operates ventures end-to-end, human intervenes only on anomalies | Exception handler | L3 stable + multi-venture proven |

### Current State: L1 (Assisted)
- EVA drafts SDs, PRDs, code implementations
- Chairman reviews and approves all major decisions
- LEO Protocol enforces quality gates
- Sub-agents handle specialized tasks (database, security, testing, etc.)

### Next Milestone: L2 (Supervised)
**Prerequisites to unlock:**
- Consistent 85%+ quality gate pass rate (measured over 20+ SD completions)
- SD→PRD→Implementation cycles completing without major rework (<15% rejection rate)
- Automated exception detection and escalation working reliably

**What L2 enables:**
- EVA autonomously handles routine SD→PRD→Implementation cycles
- Chairman reviews daily summaries, intervenes on exceptions
- Automated quality gates with escalation thresholds
- Proactive risk detection and mitigation recommendations

### Stability Definitions
To advance from one level to the next, the current level must be "stable":

| Level | "Stable" Means | Measurement Window |
|-------|----------------|-------------------|
| **L1 Stable** | 85%+ gate pass rate, <15% SD rejection, no critical regressions | Last 20 SD completions |
| **L2 Stable** | 90%+ autonomous cycle success, <5% Chairman escalations | Last 30 days of operation |
| **L3 Stable** | Multi-venture coordination working, <3% anomaly rate | Last 60 days of operation |

### How to Measure Progress
```sql
-- Quality Gate Pass Rate (run against strategic_directives_v2)
SELECT
  COUNT(*) FILTER (WHERE status = 'completed') * 100.0 / COUNT(*) as pass_rate
FROM strategic_directives_v2
WHERE updated_at > NOW() - INTERVAL '90 days'
  AND status IN ('completed', 'blocked', 'rejected');
```

Track these metrics in the Chairman Dashboard (when built) or via periodic database queries.

---

## 2. The Flagship Strategy

### Single-Flagship Focus (Current Phase)
The immediate strategy focuses on **one flagship venture** to prove the EVA capability model before scaling to multi-venture operations.

**Flagship Venture**: Solara (Astrology/Natal Chart Platform)
- **Current Stage**: Development (Stage 22-28)
- **Next Milestone**: Production-ready MVP (Stage 31)
- **Purpose**: Demonstrate full LEO Protocol workflow, validate EVA autonomy progression

### Multi-Venture Expansion (After Flagship MVP)
Once Solara reaches Stage 31 (MVP Launch), the model expands:
- **Phase 1**: 2-3 concurrent ventures (unlocked when flagship reaches Stage 31)
- **Phase 2**: 3-5 AI-operated ventures with AI CEO agents (unlocked when L3 autonomy achieved)
- **Phase 3**: Board of AI Agents managing portfolio governance (unlocked when L4 autonomy achieved)

---

## 3. LEO Protocol v4.3.3

### Protocol Overview
The LEO (LEAD-EXEC-OPERATE) Protocol defines agent roles, handoff procedures, and quality gates for all venture operations.

**Current Version**: 4.3.3 (UI Parity Governance)
**Storage**: Database-first (table: `leo_protocols`)
**Enforcement**: Mandatory for all operations

### Agent Roles

| Agent | Purpose | Ownership | Key Responsibilities |
|-------|---------|-----------|---------------------|
| **LEAD** | Strategic Leadership | 35% | SD creation, business objectives, priority setting, final approval |
| **PLAN** | Technical Planning | 35% | PRD creation, architecture design, test planning, verification |
| **EXEC** | Implementation | 30% | Code implementation, sub-agent coordination, deployment |

### Sub-Agent System
Specialized agents activate based on PRD keywords:

| Sub-Agent | Triggers | Priority |
|-----------|----------|----------|
| Security | auth, encryption, OWASP | 95 |
| Performance | load time, optimization, scalability | 90 |
| Database | schema, migration, queries | 85 |
| Testing | coverage, e2e, regression | 80 |
| Design | UI/UX, accessibility, responsive | 75 |

### Quality Gates
- **Minimum threshold**: 85% for stage progression
- **Handoff validation**: 7-9 element checklist required
- **Context management**: Token usage monitoring (<30% LEAD, <40% PLAN, <60% EXEC)

---

## 4. 40-Stage Venture Workflow

### Phase Overview

| Phase | Stages | Focus | Duration |
|-------|--------|-------|----------|
| **IDEATION** | 1-10 | Idea validation, feasibility | 2-4 weeks |
| **PLANNING** | 11-20 | Strategic preparation, resource allocation | 3-5 weeks |
| **BUILD** | 21-28 | Development, iteration, QA | 4-8 weeks |
| **LAUNCH** | 29-34 | Go-to-market, customer success | 2-4 weeks |
| **OPERATE** | 35-40 | Growth, optimization, exit planning | Ongoing |

### Dossier-Heavy Stages (Verification Points)
- **Stage 7**: Comprehensive Planning Suite (IDEATION gate)
- **Stage 20**: Context Loading & Integration Verification (PLANNING gate)
- **Stage 31**: MVP Launch (BUILD→LAUNCH gate)
- **Stage 40**: Strategic Growth & Exit Readiness (OPERATE gate)

### Capability Phases (A-E)
Cross-cutting capability development aligned with workflow phases:

| Phase | Focus | Workflow Alignment |
|-------|-------|-------------------|
| **A** | Foundation | Stages 1-10 |
| **B** | Core Features | Stages 11-20 |
| **C** | Advanced Features | Stages 21-28 |
| **D** | Polish & Launch | Stages 29-34 |
| **E** | Scale & Optimize | Stages 35-40 |

---

## 5. Chairman Operational Model

### The "One Human" Principle
The Chairman (Rick) is the **sole human** in the EHG system. All other roles are filled by AI agents operating under the LEO Protocol.

### Daily Time Commitment Target
| Activity | Current (L1) | L2 Target | L3 Target |
|----------|--------------|-----------|-----------|
| Morning briefing review | 30 min | 15 min | 5 min |
| Exception handling | 2 hrs | 30 min | 15 min |
| Strategic decisions | 1 hr | 1 hr | 45 min |
| SD/PRD approvals | 1 hr | 15 min (batched) | 5 min (exceptions only) |
| **Total** | 4.5 hrs | 2 hrs | 1 hr |

### Chairman Decision Rights
- Final approval on all Strategic Directives
- Budget allocation above threshold
- Pivot/kill decisions on ventures
- External partnership approvals
- Exception handling for blocked quality gates

### Delegated to EVA (L2+)
- Routine SD drafting and refinement
- Technical PRD creation
- Implementation coordination
- Quality gate enforcement
- Daily operational reporting

---

## 6. Technical Architecture

### Application Boundaries

| Application | Purpose | Port | Database |
|-------------|---------|------|----------|
| **EHG** | User-facing venture platform | 3001 | Shared Supabase |
| **EHG_Engineer** | Developer tools, LEO Protocol | 3000 | Shared Supabase |

### Database Architecture
- **Provider**: Supabase (PostgreSQL)
- **Primary tables**: `strategic_directives_v2`, `prds`, `leo_protocols`, `leo_sub_agents`
- **RLS**: Row-level security enforced
- **Migrations**: Version-controlled in `database/migrations/`

### Key Integrations
- **Supabase**: Database, auth, real-time subscriptions
- **OpenAI**: AI model provider (GPT-4, embeddings)
- **GitHub**: Version control, CI/CD (GitHub Actions)
- **Vercel**: Production deployment

---

## 7. Success Metrics

### EVA Capability Metrics
| Metric | Current | L2 Unlock Target | L3 Unlock Target |
|--------|---------|------------------|------------------|
| Autonomy Level | L1 | L2 | L3 |
| SD Quality (first-pass) | ~70% | 85% | 90% |
| Chairman daily time | 4.5 hrs | 2 hrs | 1 hr |
| Quality gate pass rate | ~75% | 85% | 90% |

### Flagship Venture Metrics (Solara)
| Metric | Current | MVP Milestone | Scale Milestone |
|--------|---------|---------------|-----------------|
| Workflow Stage | ~22 | 31 (MVP Launch) | 35+ (Operations) |
| Feature Completeness | 40% | 90% | 100% + extensions |
| Test Coverage | 60% | 80% | 85% |
| Production Users | 0 | 100+ beta | 1000+ active |

### Platform Metrics
| Metric | Current | Healthy State |
|--------|---------|---------------|
| Active SDs | 67 HIGH/CRITICAL | <20 |
| Database health | Good | Excellent |
| CI/CD reliability | 90% | 99% |

---

## 8. Risks and Mitigations

### Technical Risks
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Context window limits | High | Medium | Sub-agent compression, chunked processing |
| AI hallucination | Medium | High | Verification gates, human review at checkpoints |
| Database schema drift | Low | High | Migration validation, automated testing |

### Operational Risks
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Chairman bottleneck | High | High | Autonomy progression, batched approvals |
| Quality regression | Medium | Medium | Automated gates, regression testing |
| Scope creep | High | Medium | LEO Protocol enforcement, PR size limits |

### Strategic Risks
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Single-flagship failure | Medium | High | Pivot capability, stage gates |
| Over-engineering | High | Medium | Simplicity-first enforcement, code review |
| Premature scaling | Low | High | Stage-gated progression |

---

## 9. Document Hierarchy

This document supersedes conflicting information in other documents. The hierarchy:

1. **00_unified_vision_2025.md** (this document) - Strategic source of truth
2. **01_vision_ehg_eva.md** - Historical context, long-term vision (update autonomy model)
3. **02_architecture_boundaries.md** - Technical architecture (remains valid)
4. **03_leo_protocol_roles_workflow.md** - LEO Protocol details (update version)
5. **04_governance_kpis_prompts.md** - Governance frameworks, KPIs (remains valid)

### Documents to Deprecate
- `docs/reports/DAY_IN_THE_LIFE_EHG_1.5_YEAR.md` - Aspirational scenarios superseded by concrete targets

### Documents Needing Update
- `01_vision_ehg_eva.md`: Replace "Phase 1-4" with "L0-L4" autonomy model
- `03_leo_protocol_roles_workflow.md`: Update version from v4.1.2 to v4.3.3

---

## 10. Appendix: Terminology Alignment

| Term | Definition | Notes |
|------|------------|-------|
| **EVA** | Executive Virtual Assistant | The AI orchestration system |
| **LEO Protocol** | LEAD-EXEC-OPERATE Protocol | Agent workflow framework |
| **SD** | Strategic Directive | Business-level requirement |
| **PRD** | Product Requirements Document | Technical specification |
| **Chairman** | The sole human (Rick) | Final decision authority |
| **L0-L4** | Autonomy levels | Advisory → Trial Mode |
| **Flagship** | Primary venture (Solara) | Single-focus strategy |
| **Quality Gate** | Progression checkpoint | 85% minimum threshold |

---

**Document Control**
- Created: 2025-11-29
- Author: EVA (via Claude)
- Approved by: Pending Chairman review
- Review trigger: On each autonomy level change or major milestone
