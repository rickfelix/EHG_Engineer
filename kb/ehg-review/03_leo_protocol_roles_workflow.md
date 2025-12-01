# 03_leo_protocol_roles_workflow.md

## Why This Matters
The LEO Protocol defines the operational framework for agent collaboration, quality enforcement, and workflow progression. This document specifies agent roles, responsibilities, boundaries, and the complete 40-stage venture workflow that transforms ideas into successful ventures.

---

## LEO Protocol v4.3.3 - UI Parity Governance

### Current Version
**Version**: 4.3.3 (leo-v4-3-3-ui-parity)
**Status**: ACTIVE
**Storage**: Database table `leo_protocols`
**Enforcement**: Mandatory for all operations
**Note**: See 00_unified_vision_2025.md for current operational context

### Core Principles

#### Database-First Architecture
- **NO filesystem storage** for protocols, SDs, or PRDs
- All protocol data stored in `leo_protocols` table
- Sub-agents defined in `leo_sub_agents` table
- Handoffs tracked in `leo_handoff_templates` table
- Real-time updates via Supabase subscriptions

#### Quality Gates
- **Minimum threshold**: 85% for stage progression
- **Automated scoring**: EVA validates against rubric
- **Remediation**: Automatic task generation for failures
- **Exception process**: Human intervention for blocked gates

#### Control Points
- **Mandatory handoffs**: 7-9 validation checkpoints
- **Context management**: Token usage monitoring
- **Boundary enforcement**: Strict scope control
- **Audit trail**: Complete history of all operations

### State Management

#### Workflow States
```
DRAFT → PENDING_REVIEW → IN_PROGRESS → BLOCKED → COMPLETED → ARCHIVED
```

#### Status Badges
- 🟢 **ACTIVE**: Currently being worked on
- 🟡 **PENDING**: Awaiting action or review
- 🔴 **BLOCKED**: Requires intervention
- ✅ **COMPLETED**: Successfully finished
- 📦 **ARCHIVED**: Historical record

#### Quality Classifiers
- **EXCELLENT** (95-100%): Exceeds all requirements
- **GOOD** (85-94%): Meets requirements, minor improvements possible
- **ACCEPTABLE** (75-84%): Passes with remediation needed
- **POOR** (<75%): Fails gate, requires rework

---

## Agent Roles & Responsibilities

### EVA - Executive Virtual Assistant

**Purpose**: Strategic orchestration of the venture portfolio and leadership agents

**Primary Responsibilities**:
- Board of Agents coordination and governance
- AI CEO agent management for each venture
- GTM Strategist agent oversight (Stage 17)
- Chairman interface and decision support
- Portfolio-level optimization and synergies

**Strategic Coordination** (Chairman as ONLY human):
- **Board Level**: Interfaces with AI Board of Directors for portfolio governance (BP-177)
- **CEO Level**: Manages AI CEO agents per venture (BP-137, Stage 16)
- **Executive Level**: Coordinates AI executive role templates (AI CEO/COO/CFO/CTO) (BP-178)
- **Technical Level**: Oversees LEO Protocol agents (LEAD/PLAN/EXEC) through delegation
- **Human Interface**: Chairman is the sole human decision-maker in the system

**Boundaries**:
- Cannot override Chairman decisions
- Cannot bypass Board of Agents governance
- Must maintain strategic alignment across ventures
- Must preserve audit trail for all decisions

**Key Metrics**:
- Board alignment: ≥90%
- CEO agent effectiveness: ≥85%
- Portfolio synergy capture: ≥70%
- Chairman satisfaction: ≥4.5/5

### LEAD Agent - Strategic Leadership

**Purpose**: Define business objectives and strategic direction

**Ownership Percentage**: 35%
- Planning: 20%
- Implementation: 0%
- Verification: 0%
- Approval: 15%

**Primary Responsibilities**:
1. Strategic Directive creation
2. Business objective definition
3. Priority setting (Critical/High/Medium/Low)
4. Resource allocation decisions
5. Final approval authority

