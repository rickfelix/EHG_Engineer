---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# Venture Engine Golden Nuggets Plan



## Table of Contents

- [Metadata](#metadata)
- [Executive Summary](#executive-summary)
- [1. Tokens as Venture Investment & Budget Profiles](#1-tokens-as-venture-investment-budget-profiles)
  - [1.1 Concept Overview](#11-concept-overview)
  - [1.2 Facts (Already True / Implemented)](#12-facts-already-true-implemented)
  - [1.3 Opportunities (Proposed Additions)](#13-opportunities-proposed-additions)
  - [1.4 Open Questions / Risks](#14-open-questions-risks)
- [2. Venture, Market, and Competitor Simulation (Simulation Mode)](#2-venture-market-and-competitor-simulation-simulation-mode)
  - [2.1 Concept Overview](#21-concept-overview)
  - [2.2 Facts (Already True / Implemented)](#22-facts-already-true-implemented)
  - [2.3 Opportunities (Proposed Additions)](#23-opportunities-proposed-additions)
  - [2.4 Open Questions / Risks](#24-open-questions-risks)
- [3. Assumptions vs Reality Calibration](#3-assumptions-vs-reality-calibration)
  - [3.1 Concept Overview](#31-concept-overview)
  - [3.2 Facts (Already True / Implemented)](#32-facts-already-true-implemented)
  - [3.3 Opportunities (Proposed Additions)](#33-opportunities-proposed-additions)
  - [3.4 Open Questions / Risks](#34-open-questions-risks)
- [4. Feature-Level Hypotheses & Impact Modeling](#4-feature-level-hypotheses-impact-modeling)
  - [4.1 Concept Overview](#41-concept-overview)
  - [4.2 Facts (Already True / Implemented)](#42-facts-already-true-implemented)
  - [4.3 Opportunities (Proposed Additions)](#43-opportunities-proposed-additions)
  - [4.4 Open Questions / Risks](#44-open-questions-risks)
- [5. Hallucination Control via Four Buckets](#5-hallucination-control-via-four-buckets)
  - [5.1 Concept Overview](#51-concept-overview)
  - [5.2 Facts (Already True / Implemented)](#52-facts-already-true-implemented)
  - [5.3 Opportunities (Proposed Additions)](#53-opportunities-proposed-additions)
  - [5.4 Open Questions / Risks](#54-open-questions-risks)
- [6. Crew Tournament Pattern for Key Stages](#6-crew-tournament-pattern-for-key-stages)
  - [6.1 Concept Overview](#61-concept-overview)
  - [6.2 Facts (Already True / Implemented)](#62-facts-already-true-implemented)
  - [6.3 Opportunities (Proposed Additions)](#63-opportunities-proposed-additions)
  - [6.4 Open Questions / Risks](#64-open-questions-risks)
- [7. Integration Points with Existing EHG Vision & 25-Stage Workflow](#7-integration-points-with-existing-ehg-vision-25-stage-workflow)
  - [7.1 Concept Overview](#71-concept-overview)
  - [7.2 Facts (Already True / Implemented)](#72-facts-already-true-implemented)
  - [7.3 Integration Map](#73-integration-map)
  - [7.4 25-Stage Workflow Integration Points](#74-25-stage-workflow-integration-points)
  - [7.5 Open Questions / Risks](#75-open-questions-risks)
- [Scoring Framework (v0)](#scoring-framework-v0)
  - [Scale: 0-5](#scale-0-5)
  - [Evaluation Criteria](#evaluation-criteria)
  - [Overall Score Calculation](#overall-score-calculation)
  - [Rating Thresholds](#rating-thresholds)
- [Anti-Gravity Evaluation Prompt (Copy This)](#anti-gravity-evaluation-prompt-copy-this)
- [Context](#context)
- [Your Mission](#your-mission)
  - [STEP 1: Read the Context Documents](#step-1-read-the-context-documents)
  - [STEP 2: Design Your Own Evaluation Rubric](#step-2-design-your-own-evaluation-rubric)
  - [STEP 3: Apply Your Rubric to Each Golden Nugget](#step-3-apply-your-rubric-to-each-golden-nugget)
  - [STEP 4: Produce the Following Outputs](#step-4-produce-the-following-outputs)
- [Constraints](#constraints)
- [Output Format](#output-format)
- [Note](#note)
- [Claude Evaluation v0 - Scoring Table](#claude-evaluation-v0---scoring-table)
- [Claude Evaluation v0 - Detailed Rationale](#claude-evaluation-v0---detailed-rationale)
  - [1. Token Budget Profiles (Overall: 4.45) - **PROCEED**](#1-token-budget-profiles-overall-445---proceed)
  - [2. Simulation Mode (Overall: 3.70) - **REFINE**](#2-simulation-mode-overall-370---refine)
  - [3. Assumptions vs Reality (Overall: 4.25) - **PROCEED**](#3-assumptions-vs-reality-overall-425---proceed)
  - [4. Feature Hypotheses (Overall: 3.85) - **PROCEED**](#4-feature-hypotheses-overall-385---proceed)
  - [5. Four Buckets (Overall: 4.05) - **PROCEED**](#5-four-buckets-overall-405---proceed)
  - [6. Crew Tournaments (Overall: 4.00) - **PROCEED**](#6-crew-tournaments-overall-400---proceed)
  - [7. Integration Points (Overall: 3.60) - **DEFER (Documentation Only)**](#7-integration-points-overall-360---defer-documentation-only)
- [Claude Evaluation v0 - Summary](#claude-evaluation-v0---summary)
- [Executive Summary for Chairman](#executive-summary-for-chairman)
- [Ranked Enhancements](#ranked-enhancements)
  - [Priority 1: Token Budget Profiles (Score: 4.45)](#priority-1-token-budget-profiles-score-445)
  - [Priority 2: Four Buckets Hallucination Control (Score: 4.05)](#priority-2-four-buckets-hallucination-control-score-405)
  - [Priority 3: Assumptions vs Reality Calibration (Score: 4.25)](#priority-3-assumptions-vs-reality-calibration-score-425)
  - [Priority 4: Crew Tournaments (Score: 4.00)](#priority-4-crew-tournaments-score-400)
  - [Priority 5: Feature Hypotheses (Score: 3.85)](#priority-5-feature-hypotheses-score-385)
  - [Priority 6: Simulation Mode (Score: 3.70)](#priority-6-simulation-mode-score-370)
  - [Priority 7: Integration Points (Score: 3.60)](#priority-7-integration-points-score-360)
- [Cross-Nugget Dependencies](#cross-nugget-dependencies)
- [Implementation Phases](#implementation-phases)
  - [Phase 1: Foundation (Weeks 1-6)](#phase-1-foundation-weeks-1-6)
  - [Phase 2: Simulation & Learning (Weeks 7-14)](#phase-2-simulation-learning-weeks-7-14)
- [Bullet-Point Summary for Chairman](#bullet-point-summary-for-chairman)
- [Anti-Gravity Rubric v1 (Primary Rubric)](#anti-gravity-rubric-v1-primary-rubric)
  - [Scale: 0-5](#scale-0-5)
  - [Evaluation Criteria (6 total, weighted)](#evaluation-criteria-6-total-weighted)
  - [Formula](#formula)
  - [Thresholds](#thresholds)
- [Claude's Independent Scoring Using Anti-Gravity Rubric v1](#claudes-independent-scoring-using-anti-gravity-rubric-v1)
- [Rationale for Scoring Differences](#rationale-for-scoring-differences)
  - [Simulation Mode (Claude: 3.85 vs A-G: 4.10)](#simulation-mode-claude-385-vs-a-g-410)
  - [Crew Tournaments (Claude: 3.85 vs A-G: 3.80)](#crew-tournaments-claude-385-vs-a-g-380)
- [Consensus Rankings](#consensus-rankings)
- [Chairman Priority Note (2025-12-09)](#chairman-priority-note-2025-12-09)
- [Refined Roadmap](#refined-roadmap)
  - [Phase 1: The Foundation (4-6 weeks)](#phase-1-the-foundation-4-6-weeks)
  - [Chairman Fast-Follow: Crew Tournament Pilot](#chairman-fast-follow-crew-tournament-pilot)
  - [Phase 2: The Optimization Layer (6-8 weeks)](#phase-2-the-optimization-layer-6-8-weeks)
- [Overview](#overview)
- [Pilot Scope](#pilot-scope)
  - [Eligible Stages (Pick 1-2 for Pilot)](#eligible-stages-pick-1-2-for-pilot)
- [Pilot Constraints](#pilot-constraints)
- [Tournament Flow (Pilot Version)](#tournament-flow-pilot-version)
- [Scoring Rubric (Pilot: Brand & Messaging)](#scoring-rubric-pilot-brand-messaging)
- [Logging Schema (Minimal for Pilot)](#logging-schema-minimal-for-pilot)
- [Token Budget Integration (Tie to Nugget 1)](#token-budget-integration-tie-to-nugget-1)
- [Success Criteria for Pilot](#success-criteria-for-pilot)
- [Pilot Timeline](#pilot-timeline)
- [What This Pilot Does NOT Include](#what-this-pilot-does-not-include)
- [Evaluation Consensus](#evaluation-consensus)
- [Refined Roadmap](#refined-roadmap)
- [Key Insight](#key-insight)

## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, api, unit, migration

**Version**: 1.0
**Date**: 2025-12-09
**Author**: Lead Systems Architect (Claude)
**Status**: PROPOSAL - Pending Chairman Review

---

## Executive Summary

This document captures seven strategic concepts ("golden nuggets") from the Chairman's vision for evolving EHG's venture engine. These concepts transform the 25-stage venture workflow from a deterministic pipeline into an adaptive, self-calibrating system that treats tokens as investment capital, models uncertainty explicitly, and learns from every venture.

**Core Thesis**: The venture engine should be an AI-run venture capital firm that:
1. Treats compute/tokens as capital with explicit budget profiles
2. Simulates ventures before committing real resources
3. Tracks assumptions vs reality to self-calibrate
4. Controls hallucination through structural separation (Facts/Assumptions/Simulations/Unknowns)
5. Uses tournament-style agent crews that learn optimal configurations per stage

---

# PART 1: Golden Nuggets - Detailed Specification

---

## 1. Tokens as Venture Investment & Budget Profiles

### 1.1 Concept Overview

Tokens/compute are treated as the **capital cost per venture** - not just an operational expense, but an explicit investment decision with expected returns.

### 1.2 Facts (Already True / Implemented)

- EHG uses token-based AI models (Claude, Gemini, OpenAI)
- Token usage is implicitly tracked at the API level
- No venture-level token accounting currently exists
- ADR-002 defines the 25-stage venture lifecycle but does not track token investment per stage

### 1.3 Opportunities (Proposed Additions)

#### Token Budget Profiles

| Profile | Total Tokens | Use Case |
|---------|-------------|----------|
| **Exploratory** | 50K-100K | Quick validation, kill fast |
| **Standard** | 250K-500K | Normal venture progression |
| **Deep Due Diligence** | 1M-2M | High-stakes, complex markets |
| **Custom** | User-defined | Chairman override |

#### Phase Allocation Template

```
Profile: Standard (500K tokens)
├── THE TRUTH (Stages 1-5):      25% (125K)
├── THE ENGINE (Stages 6-9):     15% (75K)
├── THE IDENTITY (Stages 10-12): 10% (50K)
├── THE BLUEPRINT (Stages 13-16): 20% (100K)
├── THE BUILD LOOP (Stages 17-20): 20% (100K)
└── LAUNCH & LEARN (Stages 21-25): 10% (50K)
```

#### Token Tracking Schema

```sql
-- Proposed: venture_token_ledger
CREATE TABLE venture_token_ledger (
  id UUID PRIMARY KEY,
  venture_id UUID REFERENCES ventures(id),
  lifecycle_stage INT,
  agent_type VARCHAR(50),  -- 'claude', 'gemini', 'crewai_job', etc.
  job_id UUID,             -- Reference to specific AI job
  tokens_input INT,
  tokens_output INT,
  cost_usd NUMERIC(10,6),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Aggregation view
CREATE VIEW venture_token_summary AS
SELECT
  venture_id,
  SUM(tokens_input + tokens_output) AS total_tokens,
  SUM(cost_usd) AS total_cost,
  COUNT(DISTINCT lifecycle_stage) AS stages_touched
FROM venture_token_ledger
GROUP BY venture_id;
```

#### Portfolio Analytics

- **Cost per killed idea** (Stages 1-5 average)
- **Cost per validated venture** (through Stage 16)
- **Cost per launched venture** (through Stage 23)
- **Sweet spot discovery**: At what token budget do outcomes plateau?

### 1.4 Open Questions / Risks

- How do we attribute tokens from shared CrewAI jobs across ventures?
- Should token budgets be hard caps (venture stops) or soft limits (Chairman approval required)?
- How do we handle token costs for simulation mode vs runtime mode?

---

## 2. Venture, Market, and Competitor Simulation (Simulation Mode)

### 2.1 Concept Overview

A clear separation between **Runtime Mode** (real ventures, real governance) and **Simulation Mode** (sandbox exploration without production side effects).

### 2.2 Facts (Already True / Implemented)

- The 25-stage workflow operates in runtime mode only
- No simulation infrastructure exists
- `ventures` table tracks real ventures with statuses (active, paused, killed, launched)
- ADR-002 defines venture lifecycle but assumes all ventures are "real"

### 2.3 Opportunities (Proposed Additions)

#### Mode Separation

| Aspect | Runtime Mode | Simulation Mode |
|--------|--------------|-----------------|
| **Table Prefix** | `ventures`, `venture_*` | `sim_ventures`, `sim_*` |
| **SD Creation** | Real SDs in `strategic_directives_v2` | Virtual SDs (never persisted to governance) |
| **Token Accounting** | Tracked in ledger, counts toward budget | Tracked separately, tagged as "sim" |
| **Stage Gates** | Require Chairman decisions | Auto-advance with configurable rules |
| **Outcome** | Real venture launch or kill | Probability distribution |

#### Venture Simulation Model

```typescript
interface VentureSimulation {
  simulation_id: string;
  base_venture_id?: string;  // If simulating variant of real venture

  // Market Model
  market_segments: MarketSegment[];
  competitor_archetypes: CompetitorArchetype[];

  // Venture Configuration
  token_budget_profile: TokenBudgetProfile;
  crew_configuration: CrewConfig;

  // Assumption Set (versioned)
  assumption_set_id: string;
  assumption_set_version: number;

  // Monte Carlo Parameters
  num_runs: number;
  random_seed?: number;
}

interface MarketSegment {
  name: string;
  size_estimate: { min: number; max: number; confidence: number };
  pain_intensity: number;        // 1-10
  budget_willingness: number;    // 1-10
  adoption_friction: number;     // 1-10
  price_sensitivity: number;     // 1-10
}

interface CompetitorArchetype {
  type: 'incumbent' | 'fast_follower' | 'niche_expert' | 'diy_ghost';
  market_share_estimate: number;
  response_speed: 'slow' | 'medium' | 'fast';
  resource_depth: 'limited' | 'moderate' | 'deep';
}
```

#### Monte Carlo Outcome Distribution

```
Simulation Run (n=1000)
├── Failure: 35% (venture killed at Stage 3 or 5)
├── Micro-SaaS: 40% ($1K-$10K MRR ceiling)
├── Growth Business: 20% ($10K-$100K MRR potential)
└── Breakout: 5% ($100K+ MRR potential)
```

### 2.4 Open Questions / Risks

- Where should simulation infrastructure live? (EHG runtime vs separate service)
- How do we prevent sim mode from consuming production token budgets?
- What's the minimum viable simulation model that provides value?

---

## 3. Assumptions vs Reality Calibration

### 3.1 Concept Overview

Every venture starts with an **Assumption Set V1**. As real-world data arrives, we compute **assumption error** and evolve to V2+, building a self-calibrating system.

### 3.2 Facts (Already True / Implemented)

- Ventures have `metadata` JSONB fields that could store assumptions
- No explicit assumption tracking exists
- No comparison of predicted vs actual outcomes
- Stage artifacts exist but don't distinguish assumptions from facts

### 3.3 Opportunities (Proposed Additions)

#### Assumption Set Schema

```sql
CREATE TABLE assumption_sets (
  id UUID PRIMARY KEY,
  venture_id UUID REFERENCES ventures(id),
  version INT DEFAULT 1,

  -- Core Assumptions
  market_assumptions JSONB,      -- segment sizes, pain, willingness
  competitor_assumptions JSONB,  -- who exists, their capabilities
  product_assumptions JSONB,     -- what features matter, pricing
  timing_assumptions JSONB,      -- market readiness, adoption speed

  -- Confidence & Evidence
  confidence_scores JSONB,       -- per-assumption confidence (0-1)
  evidence_sources JSONB,        -- what backs each assumption

  -- Versioning
  parent_version_id UUID,        -- Link to V1 if this is V2+
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(50)         -- 'stage_3_validation', 'post_launch_calibration', etc.
);
```

#### Assumptions vs Reality Report

```typescript
interface AssumptionsVsRealityReport {
  venture_id: string;
  assumption_set_id: string;
  report_date: string;

  comparisons: AssumptionComparison[];

  overall_error: {
    direction: 'optimistic' | 'pessimistic' | 'mixed';
    magnitude: number;  // 0-1 scale
  };

  recommendations: string[];
  next_assumption_set_id?: string;  // V2 if generated
}

interface AssumptionComparison {
  assumption_key: string;
  predicted_value: any;
  actual_value: any;
  error_direction: 'over' | 'under' | 'correct';
  error_magnitude: number;
  confidence_was: number;
  confidence_should_be: number;
}
```

#### Global Calibration

- Aggregate assumption errors across all ventures
- Identify systematic biases (e.g., "We consistently overestimate market size by 2x")
- Refine default segment/competitor archetypes in the simulation engine

### 3.4 Open Questions / Risks

- How long after launch do we wait to compute reality data?
- What if a venture is killed before we can validate assumptions?
- How do we attribute outcomes to specific assumptions?

---

## 4. Feature-Level Hypotheses & Impact Modeling

### 4.1 Concept Overview

Every significant feature is a **micro-bet** with an explicit hypothesis about expected impact, enabling pre-release simulation and post-release calibration.

### 4.2 Facts (Already True / Implemented)

- Features are implicitly tracked in `venture_artifacts` (user_story_pack)
- No explicit hypothesis per feature
- No pre/post measurement of feature impact
- No feedback loop into future estimates

### 4.3 Opportunities (Proposed Additions)

#### Feature Hypothesis Card

```typescript
interface FeatureHypothesis {
  feature_id: string;
  venture_id: string;
  title: string;

  // Target & Expected Impact
  target_segments: string[];
  expected_metrics: {
    activation_change: { min: number; max: number; confidence: number };
    retention_change: { min: number; max: number; confidence: number };
    time_to_value_change: { min: number; max: number; confidence: number };
    revenue_impact: { min: number; max: number; confidence: number };
    token_cost: { min: number; max: number; confidence: number };
    support_load_change: { min: number; max: number; confidence: number };
  };

  // Side Effects
  expected_side_effects: string[];

  // Pre-Release Simulation
  simulation_run_id?: string;
  simulated_outcome?: any;

  // Post-Release Measurement
  actual_metrics?: {
    activation_change: number;
    retention_change: number;
    // ... etc
  };
  measurement_period_days: number;

  // Calibration
  assumption_error?: number;
  learnings?: string[];
}
```

#### Pre-Release Feature Simulation

1. Take current venture model (market segments, competitor state, user base)
2. Inject feature hypothesis
3. Run Monte Carlo simulation
4. Produce expected impact distribution
5. Compare to expected_metrics → flag if simulation suggests different outcome

#### Post-Release Calibration Loop

1. Feature ships
2. Wait N days (configurable per metric type)
3. Measure actual metrics
4. Compute assumption error
5. Update feature-type priors (e.g., "pricing features typically underperform by 15%")

### 4.4 Open Questions / Risks

- How do we isolate feature impact from other changes?
- What's the minimum measurement period to get signal?
- How do we handle features that are never shipped?

---

## 5. Hallucination Control via Four Buckets

### 5.1 Concept Overview

All outputs in the 25-stage venture workflow are classified into **four explicit buckets**: Facts, Assumptions, Simulations, Unknowns. This structural separation reduces hallucination by making the epistemic status of every claim explicit.

### 5.2 Facts (Already True / Implemented)

- Stage artifacts exist in `venture_artifacts`
- No classification system for artifact content
- Hallucination control relies on prompt engineering ("be careful")
- No traceability of claims to sources

### 5.3 Opportunities (Proposed Additions)

#### The Four Buckets

| Bucket | Definition | Traceability Requirement |
|--------|------------|-------------------------|
| **Facts** | Statements with traceable sources | Must link to DB record, prior stage artifact, or explicit evidence URL |
| **Assumptions** | Beliefs about market, users, behavior, impact | Must reference assumption_set_id and specific key |
| **Simulations** | Outputs from Venture/Feature sims | Must reference simulation_run_id and assumption_set_id used |
| **Unknowns** | Gaps deliberately not filled | Must state what would be needed to resolve |

#### Stage Gate Requirements

```typescript
interface StageOutputValidation {
  stage_number: number;

  // Bucket Counts
  facts_count: number;
  assumptions_count: number;
  simulations_count: number;
  unknowns_count: number;

  // Validation Rules
  all_facts_have_sources: boolean;
  all_assumptions_in_set: boolean;
  all_simulations_have_run_ids: boolean;
  at_least_one_unknown: boolean;  // Force honest gaps

  // Gate Result
  passes_validation: boolean;
  violations: string[];
}
```

#### Artifact Schema Extension

```sql
ALTER TABLE venture_artifacts ADD COLUMN epistemic_classification JSONB;
-- Example:
-- {
--   "facts": [
--     {"claim": "TAM is $5B", "source": "statista_report_2024", "source_type": "external"},
--     {"claim": "3 competitors exist", "source": "stage_4_competitive_analysis", "source_type": "prior_stage"}
--   ],
--   "assumptions": [
--     {"claim": "Users will pay $99/mo", "assumption_set_id": "...", "key": "pricing.willingness"}
--   ],
--   "simulations": [
--     {"claim": "60% chance of $50K MRR", "simulation_run_id": "...", "assumption_set_id": "..."}
--   ],
--   "unknowns": [
--     {"gap": "Enterprise adoption rate", "needed": "Pilot program data"}
--   ]
-- }
```

### 5.4 Open Questions / Risks

- How do we enforce classification without slowing down the workflow?
- What's the training/prompt engineering needed to get agents to classify correctly?
- How granular should classification be (per-paragraph, per-sentence, per-artifact)?

---

## 6. Crew Tournament Pattern for Key Stages

### 6.1 Concept Overview

For high-stakes stages (design, messaging, risk analysis), use a **tournament pattern** where multiple worker agents produce candidates, a manager scores and selects, and the system learns optimal configurations per stage.

### 6.2 Facts (Already True / Implemented)

- CrewAI infrastructure exists (`leo_interfaces`, `crewai_job_runs`)
- Current pattern is single-agent per task
- No tournament/competition pattern
- No meta-learning about optimal crew configurations

### 6.3 Opportunities (Proposed Additions)

#### Tournament Architecture

```
Stage 15: Epic & User Story Breakdown
│
├── [Worker 1] → Candidate A + Self-Score (85/100)
├── [Worker 2] → Candidate B + Self-Score (78/100)
├── [Worker 3] → Candidate C + Self-Score (91/100)
│
├── [Manager] → Reviews all candidates
│   ├── Scores: A=82, B=75, C=88
│   ├── Selects: C (or merges A+C)
│   └── Explains: "C has better story decomposition; A has better acceptance criteria"
│
└── [Optional Peer Review]
    ├── Worker 1 scores B, C
    ├── Worker 2 scores A, C
    └── Worker 3 scores A, B
```

#### Crew Configuration Schema

```sql
CREATE TABLE crew_configurations (
  id UUID PRIMARY KEY,
  stage_number INT,
  config_name VARCHAR(100),

  -- Worker Config
  num_workers INT,
  worker_model VARCHAR(50),      -- 'claude-opus-4-5', 'gemini-2.0-flash', etc.
  worker_prompt_variant VARCHAR(50),

  -- Manager Config
  manager_model VARCHAR(50),
  manager_scoring_rubric_id UUID,

  -- Peer Review Config
  peer_review_enabled BOOLEAN DEFAULT false,

  -- Meta
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true
);

CREATE TABLE crew_run_logs (
  id UUID PRIMARY KEY,
  venture_id UUID,
  stage_number INT,
  configuration_id UUID REFERENCES crew_configurations(id),

  -- Token Usage
  tokens_per_worker INT[],
  tokens_manager INT,
  tokens_peer_review INT,
  total_tokens INT,

  -- Quality Metrics
  worker_self_scores INT[],
  manager_scores INT[],
  peer_scores JSONB,
  final_quality_score INT,

  -- Downstream Signal
  downstream_rework_needed BOOLEAN,
  chairman_override BOOLEAN,

  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Bandit-Style Sweet Spot Learning

```typescript
interface StageCrewOptimization {
  stage_number: number;

  // Historical Data
  configuration_runs: {
    config_id: string;
    run_count: number;
    avg_quality_score: number;
    avg_tokens: number;
    avg_cost: number;
    quality_per_token: number;  // quality / tokens
    downstream_rework_rate: number;
  }[];

  // Learned Sweet Spot
  recommended_config: {
    num_workers: number;
    peer_review: boolean;
    expected_quality: number;
    expected_tokens: number;
    confidence: number;
  };

  // Exploration Budget
  exploration_rate: number;  // % of runs to try non-optimal configs
}
```

#### Example Sweet Spot Discovery

```
Stage 15 (Epic Planning) - After 50 runs:
├── 3 workers, no peer review: Quality=75, Tokens=15K, Q/T=0.005
├── 5 workers, no peer review: Quality=88, Tokens=25K, Q/T=0.0035
├── 5 workers, peer review:    Quality=92, Tokens=40K, Q/T=0.0023
├── 8 workers, peer review:    Quality=93, Tokens=65K, Q/T=0.0014
│
└── SWEET SPOT: 5 workers, no peer review
    - 95% of max quality at 38% of max cost
    - Peer review adds 4 points but doubles tokens
```

### 6.4 Open Questions / Risks

- Which stages benefit most from tournaments vs single-agent?
- How do we handle worker disagreement (all candidates poor)?
- What's the cold-start strategy before we have learning data?

---

## 7. Integration Points with Existing EHG Vision & 25-Stage Workflow

### 7.1 Concept Overview

Map each golden nugget to its **home location** in the EHG architecture: runtime app, governance/LEO, or new shared services.

### 7.2 Facts (Already True / Implemented)

- EHG (runtime): 25-stage workflow, venture lifecycle, UI, CrewAI invocation
- EHG_Engineer (governance): SDs, PRDs, LEO protocol, migrations, CLAUDE.md
- Supabase (shared): ventures, strategic_directives_v2, venture_artifacts, leo_interfaces
- ADR-002 defines the boundary between runtime and governance

### 7.3 Integration Map

| Golden Nugget | Primary Location | Secondary Location | Notes |
|---------------|------------------|-------------------|-------|
| **1. Token Budget Profiles** | EHG_Engineer (governance) | EHG (runtime UI) | Budget definitions in governance; tracking/UI in runtime |
| **2. Simulation Mode** | New: `ehg-simulator` service | EHG (runtime orchestration) | Separate service to avoid runtime contamination |
| **3. Assumptions vs Reality** | EHG (runtime) | EHG_Engineer (calibration reports) | Data collection in runtime; analysis/reports in governance |
| **4. Feature Hypotheses** | EHG (runtime) | - | Lives entirely in venture lifecycle |
| **5. Four Buckets** | Both | - | Schema in shared DB; enforcement in both runtime agents and LEO agents |
| **6. Crew Tournaments** | EHG (runtime) | EHG_Engineer (config/learning) | Execution in runtime; meta-learning analysis in governance |
| **7. Integration Points** | Documentation | - | This section is the integration map |

### 7.4 25-Stage Workflow Integration Points

| Stage | Nugget Integration |
|-------|-------------------|
| **1-2** (Idea, Critique) | Token tracking begins; Assumption Set V1 created |
| **3** (Validation) | First Sim Mode run (optional); Four Bucket classification required |
| **5** (Profitability) | Token budget profile confirmed; Second Sim Mode run |
| **10-12** (Brand/GTM) | Crew Tournament for messaging |
| **13-16** (Blueprint) | Crew Tournament for architecture; Feature Hypotheses created |
| **17-20** (Build Loop) | Token tracking per SD; Feature Hypotheses updated |
| **21** (QA/UAT) | Reality data collection begins |
| **23** (Launch) | Assumptions vs Reality Report triggered |
| **24-25** (Analytics, Optimize) | Feature-level calibration; Sweet spot learning update |

### 7.5 Open Questions / Risks

- Does Simulation Mode need its own Supabase project to guarantee isolation?
- How do we version the integration points as the 25-stage workflow evolves?
- What's the migration path for existing ventures that don't have Assumption Sets?

---

# PART 2: Evaluation Rubric (Claude Rubric v0)

---

## Scoring Framework (v0)

### Scale: 0-5

| Score | Label | Definition |
|-------|-------|------------|
| **0** | Not Viable | Fundamentally incompatible with EHG architecture or vision |
| **1** | Weak | Marginal value, high complexity, significant risks |
| **2** | Partial | Some value but major gaps or concerns |
| **3** | Adequate | Sound concept, moderate effort, clear value |
| **4** | Strong | High value, feasible implementation, manageable risks |
| **5** | Excellent | Transformative value, natural fit, clear path to implementation |

### Evaluation Criteria

#### 1. Strategic Impact & Alignment (Weight: 20%)
How strongly does this concept advance the Chairman's vision for EHG as an AI-run venture engine?

| Score | Criteria |
|-------|----------|
| 5 | Core to the AI-run VC thesis; directly enables new capabilities |
| 3 | Supports the vision; improves existing capabilities |
| 1 | Tangential; nice-to-have but not strategic |

#### 2. Architectural Fit & Boundary Respect (Weight: 15%)
Does it respect EHG/EHG_Engineer separation? Does it fit existing patterns?

| Score | Criteria |
|-------|----------|
| 5 | Perfect fit; leverages existing patterns; clear ownership |
| 3 | Minor adjustments needed; boundary is navigable |
| 1 | Requires significant architectural changes or blurs boundaries |

#### 3. Feasibility & Implementation Effort (Weight: 15%)
How feasible within current stack and constraints?

| Score | Criteria |
|-------|----------|
| 5 | Can be implemented incrementally with existing tools |
| 3 | Requires new components but within known patterns |
| 1 | Requires significant new infrastructure or expertise |

#### 4. Governance & Observability Value (Weight: 15%)
Does it improve traceability, auditability, or decision quality?

| Score | Criteria |
|-------|----------|
| 5 | Dramatically improves Chairman visibility and control |
| 3 | Adds useful observability; some new insights |
| 1 | Neutral or adds complexity without proportional insight |

#### 5. Token Economics & Efficiency (Weight: 15%)
Does it improve expected value per token spent?

| Score | Criteria |
|-------|----------|
| 5 | Clear path to measurable token efficiency gains |
| 3 | Neutral on tokens but enables better decisions |
| 1 | Increases token usage without clear ROI |

#### 6. Compounding / Self-Improvement Potential (Weight: 10%)
Does this make the system smarter over time?

| Score | Criteria |
|-------|----------|
| 5 | Creates explicit learning loops; compounds with usage |
| 3 | Some learning potential; requires manual analysis |
| 1 | Static capability; no self-improvement |

#### 7. Risk & Failure Modes (Weight: 10%)
What are the main ways this could go wrong?

| Score | Criteria |
|-------|----------|
| 5 | Failure modes are contained and recoverable |
| 3 | Known risks with mitigation strategies |
| 1 | High-impact failure modes; hard to recover |

### Overall Score Calculation

```
Overall = (Strategic * 0.20) + (Architectural * 0.15) + (Feasibility * 0.15)
        + (Governance * 0.15) + (TokenEcon * 0.15) + (Compounding * 0.10)
        + (Risk * 0.10)
```

### Rating Thresholds

| Overall Score | Recommendation |
|---------------|----------------|
| 4.0 - 5.0 | **Proceed** - Prioritize implementation |
| 3.0 - 3.9 | **Refine** - Address gaps, then proceed |
| 2.0 - 2.9 | **Defer** - Revisit after higher-priority work |
| 0.0 - 1.9 | **Reject** - Does not fit current direction |

---

# PART 3: Prompt for Anti-Gravity IDE (Rubric Design + Evaluation)

---

## Anti-Gravity Evaluation Prompt (Copy This)

```
Anti-Gravity, you are tasked with designing an evaluation framework and then evaluating a strategic proposal for enhancing the EHG venture engine.

## Context

EHG is an AI-run venture factory that orchestrates multiple ventures through a 25-stage lifecycle (from idea validation through launch and optimization). The Chairman has outlined seven "golden nuggets" - strategic concepts for evolving the system to be more capital-efficient, self-calibrating, and hallucination-resistant.

The golden nuggets are:
1. **Tokens as Venture Investment & Budget Profiles** - Treat compute/tokens as capital with explicit budget profiles per venture
2. **Simulation Mode vs Runtime Mode** - Separate sandbox simulation from production venture execution
3. **Assumptions vs Reality Calibration** - Track versioned assumption sets and compare against actual outcomes
4. **Feature-Level Hypotheses & Impact Modeling** - Treat each feature as a micro-bet with explicit impact predictions
5. **Hallucination Control via Four Buckets** - Classify all outputs as Facts, Assumptions, Simulations, or Unknowns
6. **Crew Tournament Pattern for Key Stages** - Use tournament-style agent competitions with learned sweet spots
7. **Integration Points with Existing Vision** - Map each nugget to its location in the EHG/EHG_Engineer architecture

## Your Mission

### STEP 1: Read the Context Documents

1. **Golden Nuggets document**: `docs/vision/VENTURE_ENGINE_GOLDEN_NUGGETS_PLAN.md` (PART 1 contains detailed specifications for each nugget)

2. **Architecture context**:
   - `docs/architecture/ADR-002-VENTURE-FACTORY-ARCHITECTURE.md` (25-stage workflow definition)
   - `docs/plans/kochel-integration-plan.md` (recent Kochel Integration for stage/artifact alignment)
   - `CLAUDE.md` and `CLAUDE_CORE.md` (LEO Protocol context)

3. **Implementation patterns**:
   - `database/migrations/20251206_lifecycle_stage_config.sql` (stage definitions)
   - `database/schema/013_leo_protocol_dashboard_schema.sql` (current schema patterns)

### STEP 2: Design Your Own Evaluation Rubric

You must design an evaluation rubric from scratch. Do NOT use any pre-existing rubric. Consider:

- What criteria are most important for evaluating strategic enhancements to an AI-run venture engine?
- What scale makes sense (0-5? 1-10? letter grades?)?
- Should criteria be weighted? If so, how?
- How should the overall score be computed?
- What thresholds determine "proceed", "refine", or "reject"?

**Requirements for your rubric**:
- Include 5-10 evaluation criteria
- Define each criterion clearly (what does a high score vs low score mean?)
- Specify your scale and any weighting
- Provide a formula for computing the overall score
- Define rating thresholds for recommendations

### STEP 3: Apply Your Rubric to Each Golden Nugget

Using YOUR rubric (not anyone else's), evaluate all 7 golden nuggets.

### STEP 4: Produce the Following Outputs

#### Output 1: Your Rubric Definition (Anti-Gravity Rubric v1)

Provide in a copy-pastable format:
- List of criteria with definitions
- Scale (e.g., 0-5)
- Weights (if applicable)
- Overall score formula
- Rating thresholds

#### Output 2: Scoring Table

A table with your criteria as columns and the 7 nuggets as rows. Include the overall score.

#### Output 3: Rationale per Nugget

For each nugget, provide:
- **Strengths**: What works well about this concept?
- **Concerns**: What doesn't work or needs refinement?
- **Integration Points**: Where in the codebase/docs would this be implemented? Reference specific files or tables.
- **Red Flags**: Any architecture violations, scope creep, or maintenance risks?

#### Output 4: Ranked Recommendations

Rank the nuggets by overall score and provide:
1. **Top 3 to prioritize** with specific next steps
2. **Nuggets to defer** with explanation
3. **Cross-nugget dependencies** (which nuggets enable or require others)

#### Output 5: Integration Mapping

For each nugget, specify:
- Which vision documents need updates
- Which stages in the 25-stage workflow are affected
- Which database tables/schemas need changes
- Whether it belongs in EHG (runtime) or EHG_Engineer (governance) or both

## Constraints

- Do NOT make any changes to the codebase or docs
- Do NOT use any pre-existing rubric - design your own
- Focus on evaluation and recommendations only
- Be explicit about uncertainty (if you can't find evidence for something, say so)
- Consider the Chairman's perspective: governance, observability, capital efficiency, self-improvement

## Output Format

Structure your response as:
1. **Anti-Gravity Rubric v1** (your rubric definition)
2. **Scoring Table** (using your rubric)
3. **Detailed Rationale** (per nugget)
4. **Integration Mapping** (per nugget)
5. **Ranked Recommendations**
6. **Cross-Nugget Dependencies**
7. **Summary for Chairman** (1 paragraph)

## Note

A separate evaluator (Claude) has already created "Claude Rubric v0" and "Claude Evaluation v0" using a different rubric. Your rubric and evaluation will be compared against Claude's for cross-validation. Design your rubric independently - do not try to match or complement Claude's approach.
```

---

# PART 4: Claude's Independent Evaluation (Claude Evaluation v0)

---

## Claude Evaluation v0 - Scoring Table

| Golden Nugget | Strategic | Architectural | Feasibility | Governance | Token Econ | Compounding | Risk | **Overall** |
|---------------|-----------|---------------|-------------|------------|------------|-------------|------|---------|
| 1. Token Budget Profiles | 5 | 4 | 4 | 5 | 5 | 4 | 4 | **4.45** |
| 2. Simulation Mode | 5 | 3 | 2 | 4 | 4 | 5 | 3 | **3.70** |
| 3. Assumptions vs Reality | 5 | 4 | 3 | 5 | 4 | 5 | 4 | **4.25** |
| 4. Feature Hypotheses | 4 | 4 | 3 | 4 | 4 | 4 | 4 | **3.85** |
| 5. Four Buckets | 5 | 4 | 4 | 5 | 3 | 3 | 4 | **4.05** |
| 6. Crew Tournaments | 4 | 4 | 3 | 4 | 5 | 5 | 3 | **4.00** |
| 7. Integration Points | 3 | 5 | 5 | 3 | 3 | 2 | 5 | **3.60** |

---

## Claude Evaluation v0 - Detailed Rationale

### 1. Token Budget Profiles (Overall: 4.45) - **PROCEED**

**Strengths**: Directly addresses the "tokens as capital" thesis. Schema additions are straightforward (new table + view). Enables portfolio-level analytics that don't exist today. High governance value - Chairman can see ROI per venture.

**Concerns**: Attribution of shared CrewAI jobs needs careful design. Hard vs soft budget limits is a UX/governance decision, not a technical blocker.

**Integration Points**: New `venture_token_ledger` table in Supabase. Tracking hooks in CrewAI job runner. Dashboard widget in Chairman Console.

**Risk Assessment**: Low-medium. Worst case is inaccurate attribution, which is recoverable.

### 2. Simulation Mode (Overall: 3.70) - **REFINE**

**Strengths**: Transformative for the "AI VC" vision - simulating ventures before committing real resources is the core value prop. Monte Carlo outcomes give probabilistic decision support.

**Concerns**: Requires significant new infrastructure. Boundary between sim and runtime is complex. Risk of sim results being treated as facts.

**Integration Points**: Likely needs a separate service or at minimum a `sim_*` table prefix. Integration with Assumption Sets is critical.

**Risk Assessment**: Medium-high. Scope creep is the main risk - simulation can become infinitely complex.

### 3. Assumptions vs Reality (Overall: 4.25) - **PROCEED**

**Strengths**: Core to self-calibration. Versioned Assumption Sets are clean conceptually. Reality reports give Chairman visibility into model accuracy. Enables global calibration over time.

**Concerns**: "Reality" data collection requires post-launch instrumentation. Killed ventures can't fully validate assumptions.

**Integration Points**: `assumption_sets` table. Post-launch data collection in Stage 23-25. Calibration reports as venture artifacts.

**Risk Assessment**: Low-medium. Worst case is sparse reality data, which degrades value but doesn't break anything.

### 4. Feature Hypotheses (Overall: 3.85) - **PROCEED**

**Strengths**: Natural extension of Assumptions vs Reality at feature level. Pre-release simulation is valuable for high-stakes features. Creates a learning loop for feature impact estimates.

**Concerns**: Feature isolation for measurement is hard. Requires discipline to create hypotheses before building.

**Integration Points**: Extends `venture_artifacts` with feature hypothesis type. Links to simulation runs. Post-release measurement hooks.

**Risk Assessment**: Medium. Attribution of outcomes to specific features is inherently noisy.

### 5. Four Buckets (Overall: 4.05) - **PROCEED**

**Strengths**: Structural hallucination control is more robust than prompt engineering. Forces explicit epistemic status on all claims. "At least one Unknown" rule forces honesty about gaps.

**Concerns**: Enforcement without slowing workflow is tricky. Training agents to classify correctly requires iteration.

**Integration Points**: `epistemic_classification` JSONB column on `venture_artifacts`. Stage gate validation functions. Agent prompt updates.

**Risk Assessment**: Low. Worst case is classification errors, which are auditable and correctable.

### 6. Crew Tournaments (Overall: 4.00) - **PROCEED**

**Strengths**: Token efficiency gains from sweet spot learning are concrete and measurable. Tournament pattern produces higher-quality outputs for key stages. Meta-learning is valuable long-term.

**Concerns**: Cold start problem - need initial data before learning works. Manager scoring rubric design is non-trivial.

**Integration Points**: `crew_configurations` and `crew_run_logs` tables. CrewAI job runner modifications. Learning analysis as periodic job.

**Risk Assessment**: Medium. Poorly calibrated rubrics could lead to wrong sweet spot conclusions.

### 7. Integration Points (Overall: 3.60) - **DEFER (Documentation Only)**

**Strengths**: Valuable for clarity and coordination. Ensures other nuggets don't violate boundaries.

**Concerns**: This is documentation, not a capability. Value comes from the other nuggets it maps.

**Integration Points**: This document itself. Updates to ADR-002 if needed.

**Risk Assessment**: Very low. It's a map, not a mechanism.

---

## Claude Evaluation v0 - Summary

**Biggest Upside**: Token Budget Profiles (4.45) and Assumptions vs Reality (4.25) are high-value, moderate-effort additions that directly serve the Chairman's vision. Four Buckets (4.05) is the highest-leverage hallucination control mechanism.

**Greatest Risk/Complexity**: Simulation Mode (3.70) is transformative but has the highest implementation complexity and scope creep risk. It should be approached as a Phase 2 initiative after Token Budget Profiles and Assumptions vs Reality are in place.

**Recommended Priority Order**:
1. Token Budget Profiles (enables measurement for everything else)
2. Four Buckets (foundational for quality)
3. Assumptions vs Reality (core calibration loop)
4. Crew Tournaments (token efficiency)
5. Feature Hypotheses (extends #3 to features)
6. Simulation Mode (Phase 2)
7. Integration Points (ongoing documentation)

---

# PART 5: Synthesis & Proposed Enhancements

---

## Executive Summary for Chairman

The seven golden nuggets represent a coherent vision for transforming EHG from a deterministic venture pipeline into a self-calibrating, capital-efficient AI venture engine. After independent evaluation, **four nuggets score above 4.0** and should proceed immediately: Token Budget Profiles, Assumptions vs Reality, Four Buckets, and Crew Tournaments. These form a "Phase 1" that creates the measurement, classification, and learning infrastructure needed for the more ambitious Simulation Mode in Phase 2.

The cross-nugget dependencies are clear: Token Budget Profiles must come first (it's the accounting layer), followed by Assumptions vs Reality (the calibration loop) and Four Buckets (the quality control), with Crew Tournaments layered on top (the efficiency optimizer). Simulation Mode is the capstone that uses all of the above but requires them to be in place first.

Total estimated effort for Phase 1: **4-6 weeks** (Token Budget + Four Buckets + Assumptions vs Reality + Crew Tournaments MVP).
Total estimated effort for Phase 2: **6-8 weeks** (Simulation Mode + Feature Hypotheses).

---

## Ranked Enhancements

### Priority 1: Token Budget Profiles (Score: 4.45)

**What Changes**:
- New `venture_token_ledger` table
- Token tracking hooks in CrewAI job runner
- Budget profile JSONB in `ventures.metadata`
- Dashboard widget showing token usage per venture/stage

**Location**:
- Schema: Governance (EHG_Engineer)
- Tracking: Runtime (EHG)
- UI: Runtime (Chairman Console)

**Effort**: Low-Medium (1-2 weeks)

**Expected Benefit**: Enables all token economics analysis; makes cost-per-venture visible

### Priority 2: Four Buckets Hallucination Control (Score: 4.05)

**What Changes**:
- `epistemic_classification` JSONB column on `venture_artifacts`
- Stage gate validation function (enforces at least one Unknown, all Facts have sources)
- Agent prompt updates with classification instructions
- UI indicators for bucket types

**Location**:
- Schema: Governance (EHG_Engineer)
- Enforcement: Both Runtime and LEO agents
- UI: Runtime (artifact display)

**Effort**: Medium (2-3 weeks)

**Expected Benefit**: Structural hallucination reduction; forces explicit uncertainty

### Priority 3: Assumptions vs Reality Calibration (Score: 4.25)

**What Changes**:
- `assumption_sets` table (versioned, per-venture)
- Assumption Set V1 created at Stage 3 validation
- Reality data collection at Stage 23-25
- Assumptions vs Reality Report artifact type
- Global calibration job (monthly)

**Location**:
- Schema: Governance (EHG_Engineer)
- Data Collection: Runtime (EHG)
- Analysis: Governance (EHG_Engineer)

**Effort**: Medium (2-3 weeks)

**Expected Benefit**: Self-calibrating simulation priors; reduces systematic bias

### Priority 4: Crew Tournaments (Score: 4.00)

**What Changes**:
- `crew_configurations` and `crew_run_logs` tables
- Tournament orchestration in CrewAI job runner
- Sweet spot learning analysis job (weekly)
- Dashboard for crew configuration performance

**Location**:
- Schema: Governance (EHG_Engineer)
- Execution: Runtime (EHG)
- Analysis: Governance (EHG_Engineer)

**Effort**: Medium-High (3-4 weeks)

**Expected Benefit**: Measurable token efficiency gains; quality improvements for key stages

### Priority 5: Feature Hypotheses (Score: 3.85)

**What Changes**:
- Feature hypothesis artifact type
- Pre-release simulation integration (requires Simulation Mode)
- Post-release measurement hooks
- Feature-level calibration reports

**Location**: Runtime (EHG)

**Effort**: Medium (2-3 weeks, after Simulation Mode)

**Expected Benefit**: Feature-level learning; better impact estimates

### Priority 6: Simulation Mode (Score: 3.70)

**What Changes**:
- New `ehg-simulator` service or `sim_*` table prefix
- Venture simulation model (segments, competitors, Monte Carlo)
- Integration with Assumption Sets
- Simulation run artifacts

**Location**: New Service (or isolated EHG subsystem)

**Effort**: High (6-8 weeks)

**Expected Benefit**: Simulate before committing; probabilistic decision support

### Priority 7: Integration Points (Score: 3.60)

**What Changes**:
- This document updated as implementation proceeds
- ADR-002 addendum if needed

**Location**: Documentation

**Effort**: Ongoing (0.5 days per major change)

**Expected Benefit**: Coordination; prevents boundary violations

---

## Cross-Nugget Dependencies

```
Token Budget Profiles
      │
      ├──► Four Buckets (can be parallel)
      │
      ├──► Assumptions vs Reality (requires token tracking)
      │         │
      │         └──► Feature Hypotheses (extends A vs R to features)
      │
      └──► Crew Tournaments (requires token tracking)
                │
                └──► Simulation Mode (uses all of the above)
```

---

## Implementation Phases

### Phase 1: Foundation (Weeks 1-6)
1. Token Budget Profiles (Week 1-2)
2. Four Buckets (Week 2-4)
3. Assumptions vs Reality (Week 3-5)
4. Crew Tournaments MVP (Week 4-6)

### Phase 2: Simulation & Learning (Weeks 7-14)
5. Simulation Mode Core (Week 7-12)
6. Feature Hypotheses (Week 10-12)
7. Sweet Spot Learning (Week 12-14)

---

## Bullet-Point Summary for Chairman

**Proceed Immediately (Phase 1)**:
- **Token Budget Profiles** (4.45): Foundation for all token economics; 1-2 weeks
- **Four Buckets** (4.05): Structural hallucination control; 2-3 weeks
- **Assumptions vs Reality** (4.25): Self-calibration loop; 2-3 weeks
- **Crew Tournaments** (4.00): Token efficiency optimizer; 3-4 weeks

**Defer to Phase 2**:
- **Simulation Mode** (3.70): High value but high complexity; needs Phase 1 infrastructure
- **Feature Hypotheses** (3.85): Extends Assumptions vs Reality; wait for Simulation Mode

**Key Insight**: Token Budget Profiles is the keystone - it enables measurement for everything else. Start there.

**Risk to Watch**: Simulation Mode scope creep. Define a minimal viable sim (market segments + competitor archetypes + Monte Carlo outcomes) and resist adding complexity.

---

# PART 6: Cross-Validation Analysis (Claude vs Anti-Gravity)

---

## Anti-Gravity Rubric v1 (Primary Rubric)

**Date**: 2025-12-09
**Evaluator**: Anti-Gravity (Deepmind Agentic Coding Assistant)

### Scale: 0-5

| Score | Label | Definition |
|-------|-------|------------|
| 0 | Critical Fail | Violates core architecture or poses unacceptable risk |
| 1 | Weak | Low impact, high effort, or significant misalignment |
| 2 | Marginal | Some value, but major gaps or friction |
| 3 | Solid | Good fit, clear value, implementable |
| 4 | Strong | High impact, leverages existing strengths, elegant |
| 5 | Transformative | Game-changer. Core to the vision. "Must have" |

### Evaluation Criteria (6 total, weighted)

| Criterion | Weight | Definition |
|-----------|--------|------------|
| **Strategic Alignment** | 20% | Does this advance the vision of an "AI-run VC firm"? |
| **Architectural Integrity** | 20% | Does it respect the "Single Platform, Multi-Venture" constraints and LEO Protocol? |
| **Governance & Observability** | 15% | Does it give the Chairman better control with less effort? |
| **Capital Efficiency** | 15% | Does it optimize token ROI and reduce waste? |
| **Reliability & Hallucination Control** | 15% | Does it structurally prevent AI drift? |
| **Compounding Intelligence** | 15% | Does the system get smarter with use? |

### Formula

```
Overall = (Strat × 0.2) + (Arch × 0.2) + (Gov × 0.15) + (Cap × 0.15) + (Rel × 0.15) + (Comp × 0.15)
```

### Thresholds

| Score Range | Verdict |
|-------------|---------|
| 4.5+ | ACCELERATE |
| 4.0 - 4.49 | ACCELERATE / REFINE |
| 3.5 - 3.99 | PROCEED |
| 3.0 - 3.49 | REFINE |
| < 3.0 | DEFER / REJECT |

---

## Claude's Independent Scoring Using Anti-Gravity Rubric v1

| Golden Nugget | Strat | Arch | Gov | Cap | Rel | Comp | **Claude** | **A-G** | **Δ** |
|---------------|-------|------|-----|-----|-----|------|------------|---------|-------|
| 1. Tokens as Investment | 5 | 4 | 5 | 5 | 3 | 4 | **4.35** | **4.35** | 0 |
| 2. Simulation Mode | 5 | 2 | 4 | 4 | 3 | 5 | **3.85** | **4.10** | -0.25 |
| 3. Assumptions vs Reality | 5 | 5 | 5 | 4 | 5 | 5 | **4.85** | **4.85** | 0 |
| 4. Feature Hypotheses | 4 | 4 | 4 | 3 | 4 | 4 | **3.85** | **3.85** | 0 |
| 5. Four Buckets | 5 | 3 | 4 | 3 | 5 | 3 | **3.85** | **3.85** | 0 |
| 6. Crew Tournaments | 4 | 4 | 3 | 3 | 4 | 5 | **3.85** | **3.80** | +0.05 |
| 7. Integration Points | 5 | 5 | 5 | 3 | 4 | 4 | **4.40** | **4.40** | 0 |

---

## Rationale for Scoring Differences

### Simulation Mode (Claude: 3.85 vs A-G: 4.10)

**Where Claude differs**: Claude scored Reliability lower (3) due to the "Sync Hell" risk Anti-Gravity correctly identified. Simulations that drift from runtime don't just fail to help—they actively mislead. The reliability score should reflect this systemic risk more heavily.

**Agreement**: Both evaluators agree Simulation Mode should be deferred until the foundation (Assumptions, Tokens) is solid.

### Crew Tournaments (Claude: 3.85 vs A-G: 3.80)

**Marginal difference**: Claude scored Reliability slightly higher (4) because tournament selection *structurally* guarantees better outputs—it's a form of ensemble reliability. However, both agree the token burn risk is real, so Capital Efficiency stays at 3.

---

## Consensus Rankings

| Rank | Nugget | Claude | A-G | Avg | Verdict |
|------|--------|--------|-----|-----|---------|
| 1 | Assumptions vs Reality | 4.85 | 4.85 | **4.85** | ACCELERATE |
| 2 | Integration Points | 4.40 | 4.40 | **4.40** | ACCELERATE |
| 3 | Tokens as Investment | 4.35 | 4.35 | **4.35** | ACCELERATE |
| 4 | Simulation Mode | 3.85 | 4.10 | **3.98** | REFINE (Defer to Phase 2) |
| 5 | Four Buckets | 3.85 | 3.85 | **3.85** | PROCEED |
| 6 | Feature Hypotheses | 3.85 | 3.85 | **3.85** | PROCEED |
| 7 | Crew Tournaments | 3.85 | 3.80 | **3.83** | PROCEED |

---

# PART 7: Chairman Priority Note & Refined Roadmap

---

## Chairman Priority Note (2025-12-09)

> **Non-Negotiable Foundation (Phase 1)**:
> - Assumptions vs Reality
> - Tokens as Investment
> - Four Buckets
> - Integration Points
>
> **Strategic Experiment (Chairman Fast-Follow)**:
> - **Crew Tournaments** is elevated as a strategic experiment the Chairman wants to explore early, in a narrow pilot, to:
>   1. Improve quality of stage outputs through competitive selection
>   2. Generate early data on token cost vs quality for the tournament pattern
>   3. Expand the use of CrewAI agents in the venture workflow
>
> The Crew Tournament pilot should begin as soon as Phase 1 foundations are *sketched out* (schemas designed, not necessarily fully implemented). This is a "fast-follow" that runs in parallel with Phase 1 completion.

---

## Refined Roadmap

### Phase 1: The Foundation (4-6 weeks)

**Priority Order** (based on consensus + dependencies):

| Order | Nugget | Score | Rationale |
|-------|--------|-------|-----------|
| **1** | Assumptions vs Reality | 4.85 | Highest score. Foundation for all learning. Simple table, massive value. |
| **2** | Tokens as Investment | 4.35 | "The Bank". Enables capital efficiency measurement for everything else. |
| **3** | Four Buckets | 3.85 | "The Truth Filter". Must be baked into artifacts before generating more. |
| **4** | Integration Points | 4.40 | Documentation pass. Ensures 1-3 are placed correctly. |

**Phase 1 Vision Doc Enhancements:**
- Update `ADR-002-VENTURE-FACTORY-ARCHITECTURE.md` with token budget profiles
- Add "Epistemic Classification" section to artifact documentation
- Create `ADR-003-ASSUMPTION-TRACKING.md`

**Phase 1 25-Stage Workflow Enhancements:**

| Stage | Enhancement |
|-------|-------------|
| 1-2 (Idea/Critique) | Create Assumption Set V1 |
| 3 (Validation) | First assumption checkpoint; Four Buckets required |
| 5 (Profitability) | Token budget profile confirmed |
| 23 (Launch) | Reality data collection begins |
| 24-25 (Analytics) | Assumptions vs Reality Report generated |

**Phase 1 Database Changes:**
- `assumption_sets` table (Priority 1)
- `venture_token_ledger` table (Priority 2)
- `venture_artifacts.epistemic_classification` JSONB column (Priority 3)

---

### Chairman Fast-Follow: Crew Tournament Pilot

**Status**: Approved for early exploration
**Timing**: Begin when Phase 1 schemas are designed (Week 2-3)
**Dependency**: Does NOT require Simulation Mode

See **PART 8: Crew Tournament Pilot Design** below.

---

### Phase 2: The Optimization Layer (6-8 weeks)

| Order | Nugget | Score | Rationale |
|-------|--------|-------|-----------|
| **5** | Feature Hypotheses | 3.85 | Extends Assumptions to feature level. Requires Phase 1. |
| **6** | Crew Tournaments (Full) | 3.83 | Expand pilot learnings to more stages. |
| **7** | Simulation Mode | 3.98 | Capstone. Requires all of the above. Start minimal. |

**Phase 2 Vision Doc Enhancements:**
- Add "Feature Hypothesis Card" to artifact types
- Expand `ADR-004-CREW-TOURNAMENT-PATTERN.md` based on pilot learnings
- Add "Simulation Mode" appendix to ADR-002 (NOT a separate service yet)

**Phase 2 25-Stage Workflow Enhancements:**

| Stage | Enhancement |
|-------|-------------|
| 10-12 (Brand/GTM) | Crew Tournament expansion (if pilot successful) |
| 13-16 (Blueprint) | Feature Hypotheses created; Crew Tournament for architecture |
| 17-20 (Build Loop) | Feature Hypothesis tracking per SD |
| 3, 5 (optional) | Simulation Mode "what-if" runs |

**Anti-Gravity's Key Insight (Adopted)**:
> "Do NOT build a separate service yet. Run 'Simulations' as just a special type of `crewai_job` that doesn't persist side effects."

This avoids the "Sync Hell" risk both evaluators identified.

---

# PART 8: Crew Tournament Pilot Design

---

## Overview

A small, low-risk pilot to test the Crew Tournament pattern in the 25-stage venture workflow before committing to full implementation.

**Goal**: Validate that tournament-style agent competition produces measurably better artifacts at acceptable token cost.

---

## Pilot Scope

### Eligible Stages (Pick 1-2 for Pilot)

| Stage | Artifact Type | Why Tournament Makes Sense |
|-------|---------------|---------------------------|
| **11 (Brand & Messaging)** | `brand_messaging_options` | Creative work benefits from diversity; easy to score |
| **14 (Route Map)** | `route_map` | Architectural decisions have high leverage; multiple valid approaches |

**Recommendation**: Start with **Stage 11 (Brand & Messaging)** because:
1. Outputs are easier to evaluate (subjective but clear criteria)
2. Lower downstream risk than architecture decisions
3. Chairman can personally review and score to calibrate the system

---

## Pilot Constraints

| Constraint | Value | Rationale |
|------------|-------|-----------|
| `num_workers` | 3 | Minimum for meaningful competition |
| `manager_count` | 1 | Single manager to score and select |
| `peer_review` | OFF | Keep pilot simple |
| `token_ceiling_per_run` | 50,000 | Hard cap; fail gracefully if exceeded |
| `worker_model` | `claude-sonnet-4-20250514` | Cost-effective for workers |
| `manager_model` | `claude-sonnet-4-20250514` | Same model for consistency |

---

## Tournament Flow (Pilot Version)

```
Stage 11: Brand & Messaging Tournament
│
├── [Worker 1] → Candidate A + Self-Score (0-100)
├── [Worker 2] → Candidate B + Self-Score (0-100)
├── [Worker 3] → Candidate C + Self-Score (0-100)
│
├── [Manager] → Reviews all candidates
│   ├── Scores each candidate on rubric (0-100)
│   ├── Selects winner (or requests hybrid)
│   └── Explains selection rationale
│
└── Output: Selected artifact + tournament_log
```

---

## Scoring Rubric (Pilot: Brand & Messaging)

Workers and Manager use the same rubric:

| Criterion | Weight | Definition |
|-----------|--------|------------|
| **Clarity** | 25% | Is the message immediately understandable? |
| **Differentiation** | 25% | Does it stand out from competitors? |
| **Audience Fit** | 25% | Does it resonate with the target persona? |
| **Memorability** | 15% | Is it sticky? Will users remember it? |
| **Consistency** | 10% | Does it align with prior venture artifacts (idea, validation)? |

**Score Calculation**: `Score = (Clarity×0.25) + (Diff×0.25) + (Audience×0.25) + (Memory×0.15) + (Consist×0.10)`

---

## Logging Schema (Minimal for Pilot)

```sql
-- Pilot: Lightweight logging without full schema
-- Store in venture_artifacts.metadata for now

-- Example metadata structure for a tournament run:
{
  "tournament": {
    "stage": 11,
    "config": {
      "num_workers": 3,
      "worker_model": "claude-sonnet-4-20250514",
      "manager_model": "claude-sonnet-4-20250514",
      "token_ceiling": 50000
    },
    "workers": [
      {"id": "w1", "self_score": 78, "tokens": 4200},
      {"id": "w2", "self_score": 85, "tokens": 3800},
      {"id": "w3", "self_score": 72, "tokens": 4500}
    ],
    "manager": {
      "scores": {"w1": 75, "w2": 88, "w3": 70},
      "selected": "w2",
      "rationale": "Best audience fit and differentiation",
      "tokens": 2100
    },
    "total_tokens": 14600,
    "created_at": "2025-12-15T10:30:00Z"
  }
}
```

**Note**: Full `crew_configurations` and `crew_run_logs` tables will be designed in Phase 2 based on pilot learnings.

---

## Token Budget Integration (Tie to Nugget 1)

Even without the full `venture_token_ledger`, the pilot should:

1. **Track tokens per tournament run** in artifact metadata
2. **Enforce hard ceiling** (50K tokens) with graceful failure
3. **Report total tournament cost** to Chairman after each run

This generates the data needed to inform the full Token Budget Profile design.

---

## Success Criteria for Pilot

| Metric | Target | How to Measure |
|--------|--------|----------------|
| **Quality Improvement** | Manager-selected artifact scores ≥15% higher than single-agent baseline | Compare to historical Stage 11 outputs |
| **Token Efficiency** | Total tournament cost ≤3x single-agent cost | Compare token usage |
| **Chairman Satisfaction** | Qualitative approval | Chairman reviews 3-5 tournament outputs |
| **No Blockers** | Pilot completes without architectural issues | Retrospective after 5 runs |

---

## Pilot Timeline

| Week | Activity |
|------|----------|
| Week 2-3 | Design tournament prompts for Stage 11 |
| Week 3-4 | Run 3-5 tournament trials on test ventures |
| Week 4-5 | Analyze results; Chairman review |
| Week 5-6 | Decision: Expand to Stage 14 or refine Stage 11 |

---

## What This Pilot Does NOT Include

- **Peer Review**: Disabled for simplicity
- **Sweet Spot Learning**: No automated optimization yet
- **Multiple Stages**: Just Stage 11 initially
- **Full Schema**: Using artifact metadata, not dedicated tables
- **Simulation Mode**: Tournaments run on real ventures only

These will be addressed in Phase 2 if the pilot succeeds.

---

# PART 9: Summary for Chairman

---

## Evaluation Consensus

Both Claude and Anti-Gravity independently evaluated the seven golden nuggets using Anti-Gravity's rubric (now the primary rubric). Key findings:

1. **Assumptions vs Reality** (4.85) is the highest-value nugget - the foundation for all learning
2. **Tokens as Investment** (4.35) enables capital efficiency measurement
3. **Four Buckets** (3.85) provides structural hallucination control
4. **Simulation Mode** (3.98 avg) should be deferred due to "Sync Hell" risk

## Refined Roadmap

**Phase 1 (Foundation)**: Assumptions → Tokens → Four Buckets → Integration Points

**Chairman Fast-Follow (Pilot)**: Crew Tournaments at Stage 11 (Brand & Messaging)
- 3 workers, 1 manager, 50K token ceiling
- Generates early data on quality vs cost tradeoff
- No dependency on Simulation Mode

**Phase 2 (Optimization)**: Feature Hypotheses → Crew Tournaments (Full) → Simulation Mode

## Key Insight

The Crew Tournament pilot can run *in parallel* with Phase 1 completion. It doesn't block on the full token ledger or assumption sets - it just needs to track its own token usage and report results. This satisfies the Chairman's interest in expanding CrewAI usage while maintaining the foundational priority order.

---

*Document updated: 2025-12-09*
*Primary Rubric: Anti-Gravity Rubric v1*
*Status: Awaiting Chairman review before implementation*
