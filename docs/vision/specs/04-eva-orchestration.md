# EVA Orchestration Specification

**Vision v2 Chairman's OS - Chief of Staff Architecture**

> "EVA thinks so you don't have to."

---

## Table of Contents

1. [EVA Overview](#eva-overview)
2. [State Machine](#state-machine)
3. [Task Contract System](#task-contract-system)
4. [Crew Configurations](#crew-configurations)
5. [Event Contracts](#event-contracts)
6. [Morning Briefing Generation](#morning-briefing-generation)
7. [Decision Flow](#decision-flow)
8. [Token Budget Management](#token-budget-management)
9. [Feedback Loop Architecture](#feedback-loop-architecture)

---

## EVA Overview

### What is EVA?

EVA (Executive Venture Assistant) is the **Chief of Staff** layer between the Chairman and the crewAI workforce. EVA:

1. **Interprets** Chairman's natural language commands into structured task contracts
2. **Orchestrates** crew assignments for each venture stage
3. **Synthesizes** portfolio-wide data into actionable briefings
4. **Recommends** decisions at gate checkpoints
5. **Enforces** token budgets and workflow integrity

### EVA Operating Model (Production)

Vision v2 supports a **delegated hierarchy** (default) and a **legacy flat mode** (fallback).

- **Delegated Mode (default)**: EVA orchestrates *through Venture CEOs*.
  - **Chain**: Chairman → EVA → Venture CEO → VPs → Crews
  - EVA remains the **single user-facing interface** (briefing, decisions), while CEOs run venture execution.
- **Flat Mode (fallback)**: EVA dispatches directly to crews for early prototypes or special one-off work.

### EVA's Boundaries

```
┌─────────────────────────────────────────────────────────────────────┐
│  EVA CAN:                          │  EVA CANNOT:                   │
├────────────────────────────────────┼────────────────────────────────┤
│  • Advance auto-advance stages     │  • Pass hard gates alone       │
│  • Synthesize and summarize        │  • Override Chairman decisions │
│  • Make recommendations            │  • Exceed token budgets        │
│  • Delegate to CEOs / crews*       │  • Create ventures             │
│  • Flag anomalies                  │  • Kill ventures               │
└────────────────────────────────────┴────────────────────────────────┘
```

`*` In delegated mode, EVA delegates to the **Venture CEO**; CEOs/VPs delegate to crews.

### Architecture Position

```
           ┌─────────────┐
           │  Chairman   │  "Launch MonthEndAI into Stage 1"
           │   (Rick)    │
           └──────┬──────┘
                  │
         ┌────────▼────────┐
         │      EVA        │  Interprets → Routes → Monitors
         │  (Chief of Staff)│
         └────────┬────────┘
                  │
         ┌────────▼────────┐
         │   Venture CEO   │  Plans → Delegates → QA
         └────────┬────────┘
                  │
    ┌─────────────┼─────────────┐
    │             │             │
┌───▼───┐   ┌─────▼─────┐   ┌───▼───┐
│  VP   │   │    VP     │   │  VP   │
└───┬───┘   └─────┬─────┘   └───┬───┘
    │             │             │
    ▼             ▼             ▼
  Crews         Crews         Crews
```

---

## State Machine

### Venture State Machine

Each venture progresses through a deterministic state machine.

```
                    ┌──────────────────────┐
                    │      CREATED         │
                    │   (Stage 0, Idle)    │
                    └──────────┬───────────┘
                               │ chairman_approve (PROMOTE 0→1)
                               ▼
                    ┌──────────────────────┐
         ┌────────►│     IN_PROGRESS      │◄────────┐
         │         │  (Active execution)   │         │
         │         └──────────┬───────────┘         │
         │                    │                      │
         │    ┌───────────────┼───────────────┐     │
         │    │               │               │     │
         │    ▼               ▼               ▼     │
     ┌───────────┐    ┌───────────┐    ┌───────────┐
     │  PAUSED   │    │  PIVOTED  │    │  BLOCKED  │
     │ (Manual)  │    │(Strategy) │    │ (Needs)   │
     └─────┬─────┘    └─────┬─────┘    └─────┬─────┘
           │                │                │
           │ resume         │ restart        │ resolve
           └────────────────┴────────────────┘
                               │
                    ┌──────────┴───────────┐
                    │                      │
                    ▼                      ▼
         ┌──────────────────┐   ┌──────────────────┐
         │     KILLED       │   │    LAUNCHED      │
         │   (Terminal)     │   │    (Stage 25)    │
         └──────────────────┘   └──────────────────┘
```

#### Stage 0 Semantics (INCEPTION / Pre-Lifecycle)

Stage 0 is a **pre-lifecycle holding state** designed to reduce false starts and enforce clean governance.

- **No automatic advancement**: EVA MUST NOT advance Stage 0 into Stage 1 without explicit Chairman intent.
- **Primary artifact**: **Inception Brief** (structured, versioned; source-of-truth for Stage 0 readiness).
- **Promotion requirements**:
  - Promotion 0→1 MUST be **atomic** (single transactional operation) and **idempotent** (safe retries).
  - Promotion 0→1 MUST record an authoritative transition event and link the Inception Brief used to justify promotion.

##### Optional EVA Assistance at Stage 0 (Safe by Design)

These tools exist to help the Chairman decide whether to enter the 25-stage lifecycle. They MUST NOT mutate venture stage.

1. **Complexity / Tier Assessment (on-demand)**
   - Triggered explicitly by the Chairman (not continuously while typing).
   - Output: recommended tier, confidence, rationale, and suggested token budget profile.
   - Token policy: smallest viable budget; cache results per Inception Brief version.

2. **Inception Triage Crew (Simulation-safe)**
   - A bounded crew run that produces a **triage_report** artifact.
   - Output MUST use Four Buckets tagging (Facts / Assumptions / Simulations / Unknowns).
   - Must be safe to replay (idempotent artifact generation) and MUST NOT mutate venture stage.

##### Decision Flow for Stage 0 → Stage 1

EVA’s job is to translate Stage 0 readiness into a single clean decision for the Chairman:

- **Decision**: Promote to Stage 1 (enter lifecycle) vs keep in Stage 0 vs kill.

---

#### Autonomous Opportunity Discovery (Deal Flow) (Pre-Stage 0)

Stage 0 remains Chairman-authorized, but EVA MAY run an **autonomous deal flow loop** that generates **Opportunity Blueprints** for review.
This directly implements PRDs like `SD-BLUEPRINT-GEN-CORE-001` (CrewAI blueprint generation + board review + status tracking).

**Core idea:** automation generates candidates; the Chairman chooses when to instantiate a venture.

- **Allowed automation outputs**:
  - `opportunity_signals` (captured from sources)
  - `opportunity_blueprints` (AI-generated, structured scaffolds)
  - `blueprint_board_reviews` (7-member consensus review)
  - `blueprint_selection_signals` (learning loop: selected/rejected/dismissed)
- **Forbidden automation actions**:
  - Creating ventures automatically
  - Promoting Stage 0→1 automatically
  - Bypassing any gate decision

##### Deal Flow Triggers

1. **Manual generation**: Chairman triggers `POST /api/blueprints/generate` from the Chairman’s Office.
2. **Scheduled generation**: EVA runs a daily/weekly job (service_role) that:
   - refreshes `opportunity_signals` (source polling)
   - runs the Blueprint Generation Crew for new candidates
   - optionally runs the Board Review Crew for top candidates

##### Crew Definitions (Non-Stage Crews)

- **Blueprint Generation Crew (3 agents)**:
  - Strategist (Chairman interest alignment)
  - Market Analyst (market opportunity + pain points)
  - Technical Feasibility (capability fit + risk)

- **Board Review Crew (7 agents)**:
  - 7 distinct board personas
  - votes: APPROVE / REJECT / ABSTAIN
  - computes consensus + produces a summarized verdict

##### Configuration + Budget Rules

- **Config** (`BlueprintGenerationConfig`):
  - `creativity` and `risk_tolerance` in the range 0..1
  - optional `max_blueprints` + `focus_tags`
- **Budgets**:
  - Deal flow jobs MUST declare a token budget profile and enforce caps (see Token Budget Management section).
  - Scheduled deal flow should default to a conservative profile (e.g., `exploratory`) unless overridden by Chairman policy.

##### Status Tracking (UI)

- Every job writes:
  - a `blueprint_generation_jobs` row
  - append-only `blueprint_generation_events` for progress telemetry
- UI can poll `GET /api/blueprints/jobs/:id` or subscribe to streaming where supported.

---

#### Deal Flow Acceptance Criteria (PRD-Backed)

These acceptance criteria operationalize PRDs such as `PRD-SD-BLUEPRINT-GEN-CORE-001` and ensure the system actually reduces “Chairman must invent ideas” friction.

##### Safety (Non-Negotiable)

- Automation MUST NOT:
  - create ventures
  - promote Stage 0→1
  - bypass gates
- Only `service_role` executes generation/review jobs; the browser never holds service keys.

##### Performance / Latency

- Context aggregation latency: **< 2 seconds** (providers run in parallel).
- Standard blueprint generation latency: **< 30 seconds** end-to-end (job marked `completed`).
- Board review latency: **< 30 seconds** for 7-member voting (or returns a clear `failed` with error).

##### Status / Telemetry

- Every generation/review run MUST create:
  - `blueprint_generation_jobs` row
  - append-only `blueprint_generation_events` with monotonic timestamps
- UI must be able to render:
  - job state (queued/running/completed/failed)
  - progress percentage (0–100) when available
  - most recent agent/activity message

##### Quality / Usefulness

- Each generated blueprint MUST include:
  - a structured `scaffold` (problem, ICP, solution hypothesis, business model hypothesis)
  - `evidence` tagged with Four Buckets (facts/assumptions/simulations/unknowns)
- Board review output MUST include:
  - 7 votes with rationales
  - a verdict + consensus score

##### Budget Enforcement

- Deal flow runs MUST declare a token budget profile and enforce caps.
- Scheduled deal flow defaults to a conservative profile unless Chairman policy overrides it.
- **Evidence**: Inception Brief + (optional) triage_report + (optional) complexity assessment.
- **Execution**: If approved, EVA triggers the atomic promotion operation and verifies Stage 1 scaffolding exists.

### Stage State Machine

Within each venture, stages progress through:

```javascript
// Stage states
const StageState = {
  PENDING: 'pending',       // Not yet started
  QUEUED: 'queued',         // Crew assigned, waiting
  IN_PROGRESS: 'in_progress', // Crew executing
  REVIEW: 'review',         // Awaiting gate decision
  COMPLETED: 'completed',   // Passed, artifacts stored
  SKIPPED: 'skipped',       // Chairman override
};

// Transitions
const stageTransitions = {
  pending: ['queued', 'skipped'],
  queued: ['in_progress'],
  in_progress: ['review', 'in_progress'], // Can loop for revisions
  review: ['completed', 'in_progress'],   // May need rework
  completed: [], // Terminal
  skipped: [],   // Terminal
};
```

### Gate Type Behavior

```typescript
// lib/eva-gate-handler.ts

type GateType = 'auto_advance' | 'advisory_checkpoint' | 'hard_gate';

interface GateConfig {
  type: GateType;
  autoAdvanceOnPass: boolean;
  requiresChairmanApproval: boolean;
  canOverride: boolean;
}

const GATE_CONFIGS: Record<GateType, GateConfig> = {
  auto_advance: {
    type: 'auto_advance',
    autoAdvanceOnPass: true,
    requiresChairmanApproval: false,
    canOverride: true,
  },
  advisory_checkpoint: {
    type: 'advisory_checkpoint',
    autoAdvanceOnPass: false,
    requiresChairmanApproval: true, // Soft requirement
    canOverride: true,
  },
  hard_gate: {
    type: 'hard_gate',
    autoAdvanceOnPass: false,
    requiresChairmanApproval: true, // Hard requirement
    canOverride: false, // Chairman MUST decide
  },
};

async function handleStageCompletion(
  ventureId: string,
  stageNumber: number,
  result: StageResult
): Promise<StageTransitionResult> {
  const config = await getStageConfig(stageNumber);
  const gateConfig = GATE_CONFIGS[config.gate_type];

  if (result.passed && gateConfig.autoAdvanceOnPass) {
    // Auto-advance stages proceed automatically
    return advanceToNextStage(ventureId, stageNumber);
  }

  if (gateConfig.requiresChairmanApproval) {
    // Create decision request for Chairman
    return createChairmanDecision(ventureId, stageNumber, result);
  }

  // Manual handling required
  return { status: 'awaiting_review', ventureId, stageNumber };
}
```

---

## Task Contract System

### Contract Schema

Task contracts are the communication protocol between EVA and crewAI.

```sql
-- Already defined in 01-database-schema.md
-- agent_task_contracts table

-- Key fields:
-- parent_agent: 'EVA' (always for venture work)
-- target_agent: 'CREWAI_MARKET_VALIDATION', etc.
-- constraints: JSONB with venture_id, stage, token budget
-- status: pending → claimed → in_progress → completed
```

### EVA Dispatch Function

```typescript
// lib/eva-dispatcher.ts

interface DispatchConfig {
  ventureId: string;
  stageNumber: number;
  crewType: CrewType;
  context: {
    sdId?: string;
    previousArtifacts?: string[];
    assumptions?: Assumption[];
    urgency?: 'high' | 'normal' | 'low';
  };
}

async function dispatchToCrew(config: DispatchConfig): Promise<TaskContract> {
  const { ventureId, stageNumber, crewType, context } = config;

  // Get token budget for this stage
  const tokenBudget = STAGE_TOKEN_BUDGETS[stageNumber];
  const requiredOutputs = STAGE_REQUIRED_ARTIFACTS[stageNumber];

  // Create the contract via RPC
  const { data: contract, error } = await supabase.rpc('create_task_contract', {
    p_parent_agent: 'EVA',
    p_target_agent: `CREWAI_${crewType.toUpperCase()}`,
    p_sd_id: context.sdId || null,
    p_objective: `Execute ${crewType} work for Stage ${stageNumber}`,
    p_constraints: {
      venture_id: ventureId,
      stage_number: stageNumber,
      max_tokens: tokenBudget,
      timeout_minutes: 30,
      required_outputs: requiredOutputs,
      assumptions_to_test: context.assumptions?.map(a => a.id) || [],
    },
    p_input_artifacts: context.previousArtifacts || [],
    p_expected_output_type: 'artifact',
    p_priority: context.urgency === 'high' ? 90 : 50,
    p_max_tokens: tokenBudget,
  });

  if (error) {
    throw new EVADispatchError(`Failed to dispatch to ${crewType}: ${error.message}`);
  }

  // Log EVA action for audit trail
  await logEVAAction('DISPATCH', {
    contract_id: contract.id,
    venture_id: ventureId,
    stage: stageNumber,
    crew_type: crewType,
    token_budget: tokenBudget,
  });

  // Update venture stage status
  await supabase
    .from('venture_stage_assignments')
    .update({
      status: 'queued',
      crew_assigned: crewType,
      contract_id: contract.id,
    })
    .eq('venture_id', ventureId)
    .eq('stage_number', stageNumber);

  return contract;
}
```

### Contract Lifecycle

```typescript
// Contract state transitions

enum ContractStatus {
  PENDING = 'pending',     // Created by EVA, waiting for crew
  CLAIMED = 'claimed',     // Crew has picked it up
  IN_PROGRESS = 'in_progress', // Crew is executing
  COMPLETED = 'completed', // Success, artifacts ready
  FAILED = 'failed',       // Crew couldn't complete
  TIMEOUT = 'timeout',     // Exceeded time limit
  CANCELLED = 'cancelled', // EVA or Chairman cancelled
}

// crewAI claim process
async function claimContract(crewId: string, targetAgent: string): Promise<TaskContract | null> {
  const { data, error } = await supabase.rpc('claim_task_contract', {
    p_crew_id: crewId,
    p_target_agent_pattern: targetAgent,
  });

  return data;
}

// crewAI completion
async function completeContract(
  contractId: string,
  result: CrewResult
): Promise<void> {
  // Store artifact
  const { data: artifact } = await supabase
    .from('venture_artifacts')
    .insert({
      venture_id: result.ventureId,
      stage_number: result.stageNumber,
      artifact_type: result.artifactType,
      content: result.content,
      summary: result.summary,
    })
    .select()
    .single();

  // Update contract
  await supabase
    .from('agent_task_contracts')
    .update({
      status: 'completed',
      output_artifact_id: artifact.id,
      result_summary: result.summary,
      tokens_used: result.tokensUsed,
      completed_at: new Date().toISOString(),
    })
    .eq('id', contractId);

  // Log token usage
  await supabase.from('venture_token_ledger').insert({
    venture_id: result.ventureId,
    stage_number: result.stageNumber,
    agent_type: result.crewType,
    tokens_input: result.tokensInput,
    tokens_output: result.tokensOutput,
    cost_usd: calculateCost(result.tokensInput, result.tokensOutput),
  });

  // Trigger EVA to check gate
  await triggerGateCheck(result.ventureId, result.stageNumber);
}
```

---

## Crew Configurations

### Crew Type Registry

```typescript
// lib/crew-registry.ts

interface CrewConfig {
  id: string;
  name: string;
  stages: number[];           // Which stages this crew handles
  defaultTokenBudget: number;
  timeout: number;            // Minutes
  requiredCapabilities: string[];
  outputTypes: string[];
}

export const CREW_REGISTRY: Record<string, CrewConfig> = {
  IDEA_STRUCTURING: {
    id: 'IDEA_STRUCTURING',
    name: 'Idea Structuring Crew',
    stages: [1, 2],
    defaultTokenBudget: 8000,
    timeout: 15,
    requiredCapabilities: ['ideation', 'critique', 'structuring'],
    outputTypes: ['idea_canvas', 'problem_statement'],
  },

  MARKET_VALIDATION: {
    id: 'MARKET_VALIDATION',
    name: 'Market Validation Crew',
    stages: [3],
    defaultTokenBudget: 25000,
    timeout: 30,
    requiredCapabilities: ['market_research', 'competitor_analysis', 'tam_estimation'],
    outputTypes: ['market_report', 'competitor_matrix', 'tam_analysis'],
  },

  COMPETITIVE_INTEL: {
    id: 'COMPETITIVE_INTEL',
    name: 'Competitive Intelligence Crew',
    stages: [4],
    defaultTokenBudget: 20000,
    timeout: 25,
    requiredCapabilities: ['competitor_tracking', 'feature_comparison', 'moat_analysis'],
    outputTypes: ['competitive_landscape', 'feature_matrix'],
  },

  FINANCIAL_MODELING: {
    id: 'FINANCIAL_MODELING',
    name: 'Financial Modeling Crew',
    stages: [5],
    defaultTokenBudget: 15000,
    timeout: 20,
    requiredCapabilities: ['unit_economics', 'financial_projection', 'sensitivity_analysis'],
    outputTypes: ['unit_economics_model', 'profitability_forecast'],
  },

  RISK_ASSESSMENT: {
    id: 'RISK_ASSESSMENT',
    name: 'Risk Assessment Crew',
    stages: [6],
    defaultTokenBudget: 12000,
    timeout: 15,
    requiredCapabilities: ['risk_identification', 'mitigation_planning', 'probability_assessment'],
    outputTypes: ['risk_matrix', 'mitigation_plan'],
  },

  PRICING_STRATEGY: {
    id: 'PRICING_STRATEGY',
    name: 'Pricing Strategy Crew',
    stages: [7],
    defaultTokenBudget: 10000,
    timeout: 15,
    requiredCapabilities: ['pricing_models', 'value_analysis', 'competitive_pricing'],
    outputTypes: ['pricing_model', 'price_sensitivity_analysis'],
  },

  BUSINESS_MODEL: {
    id: 'BUSINESS_MODEL',
    name: 'Business Model Crew',
    stages: [8],
    defaultTokenBudget: 12000,
    timeout: 15,
    requiredCapabilities: ['bmc_generation', 'value_proposition', 'channel_strategy'],
    outputTypes: ['business_model_canvas', 'value_prop_canvas'],
  },

  EXIT_STRATEGY: {
    id: 'EXIT_STRATEGY',
    name: 'Exit Strategy Crew',
    stages: [9],
    defaultTokenBudget: 8000,
    timeout: 15,
    requiredCapabilities: ['exit_planning', 'valuation_models', 'acquirer_mapping'],
    outputTypes: ['exit_strategy_brief', 'potential_acquirers'],
  },

  BRAND_NAMING: {
    id: 'BRAND_NAMING',
    name: 'Brand & Naming Crew',
    stages: [10],
    defaultTokenBudget: 15000,
    timeout: 20,
    requiredCapabilities: ['name_generation', 'domain_checking', 'trademark_research'],
    outputTypes: ['naming_tournament_results', 'brand_guidelines'],
  },

  GTM_STRATEGY: {
    id: 'GTM_STRATEGY',
    name: 'Go-to-Market Strategy Crew',
    stages: [11],
    defaultTokenBudget: 20000,
    timeout: 25,
    requiredCapabilities: ['gtm_planning', 'channel_strategy', 'launch_planning'],
    outputTypes: ['gtm_strategy', 'launch_plan'],
  },

  SALES_PLAYBOOK: {
    id: 'SALES_PLAYBOOK',
    name: 'Sales & Success Playbook Crew',
    stages: [12],
    defaultTokenBudget: 15000,
    timeout: 20,
    requiredCapabilities: ['sales_process', 'objection_handling', 'success_metrics'],
    outputTypes: ['sales_playbook', 'success_playbook'],
  },

  TECHNICAL_SPEC: {
    id: 'TECHNICAL_SPEC',
    name: 'Technical Specification Crew',
    stages: [13, 14, 15, 16],
    defaultTokenBudget: 30000,
    timeout: 45,
    requiredCapabilities: ['system_architecture', 'api_design', 'database_design', 'ui_wireframing'],
    outputTypes: ['system_architecture', 'api_spec', 'database_schema', 'wireframes', 'user_stories'],
  },

  IMPLEMENTATION: {
    id: 'IMPLEMENTATION',
    name: 'Implementation Crew',
    stages: [17, 18, 19, 20],
    defaultTokenBudget: 50000,
    timeout: 60,
    requiredCapabilities: ['code_generation', 'testing', 'integration', 'security_review'],
    outputTypes: ['source_code', 'test_suites', 'security_report'],
  },

  QA_TESTING: {
    id: 'QA_TESTING',
    name: 'QA & Testing Crew',
    stages: [21],
    defaultTokenBudget: 20000,
    timeout: 30,
    requiredCapabilities: ['uat_execution', 'bug_tracking', 'feedback_collection'],
    outputTypes: ['uat_report', 'bug_list', 'user_feedback'],
  },

  DEPLOYMENT: {
    id: 'DEPLOYMENT',
    name: 'Deployment & Operations Crew',
    stages: [22, 23, 24, 25],
    defaultTokenBudget: 25000,
    timeout: 30,
    requiredCapabilities: ['deployment', 'monitoring', 'analytics', 'optimization'],
    outputTypes: ['deployment_manifest', 'analytics_dashboard', 'optimization_report'],
  },

  // === NEW CREWS (OpenAI Codex Assessment - December 2025) ===

  CUSTOMER_DISCOVERY: {
    id: 'CUSTOMER_DISCOVERY',
    name: 'Customer Discovery Crew',
    stages: [3],  // Works alongside MARKET_VALIDATION
    defaultTokenBudget: 20000,
    timeout: 30,
    requiredCapabilities: [
      'user_interviews',
      'wtp_evidence_collection',
      'design_partner_recruitment',
      'insight_synthesis'
    ],
    outputTypes: [
      'interview_transcript_bundle',
      'insight_synthesis_report',
      'wtp_evidence_rubric',
      'design_partner_pipeline'
    ],
    coExecutesWith: 'MARKET_VALIDATION',  // Can run in parallel
  },

  CUSTOMER_SUCCESS: {
    id: 'CUSTOMER_SUCCESS',
    name: 'Customer Success Crew',
    stages: [12],  // Works alongside SALES_PLAYBOOK
    defaultTokenBudget: 15000,
    timeout: 20,
    requiredCapabilities: [
      'onboarding_design',
      'retention_strategy',
      'churn_prevention',
      'nps_management',
      'support_model_design'
    ],
    outputTypes: [
      'onboarding_playbook',
      'retention_playbook',
      'churn_response_playbook',
      'support_model_spec'
    ],
    coExecutesWith: 'SALES_PLAYBOOK',
  },

  GROWTH_ENGINEERING: {
    id: 'GROWTH_ENGINEERING',
    name: 'Growth Engineering Crew',
    stages: [25],  // Works alongside DEPLOYMENT for optimization
    defaultTokenBudget: 20000,
    timeout: 25,
    requiredCapabilities: [
      'experimentation_design',
      'funnel_optimization',
      'ab_testing',
      'performance_tuning',
      'growth_metrics'
    ],
    outputTypes: [
      'experiment_backlog',
      'funnel_analysis',
      'optimization_roadmap',
      'growth_metrics_dashboard'
    ],
    coExecutesWith: 'DEPLOYMENT',
  },

  SECURITY_AUDITOR: {
    id: 'SECURITY_AUDITOR',
    name: 'Security Auditor Crew',
    stages: [20],  // Works alongside IMPLEMENTATION for security
    defaultTokenBudget: 25000,
    timeout: 35,
    requiredCapabilities: [
      'threat_modeling',
      'privacy_assessment',
      'penetration_testing',
      'compliance_review',
      'secrets_management'
    ],
    outputTypes: [
      'threat_model',
      'data_classification_report',
      'pii_handling_procedures',
      'secrets_management_plan',
      'abuse_case_analysis',
      'security_audit_report'
    ],
    coExecutesWith: 'IMPLEMENTATION',
    hasVetoPower: true,  // Can block Stage 20 completion
  },

  TRADEMARK_CHECK: {
    id: 'TRADEMARK_CHECK',
    name: 'Trademark Check Crew',
    stages: [10],  // Works alongside BRAND_NAMING
    defaultTokenBudget: 8000,
    timeout: 15,
    requiredCapabilities: [
      'trademark_search',
      'domain_availability',
      'legal_risk_assessment'
    ],
    outputTypes: [
      'trademark_risk_report',
      'domain_availability_matrix',
      'legal_clearance_memo'
    ],
    coExecutesWith: 'BRAND_NAMING',
  },
};

// Get crew for a specific stage
export function getCrewForStage(stageNumber: number): CrewConfig | undefined {
  return Object.values(CREW_REGISTRY).find(crew =>
    crew.stages.includes(stageNumber)
  );
}
```

### Stage-to-Crew Mapping

```typescript
// Quick lookup table - Primary crews
export const STAGE_CREW_MAP: Record<number, string> = {
  1: 'IDEA_STRUCTURING',
  2: 'IDEA_STRUCTURING',
  3: 'MARKET_VALIDATION',      // + CUSTOMER_DISCOVERY (parallel)
  4: 'COMPETITIVE_INTEL',
  5: 'FINANCIAL_MODELING',
  6: 'RISK_ASSESSMENT',
  7: 'PRICING_STRATEGY',
  8: 'BUSINESS_MODEL',
  9: 'EXIT_STRATEGY',
  10: 'BRAND_NAMING',          // + TRADEMARK_CHECK (parallel)
  11: 'GTM_STRATEGY',
  12: 'SALES_PLAYBOOK',        // + CUSTOMER_SUCCESS (parallel)
  13: 'TECHNICAL_SPEC',
  14: 'TECHNICAL_SPEC',
  15: 'TECHNICAL_SPEC',
  16: 'TECHNICAL_SPEC',
  17: 'IMPLEMENTATION',
  18: 'IMPLEMENTATION',
  19: 'IMPLEMENTATION',
  20: 'IMPLEMENTATION',             // + SECURITY_AUDITOR (parallel, has veto)
  21: 'QA_TESTING',
  22: 'DEPLOYMENT',
  23: 'DEPLOYMENT',
  24: 'DEPLOYMENT',
  25: 'DEPLOYMENT',                 // + GROWTH_ENGINEERING (parallel)
};

// Co-execution map - crews that run in parallel at the same stage
export const STAGE_CO_EXECUTION_MAP: Record<number, string[]> = {
  3: ['MARKET_VALIDATION', 'CUSTOMER_DISCOVERY'],
  10: ['BRAND_NAMING', 'TRADEMARK_CHECK'],
  12: ['SALES_PLAYBOOK', 'CUSTOMER_SUCCESS'],
  20: ['IMPLEMENTATION', 'SECURITY_AUDITOR'],
  25: ['DEPLOYMENT', 'GROWTH_ENGINEERING'],
};

// Get all crews for a stage (primary + co-executors)
export function getAllCrewsForStage(stageNumber: number): string[] {
  const coExec = STAGE_CO_EXECUTION_MAP[stageNumber];
  if (coExec) {
    return coExec;
  }
  const primary = STAGE_CREW_MAP[stageNumber];
  return primary ? [primary] : [];
}
```

---

## Event Contracts

### EVA Event Types

```typescript
// lib/eva-events.ts

type EVAEventType =
  | 'VENTURE_CREATED'
  | 'STAGE_STARTED'
  | 'STAGE_COMPLETED'
  | 'GATE_REACHED'
  | 'DECISION_REQUIRED'
  | 'DECISION_MADE'
  | 'ASSUMPTION_VALIDATED'
  | 'ASSUMPTION_INVALIDATED'
  | 'TOKEN_BUDGET_WARNING'
  | 'TOKEN_BUDGET_EXCEEDED'
  | 'CREW_TIMEOUT'
  | 'VENTURE_PAUSED'
  | 'VENTURE_KILLED'
  | 'VENTURE_LAUNCHED';

interface EVAEvent {
  id: string;
  type: EVAEventType;
  timestamp: string;
  ventureId: string;
  stageNumber?: number;
  payload: Record<string, unknown>;
  processed: boolean;
}
```

### Event Handler Registry

```typescript
// lib/eva-event-handlers.ts

const eventHandlers: Record<EVAEventType, EventHandler> = {
  STAGE_COMPLETED: async (event) => {
    const { ventureId, stageNumber, payload } = event;

    // Check gate type
    const stageConfig = await getStageConfig(stageNumber);

    if (stageConfig.gate_type === 'auto_advance') {
      // Automatically advance
      await advanceToNextStage(ventureId, stageNumber);
    } else {
      // Create decision for Chairman
      await createChairmanDecision(ventureId, stageNumber, payload);
      await emitEvent('DECISION_REQUIRED', { ventureId, stageNumber });
    }
  },

  TOKEN_BUDGET_WARNING: async (event) => {
    const { ventureId, stageNumber, payload } = event;

    // Add to Chairman's alerts
    await createAlert({
      type: 'token_budget_warning',
      ventureId,
      message: `Token budget at ${payload.percentUsed}% for Stage ${stageNumber}`,
      severity: payload.percentUsed > 90 ? 'critical' : 'warning',
    });
  },

  ASSUMPTION_INVALIDATED: async (event) => {
    const { ventureId, payload } = event;

    // Critical assumption failure may require pause
    if (payload.isCritical) {
      await createChairmanDecision(ventureId, event.stageNumber, {
        type: 'critical_assumption_failed',
        assumption: payload.assumption,
        evidence: payload.evidence,
        recommendation: 'pivot_or_kill',
      });
    }

    // Always alert Chairman
    await createAlert({
      type: 'assumption_invalidated',
      ventureId,
      message: payload.assumption.text,
      severity: payload.isCritical ? 'critical' : 'warning',
    });
  },

  DECISION_MADE: async (event) => {
    const { ventureId, stageNumber, payload } = event;
    const { decision } = payload;

    switch (decision) {
      case 'proceed':
        await advanceToNextStage(ventureId, stageNumber);
        break;
      case 'pivot':
        await initiatePivot(ventureId, payload.pivotDetails);
        break;
      case 'fix':
        await requestRework(ventureId, stageNumber, payload.fixInstructions);
        break;
      case 'pause':
        await pauseVenture(ventureId, payload.reason);
        break;
      case 'kill':
        await killVenture(ventureId, payload.reason);
        break;
    }
  },

  // ... other handlers
};
```

---

## Morning Briefing Generation

### Briefing Aggregation Pipeline

```typescript
// lib/eva-briefing.ts

interface BriefingInput {
  userId: string;
  timezone: string;
}

async function generateMorningBriefing(input: BriefingInput): Promise<ChairmanBriefing> {
  // Run all aggregation queries in parallel
  const [
    portfolioHealth,
    pendingDecisions,
    alerts,
    recentCompletions,
    tokenSummary,
    opportunityInbox,
  ] = await Promise.all([
    getPortfolioHealth(),
    getPendingDecisions(),
    getActiveAlerts(),
    getRecentCompletions(7), // Last 7 days
    getTokenSummary(),
    getOpportunityInboxSummary(),
  ]);

  // Calculate global health score
  const globalHealthScore = calculateGlobalHealth(portfolioHealth, alerts);

  // Generate personalized greeting
  const greeting = generateGreeting(input.timezone, pendingDecisions.length);

  return {
    greeting,
    generated_at: new Date().toISOString(),
    global_health_score: globalHealthScore,
    portfolio_health: portfolioHealth,
    decision_stack: pendingDecisions.slice(0, 10), // Top 10
    decision_count: pendingDecisions.length,
    alerts: alerts.filter(a => a.severity !== 'info'),
    recent_completions: recentCompletions.slice(0, 5),
    token_summary: tokenSummary,
    opportunity_inbox: opportunityInbox,
  };
}

function generateGreeting(timezone: string, pendingCount: number): string {
  const hour = new Date().toLocaleString('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false
  });
  const hourNum = parseInt(hour);

  let timeGreeting: string;
  if (hourNum < 12) timeGreeting = 'Good morning';
  else if (hourNum < 17) timeGreeting = 'Good afternoon';
  else timeGreeting = 'Good evening';

  if (pendingCount === 0) {
    return `${timeGreeting}, Rick. All systems green.`;
  } else if (pendingCount <= 3) {
    return `${timeGreeting}, Rick. ${pendingCount} decisions await your attention.`;
  } else {
    return `${timeGreeting}, Rick. Your desk has ${pendingCount} items requiring decisions.`;
  }
}

function calculateGlobalHealth(
  portfolio: PortfolioHealth,
  alerts: Alert[]
): number {
  let score = 100;

  // Deduct for critical alerts
  const criticalAlerts = alerts.filter(a => a.severity === 'critical').length;
  score -= criticalAlerts * 15;

  // Deduct for warnings
  const warnings = alerts.filter(a => a.severity === 'warning').length;
  score -= warnings * 5;

  // Deduct for killed ventures this month
  score -= portfolio.killed_this_month * 10;

  // Bonus for launches
  score += portfolio.launched_this_month * 5;

  return Math.max(0, Math.min(100, score));
}
```

### Briefing Database Function

```sql
-- This is already in 01-database-schema.md as fn_chairman_briefing()
-- Here's the complete implementation:

CREATE OR REPLACE FUNCTION fn_chairman_briefing()
RETURNS JSONB AS $$
DECLARE
  result JSONB;
  portfolio_health JSONB;
  decision_stack JSONB;
  alerts_json JSONB;
  token_summary JSONB;
BEGIN
  -- Portfolio health
  SELECT jsonb_build_object(
    'total_ventures', COUNT(*),
    'active', COUNT(*) FILTER (WHERE status = 'active'),
    'paused', COUNT(*) FILTER (WHERE status = 'paused'),
    'killed_this_month', COUNT(*) FILTER (
      WHERE status = 'killed'
      AND updated_at > DATE_TRUNC('month', NOW())
    ),
    'launched_this_month', COUNT(*) FILTER (
      WHERE current_stage >= 23
      AND updated_at > DATE_TRUNC('month', NOW())
    ),
    'by_phase', (
      SELECT jsonb_agg(phase_data)
      FROM (
        SELECT
          CASE
            WHEN current_stage <= 5 THEN 'THE_TRUTH'
            WHEN current_stage <= 9 THEN 'THE_ENGINE'
            WHEN current_stage <= 12 THEN 'THE_IDENTITY'
            WHEN current_stage <= 16 THEN 'THE_BLUEPRINT'
            WHEN current_stage <= 20 THEN 'THE_BUILD_LOOP'
            ELSE 'LAUNCH_LEARN'
          END as phase,
          COUNT(*) as count
        FROM ventures WHERE status = 'active'
        GROUP BY 1
      ) phase_data
    )
  )
  INTO portfolio_health
  FROM ventures;

  -- Pending decisions
  SELECT COALESCE(jsonb_agg(d ORDER BY d.created_at ASC), '[]'::jsonb)
  INTO decision_stack
  FROM (
    SELECT
      cd.id,
      cd.venture_id,
      v.name as venture_name,
      cd.stage_number as stage,
      lsc.stage_name,
      cd.recommendation,
      cd.summary,
      cd.evidence_summary,
      cd.urgency,
      cd.created_at
    FROM chairman_decisions cd
    JOIN ventures v ON v.id = cd.venture_id
    JOIN lifecycle_stage_config lsc ON lsc.stage_number = cd.stage_number
    WHERE cd.decision IS NULL
    LIMIT 10
  ) d;

  -- Active alerts
  SELECT COALESCE(jsonb_agg(a ORDER BY
    CASE a.severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
    a.created_at DESC
  ), '[]'::jsonb)
  INTO alerts_json
  FROM (
    SELECT
      type, venture_id, message, severity, created_at
    FROM chairman_alerts
    WHERE dismissed = false
    AND created_at > NOW() - INTERVAL '7 days'
    LIMIT 20
  ) a;

  -- Token summary
  SELECT jsonb_build_object(
    'total_spent_this_week', COALESCE(SUM(tokens_input + tokens_output) FILTER (
      WHERE created_at > NOW() - INTERVAL '7 days'
    ), 0),
    'total_spent_this_month', COALESCE(SUM(tokens_input + tokens_output) FILTER (
      WHERE created_at > DATE_TRUNC('month', NOW())
    ), 0),
    'cost_usd_this_month', ROUND(COALESCE(SUM(cost_usd) FILTER (
      WHERE created_at > DATE_TRUNC('month', NOW())
    ), 0)::numeric, 2),
    'avg_cost_per_venture', ROUND((
      COALESCE(SUM(cost_usd) FILTER (
        WHERE created_at > DATE_TRUNC('month', NOW())
      ), 0) / NULLIF((SELECT COUNT(*) FROM ventures WHERE status = 'active'), 0)
    )::numeric, 2)
  )
  INTO token_summary
  FROM venture_token_ledger;

  -- Assemble result
  SELECT jsonb_build_object(
    'greeting', 'Good morning, Rick.',
    'generated_at', NOW(),
    'global_health_score', GREATEST(0, LEAST(100,
      100
      - (SELECT COUNT(*) * 15 FROM chairman_alerts WHERE severity = 'critical' AND dismissed = false)
      - (SELECT COUNT(*) * 5 FROM chairman_alerts WHERE severity = 'warning' AND dismissed = false)
    )),
    'portfolio_health', portfolio_health,
    'decision_stack', decision_stack,
    'decision_count', jsonb_array_length(decision_stack),
    'alerts', alerts_json,
    'token_summary', token_summary,

    -- Opportunity Inbox (Deal Flow)
    -- Note: `new_since_last_briefing` uses a time window fallback (last 24h). If/when we persist
    -- last briefing time per user, replace this with a true "since last briefing" boundary.
    'opportunity_inbox', (
      SELECT jsonb_build_object(
        'total_approved', COALESCE((
          SELECT COUNT(*) FROM opportunity_blueprints
          WHERE status = 'approved'
        ), 0),
        'new_since_last_briefing', COALESCE((
          SELECT COUNT(*) FROM opportunity_blueprints
          WHERE status = 'approved'
            AND updated_at > NOW() - INTERVAL '24 hours'
        ), 0),
        'pending_reviews', COALESCE((
          SELECT COUNT(*) FROM opportunity_blueprints
          WHERE status IN ('draft', 'reviewed')
        ), 0),
        'top_blueprints', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', b.id,
              'title', b.title,
              'summary', b.summary,
              'status', b.status,
              'created_at', b.created_at,
              'updated_at', b.updated_at
            )
            ORDER BY b.updated_at DESC
          )
          FROM (
            SELECT id, title, summary, status, created_at, updated_at
            FROM opportunity_blueprints
            WHERE status = 'approved'
            ORDER BY updated_at DESC
            LIMIT 5
          ) b
        ), '[]'::jsonb),
        'latest_job', (
          SELECT jsonb_build_object(
            'id', j.id,
            'mode', j.mode,
            'status', j.status,
            'created_at', j.created_at,
            'started_at', j.started_at,
            'completed_at', j.completed_at,
            'error', j.error
          )
          FROM blueprint_generation_jobs j
          ORDER BY j.created_at DESC
          LIMIT 1
        )
      )
    )
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## Decision Flow

### Decision Creation

When a stage reaches a gate requiring Chairman approval:

```typescript
// lib/eva-decisions.ts

interface DecisionRequest {
  ventureId: string;
  stageNumber: number;
  gateType: GateType;
  crewResult: CrewResult;
}

async function createChairmanDecision(req: DecisionRequest): Promise<string> {
  const { ventureId, stageNumber, crewResult } = req;

  // Get venture context
  const venture = await getVenture(ventureId);
  const stageConfig = await getStageConfig(stageNumber);

  // Analyze result and generate recommendation
  const analysis = await analyzeForDecision(venture, stageNumber, crewResult);

  // Determine urgency
  const urgency = determineUrgency(stageNumber, analysis);

  // Create decision record
  const { data: decision, error } = await supabase
    .from('chairman_decisions')
    .insert({
      venture_id: ventureId,
      stage_number: stageNumber,
      gate_type: stageConfig.gate_type,
      status: 'pending',
      recommendation: analysis.recommendation,
      recommendation_confidence: analysis.confidence,
      summary: analysis.summary,
      evidence_summary: analysis.evidenceSummary,
      evidence: {
        facts: analysis.facts,
        assumptions: analysis.assumptions,
        simulations: analysis.simulations,
        unknowns: analysis.unknowns,
      },
      urgency,
      options: ['proceed', 'pivot', 'fix', 'kill', 'pause'],
    })
    .select()
    .single();

  // Emit event
  await emitEvent('DECISION_REQUIRED', {
    ventureId,
    stageNumber,
    decisionId: decision.id,
  });

  return decision.id;
}

function determineUrgency(stageNumber: number, analysis: Analysis): 'high' | 'medium' | 'low' {
  // Hard gates are always high urgency
  if (analysis.gateType === 'hard_gate') return 'high';

  // Advisory checkpoints at critical stages
  if ([3, 5, 16].includes(stageNumber)) return 'high';

  // Low confidence recommendations need attention
  if (analysis.confidence < 0.6) return 'medium';

  // Critical assumption at risk
  if (analysis.assumptions.some(a => a.risk === 'high')) return 'high';

  return 'low';
}
```

### Decision Processing

```typescript
// lib/eva-decision-processor.ts

interface DecisionInput {
  decisionId: string;
  decision: DecisionChoice;
  notes?: string;
  overrideReason?: string;
}

async function processDecision(input: DecisionInput): Promise<DecisionResult> {
  const { decisionId, decision, notes, overrideReason } = input;

  // Get the decision record
  const decisionRecord = await getDecision(decisionId);

  // Validate override if needed
  if (decision !== decisionRecord.recommendation && !overrideReason) {
    throw new Error('Override reason required when decision differs from recommendation');
  }

  // Update decision record
  await supabase
    .from('chairman_decisions')
    .update({
      decision,
      decision_notes: notes,
      override_reason: overrideReason,
      decided_at: new Date().toISOString(),
      status: 'decided',
    })
    .eq('id', decisionId);

  // Emit event for downstream processing
  await emitEvent('DECISION_MADE', {
    ventureId: decisionRecord.venture_id,
    stageNumber: decisionRecord.stage_number,
    decision,
    decisionId,
  });

  // Return next stage info
  const nextStage = decision === 'proceed'
    ? decisionRecord.stage_number + 1
    : null;

  return {
    success: true,
    decisionId,
    ventureId: decisionRecord.venture_id,
    nextStage,
    message: generateDecisionMessage(decision, decisionRecord),
  };
}
```

---

## Token Budget Management

### Budget Profiles

```typescript
// lib/token-budgets.ts

export const TOKEN_BUDGET_PROFILES = {
  exploratory: {
    id: 'exploratory',
    name: 'Exploratory (Lite)',
    totalBudget: 250000,
    description: 'Quick validation with minimal depth',
    phaseAllocations: {
      THE_TRUTH: 0.40,      // 100k - Focus here
      THE_ENGINE: 0.15,     // 37.5k
      THE_IDENTITY: 0.10,   // 25k
      THE_BLUEPRINT: 0.15,  // 37.5k
      THE_BUILD_LOOP: 0.15, // 37.5k
      LAUNCH_LEARN: 0.05,   // 12.5k
    },
  },

  standard: {
    id: 'standard',
    name: 'Standard',
    totalBudget: 500000,
    description: 'Balanced depth across all phases',
    phaseAllocations: {
      THE_TRUTH: 0.25,      // 125k
      THE_ENGINE: 0.15,     // 75k
      THE_IDENTITY: 0.10,   // 50k
      THE_BLUEPRINT: 0.15,  // 75k
      THE_BUILD_LOOP: 0.25, // 125k
      LAUNCH_LEARN: 0.10,   // 50k
    },
  },

  deep_diligence: {
    id: 'deep_diligence',
    name: 'Deep Diligence',
    totalBudget: 1000000,
    description: 'Maximum depth for high-conviction bets',
    phaseAllocations: {
      THE_TRUTH: 0.30,      // 300k - Extra validation
      THE_ENGINE: 0.15,     // 150k
      THE_IDENTITY: 0.10,   // 100k
      THE_BLUEPRINT: 0.15,  // 150k
      THE_BUILD_LOOP: 0.20, // 200k
      LAUNCH_LEARN: 0.10,   // 100k
    },
  },
};

// Per-stage budgets (standard profile example)
export const STAGE_TOKEN_BUDGETS: Record<number, number> = {
  1: 8000,    // Draft Idea
  2: 12000,   // Problem-Solution Fit
  3: 35000,   // Deep-Dive Market Validation
  4: 25000,   // Competitive Landscape
  5: 20000,   // Profitability Forecasting
  6: 15000,   // Risk Evaluation
  7: 12000,   // Pricing Strategy
  8: 15000,   // Business Model Canvas
  9: 10000,   // Exit Strategy
  10: 18000,  // Naming Tournament
  11: 22000,  // Go-to-Market
  12: 15000,  // Sales Playbook
  13: 25000,  // System Architecture
  14: 20000,  // User Stories
  15: 20000,  // Wireframes
  16: 35000,  // Schema & Endpoints
  17: 40000,  // Code Generation
  18: 35000,  // QA Cycles
  19: 30000,  // Integration
  20: 25000,  // Security Review
  21: 25000,  // Soft Launch
  22: 15000,  // Analytics
  23: 12000,  // Marketing
  24: 18000,  // Optimization
  25: 8000,   // Scale-Up Decision
};
```

### Budget Enforcement

```typescript
// lib/eva-budget-guard.ts

interface BudgetCheckResult {
  allowed: boolean;
  remaining: number;
  percentUsed: number;
  warning?: string;
}

async function checkTokenBudget(
  ventureId: string,
  stageNumber: number,
  requestedTokens: number
): Promise<BudgetCheckResult> {
  // Get venture's budget profile
  const venture = await getVenture(ventureId);
  const profile = TOKEN_BUDGET_PROFILES[venture.token_budget_profile];

  // Get phase for this stage
  const phase = getPhaseForStage(stageNumber);
  const phaseBudget = profile.totalBudget * profile.phaseAllocations[phase];

  // Get tokens already consumed in this phase
  const { data: consumed } = await supabase
    .from('venture_token_ledger')
    .select('tokens_input, tokens_output')
    .eq('venture_id', ventureId)
    .gte('stage_number', PHASE_STAGE_RANGES[phase][0])
    .lte('stage_number', PHASE_STAGE_RANGES[phase][1]);

  const totalConsumed = consumed.reduce(
    (sum, row) => sum + row.tokens_input + row.tokens_output,
    0
  );

  const remaining = phaseBudget - totalConsumed;
  const percentUsed = (totalConsumed / phaseBudget) * 100;

  // Check if request exceeds remaining
  if (requestedTokens > remaining) {
    return {
      allowed: false,
      remaining,
      percentUsed,
      warning: `Request (${requestedTokens}) exceeds remaining budget (${remaining})`,
    };
  }

  // Warning thresholds
  let warning: string | undefined;
  if (percentUsed > 85) {
    warning = `Phase budget at ${percentUsed.toFixed(1)}%. Consider efficiency.`;

    // Emit warning event
    await emitEvent('TOKEN_BUDGET_WARNING', {
      ventureId,
      stageNumber,
      percentUsed,
      remaining,
    });
  }

  return {
    allowed: true,
    remaining: remaining - requestedTokens,
    percentUsed,
    warning,
  };
}
```

---

## Circuit Breaker System

The Circuit Breaker protects against runaway token consumption and cost overruns.

### Circuit Breaker Configuration

```typescript
// lib/circuit-breaker.ts

interface CircuitBreakerConfig {
  // Hard cap - absolute maximum, no exceptions
  hardCap: number;

  // Soft cap - warning threshold (default 85%)
  softCapPercent: number;

  // Burn rate limit - max tokens per hour
  burnRateLimit: number;

  // Anomaly detection - triggers if usage exceeds N times normal
  anomalyThreshold: number;

  // Cooldown after trigger - minutes before allowing resume
  cooldownMinutes: number;
}

const DEFAULT_CIRCUIT_BREAKER: CircuitBreakerConfig = {
  hardCap: 1000000,        // 1M tokens absolute max
  softCapPercent: 85,      // Warn at 85%
  burnRateLimit: 50000,    // Max 50k tokens/hour
  anomalyThreshold: 3.0,   // 3x normal = anomaly
  cooldownMinutes: 30,
};
```

### Circuit Breaker Check Function

```typescript
// lib/circuit-breaker.ts

interface CircuitBreakerResult {
  allowed: boolean;
  reason?: 'HARD_CAP' | 'SOFT_CAP' | 'BURN_RATE' | 'ANOMALY';
  message: string;
  metrics: {
    totalConsumed: number;
    totalBudget: number;
    burnRateLastHour: number;
    expectedBurnRate: number;
  };
}

async function checkCircuitBreaker(
  ventureId: string,
  requestedTokens: number
): Promise<CircuitBreakerResult> {
  const venture = await getVenture(ventureId);
  const config = venture.circuitBreakerConfig || DEFAULT_CIRCUIT_BREAKER;

  // Get current consumption
  const totalConsumed = await getTotalTokensConsumed(ventureId);
  const totalBudget = await getVentureBudget(ventureId);
  const burnRateLastHour = await getTokensConsumedLastHour(ventureId);
  const expectedBurnRate = calculateExpectedBurnRate(ventureId);

  const metrics = {
    totalConsumed,
    totalBudget,
    burnRateLastHour,
    expectedBurnRate,
  };

  // CHECK 1: Hard Cap (CRITICAL - No exceptions)
  if (totalConsumed + requestedTokens > config.hardCap) {
    await triggerCircuitBreaker(ventureId, 'hard_cap', {
      totalConsumed,
      totalBudget: config.hardCap,
      reason: `Hard cap of ${config.hardCap.toLocaleString()} tokens exceeded`,
    });

    return {
      allowed: false,
      reason: 'HARD_CAP',
      message: `CRITICAL: Hard cap exceeded. Venture paused.`,
      metrics,
    };
  }

  // CHECK 2: Burn Rate (HIGH - Possible runaway)
  if (burnRateLastHour > config.burnRateLimit) {
    await triggerCircuitBreaker(ventureId, 'burn_rate', {
      burnRateLastHour,
      limit: config.burnRateLimit,
      reason: `Burn rate ${burnRateLastHour}/hr exceeds limit ${config.burnRateLimit}/hr`,
    });

    return {
      allowed: false,
      reason: 'BURN_RATE',
      message: `HIGH: Burn rate exceeded. Venture rate-limited.`,
      metrics,
    };
  }

  // CHECK 3: Anomaly Detection (MEDIUM - Investigate)
  if (expectedBurnRate > 0 && burnRateLastHour > expectedBurnRate * config.anomalyThreshold) {
    await triggerCircuitBreaker(ventureId, 'anomaly', {
      burnRateLastHour,
      expectedBurnRate,
      factor: burnRateLastHour / expectedBurnRate,
      reason: `Usage ${(burnRateLastHour / expectedBurnRate).toFixed(1)}x normal`,
    });

    // Anomaly doesn't block, but warns
    return {
      allowed: true,
      reason: 'ANOMALY',
      message: `WARNING: Anomalous usage detected. Monitoring.`,
      metrics,
    };
  }

  // CHECK 4: Soft Cap (LOW - Warning only)
  const percentUsed = (totalConsumed / totalBudget) * 100;
  if (percentUsed >= config.softCapPercent) {
    await triggerCircuitBreaker(ventureId, 'soft_cap', {
      totalConsumed,
      totalBudget,
      percentUsed,
      reason: `Budget at ${percentUsed.toFixed(1)}%`,
    });

    return {
      allowed: true,
      reason: 'SOFT_CAP',
      message: `INFO: Budget at ${percentUsed.toFixed(1)}%. Consider efficiency.`,
      metrics,
    };
  }

  // All checks passed
  return {
    allowed: true,
    message: 'OK',
    metrics,
  };
}
```

### Circuit Breaker Trigger

```typescript
// lib/circuit-breaker.ts

async function triggerCircuitBreaker(
  ventureId: string,
  triggerType: 'hard_cap' | 'soft_cap' | 'burn_rate' | 'anomaly',
  details: Record<string, any>
): Promise<void> {
  // Determine action based on trigger type
  const actionMap = {
    hard_cap: 'paused',
    burn_rate: 'rate_limited',
    anomaly: 'warned',
    soft_cap: 'warned',
  };

  // Record event
  await supabase.from('circuit_breaker_events').insert({
    venture_id: ventureId,
    trigger_type: triggerType,
    trigger_reason: details.reason,
    tokens_consumed: details.totalConsumed || 0,
    tokens_budget: details.totalBudget || 0,
    burn_rate_per_hour: details.burnRateLastHour,
    anomaly_factor: details.factor,
    action_taken: actionMap[triggerType],
  });

  // Execute action
  if (triggerType === 'hard_cap') {
    await pauseVenture(ventureId, 'CIRCUIT_BREAKER_HARD_CAP');
    await alertChairman('EMERGENCY', {
      venture_id: ventureId,
      message: `Venture hit hard cap and was automatically paused`,
      severity: 'critical',
    });
  } else if (triggerType === 'burn_rate') {
    await rateLimitVenture(ventureId, 30); // 30 minute cooldown
    await alertChairman('HIGH', {
      venture_id: ventureId,
      message: `Venture burn rate exceeded, rate-limited for 30 minutes`,
      severity: 'warning',
    });
  } else if (triggerType === 'anomaly' || triggerType === 'soft_cap') {
    await alertChairman('INFO', {
      venture_id: ventureId,
      message: details.reason,
      severity: 'info',
    });
  }

  // Log trace for debugging
  await logTrace({
    correlation_id: getCurrentCorrelationId(),
    agent_type: 'EVA_CIRCUIT_BREAKER',
    venture_id: ventureId,
    action: `circuit_breaker_${triggerType}`,
    output_snapshot: details,
  });
}
```

---

## Graceful Degradation

Strategy for handling external API failures without blocking the entire pipeline.

### Degradation Levels

```typescript
// lib/degradation.ts

enum DegradationLevel {
  FULL = 'full',           // All systems operational
  PARTIAL = 'partial',     // Some data sources unavailable
  FALLBACK = 'fallback',   // Using cached/alternate data
  MINIMAL = 'minimal',     // Core functionality only
}

interface DegradationState {
  level: DegradationLevel;
  unavailableSources: string[];
  fallbacksInUse: string[];
  estimatedRecovery: Date | null;
}
```

### Execute with Fallback Pattern

```typescript
// lib/degradation.ts

interface FallbackConfig<T> {
  primary: () => Promise<T>;
  fallback?: () => Promise<T>;
  degradedMode?: () => Promise<Partial<T>>;
  timeout: number;
  retries: number;
}

interface FallbackResult<T> {
  result: T | Partial<T>;
  degraded: boolean;
  source: 'primary' | 'fallback' | 'degraded';
  latency: number;
}

async function executeWithFallback<T>(
  config: FallbackConfig<T>
): Promise<FallbackResult<T>> {
  const startTime = Date.now();

  // Try primary source with retries
  for (let attempt = 1; attempt <= config.retries; attempt++) {
    try {
      const result = await withTimeout(config.primary(), config.timeout);
      return {
        result,
        degraded: false,
        source: 'primary',
        latency: Date.now() - startTime,
      };
    } catch (error) {
      if (attempt === config.retries) {
        console.warn(`Primary source failed after ${config.retries} attempts`);
      } else {
        await delay(Math.pow(2, attempt) * 100); // Exponential backoff
      }
    }
  }

  // Try fallback source
  if (config.fallback) {
    try {
      const result = await withTimeout(config.fallback(), config.timeout);
      return {
        result,
        degraded: false,
        source: 'fallback',
        latency: Date.now() - startTime,
      };
    } catch (error) {
      console.warn('Fallback source failed');
    }
  }

  // Use degraded mode (partial data)
  if (config.degradedMode) {
    try {
      const result = await config.degradedMode();
      return {
        result,
        degraded: true,
        source: 'degraded',
        latency: Date.now() - startTime,
      };
    } catch (error) {
      console.error('Degraded mode failed');
    }
  }

  throw new Error('All data sources exhausted');
}
```

### Dependency Health Monitoring

```typescript
// lib/degradation.ts

interface DependencyHealth {
  name: string;
  endpoint: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastCheck: Date;
  responseTime: number;
  errorRate24h: number;
}

const EXTERNAL_DEPENDENCIES: string[] = [
  'openai_api',
  'anthropic_api',
  'market_data_api',
  'domain_checker_api',
  'competitor_intel_api',
];

async function checkDependencyHealth(): Promise<Map<string, DependencyHealth>> {
  const healthMap = new Map<string, DependencyHealth>();

  for (const dep of EXTERNAL_DEPENDENCIES) {
    const config = getDependencyConfig(dep);
    const startTime = Date.now();

    try {
      await fetch(config.healthEndpoint, { timeout: 5000 });
      healthMap.set(dep, {
        name: dep,
        endpoint: config.healthEndpoint,
        status: 'healthy',
        lastCheck: new Date(),
        responseTime: Date.now() - startTime,
        errorRate24h: await getErrorRate(dep, 24),
      });
    } catch (error) {
      healthMap.set(dep, {
        name: dep,
        endpoint: config.healthEndpoint,
        status: 'unhealthy',
        lastCheck: new Date(),
        responseTime: -1,
        errorRate24h: await getErrorRate(dep, 24),
      });
    }
  }

  return healthMap;
}
```

### Crew Execution with Degradation

```typescript
// lib/crew-executor.ts

async function executeCrewWithDegradation(
  crewType: string,
  objective: string,
  inputs: any[]
): Promise<CrewResult> {
  const degradationState = await getDegradationState();

  // Adjust crew behavior based on degradation level
  if (degradationState.level === DegradationLevel.MINIMAL) {
    // Only execute core functionality
    return executeCoreOnly(crewType, objective, inputs);
  }

  if (degradationState.level === DegradationLevel.FALLBACK) {
    // Use cached data where available
    const cachedData = await getCachedInputs(crewType, inputs);
    inputs = mergeWithCached(inputs, cachedData);
  }

  // Execute crew with fallback chain
  const result = await executeWithFallback({
    primary: () => executeCrew(crewType, objective, inputs),
    fallback: () => executeCrewWithAlternateModel(crewType, objective, inputs),
    degradedMode: () => generatePartialResult(crewType, objective, inputs),
    timeout: 60000,
    retries: 2,
  });

  // Mark output if degraded
  if (result.degraded) {
    result.result.metadata = {
      ...result.result.metadata,
      degraded: true,
      degradationLevel: degradationState.level,
      requiresReview: true,
    };

    // Alert for human review
    await alertForReview(crewType, result.result, 'Degraded mode output');
  }

  return result.result;
}
```

---

## Feedback Loop Architecture

The system must be **antifragile**, not a blind waterfall. This section defines the mechanisms for intelligent recursion - how information flows backward through the pipeline to invalidate, rework, and learn.

### 9.1 The Intelligence Problem

```
┌─────────────────────────────────────────────────────────────────────┐
│                    WATERFALL (What We Don't Want)                   │
│                                                                     │
│   Stage 1 ──▶ Stage 2 ──▶ Stage 3 ──▶ ... ──▶ Stage 25             │
│                                                                     │
│   "March forward. Never look back. Hope nothing breaks."            │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│               INTELLIGENT FEEDBACK (What We Build)                  │
│                                                                     │
│   Stage 1 ──▶ Stage 2 ──▶ Stage 3 ──▶ ... ──▶ Stage 25             │
│      ▲          ▲          ▲                                        │
│      │          │          │                                        │
│      └──────────┴──────────┴─── Feedback Loops                      │
│                                                                     │
│   "Learn. Adapt. Propagate impact. Ask when uncertain."             │
└─────────────────────────────────────────────────────────────────────┘
```

**Key Principle:** Every piece of information at Stage N has upstream dependencies. When something at Stage N changes, we must understand and propagate the impact backward.

---

### 9.2 Stage Dependency Graph

Every stage produces artifacts that downstream stages depend on. This graph tracks those relationships.

#### Dependency Schema

```sql
-- Add to database schema
CREATE TABLE stage_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_number INT NOT NULL CHECK (stage_number BETWEEN 1 AND 25),
  depends_on_stage INT NOT NULL CHECK (depends_on_stage BETWEEN 1 AND 25),
  dependency_type VARCHAR(50) NOT NULL,  -- 'data', 'assumption', 'artifact', 'decision'
  strength VARCHAR(20) DEFAULT 'strong', -- 'strong', 'weak', 'informational'
  description TEXT,

  CHECK (stage_number > depends_on_stage),
  UNIQUE(stage_number, depends_on_stage, dependency_type)
);

-- Index for impact propagation queries
CREATE INDEX idx_stage_deps_upstream ON stage_dependencies(depends_on_stage);
CREATE INDEX idx_stage_deps_downstream ON stage_dependencies(stage_number);
```

#### Seed Data: The 25-Stage Dependency Graph

```sql
-- Core dependencies (simplified - full graph in migration)
INSERT INTO stage_dependencies (stage_number, depends_on_stage, dependency_type, strength, description) VALUES
-- Phase 1: THE TRUTH (Stages 1-5)
(2, 1, 'artifact', 'strong', 'Problem-Solution uses Draft Idea canvas'),
(3, 1, 'assumption', 'strong', 'Market Validation tests Idea assumptions'),
(3, 2, 'data', 'strong', 'Market sizing uses problem definition'),
(4, 3, 'data', 'strong', 'Competitive analysis uses market boundaries'),
(5, 3, 'data', 'strong', 'Financial model uses TAM/SAM data'),
(5, 4, 'data', 'weak', 'Pricing informed by competitor pricing'),

-- Phase 2: THE ENGINE (Stages 6-9)
(6, 3, 'assumption', 'strong', 'Risk assessment validates market assumptions'),
(6, 5, 'data', 'strong', 'Financial risks from profitability model'),
(7, 5, 'data', 'strong', 'Pricing uses unit economics'),
(7, 4, 'data', 'weak', 'Pricing informed by competitor pricing'),
(8, 5, 'artifact', 'strong', 'BMC uses financial model'),
(8, 7, 'artifact', 'strong', 'BMC includes pricing strategy'),
(9, 5, 'data', 'strong', 'Exit strategy uses profitability projections'),
(9, 8, 'artifact', 'weak', 'Exit options depend on business model'),

-- Phase 3: THE IDENTITY (Stages 10-12)
(10, 3, 'data', 'weak', 'Naming considers market positioning'),
(11, 3, 'data', 'strong', 'GTM uses market validation insights'),
(11, 8, 'artifact', 'strong', 'GTM aligned with business model'),
(12, 11, 'artifact', 'strong', 'Sales playbook implements GTM'),
(12, 7, 'data', 'strong', 'Sales uses pricing model'),

-- Phase 4: THE BLUEPRINT (Stages 13-16)
(13, 8, 'artifact', 'strong', 'Architecture implements business model'),
(14, 13, 'artifact', 'strong', 'User stories derived from architecture'),
(15, 14, 'artifact', 'strong', 'Wireframes implement user stories'),
(16, 13, 'artifact', 'strong', 'Schema implements architecture'),
(16, 14, 'artifact', 'strong', 'Endpoints support user stories'),

-- Phase 5: THE BUILD LOOP (Stages 17-20)
(17, 16, 'artifact', 'strong', 'Code implements schema/endpoints'),
(18, 17, 'artifact', 'strong', 'Testing verifies implementation'),
(19, 18, 'artifact', 'strong', 'Integration uses tested components'),
(20, 17, 'artifact', 'strong', 'Security review on generated code'),

-- Phase 6: LAUNCH & LEARN (Stages 21-25)
(21, 19, 'artifact', 'strong', 'UAT uses integrated system'),
(22, 21, 'artifact', 'strong', 'Analytics measures user behavior'),
(23, 10, 'artifact', 'weak', 'Marketing uses brand identity'),
(23, 11, 'artifact', 'strong', 'Marketing executes GTM'),
(24, 22, 'data', 'strong', 'Optimization uses analytics data'),
(25, 22, 'data', 'strong', 'Scale decision uses analytics'),
(25, 24, 'artifact', 'strong', 'Scale uses optimized system');
```

#### Impact Calculation Function

```typescript
// lib/feedback/dependency-graph.ts

interface ImpactAssessment {
  stagesAffected: number[];
  artifactsInvalidated: string[];
  severity: 'critical' | 'major' | 'minor';
  recommendedAction: 'rework' | 'review' | 'acknowledge';
  tokensRequired: number;
}

async function calculateUpstreamImpact(
  ventureId: string,
  changedStage: number,
  changeType: 'assumption_invalidated' | 'artifact_changed' | 'stage_reworked'
): Promise<ImpactAssessment> {
  // Find all downstream stages that depend on this one
  const { data: dependencies } = await supabase
    .from('stage_dependencies')
    .select('stage_number, dependency_type, strength')
    .eq('depends_on_stage', changedStage);

  // Get current venture progress
  const { data: venture } = await supabase
    .from('ventures')
    .select('current_stage')
    .eq('id', ventureId)
    .single();

  // Filter to stages that have been completed (need review/rework)
  const completedAffectedStages = dependencies
    .filter(d => d.stage_number <= venture.current_stage)
    .filter(d => d.strength === 'strong' || changeType === 'assumption_invalidated');

  // Calculate severity
  const severity = calculateSeverity(completedAffectedStages, changeType);

  // Get artifacts that need invalidation
  const { data: artifacts } = await supabase
    .from('venture_artifacts')
    .select('id, artifact_type, stage_number')
    .eq('venture_id', ventureId)
    .in('stage_number', completedAffectedStages.map(d => d.stage_number));

  // Estimate rework cost
  const tokensRequired = estimateReworkTokens(completedAffectedStages);

  return {
    stagesAffected: completedAffectedStages.map(d => d.stage_number).sort((a, b) => a - b),
    artifactsInvalidated: artifacts.map(a => a.id),
    severity,
    recommendedAction: severity === 'critical' ? 'rework' : severity === 'major' ? 'review' : 'acknowledge',
    tokensRequired,
  };
}

function calculateSeverity(
  affected: { stage_number: number; strength: string }[],
  changeType: string
): 'critical' | 'major' | 'minor' {
  // Critical if assumption invalidation affects 3+ completed stages
  if (changeType === 'assumption_invalidated' && affected.filter(a => a.strength === 'strong').length >= 3) {
    return 'critical';
  }

  // Major if any Phase 4+ stages affected (technical/build work)
  if (affected.some(a => a.stage_number >= 13)) {
    return 'major';
  }

  // Minor for early-stage document updates
  return 'minor';
}
```

---

### 9.3 Pivot Engine

The Pivot Engine handles **stage regression** - moving a venture backward when circumstances require it.

#### Pivot Types

```typescript
// lib/feedback/pivot-engine.ts

type PivotType =
  | 'assumption_failure'  // Critical assumption invalidated
  | 'market_shift'        // External market conditions changed
  | 'chairman_directive'  // Strategic decision to change direction
  | 'artifact_rejection'  // Quality gate hard-fail
  | 'learning_insight';   // New information from later stages

interface PivotRequest {
  ventureId: string;
  pivotType: PivotType;
  targetStage: number;         // Which stage to regress to
  reason: string;
  evidence?: Record<string, any>;
  preserveArtifacts?: boolean; // Keep old versions for reference
}

interface PivotResult {
  success: boolean;
  stagesReset: number[];
  artifactsArchived: string[];
  tokensRefunded: number;
  nextAction: string;
}
```

#### Pivot Execution Logic

```typescript
// lib/feedback/pivot-engine.ts

async function executePivot(request: PivotRequest): Promise<PivotResult> {
  const { ventureId, targetStage, pivotType, reason, preserveArtifacts } = request;

  // Get current venture state
  const { data: venture } = await supabase
    .from('ventures')
    .select('current_stage, status')
    .eq('id', ventureId)
    .single();

  if (targetStage >= venture.current_stage) {
    throw new Error(`Pivot target (${targetStage}) must be less than current stage (${venture.current_stage})`);
  }

  // Calculate stages to reset
  const stagesToReset = Array.from(
    { length: venture.current_stage - targetStage },
    (_, i) => targetStage + i + 1
  );

  // Archive artifacts (don't delete - preserve history)
  const { data: artifacts } = await supabase
    .from('venture_artifacts')
    .select('id')
    .eq('venture_id', ventureId)
    .in('stage_number', stagesToReset);

  const artifactIds = artifacts.map(a => a.id);

  if (preserveArtifacts !== false) {
    // Mark as archived, keep for audit trail
    await supabase
      .from('venture_artifacts')
      .update({
        status: 'archived',
        archived_reason: `Pivot: ${reason}`,
        archived_at: new Date().toISOString(),
      })
      .in('id', artifactIds);
  }

  // Reset stage states to 'pending'
  await supabase
    .from('venture_stage_assignments')
    .update({ status: 'pending', crew_assigned: null })
    .eq('venture_id', ventureId)
    .in('stage_number', stagesToReset);

  // Calculate token "refund" (budget returned for rework)
  const { data: tokenData } = await supabase
    .from('venture_token_ledger')
    .select('tokens_input, tokens_output')
    .eq('venture_id', ventureId)
    .in('stage_number', stagesToReset);

  const tokensRefunded = tokenData.reduce(
    (sum, row) => sum + row.tokens_input + row.tokens_output,
    0
  );

  // Update venture state
  await supabase
    .from('ventures')
    .update({
      current_stage: targetStage,
      status: 'active', // Ensure not paused
      pivot_count: venture.pivot_count + 1,
      last_pivot_at: new Date().toISOString(),
      last_pivot_reason: reason,
    })
    .eq('id', ventureId);

  // Record pivot event for learning
  await supabase.from('venture_pivot_history').insert({
    venture_id: ventureId,
    pivot_type: pivotType,
    from_stage: venture.current_stage,
    to_stage: targetStage,
    stages_reset: stagesToReset,
    artifacts_archived: artifactIds,
    tokens_refunded: tokensRefunded,
    reason,
    evidence: request.evidence,
  });

  // Emit event for downstream handling
  await emitEvent('VENTURE_PIVOTED', {
    ventureId,
    pivotType,
    fromStage: venture.current_stage,
    toStage: targetStage,
    reason,
  });

  return {
    success: true,
    stagesReset: stagesToReset,
    artifactsArchived: artifactIds,
    tokensRefunded,
    nextAction: `Resume from Stage ${targetStage}`,
  };
}
```

#### Pivot History Schema

```sql
-- Add to database schema
CREATE TABLE venture_pivot_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  pivot_type VARCHAR(50) NOT NULL,
  from_stage INT NOT NULL CHECK (from_stage BETWEEN 1 AND 25),
  to_stage INT NOT NULL CHECK (to_stage BETWEEN 1 AND 25),
  stages_reset INT[] NOT NULL,
  artifacts_archived UUID[],
  tokens_refunded INT DEFAULT 0,
  reason TEXT NOT NULL,
  evidence JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CHECK (to_stage < from_stage)
);

CREATE INDEX idx_pivot_history_venture ON venture_pivot_history(venture_id);
```

---

### 9.4 Assumption Impact Propagation

When an assumption is invalidated, the system automatically identifies and flags all dependent stages.

#### Assumption Dependencies

```sql
-- Add dependency tracking to assumption_sets
ALTER TABLE assumption_sets ADD COLUMN IF NOT EXISTS dependent_stages INT[] DEFAULT '{}';
ALTER TABLE assumption_sets ADD COLUMN IF NOT EXISTS impact_if_invalid JSONB DEFAULT '{}';
```

#### Impact Propagation Handler

```typescript
// lib/feedback/assumption-propagation.ts

interface AssumptionImpact {
  assumptionId: string;
  stagesAffected: number[];
  artifactsRequiringReview: string[];
  severity: 'critical' | 'major' | 'minor';
  recommendation: {
    action: 'pivot' | 'review' | 'continue';
    targetStage?: number;
    justification: string;
  };
}

async function propagateAssumptionInvalidation(
  ventureId: string,
  assumptionId: string,
  evidence: string
): Promise<AssumptionImpact> {
  // Get assumption with dependencies
  const { data: assumption } = await supabase
    .from('assumption_sets')
    .select('*')
    .eq('id', assumptionId)
    .single();

  // Get the stage where this assumption was created
  const createdAtStage = assumption.stage_created;

  // Query dependency graph to find downstream impact
  const impact = await calculateUpstreamImpact(
    ventureId,
    createdAtStage,
    'assumption_invalidated'
  );

  // Determine recommendation based on assumption criticality
  let recommendation: AssumptionImpact['recommendation'];

  if (assumption.is_critical && impact.severity === 'critical') {
    recommendation = {
      action: 'pivot',
      targetStage: createdAtStage,
      justification: `Critical assumption "${assumption.text}" invalidated. ${impact.stagesAffected.length} downstream stages affected. Recommend pivot to Stage ${createdAtStage} for rework.`,
    };
  } else if (impact.severity === 'major') {
    recommendation = {
      action: 'review',
      justification: `Assumption invalidation affects ${impact.stagesAffected.length} stages. Manual review recommended before proceeding.`,
    };
  } else {
    recommendation = {
      action: 'continue',
      justification: `Minor assumption change. Impact limited to ${impact.stagesAffected.length} stages with weak dependencies.`,
    };
  }

  // Update assumption record
  await supabase
    .from('assumption_sets')
    .update({
      status: 'invalidated',
      invalidated_at: new Date().toISOString(),
      invalidation_evidence: evidence,
      dependent_stages: impact.stagesAffected,
      impact_if_invalid: {
        artifacts: impact.artifactsInvalidated,
        severity: impact.severity,
        tokens_to_rework: impact.tokensRequired,
      },
    })
    .eq('id', assumptionId);

  // Flag affected artifacts for review
  await supabase
    .from('venture_artifacts')
    .update({
      needs_review: true,
      review_reason: `Upstream assumption "${assumption.text.substring(0, 50)}..." invalidated`,
    })
    .in('id', impact.artifactsInvalidated);

  // Create Chairman decision if critical
  if (recommendation.action === 'pivot') {
    await createChairmanDecision({
      ventureId,
      stageNumber: assumption.stage_created,
      gateType: 'hard_gate',
      crewResult: {
        summary: `Critical assumption failed: ${assumption.text}`,
        recommendation: 'pivot',
        evidence: {
          assumption: assumption.text,
          invalidation_evidence: evidence,
          downstream_impact: impact.stagesAffected,
        },
      },
    });
  }

  return {
    assumptionId,
    stagesAffected: impact.stagesAffected,
    artifactsRequiringReview: impact.artifactsInvalidated,
    severity: impact.severity,
    recommendation,
  };
}
```

---

### 9.5 Cross-Venture Learning Repository

Failures and pivots contain valuable patterns. This repository captures and surfaces those patterns for future ventures.

#### Learning Repository Schema

```sql
-- Add to database schema
CREATE TABLE venture_failure_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_type VARCHAR(50) NOT NULL,  -- 'assumption_failure', 'market_mismatch', 'technical_blocker', 'unit_economics'
  source_venture_id UUID REFERENCES ventures(id),
  stage_number INT CHECK (stage_number BETWEEN 1 AND 25),

  -- Pattern definition
  pattern_description TEXT NOT NULL,
  trigger_conditions JSONB NOT NULL,   -- What led to this failure
  resolution_outcome VARCHAR(50),       -- 'killed', 'pivoted', 'recovered'

  -- Learnings
  lesson_learned TEXT,
  prevention_strategy TEXT,
  detection_signals JSONB,              -- Early warning signs

  -- Metadata
  confidence_score FLOAT DEFAULT 0.5,
  occurrences INT DEFAULT 1,
  last_occurrence TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Tags for search
  tags TEXT[] DEFAULT '{}'
);

CREATE INDEX idx_failure_patterns_type ON venture_failure_patterns(pattern_type);
CREATE INDEX idx_failure_patterns_stage ON venture_failure_patterns(stage_number);
CREATE INDEX idx_failure_patterns_tags ON venture_failure_patterns USING GIN(tags);
```

#### Pattern Matching for New Ventures

```typescript
// lib/feedback/learning-repository.ts

interface PatternMatch {
  patternId: string;
  matchConfidence: number;
  description: string;
  prevention: string;
  detectionSignals: Record<string, any>;
}

async function findSimilarFailures(
  ventureId: string,
  stageNumber: number,
  context: Record<string, any>
): Promise<PatternMatch[]> {
  // Get venture characteristics
  const { data: venture } = await supabase
    .from('ventures')
    .select('market_category, business_model_type, target_segment')
    .eq('id', ventureId)
    .single();

  // Search for patterns matching:
  // 1. Same stage
  // 2. Similar market category
  // 3. Similar trigger conditions
  const { data: patterns } = await supabase
    .from('venture_failure_patterns')
    .select('*')
    .or(`stage_number.eq.${stageNumber},stage_number.is.null`)
    .order('confidence_score', { ascending: false })
    .limit(10);

  // Score each pattern against current context
  const matches: PatternMatch[] = [];

  for (const pattern of patterns) {
    const similarity = calculateContextSimilarity(pattern.trigger_conditions, context);

    if (similarity > 0.4) {
      matches.push({
        patternId: pattern.id,
        matchConfidence: similarity,
        description: pattern.pattern_description,
        prevention: pattern.prevention_strategy,
        detectionSignals: pattern.detection_signals,
      });
    }
  }

  return matches.sort((a, b) => b.matchConfidence - a.matchConfidence);
}

// Called when a venture is killed or pivoted
async function recordFailurePattern(
  ventureId: string,
  stageNumber: number,
  failureType: string,
  context: Record<string, any>
): Promise<void> {
  // Check if similar pattern exists
  const existingPatterns = await findSimilarFailures(ventureId, stageNumber, context);

  if (existingPatterns.length > 0 && existingPatterns[0].matchConfidence > 0.8) {
    // Update existing pattern (increase occurrences, refine signals)
    await supabase
      .from('venture_failure_patterns')
      .update({
        occurrences: supabase.sql`occurrences + 1`,
        last_occurrence: new Date().toISOString(),
        confidence_score: supabase.sql`LEAST(confidence_score + 0.05, 1.0)`,
      })
      .eq('id', existingPatterns[0].patternId);
  } else {
    // Create new pattern
    await supabase.from('venture_failure_patterns').insert({
      pattern_type: failureType,
      source_venture_id: ventureId,
      stage_number: stageNumber,
      pattern_description: context.description,
      trigger_conditions: context.triggers,
      resolution_outcome: context.outcome,
      lesson_learned: context.lesson,
      prevention_strategy: context.prevention,
      detection_signals: context.earlyWarnings,
      tags: context.tags,
    });
  }
}
```

#### Proactive Risk Crew Enhancement

```typescript
// Add to RISK_ASSESSMENT crew in crew-registry.ts

async function enhanceRiskAssessmentWithLearnings(
  ventureId: string,
  stageNumber: number
): Promise<RiskEnhancement[]> {
  // Query similar past failures
  const patterns = await findSimilarFailures(ventureId, stageNumber, await getVentureContext(ventureId));

  return patterns.map(p => ({
    source: 'cross_venture_learning',
    risk: p.description,
    likelihood: p.matchConfidence > 0.7 ? 'high' : p.matchConfidence > 0.5 ? 'medium' : 'low',
    prevention: p.prevention,
    earlyWarnings: p.detectionSignals,
    basedOn: `${p.patternId} (seen ${p.matchConfidence * 100}% similar)`,
  }));
}
```

---

### 9.6 Intelligence Triggers

Define when the system should automatically loop back vs. when to ask the Chairman.

#### Trigger Matrix

```typescript
// lib/feedback/intelligence-triggers.ts

interface IntelligenceTrigger {
  condition: string;
  threshold: number | string;
  autoAction: 'loop' | 'pause' | 'escalate';
  humanApproval: boolean;
  escalationLevel: 'info' | 'warning' | 'critical';
}

const INTELLIGENCE_TRIGGERS: Record<string, IntelligenceTrigger> = {
  // AUTO-LOOP: System handles without Chairman
  ARTIFACT_QUALITY_LOW: {
    condition: 'crew_output_confidence < 0.7',
    threshold: 0.7,
    autoAction: 'loop',
    humanApproval: false,
    escalationLevel: 'info',
    // EVA automatically requests revision from crew
  },

  MINOR_ASSUMPTION_UPDATE: {
    condition: 'assumption.is_critical === false && impact.severity === "minor"',
    threshold: 'minor',
    autoAction: 'loop',
    humanApproval: false,
    escalationLevel: 'info',
    // EVA flags artifacts for review, continues execution
  },

  // ESCALATE TO CHAIRMAN
  CRITICAL_ASSUMPTION_FAILED: {
    condition: 'assumption.is_critical === true',
    threshold: null,
    autoAction: 'escalate',
    humanApproval: true,
    escalationLevel: 'critical',
    // Chairman decides: pivot, fix, or kill
  },

  MAJOR_STAGE_IMPACT: {
    condition: 'impact.stagesAffected.length >= 3 && impact.severity !== "minor"',
    threshold: 3,
    autoAction: 'escalate',
    humanApproval: true,
    escalationLevel: 'warning',
    // Chairman reviews scope of rework
  },

  PATTERN_MATCH_HIGH: {
    condition: 'failurePattern.matchConfidence > 0.75',
    threshold: 0.75,
    autoAction: 'pause',
    humanApproval: true,
    escalationLevel: 'warning',
    // Alert Chairman: "This venture shows signs of [pattern]. Consider early pivot."
  },

  PIVOT_REQUESTED: {
    condition: 'request.type === "pivot"',
    threshold: null,
    autoAction: 'escalate',
    humanApproval: true,
    escalationLevel: 'critical',
    // Pivots always require Chairman approval
  },

  TOKEN_BUDGET_REWORK: {
    condition: 'rework.tokensRequired > venture.remainingBudget * 0.25',
    threshold: 0.25,
    autoAction: 'escalate',
    humanApproval: true,
    escalationLevel: 'warning',
    // Chairman decides if rework is worth the token cost
  },
};
```

#### Trigger Evaluation Engine

```typescript
// lib/feedback/intelligence-triggers.ts

interface TriggerEvaluation {
  triggered: boolean;
  trigger: string;
  action: 'continue' | 'loop' | 'pause' | 'escalate';
  requiresChairman: boolean;
  context: Record<string, any>;
}

async function evaluateTriggers(
  event: EVAEvent
): Promise<TriggerEvaluation> {
  const evaluations: TriggerEvaluation[] = [];

  // Evaluate each trigger against the event
  for (const [triggerName, trigger] of Object.entries(INTELLIGENCE_TRIGGERS)) {
    const isTriggered = await evaluateTriggerCondition(trigger, event);

    if (isTriggered) {
      evaluations.push({
        triggered: true,
        trigger: triggerName,
        action: trigger.autoAction,
        requiresChairman: trigger.humanApproval,
        context: {
          event,
          threshold: trigger.threshold,
          escalationLevel: trigger.escalationLevel,
        },
      });
    }
  }

  // If multiple triggers, take the most severe action
  if (evaluations.length === 0) {
    return {
      triggered: false,
      trigger: 'none',
      action: 'continue',
      requiresChairman: false,
      context: {},
    };
  }

  // Priority: escalate > pause > loop > continue
  const actionPriority = { escalate: 4, pause: 3, loop: 2, continue: 1 };
  evaluations.sort((a, b) => actionPriority[b.action] - actionPriority[a.action]);

  return evaluations[0];
}

async function executeIntelligentResponse(
  evaluation: TriggerEvaluation,
  ventureId: string
): Promise<void> {
  switch (evaluation.action) {
    case 'loop':
      // Auto-retry or request revision
      await requestCrewRevision(ventureId, evaluation.context);
      break;

    case 'pause':
      // Pause venture, create alert
      await pauseVenture(ventureId, `Trigger: ${evaluation.trigger}`);
      await createAlert({
        type: 'intelligence_trigger',
        ventureId,
        message: `Paused: ${evaluation.trigger}`,
        severity: evaluation.context.escalationLevel,
      });
      break;

    case 'escalate':
      // Create Chairman decision
      await createChairmanDecision({
        ventureId,
        stageNumber: evaluation.context.event.stageNumber,
        gateType: 'hard_gate',
        crewResult: {
          summary: `Intelligence trigger: ${evaluation.trigger}`,
          recommendation: 'review',
          evidence: evaluation.context,
        },
      });
      break;

    case 'continue':
    default:
      // No action needed
      break;
  }
}
```

---

### 9.7 Updated Stage State Machine

Modify the stage state machine to support backward transitions:

```javascript
// lib/state-machines/stage-state.ts

// UPDATED: Stage states with backward transitions
const stageTransitions = {
  pending: ['queued', 'skipped'],
  queued: ['in_progress', 'pending'],        // Can return to pending
  in_progress: ['review', 'in_progress', 'pending'], // Can loop back
  review: ['completed', 'in_progress', 'pending'],   // Can regress
  completed: ['review', 'in_progress'],      // NO LONGER TERMINAL - can regress on pivot
  skipped: ['pending'],                       // Can un-skip on pivot
};

// Transition validation
function canTransition(
  currentState: StageState,
  targetState: StageState,
  reason: 'normal' | 'pivot' | 'chairman_override'
): boolean {
  const allowedTransitions = stageTransitions[currentState];

  // Normal flow follows strict transitions
  if (reason === 'normal') {
    return allowedTransitions.includes(targetState) && targetState !== currentState;
  }

  // Pivot can go backward
  if (reason === 'pivot') {
    const backwardStates: StageState[] = ['pending', 'in_progress'];
    return backwardStates.includes(targetState);
  }

  // Chairman can override anything
  if (reason === 'chairman_override') {
    return true;
  }

  return false;
}
```

---

### 9.8 Summary: The Intelligent Feedback System

```
┌─────────────────────────────────────────────────────────────────────┐
│                    FEEDBACK LOOP ARCHITECTURE                       │
│                                                                     │
│  ┌───────────────┐                                                  │
│  │ Stage Work    │──▶ Artifact ──▶ Quality Gate                     │
│  └───────────────┘                     │                            │
│         ▲                              │                            │
│         │                     ┌────────┴────────┐                   │
│         │                     ▼                 ▼                   │
│         │               [Pass]            [Fail/Issue]              │
│         │                  │                    │                   │
│         │                  ▼                    ▼                   │
│         │            Next Stage         ┌──────────────┐            │
│         │                               │  EVALUATE    │            │
│         │                               │  TRIGGERS    │            │
│         │                               └──────┬───────┘            │
│         │                                      │                    │
│         │              ┌───────────────────────┼───────────────┐    │
│         │              ▼                       ▼               ▼    │
│         │         [Auto-Loop]            [Escalate]       [Learn]   │
│         │              │                       │               │    │
│         │              │                       ▼               ▼    │
│         │         EVA Retries          Chairman          Pattern    │
│         │              │               Decision          Repository │
│         │              │                   │                        │
│         └──────────────┴───────────────────┘                        │
│                                                                     │
│  KEY PRINCIPLES:                                                    │
│  1. Every stage has tracked dependencies                            │
│  2. Changes propagate impact automatically                          │
│  3. Pivots regress to the right stage, not restart from scratch     │
│  4. Failures become patterns for future ventures                    │
│  5. EVA handles minor loops; Chairman handles critical decisions    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Related Specifications

- [01-database-schema.md](./01-database-schema.md) - Database tables for contracts, ledgers, pivot history, and failure patterns
- [02-api-contracts.md](./02-api-contracts.md) - API endpoints EVA serves
- [03-ui-components.md](./03-ui-components.md) - UI that displays EVA's output
- [05-user-stories.md](./05-user-stories.md) - User stories driving these features