**Process Flow**:
```
Inputs: Market analysis, Chairman vision, Portfolio status
  ↓
Process: Strategic planning, Risk assessment, Feasibility analysis
  ↓
Outputs: Strategic Directive (SD-XXX), Success criteria, Resource plan
  ↓
Acceptance: Business value validated, Risks identified, Resources available
  ↓
Failure Modes: Unclear objectives → Clarification required
               Insufficient resources → Reallocation needed
```

**Handoff Checklist** (9/9 required):
- [ ] SD created and saved to database
- [ ] Business objectives clearly defined
- [ ] Success metrics measurable
- [ ] Constraints documented
- [ ] Risks identified and assessed
- [ ] Feasibility confirmed
- [ ] Environment health checked
- [ ] Context usage < 30%
- [ ] Summary created (500 tokens)

### PLAN Agent - Technical Planning

**Purpose**: Transform business objectives into technical specifications

**Ownership Percentage**: 35%
- Planning: 20%
- Implementation: 0%
- Verification: 15%
- Approval: 0%

**Primary Responsibilities**:
1. PRD creation from Strategic Directives
2. Technical architecture design
3. Test plan development
4. Sub-agent identification
5. Supervisor verification ("done done")

**Process Flow**:
```
Inputs: Strategic Directive, Technical constraints, Available resources
  ↓
Process: Requirements analysis, Architecture design, Test planning
  ↓
Outputs: PRD document, Technical specs, Test requirements
  ↓
Acceptance: All SD requirements mapped, Architecture validated, Tests defined
  ↓
Failure Modes: Missing requirements → Gap analysis required
               Technical infeasibility → Alternative approach needed
```

**Supervisor Mode Features**:
- Query all sub-agent results
- Resolve conflicts between reports
- Provide confidence scoring
- Clear pass/fail verdict

**Handoff Checklist** (9/9 required):
- [ ] PRD created and saved to database
- [ ] SD requirements fully mapped
- [ ] Technical specifications complete
- [ ] Prerequisites verified
- [ ] Test requirements defined
- [ ] Acceptance criteria clear
- [ ] Risk mitigation planned
- [ ] Context usage < 40%
- [ ] Summary created (500 tokens)

### EXEC Agent - Implementation

**Purpose**: Execute technical specifications without deviation

**Ownership Percentage**: 30%
- Planning: 0%
- Implementation: 30%
- Verification: 0%
- Approval: 0%

**Primary Responsibilities**:
1. Code implementation per PRD
2. NO validation or testing
3. Sub-agent coordination
4. Documentation updates
5. Deployment execution

**CRITICAL Pre-Implementation Requirements**:
```markdown
## EXEC Pre-Implementation Checklist
- [ ] URL verified: [exact URL from PRD]
- [ ] Page accessible: [YES/NO]
- [ ] Component identified: [path/to/component]
- [ ] Application path: [/full/path/to/app]
- [ ] Port confirmed: [port number]
- [ ] Screenshot taken: [timestamp]
- [ ] Target location confirmed: [where changes go]
```

**Process Flow**:
```
Inputs: PRD, Technical specs, Test requirements
  ↓
Process: Implementation, Integration, Deployment
  ↓
Outputs: Working code, Updated documentation, Deployed application
  ↓
Acceptance: PRD requirements met, Tests passing, Deployment successful
  ↓
Failure Modes: Scope creep → Reject out-of-scope
               Build failure → Debug and fix
```

**Handoff Checklist** (9/9 required):
- [ ] PRD requirements fully met
- [ ] All tests passing
- [ ] Lint checks passing
- [ ] Type checks passing
- [ ] Build successful
- [ ] CI/CD pipeline green
- [ ] Documentation updated
- [ ] Context usage < 60%
- [ ] Summary created (500 tokens)

---

## Sub-Agent System

### Sub-Agent Activation

