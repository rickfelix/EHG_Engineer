# Brainstorm: Genesis — Public Venture Factory Offering

## Metadata
- **Date**: 2026-03-08
- **Domain**: Product
- **Phase**: MVP (productizing EHG's venture factory methodology as a standalone offering)
- **Mode**: Conversational (autonomous — chairman asleep, EVA proceeding)
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: EHG_Engineer (LEO Protocol, EVA, stage gates), EHG (Chairman UI, design system)
- **Source**: Chairman final cut — item retained from SD-RESEARCH-VENTURE_FACTORY-20260309-012

---

## Problem Statement
EHG has built a comprehensive venture factory infrastructure: a 25-stage venture lifecycle engine, AI-powered strategic advisory (EVA), automated stage gates with kill/promotion decisions, opportunity scoring across 6 dimensions, moat architecture assessment, cross-venture learning, portfolio optimization, and a simulation chamber (Genesis/Aries). This infrastructure represents 221K+ LOC in the EVA subsystem alone, with 34K+ LOC of directly reusable core components. But this investment is locked inside EHG as an internal operating system. The question is whether EHG should productize this methodology — offering "Genesis" as a platform that helps others build venture factories using the EHG playbook — transforming EHG from a portfolio company into a platform company.

## Discovery Summary

### Existing Infrastructure (Key Finding)
The Pragmatist's exploration revealed massive existing infrastructure — far more than expected:

**Core Venture Lifecycle Engine (34,130 LOC, production-ready):**
- **Venture State Machine** (`lib/agents/modules/venture-state-machine/`, 1,301 LOC): Full lifecycle engine with stage transitions, validation, and state management
- **EVA Stage Templates** (`lib/eva/stage-templates/`, 68 files, 14,690 LOC): Stages 1-25 fully templated with automation, requirements, gates, outputs, and validation per stage
- **EVA Stage-Zero Synthesis** (`lib/eva/stage-zero/`, 41 files, 7,597 LOC): 16 archetype profiles for venture typing, automatic path routing (Blueprint Browse, Competitor Teardown, Discovery Mode)
- **Genesis Simulation** (`lib/genesis/` + `scripts/genesis/`, 20 files, 8,151 LOC): Spawn ventures in sandboxed "Aries" environment, pattern-based code generation, GitHub repo + Vercel deployment, pre-production quality gates
- **Venture CEO Factory** (`lib/agents/venture-ceo-factory.js`, 474 LOC): Auto-create 19-agent hierarchy (1 CEO + 4 VPs + 14 Crews)
- **Discovery Service** (`lib/discovery/`, 1,917 LOC): Gap analysis (6 dims), opportunity scoring (6 weighted dims), Green/Yellow/Red classification

**Supporting Intelligence Layer (4,830 LOC):**
- **EVA Orchestrators** (2,159 LOC): Multi-venture coordination, event-driven architecture
- **Cross-Venture Learning** (871 LOC): Pattern recognition, assumption calibration, success/failure analysis
- **Historical Pattern Matching** (~800 LOC): Decision support from past ventures
- **Capability Graphs** (~600 LOC): Competency tracking across agents
- **Event Bus & Handlers** (~400 LOC): Async event processing

**Database Schema**: 60+ tables covering venture lifecycle, strategic directives, financial contracts, retrospectives, issue patterns

**Overall**: ~88% reusability rating across core components. 221K LOC total in /lib/ (874 files).

### What Must Be Built (for productization)
- **Multi-tenancy layer** (~30-40% new code): RLS policies, schema partitioning, billing keys, customer isolation
- **Customer auth & onboarding** (~15-20%): Signup flow, multi-user RBAC, API keys, OAuth
- **Billing infrastructure** (~10-15%): Usage metering, pricing tier enforcement, Stripe integration
- **API documentation & SDKs** (~10-15%): OpenAPI spec, REST wrapper, webhook system
- **White-labeling** (~5-8%): Custom domains, branding, CSS theming
- **Compliance** (~5-10%): GDPR, data retention, customer data deletion
- **Customer support** (~5-10%): Support ticketing, knowledge base, training materials

## Analysis

### Arguments For
- 80-85% of the technical product already built — remaining 15-20% is infrastructure plumbing (multi-tenancy, auth, billing)
- 25-stage venture lifecycle validated in production is genuinely novel — no competitor has this depth
- Platform company multiples (10-20x revenue) vs portfolio company multiples (3-5x)
- Data network effects: more ventures → smarter system → better predictions → more ventures
- Revenue diversification: SaaS subscriptions cover operating costs while equity positions become pure upside
- Genesis simulation chamber ("try before you commit") is a differentiator no accelerator offers
- EHG's AI CEO agents managing VPs + crews is architecturally novel

### Arguments Against
- **Methodology may not be separable from the operator**: EHG's success may depend on the chairman's judgment, not the tooling. Selling a fighter jet without the pilot.
- **Survivorship bias in track record**: How many EHG ventures have actually launched, scaled, and exited? Selling an unfinished experiment as a product is a credibility risk.
- **Market may not exist at the right price point**: Venture studios number in hundreds, not thousands. Enterprise buyers expect white-glove service. Individuals expect free.
- **IP exposure risk**: Every Genesis customer becomes a potential competitor. Publishing the playbook gives away the advantage.
- **Resource conflict**: Teaching mode vs building mode compete for leadership attention. Every support ticket for Genesis is time not spent on EHG ventures.
- **AI-assisted venture building is a moving target**: Foundation model capabilities change quarterly. Today's differentiator is tomorrow's commodity.
- **Open-source alternatives will undercut**: Methodology layer is not defensible IP. Free blog posts, YouTube tutorials, and templates cover 80% of value.

## Integration: Data Quality/Coverage Analysis

| Dimension | Score |
|-----------|-------|
| Data Quality | 8/10 (Comprehensive infrastructure, production-proven, well-documented) |
| Coverage | 7/10 (Strong core engine but no multi-tenancy, billing, or external-facing layers) |
| Edge Cases | 5 identified |

**Edge Cases**:
1. **Customer ventures competing with EHG ventures** (High) — Genesis users may build in markets EHG is targeting. No conflict resolution mechanism exists.
2. **Cross-venture learning privacy** (High) — Should learnings from Customer A's ventures improve Customer B's experience? Aggregate vs private patterns.
3. **Vercel deployment per customer** (Moderate) — Currently hardcoded to EHG's Vercel team. Per-customer deployment accounts add complexity and cost.
4. **Chairman approval gates without a chairman** (Moderate) — Stages 3, 5, 13, 23 require "chairman" decisions. External users need role-mapped decision authority.
5. **Agent token budgets at scale** (Moderate) — CEO agents allocated 50K tokens per venture. Multi-customer scale could explode LLM costs.

## Team Perspectives

### Challenger
- **Blind Spots**: (1) Methodology may not be separable from the operator — value is the pilot, not the fighter jet (2) Survivorship bias — EHG's track record is an ongoing experiment, not a validated methodology (3) Market may not exist at the right price point — venture studios are hundreds, not thousands (4) AI-assisted venture building is a moving target — today's differentiator is 18-month commodity (5) Teaching mode vs building mode is a resource conflict — leadership attention is zero-sum (6) Open-source alternatives will undercut — methodology is not defensible IP
- **Assumptions at Risk**: (1) "Our methodology is transferable without us" — may require EHG-level AI literacy, technical skill, and strategic judgment (2) "People will pay meaningful revenue" — venture studio audience is small, enterprise expects white-glove, individuals expect free (3) "Exposing our methodology does not create competitors" — every customer becomes a potential competitor (4) "We can support external users without degrading internal velocity" — external users generate support burden (5) "The venture factory model is the future" — venture studios have existed 20+ years without becoming dominant
- **Worst Case**: Genesis generates modest revenue (enough to survive, not enough to matter) while draining leadership attention from core ventures. Becomes politically difficult to kill because it was a strategic initiative. EHG's greatest asset — focused execution — gets diluted. Slow resource drain with no clear kill signal.

### Visionary
- **Opportunities**: (1) Platform flywheel — transform from portfolio company (3-5x multiple) to platform company (10-20x multiple) (2) Data network effects — 200+ external ventures generate structured data, creating asymmetric prediction advantage (3) Revenue diversification — SaaS subscriptions cover operating costs, equity positions become pure upside (4) Talent/deal flow magnet — founders on Genesis become natural investment targets, engineers become familiar with stack (5) Methodology lock-in through tooling — software-embedded methodology stickier than books/blogs (6) Open-core model — free methodology framework, premium AI insights and cross-venture benchmarking
- **Synergies**: LEO Protocol (generalizable orchestration engine), EVA (strategic advisor as a service), Design System (shared UI accelerator for Genesis ventures), Stage Gates (validation-as-a-service), Cross-Venture Intelligence (aggregate benchmarking), Competitive Intelligence Pipeline (shared market signal feed)
- **Upside Scenario**: 12-18 months — 200+ ventures on platform, first Genesis-built venture raises Series A, ARR $800K-1.2M. Genesis becomes "Y Combinator meets Replit for venture building." Data flywheel creates prediction capability no competitor can replicate. EHG holds equity in 30-50 Genesis ventures. "Genesis-built" becomes a quality signal.

### Pragmatist
- **Feasibility**: 7.5/10 — Productizable with significant engineering lift on multi-tenancy and customer-facing layers. 88% of core components reusable. Missing pieces are infrastructure plumbing, not product innovation.
- **Resource Requirements**: 2-3 senior backend engineers, 12-16 weeks MVP. Phase 1 (weeks 1-6): Multi-tenant schema, auth, core workflow. Phase 2 (weeks 7-12): Full stage gates, billing, support. Phase 3 (months 5+): Cross-venture learning, white-labeling, enterprise. Estimated $50-100K cloud infrastructure costs.
- **Constraints**: (1) Supabase single-tenant design requires schema refactor (2) Chairman-only gate decisions need role mapping (3) Vercel deployment hardcoded to EHG (4) Agent token budgets need per-customer metering (5) Cross-venture learning data trained on EHG ventures (biased)
- **Recommended Path**: Validate demand before building — interview 20 potential customers. Start with content (thought leadership), measure inbound interest. If interest validates, ring-fence investment with hard kill metric (10 paying customers in 6 months). Consider licensing to established venture studios as lower-lift alternative to self-serve SaaS.

### Synthesis
- **Consensus Points**: (1) The technical foundation is exceptional — 80-85% of core product exists (all 3 agree); (2) Multi-tenancy and customer-facing layers are the primary technical gap (Pragmatist + Visionary); (3) Demand validation must happen before significant investment (Challenger + Pragmatist agree)
- **Tension Points**: (1) Challenger sees existential risks (IP exposure, resource drain, market uncertainty) vs Visionary sees category-defining opportunity; (2) Challenger argues methodology requires the operator vs Visionary argues tooling embeds methodology; (3) Pragmatist recommends content-first validation vs Visionary wants to capture first-mover advantage with product
- **Composite Risk**: Medium-High — strong technical foundation reduces build risk, but market risk (do enough buyers exist at viable price points?) and strategic risk (resource conflict, IP exposure) are significant. Demand validation before investment is critical.

## Open Questions
- Should Genesis target enterprise venture studios (high touch, high revenue, small market) or individual founders (low touch, low revenue, large market)?
- What is the kill metric? (Proposed: 10 paying customers in 6 months or redirect effort)
- How do we handle ventures built on Genesis that compete with EHG ventures?
- Should cross-venture learning be shared across all Genesis customers or siloed per customer?
- Is licensing to existing venture studios a better initial strategy than self-serve SaaS?
- What equity stake (if any) should Genesis take in ventures built on the platform?

## Suggested Next Steps
1. Create SD(s) from this brainstorm with vision-key and arch-key linkage
2. Architecture suggests an orchestrator with phased children — Phase 1 (demand validation + multi-tenancy), Phase 2 (product + billing), Phase 3 (growth + enterprise)
3. Critical: Phase 1 must include demand validation (customer interviews) before heavy engineering investment
4. Consider starting with thought leadership content to measure market interest before product build
