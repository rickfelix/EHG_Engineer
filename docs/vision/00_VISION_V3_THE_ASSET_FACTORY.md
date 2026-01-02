# EHG VISION v3: THE ASSET FACTORY

**Status:** RATIFIED
**Date:** January 1, 2026
**Supersedes:** 00_VISION_V2_CHAIRMAN_OS.md
**Authority:** This document is the "Constitution" for all EHG agents and development.

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 3.0 | 2026-01-01 | Paradigm shift from "Code Factory" to "Asset Factory". Integrated Maintenance, Marketing, and Distribution layers. Triangulated by Claude (Architect), OpenAI (Strategist), Antigravity (Accelerator). |

---

## Executive Summary

**V2 built a system that creates code.**
**V3 builds a system that creates wealth.**

The shift:
- V2 asked: "Can we generate ventures?"
- V3 asks: "Can we generate **revenue while the Chairman sleeps**?"

A venture without customers is a hobby. A venture without maintenance dies. V3 closes these gaps.

---

## The Paradigm Shift

### V2: The Software Factory

```
Seed Idea → Code → Deployment → ???
                              ↑
                        (Chairman's Problem)
```

### V3: The Asset Factory

```
Seed Idea → Validated Product → Paying Customers → Maintained System → Growing Revenue
                                                                            ↓
                                                                  (Chairman's Freedom)
```

---

## 1. The Core Philosophy (Revised)

We are not building a **Command Center**. We are building a **Wealth Engine**.

The system is designed to generate **passive income at scale** - ventures that:
1. Attract their own customers (Marketing)
2. Convert visitors to revenue (Distribution)
3. Fix their own bugs (Maintenance)
4. Improve themselves over time (Learning)

### The Chairman's True Role

The Chairman is not a developer. Not a marketer. Not a support agent.

**The Chairman is a Capital Allocator.**

| Old Role (V2) | New Role (V3) |
|---------------|---------------|
| Approve code changes | Approve strategic bets |
| Review stage artifacts | Review revenue metrics |
| Decide on pivots | Decide on portfolio allocation |
| Manage EVA | Receive dividends |

---

## 2. The Full-Stack Venture Lifecycle

V2 covered Stages 1-25 (Ideation → Deployment).
V3 extends to **Stages 1-35** (Ideation → Passive Income).

### The Seven Phases

| Phase | Name | Stages | Purpose | V2 Status |
|-------|------|--------|---------|-----------|
| 1 | THE TRUTH | 1-5 | Validation & Market Reality | Built |
| 2 | THE ENGINE | 6-9 | Business Model Foundation | Built |
| 3 | THE IDENTITY | 10-12 | Brand & Go-to-Market | Built |
| 4 | THE BLUEPRINT | 13-16 | Technical Architecture | Built |
| 5 | THE BUILD | 17-20 | Implementation | Built |
| 6 | THE LAUNCH | 21-25 | Deployment & Optimization | Built |
| **7** | **THE MACHINE** | **26-35** | **Growth, Maintenance, Autonomy** | **NEW** |

### Phase 7: THE MACHINE (New Stages)

| Stage | Title | Purpose | Owner |
|-------|-------|---------|-------|
| 26 | Content Engine Setup | SEO, blog, social presence | VP_GROWTH |
| 27 | Paid Acquisition Pipeline | Ads, funnels, landing pages | VP_GROWTH |
| 28 | Customer Success Automation | Onboarding, retention, NPS | VP_GROWTH |
| 29 | Support & Incident Automation | Ticketing, triage, resolution | VP_TECH |
| 30 | Bug Detection & Auto-Fix | Monitoring, alerts, remediation | VP_TECH |
| 31 | Feature Request Pipeline | User feedback → PRD → Implementation | VP_PRODUCT |
| 32 | Pattern Library Feedback | Venture learnings → Pattern updates | VP_TECH |
| 33 | Revenue Optimization | Pricing tests, upsell, churn prevention | VP_GROWTH |
| 34 | Portfolio Synergy | Cross-venture opportunities | CEO |
| 35 | Autonomy Certification | Venture runs without intervention | CHAIRMAN |

### Stage 35: Autonomy Certification (The Goal)