#### Automatic Triggers
Sub-agents activate when specific keywords or patterns are detected in PRDs:

| Sub-Agent | Trigger Keywords | Priority |
|-----------|-----------------|----------|
| **Performance** | load time, optimization, scalability, users | 90 |
| **Database** | schema, migration, database, queries | 85 |
| **Security** | authentication, authorization, encryption, OWASP | 95 |
| **Testing** | coverage, e2e, testing, regression | 80 |
| **Design** | UI/UX, responsive, accessibility, WCAG | 75 |

#### Sub-Agent Specifications

**Design Sub-Agent**
- UI/UX implementation excellence
- Design system compliance
- Accessibility (WCAG 2.1 AA)
- Responsive design patterns
- Animation and interaction performance

**Security Sub-Agent**
- OWASP Top 10 compliance
- Authentication/authorization implementation
- Input validation and sanitization
- XSS/CSRF/SQL injection prevention
- Encryption and key management

**Performance Sub-Agent**
- Page load optimization (<2s)
- Bundle size reduction
- Caching strategy implementation
- Database query optimization
- Memory leak prevention

**Testing Sub-Agent**
- Test coverage analysis (>80%)
- E2E scenario development
- Regression test suites
- Performance benchmarking
- Accessibility testing

**Database Sub-Agent**
- Schema design and optimization
- Migration strategy
- Query performance tuning
- Index optimization
- Data integrity enforcement

### Sub-Agent Handoff Process

1. **Detection**: EXEC identifies trigger keywords
2. **Activation**: Query database for sub-agent configuration
3. **Handoff**: Create formal 7-element handoff
4. **Execution**: Run specialized analysis or implementation
5. **Results**: Store in database with traceability
6. **Integration**: Merge results into main implementation

---

## 40-Stage Venture Workflow

### Phase Overview

| Phase | Stages | Focus | Owner Mix | Duration |
|-------|--------|-------|-----------|----------|
| **IDEATION** | 1-10 | Idea validation & feasibility | EVA, Board of Agents, Technical Teams | 2-4 weeks |
| **PLANNING** | 11-20 | Strategic planning & preparation | AI CEO Agent, GTM Strategist, EVA | 3-5 weeks |
| **DEVELOPMENT** | 21-28 | Building & iterating | Technical Teams, AI CEO oversight | 4-8 weeks |
| **LAUNCH** | 29-34 | Go-to-market & customer success | GTM Strategist, AI CEO, EVA | 2-4 weeks |
| **OPERATIONS** | 35-40 | Growth, optimization & exit | Board of Agents, AI CEO, Chairman | Ongoing |

### Detailed Stage Definitions

#### 🟡 Phase 1: IDEATION (Stages 1-10)

| ID | Stage | Description | Key Deliverables |
|----|-------|-------------|------------------|
| 1 | **Draft Idea** | Capture and validate initial venture ideas | Problem statement, JTBD template, acceptance criteria |
| 2 | **AI Review** | Multi-agent critique from multiple perspectives | AI appraisal report, contrarian analysis, risk assessment |
| 3 | **Comprehensive Validation** | Validate problem-solution fit and willingness to pay | Validation matrix, user feedback, feasibility assessment |
| 4 | **Competitive Intelligence** | Analyze competitive landscape and positioning | Competitor map, differentiation index, defense strategy |
| 5 | **Profitability Forecasting** | Create financial models and projections | Financial model, P&L projections, break-even analysis |
| 6 | **Risk Evaluation** | Identify and assess all risk factors | Risk register, mitigation plans, contingency strategies |
| 7 | **Comprehensive Planning Suite** | Develop detailed execution roadmap | Project plan, resource allocation, milestone schedule |
| 8 | **Problem Decomposition** | Break down complex problems into tasks | Task breakdown, dependency map, complexity analysis |
| 9 | **Gap Analysis** | Identify market opportunities and unmet needs | Opportunity model, TAM/SAM analysis, gap report |
| 10 | **Technical Review** | Assess technical feasibility and architecture | Tech review doc, architecture diagrams, compliance check |

