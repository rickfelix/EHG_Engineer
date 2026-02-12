# Stage 11 "Go-To-Market" -- Claude Response

> Independent response to the Stage 11 triangulation prompt.
> Respondent: Claude (Opus 4.6) with codebase access
> Date: 2026-02-11

### 1. Gap Assessment Table

| Gap | GUI Has | CLI Has | Importance (1-5) | Downstream Impact | Verdict | Challenge |
|-----|---------|---------|:-----------------:|-------------------|---------|-----------|
| GTM strategy generation | AI-processed output in viewer | None (all user-provided) | **5 Critical** | Without AI generation, users must manually research and populate 3 tiers + 8 channels + timeline. The analysisStep makes this usable. | CLOSE | The LLM has all prior stage data (pricing, competitors, segments, brand) -- it can propose a complete GTM plan. |
| Channel type classification | paid/organic/earned/owned | None | **3 Medium** | Helps with budget allocation analysis. "What % goes to paid vs organic?" is a useful lens. But it's metadata, not strategic. | ADAPT | Challenge: Channel types are standard marketing taxonomy. Add as enum per channel, but don't gate on it. It helps analysis without adding friction. |
| Segment personas/pain points | persona, pain_points[], conversion_pct | Just name + description | **4 High** | Stage 12 (Sales Logic) needs to know WHO the customers are, not just market sizing. Pain points drive sales messaging. | CLOSE | Challenge: At IDENTITY phase, personas are hypothetical. But structured hypotheses are better than blank descriptions. Conversion_pct is speculative but useful for budget validation. |
| GTM aggregate metrics | leads, conversion, year-one customers, CAC target | total_budget + avg_cac only | **3 Medium** | More metrics help calibrate the plan. But at IDENTITY phase, these are estimates on estimates. | PARTIAL ADAPT | Challenge: total_budget and avg_cac are the grounded metrics. Leads and conversion estimates are useful directionally but should be flagged as projections, not forecasts. |
| Launch milestone richness | status + objectives[] + success_metrics[] | milestone + date + owner | **2 Low** | Status tracking is execution. Objectives/success_metrics are planning that helps but doesn't change the GTM strategy itself. | ADAPT | Challenge: Add objectives (what the milestone achieves) but not status tracking. At IDENTITY phase, all milestones are "planned." |
| Decision output | ADVANCE/REVISE/REJECT | None | **3 Medium** | Useful signal for Stage 12. But GTM rarely "fails" -- it iterates. | ADAPT | Challenge: Following Stage 10's pattern, add a soft decision. But "REJECT" doesn't make sense for GTM -- you adjust, not reject. Use `approved | revise` only. |
| Budget allocation % | budget_allocation_pct per channel | Absolute budget only | **3 Medium** | Percentages make it easier to compare channel mix. Derived from budget values. | CLOSE | Simple derivation: channel.monthly_budget / total_monthly_budget × 100. Add as derived field. |
| Expected reach per channel | expected_reach field | None | **2 Low** | Reach estimates at IDENTITY are guesswork. Budget and CAC already imply reach (budget / CAC = estimated acquisitions). | DEFER | Challenge: Reach is derivable from budget ÷ CAC. Explicit reach field adds noise. |
| Fixed count requirements | N/A | Exactly 3 tiers, 8 channels | **4 High** (see analysis) | Fixed counts force discipline but may not fit all ventures. See section 3. | ADAPT | See detailed analysis below. |

### 2. AnalysisStep Design

**Input (from prior stages)**:
- **Stage 1**: Target market, problem statement (who needs this?)
- **Stage 3**: Market validation metrics (market size, growth, competitive density)
- **Stage 4**: Competitive landscape (competitor channels, pricing -- where do they acquire?)
- **Stage 5**: Unit economics (CAC, LTV, payback -- budget guardrails)
- **Stage 7**: Pricing model and tiers (ARPA, customer segments by tier)
- **Stage 8**: BMC Customer Segments + Channels + Key Activities
- **Stage 9**: Exit strategy (buyer_type, exit thesis -- acquisition target → enterprise channels)
- **Stage 10**: Brand genome (tone, audience, archetype), selected name, positioning