A venture reaches Stage 35 when it can demonstrate:

| Criteria | Threshold |
|----------|-----------|
| Revenue | Positive MRR for 3 consecutive months |
| Support | <5% tickets require human escalation |
| Bugs | <2 critical issues per month, auto-resolved |
| Growth | Customer acquisition on autopilot (content/ads) |
| Maintenance | Updates deployed without Chairman involvement |

**When a venture passes Stage 35, it becomes a "Passive Asset."**

---

## 3. The Three New Layers

### Layer A: Marketing Automation (Stages 26-28)

**Problem Solved:** "Who finds the customers?"

| Component | Purpose | Implementation |
|-----------|---------|----------------|
| Content Engine | SEO + thought leadership | AI-generated blog posts, social content |
| Landing Page Factory | Convert visitors | Template-driven LP generation |
| Paid Acquisition | Scalable traffic | Automated ad campaigns (Google, Meta) |
| Email Sequences | Nurture leads | Drip campaigns triggered by behavior |

**CrewAI Integration:**
- `CONTENT_MARKETING` Crew - generates blog posts, social content
- `PAID_ACQUISITION` Crew - manages ad campaigns, optimizes spend
- `CONVERSION_OPTIMIZATION` Crew - A/B tests landing pages, improves funnels

### Layer B: Maintenance Automation (Stages 29-32)

**Problem Solved:** "Who fixes the bugs?"

| Component | Purpose | Implementation |
|-----------|---------|----------------|
| Error Monitoring | Detect issues | Sentry integration, custom alerts |
| Auto-Triage | Classify severity | AI-powered issue classification |
| Auto-Fix Pipeline | Resolve issues | Pattern-based bug fixes |
| Regression Prevention | Learn from fixes | Pattern Library updates |

**The Maintenance Loop:**
```
Error Detected (Sentry)
        ↓
Auto-Triage (AI classifies severity/type)
        ↓
Pattern Match (Is this a known issue type?)
        │
    ┌───┴───┐
    │       │
 [YES]    [NO]
    │       │
    ▼       ▼
Auto-Fix   Create SD
(Apply     (New work
pattern)   for crew)
    │       │
    └───┬───┘
        ↓
Deploy Fix
        ↓
Update Pattern Library
        ↓
Propagate to Similar Ventures
```

### Layer C: Distribution Automation (Stages 26-28, 33)

**Problem Solved:** "How do we scale revenue?"

| Component | Purpose | Implementation |
|-----------|---------|----------------|
| Multi-Channel Presence | Reach customers | Automated social, email, content |
| Pricing Optimization | Maximize revenue | A/B test pricing, dynamic pricing |
| Upsell/Cross-sell | Increase LTV | Automated upgrade prompts |
| Churn Prevention | Reduce attrition | Early warning + intervention |

---

## 4. The PRD Evolution

V2 PRDs focused on **what to build**.
V3 PRDs include **how to grow**.

### V3 PRD Structure

```typescript
interface PRD_V3 {
  // V2 Fields (Unchanged)
  executive_summary: string;
  problem_statement: string;
  target_users: UserPersona[];
  functional_requirements: Requirement[];
  technical_requirements: Requirement[];
  success_metrics: Metric[];

  // V3 Fields (NEW)
  go_to_market: {
    primary_channel: 'content' | 'paid' | 'viral' | 'partnerships';
    content_strategy: ContentPlan;
    ad_budget_monthly: number;
    target_cac: number;
    target_ltv: number;
  };

  maintenance_profile: {
    expected_bug_rate: 'low' | 'medium' | 'high';
    auto_fix_eligible: boolean;
    monitoring_requirements: string[];
    sla_targets: SLAConfig;
  };

  growth_levers: {
    pricing_flexibility: boolean;
    upsell_paths: string[];
    viral_mechanics: string[];
    retention_hooks: string[];
  };

  autonomy_target: {
    target_stage_35_date: string;  // ISO8601
    human_intervention_budget: number;  // hours/month
    revenue_target_for_autonomy: number;
  };
}
```

### Genesis Pipeline Integration

