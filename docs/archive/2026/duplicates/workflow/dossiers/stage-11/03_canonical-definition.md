---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---

## Table of Contents

- [Metadata](#metadata)
- [Field-by-Field Interpretation](#field-by-field-interpretation)
  - [Basic Attributes](#basic-attributes)
  - [Dependencies](#dependencies)
  - [Inputs (3 defined)](#inputs-3-defined)
  - [Outputs (3 defined)](#outputs-3-defined)
  - [Metrics (3 defined)](#metrics-3-defined)
  - [Entry Gates (2 defined)](#entry-gates-2-defined)
  - [Exit Gates (3 defined)](#exit-gates-3-defined)
  - [Substages (3 defined)](#substages-3-defined)
  - [Notes](#notes)
- [Gaps Identified in Canonical Definition](#gaps-identified-in-canonical-definition)

<!-- ARCHIVED: 2026-01-26T16:26:39.466Z
     Reason: Duplicate of canonical file
     Original location: docs\workflow\dossiers\stage-11\03_canonical-definition.md
     See: docs/fixes/duplicate-consolidation-manifest.json for details
-->

# Stage 11: Canonical Definition (from stages.yaml)


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, testing, unit, guide

**Source**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:461-505

**Full YAML Definition**:

```yaml
- id: 11
  title: Strategic Naming & Brand Foundation
  description: Develop strategic brand identity and naming conventions.
  depends_on:
    - 10
  inputs:
    - Market positioning
    - Brand strategy
    - Legal requirements
  outputs:
    - Brand name
    - Brand guidelines
    - Trademark search
  metrics:
    - Brand strength score
    - Trademark availability
    - Market resonance
  gates:
    entry:
      - Positioning defined
      - Market validated
    exit:
      - Name selected
      - Trademark cleared
      - Brand guidelines set
  substages:
    - id: '11.1'
      title: Name Generation
      done_when:
        - Name candidates created
        - Linguistic analysis done
    - id: '11.2'
      title: Trademark Search
      done_when:
        - Availability checked
        - Domain secured
        - Legal clearance obtained
    - id: '11.3'
      title: Brand Foundation
      done_when:
        - Brand values defined
        - Visual identity created
        - Guidelines documented
  notes:
    progression_mode: Manual → Assisted → Auto (suggested)
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:461-505 "Full Stage 11 YAML"

---

## Field-by-Field Interpretation

### Basic Attributes

**id**: `11`
- Unique identifier within 40-stage workflow
- Position: End of Ideation phase (Stages 1-10 complete)

**title**: `Strategic Naming & Brand Foundation`
- Focus: Brand identity, naming conventions, legal protection
- Scope: Both strategic (naming) and foundational (brand guidelines)

**description**: `Develop strategic brand identity and naming conventions.`
- Emphasizes dual focus: identity (who we are) + conventions (how we name things)
- Strategic: Not tactical execution, but strategic positioning

---

### Dependencies

**depends_on**: `[10]`
- Single dependency: Stage 10 (Comprehensive Technical Review)
- Rationale: Brand must align with validated technical capabilities
- Sequential execution: Cannot start until Stage 10 exits

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:464-465 "depends_on: [10]"

---

### Inputs (3 defined)

**1. Market positioning**
- What it is: Market segments, competitive landscape, value proposition
- Where it comes from: Stage 4 (Market Validation), Stage 6 (Competitive Analysis)
- Why needed: Brand must resonate with target market and differentiate from competitors

**2. Brand strategy**
- What it is: Brand personality, tone, messaging themes
- Where it comes from: Likely Stage 2 (Idea Validation), Stage 3 (Comprehensive Validation)
- Why needed: Naming and identity must express strategic brand positioning

**3. Legal requirements**
- What it is: Regulatory constraints, industry naming standards, geographic considerations
- Where it comes from: Stage 10 (Technical Review may surface compliance needs)
- Why needed: Trademark search and name selection must comply with legal boundaries

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:466-469 "inputs: Market positioning, Brand strategy, Legal"

---

### Outputs (3 defined)

**1. Brand name**
- What it is: Primary product/venture name, selected from generated candidates
- Who uses it: Stage 12 (Adaptive Naming), all downstream marketing/execution
- Quality criteria: Memorable, trademark-available, market-resonant (per metrics)

**2. Brand guidelines**
- What it is: Visual identity standards, tone of voice, usage rules
- Who uses it: Stage 12 (Adaptive Naming), Stage 13+, marketing/design teams
- Quality criteria: Complete, consistent, documented (per exit gate)

**3. Trademark search**
- What it is: Legal clearance report, domain availability, trademark registration status
- Who uses it: Legal team, Stage 12 (constraints for adaptations)
- Quality criteria: Availability checked, legal clearance obtained (per substage 11.2)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:470-473 "outputs: Brand name, Brand guidelines, Trademark"

---

### Metrics (3 defined)

**1. Brand strength score**
- Measurement: 0-100 scale (likely composite of memorability, differentiation, relevance)
- Threshold: Not defined in stages.yaml (gap identified in critique line 39)
- Purpose: Quantify brand identity effectiveness

**2. Trademark availability**
- Measurement: Boolean (available/unavailable) or risk level (clear/low/medium/high risk)
- Threshold: Must be "available" or "low risk" to pass exit gate
- Purpose: Ensure legal protection is feasible

**3. Market resonance**
- Measurement: 0-100 scale (likely from market research, focus groups)
- Threshold: Not defined in stages.yaml (gap identified in critique line 39)
- Purpose: Validate brand connects with target market

**Evidence**:
- EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:474-477 "metrics: Brand strength score, Trademark, Market resonance"
- EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-11.md:37-39 "Missing threshold values, measurement frequency"

---

### Entry Gates (2 defined)

**1. Positioning defined**
- Meaning: Market positioning input is complete and validated
- Validation: Check Stage 4/6 outputs exist and approved
- Blocker: Cannot generate brand name without clear market positioning

**2. Market validated**
- Meaning: Brand strategy input is complete and market opportunity confirmed
- Validation: Check Stage 3/4 outputs exist and approved
- Blocker: Cannot establish brand foundation without validated market

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:479-481 "entry: Positioning defined, Market validated"

---

### Exit Gates (3 defined)

**1. Name selected**
- Meaning: Brand name finalized and approved
- Validation: Brand name exists, trademark search clear, decision documented
- Blocker: Stage 12 cannot adapt name until primary name selected

**2. Trademark cleared**
- Meaning: Legal clearance obtained for selected name
- Validation: Trademark search complete, availability confirmed, domain secured (per substage 11.2)
- Blocker: Cannot proceed without legal protection

**3. Brand guidelines set**
- Meaning: Brand guidelines documented and approved
- Validation: Guidelines exist, complete (per substage 11.3 done_when), accessible to downstream stages
- Blocker: Stage 12 cannot create adaptations without guidelines

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:482-485 "exit: Name selected, Trademark cleared, Brand guidelines set"

---

### Substages (3 defined)

#### Substage 11.1: Name Generation

**done_when**:
- Name candidates created (multiple options generated)
- Linguistic analysis done (phonetics, connotations, cross-cultural implications)

**Interpretation**: This substage generates OPTIONS, not final selection. Output is candidate list with analysis.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:487-491 "11.1 Name Generation"

---

#### Substage 11.2: Trademark Search

**done_when**:
- Availability checked (trademark databases searched)
- Domain secured (domain name registered or reserved)
- Legal clearance obtained (trademark attorney approval or filing initiated)

**Interpretation**: This substage provides LEGAL PROTECTION. Must complete before name is finalized.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:492-497 "11.2 Trademark Search"

---

#### Substage 11.3: Brand Foundation

**done_when**:
- Brand values defined (core values, mission, vision related to brand)
- Visual identity created (logo, color palette, typography)
- Guidelines documented (usage rules, do's/don'ts, templates)

**Interpretation**: This substage establishes CONSISTENCY FRAMEWORK. Ensures brand is executed uniformly.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:498-503 "11.3 Brand Foundation"

---

### Notes

**progression_mode**: `Manual → Assisted → Auto (suggested)`

**Interpretation**:
- **Current state**: Manual (human-driven brand strategy, naming)
- **Near-term goal**: Assisted (AI-suggested names, automated trademark search)
- **Long-term vision**: Auto (automated brand generation with human approval)

**Implications for Implementation**:
- Phase 1: Build manual workflow (human-driven with structured process)
- Phase 2: Add AI assistance (name generation, linguistic analysis)
- Phase 3: Full automation (Chairman approves auto-generated brand packages)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:505 "progression_mode: Manual → Assisted → Auto"

---

## Gaps Identified in Canonical Definition

**Missing from stages.yaml** (documented in critique):

1. **Metric thresholds**: No threshold values for Brand strength score, Market resonance
2. **Measurement frequency**: How often metrics measured (one-time vs ongoing)
3. **Rollback procedures**: What if trademark search fails?
4. **Tool integrations**: Which trademark search tools, brand testing platforms
5. **Error handling**: What if all name candidates fail trademark search?
6. **Customer validation**: No customer touchpoint defined (UX/Customer Signal: 1/5)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-11.md:22-27, 37-45 "Weaknesses, Specific Improvements"

---

<!-- Generated by Claude Code Phase 6 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
