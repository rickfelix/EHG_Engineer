---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Stage 12 "Sales Logic" -- AntiGravity Response (Google Gemini)

Stage 12 Sales Logic - Gap Analysis
1. Gap Assessment Table
Gap    GUI Has    CLI Has    Importance (1-5)    Downstream Impact    Verdict    Challenge
Sales Model    Implicit / None    Explicit 6-option Enum    5 (Critical)    Defines the entire engine structure (product vs sales led)    Keep CLI    Does a rigid enum restrict hybrid models? CLI includes 'hybrid' option.
Metrics Location    Explicit LTV, CAC, Deal Size fields    Derived or missing (assumed upstream)    4 (High)    Loss of visibility at the "Sales" stage    Add to CLI    Stage 5 has LTV/CAC. Redefining here risks data drift. Better to display inherited values than store new ones.
Conversion Rates    Per-stage %, time-in-stage    Funnel target values only    5 (Critical)    Cannot model funnel velocity or volume requirements    Add to CLI    Can we derive conversion from target values (Step N / Step N-1)? Yes, but explicit rates allows for "goal seeking" logic.
Journey Triggers    Trigger Action + Success Criteria    Touchpoint only    3 (Medium)    Vague customer journey steps (what moves them?)    Add Trigger    Is "Touchpoint" enough? A touchpoint is where, a trigger is what. Distinct enough to warrant a field.
Stage Separation    Merged Pipeline Stages (actions + metrics)    Separated Deal (workflow) vs Funnel (metrics)    4 (High)    Confusion vs precision    Keep CLI Split    Merged is easier for UI, but separate is better for data. A "Lead" (funnel metric) might map to "New" + "Contacted" (deal stages).
Success Metrics    Owner per metric    No owner    2 (Low)    Accountability gaps    Ignore    At "Identity" phase (pre-team), assigning owners is premature optimization.
2. AnalysisStep Design
Objective: To synthesize a sales strategy that bridges "Who we are" (Identity) to "What we build" (Blueprint).

Input Data:

Stage 11 (GTM):
channels (e.g. "Direct Sales" implies high touch).
tiers (Target Personas).
Stage 7 (Pricing):
arpa (Average Revenue Per Account).
pricing_model (Consensus item: 6-model enum).
Stage 5 (Profitability):
target_revenue.
Stage 10 (Naming/Brand):
brand_voice (Tones the stage names).
Algorithm:

Determine Sales Model: Apply "Price vs Complexity" logic.
Draft Deal Stages: Map Sales Model to standard templates (e.g. Enterprise = Discovery->Demo->POC->Contract).
Calculate Funnel Targets: Start with Stage 5 target_revenue and work backward using industry standard conversion rates for the selected Sales Model.
Output Schema:

sales_model: "inside-sales" | "self-serve" | etc.
deal_stages: Array of proposed stages.
funnel_stages: Array with target_value calculated from revenue goals.
customer_journey: Steps mapping the "Happy Path".
3. Sales Model Selection Logic
The LLM should select the sales_model based on a prioritized rule set:

Force "Marketplace": If Stage 1 Business Model is Marketplace.
Force "Channel": If Stage 11 channels contains >50% budget allocated to "Partnerships" or "Resellers".
Price Thresholds (using Stage 7 arpa):
Self-Serve: ARPA < $500/yr.
Inside-Sales: ARPA $500 - $15,000/yr.
Enterprise: ARPA > $15,000/yr.
Hybrid Fallback: If signals are mixed (e.g. Low ARPA but "Direct Sales" channel), default to Hybrid.
4. Deal Stages vs Funnel Stages Decision
Decision: Maintain CLI's Separation (Deal Stages ≠ Funnel Stages).

Rationale:

Deal Stages are workflow states for a CRM (e.g. "Drafting Contract", "Negotiating", "Waiting for Sign"). They measure Time.
Funnel Stages are analytical milestones for a Dashboard (e.g. "MQL", "SQL", "Closed Won"). They measure Volume.
The Relationship: MQL (Funnel) -> [Discovery, Demo] (Deal Stages) -> SQL (Funnel).
Merging them creates a "Frankenstein" stage that tries to do too much.
Refinement: Add mapped_funnel_stage to deal_stages schema to enforce traceability.

5. Conversion Rates Decision
Decision: Add conversion_rate_estimate to funnel_stages.

Rationale:

Current CLI target_value (absolute number) is fragile. If top-of-funnel changes, all targets need manual recalculation.
Storing rates allows dynamic calculation: Stage N Target = Stage N-1 Target * Rate.
It enables "Reality Check" logic: "Is 50% conversion from Visit to Trial realistic?" (No).
6. Sales Metrics Decision
Decision: Do NOT add LTV/CAC/Deal Size fields to Stage 12 Schema.

