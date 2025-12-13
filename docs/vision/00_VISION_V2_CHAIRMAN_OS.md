# EHG VISION v2: THE CHAIRMAN'S OPERATING SYSTEM

**Status:** APPROVED
**Date:** December 2025
**Scope:** Architecture, UX, Database, and Workflow
**Authority:** This document is the "Constitution" for all EHG agents and development.

### Deployment Assumption (Production)

This system is designed to be **production-safe for a single human operator**:
- **One human user**: Rick is both the **Chairman** and the **Solo Entrepreneur** (two modes, one identity).
- **Hard security boundary**: human actions run as `authenticated` (Rick), while agents/automation run as `service_role`.
- **No “authenticated = god mode”**: RLS must not be permissive just because there is one user.

---

## 1. The Core Philosophy

We are not building a dashboard; we are building a **Command Center**.

The system is designed around a strict hierarchy of power to prevent "Solo Founder Burnout."

### The Chain of Command

```
┌─────────────────────────────────────────────────────────────────────┐
│                        RICK (The Chairman)                          │
│         "What should we build?" / "Is this worth pursuing?"         │
│                    INTENT • APPROVAL • DIRECTION                    │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         EVA (Chief of Staff)                        │
│        "I'll handle that, Rick. Here's what you need to know."      │
│               TRANSLATION • ORCHESTRATION • SYNTHESIS               │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Venture CEO (Per Venture, L2)                    │
│        "Run the venture day-to-day within the guardrails."          │
│             EXECUTION PLANNING • RESOURCE ALLOCATION • QA           │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                 VPs + Crews (The Workforce, L3/L4)                  │
│        Specialized agents doing specialized work per stage          │
│                 RESEARCH • ANALYSIS • GENERATION                    │
└─────────────────────────────────────────────────────────────────────┘
```

### The Three Principals

1. **The Chairman (Rick):**
   - **Function:** Intent, Taste, Final Decisions.
   - **Input:** Natural Language Commands ("EVA, look into this.")
   - **Output:** Approvals and Strategic Direction.

2. **The Chief of Staff (EVA):**
   - **Function:** Translation, Orchestration, Gatekeeping.
   - **Role:** She intercepts commands and decides *which* agents to deploy. She intercepts agent outputs and decides *what* is worth the Chairman's time.

3. **The Workforce (crewAI):**
   - **Function:** Execution, Research, Coding, Marketing.
   - **Role:** Fungible, specialized swarms that execute specific stages of the 25-stage workflow.

---

## 2. The User Experience: "The Glass Cockpit"

The UI is divided into two distinct modes to match the two User Personas.

### Mode A: The Chairman's Office (`/chairman`)

**The Vibe:** "Captain Picard on the Bridge." Calm, high-level, decision-oriented.

**The Interface:**
- **No Clutter:** No list of 50 database rows.
- **The Morning Briefing:** EVA greets with a synthesized summary.
  > *"Good morning, Rick. 3 Ventures are active. Solara is waiting at Gate 5."*
- **The Decision Stack:** A card stack of decisions requiring attention.
  - `[Approve]` `[Reject]` `[Ask EVA]`
- **Global Health:** A visualization of the Portfolios (EHG > Portfolio > Venture).
- **Integration:** Pulls widgets from existing `/risk-forecasting` and `/analytics` logic.

### Mode B: The Factory Floor (`/ventures/:id`)

**The Vibe:** "Iron Man in the Workshop." Detailed, mechanical, powerful.

**The Interface:**
- **The Assembly Line:** The 25 Stages visualized horizontally.
- **Live Telemetry:** Visual indicators of crewAI agents (icons) moving between stages. Real-time "Token Burn" metrics.
- **Inspection:** Click any stage to see raw artifacts (code, docs) and logs.
- **Direct Override:** Highlight text in an AI doc and command: *"Rewrite this."*

### Progressive Disclosure Pattern

```
┌─────────────────────────────────────────────────────────────────────┐
│  LAYER 0: EVA BRIEFING (Chairman Mode - Default)                   │
│    "VentureX completed Stage 4. Key finding: Market is smaller     │
│     than assumed. Recommend: Pivot to adjacent segment."           │
│    [Approve] [Reject] [Tell me more]                               │
└─────────────────────────────────────────────────────────────────────┘
                              │
                    [Tell me more]
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  LAYER 1: DECISION CONTEXT                                         │
│    Assumption Made (Stage 2): "TAM is $500M"                       │
│    Evidence Found (Stage 4): TAM appears to be $120M               │
│    Confidence: 72% (based on 3 data sources)                       │
│    [See the evidence] [See crew reasoning] [Override: Proceed]     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                    [See the evidence]
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  LAYER 2: BUILDER VIEW (Factory Floor Mode)                        │
│    Raw crew outputs, execution logs, token usage, artifacts        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Technical Architecture: "The EVA Layer"

EVA is not just a chatbot. She is a **Stateful Orchestration Engine**.

### EVA's Three Functions

| Function | Description | Example |
|----------|-------------|---------|
| **INTERPRETER** | Receives Rick's natural language commands | "Look into that competitor in Austin" |
| **ORCHESTRATOR** | Dispatches to appropriate crew teams with proper context | Market Research Crew → Competitor Analysis job |
| **SYNTHESIZER** | Aggregates crew output into executive-ready summaries | "Three competitors exist. Biggest threat is X." |

### The Command Loop

```
1. RICK: "EVA, I want to pivot Solara to focus on Enterprise customers."
         │
         ▼
2. EVA (Interpreter):
   - Analyzes current stage
   - Recognizes need to update Business Model Canvas (Stage 8)
   - Recognizes need to update GTM Strategy (Stage 11)
         │
         ▼
