# Stage 11 "Go-To-Market" -- OpenAI Response

> Independent response to the Stage 11 triangulation prompt.
> Respondent: OpenAI (GPT 5.3)
> Date: 2026-02-11

### 1. Gap Assessment Table

| Gap | GUI Has | CLI Has | Importance (1-5) | Downstream Impact | Verdict | Challenge |
|-----|---------|---------|:-----------------:|-------------------|---------|-----------|
| Channel taxonomy | paid/organic/earned/owned | none | **4 High** | Stage 12 cannot reason channel mix quality; over-index risk | Add lightweight classification | Could be inferred from channel name if mapping table exists |
| Segment persona depth | persona, pain points, conversion % | tier name/desc + TAM/SAM/SOM | **5 Critical** | Sales messaging and funnel design become generic | Add persona-lite + top pain points | Full persona docs are overkill here |
| Funnel assumptions | leads/Q1, conversion target, year-one customers | total budget + avg CAC | **4 High** | Stage 12 forecasts become detached from GTM plan | Add coarse funnel assumptions | Too-precise forecasting at this phase can be fake certainty |
| Channel strategy detail | tactics[], strategy text | KPI only | **3 Medium** | Harder to translate to campaign briefs | Add 1-2 strategy bullets per channel | Might duplicate Stage 12/13 execution detail |
| Timeline evaluation quality | status/objectives/success metrics | milestone/date/owner | **3 Medium** | Weak readiness checks; hard to judge launch viability | Add objective + success_metric per milestone | Status is execution-time, not identity-time |
| Brand-to-channel traceability | implied in GUI | not explicit | **5 Critical** | Brand identity from Stage 10 may be ignored | Require rationale linking channels to brand | Could become verbose if unconstrained |
| Pricing coherence checks | not explicit in GUI | none | **5 Critical** | Can approve impossible GTM (CAC > viable payback) | Add automated CAC/LTV/payback validation | Requires consistent upstream unit-econ fields |
| Exit-strategy influence | GUI richer context, implicit | none explicit | **3 Medium** | Buyer-type/channel mismatch can weaken strategic path | Add optional weighting by buyer type | Not always material for all venture types |
| Fixed counts rigidity | mixed flexibility in GUI | exactly 3 tiers, exactly 8 channels | **3 Medium** | Can force filler channels or omit valid niche play | Keep tiers fixed; relax channels | Rigidity sometimes drives disciplined thinking |

### 2. AnalysisStep Design (inputs, prior stage mapping, outputs)

**Inputs (Stage 1-10)**:
- Stage 10: brand archetype, tone, audience, differentiators, selected name
- Stage 7: pricing model, price tiers, value metric
- Stage 5: CAC/LTV/churn/payback
- Stage 4: competitor intensity, pricing landscape
- Stage 3: validated demand/market confidence
- Stage 9: likely buyer types / exit posture

**AnalysisStep should produce**:
- `target_segments[]` (3 tiers retained, plus persona-lite)
- `channel_plan[]` (budget, expected CAC, KPI, classification, rationale)
- `funnel_assumptions` (lead volume range + conversion range + expected new customers range)
- `launch_timeline[]` (milestone/date/owner/objective/success_metric)
- `coherence_checks[]` (pass/warn/fail with reasons)
- `decision` (`ADVANCE` | `REVISE` | `REJECT`) + rationale

### 3. Fixed Counts vs Flexible Decision

- Keep **exactly 3 tiers** (good strategic forcing function).
- Change channels from **exactly 8** to **min 5, max 10**, with target default 8.
- Add validation: must include at least:
  - 1 scalable acquisition channel
  - 1 credibility/brand channel
  - 1 retention/owned channel

This preserves discipline without encouraging filler entries.

### 4. Channel Classification Decision

- Add classification; it is **analytically useful**, not cosmetic.
- Minimum fields:
  - `type`: `paid | organic | earned | owned`
  - `priority`: `primary | secondary | experimental`
- Why now: Stage 12 needs balanced pipeline logic and budget-risk interpretation.

