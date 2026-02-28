---
category: architecture
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [architecture, auto-generated]
---
# ADR-002: Venture Factory Architecture



## Table of Contents

- [Metadata](#metadata)
- [Status History](#status-history)
- [Executive Summary](#executive-summary)
- [0. Multi-Venture Codebase Architecture](#0-multi-venture-codebase-architecture)
  - [0.1 The Fundamental Model: Single Platform, Multiple Ventures](#01-the-fundamental-model-single-platform-multiple-ventures)
  - [0.2 Why Not Separate Codebases Per Venture?](#02-why-not-separate-codebases-per-venture)
  - [0.3 Where Venture-Specific Things Live](#03-where-venture-specific-things-live)
  - [0.4 The Venture Lifecycle in Code vs Database](#04-the-venture-lifecycle-in-code-vs-database)
  - [0.5 Multi-Venture Development Sessions](#05-multi-venture-development-sessions)
  - [0.6 The Chairman's Factory Console View](#06-the-chairmans-factory-console-view)
  - [0.7 Organizational Hierarchy (Database Schema)](#07-organizational-hierarchy-database-schema)
  - [0.8 Key Architectural Decisions](#08-key-architectural-decisions)
  - [0.9 Shared Services Architecture (Platform-as-a-Factory)](#09-shared-services-architecture-platform-as-a-factory)
  - [0.10 Leo Dashboard Integration (UI Consolidation Vision)](#010-leo-dashboard-integration-ui-consolidation-vision)
- [1. The Philosophy: Solo Founder Constraints](#1-the-philosophy-solo-founder-constraints)
  - [1.1 The Fundamental Truth](#11-the-fundamental-truth)
  - [1.2 Why Traditional Loops Fail for Solo Founders](#12-why-traditional-loops-fail-for-solo-founders)
  - [1.3 The Solo Founder Design Principles](#13-the-solo-founder-design-principles)
  - [1.4 The Chairman Advisory Model](#14-the-chairman-advisory-model)
- [2. The 25-Stage Workflow: Venture Vision v2.0](#2-the-25-stage-workflow-venture-vision-v20)
  - [2.1 Phase Overview](#21-phase-overview)
  - [2.2 Complete Stage Definitions](#22-complete-stage-definitions)
- [3. The Factory Data Model](#3-the-factory-data-model)
  - [3.1 Entity Relationship Overview](#31-entity-relationship-overview)
  - [3.2 Table: `ventures` (Enhanced)](#32-table-ventures-enhanced)
  - [3.3 Table: `lifecycle_stage_config` (NEW)](#33-table-lifecycle_stage_config-new)
  - [3.4 Table: `venture_stage_work` (NEW - The Bridge)](#34-table-venture_stage_work-new---the-bridge)
  - [3.6 The Kill Protocol (Governance)](#36-the-kill-protocol-governance)
  - [3.5 Table: `venture_artifacts` (NEW - The Asset Library)](#35-table-venture_artifacts-new---the-asset-library)
- [4. The Integration Logic: Stage → SD Triggering](#4-the-integration-logic-stage-sd-triggering)
  - [4.1 The Workflow Engine](#41-the-workflow-engine)
  - [4.2 SD Auto-Generation](#42-sd-auto-generation)
  - [4.3 Stage Completion Evaluation](#43-stage-completion-evaluation)
  - [4.4 The Full Integration Flow](#44-the-full-integration-flow)
- [5. The Asset Strategy: Database vs. File Sync](#5-the-asset-strategy-database-vs-file-sync)
  - [5.1 The Problem](#51-the-problem)
  - [5.2 The Solution: Sync Utilities](#52-the-solution-sync-utilities)
  - [5.3 The `syncSystemPrompts()` Utility](#53-the-syncsystemprompts-utility)
  - [5.4 Active Venture Context Switch](#54-active-venture-context-switch)
  - [5.5 Artifact Types and Sync Strategy](#55-artifact-types-and-sync-strategy)
  - [5.5 GenAI Marketing Manifest Strategy (The Manifest)](#55-genai-marketing-manifest-strategy-the-manifest)
- [6. The Chairman's Factory Console](#6-the-chairmans-factory-console)
  - [6.1 Master Dashboard Query](#61-master-dashboard-query)
  - [6.2 Expected Console Output](#62-expected-console-output)
- [7. Implementation Phases](#7-implementation-phases)
  - [Phase 1: Database Schema](#phase-1-database-schema)
  - [Phase 2: Lifecycle Engine Service](#phase-2-lifecycle-engine-service)
  - [Phase 3: Sync Utilities](#phase-3-sync-utilities)
  - [Phase 4: Factory Console UI](#phase-4-factory-console-ui)
- [8. Success Criteria](#8-success-criteria)
- [9. Appendix: Stage Configuration Data](#9-appendix-stage-configuration-data)
- [10. Decision Record](#10-decision-record)
- [11. Strategic Narrative Artifact Schema](#11-strategic-narrative-artifact-schema)
  - [11.1 JSON Schema](#111-json-schema)
  - [11.2 Sequencing Requirement](#112-sequencing-requirement)
  - [11.3 Why This Matters](#113-why-this-matters)
- [12. Vision Transition Plan: 40-Stage → 25-Stage Migration](#12-vision-transition-plan-40-stage-25-stage-migration)
  - [12.1 Migration Scope Assessment](#121-migration-scope-assessment)
  - [12.2 Archive Strategy](#122-archive-strategy)
- [What's Here](#whats-here)
- [Why Archived (Not Deleted)](#why-archived-not-deleted)
- [Do NOT Use These Files For](#do-not-use-these-files-for)
- [Use Instead](#use-instead)
  - [12.3 Stage Mapping: 40-Stage → 25-Stage](#123-stage-mapping-40-stage-25-stage)
  - [12.4 Technical Details Preservation](#124-technical-details-preservation)
  - [12.5 Migration Execution Plan](#125-migration-execution-plan)
  - [12.6 Code Integration Points (CRITICAL)](#126-code-integration-points-critical)
  - [12.7 Strategic Directive Definition](#127-strategic-directive-definition)
  - [12.7 Post-Migration Verification Checklist](#127-post-migration-verification-checklist)
- [Vision Transition Verification](#vision-transition-verification)
  - [Archive Integrity](#archive-integrity)
  - [New Configuration](#new-configuration)
  - [Reference Cleanup](#reference-cleanup)
  - [Functional Verification](#functional-verification)
  - [12.8 Existing Strategic Directives Evaluation](#128-existing-strategic-directives-evaluation)
- [SD Cleanup Verification](#sd-cleanup-verification)
- [13. Decision Records](#13-decision-records)
- [ADDENDUM A: Kochel Integration Cross-Validation (2025-12-09)](#addendum-a-kochel-integration-cross-validation-2025-12-09)
  - [A.1 Purpose](#a1-purpose)
  - [A.2 Cross-Validation Summary](#a2-cross-validation-summary)
  - [A.3 Assessment Dimension Scores](#a3-assessment-dimension-scores)
  - [A.4 Key Findings](#a4-key-findings)
  - [A.5 Preconditions for Migration Phase A](#a5-preconditions-for-migration-phase-a)
  - [A.6 Related Documents](#a6-related-documents)
- [╔════════════════════════════════════════════════════════════════════╗](#)
- [║                    CHAIRMAN DECISION BLOCK                         ║](#-chairman-decision-block-)
- [╠════════════════════════════════════════════════════════════════════╣](#)
- [║                                                                    ║](#-)
- [║  ██████╗  APPROVED  ██████╗                                        ║](#-approved-)
- [║                                                                    ║](#-)
- [║  ┌──────────────────────────────────────────────────────────────┐  ║](#-)
- [║  │  STATUS CHANGE EXECUTED:                                     │  ║](#-status-change-executed-)
- [║  │                                                              │  ║](#-)
- [║  │  ADR-002 Status: PROPOSED → APPROVED                         │  ║](#-adr-002-status-proposed-approved-)
- [║  │                                                              │  ║](#-)
- [║  │  Rationale:                                                  │  ║](#-rationale-)
- [║  │  - Kochel Integration has passed dual-AI architectural       │  ║](#---kochel-integration-has-passed-dual-ai-architectural-)
- [║  │    review (Anti-Gravity: 4.4/5, Claude: 3.9/5)              │  ║](#-review-anti-gravity-445-claude-395-)
- [║  │  - Adopted conservative verdict: "Ready with minor gaps"     │  ║](#---adopted-conservative-verdict-ready-with-minor-gaps-)
- [║  │  - All technical preconditions for Migration Phase A         │  ║](#---all-technical-preconditions-for-migration-phase-a-)
- [║  │    have been satisfied (rollback scripts, quality_score,     │  ║](#-have-been-satisfied-rollback-scripts-quality_score-)
- [║  │    CrewAI contracts created)                                 │  ║](#-crewai-contracts-created-)
- [║  │                                                              │  ║](#-)
- [║  │  Chairman Signature: Chairman, EHG                           │  ║](#-chairman-signature-chairman-ehg-)
- [║  │  Date: 2025-12-09                                            │  ║](#-date-2025-12-09-)
- [║  │                                                              │  ║](#-)
- [║  │  NOTE: This is governance approval only.                     │  ║](#-note-this-is-governance-approval-only-)
- [║  │  Migration execution requires separate authorization.        │  ║](#-migration-execution-requires-separate-authorization-)
- [║  │                                                              │  ║](#-)
- [║  └──────────────────────────────────────────────────────────────┘  ║](#-)
- [║                                                                    ║](#-)
- [╚════════════════════════════════════════════════════════════════════╝](#)
- [ADDENDUM B: Golden Nuggets Integration (2025-12-09)](#addendum-b-golden-nuggets-integration-2025-12-09)
  - [B.1 Purpose](#b1-purpose)
  - [B.2 Phase 1 Golden Nuggets (Foundation)](#b2-phase-1-golden-nuggets-foundation)
  - [B.3 Assumptions vs Reality (Score: 4.85)](#b3-assumptions-vs-reality-score-485)
  - [B.4 Tokens as Investment (Score: 4.35)](#b4-tokens-as-investment-score-435)
  - [B.5 Four Buckets - Hallucination Control (Score: 3.85)](#b5-four-buckets---hallucination-control-score-385)
  - [B.6 Chairman Fast-Follow: Crew Tournament Pilot](#b6-chairman-fast-follow-crew-tournament-pilot)
  - [B.7 Phase 2 Golden Nuggets (Deferred)](#b7-phase-2-golden-nuggets-deferred)
  - [B.8 Decision Records Update](#b8-decision-records-update)

## Metadata
- **Category**: Architecture
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-22
- **Tags**: database, api, testing, unit

**Status**: APPROVED
**Date**: 2025-12-06
**Author**: Lead Systems Architect (Claude)
**Approver**: Chairman, EHG

---

## Status History

| Date | Status | Action | By |
|------|--------|--------|-----|
| 2025-12-06 | PROPOSED | Initial ADR created | Lead Systems Architect |
| 2025-12-06 | PROPOSED | Board upgrades + Chairman Override added | Chairman |
| 2025-12-09 | PROPOSED | Addendum A: Kochel Integration Cross-Validation added | Lead Systems Architect |
| **2025-12-09** | **APPROVED** | **Chairman formal approval following dual-AI cross-validation (Anti-Gravity 4.4/5, Claude 3.9/5). Adopted conservative verdict: "Ready with minor gaps".** | **Chairman, EHG** |

---

## Executive Summary

This Architecture Decision Record defines the **EHG Venture Factory** - a unified system that orchestrates multiple ventures through a 25-stage lifecycle while leveraging the Leo Protocol for engineering execution. This document serves as the read-only blueprint for understanding how the entire factory operates.

---

## 0. Multi-Venture Codebase Architecture

### 0.1 The Fundamental Model: Single Platform, Multiple Ventures

The EHG Venture Factory uses a **Unified Platform Architecture** - one shared codebase that manages multiple ventures as database entities, not separate code repositories.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           EHG VENTURE FACTORY                                    │
│                     (Single Codebase, Multi-Venture)                            │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  /mnt/c/_EHG/                                                                   │
│  ├── EHG_Engineer/           # LEO Protocol Engine (SDs, PRDs, Handoffs)       │
│  │   ├── database/           # Schema definitions                              │
│  │   ├── scripts/            # Automation (sync:prompts, sd:next)              │
│  │   └── .claude/            # Agent configs (venture-filtered)                │
│  │       └── prompts/        # Only ACTIVE venture's prompts                   │
│  │                                                                             │
│  └── ehg/                    # Chairman's Factory Console (React App)          │
│      └── src/                                                                  │
│          ├── components/     # Shared UI (VentureCard, StageTimeline, etc.)    │
│          ├── hooks/          # useVenture(id), useVentureData(id)              │
│          └── pages/          # /ventures, /ventures/:id, /chairman             │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 0.2 Why Not Separate Codebases Per Venture?

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **Separate Repos** | Full isolation, independent deploys | Massive duplication, hard to maintain | ❌ Rejected |
| **Monorepo with Folders** | Some isolation, shared libs | Complex build, folder explosion | ❌ Rejected |
| **Database-Driven (Chosen)** | Single codebase, ventures are data | Must filter by venture_id | ✅ **Selected** |

**Rationale**:
- Ventures share 95% of their lifecycle logic (validation, naming, schema generation)
- Only Stage 17+ (Build Loop) produces venture-specific code
- The Factory orchestrates; it doesn't contain venture product code
- Venture *outputs* (the actual products) deploy separately at Stage 22

### 0.3 Where Venture-Specific Things Live

| Asset Type | Location | Differentiation |
|------------|----------|-----------------|
| Venture metadata | `ventures` table | Row per venture |
| Stage progress | `venture_stage_work` table | `venture_id` foreign key |
| Artifacts (specs, manifests) | `venture_artifacts` table | `venture_id` foreign key |
| System prompts (DB) | `venture_artifacts` | `artifact_type = 'system_prompt'` |
| System prompts (Files) | `.claude/prompts/` | Prefixed: `solara-coder.md` |
| Strategic Directives | `strategic_directives_v2` | Named: `SD-SOLARA-SCHEMA-001` |
| Produced code (MVP+) | Venture's own repo/deploy | Created at Stage 18, deployed at Stage 22 |

### 0.4 The Venture Lifecycle in Code vs Database

```
STAGES 1-17: Database-Only
├── Venture exists as a row in `ventures` table
├── Artifacts stored in `venture_artifacts`
├── Progress tracked in `venture_stage_work`
└── NO venture-specific code exists yet

STAGE 18 (MVP Development Loop): Code Generation Begins
├── Leo Protocol generates actual product code
├── Code lives in venture's deployment target (TBD at Stage 17)
└── Could be: Vercel project, separate repo, or subdirectory

STAGES 19-22: Build, Secure, Test, Deploy
├── Code continues to be developed
├── Deployed to production infrastructure
└── Venture becomes a LIVE PRODUCT (independent of Factory)

STAGES 23-25: Post-Launch
├── Factory monitors via analytics
├── Optimization SDs still reference the venture
└── Growth Engine uses venture's distribution_config
```

### 0.5 Multi-Venture Development Sessions

When working on multiple ventures simultaneously:

**Option A: Sequential Focus (Recommended for Solo Chairman)**
```bash
# Morning: Work on Solara
echo "SOLARA" > .active_venture
npm run sync:prompts
# Leo Protocol SDs filtered to SOLARA

# Afternoon: Switch to Oracle
echo "ORACLE" > .active_venture
npm run sync:prompts
# Leo Protocol SDs filtered to ORACLE
```

**Option B: Parallel Development (Future, with team)**
```bash
# Multiple terminals, each with different ACTIVE_VENTURE env var
ACTIVE_VENTURE=SOLARA npm run dev  # Terminal 1
ACTIVE_VENTURE=ORACLE npm run dev  # Terminal 2
```

### 0.6 The Chairman's Factory Console View

The `ehg` app provides a unified view of ALL ventures:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        CHAIRMAN'S FACTORY CONSOLE                                │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  PORTFOLIO: AI Ventures                              [+ New Venture]            │
│  ─────────────────────────────────────────────────────────────────              │
│                                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐                 │
│  │ SOLARA          │  │ ORACLE          │  │ FINBOT          │                 │
│  │ Stage 16 🟢     │  │ Stage 18 🟡     │  │ Stage 3  🔴     │                 │
│  │ Schema Gen      │  │ MVP Dev         │  │ Validation      │                 │
│  │ ────────────    │  │ ────────────    │  │ ────────────    │                 │
│  │ SD-SOLARA-      │  │ SD-ORACLE-      │  │ AWAITING        │                 │
│  │ SCHEMA-001      │  │ MVP-002         │  │ DECISION        │                 │
│  │ [View] [Focus]  │  │ [View] [Focus]  │  │ [View] [Kill]   │                 │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘                 │
│                                                                                 │
│  [Focus] = Sets .active_venture and opens venture detail                       │
│  [Kill]  = Executes Kill Protocol (ADR-002-007)                                │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 0.7 Organizational Hierarchy (Database Schema)

```
┌─────────────────┐
│   COMPANIES     │  EHG Holdings, Partner Corps, etc.
│   (Top Level)   │
└────────┬────────┘
         │ 1:N
         ▼
┌─────────────────┐
│   PORTFOLIOS    │  "AI Ventures", "FinTech", "Consumer"
│   (Per Company) │
└────────┬────────┘
         │ 1:N
         ▼
┌─────────────────┐
│   VENTURES      │  SolaraAI, OracleBot, FinBot, PayFlow
│ (Per Portfolio) │
│                 │
│ Key Columns:    │
│ - venture_code  │  SOLARA, ORACLE, FINBOT
│ - status        │  active, paused, archived, killed
│ - current_lifecycle_stage  │  1-25
│ - archetype     │  saas_b2b, marketplace, etc.
└────────┬────────┘
         │ 1:N
         ▼
┌─────────────────┐
│ VENTURE_STAGE_  │  Links each venture to its SDs
│ WORK (Bridge)   │  One row per stage per venture
└────────┬────────┘
         │ N:1
         ▼
┌─────────────────┐
│ STRATEGIC_      │  SD-SOLARA-SCHEMA-001
│ DIRECTIVES_V2   │  Executed via Leo Protocol
└─────────────────┘
```

### 0.8 Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Venture storage | Database rows | Ventures are data, not code |
| Shared codebase | Yes | 95% shared logic across ventures |
| Venture isolation | RLS + venture_id FK | Database-level security |
| Agent prompts | Filtered sync | `.active_venture` controls which prompts load |
| SD naming | `SD-{CODE}-{SUFFIX}-{SEQ}` | Clear venture attribution |
| Produced code location | Determined at Stage 17 | Venture chooses its deployment target |

### 0.9 Shared Services Architecture (Platform-as-a-Factory)

The EHG Venture Factory is an **Application Incubator/Builder** - the output of the 25-stage process is a fully deployable, independent application. All ventures benefit from shared services, creating a network effect where improvements to one service benefit all ventures.

#### 0.9.1 The Platform Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        EHG VENTURE FACTORY                                  │
│                   "Build Once, Benefit All"                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  SHARED SERVICES LAYER (All Ventures Consume)                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ CrewAI      │  │ AI Model    │  │ Auth        │  │ Media Gen   │        │
│  │ Agents (18) │  │ Gateway     │  │ Service     │  │ (MJ/Sora)   │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ Cost        │  │ Rate        │  │ Email       │  │ Billing     │        │
│  │ Tracker     │  │ Limiter     │  │ (Resend)    │  │ (Stripe)    │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                                             │
│  ACCESS VIA: api.ehg.ventures/v1 OR @ehg/sdk                               │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  VENTURE APPLICATIONS (Independent Deployments)                             │
│                                                                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │ SolaraAI         │  │ OracleBot        │  │ FinBot           │          │
│  │ Lovable Deploy   │  │ Vercel Deploy    │  │ Self-Hosted      │          │
│  │ /solara2 repo    │  │ /oracle repo     │  │ /finbot repo     │          │
│  │                  │  │                  │  │                  │          │
│  │ USES: Agents,    │  │ USES: Agents,    │  │ USES: Billing,   │          │
│  │ Media Gen        │  │ AI Gateway       │  │ Auth             │          │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 0.9.2 Shared Services Inventory

**Currently Implemented:**

| Service | Location | Status |
|---------|----------|--------|
| **CrewAI Agents** (18 crews, 28+ agents) | `/ehg/agent-platform/app/crews/` | ✅ Active |
| **AI Model Gateway** (OpenAI, Anthropic, Perplexity) | `/ehg/agent-platform/app/utils/llm_fallback.py` | ✅ Active |
| **Auth Service** (Supabase + RBAC) | `/ehg/agent-platform/app/middleware/supabase_auth.py` | ✅ Active |
| **Cost Tracker** (LLM usage) | `/ehg/agent-platform/app/services/cost_tracker.py` | ✅ Active |
| **Rate Limiter** | `/ehg/agent-platform/app/middleware/rate_limiter.py` | ✅ Active |
| **Voice Generation** (ElevenLabs TTS) | `/ehg/supabase/functions/eleven-sign-url/` | ✅ Active |

**Planned/Infrastructure Ready:**

| Service | Status | Notes |
|---------|--------|-------|
| **Media Gen** (Midjourney, Sora, Runway) | 🟡 Infrastructure ready | APIs not connected |
| **Email Service** (Resend) | 🟡 Referenced | Not implemented |
| **Billing Service** (Stripe) | 🔴 Not found | Needs implementation |

#### 0.9.3 Service Consumption Model

Ventures consume shared services via two patterns:

**Pattern A: API Gateway (Recommended)**
```
POST api.ehg.ventures/v1/agents/invoke
Authorization: Bearer {venture_api_key}
X-Venture-ID: SOLARA
{
  "crew": "branding",
  "task": "generate_taglines",
  "context": { ... }
}
```

**Pattern B: SDK Import (Deep Integration)**
```typescript
import { EHGServices } from '@ehg/sdk'

const agents = new EHGServices.Agents({ ventureId: 'SOLARA' })
const result = await agents.invoke('branding', 'generate_taglines', context)
```

**Why API Gateway + Optional SDK:**
- Ventures can be ANY tech stack (React, Python, mobile, etc.)
- Gateway centralizes auth, rate limiting, cost tracking
- SDK optional for ventures wanting deeper integration
- Network effect: usage data feeds back to improve all ventures

#### 0.9.4 Database Isolation Model

**Hybrid Approach: Shared Factory + Per-Venture Schemas**

| Data Type | Storage | Rationale |
|-----------|---------|-----------|
| Venture metadata, stage progress | **Shared DB** (`ventures`, `venture_stage_work`) | Factory needs holistic view |
| Venture artifacts, system prompts | **Shared DB** (`venture_artifacts`) | Cross-venture analytics |
| Shared service logs, costs | **Shared DB** with `venture_id` FK | Usage tracking |
| Venture user data (customers) | **Per-venture schema** | True isolation for sensitive data |

```sql
-- Shared factory tables (existing pattern)
public.ventures
public.venture_stage_work
public.venture_artifacts

-- Per-venture schemas (created at Stage 17)
CREATE SCHEMA solara;   -- SolaraAI customer data
CREATE SCHEMA oracle;   -- OracleBot customer data
CREATE SCHEMA finbot;   -- FinBot customer data

-- Venture-specific tables in their schema
solara.users
solara.subscriptions
solara.transactions
```

**Why Hybrid:**
- Factory maintains oversight of all ventures (holistic view)
- Customer data isolated (regulatory compliance, security)
- Shared services still track per-venture usage
- Scales to many ventures without table pollution

#### 0.9.5 Venture Deployment Model

At **Stage 17** (Environment & Agent Config), Chairman selects deployment target:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE 17: Environment Configuration                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ Chairman Decision: "Where will {venture_name} be deployed?"                 │
│                                                                             │
│ ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐              │
│ │ [A] Lovable     │  │ [B] Vercel      │  │ [C] Self-Host   │              │
│ │ Zero-config     │  │ Full control    │  │ Custom infra    │              │
│ │ Fast iteration  │  │ API-first       │  │ Maximum control │              │
│ └─────────────────┘  └─────────────────┘  └─────────────────┘              │
│                                                                             │
│ Selection stored in: venture_artifacts (artifact_type: 'deployment_config')│
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Factory Tracks All Ventures:**
```sql
-- ventures table enhancements
ALTER TABLE ventures ADD COLUMN deployment_target VARCHAR(50);  -- 'lovable', 'vercel', 'self_hosted'
ALTER TABLE ventures ADD COLUMN deployment_url TEXT;            -- Production URL
ALTER TABLE ventures ADD COLUMN repo_url TEXT;                  -- GitHub repo (if applicable)
```

#### 0.9.6 Network Effect: How Ventures Benefit Each Other

```
┌────────────────────────────────────────────────────────────────────────────┐
│                         NETWORK EFFECT MODEL                                │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  1. SHARED IMPROVEMENTS                                                    │
│     ┌─────────┐        ┌─────────┐        ┌─────────┐                     │
│     │ Solara  │───────▶│ Improved│───────▶│ Oracle  │                     │
│     │ uses    │        │ Branding│        │ benefits│                     │
│     │ Branding│        │ Crew    │        │ from    │                     │
│     │ Crew    │        │         │        │ upgrade │                     │
│     └─────────┘        └─────────┘        └─────────┘                     │
│                                                                            │
│  2. COST AMORTIZATION                                                      │
│     • AI Gateway costs spread across all ventures                          │
│     • Auth infrastructure built once, used everywhere                      │
│     • Media generation APIs shared                                         │
│                                                                            │
│  3. PATTERN LEARNING                                                       │
│     • Successful patterns from Venture A inform Venture B                  │
│     • Stage completion data improves advisory recommendations              │
│     • Error patterns logged and prevented across all ventures              │
│                                                                            │
│  4. CROSS-VENTURE INTEGRATION (Future)                                     │
│     • Venture A can consume Venture B's API                                │
│     • Shared user authentication across ventures                           │
│     • Portfolio-level analytics and reporting                              │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

#### 0.9.7 CrewAI Agents Available to All Ventures

The agent platform provides 18 specialized crews:

| Crew | Purpose | Example Usage |
|------|---------|---------------|
| `advertising_crew` | Ad campaigns, media planning | Stage 11 GTM |
| `branding_crew` | Positioning, identity, messaging | Stage 10 Naming |
| `finance_department_crew` | Burn rate, valuation, investment | Stage 5-6 |
| `marketing_department_crew` | Segmentation, positioning | Stage 11 |
| `product_management_crew` | Features, roadmap, PMF | Stage 15 |
| `technical_crew` | Architecture decisions | Stage 13-14 |
| `legal_department_crew` | Contracts, IP analysis | Stage 6 Risk |
| `deep_research_crew` | Market research, validation | Stage 3-4 |
| `board_review_crew` | Strategic review | Decision gates |

**Agent Invocation Pattern:**
```python
# From any venture application
result = await ehg_sdk.crews.invoke(
    crew="branding_crew",
    task="generate_brand_guidelines",
    context={
        "venture_id": "SOLARA",
        "venture_name": "SolaraAI",
        "target_market": "Solar panel owners",
        "value_proposition": "AI-powered energy optimization"
    }
)
```

### 0.10 Leo Dashboard Integration (UI Consolidation Vision)

The **Leo Dashboard** is the existing UI in EHG_Engineer for managing Strategic Directives and the LEAD/PLAN/EXEC workflow. This section documents how it should integrate with the Venture Factory architecture.

#### 0.10.1 Current Leo Dashboard Components

**Location:** `/mnt/c/_EHG/EHG_Engineer/src/client/`

| Component | Purpose | Current State |
|-----------|---------|---------------|
| **SDManager** | Strategic Directive list/detail views | ✅ Active |
| **PRDManager** | PRD document management | ✅ Active |
| **BacklogManager** | User story backlog | ✅ Active |
| **HandoffCenter** | LEAD→PLAN→EXEC transitions | ✅ Active |
| **DirectiveLab** | SD creation wizard | ✅ Active |
| **UATDashboard** | User acceptance testing | ✅ Active |
| **VenturesManager** | Basic venture list | ✅ Active (limited) |
| **ContextMonitor** | Token usage tracking | ✅ Active |

**Current Routes (EHG_Engineer App):**
```
/                        → SDManager (default view)
/strategic-directives    → SD list
/strategic-directives/:id → SD detail
/prds                    → PRD list
/prds/:id               → PRD detail
/backlog                → User story backlog
/directive-lab          → SD creation
/handoffs               → Phase transitions
/uat-tests              → UAT dashboard
/ventures               → Ventures list (basic)
```

#### 0.10.2 The Integration Vision: Unified Chairman Console

The Leo Dashboard should be **absorbed into** the EHG Factory Console (`/mnt/c/_EHG/EHG/`) to create a unified Chairman experience. The vision:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    UNIFIED CHAIRMAN CONSOLE                                  │
│                    (Merger of EHG + Leo Dashboard)                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  MACRO VIEW: Venture Portfolio                                              │
│  ┌─────────────────────────────────────────────────────────────────┐       │
│  │ VENTURES (25-Stage Lifecycle)                                    │       │
│  │ ┌─────────┐ ┌─────────┐ ┌─────────┐                             │       │
│  │ │ Solara  │ │ Oracle  │ │ FinBot  │  ← Click to drill down      │       │
│  │ │ Stage 16│ │ Stage 18│ │ Stage 3 │                             │       │
│  │ └─────────┘ └─────────┘ └─────────┘                             │       │
│  └─────────────────────────────────────────────────────────────────┘       │
│                              │                                              │
│                              ▼ Drill down                                   │
│  MICRO VIEW: Leo Protocol Work (for selected venture)                       │
│  ┌─────────────────────────────────────────────────────────────────┐       │
│  │ SOLARA: Stage 16 Work                                            │       │
│  │ ┌─────────────────────────────────────────────────────────┐     │       │
│  │ │ SD-SOLARA-SCHEMA-001                                     │     │       │
│  │ │ Phase: EXEC │ Progress: 72% │ PRD: PRD-SOLARA-001       │     │       │
│  │ │ [View PRD] [View Stories] [Handoff] [Context Monitor]   │     │       │
│  │ └─────────────────────────────────────────────────────────┘     │       │
│  └─────────────────────────────────────────────────────────────────┘       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 0.10.3 Proposed Navigation Structure

**Merged Application Routes:**
```
/chairman                    → Portfolio overview (all ventures, all stages)
/chairman/ventures           → Venture list with 25-stage progress
/chairman/ventures/:code     → Single venture deep-dive
  └── /stages               → Stage timeline with artifacts
  └── /directives           → SDs for this venture (filtered SDManager)
  └── /prds                 → PRDs for this venture
  └── /backlog              → User stories for this venture
  └── /artifacts            → All artifacts (manifests, schemas, etc.)

/workbench                   → Active work view (current SD focus)
  └── /directive-lab        → SD creation (venture-aware)
  └── /handoffs             → LEAD/PLAN/EXEC transitions
  └── /uat                  → UAT dashboard (venture-filtered)
  └── /context              → Context monitor
```

#### 0.10.4 Key Integration Points

**1. Venture-Aware SD Filtering**
```typescript
// Current: SDManager shows ALL SDs
// Future: SDManager filters by active venture
const activeVenture = useActiveVenture(); // from .active_venture or URL
const filteredSDs = strategicDirectives.filter(
  sd => sd.metadata?.venture_id === activeVenture.id ||
        sd.id.startsWith(`SD-${activeVenture.code}-`)
);
```

**2. Stage-to-SD Navigation**
```typescript
// Click on Stage 16 in venture timeline
// → Opens SDManager filtered to SD-SOLARA-SCHEMA-* directives
// → Shows related PRDs and user stories
// → Context: "You are working on Solara Stage 16: Schema Generation"
```

**3. Unified State Model**
```typescript
// Current: Separate state trees for ventures and SDs
// Future: Unified state with venture context
interface ChairmanState {
  ventures: Venture[];
  activeVenture: Venture | null;

  // Leo Protocol state (scoped to active venture)
  strategicDirectives: SD[];  // Filtered by venture
  prds: PRD[];                // Filtered by venture
  backlog: UserStory[];       // Filtered by venture

  // Cross-cutting
  leoProtocol: {
    currentSD: string;
    phase: 'LEAD' | 'PLAN' | 'EXEC';
  };
}
```

#### 0.10.5 Re-Imagined Chairman Workflow

**Before (Two Separate Apps):**
1. Open EHG App → See ventures
2. Open EHG_Engineer App → Work on SDs
3. Mentally track which SD belongs to which venture
4. Context switch between apps constantly

**After (Unified Console):**
1. Open Chairman Console → See all ventures with stages
2. Click venture → See its SDs, PRDs, artifacts in context
3. Click "Work on Stage 16" → Leo Protocol workspace opens with venture context pre-loaded
4. Handoffs automatically tagged to venture
5. Progress updates flow back to venture stage

#### 0.10.6 Implementation Approach

**Phase 1: Venture Context Propagation**
- Add `venture_id` and `lifecycle_stage` to all SD/PRD records
- Update SDManager to accept venture filter prop
- Create `useActiveVenture()` hook

**Phase 2: Navigation Integration**
- Add venture drill-down routes to EHG app
- Embed SDManager, PRDManager, BacklogManager components
- Create stage-to-SD navigation

**Phase 3: Unified State**
- Merge WebSocket state models
- Single source of truth for ventures + SDs
- Real-time updates across all views

**Phase 4: Chairman Workspace**
- Context-aware SD creation (auto-tags venture)
- Stage-aware handoff validation
- Unified artifact browser

#### 0.10.7 Benefits for Solo Chairman

| Current Pain | Future Benefit |
|--------------|----------------|
| "Which SD belongs to which venture?" | SDs automatically grouped by venture |
| "What stage is Solara at?" | Stage visible on venture card |
| "What artifacts exist for Stage 10?" | Artifact browser per venture/stage |
| "Am I working on the right thing?" | Context bar shows: "Solara > Stage 16 > SD-SOLARA-SCHEMA-001" |
| "How do I start work on a new stage?" | Click stage → Auto-creates SD from template |

---

## 1. The Philosophy: Solo Founder Constraints

### 1.1 The Fundamental Truth

> **"Loops are for teams. Dashboards are for solos."**

The EHG Venture Factory is designed for a **Solo AI Entrepreneur** - a single Chairman who serves simultaneously as visionary, architect, product manager, and executor. This fundamentally changes how workflow controls should operate.

### 1.2 Why Traditional Loops Fail for Solo Founders

In corporate settings, workflow loops exist to **force communication** between parties:
- Loop A forces Product to talk to Founders
- Loop B forces Engineering to talk to Finance
- Loop C forces Dev to talk to Architects

**But the Solo Chairman IS all these people.** Automated "GOTO" loops that interrupt flow are *friction*, not *safety*.

### 1.3 The Solo Founder Design Principles

| Principle | Implementation |
|-----------|----------------|
| **No Hard Loops** | System INFORMS decisions, never MAKES them |
| **Soft Gates** | Health scores (Green/Yellow/Red) instead of blockers |
| **Override with Audit** | Chairman can proceed with acknowledged risk |
| **Contextual Benchmarks** | Thresholds vary by venture archetype |
| **Inline Fixes** | Quick actions instead of stage resets |

### 1.4 The Chairman Advisory Model

Instead of automated loops, the Factory uses a **Chairman Advisory Engine** that:

1. **Surfaces Insights** at decision points (not interruptions)
2. **Provides Quick Fixes** that can be applied inline
3. **Logs Overrides** when Chairman proceeds despite warnings
4. **Adapts Thresholds** based on venture archetype (SaaS B2B, Marketplace, etc.)

```
Traditional Loop:                    Solo Founder Model:

IF score < threshold                 IF score < threshold
  GOTO previous_stage                  SHOW advisory with quick_fixes
  (loses all work)                     ALLOW proceed with risk_acknowledged
                                       LOG decision for audit trail
```

---

## 2. The 25-Stage Workflow: Venture Vision v2.0

### 2.1 Phase Overview

| Phase | Name | Stages | Purpose |
|-------|------|--------|---------|
| 1 | THE TRUTH | 1-5 | Validate the idea before building |
| 2 | THE ENGINE | 6-9 | Define business model and monetization |
| 3 | THE IDENTITY | 10-12 | Brand, positioning, and go-to-market |
| 4 | THE BLUEPRINT | 13-16 | Technical design before code |
| 5 | THE BUILD LOOP | 17-22 | Engineering execution via Leo Protocol |
| 6 | LAUNCH & LEARN | 23-25 | Deploy, measure, optimize |

### 2.2 Complete Stage Definitions

#### PHASE 1: THE TRUTH (Stages 1-5)
*"Ruthlessly validate before you build"*

| Stage | Name | Work Type | Advisory Gate | Key Outputs |
|-------|------|-----------|---------------|-------------|
| **1** | Draft Idea & Chairman Review | `artifact_only` | No | Idea brief |
| **2** | AI Multi-Model Critique | `automated_check` | No | Critique report (GPT-4, Claude, Gemini) |
| **3** | Market Validation & RAT | `decision_gate` | **YES** | Validation score, Pivot/Persist/Kill decision |
| **4** | Competitive Intelligence | `artifact_only` | No | Competitive analysis, gap detection |
| **5** | Profitability Forecasting | `decision_gate` | **YES** | Financial model, unit economics health |

**Stage 3 Advisory**: "Reality Check"
- Evaluates validation score (1-10 scale)
- Presents Pivot suggestions if score < 6
- Requires Chairman decision: PIVOT / PERSIST / KILL

**Stage 5 Advisory**: "Unit Economics"
- Compares margins to archetype benchmarks
- Surfaces quick fixes (price adjustments, cost cuts)
- Chairman can proceed with risk acknowledged

#### PHASE 2: THE ENGINE (Stages 6-9)
*"Design the money machine"*

| Stage | Name | Work Type | Advisory Gate | Key Outputs |
|-------|------|-----------|---------------|-------------|
| **6** | Risk Evaluation Matrix | `artifact_only` | No | Risk matrix (tech, capital, regulatory) |
| **7** | Pricing Strategy | `artifact_only` | No | Pricing model, tier structure |
| **8** | Business Model Canvas | `artifact_only` | No | BMC artifact |
| **9** | Exit-Oriented Design | `artifact_only` | No | Exit strategy, acquirer profile |

#### PHASE 3: THE IDENTITY (Stages 10-12)
*"Define the vibe, then find the name"*

| Stage | Name | Work Type | Advisory Gate | Key Outputs |
|-------|------|-----------|---------------|-------------|
| **10** | Strategic Narrative & Positioning | `artifact_only` | No | Strategic narrative (story), marketing manifest (Vibe) |
| **11** | Strategic Naming | `sd_required` | No | Brand name, domain, trademark check (uses Story + Vibe) |
| **12** | Sales & Success Logic | `artifact_only` | No | Sales playbook, success metrics |

**Critical Sequencing Logic**:
1. Stage 10 creates the `strategic_narrative` FIRST - defining the founder's "why", the villain, the hero's journey, and brand archetype
2. Stage 10 then creates the `marketing_manifest` - using the narrative to define voice, visual identity, and multimedia specs
3. Stage 11 uses BOTH the narrative (soul) and manifest (expression) to generate naming candidates

> **"You cannot name the hero until you know their story."** - Chairman Override (2025-12-06)

**Note**: Stage 11 is the FIRST stage that triggers a Strategic Directive. Prior stages produce artifacts only.

#### PHASE 4: THE BLUEPRINT (Stages 13-16)
*"The Kochel Firewall - Spec before code"*

| Stage | Name | Work Type | Advisory Gate | Key Outputs |
|-------|------|-----------|---------------|-------------|
| **13** | Tech Stack Interrogation | `decision_gate` | No | Tech stack decision with rationale |
| **14** | Data Model & Architecture | `sd_required` | No | ERD, entity definitions |
| **15** | Epic & User Story Breakdown | `sd_required` | No | User stories (INVEST criteria) |
| **16** | Spec-Driven Schema Generation | `decision_gate` | **YES** | TypeScript interfaces, SQL schemas |

**Stage 16 Advisory**: "The Firewall"
- Schema Completeness Checklist (not ambiguity detection)
- All entities named? All relationships explicit? All fields typed?
- The Question: "Can Claude build this without asking clarifying questions?"

**The Firewall Philosophy**:
> No code is written until the schema is unambiguous. Stage 16 is the checkpoint that prevents "build first, spec later" chaos.

#### PHASE 5: THE BUILD LOOP (Stages 17-22)
*"Leo Protocol engineering execution"*

| Stage | Name | Work Type | Advisory Gate | Key Outputs |
|-------|------|-----------|---------------|-------------|
| **17** | Environment & Agent Config | `sd_required` | No | System prompts, CI/CD, dev environment |
| **18** | MVP Development Loop | `sd_required` | No | Working code (iterative) |
| **19** | Monetization & API Layer | `sd_required` | No | Payment integration, revenue APIs |
| **20** | Security & Performance | `sd_required` | No | Security hardening, performance tuning |
| **21** | QA & UAT | `sd_required` | No | Test coverage, UAT reports |
| **22** | Deployment & Infrastructure | `sd_required` | No | Production deployment |

**Build Loop Pattern**:
```
Stage 17-22 each generate SDs that follow Leo Protocol:
  SD created → LEAD approves → PLAN creates PRD → EXEC implements → LEAD closes
```

#### PHASE 6: LAUNCH & LEARN (Stages 23-25)
*"Ship it, measure it, scale it"*

| Stage | Name | Work Type | Advisory Gate | Key Outputs |
|-------|------|-----------|---------------|-------------|
| **23** | Production Launch | `decision_gate` | No | Launch checklist, go/no-go decision |
| **24** | Analytics & Feedback | `artifact_only` | No | Analytics dashboard, feedback loops |
| **25** | Autonomous Growth & Media Engine | `sd_required` | No | GenAI media pipelines, growth automation |

---

## 3. The Factory Data Model

### 3.1 Entity Relationship Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EHG VENTURE FACTORY                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  COMPANIES (existing)                                                       │
│      │                                                                      │
│      └── PORTFOLIOS (existing)                                              │
│              │                                                              │
│              └── VENTURES (enhanced)                                        │
│                      │                                                      │
│                      ├── venture_stage_work (NEW - Bridge Table)            │
│                      │       │                                              │
│                      │       └── strategic_directives_v2 (existing)         │
│                      │               │                                      │
│                      │               └── product_requirements_v2 (existing) │
│                      │                                                      │
│                      └── venture_artifacts (NEW - Asset Library)            │
│                                                                             │
│  lifecycle_stage_config (NEW - Reference Table)                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Table: `ventures` (Enhanced)

**Purpose**: Core venture entity with lifecycle tracking.

```sql
-- Existing columns preserved
-- New columns added for Factory integration

ALTER TABLE ventures ADD COLUMN IF NOT EXISTS current_lifecycle_stage INT DEFAULT 1;
ALTER TABLE ventures ADD COLUMN IF NOT EXISTS venture_code VARCHAR(20);
ALTER TABLE ventures ADD COLUMN IF NOT EXISTS archetype VARCHAR(30);
ALTER TABLE ventures ADD COLUMN IF NOT EXISTS revision_count INT DEFAULT 0;
ALTER TABLE ventures ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';
ALTER TABLE ventures ADD COLUMN IF NOT EXISTS killed_at TIMESTAMPTZ;
ALTER TABLE ventures ADD COLUMN IF NOT EXISTS kill_reason TEXT;
```

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | Primary key |
| `name` | VARCHAR | Venture name |
| `portfolio_id` | UUID FK | Parent portfolio |
| `current_lifecycle_stage` | INT | **NEW** - Current stage (1-25) |
| `venture_code` | VARCHAR(20) | **NEW** - Short code (e.g., "SOLARA") |
| `archetype` | VARCHAR(30) | **NEW** - Business archetype for benchmarking |
| `revision_count` | INT | **NEW** - How many times validation loops triggered |
| `status` | VARCHAR(20) | **NEW** - Venture lifecycle status (see Kill Protocol) |
| `killed_at` | TIMESTAMPTZ | **NEW** - When venture was killed (if applicable) |
| `kill_reason` | TEXT | **NEW** - Why venture was killed |

**Status Values (Kill Switch)**:

| Status | Description |
|--------|-------------|
| `active` | Venture is progressing through stages |
| `paused` | Temporarily halted, can resume |
| `archived` | Completed or shelved, read-only |
| `killed` | Terminated at decision gate, all SDs cancelled |

**Archetype Values**:
- `saas_b2b` - SaaS for businesses
- `saas_b2c` - SaaS for consumers
- `marketplace` - Two-sided marketplace
- `hardware` - Physical product
- `services` - Professional services
- `ai_agent` - AI-powered product

### 3.3 Table: `lifecycle_stage_config` (NEW)

**Purpose**: Reference table defining all 25 stages. Single source of truth for stage metadata.

```sql
CREATE TABLE lifecycle_stage_config (
  stage_number INT PRIMARY KEY,
  stage_name VARCHAR(100) NOT NULL,
  phase_number INT NOT NULL,
  phase_name VARCHAR(50) NOT NULL,
  work_type VARCHAR(30) NOT NULL,
  sd_required BOOLEAN DEFAULT false,
  required_artifacts TEXT[],
  sd_suffix VARCHAR(20),
  sd_template TEXT,
  advisory_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

| Column | Type | Purpose |
|--------|------|---------|
| `stage_number` | INT PK | Stage identifier (1-25) |
| `stage_name` | VARCHAR | Human-readable stage name |
| `phase_number` | INT | Phase grouping (1-6) |
| `phase_name` | VARCHAR | Phase name ("THE TRUTH", etc.) |
| `work_type` | VARCHAR | See Work Types below |
| `sd_required` | BOOLEAN | Does this stage need an SD? |
| `required_artifacts` | TEXT[] | Artifact types required to exit |
| `sd_suffix` | VARCHAR | SD naming suffix (e.g., "SCHEMA") |
| `sd_template` | TEXT | Template for auto-generated SD description |
| `advisory_enabled` | BOOLEAN | Does this stage have a Chairman Advisory? |

**Work Types**:

| Work Type | Description | SD Generated? |
|-----------|-------------|---------------|
| `artifact_only` | Stage produces documents/decisions, no code | No |
| `automated_check` | System runs automated validation | No |
| `decision_gate` | Chairman must make explicit decision | Maybe |
| `sd_required` | Stage REQUIRES engineering work via Leo Protocol | **Yes** |

### 3.4 Table: `venture_stage_work` (NEW - The Bridge)

**Purpose**: Links venture lifecycle stages to Leo Protocol Strategic Directives. This is the **KEY INNOVATION** - the bridge between Macro (25-stage lifecycle) and Micro (Leo Protocol execution).

```sql
CREATE TABLE venture_stage_work (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Macro Reference (Venture Lifecycle)
  venture_id UUID REFERENCES ventures(id) NOT NULL,
  lifecycle_stage INT REFERENCES lifecycle_stage_config(stage_number) NOT NULL,

  -- Micro Reference (Leo Protocol)
  sd_id VARCHAR(50) REFERENCES strategic_directives_v2(id),

  -- Stage Status
  stage_status VARCHAR(20) DEFAULT 'not_started',
  work_type VARCHAR(30) NOT NULL,

  -- Timestamps
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Time-Boxing (Governance)
  decision_due_at TIMESTAMPTZ,

  -- Advisory System
  health_score VARCHAR(10),
  advisory_data JSONB,
  chairman_decision VARCHAR(30),
  override_reason TEXT,

  -- Constraints
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(venture_id, lifecycle_stage)
);
```

| Column | Type | Purpose |
|--------|------|---------|
| `venture_id` | UUID FK | Which venture |
| `lifecycle_stage` | INT FK | Which stage (1-25) |
| `sd_id` | VARCHAR FK | Linked Strategic Directive (if applicable) |
| `stage_status` | VARCHAR | Progress status (see below) |
| `work_type` | VARCHAR | Copied from stage config for denormalization |
| `decision_due_at` | TIMESTAMPTZ | **NEW** - Time-box deadline for decision gates |
| `health_score` | VARCHAR | Advisory result: `green`, `yellow`, `red` |
| `advisory_data` | JSONB | Full advisory output (recommendations, quick fixes) |
| `chairman_decision` | VARCHAR | What the Chairman decided |
| `override_reason` | TEXT | Why Chairman proceeded despite warning |

**Stage Status Values**:

| Status | Description |
|--------|-------------|
| `not_started` | Stage not yet entered |
| `in_progress` | Currently working on this stage |
| `awaiting_decision` | At decision gate, waiting for Chairman |
| `blocked` | Cannot proceed (dependency or advisory) |
| `completed` | Stage finished successfully |
| `skipped` | Stage intentionally skipped (rare) |

### 3.6 The Kill Protocol (Governance)

When the Chairman selects **KILL** at any Decision Gate (Stage 3, 5, or 16), the system executes the Kill Protocol:

```typescript
// Pseudocode - killProtocol.ts

async function executeKillProtocol(
  ventureId: string,
  stage: number,
  reason: string
): Promise<void> {

  // 1. Update venture status
  await supabase
    .from('ventures')
    .update({
      status: 'killed',
      killed_at: new Date().toISOString(),
      kill_reason: reason
    })
    .eq('id', ventureId);

  // 2. Cancel all open Strategic Directives for this venture
  const { data: openSDs } = await supabase
    .from('venture_stage_work')
    .select('sd_id')
    .eq('venture_id', ventureId)
    .not('sd_id', 'is', null);

  for (const { sd_id } of openSDs) {
    await supabase
      .from('strategic_directives_v2')
      .update({
        status: 'cancelled',
        metadata: {
          ...existingMetadata,
          cancelled_reason: 'venture_killed',
          cancelled_at: new Date().toISOString()
        }
      })
      .eq('id', sd_id)
      .neq('status', 'completed');
  }

  // 3. Mark all pending stage work as cancelled
  await supabase
    .from('venture_stage_work')
    .update({ stage_status: 'cancelled' })
    .eq('venture_id', ventureId)
    .neq('stage_status', 'completed');

  // 4. Log the kill event
  console.log(`[KILL PROTOCOL] Venture ${ventureId} killed at Stage ${stage}: ${reason}`);
}
```

**Kill Protocol Triggers**:
- Chairman selects "KILL" at Stage 3 (Reality Check)
- Chairman selects "KILL" at Stage 5 (Unit Economics)
- Chairman selects "KILL" at Stage 16 (The Firewall)
- Manual kill via Chairman Console

**Post-Kill State**:
- `ventures.status` = 'killed'
- All open SDs cancelled
- All pending stage work cancelled
- Venture visible in archive but cannot progress

### 3.5 Table: `venture_artifacts` (NEW - The Asset Library)

**Purpose**: Stores non-code assets produced during the venture lifecycle. System prompts, marketing manifests, brand guidelines, pricing models, etc.

```sql
CREATE TABLE venture_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership
  venture_id UUID REFERENCES ventures(id) NOT NULL,
  lifecycle_stage INT NOT NULL,

  -- Artifact Identity
  artifact_type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,

  -- Content
  content TEXT,
  file_url TEXT,

  -- Versioning
  version INT DEFAULT 1,
  is_current BOOLEAN DEFAULT true,

  -- Metadata
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID,

  -- Ensure only one 'current' artifact per type per venture
  CONSTRAINT unique_current_artifact
    UNIQUE(venture_id, artifact_type, is_current)
    WHERE is_current = true
);
```

| Column | Type | Purpose |
|--------|------|---------|
| `venture_id` | UUID FK | Which venture owns this artifact |
| `lifecycle_stage` | INT | Which stage produced this artifact |
| `artifact_type` | VARCHAR | Type classification (see below) |
| `title` | VARCHAR | Human-readable title |
| `content` | TEXT | Markdown/JSON content (for text artifacts) |
| `file_url` | TEXT | S3/Storage URL (for binary artifacts) |
| `version` | INT | Version number for history |
| `is_current` | BOOLEAN | Is this the active version? |
| `metadata` | JSONB | Flexible extension field |

**Artifact Types by Stage**:

| Stage | Artifact Type | Format |
|-------|--------------|--------|
| 1 | `idea_brief` | Markdown |
| 2 | `critique_report` | JSON (multi-model responses) |
| 3 | `validation_report` | JSON (scores, signals) |
| 4 | `competitive_analysis` | Markdown + JSON data |
| 5 | `financial_model` | JSON (projections, scenarios) |
| 6 | `risk_matrix` | JSON (categorized risks) |
| 7 | `pricing_model` | JSON (tiers, features, prices) |
| 8 | `business_model_canvas` | JSON (9 BMC blocks) |
| 9 | `exit_strategy` | Markdown |
| 10 | `strategic_narrative` | JSON (origin_story, the_villain, heros_journey, brand_archetype) |
| 10 | `marketing_manifest` | JSON (GenAI multimedia manifest - informed by narrative) |
| 11 | `brand_guidelines` | Markdown + file_url (logo) |
| 12 | `sales_playbook` | Markdown |
| 13 | `tech_stack_decision` | JSON (choices + rationale) |
| 14 | `data_model` | JSON (entities, relationships) |
| 15 | `user_story_pack` | JSON (stories array) |
| 16 | `api_contract` | JSON (OpenAPI spec) |
| 16 | `schema_spec` | SQL + TypeScript |
| 17 | `system_prompt` | JSON (agent configs) |
| 17 | `environment_config` | JSON (env vars, CI/CD) |
| 23 | `launch_checklist` | Markdown (checklist) |
| 24 | `analytics_dashboard` | JSON (metrics, queries) |
| 25 | `media_pipeline_config` | JSON (GenAI orchestration) |

---

## 4. The Integration Logic: Stage → SD Triggering

### 4.1 The Workflow Engine

When a venture advances through stages, the **Venture Lifecycle Engine** determines what work is needed:

```typescript
// Pseudocode - ventureLifecycleEngine.ts

async function advanceVentureStage(ventureId: string): Promise<StageTransition> {
  const venture = await getVenture(ventureId);
  const currentStage = venture.current_lifecycle_stage;
  const stageConfig = await getStageConfig(currentStage);

  // 1. Check if current stage is complete
  const isComplete = await evaluateStageCompletion(ventureId, currentStage, stageConfig);

  if (!isComplete) {
    return { decision: 'hold', reason: 'Stage not complete' };
  }

  // 2. If decision gate, check Chairman decision
  if (stageConfig.advisory_enabled) {
    const decision = await getChairmanDecision(ventureId, currentStage);
    if (!decision || decision.status === 'pending') {
      return { decision: 'hold', reason: 'Awaiting Chairman decision' };
    }
  }

  // 3. Advance to next stage
  const nextStage = currentStage + 1;
  await updateVentureStage(ventureId, nextStage);

  // 4. Auto-create work items for next stage
  const nextConfig = await getStageConfig(nextStage);

  if (nextConfig.sd_required) {
    await createSDForStage(ventureId, nextStage, nextConfig);
  }

  if (nextConfig.required_artifacts.length > 0) {
    await initializeArtifactSlots(ventureId, nextStage, nextConfig.required_artifacts);
  }

  return { decision: 'advance', fromStage: currentStage, toStage: nextStage };
}
```

### 4.2 SD Auto-Generation

When a venture enters an `sd_required` stage, the system auto-generates the Strategic Directive:

```typescript
// Pseudocode - createSDForStage

async function createSDForStage(
  ventureId: string,
  stage: number,
  config: StageConfig
): Promise<string> {

  const venture = await getVenture(ventureId);

  // Generate SD ID following naming convention
  const sdId = `SD-${venture.venture_code}-${config.sd_suffix}-001`;
  // Example: SD-SOLARA-SCHEMA-001 for Stage 16

  // Create the Strategic Directive
  const sd = await createStrategicDirective({
    id: sdId,
    title: `${venture.name}: ${config.stage_name}`,
    description: config.sd_template.replace('{venture_name}', venture.name),
    category: mapStageToCategory(stage),
    priority: 'high',
    status: 'active',

    // Link back to venture
    metadata: {
      venture_id: ventureId,
      lifecycle_stage: stage,
      auto_generated: true,
      venture_code: venture.venture_code
    }
  });

  // Create the bridge record
  await createStageWork({
    venture_id: ventureId,
    lifecycle_stage: stage,
    sd_id: sdId,
    work_type: 'sd_required',
    stage_status: 'in_progress',
    started_at: new Date()
  });

  // SD now enters Leo Protocol: LEAD → PLAN → EXEC
  return sdId;
}
```

### 4.3 Stage Completion Evaluation

Different work types have different completion criteria:

```typescript
async function evaluateStageCompletion(
  ventureId: string,
  stage: number,
  config: StageConfig
): Promise<boolean> {

  switch (config.work_type) {

    case 'sd_required':
      // Check if all SDs for this stage are in LEAD_FINAL phase
      const sds = await getSDsForStage(ventureId, stage);
      return sds.length > 0 && sds.every(sd => sd.status === 'completed');

    case 'artifact_only':
      // Check if required artifacts exist
      const artifacts = await getArtifactsForStage(ventureId, stage);
      return config.required_artifacts.every(type =>
        artifacts.some(a => a.artifact_type === type && a.is_current)
      );

    case 'decision_gate':
      // Check if Chairman has made a decision
      const decision = await getChairmanDecision(ventureId, stage);
      return decision && decision.status !== 'pending';

    case 'automated_check':
      // Check if automated validation passed
      const check = await getAutomatedCheckResult(ventureId, stage);
      return check && check.passed;

    default:
      return false;
  }
}
```

### 4.4 The Full Integration Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    VENTURE FACTORY → LEO PROTOCOL FLOW                       │
└─────────────────────────────────────────────────────────────────────────────┘

1. VENTURE ENTERS STAGE 16 (Schema Generation)
   │
   ├── Lifecycle Engine detects: work_type = 'sd_required'
   │
   ├── Auto-generates: SD-SOLARA-SCHEMA-001
   │       title: "SolaraAI: Spec-Driven Schema Generation"
   │       metadata: { venture_id, lifecycle_stage: 16 }
   │
   └── Creates bridge record in venture_stage_work
           { venture_id, lifecycle_stage: 16, sd_id: SD-SOLARA-SCHEMA-001 }

2. SD ENTERS LEO PROTOCOL
   │
   ├── LEAD Phase: Approves SD scope, assigns priority
   │
   ├── PLAN Phase: Creates PRD with user stories
   │       │
   │       └── PRD linked via product_requirements_v2.sd_id
   │
   └── EXEC Phase: Implements code
           │
           └── Code committed, tests pass

3. SD COMPLETES (LEAD_FINAL)
   │
   ├── SD status → 'completed'
   │
   ├── Lifecycle Engine evaluates stage completion
   │       │
   │       └── All SDs for Stage 16 complete? YES
   │
   └── Stage 16 Advisory: "The Firewall"
           │
           ├── Runs Schema Completeness Checklist
           │
           └── If PASS → Advance to Stage 17
               If FAIL → Show quick fixes, await Chairman decision

4. VENTURE ADVANCES TO STAGE 17
   │
   └── Cycle repeats...
```

---

## 5. The Asset Strategy: Database vs. File Sync

### 5.1 The Problem

The Venture Factory stores artifacts in the database for:
- **Versioning**: Track changes over time
- **Querying**: Find artifacts across ventures
- **Audit Trail**: Know who created/modified what

However, certain artifacts (especially System Prompts) need to exist as **files** for:
- **Agent Codebase**: Claude Code expects prompts in `.claude/prompts/`
- **Version Control**: Git tracking of prompt changes
- **Local Development**: Developers need files to work with

### 5.2 The Solution: Sync Utilities

**Pattern**: Database is source of truth, filesystem is derived.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ASSET SYNC ARCHITECTURE                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  DATABASE (Source of Truth)          FILESYSTEM (Derived)                   │
│  ┌─────────────────────────┐         ┌─────────────────────────┐           │
│  │ venture_artifacts       │         │ .claude/prompts/        │           │
│  │   artifact_type:        │  ───►   │   solara-coder.md       │           │
│  │     'system_prompt'     │  sync   │   solara-reviewer.md    │           │
│  │   content: {...}        │         │   oracle-coder.md       │           │
│  │   is_current: true      │         │                         │           │
│  └─────────────────────────┘         └─────────────────────────┘           │
│                                                                             │
│  Sync Triggers:                                                             │
│  • On deployment (CI/CD pipeline)                                           │
│  • On `npm run sync:prompts` (manual)                                       │
│  • On artifact update (database trigger)                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.3 The `syncSystemPrompts()` Utility

```typescript
// File: scripts/sync-system-prompts.ts

interface SystemPromptArtifact {
  venture_id: string;
  venture_code: string;
  content: {
    agents: Array<{
      name: string;          // e.g., "solara-coder"
      role: string;          // e.g., "Implementation Agent"
      system_prompt: string; // The actual prompt content
      model: string;         // e.g., "claude-sonnet-4"
      temperature: number;
    }>;
    shared_context?: {
      tech_stack: string[];
      coding_standards: string;
    };
  };
}

async function syncSystemPrompts(): Promise<SyncResult> {
  const supabase = createClient();

  // 1. Fetch all current system prompts from database
  const { data: artifacts } = await supabase
    .from('venture_artifacts')
    .select(`
      id,
      venture_id,
      content,
      metadata,
      ventures!inner(venture_code, name)
    `)
    .eq('artifact_type', 'system_prompt')
    .eq('is_current', true);

  const results: SyncResult = { synced: [], failed: [] };

  // 2. For each artifact, write to filesystem
  for (const artifact of artifacts) {
    const promptData = artifact.content as SystemPromptArtifact['content'];
    const ventureCode = artifact.ventures.venture_code.toLowerCase();

    for (const agent of promptData.agents) {
      const filename = `${ventureCode}-${agent.name}.md`;
      const filepath = path.join('.claude', 'prompts', filename);

      const content = generatePromptFile(agent, artifact.ventures.name);

      try {
        await fs.writeFile(filepath, content, 'utf-8');
        results.synced.push(filepath);
      } catch (error) {
        results.failed.push({ filepath, error: error.message });
      }
    }
  }

  // 3. Log sync results
  console.log(`Synced ${results.synced.length} prompts`);
  if (results.failed.length > 0) {
    console.error(`Failed to sync ${results.failed.length} prompts`);
  }

  return results;
}

function generatePromptFile(agent: Agent, ventureName: string): string {
  return `# ${agent.name}

**Venture**: ${ventureName}
**Role**: ${agent.role}
**Model**: ${agent.model}
**Temperature**: ${agent.temperature}

---

${agent.system_prompt}

---
*Auto-generated by syncSystemPrompts() - Do not edit directly*
*Source: venture_artifacts database*
`;
}
```

### 5.4 Active Venture Context Switch

**Problem**: When syncing prompts, we don't want to pollute `.claude/prompts/` with agents from ALL ventures. Each development session focuses on ONE venture at a time.

**Solution**: The `.active_venture` file in the project root.

```bash
# File: .active_venture
SOLARA
```

**Sync Logic with Context Filtering:**

```typescript
// File: scripts/sync-system-prompts.ts (enhanced)

async function syncSystemPrompts(): Promise<SyncResult> {
  // 1. Read active venture from context file
  const activeVenture = await getActiveVenture();

  if (!activeVenture) {
    console.warn('[SYNC] No .active_venture file found. Sync ALL prompts? (use --all flag)');
    return { synced: [], failed: [], skipped: 'no_active_venture' };
  }

  console.log(`[SYNC] Active venture: ${activeVenture}`);

  // 2. Fetch only prompts for the active venture
  const { data: artifacts } = await supabase
    .from('venture_artifacts')
    .select(`
      id,
      venture_id,
      content,
      metadata,
      ventures!inner(venture_code, name)
    `)
    .eq('artifact_type', 'system_prompt')
    .eq('is_current', true)
    .eq('ventures.venture_code', activeVenture);  // FILTER BY ACTIVE VENTURE

  // 3. Clean old prompts for this venture before syncing
  await cleanVenturePrompts(activeVenture);

  // 4. Write new prompts
  const results: SyncResult = { synced: [], failed: [] };

  for (const artifact of artifacts) {
    const promptData = artifact.content as SystemPromptArtifact['content'];

    for (const agent of promptData.agents) {
      const filename = `${activeVenture.toLowerCase()}-${agent.name}.md`;
      const filepath = path.join('.claude', 'prompts', filename);

      try {
        await fs.writeFile(filepath, generatePromptFile(agent, artifact.ventures.name), 'utf-8');
        results.synced.push(filepath);
      } catch (error) {
        results.failed.push({ filepath, error: error.message });
      }
    }
  }

  console.log(`[SYNC] Synced ${results.synced.length} prompts for ${activeVenture}`);
  return results;
}

async function getActiveVenture(): Promise<string | null> {
  const activeVentureFile = path.join(process.cwd(), '.active_venture');

  try {
    const content = await fs.readFile(activeVentureFile, 'utf-8');
    return content.trim().toUpperCase();
  } catch {
    return null;
  }
}

async function cleanVenturePrompts(ventureCode: string): Promise<void> {
  const promptsDir = path.join(process.cwd(), '.claude', 'prompts');
  const prefix = ventureCode.toLowerCase() + '-';

  const files = await fs.readdir(promptsDir);
  for (const file of files) {
    if (file.startsWith(prefix)) {
      await fs.unlink(path.join(promptsDir, file));
    }
  }
}
```

**npm Script:**

```json
{
  "scripts": {
    "sync:prompts": "npx ts-node scripts/sync-system-prompts.ts",
    "sync:prompts:all": "npx ts-node scripts/sync-system-prompts.ts --all",
    "venture:set": "echo $1 > .active_venture"
  }
}
```

**Usage:**

```bash
# Set active venture
echo "SOLARA" > .active_venture

# Sync only Solara's prompts
npm run sync:prompts
# Output: [SYNC] Synced 3 prompts for SOLARA
#   - .claude/prompts/solara-coder.md
#   - .claude/prompts/solara-reviewer.md
#   - .claude/prompts/solara-tester.md

# Switch to Oracle
echo "ORACLE" > .active_venture

# Sync only Oracle's prompts (cleans old Solara prompts first)
npm run sync:prompts
# Output: [SYNC] Synced 2 prompts for ORACLE
#   - .claude/prompts/oracle-coder.md
#   - .claude/prompts/oracle-researcher.md

# Sync ALL ventures (for CI/CD or multi-venture work)
npm run sync:prompts:all
```

**Environment Variable Alternative:**

```bash
# Can also use env var instead of file
export ACTIVE_VENTURE=SOLARA
npm run sync:prompts
```

### 5.5 Artifact Types and Sync Strategy

| Artifact Type | Storage | Sync to Filesystem? | Sync Location |
|--------------|---------|---------------------|---------------|
| `idea_brief` | DB only | No | - |
| `critique_report` | DB only | No | - |
| `validation_report` | DB only | No | - |
| `competitive_analysis` | DB only | No | - |
| `financial_model` | DB only | No | - |
| `risk_matrix` | DB only | No | - |
| `pricing_model` | DB only | No | - |
| `business_model_canvas` | DB only | No | - |
| `exit_strategy` | DB only | No | - |
| `brand_guidelines` | DB + S3 | No | - |
| `marketing_manifest` | DB only | No | - |
| `sales_playbook` | DB only | No | - |
| `tech_stack_decision` | DB only | No | - |
| `data_model` | DB only | No | - |
| `user_story_pack` | DB only | No | - |
| `api_contract` | DB only | **Yes** | `docs/api/` |
| `schema_spec` | DB only | **Yes** | `database/schemas/` |
| `system_prompt` | DB only | **Yes** | `.claude/prompts/` |
| `environment_config` | DB only | **Yes** | `.env.example` |
| `launch_checklist` | DB only | No | - |
| `analytics_dashboard` | DB only | No | - |

### 5.5 GenAI Marketing Manifest Strategy (The Manifest)

The `marketing_manifest` artifact defines how GenAI tools generate **both text AND multimedia content**. This is the central configuration for all automated content generation.

**Required Schema Fields:**

```json
{
  "artifact_type": "marketing_manifest",
  "venture_id": "uuid-of-solara",
  "content": {
    // === TEXT CONTENT CONFIG ===
    "brand_voice": {
      "tone": "professional yet approachable",
      "personality": ["innovative", "reliable", "forward-thinking"],
      "avoid": ["jargon", "hype", "unsubstantiated claims"]
    },
    "target_audience": {
      "primary": "Solar installation companies",
      "secondary": "Residential solar owners",
      "pain_points": ["efficiency monitoring", "predictive maintenance"]
    },
    "messaging_pillars": [
      {
        "pillar": "Efficiency Optimization",
        "key_messages": [
          "Maximize solar output with AI-powered monitoring",
          "Identify underperforming panels before they fail"
        ]
      }
    ],
    "content_templates": {
      "social_post": "Template with {variable} placeholders",
      "email_subject": "Template for email subjects",
      "landing_page_headline": "Main value proposition"
    },
    "seo_keywords": ["solar monitoring", "panel efficiency", "AI solar"],
    "competitor_differentiation": "What makes us different",

    // === MULTIMEDIA ASSET CONFIG (REQUIRED) ===
    "midjourney_prompts": {
      "hero_image": {
        "prompt": "Futuristic solar panel array on modern rooftop, golden hour lighting, photorealistic, 8k, --ar 16:9 --v 6",
        "negative_prompt": "cartoon, illustration, low quality",
        "style_reference": "clean tech aesthetic",
        "use_cases": ["landing_page_hero", "social_og_image"]
      },
      "product_shots": [
        {
          "name": "dashboard_mockup",
          "prompt": "Clean SaaS dashboard interface showing solar panel efficiency metrics, dark mode, glassmorphism, --ar 4:3 --v 6",
          "use_cases": ["feature_page", "app_store_screenshot"]
        },
        {
          "name": "mobile_app",
          "prompt": "Hand holding smartphone displaying solar monitoring app, outdoor setting, natural lighting, --ar 9:16 --v 6",
          "use_cases": ["mobile_marketing", "social_story"]
        }
      ],
      "brand_elements": {
        "color_palette_visualization": "Abstract gradient visualization of brand colors #FF6B35 #2EC4B6 #011627",
        "pattern_library": "Geometric solar cell pattern, seamless tile, minimalist"
      }
    },

    "sora_video_scripts": {
      "explainer_video": {
        "duration_seconds": 60,
        "script": "Open on aerial shot of solar farm at sunrise. Transition to dashboard interface showing real-time metrics. Cut to split-screen: traditional monitoring vs AI-powered insights. End with logo reveal and CTA.",
        "style": "cinematic, professional, warm color grading",
        "audio_direction": "Uplifting corporate music, no voiceover for international use"
      },
      "social_clips": [
        {
          "name": "feature_highlight",
          "duration_seconds": 15,
          "script": "Quick cuts: solar panel → phone notification → efficiency graph trending up → satisfied homeowner",
          "format": "vertical_9x16",
          "use_cases": ["tiktok", "instagram_reels", "youtube_shorts"]
        },
        {
          "name": "testimonial_b_roll",
          "duration_seconds": 30,
          "script": "Solar installer reviewing data on tablet, nodding approvingly, transition to panels in background",
          "format": "horizontal_16x9",
          "use_cases": ["website_testimonial", "case_study"]
        }
      ],
      "demo_walkthrough": {
        "duration_seconds": 120,
        "script": "Screen recording style: cursor navigating dashboard, highlighting key features with zoom effects",
        "style": "clean, educational, subtle animations"
      }
    },

    "runway_settings": {
      "default_model": "gen-3-alpha",
      "motion_presets": {
        "hero_animation": {
          "base_image": "midjourney_hero_image_output",
          "motion_type": "slow_zoom_out",
          "duration": 4,
          "interpolation": "smooth"
        },
        "logo_reveal": {
          "motion_type": "fade_in_scale",
          "duration": 2,
          "easing": "ease_out_cubic"
        },
        "data_visualization": {
          "motion_type": "graph_line_draw",
          "duration": 3,
          "style": "tech_futuristic"
        }
      },
      "video_to_video_presets": {
        "style_transfer": "cinematic_color_grade",
        "upscaling": "4x_ai_enhance",
        "frame_interpolation": true
      }
    },

    // === DISTRIBUTION LAYER (REQUIRED) ===
    "distribution_config": {
      "linkedin": {
        "enabled": true,
        "api_reference": "LINKEDIN_ACCESS_TOKEN",
        "organization_id": "env:LINKEDIN_ORG_ID",
        "default_visibility": "PUBLIC",
        "content_types": ["article", "image_post", "video_post"]
      },
      "x_twitter": {
        "enabled": true,
        "api_reference": "X_BEARER_TOKEN",
        "account_id": "env:X_ACCOUNT_ID",
        "content_types": ["tweet", "thread", "media"]
      },
      "resend": {
        "enabled": true,
        "api_reference": "RESEND_API_KEY",
        "from_domain": "env:EMAIL_FROM_DOMAIN",
        "audiences": {
          "newsletter": "aud_newsletter_subscribers",
          "product_updates": "aud_product_users",
          "leads": "aud_marketing_leads"
        },
        "templates": {
          "weekly_digest": "tmpl_weekly_digest",
          "product_announcement": "tmpl_announcement",
          "nurture_sequence": "tmpl_nurture_{{step}}"
        }
      },
      "vercel": {
        "enabled": true,
        "api_reference": "VERCEL_TOKEN",
        "project_id": "env:VERCEL_PROJECT_ID",
        "deployment_hooks": {
          "blog_publish": "hook_blog_rebuild",
          "landing_page_update": "hook_landing_rebuild"
        },
        "edge_config": "env:EDGE_CONFIG_ID"
      },
      "youtube": {
        "enabled": false,
        "api_reference": "YOUTUBE_API_KEY",
        "channel_id": "env:YOUTUBE_CHANNEL_ID",
        "default_privacy": "public",
        "playlists": {
          "tutorials": "PLxxxxx",
          "product_updates": "PLyyyyy"
        }
      }
    },

    // === SCHEDULING & AUTOMATION ===
    "content_calendar": {
      "frequency": {
        "social_posts": "3x_weekly",
        "blog_articles": "2x_monthly",
        "video_content": "1x_monthly"
      },
      "platforms": ["linkedin", "twitter", "youtube", "instagram"]
    }
  }
}
```

**Manifest Field Requirements:**

| Field | Required | Purpose |
|-------|----------|---------|
| `brand_voice` | Yes | Text generation tone/style |
| `target_audience` | Yes | Content targeting |
| `messaging_pillars` | Yes | Core value propositions |
| `midjourney_prompts` | **Yes** | Image generation configs |
| `sora_video_scripts` | **Yes** | Video generation scripts |
| `runway_settings` | **Yes** | Video post-processing configs |
| `distribution_config` | **Yes** | API references for content shipping (LinkedIn, X, Resend, Vercel) |
| `content_calendar` | No | Automation scheduling |

This manifest is consumed by GenAI content generation tools but **does not sync to filesystem** - it's queried directly from the database when needed. Stage 25 (Autonomous Growth & Media Engine) uses this manifest to configure the automated content pipelines.

---

## 6. The Chairman's Factory Console

### 6.1 Master Dashboard Query

```sql
-- Chairman's Master View: All Ventures, All Stages, All Health

SELECT
  c.name AS company,
  p.name AS portfolio,
  v.name AS venture,
  v.venture_code,
  v.current_lifecycle_stage AS current_stage,
  lsc.stage_name,
  lsc.phase_name,
  vsw.stage_status,
  vsw.health_score,

  -- SD Progress (if applicable)
  sd.id AS current_sd,
  sd.status AS sd_status,

  -- Artifact Count
  (SELECT COUNT(*)
   FROM venture_artifacts va
   WHERE va.venture_id = v.id AND va.is_current = true
  ) AS artifact_count,

  -- Time in Stage
  EXTRACT(DAY FROM NOW() - vsw.started_at) AS days_in_stage,

  -- Advisory Status
  CASE
    WHEN lsc.advisory_enabled AND vsw.chairman_decision IS NULL
    THEN 'AWAITING_DECISION'
    ELSE vsw.chairman_decision
  END AS advisory_status

FROM ventures v
JOIN portfolios p ON v.portfolio_id = p.id
JOIN companies c ON p.company_id = c.id
LEFT JOIN venture_stage_work vsw ON v.id = vsw.venture_id
  AND v.current_lifecycle_stage = vsw.lifecycle_stage
LEFT JOIN strategic_directives_v2 sd ON vsw.sd_id = sd.id
LEFT JOIN lifecycle_stage_config lsc ON v.current_lifecycle_stage = lsc.stage_number

ORDER BY c.name, p.name, v.current_lifecycle_stage DESC;
```

### 6.2 Expected Console Output

```
┌──────────┬─────────────┬──────────────┬────────┬───────┬────────────────────────┬─────────────┬──────────┬────────┬────────────────────────┬─────────────┐
│ Company  │ Portfolio   │ Venture      │ Code   │ Stage │ Stage Name             │ Phase       │ Status   │ Health │ Current SD             │ Days        │
├──────────┼─────────────┼──────────────┼────────┼───────┼────────────────────────┼─────────────┼──────────┼────────┼────────────────────────┼─────────────┤
│ EHG      │ AI Ventures │ SolaraAI     │ SOLARA │ 16    │ Schema Generation      │ BLUEPRINT   │ active   │ 🟢     │ SD-SOLARA-SCHEMA-001  │ 3           │
│ EHG      │ AI Ventures │ OracleBot    │ ORACLE │ 18    │ MVP Development        │ BUILD LOOP  │ active   │ 🟡     │ SD-ORACLE-MVP-002     │ 12          │
│ EHG      │ FinTech     │ FinBot       │ FINBOT │ 3     │ Market Validation      │ THE TRUTH   │ awaiting │ 🔴     │ -                      │ 7           │
│ EHG      │ FinTech     │ PayFlow      │ PAYFLW │ 5     │ Profitability Forecast │ THE TRUTH   │ awaiting │ 🟡     │ -                      │ 2           │
└──────────┴─────────────┴──────────────┴────────┴───────┴────────────────────────┴─────────────┴──────────┴────────┴────────────────────────┴─────────────┘
```

---

## 7. Implementation Phases

### Phase 1: Database Schema
- Create `lifecycle_stage_config` table
- Create `venture_stage_work` table
- Create `venture_artifacts` table
- Enhance `ventures` table with new columns
- Populate 25-stage configuration data

### Phase 2: Lifecycle Engine Service
- `ventureLifecycleEngine.ts` - Stage progression logic
- `createSDForStage()` - Auto-generate SDs
- `evaluateStageCompletion()` - Completion checks
- `chairmanAdvisor.ts` - Advisory system

### Phase 3: Sync Utilities
- `syncSystemPrompts()` - DB → Filesystem sync
- `syncApiContracts()` - OpenAPI spec sync
- `syncSchemaSpecs()` - SQL/TypeScript sync

### Phase 4: Factory Console UI
- Dashboard view with portfolio grouping
- Stage timeline visualization
- Advisory decision interface
- Artifact editor/viewer

---

## 8. Success Criteria

| Criterion | Metric |
|-----------|--------|
| All 25 stages defined | `lifecycle_stage_config` has 25 rows |
| Bridge table operational | `venture_stage_work` links ventures to SDs |
| Artifact storage working | `venture_artifacts` stores non-code assets |
| Auto SD generation | `sd_required` stages auto-create SDs |
| Advisory system functional | Decision gates show health scores |
| Sync utility operational | `syncSystemPrompts()` writes to filesystem |
| Factory Console readable | Chairman can view all ventures in one place |

---

## 9. Appendix: Stage Configuration Data

```yaml
# lifecycle_stage_config seed data

stages:
  # PHASE 1: THE TRUTH
  - stage_number: 1
    stage_name: "Draft Idea & Chairman Review"
    phase_number: 1
    phase_name: "THE TRUTH"
    work_type: "artifact_only"
    sd_required: false
    required_artifacts: ["idea_brief"]
    advisory_enabled: false

  - stage_number: 2
    stage_name: "AI Multi-Model Critique"
    phase_number: 1
    phase_name: "THE TRUTH"
    work_type: "automated_check"
    sd_required: false
    required_artifacts: ["critique_report"]
    advisory_enabled: false

  - stage_number: 3
    stage_name: "Market Validation & RAT"
    phase_number: 1
    phase_name: "THE TRUTH"
    work_type: "decision_gate"
    sd_required: false
    required_artifacts: ["validation_report"]
    advisory_enabled: true

  - stage_number: 4
    stage_name: "Competitive Intelligence"
    phase_number: 1
    phase_name: "THE TRUTH"
    work_type: "artifact_only"
    sd_required: false
    required_artifacts: ["competitive_analysis"]
    advisory_enabled: false

  - stage_number: 5
    stage_name: "Profitability Forecasting"
    phase_number: 1
    phase_name: "THE TRUTH"
    work_type: "decision_gate"
    sd_required: false
    required_artifacts: ["financial_model"]
    advisory_enabled: true

  # PHASE 2: THE ENGINE
  - stage_number: 6
    stage_name: "Risk Evaluation Matrix"
    phase_number: 2
    phase_name: "THE ENGINE"
    work_type: "artifact_only"
    sd_required: false
    required_artifacts: ["risk_matrix"]
    advisory_enabled: false

  - stage_number: 7
    stage_name: "Pricing Strategy"
    phase_number: 2
    phase_name: "THE ENGINE"
    work_type: "artifact_only"
    sd_required: false
    required_artifacts: ["pricing_model"]
    advisory_enabled: false

  - stage_number: 8
    stage_name: "Business Model Canvas"
    phase_number: 2
    phase_name: "THE ENGINE"
    work_type: "artifact_only"
    sd_required: false
    required_artifacts: ["business_model_canvas"]
    advisory_enabled: false

  - stage_number: 9
    stage_name: "Exit-Oriented Design"
    phase_number: 2
    phase_name: "THE ENGINE"
    work_type: "artifact_only"
    sd_required: false
    required_artifacts: ["exit_strategy"]
    advisory_enabled: false

  # PHASE 3: THE IDENTITY
  - stage_number: 10
    stage_name: "Strategic Narrative & Positioning"
    phase_number: 3
    phase_name: "THE IDENTITY"
    work_type: "artifact_only"
    sd_required: false
    required_artifacts: ["strategic_narrative", "marketing_manifest"]
    advisory_enabled: false
    # CRITICAL INSIGHT: We cannot name the hero until we know their story.
    # The strategic_narrative artifact MUST be created FIRST, then marketing_manifest.
    #
    # strategic_narrative JSON structure:
    #   origin_story: The Founder's 'Why' - the personal motivation and vision
    #   the_villain: The specific pain/enemy the user fights against
    #   heros_journey: The transformation from struggle to victory
    #   brand_archetype: One of 12 Jungian archetypes (The Rebel, The Sage, The Magician, etc.)
    #
    # The marketing_manifest then uses this narrative to define the "Vibe" -
    # brand voice, visual identity, and multimedia generation specs.

  - stage_number: 11
    stage_name: "Strategic Naming"
    phase_number: 3
    phase_name: "THE IDENTITY"
    work_type: "sd_required"
    sd_required: true
    required_artifacts: ["brand_guidelines"]
    sd_suffix: "NAMING"
    sd_template: "Execute strategic naming process for {venture_name}. Use the strategic_narrative (origin_story, villain, hero's journey, archetype) and marketing_manifest 'Vibe' to generate name candidates that embody the brand's story and soul."
    advisory_enabled: false
    # SEQUENCING: This stage STRICTLY follows Stage 10.
    # You cannot name the hero until you know their story.

  - stage_number: 12
    stage_name: "Sales & Success Logic"
    phase_number: 3
    phase_name: "THE IDENTITY"
    work_type: "artifact_only"
    sd_required: false
    required_artifacts: ["sales_playbook"]
    advisory_enabled: false

  # PHASE 4: THE BLUEPRINT
  - stage_number: 13
    stage_name: "Tech Stack Interrogation"
    phase_number: 4
    phase_name: "THE BLUEPRINT"
    work_type: "decision_gate"
    sd_required: false
    required_artifacts: ["tech_stack_decision"]
    advisory_enabled: false

  - stage_number: 14
    stage_name: "Data Model & Architecture"
    phase_number: 4
    phase_name: "THE BLUEPRINT"
    work_type: "sd_required"
    sd_required: true
    required_artifacts: ["data_model"]
    sd_suffix: "DATAMODEL"
    sd_template: "Design data model and architecture for {venture_name}"
    advisory_enabled: false

  - stage_number: 15
    stage_name: "Epic & User Story Breakdown"
    phase_number: 4
    phase_name: "THE BLUEPRINT"
    work_type: "sd_required"
    sd_required: true
    required_artifacts: ["user_story_pack"]
    sd_suffix: "STORIES"
    sd_template: "Create epic and user story breakdown for {venture_name}"
    advisory_enabled: false

  - stage_number: 16
    stage_name: "Spec-Driven Schema Generation"
    phase_number: 4
    phase_name: "THE BLUEPRINT"
    work_type: "decision_gate"
    sd_required: true
    required_artifacts: ["api_contract", "schema_spec"]
    sd_suffix: "SCHEMA"
    sd_template: "Generate TypeScript interfaces and SQL schemas for {venture_name}"
    advisory_enabled: true

  # PHASE 5: THE BUILD LOOP
  - stage_number: 17
    stage_name: "Environment & Agent Config"
    phase_number: 5
    phase_name: "THE BUILD LOOP"
    work_type: "sd_required"
    sd_required: true
    required_artifacts: ["system_prompt", "environment_config"]
    sd_suffix: "ENVCONFIG"
    sd_template: "Configure development environment and AI agents for {venture_name}"
    advisory_enabled: false

  - stage_number: 18
    stage_name: "MVP Development Loop"
    phase_number: 5
    phase_name: "THE BUILD LOOP"
    work_type: "sd_required"
    sd_required: true
    required_artifacts: []
    sd_suffix: "MVP"
    sd_template: "Implement MVP features for {venture_name}"
    advisory_enabled: false

  - stage_number: 19
    stage_name: "Monetization & API Layer"
    phase_number: 5
    phase_name: "THE BUILD LOOP"
    work_type: "sd_required"
    sd_required: true
    required_artifacts: []
    sd_suffix: "MONETIZE"
    sd_template: "Implement Stripe/Payment Gateway integration and revenue APIs for {venture_name}. Priority: Payment processing, subscription management, billing webhooks."
    advisory_enabled: false

  - stage_number: 20
    stage_name: "Security & Performance"
    phase_number: 5
    phase_name: "THE BUILD LOOP"
    work_type: "sd_required"
    sd_required: true
    required_artifacts: []
    sd_suffix: "SECURITY"
    sd_template: "Implement security hardening and performance optimization for {venture_name}"
    advisory_enabled: false

  - stage_number: 21
    stage_name: "QA & UAT"
    phase_number: 5
    phase_name: "THE BUILD LOOP"
    work_type: "sd_required"
    sd_required: true
    required_artifacts: []
    sd_suffix: "QA"
    sd_template: "Execute QA and UAT testing for {venture_name}"
    advisory_enabled: false

  - stage_number: 22
    stage_name: "Deployment & Infrastructure"
    phase_number: 5
    phase_name: "THE BUILD LOOP"
    work_type: "sd_required"
    sd_required: true
    required_artifacts: []
    sd_suffix: "DEPLOY"
    sd_template: "Deploy {venture_name} to production infrastructure"
    advisory_enabled: false

  # PHASE 6: LAUNCH & LEARN
  - stage_number: 23
    stage_name: "Production Launch"
    phase_number: 6
    phase_name: "LAUNCH & LEARN"
    work_type: "decision_gate"
    sd_required: false
    required_artifacts: ["launch_checklist"]
    advisory_enabled: false

  - stage_number: 24
    stage_name: "Analytics & Feedback"
    phase_number: 6
    phase_name: "LAUNCH & LEARN"
    work_type: "artifact_only"
    sd_required: false
    required_artifacts: ["analytics_dashboard"]
    advisory_enabled: false

  - stage_number: 25
    stage_name: "Autonomous Growth & Media Engine"
    phase_number: 6
    phase_name: "LAUNCH & LEARN"
    work_type: "sd_required"
    sd_required: true
    required_artifacts: ["media_pipeline_config"]
    sd_suffix: "GROWTH"
    sd_template: "Configure GenAI pipelines for automated image and video generation for {venture_name}. Includes: Midjourney prompt orchestration, Sora video scripts, Runway settings, and autonomous content scheduling."
    advisory_enabled: false
```

---

## 10. Decision Record

| ID | Decision | Rationale | Date |
|----|----------|-----------|------|
| ADR-002-001 | Use "Soft Gates" not "Hard Loops" | Solo founder context - system informs, doesn't block | 2025-12-06 |
| ADR-002-002 | Database is source of truth for artifacts | Enables versioning, querying, audit trail | 2025-12-06 |
| ADR-002-003 | Sync utilities for filesystem-dependent artifacts | Claude Code expects files; sync on deploy | 2025-12-06 |
| ADR-002-004 | Auto-generate SDs for `sd_required` stages | Reduces friction, ensures Leo Protocol integration | 2025-12-06 |
| ADR-002-005 | Three advisory gates: Stage 3, 5, 16 | Reality check, unit economics, firewall | 2025-12-06 |
| ADR-002-006 | Archetype-based benchmarks | Different ventures have different healthy metrics | 2025-12-06 |
| **ADR-002-007** | **Kill Switch with ventures.status** | **Board Feedback**: Chairman needs hard kill capability with auto-SD cancellation | 2025-12-06 |
| **ADR-002-008** | **Decision time-boxing via decision_due_at** | **Board Feedback**: Governance requires time-boxed decision gates | 2025-12-06 |
| **ADR-002-009** | **Distribution Layer in marketing_manifest** | **Board Feedback**: Must ship content, not just generate (LinkedIn, X, Resend, Vercel APIs) | 2025-12-06 |
| **ADR-002-010** | **Stage 10/11 Swap: Vibe before Name** | **Board Feedback**: Positioning & Manifest first, then Naming uses the Vibe | 2025-12-06 |
| **ADR-002-011** | **.active_venture context file** | **Board Feedback**: Sync prompts per-venture to avoid folder pollution | 2025-12-06 |
| **ADR-002-012** | **Strategic Narrative before Naming** | **Chairman Override**: "You cannot name the hero until you know their story" - Stage 10 requires strategic_narrative artifact BEFORE naming | 2025-12-06 |

---

## 11. Strategic Narrative Artifact Schema

The `strategic_narrative` artifact (Stage 10) defines the soul of the brand before any naming or visual identity work begins.

### 11.1 JSON Schema

```json
{
  "artifact_type": "strategic_narrative",
  "venture_id": "uuid",
  "lifecycle_stage": 10,
  "title": "{venture_name} Strategic Narrative",
  "content": {
    "origin_story": {
      "description": "The Founder's 'Why' - the personal motivation and vision",
      "prompt": "Why does this venture exist? What personal experience or insight drove its creation?",
      "example": "After watching my grandmother struggle with her solar panel maintenance, I realized the solar industry was failing the people it promised to help..."
    },
    "the_villain": {
      "description": "The specific pain/enemy the user fights against",
      "prompt": "What is the antagonist force? What status quo are we fighting?",
      "example": "Complexity. The solar industry has made clean energy feel like a PhD requirement. Jargon, confusing dashboards, and opaque pricing are the enemy."
    },
    "heros_journey": {
      "description": "The transformation from struggle to victory",
      "stages": {
        "ordinary_world": "User's life before the venture (the struggle)",
        "call_to_adventure": "The moment they discover the solution",
        "transformation": "How the product changes their reality",
        "return_with_elixir": "The new normal - life after victory"
      },
      "example": {
        "ordinary_world": "Homeowner confused by their solar setup, losing money, feeling deceived",
        "call_to_adventure": "Discovers SolaraAI through a frustrated neighbor's recommendation",
        "transformation": "AI explains their system in plain English, optimizes settings automatically",
        "return_with_elixir": "Now saves 40% more, actually understands their investment, recommends to others"
      }
    },
    "brand_archetype": {
      "description": "One of 12 Jungian archetypes that defines the brand's personality",
      "options": [
        "The Innocent (optimism, happiness, simplicity)",
        "The Sage (wisdom, knowledge, truth)",
        "The Explorer (freedom, discovery, adventure)",
        "The Outlaw/Rebel (liberation, disruption, revolution)",
        "The Magician (transformation, vision, imagination)",
        "The Hero (courage, mastery, achievement)",
        "The Lover (passion, connection, intimacy)",
        "The Jester (joy, humor, living in the moment)",
        "The Everyman (belonging, authenticity, realism)",
        "The Caregiver (service, nurturing, compassion)",
        "The Ruler (control, leadership, responsibility)",
        "The Creator (innovation, self-expression, vision)"
      ],
      "example": "The Sage - We bring clarity and truth to a confusing industry"
    }
  },
  "metadata": {
    "created_at": "timestamp",
    "created_by": "chairman",
    "version": 1,
    "validation_status": "complete"
  }
}
```

### 11.2 Sequencing Requirement

```
Stage 9 (Exit Strategy) COMPLETE
         │
         ▼
Stage 10: Strategic Narrative & Positioning
         │
         ├── STEP 1: Create strategic_narrative artifact
         │   (origin_story → the_villain → heros_journey → brand_archetype)
         │
         ├── STEP 2: Create marketing_manifest artifact
         │   (Uses narrative to define voice, visuals, multimedia specs)
         │
         ▼
Stage 11: Strategic Naming
         │
         └── USES: strategic_narrative.brand_archetype + marketing_manifest.voice
             to generate name candidates that embody the story
```

### 11.3 Why This Matters

| Without Narrative First | With Narrative First |
|------------------------|---------------------|
| Generic names that sound "techy" | Names that carry meaning |
| Brand feels hollow, interchangeable | Brand feels authentic, memorable |
| Marketing is surface-level | Marketing tells a compelling story |
| Users don't emotionally connect | Users become advocates |

> **The name is the last 1% of the brand. The story is the first 99%.**

---

---

## 12. Vision Transition Plan: 40-Stage → 25-Stage Migration

### 12.1 Migration Scope Assessment

The EHG codebase contains extensive documentation from the legacy 40-stage workflow that must be archived to avoid confusion with the new 25-stage Venture Vision v2.0.

#### 12.1.1 Legacy Assets Inventory

| Asset Category | Location | Count | Action |
|----------------|----------|-------|--------|
| **Stage Dossiers** | `docs/workflow/dossiers/stage-{01-36}/` | 36 directories (~396 files) | Archive |
| **Delta Logs** | `docs/workflow/dossiers/DELTA_LOG*.md` | 10 files | Archive |
| **Legacy stages.yaml** | `docs/workflow/stages.yaml` | 1 file (1839 lines) | Archive + Replace |
| **Review Reports** | `docs/workflow/dossiers/*.md` | 5 files | Archive |
| **Scripts with Stage Refs** | `scripts/` | ~20+ files | Update references |

**Total Files to Archive**: ~412 markdown files + configuration

#### 12.1.2 Scripts Requiring Updates

Scripts that reference old 40-stage numbers or stage names:

```
scripts/
├── generate-stage-dossier.js      # Generates old stage format
├── validate-stages.js             # Validates old stages.yaml
├── sync-stage-config.js           # Syncs old stage config
└── (others with stage references)
```

### 12.2 Archive Strategy

#### 12.2.1 Archive Location

```
docs/
├── archive/
│   └── v1-40-stage-workflow/           # NEW: Archive root
│       ├── README.md                    # Archive manifest
│       ├── workflow/
│       │   ├── dossiers/               # All 36 stage directories
│       │   │   ├── stage-01/
│       │   │   ├── stage-02/
│       │   │   └── ...
│       │   ├── stages.yaml             # Legacy stage definitions
│       │   └── DELTA_LOG*.md           # All delta logs
│       └── reference/
│           └── stage-mapping-v1-to-v2.md  # How old stages map to new
│
├── workflow/                            # POST-MIGRATION: Clean v2.0
│   └── stages_v2.yaml                   # New 25-stage definitions
│
└── architecture/
    └── ADR-002-*.md                     # This document (v2.0 blueprint)
```

#### 12.2.2 Archive Manifest (README.md)

```markdown
# EHG 40-Stage Workflow Archive

**Archive Date**: 2025-12-XX
**Archived By**: SD-VISION-TRANSITION-001
**Reason**: Migration to 25-stage Venture Vision v2.0

## What's Here
- 40-stage workflow dossiers (stages 1-36 implemented)
- Original stages.yaml (1839 lines)
- Phase delta logs (DELTA_LOG through DELTA_LOG_PHASE13)
- Midpoint review and final summary reports

## Why Archived (Not Deleted)
1. Historical reference for understanding evolution
2. Contains technical details that may be valuable (CPM algorithm, gap detection)
3. Audit trail for Chairman decisions

## Do NOT Use These Files For
- Active development guidance
- Stage progression logic
- New venture workflows

## Use Instead
- /docs/architecture/ADR-002-VENTURE-FACTORY-ARCHITECTURE.md
- /docs/workflow/stages_v2.yaml
```

### 12.3 Stage Mapping: 40-Stage → 25-Stage

| Old Stage(s) | New Stage | Notes |
|--------------|-----------|-------|
| 1 (Ideation Capture) | 1 (Draft Idea) | Direct map |
| 2 (Pattern Analysis) | 2 (AI Multi-Model Critique) | Enhanced with multi-model |
| 3-4 (Validation) | 3 (Market Validation & RAT) | Consolidated |
| 5 (Market Analysis) | 4 (Competitive Intelligence) | Renamed |
| 6-8 (Financial) | 5-6 (Profitability + Risk) | Consolidated |
| 9-10 (Competitive/Gap) | Folded into Stage 4 | Gap detection preserved as rules |
| 11-12 (Naming/Adaptive) | 11 (Strategic Naming) | Adaptive naming deprecated |
| 13-14 (Brand) | 10 (Strategic Narrative) | **NEW: Story before name** |
| 15 (Pricing) | 7 (Pricing Strategy) | Moved earlier |
| 16-17 (Business Model) | 8-9 (BMC + Exit Design) | Direct map |
| 18-20 (Docs/Environment) | 17 (Environment Config) | Consolidated |
| 21-24 (Planning) | 13-16 (Blueprint Phase) | The "Kochel Firewall" |
| 25-29 (Build) | 17-20 (Build Loop) | Streamlined |
| 30 (Security) | 20 (Security & Performance) | Combined |
| 31-34 (Launch) | 21-23 (Launch Phase) | Consolidated |
| 35-40 (Growth/Exit) | 24-25 (Learn & Scale) | Consolidated |

### 12.4 Technical Details Preservation

Critical technical logic from old stages that MUST be preserved in v2.0:

#### 12.4.1 Preserve in Code/Database

| Old Stage | Technical Detail | Preserve In |
|-----------|------------------|-------------|
| Stage 7 | CPM Algorithm (Critical Path Method) | `chairmanAdvisor.ts` |
| Stage 9 | Gap detection weight multipliers | `competitiveAnalysis.ts` |
| Stage 25 | Test coverage ≥80% requirement | Gate validation rules |
| Gate 2A | Validation weights (0.35 + 0.35 + 0.30) | `financialThresholds` table |

#### 12.4.2 Explicitly Deprecated

| Old Stage | Feature | Reason |
|-----------|---------|--------|
| Stage 12 | Adaptive Naming | Chairman decision: "No Adaptive Naming" |
| Stages 31-34 | Separate launch orchestration | Consolidated into simpler flow |

### 12.5 Migration Execution Plan

#### Phase 1: Archive Creation (Non-Breaking)

```bash
# Step 1.1: Create archive directory structure
mkdir -p docs/archive/v1-40-stage-workflow/workflow
mkdir -p docs/archive/v1-40-stage-workflow/reference

# Step 1.2: Move dossiers (COPY first, then delete after verification)
cp -r docs/workflow/dossiers/* docs/archive/v1-40-stage-workflow/workflow/

# Step 1.3: Archive stages.yaml
cp docs/workflow/stages.yaml docs/archive/v1-40-stage-workflow/workflow/

# Step 1.4: Create archive manifest
# (Script generates README.md with metadata)
```

#### Phase 2: New Configuration (v2.0)

```bash
# Step 2.1: Generate new stages_v2.yaml from ADR-002 Section 3
# (Script extracts YAML from ADR and creates clean file)

# Step 2.2: Run database migration
# (Creates lifecycle_stage_config with 25 stages)

# Step 2.3: Update scripts to use new stage references
```

#### Phase 3: Cleanup (Destructive)

```bash
# Step 3.1: Remove old dossiers from active location
rm -rf docs/workflow/dossiers/stage-*
rm docs/workflow/dossiers/DELTA_LOG*.md
rm docs/workflow/dossiers/*.md

# Step 3.2: Remove old stages.yaml
rm docs/workflow/stages.yaml

# Step 3.3: Verify archive integrity
find docs/archive/v1-40-stage-workflow -type f | wc -l
# Expected: ~420 files
```

### 12.6 Code Integration Points (CRITICAL)

The following code files contain hardcoded "40-stage" references that **MUST** be updated:

#### 12.6.1 Database Constraints (BREAKING)

| File | Line | Current | Required Change |
|------|------|---------|-----------------|
| `database/migrations/20251128_compliance_orchestrator_tables.sql` | 12 | `total_stages INTEGER NOT NULL DEFAULT 40` | Change to `DEFAULT 25` |
| `database/migrations/20251128_compliance_orchestrator_tables.sql` | 31 | `CHECK (stage_number BETWEEN 1 AND 40)` | Change to `BETWEEN 1 AND 25` |
| `database/migrations/20251128_compliance_engine_policy_registry.sql` | 56 | `CHECK (stage_number BETWEEN 1 AND 40)` | Change to `BETWEEN 1 AND 25` |

#### 12.6.2 API Validation Schemas (BREAKING)

| File | Line | Schema | Required Change |
|------|------|--------|-----------------|
| `lib/validation/leo-schemas.ts` | 282 | `ComplianceChecksQuery` | `.max(40)` → `.max(25)` |
| `lib/validation/leo-schemas.ts` | 292 | `ComplianceViolationsQuery` | `.max(40)` → `.max(25)` |
| `lib/validation/leo-schemas.ts` | 322 | `ComplianceRunBody` | `.max(40)` → `.max(25)` |

#### 12.6.3 Scripts with Hardcoded Stage Loops (BREAKING)

| File | Line | Current | Required Change |
|------|------|---------|-----------------|
| `scripts/compliance-check.js` | 36 | `Array.from({ length: 40 }, ...)` | Change to `{ length: 25 }` |
| `scripts/generate-stage-7-40-sds.mjs` | Multiple | 34 SDs for stages 7-40 | Archive entire script |

#### 12.6.4 Integration Break Risk Matrix

| Risk Level | Description | Impact |
|------------|-------------|--------|
| **CRITICAL** | Ventures trying to progress past stage 25 | Database constraint violation |
| **HIGH** | Compliance checks expecting stages 26-40 | False failure reports |
| **MEDIUM** | API calls with stage > 25 | Request rejection |
| **LOW** | Dashboard displays | Empty data for stages 26-40 |

#### 12.6.5 Migration Script Requirements

```sql
-- Part of factory_architecture.sql migration

-- 1. Update compliance_orchestrator_tables constraints
ALTER TABLE compliance_violations
  DROP CONSTRAINT IF EXISTS compliance_violations_stage_number_check;
ALTER TABLE compliance_violations
  ADD CONSTRAINT compliance_violations_stage_number_check
  CHECK (stage_number BETWEEN 1 AND 25);

-- 2. Update compliance_policy_registry constraints
ALTER TABLE compliance_events
  DROP CONSTRAINT IF EXISTS compliance_events_stage_number_check;
ALTER TABLE compliance_events
  ADD CONSTRAINT compliance_events_stage_number_check
  CHECK (stage_number BETWEEN 1 AND 25);

-- 3. Archive any existing data for stages 26-40
UPDATE compliance_violations
  SET metadata = jsonb_set(
    COALESCE(metadata, '{}'),
    '{archived_reason}',
    '"Stage 26-40 data archived during v2.0 migration"'
  )
  WHERE stage_number > 25;
```

---

### 12.7 Strategic Directive Definition

```yaml
# SD-VISION-TRANSITION-001
id: SD-VISION-TRANSITION-001
title: "Venture Vision v2.0 Migration"
category: infrastructure
priority: critical
status: draft

description: |
  Migrate EHG from legacy 40-stage workflow to streamlined 25-stage
  Venture Vision v2.0. This includes archiving legacy documentation,
  creating new stage configuration, updating all code references,
  and modifying database constraints.

objectives:
  - Archive 412+ legacy documentation files safely
  - Generate stages_v2.yaml from approved ADR-002
  - Run database migration for lifecycle_stage_config
  - Update database CHECK constraints (40 → 25)
  - Update API validation schemas (3 files)
  - Update scripts with new stage references
  - Verify no broken references to old stages

acceptance_criteria:
  - All legacy files archived to docs/archive/v1-40-stage-workflow/
  - Archive manifest created with metadata
  - stages_v2.yaml created and validated
  - Database migration successful (25 stages configured)
  - All CHECK constraints updated to max 25
  - leo-schemas.ts updated (.max(25) in 3 places)
  - compliance-check.js updated (length: 25)
  - No scripts reference old stage numbers (1-40 format)
  - Zero broken links in documentation

dependencies:
  - ADR-002-VENTURE-FACTORY-ARCHITECTURE.md (APPROVED)

estimated_effort: medium
risk_level: medium

risks:
  - risk: "Scripts break during transition"
    mitigation: "Copy-first archive strategy, test in isolation"
  - risk: "Historical context lost"
    mitigation: "Comprehensive archive with mapping document"
  - risk: "Active work disrupted"
    mitigation: "Execute during low-activity period"

metadata:
  created_at: "2025-12-06"
  created_by: "Lead Systems Architect"
  venture_context: "EHG_Engineer (Factory itself)"
```

### 12.7 Post-Migration Verification Checklist

```markdown
## Vision Transition Verification

### Archive Integrity
- [ ] Archive directory exists: docs/archive/v1-40-stage-workflow/
- [ ] Archive manifest (README.md) present
- [ ] Dossier file count matches expected (~396 files)
- [ ] stages.yaml preserved in archive
- [ ] Delta logs preserved (10 files)

### New Configuration
- [ ] stages_v2.yaml exists in docs/workflow/
- [ ] stages_v2.yaml validates (25 stages defined)
- [ ] Database migration applied (lifecycle_stage_config)
- [ ] All 25 stages have required fields populated

### Reference Cleanup
- [ ] No files in docs/workflow/dossiers/ referencing old stages
- [ ] Scripts updated to reference stages_v2.yaml
- [ ] CLAUDE.md updated to reflect v2.0 workflow
- [ ] No broken internal links

### Functional Verification
- [ ] `npm run sd:next` works with new stage config
- [ ] Venture stage progression logic functional
- [ ] Chairman Advisory evaluates correct stages (3, 5, 16)
```

### 12.8 Existing Strategic Directives Evaluation

The database contains **191 pending SDs** that require evaluation as part of the vision transition.

#### 12.8.1 SD Inventory by Category

| Category | Count | IDs | Disposition |
|----------|-------|-----|-------------|
| **40-Stage Workflow SDs** | 38 | SD-STAGE-13-001 through SD-STAGE-40-001 | **ARCHIVE** |
| **Test/Development SDs** | 139 | SD-TEST-LEO-GATES-*, SD-TEST-GATE0-* | **DELETE** |
| **Deferred Critical SDs** | 3 | SD-CREWAI-ARCHITECTURE-001, SD-VIF-TIER-001, SD-VIF-PARENT-001 | **REVIEW** |
| **Other Pending SDs** | 11 | Various | **EVALUATE** |

#### 12.8.2 40-Stage Workflow SDs (ARCHIVE)

These 38 SDs were created for the legacy 40-stage workflow and are now obsolete:

```
SD-STAGE-13-001 through SD-STAGE-40-001
- Status: Draft/Active
- Priority: Critical
- Category: stage-integration / infrastructure
- Created: Nov 29, 2025
```

**Action**: Archive with metadata explaining vision transition:

```sql
UPDATE strategic_directives_v2
SET status = 'archived',
    metadata = jsonb_set(
      COALESCE(metadata, '{}'),
      '{archived_reason}',
      '"Vision transition from 40-stage to 25-stage Venture Vision v2.0 (ADR-002)"'
    ),
    metadata = jsonb_set(
      metadata,
      '{archived_date}',
      '"2025-12-06"'
    )
WHERE id LIKE 'SD-STAGE-%';
```

#### 12.8.3 Test SDs (DELETE)

These 139 SDs were created during LEO gate validation testing and were never cleaned up:

```
SD-TEST-LEO-GATES-001-* (multiple variants)
SD-TEST-GATE0-* (multiple variants)
- Status: Active
- Priority: High
- Category: testing
- Created: Dec 4, 2025
```

**Action**: Delete test data to clean database:

```sql
DELETE FROM strategic_directives_v2
WHERE category = 'testing'
  AND (id LIKE 'SD-TEST-LEO-GATES-%' OR id LIKE 'SD-TEST-GATE0-%')
  AND created_at >= '2025-12-04';
```

#### 12.8.4 Deferred Critical SDs (REVIEW)

These SDs may still be relevant but need evaluation against the new vision:

| SD ID | Title | Current Status | Recommendation |
|-------|-------|----------------|----------------|
| SD-CREWAI-ARCHITECTURE-001 | CrewAI infrastructure consolidation | Deferred | **KEEP** - Still relevant to Shared Services |
| SD-VIF-TIER-001 | Tiered ideation engine | Deferred | **ARCHIVE** - Replaced by Stage 1-3 in v2.0 |
| SD-VIF-PARENT-001 | Venture Ideation Framework | Deferred | **ARCHIVE** - Replaced by Stage 1-3 in v2.0 |

#### 12.8.5 SD Cleanup Script

Include in SD-VISION-TRANSITION-001 execution:

```javascript
// scripts/cleanup-legacy-sds.js

const { createClient } = require('@supabase/supabase-js');

async function cleanupLegacySDs() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

  // 1. Archive 40-stage workflow SDs
  const { data: archived, error: archiveError } = await supabase
    .from('strategic_directives_v2')
    .update({
      status: 'archived',
      metadata: {
        archived_reason: 'Vision transition to 25-stage Venture Vision v2.0',
        archived_date: new Date().toISOString(),
        archived_by: 'SD-VISION-TRANSITION-001'
      }
    })
    .like('id', 'SD-STAGE-%');

  console.log(`Archived ${archived?.length || 0} stage-workflow SDs`);

  // 2. Delete test SDs
  const { data: deleted, error: deleteError } = await supabase
    .from('strategic_directives_v2')
    .delete()
    .eq('category', 'testing')
    .or('id.like.SD-TEST-LEO-GATES-%,id.like.SD-TEST-GATE0-%');

  console.log(`Deleted ${deleted?.length || 0} test SDs`);

  // 3. Report remaining pending SDs for manual review
  const { data: remaining } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, status, priority')
    .not('status', 'in', '("completed","archived","cancelled")');

  console.log(`Remaining SDs for review: ${remaining?.length || 0}`);
  return remaining;
}

cleanupLegacySDs();
```

#### 12.8.6 Post-Cleanup Verification

```markdown
## SD Cleanup Verification

- [ ] 40-stage SDs archived (38 records)
- [ ] Test SDs deleted (139 records)
- [ ] Deferred SDs evaluated and updated
- [ ] No pending SDs reference old stage numbers
- [ ] SD-VISION-TRANSITION-001 is the only critical SD for migration
```

---

## 13. Decision Records

| ID | Decision | Rationale | Date |
|----|----------|-----------|------|
| **ADR-002-001** | **Unified Platform Architecture** | Ventures share 95% lifecycle logic; only Stage 17+ produces venture-specific code | 2025-12-06 |
| **ADR-002-002** | **Database-Driven Ventures** | Single codebase with venture_id filtering vs. separate repos | 2025-12-06 |
| **ADR-002-003** | **25-Stage Lifecycle** | Streamlined from 40 stages for solo entrepreneur efficiency | 2025-12-06 |
| **ADR-002-004** | **Chairman Advisory over Hard Loops** | Soft gates with override capability instead of automated GOTO | 2025-12-06 |
| **ADR-002-005** | **Platform-as-a-Factory Model** | Shared services (AI Gateway, Auth, CrewAI) consumed by ventures | 2025-12-06 |
| **ADR-002-006** | **Hybrid Database Isolation** | Shared factory schema + per-venture schemas for customer data | 2025-12-06 |
| **ADR-002-007** | **Kill Switch Governance** | ventures.status enum with decision_due_at dates and Kill Protocol | 2025-12-06 |
| **ADR-002-008** | **Distribution Layer in GTM** | distribution_config artifact in marketing_manifest for growth | 2025-12-06 |
| **ADR-002-009** | **Stage 10/11 Swap** | Story (Narrative) before Name, not after | 2025-12-06 |
| **ADR-002-010** | **Context Switch File** | .active_venture file for multi-venture session management | 2025-12-06 |
| **ADR-002-011** | **Leo Dashboard Integration** | Unified Chairman Console vision for portfolio-wide visibility | 2025-12-06 |
| **ADR-002-012** | **Strategic Narrative before Naming** | Chairman Override: "You cannot name the hero until you know their story" | 2025-12-06 |
| **ADR-002-013** | **40→25 Stage Migration** | Archive legacy workflow, preserve technical details, clean v2.0 | 2025-12-06 |
| **ADR-002-014** | **Legacy SD Cleanup** | Archive 38 stage-workflow SDs, delete 139 test SDs, review 3 deferred SDs | 2025-12-06 |
| **ADR-002-015** | **Code Integration Points** | 6 files with hardcoded "40" must be updated: 3 DB constraints, 3 API schemas, 2 scripts | 2025-12-06 |

---

**Document Status**: APPROVED WITH BOARD UPGRADES + CHAIRMAN OVERRIDE + VISION TRANSITION PLAN + SD EVALUATION + CODE INTEGRATION ANALYSIS

**Board Approval Date**: 2025-12-06
**Approved By**: Chairman (with Anthropic Board Feedback)

**Next Steps**:
1. **Create SD-VISION-TRANSITION-001** in database (critical priority, infrastructure category)
2. Execute SD cleanup (archive 38 stage SDs, delete 139 test SDs)
3. Archive legacy workflow files to `docs/archive/v1-40-stage-workflow/`
4. Generate stages_v2.yaml from ADR-002 Section 3
5. Generate and run SQL migration (factory_architecture.sql)
6. Update CLAUDE.md to reflect v2.0 workflow

---

*Generated by Lead Systems Architect | EHG Venture Factory | 2025-12-06*

---

## ADDENDUM A: Kochel Integration Cross-Validation (2025-12-09)

### A.1 Purpose

This addendum documents the architectural review of the **Kochel Integration** plan, which embeds Sean Kochel's "Vibe Planning Pyramid" methodology into the Venture Factory's 25-stage lifecycle. Two independent AI assessments were conducted to validate the integration approach.

### A.2 Cross-Validation Summary

| Assessor | Model | Score | Verdict |
|----------|-------|-------|---------|
| **Anti-Gravity** | Gemini (via Gemini IDE) | 4.4/5 | Ready for Migration Phase A |
| **Claude** | Claude Opus 4.5 (via Claude Code) | 3.9/5 | Ready with minor gaps |

**Adopted Verdict**: Ready with minor gaps (conservative)

### A.3 Assessment Dimension Scores

| Dimension | Anti-Gravity | Claude | Δ |
|-----------|-------------|--------|---|
| 1. Database-First Governance & Migrations | 5/5 | 4/5 | -1 |
| 2. LEO Protocol & Workflow Alignment | 5/5 | 4/5 | -1 |
| 3. Artifact Vocabulary & required_artifacts[] | 4/5 | 4/5 | 0 |
| 4. CrewAI / Sub-Agent Contracts | 3/5 | 3/5 | 0 |
| 5. EHG vs EHG_Engineer Boundary Integrity | 5/5 | 5/5 | 0 |
| 6. Migration Phase A Readiness | 5/5 | 4/5 | -1 |
| 7. Risk Profile & Missing Dependencies | 4/5 | 3/5 | -1 |

### A.4 Key Findings

**Strengths Confirmed by Both Assessors**:
- Perfect EHG vs EHG_Engineer boundary separation (5/5)
- Comprehensive 44-artifact vocabulary with stage mappings
- Sound SD hierarchy design (001 parent → A-E children → D1-D6 grandchildren)
- Idempotent migration files with ON CONFLICT DO UPDATE

**Operational Gaps Identified by Claude**:
1. **Missing rollback scripts** - No explicit `_down.sql` files for reversal
2. **ADR-002 status ambiguity** - Header says PROPOSED, body says APPROVED
3. **85% quality gate** - Conceptual, not enforced at database level
4. **Risk owners unassigned** - Risk table lacks mitigation ownership

### A.5 Preconditions for Migration Phase A

The following must be satisfied before executing Migration Phase A:

| # | Precondition | Status | Owner |
|---|--------------|--------|-------|
| 1 | Rollback scripts created for `20251206_lifecycle_stage_config.sql` | **DONE** | Lead Architect |
| 2 | Rollback scripts created for `20251206_vision_transition_parent_orchestrator.sql` | **DONE** | Lead Architect |
| 3 | `quality_score` column added to `venture_artifacts` table | **DONE** | Lead Architect |
| 4 | CrewAI contracts inserted into `leo_interfaces` table | **DONE** | Lead Architect |
| 5 | ADR-002 status formally approved by Chairman | **DONE** (2025-12-09) | Chairman |

### A.6 Related Documents

- **Full Kochel Integration Plan**: `docs/plans/kochel-integration-plan.md`
- **Assessment Rubric**: `docs/plans/kochel-assessment-rubric.md`
- **Migration Files**:
  - `database/migrations/20251206_lifecycle_stage_config.sql`
  - `database/migrations/20251206_vision_transition_parent_orchestrator.sql`

---

## ╔════════════════════════════════════════════════════════════════════╗
## ║                    CHAIRMAN DECISION BLOCK                         ║
## ╠════════════════════════════════════════════════════════════════════╣
## ║                                                                    ║
## ║  ██████╗  APPROVED  ██████╗                                        ║
## ║                                                                    ║
## ║  ┌──────────────────────────────────────────────────────────────┐  ║
## ║  │  STATUS CHANGE EXECUTED:                                     │  ║
## ║  │                                                              │  ║
## ║  │  ADR-002 Status: PROPOSED → APPROVED                         │  ║
## ║  │                                                              │  ║
## ║  │  Rationale:                                                  │  ║
## ║  │  - Kochel Integration has passed dual-AI architectural       │  ║
## ║  │    review (Anti-Gravity: 4.4/5, Claude: 3.9/5)              │  ║
## ║  │  - Adopted conservative verdict: "Ready with minor gaps"     │  ║
## ║  │  - All technical preconditions for Migration Phase A         │  ║
## ║  │    have been satisfied (rollback scripts, quality_score,     │  ║
## ║  │    CrewAI contracts created)                                 │  ║
## ║  │                                                              │  ║
## ║  │  Chairman Signature: Chairman, EHG                           │  ║
## ║  │  Date: 2025-12-09                                            │  ║
## ║  │                                                              │  ║
## ║  │  NOTE: This is governance approval only.                     │  ║
## ║  │  Migration execution requires separate authorization.        │  ║
## ║  │                                                              │  ║
## ║  └──────────────────────────────────────────────────────────────┘  ║
## ║                                                                    ║
## ╚════════════════════════════════════════════════════════════════════╝

---

*Addendum A added: 2025-12-09*
*Cross-Validation conducted by: Anti-Gravity (Gemini) & Claude (Anthropic)*

---

## ADDENDUM B: Golden Nuggets Integration (2025-12-09)

### B.1 Purpose

This addendum incorporates the **Phase 1 Golden Nuggets** from the Venture Engine evaluation into the ADR-002 architectural framework. These concepts transform the 25-stage venture workflow from a deterministic pipeline into an adaptive, self-calibrating system.

**Source Document**: `docs/vision/VENTURE_ENGINE_GOLDEN_NUGGETS_PLAN.md`

### B.2 Phase 1 Golden Nuggets (Foundation)

The following four concepts are approved for immediate integration:

| Nugget | Score | Priority | Implementation Location |
|--------|-------|----------|------------------------|
| **Assumptions vs Reality** | 4.85 | 1 | Runtime + Governance |
| **Tokens as Investment** | 4.35 | 2 | Governance + Runtime UI |
| **Four Buckets** | 3.85 | 3 | Both (schema + enforcement) |
| **Integration Points** | 4.40 | 4 | Documentation |

### B.3 Assumptions vs Reality (Score: 4.85)

#### B.3.1 Concept

Every venture starts with an **Assumption Set V1**. As real-world data arrives, we compute **assumption error** and evolve to V2+, building a self-calibrating system.

#### B.3.2 Schema Addition

```sql
-- Location: Supabase shared schema
CREATE TABLE assumption_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
  parent_version_id UUID REFERENCES assumption_sets(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(50)         -- 'stage_3_validation', 'post_launch_calibration', etc.
);
```

#### B.3.3 25-Stage Integration

| Stage | Enhancement |
|-------|-------------|
| **2-3** (Critique/Validation) | Create Assumption Set V1 with initial market beliefs |
| **5** (Profitability) | Update assumptions with financial model inputs |
| **23** (Launch) | Reality data collection begins |
| **24-25** (Analytics/Optimize) | Generate Assumptions vs Reality Report |

### B.4 Tokens as Investment (Score: 4.35)

#### B.4.1 Concept

Tokens/compute are treated as **capital cost per venture** - not just an operational expense, but an explicit investment decision with expected returns.

#### B.4.2 Token Budget Profiles

| Profile | Total Tokens | Use Case |
|---------|-------------|----------|
| **Exploratory** | 50K-100K | Quick validation, kill fast |
| **Standard** | 250K-500K | Normal venture progression |
| **Deep Due Diligence** | 1M-2M | High-stakes, complex markets |
| **Custom** | User-defined | Chairman override |

#### B.4.3 Phase Allocation (Standard Profile)

```
Profile: Standard (500K tokens)
├── THE TRUTH (Stages 1-5):      25% (125K)
├── THE ENGINE (Stages 6-9):     15% (75K)
├── THE IDENTITY (Stages 10-12): 10% (50K)
├── THE BLUEPRINT (Stages 13-16): 20% (100K)
├── THE BUILD LOOP (Stages 17-20): 20% (100K)
└── LAUNCH & LEARN (Stages 21-25): 10% (50K)
```

#### B.4.4 Schema Addition

```sql
-- Location: Supabase shared schema
CREATE TABLE venture_token_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

### B.5 Four Buckets - Hallucination Control (Score: 3.85)

#### B.5.1 Concept

All outputs in the 25-stage venture workflow are classified into **four explicit buckets**: Facts, Assumptions, Simulations, Unknowns. This structural separation reduces hallucination by making the epistemic status of every claim explicit.

#### B.5.2 The Four Buckets

| Bucket | Definition | Traceability Requirement |
|--------|------------|-------------------------|
| **Facts** | Statements with traceable sources | Must link to DB record, prior stage artifact, or explicit evidence URL |
| **Assumptions** | Beliefs about market, users, behavior, impact | Must reference assumption_set_id and specific key |
| **Simulations** | Outputs from Venture/Feature sims | Must reference simulation_run_id and assumption_set_id used |
| **Unknowns** | Gaps deliberately not filled | Must state what would be needed to resolve |

#### B.5.3 Schema Addition

```sql
-- Location: venture_artifacts table
ALTER TABLE venture_artifacts ADD COLUMN epistemic_classification JSONB;

-- Example structure:
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

#### B.5.4 Stage Gate Requirements

- All Facts must have traceable sources
- All Assumptions must reference the current assumption_set_id
- At least one Unknown must be declared (forces honest gap acknowledgment)

### B.6 Chairman Fast-Follow: Crew Tournament Pilot

#### B.6.1 Status

**APPROVED** as strategic experiment (Chairman Priority Note, 2025-12-09)

#### B.6.2 Pilot Scope

| Constraint | Value | Rationale |
|------------|-------|-----------|
| **Stage** | 11 (Brand & Messaging) | Creative work benefits from diversity; easy to score |
| **num_workers** | 3 | Minimum for meaningful competition |
| **manager_count** | 1 | Single manager to score and select |
| **peer_review** | OFF | Keep pilot simple |
| **token_ceiling** | 50,000 | Hard cap per tournament run |

#### B.6.3 Success Criteria

| Metric | Target |
|--------|--------|
| Quality Improvement | Manager-selected artifact scores ≥15% higher than single-agent baseline |
| Token Efficiency | Total tournament cost ≤3x single-agent cost |
| Chairman Satisfaction | Qualitative approval after 3-5 runs |

### B.7 Phase 2 Golden Nuggets (Deferred)

The following concepts are approved in principle but deferred until Phase 1 is complete:

| Nugget | Score | Dependency |
|--------|-------|------------|
| **Simulation Mode** | 3.98 | Requires Assumptions, Tokens, Four Buckets |
| **Feature Hypotheses** | 3.85 | Extends Assumptions vs Reality |
| **Crew Tournaments (Full)** | 3.83 | Pilot results |

### B.8 Decision Records Update

| ID | Decision | Rationale | Date |
|----|----------|-----------|------|
| **ADR-002-016** | **Phase 1 Golden Nuggets** | Assumptions vs Reality, Tokens as Investment, Four Buckets, Integration Points approved | 2025-12-09 |
| **ADR-002-017** | **Token Budget Profiles** | Exploratory/Standard/Deep/Custom profiles for venture capital allocation | 2025-12-09 |
| **ADR-002-018** | **Four Buckets Epistemic Classification** | Facts/Assumptions/Simulations/Unknowns required in venture_artifacts | 2025-12-09 |
| **ADR-002-019** | **Crew Tournament Pilot** | Stage 11 pilot approved; 3 workers, 1 manager, 50K token ceiling | 2025-12-09 |

---

*Addendum B added: 2025-12-09*
*Source: docs/vision/VENTURE_ENGINE_GOLDEN_NUGGETS_PLAN.md*
*Evaluated by: Anti-Gravity (Gemini) & Claude (Anthropic) - Dual-AI Cross-Validation*
