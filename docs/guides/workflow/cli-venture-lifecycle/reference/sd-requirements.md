---
category: guide
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-03-01
tags: [guide, auto-generated]
---

## Table of Contents

- [Overview](#overview)
- [SD Requirements Table](#sd-requirements-table)
- [Detailed Stage SD Documentation](#detailed-stage-sd-documentation)
  - [Stage 10: Strategic Naming](#stage-10-strategic-naming)
  - [Stage 14: Data Model & Architecture](#stage-14-data-model-architecture)
  - [Stage 15: Epic & User Story Breakdown](#stage-15-epic-user-story-breakdown)
  - [Stage 16: Spec-Driven Schema Generation](#stage-16-spec-driven-schema-generation)
  - [Stage 17: Environment & Agent Config](#stage-17-environment-agent-config)
  - [Stage 18: MVP Development Loop (LIFECYCLE-TO-SD BRIDGE)](#stage-18-mvp-development-loop-lifecycle-to-sd-bridge)
  - [Stage 19: Integration & API Layer](#stage-19-integration-api-layer)
  - [Stage 20: Security & Performance](#stage-20-security-performance)
  - [Stage 21: QA & UAT](#stage-21-qa-uat)
  - [Stage 22: Deployment & Infrastructure](#stage-22-deployment-infrastructure)
  - [Stage 25: Optimization & Scale](#stage-25-optimization-scale)
- [SD Creation Methods](#sd-creation-methods)
- [SD Namespace Convention](#sd-namespace-convention)
- [Database Configuration](#database-configuration)
  - [lifecycle_stage_config Table](#lifecycle_stage_config-table)
  - [SD-to-Venture Relationship](#sd-to-venture-relationship)
- [Lifecycle-to-SD Bridge Architecture](#lifecycle-to-sd-bridge-architecture)
  - [Key Design Decisions](#key-design-decisions)

---
Category: Reference
Status: Approved
Version: 1.0.0
Author: DOCMON Sub-Agent
Last Updated: 2026-02-08
Tags: [cli-venture-lifecycle, eva, reference, sd-requirements]
Related SDs: [SD-LEO-ORCH-CLI-VENTURE-LIFECYCLE-001, SD-LEO-FEAT-LIFECYCLE-SD-BRIDGE-001]
---

# SD Requirements by Stage

Twelve of the 25 lifecycle stages require Strategic Directive (SD) creation. These are stages where the work is substantial enough to warrant tracking through the full LEO Protocol (LEAD -> PLAN -> EXEC).

The remaining 13 stages produce venture artifacts but do not create SDs -- their work is contained within the Eva Orchestrator's stage processing.

## Overview

```
THE TRUTH (1-5)         THE ENGINE (6-9)        THE IDENTITY (10-12)
  No SDs required         No SDs required         Stage 10: SD required
                                                  (Strategic Naming)

THE BLUEPRINT (13-16)   THE BUILD LOOP (17-22)   LAUNCH & LEARN (23-25)
  Stage 14: SD           Stage 18: SD (BRIDGE)    Stage 25: SD
  Stage 15: SD           Stage 19: SD
  Stage 16: SD           Stage 20: SD
                          Stage 21: SD
                          Stage 22: SD
```

## SD Requirements Table

| Stage | Name | SD Required | SD Suffix | Work Type | Rationale |
|-------|------|:-----------:|-----------|-----------|-----------|
| 1 | Draft Idea | No | -- | -- | Structured input, no code |
| 2 | AI Review | No | -- | -- | LLM analysis only |
| 3 | Validation (Kill Gate) | No | -- | -- | Evaluation, no implementation |
| 4 | Competitive Intel | No | -- | -- | Research, no implementation |
| 5 | Profitability (Kill Gate) | No | -- | -- | Financial modeling only |
| 6 | Risk Matrix | No | -- | -- | Analysis only |
| 7 | Pricing | No | -- | -- | Strategy, no implementation |
| 8 | Business Model Canvas | No | -- | -- | Strategy, no implementation |
| 9 | Exit Strategy | No | -- | -- | Planning, no implementation |
| **10** | **Strategic Naming** | **Yes** | `-NAMING` | `feature` | Brand identity requires SD-tracked decisions |
| 11 | Go-to-Market | No | -- | -- | Strategy, no implementation |
| 12 | Sales Logic | No | -- | -- | Strategy, no implementation |
| 13 | Tech Stack (Kill Gate) | No | -- | -- | Evaluation, no code |
| **14** | **Data Model & Architecture** | **Yes** | `-DATAMODEL` | `infrastructure` | Schema design is implementation work |
| **15** | **Epic & User Story Breakdown** | **Yes** | `-STORIES` | `feature` | Story creation feeds SD planning |
| **16** | **Schema Firewall (Promo Gate)** | **Yes** | `-SCHEMA` | `infrastructure` | Schema generation is code output |
| **17** | **Environment & Agent Config** | **Yes** | `-ENVSETUP` | `infrastructure` | Environment provisioning is infra work |
| **18** | **MVP Development Loop** | **Yes** | `-SPRINT` | `feature` | **LIFECYCLE-TO-SD BRIDGE** -- sprint items become children |
| **19** | **Integration & API Layer** | **Yes** | `-APILAYER` | `feature` | API development is implementation |
| **20** | **Security & Performance** | **Yes** | `-SECPERF` | `security` | Security work requires full tracking |
| **21** | **QA & UAT** | **Yes** | `-QAUAT` | `qa` | Test development is implementation |
| **22** | **Deployment & Infrastructure** | **Yes** | `-DEPLOY` | `infrastructure` | Deployment work is implementation |
| 23 | Launch (Kill Gate) | No | -- | -- | Go/No-Go decision, no implementation |
| 24 | Analytics | No | -- | -- | Metric configuration, not implementation |
| **25** | **Optimization & Scale** | **Yes** | `-SCALE` | `enhancement` | Scale work requires tracked iterations |

## Detailed Stage SD Documentation

### Stage 10: Strategic Naming

**Why SD is required**: Brand naming involves scored candidates, domain availability checks, trademark analysis, and brand genome generation. These decisions have lasting impact and should be tracked.

**SD suffix**: `-NAMING`
**SD type**: `feature`
**Parent orchestrator**: The venture's top-level orchestrator SD

**How the SD is created**: Manually by Eva when Stage 10 begins. Eva calls `leo-create-sd.js` with the venture namespace prefix and `-NAMING` suffix.

**Example SD key**: `SD-{VENTURE}-FEAT-NAMING-001`

**Database**: `lifecycle_stage_config` table has `sd_required = true` and `sd_suffix = '-NAMING'` for stage 10.

---

### Stage 14: Data Model & Architecture

**Why SD is required**: Data model design produces entity-relationship diagrams, field definitions, constraints, and RLS policies. This is foundational infrastructure work that shapes all subsequent development.

**SD suffix**: `-DATAMODEL`
**SD type**: `infrastructure`
**Parent orchestrator**: The venture's top-level orchestrator SD

**How the SD is created**: Manually by Eva when Stage 14 begins.

**Example SD key**: `SD-{VENTURE}-INFRA-DATAMODEL-001`

**Key outputs**: ERD, entity definitions, field types, constraints, relationships, RLS rules. All stored as artifacts in `venture_artifacts` AND tracked through the SD's EXEC phase.

---

### Stage 15: Epic & User Story Breakdown

**Why SD is required**: User stories are the bridge between business requirements (THE IDENTITY/BLUEPRINT) and implementation (THE BUILD LOOP). Story creation requires structured work with acceptance criteria, story points, and MoSCoW prioritization.

**SD suffix**: `-STORIES`
**SD type**: `feature`
**Parent orchestrator**: The venture's top-level orchestrator SD

**How the SD is created**: Manually by Eva when Stage 15 begins.

**Example SD key**: `SD-{VENTURE}-FEAT-STORIES-001`

**Key outputs**: Epics, user stories (As a/I want/So that format), acceptance criteria, story points, MoSCoW tags, INVEST compliance check.

---

### Stage 16: Spec-Driven Schema Generation

**Why SD is required**: Schema generation produces actual database schemas, API contracts, and migration files. This is concrete infrastructure output that must pass the Schema Firewall Promotion Gate.

**SD suffix**: `-SCHEMA`
**SD type**: `infrastructure`
**Parent orchestrator**: The venture's top-level orchestrator SD

**How the SD is created**: Manually by Eva when Stage 16 begins.

**Example SD key**: `SD-{VENTURE}-INFRA-SCHEMA-001`

**Key outputs**: Database schema DDL, API contracts, migration files, RLS policy definitions. The Promotion Gate 16 validates these outputs.

---

### Stage 17: Environment & Agent Config

**Why SD is required**: Environment setup involves provisioning infrastructure, configuring CI/CD, managing secrets, and setting up monitoring. This is real infrastructure work.

**SD suffix**: `-ENVSETUP`
**SD type**: `infrastructure`
**Parent orchestrator**: The venture's top-level orchestrator SD

**How the SD is created**: Manually by Eva when Stage 17 begins.

**Example SD key**: `SD-{VENTURE}-INFRA-ENVSETUP-001`

**Key outputs**: Dev/staging/prod environments, CI/CD pipeline config, secrets management, monitoring baseline. The Promotion Gate 17 validates these outputs.

---

### Stage 18: MVP Development Loop (LIFECYCLE-TO-SD BRIDGE)

**Why SD is required**: Stage 18 is the critical bridge between venture lifecycle planning and LEO Protocol execution. Sprint items become real, tracked SDs that go through LEAD -> PLAN -> EXEC.

**SD suffix**: `-SPRINT`
**SD type**: `feature`
**Parent orchestrator**: The venture's top-level orchestrator SD

**How the SD is created**: Via the **Lifecycle-to-SD Bridge** (`lib/eva/lifecycle-sd-bridge.js`).

This is the most important SD creation point in the lifecycle:

```
Stage 18 Sprint Plan
         |
         v
   Lifecycle-to-SD Bridge
         |
    +----+----+
    |         |
    v         v
  Orchestrator SD        Child SDs
  (Sprint container)     (Individual features)
  SD-{VENTURE}-FEAT-     SD-{VENTURE}-FEAT-
  SPRINT-001             SPRINT-001-FEAT-LOGIN-001
                         SD-{VENTURE}-FEAT-SPRINT-001-FEAT-SIGNUP-001
                         SD-{VENTURE}-INFRA-SPRINT-001-INFRA-AUTH-001
                         ...
```

**Bridge behavior**:
1. Stage 18 template produces a sprint plan with feature items
2. Bridge creates an orchestrator SD for the sprint
3. Each feature/item becomes a child SD with appropriate type
4. Child SDs are assigned venture namespace prefixes
5. SDs are created via `leo-create-sd.js` (not direct DB insert)
6. Standard LEO workflow (LEAD -> PLAN -> EXEC) applies to each child
7. Sprint progress is tracked through normal SD completion

**Idempotency**: The bridge checks for existing SDs before creating new ones. Re-running Stage 18 does not create duplicate SDs.

**Chairman Decision D06**: Full LEO SDs -- every sprint item goes through LEAD -> PLAN -> EXEC. No shortcuts.

**Example SD keys**:
- Sprint orchestrator: `SD-{VENTURE}-FEAT-SPRINT-001`
- Child feature: `SD-{VENTURE}-FEAT-SPRINT-001-FEAT-AUTH-001`
- Child infrastructure: `SD-{VENTURE}-INFRA-SPRINT-001-INFRA-DB-001`

---

### Stage 19: Integration & API Layer

**Why SD is required**: API development produces endpoints, authentication logic, integration code, and API documentation. This is substantial implementation work.

**SD suffix**: `-APILAYER`
**SD type**: `feature`
**Parent orchestrator**: The venture's top-level orchestrator SD

**How the SD is created**: Manually by Eva when Stage 19 begins. May also be created as a child of the Stage 18 sprint orchestrator if API work is part of the sprint plan.

**Example SD key**: `SD-{VENTURE}-FEAT-APILAYER-001`

**Key outputs**: Endpoint specifications, auth configuration, integration code, API documentation, external service connectors.

---

### Stage 20: Security & Performance

**Why SD is required**: Security audits, OWASP compliance checks, penetration testing, and performance benchmarking are critical tracked work. Security work must have full audit trails.

**SD suffix**: `-SECPERF`
**SD type**: `security`
**Parent orchestrator**: The venture's top-level orchestrator SD

**How the SD is created**: Manually by Eva when Stage 20 begins.

**Example SD key**: `SD-{VENTURE}-SEC-SECPERF-001`

**Key outputs**: OWASP compliance report, vulnerability scan results, performance benchmarks, load test results. Critical/high vulnerabilities must be resolved before Stage 22 Promotion Gate.

**Stop condition**: If a critical vulnerability is found, Eva pauses and requires Chairman review before proceeding -- even without a formal Kill Gate.

---

### Stage 21: QA & UAT

**Why SD is required**: Test development, bug tracking, and UAT execution are substantial work that must be tracked. QA sign-off is a prerequisite for the Deployment Promotion Gate.

**SD suffix**: `-QAUAT`
**SD type**: `qa`
**Parent orchestrator**: The venture's top-level orchestrator SD

**How the SD is created**: Manually by Eva when Stage 21 begins.

**Example SD key**: `SD-{VENTURE}-QA-QAUAT-001`

**Key outputs**: Test cases, test execution results, bug reports, UAT sign-off. Gate requirement: 100% UAT pass rate, 95% automated test coverage.

---

### Stage 22: Deployment & Infrastructure

**Why SD is required**: Deployment configuration, rollback procedures, and infrastructure provisioning are critical implementation work that must pass the Go-to-Market Promotion Gate.

**SD suffix**: `-DEPLOY`
**SD type**: `infrastructure`
**Parent orchestrator**: The venture's top-level orchestrator SD

**How the SD is created**: Manually by Eva when Stage 22 begins.

**Example SD key**: `SD-{VENTURE}-INFRA-DEPLOY-001`

**Key outputs**: Deployment configuration, rollback procedures, monitoring setup, runbooks, 14-item pre-deployment checklist. The Promotion Gate 22 validates these outputs.

---

### Stage 25: Optimization & Scale

**Why SD is required**: Post-launch optimization involves infrastructure scaling, team growth planning, market expansion, and product iteration. These are tracked initiatives with measurable outcomes.

**SD suffix**: `-SCALE`
**SD type**: `enhancement`
**Parent orchestrator**: The venture's top-level orchestrator SD

**How the SD is created**: Manually by Eva when Stage 25 begins.

**Example SD key**: `SD-{VENTURE}-ENH-SCALE-001`

**Key outputs**: 5-category scaling initiatives (infrastructure, team, market, product, funding), milestones, constraint drift check against Stage 1 vision.

**Constraint drift**: Stage 25 explicitly compares current venture state against Stage 1's original vision using `lib/eva/constraint-drift-detector.js`. Significant drift is flagged to the Chairman.

---

## SD Creation Methods

| Method | Stages | Mechanism |
|--------|--------|-----------|
| Manual (Eva creates) | 10, 14, 15, 16, 17, 19, 20, 21, 22, 25 | Eva calls `leo-create-sd.js` |
| Bridge (automated) | 18 | `lib/eva/lifecycle-sd-bridge.js` creates orchestrator + children |

## SD Namespace Convention

All venture SDs use venture-scoped namespaces:

```
SD-{VENTURE_CODE}-{TYPE}-{SUFFIX}-{SEQ}

Examples:
  SD-ACME-FEAT-NAMING-001       (Stage 10, venture code "ACME")
  SD-ACME-INFRA-DATAMODEL-001   (Stage 14)
  SD-ACME-FEAT-SPRINT-001       (Stage 18, orchestrator)
  SD-ACME-SEC-SECPERF-001       (Stage 20)
```

The venture code is determined at Stage 10 (Strategic Naming) and applied retroactively to any SDs created before naming is complete.

**SD key generation**: `scripts/modules/sd-key-generator.js` (extended for venture prefix support by SD-LEO-INFRA-SD-NAMESPACING-001)

## Database Configuration

### lifecycle_stage_config Table

The `lifecycle_stage_config` table stores per-stage configuration including SD requirements:

| Column | Type | Purpose |
|--------|------|---------|
| stage_number | INTEGER | Stage identifier (1-25) |
| stage_name | TEXT | Human-readable name |
| phase_category | TEXT | ideation, validation, planning, build, launch, scale |
| sd_required | BOOLEAN | Whether this stage creates an SD |
| sd_suffix | TEXT | Suffix for the SD key (e.g., '-NAMING') |
| work_type | TEXT | SD type: feature, infrastructure, security, etc. |
| has_kill_gate | BOOLEAN | Kill gate at this stage |
| has_promotion_gate | BOOLEAN | Promotion gate at this stage |

### SD-to-Venture Relationship

```
ventures (1)
    |
    +--< strategic_directives_v2 (N)
    |     |
    |     +-- metadata.venture_id = ventures.id
    |     +-- sd_key starts with SD-{VENTURE_CODE}-
    |
    +--< venture_artifacts (N)
          |
          +-- venture_id = ventures.id
          +-- lifecycle_stage = stage_number
```

## Lifecycle-to-SD Bridge Architecture

The bridge at Stage 18 is the most architecturally significant integration point between the venture lifecycle and the LEO Protocol.

```
+------------------+         +-------------------+         +------------------+
| Eva Orchestrator |         | Lifecycle-to-SD   |         | LEO Protocol     |
| processStage(18) | ------> | Bridge            | ------> | LEAD->PLAN->EXEC |
|                  |         |                   |         |                  |
| Stage 18 output: |         | Maps sprint items |         | Standard SD      |
| - Sprint plan    |         | to SD types       |         | workflow for     |
| - Feature list   |         | Creates via       |         | each feature     |
| - Priorities     |         | leo-create-sd.js  |         |                  |
+------------------+         +-------------------+         +------------------+
                                      |
                              Creates orchestrator
                              + N child SDs
```

### Key Design Decisions

1. **SDs created via script, not direct insert**: Ensures all validations, type checks, and metadata enrichment happen consistently.
2. **Orchestrator pattern**: Sprint becomes an orchestrator SD with child SDs for individual features.
3. **Idempotent**: Running the bridge twice for the same sprint plan does not create duplicates.
4. **Venture namespace**: All SDs automatically receive the venture prefix.
5. **Full LEO workflow**: Chairman Decision D06 requires every sprint item to go through LEAD -> PLAN -> EXEC.