When Genesis creates a venture, the PRD now includes:
1. **Marketing DNA** - How will this venture acquire customers?
2. **Maintenance DNA** - How will this venture fix itself?
3. **Growth DNA** - How will this venture increase revenue?

This is baked in from Day 1, not bolted on after launch.

---

## 5. The Shadow Work (Formalized)

The following gaps identified during the Jan 1, 2026 audit are now **formal requirements** for Exhibition readiness.

### Integration Shadows

| Shadow | Description | Resolution |
|--------|-------------|------------|
| Stage 16/17 Orphan | soul-extractor.js and production-generator.js not wired to UI | Create API endpoints, wire to Stage16/17 components |
| PRD Stub | generatePRD() returns template, not LLM output | Wire OpenAI to genesis-pipeline.js |
| Genesis UI | No visual interface for simulation creation | Build Chairman-accessible Genesis creation form |

### Infrastructure Shadows

| Shadow | Description | Resolution |
|--------|-------------|------------|
| Hardcoded Secrets | JWT_SECRET in .env.production | Implement secret rotation |
| Empty Sentry | SENTRY_DSN is blank | Configure error monitoring |
| No Prod CI/CD | Deployment is manual | Create production workflow |
| Security Headers | No CSP, HSTS, X-Frame-Options | Add middleware |

### UX Shadows

| Shadow | Description | Resolution |
|--------|-------------|------------|
| Dead Bulk Actions | Pause/Archive buttons do nothing | Implement handlers |
| Empty State Confusion | Loading vs no-data indistinguishable | Add proper empty states |
| Error Boundaries | Data-fetch errors not caught | Wrap pages in error boundaries |

---

## 6. The Feb 14, 2026 Exhibition Standard

**Definition of "Done" for the Fleet Exhibition:**

### Tier 1: Must Have (Blocking)

| Requirement | Verification |
|-------------|--------------|
| Genesis creates ventures via UI | Chairman can click "Create Venture" and see simulation |
| PRD is LLM-generated, not template | Unique PRD for "Uber for Dog Walking" vs "AI Legal Assistant" |
| Ventures visible in portfolio | Chairman sees all simulations in dashboard |
| Stage progression works | Can advance venture through stages 1-5 minimum |
| No white screens | All primary flows render without errors |
| No hardcoded secrets | Security audit passes |

### Tier 2: Should Have (Quality)

| Requirement | Verification |
|-------------|--------------|
| Error monitoring live | Sentry captures errors |
| Bulk actions work | Can pause/archive multiple ventures |
| Empty states are clear | User knows "loading" vs "no data" |
| Stage 16/17 integration | Soul extraction triggers from UI |

### Tier 3: Nice to Have (Polish)

| Requirement | Verification |
|-------------|--------------|
| Marketing DNA in PRD | PRD includes go_to_market section |
| Maintenance DNA in PRD | PRD includes maintenance_profile |
| Pattern feedback loop | Venture learnings update pattern library |

---

## 7. The Triangulated Assessment

### Angle 1: Claude (The Architect)

**The Archaeologist Model:**

> "The City is built. The streets exist. What remains is not construction but excavation - revealing what was always there."

The 29 Genesis SDs are COMPLETED. The infrastructure exists. The gap is **integration** - connecting islands into a continent.

**Architect's Verdict:** 40-70 hours of glue work, not greenfield development.

### Angle 2: OpenAI (The Strategist)

**The Business Layer:**

> "A venture without customers is a science project. Marketing, Distribution, and Maintenance must be baked into the DNA from Day 1."

The V2 vision optimized for **code creation**. But code doesn't pay bills. The PRD must include:
- Customer acquisition strategy
- Revenue optimization path
- Self-maintenance capability

**Strategist's Verdict:** Extend the PRD schema. Add Phase 7 (Stages 26-35). Score ventures on viability, not just feasibility.

### Angle 3: Antigravity (The Accelerator)

**The Time Collapse:**

> "Feb 14 is not a deadline. It's a Fleet Exhibition. The question is not 'will we finish?' but 'how many ships do we parade?'"

At current velocity (80 commits in 5 days), the remaining work is achievable in 2-3 weeks. The Exhibition should showcase:
- 5+ simulations created via Genesis
- At least 1 venture at Stage 10+
- Marketing DNA visible in PRD
- Pattern Library driving code generation