3. EVA (Dispatcher):
   - Spawns the Strategy Crew via LEO Protocol
   - Provides context: current assumptions, market data, Rick's intent
         │
         ▼
4. crewAI (Executor):
   - Agents execute the work
   - Generate artifacts with Four Buckets classification
         │
         ▼
5. EVA (Synthesizer):
   - Reviews output quality
   - Only alerts Rick if:
     * Plan is solid (Success) → Present for approval
     * Strategic blocker exists (Failure) → Present for decision
```

### EVA State Management

EVA maintains:
- **Rick's Mental Model:** Priorities, preferences, risk tolerance, communication style
- **Portfolio State:** Which ventures are active, paused, or killed
- **Decision History:** Past approvals/rejections and reasoning
- **Assumption Registry:** Current beliefs being validated

---

## 4. The 25-Stage Venture Lifecycle

### Stage 0: INCEPTION (Pre-Lifecycle)

Stage 0 is a **pre-lifecycle** holding stage used to safely capture a venture before it enters the formal 25-stage pipeline.

- **Purpose**: reduce “false starts” by forcing a lightweight capture step before Stage 1.
- **No automatic advancement**: Stage 0 is **Chairman-authorized**; EVA may assist, but must not advance the venture without Chairman intent.
- **Primary output artifact**: **Inception Brief** (a structured artifact stored and versioned like any other stage artifact).
- **Optional assistance**:
  - **Complexity/Tier assessment**: on-demand (not continuous) to recommend budget profile and initial workflow depth.
  - **Inception Triage (crewAI)**: optional “sandbox” run (simulation-safe) that produces a triage summary tagged with Four Buckets.

#### Stage 0 → Stage 1 Promotion (Non-Negotiable)

Promotion into the formal lifecycle MUST be:

- **Atomic**: one transactional operation updates venture stage, writes transition history, and initializes Stage 1 scaffolding.
- **Idempotent**: repeated submissions with the same `Idempotency-Key` MUST not double-advance or double-create artifacts.
- **Validated**: minimum requirements (e.g., non-trivial description / Inception Brief completeness) MUST be enforced before promotion.

This prevents “split-brain stage state” and ensures the Factory Floor always reflects a consistent stage reality.

### Autonomous Opportunity Discovery (Deal Flow) (Pre-Stage 0)

Ideation is the highest leverage function of the Venture Factory. Vision v2 supports **autonomous opportunity discovery** that continuously generates and curates venture candidates **without** creating or advancing ventures automatically.

- **Output**: AI-generated **Opportunity Blueprints** (deal flow inventory) with:
  - a structured concept scaffold (problem → customer → solution → business model hypothesis)
  - an optional **Board Simulation Review** (multi-agent consensus) producing a verdict + rationale
  - provenance: source signals + cost/tokens + Four Buckets tags for claims
- **Safety boundary**:
  - Automation MAY generate blueprints and reviews.
  - Automation MUST NOT create a venture, promote Stage 0→1, or bypass gates.
  - The Chairman explicitly decides to “Instantiate Venture from Blueprint” (enters Stage 0 with an Inception Brief derived from the blueprint).
- **Modes**:
  - **Manual**: Chairman clicks “Generate Blueprints” from the Chairman’s Office.
  - **Scheduled**: EVA runs a daily/weekly “Deal Flow” job (service_role) and populates the Opportunity Inbox.

### The Six Phases

| Phase | Name | Stages | Purpose |
|-------|------|--------|---------|
| 1 | THE TRUTH | 1-5 | Validation & Market Reality |
| 2 | THE ENGINE | 6-9 | Business Model Foundation |
| 3 | THE IDENTITY | 10-12 | Brand & Go-to-Market |
| 4 | THE BLUEPRINT | 13-16 | Technical Architecture |
| 5 | THE BUILD LOOP | 17-20 | Implementation |
| 6 | LAUNCH & LEARN (`LAUNCH_LEARN`) | 21-25 | Deployment & Optimization |

### Gate Architecture

| Gate Type | Trigger | EVA Role | Rick Role |
|-----------|---------|----------|-----------|
| **Auto-Advance** | Crew completes stage | Validates outputs, logs progress | None (informed async) |
| **Advisory Checkpoint** | Stages 3, 5, 13, 16, 23 | Presents summary + recommendation | Reviews, may override |
| **Hard Gate** | Stage 25 (Mode Transition) + Kill/Pivot decisions | Presents evidence for decision | Must approve to proceed |

**Stage 0 Special Case**:
- Stage 0 is not part of the 25-stage gating loop.
- The only “gate” is **Promotion to Stage 1**, which is always **Chairman-authorized** and must follow the atomic/idempotent rules above.

### The Gate Flow

```
CREW COMPLETES STAGE
        │
        ▼
EVA: OUTPUT VALIDATION
- All required artifacts present?
- Four Buckets tagged?
- Quality threshold met?
        │
   ┌────┴────┐
   │         │
 [PASS]   [FAIL]
   │         │
   ▼         ▼
GATE     REMEDIATION
CHECK    (Re-dispatch crew)
   │
   ├── [Not Decision Gate] → AUTO-ADVANCE
   │
   └── [Decision Gate: 3,5,13,16,23,25] → CHAIRMAN BRIEFING
                                      │
                                      ▼
                               RICK DECIDES
                               [Approve] [Reject] [Modify]
