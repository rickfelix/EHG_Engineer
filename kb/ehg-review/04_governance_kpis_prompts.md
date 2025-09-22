# 04_governance_kpis_prompts.md

## Why This Matters
Governance frameworks, KPI tracking, and standardized prompts ensure consistent execution, measurable progress, and continuous improvement across the EHG platform. This document provides the operational templates, metrics, and decision frameworks that drive portfolio success.

---

## SDIP MVP+ (Strategic Directive Intelligent Processing)

### Overview
SDIP is the automated intake and processing system for strategic directives, transforming Chairman input into actionable work items through intelligent gate progression.

### Core Components

#### Submission Intake
```javascript
// Directive submission structure
{
  chairman_input: "Raw input from Chairman",
  intent_summary: "AI-analyzed intent",
  screenshot_url: "Visual context if provided",
  status: "pending|processing|completed|failed",
  gate_status: {
    gates_passed: ["intent_analysis", "validation"],
    current_gate: "sd_creation",
    resulting_sd_id: "SD-XXX"
  }
}
```

#### Gate Progression
1. **Intent Analysis**: Extract core intent from input
2. **Validation**: Verify feasibility and alignment
3. **Categorization**: Assign to appropriate category
4. **Prioritization**: Determine urgency and impact
5. **SD Creation**: Generate strategic directive
6. **Handoff**: Transfer to LEAD agent

#### Processing Rules
- **Auto-consolidation**: Group related items into single SDs
- **Duplicate detection**: Prevent redundant directives
- **Priority inference**: Derive from keywords and context
- **Resource estimation**: Calculate required effort
- **Risk assessment**: Identify potential blockers

### SDIP Metrics
| Metric | Target | Formula | Notes |
|--------|--------|---------|-------|
| **Processing Time** | <5 min | End-to-end duration | From submission to SD |
| **Auto-approval Rate** | >70% | Auto-approved / Total | No human intervention |
| **Intent Accuracy** | >90% | Correct intent / Total | Validated by Chairman |
| **Consolidation Rate** | >50% | Consolidated / Total | Efficiency measure |
| **Gate Pass Rate** | >85% | Passed / Attempted | First attempt success |

---

## PRD Template

### Standard Structure

```markdown
# PRD-[ID]: [Title]

## Executive Summary
Brief overview of what's being built and why

## Strategic Alignment
- **Strategic Directive**: SD-XXX
- **Business Objectives**: [List objectives]
- **Success Criteria**: [Measurable outcomes]

## Technical Specifications
### Architecture
- System design and components
- Data flow and storage
- Integration points

### Implementation Requirements
- Core features and functionality
- UI/UX specifications
- Performance requirements

## Test Plan
### Test Coverage
- Unit tests (>80%)
- Integration tests
- E2E scenarios
- Performance benchmarks

### Acceptance Criteria
- [ ] Functional requirements met
- [ ] Performance targets achieved
- [ ] Security standards implemented
- [ ] Accessibility compliance verified

## Risks & Mitigation
| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| [Risk description] | High/Med/Low | High/Med/Low | [Strategy] |

## Resource Requirements
- **Development**: [Hours/sprints]
- **Infrastructure**: [Services needed]
- **Dependencies**: [External requirements]

## Timeline
- **Start Date**: [Date]
- **MVP Delivery**: [Date]
- **Full Delivery**: [Date]

## Sub-Agent Requirements
Automatically activated sub-agents based on content:
- [ ] Performance (if load time mentioned)
- [ ] Security (if auth mentioned)
- [ ] Database (if schema mentioned)
- [ ] Testing (if coverage mentioned)
- [ ] Design (if UI/UX mentioned)
```

---

## SD→PRD→Backlog Pipeline

### Pipeline Flow

```
Chairman Input
    ↓
SDIP Processing → Strategic Directive (SD)
    ↓
LEAD Agent Review → Approved SD
    ↓
LEAD→PLAN Handoff → PRD Creation Request
    ↓
PLAN Agent → Product Requirements Document (PRD)
    ↓
PLAN→EXEC Handoff → Implementation Request
    ↓
Backlog Creation → Prioritized Work Items
    ↓
EXEC Implementation → Completed Features
```

### Database Schema

#### Pipeline Tables
```sql
-- Strategic Directive flow
directive_submissions → strategic_directives_v2 → prds

-- Backlog mapping
strategic_directives_v2 ←→ sd_backlog_map

-- Handoff tracking
handoff_tracking (from_agent, to_agent, status, payload)
```

