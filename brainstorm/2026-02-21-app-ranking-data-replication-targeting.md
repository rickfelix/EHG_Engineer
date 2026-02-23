# Brainstorm: App Ranking Data for Venture Replication Targeting

## Metadata
- **Date**: 2026-02-21
- **Domain**: Venture
- **Phase**: Ideation
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: All (cross-portfolio capability)
- **Related SDs**: SD-LEO-FEAT-STAND-RESEARCH-DEPARTMENT-001, SD-LEO-FIX-CLOSE-DOMAIN-INTELLIGENCE-001
- **Follow-Up Brainstorm**: brainstorm/2026-02-21-ranking-data-pipeline-sources-poc-integration.md
- **Final Direction**: Fully automated Stage 0 enhancement (not standalone Research Dept capability)

---

## Problem Statement
EHG's venture ideation currently lacks a data-driven method for identifying which applications have proven market demand. The holding group relies on qualitative judgment rather than quantitative market signals when selecting new ventures to build. Application ranking data (App Store, Google Play, G2, Capterra, Product Hunt) represents real-money proof of demand that could systematically surface replication opportunities — apps with validated demand that EHG could rebuild with vertical specialization and capability reuse advantages.

## Discovery Summary

### Core Insight
Ranking data should feed into the Research Department (SD-LEO-FEAT-STAND-RESEARCH-DEPARTMENT-001) as a persistent, recurring capability — not a one-time analysis. The Research Department would periodically ingest ranking data, cross-reference against EHG's capability graph, and produce "replication opportunity briefs" scored by:
1. **Market validation signal strength** (revenue, growth rate, category position)
2. **Capability reuse potential** (overlap with existing EHG venture infrastructure)
3. **EHG vertical alignment** (fit with portfolio strategy)

### Data Source Strategy
- **Top grossing** (primary) — proves monetization, not just adoption
- **Fastest rising** (secondary) — momentum signals timing windows
- **Scope**: Mobile AND SaaS — EHG's portfolio is SaaS-oriented; mobile-only would miss relevant targets
- **Sources**: Sensor Tower / data.ai (mobile), G2 / Capterra (SaaS), Product Hunt (trending), SimilarWeb (web traffic)

## Analysis

### Arguments For
- **Evidence-driven ideation** replaces gut-feel venture selection — ranking data is real-money proof of demand
- **Capability reuse scoring** creates a compounding advantage: each new venture makes the next one cheaper/faster
- **Research Department synergy** — natural first capability for SD-LEO-FEAT-STAND-RESEARCH-DEPARTMENT-001
- **Domain Intelligence amplification** — ranking data becomes a signal source for the existing Domain Intelligence system, creating a feedback loop

### Arguments Against
- **Lagging indicator risk** — top-ranked apps represent defended markets, not open opportunities
- **Data acquisition costs** — Sensor Tower/data.ai run $500-2,500/mo; free alternatives are stale/incomplete
- **Replication != product-market fit** — copying features misses the distribution, brand, and timing advantages that made the original succeed
- **Capability registry dependency** — meaningful scoring requires department_capabilities to be well-tagged

## Four-Plane Evaluation Matrix

### Plane 1: Capability Graph Impact (18/25)

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| New Capability Node | 5/5 | Introduces "market signal ingestion + opportunity scoring" — entirely new to EHG |
| Capability Reuse Potential | 4/5 | Directly reusable by all 5+ ventures for competitive intelligence and market positioning |
| Graph Centrality Gain | 4/5 | Connects Research Dept, Domain Intelligence, and venture ideation — becomes a hub node |
| Maturity Lift | 2/5 | Doesn't improve existing capabilities, but enables new ones |
| Extraction Clarity | 3/5 | Can be abstracted as a service (API), but scoring rubric is EHG-specific |

*Capabilities graph not yet available. Assessment based on manual analysis.*

### Plane 2: External Vector Alignment (16/25)

| Vector | Direction | Strength | Rationale |
|--------|-----------|----------|-----------|
| Market Demand Gradient | Tailwind | 4/5 | Explosion of SaaS tools + AI wrappers = more ranking data and targets than ever |
| Technology Cost Curve | Tailwind | 5/5 | LLMs make brief generation nearly free; ranking APIs are mature |
| Regulatory Trajectory | Neutral | 0 | No meaningful regulatory impact |
| Competitive Density | Headwind | -2/5 | Same data available to all; EHG's edge is scoring + capability reuse |
| Timing Window | Tailwind | 3/5 | AI-assisted venture building is nascent; most groups use manual ideation |

**Primary tailwind**: Technology cost curve
**Primary headwind**: Competitive density (data is not exclusive)
**Mitigation**: Moat is the scoring rubric + capability graph integration, not the raw data

### Plane 3: Control & Constraint Exposure (PASS)