```

---

## 5. TECHNICAL APPENDIX: Implementation Details

### A. The "Kill List" (Immediate Purge Targets)

*Based on Anti-Gravity & Claude Assessment.*

These files and routes represent legacy models and must be removed:

#### Ghost Town Routes (Remove from Business App)
- `/phase2-testing`
- `/phase2-dashboard`
- `/gtm-intelligence`
- `/development`
- `/automation`

#### Zombie Components (Refactor/Replace)
| File | Issue | Action |
|------|-------|--------|
| `src/client/src/components/VenturesManager.jsx` | Hardcoded 7-stage labels (lines 89-99) | **REBUILD** with 25-stage model |
| `src/components/stages/Stage26...` through `Stage52...` | Legacy 52-stage code | **DELETE** |

#### Database Cleanup
- Any record in `venture_stage_work` where `stage_number > 25`
- Any orphaned stage references to old model

---

### B. The Schema Plan (Data Backbone)

*Based on Codex Assessment.*

#### New Tables Required

**1. `chairman_directives`**
```sql
CREATE TABLE chairman_directives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  command_text TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'active', -- active/delegated/completed
  venture_id UUID REFERENCES ventures(id),
  priority VARCHAR(10) DEFAULT 'normal',
  eva_interpretation JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
```

**2. `venture_stage_assignments`**
```sql
CREATE TABLE venture_stage_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id),
  stage_number INT NOT NULL CHECK (stage_number BETWEEN 1 AND 25),
  crew_name VARCHAR(100) NOT NULL,
  agent_id UUID,
  status VARCHAR(20) DEFAULT 'pending', -- pending/in_progress/completed/failed
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  artifacts JSONB,
  UNIQUE(venture_id, stage_number, crew_name)
);
```

**3. `venture_token_ledger`** (Golden Nugget)
```sql
CREATE TABLE venture_token_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id),
  stage_number INT NOT NULL,
  agent_type VARCHAR(50),
  job_id UUID,
  tokens_input INT DEFAULT 0,
  tokens_output INT DEFAULT 0,
  cost_usd NUMERIC(10,6) DEFAULT 0,
  model_used VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_token_ledger_venture ON venture_token_ledger(venture_id);
CREATE INDEX idx_token_ledger_stage ON venture_token_ledger(venture_id, stage_number);
```

**4. `assumption_sets`** (Golden Nugget)
```sql
CREATE TABLE assumption_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id),
  version INT DEFAULT 1,
  stage_created INT NOT NULL, -- Stage where assumption was made
  assumption_category VARCHAR(50), -- market/competitor/product/timing/financial
  assumption_text TEXT NOT NULL,
  confidence_score NUMERIC(3,2), -- 0.00 to 1.00
  evidence_sources JSONB,
  reality_check_status VARCHAR(20) DEFAULT 'pending', -- pending/validated/invalidated
  reality_check_stage INT, -- Stage where reality was checked
  reality_evidence TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  validated_at TIMESTAMPTZ
);
```

---

### C. The "Missing Link" API

**Problem:** Frontend calls `/api/ventures` but backend does not have it.

**Requirement:** Build endpoints that strictly adhere to the 25-stage configuration in `lifecycle_stage_config`.

#### Required Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/ventures` | List all ventures with stage summary |
| `GET` | `/api/ventures/:id` | Get venture detail with full stage breakdown |
| `POST` | `/api/ventures` | Create new venture (enters Stage 1) |
| `PATCH` | `/api/ventures/:id` | Update venture metadata |
| `POST` | `/api/ventures/:id/advance` | Advance to next stage (EVA validates) |
| `GET` | `/api/chairman/briefing` | Get EVA's morning briefing |
| `GET` | `/api/chairman/decisions` | Get pending decision stack |
| `POST` | `/api/chairman/decide` | Submit decision (approve/reject/modify) |

---

## 6. Execution Roadmap (Strategic Directives)

### PHASE 1: THE CLEANSE (Infrastructure)

**SD-VISION-V2-PURGE**
- Delete the 52-stage legacy code
- Establish strict 25-stage database constraints
- Archive "Ghost Town" routes
- Fix VenturesManager.jsx zombie code

### PHASE 2: THE BRAIN (Backend)

**SD-VISION-V2-SCHEMA**
- Implement `chairman_directives` table
- Implement `venture_stage_assignments` table
- Implement `venture_token_ledger` table
- Implement `assumption_sets` table

**SD-VISION-V2-EVA-CORE**
- Build the "EVA Dispatcher" logic
- Implement command interpretation
- Build crew orchestration interface

**SD-VISION-V2-API**
- Build `/api/ventures` endpoints
- Build `/api/chairman` endpoints
- Integrate with EVA layer

### PHASE 3: THE COCKPIT (Frontend)

**SD-VISION-V2-UI-CHAIRMAN**
- Build the `/chairman` Briefing Dashboard
- Implement Decision Stack UI
- Add Portfolio Health visualization

**SD-VISION-V2-UI-FACTORY**
- Build the `/ventures/:id` Assembly Line view
- Implement 25-stage horizontal visualization
- Add "Builder Mode" toggle with live telemetry

---

## 7. Design Principles (The Laws)

| Principle | Implementation |
|-----------|----------------|
| **Rick doesn't talk to crews** | EVA intercepts all commands, translates to crew jobs |
| **EVA earns Rick's trust** | By being right, concise, and not wasting his time |
| **Crews are fungible** | Rick doesn't care which agent did what. He sees outcomes. |
| **Gates protect quality** | Auto-advance for routine stages, Rick decides at key moments |
| **Builder Mode is opt-in** | Default is Chairman view. Drill down only when needed. |
| **Tokens are capital** | EVA manages budget, reports variance, justifies spend |
| **Assumptions are tracked** | Every belief is registered and validated against reality |
| **Four Buckets prevent hallucination** | Facts, Assumptions, Simulations, Unknowns - always classified |

---

## 8. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Decision Latency** | <2 min for routine gates | Time from EVA briefing to Rick decision |
| **False Positives** | <10% | Decisions escalated that didn't need Rick |
| **Venture Throughput** | 3x current | Ventures reaching Stage 25 per quarter |
| **Token Efficiency** | Track and improve | Cost per successful venture |
| **Assumption Accuracy** | Improve over time | % of assumptions validated at launch |