### Automation Points
1. **Auto-create SD** from validated submission
2. **Auto-generate PRD** template from SD
3. **Auto-populate backlog** from PRD tasks
4. **Auto-assign** to appropriate agents
5. **Auto-track** progress through stages

---

## Stage KPIs Table

### Complete 40-Stage KPI Matrix

| Stage | Key KPIs | Definition | Formula | Target | Notes |
|-------|----------|------------|---------|--------|-------|
| **1. Draft Idea** | # customer interviews scheduled; % pains validated | Initial validation metrics | Interviews completed / Planned | 5+ interviews; 80% validation | Foundation for venture |
| **2. AI Review** | AI validation score; % issues flagged | AI critique quality | Issues identified / Total possible | Score >85%; Flag top 20% | Multi-model analysis |
| **3. Comprehensive Validation** | Validation pass rate; % assumptions tested | Problem-solution fit | Validated assumptions / Total | >70% pass; 100% tested | Kill/proceed gate |
| **4. Competitive Intelligence** | # competitors benchmarked; differentiation index | Market position strength | Unique features / Total features | 10+ competitors; Index >0.3 | Defensibility measure |
| **5. Profitability Forecasting** | Gross margin forecast accuracy; breakeven timeline | Financial viability | Actual vs Forecast variance | <10% variance; <18 months | Investment decision |
| **6. Risk Evaluation** | # risks identified; mitigation coverage % | Risk preparedness | Mitigated risks / Total risks | 20+ risks; >80% coverage | Contingency planning |
| **7. Comprehensive Planning** | Plan completeness index; milestone % defined | Execution readiness | Completed sections / Required | Index >0.9; 100% milestones | Roadmap clarity |
| **8. Problem Decomposition** | % tasks decomposed; dependency clarity score | Task granularity | Decomposed tasks / Total | >95%; Score >4/5 | Complexity management |
| **9. Gap Analysis** | % unmet needs captured; TAM/SAM accuracy | Market opportunity | Addressed gaps / Total gaps | >80%; <15% variance | Market sizing |
| **10. Technical Review** | Architecture feasibility score; % compliance passed | Technical viability | Passed checks / Total checks | Score >85%; 100% compliance | Tech gate |
| **11. Strategic Naming** | Brand distinctiveness score; recall rate | Brand strength | Unique elements / Total | Score >80%; >60% recall | Market identity |
| **12. Adaptive Naming** | Distinctiveness %; memorability %; domain availability % | Name validation | Test scores and availability | All >70%; 100% available | Final selection |
| **13. Exit-Oriented Design** | Exit readiness score; valuation alignment % | Acquisition potential | Readiness factors / Total | Score >75%; >80% aligned | Exit planning |
| **14. Development Prep** | % infra readiness; % dev resources allocated | Dev environment ready | Ready items / Required | Both 100% | Start gate |
| **15. Pricing Strategy** | Unit economics margin %; revenue model robustness | Revenue viability | Gross margin calculation | >40%; Score >4/5 | Monetization |
| **16. AI CEO Agent** | Strategic rec accuracy %; task completion rate | AI agent performance | Correct decisions / Total | >80%; >90% | Automation level |
| **17. GTM Strategist Agent** | CAC efficiency; funnel conversion % | GTM effectiveness | LTV/CAC; Conversions/Visitors | >3.0; >2% | Market entry |
| **18. Documentation Sync** | % repos synced; documentation coverage % | Documentation quality | Synced/Total; Documented/Required | Both 100% | Knowledge management |
| **19. Integration Verification** | % integrations verified; error rate | Integration quality | Verified/Total; Errors/Tests | 100%; <1% | System stability |
| **20. Context Loading** | Context load accuracy %; EVA retrieval latency | System performance | Accurate loads/Total; Response time | >95%; <200ms | Operational readiness |
| **21. Final Pre-Flight** | % gates passed; readiness score | Launch preparedness | Passed gates/Total | 100%; Score >90% | Go/no-go decision |
| **22. Iterative Development** | % sprint goals met; defect discovery rate | Dev velocity | Completed/Planned; Defects/Sprint | >80%; <5/sprint | Progress tracking |
| **23. Continuous Feedback** | % feedback incorporated; cycle time | Responsiveness | Implemented/Received; Days/cycle | >70%; <3 days | Adaptation speed |
| **24. MVP Engine** | % iterations validated; learning velocity | Innovation rate | Validated/Total; Learnings/Week | >60%; >3/week | Product evolution |
| **25. Quality Assurance** | Test coverage %; defect leakage % | Quality metrics | Covered lines/Total; Escaped/Found | >80%; <5% | Quality gate |
| **26. Security Certification** | % controls automated; audit pass rate | Security posture | Automated/Total; Passed/Audited | >70%; 100% | Compliance |
| **27. Actor Model Integration** | Saga success rate %; throughput improvement | Architecture performance | Successful/Total; New/Old throughput | >95%; >50% | Scalability |
| **28. Development Excellence** | Performance gain %; latency reduction | Optimization success | Improvement percentage | >30%; >40% | Excellence metrics |
| **29. Final Polish** | UX satisfaction score; bug closure rate | Polish quality | User rating; Closed/Reported | >4.5/5; >95% | Launch readiness |
| **30. Production Deployment** | Deployment success rate; rollback frequency | Deployment reliability | Successful/Total; Rollbacks/Month | >95%; <1/month | Operational stability |
| **31. MVP Launch** | Adoption rate; NPS score | Launch success | Users/Target; Promoter score | >30%; >50 | Market reception |
| **32. Customer Success** | Churn rate %; retention growth % | Customer health | Lost/Total; Month-over-month | <5%; >10% | Sustainability |
| **33. Capability Expansion** | Feature adoption %; backlog burn rate | Growth velocity | Adopted/Released; Completed/Week | >40%; >5/week | Evolution speed |
| **34. Creative Media** | # assets generated; engagement uplift % | Content effectiveness | Assets/Week; New/Old engagement | >20/week; >25% | Marketing efficiency |
| **35. GTM Timing** | Forecast accuracy %; launch timing success | Market timing | Variance from forecast | >85%; On-time | Strategic timing |
| **36. Parallel Exploration** | Branch success rate; learning velocity | Innovation efficiency | Successful/Total; Insights/Branch | >30%; >2/branch | Experimentation |
| **37. Risk Forecasting** | Forecast accuracy %; risk mitigation success | Risk management | Accurate/Total; Mitigated/Identified | >80%; >90% | Proactive management |
| **38. Timing Optimization** | Optimization accuracy %; opportunity capture rate | Efficiency gains | Accurate/Total; Captured/Available | >85%; >70% | Resource optimization |
| **39. Multi-Venture Coord** | Portfolio alignment score; coordination success % | Portfolio synergy | Aligned initiatives/Total | >80%; >90% | Cross-venture value |
| **40. Strategic Growth** | Governance cadence adherence; portfolio growth rate | Strategic success | Meetings held/Scheduled; YoY growth | 100%; >50% | Long-term value |

