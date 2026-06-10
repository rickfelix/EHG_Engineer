---
category: guide
status: draft
version: 1.0.0
author: Rick Felix
last_updated: 2026-02-28
tags: [guide, auto-generated]
---
# LEO Self-Improvement Operations Guide


## Table of Contents

- [Metadata](#metadata)
- [Overview](#overview)
  - [Key Capabilities](#key-capabilities)
  - [Two Input Streams](#two-input-streams)
- [System Architecture](#system-architecture)
  - [Infrastructure Components](#infrastructure-components)
  - [Key Tables](#key-tables)
- [Data Flow Diagrams](#data-flow-diagrams)
  - [Complete Pipeline Flow](#complete-pipeline-flow)
  - [Internal Discovery Flow](#internal-discovery-flow)
- [Pipeline Stages](#pipeline-stages)
  - [Stage 1: Feedback Ingestion (95% Automated)](#stage-1-feedback-ingestion-95-automated)
  - [Stage 2: Quality Processing (100% Automated)](#stage-2-quality-processing-100-automated)
  - [Stage 3: Proposal Creation (80% Automated)](#stage-3-proposal-creation-80-automated)
  - [Stage 4: Prioritization (100% Automated)](#stage-4-prioritization-100-automated)
  - [Stage 5: Vetting - Rubric Assessment (100% Automated)](#stage-5-vetting---rubric-assessment-100-automated)
  - [Stage 6: Vetting - AEGIS Constitutional (100% Automated)](#stage-6-vetting---aegis-constitutional-100-automated)
  - [Stage 7: Board Vetting - Multi-Model Debate (100% Automated)](#stage-7-board-vetting---multi-model-debate-100-automated)
  - [Stage 8: Board Verdict Calculation (100% Automated)](#stage-8-board-verdict-calculation-100-automated)
  - [Stage 9: /learn Review & SD Creation (90% Automated)](#stage-9-learn-review-sd-creation-90-automated)
  - [Stage 10: SD Implementation (Manual by Design)](#stage-10-sd-implementation-manual-by-design)
  - [Stage 11: Auto-Resolution (100% Automated)](#stage-11-auto-resolution-100-automated)
  - [Stage 12: Outcome Tracking (100% Automated)](#stage-12-outcome-tracking-100-automated)
- [Commands Reference](#commands-reference)
  - [Primary Commands](#primary-commands)
  - [Unified Inbox Sections](#unified-inbox-sections)
  - [Analytics Output](#analytics-output)
- [Database Schema](#database-schema)
  - [Core Tables Relationships](#core-tables-relationships)
  - [Key Schema Details](#key-schema-details)
- [Automation Status](#automation-status)
  - [Current State: 95% Automated](#current-state-95-automated)
  - [Completed Integrations (Self-Improving LEO Orchestrator)](#completed-integrations-self-improving-leo-orchestrator)
- [Operations Procedures](#operations-procedures)
  - [Daily Operations](#daily-operations)
  - [Weekly Operations](#weekly-operations)
  - [Monthly Operations](#monthly-operations)
- [Troubleshooting](#troubleshooting)
  - [Feedback Not Appearing in Inbox](#feedback-not-appearing-in-inbox)
  - [Proposal Not Being Vetted](#proposal-not-being-vetted)
  - [SD Not Auto-Resolving Patterns](#sd-not-auto-resolving-patterns)
  - [Multi-Model Debate Not Running](#multi-model-debate-not-running)
- [Related Documentation](#related-documentation)
- [Version History](#version-history)

## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.1.0
- **Author**: LEO Protocol Team
- **Last Updated**: 2026-02-06
- **Tags**: self-improvement, feedback, proposals, vetting, automation, learning

---

## Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Data Flow Diagrams](#data-flow-diagrams)
4. [Pipeline Stages](#pipeline-stages)
5. [Commands Reference](#commands-reference)
6. [Database Schema](#database-schema)
7. [Automation Status](#automation-status)
8. [Operations Procedures](#operations-procedures)
9. [Troubleshooting](#troubleshooting)
10. [Related Documentation](#related-documentation)

---

## Overview

The LEO Self-Improvement System is a comprehensive infrastructure for continuous protocol evolution. It captures feedback from multiple sources, processes it through quality and governance layers, vets proposals through multi-model debate, and creates Strategic Directives for implementation.

### Key Capabilities

| Capability | Description | Entry Point |
|------------|-------------|-------------|
| **Feedback Capture** | Capture external feedback from UAT, users, errors | Automatic + `/leo inbox` |
| **Internal Audit** | Discover opportunities from patterns, retrospectives | `/leo audit` |
| **Quality Processing** | Sanitize, score, quarantine feedback | Automatic |
| **Proposal Vetting** | Rubric assessment + AEGIS constitutional validation | Automatic |
| **Multi-Model Debate** | Board vetting with 3 AI critic personas | Automatic via DebateOrchestrator |
| **SD Creation** | Convert approved items to Strategic Directives | `/learn apply` |
| **Outcome Tracking** | Track success/failure of improvements | Automatic |
| **Loop Closure** | Link outcomes back to original patterns | Automatic |

### Two Input Streams

```
┌─────────────────────────────┐     ┌─────────────────────────────┐
│     EXTERNAL FEEDBACK       │     │     INTERNAL DISCOVERY      │
│  (Users, UAT, Error Logs)   │     │  (Retrospectives, Patterns) │
└──────────────┬──────────────┘     └──────────────┬──────────────┘
               │                                    │
               ▼                                    ▼
        ┌──────────────┐                   ┌──────────────┐
        │ leo_feedback │                   │issue_patterns│
        │ table        │                   │audit_findings│
        └──────────────┘                   └──────────────┘
               │                                    │
               └────────────────┬───────────────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │   UNIFIED INBOX       │
                    │   /leo inbox          │
                    └───────────────────────┘
```

---

## System Architecture

### Infrastructure Components

#### 001 Series (Feedback Pipeline)

| Phase | Component | Purpose |
|-------|-----------|---------|
| 001A | Protocol Constitution | 9 immutable governance rules |
| 001B | AEGIS Framework | Unified governance enforcement |
| 001C | Quality Layer | Sanitization, scoring, quarantine |
| 001D | Feature Flags | Kill-switch capability |
| 001E | Proposals Workflow | Status machine, transitions |
| 001F | Vetting Engine | Rubric + AEGIS integration |

#### 002 Series (Self-Enhancement)

| Phase | Component | Purpose |
|-------|-----------|---------|
| 002A | Safety Boundaries | Constitutional constraints |
| 002B | Self-Discovery | audit_findings, issue_patterns |
| 002C | Board Vetting | Multi-model debate system |
| 002D | Safe Execution | Dry-run, rollback primitives |
| 002E | Enhancement Engine | enhancement_proposals lifecycle |
| 002F | Outcome Tracking | Loop closure, KPIs |

### Key Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `leo_feedback` | External feedback items | source_type, priority, status |
| `leo_proposals` | Self-improvement proposals | status, risk_level, rubric_score |
| `leo_vetting_outcomes` | Vetting results | outcome, rubric_score, aegis_result |
| `enhancement_proposals` | Enhancement lifecycle | status, outcome_signal, loop_closed_at |
| `proposal_debates` | Multi-model debate records | critic_persona, score, reasoning |
| `issue_patterns` | Recurring patterns | pattern_id, evidence_count, status |
| `audit_findings` | Internal discoveries | finding_type, severity, status |
| `protocol_improvement_queue` | Improvement queue | improvement_type, evidence_count, assigned_sd_id |

---

## Data Flow Diagrams

### Complete Pipeline Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FEEDBACK INGESTION                                 │
│  Error handlers, UAT feedback, user reports, automated captures             │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         QUALITY PROCESSING                                   │
│  ┌───────────────┐   ┌───────────────┐   ┌───────────────┐                 │
│  │  Sanitization │ → │ Quality Score │ → │  Quarantine   │                 │
│  │  (PII, Inject)│   │   (0-100)     │   │  Evaluation   │                 │
│  └───────────────┘   └───────────────┘   └───────────────┘                 │
│                                                                              │
│  Feature Flags: quality_layer_sanitization, quality_layer_quarantine        │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                    ┌────────────────┴────────────────┐
                    │                                 │
                    ▼                                 ▼
          ┌─────────────────┐              ┌─────────────────┐
          │  leo_feedback   │              │  Quarantined    │
          │  (status: new)  │              │  (blocked)      │
          └────────┬────────┘              └─────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PROPOSAL CREATION                                     │
│  FeedbackToProposalWorker extracts: title, summary, risk, components        │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          PRIORITIZATION                                      │
│  PrioritizationWorker assigns score (0-100) and queue (urgent/standard/back)│
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            VETTING                                           │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                     RUBRIC ASSESSMENT                                  │  │
│  │  6 Criteria: Value, Risk, Complexity, Reversibility, Alignment, Test  │  │
│  │  Weighted scoring → 0-100 normalized score                            │  │
│  │  ✅ AI-POWERED via evaluateWithAI() (Sonnet tier, SD-001-A)            │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                     AEGIS VALIDATION                                   │  │
│  │  CONST-001: Protocol Integrity                                        │  │
│  │  CONST-002: Self-Improvement Governance (multi-model diversity)       │  │
│  │  CONST-009: Feature Flag Kill Switch                                  │  │
│  │  ✅ FULLY AUTOMATED                                                    │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       BOARD VETTING (Multi-Model Debate)                     │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐                       │
│  │   SAFETY    │   │    VALUE    │   │    RISK     │                       │
│  │   Critic    │   │   Critic    │   │   Critic    │                       │
│  │  (Model A)  │   │  (Model B)  │   │  (Model C)  │                       │
│  └──────┬──────┘   └──────┬──────┘   └──────┬──────┘                       │
│         │                 │                 │                               │
│         └─────────────────┼─────────────────┘                               │
│                           ▼                                                  │
│                    ┌─────────────┐                                          │
│                    │   VERDICT   │  Consensus: APPROVE / REJECT / REVISE   │
│                    └─────────────┘                                          │
│  ✅ FULLY IMPLEMENTED - DebateOrchestrator with 3 personas (SD-002C)       │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          /learn COMMAND                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  /learn process                                                      │    │
│  │  - Shows top 5 patterns (issue_patterns)                            │    │
│  │  - Shows top 5 improvements (protocol_improvement_queue)            │    │
│  │  - Shows top 5 vetted feedback (leo_vetting_outcomes)               │    │
│  │  - Devil's Advocate counter-arguments for each                      │    │
│  │  - User selects items to approve                                    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  /learn apply --decisions='{"ITEM_ID": {"status": "APPROVED"}}'     │    │
│  │  - Classifies complexity (Quick-Fix vs Full SD)                     │    │
│  │  - Creates SD in strategic_directives_v2                            │    │
│  │  - Tags source items with assigned_sd_id                            │    │
│  │  - Regenerates CLAUDE.md                                            │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    LEO PROTOCOL EXECUTION                                    │
│                    LEAD → PLAN → EXEC                                        │
│                                                                              │
│  SD appears in queue (npm run sd:next)                                      │
│  User claims and works through phases                                       │
│  Tests, validation, PR creation                                             │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      LEAD-FINAL-APPROVAL                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Auto-Resolution (LeadFinalApprovalExecutor)                        │    │
│  │  - Patterns → status: 'resolved'                                    │    │
│  │  - Improvements → status: 'APPLIED'                                 │    │
│  │  - resolution_notes → 'Resolved by SD-LEARN-XXX'                    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       OUTCOME TRACKING                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Record Outcome Signal                                               │    │
│  │  - outcome_signal: 'success' | 'failure' | 'partial'                │    │
│  │  - loop_closed_at: timestamp                                        │    │
│  │  - Track pattern recurrence                                         │    │
│  │  - Measure effectiveness                                            │    │
│  │  ⚠️ PARTIALLY AUTOMATED - Needs closure link from SD to feedback   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Internal Discovery Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     RETROSPECTIVE CREATION                                   │
│  Triggered by: handoff.js on phase transitions, SD completion               │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     EXTRACTION TRIGGER                                       │
│  extract_protocol_improvements_from_retro()                                 │
│  - Extracts from protocol_improvements[] JSONB array                        │
│  - Extracts from failure_patterns[] array                                   │
│  - Consolidates similar items, increments evidence_count                    │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                    ┌────────────────┴────────────────┐
                    ▼                                 ▼
          ┌─────────────────────┐         ┌─────────────────────┐
          │protocol_improvement │         │   issue_patterns    │
          │       _queue        │         │                     │
          │ status: PENDING     │         │ status: active      │
          └─────────────────────┘         └─────────────────────┘
                    │                                 │
                    └────────────────┬────────────────┘
                                     │
                                     ▼
                          ┌─────────────────┐
                          │  /learn process │
                          └─────────────────┘
```

---

## Pipeline Stages

### Stage 1: Feedback Ingestion (95% Automated)

**Purpose**: Capture feedback from multiple sources

**Sources**:
- Global error handlers (`uncaughtException`, `unhandledRejection`)
- UAT feedback submissions
- User reports via API
- Automated captures from monitoring

**Key Module**: `lib/feedback-capture.js`

**What Happens**:
1. Feedback received from source
2. Priority calculated (P0-P4) based on severity, type, source
3. Deduplication by error hash (5-minute window)
4. Burst detection for similar errors
5. Insert into `leo_feedback` table

**Manual Intervention**: None required

---

### Stage 2: Quality Processing (100% Automated)

**Purpose**: Sanitize, score, and evaluate feedback quality

**Key Module**: `lib/quality/feedback-quality-processor.js`

**Sub-stages**:

| Sub-stage | Module | What It Does |
|-----------|--------|--------------|
| Sanitization | `lib/quality/sanitizer.js` | Redacts PII (emails, SSNs, API keys), detects injection patterns |
| Quality Scoring | `lib/quality/quality-scorer.js` | Scores 0-100 across 5 dimensions |
| Quarantine | `lib/quality/quarantine-engine.js` | Isolates high-risk items |
| Audit Logging | `lib/quality/audit-logger.js` | Comprehensive processing trail |

**Quality Score Dimensions**:
- **Clarity**: Word count, capitalization, structure
- **Actionability**: Error context, reproduction steps
- **Specificity**: SD IDs, file paths, error types
- **Relevance**: Project keywords, source app
- **Completeness**: Fields filled, metadata richness

**Feature Flags**:
- `quality_layer_sanitization`: Enable/disable sanitization
- `quality_layer_quarantine`: Enable/disable quarantine
- `quality_layer_audit_logging`: Enable/disable audit logging

**Manual Intervention**: None required

---

### Stage 3: Proposal Creation (80% Automated)

**Purpose**: Convert feedback into structured proposals

**Key Module**: `lib/data-plane/workers/feedback-to-proposal.js` (exports `FeedbackToProposalWorker`)

**What Gets Extracted**:
- Title → proposal title
- Description → summary
- Type → risk level assessment
- Related files/mentions → affected_components
- Motivation (regex extraction)
- Constitution tags (keyword mapping)

**Gap**: Motivation and scope extraction use simple patterns, not semantic analysis

**Manual Intervention**: None required, but quality depends on feedback quality

---

### Stage 4: Prioritization (100% Automated)

**Purpose**: Assign priority scores and queue placement

**Key Module**: `lib/data-plane/workers/prioritization.js` (exports the prioritization worker)

**Scoring Factors**:
- Feedback priority (P0-P4)
- Issue type (bug, feature, refactor)
- Affected components (database vs UI vs config)
- Related issues (burst patterns boost priority)

**Queue Assignment**:
- `urgent_queue`: score ≥ 80
- `standard_queue`: score 40-79
- `backlog_queue`: score < 40

**Manual Intervention**: None required

---

### Stage 5: Vetting - Rubric Assessment (100% Automated)

**Purpose**: Evaluate proposals against 6 criteria

**Key Module**: `lib/sub-agents/vetting/index.js`

**6 Criteria** (with weights):
| Criterion | Weight | Description |
|-----------|--------|-------------|
| Value Proposition | 0.25 | Does this provide clear value? |
| Risk Assessment | 0.20 | What is the risk level? |
| Complexity | 0.15 | How complex is implementation? |
| Reversibility | 0.15 | Can it be easily reversed? |
| Protocol Alignment | 0.15 | Does it align with LEO principles? |
| Testability | 0.10 | Can it be properly tested? |

**Current State**: FULLY AUTOMATED (SD-LEO-ORCH-SELF-IMPROVING-LEO-001-A)
```javascript
// lib/sub-agents/vetting/rubric-evaluator.js
// AI-powered evaluation via evaluateWithAI() using Sonnet tier
// Falls back to heuristic scoring if LLM unavailable
const aiResult = await evaluateWithAI(proposal, rubric, { supabase });
if (aiResult.status === 'SUCCESS') return aiResult;
// Heuristic fallback via _assessWithHeuristic()
```

**Features**: Single structured JSON LLM call, schema validation with retry, full audit trail

**Manual Intervention**: None (AI evaluation with automatic heuristic fallback)

---

### Stage 6: Vetting - AEGIS Constitutional (100% Automated)

**Purpose**: Validate against governance rules

**Key Module**: `lib/governance/aegis/AegisEnforcer.js`

**Constitutions Checked**:
- **CONST-001**: Protocol Integrity
- **CONST-002**: Self-Improvement Governance (multi-model diversity)
- **CONST-009**: Feature Flag Kill Switch

**Enforcement Actions**:
- `BLOCK_UNCONDITIONAL`: Auto-reject
- `BLOCK_OVERRIDABLE`: Mark "needs_revision"
- `WARN_AND_LOG`: Mark with warnings

**Manual Intervention**: None (unless overrides needed)

---

### Stage 7: Board Vetting - Multi-Model Debate (100% Automated)

**Purpose**: Get diverse AI perspectives on proposals

**Key Module**: `lib/sub-agents/vetting/debate-orchestrator.js`

**Implementation** (3 Critic Personas):
| Persona | Focus | Model Family |
|---------|-------|--------------|
| Safety | Risk, security, stability | Family A (Anthropic) |
| Value | Business value, user impact | Family B (OpenAI) |
| Risk | Technical risk, complexity | Family C (Google) |

**CONST-002 Enforcement**: Proposer model cannot share family with any evaluator

**Current State**: FULLY AUTOMATED (SD-LEO-ORCH-SELF-IMPROVING-LEO-001 / 002C)
```javascript
// lib/sub-agents/vetting/debate-orchestrator.js
// Multi-round debate with consensus detection
const debate = new DebateOrchestrator(supabase);
const result = await debate.runDebate(proposal);
// result: { verdict, score, rounds, consensusReached }
```

**Features**: Multi-round debates (max 3), consensus detection (2/3 majority + score delta ≤15), full transcript persistence

**Manual Intervention**: None (fully autonomous debate with consensus-based verdicts)

---

### Stage 8: Board Verdict Calculation (100% Automated)

**Purpose**: Aggregate critic assessments into final verdict

**Key View**: `v_improvement_board_verdicts`

**Verdict Logic**:
- All 3 APPROVE → verdict = APPROVE
- All 3 REJECT → verdict = REJECT
- Mixed → verdict = NEEDS_REVISION

**Risk Tier Recommendation**: Based on aggregate scores

**Manual Intervention**: None (once assessments exist)

---

### Stage 9: /learn Review & SD Creation (90% Automated)

**Purpose**: Human review and SD creation

**Key Module**: `scripts/modules/learning/index.js`

**Process**:
1. `/learn process` surfaces top patterns, improvements, feedback
2. Devil's Advocate provides counter-arguments
3. User approves items (JSON format)
4. `/learn apply` creates SD automatically
5. Source items tagged with `assigned_sd_id`
6. CLAUDE.md regenerated

**Manual Intervention**: User approval required (safety gate)

---

### Stage 10: SD Implementation (Manual by Design)

**Purpose**: Execute improvements through LEO Protocol

**Process**: LEAD → PLAN → EXEC phases

**Manual Intervention**: User selects which SD to work on (appropriate design)

---

### Stage 11: Auto-Resolution (100% Automated)

**Purpose**: Mark items as resolved when SD completes

**Key Module**: `scripts/modules/handoff/executors/LeadFinalApprovalExecutor.js`

**What Happens**:
- Patterns → `status: 'resolved'`
- Improvements → `status: 'APPLIED'`
- `resolution_notes` → "Resolved by SD-LEARN-XXX"

**Manual Intervention**: None required

---

### Stage 12: Outcome Tracking (100% Automated)

**Purpose**: Track improvement effectiveness and close feedback loops

**Key Module**: `lib/learning/outcome-tracker.js`

**Tables**:
- `enhancement_proposals.outcome_signal`: success/failure/partial
- `enhancement_proposals.loop_closed_at`: closure timestamp
- `outcome_signals`: Tracks sd_completion, pattern_recurrence events

**Features** (SD-LEO-ORCH-SELF-IMPROVING-LEO-001 / Outcome Loop Closure):
- `recordSdCompleted()`: Auto-marks linked feedback as resolved on SD completion
- `computeEffectiveness()`: Calculates pre/post feedback delta (30-day window)
- `detectRecurrence()`: Jaccard similarity matching (threshold 0.75) for pattern recurrence
- `getOutcomeSummary()`: Aggregates completion signals, metrics, and recurrence data

**Manual Intervention**: None (fully automated on SD completion via LEAD-FINAL-APPROVAL)

---

## Commands Reference

### Primary Commands

| Command | Purpose | Usage |
|---------|---------|-------|
| `/leo inbox` | Unified inbox view | View all items (new, shelf, pending SDs, in-progress) |
| `/leo audit` | Run internal audit | Discover new opportunities from patterns |
| `/leo analytics` | View metrics | Outcomes, feedback stats, AEGIS, vetting coverage |
| `/leo status [id]` | Check progress | Track specific item through workflow |
| `/learn` | Review pending items | Surface patterns, improvements, feedback |
| `/learn apply` | Create SD | Convert approved items to Strategic Directive |
| `/learn insights` | Effectiveness metrics | Approval rates, recurrence, trends |

### Unified Inbox Sections

```
/leo inbox

LEO IMPROVEMENT INBOX
══════════════════════════════════════════════════════════════

🆕 NEW (Needs Triage) - 3 items
────────────────────────────────────────
  [F-015] Feedback: "API timeout" (unreviewed)
  [D-012] Discovery: Duplicate RLS policy (auto-found)
  [P-008] Pattern: Test skip pattern (2x in 3 days)

📋 ON THE SHELF (Triaged, Ready to Act) - 7 items
────────────────────────────────────────
  [P-003] Pattern: Schema mismatch (3x) - HIGH priority
  [F-009] Feedback: "Slow dashboard" - MEDIUM priority

📂 PENDING SDs (Created, Not Started) - 2 SDs
────────────────────────────────────────
  SD-LEARN-009: "Database optimization" (draft)
  SD-LEARN-010: "Error handling" (LEAD phase, not claimed)

🔄 IN PROGRESS (Assigned to Active SDs) - 3 SDs
────────────────────────────────────────
  SD-LEARN-007: "Schema validation" (EXEC) → [P-001], [P-002]
  SD-LEARN-008: "API retry logic" (PLAN) → [F-012]

✅ RECENTLY COMPLETED - 2 SDs
────────────────────────────────────────
  SD-LEARN-006: Completed (outcome: success) → [P-009], [F-003]
```

### Analytics Output

```
/leo analytics

LEO SELF-IMPROVEMENT ANALYTICS
══════════════════════════════════════════════════════════════

FEEDBACK PIPELINE (Last 30 days)
────────────────────────────────────────
  Received:        47 items
  Sanitized:       45 (96%) | 2 quarantined
  Vetted:          38 (84%)
  Avg Quality:     76/100
  Became SDs:      12 (32%)

ENHANCEMENT OUTCOMES
────────────────────────────────────────
  Applied:         8 improvements
  Success:         6 (75%)
  Partial:         1 (12.5%)
  Failed:          1 (12.5%)
  Loops Closed:    5 of 8 (62.5%)

PATTERN RESOLUTION
────────────────────────────────────────
  Active:          14 patterns
  Resolved:        23 this month
  Recurring:       2 (came back after fix)

AEGIS GOVERNANCE
────────────────────────────────────────
  Open Violations: 3
  Resolved:        12 this month
  Top Rule:        CONST-002 (5 triggers)

VETTING COVERAGE
────────────────────────────────────────
  Proposals Vetted: 15
  Approval Rate:    73%
  Avg Rubric Score: 71/100
```

---

## Database Schema

### Core Tables Relationships

```
leo_feedback ──────────────┐
                           │
                           ▼
                    leo_proposals ──────────────────┐
                           │                        │
                           ▼                        ▼
              leo_vetting_outcomes          leo_proposal_transitions
                           │
                           ▼
            improvement_quality_assessments
                           │
                           ▼
           v_improvement_board_verdicts (view)
                           │
                           ▼
               learning_decisions
                           │
                           ▼
            strategic_directives_v2
```

### Key Schema Details

See individual table documentation in `docs/reference/schema/engineer/tables/`:
- `leo_feedback.md`
- `leo_proposals.md`
- `leo_vetting_outcomes.md`
- `enhancement_proposals.md`
- `proposal_debates.md`
- `issue_patterns.md`
- `protocol_improvement_queue.md`

---

## Automation Status

### Current State: 95% Automated

| Stage | Current | Target | Gap |
|-------|---------|--------|-----|
| Feedback Ingestion | 95% | 100% | 5% |
| Quality Processing | 100% | 100% | 0% |
| Proposal Creation | 80% | 95% | 15% |
| Prioritization | 100% | 100% | 0% |
| Rubric Assessment | 100% | 100% | 0% |
| AEGIS Validation | 100% | 100% | 0% |
| Multi-Model Debate | 100% | 100% | 0% |
| Verdict Calculation | 100% | 100% | 0% |
| /learn Review | 90% | 95% | 5% |
| SD Implementation | 0% | 0% | 0% (by design) |
| Auto-Resolution | 100% | 100% | 0% |
| Outcome Tracking | 100% | 100% | 0% |

### Completed Integrations (Self-Improving LEO Orchestrator)

1. **Rubric Assessment AI Integration** (SD-LEO-ORCH-SELF-IMPROVING-LEO-001-A)
   - Module: `lib/sub-agents/vetting/rubric-evaluator.js`
   - Sonnet-tier LLM evaluation with schema validation and retry
   - Heuristic fallback if LLM unavailable

2. **Multi-Model Debate System** (SD-002C)
   - Module: `lib/sub-agents/vetting/debate-orchestrator.js`
   - 3 critic personas across different LLM provider families
   - Multi-round consensus with early stopping

3. **Outcome Loop Closure** (SD-LEO-ORCH-SELF-IMPROVING-LEO-001 / Outcome Loop)
   - Module: `lib/learning/outcome-tracker.js`
   - Auto-resolves feedback on SD completion
   - Recurrence detection via Jaccard similarity

4. **Unified Inbox** (SD-LEO-ORCH-SELF-IMPROVING-LEO-001 / Inbox)
   - Module: `lib/inbox/unified-inbox-builder.js`
   - Lifecycle-based grouping with deduplication

---

## Operations Procedures

### Daily Operations

1. **Check Inbox**: `/leo inbox` to see new items
2. **Triage New Items**: Review and categorize new feedback
3. **Monitor In-Progress**: Check status of active SDs

### Weekly Operations

1. **Run /learn**: Review accumulated patterns and improvements
2. **Check Analytics**: `/leo analytics` for trends
3. **Review AEGIS Violations**: Address any open violations

### Monthly Operations

1. **Effectiveness Review**: Measure improvement outcomes
2. **Pattern Recurrence**: Check if resolved patterns returned
3. **Documentation Update**: Update this guide if needed

---

## Troubleshooting

### Feedback Not Appearing in Inbox

1. Check if quarantined: Query `leo_feedback WHERE status = 'quarantined'`
2. Check quality score: Low-quality items may be filtered
3. Check feature flags: Ensure processing flags are enabled

### Proposal Not Being Vetted

1. Check proposal status: Must be in 'submitted' state
2. Check AEGIS violations: May be blocked
3. Check vetting queue: May be waiting for capacity

### SD Not Auto-Resolving Patterns

1. Verify `assigned_sd_id` is set on patterns
2. Check LEAD-FINAL-APPROVAL executed successfully
3. Verify LeadFinalApprovalExecutor ran

### Multi-Model Debate Not Running

Currently expected - debate is placeholder. Will be fixed by automation SD.

---

## Related Documentation

- [Self-Improvement System Guide](./self-improvement-system-guide.md)
- [AEGIS Integration Guide](./aegis-integration-guide.md)
- [Protocol Constitution Guide](../03_protocols_and_standards/protocol-constitution-guide.md)
- [Command Ecosystem Reference](../leo/commands/command-ecosystem.md)
- [Learning System Explained](learning-system-explained.md)

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-02-02 | Initial comprehensive guide |

---

**Last Updated**: 2026-02-02
**Status**: Draft
**Next Review**: After automation SD completion
