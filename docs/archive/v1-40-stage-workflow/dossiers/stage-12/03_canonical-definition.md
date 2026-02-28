---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Stage 12: Canonical Definition (YAML Source)


## Table of Contents

- [Source Reference](#source-reference)
- [Complete YAML Definition](#complete-yaml-definition)
- [Field-by-Field Analysis](#field-by-field-analysis)
  - [Core Identification](#core-identification)
  - [Dependencies](#dependencies)
  - [Inputs (3)](#inputs-3)
  - [Outputs (3)](#outputs-3)
  - [Metrics (3)](#metrics-3)
  - [Entry Gates (2)](#entry-gates-2)
  - [Exit Gates (3)](#exit-gates-3)
  - [Substages (3)](#substages-3)
  - [Notes](#notes)
- [Schema Validation Notes](#schema-validation-notes)
  - [Compliance Checks](#compliance-checks)
  - [Gaps vs. Schema](#gaps-vs-schema)
- [Interpretation Guidelines](#interpretation-guidelines)
  - [For PLAN Phase](#for-plan-phase)
  - [For EXEC Phase](#for-exec-phase)
  - [For Automation](#for-automation)
- [Change Control](#change-control)

## Source Reference

**File**: `docs/workflow/stages.yaml`
**Lines**: 506-550
**Commit**: EHG_Engineer@6ef8cf4
**Authority**: SINGLE SOURCE OF TRUTH for Stage 12 specification

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:506-550 "id: 12...progression_mode: Manual → Assisted"

---

## Complete YAML Definition

```yaml
- id: 12
  title: Adaptive Naming Module
  description: Optimize naming for different markets and contexts.
  depends_on:
    - 11
  inputs:
    - Primary brand name
    - Market segments
    - Cultural factors
  outputs:
    - Name variations
    - Market adaptations
    - Localization guide
  metrics:
    - Adaptation coverage
    - Cultural fit score
    - Market acceptance
  gates:
    entry:
      - Primary name selected
      - Markets identified
    exit:
      - Variations approved
      - Localizations complete
      - Guidelines updated
  substages:
    - id: '12.1'
      title: Market Analysis
      done_when:
        - Target markets mapped
        - Cultural factors assessed
    - id: '12.2'
      title: Name Adaptation
      done_when:
        - Variations created
        - Translations verified
        - Phonetics validated
    - id: '12.3'
      title: Testing & Validation
      done_when:
        - Market testing complete
        - Feedback incorporated
        - Final selections made
  notes:
    progression_mode: Manual → Assisted → Auto (suggested)
```

---

## Field-by-Field Analysis

### Core Identification
- **id**: `12` (integer)
- **title**: "Adaptive Naming Module" (24 chars)
- **description**: "Optimize naming for different markets and contexts." (51 chars)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:506-508 "id: 12...different markets and contexts"

### Dependencies
- **depends_on**: `[11]` (single upstream dependency)
- **Interpretation**: CANNOT start until Stage 11 (Strategic Naming) completes
- **Type**: Hard dependency (blocking)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:509-510 "depends_on:...11"

### Inputs (3)
1. **Primary brand name**: The finalized name from Stage 11
2. **Market segments**: Geographic/demographic target markets
3. **Cultural factors**: Language, customs, sensitivities per market

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:511-514 "inputs:...Cultural factors"

**Data Types** (inferred):
- Primary brand name: String (single value)
- Market segments: Array[String] (list of markets)
- Cultural factors: Object/JSON (structured market data)

### Outputs (3)
1. **Name variations**: Market-specific name alternatives
2. **Market adaptations**: Localized brand names
3. **Localization guide**: Documentation of adaptation rules

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:515-518 "outputs:...Localization guide"

**Data Types** (inferred):
- Name variations: Array[Object] (name + market)
- Market adaptations: Array[Object] (translation + validation)
- Localization guide: Document/Markdown (implementation docs)

### Metrics (3)
1. **Adaptation coverage**: % of target markets with validated names
2. **Cultural fit score**: Cultural appropriateness rating (0-100?)
3. **Market acceptance**: Audience reception metrics (survey/testing)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:519-522 "metrics:...Market acceptance"

**Gap**: No threshold values, measurement frequency, or scoring formulas defined.

### Entry Gates (2)
1. **Primary name selected**: Stage 11 exit gate passed
2. **Markets identified**: Target market list defined

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:524-526 "entry:...Markets identified"

**Validation Logic** (inferred):
- Gate 1: `stage_11.status === 'complete' && stage_11.exit_gates.all_passed`
- Gate 2: `target_markets.length > 0 && target_markets.all(m => m.validated)`

### Exit Gates (3)
1. **Variations approved**: All market adaptations validated
2. **Localizations complete**: Translations finalized and verified
3. **Guidelines updated**: Documentation published/accessible

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:527-530 "exit:...Guidelines updated"

**Validation Logic** (inferred):
- Gate 1: `name_variations.all(v => v.status === 'approved')`
- Gate 2: `localizations.all(l => l.translation_verified && l.phonetics_validated)`
- Gate 3: `localization_guide.published === true`

### Substages (3)

#### Substage 12.1: Market Analysis
- **ID**: '12.1' (string, not integer)
- **Title**: "Market Analysis"
- **Done When**:
  - Target markets mapped
  - Cultural factors assessed

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:532-536 "Market Analysis...Cultural factors assessed"

**Deliverables** (inferred):
- Market mapping document (target regions + demographics)
- Cultural assessment report (sensitivities, phonetics, connotations)

#### Substage 12.2: Name Adaptation
- **ID**: '12.2'
- **Title**: "Name Adaptation"
- **Done When**:
  - Variations created
  - Translations verified
  - Phonetics validated

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:537-542 "Name Adaptation...Phonetics validated"

**Deliverables** (inferred):
- Name variations database (per-market alternatives)
- Translation verification report
- Phonetic validation checklist

#### Substage 12.3: Testing & Validation
- **ID**: '12.3'
- **Title**: "Testing & Validation"
- **Done When**:
  - Market testing complete
  - Feedback incorporated
  - Final selections made

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:543-548 "Testing & Validation...Final selections made"

**Deliverables** (inferred):
- Market testing results (survey data, focus groups)
- Feedback incorporation log
- Final selection recommendations

### Notes
- **progression_mode**: "Manual → Assisted → Auto (suggested)"
- **Interpretation**: Stage can evolve from manual execution to automated workflows

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:550 "progression_mode: Manual → Assisted → Auto"

---

## Schema Validation Notes

### Compliance Checks
- ✅ **id**: Present and unique (12)
- ✅ **title**: Present and descriptive
- ✅ **depends_on**: Array format (single dependency)
- ✅ **inputs**: Array[String] (3 items)
- ✅ **outputs**: Array[String] (3 items)
- ✅ **metrics**: Array[String] (3 items)
- ✅ **gates**: Object with entry/exit arrays
- ✅ **substages**: Array[Object] with id/title/done_when

### Gaps vs. Schema
- ⚠️ **owner**: Not present (inferred as PLAN from critique)
- ⚠️ **metrics thresholds**: Not defined (scoring formulas missing)
- ⚠️ **tool integrations**: Not specified (translation APIs, etc.)
- ⚠️ **rollback procedures**: Not documented
- ⚠️ **error handling**: Not specified

**Gap Documentation**: See File 10 (Gaps & Backlog) for complete list.

---

## Interpretation Guidelines

### For PLAN Phase
When creating PRD for Stage 12 implementation:
1. Use this YAML as **requirements specification**
2. Define concrete metric thresholds (e.g., "Cultural fit score ≥ 80")
3. Specify data schemas for inputs/outputs
4. Map substages to user stories
5. Define rollback triggers (e.g., "If cultural fit < 60, return to Stage 11")

### For EXEC Phase
When implementing Stage 12:
1. Validate ALL entry gates before starting
2. Track substage completion (12.1 → 12.2 → 12.3)
3. Measure ALL three metrics continuously
4. Block exit until ALL exit gates pass
5. Publish localization guide as final deliverable

### For Automation
When building automated Stage 12 workflows:
1. Integrate translation APIs (e.g., Google Translate, DeepL)
2. Connect cultural databases (e.g., Hofstede Insights)
3. Automate phonetic validation (IPA transcription)
4. Build market testing dashboards
5. Generate localization guide programmatically

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:550 "progression_mode: Manual → Assisted → Auto"

---

## Change Control

**This YAML definition is IMMUTABLE for current implementation.**

To propose changes:
1. Create Strategic Directive (SD)
2. Update `stages.yaml` via approved PR
3. Regenerate dossier with new YAML
4. Version dossier (e.g., `stage-12-v2/`)

**Current Version**: v1.0 (initial from stages.yaml)

---

<!-- Generated by Claude Code Phase 6 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