---

## Delivery Pipeline & Observability

### Pipeline Architecture

#### CI/CD Pipeline
```yaml
stages:
  - build:
      - Lint and format check
      - Type checking
      - Unit tests
      - Security scan
  - test:
      - Integration tests
      - E2E tests
      - Performance tests
      - Accessibility tests
  - deploy:
      - Stage deployment
      - Smoke tests
      - Production deployment
      - Health checks
```

#### Observability Stack

**Metrics Collection**
- Application metrics (Prometheus)
- Business metrics (Custom)
- Infrastructure metrics (CloudWatch)
- User metrics (Analytics)

**Logging Architecture**
```javascript
// Structured logging format
{
  timestamp: "2025-01-14T10:00:00Z",
  level: "INFO",
  service: "ehg-engineer",
  trace_id: "abc-123",
  message: "Handoff completed",
  metadata: {
    from_agent: "LEAD",
    to_agent: "PLAN",
    sd_id: "SD-001"
  }
}
```

**Tracing System**
- Distributed tracing (OpenTelemetry)
- Request correlation IDs
- Cross-service tracking
- Performance profiling

### Dashboard Metrics

#### Chairman Command Center
Real-time metrics displayed:
- Portfolio health scores
- Stage progression rates
- Exception alerts
- Resource utilization
- Revenue metrics
- Risk indicators

#### Operational Dashboard
Technical metrics:
- System availability (>99.9%)
- Response times (<200ms p95)
- Error rates (<0.1%)
- Queue depths
- Database performance
- API latencies

---

## Chairman Command Center

### Overview
The Command Center is the Chairman's strategic cockpit for managing the entire venture portfolio through a unified interface.

### Core Features

#### Portfolio View
```
┌─────────────────────────────────────┐
│ Portfolio Health: 🟢 Healthy         │
├─────────────────────────────────────┤
│ Venture A: Stage 24 | Rev: $125K/mo │
│ Venture B: Stage 31 | Rev: $85K/mo  │
│ Venture C: Stage 12 | Rev: $0       │
│ Venture D: Stage 8  | Rev: $0       │
└─────────────────────────────────────┘
```

