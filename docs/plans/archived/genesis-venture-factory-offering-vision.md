# Vision: Genesis — Public Venture Factory Offering

## Executive Summary
EHG has built a venture factory operating system: 25-stage lifecycle engine, AI strategic advisor (EVA), automated stage gates, opportunity scoring, moat architecture, simulation chamber, and cross-venture learning — totaling 221K+ LOC of production infrastructure. This vision transforms EHG from a company that builds ventures into the company that built the platform on which ventures get built. Genesis is the productization of EHG's venture factory methodology as a standalone SaaS platform, enabling others to run AI-augmented venture factories using EHG's battle-tested playbook.

The strategic bet: in a world where AI commoditizes code generation, the meta-skill of *systematically building ventures* becomes the durable advantage. EHG's venture factory methodology — validated through production use and encoded in software — is more valuable as a platform than as an internal tool. Genesis captures this value through a hybrid model: SaaS subscriptions for operating costs, equity optionality in Genesis-built ventures for upside, and data network effects that compound with every venture on the platform.

## Problem Statement
EHG's venture factory infrastructure is locked inside a single organization. The 25-stage lifecycle, EVA advisory, kill gates, simulation chamber, and cross-venture learning were built to serve EHG's internal portfolio — but their value is not EHG-specific. Any team building multiple ventures would benefit from structured stage gates, AI-powered assumption testing, and cross-portfolio intelligence. Meanwhile, the market for venture building support is fragmented: accelerators offer networks and capital but not persistent tooling, productivity tools offer task management but not venture methodology, and AI startup generators produce ideas but not systematic execution. No one owns the operating system layer between "I have an idea" and "I have a validated, funded, launched product." Genesis fills that gap.

## Personas
- **Venture Studio Operators**: Run small studios (2-10 active ventures). Need structured methodology beyond spreadsheets. Value stage gates, portfolio health views, and cross-venture learning. Willing to pay $500-1000/month per studio.
- **Corporate Innovation Teams**: Large companies running internal ventures. Need accountability frameworks, kill criteria, and executive dashboards. Enterprise pricing ($2000+/month). Value white-labeling and data privacy.
- **Serial Entrepreneurs**: Building 2nd or 3rd venture. Want an AI co-founder that provides strategic challenge, not just code generation. Value EVA advisory, assumption testing, and market intelligence. $100-300/month.
- **Accelerator Programs**: Running cohort-based programs. Need per-venture tracking, milestone gates, and cohort analytics. Value aggregate reporting for LPs. Partnership/licensing model.
- **Chairman (Rick)**: Genesis venture owner. Needs Genesis to cover its own operating costs via SaaS revenue while generating equity optionality. Values the data network effect for improving EHG's own venture factory.

## Information Architecture
- **Venture Dashboard**: Per-customer portfolio view showing all active ventures, their current stage (1-25), health indicators, and upcoming gate decisions. Mirrors EHG's Chairman view but multi-tenant.
- **Stage Gate Engine**: Customer-configurable validation gates with kill/promote/review decisions. Default configuration mirrors EHG's production gates (stages 3, 5, 13, 23 kill; 16, 17, 22 promotion). Customers can customize thresholds and add custom gates.
- **EVA Advisory Interface**: Chat-based strategic advisor for each venture. Uses Genesis-specific prompts trained on cross-venture patterns. Provides assumption challenges, competitive analysis, and strategic recommendations.
- **Simulation Chamber (Aries)**: "Try before you commit" environment where Genesis users can spawn a venture in a sandbox, run initial validation, and decide whether to promote to production. Reduces waste by catching non-viable ideas before significant investment.
- **Cross-Venture Intelligence**: Aggregate (anonymized) insights across all Genesis ventures — stage completion rates, common failure modes, successful pivot patterns, market signal correlations. Premium feature for paid tiers.
- **Template Library**: Curated collection of EHG's stage templates, artifact formats, and validation checklists. Customizable per venture type (SaaS, marketplace, API, content, hardware).
- **Existing Infrastructure Leveraged**: Venture State Machine, Stage Templates (stages 1-25), Stage-Zero synthesis, Genesis simulation, CEO Factory, Discovery Service, Cross-Venture Learning, Portfolio Optimizer.

## Key Decision Points
- **Demand Validation First**: Before any engineering investment beyond Phase 1 MVP, validate demand through 20+ customer interviews and content-based interest measurement. Hard kill metric: 10 paying customers within 6 months of launch or redirect effort.
- **Enterprise-First or Community-First**: Two viable go-to-market strategies. Enterprise-first (venture studios, corporate innovation) offers higher revenue per customer but smaller TAM. Community-first (individual founders, open-core model) offers larger TAM but lower willingness to pay. Decision: start enterprise-first (higher signal per customer), add community tier after product-market fit.
- **Equity Model**: Genesis can take equity in ventures built on the platform (like YC) or be pure SaaS (like Notion). Hybrid recommended: pure SaaS by default, optional equity track for ventures that want Genesis resources (advisory, capital, network) in exchange for 1-2% equity.
- **IP Protection**: Productizing the methodology means exposing it. Mitigation: the methodology is the "what" (public — content marketing), the software is the "how" (proprietary — product moat), and the data is the "why it works" (defensible — network effects). Competitors can read about the methodology but cannot replicate the accumulated cross-venture intelligence.
- **Data Sharing Model**: Cross-venture learning data is either shared (all customers benefit from aggregate intelligence) or siloed (each customer only learns from their own ventures). Decision: shared by default (this IS the network effect), with enterprise tier offering private-only mode.
- **Build vs License**: Genesis as self-serve SaaS vs licensing to established venture studios. Phase 1 explores both — SaaS for validation, licensing conversations for enterprise revenue.