Rationale:

LTV & CAC belong to Stage 5 (Profitability) and Stage 11 (GTM). Re-asking for them creates a "Split Brain" problem where Stage 5 says $500 and Stage 12 says $600.
Deal Size belongs to Stage 7 (Pricing).
Sales Cycle IS unique to Stage 12 and should remain.
Implementation: The analysisStep should read LTV/CAC from Stage 5/11 and use them to validate the funnel targets, but the stage shouldn't own the data.

7. Customer Journey Design
Decision: Enhance CLI to include trigger and exit_criteria.

Rationale:

Current: step, funnel_stage, touchpoint.
Gap: It describes where the user is, but not how they advance.
Fix: Add trigger (User action or System event) and exit_criteria (What defines completion?).
This bridges the gap to the Blueprint phase (Stage 13 Product Roadmap) by defining feature requirements (the triggers).
8. Reality Gate Enhancement
Current: Checks counts (4 funnel stages, 5 journey steps). Proposed Enhancement:

Coherence Check: deal_stages must map to funnel_stages.
Velocity Check: sales_cycle_days must match sum of deal_stages.avg_duration.
Economy Check (The "Business Reality" Gate):
Funnel Top Volume (Stage 11) * Conversion Rates (Stage 12) * Price (Stage 7) must >= Revenue Target (Stage 5).
If this check fails, the Venture Identity is mathematically invalid.
9. CLI Superiorities (Preserve these)
Sales Model Enum: Forces a strategic choice rather than implicit assumptions.
Separation of Concerns: Funnel (Math) vs Pipeline (Workflow) vs Journey (Experience).
Schema Validation: Strict typing on inputs.
10. Recommended Stage 12 Schema
javascript
schema: {
  sales_model: { type: 'enum', values: SALES_MODELS, required: true },
  sales_cycle_days: { type: 'number', min: 1, required: true },
  deal_stages: {
    type: 'array',
    items: {
      name: { type: 'string' },
      description: { type: 'string' },
      avg_duration_days: { type: 'number' },
      mapped_funnel_stage: { type: 'string' } // NEW: Link to funnel
    }
  },
  funnel_stages: {
    type: 'array',
    items: {
      name: { type: 'string' },
      metric: { type: 'string' },
      target_value: { type: 'number' },
      conversion_rate_estimate: { type: 'number', min: 0, max: 1 } // NEW
    }
  },
  customer_journey: {
    items: {
      step: { type: 'string' },
      funnel_stage: { type: 'string' },
      touchpoint: { type: 'string' },
      trigger: { type: 'string' }, // NEW
      exit_criteria: { type: 'string' } // NEW
    }
  }
}
11. Minimum Viable Change (Prioritized)
Integrate Data in AnalysisStep: Ensure the LLM prompt injects Stage 5, 7, and 11 data. Without this, Stage 12 is a hallucination.
Add conversion_rate_estimate: Essential for the Reality Gate economy check.
Implement 
evaluateRealityGate
 expansions: Add the "Economy Check" logic.
12. Cross-Stage Impact
Stage 13 (Product Roadmap): Will consume customer_journey -> trigger fields. A journey step "Sign up" with trigger "Click CTA" becomes a Feature "Sign Up Flow" in Stage 13.
Stage 5 (Profitability): Feedback loop. If Stage 12 funnel metrics show we can't hit Stage 5 revenue targets without unrealistic conversion rates (e.g. 50%), Stage 5 fails.
13. Dependency Conflicts
Stage 7 (Pricing): Stage 12 relies on the pricing_model enum being present in Stage 7 data (as per Consensus), but the current CLI template for Stage 7 doesn't show it. Action: Ensure Stage 7 Gap Analysis implementation includes adding pricing_model.
Stage 11 (GTM): If Stage 11 defines "Low Volume" channels but Stage 12 defines a "Freemium" model (requiring high volume), we have a conflict. Action: Add Volume/Model Mismatch warning to Reality Gate.
14. Contrarian Take
Argument: Kill "Deal Stages" entirely. Reasoning: At the Identity phase (Stage 12), defining CRM workflow steps ("Negotiation", "Contract Sent") is premature optimization. We don't even have a product yet (Blueprint starts next stage). Risk: We build a rigid sales process for a theoretical product. Proposal: Collapse deal_stages and funnel_stages into a single lifecycle_stages list that includes both "Metric" and "Workflow" properties. This simplifies the mental model for the user at this early stage. Counter-Counter: Identifying the length and complexity of the sales cycle (via deal stages) is crucial for the "Identity" of the venture. A 3-day cycle vs 9-month cycle defines the company DNA. We must keep it.