#### 🟣 Phase 2: PLANNING (Stages 11-20)

| ID | Stage | Description | Key Deliverables |
|----|-------|-------------|------------------|
| 11 | **Strategic Naming** | Develop brand identity and naming | Brand book, candidate names, trademark scan |
| 12 | **Adaptive Naming Module** | Test and validate naming options | Distinctiveness scores, domain availability, memorability tests |
| 13 | **Exit-Oriented Design** | Design for acquisition from day one | Exit scenarios, valuation model, M&A strategy |
| 14 | **Development Preparation** | Prepare infrastructure and resources | Dev checklist, environment setup, team allocation |
| 15 | **Pricing Strategy** | Develop revenue model and pricing | Pricing model, unit economics, revenue projections |
| 16 | **AI CEO Agent** | Develop strategic AI assistant | Agent specifications, training data, test results |
| 17 | **GTM Strategist Agent** | Create go-to-market AI agent | GTM playbook, funnel design, CAC model |
| 18 | **Documentation Sync** | Synchronize all docs to GitHub | Version control, documentation coverage, API docs |
| 19 | **Integration Verification** | Verify all third-party integrations | Integration tests, API contracts, error handling |
| 20 | **Context Loading** | Load and validate all context | Context pipelines, configuration, performance metrics |

#### 🔵 Phase 3: DEVELOPMENT (Stages 21-28)

| ID | Stage | Description | Key Deliverables |
|----|-------|-------------|------------------|
| 21 | **Final Pre-Flight** | Last checks before development | Gate review checklist, readiness score, signoffs |
| 22 | **Iterative Development** | Sprint-based development cycles | Sprint backlogs, velocity metrics, burn-down charts |
| 23 | **Continuous Feedback** | Implement feedback loops | Telemetry dashboard, feedback logs, iteration plans |
| 24 | **MVP Engine** | Automated iteration and learning | Experiment logs, validated learnings, pivot decisions |
| 25 | **Quality Assurance** | Comprehensive testing and validation | QA plan, test reports, coverage metrics |
| 26 | **Security Certification** | Security audit and compliance | Audit report, compliance checklist, penetration tests |
| 27 | **Actor Model Integration** | Implement distributed architecture | Saga tests, throughput metrics, architecture docs |
| 28 | **Development Excellence** | Optimize performance and quality | Performance benchmarks, optimization logs, best practices |

#### 🟢 Phase 4: LAUNCH (Stages 29-34)

| ID | Stage | Description | Key Deliverables |
|----|-------|-------------|------------------|
| 29 | **Final Polish** | UI/UX refinement and bug fixes | Polish checklist, UI review, bug closure report |
| 30 | **Production Deployment** | Deploy to production environment | Deployment logs, rollback plan, monitoring setup |
| 31 | **MVP Launch** | Public launch of minimum viable product | Launch checklist, marketing materials, press release |
| 32 | **Customer Success** | Implement retention engineering | Success playbook, onboarding flow, support docs |
| 33 | **Capability Expansion** | Add post-MVP features | Feature roadmap, release notes, adoption metrics |
| 34 | **Creative Media** | Automate content generation | Media library, content calendar, engagement metrics |

#### 🔴 Phase 5: OPERATIONS (Stages 35-40)

| ID | Stage | Description | Key Deliverables |
|----|-------|-------------|------------------|
| 35 | **GTM Timing Intelligence** | Optimize market entry timing | Timing models, signal monitoring, launch windows |
| 36 | **Parallel Exploration** | Test multiple growth hypotheses | Branch reports, A/B test results, learning velocity |
| 37 | **Risk Forecasting** | Predictive risk management | Forecast models, simulation results, mitigation plans |
| 38 | **Timing Optimization** | Optimize all operational timing | Optimization plans, efficiency metrics, automation level |
| 39 | **Multi-Venture Coordination** | Coordinate portfolio resources | Portfolio dashboard, resource allocation, synergy analysis |
| 40 | **Strategic Growth** | Portfolio governance and scaling | Board reports, growth metrics, exit readiness score |