## Integration Patterns
- **LEO Protocol → Genesis Orchestration SDK**: Strip EHG-specific implementation, expose configurable LEAD-PLAN-EXEC framework. Customers configure their own phase definitions, gate criteria, and handoff requirements. LEO becomes the engine, Genesis is the car.
- **EVA → Strategic Advisor API**: EVA's intake, classification, and advisory capabilities exposed as API endpoints. Per-customer context window (venture portfolio, market data, historical decisions). Premium tier feature with per-query token metering.
- **Design System → Venture UI Starter Kit**: EHG's Shadcn component library and design tokens offered as optional starter kit for Genesis-built ventures. "Powered by Genesis" visual identity. Ventures can override with custom branding.
- **Stage Gates → Validation-as-a-Service**: Gate definitions, scoring rubrics, and decision frameworks as configurable templates. Customers can use EHG defaults or customize. Gate results feed into venture health dashboards.
- **Cross-Venture Learning → Aggregate Intelligence**: Pattern recognition across all Genesis ventures (anonymized). Premium feature: "Ventures in your category typically stall at Stage 7 because of pricing model uncertainty. Here are the 3 most common pivots."
- **Competitive Intelligence → Market Signal Feed**: EHG's competitive intelligence pipeline (market scanning, signal detection) exposed to Genesis users as shared intelligence layer. Aggregated across all ventures on the platform.

## Evolution Plan
- **Phase 0** (4 weeks): Demand Validation — Content marketing (blog posts, case studies about EHG methodology). 20+ customer interviews. Landing page with waitlist. Measure inbound interest. Kill metric: 50+ qualified waitlist signups.
- **Phase 1** (6 weeks): MVP — Multi-tenant schema + RLS. Customer auth + API keys. Core 10-stage workflow (stages 1-10 with gates). Basic EVA advisory. Free trial + $299/month pro tier. Private beta for 5-10 founding customers.
- **Phase 2** (6 weeks): Product Completeness — Stages 11-25 with full gates. Genesis simulation chamber. Billing and usage metering. Support infrastructure. Venture health dashboards. Public launch target: 50+ customers.
- **Phase 3** (8 weeks): Intelligence Layer — Cross-venture learning (aggregate patterns). Advanced analytics and benchmarking. Enterprise tier ($999+/month) for corporate innovation teams. White-labeling for accelerator partnerships.
- **Phase 4** (ongoing): Growth & Network Effects — Open-core community tier. API/SDK for custom integrations. Marketplace for venture templates. Equity track for select ventures. International expansion.

## Out of Scope
- Building ventures for Genesis customers (Genesis provides methodology, not execution)
- Replacing human judgment in venture decisions (AI advises, humans decide)
- Competing with accelerators for capital allocation (Genesis is tooling, not funding)
- Mobile application (desktop-first, responsive web)
- Real-time collaboration features (async-first, real-time collaboration in future phases)
- Hardware venture support (software/SaaS ventures initially)

## UI/UX Wireframes
```
┌────────────────────────────────────────────────────────────────────┐
│  Genesis Dashboard — [Customer Name] Studio                        │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  Portfolio Overview                                                │
│  ─────────────────                                                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐             │
│  │ Venture A │ │ Venture B │ │ Venture C │ │  + New   │             │
│  │ Stage 12  │ │ Stage 5   │ │ Stage 2   │ │ Venture  │             │
│  │ ████████░ │ │ ████░░░░░ │ │ █░░░░░░░░ │ │          │             │
│  │ Health: ✅│ │ Health: ⚠️│ │ Health: ✅│ │          │             │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘             │
│                                                                    │
│  Upcoming Decisions                         Intelligence Feed      │
│  ────────────────                           ─────────────────      │
│  🔴 Venture B: Kill Gate (Stage 5)          📊 Ventures in your   │
│     3 criteria failing                       category: 34% stall  │
│     [Review] [Decide]                        at Stage 5 pricing.  │
│                                              Consider: flat-rate   │
│  🟢 Venture A: Promotion Gate (Stage 13)     vs usage-based.      │
│     All criteria passing                                           │
│     [Approve] [Review]                      📈 Your portfolio      │
│                                              health: 7.2/10        │
│  EVA Advisory                               (above 6.8 avg)       │
│  ────────────                                                      │
│  💬 "Venture B's pricing model shows                               │
│  signs of the 'free tier trap' pattern                             │
│  we've seen in 23% of SaaS ventures..."                           │
│                                                                    │
│  [Ask EVA a question...]                                           │
└────────────────────────────────────────────────────────────────────┘
```

## Success Criteria
- **Demand Validation (Phase 0)**: 50+ qualified waitlist signups, 20+ customer interviews completed, clear willingness-to-pay signal from ≥5 potential customers
- **MVP (Phase 1)**: 5-10 founding customers active, ≥3 ventures created per customer, NPS ≥40 from founding customers
- **Product-Market Fit (Phase 2)**: 50+ paying customers, $15K+ MRR, <10% monthly churn, ≥1 customer success story (venture reaching Stage 10+)
- **Intelligence Layer (Phase 3)**: Cross-venture benchmarking active, ≥1 enterprise customer ($999+/month), 200+ ventures generating learning data
- **Kill Metric**: If <10 paying customers within 6 months of Phase 1 launch, redirect engineering effort back to core EHG ventures
- **Resource Guardrail**: Genesis team never exceeds 3 FTE; if support burden requires >3 FTE, either raise prices or reduce scope
