<!-- ARCHIVED: 2026-01-26T16:26:44.132Z
     Reason: Duplicate of canonical file
     Original location: docs\workflow\dossiers\stage-07\05_professional-sop.md
     See: docs/fixes/duplicate-consolidation-manifest.json for details
-->

# Stage 7: Professional Standard Operating Procedure


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, api, testing, unit

**Purpose**: Execute Comprehensive Planning Suite to create business, technical, and resource plans for venture execution

**Audience**: PLAN agent, business strategists, technical architects, resource planners

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:274-319 "Comprehensive Planning Suite"

---

## Prerequisites (Entry Gates)

Before starting Stage 7, verify:

1. **Stage 6 Complete**: Risk Evaluation stage finished, exit gates passed
2. **Risks evaluated**: Risk register populated with identified risks, severity levels, mitigation strategies
3. **Resources identified**: Initial resource estimates available (from Stage 6 risk mitigation needs)
4. **Required Inputs Available**:
   - Risk assessment report
   - Resource requirements document
   - Timeline constraints (including compliance deadlines, market windows)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:291-294 "entry: Risks evaluated, Resources identified"

---

## Substage 7.1: Business Planning

**Objective**: Define business model, go-to-market strategy, and operations design

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:300-305 "Business Planning"

### Step 7.1.1: Define Business Model

**Inputs**: Stage 5 (Profitability Forecasting) outputs, Stage 4 (Competitive Intelligence) outputs

**Tasks**:
1. **Document Revenue Streams**:
   - Primary revenue sources (subscriptions, licensing, transactions)
   - Secondary revenue sources (upsells, cross-sells, partnerships)
   - Revenue model type (SaaS, marketplace, hardware + service)
2. **Define Cost Structure**:
   - COGS breakdown (from Stage 5)
   - OpEx breakdown (salaries, infrastructure, marketing)
   - CapEx requirements (initial investment, equipment)
3. **Articulate Value Proposition**:
   - Customer problem solved
   - Unique value delivered
   - Competitive differentiation (from Stage 4)
4. **Identify Key Resources**:
   - Critical assets (IP, technology, brand)
   - Key personnel (founders, technical leads)
   - Strategic partnerships
5. **Map Key Activities**:
   - Core business processes (production, sales, support)
   - Critical workflows (order fulfillment, onboarding)

**Output**: Business Model Canvas (9 building blocks completed)

**Done When**: Business model defined (revenue streams, cost structure, value proposition documented)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:303 "Business model defined"

---

### Step 7.1.2: Plan Go-to-Market Strategy

**Inputs**: Stage 3 (Comprehensive Validation) customer insights, Stage 4 competitive positioning

**Tasks**:
1. **Define Target Customer Segments**:
   - ICP (Ideal Customer Profile) by segment
   - Customer persona details (demographics, psychographics, pain points)
   - Prioritize segments (which to target first)
2. **Design Customer Acquisition Strategy**:
   - Acquisition channels (inbound marketing, outbound sales, partnerships)
   - Channel mix (% budget allocation per channel)
   - Customer acquisition cost (CAC) targets
3. **Set Pricing Strategy**:
   - Pricing tiers (freemium, basic, premium, enterprise)
   - Pricing model (per-user, per-feature, usage-based)
   - Discounts and promotions
4. **Plan Sales Process**:
   - Sales funnel stages (awareness → interest → decision → purchase)
   - Sales team structure (SDRs, AEs, CSMs)
   - Sales tools and enablement (CRM, demo scripts, case studies)
5. **Define Marketing Approach**:
   - Brand positioning
   - Content marketing strategy
   - Demand generation tactics

**Output**: Go-to-Market Playbook (customer segments, acquisition strategy, pricing, sales process)

**Done When**: Go-to-market planned (customer acquisition, pricing, sales channels documented)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:304 "Go-to-market planned"

---

### Step 7.1.3: Design Operations

**Inputs**: Stage 6 (Risk Evaluation) compliance requirements, Stage 5 (Profitability) OpEx structure

**Tasks**:
1. **Design Core Processes**:
   - Order-to-cash process (sales → fulfillment → payment)
   - Customer onboarding process
   - Customer support process (ticketing, escalation)