**Process (single LLM call)**:
1. **Market Tier Generation**: Derive 3 tiers from Stage 1 target market + Stage 3 validation + Stage 8 Customer Segments. Include TAM/SAM/SOM estimates, persona, and pain points per tier.
2. **Channel Selection & Budget**: Select 8 channels appropriate to venture type. Use Stage 4 competitor channels as reference. Allocate budgets constrained by Stage 5 unit economics (CAC must stay below LTV). Assign KPIs per channel.
3. **Launch Timeline**: Generate milestone timeline from current state to market entry. Consider Stage 9 exit horizon for pacing.
4. **Cross-Validation**: Check total_budget vs Stage 5 profitability. Flag if monthly marketing spend exceeds projected monthly revenue within payback period.

**Output**: Complete Stage 11 data (tiers, channels with budgets/CAC/KPI, launch_timeline, gtm_metrics)

### 3. Fixed Counts vs Flexible Decision

**Relax channel count from exactly 8 to minItems: 5, maxItems: 12. Keep tier count at exactly 3.**

**Tiers (keep exactly 3)**:
- 3 tiers is a forcing function. It maps to TAM/SAM/SOM segmentation (broad market → serviceable → obtainable). Forcing 3 prevents both "just one target" (too narrow) and "5+ segments" (unfocused). This is a CLI strength.

**Channels (relax to 5-12)**:
- Exactly 8 is too rigid. A B2B SaaS might use 5 channels effectively (Content, SEO, Direct Sales, Partnerships, Events). A consumer app might use 10+. Forcing 8 means either padding irrelevant channels or cutting important ones.
- Keep minimum 5 (forces breadth) and maximum 12 (prevents spray-and-pray).
- The 12 predefined channel names remain available as suggestions, not requirements.

### 4. Channel Classification Decision

**Add channel_type enum: paid, organic, earned, owned.**

This is standard marketing taxonomy and adds real analytical value:
- **Budget analysis**: "70% of budget on paid channels" is a useful diagnostic.
- **Risk assessment**: Over-reliance on paid = burn rate risk. Under-investment in organic = long-term growth risk.
- **Stage 12 handoff**: Sales Logic needs to know which channels are "owned" (controlled) vs "earned" (dependent on external parties).

Classification is deterministic for the predefined channels:
- Paid: Paid Search, Social Media Ads, Events, Influencer Marketing
- Organic: Organic Search, SEO, Community
- Owned: Content Marketing, Email Marketing, Direct Sales
- Earned: PR/Media, Referrals, Partnerships

### 5. Segment Depth Decision

**Add persona and pain_points[] to tiers. Defer conversion_pct.**

At IDENTITY phase:
- **Persona**: Useful for Stage 12 sales messaging. "Enterprise CTO, 40-55, manages 50+ engineers" gives Sales Logic a concrete target.
- **Pain points**: Critical for Stage 12. Sales messaging is built on pain points. If we don't capture them here, Stage 12 has to re-derive them.
- **Conversion_pct**: Too speculative at IDENTITY. Conversion rates depend on product quality, which doesn't exist yet. Defer to BUILD.

### 6. GTM Metrics Decision

**Add projected metrics as analysisStep output, clearly flagged as estimates.**

| Metric | Include? | Source |
|--------|----------|--------|
| total_monthly_budget | Yes (existing derived) | Sum of channel budgets |
| avg_cac | Yes (existing derived) | Average across channels |
| budget_allocation_pct | Yes (NEW derived) | Per channel, % of total |
| estimated_monthly_acquisitions | Yes (NEW derived) | total_budget / avg_cac |
| estimated_year_one_customers | Yes (NEW, analysisStep) | Based on ramp + churn from Stage 5 |
| cac_to_ltv_ratio | Yes (NEW, cross-stage) | avg_cac / LTV from Stage 7 |

**Do NOT include**: expected_leads (too speculative), target_conversion_rate (no product data). These are BUILD-phase metrics.

### 7. Stage 10 → 11 Consumption Mapping

| Stage 10 Output | Stage 11 Application |
|-----------------|---------------------|
| brand_genome.tone | Channel voice. "Bold, direct" tone → social media, PR. "Professional, measured" → content marketing, events. |
| brand_genome.audience | Primary tier persona. Audience description maps to tier 1 characteristics. |
| brand_genome.archetype | Channel selection. "The Innovator" → PR, social, influencer. "The Sage" → content, SEO, events. |
| decision.selected_name | All GTM materials reference the venture name. |
| decision.status = working_title | GTM plan acknowledges name may change. Avoid name-dependent channel strategies (e.g., domain-based SEO). |
| Stage 9 buyer_type | Channel mix adjustment. PE target → metrics-heavy channels (direct sales, events). Strategic acquirer → brand-building channels (PR, content). |