---

*This is the Chairman's OS: **Rick commands, EVA coordinates, Crews execute.***

---

## 9. TECHNICAL SPECIFICATIONS (RED TEAM APPROVED)

### 9.1. UX/UI Specifications (The Glass Cockpit)
*Source: Anti-Gravity Assessment*

#### A. The Morning Briefing Data Structure
The `/chairman` dashboard is driven by this specific JSON payload from EVA:

```json
{
  "greeting": "Good morning, Rick. Systems nominal.",
  "generated_at": "2025-12-12T08:00:00Z",
  "global_health_score": 88,
  "portfolio_health": {
    "total_ventures": 12,
    "active": 8,
    "paused": 2,
    "killed_this_month": 1,
    "launched_this_month": 1
  },
  "decision_stack": [
    {
      "id": "uuid",
      "venture_id": "uuid",
      "venture_name": "Solara",
      "type": "gate_decision",
      "stage": 5,
      "stage_name": "Profitability Forecasting",
      "urgency": "high",
      "summary": "Profitability analysis complete. LTV:CAC = 4:1. Retention assumption weak.",
      "recommendation": "proceed",
      "action_required": true
    }
  ],
  "alerts": [
    {
      "type": "token_budget_warning",
      "venture_name": "DataSync",
      "message": "Token budget 85% consumed at Stage 12 (expected 48%)",
      "severity": "warning"
    }
  ],
  "token_summary": {
    "total_spent_this_week": 245000,
    "cost_usd_this_month": 48.50
  }
}
```

#### B. Visual Components

| Component | Purpose | Location |
|-----------|---------|----------|
| `<EvaBriefingContainer />` | Full-screen wrapper for Chairman dashboard | `/chairman` |
| `<BriefingTicker />` | Renders global metrics (Token Burn, Health Score) | Header |
| `<DecisionDeck />` | Card-based interface for `action_required` items | Main content |
| `<AgentTelemetry />` | Visualizes crew state (IDLE=Grey, WORKING=Cyan, BLOCKED=Red) | Factory Floor |
| `<VentureAssemblyLine />` | 25-stage horizontal visualization | `/ventures/:id` |

---

### 9.2. Database Schema Specifications (The Brain)
*Source: Codex Assessment*

#### A. Command Chain Lineage

These tables implement "Intent to Execution" tracking:

```sql
-- 1. DIRECTIVES: The Chairman's Command
CREATE TABLE chairman_directives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  command_text TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','delegated','completed')),
  venture_id UUID REFERENCES ventures(id),
  priority VARCHAR(10) DEFAULT 'normal',
  eva_interpretation JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- 2. DELEGATIONS: EVA's Dispatch to Crews
CREATE TABLE directive_delegations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  directive_id UUID REFERENCES chairman_directives(id),
  assigned_to_type VARCHAR(20) CHECK (assigned_to_type IN ('crew','agent','human')),
  assigned_to_crew_id UUID,
  task_contract_id UUID REFERENCES agent_task_contracts(id),
  status VARCHAR(20) DEFAULT 'pending',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  result_summary TEXT
);

-- 3. STAGE ASSIGNMENTS: Links Crews to Stages
CREATE TABLE venture_stage_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id),
  stage_number INT NOT NULL CHECK (stage_number BETWEEN 1 AND 25),
  crew_name VARCHAR(100) NOT NULL,
  agent_id UUID,
  status VARCHAR(20) DEFAULT 'pending',
  tokens_used INT DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  artifacts JSONB,
  UNIQUE(venture_id, stage_number, crew_name)
);

-- 4. TOKEN LEDGER: Cost Accounting
CREATE TABLE venture_token_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id),
  stage_number INT NOT NULL,
  agent_type VARCHAR(50),
  job_id UUID,
  tokens_input INT DEFAULT 0,
  tokens_output INT DEFAULT 0,
  cost_usd NUMERIC(10,6) DEFAULT 0,
  model_used VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. ASSUMPTIONS: Golden Nugget Versioning
CREATE TABLE assumption_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id),
  version INT DEFAULT 1,
  stage_created INT NOT NULL,
  assumption_category VARCHAR(50),
  assumption_text TEXT NOT NULL,
  confidence_score NUMERIC(3,2),
  evidence_sources JSONB,
  reality_check_status VARCHAR(20) DEFAULT 'pending',
  reality_check_stage INT,
  reality_evidence TEXT,
  is_current BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  validated_at TIMESTAMPTZ
);
```

#### B. RLS Policies

```sql
-- Authenticated users can read all ventures
CREATE POLICY "authenticated_read_ventures" ON ventures
  FOR SELECT TO authenticated USING (true);

-- Chairman directives: any authenticated user
CREATE POLICY "chairman_directives_access" ON chairman_directives
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Service role for EVA backend operations
CREATE POLICY "service_role_full_access" ON chairman_directives
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

---

### 9.3. API & Orchestration Specifications (The Nervous System)
*Source: Claude Architecture Assessment*

#### A. The "Missing Link" API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/ventures` | List all ventures with stage summary |
| `GET` | `/api/ventures/:id` | Full venture detail with 25-stage breakdown |
| `POST` | `/api/ventures` | Create new venture (enters Stage 1) |
| `GET` | `/api/chairman/briefing` | EVA's synthesized morning briefing |
| `GET` | `/api/chairman/decisions` | Pending decision queue |
| `POST` | `/api/chairman/decide` | Submit Chairman decision |

#### B. Decision Endpoint Contract