2. **Define Org Structure**:
   - Reporting lines (who reports to whom)
   - Roles and responsibilities (RACI matrix)
   - Team sizes by function (engineering, sales, support)
3. **Identify Key Partnerships**:
   - Strategic partners (integrations, distribution)
   - Vendor relationships (infrastructure, tools)
   - Service providers (legal, accounting)
4. **Plan Operational Infrastructure**:
   - Office space (remote, hybrid, office)
   - Tools and systems (Slack, Jira, CRM, ERP)
   - Operational workflows (hiring, expense approval, procurement)
5. **Address Compliance Requirements**:
   - Regulatory compliance processes (GDPR, HIPAA)
   - Legal structure (incorporation, contracts)
   - Risk mitigation procedures (from Stage 6)

**Output**: Operations Design Document (processes, org structure, partnerships, infrastructure)

**Done When**: Operations designed (processes, org structure, key partnerships documented)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:305 "Operations designed"

---

## Substage 7.2: Technical Planning

**Objective**: Design architecture, select tech stack, create development roadmap

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:306-311 "Technical Planning"

### Step 7.2.1: Design Architecture

**Inputs**: Stage 3 (Comprehensive Validation) functional requirements, Stage 6 security requirements

**Tasks**:
1. **Define System Components**:
   - Frontend (web app, mobile app)
   - Backend (API server, business logic)
   - Database (relational, NoSQL, data warehouse)
   - Infrastructure (cloud provider, CDN, caching)
2. **Map Data Flow**:
   - Data sources (user input, external APIs)
   - Data transformations (business logic, calculations)
   - Data storage (database schema, file storage)
   - Data consumers (UI, reports, external integrations)
3. **Design Integration Points**:
   - Third-party integrations (payment, auth, analytics)
   - APIs (REST, GraphQL, webhooks)
   - Data sync mechanisms (real-time, batch)
4. **Plan Security Architecture**:
   - Authentication (OAuth, SSO, MFA)
   - Authorization (RBAC, permissions)
   - Data encryption (at rest, in transit)
   - Security controls (WAF, DDoS protection)
5. **Consider Scalability and Performance**:
   - Load balancing strategy
   - Caching layers (Redis, CDN)
   - Database optimization (indexing, sharding)
   - Performance targets (response time, throughput)

**Output**: Architecture Diagram (system components, data flow, integrations)

**Done When**: Architecture designed (system components, data flow, integrations documented)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:309 "Architecture designed"

---

### Step 7.2.2: Select Tech Stack

**Inputs**: Architecture design (from Step 7.2.1), Stage 6 risk assessment

**Tasks**:
1. **Choose Frontend Technologies**:
   - Framework (React, Vue, Angular, Svelte)
   - UI library (Material-UI, Tailwind, Bootstrap)
   - State management (Redux, Zustand, Context API)
2. **Choose Backend Technologies**:
   - Language (Node.js, Python, Go, Java)
   - Framework (Express, FastAPI, Gin, Spring Boot)
   - API design (REST, GraphQL, gRPC)
3. **Choose Database Technologies**:
   - Primary database (PostgreSQL, MySQL, MongoDB)
   - Caching (Redis, Memcached)
   - Search (Elasticsearch, Algolia)
4. **Choose Infrastructure**:
   - Cloud provider (AWS, GCP, Azure)
   - Hosting (EC2, ECS, Kubernetes, serverless)
   - CI/CD (GitHub Actions, CircleCI, Jenkins)
5. **Evaluate Technology Decisions**:
   - Team expertise (do we know this stack?)
   - Community support (active ecosystem, docs)
   - Vendor lock-in risk (can we migrate if needed?)
   - Cost implications (licensing, hosting)

**Output**: Tech Stack Document (frontend, backend, database, infrastructure with rationale)

**Done When**: Tech stack selected (frontend, backend, database, infrastructure decided)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:310 "Tech stack selected"

---

### Step 7.2.3: Create Development Roadmap

**Inputs**: Architecture design, tech stack, Stage 5 timeline constraints