### 8. Budget-Pricing Coherence Check

**Add cross-validation in computeDerived() or analysisStep.**

The relationship between GTM budget and unit economics (Stage 5/7) is critical:

| Check | Formula | Threshold | Action |
|-------|---------|-----------|--------|
| CAC < LTV | avg_cac < Stage 7 LTV | CAC must be < LTV | Warning if violated |
| Payback feasibility | avg_cac < Stage 7 ARPA × payback_months | Budget recoverable | Warning if violated |
| Budget sustainability | total_monthly_budget < projected_monthly_revenue | Not burning faster than earning | Warning if violated (acceptable in growth phase) |

These should be **warnings**, not blockers. Early-stage ventures often spend more than they earn to acquire customers. But flagging the ratio helps calibrate expectations.

### 9. CLI Superiorities (preserve these)

- **Exactly 3 tiers**: Forces TAM/SAM/SOM discipline. Superior to variable-count segments.
- **Per-channel budget + CAC + KPI**: Concrete, quantitative channel planning.
- **12 predefined channel names**: Comprehensive menu reduces blank-page paralysis.
- **Derived aggregations**: total_monthly_budget and avg_cac are clean, useful metrics.
- **`computeDerived()` pattern**: Deterministic, testable budget aggregation.

### 10. Recommended Stage 11 Schema

```javascript
const TEMPLATE = {
  id: 'stage-11',
  slug: 'gtm',
  title: 'Go-To-Market',
  version: '2.0.0',
  schema: {
    // === Updated: tiers with persona + pain_points ===
    tiers: {
      type: 'array', exactItems: 3,
      items: {
        name: { type: 'string', required: true },
        description: { type: 'string', required: true },
        tam: { type: 'number', min: 0 },
        sam: { type: 'number', min: 0 },
        som: { type: 'number', min: 0 },
        persona: { type: 'string' },              // NEW
        pain_points: { type: 'array' },            // NEW
      },
    },

    // === Updated: channels with type + relaxed count ===
    channels: {
      type: 'array', minItems: 5, maxItems: 12,   // CHANGED from exactItems: 8
      items: {
        name: { type: 'string', required: true },
        channel_type: { type: 'enum', values: ['paid', 'organic', 'earned', 'owned'] }, // NEW
        monthly_budget: { type: 'number', min: 0, required: true },
        expected_cac: { type: 'number', min: 0, required: true },
        primary_kpi: { type: 'string', required: true },
      },
    },

    // === Updated: timeline with objectives ===
    launch_timeline: {
      type: 'array', minItems: 1,
      items: {
        milestone: { type: 'string', required: true },
        date: { type: 'string', required: true },
        owner: { type: 'string' },
        objectives: { type: 'array' },             // NEW
      },
    },

    // === Existing derived (enhanced) ===
    total_monthly_budget: { type: 'number', derived: true },
    avg_cac: { type: 'number', derived: true },
    budget_allocation: { type: 'array', derived: true },  // NEW: per-channel %
    estimated_monthly_acquisitions: { type: 'number', derived: true },  // NEW

    // === NEW: cross-stage coherence ===
    coherence_warnings: { type: 'array', derived: true },  // CAC vs LTV checks

    // === NEW: decision ===
    decision: {
      type: 'object',
      properties: {
        status: { type: 'enum', values: ['approved', 'revise'] },
        rationale: { type: 'string' },
      },
    },

    // === NEW: Provenance ===
    provenance: { type: 'object', derived: true },
  },
};
```

### 11. Minimum Viable Change (priority-ordered)

1. **P0: Add `analysisStep` for GTM generation**. Single LLM call consuming Stages 1-10. Produces 3 tiers (with personas), 5-12 channels (with types/budgets/CAC), and launch timeline.

2. **P0: Wire prior stage consumption**. Brand genome → channel voice, Stage 5 unit economics → budget guardrails, Stage 4 competitors → channel intelligence.

3. **P1: Relax channel count to 5-12**. Keeps minimum breadth without forcing padding.

4. **P1: Add channel_type enum**. paid/organic/earned/owned classification.