### 5. Segment Depth Decision

Appropriate IDENTITY-phase depth:
- Keep current `name/description/TAM/SAM/SOM`
- Add:
  - `persona` (1 sentence)
  - `pain_points` (top 3)
  - `value_claim` (why this segment buys)
  - `estimated_conversion_pct_range` (low/high, not exact point)

Avoid deep JTBD documents at this stage.

### 6. GTM Metrics Decision

Add strategic metrics, not execution telemetry:
- `total_marketing_budget_monthly`
- `blended_cac_target`
- `expected_leads_q1_range`
- `target_conversion_pct_range`
- `expected_customers_year_one_range`
- `payback_months_estimate`

Do **not** add campaign-level operational metrics yet.

### 7. Stage 10 → 11 Consumption Mapping

- **Archetype** → channel voice and partnership style
- **Tone** → content format and conversion CTA style
- **Audience** → segment prioritization and channel fit
- **Differentiators** → message pillars per segment
- **Venture name/identity** → launch narrative consistency
- **Exit buyer type** (Stage 9) → channel emphasis

### 8. Budget-Pricing Coherence Check

Add explicit validation rules:
- `expected_cac <= max_viable_cac` (derived from Stage 5/7 economics)
- `ltv_cac_ratio >= threshold` (e.g., 3.0 default; configurable)
- `payback_months <= target_ceiling`
- Warn if channel mix depends on CAC assumptions above segment willingness-to-pay

This is a **critical** correctness gate.

### 9. CLI Superiorities (preserve these)

- Forced strategic scoping (3 tiers) prevents over-fragmentation
- Mandatory per-channel budget + CAC + KPI is stronger than narrative-only planning
- Simple timeline ownership (`owner`) is practical and execution-friendly
- Deterministic required fields improve reliability across stages
- Existing derived totals are useful baseline signals

### 10. Recommended Stage 11 Schema

High-level shape:
- `tiers[]` (3 required): `name, description, persona, pain_points[], TAM, SAM, SOM, conversion_pct_range`
- `channels[]` (5-10): `name, type, priority, monthly_budget, expected_cac, primary_kpi, rationale, tactics[]`
- `funnel_assumptions`: `leads_q1_range, conversion_pct_range, customers_year_one_range`
- `launch_timeline[]`: `milestone, date, owner, objective, success_metric`
- `coherence`: `ltv_cac_ratio, payback_months_estimate, flags[]`
- `decision`: `ADVANCE|REVISE|REJECT` + `decision_reason`

### 11. Minimum Viable Change (priority-ordered)

1. Add `analysisStep` output generation for Stage 11
2. Add coherence checks against Stage 5/7 economics
3. Add channel `type` + `priority`
4. Add persona-lite fields to tiers
5. Relax channel count from exact 8 to range (5-10)
6. Add timeline `objective` + `success_metric`

### 12. Cross-Stage Impact

- **Stage 12 (Sales Logic)**: Materially improved inputs for funnel and process design.
- **Stage 13+ (Blueprint)**: Cleaner assumptions for demand modeling and execution plans.
- **Earlier stages**: No structural rewrite required if Stage 5/7 economics fields are stable.

### 13. Dependency Conflicts (Stages 1-10)

Potential conflicts to resolve:
- Field naming mismatch for economics (`LTV`, `ltv`, `customer_ltv`) can break checks.
- If Stage 7 pricing lacks normalized `value_metric`, channel-persona fit scoring may degrade.
- Exit strategy buyer types may be too broad for channel weighting unless normalized enum exists.

**Net**: No major redesign of Stages 1-10 required; mostly schema normalization and mapping contracts.

### 14. Contrarian Take

Most obvious recommendation is "add lots of GTM detail."

**Counterpoint**: Over-specifying Stage 11 can create false precision and lock the team into assumptions before real market contact. If you add too many metrics/persona fields now, quality may look high while signal quality is low. A lean Stage 11 with strict coherence checks may outperform a rich but speculative schema.
