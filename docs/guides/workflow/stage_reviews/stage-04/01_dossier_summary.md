---
category: guide
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [guide, auto-generated]
---
# Stage 4 Dossier Summary



## Table of Contents

- [Metadata](#metadata)
- [Purpose](#purpose)
- [Expected Deliverables](#expected-deliverables)
  - [1. **Competitive Analysis Report**](#1-competitive-analysis-report)
  - [2. **Market Positioning Strategy**](#2-market-positioning-strategy)
  - [3. **Competitive Moat & Defense Strategy**](#3-competitive-moat-defense-strategy)
  - [4. **Feature Comparison Matrix**](#4-feature-comparison-matrix)
- [Success Criteria](#success-criteria)
  - [Entry Gates (Prerequisites)](#entry-gates-prerequisites)
  - [Exit Gates (Completion Criteria)](#exit-gates-completion-criteria)
  - [Metrics](#metrics)
- [Dependencies](#dependencies)
  - [Depends On (Prerequisites)](#depends-on-prerequisites)
  - [Blocks (Downstream Dependencies)](#blocks-downstream-dependencies)
- [Substages (4 Phases)](#substages-4-phases)
  - [Substage 4.1: Competitor Identification](#substage-41-competitor-identification)
  - [Substage 4.2: Feature Comparison](#substage-42-feature-comparison)
  - [Substage 4.3: Market Positioning](#substage-43-market-positioning)
  - [Substage 4.4: Defense Strategy](#substage-44-defense-strategy)
- [Original Intent](#original-intent)
- [Dossier Quality Assessment](#dossier-quality-assessment)
- [Sources Referenced](#sources-referenced)

## Metadata
- **Category**: Report
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, api, unit, feature

**Stage**: 4 - Competitive Intelligence & Market Defense
**Review Date**: 2025-11-07
**Reviewer**: Chairman
**Dossier Source**: `/docs/workflow/dossiers/stage-04/` (11 files)
**Dossier Quality Score**: 90/100 (Approved with Minor Gaps)

---

## Purpose

Stage 4 exists to **analyze the competitive landscape and establish market positioning strategy** for each venture. This ensures ventures understand their competitive environment, identify differentiation opportunities, and establish defensible market positions before moving to financial modeling and go-to-market planning.

**Strategic Intent**: Transform market research and competitor data into actionable competitive intelligence, enabling data-driven positioning decisions and moat identification.

---

## Expected Deliverables

### 1. **Competitive Analysis Report**
   - Description: Comprehensive analysis of direct and indirect competitors
   - Type: Documentation + Database Records
   - Components:
     - Direct competitors list (5-10 companies)
     - Indirect competitors mapping
     - Competitor funding, features, market share data
     - Competitive intelligence API integrations (CB Insights, Crunchbase, SimilarWeb)

### 2. **Market Positioning Strategy**
   - Description: Unique Selling Proposition (USP) and differentiation strategy
   - Type: Strategic Documentation
   - Components:
     - USP definition
     - Differentiation strategy
     - Target market segmentation
     - Positioning statement

### 3. **Competitive Moat & Defense Strategy**
   - Description: Identification of defensible competitive advantages
   - Type: Strategic Documentation
   - Components:
     - Competitive moat definition (network effects, IP, brand, barriers)
     - IP strategy outline
     - Defense mechanisms against competitive threats
     - Long-term defensibility assessment

### 4. **Feature Comparison Matrix**
   - Description: Feature parity analysis vs. competitors
   - Type: Database + UI Component
   - Components:
     - Feature matrix table (venture features vs. competitor features)
     - Gap identification (features competitors have that venture lacks)
     - Feature taxonomy (10-20 standard features per vertical)

---

## Success Criteria

### Entry Gates (Prerequisites)
- ✅ **Validation Complete**: Stage 3 (Comprehensive Validation) completed
- ✅ **Market Defined**: Target market and customer segments identified

### Exit Gates (Completion Criteria)
- ✅ **Competitors Analyzed**: At least 5 direct competitors identified and researched
- ✅ **Positioning Defined**: USP and differentiation strategy documented
- ✅ **Moat Identified**: At least one defensible competitive advantage established

### Metrics
1. **Market Coverage**: % of relevant market competitors identified (target: ≥80%)
2. **Competitor Identification**: Number of competitors researched (target: ≥5 direct, ≥10 indirect)
3. **Differentiation Score**: Calculated as `(USP strength + Moat strength) / 2` (target: ≥7/10)

---

## Dependencies

### Depends On (Prerequisites)
- **Stage 3**: Comprehensive Validation
  - **Why**: Must validate product-market fit before analyzing competitive landscape
  - **Inputs Needed**: Validated problem statement, target customer profile, TAM estimation

### Blocks (Downstream Dependencies)
- **Stage 5**: Business Model & Profitability Assessment
  - **Why**: Competitive positioning informs pricing strategy and revenue model
  - **Outputs Needed**: Competitor pricing data, market positioning, differentiation strategy

---

## Substages (4 Phases)

### Substage 4.1: Competitor Identification
**Done When**:
- Direct competitors listed (min 5)
- Indirect competitors mapped (min 10)
- Competitor profiles created (name, URL, description, funding, market share)

### Substage 4.2: Feature Comparison
**Done When**:
- Feature matrix complete (venture features vs. top 5 competitors)
- Feature gaps identified and prioritized
- Feature parity assessment documented

### Substage 4.3: Market Positioning
**Done When**:
- USP defined and articulated
- Differentiation strategy set
- Positioning statement drafted and validated

### Substage 4.4: Defense Strategy
**Done When**:
- Competitive moat defined (network effects, IP, brand, barriers)
- IP strategy outlined
- Long-term defensibility documented

---

## Original Intent

Stage 4 was designed to ensure ventures **do not enter the market blind to competitive realities**. The original workflow envisioned a **manual → assisted → automated progression**:

1. **Manual Phase** (MVP): Founders manually research competitors using spreadsheets
2. **Assisted Phase** (Current Target): LEAD agent provides competitor suggestions, automated data scraping
3. **Automated Phase** (Future): AI agents continuously monitor competitive landscape and alert on threats

The stage aims to create a **living competitive intelligence system** that evolves with the market, not a one-time analysis. Ventures should revisit Stage 4 via recursion triggers when:
- **FIN-002**: Pricing strategy contradicts competitive positioning
- **MKT-002**: Market research reveals competitor analysis incomplete
- **IP-001**: IP review reveals moat not defensible

**Key Assumption**: Competitive intelligence requires **continuous monitoring** and **API integrations** to remain current. Manual processes are insufficient for dynamic markets.

---

## Dossier Quality Assessment

**Score**: 90/100 (Approved with Minor Gaps)

**Strengths**:
- ✅ Complete YAML extraction (48 lines, all fields documented)
- ✅ Accurate critique transcription (8 rubric scores)
- ✅ Honest recursion handling (minimal support acknowledged)
- ✅ Strong evidence trail (all 11 files have source citations)
- ✅ Clean boundaries (EHG vs. EHG_Engineer separation maintained)

**Known Gaps** (documented in dossier):
- ⚠️ GAP-S4-001: Competitive Intelligence Tool Integrations Missing (P0)
- ⚠️ GAP-S4-002: Recursion Support Not Detailed (P0)
- ⚠️ GAP-S4-003: Differentiation Score Calculation Not Defined (P1)
- ⚠️ GAP-S4-004: Rollback Procedures Undefined (P1)
- ⚠️ GAP-S4-005: Feature Matrix Storage Not Defined (P2)
- ⚠️ GAP-S4-006: Customer Validation Touchpoint Missing (P3)

**Total Estimated Effort to Close All Gaps**: 15-22 days

---

## Sources Referenced

| Document | Path | Purpose |
|----------|------|---------|
| Canonical Definition | `dossiers/stage-04/03_canonical-definition.md` | YAML extraction (lines 135-182) |
| Acceptance Checklist | `dossiers/stage-04/11_acceptance-checklist.md` | Quality scoring (90/100) |
| Gaps & Backlog | `dossiers/stage-04/10_gaps-backlog.md` | Known gaps (6 identified) |
| Professional SOP | `dossiers/stage-04/05_professional-sop.md` | Operational procedures |
| Agent Orchestration | `dossiers/stage-04/06_agent-orchestration.md` | LEAD agent mapping |
| Recursion Blueprint | `dossiers/stage-04/07_recursion-blueprint.md` | Minimal recursion support |
| Metrics & Monitoring | `dossiers/stage-04/09_metrics-monitoring.md` | 3 metrics + proposed thresholds |

---

**Dossier Summary Complete**: 2025-11-07
**Next Step**: Reality Check (compare dossier vs. actual implementation)

<!-- Generated by Claude Code | Stage 4 Review | 2025-11-07 -->