5. **P1: Add persona + pain_points to tiers**. Enables Stage 12 sales messaging.

6. **P2: Add coherence warnings**. CAC vs LTV cross-validation with Stage 5/7.

7. **P2: Add budget_allocation_pct derived field**. Per-channel percentage.

8. **P2: Add soft decision object**. approved/revise status.

9. **P3: Do NOT add expected_reach per channel**. Derivable from budget ÷ CAC.
10. **P3: Do NOT add milestone status tracking**. Execution concern.
11. **P3: Do NOT add conversion_rate estimates**. No product data to support them.

### 12. Cross-Stage Impact

| Change | Stage 12 (Sales Logic) | Stage 13+ (BLUEPRINT) | Broader Pipeline |
|--------|----------------------|----------------------|-----------------|
| GTM generation with personas | Sales Logic receives concrete buyer personas with pain points. Sales messaging can be specific, not generic. | Blueprint stages know the go-to-market approach. Technical Architecture can prioritize features that support key channels. | GTM is the bridge from identity to execution. Without concrete channel plans, downstream stages lack market context. |
| Channel type classification | Sales Logic can focus on "owned" channels (Direct Sales, Email) while marketing handles "paid" and "organic." | Resource Planning (Stage 15) can allocate marketing vs sales staff. | Clean separation of channel ownership enables team planning. |
| Coherence warnings (CAC < LTV) | Sales Logic inherits realistic CAC expectations. If CAC > LTV, sales process must be adjusted before BUILD. | Financial Projections (Stage 16) can flag unsustainable acquisition costs. | Early CAC/LTV mismatches caught here prevent expensive BUILD-phase failures. |

### 13. Dependency Conflicts (with Stages 1-10 decisions)

**No blocking dependency conflicts.**

| Dependency | Status | Notes |
|-----------|--------|-------|
| Stage 5 → 11 (unit economics for budget validation) | **OK** | Stage 5 consensus includes CAC, LTV, payback. Available for coherence check. |
| Stage 7 → 11 (pricing for revenue estimation) | **OK** | Stage 7 has ARPA, tiers. Revenue base available for budget sustainability check. |
| Stage 8 → 11 (BMC channels/segments) | **OK** | Stage 8 Customer Segments and Channels blocks map to tiers and channels. |
| Stage 10 → 11 (brand for channel voice) | **OK** | Stage 10 consensus includes brand_genome with tone, archetype, audience. Sufficient for channel selection. |
| Stage 4 → 11 (competitor channels) | **Minor gap** | Stage 4 consensus adds competitor name, pricingModel, url. No explicit "marketing channels" field for competitors. The analysisStep can infer channels from competitor websites/descriptions using LLM knowledge. **Not blocking.** |

### 14. Contrarian Take

**Arguing AGAINST relaxing the 8-channel requirement:**

The most obvious recommendation is relaxing channels from exactly 8 to 5-12. Here's why keeping exactly 8 might be better:

1. **Constraint breeds strategy.** When forced to populate 8 channels, users must think beyond their comfort zone. A technical founder defaults to "Content Marketing + SEO" and stops at 2. Forcing 8 channels means they must consider Events, Partnerships, Direct Sales -- channels they'd otherwise ignore. The constraint is educational.

2. **Comparability across ventures.** If every venture has exactly 8 channels, venture portfolios can be compared apple-to-apple. "Venture A spends 40% on paid, Venture B spends 10%" is only comparable if both assessed the same channel space. Variable counts break this.

3. **Budget allocation becomes meaningful.** 8 channels with explicit budgets means the allocation percentages always sum to 100% across 8 items. With 5 channels, a venture could just dump everything into 2 channels and pad 3 with $0 budgets -- defeating the purpose.

4. **What could go wrong with 5-12**: Ventures default to 5 (minimum) and skip important channels. The "minimum viable" becomes the norm. The educational value of forced breadth is lost.

**Counter-argument**: Some ventures genuinely only need 5 channels. B2B enterprise with ASP > $100K might only use Direct Sales, Events, Content, Partnerships, and Referrals. Forcing them to budget for "Social Media" and "Influencer Marketing" is theater.

**Verdict**: Relax to 5-12 but have the analysisStep always propose 8. The constraint moves from the schema to the AI, which can explain why each channel matters (or why it doesn't apply). Users can then trim with justification rather than padding without thought.