#### Exception Management
- **Red Alerts**: Immediate attention required
- **Yellow Warnings**: Review within 24 hours
- **Blue Info**: FYI notifications
- **Green Success**: Milestone achievements

#### Decision Queue
Pending decisions requiring Chairman input:
1. Approve SD-051 for EVA enhancements
2. Resource allocation for Venture B scale
3. Exit timing for Venture A
4. Kill/proceed for Venture D

#### Strategic Analytics
- Portfolio valuation trends
- Resource allocation efficiency
- Cross-venture synergies
- Market timing indicators
- Exit readiness scores

### Voice Commands

#### Common Commands
```
"EVA, show portfolio status"
"EVA, what needs my attention?"
"EVA, advance Venture B to next stage"
"EVA, create strategic directive for [topic]"
"EVA, show this week's progress"
"EVA, analyze Venture A profitability"
```

---

## Prompt Library

### EVA Orchestration Prompts

#### Board Coordination
```
Convene Board of Agents for [topic].
Gather input from all AI CEO agents.
Synthesize recommendations from specialized agents.
Present options with risk/benefit analysis.
Facilitate consensus or escalate to Chairman.
Document decisions and action items.
```

#### AI CEO Management
```
Query AI CEO agent for Venture [X] status.
Compile performance metrics across all ventures.
Identify cross-venture synergies and conflicts.
Coordinate resource allocation requests.
Monitor decision quality and learning rate.
Escalate exceptions to Board of Agents.
```

#### Learning Capture
```
Review Chairman's decision on [topic].
Extract decision criteria and rationale.
Update preference model with new patterns.
Calculate confidence score for future predictions.
Store learning in knowledge base.
```

### LEAD Agent Prompts

#### Strategic Directive Creation
```
Given business objective: [objective]
Analyze market opportunity and feasibility.
Define measurable success criteria.
Identify resource requirements and constraints.
Assess risks and mitigation strategies.
Generate Strategic Directive document (SD-XXX).
```

#### Priority Assessment
```
Evaluate strategic directive impact on:
- Revenue potential (0-100)
- Strategic alignment (0-100)
- Resource efficiency (0-100)
- Risk level (0-100)
Calculate weighted priority score.
Assign priority level: Critical/High/Medium/Low.
```

### PLAN Agent Prompts

#### PRD Generation
```
Input: Strategic Directive SD-XXX
Extract business requirements and constraints.
Design technical architecture and approach.
Define implementation specifications.
Create comprehensive test plan.
Identify required sub-agents based on keywords.
Generate PRD document with all sections.
```

#### Supervisor Verification
```
Query all activated sub-agents for their reports.
Compile verification results by category.
Identify any conflicts or contradictions.
Calculate overall confidence score.
Provide clear PASS/FAIL verdict with rationale.
Generate remediation plan if needed.
```

### EXEC Agent Prompts

#### Pre-Implementation Verification
```
PRD: [PRD-ID]
1. Navigate to specified URL: [URL]
2. Verify page loads successfully
3. Identify target component: [path]
4. Confirm application context: [app/port]
5. Take screenshot of current state
6. Document implementation location
Proceed only if all checks pass.
```

#### Sub-Agent Activation
```
Scan PRD for trigger keywords:
- Performance: [load time, optimization, scalability]
- Security: [auth, encryption, OWASP]
- Database: [schema, migration, queries]
- Testing: [coverage, e2e, regression]
- Design: [UI/UX, responsive, WCAG]

For each match:
1. Query sub-agent configuration
2. Create formal handoff document
3. Execute sub-agent analysis
4. Integrate results into implementation
```

---

## Mental Models for Decision-Making

### The 2x2 Priority Matrix

```
        High Impact
            ↑
    ┌───────┼───────┐
    │   DO  │  DO   │
    │  NEXT │ FIRST │
    ├───────┼───────┤
    │ DEFER │  DO   │
    │       │ LATER │
    └───────┴───────┘
    Low ← Effort → High
```

### The Three-Gate Framework

#### Gate 1: Desirability
- Do users want this?
- Will they pay for it?
- Does it solve real pain?

#### Gate 2: Feasibility
- Can we build it?
- Do we have resources?
- Is timing right?

#### Gate 3: Viability
- Is it profitable?
- Can it scale?
- Is it defensible?

### The 80/20 Principle
- 80% of value from 20% of features
- 80% of revenue from 20% of customers
- 80% of problems from 20% of causes
- Focus on the vital few, not trivial many

