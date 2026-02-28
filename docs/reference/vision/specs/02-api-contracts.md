---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# Vision v2 API Contracts Specification



## Table of Contents

- [Metadata](#metadata)
- [Overview](#overview)
  - [Production Safety Rules (Single-User, Rick-only)](#production-safety-rules-single-user-rick-only)
- [1. TypeScript Interfaces](#1-typescript-interfaces)
  - [1.1 Core Types](#11-core-types)
- [2. API Endpoints](#2-api-endpoints)
  - [2.1 Ventures API](#21-ventures-api)
  - [2.1.1 Opportunity Blueprints API](#211-opportunity-blueprints-api)
  - [2.2 Chairman API](#22-chairman-api)
  - [2.3 Directives API (EVA Commands)](#23-directives-api-eva-commands)
  - [2.4 Artifacts API (Factory Floor)](#24-artifacts-api-factory-floor)
  - [2.5 Crews API (Manual Trigger)](#25-crews-api-manual-trigger)
  - [2.6 Assumptions API (Reality Check)](#26-assumptions-api-reality-check)
- [2.7 Realtime (SSE)](#27-realtime-sse)
- [3. Zod Validation Schemas](#3-zod-validation-schemas)
- [4. Error Response Contract](#4-error-response-contract)
- [5. Authentication Middleware](#5-authentication-middleware)
- [References](#references)

## Metadata
- **Category**: API
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-12
- **Tags**: database, api, unit, schema

**Version:** 1.0
**Status:** APPROVED
**Last Updated:** December 2025
**Parent Document:** [00_VISION_V2_CHAIRMAN_OS.md](../00_VISION_V2_CHAIRMAN_OS.md)

---

## Overview

This specification defines the complete API contracts for the Chairman's Operating System. All endpoints follow RESTful conventions and use JSON payloads.

**Base URL:** `/api`
**Authentication:** Bearer token (Supabase Auth)
**Content-Type:** `application/json`

**Traceability:** All requests MAY include `X-Correlation-Id: <uuid>` header.
- If omitted, the server MUST generate a UUID correlation ID.
- The server SHOULD echo the correlation ID in response header `X-Correlation-Id`.
- Records created as part of the request chain MUST persist this `correlation_id` (see `12-ops-debugging.md`).

### Production Safety Rules (Single-User, Rick-only)

- **No service key in the browser**: endpoints MUST NOT require or accept a Supabase `service_role` key from the client.
- **Privileged writes are server-only**: any endpoint that performs automation/agent actions must run server-side and authenticate to Supabase with `service_role`.
- **Chairman-only enforcement**: any human-facing endpoint must rely on `authenticated` + `fn_is_chairman()` (see `01-database-schema.md`).
- **Every mutating request must be traceable**: include `correlation_id` and log an audit record for sensitive actions (see `12-ops-debugging.md`).

---

## 1. TypeScript Interfaces

### 1.1 Core Types

```typescript
// types/vision-v2.ts

// ============================================
// ENUMS
// ============================================

export type VentureStatus = 'active' | 'paused' | 'killed' | 'launched';
export type HealthScore = 'green' | 'yellow' | 'red';
export type DecisionType = 'proceed' | 'pivot' | 'fix' | 'kill' | 'pause' | 'override';
export type GateType = 'auto_advance' | 'advisory_checkpoint' | 'hard_gate';
export type TokenBudgetProfile = 'exploratory' | 'standard' | 'deep_diligence' | 'custom';
export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertType =
  | 'token_budget_warning'
  | 'assumption_invalidated'
  | 'stage_blocked'
  | 'crew_failed'
  | 'eva_failover'
  | 'poison_task'
  | 'intelligence_trigger';

// ============================================
// STATUS ENUMS (Canonical)
// ============================================

export type StageStatus =
  | 'pending'       // Not yet started
  | 'queued'        // Crew assigned, waiting to run
  | 'in_progress'   // Crew executing
  | 'review'        // Awaiting gate decision / approval
  | 'completed'     // Passed, artifacts stored
  | 'failed'        // Terminal failure (may be retried externally)
  | 'blocked'       // Cannot proceed until dependency resolved
  | 'skipped';      // Chairman override / manual skip

export type CrewAssignmentStatus =
  | 'pending'
  | 'queued'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'cancelled';

// ============================================
// TRACE CONTEXT
// ============================================

export interface TraceContext {
  correlation_id: string;   // UUID (RFC 4122)
  parent_trace_id?: string; // UUID
  trace_sequence?: number;  // Monotonic order within the correlation chain
}

// ============================================
// PHASE NAMES (The Six Phases)
// ============================================

export type PhaseName =
  | 'INCEPTION'      // Stage 0 (pre-lifecycle)
  | 'THE_TRUTH'      // Stages 1-5
  | 'THE_ENGINE'     // Stages 6-9
  | 'THE_IDENTITY'   // Stages 10-12
  | 'THE_BLUEPRINT'  // Stages 13-16
  | 'THE_BUILD_LOOP' // Stages 17-20
  | 'LAUNCH_LEARN';  // Stages 21-25

// ============================================
// VENTURE TYPES
// ============================================

export interface TokenBudget {
  profile: TokenBudgetProfile;
  total_allocated: number;
  total_consumed: number;
  burn_rate_per_day: number;
}

export interface VentureSummary {
  id: string;
  name: string;
  problem_statement: string;
  portfolio_id: string;
  portfolio_name: string;
  status: VentureStatus;
  current_stage: number;
  current_phase: PhaseName;
  phase_progress: number;      // % complete within phase
  overall_progress: number;    // % of 25 stages
  health_score: HealthScore;
  token_budget: TokenBudget;
  pending_decision: boolean;
  last_activity_at: string;    // ISO 8601
  created_at: string;
}

export interface StageArtifact {
  id: string;
  type: string;
  summary: string;
  created_at: string;
}

export interface CrewAssignment {
  crew_name: string;
  crew_type: string;
  status: CrewAssignmentStatus;
  tokens_used: number;
  started_at?: string;
  completed_at?: string;
}

export interface VentureStage {
  stage_number: number;
  stage_name: string;
  phase: PhaseName;
  gate_type: GateType;
  status: StageStatus;
  started_at?: string;
  completed_at?: string;
  artifacts: StageArtifact[];
  crew_assignment?: CrewAssignment;
}

export interface TokenLedgerByPhase {
  [phase: string]: {
    budget: number;
    consumed: number;
  };
}

export interface Assumption {
  id: string;
  category: 'market' | 'competitor' | 'product' | 'timing' | 'financial' | 'technical';
  key: string;
  text: string;
  confidence: number;
  stage_created: number;
  reality_status: 'pending' | 'validated' | 'invalidated' | 'partially_validated';
  reality_value?: string;
}

export interface VentureDecision {
  id: string;
  stage: number;
  gate_type: GateType;
  recommendation: DecisionType;
  decision: DecisionType;
  notes?: string;
  decided_at: string;
}

export interface VentureDetail extends VentureSummary {
  origin_type: 'manual' | 'competitor_clone' | 'blueprint';
  stages: VentureStage[];
  token_ledger: {
    by_phase: TokenLedgerByPhase;
    total_budget: number;
    total_consumed: number;
  };
  assumptions: Assumption[];
  decisions: VentureDecision[];
  updated_at: string;
}

// ============================================
// CHAIRMAN BRIEFING TYPES
// ============================================

export interface PhaseDistribution {
  phase: PhaseName;
  count: number;
  avg_health: number;
}

export interface PortfolioHealth {
  total_ventures: number;
  active: number;
  paused: number;
  killed_this_month: number;
  launched_this_month: number;
  by_phase: PhaseDistribution[];  // Distribution across 6 phases
}

export interface DecisionStackItem {
  id: string;
  venture_id: string;
  venture_name: string;
  type: 'gate_decision' | 'pivot_request' | 'kill_recommendation';
  // Present when type === 'gate_decision'
  gate_type?: GateType;
  stage: number;
  stage_name: string;
  urgency: 'high' | 'medium' | 'low';
  summary: string;
  recommendation: DecisionType;
  evidence_summary?: string;
  action_required: boolean;
  created_at: string;
}

export interface Alert {
  type: AlertType;
  venture_name: string;
  message: string;
  severity: AlertSeverity;
}

export interface RecentCompletion {
  venture_name: string;
  stage: number;
  stage_name: string;
  completed_at: string;
}

export interface TokenSummary {
  total_spent_this_week: number;
  total_spent_this_month: number;
  cost_usd_this_month: number;
  avg_cost_per_venture?: number;
}

// ============================================
// GOD VIEW TYPES (Chairman Dashboard)
// ============================================

export interface FinancialOverview {
  total_budget_usd: number;
  total_spent_usd: number;
  budget_remaining_usd: number;
  projected_monthly_usd: number;
  burn_rate_trend: 'increasing' | 'stable' | 'decreasing';
  top_spenders: Array<{
    venture_id: string;
    venture_name: string;
    spent_usd: number;
    budget_usd: number;
    percent_consumed: number;
  }>;
}

export interface ActiveAgentsOverview {
  total_working: number;
  total_queued: number;
  agents: Array<{
    venture_id: string;
    venture_name: string;
    stage: number;
    stage_name: string;
    crew_type: string;
    status: 'working' | 'queued';
    duration_minutes: number;
  }>;
}

export interface RiskOverview {
  ventures_at_risk: number;
  trend: 'improving' | 'stable' | 'degrading';
  critical_items: Array<{
    venture_id: string;
    venture_name: string;
    stage?: number;
    risk_type: 'token_overburn' | 'stalled' | 'assumption_invalidated' | 'gate_blocked';
    severity: 'critical' | 'warning';
    message: string;
  }>;
}

// ============================================
// OPPORTUNITY INBOX (Deal Flow Summary)
// ============================================

export interface OpportunityInboxSummary {
  total_approved: number;
  new_since_last_briefing: number;
  pending_reviews: number;
  top_blueprints: Array<Pick<OpportunityBlueprint, 'id' | 'title' | 'summary' | 'status' | 'created_at' | 'updated_at'>>;
  latest_job?: Pick<BlueprintJob, 'id' | 'mode' | 'status' | 'created_at' | 'started_at' | 'completed_at' | 'error'>;
}

export interface ChairmanBriefing {
  greeting: string;
  generated_at: string;
  global_health_score: number;
  portfolio_health: PortfolioHealth;
  decision_stack: DecisionStackItem[];
  decision_count: number;
  alerts: Alert[];
  recent_completions: RecentCompletion[];
  token_summary: TokenSummary;

  // God View additions
  financial_overview: FinancialOverview;
  active_agents: ActiveAgentsOverview;
  risk_overview: RiskOverview;

  // Deal Flow (Autonomous Ideation)
  opportunity_inbox: OpportunityInboxSummary;
}

// ============================================
// FOUR BUCKETS (Epistemic Classification)
// ============================================

export interface FactBucket {
  claim: string;
  source: string;
  source_type: 'database' | 'api' | 'document' | 'calculation';
  confidence: number;
}

export interface AssumptionBucket {
  claim: string;
  assumption_set_id: string;
  key: string;
  confidence: number;
}

export interface SimulationBucket {
  claim: string;
  simulation_run_id: string;
  assumption_set_id: string;
}

export interface UnknownBucket {
  gap: string;
  resolution: string;
}

export interface FourBuckets {
  facts: FactBucket[];
  assumptions: AssumptionBucket[];
  simulations: SimulationBucket[];
  unknowns: UnknownBucket[];
}

export interface PendingDecision extends DecisionStackItem {
  gate_type: GateType;
  status: 'pending';
  recommendation_confidence: number;
  evidence: FourBuckets;
  options: DecisionType[];
}

// ============================================
// OPPORTUNITY DISCOVERY / BLUEPRINTS
// ============================================

export type BlueprintStatus = 'draft' | 'reviewed' | 'approved' | 'rejected';
export type BlueprintJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type BlueprintJobMode = 'manual' | 'scheduled';
export type BoardVerdict = 'approve' | 'reject' | 'abstain';

export interface BlueprintGenerationConfig {
  creativity: number;     // 0..1
  risk_tolerance: number; // 0..1
  max_blueprints?: number;
  focus_tags?: string[];
}

export interface OpportunityBlueprint {
  id: string;
  title: string;
  category?: string;
  summary: string;
  status: BlueprintStatus;
  scaffold: Record<string, unknown>;
  evidence: FourBuckets;
  scores?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface BlueprintJob {
  id: string;
  mode: BlueprintJobMode;
  status: BlueprintJobStatus;
  config: BlueprintGenerationConfig;
  correlation_id?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  error?: string;
}

export interface BlueprintJobEvent {
  id: string;
  job_id: string;
  event_type: string;
  message?: string;
  progress_pct?: number; // 0..100
  agent_name?: string;
  tokens_used?: number;
  created_at: string;
}

export interface BoardVote {
  member: string;
  vote: BoardVerdict;
  rationale: string;
}

export interface BlueprintBoardReview {
  id: string;
  blueprint_id: string;
  verdict: BoardVerdict;
  consensus?: number; // 0..1
  votes: BoardVote[];
  summary?: string;
  created_at: string;
}
```

---

## 2. API Endpoints

### 2.1 Ventures API

#### GET /api/ventures

List all ventures with stage summary.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `status` | string | all | Filter by status |
| `portfolio_id` | uuid | - | Filter by portfolio |
| `limit` | number | 50 | Max results |
| `offset` | number | 0 | Pagination offset |

**Response: 200 OK**
```typescript
interface VenturesListResponse {
  ventures: VentureSummary[];
  total: number;
  page: number;
  limit: number;
  filters_applied: {
    status?: string;
    portfolio_id?: string;
  };
}
```

**Example Response:**
```json
{
  "ventures": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "MonthEndAI",
      "problem_statement": "Automate month-end close for accountants",
      "portfolio_id": "660e8400-e29b-41d4-a716-446655440001",
      "portfolio_name": "FinTech Portfolio",
      "status": "active",
      "current_stage": 5,
      "current_phase": "THE_TRUTH",
      "phase_progress": 100,
      "overall_progress": 20,
      "health_score": "green",
      "token_budget": {
        "profile": "standard",
        "total_allocated": 500000,
        "total_consumed": 89000,
        "burn_rate_per_day": 12000
      },
      "pending_decision": true,
      "last_activity_at": "2025-12-12T10:30:00Z",
      "created_at": "2025-12-01T08:00:00Z"
    }
  ],
  "total": 12,
  "page": 1,
  "limit": 50,
  "filters_applied": {
    "status": "active"
  }
}
```

---

#### GET /api/ventures/:id

Get venture detail with full stage breakdown.

**Response: 200 OK**
```typescript
type VentureDetailResponse = VentureDetail;
```

**Response: 404 Not Found**
```json
{
  "error": "Venture not found",
  "venture_id": "uuid"
}
```

---

#### GET /api/ventures/:id/budget

Get token cap settings for a venture (soft/hard caps).

**Response: 200 OK**
```typescript
interface VentureBudgetResponse {
  venture_id: string;
  soft_cap_tokens?: number;
  hard_cap_tokens?: number;
  updated_at?: string;
}
```

#### PUT /api/ventures/:id/budget

Set or update token caps for a venture.

**Headers:**
| Header | Required | Notes |
|--------|----------|------|
| `Idempotency-Key` | Yes | Prevent double-submit (e.g., `budget:{venture_id}:{soft}:{hard}`) |

**Request:**
```typescript
interface VentureBudgetUpdateRequest {
  soft_cap_tokens?: number; // warning threshold
  hard_cap_tokens?: number; // auto-pause threshold
}
```

**Response: 200 OK**
```typescript
type VentureBudgetUpdateResponse = VentureBudgetResponse;
```

---

#### POST /api/ventures

Create a new venture.

**Request Body:**
```typescript
interface CreateVentureRequest {
  name: string;
  problem_statement: string;
  portfolio_id?: string;
  origin_type?: 'manual' | 'competitor_clone' | 'blueprint';
  start_stage?: 0 | 1; // Default: 0 (INCEPTION). Use 1 to bypass Stage 0 (not recommended).
  inception_brief?: {
    entry_method: 'manual' | 'competitor_clone' | 'blueprint' | 'import';
    venture_vision: string;
    initial_concept: string;
    notes?: string;
  };
  token_budget_profile?: TokenBudgetProfile;
  initial_assumptions?: Array<{
    category: string;
    key: string;
    text: string;
    confidence: number;
  }>;
}
```

**Response: 201 Created**
```typescript
interface CreateVentureResponse {
  success: true;
  venture_id: string;
  name: string;
  current_stage: 0 | 1;
  message: string;
}
```

---

#### POST /api/ventures/:id/promote

Promote a venture from **Stage 0 (INCEPTION)** to **Stage 1**.

This operation MUST be:
- **Atomic** (single transactional promotion)
- **Idempotent** (client retries safe via `Idempotency-Key`)

**Headers:**
| Header | Required | Notes |
|--------|----------|------|
| `Idempotency-Key` | Yes | Example: `promote:{venture_id}:0->1:{inception_brief_id}` |
| `X-Correlation-Id` | Optional | If omitted, server generates and echoes |

**Request:**
```typescript
interface PromoteVentureRequest {
  from_stage: 0;
  to_stage: 1;
  inception_brief_id: string;
  reason?: string; // e.g., "Chairman approved promotion"
}
```

**Response: 200 OK**
```typescript
interface PromoteVentureResponse {
  success: true;
  venture_id: string;
  from_stage: 0;
  to_stage: 1;
  idempotent?: boolean;
  message: string;
}
```

---

### 2.1.1 Opportunity Blueprints API

These endpoints implement the autonomous “deal flow” loop: **AI generates blueprints**, but the **Chairman chooses** whether to instantiate a venture.

#### GET /api/blueprints

List opportunity blueprints (deal flow inventory).

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `status` | string | approved | Filter by `BlueprintStatus` |
| `limit` | number | 50 | Max results |
| `offset` | number | 0 | Pagination offset |

**Response: 200 OK**
```typescript
interface ListBlueprintsResponse {
  blueprints: OpportunityBlueprint[];
  total: number;
  page: number;
  limit: number;
}
```

---

#### POST /api/blueprints/generate

Trigger blueprint generation (CrewAI Blueprint Generation Crew + optional Board Review Crew). Must be server-side (service_role) for privileged execution.

**Headers:**
- `Idempotency-Key: <string>` (recommended)
- `X-Correlation-Id: <uuid>` (optional)

**Request:**
```typescript
interface GenerateBlueprintsRequest {
  mode: 'manual' | 'scheduled';
  config: BlueprintGenerationConfig;
  include_board_review?: boolean;
}
```

**Response: 202 Accepted**
```typescript
interface GenerateBlueprintsResponse {
  job: BlueprintJob;
}
```

---

#### GET /api/blueprints/jobs/:id

Fetch job status and recent events.

**Response: 200 OK**
```typescript
interface GetBlueprintJobResponse {
  job: BlueprintJob;
  events: BlueprintJobEvent[];
}
```

---

#### POST /api/blueprints/:id/review

Run the 7-member Board Review Crew against an existing blueprint.

**Request:**
```typescript
interface ReviewBlueprintRequest {
  config?: {
    risk_tolerance?: number; // 0..1
  };
}
```

**Response: 200 OK**
```typescript
interface ReviewBlueprintResponse {
  review: BlueprintBoardReview;
}
```

---

#### POST /api/blueprints/:id/instantiate

Create a new venture **at Stage 0** from a blueprint (creates an Inception Brief with `entry_method='blueprint'`). This endpoint MUST NOT promote to Stage 1 automatically.

**Request:**
```typescript
interface InstantiateVentureFromBlueprintRequest {
  venture_name: string;
  portfolio_id: string;
  notes?: string;
}
```

**Response: 201 Created**
```typescript
interface InstantiateVentureFromBlueprintResponse {
  venture_id: string;
  inception_brief_id: string;
  current_stage: 0;
}
```

---

### 2.2 Chairman API

#### GET /api/chairman/briefing

Get EVA's synthesized morning briefing.

**Response: 200 OK**
```typescript
type ChairmanBriefingResponse = ChairmanBriefing;
```

---

#### GET /api/chairman/portfolio

Portfolio “God view” list for the Chairman.

**Response: 200 OK**
```typescript
interface ChairmanPortfolioResponse {
  portfolios: Array<{
    id: string;
    name: string;
    total_ventures: number;
    active: number;
    paused: number;
    killed: number;
    launched: number;
    avg_health_score: number; // 0-100
    updated_at?: string;
  }>;
}
```

**Example Response:**
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
    "launched_this_month": 1,
    "by_phase": [
      { "phase": "THE_TRUTH", "count": 3, "avg_health": 85 },
      { "phase": "THE_ENGINE", "count": 2, "avg_health": 90 },
      { "phase": "THE_IDENTITY", "count": 1, "avg_health": 75 },
      { "phase": "THE_BLUEPRINT", "count": 2, "avg_health": 88 },
      { "phase": "THE_BUILD_LOOP", "count": 0, "avg_health": 0 },
      { "phase": "LAUNCH_LEARN", "count": 0, "avg_health": 0 }
    ]
  },
  "decision_stack": [
    {
      "id": "770e8400-e29b-41d4-a716-446655440002",
      "venture_id": "550e8400-e29b-41d4-a716-446655440000",
      "venture_name": "Solara",
      "type": "gate_decision",
      "stage": 5,
      "stage_name": "Profitability Forecasting",
      "urgency": "high",
      "summary": "Profitability analysis complete. LTV:CAC = 4:1. Retention assumption weak.",
      "recommendation": "proceed",
      "evidence_summary": "Unit economics look solid but 24-mo retention assumed at 65% confidence.",
      "action_required": true,
      "created_at": "2025-12-12T06:00:00Z"
    }
  ],
  "decision_count": 3,
  "alerts": [
    {
      "type": "token_budget_warning",
      "venture_name": "DataSync",
      "message": "Token budget 85% consumed at Stage 12 (expected 48%)",
      "severity": "warning"
    }
  ],
  "recent_completions": [
    {
      "venture_name": "AIScribe",
      "stage": 16,
      "stage_name": "Spec-Driven Schema Generation",
      "completed_at": "2025-12-11T22:00:00Z"
    }
  ],
  "token_summary": {
    "total_spent_this_week": 245000,
    "total_spent_this_month": 1200000,
    "cost_usd_this_month": 48.50,
    "avg_cost_per_venture": 4.04
  },
  "financial_overview": {
    "total_budget_usd": 500.00,
    "total_spent_usd": 48.50,
    "budget_remaining_usd": 451.50,
    "projected_monthly_usd": 65.00,
    "burn_rate_trend": "stable",
    "top_spenders": [
      {
        "venture_id": "550e8400-e29b-41d4-a716-446655440000",
        "venture_name": "Solara",
        "spent_usd": 18.25,
        "budget_usd": 50.00,
        "percent_consumed": 36.5
      },
      {
        "venture_id": "660e8400-e29b-41d4-a716-446655440001",
        "venture_name": "DataSync",
        "spent_usd": 15.80,
        "budget_usd": 50.00,
        "percent_consumed": 31.6
      }
    ]
  },
  "active_agents": {
    "total_working": 2,
    "total_queued": 3,
    "agents": [
      {
        "venture_id": "770e8400-e29b-41d4-a716-446655440002",
        "venture_name": "AIScribe",
        "stage": 17,
        "stage_name": "AI-Powered Code Generation",
        "crew_type": "IMPLEMENTATION",
        "status": "working",
        "duration_minutes": 12
      },
      {
        "venture_id": "880e8400-e29b-41d4-a716-446655440003",
        "venture_name": "FinBot",
        "stage": 4,
        "stage_name": "Competitive Landscape Report",
        "crew_type": "COMPETITIVE_INTEL",
        "status": "working",
        "duration_minutes": 8
      }
    ]
  },
  "risk_overview": {
    "ventures_at_risk": 2,
    "trend": "stable",
    "critical_items": [
      {
        "venture_id": "660e8400-e29b-41d4-a716-446655440001",
        "venture_name": "DataSync",
        "stage": 12,
        "risk_type": "token_overburn",
        "severity": "warning",
        "message": "85% budget consumed at 48% progress"
      },
      {
        "venture_id": "990e8400-e29b-41d4-a716-446655440004",
        "venture_name": "CloudMesh",
        "stage": 3,
        "risk_type": "assumption_invalidated",
        "severity": "critical",
        "message": "TAM assumption invalidated - market 60% smaller than projected"
      }
    ]
  }
}
```

---

#### GET /api/chairman/decisions

Get pending decision queue.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | Filter: pending, approved, rejected |
| `urgency` | string | Filter: high, medium, low |
| `venture_id` | uuid | Filter by venture |

**Response: 200 OK**
```typescript
interface DecisionsListResponse {
  decisions: PendingDecision[];
  total_pending: number;
}
```

---

#### POST /api/chairman/decide

Submit Chairman's decision.

**Headers:**
| Header | Required | Type | Notes |
|--------|----------|------|------|
| `X-Correlation-Id` | No | uuid | If missing, server generates one and echoes it |
| `Idempotency-Key` | Yes | string | Required to prevent double-submit (e.g., `decide:{decision_id}:{decision}`) |

**Request Body:**
```typescript
interface DecideRequest {
  decision_id: string;
  decision: DecisionType;
  notes?: string;
  override_reason?: string;  // Required if decision != recommendation
}
```

**Response: 200 OK**
```typescript
interface DecideResponse {
  success: true;
  decision_id: string;
  venture_id: string;
  next_stage?: number;
  message: string;
}
```

**Response: 401 Unauthorized**
```json
{ "error": "Unauthorized" }
```

**Response: 403 Forbidden**
```json
{ "error": "Forbidden (chairman_only)" }
```

**Response: 400 Bad Request**
```json
{
  "error": "Override reason required when decision differs from recommendation",
  "decision": "proceed",
  "recommendation": "kill"
}
```

**Response: 409 Conflict**
```json
{
  "error": "Decision already resolved",
  "decision_id": "uuid",
  "current_decision": "proceed"
}
```

**Response: 429 Too Many Requests**
```json
{ "error": "Rate limited" }
```

---

### 2.3 Directives API (EVA Commands)

#### POST /api/chairman/directive

Submit a natural language command to EVA.

**Request Body:**
```typescript
interface DirectiveRequest {
  command_text: string;
  venture_id?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
}
```

**Response: 202 Accepted**
```typescript
interface DirectiveResponse {
  success: true;
  directive_id: string;
  status: 'processing';
  eva_acknowledgment: string;
  estimated_completion?: string;
}
```

**Example:**
```json
// Request
{
  "command_text": "EVA, pivot Solara to focus on Enterprise customers",
  "venture_id": "550e8400-e29b-41d4-a716-446655440000",
  "priority": "high"
}

// Response
{
  "success": true,
  "directive_id": "880e8400-e29b-41d4-a716-446655440003",
  "status": "processing",
  "eva_acknowledgment": "Understood. I'm updating the Business Model Canvas and GTM Strategy for Solara to target Enterprise customers. I'll have a revised plan ready for your review.",
  "estimated_completion": "2025-12-12T12:00:00Z"
}
```

---

### 2.4 Artifacts API (Factory Floor)

#### GET /api/artifacts/:id

Fetch a single artifact (current version).

**Response: 200 OK**
```typescript
interface ArtifactResponse {
  id: string;
  venture_id: string;
  stage_number: number;
  artifact_type: string;
  title: string;
  content?: string;
  storage_url?: string;
  version: number;
  is_human_modified: boolean;
  updated_at: string;
}
```

#### PATCH /api/artifacts/:id

Override artifact content (creates a new version server-side).

**Headers:**
| Header | Required | Notes |
|--------|----------|------|
| `Idempotency-Key` | Yes | Prevent duplicate versions |

**Request:**
```typescript
interface ArtifactUpdateRequest {
  content: string;
  edit_reason?: string;
}
```

**Response: 200 OK**
```typescript
interface ArtifactUpdateResponse {
  success: true;
  artifact_id: string;
  new_version: number;
}
```

#### GET /api/artifacts/:id/versions

List available versions for an artifact (for diff/restore).

**Response: 200 OK**
```typescript
interface ArtifactVersionsResponse {
  versions: Array<{
    artifact_id: string;
    version: number;
    is_current: boolean;
    is_human_modified: boolean;
    updated_at: string;
  }>;
}
```

---

### 2.5 Crews API (Manual Trigger)

#### POST /api/crews/dispatch

Manual crew trigger for a specific venture/stage.

**Headers:**
| Header | Required | Notes |
|--------|----------|------|
| `Idempotency-Key` | Yes | Prevent duplicate dispatches |

**Request:**
```typescript
interface CrewDispatchRequest {
  venture_id: string;
  stage_number: number;
  crew_type: string;       // e.g. 'MARKET_VALIDATION'
  objective: string;       // human-entered
  max_tokens?: number;
  timeout_minutes?: number;
}
```

**Response: 202 Accepted**
```typescript
interface CrewDispatchResponse {
  success: true;
  task_contract_id: string;
  status: 'pending' | 'claimed' | 'in_progress';
}
```

---

### 2.6 Assumptions API (Reality Check)

#### GET /api/assumptions/:id

Fetch an assumption by id.

**Response: 200 OK**
```typescript
type AssumptionResponse = Assumption;
```

#### PATCH /api/assumptions/:id

Update an assumption with reality check status/value.

**Headers:**
| Header | Required | Notes |
|--------|----------|------|
| `Idempotency-Key` | Yes | Prevent duplicate updates |

**Request:**
```typescript
interface AssumptionUpdateRequest {
  reality_status: 'pending' | 'validated' | 'invalidated' | 'partially_validated';
  reality_value?: string;
}
```

**Response: 200 OK**
```typescript
type AssumptionUpdateResponse = Assumption;
```

---

## 2.7 Realtime (SSE)

Production-safe realtime is provided via **Server-Sent Events** (SSE). Clients authenticate using the normal session (Bearer token / cookies) and MUST NOT use `service_role`.

#### GET /api/realtime/alerts (SSE)

Emits `chairman_alerts` updates as they occur.

**Event: `alert`**
```json
{
  "id": "uuid",
  "venture_id": "uuid",
  "stage_number": 13,
  "type": "token_budget_warning",
  "severity": "warning",
  "message": "Token budget at 85% for Stage 13",
  "created_at": "2025-12-12T10:00:00Z"
}
```

#### GET /api/realtime/telemetry (SSE)

Emits task contract status changes for live telemetry.

**Event: `task`**
```json
{
  "task_contract_id": "uuid",
  "venture_id": "uuid",
  "stage_number": 18,
  "status": "in_progress",
  "updated_at": "2025-12-12T10:00:00Z"
}
```

---

## 3. Zod Validation Schemas

```typescript
// validation/vision-v2.zod.ts
import { z } from 'zod';

// ============================================
// COMMON SCHEMAS
// ============================================

export const UUIDSchema = z.string().uuid();

export const VentureStatusSchema = z.enum(['active', 'paused', 'killed', 'launched']);
export const HealthScoreSchema = z.enum(['green', 'yellow', 'red']);
export const DecisionTypeSchema = z.enum(['proceed', 'pivot', 'fix', 'kill', 'pause', 'override']);
export const GateTypeSchema = z.enum(['auto_advance', 'advisory_checkpoint', 'hard_gate']);
export const TokenBudgetProfileSchema = z.enum(['exploratory', 'standard', 'deep_diligence', 'custom']);

export const PhaseNameSchema = z.enum([
  'INCEPTION',
  'THE_TRUTH',
  'THE_ENGINE',
  'THE_IDENTITY',
  'THE_BLUEPRINT',
  'THE_BUILD_LOOP',
  'LAUNCH_LEARN'
]);

// ============================================
// REQUEST SCHEMAS
// ============================================

export const VenturesListQuerySchema = z.object({
  status: VentureStatusSchema.optional(),
  portfolio_id: UUIDSchema.optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0)
});

export const CreateVentureSchema = z.object({
  name: z.string().min(1).max(200),
  problem_statement: z.string().min(10).max(2000),
  portfolio_id: UUIDSchema.optional(),
  origin_type: z.enum(['manual', 'competitor_clone', 'blueprint']).default('manual'),
  start_stage: z.union([z.literal(0), z.literal(1)]).default(0),
  inception_brief: z.object({
    entry_method: z.enum(['manual', 'competitor_clone', 'blueprint', 'import']),
    venture_vision: z.string().min(20).max(5000),
    initial_concept: z.string().min(20).max(5000),
    notes: z.string().max(5000).optional()
  }).optional(),
  token_budget_profile: TokenBudgetProfileSchema.default('standard'),
  initial_assumptions: z.array(z.object({
    category: z.enum(['market', 'competitor', 'product', 'timing', 'financial', 'technical']),
    key: z.string().min(1).max(100),
    text: z.string().min(1).max(500),
    confidence: z.number().min(0).max(1)
  })).optional()
});

export const PromoteVentureSchema = z.object({
  from_stage: z.literal(0),
  to_stage: z.literal(1),
  inception_brief_id: UUIDSchema,
  reason: z.string().max(2000).optional()
});

export const DecisionsListQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  urgency: z.enum(['high', 'medium', 'low']).optional(),
  venture_id: UUIDSchema.optional()
});

export const DecideRequestSchema = z.object({
  decision_id: UUIDSchema,
  decision: DecisionTypeSchema,
  notes: z.string().max(2000).optional(),
  override_reason: z.string().max(1000).optional()
}).refine(
  (data) => {
    // override_reason required if decision is 'override'
    if (data.decision === 'override' && !data.override_reason) {
      return false;
    }
    return true;
  },
  { message: 'override_reason is required when decision is override' }
);

export const DirectiveRequestSchema = z.object({
  command_text: z.string().min(5).max(2000),
  venture_id: UUIDSchema.optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal')
});

// ============================================
// TYPE EXPORTS
// ============================================

export type VenturesListQuery = z.infer<typeof VenturesListQuerySchema>;
export type CreateVentureInput = z.infer<typeof CreateVentureSchema>;
export type DecisionsListQuery = z.infer<typeof DecisionsListQuerySchema>;
export type DecideRequestInput = z.infer<typeof DecideRequestSchema>;
export type DirectiveRequestInput = z.infer<typeof DirectiveRequestSchema>;
```

---

## 4. Error Response Contract

All error responses follow this structure:

```typescript
interface ErrorResponse {
  error: string;           // Human-readable message
  code?: string;           // Machine-readable error code
  details?: unknown;       // Additional context
  validation_errors?: Array<{
    field: string;
    message: string;
  }>;
}
```

**Standard Error Codes:**
| HTTP Status | Code | Description |
|-------------|------|-------------|
| 400 | `VALIDATION_FAILED` | Request validation failed |
| 401 | `UNAUTHORIZED` | Authentication required |
| 403 | `FORBIDDEN` | Insufficient permissions |
| 404 | `NOT_FOUND` | Resource not found |
| 409 | `CONFLICT` | Resource state conflict |
| 422 | `UNPROCESSABLE` | Business rule violation |
| 500 | `INTERNAL_ERROR` | Server error |

---

## 5. Authentication Middleware

```typescript
// middleware/chairman-auth.ts
import { Request, Response, NextFunction } from 'express';
import { supabase } from '../lib/supabase-client';

export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
  };
  isChairman: boolean;
}

export async function requireChairmanAccess(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'UNAUTHORIZED'
    });
  }

  const token = authHeader.replace('Bearer ', '');

  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({
      error: 'Invalid or expired token',
      code: 'UNAUTHORIZED'
    });
  }

  // Check chairman status via chairman_interests table
  const { data: interests } = await supabase
    .from('chairman_interests')
    .select('id')
    .eq('user_id', user.id)
    .limit(1);

  (req as AuthenticatedRequest).user = {
    id: user.id,
    email: user.email || ''
  };
  (req as AuthenticatedRequest).isChairman = !!(interests && interests.length > 0);

  next();
}
```

---

## References

- Parent: [00_VISION_V2_CHAIRMAN_OS.md](../00_VISION_V2_CHAIRMAN_OS.md) Section 9.3
- Database Schema: [01-database-schema.md](./01-database-schema.md)
- UI Components: [03-ui-components.md](./03-ui-components.md)