**Accelerator's Verdict:** Target 5 simulations for the Fleet Review. Feb 14 is conservative if we focus.

---

## 8. The New Chain of Command

V2 Chain: Rick → EVA → Venture CEO → VPs → Crews

V3 Chain adds **Autonomous Operations:**

```
┌─────────────────────────────────────────────────────────────────────┐
│                        RICK (The Chairman)                          │
│                    CAPITAL ALLOCATION • TASTE • VETO                │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    ▼                           ▼
┌─────────────────────────────┐   ┌─────────────────────────────┐
│  EVA (Chief Operating       │   │  AURORA (Chief Revenue      │
│       Officer)              │   │         Officer) [NEW]      │
│  Build • Maintain • Fix     │   │  Market • Sell • Grow       │
└─────────────────────────────┘   └─────────────────────────────┘
          │                                   │
    ┌─────┴─────┐                       ┌─────┴─────┐
    ▼           ▼                       ▼           ▼
┌────────┐ ┌────────┐               ┌────────┐ ┌────────┐
│VP_TECH │ │VP_PROD │               │VP_MKTG │ │VP_SALES│
│        │ │        │               │ [NEW]  │ │ [NEW]  │
└────────┘ └────────┘               └────────┘ └────────┘
```

### AURORA: Chief Revenue Officer (New Agent)

| Function | Description |
|----------|-------------|
| **MARKETER** | Generates content, manages ads, optimizes SEO |
| **DISTRIBUTOR** | Manages channels, partnerships, viral loops |
| **OPTIMIZER** | A/B tests pricing, improves conversion, reduces churn |

AURORA is EVA's counterpart for the revenue side of ventures.

---

## 9. Success Metrics (Revised)

V2 metrics focused on **throughput**.
V3 metrics focus on **freedom**.

| Metric | V2 Target | V3 Target |
|--------|-----------|-----------|
| Ventures reaching Stage 25 | 3x current | Unchanged |
| **Ventures reaching Stage 35** | N/A | **3 per quarter** |
| **MRR from autonomous ventures** | N/A | **$10K by Q2 2026** |
| **Chairman hours per venture per week** | >5 | **<1** |
| **Auto-resolved support tickets** | N/A | **>80%** |
| **Auto-fixed bugs** | N/A | **>50%** |

---

## 10. Migration Path: V2 → V3

### Immediate (Pre-Exhibition)

1. **Update PRD Schema** - Add go_to_market, maintenance_profile, growth_levers
2. **Wire Genesis Integration** - Stage 16/17 scripts to UI
3. **Implement LLM PRD Generation** - Replace stub in genesis-pipeline.js
4. **Close Security Shadows** - Secrets, headers, monitoring

### Post-Exhibition (Q1 2026)

1. **Build Phase 7 Infrastructure** - Stages 26-35
2. **Implement AURORA** - Revenue automation agent
3. **Build Maintenance Loop** - Auto-triage, auto-fix pipeline
4. **Build Marketing Engine** - Content, ads, landing pages

### Q2 2026

1. **First Stage 35 Certification** - One venture reaches full autonomy
2. **Portfolio Synergy** - Cross-venture pattern sharing
3. **Passive Income Milestone** - $10K MRR from autonomous ventures

---

## 11. The Oath (Revised)

**V2 Oath:** "Rick commands, EVA coordinates, Crews execute."

**V3 Oath:**

> "Ventures create themselves. Ventures market themselves. Ventures maintain themselves.
> The Chairman approves the bets. The system delivers the returns."

---

## 12. Document Governance

This document supersedes:
- `00_VISION_V2_CHAIRMAN_OS.md` (archived, not deleted)
- Genesis Oath V3.1 language around "code factory" (updated to "asset factory")

This document is the authoritative source for:
- System purpose and philosophy
- Venture lifecycle definition (Stages 1-35)
- PRD schema requirements
- Success metrics
- Agent hierarchy

---

*Triangulated by the Council: Claude (Architect), OpenAI (Strategist), Antigravity (Accelerator)*
*Ratified: January 1, 2026*
*Effective: Immediately*

---

**The City is built. Now we open for business.**
