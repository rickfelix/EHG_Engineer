
## Table of Contents

  - [1. Gap Assessment Table](#1-gap-assessment-table)
  - [2. AnalysisStep Design](#2-analysisstep-design)
  - [3. Brand Genome Structure Decision](#3-brand-genome-structure-decision)
  - [4. Name Candidate Generation Design](#4-name-candidate-generation-design)
  - [5. Domain & Trademark: Include or Defer?](#5-domain-trademark-include-or-defer)
  - [6. Visual Identity: Include or Defer?](#6-visual-identity-include-or-defer)
  - [7. Scoring Criteria Design](#7-scoring-criteria-design)
  - [8. Stage 9 → 10 Consumption Mapping](#8-stage-9-10-consumption-mapping)
  - [9. CLI Superiorities (Preserve These)](#9-cli-superiorities-preserve-these)
  - [10. Recommended Stage 10 Schema](#10-recommended-stage-10-schema)
  - [11. Minimum Viable Change (Priority Ordered)](#11-minimum-viable-change-priority-ordered)
  - [12. Cross-Stage Impact](#12-cross-stage-impact)
  - [13. Dependency Conflicts](#13-dependency-conflicts)
  - [14. Contrarian Take](#14-contrarian-take)

---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Stage 10 "Naming / Brand" -- AntiGravity Response

> Independent response to the Stage 10 triangulation prompt.
> Respondent: AntiGravity (Google Gemini)
> Date: 2026-02-11

### 1. Gap Assessment Table

| Gap | GUI Has | CLI Has | Importance (1-5) | Downstream Impact | Verdict | Challenge |
|-----|---------|---------|:-----------------:|-------------------|---------|-----------|
| Narrative Depth | Rich Vision, Mission, Voice, Strategic Narrative | Sparse brandGenome (archetype, values, tone, audience) | **5 Critical** | High. GTM (Stage 11) needs a narrative, not just keywords. | CLOSE | Is "Narrative" distinct from "Genome"? Yes. Genome is DNA; Narrative is expression. |
| Domain/TM Checks | domain_availability, trademark_status fields | None | **5 Critical** | Fatal. A name with a trademark conflict is a lawsuit, not an asset. | CLOSE | Automatic checking is hard in CLI. Schema must at least support storing the status (manual/AI-verified). |
| Visual Identity | 5 "Cultural Styles" with color palettes | None | **3 Medium** | Medium. Helps GTM, but "Naming" can exist without "Logo". | DEFER | Defer deep design to Stage 14/15 (Blueprint). Keep high-level "Visual Direction" only. |
| Technical Review | Architecture, Security, Scalability checks | None | **1 Cosmetic** | None (positive). Belongs in Stage 14. | IGNORE | Correctly identified as out-of-scope for Identity phase. |
| Decision Gate | Advance/Revise/Reject | Ranking only | **4 High** | High. Need a hard stop if all names are unavailable/bad. | ADOPT | CLI needs a "Decision" field, not just a list. |
| Structured Scoring | Predefined metrics (availability, etc.) | Fully custom scoringCriteria | **3 Medium** | Medium. Custom is flexible but inconsistent. | HYBRID | Enforce core metrics (Domain/TM) + allow custom ones. |

### 2. AnalysisStep Design

The analysisStep is the engine that bridges the "Engine" phase (Stages 6-9) to the "Identity" phase (Stage 10).

**Inputs (Context)**:
- **Stage 1** (Idea/Truth): Problem statement, high-level solution (core identity).
- **Stage 4** (Competitors): Competitive names and positioning (to ensure differentiation).
- **Stage 7** (Pricing/Value): Value metrics (what are we actually selling?).
- **Stage 9** (Exit Strategy):
  - exit_thesis (Long-term vision).
  - target_acquirers (Brand must appeal to these buyers).
  - buyer_type (Strategic vs PE vs Public determines "Corporate" vs "Disruptive" tone).

**Process (LLM Prompts)**:
1. **Synthesize Brand Genome**: Extract Archetype and Tone from the intersection of Solution (Stage 1) and Buyer Expectations (Stage 9).
2. **Draft Narrative**: Generate Vision and Mission statements based on the Exit Thesis (Stage 9).
3. **Generate Candidates**: Create 20+ names, filter to top 5-7 based on: availability heuristic, semantic fit with Genome, differentiation from Stage 4 competitors.
4. **Score Candidates**: Evaluate against scoringCriteria.

**Outputs**:
- `brandNodes`: Extended Genome + Narrative.
- `candidates`: List of names with rationale and preliminary scores.
- `recommended_criteria`: Weights tailored to the industry (e.g., B2B = Trust > Viral potential).

### 3. Brand Genome Structure Decision

The current CLI brandGenome is too flat. It mixes "DNA" (archetype) with "Expression" (tone) and misses "Purpose" (Mission/Vision).

**Decision**: Split brandGenome into logical subgroups. Recommended Structure:

- **Identity (DNA)**: archetype (The Ruler, The Magician, etc.), values (List).
- **Purpose (North Star)**: vision_statement (Future state), mission_statement (Action now).
- **Expression (Voice)**: tone (Adjectives), voice_guidelines (Do's/Don'ts), key_messages (Taglines).
- **Market (Position)**: audience (Persona), differentiators (Vs competitors).

### 4. Name Candidate Generation Design

**Quantity**: Generate 10 candidates, curate to top 5.

**Metadata required per candidate**:
- `name`: The name.
- `rationale`: Why this fits the Genome.
- `origin`: Etymology/Construction (e.g., "Compound", "Abstract", "Misspelling").
- `risks`: Potential negative connotations.
- `domain_status`: (Placeholder for 'Check Required' or AI-estimated availability).
- `trademark_status`: (Placeholder).

### 5. Domain & Trademark: Include or Defer?

**Verdict**: INCLUDE as Schema, DEFER as Automated Check.

We cannot reliably check domains/trademarks in a pure text-generation step without external tool calls (WHOIS/USPTO). However, the schema must exist so the user (or a future tool) can record the result.

**Implementation**:
- Add `availability` object to candidate:
  - `domain`: { status: 'unknown' | 'available' | 'taken', tld: '.com' }
  - `trademark`: { status: 'unknown' | 'clear' | 'conflict', risk_level: 'low' | 'high' }
- **Analysis Step Behavior**: The LLM should self-critique: "Likely taken" vs "Invented word (Likely available)".

### 6. Visual Identity: Include or Defer?

**Verdict**: INCLUDE High-Level Direction Only.

Full "Cultural Styles" (palettes, fonts) is too detailed for a CLI text interface and belongs in "Blueprint". However, "Naming" often relies on "Vibe".

**Compromise**: Add `visual_direction` string or object to brandGenome.
- Example: "Minimalist, Swiss typing, cool blues, stark contrast."
- No rigorous hex codes or font files yet.

### 7. Scoring Criteria Design

**Hybrid Approach**:
- **Mandatory Criteria** (System-defined, Implicit weights): Validity (Domain/TM). A name with TM conflict is a 0.
- **User/AI Criteria** (Explicit weights): Memorability, Relevance, Sound/Phonetics, Global_Appeal.

The CLI `scoringCriteria` array is good for the qualitative fit. Keep it.

### 8. Stage 9 → 10 Consumption Mapping

**Critical Linkage -- Exit Strategy as Brand Editor**:
- If Target Acquirer = Oracle/Salesforce (Strategic, conservative): Brand must sound "Enterprise-ready", "Scalable", "Safe".
- If Target Acquirer = Google/Facebook (Tech, innovative): Brand can be "Quirky", "Disruptive".
- If Exit = IPO: Brand needs mass-market appeal foundation.

**Mechanism**: The analysisStep prompt must explicitly condition the Tone and Naming Style on the `target_acquirers` list from Stage 9.

### 9. CLI Superiorities (Preserve These)

- **Separation of Concerns**: The CLI correctly excludes "Technical Review" from Stage 10. This is a massive architectural win.
- **Weighted Scoring**: The flexible weights allow tuning for different venture types (e.g., B2C cares about "Viral", B2B cares about "Trust").
- **Simple Ranking**: Sorting by weighted score is transparent.

### 10. Recommended Stage 10 Schema

```javascript
schema: {
  // Enhanced Brand Genome
  brandIdentity: {
    type: 'object',
    fields: {
      archetype: { type: 'string' },
      values: { type: 'array' },
      vision_statement: { type: 'string', minLength: 20 },
      mission_statement: { type: 'string', minLength: 20 },
      tone_voice: { type: 'string' },
      audience_persona: { type: 'string' },
      tagline: { type: 'string' }
    }
  },

  // Scoring definition
  scoringCriteria: {
    type: 'array',
    items: { name: 'string', weight: 'number', description: 'string' }
  },

  // Candidates
  candidates: {
    type: 'array',
    minItems: 5,
    items: {
      name: { type: 'string' },
      rationale: { type: 'string' },
      origin: { type: 'string' },
      availability: {
        type: 'object',
        fields: {
          domain_check: { type: 'string', enum: ['checked', 'unchecked', 'failed'] },
          trademark_check: { type: 'string', enum: ['checked', 'unchecked', 'failed'] },
          notes: { type: 'string' }
        }
      },
      scores: { type: 'object' },
      weighted_score: { type: 'number', derived: true }
    }
  },

  // Decision (New)
  decision: {
    type: 'object',
    fields: {
      selected_candidate_name: { type: 'string' },
      status: { type: 'string', enum: ['approved', 'revise', 'pending'] },
      rationale: { type: 'string' }
    }
  }
}
```

### 11. Minimum Viable Change (Priority Ordered)

1. Add `vision_statement` and `mission_statement` to brandGenome (or new brandIdentity object). This closes the "Narrative" gap.
2. Add `availability` fields to candidates. Even if manual, the slot must exist.
3. Add `decision` object. Ranking isn't enough; we need to pick one to likely use in Stage 11.
4. Implement `analysisStep`. Prompt engineering to synthesize Stage 9 exit context into Brand Tone.

### 12. Cross-Stage Impact

- **Stage 11 (GTM)**: Will fail if it doesn't receive a `selected_candidate_name` and `mission_statement`. It cannot market "Candidate #1". It needs "Acme Corp".
- **Stage 14 (Tech Arch)**: Must pick up the "Technical Review" responsibilities dropped from GUI Stage 10.

### 13. Dependency Conflicts

- **Stage 1 (Idea)**: CLI Stage 1 is "Draft Idea". It might be too sparse to inform Brand Archetype if key assumptions aren't solid. **Mitigation**: Ensure Stage 1 has at least "Problem/Solution" clearly defined.
- **Stage 9 (Exit)**: If Stage 9 was skipped or purely financial (no "Buyer Types"), Stage 10 loses its strategic anchor. **Check**: Ensure Stage 9 evaluation or reality_gate is passed before entering 10.

### 14. Contrarian Take

**"The Name Doesn't Matter Yet."**

**Argument**: In early validation (Identity phase), you might pivot 5 times. Spending tokens/time generating 5 names and checking trademarks is waste.

**Counter-Proposal**: Stage 10 should identify the Brand Soul (Archetype/Values) and a Placeholder Name (Project X). Real naming happens in Stage 13 (Blueprint) after GTM tests.

**Refutal**: This is "The Identity" phase. You can't do GTM (Stage 11) or Sales (Stage 12) without a name. Even if it changes, you need a handle to grasp the identity. The process of naming forces you to clarify the identity.

**Verdict**: Keep it in Stage 10, but allow for "Working Title" decision status.
