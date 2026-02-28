---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# Vision v2 Database Schema Specification



## Table of Contents

- [Metadata](#metadata)
- [Overview](#overview)
  - [RLS Posture (Prototype vs Production)](#rls-posture-prototype-vs-production)
  - [Single-User Production Mode (Recommended for Rick-only)](#single-user-production-mode-recommended-for-rick-only)
  - [Service Role Handling (Production Safety)](#service-role-handling-production-safety)
- [0. Core Tables (Portfolios, Ventures, Crews)](#0-core-tables-portfolios-ventures-crews)
  - [0.1 portfolios](#01-portfolios)
  - [0.2 ventures](#02-ventures)
  - [0.2.1 venture_inception_briefs (Stage 0 Primary Artifact)](#021-venture_inception_briefs-stage-0-primary-artifact)
  - [0.2.2 venture_stage_transitions (Authoritative History + Promotion Audit)](#022-venture_stage_transitions-authoritative-history-promotion-audit)
  - [0.2.3 Stage 0 → Stage 1 Promotion Function (Atomic + Idempotent)](#023-stage-0-stage-1-promotion-function-atomic-idempotent)
  - [0.3 crewai_crews](#03-crewai_crews)
  - [0.4 Opportunity Discovery (Deal Flow) Tables (AI-Generated Blueprints)](#04-opportunity-discovery-deal-flow-tables-ai-generated-blueprints)
- [1. Command Chain Tables](#1-command-chain-tables)
  - [1.1 chairman_directives](#11-chairman_directives)
  - [1.2 directive_delegations](#12-directive_delegations)
  - [1.3 agent_task_contracts](#13-agent_task_contracts)
  - [1.4 agent_artifacts](#14-agent_artifacts)
  - [1.5 venture_artifacts (with versioning)](#15-venture_artifacts-with-versioning)
  - [1.6 chairman_alerts](#16-chairman_alerts)
  - [1.7 venture_budget_settings](#17-venture_budget_settings)
- [2. Venture Stage Management](#2-venture-stage-management)
  - [2.0 lifecycle_stage_config](#20-lifecycle_stage_config)
  - [2.1 venture_stage_assignments](#21-venture_stage_assignments)
  - [2.2 chairman_decisions](#22-chairman_decisions)
- [3. Golden Nugget Tables](#3-golden-nugget-tables)
  - [3.1 venture_token_ledger](#31-venture_token_ledger)
  - [3.2 assumption_sets](#32-assumption_sets)
- [4. Database Functions](#4-database-functions)
  - [4.1 fn_chairman_briefing()](#41-fn_chairman_briefing)
  - [4.2 fn_advance_venture_stage()](#42-fn_advance_venture_stage)
- [5. Migration File](#5-migration-file)
- [6. Table Relationships](#6-table-relationships)
- [7. Blue Sky Architecture Tables](#7-blue-sky-architecture-tables)
  - [7.1 agent_execution_traces (Observability)](#71-agent_execution_traces-observability)
  - [7.2 crew_prompt_versions (Prompt Versioning)](#72-crew_prompt_versions-prompt-versioning)
  - [7.3 model_registry (Model Abstraction)](#73-model_registry-model-abstraction)
  - [7.4 circuit_breaker_events (Cost Protection)](#74-circuit_breaker_events-cost-protection)
- [8. Table Relationships (Updated)](#8-table-relationships-updated)
- [9. Hierarchical Agent Tables](#9-hierarchical-agent-tables)
  - [9.1 Table Summary](#91-table-summary)
  - [9.2 Key Relationships](#92-key-relationships)
- [10. Operational Handoff Tables (OpenAI Codex Assessment)](#10-operational-handoff-tables-openai-codex-assessment)
  - [10.1 operational_handoff_packets](#101-operational_handoff_packets)
  - [10.2 venture_constitutions](#102-venture_constitutions)
  - [10.3 ceo_mode_transitions](#103-ceo_mode_transitions)
  - [10.4 Table Relationships (Operational Phase)](#104-table-relationships-operational-phase)
- [11. Strict RLS Policies (OpenAI Codex Assessment - P1 Priority)](#11-strict-rls-policies-openai-codex-assessment---p1-priority)
  - [11.0 Modes: Single-User Production vs Multi-User Future](#110-modes-single-user-production-vs-multi-user-future)
  - [11.1 Access Control Foundation Tables](#111-access-control-foundation-tables)
  - [11.2 Reusable RLS Helper Functions](#112-reusable-rls-helper-functions)
  - [11.3 Strict RLS Policy Patterns](#113-strict-rls-policy-patterns)
  - [11.4 RLS Migration Strategy](#114-rls-migration-strategy)
  - [11.5 Policy Reference Table](#115-policy-reference-table)
- [References](#references)

## Metadata
- **Category**: Database
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-12
- **Tags**: database, api, testing, unit

**Version:** 1.0
**Status:** APPROVED
**Last Updated:** December 2025
**Parent Document:** [00_VISION_V2_CHAIRMAN_OS.md](../00_VISION_V2_CHAIRMAN_OS.md)

---

## Overview

This specification defines the complete database schema for the Chairman's Operating System. All tables enforce the 25-stage venture lifecycle and support the Command Chain: Rick → EVA → crewAI.

### RLS Posture (Prototype vs Production)

This document contains **two RLS modes**:
- **Prototype mode (current examples)**: permissive policies like `authenticated USING (true)` to accelerate development.
- **Production mode (required before launch)**: strict, scope-based policies enforcing portfolio/venture isolation (see the RLS hardening sections later in this document and `docs/vision/specs/10-knowledge-architecture.md`).

**Rule:** If a table is venture- or portfolio-scoped, it MUST NOT ship with permissive `authenticated USING (true)` policies.

### Single-User Production Mode (Recommended for Rick-only)

Even with one human user, production safety requires a strict boundary:
- **Rick (human)** uses role `authenticated`
- **EVA/agents** use role `service_role`

### Service Role Handling (Production Safety)

`service_role` is effectively **root** for your database (it bypasses RLS). This is safe only if you enforce operational constraints:

- **Never expose the service key to the client**: the service key must only exist in server-side environments (API server, worker, Supabase Edge Function, etc.).
- **Separate runtime identities**:
  - **Client/UI**: uses `authenticated` (Rick)
  - **Agent runtime**: uses `service_role` (EVA/crews)
- **Least privilege by architecture**:
  - Prefer `authenticated` + strict policies (e.g., `fn_is_chairman()`) for human actions.
  - Use `service_role` only for automation that must write across scoped tables.
- **Auditability**:
  - All `service_role` writes SHOULD stamp `correlation_id`, `created_by` (agent id where applicable), and be traceable via `agent_execution_traces` / `tool_usage_ledger`.
- **Rotation + storage**:
  - Store service credentials in a secret manager (or Supabase secrets), not `.env` committed to git.
  - Rotate keys on a schedule and immediately on suspected compromise.

Use a single source of truth for the Chairman identity and reusable helper functions:

```sql
-- Singleton config row (Rick-only production mode)
CREATE TABLE IF NOT EXISTS app_config (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE,
  chairman_user_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_config_chairman_select" ON app_config
  FOR SELECT TO authenticated
  USING (chairman_user_id = auth.uid());

CREATE POLICY "app_config_service_role" ON app_config
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Helper predicates
CREATE OR REPLACE FUNCTION fn_is_service_role()
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT current_setting('role', true) = 'service_role'
$$;

CREATE OR REPLACE FUNCTION fn_is_chairman()
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT fn_is_service_role()
  OR EXISTS (
    SELECT 1 FROM app_config cfg
    WHERE cfg.id = TRUE AND cfg.chairman_user_id = auth.uid()
  )
$$;
```

---

## 0. Core Tables (Portfolios, Ventures, Crews)

These tables are foundational and are referenced throughout the rest of the schema.

### 0.1 portfolios

```sql
CREATE TABLE IF NOT EXISTS portfolios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "portfolios_select" ON portfolios
  FOR SELECT TO authenticated USING (fn_is_chairman());

CREATE POLICY "portfolios_write" ON portfolios
  FOR ALL TO authenticated USING (fn_is_chairman()) WITH CHECK (fn_is_chairman());

CREATE POLICY "portfolios_service_role" ON portfolios
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

### 0.2 ventures

```sql
CREATE TABLE IF NOT EXISTS ventures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID REFERENCES portfolios(id) ON DELETE SET NULL,
  name VARCHAR(200) NOT NULL,
  problem_statement TEXT,
  status VARCHAR(20) DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'killed', 'launched')),
  -- Stage 0 = INCEPTION (pre-lifecycle). Stages 1-25 = formal lifecycle.
  -- Rule: ventures.current_stage is the canonical lifecycle stage for the Chairman OS.
  current_stage INT DEFAULT 0 CHECK (current_stage BETWEEN 0 AND 25),
  health_score VARCHAR(10) DEFAULT 'green'
    CHECK (health_score IN ('green', 'yellow', 'red')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_ventures_portfolio ON ventures(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_ventures_status ON ventures(status);
CREATE INDEX IF NOT EXISTS idx_ventures_stage ON ventures(current_stage);

ALTER TABLE ventures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ventures_select" ON ventures
  FOR SELECT TO authenticated USING (fn_is_chairman());

CREATE POLICY "ventures_write" ON ventures
  FOR ALL TO authenticated USING (fn_is_chairman()) WITH CHECK (fn_is_chairman());

CREATE POLICY "ventures_service_role" ON ventures
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

### 0.2.1 venture_inception_briefs (Stage 0 Primary Artifact)

Stage 0 is only safe if it produces a real, versioned artifact that gates promotion into Stage 1.

```sql
CREATE TABLE IF NOT EXISTS venture_inception_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  version INT NOT NULL DEFAULT 1,

  -- Minimal structured content
  entry_method VARCHAR(30) NOT NULL
    CHECK (entry_method IN ('manual', 'competitor_clone', 'blueprint', 'import')),
  venture_vision TEXT NOT NULL,
  initial_concept TEXT NOT NULL,
  notes TEXT,

  -- Optional: tier recommendation + provenance
  tier_recommendation INT CHECK (tier_recommendation IN (0, 1, 2)),
  complexity_confidence NUMERIC(4,3) CHECK (complexity_confidence BETWEEN 0 AND 1),
  assessment_metadata JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inception_brief_version
  ON venture_inception_briefs(venture_id, version);

ALTER TABLE venture_inception_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inception_briefs_select" ON venture_inception_briefs
  FOR SELECT TO authenticated USING (fn_is_chairman());

CREATE POLICY "inception_briefs_write" ON venture_inception_briefs
  FOR ALL TO authenticated USING (fn_is_chairman()) WITH CHECK (fn_is_chairman());

CREATE POLICY "inception_briefs_service_role" ON venture_inception_briefs
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

### 0.2.2 venture_stage_transitions (Authoritative History + Promotion Audit)

This table is the authoritative history of stage transitions, including Stage 0 → Stage 1.

```sql
CREATE TABLE IF NOT EXISTS venture_stage_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  from_stage INT NOT NULL CHECK (from_stage BETWEEN 0 AND 25),
  to_stage INT NOT NULL CHECK (to_stage BETWEEN 0 AND 25),
  reason TEXT,

  -- Link to the inception brief used to justify promotion (Stage 0 → Stage 1)
  inception_brief_id UUID REFERENCES venture_inception_briefs(id) ON DELETE SET NULL,

  correlation_id UUID,
  idempotency_key VARCHAR(255),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_stage_transitions_venture ON venture_stage_transitions(venture_id);
CREATE INDEX IF NOT EXISTS idx_stage_transitions_created ON venture_stage_transitions(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_stage_transitions_idempotency
  ON venture_stage_transitions(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE venture_stage_transitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stage_transitions_select" ON venture_stage_transitions
  FOR SELECT TO authenticated USING (fn_is_chairman());

CREATE POLICY "stage_transitions_write" ON venture_stage_transitions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

### 0.2.3 Stage 0 → Stage 1 Promotion Function (Atomic + Idempotent)

Promotion must be **transactional** and **idempotent**. The recommended implementation uses a SECURITY DEFINER
function invoked from server-side API code (service role), while still enforcing Chairman authorization upstream.

```sql
CREATE OR REPLACE FUNCTION promote_venture_stage0_to_stage1(
  p_venture_id UUID,
  p_inception_brief_id UUID,
  p_reason TEXT,
  p_idempotency_key TEXT,
  p_correlation_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_current_stage INT;
  v_brief RECORD;
BEGIN
  -- Idempotency short-circuit
  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM venture_stage_transitions
      WHERE idempotency_key = p_idempotency_key
    ) THEN
      RETURN jsonb_build_object('success', true, 'idempotent', true);
    END IF;
  END IF;

  SELECT current_stage INTO v_current_stage FROM ventures WHERE id = p_venture_id;
  IF v_current_stage IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Venture not found');
  END IF;
  IF v_current_stage <> 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Venture is not at Stage 0');
  END IF;

  -- Validate inception brief exists and is non-empty
  SELECT * INTO v_brief FROM venture_inception_briefs
  WHERE id = p_inception_brief_id AND venture_id = p_venture_id;

  IF v_brief IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Inception brief not found');
  END IF;
  IF length(trim(coalesce(v_brief.venture_vision, ''))) < 20
     OR length(trim(coalesce(v_brief.initial_concept, ''))) < 20 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Inception brief is incomplete');
  END IF;

  -- Update venture stage
  UPDATE ventures
  SET current_stage = 1, updated_at = NOW()
  WHERE id = p_venture_id;

  -- Record transition (authoritative)
  INSERT INTO venture_stage_transitions (
    venture_id, from_stage, to_stage, reason,
    inception_brief_id, correlation_id, idempotency_key, created_by
  )
  VALUES (
    p_venture_id, 0, 1, p_reason,
    p_inception_brief_id, p_correlation_id, p_idempotency_key, auth.uid()
  );

  RETURN jsonb_build_object('success', true, 'from_stage', 0, 'to_stage', 1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

> Note: Stage scaffolding (creating stage work rows / artifacts) may be performed inside this function if all
> required tables exist, or immediately after in server-side orchestration code. The non-negotiable requirement
> is that Stage progression itself is atomic and recorded exactly once.

### 0.3 crewai_crews

```sql
CREATE TABLE IF NOT EXISTS crewai_crews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_name VARCHAR(200) NOT NULL,
  crew_type VARCHAR(80) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_crewai_crews_unique ON crewai_crews(crew_type);

ALTER TABLE crewai_crews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crewai_crews_select" ON crewai_crews
  FOR SELECT TO authenticated USING (fn_is_chairman());

CREATE POLICY "crewai_crews_manage" ON crewai_crews
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

### 0.4 Opportunity Discovery (Deal Flow) Tables (AI-Generated Blueprints)

Vision v2 supports **autonomous opportunity discovery** that produces **Opportunity Blueprints** without auto-creating ventures.
This section adds the persistence layer required by PRDs such as:

- `SD-BLUEPRINT-GEN-CORE-001` (CrewAI blueprint generation + board review + status tracking)
- `SD-BLUEPRINT-ENGINE-001` (Blueprint browser + scoring + selection signals)

#### 0.4.1 opportunity_sources

Defines enabled sources for discovery (e.g., Reddit/HN/OpenVC/Growjo/imports).

```sql
CREATE TABLE IF NOT EXISTS opportunity_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type VARCHAR(60) NOT NULL
    CHECK (source_type IN ('reddit', 'hackernews', 'openvc', 'growjo', 'manual_import', 'internal')),
  display_name VARCHAR(200) NOT NULL,
  config JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_opportunity_sources_unique
  ON opportunity_sources(source_type);

ALTER TABLE opportunity_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "opportunity_sources_select" ON opportunity_sources
  FOR SELECT TO authenticated USING (fn_is_chairman());

CREATE POLICY "opportunity_sources_manage" ON opportunity_sources
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

#### 0.4.2 opportunity_signals

Raw + normalized “signals” captured from sources (deduped by `content_hash`).

```sql
CREATE TABLE IF NOT EXISTS opportunity_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES opportunity_sources(id) ON DELETE RESTRICT,
  external_id TEXT,
  title TEXT,
  url TEXT,
  captured_at TIMESTAMPTZ DEFAULT NOW(),

  content_hash TEXT NOT NULL, -- used for dedupe
  raw_payload JSONB DEFAULT '{}'::jsonb,
  normalized JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_opportunity_signals_dedupe
  ON opportunity_signals(content_hash);

CREATE INDEX IF NOT EXISTS idx_opportunity_signals_source_time
  ON opportunity_signals(source_id, captured_at DESC);

ALTER TABLE opportunity_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "opportunity_signals_select" ON opportunity_signals
  FOR SELECT TO authenticated USING (fn_is_chairman());

CREATE POLICY "opportunity_signals_manage" ON opportunity_signals
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

#### 0.4.3 blueprint_generation_jobs

Tracks generation runs (manual or scheduled). Supports correlation + idempotency.

```sql
CREATE TABLE IF NOT EXISTS blueprint_generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode VARCHAR(30) NOT NULL CHECK (mode IN ('manual', 'scheduled')),
  status VARCHAR(30) NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  request JSONB DEFAULT '{}'::jsonb,
  config JSONB DEFAULT '{}'::jsonb, -- creativity, risk_tolerance, constraints

  correlation_id UUID,
  idempotency_key VARCHAR(255),

  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_blueprint_jobs_idempotency
  ON blueprint_generation_jobs(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_blueprint_jobs_status
  ON blueprint_generation_jobs(status, created_at DESC);

ALTER TABLE blueprint_generation_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "blueprint_jobs_select" ON blueprint_generation_jobs
  FOR SELECT TO authenticated USING (fn_is_chairman());

CREATE POLICY "blueprint_jobs_manage" ON blueprint_generation_jobs
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

#### 0.4.4 blueprint_generation_events

Append-only event stream for progress/status tracking (UI can poll or stream).

```sql
CREATE TABLE IF NOT EXISTS blueprint_generation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES blueprint_generation_jobs(id) ON DELETE CASCADE,
  event_type VARCHAR(60) NOT NULL,
  message TEXT,
  progress_pct INT CHECK (progress_pct BETWEEN 0 AND 100),
  agent_name VARCHAR(200),
  tokens_used INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blueprint_events_job_time
  ON blueprint_generation_events(job_id, created_at DESC);

ALTER TABLE blueprint_generation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "blueprint_events_select" ON blueprint_generation_events
  FOR SELECT TO authenticated USING (fn_is_chairman());

CREATE POLICY "blueprint_events_manage" ON blueprint_generation_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

#### 0.4.5 opportunity_blueprints

The “deal flow inventory”: AI-generated, reviewable blueprints from signals + context providers.

```sql
CREATE TABLE IF NOT EXISTS opportunity_blueprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  category VARCHAR(80),
  summary TEXT NOT NULL,
  scaffold JSONB DEFAULT '{}'::jsonb,     -- structured hypothesis payload
  evidence JSONB DEFAULT '{}'::jsonb,     -- Four Buckets + citations/provenance

  status VARCHAR(30) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'reviewed', 'approved', 'rejected')),

  generated_from_signal_ids UUID[] DEFAULT '{}'::uuid[],
  generation_job_id UUID REFERENCES blueprint_generation_jobs(id) ON DELETE SET NULL,

  scores JSONB DEFAULT '{}'::jsonb,       -- capability alignment, synergy, risk, etc.

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_opportunity_blueprints_status
  ON opportunity_blueprints(status, updated_at DESC);

ALTER TABLE opportunity_blueprints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "opportunity_blueprints_select" ON opportunity_blueprints
  FOR SELECT TO authenticated USING (fn_is_chairman());

CREATE POLICY "opportunity_blueprints_manage" ON opportunity_blueprints
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

#### 0.4.6 blueprint_board_reviews

7-member “board simulation” review results for a blueprint (consensus + votes).

```sql
CREATE TABLE IF NOT EXISTS blueprint_board_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blueprint_id UUID NOT NULL REFERENCES opportunity_blueprints(id) ON DELETE CASCADE,
  review_job_id UUID REFERENCES blueprint_generation_jobs(id) ON DELETE SET NULL,

  verdict VARCHAR(30) NOT NULL CHECK (verdict IN ('approve', 'reject', 'abstain')),
  consensus NUMERIC(4,3) CHECK (consensus BETWEEN 0 AND 1),
  votes JSONB DEFAULT '[]'::jsonb, -- [{member, vote, rationale}, ...]
  summary TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blueprint_reviews_blueprint_time
  ON blueprint_board_reviews(blueprint_id, created_at DESC);

ALTER TABLE blueprint_board_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "blueprint_reviews_select" ON blueprint_board_reviews
  FOR SELECT TO authenticated USING (fn_is_chairman());

CREATE POLICY "blueprint_reviews_manage" ON blueprint_board_reviews
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

#### 0.4.7 blueprint_selection_signals

Learning loop: captures selection/rejection signals (ties blueprint performance to venture outcomes later).

```sql
CREATE TABLE IF NOT EXISTS blueprint_selection_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blueprint_id UUID NOT NULL REFERENCES opportunity_blueprints(id) ON DELETE CASCADE,
  action VARCHAR(30) NOT NULL CHECK (action IN ('selected', 'rejected', 'dismissed')),
  reason TEXT,

  venture_id UUID REFERENCES ventures(id) ON DELETE SET NULL,
  scores_snapshot JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_blueprint_selection_blueprint_time
  ON blueprint_selection_signals(blueprint_id, created_at DESC);

ALTER TABLE blueprint_selection_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "blueprint_selection_select" ON blueprint_selection_signals
  FOR SELECT TO authenticated USING (fn_is_chairman());

CREATE POLICY "blueprint_selection_write" ON blueprint_selection_signals
  FOR ALL TO authenticated USING (fn_is_chairman()) WITH CHECK (fn_is_chairman());

CREATE POLICY "blueprint_selection_manage" ON blueprint_selection_signals
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

---

## 1. Command Chain Tables

### 1.1 chairman_directives

Stores the Chairman's natural language commands.

```sql
CREATE TABLE IF NOT EXISTS chairman_directives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  command_text TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'active'
    CHECK (status IN ('active', 'delegated', 'completed', 'cancelled')),
  venture_id UUID REFERENCES ventures(id) ON DELETE SET NULL,
  portfolio_id UUID REFERENCES portfolios(id) ON DELETE SET NULL,
  priority VARCHAR(10) DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  eva_interpretation JSONB,
  eva_response TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  delegated_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Audit fields
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_chairman_directives_status ON chairman_directives(status);
CREATE INDEX idx_chairman_directives_venture ON chairman_directives(venture_id);
CREATE INDEX idx_chairman_directives_created ON chairman_directives(created_at DESC);

-- RLS Policies
ALTER TABLE chairman_directives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chairman_directives_select" ON chairman_directives
  FOR SELECT TO authenticated USING (fn_is_chairman());

CREATE POLICY "chairman_directives_insert" ON chairman_directives
  FOR INSERT TO authenticated WITH CHECK (fn_is_chairman());

CREATE POLICY "chairman_directives_update" ON chairman_directives
  FOR UPDATE TO authenticated USING (fn_is_chairman()) WITH CHECK (fn_is_chairman());

CREATE POLICY "service_role_full" ON chairman_directives
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Trigger for updated_at
CREATE TRIGGER update_chairman_directives_timestamp
  BEFORE UPDATE ON chairman_directives
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

**eva_interpretation JSONB Structure:**
```json
{
  "intent": "pivot_venture",
  "entities": {
    "venture_name": "Solara",
    "target_segment": "Enterprise"
  },
  "required_stages": [8, 11],
  "estimated_tokens": 45000,
  "confidence": 0.92
}
```

---

### 1.2 directive_delegations

Tracks EVA's dispatch of directives to crews.

```sql
CREATE TABLE IF NOT EXISTS directive_delegations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  directive_id UUID NOT NULL REFERENCES chairman_directives(id) ON DELETE CASCADE,
  assigned_to_type VARCHAR(20) NOT NULL
    CHECK (assigned_to_type IN ('crew', 'agent', 'human', 'system')),
  assigned_to_crew_id UUID REFERENCES crewai_crews(id),
  task_contract_id UUID REFERENCES agent_task_contracts(id),
  venture_id UUID REFERENCES ventures(id),
  stage_number INT CHECK (stage_number BETWEEN 1 AND 25),

  status VARCHAR(20) DEFAULT 'pending'
    CHECK (status IN ('pending', 'queued', 'in_progress', 'completed', 'failed', 'cancelled')),
  priority INT DEFAULT 50 CHECK (priority BETWEEN 1 AND 100),

  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  result_summary TEXT,
  result_artifact_id UUID REFERENCES agent_artifacts(id),

  -- Metrics
  tokens_used INT DEFAULT 0,
  duration_ms INT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_delegations_directive ON directive_delegations(directive_id);
CREATE INDEX idx_delegations_status ON directive_delegations(status);
CREATE INDEX idx_delegations_contract ON directive_delegations(task_contract_id);
```

---

### 1.3 agent_task_contracts

Canonical task contract table for EVA↔crew execution. This powers:
- Manual crew trigger (`POST /api/crews/dispatch`)
- Live telemetry (`agent_task_contracts` statuses)
- Claim-with-lease execution (`09-agent-runtime-service.md`)

```sql
CREATE TABLE IF NOT EXISTS agent_task_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Routing / ownership
  parent_agent VARCHAR(50) NOT NULL,          -- e.g. 'EVA'
  target_agent VARCHAR(80) NOT NULL,          -- e.g. 'CREWAI_MARKET_VALIDATION'
  venture_id UUID REFERENCES ventures(id) ON DELETE CASCADE,
  stage_number INT CHECK (stage_number BETWEEN 1 AND 25),

  -- Work definition
  objective TEXT NOT NULL,
  constraints JSONB DEFAULT '{}'::jsonb,
  input_artifacts JSONB DEFAULT '[]'::jsonb,
  expected_output_type VARCHAR(50) DEFAULT 'artifact',

  -- Execution state (align with runtime + ops debugging)
  status VARCHAR(20) DEFAULT 'pending'
    CHECK (status IN ('pending', 'claimed', 'in_progress', 'completed', 'failed', 'cancelled', 'poisoned')),

  -- Claim-with-lease fields
  claimed_by TEXT,
  claimed_at TIMESTAMPTZ,
  lease_expires_at TIMESTAMPTZ,
  last_heartbeat_at TIMESTAMPTZ,
  checkpoint_data JSONB,

  -- Retry / failure
  retry_count INT DEFAULT 0,
  max_retries INT DEFAULT 3,
  last_failure_reason TEXT,
  error_history JSONB DEFAULT '[]'::jsonb,
  poisoned_at TIMESTAMPTZ,

  -- Budget + timing
  max_tokens INT,
  timeout_minutes INT DEFAULT 30,
  priority INT DEFAULT 50 CHECK (priority BETWEEN 1 AND 100),

  -- Observability
  correlation_id UUID,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_contracts_venture_stage ON agent_task_contracts(venture_id, stage_number);
CREATE INDEX IF NOT EXISTS idx_task_contracts_status ON agent_task_contracts(status);
CREATE INDEX IF NOT EXISTS idx_task_contracts_lease ON agent_task_contracts(status, lease_expires_at);
CREATE INDEX IF NOT EXISTS idx_task_contracts_correlation ON agent_task_contracts(correlation_id);

ALTER TABLE agent_task_contracts ENABLE ROW LEVEL SECURITY;

-- Chairman can read task state (telemetry)
CREATE POLICY "task_contracts_select" ON agent_task_contracts
  FOR SELECT TO authenticated USING (fn_is_chairman());

-- Agents create/update contracts via service_role only
CREATE POLICY "task_contracts_service_role" ON agent_task_contracts
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

### 1.4 agent_artifacts

Generic artifact store for outputs produced by agents/crews. Venture-scoped artifacts should also be linked into `venture_artifacts`.

```sql
CREATE TABLE IF NOT EXISTS agent_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID REFERENCES ventures(id) ON DELETE CASCADE,
  stage_number INT CHECK (stage_number BETWEEN 1 AND 25),

  artifact_type VARCHAR(80) NOT NULL,     -- e.g. 'doc', 'code', 'analysis'
  title VARCHAR(250),
  summary TEXT,

  -- Content storage (choose one pattern in implementation)
  content TEXT,                            -- inline content (small artifacts)
  storage_url TEXT,                        -- object storage link (large artifacts)
  content_sha256 TEXT,                     -- integrity check

  -- Provenance
  created_by_agent_id UUID REFERENCES agent_registry(id),
  task_contract_id UUID REFERENCES agent_task_contracts(id),
  correlation_id UUID,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_artifacts_venture_stage ON agent_artifacts(venture_id, stage_number, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_artifacts_task ON agent_artifacts(task_contract_id);

ALTER TABLE agent_artifacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_artifacts_select" ON agent_artifacts
  FOR SELECT TO authenticated USING (fn_is_chairman());

CREATE POLICY "agent_artifacts_service_role" ON agent_artifacts
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

### 1.5 venture_artifacts (with versioning)

User-facing artifacts displayed in the Factory Floor. Supports “Override Agent Output” via versioned updates.

```sql
CREATE TABLE IF NOT EXISTS venture_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  stage_number INT NOT NULL CHECK (stage_number BETWEEN 1 AND 25),

  artifact_type VARCHAR(80) NOT NULL,
  title VARCHAR(250) NOT NULL,

  -- Versioning
  version INT NOT NULL DEFAULT 1,
  is_current BOOLEAN DEFAULT TRUE,
  parent_artifact_id UUID REFERENCES venture_artifacts(id),

  -- Content (current snapshot)
  content TEXT,
  storage_url TEXT,

  -- Flags
  is_human_modified BOOLEAN DEFAULT FALSE,

  -- Provenance
  source_agent_artifact_id UUID REFERENCES agent_artifacts(id),
  correlation_id UUID,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(venture_id, stage_number, title, version)
);

CREATE INDEX IF NOT EXISTS idx_venture_artifacts_current ON venture_artifacts(venture_id, stage_number)
  WHERE is_current = TRUE;

ALTER TABLE venture_artifacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "venture_artifacts_select" ON venture_artifacts
  FOR SELECT TO authenticated USING (fn_is_chairman());

CREATE POLICY "venture_artifacts_write_chairman" ON venture_artifacts
  FOR INSERT TO authenticated WITH CHECK (fn_is_chairman());

CREATE POLICY "venture_artifacts_update_chairman" ON venture_artifacts
  FOR UPDATE TO authenticated USING (fn_is_chairman()) WITH CHECK (fn_is_chairman());

CREATE POLICY "venture_artifacts_service_role" ON venture_artifacts
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

### 1.6 chairman_alerts

Persistent alert feed (separate from “computed” alerts). Used for proactive alerts, circuit breakers, poison tasks, and intelligence triggers.

```sql
CREATE TABLE IF NOT EXISTS chairman_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID REFERENCES ventures(id) ON DELETE CASCADE,
  stage_number INT CHECK (stage_number BETWEEN 1 AND 25),
  alert_type VARCHAR(80) NOT NULL,             -- must match API AlertType
  severity VARCHAR(20) NOT NULL               -- must match API AlertSeverity
    CHECK (severity IN ('info', 'warning', 'critical')),
  message TEXT NOT NULL,

  correlation_id UUID,
  created_by_agent_id UUID REFERENCES agent_registry(id),
  task_contract_id UUID REFERENCES agent_task_contracts(id),

  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES auth.users(id),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chairman_alerts_unacked ON chairman_alerts(created_at DESC)
  WHERE acknowledged_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_chairman_alerts_venture ON chairman_alerts(venture_id, created_at DESC);

ALTER TABLE chairman_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chairman_alerts_select" ON chairman_alerts
  FOR SELECT TO authenticated USING (fn_is_chairman());

CREATE POLICY "chairman_alerts_ack" ON chairman_alerts
  FOR UPDATE TO authenticated USING (fn_is_chairman()) WITH CHECK (fn_is_chairman());

CREATE POLICY "chairman_alerts_service_role" ON chairman_alerts
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

### 1.7 venture_budget_settings

Per-venture budget caps used by Token Caps UI.

```sql
CREATE TABLE IF NOT EXISTS venture_budget_settings (
  venture_id UUID PRIMARY KEY REFERENCES ventures(id) ON DELETE CASCADE,
  soft_cap_tokens BIGINT,
  hard_cap_tokens BIGINT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);

ALTER TABLE venture_budget_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "venture_budget_settings_select" ON venture_budget_settings
  FOR SELECT TO authenticated USING (fn_is_chairman());

CREATE POLICY "venture_budget_settings_write" ON venture_budget_settings
  FOR ALL TO authenticated USING (fn_is_chairman()) WITH CHECK (fn_is_chairman());

CREATE POLICY "venture_budget_settings_service_role" ON venture_budget_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

## 2. Venture Stage Management

### 2.0 lifecycle_stage_config

Canonical configuration for the 25-stage workflow. This is the single source of truth for:
- Stage names and phase names
- Gate types (`auto_advance`, `advisory_checkpoint`, `hard_gate`)

```sql
CREATE TABLE IF NOT EXISTS lifecycle_stage_config (
  stage_number INT PRIMARY KEY CHECK (stage_number BETWEEN 1 AND 25),
  stage_name VARCHAR(200) NOT NULL,
  phase_name VARCHAR(50) NOT NULL
    CHECK (phase_name IN ('THE_TRUTH', 'THE_ENGINE', 'THE_IDENTITY', 'THE_BLUEPRINT', 'THE_BUILD_LOOP', 'LAUNCH_LEARN')),
  gate_type VARCHAR(20) NOT NULL
    CHECK (gate_type IN ('auto_advance', 'advisory_checkpoint', 'hard_gate'))
);

-- Seed data (December 2025)
-- Gate stages MUST match: docs/vision/00_VISION_V2_CHAIRMAN_OS.md and docs/vision/specs/06-hierarchical-agent-architecture.md
INSERT INTO lifecycle_stage_config (stage_number, stage_name, phase_name, gate_type) VALUES
  (1,  'Draft Idea & Chairman Review',         'THE_TRUTH',      'auto_advance'),
  (2,  'AI Multi-Model Critique',              'THE_TRUTH',      'auto_advance'),
  (3,  'Market Validation & RAT',              'THE_TRUTH',      'advisory_checkpoint'),
  (4,  'Competitive Intelligence',             'THE_TRUTH',      'auto_advance'),
  (5,  'Profitability Forecasting',            'THE_TRUTH',      'advisory_checkpoint'),
  (6,  'Risk Evaluation Matrix',               'THE_ENGINE',     'auto_advance'),
  (7,  'Pricing Strategy',                     'THE_ENGINE',     'auto_advance'),
  (8,  'Business Model Canvas',                'THE_ENGINE',     'auto_advance'),
  (9,  'Exit-Oriented Design',                 'THE_ENGINE',     'auto_advance'),
  (10, 'Strategic Naming (SD)',                'THE_IDENTITY',   'auto_advance'),
  (11, 'Go-to-Market Strategy',                'THE_IDENTITY',   'auto_advance'),
  (12, 'Sales & Success Logic',                'THE_IDENTITY',   'auto_advance'),
  (13, 'Tech Stack Interrogation',             'THE_BLUEPRINT',  'advisory_checkpoint'),
  (14, 'Data Model & Architecture (SD)',       'THE_BLUEPRINT',  'auto_advance'),
  (15, 'Epic & User Story Breakdown (SD)',     'THE_BLUEPRINT',  'auto_advance'),
  (16, 'Schema Generation (Gate, SD)',         'THE_BLUEPRINT',  'advisory_checkpoint'),
  (17, 'Environment & Agent Config (SD)',      'THE_BUILD_LOOP', 'auto_advance'),
  (18, 'MVP Development Loop (SD)',            'THE_BUILD_LOOP', 'auto_advance'),
  (19, 'Integration & API Layer (SD)',         'THE_BUILD_LOOP', 'auto_advance'),
  (20, 'Security & Performance (SD)',          'THE_BUILD_LOOP', 'auto_advance'),
  (21, 'QA & UAT (SD)',                        'LAUNCH_LEARN',   'auto_advance'),
  (22, 'Deployment & Infrastructure (SD)',     'LAUNCH_LEARN',   'auto_advance'),
  (23, 'Production Launch',                    'LAUNCH_LEARN',   'advisory_checkpoint'),
  (24, 'Analytics & Feedback',                 'LAUNCH_LEARN',   'auto_advance'),
  (25, 'Optimization & Scale (SD)',            'LAUNCH_LEARN',   'hard_gate');
```

### 2.1 venture_stage_assignments

Links crews to venture stages.

```sql
CREATE TABLE IF NOT EXISTS venture_stage_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  stage_number INT NOT NULL CHECK (stage_number BETWEEN 1 AND 25),
  crew_name VARCHAR(100) NOT NULL,
  crew_type VARCHAR(50) NOT NULL,
  agent_id UUID,

  status VARCHAR(20) DEFAULT 'pending'
    CHECK (status IN ('pending', 'queued', 'in_progress', 'review', 'completed', 'failed', 'blocked', 'skipped')),

  tokens_budget INT DEFAULT 0,
  tokens_used INT DEFAULT 0,

  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  artifacts JSONB DEFAULT '[]'::jsonb,
  quality_score NUMERIC(3,2),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(venture_id, stage_number, crew_name)
);

-- Indexes
CREATE INDEX idx_stage_assignments_venture ON venture_stage_assignments(venture_id);
CREATE INDEX idx_stage_assignments_stage ON venture_stage_assignments(venture_id, stage_number);
CREATE INDEX idx_stage_assignments_status ON venture_stage_assignments(status);
```

### 2.2 chairman_decisions

Records Chairman decisions at gate checkpoints.

```sql
CREATE TABLE IF NOT EXISTS chairman_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  stage_number INT NOT NULL CHECK (stage_number BETWEEN 1 AND 25),
  gate_type VARCHAR(20) NOT NULL
    CHECK (gate_type IN ('auto_advance', 'advisory_checkpoint', 'hard_gate')),

  -- EVA's recommendation
  health_score VARCHAR(10) CHECK (health_score IN ('green', 'yellow', 'red')),
  recommendation VARCHAR(20)
    CHECK (recommendation IN ('proceed', 'pivot', 'fix', 'kill', 'pause')),
  recommendation_confidence NUMERIC(3,2),
  recommendation_summary TEXT,

  -- Evidence (Four Buckets)
  evidence JSONB DEFAULT '{}'::jsonb,

  -- Chairman's decision
  decision VARCHAR(20)
    CHECK (decision IN ('proceed', 'pivot', 'fix', 'kill', 'pause', 'override')),
  decision_notes TEXT,
  override_reason TEXT,

  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Link to directive if decision came from command
  directive_id UUID REFERENCES chairman_directives(id)
);

-- Indexes
CREATE INDEX idx_decisions_venture ON chairman_decisions(venture_id);
CREATE INDEX idx_decisions_pending ON chairman_decisions(venture_id)
  WHERE decision IS NULL;
CREATE INDEX idx_decisions_stage ON chairman_decisions(venture_id, stage_number);
```

**evidence JSONB Structure (Four Buckets):**
```json
{
  "facts": [
    {"claim": "LTV:CAC = 4:1", "source": "financial_model_v3", "confidence": 0.95}
  ],
  "assumptions": [
    {"claim": "24-month retention", "assumption_set_id": "uuid", "confidence": 0.65}
  ],
  "simulations": [
    {"claim": "Break-even at month 18", "simulation_run_id": "uuid"}
  ],
  "unknowns": [
    {"gap": "Enterprise sales cycle length", "resolution": "Customer interviews needed"}
  ]
}
```

---

## 3. Golden Nugget Tables

### 3.1 venture_token_ledger

Tracks token spending as venture investment.

```sql
CREATE TABLE IF NOT EXISTS venture_token_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  stage_number INT NOT NULL CHECK (stage_number BETWEEN 1 AND 25),
  phase_name VARCHAR(20),

  agent_type VARCHAR(50),
  crew_name VARCHAR(100),
  job_id UUID,
  task_contract_id UUID REFERENCES agent_task_contracts(id),

  tokens_input INT DEFAULT 0,
  tokens_output INT DEFAULT 0,
  total_tokens INT GENERATED ALWAYS AS (tokens_input + tokens_output) STORED,

  cost_usd NUMERIC(10,6) DEFAULT 0,
  model_used VARCHAR(50),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_token_ledger_venture ON venture_token_ledger(venture_id);
CREATE INDEX idx_token_ledger_stage ON venture_token_ledger(venture_id, stage_number);
CREATE INDEX idx_token_ledger_created ON venture_token_ledger(created_at DESC);

-- Summary view
CREATE OR REPLACE VIEW v_venture_token_summary AS
SELECT
  venture_id,
  SUM(total_tokens) AS total_tokens,
  SUM(cost_usd) AS total_cost_usd,
  COUNT(DISTINCT stage_number) AS stages_touched,
  jsonb_object_agg(
    COALESCE(phase_name, 'UNKNOWN'),
    phase_tokens
  ) AS tokens_by_phase
FROM (
  SELECT
    venture_id,
    phase_name,
    SUM(total_tokens) AS phase_tokens
  FROM venture_token_ledger
  GROUP BY venture_id, phase_name
) sub
GROUP BY venture_id;
```

### 3.2 assumption_sets

Tracks assumptions for "Assumptions vs Reality" validation.

```sql
CREATE TABLE IF NOT EXISTS assumption_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  version INT DEFAULT 1,
  stage_created INT NOT NULL CHECK (stage_created BETWEEN 1 AND 25),

  assumption_category VARCHAR(50) NOT NULL
    CHECK (assumption_category IN ('market', 'competitor', 'product', 'timing', 'financial', 'technical')),
  assumption_key VARCHAR(100) NOT NULL,
  assumption_text TEXT NOT NULL,

  confidence_score NUMERIC(3,2) CHECK (confidence_score BETWEEN 0 AND 1),
  evidence_sources JSONB DEFAULT '[]'::jsonb,

  -- Reality check fields
  reality_check_status VARCHAR(20) DEFAULT 'pending'
    CHECK (reality_check_status IN ('pending', 'validated', 'invalidated', 'partially_validated')),
  reality_check_stage INT CHECK (reality_check_stage BETWEEN 1 AND 25),
  reality_evidence TEXT,
  reality_value TEXT,
  error_direction VARCHAR(20) CHECK (error_direction IN ('optimistic', 'pessimistic', 'accurate')),
  error_magnitude NUMERIC(5,2),

  is_current BOOLEAN DEFAULT TRUE,
  parent_version_id UUID REFERENCES assumption_sets(id),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  validated_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_assumptions_venture ON assumption_sets(venture_id);
CREATE INDEX idx_assumptions_current ON assumption_sets(venture_id) WHERE is_current = TRUE;
CREATE INDEX idx_assumptions_category ON assumption_sets(venture_id, assumption_category);
```

---

## 4. Database Functions

### 4.1 fn_chairman_briefing()

Generates the morning briefing for the Chairman dashboard.

```sql
CREATE OR REPLACE FUNCTION fn_chairman_briefing()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
  time_of_day TEXT;
BEGIN
  -- Determine greeting based on time
  SELECT CASE
    WHEN EXTRACT(HOUR FROM NOW()) < 12 THEN 'Good morning'
    WHEN EXTRACT(HOUR FROM NOW()) < 17 THEN 'Good afternoon'
    ELSE 'Good evening'
  END INTO time_of_day;

  SELECT jsonb_build_object(
    'greeting', time_of_day || ', Rick. Systems nominal.',
    'generated_at', NOW(),

    -- Portfolio health
    'portfolio_health', (
      SELECT jsonb_build_object(
        'total_ventures', COUNT(*),
        'active', COUNT(*) FILTER (WHERE status = 'active'),
        'paused', COUNT(*) FILTER (WHERE status = 'paused'),
        'killed_this_month', COUNT(*) FILTER (
          WHERE status = 'killed' AND updated_at > DATE_TRUNC('month', NOW())
        ),
        'launched_this_month', COUNT(*) FILTER (
          WHERE current_stage >= 23 AND updated_at > DATE_TRUNC('month', NOW())
        )
      ) FROM ventures
    ),

    -- Global health score (average of active ventures)
    'global_health_score', (
      SELECT COALESCE(
        ROUND(AVG(
          CASE health_score
            WHEN 'green' THEN 100
            WHEN 'yellow' THEN 60
            WHEN 'red' THEN 20
            ELSE 50
          END
        )),
        85
      )
      FROM ventures WHERE status = 'active'
    ),

    -- Decision stack (pending decisions)
    'decision_stack', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id', cd.id,
          'venture_id', cd.venture_id,
          'venture_name', v.name,
          'type', 'gate_decision',
          'gate_type', cd.gate_type,
          'stage', cd.stage_number,
          'stage_name', lsc.stage_name,
          'urgency', CASE
            WHEN cd.stage_number IN (3, 5, 16) THEN 'high'
            ELSE 'medium'
          END,
          'summary', cd.recommendation_summary,
          'recommendation', cd.recommendation,
          'health_score', cd.health_score,
          'action_required', TRUE,
          'created_at', cd.created_at
        ) ORDER BY cd.created_at ASC
      ), '[]'::jsonb)
      FROM chairman_decisions cd
      JOIN ventures v ON v.id = cd.venture_id
      JOIN lifecycle_stage_config lsc ON lsc.stage_number = cd.stage_number
      WHERE cd.decision IS NULL
      LIMIT 10
    ),

    -- Alerts
    'alerts', (
      SELECT COALESCE(jsonb_agg(alert), '[]'::jsonb)
      FROM (
        -- Token budget warnings
        SELECT jsonb_build_object(
          'type', 'token_budget_warning',
          'venture_name', v.name,
          'message', 'Token budget ' ||
            ROUND((vtl.total_tokens::NUMERIC / NULLIF(vtp.total_budget, 0)) * 100) ||
            '% consumed at Stage ' || v.current_stage,
          'severity', 'warning'
        ) AS alert
        FROM ventures v
        JOIN LATERAL (
          SELECT SUM(total_tokens) AS total_tokens
          FROM venture_token_ledger WHERE venture_id = v.id
        ) vtl ON TRUE
        JOIN LATERAL (
          SELECT 500000 AS total_budget  -- Default budget
        ) vtp ON TRUE
        WHERE v.status = 'active'
          AND vtl.total_tokens > vtp.total_budget * 0.8

        UNION ALL

        -- Assumption invalidations
        SELECT jsonb_build_object(
          'type', 'assumption_invalidated',
          'venture_name', v.name,
          'message', a.assumption_key || ' assumption invalidated',
          'severity', 'critical'
        ) AS alert
        FROM assumption_sets a
        JOIN ventures v ON v.id = a.venture_id
        WHERE a.reality_check_status = 'invalidated'
          AND a.validated_at > NOW() - INTERVAL '7 days'
          AND a.is_current = TRUE
      ) alerts
      LIMIT 5
    ),

    -- Recent completions
    'recent_completions', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'venture_name', v.name,
          'stage', vsa.stage_number,
          'stage_name', lsc.stage_name,
          'completed_at', vsa.completed_at
        ) ORDER BY vsa.completed_at DESC
      ), '[]'::jsonb)
      FROM venture_stage_assignments vsa
      JOIN ventures v ON v.id = vsa.venture_id
      JOIN lifecycle_stage_config lsc ON lsc.stage_number = vsa.stage_number
      WHERE vsa.status = 'completed'
        AND vsa.completed_at > NOW() - INTERVAL '24 hours'
      LIMIT 5
    ),

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
    ),

    -- Token summary
    'token_summary', (
      SELECT jsonb_build_object(
        'total_spent_this_week', COALESCE(SUM(total_tokens) FILTER (
          WHERE created_at > NOW() - INTERVAL '7 days'
        ), 0),
        'total_spent_this_month', COALESCE(SUM(total_tokens) FILTER (
          WHERE created_at > DATE_TRUNC('month', NOW())
        ), 0),
        'cost_usd_this_month', COALESCE(SUM(cost_usd) FILTER (
          WHERE created_at > DATE_TRUNC('month', NOW())
        ), 0)
      ) FROM venture_token_ledger
    )
  ) INTO result;

  RETURN result;
END;
$$;
```

### 4.2 fn_advance_venture_stage()

Advances a venture to the next stage with validation.

```sql
CREATE OR REPLACE FUNCTION fn_advance_venture_stage(
  p_venture_id UUID,
  p_decision_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_stage INT;
  v_next_stage INT;
  v_gate_type VARCHAR(20);
  v_result JSONB;
BEGIN
  -- Get current stage
  SELECT current_stage INTO v_current_stage
  FROM ventures WHERE id = p_venture_id;

  IF v_current_stage IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Venture not found');
  END IF;

  IF v_current_stage >= 25 THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Venture already at final stage');
  END IF;

  v_next_stage := v_current_stage + 1;

  -- Get gate type for next stage
  SELECT gate_type INTO v_gate_type
  FROM lifecycle_stage_config WHERE stage_number = v_next_stage;

  -- Check if decision required
  IF v_gate_type IN ('advisory_checkpoint', 'hard_gate') AND p_decision_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Decision required for gate',
      'gate_type', v_gate_type,
      'stage', v_next_stage
    );
  END IF;

  -- Update venture
  UPDATE ventures
  SET
    current_stage = v_next_stage,
    updated_at = NOW()
  WHERE id = p_venture_id;

  -- Get stage name
  SELECT jsonb_build_object(
    'success', TRUE,
    'venture_id', p_venture_id,
    'previous_stage', v_current_stage,
    'next_stage', v_next_stage,
    'stage_name', lsc.stage_name,
    'phase_name', lsc.phase_name,
    'message', 'Venture advanced to Stage ' || v_next_stage || ': ' || lsc.stage_name
  ) INTO v_result
  FROM lifecycle_stage_config lsc
  WHERE lsc.stage_number = v_next_stage;

  RETURN v_result;
END;
$$;
```

---

## 5. Migration File

Save as: `database/migrations/YYYYMMDD_vision_v2_chairman_os_schema.sql`

```sql
-- Vision v2 Chairman's OS Schema Migration
-- Generated: December 2025
-- Reference: docs/vision/00_VISION_V2_CHAIRMAN_OS.md

BEGIN;

-- 1. Chairman Directives
-- [Include chairman_directives CREATE TABLE from above]

-- 2. Directive Delegations
-- [Include directive_delegations CREATE TABLE from above]

-- 3. Venture Stage Assignments
-- [Include venture_stage_assignments CREATE TABLE from above]

-- 4. Chairman Decisions
-- [Include chairman_decisions CREATE TABLE from above]

-- 5. Token Ledger
-- [Include venture_token_ledger CREATE TABLE from above]

-- 6. Assumption Sets
-- [Include assumption_sets CREATE TABLE from above]

-- 7. Functions
-- [Include fn_chairman_briefing from above]
-- [Include fn_advance_venture_stage from above]

COMMIT;
```

---

## 6. Table Relationships

```
┌──────────────────────┐
│  chairman_directives │
│  (Chairman's Intent) │
└──────────┬───────────┘
           │ 1:N
           ▼
┌──────────────────────┐       ┌──────────────────────┐
│directive_delegations │──────▶│  agent_task_contracts│
│   (EVA's Dispatch)   │       │    (Crew Contract)   │
└──────────┬───────────┘       └──────────────────────┘
           │ 1:1
           ▼
┌──────────────────────┐
│venture_stage_assign- │
│     ments            │
│ (Stage Execution)    │
└──────────┬───────────┘
           │ N:1
           ▼
┌──────────────────────┐       ┌──────────────────────┐
│      ventures        │◀──────│   chairman_decisions │
│   (The Venture)      │       │    (Gate Results)    │
└──────────┬───────────┘       └──────────────────────┘
           │ 1:N
           ▼
┌──────────────────────┐       ┌──────────────────────┐
│ venture_token_ledger │       │   assumption_sets    │
│  (Cost Accounting)   │       │ (Belief Tracking)    │
└──────────────────────┘       └──────────────────────┘
```

---

## 7. Blue Sky Architecture Tables

These tables support future scalability requirements identified in the Architect's Assessment.

### 7.1 agent_execution_traces (Observability)

Distributed tracing for debugging agent chains at scale.

```sql
CREATE TABLE IF NOT EXISTS agent_execution_traces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id UUID NOT NULL,           -- Threads entire request chain
  parent_trace_id UUID REFERENCES agent_execution_traces(id),  -- For nested calls

  -- Agent identification
  agent_type VARCHAR(50) NOT NULL,        -- 'EVA', 'CREWAI_MARKET_VALIDATION', etc.
  crew_type VARCHAR(50),                  -- Specific crew (if applicable)

  -- Context
  venture_id UUID REFERENCES ventures(id) ON DELETE CASCADE,
  stage_number INT CHECK (stage_number BETWEEN 1 AND 25),
  task_contract_id UUID REFERENCES agent_task_contracts(id),

  -- Execution details
  action VARCHAR(100) NOT NULL,           -- 'dispatch', 'claim', 'execute', 'complete', 'fail'
  input_snapshot JSONB,                   -- What the agent received (truncated for size)
  output_snapshot JSONB,                  -- What the agent produced (truncated for size)
  error_details JSONB,                    -- If action = 'fail'

  -- Metrics
  tokens_input INT DEFAULT 0,
  tokens_output INT DEFAULT 0,
  duration_ms INT,
  model_used VARCHAR(50),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Critical indexes for debugging
CREATE INDEX idx_traces_correlation ON agent_execution_traces(correlation_id);
CREATE INDEX idx_traces_venture ON agent_execution_traces(venture_id, created_at DESC);
CREATE INDEX idx_traces_action ON agent_execution_traces(action, created_at DESC);
CREATE INDEX idx_traces_errors ON agent_execution_traces(venture_id)
  WHERE action = 'fail';

-- RLS
ALTER TABLE agent_execution_traces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "traces_select" ON agent_execution_traces
  FOR SELECT TO authenticated USING (fn_is_chairman());

CREATE POLICY "traces_insert" ON agent_execution_traces
  FOR INSERT TO service_role WITH CHECK (true);

COMMENT ON TABLE agent_execution_traces IS
  'Distributed tracing for agent execution chains. Use correlation_id to follow a request through EVA → Crew → Sub-agent.';
```

**Usage for debugging:**
```sql
-- Find all traces for a failed request
SELECT * FROM agent_execution_traces
WHERE correlation_id = '2d1d6e1a-2a5b-4b72-9f78-9a8c8b4fb2c1'::uuid
ORDER BY created_at;

-- Find stuck agents (started but not completed)
SELECT * FROM agent_execution_traces
WHERE action = 'execute'
  AND completed_at IS NULL
  AND created_at < NOW() - INTERVAL '10 minutes';
```

---

### 7.2 crew_prompt_versions (Prompt Versioning)

Version control for crew prompts with A/B testing support.

```sql
CREATE TABLE IF NOT EXISTS crew_prompt_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_type VARCHAR(50) NOT NULL,         -- 'MARKET_VALIDATION', 'TECHNICAL_SPEC', etc.
  version INT NOT NULL,
  version_name VARCHAR(100),              -- Optional human-readable name

  -- Prompt content
  system_prompt TEXT NOT NULL,
  task_template TEXT NOT NULL,
  output_schema JSONB,                    -- Expected output structure

  -- Metadata
  description TEXT,
  change_notes TEXT,                      -- What changed from previous version

  -- Activation
  is_active BOOLEAN DEFAULT FALSE,
  rollout_percentage INT DEFAULT 100      -- 1-100, for A/B testing
    CHECK (rollout_percentage BETWEEN 1 AND 100),

  -- Audit
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  activated_at TIMESTAMPTZ,
  deprecated_at TIMESTAMPTZ,

  UNIQUE(crew_type, version)
);

-- Indexes
CREATE INDEX idx_prompt_versions_crew ON crew_prompt_versions(crew_type);
CREATE INDEX idx_prompt_versions_active ON crew_prompt_versions(crew_type)
  WHERE is_active = TRUE;

-- RLS
ALTER TABLE crew_prompt_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prompt_versions_select" ON crew_prompt_versions
  FOR SELECT TO authenticated USING (fn_is_chairman());

CREATE POLICY "prompt_versions_manage" ON crew_prompt_versions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE crew_prompt_versions IS
  'Version-controlled prompts for agent crews. Supports A/B testing via rollout_percentage.';

-- Link task contracts to prompt version
ALTER TABLE agent_task_contracts
  ADD COLUMN IF NOT EXISTS prompt_version_id UUID REFERENCES crew_prompt_versions(id);
```

**Usage for rollback:**
```sql
-- Activate previous prompt version
UPDATE crew_prompt_versions
SET is_active = FALSE, deprecated_at = NOW()
WHERE crew_type = 'MARKET_VALIDATION' AND is_active = TRUE;

UPDATE crew_prompt_versions
SET is_active = TRUE, activated_at = NOW()
WHERE crew_type = 'MARKET_VALIDATION' AND version = 3;  -- Previous good version
```

---

### 7.3 model_registry (Model Abstraction)

Registry of AI models with capabilities and costs for intelligent model selection.

```sql
CREATE TABLE IF NOT EXISTS model_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(50) NOT NULL,          -- 'openai', 'anthropic', 'google'
  model_id VARCHAR(100) NOT NULL,         -- 'gpt-4o', 'claude-opus-4', 'gemini-2'
  display_name VARCHAR(100),

  -- Capabilities
  capabilities TEXT[] NOT NULL DEFAULT '{}',  -- ['code_gen', 'analysis', 'creative', 'reasoning']
  max_context_tokens INT NOT NULL,
  max_output_tokens INT,

  -- Cost per 1K tokens (USD)
  cost_per_1k_input NUMERIC(10, 6) NOT NULL,
  cost_per_1k_output NUMERIC(10, 6) NOT NULL,

  -- Operational
  is_available BOOLEAN DEFAULT TRUE,
  priority INT DEFAULT 50,                -- Lower = preferred
  rate_limit_rpm INT,                     -- Requests per minute
  rate_limit_tpm INT,                     -- Tokens per minute

  -- Health tracking
  last_health_check TIMESTAMPTZ,
  health_status VARCHAR(20) DEFAULT 'unknown'
    CHECK (health_status IN ('healthy', 'degraded', 'unhealthy', 'unknown')),
  error_rate_24h NUMERIC(5, 2),           -- Percentage

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_model_registry_provider ON model_registry(provider);
CREATE INDEX idx_model_registry_available ON model_registry(is_available, priority);
CREATE UNIQUE INDEX idx_model_registry_unique ON model_registry(provider, model_id);

-- RLS
ALTER TABLE model_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "model_registry_select" ON model_registry
  FOR SELECT TO authenticated USING (fn_is_chairman());

CREATE POLICY "model_registry_manage" ON model_registry
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE model_registry IS
  'Registry of available AI models with capabilities, costs, and health status for intelligent routing.';
```

**Seed data example:**
```sql
INSERT INTO model_registry (provider, model_id, display_name, capabilities, max_context_tokens, cost_per_1k_input, cost_per_1k_output, priority)
VALUES
  ('anthropic', 'claude-opus-4', 'Claude Opus 4', ARRAY['code_gen', 'analysis', 'creative', 'reasoning'], 200000, 0.015, 0.075, 10),
  ('anthropic', 'claude-sonnet-4', 'Claude Sonnet 4', ARRAY['code_gen', 'analysis', 'reasoning'], 200000, 0.003, 0.015, 20),
  ('openai', 'gpt-4o', 'GPT-4o', ARRAY['code_gen', 'analysis', 'creative'], 128000, 0.005, 0.015, 30),
  ('openai', 'gpt-4o-mini', 'GPT-4o Mini', ARRAY['analysis', 'creative'], 128000, 0.00015, 0.0006, 50),
  ('google', 'gemini-2-pro', 'Gemini 2 Pro', ARRAY['analysis', 'reasoning'], 1000000, 0.00125, 0.005, 40);
```

---

### 7.4 circuit_breaker_events (Cost Protection)

Audit log for circuit breaker triggers.

```sql
CREATE TABLE IF NOT EXISTS circuit_breaker_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,

  -- Trigger details
  trigger_type VARCHAR(50) NOT NULL
    CHECK (trigger_type IN ('hard_cap', 'soft_cap', 'burn_rate', 'anomaly', 'manual')),
  trigger_reason TEXT NOT NULL,

  -- State at trigger
  tokens_consumed BIGINT NOT NULL,
  tokens_budget BIGINT NOT NULL,
  burn_rate_per_hour INT,
  anomaly_factor NUMERIC(5, 2),           -- e.g., 3.5x normal

  -- Response
  action_taken VARCHAR(50) NOT NULL
    CHECK (action_taken IN ('paused', 'warned', 'rate_limited', 'none')),
  acknowledged_by UUID REFERENCES auth.users(id),
  acknowledged_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_circuit_breaker_venture ON circuit_breaker_events(venture_id, created_at DESC);
CREATE INDEX idx_circuit_breaker_type ON circuit_breaker_events(trigger_type);
CREATE INDEX idx_circuit_breaker_unacknowledged ON circuit_breaker_events(venture_id)
  WHERE acknowledged_at IS NULL;

-- RLS
ALTER TABLE circuit_breaker_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "circuit_breaker_select" ON circuit_breaker_events
  FOR SELECT TO authenticated USING (fn_is_chairman());

CREATE POLICY "circuit_breaker_insert" ON circuit_breaker_events
  FOR INSERT TO service_role WITH CHECK (true);

COMMENT ON TABLE circuit_breaker_events IS
  'Audit log of cost protection triggers. Chairman can review and acknowledge events.';
```

---

## 8. Table Relationships (Updated)

```
┌──────────────────────┐
│  chairman_directives │
│  (Chairman's Intent) │
└──────────┬───────────┘
           │ 1:N
           ▼
┌──────────────────────┐       ┌──────────────────────┐
│directive_delegations │──────▶│  agent_task_contracts│───┐
│   (EVA's Dispatch)   │       │    (Crew Contract)   │   │
└──────────┬───────────┘       └──────────────────────┘   │
           │ 1:1                         │                 │
           ▼                             │                 │
┌──────────────────────┐                 │    ┌───────────▼───────────┐
│venture_stage_assign- │                 │    │crew_prompt_versions   │
│     ments            │                 │    │  (Prompt Versioning)  │
│ (Stage Execution)    │                 │    └───────────────────────┘
└──────────┬───────────┘                 │
           │ N:1                         │
           ▼                             │
┌──────────────────────┐       ┌────────▼─────────────┐
│      ventures        │◀──────│  chairman_decisions  │
│   (The Venture)      │       │    (Gate Results)    │
└──────────┬───────────┘       └──────────────────────┘
           │ 1:N
           ├────────────────────────────────────────┐
           ▼                                        ▼
┌──────────────────────┐       ┌──────────────────────┐
│ venture_token_ledger │       │   assumption_sets    │
│  (Cost Accounting)   │       │ (Belief Tracking)    │
└──────────────────────┘       └──────────────────────┘
           │
           │ (Cost events)
           ▼
┌──────────────────────┐       ┌──────────────────────┐
│circuit_breaker_events│       │agent_execution_traces│
│  (Cost Protection)   │       │   (Observability)    │
└──────────────────────┘       └──────────────────────┘
                                        │
                                        ▼
                               ┌──────────────────────┐
                               │   model_registry     │
                               │ (Model Abstraction)  │
                               └──────────────────────┘
```

---

---

## 9. Hierarchical Agent Tables

These tables support the 4-level hierarchical agent architecture. Full specifications are in [06-hierarchical-agent-architecture.md](./06-hierarchical-agent-architecture.md).

### 9.1 Table Summary

| Table | Purpose | Section in 06-spec |
|-------|---------|-------------------|
| `agent_registry` | Central registry of all agents (CEO, VP, Crew) with hierarchy | Section 3.1 |
| `agent_relationships` | Explicit relationships (reports_to, delegates_to, coordinates_with) | Section 3.2 |
| `agent_memory_stores` | Persistent memory for CEO/VP agents | Section 3.3 |
| `tool_registry` | Shared tool registry for ecosystem | Section 4.1 |
| `tool_access_grants` | Tool access control per agent | Section 4.2 |
| `agent_messages` | Cross-agent communication protocol | Section 5.2 |

### 9.2 Key Relationships

```
┌──────────────────────┐
│   agent_registry     │
│  (Hierarchy Root)    │
└──────────┬───────────┘
           │ 1:N (parent_agent_id)
           ▼
┌──────────────────────┐       ┌──────────────────────┐
│  agent_relationships │       │  agent_memory_stores │
│  (Graph Edges)       │       │  (Agent Context)     │
└──────────────────────┘       └──────────────────────┘
           │
           │ N:N (tool access)
           ▼
┌──────────────────────┐       ┌──────────────────────┐
│   tool_registry      │◀──────│  tool_access_grants  │
│  (Shared Tools)      │       │  (Access Control)    │
└──────────────────────┘       └──────────────────────┘
           │
           │ (communication)
           ▼
┌──────────────────────┐
│   agent_messages     │
│ (Cross-Agent Comms)  │
└──────────────────────┘
```

**Note:** Complete table schemas including columns, indexes, and RLS policies are defined in [06-hierarchical-agent-architecture.md](./06-hierarchical-agent-architecture.md).

---

## 10. Operational Handoff Tables (OpenAI Codex Assessment)

These tables support the Stage 25 mode transition from Incubation to Operational phase. Full specifications are in [07-operational-handoff.md](./07-operational-handoff.md).

### 10.1 operational_handoff_packets

Stores comprehensive handoff packets generated at mode transitions.

```sql
CREATE TABLE IF NOT EXISTS operational_handoff_packets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  handoff_id UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),

  schema_version VARCHAR(20) DEFAULT '1.0.0',
  handoff_type VARCHAR(50) DEFAULT 'mode_transition'
    CHECK (handoff_type IN ('mode_transition', 'stage_transition', 'emergency_handoff')),

  -- State markers
  from_phase VARCHAR(50) NOT NULL,
  from_stage INT,
  to_phase VARCHAR(50) NOT NULL,
  to_mode VARCHAR(50),

  -- Full packet content (see 07-operational-handoff.md for schema)
  packet_content JSONB NOT NULL,

  -- Approval workflow
  generated_by_agent_id UUID,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  eva_reviewed BOOLEAN DEFAULT FALSE,
  eva_reviewed_at TIMESTAMPTZ,
  chairman_reviewed BOOLEAN DEFAULT FALSE,
  chairman_reviewed_at TIMESTAMPTZ,
  chairman_approved BOOLEAN,
  chairman_notes TEXT,

  -- Execution
  transition_executed BOOLEAN DEFAULT FALSE,
  transition_executed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_handoff_packets_venture ON operational_handoff_packets(venture_id);
CREATE INDEX idx_handoff_packets_pending ON operational_handoff_packets(venture_id)
  WHERE chairman_approved IS NULL;
CREATE INDEX idx_handoff_packets_type ON operational_handoff_packets(handoff_type);

-- RLS
ALTER TABLE operational_handoff_packets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "handoff_packets_select" ON operational_handoff_packets
  FOR SELECT TO authenticated USING (fn_is_chairman());

CREATE POLICY "handoff_packets_insert" ON operational_handoff_packets
  FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "handoff_packets_update" ON operational_handoff_packets
  FOR UPDATE TO authenticated USING (fn_is_chairman()) WITH CHECK (fn_is_chairman());

COMMENT ON TABLE operational_handoff_packets IS
  'Operational handoff packets for Stage 25 mode transition. Contains full venture state snapshot.';
```

### 10.2 venture_constitutions

Living document updated throughout incubation, finalized at Stage 25.

```sql
CREATE TABLE IF NOT EXISTS venture_constitutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  version INT NOT NULL DEFAULT 1,
  is_current BOOLEAN DEFAULT TRUE,

  -- Content (see 07-operational-handoff.md for schema)
  constitution_content JSONB NOT NULL,

  -- Approval
  approved_by_chairman BOOLEAN DEFAULT FALSE,
  approved_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(venture_id, version)
);

-- Indexes
CREATE INDEX idx_constitutions_venture ON venture_constitutions(venture_id);
CREATE INDEX idx_constitutions_current ON venture_constitutions(venture_id)
  WHERE is_current = TRUE;

-- RLS
ALTER TABLE venture_constitutions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "constitutions_select" ON venture_constitutions
  FOR SELECT TO authenticated USING (fn_is_chairman());

CREATE POLICY "constitutions_manage" ON venture_constitutions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE venture_constitutions IS
  'Venture operating charter versioning. Updated throughout incubation, finalized at Stage 25.';
```

### 10.3 ceo_mode_transitions

Tracks CEO mode transitions with two-factor triggers.

```sql
CREATE TABLE IF NOT EXISTS ceo_mode_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,

  from_mode VARCHAR(50) NOT NULL,
  to_mode VARCHAR(50) NOT NULL,

  -- Two-factor triggers
  technical_trigger_met BOOLEAN DEFAULT FALSE,
  technical_trigger_at TIMESTAMPTZ,
  governance_trigger_met BOOLEAN DEFAULT FALSE,
  governance_trigger_at TIMESTAMPTZ,

  -- Execution
  transition_executed BOOLEAN DEFAULT FALSE,
  transition_executed_at TIMESTAMPTZ,

  -- Reference
  handoff_packet_id UUID REFERENCES operational_handoff_packets(id),
  chairman_decision_id UUID REFERENCES chairman_decisions(id),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_ceo_transitions_venture ON ceo_mode_transitions(venture_id);
CREATE INDEX idx_ceo_transitions_pending ON ceo_mode_transitions(venture_id)
  WHERE transition_executed = FALSE;

-- RLS
ALTER TABLE ceo_mode_transitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ceo_transitions_select" ON ceo_mode_transitions
  FOR SELECT TO authenticated USING (fn_is_chairman());

CREATE POLICY "ceo_transitions_manage" ON ceo_mode_transitions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE ceo_mode_transitions IS
  'Tracks CEO mode transitions from incubation to operational. Requires both technical and governance triggers.';
```

### 10.4 Table Relationships (Operational Phase)

```
┌──────────────────────────┐
│        ventures          │
│    (Venture Record)      │
└────────────┬─────────────┘
             │ 1:N
             ├──────────────────────────┬────────────────────────┐
             ▼                          ▼                        ▼
┌──────────────────────────┐ ┌──────────────────────────┐ ┌───────────────────────┐
│operational_handoff_packets│ │  venture_constitutions   │ │  ceo_mode_transitions │
│  (Handoff Snapshots)     │ │  (Operating Charter)     │ │  (Mode Switch Log)    │
└──────────────────────────┘ └──────────────────────────┘ └───────────────────────┘
             │                                                      │
             │ 1:1                                                  │
             ▼                                                      ▼
┌──────────────────────────┐                            ┌───────────────────────┐
│  chairman_decisions      │◀───────────────────────────│  (references)         │
│  (Approval Record)       │                            └───────────────────────┘
└──────────────────────────┘
```

---

## 11. Strict RLS Policies (OpenAI Codex Assessment - P1 Priority)

The Codex architectural assessment identified permissive RLS policies (`authenticated USING (true)`) as a P1 security gap. This section defines strict, scope-based RLS that enforces portfolio and venture boundaries.

### 11.0 Modes: Single-User Production vs Multi-User Future

- **Single-user production mode (Rick-only)**: Use `app_config.chairman_user_id` + `fn_is_chairman()` (see Section "Single-User Production Mode"). This is the recommended production setup for a single human operator.
- **Multi-user future mode (teams)**: Use the membership tables and portfolio/venture grants below.

### 11.1 Access Control Foundation Tables

These tables establish the access control hierarchy referenced by all RLS policies.

```sql
-- User-to-venture access grants
CREATE TABLE IF NOT EXISTS user_venture_access (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  venture_id UUID REFERENCES ventures(id) ON DELETE CASCADE,
  access_level VARCHAR(20) DEFAULT 'read'
    CHECK (access_level IN ('read', 'write', 'admin')),
  granted_by UUID REFERENCES auth.users(id),
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,  -- NULL = never expires
  PRIMARY KEY (user_id, venture_id)
);

CREATE INDEX idx_user_venture_access_user ON user_venture_access(user_id);
CREATE INDEX idx_user_venture_access_venture ON user_venture_access(venture_id);
CREATE INDEX idx_user_venture_access_active ON user_venture_access(user_id)
  WHERE expires_at IS NULL OR expires_at > NOW();

-- User-to-portfolio access grants (grants access to all ventures in portfolio)
CREATE TABLE IF NOT EXISTS user_portfolio_access (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  portfolio_id UUID REFERENCES portfolios(id) ON DELETE CASCADE,
  access_level VARCHAR(20) DEFAULT 'read'
    CHECK (access_level IN ('read', 'write', 'admin', 'chairman')),
  granted_by UUID REFERENCES auth.users(id),
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, portfolio_id)
);

CREATE INDEX idx_user_portfolio_access_user ON user_portfolio_access(user_id);
CREATE INDEX idx_user_portfolio_access_portfolio ON user_portfolio_access(portfolio_id);

-- RLS for access tables themselves
ALTER TABLE user_venture_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_portfolio_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "venture_access_read" ON user_venture_access
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR current_setting('role') = 'service_role');

CREATE POLICY "venture_access_admin" ON user_venture_access
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_venture_access uva
      WHERE uva.user_id = auth.uid()
        AND uva.venture_id = user_venture_access.venture_id
        AND uva.access_level = 'admin'
    )
    OR current_setting('role') = 'service_role'
  );

CREATE POLICY "portfolio_access_read" ON user_portfolio_access
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR current_setting('role') = 'service_role');

CREATE POLICY "portfolio_access_admin" ON user_portfolio_access
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_portfolio_access upa
      WHERE upa.user_id = auth.uid()
        AND upa.portfolio_id = user_portfolio_access.portfolio_id
        AND upa.access_level = 'chairman'
    )
    OR current_setting('role') = 'service_role'
  );
```

### 11.2 Reusable RLS Helper Functions

```sql
-- Check if user has access to a venture (direct or via portfolio)
CREATE OR REPLACE FUNCTION fn_user_has_venture_access(
  p_user_id UUID,
  p_venture_id UUID,
  p_min_level VARCHAR DEFAULT 'read'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_portfolio_id UUID;
  v_access_levels VARCHAR[] := ARRAY['read', 'write', 'admin'];
  v_required_idx INT;
BEGIN
  -- Service role always has access
  IF current_setting('role') = 'service_role' THEN
    RETURN TRUE;
  END IF;

  -- Get required level index
  v_required_idx := array_position(v_access_levels, p_min_level);
  IF v_required_idx IS NULL THEN
    v_required_idx := 1;  -- Default to read
  END IF;

  -- Check direct venture access
  IF EXISTS (
    SELECT 1 FROM user_venture_access
    WHERE user_id = p_user_id
      AND venture_id = p_venture_id
      AND array_position(v_access_levels, access_level) >= v_required_idx
      AND (expires_at IS NULL OR expires_at > NOW())
  ) THEN
    RETURN TRUE;
  END IF;

  -- Check portfolio access
  SELECT portfolio_id INTO v_portfolio_id
  FROM ventures WHERE id = p_venture_id;

  IF v_portfolio_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM user_portfolio_access
    WHERE user_id = p_user_id
      AND portfolio_id = v_portfolio_id
      AND (expires_at IS NULL OR expires_at > NOW())
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

-- Get all venture IDs a user can access
CREATE OR REPLACE FUNCTION fn_user_accessible_ventures(p_user_id UUID)
RETURNS TABLE (venture_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  -- Direct venture access
  SELECT uva.venture_id
  FROM user_venture_access uva
  WHERE uva.user_id = p_user_id
    AND (uva.expires_at IS NULL OR uva.expires_at > NOW())

  UNION

  -- Portfolio access (all ventures in portfolio)
  SELECT v.id
  FROM ventures v
  JOIN user_portfolio_access upa ON upa.portfolio_id = v.portfolio_id
  WHERE upa.user_id = p_user_id
    AND (upa.expires_at IS NULL OR upa.expires_at > NOW());
END;
$$;
```

### 11.3 Strict RLS Policy Patterns

Replace all permissive `authenticated USING (true)` policies with these patterns:

```sql
-- ==============================================
-- VENTURES TABLE - Strict isolation
-- ==============================================
DROP POLICY IF EXISTS "ventures_select_policy" ON ventures;
DROP POLICY IF EXISTS "ventures_insert_policy" ON ventures;
DROP POLICY IF EXISTS "ventures_update_policy" ON ventures;

CREATE POLICY "ventures_strict_select" ON ventures
  FOR SELECT TO authenticated
  USING (
    fn_user_has_venture_access(auth.uid(), id, 'read')
  );

CREATE POLICY "ventures_strict_insert" ON ventures
  FOR INSERT TO authenticated
  WITH CHECK (
    -- Can only create in portfolios user has write access to
    EXISTS (
      SELECT 1 FROM user_portfolio_access
      WHERE user_id = auth.uid()
        AND portfolio_id = ventures.portfolio_id
        AND access_level IN ('write', 'admin', 'chairman')
    )
    OR current_setting('role') = 'service_role'
  );

CREATE POLICY "ventures_strict_update" ON ventures
  FOR UPDATE TO authenticated
  USING (fn_user_has_venture_access(auth.uid(), id, 'write'))
  WITH CHECK (fn_user_has_venture_access(auth.uid(), id, 'write'));

CREATE POLICY "ventures_service_role" ON ventures
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ==============================================
-- CHAIRMAN_DIRECTIVES - Portfolio-scoped
-- ==============================================
DROP POLICY IF EXISTS "chairman_directives_select" ON chairman_directives;
DROP POLICY IF EXISTS "chairman_directives_insert" ON chairman_directives;
DROP POLICY IF EXISTS "chairman_directives_update" ON chairman_directives;

CREATE POLICY "directives_strict_select" ON chairman_directives
  FOR SELECT TO authenticated
  USING (
    -- Venture-scoped directive
    (venture_id IS NOT NULL AND fn_user_has_venture_access(auth.uid(), venture_id, 'read'))
    OR
    -- Portfolio-scoped directive
    (portfolio_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_portfolio_access
      WHERE user_id = auth.uid() AND portfolio_id = chairman_directives.portfolio_id
    ))
    OR
    -- User's own directives
    created_by = auth.uid()
    OR
    current_setting('role') = 'service_role'
  );

CREATE POLICY "directives_strict_insert" ON chairman_directives
  FOR INSERT TO authenticated
  WITH CHECK (
    -- Must have chairman access to create directives
    EXISTS (
      SELECT 1 FROM user_portfolio_access
      WHERE user_id = auth.uid()
        AND portfolio_id = chairman_directives.portfolio_id
        AND access_level = 'chairman'
    )
    OR current_setting('role') = 'service_role'
  );

CREATE POLICY "directives_strict_update" ON chairman_directives
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM user_portfolio_access
      WHERE user_id = auth.uid()
        AND portfolio_id = chairman_directives.portfolio_id
        AND access_level = 'chairman'
    )
    OR current_setting('role') = 'service_role'
  );

-- ==============================================
-- CHAIRMAN_DECISIONS - Strict venture scoping
-- ==============================================
DROP POLICY IF EXISTS "decisions_select" ON chairman_decisions;

CREATE POLICY "decisions_strict_select" ON chairman_decisions
  FOR SELECT TO authenticated
  USING (fn_user_has_venture_access(auth.uid(), venture_id, 'read'));

CREATE POLICY "decisions_strict_insert" ON chairman_decisions
  FOR INSERT TO authenticated
  WITH CHECK (
    fn_user_has_venture_access(auth.uid(), venture_id, 'admin')
    OR current_setting('role') = 'service_role'
  );

CREATE POLICY "decisions_strict_update" ON chairman_decisions
  FOR UPDATE TO authenticated
  USING (
    fn_user_has_venture_access(auth.uid(), venture_id, 'admin')
    OR current_setting('role') = 'service_role'
  );

-- ==============================================
-- VENTURE_TOKEN_LEDGER - Strict isolation
-- ==============================================
DROP POLICY IF EXISTS "token_ledger_select" ON venture_token_ledger;

CREATE POLICY "token_ledger_strict_select" ON venture_token_ledger
  FOR SELECT TO authenticated
  USING (fn_user_has_venture_access(auth.uid(), venture_id, 'read'));

CREATE POLICY "token_ledger_service_insert" ON venture_token_ledger
  FOR INSERT TO service_role WITH CHECK (true);

-- ==============================================
-- ASSUMPTION_SETS - Strict isolation
-- ==============================================
DROP POLICY IF EXISTS "assumptions_select" ON assumption_sets;

CREATE POLICY "assumptions_strict_select" ON assumption_sets
  FOR SELECT TO authenticated
  USING (fn_user_has_venture_access(auth.uid(), venture_id, 'read'));

CREATE POLICY "assumptions_strict_insert" ON assumption_sets
  FOR INSERT TO authenticated
  WITH CHECK (
    fn_user_has_venture_access(auth.uid(), venture_id, 'write')
    OR current_setting('role') = 'service_role'
  );

CREATE POLICY "assumptions_strict_update" ON assumption_sets
  FOR UPDATE TO authenticated
  USING (fn_user_has_venture_access(auth.uid(), venture_id, 'write'));

-- ==============================================
-- AGENT_EXECUTION_TRACES - Strict isolation
-- ==============================================
DROP POLICY IF EXISTS "traces_select" ON agent_execution_traces;

CREATE POLICY "traces_strict_select" ON agent_execution_traces
  FOR SELECT TO authenticated
  USING (
    venture_id IS NULL  -- System traces visible to all authenticated
    OR fn_user_has_venture_access(auth.uid(), venture_id, 'read')
  );

-- ==============================================
-- OPERATIONAL_HANDOFF_PACKETS - Strict isolation
-- ==============================================
DROP POLICY IF EXISTS "handoff_packets_select" ON operational_handoff_packets;

CREATE POLICY "handoff_strict_select" ON operational_handoff_packets
  FOR SELECT TO authenticated
  USING (fn_user_has_venture_access(auth.uid(), venture_id, 'read'));

CREATE POLICY "handoff_strict_update" ON operational_handoff_packets
  FOR UPDATE TO authenticated
  USING (fn_user_has_venture_access(auth.uid(), venture_id, 'admin'));

-- ==============================================
-- CIRCUIT_BREAKER_EVENTS - Strict isolation
-- ==============================================
DROP POLICY IF EXISTS "circuit_breaker_select" ON circuit_breaker_events;

CREATE POLICY "circuit_breaker_strict_select" ON circuit_breaker_events
  FOR SELECT TO authenticated
  USING (fn_user_has_venture_access(auth.uid(), venture_id, 'read'));
```

### 11.4 RLS Migration Strategy

When migrating from permissive to strict RLS:

```sql
-- 1. First, populate access tables for existing users
INSERT INTO user_portfolio_access (user_id, portfolio_id, access_level, granted_by)
SELECT DISTINCT
  auth.uid(),           -- Current user becomes chairman
  p.id,
  'chairman',
  auth.uid()
FROM portfolios p
WHERE NOT EXISTS (
  SELECT 1 FROM user_portfolio_access upa
  WHERE upa.portfolio_id = p.id
);

-- 2. Drop old permissive policies
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE policyname LIKE '%_select' OR policyname LIKE '%_insert' OR policyname LIKE '%_update'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
      r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- 3. Create new strict policies (use SQL from 11.3 above)

-- 4. Verify no data leakage
SELECT COUNT(*) AS total_ventures,
       COUNT(*) FILTER (WHERE fn_user_has_venture_access(auth.uid(), id, 'read')) AS accessible
FROM ventures;
-- Should show same count if user is chairman
```

### 11.5 Policy Reference Table

| Table | Read Policy | Write Policy | Admin Policy |
|-------|-------------|--------------|--------------|
| `ventures` | venture or portfolio access | portfolio write+ | portfolio admin+ |
| `chairman_directives` | venture/portfolio access or owner | chairman only | chairman only |
| `chairman_decisions` | venture access | venture admin | venture admin |
| `venture_token_ledger` | venture access | service_role only | service_role only |
| `assumption_sets` | venture access | venture write | venture write |
| `agent_execution_traces` | venture access (system traces public) | service_role only | N/A |
| `operational_handoff_packets` | venture access | venture admin | venture admin |
| `circuit_breaker_events` | venture access | service_role only | N/A |

**Note:** Full RLS specifications for knowledge bases and agent runtime tables are in [10-knowledge-architecture.md](./10-knowledge-architecture.md) and [09-agent-runtime-service.md](./09-agent-runtime-service.md).

---

## References

- Parent: [00_VISION_V2_CHAIRMAN_OS.md](../00_VISION_V2_CHAIRMAN_OS.md) Section 9.2
- Related: [ADR-002-VENTURE-FACTORY-ARCHITECTURE.md](../../architecture/ADR-002-VENTURE-FACTORY-ARCHITECTURE.md)
- Golden Nuggets: [VENTURE_ENGINE_GOLDEN_NUGGETS_PLAN.md](../VENTURE_ENGINE_GOLDEN_NUGGETS_PLAN.md)
- Operational Handoff: [07-operational-handoff.md](./07-operational-handoff.md)
- Blue Sky Assessment: [Architect's Addendum](../../plans/resilient-stargazing-pancake.md)
- Hierarchical Architecture: [06-hierarchical-agent-architecture.md](./06-hierarchical-agent-architecture.md)
- Governance Policy Engine: [08-governance-policy-engine.md](./08-governance-policy-engine.md)
- Agent Runtime Service: [09-agent-runtime-service.md](./09-agent-runtime-service.md)
- Knowledge Architecture: [10-knowledge-architecture.md](./10-knowledge-architecture.md)
- EVA Scaling: [11-eva-scaling.md](./11-eva-scaling.md)
- Ops Debugging: [12-ops-debugging.md](./12-ops-debugging.md)
