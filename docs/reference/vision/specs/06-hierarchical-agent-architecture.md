---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# Hierarchical Agent Architecture Specification



## Table of Contents

- [Metadata](#metadata)
- [Overview](#overview)
  - [The Problem with Flat Hierarchies](#the-problem-with-flat-hierarchies)
  - [The Fractal Solution](#the-fractal-solution)
- [Portfolio-Level Deal Flow (Autonomous Ideation)](#portfolio-level-deal-flow-autonomous-ideation)
- [The Four-Level Hierarchy](#the-four-level-hierarchy)
  - [L1: The Chairman (Human)](#l1-the-chairman-human)
  - [L2: Venture CEO Agents](#l2-venture-ceo-agents)
  - [L3: Executive Agents (VPs)](#l3-executive-agents-vps)
  - [L4: Departmental Crews](#l4-departmental-crews)
  - [2.5 Agent-Stage Accountability Matrix (OpenAI Codex Assessment)](#25-agent-stage-accountability-matrix-openai-codex-assessment)
- [Agent Registry Schema](#agent-registry-schema)
  - [3.1 agent_registry](#31-agent_registry)
  - [3.2 agent_relationships](#32-agent_relationships)
  - [3.3 agent_memory_stores](#33-agent_memory_stores)
- [Shared Tool Registry](#shared-tool-registry)
  - [4.1 tool_registry](#41-tool_registry)
  - [4.2 tool_access_grants](#42-tool_access_grants)
  - [4.3 Seed Data: Core Tools](#43-seed-data-core-tools)
- [Cross-Agent Communication Protocol](#cross-agent-communication-protocol)
  - [5.1 Message Types](#51-message-types)
  - [5.2 agent_messages Table](#52-agent_messages-table)
  - [5.3 Communication Patterns](#53-communication-patterns)
- [Venture Instantiation Pattern](#venture-instantiation-pattern)
  - [6.1 The Template System](#61-the-template-system)
  - [6.2 Instantiation Function](#62-instantiation-function)
- [EVA's Evolved Role](#evas-evolved-role)
  - [7.1 From Orchestrator to Chief Operating Officer](#71-from-orchestrator-to-chief-operating-officer)
  - [7.2 EVA's New Responsibilities](#72-evas-new-responsibilities)
- [Implementation Roadmap](#implementation-roadmap)
  - [Phase 1: Schema Foundation (Week 1)](#phase-1-schema-foundation-week-1)
  - [Phase 2: Instantiation Engine (Week 2)](#phase-2-instantiation-engine-week-2)
  - [Phase 3: Communication Protocol (Week 3)](#phase-3-communication-protocol-week-3)
  - [Phase 4: EVA Evolution (Week 4)](#phase-4-eva-evolution-week-4)
  - [Phase 5: Agent Runtime (Week 5+)](#phase-5-agent-runtime-week-5)
- [Agent Runtime Service](#agent-runtime-service)
  - [9.1 The Runtime Problem](#91-the-runtime-problem)
  - [9.2 Agent Runtime Architecture](#92-agent-runtime-architecture)
  - [9.3 Agent Runtime Loop](#93-agent-runtime-loop)
  - [9.4 Message Claim with Advisory Lock](#94-message-claim-with-advisory-lock)
  - [9.5 Handler Registry by Agent Type](#95-handler-registry-by-agent-type)
  - [9.6 Deadline Watchdog](#96-deadline-watchdog)
  - [9.7 Status Aggregation & Rollup](#97-status-aggregation-rollup)
- [State Consistency & Handoff Protocol](#state-consistency-handoff-protocol)
  - [10.1 The Consistency Problem](#101-the-consistency-problem)
  - [10.2 Control Plane Decision](#102-control-plane-decision)
  - [10.3 Venture State Machine (CEO-Owned)](#103-venture-state-machine-ceo-owned)
  - [10.4 Handoff Protocol](#104-handoff-protocol)
- [Tool Contention & Quota Enforcement](#tool-contention-quota-enforcement)
  - [11.1 The Contention Problem](#111-the-contention-problem)
  - [11.2 Tool Execution Gateway](#112-tool-execution-gateway)
  - [11.3 Venture Tool Quotas Table](#113-venture-tool-quotas-table)
- [Bootstrap & Seed Procedure](#bootstrap-seed-procedure)
  - [12.1 The Bootstrap Problem](#121-the-bootstrap-problem)
  - [12.2 Bootstrap Migration](#122-bootstrap-migration)
  - [12.3 Well-Known Agent IDs](#123-well-known-agent-ids)
- [Control Plane Resolution](#control-plane-resolution)
  - [13.1 The Conflict](#131-the-conflict)
  - [13.2 Resolution](#132-resolution)
  - [13.3 Updated EVA Responsibilities](#133-updated-eva-responsibilities)
- [Related Specifications](#related-specifications)

## Metadata
- **Category**: Architecture
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-12
- **Tags**: database, api, testing, e2e

**Vision v2 Chairman's OS - Fractal Multi-Agent System**

> "Every venture is a company. Every company has executives. Every executive has crews."

---

## Table of Contents

1. [Overview](#overview)
2. [The Four-Level Hierarchy](#the-four-level-hierarchy)
3. [Agent Registry Schema](#agent-registry-schema)
4. [Shared Tool Registry](#shared-tool-registry)
5. [Cross-Agent Communication Protocol](#cross-agent-communication-protocol)
6. [Venture Instantiation Pattern](#venture-instantiation-pattern)
7. [EVA's Evolved Role](#evas-evolved-role)
8. [Implementation Roadmap](#implementation-roadmap)

---

## Overview

### The Problem with Flat Hierarchies

The original Vision v2 implemented a flat orchestration model:

```
Chairman → EVA → Crews (flat, stage-based)
```

This model has critical limitations at scale:

| Limitation | Impact |
|------------|--------|
| Single point of orchestration (EVA) | Bottleneck at 10+ concurrent ventures |
| Stage-based crews | Can't model persistent functional expertise |
| No delegation chain | Chairman must be involved in every decision |
| No institutional memory per venture | Knowledge doesn't compound |

### The Fractal Solution

The hierarchical model creates **autonomous ventures** that mirror corporate structure:

```
Chairman → Venture CEOs → Executives → Departmental Crews
```

Each venture operates as an independent company with:
- Its own CEO agent (autonomous decision-making within bounds)
- Executive team (VPs of functional areas)
- Departmental crews (specialists reporting to executives)
- Shared tools and knowledge from the ecosystem

---

## Portfolio-Level Deal Flow (Autonomous Ideation)

In addition to venture-scoped CEOs/VPs, Vision v2 supports a **portfolio-level deal flow loop** that continuously generates and curates venture candidates.

- **Purpose**: keep the Venture Factory fed with high-quality opportunities without requiring the Chairman to “invent ideas” from scratch.
- **Output**: **Opportunity Blueprints** (not ventures) stored as a deal flow inventory.
- **Governance**:
  - Deal flow automation MAY run under EVA (service_role) and generate/review blueprints.
  - Deal flow automation MUST NOT create ventures or advance stages automatically.
  - The Chairman explicitly chooses when to instantiate a venture from a blueprint (enters Stage 0 with an Inception Brief).

This is a natural fit for a portfolio VP function (e.g., `VP_STRATEGY` “Deal Flow”) that owns sourcing + blueprint generation crews, while EVA remains the Chief of Staff enforcing budgets and authority boundaries.

---

## The Four-Level Hierarchy

### L1: The Chairman (Human)

**Role:** Ecosystem Governance, Capital Allocation, Strategic Direction

```
┌─────────────────────────────────────────────────────────────────────┐
│                           L1: CHAIRMAN                              │
│                                                                     │
│   Authority:                                                        │
│   • Set ecosystem-wide policies                                     │
│   • Allocate budget across ventures                                 │
│   • Approve/kill ventures at any time                               │
│   • Override any agent decision                                     │
│                                                                     │
│   Interface:                                                        │
│   • Morning Briefing (aggregated from all Venture CEOs)             │
│   • Decision Queue (escalated items only)                           │
│   • Natural Language Commands to EVA                                │
│                                                                     │
│   Does NOT:                                                         │
│   • Directly manage crews                                           │
│   • Make day-to-day operational decisions                           │
│   • Review every artifact                                           │
└─────────────────────────────────────────────────────────────────────┘
```

### L2: Venture CEO Agents

**Role:** Autonomous Venture Leadership, Strategy Execution, Resource Allocation

```
┌─────────────────────────────────────────────────────────────────────┐
│                        L2: VENTURE CEO                              │
│                     (One per active venture)                        │
│                                                                     │
│   Authority:                                                        │
│   • Full operational control within budget                          │
│   • Hire/assign VP agents                                           │
│   • Approve VP decisions up to threshold                            │
│   • Report status to Chairman                                       │
│                                                                     │
│   Capabilities:                                                     │
│   • Persistent memory (venture context, decisions, learnings)       │
│   • Strategic planning (interpret Chairman's intent)                │
│   • Resource allocation (distribute tokens to VPs)                  │
│   • Escalation judgment (what needs Chairman attention?)            │
│                                                                     │
│   Reporting:                                                        │
│   • Daily status to Chairman Briefing                               │
│   • Gate decisions escalated when uncertain                         │
│   • Budget variance alerts                                          │
│                                                                     │
│   Example: "Solara_CEO" manages all Solara operations               │
└─────────────────────────────────────────────────────────────────────┘
```

### L3: Executive Agents (VPs)

**Role:** Functional Area Leadership, Cross-Stage Expertise

```
┌─────────────────────────────────────────────────────────────────────┐
│                        L3: EXECUTIVE (VP)                           │
│              (3-5 per venture, by functional area)                  │
│                                                                     │
│   Standard Executives:                                              │
│   ┌─────────────┬─────────────┬─────────────┬─────────────┐         │
│   │ VP_STRATEGY │ VP_PRODUCT  │ VP_TECH     │ VP_GROWTH   │         │
│   │ (Stages 1-9)│ (Stages 10- │ (Stages 13- │ (Stages 21- │         │
│   │             │    12)      │    20)      │    25)      │         │
│   └─────────────┴─────────────┴─────────────┴─────────────┘         │
│                                                                     │
│   Authority:                                                        │
│   • Manage crews within their domain                                │
│   • Make tactical decisions (no CEO approval)                       │
│   • Request resources from CEO                                      │
│   • Coordinate with peer VPs                                        │
│                                                                     │
│   Capabilities:                                                     │
│   • Domain expertise (accumulated from crew outputs)                │
│   • Quality assurance (review crew work before CEO)                 │
│   • Cross-stage memory (remembers what worked/failed)               │
│   • Crew orchestration (dispatch, monitor, revise)                  │
│                                                                     │
│   Example: "Solara_VP_Strategy" owns market validation work         │
└─────────────────────────────────────────────────────────────────────┘
```

### L4: Departmental Crews

**Role:** Specialized Execution, Task Completion

```
┌─────────────────────────────────────────────────────────────────────┐
│                        L4: DEPARTMENTAL CREW                        │
│                (Functional specialists, on-demand)                  │
│                                                                     │
│   Crew Types by Department:                                         │
│                                                                     │
│   VP_STRATEGY Crews:                                                │
│   ├── MARKET_RESEARCH_CREW (TAM/SAM analysis)                       │
│   ├── COMPETITIVE_INTEL_CREW (competitor tracking)                  │
│   ├── FINANCIAL_MODELING_CREW (unit economics)                      │
│   └── RISK_ASSESSMENT_CREW (threat identification)                  │
│                                                                     │
│   VP_PRODUCT Crews:                                                 │
│   ├── NAMING_CREW (brand identity)                                  │
│   ├── GTM_CREW (go-to-market strategy)                              │
│   └── SALES_PLAYBOOK_CREW (sales enablement)                        │
│                                                                     │
│   VP_TECH Crews:                                                    │
│   ├── ARCHITECTURE_CREW (system design)                             │
│   ├── IMPLEMENTATION_CREW (code generation)                         │
│   ├── QA_CREW (testing)                                             │
│   └── SECURITY_CREW (vulnerability assessment)                      │
│                                                                     │
│   VP_GROWTH Crews:                                                  │
│   ├── ANALYTICS_CREW (metrics tracking)                             │
│   ├── OPTIMIZATION_CREW (performance tuning)                        │
│   └── SCALE_CREW (growth engineering)                               │
│                                                                     │
│   Capabilities:                                                     │
│   • Single-task execution                                           │
│   • Tool access (via Shared Tool Registry)                          │
│   • Artifact generation                                             │
│                                                                     │
│   NO persistent memory (stateless workers)                          │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.5 Agent-Stage Accountability Matrix (OpenAI Codex Assessment)

This matrix defines explicit accountability for each stage, identifying the manager (VP), primary crew, and any co-executing crews.

| Stage | Title | Accountable VP | Primary Crew | Co-Executor Crews | Notes |
|------:|-------|----------------|--------------|-------------------|-------|
| 1 | Draft Idea & Chairman Review | VP_STRATEGY | IDEA_STRUCTURING | - | Chairman signoff checkpoint |
| 2 | AI Multi-Model Critique | VP_STRATEGY | IDEA_STRUCTURING | - | Four Buckets + Assumption Set |
| 3 | Market Validation & RAT (Gate) | VP_STRATEGY | MARKET_VALIDATION | **CUSTOMER_DISCOVERY** | Chairman decision required |
| 4 | Competitive Intelligence | VP_STRATEGY | COMPETITIVE_INTEL | - | Can run parallel with Stage 3 |
| 5 | Profitability Forecasting (Gate) | VP_STRATEGY | FINANCIAL_MODELING | - | Four Buckets enforcement |
| 6 | Risk Evaluation Matrix | VP_STRATEGY | RISK_ASSESSMENT | - | Include compliance/security |
| 7 | Pricing Strategy | VP_STRATEGY | PRICING_STRATEGY | - | VP_PRODUCT as consultant |
| 8 | Business Model Canvas | VP_STRATEGY | BUSINESS_MODEL | - | - |
| 9 | Exit-Oriented Design | VP_STRATEGY | EXIT_STRATEGY | - | - |
| 10 | Strategic Naming (SD) | VP_PRODUCT | BRAND_NAMING | **TRADEMARK_CHECK** | Legal risk output |
| 11 | Go-to-Market Strategy | VP_PRODUCT | GTM_STRATEGY | - | VP_GROWTH as reviewer |
| 12 | Sales & Success Logic | VP_PRODUCT | SALES_PLAYBOOK | **CUSTOMER_SUCCESS** | CS responsibilities |
| 13 | Tech Stack Interrogation (Gate) | VP_TECH | ARCHITECTURE | - | GTM constraints input |
| 14 | Data Model & Architecture (SD) | VP_TECH | ARCHITECTURE | - | Data classification early |
| 15 | Epic & User Story Breakdown (SD) | VP_TECH | PRODUCT_SPEC | - | VP_PRODUCT veto on UX |
| 16 | Schema Generation (Gate, SD) | VP_TECH | SCHEMA_CONTRACTS | - | **Architect has veto** |
| 17 | Environment & Agent Config (SD) | VP_TECH | DEVEX_CI | - | Secrets + observability |
| 18 | MVP Development Loop (SD) | VP_TECH | IMPLEMENTATION | - | ADR + tech debt log |
| 19 | Integration & API Layer (SD) | VP_TECH | IMPLEMENTATION | - | Contract tests |
| 20 | Security & Performance (SD) | VP_TECH | IMPLEMENTATION | **SECURITY_AUDITOR** | Auditor has veto |
| 21 | QA & UAT (SD) | VP_GROWTH | QA_TESTING | - | VP_TECH co-owner |
| 22 | Deployment & Infrastructure (SD) | VP_GROWTH | DEPLOYMENT | - | VP_TECH co-owner |
| 23 | Production Launch (Gate) | VP_GROWTH | DEPLOYMENT | - | Go/no-go checklist |
| 24 | Analytics & Feedback | VP_GROWTH | ANALYTICS | - | Event taxonomy |
| 25 | Optimization & Scale (SD) | VP_GROWTH | DEPLOYMENT | **GROWTH_ENGINEERING** | Mode transition trigger |

#### New Crews Added (December 2025)

| Crew | Stage | Capabilities | Co-Executes With |
|------|-------|--------------|------------------|
| `CUSTOMER_DISCOVERY` | 3 | interviews, WTP evidence, design partners | MARKET_VALIDATION |
| `TRADEMARK_CHECK` | 10 | trademark search, domain availability | BRAND_NAMING |
| `CUSTOMER_SUCCESS` | 12 | onboarding, retention, churn prevention | SALES_PLAYBOOK |
| `SECURITY_AUDITOR` | 20 | threat model, privacy, pen testing | IMPLEMENTATION |
| `GROWTH_ENGINEERING` | 25 | experimentation, funnel optimization | DEPLOYMENT |

#### VP Review Authority Expansion

| VP | Primary Stages | Review Authority Stages |
|----|----------------|------------------------|
| VP_STRATEGY | 1-9 | 15 (scope/UX veto) |
| VP_PRODUCT | 10-12 | 15, 18 (UX decisions) |
| VP_TECH | 13-20 | 21, 22 (defect fixes, infra) |
| VP_GROWTH | 21-25 | 11-12 (early GTM review) |

---

## Agent Registry Schema

### 3.1 agent_registry

Central registry of all agent instances across the ecosystem.

```sql
CREATE TABLE IF NOT EXISTS agent_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  agent_type VARCHAR(50) NOT NULL
    CHECK (agent_type IN ('chairman', 'eva', 'venture_ceo', 'executive', 'crew')),
  agent_role VARCHAR(100) NOT NULL,       -- 'VP_STRATEGY', 'MARKET_RESEARCH_CREW', etc.
  display_name VARCHAR(200) NOT NULL,      -- 'Solara_CEO', 'DataSync_VP_Tech'

  -- Hierarchy
  parent_agent_id UUID REFERENCES agent_registry(id),
  hierarchy_level INT NOT NULL CHECK (hierarchy_level BETWEEN 1 AND 4),
  hierarchy_path LTREE NOT NULL,          -- 'chairman.eva.solara_ceo.vp_strategy'

  -- Scope
  venture_id UUID REFERENCES ventures(id) ON DELETE CASCADE,
  portfolio_id UUID REFERENCES portfolios(id),

  -- Capabilities
  capabilities TEXT[] DEFAULT '{}',        -- ['market_research', 'financial_modeling']
  tool_access TEXT[] DEFAULT '{}',         -- ['web_search', 'database_query', 'code_gen']
  delegation_authority JSONB DEFAULT '{}', -- What this agent can approve without escalation

  -- Operational
  status VARCHAR(20) DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'terminated', 'standby')),
  token_budget INT,                        -- Budget allocated from parent
  token_consumed INT DEFAULT 0,

  -- Memory
  context_window_id UUID,                  -- Link to persistent memory store
  knowledge_base_ids UUID[] DEFAULT '{}',  -- Shared knowledge bases

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES agent_registry(id)  -- Which agent created this one
);

-- Indexes
CREATE INDEX idx_agent_registry_type ON agent_registry(agent_type);
CREATE INDEX idx_agent_registry_parent ON agent_registry(parent_agent_id);
CREATE INDEX idx_agent_registry_venture ON agent_registry(venture_id);
CREATE INDEX idx_agent_registry_hierarchy ON agent_registry USING GIST(hierarchy_path);
CREATE INDEX idx_agent_registry_active ON agent_registry(status) WHERE status = 'active';

-- RLS
ALTER TABLE agent_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_registry_select" ON agent_registry
  FOR SELECT TO authenticated USING (fn_is_chairman());

CREATE POLICY "agent_registry_manage" ON agent_registry
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE agent_registry IS
  'Central registry of all AI agents in the ecosystem with hierarchical relationships.';
```

**delegation_authority JSONB Structure:**
```json
{
  "can_approve_spend_usd": 100,
  "can_approve_token_budget": 50000,
  "can_hire_crews": true,
  "can_fire_crews": true,
  "escalation_threshold_confidence": 0.7,
  "auto_advance_stages": [1, 2, 4, 6, 7, 8, 9, 10],
  "must_escalate_stages": [3, 5, 13, 16, 23, 25]
}
```

### 3.2 agent_relationships

Explicit relationship tracking between agents.

```sql
CREATE TABLE IF NOT EXISTS agent_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_agent_id UUID NOT NULL REFERENCES agent_registry(id) ON DELETE CASCADE,
  to_agent_id UUID NOT NULL REFERENCES agent_registry(id) ON DELETE CASCADE,

  relationship_type VARCHAR(50) NOT NULL
    CHECK (relationship_type IN (
      'reports_to',        -- Hierarchical
      'delegates_to',      -- Task delegation
      'coordinates_with',  -- Peer coordination
      'supervises',        -- Inverse of reports_to
      'shares_knowledge'   -- Knowledge base access
    )),

  -- Relationship metadata
  delegation_scope JSONB,                  -- What can be delegated
  communication_channel VARCHAR(50),       -- 'task_contract', 'message_queue', 'direct'

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(from_agent_id, to_agent_id, relationship_type)
);

-- Indexes
CREATE INDEX idx_relationships_from ON agent_relationships(from_agent_id);
CREATE INDEX idx_relationships_to ON agent_relationships(to_agent_id);
CREATE INDEX idx_relationships_type ON agent_relationships(relationship_type);
```

### 3.3 agent_memory_stores

Persistent memory for agents with state.

```sql
CREATE TABLE IF NOT EXISTS agent_memory_stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agent_registry(id) ON DELETE CASCADE,

  memory_type VARCHAR(50) NOT NULL
    CHECK (memory_type IN ('context', 'decisions', 'learnings', 'preferences')),

  -- Content
  content JSONB NOT NULL,
  summary TEXT,                            -- Human-readable summary
  embedding VECTOR(1536),                  -- For semantic search

  -- Versioning
  version INT DEFAULT 1,
  is_current BOOLEAN DEFAULT TRUE,
  parent_version_id UUID REFERENCES agent_memory_stores(id),

  -- Retention
  expires_at TIMESTAMPTZ,                  -- Optional TTL
  importance_score NUMERIC(3,2),           -- For memory pruning

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_memory_agent ON agent_memory_stores(agent_id);
CREATE INDEX idx_memory_type ON agent_memory_stores(agent_id, memory_type);
CREATE INDEX idx_memory_current ON agent_memory_stores(agent_id) WHERE is_current = TRUE;
CREATE INDEX idx_memory_embedding ON agent_memory_stores USING ivfflat (embedding vector_cosine_ops);

COMMENT ON TABLE agent_memory_stores IS
  'Persistent memory for CEO and VP agents. Crews are stateless.';
```

---

## Shared Tool Registry

### 4.1 tool_registry

Central registry of tools available to agents.

```sql
CREATE TABLE IF NOT EXISTS tool_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_name VARCHAR(100) NOT NULL UNIQUE,
  display_name VARCHAR(200),
  description TEXT,

  -- Classification
  tool_category VARCHAR(50) NOT NULL
    CHECK (tool_category IN (
      'research',         -- Web search, API queries
      'analysis',         -- Data processing, modeling
      'generation',       -- Code, content creation
      'communication',    -- Email, notifications
      'integration',      -- External service connections
      'database',         -- Data storage/retrieval
      'monitoring'        -- Observability, metrics
    )),

  -- Implementation
  implementation_type VARCHAR(50) NOT NULL
    CHECK (implementation_type IN ('function', 'api', 'mcp_server', 'crew')),
  implementation_config JSONB NOT NULL,    -- Connection details, parameters

  -- Access control
  min_hierarchy_level INT DEFAULT 4,       -- Minimum level to use (4 = crew)
  required_capabilities TEXT[] DEFAULT '{}',
  cost_per_use_usd NUMERIC(10, 6) DEFAULT 0,

  -- Operational
  is_available BOOLEAN DEFAULT TRUE,
  rate_limit_per_minute INT,
  timeout_seconds INT DEFAULT 30,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_tool_registry_category ON tool_registry(tool_category);
CREATE INDEX idx_tool_registry_available ON tool_registry(is_available) WHERE is_available = TRUE;

COMMENT ON TABLE tool_registry IS
  'Shared tool registry for all agents in the ecosystem.';
```

### 4.2 tool_access_grants

Explicit tool access grants to agents.

```sql
CREATE TABLE IF NOT EXISTS tool_access_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agent_registry(id) ON DELETE CASCADE,
  tool_id UUID NOT NULL REFERENCES tool_registry(id) ON DELETE CASCADE,

  -- Grant details
  grant_type VARCHAR(50) DEFAULT 'direct'
    CHECK (grant_type IN ('direct', 'inherited', 'temporary')),
  granted_by UUID REFERENCES agent_registry(id),

  -- Limits
  daily_usage_limit INT,
  usage_count_today INT DEFAULT 0,

  -- Temporal
  valid_from TIMESTAMPTZ DEFAULT NOW(),
  valid_until TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(agent_id, tool_id)
);

-- Indexes
CREATE INDEX idx_tool_grants_agent ON tool_access_grants(agent_id);
CREATE INDEX idx_tool_grants_tool ON tool_access_grants(tool_id);
```

### 4.3 Seed Data: Core Tools

```sql
INSERT INTO tool_registry (tool_name, display_name, tool_category, implementation_type, implementation_config, min_hierarchy_level) VALUES
-- Research Tools
('web_search', 'Web Search', 'research', 'api', '{"provider": "tavily", "endpoint": "/search"}', 4),
('company_lookup', 'Company Database Lookup', 'research', 'api', '{"provider": "clearbit", "endpoint": "/companies"}', 4),
('market_data', 'Market Data API', 'research', 'api', '{"provider": "statista", "endpoint": "/data"}', 3),

-- Analysis Tools
('financial_model', 'Financial Modeling Engine', 'analysis', 'function', '{"module": "lib/tools/financial_model.ts"}', 3),
('sentiment_analyzer', 'Sentiment Analysis', 'analysis', 'api', '{"provider": "openai", "model": "gpt-4o-mini"}', 4),
('tam_calculator', 'TAM/SAM Calculator', 'analysis', 'function', '{"module": "lib/tools/tam_calculator.ts"}', 4),

-- Generation Tools
('code_generator', 'Code Generation', 'generation', 'api', '{"provider": "anthropic", "model": "claude-sonnet-4"}', 3),
('document_writer', 'Document Writer', 'generation', 'api', '{"provider": "anthropic", "model": "claude-sonnet-4"}', 4),
('image_generator', 'Image Generation', 'generation', 'api', '{"provider": "stability", "model": "sdxl"}', 3),

-- Database Tools
('venture_query', 'Venture Database Query', 'database', 'function', '{"module": "lib/tools/venture_query.ts"}', 3),
('artifact_store', 'Artifact Storage', 'database', 'function', '{"module": "lib/tools/artifact_store.ts"}', 4),

-- Communication Tools
('email_sender', 'Email Sender', 'communication', 'api', '{"provider": "sendgrid"}', 2),
('slack_notifier', 'Slack Notification', 'communication', 'api', '{"provider": "slack"}', 3);
```

---

## Cross-Agent Communication Protocol

### 5.1 Message Types

```typescript
// lib/agents/communication/message-types.ts

type AgentMessageType =
  | 'task_delegation'      // Parent → Child: Do this work
  | 'task_completion'      // Child → Parent: Work done
  | 'status_report'        // Child → Parent: Progress update
  | 'escalation'           // Any → Parent: Need decision
  | 'coordination'         // Peer → Peer: Sync information
  | 'broadcast'            // Parent → All Children: Announcement
  | 'query'                // Any → Any: Request information
  | 'response';            // Any → Any: Answer to query

interface AgentMessage {
  id: string;
  type: AgentMessageType;
  from_agent_id: string;
  to_agent_id: string;
  correlation_id?: string;         // For request-response pairs

  // Content
  subject: string;
  body: Record<string, any>;
  attachments?: string[];          // Artifact IDs

  // Priority
  priority: 'low' | 'normal' | 'high' | 'critical';
  requires_response: boolean;
  response_deadline?: Date;

  // Routing
  route_through?: string[];        // Intermediate agents

  created_at: Date;
}
```

### 5.2 agent_messages Table

```sql
CREATE TABLE IF NOT EXISTS agent_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_type VARCHAR(50) NOT NULL,
  from_agent_id UUID NOT NULL REFERENCES agent_registry(id),
  to_agent_id UUID NOT NULL REFERENCES agent_registry(id),
  correlation_id UUID,             -- Links related messages

  -- Content
  subject VARCHAR(500) NOT NULL,
  body JSONB NOT NULL,
  attachments UUID[] DEFAULT '{}', -- Artifact IDs

  -- Priority & Response
  priority VARCHAR(20) DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  requires_response BOOLEAN DEFAULT FALSE,
  response_deadline TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  response_message_id UUID REFERENCES agent_messages(id),

  -- Status
  status VARCHAR(20) DEFAULT 'pending'
    CHECK (status IN ('pending', 'delivered', 'read', 'processing', 'completed', 'failed')),

  -- Routing
  route_through UUID[] DEFAULT '{}',
  current_position INT DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_messages_to ON agent_messages(to_agent_id, status);
CREATE INDEX idx_messages_from ON agent_messages(from_agent_id);
CREATE INDEX idx_messages_correlation ON agent_messages(correlation_id);
CREATE INDEX idx_messages_pending ON agent_messages(to_agent_id) WHERE status = 'pending';
```

### 5.3 Communication Patterns

#### Pattern 1: Task Delegation (CEO → VP → Crew)

```typescript
// CEO delegates market analysis to VP_Strategy
async function delegateTask(
  fromAgent: string,
  toAgent: string,
  task: TaskDefinition
): Promise<AgentMessage> {
  // Verify hierarchy: fromAgent must be parent of toAgent
  const relationship = await getRelationship(fromAgent, toAgent);
  if (relationship.type !== 'supervises') {
    throw new Error('Can only delegate to direct reports');
  }

  // Create task contract
  const contract = await createTaskContract({
    parent_agent: fromAgent,
    target_agent: toAgent,
    objective: task.objective,
    constraints: task.constraints,
    deadline: task.deadline,
  });

  // Send delegation message
  return sendMessage({
    type: 'task_delegation',
    from_agent_id: fromAgent,
    to_agent_id: toAgent,
    subject: `Task: ${task.objective.substring(0, 100)}`,
    body: {
      task_contract_id: contract.id,
      context: task.context,
      expected_outputs: task.outputs,
    },
    priority: task.priority,
    requires_response: true,
    response_deadline: task.deadline,
  });
}
```

#### Pattern 2: Escalation (Any → Parent)

```typescript
// VP escalates decision to CEO
async function escalateDecision(
  fromAgent: string,
  decision: EscalationRequest
): Promise<AgentMessage> {
  // Find parent agent
  const agent = await getAgent(fromAgent);
  const parentId = agent.parent_agent_id;

  if (!parentId) {
    throw new Error('No parent to escalate to');
  }

  return sendMessage({
    type: 'escalation',
    from_agent_id: fromAgent,
    to_agent_id: parentId,
    subject: `Escalation: ${decision.title}`,
    body: {
      reason: decision.reason,
      options: decision.options,
      recommendation: decision.recommendation,
      confidence: decision.confidence,
      evidence: decision.evidence,
      impact_if_delayed: decision.impact,
    },
    priority: decision.urgency,
    requires_response: true,
    response_deadline: decision.deadline,
  });
}
```

#### Pattern 3: Peer Coordination (VP ↔ VP)

```typescript
// VP_Strategy coordinates with VP_Product
async function coordinateWithPeer(
  fromAgent: string,
  toAgent: string,
  topic: CoordinationTopic
): Promise<AgentMessage> {
  // Verify peer relationship (same parent)
  const fromAgentData = await getAgent(fromAgent);
  const toAgentData = await getAgent(toAgent);

  if (fromAgentData.parent_agent_id !== toAgentData.parent_agent_id) {
    throw new Error('Can only coordinate with peers (same parent)');
  }

  return sendMessage({
    type: 'coordination',
    from_agent_id: fromAgent,
    to_agent_id: toAgent,
    subject: `Coordination: ${topic.subject}`,
    body: {
      topic: topic.topic,
      shared_context: topic.context,
      request: topic.request,
      proposed_action: topic.proposal,
    },
    priority: 'normal',
    requires_response: topic.needsResponse,
  });
}
```

---

## Venture Instantiation Pattern

### 6.1 The Template System

When a new venture is created, the system instantiates a complete organizational structure from templates.

```typescript
// lib/agents/instantiation/venture-factory.ts

interface VentureTemplate {
  id: string;
  name: string;
  description: string;

  // CEO configuration
  ceo_config: {
    role: string;
    capabilities: string[];
    delegation_authority: DelegationAuthority;
    initial_context: Record<string, any>;
  };

  // Executive team
  executives: Array<{
    role: string;                    // 'VP_STRATEGY', 'VP_PRODUCT', etc.
    capabilities: string[];
    tools: string[];
    stage_ownership: number[];       // Which stages this VP owns
  }>;

  // Default crew configurations
  crews: Array<{
    role: string;
    executive_parent: string;        // Which VP manages this crew
    capabilities: string[];
    tools: string[];
  }>;

  // Budget allocation
  budget_distribution: {
    ceo: number;                     // Percentage
    executives: Record<string, number>;
  };
}

// Standard venture template
const STANDARD_VENTURE_TEMPLATE: VentureTemplate = {
  id: 'standard_venture',
  name: 'Standard Venture Organization',
  description: '4-VP structure for full-lifecycle ventures',

  ceo_config: {
    role: 'VENTURE_CEO',
    capabilities: ['strategic_planning', 'resource_allocation', 'decision_making'],
    delegation_authority: {
      can_approve_spend_usd: 500,
      can_approve_token_budget: 100000,
      can_hire_crews: true,
      can_fire_crews: true,
      escalation_threshold_confidence: 0.7,
      auto_advance_stages: [1, 2, 4, 6, 7, 8, 9, 10],
      must_escalate_stages: [3, 5, 13, 16, 23, 25],
    },
    initial_context: {},
  },

  executives: [
    {
      role: 'VP_STRATEGY',
      capabilities: ['market_analysis', 'competitive_intel', 'financial_modeling'],
      tools: ['web_search', 'market_data', 'financial_model', 'tam_calculator'],
      stage_ownership: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    },
    {
      role: 'VP_PRODUCT',
      capabilities: ['brand_strategy', 'gtm_planning', 'sales_enablement'],
      tools: ['web_search', 'document_writer', 'image_generator'],
      stage_ownership: [10, 11, 12],
    },
    {
      role: 'VP_TECH',
      capabilities: ['system_design', 'code_generation', 'security_review'],
      tools: ['code_generator', 'venture_query', 'artifact_store'],
      stage_ownership: [13, 14, 15, 16, 17, 18, 19, 20],
    },
    {
      role: 'VP_GROWTH',
      capabilities: ['analytics', 'optimization', 'scale_planning'],
      tools: ['venture_query', 'web_search', 'document_writer'],
      stage_ownership: [21, 22, 23, 24, 25],
    },
  ],

  crews: [
    // VP_STRATEGY crews
    { role: 'MARKET_RESEARCH_CREW', executive_parent: 'VP_STRATEGY', capabilities: ['market_research'], tools: ['web_search', 'market_data'] },
    { role: 'COMPETITIVE_INTEL_CREW', executive_parent: 'VP_STRATEGY', capabilities: ['competitor_analysis'], tools: ['web_search', 'company_lookup'] },
    { role: 'FINANCIAL_MODELING_CREW', executive_parent: 'VP_STRATEGY', capabilities: ['financial_analysis'], tools: ['financial_model', 'tam_calculator'] },
    { role: 'RISK_ASSESSMENT_CREW', executive_parent: 'VP_STRATEGY', capabilities: ['risk_analysis'], tools: ['web_search', 'document_writer'] },
    // VP_PRODUCT crews
    { role: 'NAMING_CREW', executive_parent: 'VP_PRODUCT', capabilities: ['brand_creation'], tools: ['web_search', 'document_writer'] },
    { role: 'GTM_CREW', executive_parent: 'VP_PRODUCT', capabilities: ['gtm_strategy'], tools: ['web_search', 'document_writer'] },
    { role: 'SALES_PLAYBOOK_CREW', executive_parent: 'VP_PRODUCT', capabilities: ['sales_enablement'], tools: ['document_writer'] },
    // VP_TECH crews
    { role: 'ARCHITECTURE_CREW', executive_parent: 'VP_TECH', capabilities: ['system_design'], tools: ['code_generator', 'document_writer'] },
    { role: 'IMPLEMENTATION_CREW', executive_parent: 'VP_TECH', capabilities: ['code_generation'], tools: ['code_generator', 'artifact_store'] },
    { role: 'QA_CREW', executive_parent: 'VP_TECH', capabilities: ['testing'], tools: ['code_generator'] },
    { role: 'SECURITY_CREW', executive_parent: 'VP_TECH', capabilities: ['security_review'], tools: ['code_generator', 'web_search'] },
    // VP_GROWTH crews
    { role: 'ANALYTICS_CREW', executive_parent: 'VP_GROWTH', capabilities: ['analytics'], tools: ['venture_query', 'document_writer'] },
    { role: 'OPTIMIZATION_CREW', executive_parent: 'VP_GROWTH', capabilities: ['optimization'], tools: ['venture_query', 'code_generator'] },
    { role: 'SCALE_CREW', executive_parent: 'VP_GROWTH', capabilities: ['scale_planning'], tools: ['document_writer', 'web_search'] },
  ],

  budget_distribution: {
    ceo: 10,
    executives: {
      VP_STRATEGY: 30,
      VP_PRODUCT: 15,
      VP_TECH: 35,
      VP_GROWTH: 10,
    },
  },
};
```

### 6.2 Instantiation Function

```typescript
// lib/agents/instantiation/venture-factory.ts

interface InstantiationResult {
  venture_id: string;
  ceo_agent_id: string;
  executive_agent_ids: Record<string, string>;
  crew_agent_ids: Record<string, string>;
  tool_grants_created: number;
  messages_sent: number;
}

async function instantiateVenture(
  ventureName: string,
  ventureId: string,
  templateId: string = 'standard_venture',
  parentAgentId: string,           // EVA or Chairman
  tokenBudget: number
): Promise<InstantiationResult> {
  const template = await getTemplate(templateId);

  // 1. Create CEO Agent
  const ceoAgent = await createAgent({
    agent_type: 'venture_ceo',
    agent_role: template.ceo_config.role,
    display_name: `${ventureName}_CEO`,
    parent_agent_id: parentAgentId,
    hierarchy_level: 2,
    hierarchy_path: `chairman.eva.${ventureName.toLowerCase()}_ceo`,
    venture_id: ventureId,
    capabilities: template.ceo_config.capabilities,
    delegation_authority: template.ceo_config.delegation_authority,
    token_budget: tokenBudget * (template.budget_distribution.ceo / 100),
  });

  // 2. Create Executive Agents
  const executiveAgents: Record<string, string> = {};

  for (const exec of template.executives) {
    const execAgent = await createAgent({
      agent_type: 'executive',
      agent_role: exec.role,
      display_name: `${ventureName}_${exec.role}`,
      parent_agent_id: ceoAgent.id,
      hierarchy_level: 3,
      hierarchy_path: `chairman.eva.${ventureName.toLowerCase()}_ceo.${exec.role.toLowerCase()}`,
      venture_id: ventureId,
      capabilities: exec.capabilities,
      token_budget: tokenBudget * (template.budget_distribution.executives[exec.role] / 100),
    });

    executiveAgents[exec.role] = execAgent.id;

    // Grant tools to executive
    for (const toolName of exec.tools) {
      await grantToolAccess(execAgent.id, toolName, 'direct', ceoAgent.id);
    }

    // Create reporting relationship
    await createRelationship(execAgent.id, ceoAgent.id, 'reports_to');
    await createRelationship(ceoAgent.id, execAgent.id, 'supervises');
  }

  // 3. Create peer coordination relationships between executives
  const execIds = Object.values(executiveAgents);
  for (let i = 0; i < execIds.length; i++) {
    for (let j = i + 1; j < execIds.length; j++) {
      await createRelationship(execIds[i], execIds[j], 'coordinates_with');
      await createRelationship(execIds[j], execIds[i], 'coordinates_with');
    }
  }

  // 4. Create Crew Agents (on-demand or pre-registered)
  const crewAgents: Record<string, string> = {};

  for (const crew of template.crews) {
    const parentExecId = executiveAgents[crew.executive_parent];

    const crewAgent = await createAgent({
      agent_type: 'crew',
      agent_role: crew.role,
      display_name: `${ventureName}_${crew.role}`,
      parent_agent_id: parentExecId,
      hierarchy_level: 4,
      hierarchy_path: `chairman.eva.${ventureName.toLowerCase()}_ceo.${crew.executive_parent.toLowerCase()}.${crew.role.toLowerCase()}`,
      venture_id: ventureId,
      capabilities: crew.capabilities,
      // Crews don't have dedicated budgets - they draw from executive
    });

    crewAgents[crew.role] = crewAgent.id;

    // Grant tools to crew
    for (const toolName of crew.tools) {
      await grantToolAccess(crewAgent.id, toolName, 'direct', parentExecId);
    }

    // Create relationships
    await createRelationship(crewAgent.id, parentExecId, 'reports_to');
    await createRelationship(parentExecId, crewAgent.id, 'supervises');
  }

  // 5. Initialize CEO context
  await initializeAgentMemory(ceoAgent.id, {
    venture_name: ventureName,
    venture_id: ventureId,
    template_used: templateId,
    organization_structure: {
      executives: Object.keys(executiveAgents),
      crews_per_executive: template.crews.reduce((acc, c) => {
        acc[c.executive_parent] = acc[c.executive_parent] || [];
        acc[c.executive_parent].push(c.role);
        return acc;
      }, {} as Record<string, string[]>),
    },
    budget_allocation: template.budget_distribution,
    created_at: new Date().toISOString(),
  });

  // 6. Send startup message to CEO
  await sendMessage({
    type: 'broadcast',
    from_agent_id: parentAgentId,
    to_agent_id: ceoAgent.id,
    subject: `Welcome: You are now CEO of ${ventureName}`,
    body: {
      message: `You have been appointed CEO of ${ventureName}. Your executive team is assembled and ready.`,
      initial_budget: tokenBudget,
      first_action: 'Await first directive from Chairman via EVA.',
    },
    priority: 'high',
    requires_response: false,
  });

  return {
    venture_id: ventureId,
    ceo_agent_id: ceoAgent.id,
    executive_agent_ids: executiveAgents,
    crew_agent_ids: crewAgents,
    tool_grants_created: template.executives.reduce((sum, e) => sum + e.tools.length, 0) +
                         template.crews.reduce((sum, c) => sum + c.tools.length, 0),
    messages_sent: 1,
  };
}
```

---

## EVA's Evolved Role

### 7.1 From Orchestrator to Chief Operating Officer

EVA's role evolves from direct crew management to **Venture CEO management**.

```
┌─────────────────────────────────────────────────────────────────────┐
│                    EVA (Chief Operating Officer)                    │
│                                                                     │
│   BEFORE (Flat Model):                                              │
│   • Dispatch work directly to crews                                 │
│   • Track every task contract                                       │
│   • Aggregate all outputs for Chairman                              │
│                                                                     │
│   AFTER (Hierarchical Model):                                       │
│   • Onboard new Venture CEOs                                        │
│   • Set venture-level objectives                                    │
│   • Receive CEO status reports (not crew outputs)                   │
│   • Escalate CEO decisions that exceed their authority              │
│   • Aggregate CEO reports into Chairman Briefing                    │
│                                                                     │
│   EVA NO LONGER:                                                    │
│   • Manages crews directly                                          │
│   • Reviews individual artifacts                                    │
│   • Makes tactical decisions for ventures                           │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.2 EVA's New Responsibilities

```typescript
// lib/agents/eva/coo-functions.ts

// 1. Venture Onboarding
async function onboardVenture(
  ventureName: string,
  chairmanDirective: string,
  tokenBudget: number
): Promise<void> {
  // Create venture in database
  const venture = await createVenture(ventureName, chairmanDirective);

  // Instantiate organizational structure
  const result = await instantiateVenture(
    ventureName,
    venture.id,
    'standard_venture',
    EVA_AGENT_ID,
    tokenBudget
  );

  // Set initial objectives for CEO
  await sendMessage({
    type: 'task_delegation',
    from_agent_id: EVA_AGENT_ID,
    to_agent_id: result.ceo_agent_id,
    subject: `Strategic Directive: ${chairmanDirective.substring(0, 100)}`,
    body: {
      directive: chairmanDirective,
      constraints: {
        token_budget: tokenBudget,
        expected_first_milestone: 'Stage 3 completion',
      },
    },
    priority: 'high',
    requires_response: true,
  });
}

// 2. Briefing Aggregation (from CEOs)
async function generateChairmanBriefing(): Promise<ChairmanBriefing> {
  // Get status from all active Venture CEOs
  const ceoStatuses = await collectCEOStatuses();

  // Aggregate into portfolio view
  const portfolioHealth = aggregatePortfolioHealth(ceoStatuses);

  // Collect escalations that need Chairman
  const decisionQueue = await getChairmanDecisions();

  // Generate unified briefing
  return {
    greeting: generateGreeting(),
    portfolio_health: portfolioHealth,
    decision_stack: decisionQueue,
    ceo_highlights: ceoStatuses.map(s => s.highlight),
    alerts: await getSystemAlerts(),
    token_summary: await getTokenSummary(),
  };
}

// 3. CEO Decision Escalation
async function handleCEOEscalation(
  escalation: AgentMessage
): Promise<void> {
  const ceoDecision = escalation.body;

  // Determine if this needs Chairman or EVA can decide
  const needsChairman = evaluateEscalationSeverity(ceoDecision);

  if (needsChairman) {
    // Add to Chairman's decision queue
    await createChairmanDecision({
      venture_id: ceoDecision.venture_id,
      stage_number: ceoDecision.stage,
      escalation_source: escalation.from_agent_id,
      recommendation: ceoDecision.recommendation,
      evidence: ceoDecision.evidence,
    });
  } else {
    // EVA decides and responds to CEO
    const decision = await makeOperationalDecision(ceoDecision);
    await sendMessage({
      type: 'response',
      from_agent_id: EVA_AGENT_ID,
      to_agent_id: escalation.from_agent_id,
      correlation_id: escalation.id,
      subject: `Decision: ${ceoDecision.title}`,
      body: decision,
      priority: 'high',
      requires_response: false,
    });
  }
}
```

---

## Implementation Roadmap

### Phase 1: Schema Foundation (Week 1)

| Task | Owner | Deliverable |
|------|-------|-------------|
| Create `agent_registry` table | Database | Migration file |
| Create `agent_relationships` table | Database | Migration file |
| Create `agent_memory_stores` table | Database | Migration file |
| Create `tool_registry` table | Database | Migration file |
| Create `tool_access_grants` table | Database | Migration file |
| Create `agent_messages` table | Database | Migration file |
| Seed core tools | Database | Seed script |

### Phase 2: Instantiation Engine (Week 2)

| Task | Owner | Deliverable |
|------|-------|-------------|
| Build venture template system | Backend | `lib/agents/instantiation/` |
| Implement `instantiateVenture()` | Backend | Factory function |
| Create standard venture template | Backend | Template JSON |
| Tool grant system | Backend | Access control |
| Unit tests | QA | Test coverage |

### Phase 3: Communication Protocol (Week 3)

| Task | Owner | Deliverable |
|------|-------|-------------|
| Implement message types | Backend | TypeScript interfaces |
| Build message routing | Backend | `lib/agents/communication/` |
| Escalation logic | Backend | Escalation handler |
| Peer coordination | Backend | Coordination handler |
| Integration tests | QA | E2E message flow tests |

### Phase 4: EVA Evolution (Week 4)

| Task | Owner | Deliverable |
|------|-------|-------------|
| Refactor EVA as COO | Backend | Updated EVA module |
| CEO status aggregation | Backend | Briefing generator |
| CEO management functions | Backend | Onboarding, monitoring |
| Update Chairman Briefing API | API | Updated endpoint |
| UI updates for hierarchy | Frontend | Agent hierarchy view |

### Phase 5: Agent Runtime (Week 5+)

| Task | Owner | Deliverable |
|------|-------|-------------|
| CEO agent runtime | Backend | Autonomous CEO behavior |
| VP agent runtime | Backend | Executive decision logic |
| Memory system | Backend | Persistent context |
| Cross-venture learning | Backend | Pattern sharing |

---

## Agent Runtime Service

**This section addresses the critical gap identified in architectural review: "Manager Agent logic is the main missing piece."**

### 9.1 The Runtime Problem

The database schema defines the "what" (agents, relationships, messages) but not the "how":
- What triggers an agent to "think"?
- How does an agent consume its inbox?
- How are deadlines enforced?
- How do managers supervise subordinates?

### 9.2 Agent Runtime Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    AGENT RUNTIME SERVICE                            │
│                                                                     │
│  ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐   │
│  │  INBOX CONSUMER │   │  HANDLER ENGINE │   │   SUPERVISOR    │   │
│  │                 │   │                 │   │    TIMERS       │   │
│  │ • Poll messages │   │ • Route by type │   │ • Deadline      │   │
│  │ • Claim w/ lock │   │ • Run handlers  │   │   watchdog      │   │
│  │ • Idempotency   │   │ • Emit results  │   │ • Status rollup │   │
│  └────────┬────────┘   └────────┬────────┘   └────────┬────────┘   │
│           │                     │                     │             │
│           └─────────────────────┴─────────────────────┘             │
│                                 │                                   │
│                                 ▼                                   │
│                    ┌─────────────────────────┐                      │
│                    │    STATE MANAGER        │                      │
│                    │  • Update agent memory  │                      │
│                    │  • Log decisions        │                      │
│                    │  • Emit new messages    │                      │
│                    └─────────────────────────┘                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 9.3 Agent Runtime Loop

```typescript
// lib/agents/runtime/agent-runtime.ts

interface AgentRuntime {
  agentId: string;
  pollIntervalMs: number;
  handlers: Map<AgentMessageType, MessageHandler>;
  supervisorTimers: SupervisorTimer[];
}

async function runAgentLoop(runtime: AgentRuntime): Promise<void> {
  while (true) {
    try {
      // 1. CLAIM: Atomically claim next pending message
      const message = await claimNextMessage(runtime.agentId);

      if (message) {
        // 2. PROCESS: Route to appropriate handler
        const handler = runtime.handlers.get(message.message_type);
        if (!handler) {
          await markMessageFailed(message.id, 'No handler registered');
          continue;
        }

        // 3. EXECUTE: Run handler with idempotency check
        const result = await executeWithIdempotency(message, handler);

        // 4. COMMIT: Update message status and emit results
        await commitMessageResult(message.id, result);

        // 5. EMIT: Send any outbound messages
        for (const outbound of result.outboundMessages) {
          await sendMessage(outbound);
        }
      }

      // 6. SUPERVISE: Check timers (deadlines, rollups)
      await runSupervisorTimers(runtime);

      // 7. SLEEP: Wait before next poll
      await sleep(runtime.pollIntervalMs);

    } catch (error) {
      await logRuntimeError(runtime.agentId, error);
      await sleep(runtime.pollIntervalMs * 2); // Backoff on error
    }
  }
}
```

### 9.4 Message Claim with Advisory Lock

```sql
-- Atomically claim next pending message for an agent
CREATE OR REPLACE FUNCTION fn_claim_next_message(p_agent_id UUID)
RETURNS agent_messages
LANGUAGE plpgsql
AS $$
DECLARE
  v_message agent_messages;
BEGIN
  -- Select and lock the oldest pending message
  SELECT * INTO v_message
  FROM agent_messages
  WHERE to_agent_id = p_agent_id
    AND status = 'pending'
  ORDER BY
    CASE priority
      WHEN 'critical' THEN 1
      WHEN 'high' THEN 2
      WHEN 'normal' THEN 3
      WHEN 'low' THEN 4
    END,
    created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  -- Mark as processing
  IF v_message IS NOT NULL THEN
    UPDATE agent_messages
    SET status = 'processing',
        delivered_at = NOW()
    WHERE id = v_message.id;
  END IF;

  RETURN v_message;
END;
$$;
```

### 9.5 Handler Registry by Agent Type

```typescript
// lib/agents/runtime/handler-registry.ts

// CEO Agent Handlers
const CEO_HANDLERS: Map<AgentMessageType, MessageHandler> = new Map([
  ['task_delegation', handleCEOTaskDelegation],      // From EVA: strategic directive
  ['task_completion', handleCEOTaskCompletion],      // From VP: work done
  ['status_report', handleCEOStatusReport],          // From VP: progress update
  ['escalation', handleCEOEscalation],               // From VP: needs decision
  ['query', handleCEOQuery],                         // From anyone: info request
]);

// VP Agent Handlers
const VP_HANDLERS: Map<AgentMessageType, MessageHandler> = new Map([
  ['task_delegation', handleVPTaskDelegation],       // From CEO: stage work
  ['task_completion', handleVPTaskCompletion],       // From Crew: work done
  ['status_report', handleVPStatusReport],           // From Crew: progress
  ['coordination', handleVPCoordination],            // From peer VP: sync
  ['query', handleVPQuery],                          // From anyone: info request
]);

// Example: CEO handles task delegation from EVA
async function handleCEOTaskDelegation(
  agent: Agent,
  message: AgentMessage
): Promise<HandlerResult> {
  const directive = message.body as StrategicDirective;

  // 1. Update CEO memory with new directive
  await updateAgentMemory(agent.id, {
    type: 'context',
    content: {
      active_directive: directive,
      received_at: new Date().toISOString(),
    },
  });

  // 2. Decompose into VP-level tasks
  const vpTasks = await decomposeDirective(agent, directive);

  // 3. Identify which VPs own which tasks
  const taskAssignments = await assignTasksToVPs(agent.venture_id, vpTasks);

  // 4. Generate delegation messages to VPs
  const outboundMessages: AgentMessage[] = taskAssignments.map(assignment => ({
    type: 'task_delegation',
    from_agent_id: agent.id,
    to_agent_id: assignment.vp_id,
    subject: `Task: ${assignment.task.objective.substring(0, 100)}`,
    body: {
      task: assignment.task,
      deadline: assignment.deadline,
      budget_allocation: assignment.tokens,
    },
    priority: directive.urgency,
    requires_response: true,
    response_deadline: assignment.deadline,
  }));

  // 5. Return result
  return {
    success: true,
    outboundMessages,
    stateUpdates: [{
      type: 'decisions',
      content: {
        action: 'decomposed_directive',
        directive_id: directive.id,
        vp_assignments: taskAssignments.map(a => a.vp_id),
      },
    }],
  };
}
```

### 9.6 Deadline Watchdog

```typescript
// lib/agents/runtime/deadline-watchdog.ts

interface DeadlineViolation {
  message_id: string;
  from_agent_id: string;
  to_agent_id: string;
  deadline: Date;
  overdue_minutes: number;
}

async function runDeadlineWatchdog(agentId: string): Promise<void> {
  // Find messages TO subordinates that are overdue
  const overdueMessages = await findOverdueMessages(agentId);

  for (const violation of overdueMessages) {
    const overdueMinutes = violation.overdue_minutes;

    if (overdueMinutes < 30) {
      // First warning: nudge subordinate
      await sendMessage({
        type: 'query',
        from_agent_id: agentId,
        to_agent_id: violation.to_agent_id,
        subject: `Deadline Reminder: ${violation.message_id}`,
        body: {
          original_message_id: violation.message_id,
          deadline: violation.deadline,
          warning_level: 1,
        },
        priority: 'high',
        requires_response: true,
      });

    } else if (overdueMinutes < 60) {
      // Second warning: prepare escalation
      await logDeadlineViolation(violation, 'warning');

    } else {
      // Escalate to parent
      await escalateDeadlineViolation(agentId, violation);

      // Optionally: mark original message as failed
      await markMessageFailed(
        violation.message_id,
        `Deadline exceeded by ${overdueMinutes} minutes`
      );
    }
  }
}

async function escalateDeadlineViolation(
  managerAgentId: string,
  violation: DeadlineViolation
): Promise<void> {
  const manager = await getAgent(managerAgentId);

  if (!manager.parent_agent_id) {
    // CEO escalates to EVA, EVA escalates to Chairman
    await createSystemAlert({
      type: 'deadline_violation',
      severity: 'warning',
      details: violation,
    });
    return;
  }

  await sendMessage({
    type: 'escalation',
    from_agent_id: managerAgentId,
    to_agent_id: manager.parent_agent_id,
    subject: `Deadline Violation: Subordinate ${violation.to_agent_id}`,
    body: {
      violation,
      recommendation: 'investigate_or_reassign',
    },
    priority: 'high',
    requires_response: true,
  });
}
```

### 9.7 Status Aggregation & Rollup

```typescript
// lib/agents/runtime/status-aggregation.ts

interface VentureStatusRollup {
  venture_id: string;
  ceo_agent_id: string;
  timestamp: Date;
  stage_progress: {
    current_stage: number;
    stages_completed: number[];
    stages_in_progress: number[];
    stages_blocked: number[];
  };
  vp_status: Array<{
    vp_id: string;
    role: string;
    active_tasks: number;
    completed_today: number;
    blocked_tasks: number;
    last_report_at: Date;
  }>;
  token_consumption: {
    budget: number;
    consumed: number;
    burn_rate_per_day: number;
  };
  risk_indicators: string[];
  highlight: string;  // One-sentence summary for Chairman briefing
}

// CEO runs this daily to generate rollup for EVA
async function generateCEOStatusRollup(ceoAgentId: string): Promise<VentureStatusRollup> {
  const ceo = await getAgent(ceoAgentId);
  const venture = await getVenture(ceo.venture_id);

  // Collect VP statuses
  const vps = await getSubordinates(ceoAgentId, 'executive');
  const vpStatuses = await Promise.all(
    vps.map(vp => collectVPStatus(vp.id))
  );

  // Calculate stage progress
  const stageProgress = await calculateStageProgress(ceo.venture_id);

  // Calculate token burn
  const tokenBurn = await calculateTokenBurn(ceo.venture_id);

  // Identify risk indicators
  const risks = await identifyRiskIndicators({
    vpStatuses,
    stageProgress,
    tokenBurn,
  });

  // Generate highlight
  const highlight = await generateHighlight({
    ventureName: venture.name,
    stageProgress,
    risks,
    tokenBurn,
  });

  const rollup: VentureStatusRollup = {
    venture_id: ceo.venture_id,
    ceo_agent_id: ceoAgentId,
    timestamp: new Date(),
    stage_progress: stageProgress,
    vp_status: vpStatuses,
    token_consumption: tokenBurn,
    risk_indicators: risks,
    highlight,
  };

  // Store in CEO memory
  await updateAgentMemory(ceoAgentId, {
    type: 'context',
    content: { latest_rollup: rollup },
  });

  // Send to EVA
  await sendMessage({
    type: 'status_report',
    from_agent_id: ceoAgentId,
    to_agent_id: EVA_AGENT_ID,
    subject: `Daily Status: ${venture.name}`,
    body: rollup,
    priority: 'normal',
    requires_response: false,
  });

  return rollup;
}
```

---

## State Consistency & Handoff Protocol

**This section addresses: "CEO-owned venture state machine + explicit handoff protocol."**

### 10.1 The Consistency Problem

Without clear ownership, state can diverge:
- CEO thinks VP is on Stage 5, VP is actually stuck on Stage 4
- Two VPs both think they own the handoff
- Chairman briefing shows stale data

### 10.2 Control Plane Decision

**RESOLVED: CEO owns the venture state machine.**

```
┌─────────────────────────────────────────────────────────────────────┐
│                    STATE OWNERSHIP MODEL                            │
│                                                                     │
│   EVA:     Portfolio-level state (venture exists, budget caps)      │
│               │                                                     │
│               ▼                                                     │
│   CEO:     Venture state machine owner (stage progression)          │
│               │                                                     │
│               ├─── Commits stage transitions                        │
│               ├─── Owns handoff protocol                            │
│               └─── Single source of truth for venture progress      │
│               │                                                     │
│               ▼                                                     │
│   VPs:     Subscribe to CEO state, execute within assigned stages   │
│               │                                                     │
│               └─── Propose stage completion → CEO commits           │
└─────────────────────────────────────────────────────────────────────┘
```

### 10.3 Venture State Machine (CEO-Owned)

```typescript
// lib/agents/state/venture-state-machine.ts

type VentureState = 'active' | 'paused' | 'pivoted' | 'killed' | 'launched';
// Canonical stage states (align with `docs/vision/specs/02-api-contracts.md` StageStatus)
type StageState =
  | 'pending'
  | 'queued'
  | 'in_progress'
  | 'review'
  | 'completed'
  | 'blocked'
  | 'skipped'
  | 'failed';

interface VentureStateMachine {
  venture_id: string;
  owner_ceo_id: string;
  venture_state: VentureState;
  current_stage: number;
  stage_states: Map<number, StageState>;
  handoff_queue: HandoffPackage[];
}

// Only CEO can transition stages
async function commitStageTransition(
  ceoAgentId: string,
  fromStage: number,
  toStage: number,
  handoff: HandoffPackage
): Promise<TransitionResult> {
  // Verify CEO owns this venture
  const ceo = await getAgent(ceoAgentId);
  if (ceo.agent_type !== 'venture_ceo') {
    throw new Error('Only CEO can commit stage transitions');
  }

  // Verify transition is valid
  if (toStage !== fromStage + 1) {
    throw new Error(`Invalid transition: ${fromStage} → ${toStage}`);
  }

  // Verify handoff package is complete
  validateHandoffPackage(handoff);

  // Atomic transition
  await supabase.rpc('fn_commit_stage_transition', {
    p_venture_id: ceo.venture_id,
    p_from_stage: fromStage,
    p_to_stage: toStage,
    p_handoff_package: handoff,
    p_committed_by: ceoAgentId,
  });

  // Notify next VP
  const nextVP = await getVPForStage(ceo.venture_id, toStage);
  await sendMessage({
    type: 'task_delegation',
    from_agent_id: ceoAgentId,
    to_agent_id: nextVP.id,
    subject: `Stage ${toStage} Handoff: ${STAGE_NAMES[toStage]}`,
    body: {
      stage_number: toStage,
      handoff_package: handoff,
      predecessor_artifacts: handoff.artifacts,
    },
    priority: 'high',
    requires_response: true,
  });

  return { success: true, new_stage: toStage };
}
```

### 10.4 Handoff Protocol

```typescript
// lib/agents/state/handoff-protocol.ts

interface HandoffPackage {
  from_stage: number;
  to_stage: number;
  from_vp_id: string;
  to_vp_id: string;

  // Deliverables
  artifacts: Array<{
    artifact_id: string;
    artifact_type: string;
    status: 'final' | 'draft';
  }>;

  // Context
  key_decisions: string[];
  open_questions: string[];
  assumptions_validated: string[];
  risks_identified: string[];

  // Sign-off
  proposed_by: string;         // VP who completed the stage
  proposed_at: Date;
  approved_by?: string;        // CEO who approved
  approved_at?: Date;
  committed_at?: Date;
}

// VP proposes handoff to CEO
async function proposeHandoff(
  vpAgentId: string,
  handoff: Omit<HandoffPackage, 'approved_by' | 'approved_at' | 'committed_at'>
): Promise<void> {
  const vp = await getAgent(vpAgentId);
  const ceo = await getAgent(vp.parent_agent_id);

  await sendMessage({
    type: 'task_completion',
    from_agent_id: vpAgentId,
    to_agent_id: ceo.id,
    subject: `Stage ${handoff.from_stage} Complete - Handoff Proposed`,
    body: {
      handoff_package: {
        ...handoff,
        proposed_by: vpAgentId,
        proposed_at: new Date(),
      },
      recommendation: 'approve_handoff',
      confidence: await calculateHandoffConfidence(handoff),
    },
    priority: 'high',
    requires_response: true,
  });
}

// CEO reviews and commits (or rejects)
async function handleCEOHandoffReview(
  ceoAgentId: string,
  handoff: HandoffPackage,
  decision: 'approve' | 'reject' | 'request_changes'
): Promise<void> {
  if (decision === 'approve') {
    // Commit the transition
    await commitStageTransition(
      ceoAgentId,
      handoff.from_stage,
      handoff.to_stage,
      {
        ...handoff,
        approved_by: ceoAgentId,
        approved_at: new Date(),
        committed_at: new Date(),
      }
    );
  } else if (decision === 'request_changes') {
    // Send back to VP
    await sendMessage({
      type: 'query',
      from_agent_id: ceoAgentId,
      to_agent_id: handoff.from_vp_id,
      subject: `Handoff Changes Required: Stage ${handoff.from_stage}`,
      body: {
        original_handoff: handoff,
        required_changes: decision.changes,
      },
      priority: 'high',
      requires_response: true,
    });
  }
}
```

---

## Tool Contention & Quota Enforcement

**This section addresses: "Per-venture quotas + tool execution gateway."**

### 11.1 The Contention Problem

Shared tools without isolation leads to:
- Venture A exhausts the tool quota, Venture B's work stalls
- Tool failures cascade across all ventures
- No visibility into per-venture tool costs

### 11.2 Tool Execution Gateway

```typescript
// lib/agents/tools/tool-gateway.ts

interface ToolExecutionRequest {
  agent_id: string;
  tool_name: string;
  parameters: Record<string, any>;
  priority: 'low' | 'normal' | 'high' | 'critical';
}

interface ToolExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
  tokens_consumed?: number;
  cost_usd?: number;
}

// Central gateway for all tool executions
async function executeToolWithGateway(
  request: ToolExecutionRequest
): Promise<ToolExecutionResult> {
  const agent = await getAgent(request.agent_id);
  const tool = await getTool(request.tool_name);

  // 1. Check agent has access
  const grant = await getToolGrant(request.agent_id, tool.id);
  if (!grant || (grant.valid_until && grant.valid_until < new Date())) {
    return { success: false, error: 'Tool access denied' };
  }

  // 2. Check agent daily limit
  if (grant.daily_usage_limit && grant.usage_count_today >= grant.daily_usage_limit) {
    return { success: false, error: 'Daily usage limit exceeded' };
  }

  // 3. Check venture quota (if agent is venture-scoped)
  if (agent.venture_id) {
    const ventureQuota = await getVentureToolQuota(agent.venture_id, tool.id);
    if (ventureQuota.remaining <= 0) {
      return { success: false, error: 'Venture tool quota exhausted' };
    }
  }

  // 4. Acquire concurrency token (semaphore)
  const token = await acquireConcurrencyToken(tool.id, agent.venture_id, request.priority);
  if (!token) {
    return { success: false, error: 'Tool at capacity, try again later' };
  }

  try {
    // 5. Execute tool
    const result = await executeTool(tool, request.parameters);

    // 6. Record usage
    await recordToolUsage({
      agent_id: request.agent_id,
      venture_id: agent.venture_id,
      tool_id: tool.id,
      tokens_consumed: result.tokens_consumed,
      cost_usd: result.cost_usd,
    });

    // 7. Update counters
    await incrementUsageCounters(grant.id, agent.venture_id, tool.id);

    return { success: true, ...result };

  } finally {
    // 8. Release concurrency token
    await releaseConcurrencyToken(token);
  }
}
```

### 11.3 Venture Tool Quotas Table

```sql
-- Add to database schema
CREATE TABLE IF NOT EXISTS venture_tool_quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  tool_id UUID NOT NULL REFERENCES tool_registry(id) ON DELETE CASCADE,

  -- Quotas
  daily_limit INT,
  monthly_limit INT,
  cost_limit_usd NUMERIC(10, 2),

  -- Current usage
  usage_today INT DEFAULT 0,
  usage_this_month INT DEFAULT 0,
  cost_this_month_usd NUMERIC(10, 2) DEFAULT 0,

  -- Reset timestamps
  last_daily_reset TIMESTAMPTZ DEFAULT NOW(),
  last_monthly_reset TIMESTAMPTZ DEFAULT NOW(),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(venture_id, tool_id)
);

-- Tool usage ledger for audit
CREATE TABLE IF NOT EXISTS tool_usage_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agent_registry(id),
  venture_id UUID REFERENCES ventures(id),
  tool_id UUID NOT NULL REFERENCES tool_registry(id),

  tokens_consumed INT DEFAULT 0,
  cost_usd NUMERIC(10, 6) DEFAULT 0,
  execution_ms INT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tool_usage_venture ON tool_usage_ledger(venture_id, created_at DESC);
CREATE INDEX idx_tool_usage_agent ON tool_usage_ledger(agent_id, created_at DESC);
```

---

## Bootstrap & Seed Procedure

**This section addresses: "How is EVA instantiated? How is Chairman registered?"**

### 12.1 The Bootstrap Problem

Before any ventures exist, we need:
- Chairman "agent" record (even though it's human)
- EVA agent record with credentials/config
- Core tools seeded
- EVA granted access to required tools

### 12.2 Bootstrap Migration

```sql
-- database/migrations/YYYYMMDD_bootstrap_ecosystem.sql

BEGIN;

-- 1. Create Chairman agent (represents the human)
INSERT INTO agent_registry (
  id,
  agent_type,
  agent_role,
  display_name,
  parent_agent_id,
  hierarchy_level,
  hierarchy_path,
  status,
  capabilities,
  delegation_authority
) VALUES (
  '00000000-0000-0000-0000-000000000001',  -- Well-known ID
  'chairman',
  'ECOSYSTEM_CHAIRMAN',
  'Rick (Chairman)',
  NULL,  -- No parent
  1,
  'chairman',
  'active',
  ARRAY['ecosystem_governance', 'capital_allocation', 'kill_decision'],
  '{"can_approve_spend_usd": null, "can_approve_token_budget": null}'::jsonb  -- Unlimited
);

-- 2. Create EVA agent
INSERT INTO agent_registry (
  id,
  agent_type,
  agent_role,
  display_name,
  parent_agent_id,
  hierarchy_level,
  hierarchy_path,
  status,
  capabilities,
  delegation_authority
) VALUES (
  '00000000-0000-0000-0000-000000000002',  -- Well-known ID
  'eva',
  'CHIEF_OPERATING_OFFICER',
  'EVA (COO)',
  '00000000-0000-0000-0000-000000000001',  -- Reports to Chairman
  2,
  'chairman.eva',
  'active',
  ARRAY['venture_onboarding', 'ceo_management', 'portfolio_aggregation', 'escalation_routing'],
  '{
    "can_approve_spend_usd": 1000,
    "can_approve_token_budget": 500000,
    "can_hire_crews": false,
    "can_onboard_ventures": true
  }'::jsonb
);

-- 3. Create relationship
INSERT INTO agent_relationships (from_agent_id, to_agent_id, relationship_type)
VALUES
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'reports_to'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'supervises');

-- 4. Seed core tools (abbreviated - full list in spec)
INSERT INTO tool_registry (tool_name, display_name, tool_category, implementation_type, implementation_config, min_hierarchy_level)
VALUES
  ('web_search', 'Web Search', 'research', 'api', '{"provider": "tavily"}', 4),
  ('code_generator', 'Code Generation', 'generation', 'api', '{"provider": "anthropic"}', 3),
  ('venture_query', 'Venture Database', 'database', 'function', '{"module": "lib/tools/venture_query.ts"}', 3);

-- 5. Grant EVA core tools
INSERT INTO tool_access_grants (agent_id, tool_id, grant_type)
SELECT
  '00000000-0000-0000-0000-000000000002',
  id,
  'direct'
FROM tool_registry
WHERE min_hierarchy_level <= 2;

COMMIT;
```

### 12.3 Well-Known Agent IDs

```typescript
// lib/agents/constants.ts

export const CHAIRMAN_AGENT_ID = '00000000-0000-0000-0000-000000000001';
export const EVA_AGENT_ID = '00000000-0000-0000-0000-000000000002';

// Use these when:
// - Creating new ventures (parent = EVA)
// - Escalating from CEO (target = EVA)
// - Generating Chairman briefing (from = EVA, for = Chairman)
```

---

## Control Plane Resolution

**This section resolves: "EVA-flat orchestration vs hierarchical COO model."**

### 13.1 The Conflict

- `04-eva-orchestration.md`: EVA dispatches directly to crews
- `06-hierarchical-agent-architecture.md`: EVA manages CEOs, not crews

### 13.2 Resolution

**EVA operates in TWO MODES depending on venture maturity:**

| Mode | When Used | EVA Role |
|------|-----------|----------|
| **Direct Mode** | Venture has no CEO (early stage, quick tasks) | EVA → Crews directly |
| **Delegated Mode** | Venture has CEO (full lifecycle) | EVA → CEO → VPs → Crews |

```typescript
// lib/agents/eva/dispatch-router.ts

async function routeDirective(
  directive: ChairmanDirective
): Promise<void> {
  const venture = await getVenture(directive.venture_id);

  // Check if venture has a CEO
  const ceo = await getVentureCEO(venture.id);

  if (ceo) {
    // DELEGATED MODE: Send to CEO
    await sendMessage({
      type: 'task_delegation',
      from_agent_id: EVA_AGENT_ID,
      to_agent_id: ceo.id,
      subject: `Chairman Directive: ${directive.command_text.substring(0, 100)}`,
      body: { directive },
      priority: directive.priority,
      requires_response: true,
    });
  } else {
    // DIRECT MODE: EVA orchestrates crews directly
    // (Legacy behavior from 04-eva-orchestration.md)
    await dispatchToCrewsDirectly(directive);
  }
}
```

### 13.3 Updated EVA Responsibilities

| Responsibility | Direct Mode | Delegated Mode |
|----------------|-------------|----------------|
| Crew dispatch | EVA does it | CEO/VPs do it |
| Artifact review | EVA reviews | CEO/VPs review, EVA sees rollups |
| Stage advancement | EVA decides | CEO commits, EVA sees notifications |
| Token tracking | EVA tracks all | CEO tracks venture, EVA sees rollups |
| Briefing generation | Aggregate crew outputs | Aggregate CEO status reports |

---

## Related Specifications

- [01-database-schema.md](./01-database-schema.md) - Core tables (to be extended)
- [04-eva-orchestration.md](./04-eva-orchestration.md) - EVA's current role (to be updated)
- [05-user-stories.md](./05-user-stories.md) - User stories for hierarchical view
- [00_VISION_V2_CHAIRMAN_OS.md](../00_VISION_V2_CHAIRMAN_OS.md) - Master vision document

---

**Document History:**
- v1.0 (Dec 2025): Initial specification based on Chairman's hierarchical requirements
- v1.1 (Dec 2025): Added Agent Runtime Service, State Consistency, Tool Contention, Bootstrap, and Control Plane Resolution based on OpenAI architectural review