---

## Workflow Governance

### Stage Progression Rules

#### Entry Criteria
- Previous stage completed (≥85% score)
- All dependencies resolved
- Resources available
- Risks assessed and mitigated

#### Exit Criteria
- All deliverables complete
- KPIs met or exceeded
- Quality gate passed
- Handoff validated

#### Blocking Conditions
- Quality score <85%
- Critical dependency missing
- Resource constraints
- Unmitigated high risk

### Rubric Scoring System

#### Evaluation Dimensions (0-5 each)
1. **Clarity of Deliverables**: Explicit outputs & acceptance criteria
2. **KPI Alignment**: Measurable and strategic alignment
3. **Process Rigor**: Standardization & automation level
4. **Scalability**: Generalizability and growth potential
5. **EVA Integration**: Orchestration & intelligence level

#### Scoring Thresholds
- **Max Score**: 25 per stage
- **Pass Threshold**: 15/25 (60%)
- **Excellence Threshold**: 23/25 (92%)
- **Remediation Required**: <15/25

### Exception Handling

#### Blocked Handoff Process
1. **Detection**: System identifies blocking condition
2. **Notification**: Alert Chairman and relevant agents
3. **Analysis**: Root cause investigation
4. **Resolution**: Corrective action plan
5. **Override**: Chairman approval if needed
6. **Documentation**: Exception logged for learning

#### Escalation Matrix

| Severity | Response Time | Escalation Path | Resolution Authority |
|----------|--------------|-----------------|---------------------|
| **CRITICAL** | <1 hour | EVA → Chairman | Chairman |
| **HIGH** | <4 hours | Agent → LEAD → Chairman | LEAD or Chairman |
| **MEDIUM** | <1 day | Agent → PLAN → LEAD | PLAN or LEAD |
| **LOW** | <3 days | Agent → Agent | Originating Agent |

---

## Performance Metrics

### Agent Performance KPIs

| Agent | Metric | Target | Measurement |
|-------|--------|--------|-------------|
| **EVA** | Orchestration Accuracy | ≥95% | Correct stage progressions |
| **EVA** | Learning Rate | 10%/quarter | Improvement in predictions |
| **LEAD** | SD Quality | ≥90% | First-pass approval rate |
| **LEAD** | Strategic Alignment | ≥85% | Portfolio coherence score |
| **PLAN** | PRD Completeness | ≥95% | Requirements coverage |
| **PLAN** | Technical Accuracy | ≥90% | Implementation success rate |
| **EXEC** | Implementation Speed | 2 stages/week | Average velocity |
| **EXEC** | Quality Score | ≥85% | First-pass success rate |

### Workflow Performance Metrics

| Metric | Target | Current | Notes |
|--------|--------|---------|-------|
| **Stage Velocity** | 2/week | - | Average progression rate |
| **Quality Gate Pass Rate** | ≥85% | - | First attempt success |
| **Handoff Success Rate** | ≥95% | - | Clean transfers |
| **Automation Coverage** | ≥50% | - | Tasks without human input |
| **Cycle Time** | <6 months | - | Idea to revenue |
| **Success Predictability** | ≥60% by stage 10 | - | Venture viability |

---

## Sources of Truth
- **Unified Vision**: kb/ehg-review/00_unified_vision_2025.md (primary operational vision)
- **LEO Protocol**: Database table `leo_protocols` (v4.3.3)
- **Agent Definitions**: Database tables `leo_agents`, `leo_sub_agents`
- **Strategic Directives**: Database table `strategic_directives_v2`
- **Handoff Templates**: Database table `leo_handoff_templates`

**Last updated**: 2025-11-29