**Tasks**:
1. **Break Down Work into Milestones**:
   - MVP (Minimum Viable Product) milestone
   - Beta release milestone
   - GA (General Availability) milestone
   - Post-launch iterations (v1.1, v1.2, v2.0)
2. **Define Release Scope**:
   - MVP features (core functionality only)
   - Beta features (MVP + key enhancements)
   - GA features (Beta + polish, security, scalability)
3. **Estimate Development Timeline**:
   - MVP delivery date (e.g., 3 months)
   - Beta delivery date (e.g., 6 months)
   - GA delivery date (e.g., 9 months)
   - Include buffer time (20% contingency)
4. **Identify Dependencies**:
   - Technical dependencies (backend API before frontend)
   - External dependencies (third-party integrations)
   - Resource dependencies (need to hire engineers first)
5. **Map Roadmap to Business Goals**:
   - Revenue milestones (when do we start charging?)
   - Customer acquisition milestones (when do we onboard first customers?)
   - Compliance milestones (when must GDPR be ready?)

**Output**: Development Roadmap (milestones, release scope, timeline, dependencies)

**Done When**: Development roadmap created (milestones, releases, dependencies documented)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:311 "Development roadmap created"

---

## Substage 7.3: Resource Planning

**Objective**: Define team requirements, allocate budget, set timeline

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:312-317 "Resource Planning"

### Step 7.3.1: Define Team Requirements

**Inputs**: Technical roadmap (from Substage 7.2), Operations design (from Substage 7.1)

**Tasks**:
1. **Identify Required Roles**:
   - Engineering (frontend, backend, DevOps, QA)
   - Product (PM, designer, researcher)
   - Business (sales, marketing, customer success)
   - Operations (finance, legal, HR)
2. **Determine Team Sizes**:
   - Engineering team (e.g., 5 engineers for MVP)
   - Product team (e.g., 1 PM, 1 designer)
   - Business team (e.g., 2 sales, 1 marketer)
3. **Specify Skills and Seniority**:
   - Senior engineers (for architecture, mentorship)
   - Mid-level engineers (for feature development)
   - Junior engineers (for support tasks)
4. **Plan Hiring Timeline**:
   - Month 1: Hire lead engineer, PM
   - Month 2: Hire 3 engineers, designer
   - Month 3: Hire QA, DevOps
5. **Consider Team Structure**:
   - In-house vs contractors
   - Full-time vs part-time
   - Onshore vs offshore

**Output**: Team Requirements Document (roles, sizes, skills, hiring timeline)

**Done When**: Team requirements defined (roles, skills, seniority levels documented)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:315 "Team requirements defined"

---

### Step 7.3.2: Allocate Budget

**Inputs**: Stage 5 (Profitability Forecasting) financial model, Team requirements (from Step 7.3.1)

**Tasks**:
1. **Calculate Salary Budget**:
   - Engineering salaries (by role, seniority, location)
   - Product/Business salaries
   - Contractor/freelancer costs
2. **Estimate Infrastructure Costs**:
   - Cloud hosting (AWS/GCP/Azure)
   - SaaS tools (Slack, Jira, GitHub, CRM)
   - Office space (if applicable)
3. **Plan Marketing/Sales Budget**:
   - Customer acquisition spend (ads, events, partnerships)
   - Content creation (blog, video, design)
   - Sales enablement (tools, training)
4. **Include Contingency**:
   - 10-20% buffer for unexpected costs
   - Risk mitigation costs (from Stage 6)
5. **Validate Against Financial Model**:
   - Ensure budget aligns with Stage 5 OpEx/CapEx projections
   - Flag any discrepancies (may trigger recursion to Stage 5)

**Output**: Budget Allocation Spreadsheet (salaries, infrastructure, marketing, contingency)

**Done When**: Budget allocated (salaries, infrastructure, tools, contingency documented)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:316 "Budget allocated"

---

### Step 7.3.3: Set Timeline

**Inputs**: Development roadmap (from Substage 7.2), Team requirements, Budget

**Tasks**:
1. **Define Key Milestones**:
   - Project kickoff date
   - MVP completion date
   - Beta launch date
   - GA launch date
