---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Stage 13 "Product Roadmap" -- AntiGravity Response (Google Gemini)

> Independent response to the Stage 13 triangulation prompt.
> Respondent: AntiGravity (Google Gemini)
> Date: 2026-02-11

### 1. Gap Assessment Table

| Gap | GUI (Planned/Implied) | CLI (Current) | Importance (1-5) | Downstream Impact | Verdict | Challenge |
|-----|----------------------|---------------|:-----------------:|-------------------|---------|-----------:|
| Analysis Step | Would generate roadmap from specs | None (User input only) | **5 Critical** | High. Users start with a blank page instead of a draft based on 12 stages of context. | ADD | Essential for the "Magic" of the tool. |
| Milestone Typing | Meta-data rich (Epic/Story/Task) | Basic name + date + deliverables (strings) | **3 Medium** | Medium. Stage 14 (Arch) needs to know if a deliverable is "App Feature" vs "Infra". | ENHANCE | Don't over-engineer. Just add type and priority. |
| Prioritization | RICE/MoSCoW scoring | None (Flat list) | **3 Medium** | Low. Ordering by date is sufficient for a Roadmap. Prioritization is for Backlogs. | SKIP | Keep it simple. Date is priority in a roadmap. |
| Dependency Graph | Visual GANTT / DAG | Flat dependencies array | **2 Low** | Low. Visualizing dependencies is a UI problem. Storing them as strings is fine. | KEEP | Flat array is sufficient for schema. |
| Sales Alignment | Explicit check (Enterprise = SSO) | None | **4 High** | High. Risk of building a Self-Serve product for an Enterprise sales model. | ADD | Critical for Blueprint integrity. |
| Kill Gate Logic | "Review Board" approval | Deterministic (count < 3, timeline < 3m) | **4 High** | High. Current gate is too easy to game with dummy data. | ENHANCE | Add content checks. |
| Resource Est. | Staffing/Cost calc | None | **2 Low** | Low. Stage 15 is Financials/Resources. Keep strict separation. | SKIP | Defer to Stage 15/16. |

### 2. AnalysisStep Design

**Goal**: Generate a draft Product Roadmap based on the "Identity" (Stages 10-12) and "Engine" (Stages 6-9).

**Inputs**:
- stage1.problemStatement: What are we solving? (Context)
- stage3.metrics: What validates the business? (KPIs to instrument)
- stage11.gtm_strategy: Tiers & Channels (Features needed to support GTM)
- stage12.sales_model & customer_journey: (e.g., "Free Trial" requires "Automated Onboarding")
- stage12.reality_gate: (Scope confirmation)

**Processing**:
1. Extract Key Themes: Map value props + pain points to "Feature Sets".
2. Infer Mandatory Features:
   - If sales_model == 'enterprise' -> Add 'SSO', 'Audit Logs', 'RBAC'.
   - If sales_model == 'self-serve' -> Add 'Stripe Integration', 'Self-Onboarding'.
   - If gtm.channels includes 'SEO' -> Add 'Blog/Content CMS'.
3. Sequence Milestones:
   - Milestone 1 (MVP): Core value prop + Critical validation metrics (Stage 3).
   - Milestone 2 (Growth): GTM enablers (Stage 11) + Sales optimizations (Stage 12).
   - Milestone 3 (Scale): Operational maturity.

**Outputs**:
```javascript
{
  "suggested_vision": "String",
  "suggested_phases": [{ "name": "MVP", "focus": "Validation" }],
  "suggested_milestones": [{
    "name": "Alpha Release",
    "rationale": "Validates core problem hypothesis",
    "suggested_deliverables": ["Core Feature X", "User Auth", "Basic Analytics"]
  }]
}
```

### 3. Milestone Structure Decision

Keep deliverables as strings for UX simplicity. Add `type` to the Milestone itself. Detailed ticket typing belongs in Jira/Linear (Stage 17+). Stage 13 is Roadmap -- a deliverable "User Login" is sufficient.