| Constraint | Exposure | Rationale |
|------------|----------|-----------|
| Spend Risk | Low | $500-2,500/mo + 1 engineer |
| Legal / Regulatory Risk | Low | Public ranking data, no PII |
| Brand Risk | Low | Internal tool only |
| Security / Data Risk | Low | Public market data |
| Autonomy Risk | Medium | Automated briefs need human review gate |

**Kill-switch**: Human review gate before any brief influences venture decisions.

### Plane 4: Exploration vs Exploitation (Skewed Exploration)

- **Review interval**: 8 weeks
- **Auto-expiry**: 16 weeks — if no venture decision influenced by a ranking-derived brief by week 16, re-evaluate or sunset

### Four-Plane Summary

| Plane | Score | Status |
|-------|-------|--------|
| Capability Impact | 18/25 | Pass |
| Vector Alignment | 16/25 | Favorable |
| Constraint Exposure | Low-Medium | Pass |
| Explore/Exploit | Skewed Exploration | 8-week review |

## Team Perspectives

### Challenger
- **Blind Spots**: Ranking data is a lagging indicator (markets already defended by the time an app is top-ranked); App Store/G2 rankings optimize for mass-market appeal, not EHG's vertical strategy; "replication" collapses product-market fit into feature copying, missing distribution/brand/timing mechanics
- **Assumptions at Risk**: Capability reuse may only cover 20-30% of total venture cost (GTM dwarfs it); high rank may signal a fad, not durable demand; G2 rankings are influenced by vendor review campaigns, not pure buyer signal
- **Worst Case**: Research Department produces plausible-but-backward-looking briefs, EHG systematically picks crowded markets, capability reuse flywheel stalls due to insufficient user scale

### Visionary
- **Opportunities**: Arbitrage on validated demand (skip "does anyone want this?" phase); category-specific vertical wedges before competitors notice signals; capability reuse as compounding moat (decreasing cost per new venture)
- **Synergies**: Research Department becomes the institutional signal engine; Domain Intelligence System amplifies ranking data into scored opportunities; three architecturally adjacent systems (rankings + intelligence + research) create a feedback loop
- **Upside Scenario**: EHG becomes a systematic venture factory with a proprietary pipeline — signal feed + scoring engine + shared capabilities. The methodology itself becomes licensable as B2B SaaS.

### Pragmatist
- **Feasibility**: 4/10 (data acquisition is the friction point, not the architecture)
- **Resource Requirements**: 6-10 weeks to MVP; 1 engineer + 1 analyst; $500-2,500/mo data costs; Supabase + LLM API (already in stack)
- **Constraints**: Mobile ranking data costs money (free options are stale); scoring requires human judgment loop; capability registry must be well-tagged for meaningful scoring
- **Recommended Path**: Manual POC first — pull top 20 apps from Product Hunt API + G2 free tier in 2 categories, hand-score 3-5 briefs, validate with a founder. If briefs would influence decisions, build the pipeline.

### Synthesis
- **Consensus Points**: Scoring rubric is the make-or-break element (not data pipeline); human review loop is non-negotiable; start with manual POC before infrastructure
- **Tension Points**: Lagging indicator concern (Challenger) vs. validated demand arbitrage (Visionary) — resolution: weight fastest-rising signals higher, specifically target categories where vertical versions don't yet exist. Feature-copying risk (Challenger) vs. capability compounding (Visionary) — resolution: briefs must analyze business mechanics (pricing, distribution, retention), not just feature lists
- **Composite Risk**: Medium — sound idea with real risk of backward-looking targets if scoring rubric ignores market timing and defensibility

## Resolution (Updated After Follow-Up Brainstorm)

### Key Decisions Made
1. **$0 budget** — free data sources only (Apple RSS, Google Play scraper, Product Hunt API, G2 scraping)
2. **Not a Research Department capability** — this is a direct enhancement to the existing Stage 0 pipeline
3. **Fully automated** — no manual POC; ranking data feeds directly into Trend Scanner + Competitor Teardown
4. **Unified pipeline** — Path 1 (Competitor Teardown) and Path 3 (Discovery Mode) merge into a single automated flow: data collection → trend scanning → auto-teardown → synthesis → chairman review

### Updated Feasibility
- **Original**: 4/10 (standalone Research Dept capability, paid data)
- **Updated**: 7/10 (Stage 0 enhancement, free data, 80% of pipeline already built)
- **Estimated LOC**: ~395 lines new/modified
- **Timeline**: 2-3 weeks

### Open Questions (Remaining)
- Should `app_rankings` deduplicate across sources?
- Should the pipeline queue candidates for batch chairman review or run fully unattended?
- How should ranking data trigger Nursery Re-evaluation? (trending category = re-score parked ventures)
- What cron infrastructure? (Supabase pg_cron vs. GitHub Actions vs. node-cron)

### Suggested Next Steps
1. **Create SD** scoped as Stage 0 enhancement (~395 LOC, Tier 3)
2. See follow-up brainstorm for full implementation plan: `brainstorm/2026-02-21-ranking-data-pipeline-sources-poc-integration.md`