2. **Set Deliverable Dates**:
   - Architecture design complete (Week 4)
   - Backend API ready (Week 12)
   - Frontend MVP ready (Week 16)
   - Testing complete (Week 20)
3. **Build Timeline with Dependencies**:
   - Gantt chart showing task dependencies
   - Critical path identified (tasks that cannot be delayed)
   - Parallel work streams (frontend + backend simultaneously)
4. **Include Buffer Time**:
   - 20% buffer for technical complexity
   - 10% buffer for team ramp-up
   - Additional buffer for high-risk tasks (from Stage 6)
5. **Align with Business Constraints**:
   - Market launch window (seasonal demand, competitive moves)
   - Compliance deadlines (GDPR, SOC2)
   - Investor milestones (demo day, funding close)

**Output**: Project Timeline (Gantt chart with milestones, deliverables, dependencies, buffers)

**Done When**: Timeline set (milestones, deliverable dates, buffer time documented)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:317 "Timeline set"

---

## Exit Gates (Quality Checks)

Before advancing to Stage 8, verify:

1. **Business plan approved**: Chairman/stakeholders reviewed and approved business model, go-to-market, operations
2. **Technical roadmap set**: Architecture finalized, tech stack selected, development roadmap committed
3. **Resources allocated**: Team requirements defined, budget locked, timeline committed

**Validation Steps**:
- **Completeness Check**: All substages marked "done_when" (9 criteria met)
- **Consistency Check**: Plans are internally consistent (timeline aligns with budget, team size matches roadmap)
- **Chairman Approval**: Chairman reviewed and approved all 3 plans
- **Stakeholder Alignment**: Key stakeholders (investors, leadership) aligned on plans

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:295-298 "exit: Business plan approved"

---

## Rollback Procedures

**Triggers for Rollback** (not yet implemented):
- Critical calculation errors in budget or timeline
- Chairman rejects plans (requests major revisions)
- Recursion triggered from Stage 8 or 10 (planning assumptions invalidated)

**Rollback Steps** (proposed):
1. Mark Stage 7 status as "In Progress" (revert from "Complete")
2. Restore previous version of plans (if available)
3. Document reason for rollback
4. Re-execute affected substages
5. Re-submit for Chairman approval

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-07.md:25 "Unclear rollback procedures"
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-07.md:46-49 "Add Rollback Procedures"

---

## Common Pitfalls and Best Practices

### Pitfall 1: Over-Planning (Analysis Paralysis)

**Issue**: Team spends weeks creating comprehensive plans but never starts execution
**Best Practice**: Time-box planning (e.g., 2 weeks max), accept that plans will evolve
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-07.md:61 "Primary Risk: Process delays"

---

### Pitfall 2: Inconsistent Plans

**Issue**: Business plan assumes 3-month timeline, but technical roadmap shows 6 months
**Best Practice**: Validate consistency across all 3 plans (business, technical, resource)
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-07.md:12 "Data Readiness: data flow unclear"

---

### Pitfall 3: Ignoring Risks

**Issue**: Plans created without considering Stage 6 risk assessment (e.g., compliance timelines ignored)
**Best Practice**: Reference Stage 6 risk register throughout planning, add mitigation tasks to roadmap
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:279-281 "inputs: Risk assessment"

---

### Pitfall 4: Underestimating Resources

**Issue**: Roadmap assumes 3 engineers, but architecture complexity requires 6
**Best Practice**: Validate resource estimates with technical experts; add 20% buffer
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:62 "Decomposition reveals resource shortage"

---

### Pitfall 5: Overly Optimistic Timelines

**Issue**: Timeline ignores buffer for unknowns, team ramp-up time
**Best Practice**: Add 20-30% buffer; use historical data from similar projects
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:63 "Task breakdown exceeds timeline constraints"

---

## Sources Table

| Source | Repo | Commit | Path | Lines |
|--------|------|--------|------|-------|
| Stage definition | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 274-319 |
| Entry/exit gates | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 291-298 |
| Substages | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 299-317 |
| Rollback gap | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-07.md | 25, 46-49 |
| Risk assessment | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-07.md | 61-64 |
| Recursion triggers | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-08.md | 62-63 |

---

<!-- Generated by Claude Code Phase 3 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