### The One-Way vs Two-Way Door
**One-Way Doors** (Irreversible):
- Require careful analysis
- Need Chairman approval
- Examples: Architecture choices, hiring, major pivots

**Two-Way Doors** (Reversible):
- Encourage experimentation
- Delegate to agents
- Examples: Feature flags, A/B tests, marketing campaigns

### The Innovation Stack

```
Level 4: Disruption (New market creation)
Level 3: Innovation (New solutions)
Level 2: Improvement (Better execution)
Level 1: Imitation (Copy best practices)
```

Choose level based on:
- Market maturity
- Competition intensity
- Resource availability
- Risk tolerance

---

## Board of Agents Governance Model

### Overview
The Board of Agents (Board of Directors) is an entirely AI-driven governance structure where specialized AI agents collectively manage the venture portfolio. The Chairman is the ONLY human in the system - all board members, CEOs, and other executives are AI agents with continuous availability and data-driven decision-making.

### Board Composition (All AI Agents)
- **EVA**: Board Chair - Orchestrates meetings and ensures alignment
- **AI CEO Agents**: One per venture - Report on venture performance
- **AI CFO**: Financial oversight and portfolio economics
- **AI CTO**: Technical architecture and innovation
- **AI GTM Strategist**: Market and go-to-market expertise
- **AI Legal/Compliance Officer**: Regulatory and risk management
- **AI COO**: Operational excellence across ventures

Note: The Chairman is the ONLY human - all board members are AI agents

### Board Functions
1. **Portfolio Oversight**: Monitor health of all ventures
2. **Resource Allocation**: Distribute resources across ventures
3. **Strategic Planning**: Long-term vision and direction
4. **Risk Management**: Identify and mitigate portfolio risks
5. **Exception Handling**: Resolve cross-venture conflicts
6. **Exit Planning**: M&A readiness and timing

### Decision Framework
- **Voting System**: Weighted voting based on expertise domain
- **Quorum Requirements**: Minimum 60% board participation
- **Exception Escalation**: Chairman override for critical decisions
- **Consensus Building**: AI-driven alignment algorithms

### Board Meetings
- **Continuous Session**: 24/7 asynchronous decision-making
- **Formal Reviews**: Weekly synchronous portfolio reviews
- **Emergency Sessions**: Triggered by exception conditions
- **Chairman Briefings**: Daily executive summaries

## Governance Frameworks

### Decision Rights Matrix

| Decision Type | Chairman | Board of Agents | AI CEO | EVA | GTM Strategist |
|--------------|----------|----------------|--------|-----|----------------|
| Portfolio Strategy | Decide | Recommend | | Support | |
| Venture Direction | Approve | Review | Decide | Coordinate | |
| Resource Allocation | Approve | Recommend | Request | Track | |
| Stage Progression | | Approve | Execute | Orchestrate | |
| Market Strategy | | | Approve | | Define |
| Exception Handling | Override | Escalate | Resolve | Monitor | Flag |
| Exit Decisions | Decide | Recommend | Prepare | Analyze | |

### Accountability Framework

#### RACI Matrix
- **Responsible**: Who does the work
- **Accountable**: Who owns the outcome
- **Consulted**: Who provides input
- **Informed**: Who needs updates

#### Example: Strategic Directive Creation
- **Responsible**: Board of Agents
- **Accountable**: Chairman
- **Consulted**: EVA, AI CEO agents, Market data
- **Informed**: GTM Strategist, Technical teams

### Review Cadences

| Review Type | Frequency | Participants | Focus |
|------------|-----------|--------------|-------|
| Portfolio Review | Weekly | Chairman, EVA | Overall health |
| Stage Gates | Per stage | Relevant agents | Progression readiness |
| Sprint Review | Bi-weekly | EXEC, PLAN | Development progress |
| Strategic Review | Monthly | Chairman, LEAD | Direction alignment |
| Risk Review | Monthly | All agents | Risk mitigation |
| Performance Review | Quarterly | Chairman, EVA | KPIs and optimization |

---

## Sources of Truth
- **SDIP System**: Database tables directive_submissions, gate_tracking
- **PRD Templates**: Database table prd_templates
- **Stage KPIs**: `/mnt/c/Users/rickf/Dropbox/_EHG/_EHG/stage kpis.csv`
- **Pipeline Configuration**: CI/CD yaml files in repositories
- **Dashboard Metrics**: Real-time from Supabase and monitoring systems
- **Prompt Library**: Database table agent_prompts
- **Governance Policies**: Database table governance_frameworks

**Last updated**: 2025-01-14