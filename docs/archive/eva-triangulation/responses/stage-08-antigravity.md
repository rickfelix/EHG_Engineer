---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Stage 8 "Business Model Canvas" -- AntiGravity Response

> Independent response to the Stage 8 triangulation prompt.
> Respondent: AntiGravity (Google Gemini)
> Date: 2026-02-11

### 1. Gap Assessment Table

| Gap | GUI Has | CLI Has | Importance (1-5) | Downstream Impact | Verdict | Challenge |
|-----|---------|---------|:-----------------:|-------------------|---------|-----------|
| BMC Generation | None (Manual) | None (Manual) | **5 Critical** | High (Quality varied, high friction) | Add AI Gen | Neither has it, but CLI must have it to be "self-sufficient" and reduce drudgery. |
| Item Structure | string[] | text, priority, evidence | **4 High** | High (Stage 9 Exit Strategy needs priority/evidence) | Keep CLI | CLI schema is strictly better for identifying "Key" partners/resources vs trivial ones. |
| Completeness | 0-100% score | Pass/Fail check | **2 Low** | Low (Binary "is it done?" is sufficient for artifact stages) | Ignore | CLI's minItems validation serves the same purpose. Complex scoring is overkill here. |
| Recommendations | Real-time | None | **3 Medium** | Medium (Quality assurance) | Add Critique | "Real-time" is hard in CLI, but a post-generation "Critique" step (like Stage 2) is valuable. |
| Prior Stage Data | Passed (unused) | Static Cross-links | **5 Critical** | High (Disconnects BMC from Stages 1-7 Reality) | Consume | BMC must be the synthesis of previous stages, not a restart. |
| Guiding Prompts | 2-4 questions/block | None | **3 Medium** | Low (If AI generates draft, prompts are less critical for user) | Integrate | Use the GUI's questions as part of the AI analysisStep system instruction. |
| Min Items | 1-2 | 2 (1 for Partnerships) | **2 Low** | Low | Keep CLI | 2 items is a reasonable minimum for a robust model. |
| Cross-links | Dynamic Validation | Static Arrays | **3 Medium** | Medium | Hybrid | Use static links for navigation/context, but use AI to validate the alignment. |

### 2. BMC Generation Recommendation

**Recommendation: Implement `analysisStep` (Generation-First Workflow)**

Stage 8 should verify the "End of the Engine" phase by synthesizing all previous work.

- **Input**: Stage 1 (Concept), Stage 4 (Competitors), Stage 6 (Risks), Stage 7 (Pricing).
- **Process**: AI maps these inputs to the 9 BMC blocks.
  - Example: Maps "Stage 6 Risks" to "Cost Structure" (mitigation costs) and "Key Activities" (risk management).
  - Example: Maps "Stage 7 Pricing Tiers" directly to "Revenue Streams".
- **Output**: A fully populated draft BMC. The user then reviews and edits rather than starting from blank.

### 3. Item Structure Decision (priority + evidence)

**Decision: Preserve CLI Formatting (text + priority + evidence)**

- As we move to Stage 9 (Exit Strategy), knowing which partnerships are Priority 1 vs Priority 3 is critical for valuation.
- Evidence allows the user to link a BMC claim back to a specific Stage 4 competitor feature ("We do X better") or Stage 6 risk.
- **Action**: Do not degrade to string arrays.

### 4. Completeness Scoring Decision

**Decision: Stick to Pass/Fail via minItems validation.**

- A 56% vs 62% score in a BMC is largely subjective and vanity capability.
- **Modification**: Can add a "Health Check" in the analysis step that warns if a block is generic, but no numeric score needed.

### 5. Prior Stage Consumption Strategy

The CLI `analysisStep` must explicitly request the following mappings:

| BMC Block | Source Stage | Data Consumed |
|-----------|-------------|---------------|
| Value Propositions | Stage 1 Value Prop + Stage 4 Feature Advantages | Venture differentiation |
| Customer Segments | Stage 1 Target Audience + Stage 5 Market Size | Who we serve |
| Revenue Streams | Stage 7 Pricing Model & Tiers | How we earn money |
| Cost Structure | Stage 7 Unit Economics + Stage 6 Risk Mitigations | What we spend |
| Key Resources/Activities | Stage 1 Solution implementation needs | What we need and do |
| Channels | Stage 5 Acquisition Channels | How we reach customers |
| Key Partnerships | Stage 6 External Dependencies/Risks | Who we need |

### 6. Recommendations/Validation Design

Instead of real-time suggestions (GUI style), the CLI should use a **Post-Generation Critique**.

After generating the draft, the AI runs a consistency check:
- "Do your Revenue Streams match your Customer Segments?"
- "Do your Key Activities actually deliver the Value Propositions?"

These specific checks (which GUI likely logic-coded) can be prompt-engineered into the `analysisStep` or a secondary review command.

### 7. CLI Superiorities (preserve these)

- **Strict Schema**: The priority field is a forcing function for strategic thinking that the GUI lacks.
- **Evidence Field**: Enforces intellectual honesty.
- **Validation Logic**: The `stage-08.js` manual validation is clean and robust.

### 8. Recommended Stage 8 Schema

No change to structure, but add `analysisStep`.

```javascript
const TEMPLATE = {
  // ... existing fields
  analysisStep: {
    id: 'bmc-generation',
    type: 'generation',
    description: 'Synthesizing Business Model Canvas from Stages 1-7...',
    inputs: [
      { stage: 'stage-01', field: 'summary' },
      { stage: 'stage-04', field: 'competitors' },
      { stage: 'stage-06', field: 'risks' },
      { stage: 'stage-07', field: 'pricing' }
    ],
    prompt: `
      Act as a Venture Capital Strategist.
      Synthesize a Business Model Canvas from the provided venture data.

      MAPPING RULES:
      - Revenue Streams: Must strictly reflect the Stage 7 Pricing Model.
      - Cost Structure: Must include costs for Stage 6 Risk Mitigations.
      - Value Props: Must highlight advantages over Stage 4 Competitors.

      For each item, assign a priority (1=Critical, 2=Major, 3=Support).
      Provide 'evidence' linking back to source data where possible.
    `
  }
};
```

### 9. Minimum Viable Change

1. Modify `lib/eva/stage-templates/stage-08.js`:
   - Add `analysisStep` property.
   - Write the prompt to consume Stage 1, 4, 6, 7 data.

That's it. The schema is already good. The validation is good. The lack of "AI Autocomplete" is the only functional gap that matters for a CLI workflow.

### 10. Cross-Stage Impact

- **Stage 9 (Exit Strategy)**: Will receive structured, prioritized assets.
  - Benefit: Can automatically identify "Acquisition Targets" (Key Partners) or "IP Value" (Key Resources).
- **Stage 7 (Pricing)**: Feedback loop. If BMC "Revenue Streams" don't match Stage 7 "Tiers", user realizes a disconnect.