```typescript
// POST /api/chairman/decide
// Request:
{
  "decision_id": "uuid",
  "decision": "proceed", // proceed | pivot | fix | kill | pause | override
  "notes": "Watch retention closely at Stage 24",
  "override_reason": null // Required if decision != recommendation
}

// Response: 200 OK
{
  "success": true,
  "decision_id": "uuid",
  "venture_id": "uuid",
  "next_stage": 6,
  "message": "Solara advanced to Stage 6: Risk Evaluation Matrix"
}
```

#### C. The EVA Dispatcher Logic

EVA does not run on the client. She runs on the server as an Orchestrator.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         EVA (Orchestrator)                          │
│   Receives command → Interprets → Creates Task Contract             │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                    1. INSERT into agent_task_contracts
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     agent_task_contracts (DB)                       │
│   status: 'pending' → 'claimed' → 'in_progress' → 'completed'       │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                    2. crewAI polls/claims contract
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        crewAI (Executor)                            │
│   Claims contract → Executes work → Updates contract with results   │
└─────────────────────────────────────────────────────────────────────┘
```

**Trigger:** When `chairman_directives` receives a new row.
**Action:** EVA analyzes the text → Selects a crewAI template → Creates a `directive_delegation` → Triggers the Crew via Task Contract.

#### D. Crew Type Mapping

| Stage | Crew Type | Purpose |
|-------|-----------|---------|
| 1-2 | IDEA_STRUCTURING | Draft and critique ideas |
| 3 | MARKET_VALIDATION | Problem-solution fit |
| 4 | COMPETITIVE_INTEL | Competitor analysis |
| 5 | FINANCIAL_MODELING | Unit economics |
| 6 | RISK_ASSESSMENT | Risk identification |
| 7 | PRICING_STRATEGY | Pricing models |
| 8 | BUSINESS_MODEL | BMC generation |
| 9 | EXIT_STRATEGY | Exit planning |
| 10 | BRAND_NAMING | Identity creation |
| 11 | GTM_STRATEGY | Go-to-market (tournament) |
| 12 | SALES_PLAYBOOK | Sales & success |
| 13-16 | TECHNICAL_SPEC | Architecture & schemas |
| 17-20 | IMPLEMENTATION | Code generation |
| 21 | QA_TESTING | UAT execution |
| 22-25 | DEPLOYMENT | Launch & optimize |

---

### 9.4. Authentication Specification

#### A. Approach: User-Based with Chairman Detection

```javascript
// middleware/chairman-auth.js
async function requireChairmanAccess(req, res, next) {
  // 1. Verify user is authenticated
  const { data: { user }, error } = await supabase.auth.getUser(
    req.headers.authorization?.replace('Bearer ', '')
  );

  if (error || !user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  req.user = user;

  // 2. Check if user has chairman interests (indicates chairman role)
  const { data: interests } = await supabase
    .from('chairman_interests')
    .select('id')
    .eq('user_id', user.id)
    .limit(1);

  // For MVP: any authenticated user can access /chairman
  // Production: check interests.length > 0 or add explicit role
  req.isChairman = interests && interests.length > 0;

  next();
}

// Apply to chairman routes
app.use('/api/chairman/*', requireChairmanAccess);
```

**Note:** No special database role required. Chairman is detected via `chairman_interests` table entries.

---

## 10. Technical Specification Files

The detailed implementation specifications have been extracted into standalone documents for easier reference and maintenance.

### Specification Index

| File | Purpose | Key Contents |
|------|---------|--------------|
| [01-database-schema.md](./specs/01-database-schema.md) | Database Schema | Tables, functions, RLS policies, migrations |
| [02-api-contracts.md](./specs/02-api-contracts.md) | API Contracts | TypeScript interfaces, Zod schemas, endpoint definitions |
| [03-ui-components.md](./specs/03-ui-components.md) | UI Architecture | Component hierarchy, props, state management, migration guide |
| [04-eva-orchestration.md](./specs/04-eva-orchestration.md) | EVA Logic | State machines, task contracts, crew configs, event handlers, feedback loops |
| [05-user-stories.md](./specs/05-user-stories.md) | User Stories | Personas (Chairman, Entrepreneur, EVA), user stories, acceptance criteria |
| [06-hierarchical-agent-architecture.md](./specs/06-hierarchical-agent-architecture.md) | Agent Hierarchy | 4-level hierarchy, agent registry, tool sharing, communication protocol |
| [README.md](./specs/README.md) | Spec Index | Quick reference, implementation priority |

### Implementation Priority

```
1. Database Schema (01)    <- Foundation layer
         │
         ▼
2. API Contracts (02)      <- Backend endpoints
         │
         ▼
3. EVA Orchestration (04)  <- State machine & dispatch
         │
         ▼
4. UI Components (03)      <- Frontend visualization
```

### Specification Coverage

| Domain | Spec File | Status |
|--------|-----------|--------|
| `chairman_directives` table | 01-database-schema.md | Defined |
| `venture_token_ledger` table | 01-database-schema.md | Defined |
| `fn_chairman_briefing()` function | 01-database-schema.md | Defined |
| `/api/chairman/briefing` endpoint | 02-api-contracts.md | Defined |
| `/api/chairman/decide` endpoint | 02-api-contracts.md | Defined |
| `ChairmanBriefing` TypeScript type | 02-api-contracts.md | Defined |
| `BriefingDashboard` component | 03-ui-components.md | Defined |
| `StageTimeline` component | 03-ui-components.md | Defined |
| EVA dispatch logic | 04-eva-orchestration.md | Defined |
| Crew type registry | 04-eva-orchestration.md | Defined |

---

## 11. Future Architecture (Blue Sky)

The following architectural patterns are specified in the detailed spec files and represent enhancements for scale (100+ ventures, 50+ concurrent agents).

### 11.1 Observability Framework

**Problem:** When 50 agents fail simultaneously at 3 AM, how does anyone debug it?

**Solution:** Distributed tracing with correlation IDs that thread entire request chains.

| Component | Purpose | Spec Location |
|-----------|---------|---------------|
| `agent_execution_traces` table | Request chain tracking | 01-database-schema.md Section 7 |
| Correlation ID propagation | Thread EVA → Crew → Sub-agent | 01-database-schema.md Section 7 |
| Black box recorder | Decision audit trail | 04-eva-orchestration.md |

**Key Capability:** Run `SELECT * FROM agent_execution_traces WHERE correlation_id = 'X' ORDER BY created_at` to see the entire execution chain when something fails.

### 11.2 Circuit Breaker System

**Problem:** A runaway agent hits a loop and burns $500 in tokens before anyone notices.

**Solution:** Multi-level cost protection with automatic kill switches.

| Breaker Type | Trigger | Action |
|--------------|---------|--------|
| **Hard Cap** | 100% budget consumed | Immediate venture pause |
| **Soft Cap** | 85% budget consumed | Chairman alert |
| **Burn Rate** | >10k tokens/minute sustained | Temporary pause + investigation |
| **Anomaly** | 3x normal consumption | Alert + manual review |

**Spec Location:**
- Circuit breaker config: 04-eva-orchestration.md "Circuit Breaker System"
- Circuit breaker events table: 01-database-schema.md Section 7

**Key Guarantee:** Chairman can sleep knowing a bug won't drain the budget.

### 11.3 Graceful Degradation

**Problem:** External API goes down (market data, competitor intel). Whole pipeline blocks.

**Solution:** Tiered degradation with fallback data sources.

| Level | Trigger | System Behavior |
|-------|---------|-----------------|
| FULL | All services healthy | Normal operation |
| PARTIAL | Non-critical services down | Continue with cached data, flag outputs |
| FALLBACK | Multiple services degraded | Use backup providers |
| MINIMAL | Critical services down | Pause new work, protect existing state |

**Spec Location:** 04-eva-orchestration.md "Graceful Degradation"

### 11.4 Additional Future Enhancements

| Enhancement | Purpose | Spec Location |
|-------------|---------|---------------|
| Model Registry | Provider-agnostic AI routing | 01-database-schema.md Section 7 |
| Prompt Versioning | A/B testing and rollback for crew prompts | 01-database-schema.md Section 7 |
| Multi-Tenancy | Multiple Chairmen with scoped access | Future (RLS policy redesign) |

---

## 12. Hierarchical Agent Architecture (Fractal Model)

The system supports a **4-level hierarchical agent structure** that mimics corporate governance, enabling autonomous venture operations at scale.

### 12.1 The Four Levels

```
┌─────────────────────────────────────────────────────────────────────┐
│  L1: CHAIRMAN (Human)                                               │
│      • Ecosystem governance, capital allocation                     │
│      • Receives aggregated briefings, makes strategic decisions     │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    ▼                           ▼
┌─────────────────────────────┐   ┌─────────────────────────────┐
│  L2: VENTURE CEO            │   │  L2: VENTURE CEO            │
│      (Solara_CEO)           │   │      (DataSync_CEO)         │
│  • Autonomous within budget │   │  • Autonomous within budget │
│  • Manages executive team   │   │  • Manages executive team   │
└─────────────────────────────┘   └─────────────────────────────┘
          │                                   │
    ┌─────┴─────┐                       ┌─────┴─────┐
    ▼           ▼                       ▼           ▼
┌────────┐ ┌────────┐               ┌────────┐ ┌────────┐
│VP_STRAT│ │VP_TECH │               │VP_STRAT│ │VP_TECH │
│(L3)    │ │(L3)    │               │(L3)    │ │(L3)    │
└───┬────┘ └───┬────┘               └───┬────┘ └───┬────┘
    │          │                        │          │
    ▼          ▼                        ▼          ▼
┌───────┐  ┌───────┐                ┌───────┐  ┌───────┐
│Crews  │  │Crews  │                │Crews  │  │Crews  │
│(L4)   │  │(L4)   │                │(L4)   │  │(L4)   │
└───────┘  └───────┘                └───────┘  └───────┘
```

### 12.2 Key Architectural Components

| Component | Purpose | Spec Location |
|-----------|---------|---------------|
| **Agent Registry** | Central registry of all agents with hierarchy | 06-hierarchical-agent-architecture.md Section 3 |
| **Shared Tool Registry** | Ecosystem-wide tool access control | 06-hierarchical-agent-architecture.md Section 4 |
| **Cross-Agent Communication** | Message protocol between agents | 06-hierarchical-agent-architecture.md Section 5 |
| **Venture Instantiation** | Template-based org structure creation | 06-hierarchical-agent-architecture.md Section 6 |

### 12.3 EVA's Evolved Role

With the hierarchical model, EVA evolves from **Crew Orchestrator** to **Chief Operating Officer**:

| Previous Role | New Role |
|--------------|----------|
| Dispatch to crews directly | Manage Venture CEOs |
| Review all artifacts | Review CEO status reports |
| Make tactical decisions | Set venture-level objectives |
| Aggregate crew outputs | Aggregate CEO briefings |

### 12.4 Venture Instantiation

Spinning up a new venture creates a complete organizational structure:

```
createVenture("NewCo", budget: 500k)
    │
    ├─── Creates: NewCo_CEO agent
    │        └─── Inherits: ecosystem tools, knowledge bases
    │
    ├─── Creates: NewCo_VP_Strategy
    │        ├─── Inherits: market research tools
    │        └─── Owns: Stages 1-9
    │
    ├─── Creates: NewCo_VP_Product
    │        ├─── Inherits: brand/GTM tools
    │        └─── Owns: Stages 10-12
    │
    ├─── Creates: NewCo_VP_Tech
    │        ├─── Inherits: code generation tools
    │        └─── Owns: Stages 13-20
    │
    └─── Creates: NewCo_VP_Growth
             ├─── Inherits: analytics tools
             └─── Owns: Stages 21-25
```

**Full specification:** [06-hierarchical-agent-architecture.md](./specs/06-hierarchical-agent-architecture.md)

---

---

## 13. OpenAI Codex Workflow Assessment (December 2025)

The 25-stage workflow has been reviewed by OpenAI Codex against best practices for AI-powered venture creation. The assessment confirms the workflow is **coherent and implementable** with clear phases, real decision gates (3/5/13/16/23), and strong anti-hallucination primitives via Four Buckets + Assumptions vs Reality.

### 13.1 Identified Gaps & Required Additions

#### A. Legal/Compliance/IP (Currently Implicit)

**Problem:** Legal artifacts and gates are not explicitly owned by any stage.

**Required Additions:**

| Stage | Addition |
|-------|----------|
| Stage 10 (Naming) | Add **Trademark Risk Check** artifact |
| Stage 16 (Schema) | Add **Data Privacy Assessment** (GDPR/CCPA/HIPAA) |
| Stage 22 (Deployment) | Add **Legal Readiness Checklist** (ToS, Privacy Policy, IP Assignment) |
| Stage 23 (Launch) | Add **Regulatory Compliance Gate** for high-risk verticals |

#### B. Customer Discovery Under-Specified

**Problem:** Stage 3 includes "user interviews" but lacks explicit discovery protocol.

**Required Stage 3 Artifacts:**
```
├── Interview Transcript Bundle (min 5 interviews)
├── Insight Synthesis Report
├── Willingness-to-Pay (WTP) Evidence Rubric
└── Design Partner Pipeline (for B2B ventures)
```

**New Crew:** `CUSTOMER_DISCOVERY` Crew (see 04-eva-orchestration.md)

#### C. DevOps/Infra Planning is Late

**Problem:** Stage 17 mentions CI/CD and Stage 22 does deployment, but SLOs and observability are not planned early enough.

**Required Additions to Stage 13/16:**
```
├── SLOs Definition (Availability %, Latency targets)
├── Logging/Metrics/Tracing Plan
├── Analytics Event Schema v0
└── Observability Architecture Decision Record
```

#### D. Security vs Privacy/Data Governance

**Problem:** Stage 20 covers security/perf/WCAG but lacks explicit privacy controls.

**Required Stage 20 Artifacts:**
```
├── Threat Model (STRIDE or equivalent)
├── Data Classification & Retention Policy
├── PII Handling Procedures
├── Secrets Management Plan
└── Abuse/Fraud Case Analysis
```

#### E. Post-Launch Operations is Thin

**Problem:** Stage 25 has optimization/scale but lacks explicit operational readiness.

**Required Additions:**

| Stage | Addition |
|-------|----------|
| Stage 22 | **Ops Readiness Checklist** (runbooks, rollback plan, on-call) |
| Stage 23 | **Support Ops Setup** (channels, hours, SLA targets) |
| Stage 25 | **Operating Cadence** (daily standup, weekly metrics review) |
| Stage 25 | **Churn Response Playbook** |

### 13.2 Stage Ordering Improvements

#### Parallelization Opportunities

| Stages | Current | Recommended |
|--------|---------|-------------|
| 3 & 4 | Sequential | **Parallel** once hypothesis stable |
| 5 & 7 | Sequential OK | Stage 5 should use "candidate price bands", Stage 7 finalizes |

#### GTM → Tech Constraints

**Problem:** GTM decisions (Stage 11) affect architecture choices (Stage 13-16).

**Solution:** Add required input from Stage 11 to Stage 13:
```typescript
// Stage 13 required inputs
interface TechStackInputs {
  // ... existing inputs
  gtm_constraints: {
    enterprise_sso_required: boolean;
    compliance_requirements: string[];
    onboarding_flow_type: 'self-serve' | 'guided' | 'white-glove';
  };
}
```

### 13.3 Decision Provenance Enhancement

**Problem:** Four Buckets are defined but handoffs don't encode complete decision provenance.

**Enhanced Decision Record Structure:**
```typescript
interface DecisionRecord {
  decision_id: string;
  stage: number;
  title: string;
  decision: string;
  rationale: string;
  alternatives_considered: string[];

  // PROVENANCE (NEW)
  owner_agent_id: string;
  reviewed_by_agent_ids: string[];
  confidence: number;  // 0.0 - 1.0

  // EPISTEMIC STATUS (Four Buckets)
  epistemic: {
    bucket: 'fact' | 'assumption' | 'simulation' | 'unknown';
    evidence_artifact_ids: string[];
    unknowns_to_close: string[];
  };

  // LIFECYCLE (NEW)
  reversibility: 'reversible' | 'hard_to_reverse';
  revalidate_by: string;  // ISO8601 date
}
```

### 13.4 VP Boundary Recommendations

| VP | Current Stages | Recommendation |
|----|----------------|----------------|
| VP_STRATEGY | 1-9 | **Add review veto** on Stage 15 scope/UX decisions |
| VP_PRODUCT | 10-12 | **Expand review authority** to Stage 15/18 |
| VP_TECH | 13-20 | **Add distinct Architect function** at Stage 16 |
| VP_GROWTH | 21-25 | **Earlier involvement** as reviewer in Stages 11-12 |

### 13.5 Operational Phase Transition

The CEO agent exists from Stage 1 but operates in **Incubation Mode**. Stage 25 triggers a **Mode Transition** rather than "creating" a new CEO.

#### CEO Operational Modes

```
┌──────────────────────────────────────────────────────────────────────┐
│  INCUBATION MODE (Stages 1-24)                                        │
│  • Limited delegation authority                                       │
│  • Heavy escalation to Chairman at gates (3, 5, 16)                   │
│  • CEO acts as state machine owner                                    │
│  • Receives VP handoffs at each stage                                 │
└──────────────────────────────────────────────────────────────────────┘
                                │
                      Stage 25 Complete
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│  OPERATIONAL MODE (Post-Stage 25)                                     │
│  • Full operational control                                           │
│  • Expanded delegation authority                                      │
│  • Manages standing cadences (daily/weekly ops)                       │
│  • Instantiates additional operational crews                          │
└──────────────────────────────────────────────────────────────────────┘
```

#### Mode Transition Trigger

**Two-Factor Triggering:**
1. **Technical Trigger:** Stage 25 completion (system-ready)
2. **Governance Trigger:** Chairman explicit approval (autonomy expands)

**Full Specification:** [07-operational-handoff.md](./specs/07-operational-handoff.md)

---

## 14. Agent-Stage Accountability Matrix

This matrix defines which agents are accountable for each stage and which crews execute the work.

| Stage | Title | Accountable (Manager) | Builder Crews | Notes |
|------:|-------|----------------------|---------------|-------|
| 1 | Draft Idea & Chairman Review | VP_STRATEGY | Idea Brief Crew | Chairman signoff checkpoint |
| 2 | AI Multi-Model Critique | VP_STRATEGY | Critique/Triage Crew | Enforce Four Buckets + Assumption Set |
| 3 | Market Validation & RAT (Gate) | VP_STRATEGY | **Customer Discovery** + Market Research | Chairman decision required |
| 4 | Competitive Intelligence | VP_STRATEGY | Competitive Intel Crew | Can run parallel with Stage 3 |
| 5 | Profitability Forecasting (Gate) | VP_STRATEGY | Financial Modeling Crew | Enforce Four Buckets |
| 6 | Risk Evaluation Matrix | VP_STRATEGY | Risk Assessment Crew | Include compliance/security/business |
| 7 | Pricing Strategy | VP_STRATEGY (VP_PRODUCT consult) | Pricing/Packaging Crew | - |
| 8 | Business Model Canvas | VP_STRATEGY | Strategy Synthesis Crew | - |
| 9 | Exit-Oriented Design | VP_STRATEGY | Exit Strategy Crew | - |
| 10 | Strategic Naming (SD) | VP_PRODUCT | Naming + Trademark Crew | Add trademark risk output |
| 11 | Go-to-Market Strategy | VP_PRODUCT | GTM Crew | VP_GROWTH as reviewer |
| 12 | Sales & Success Logic | VP_PRODUCT | Sales + **Customer Success** Crew | Add CS Agent responsibilities |
| 13 | Tech Stack Interrogation (Gate) | VP_TECH | Architecture Crew | Input from GTM constraints |
| 14 | Data Model & Architecture (SD) | VP_TECH | Data Architecture Crew | Include data classification |
| 15 | Epic & User Story Breakdown (SD) | VP_TECH (VP_PRODUCT consult) | Product Spec Crew | VP_PRODUCT veto on scope/UX |
| 16 | Schema Generation (Gate, SD) | VP_TECH | Schema/Contracts Crew | **Architect Agent w/ veto** |
| 17 | Environment & Agent Config (SD) | VP_TECH | DevEx/CI Crew | Include secrets + observability |
| 18 | MVP Development Loop (SD) | VP_TECH | Implementation Crew | Require ADR + tech debt log |
| 19 | Integration & API Layer (SD) | VP_TECH | Integration Crew | Add contract tests |
| 20 | Security & Performance (SD) | VP_TECH | Security + Perf/A11y Crew | **Dedicated Security Auditor** |
| 21 | QA & UAT (SD) | VP_GROWTH (VP_TECH co-owner) | QA + UAT Crew | VP_TECH for defect fixes |
| 22 | Deployment & Infrastructure (SD) | VP_GROWTH (VP_TECH co-owner) | DevOps/Infra Crew | Require runbooks + rollback |
| 23 | Production Launch (Gate) | VP_GROWTH | Launch Ops Crew | Go/no-go checklist |
| 24 | Analytics & Feedback | VP_GROWTH | Analytics Crew | Event taxonomy from Stage 13/16 |
| 25 | Optimization & Scale (SD) | VP_GROWTH | Optimization + **Growth Engineering** Crew | Growth distinct from Analytics |

### New Crews Required

Based on the assessment, these crews should be added to the registry:

| Crew | Stages | Capabilities |
|------|--------|--------------|
| `CUSTOMER_DISCOVERY` | 3 | interviews, WTP_evidence, design_partner_recruitment |
| `CUSTOMER_SUCCESS` | 12 | onboarding, retention, support_model, churn_prevention |
| `GROWTH_ENGINEERING` | 25 | experimentation, funnel_optimization, performance |
| `SECURITY_AUDITOR` | 20 | threat_model, privacy_assessment, pen_testing |

---

**Document History:**
- v1.0 (Dec 2025): Initial specification based on Anti-Gravity, Codex, and Claude assessments
- v1.1 (Dec 2025): Added Section 9 - Red Team Technical Specifications
- v1.2 (Dec 2025): Extracted detailed specs to `docs/vision/specs/` folder; added Section 10
- v1.3 (Dec 2025): Added Section 11 - Future Architecture; added 05-user-stories.md to spec index
- v1.4 (Dec 2025): Added Section 12 - Hierarchical Agent Architecture (Fractal Model); added 06-hierarchical-agent-architecture.md
- v1.5 (Dec 2025): Added Sections 13-14 - OpenAI Codex Workflow Assessment; Agent-Stage Accountability Matrix