### 4. Feature Prioritization Decision

**Verdict: Implicit via Timeline.**

Will NOT add RICE/MoSCoW scores. In a Roadmap, Time is the prioritization mechanism. If it's in Month 1, it's P0. If it's in Month 6, it's P1/P2. Ensure milestones array is sorted by date.

### 5. Dependency Management Decision

Keep CLI Flat Array. `dependencies: ['milestone-name-1']` is sufficient. Validation: check that dependent milestones exist and have dates before the current milestone.

### 6. Sales Model → Roadmap Alignment

Enforce via Analysis & Warning. Cannot force user to build SSO for Enterprise, but can warn them. The analysisStep generates "Required Capabilities" based on Stage 12. Kill Gate does NOT need to block on this (too subjective). Agent Critique should flag misalignment.

### 7. Kill Gate Enhancement

Keep current 3 basic checks as solid structural checks. Add:
- Gap Check: If timeline_months > 6 but only 3 milestones, warn/kill (Project density too low).
- Validation Check: At least one milestone MUST mention "Metrics" or "Analytics" (connecting back to Stage 3). Soft check / Warning.

Rely on AI Critique for content quality issues.

### 8. Phase Structure Decision

Keep Phase Array. Helps group milestones logically (Validation vs Scaling). Validate every Milestone date falls within a Phase's start/end.

### 9. CLI Superiorities

- Speed: Defining 5 milestones in a JSON/YAML file is 10x faster than dragging items in a React Timeline component.
- Portability: The roadmap is data, not view state.
- Focus: Forces thinking about What and When, not "what color is the bar".

### 10. Recommended Stage 13 Schema

```javascript
schema: {
  vision_statement: { type: 'string', minLength: 20, required: true },
  phases: {
    type: 'array',
    items: {
      name: { type: 'string' },
      start_date: { type: 'string', format: 'date' },
      end_date: { type: 'string', format: 'date' },
      goal: { type: 'string' }  // What is the purpose of this phase?
    }
  },
  milestones: {
    type: 'array',
    items: {
      name: { type: 'string' },
      date: { type: 'string', format: 'date' },
      phase_ref: { type: 'string' },  // Link to phase
      type: { type: 'enum', values: ['release', 'validation', 'infrastructure', 'compliance'] },
      deliverables: { type: 'array', items: { type: 'string' } },
      dependencies: { type: 'array', items: { type: 'string' } },
      outcomes: { type: 'array', items: { type: 'string' } }  // Connection to Stage 3 Metrics
    }
  }
}
```

### 11. Minimum Viable Change

1. Add analysisStep (single biggest value add, consumes Stage 11/12)
2. Add type to Milestones
3. Add outcomes to Milestones (link to business results)
4. Validate Date/Phase Integrity

### 12. Cross-Stage Impact

- Stage 14 (Architecture): Reads milestones to determine tech stack (e.g., "Mobile App" → need "Mobile" layer).
- Stage 15 (Financials): Reads timeline_months and phases to project burn rate duration.
- Stage 3 (Validation): Outcomes in milestones should reference metrics from Stage 3.

### 13. Dependency Conflicts

None observed. Stage 13 purely consumes prior decisions. Does not retroactively change Stage 1-12 data.

### 14. Contrarian Take

**"The Roadmap is a Lie."**

At Day 1 (Stage 13), any roadmap beyond 3 months is pure fiction. Forcing users to define a "Year 1 Roadmap" encourages waterfall thinking in a venture environment that demands agility.

Risk: We build a rigid plan that the founder clings to despite market signals.

Mitigation:
- Rename "Product Roadmap" to "Hypothesis Roadmap".
- Emphasize that later phases are low resolution.
- The Kill Gate ensures we have a plan, not necessarily the right plan. The "Reality Gate" at Stage 16 will check if the Blueprint is coherent.
