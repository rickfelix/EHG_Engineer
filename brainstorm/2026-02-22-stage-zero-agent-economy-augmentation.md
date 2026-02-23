# Brainstorm: Augmenting Stage Zero with Agent Economy Awareness

## Metadata
- **Date**: 2026-02-22
- **Domain**: Protocol (venture evaluation workflow modification)
- **Phase**: Discovery
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: All (cross-cutting evaluation framework change)

---

## Problem Statement

The agent economy is growing rapidly ($10.9B in 2026, 46.3% CAGR to $52.6B by 2030). More people are deploying multiple agents that act on their behalf — discovering, evaluating, and transacting with software products. Stage Zero's 13 synthesis components currently evaluate ventures exclusively through a human-customer lens. This creates a growing blind spot: ventures that could serve agent-customers, or that need agent-discoverable product surfaces, are not being evaluated for this dimension. The goal is to ADD agent economy awareness to Stage Zero without changing existing focus or breaking historical scoring comparability.

## Source Materials

Three research documents were analyzed as input:
1. **Compass Strategic Analysis** — EHG-specific: identifies agent compliance, agent-optimized data services, and fiat agent payment rails as top opportunities. Recommends 50-60% of new venture creation toward agent infrastructure. Notes 18-month window before hyperscaler absorption.
2. **"Building for the Agent Era"** — Technical deep-dive on the agentic infrastructure stack: MCP standardization (97M monthly SDK downloads), non-human identity (45B NHIs by end 2026), sandboxed execution, AIUC-1 compliance framework, seat-based SaaS collapse ($300B Nasdaq Cloud Index loss).
3. **Deep Research Report** — Academic/standards-grounded analysis: OAuth/SPIFFE/DID for agent identity, RAG→graph memory evolution, Firecracker/gVisor/Wasm sandboxing, FAPI 2.0/PCI DSS for payment rails, EU AI Act deployer obligations, OWASP agent-specific attack surfaces.

## Live Research Findings (2026-02-22)

### Agent Market Demand
- Global AI agents market: $10.9B in 2026, projected $52.6B by 2030 (46.3% CAGR)
- 40% of enterprise apps will embed task-specific AI agents by 2026 (up from <5% in 2025)
- 89% of CIOs consider agent-based AI a strategic priority
- 80%+ of organizations believe "AI agents are the new enterprise apps"
- Median 540% ROI for mature implementations (McKinsey)
- BUT: 40%+ of agentic AI projects face cancellation by 2027 (Gartner)

### Marketing to Agents — A New Discipline
- Industry splitting into two strategic problems: traditional SEO (humans browse) vs. AI search optimization (agents parse, trust, act)
- Structured data (schema.org, JSON-LD) is the new marketing channel for agents
- Google's Universal Commerce Protocol (UCP) standardizes agent-to-merchant lifecycle
- Machine-readable product data: clean schema, GTINs/SKUs, live pricing, inventory, policies
- "If an LLM can't parse it, it won't rank it" — agent discoverability requires fundamentally different optimization

### Agent Infrastructure Demand Signals
- 30%+ of API demand increase coming from AI tools using LLMs (Gartner)
- 7.53M AI API calls recorded in past 12 months — 40% YoY increase
- AI API sector projected: $41B → $373B over next 7 years
- APIs evolving from application integration to "AI-consumable capabilities"
- MCP formalizing API exposure as the agent connectivity standard

**Sources**:
- [AI Agent Adoption Statistics by Industry](https://www.salesmate.io/blog/ai-agents-adoption-statistics/)
- [Agentic AI Stats 2026: Adoption Rates, ROI, & Market Trends](https://onereach.ai/blog/agentic-ai-adoption-rates-roi-market-trends/)
- [How Brands Win (or Lose) with AI Agents in 2026 | Yext](https://www.yext.com/blog/2026/02/how-brands-win-or-lose-with-ai-agents-in-2026)
- [Maintaining Brand Sovereignty in the Agentic Web | Schema App](https://www.schemaapp.com/schema-markup/maintaining-brand-sovereignty-in-the-agentic-web/)
- [API Economy 2026: $16.29B Market | Orbilon Tech](https://orbilontech.com/api-economy-2026-business-guide/)
- [API Trends in 2026: Integration Endpoints to AI Control Layers](https://neosalpha.com/top-api-trends-to-watch/)
- [AI API Adoption Trends & Agentic AI Growth | Arcade](https://blog.arcade.dev/api-tool-user-growth-trends)
- [Product Data for AI: Structured Data Optimization 2026 | XICTRON](https://www.xictron.com/en/blog/product-data-ai-optimization-structured-data-2026/)
- [7 AI Trends Shaping Agentic Commerce | commercetools](https://commercetools.com/blog/ai-trends-shaping-agentic-commerce)
- [2026 Outlook: 10 AI Predictions | Sapphire Ventures](https://sapphireventures.com/blog/2026-outlook-10-ai-predictions-shaping-enterprise-infrastructure-the-next-wave-of-innovation/)

---

## Discovery Summary

### User Intent
The user observes that agents are increasingly representing people online, with individuals deploying multiple agents. This doesn't warrant changing existing venture focus — it warrants ADDING an agent economy lens to Stage Zero so ventures are evaluated for both human and agent market potential.

### Three Injection Points Identified
1. **Demand-side**: Can agents be customers of this venture? (affects portfolio evaluation, virality, market sizing)
2. **Supply-side**: Is the venture's product surface agent-consumable? API-first, MCP-ready, structured data (affects moat architecture, design evaluation)
3. **Marketing/Discovery**: How does this venture get found and chosen by agents? Schema.org, machine-readable pricing, agent-friendly data formats (potentially new Component 14)

### Additional Considerations
- Research Department should maintain an "agent economy pulse" as context input to Stage Zero
- Additional model functionality needed in the financial modeling component for agent-market TAM estimation
- "Marketing to agents" is a genuinely new discipline that requires new evaluation criteria

---

## Analysis

### Arguments For
- The agent economy is real and growing at 46% CAGR — ignoring it in venture evaluation creates a compounding blind spot
- Stage Zero's architecture is built for extension: profile-driven weights, parallel components with defensive error handling, JSONB flexibility
- First-mover on systematic evaluation — no venture studio has a 14-component synthesis engine scoring agent readiness; the evaluation data becomes proprietary
- Low cost to start: prompt-only changes in 3 components, ~8 hours, $5-10 API cost, fully reversible with git revert
- Jevons Paradox: cheaper models = more agents = more demand for agent-consumable infrastructure — ventures evaluated for this benefit from a macro tailwind

### Arguments Against
- Hallucination amplification: LLMs will produce confident agent-adoption scores for a market that barely exists, with no empirical ground truth
- Score pollution risk: modifying prompts changes the scoring rubric without versioning, making historical venture comparisons unreliable
- Premature optimization: agent purchasing autonomy may be 3-5 years away; current agents execute human-specified tasks, not autonomous discovery/purchasing
- Testing debt (1 test file for 13 components) means regressions are caught only when bad ventures pass or good ones get blocked
- Risk of narrative capture: embedding agent-economy optimism into prompts may bypass the Narrative Risk component's hype-detection role

---

## Team Perspectives

### Challenger
- **Blind Spots**:
  1. Profile weight system can't absorb cross-cutting concerns — modifying prompts conflates human and agent evaluation axes, making composite scores non-comparable
  2. No consideration of LLM hallucination amplification — agent economy questions ask LLMs to predict behavior of systems that barely exist
  3. No rollback or A/B mechanism for prompt changes — gate signal service records profile versions but not prompt versions
- **Assumptions at Risk**:
  1. "Agents as customers" may not be meaningful in the 6-24 month venture evaluation timeframe
  2. Adding Component 14 is more complex than a slot-in (Promise.all destructuring, weight normalization, profile migration, downstream consumers)
  3. Research Department data feed doesn't exist yet — strategic-context-loader has no plug for arbitrary research feeds
- **Worst Case**: Hype trough + score pollution + no rollback = 3-6 months of contaminated venture pipeline data and misallocated build resources

### Visionary
- **Opportunities**:
  1. Every venture gets a "shadow TAM" — agent-mediated market exists parallel to human market, potentially transforming ventures that score mediocre on human virality but high on agent consumability
  2. New moat type: "integration depth" — agents that have learned your API create compounding switching costs (workflow retraining cost)
  3. Component 14 as intelligence amplifier — agent discoverability is a meta-lens that re-scores moat, virality, design, and attention capital
- **Synergies**: Research Department gets a concrete first use case; Jevons Paradox creates portfolio-wide tailwind; dual-strategy positioning (outbound human + inbound agent)
- **Upside Scenario**: Within 12 months, evaluation data across 50+ ventures reveals agent-readiness patterns no competitor has — the evaluation engine itself becomes licensable IP. Portfolio ventures discover each other through agent workflows, creating self-organizing agent ecosystem effects.

### Pragmatist
- **Feasibility**: 4/10 (architecture ready, testing debt is the real constraint)
- **Resource Requirements**: 16-25 hours total across 3 phases, $5-10 LLM costs, no additional infrastructure
- **Constraints**:
  1. Testing debt (1 test file for 13 components) is the binding risk
  2. Weight redistribution is zero-sum — breaks historical baselines
  3. Agent economy pulse data source doesn't exist yet
- **Recommended Path**: Three-phase rollout:
  - **Phase 1 (MVP, ~8 hours)**: Prompt-only changes to 3 existing components + static agent context block + snapshot tests. Zero pipeline/weight/schema changes.
  - **Phase 2 (when Phase 1 proves value)**: Component 14 as advisory-only + new evaluation profile "agent_economy_v1" + real data sub-loader
  - **Phase 3 (when Research Dept ships)**: Dynamic data feed + cross-component modifiers + weighted scoring integration

### Synthesis
- **Consensus Points**: Start with prompts (not structure); Component 14 advisory-only initially; testing debt is the binding constraint
- **Tension Points**: How ambitious demand-side augmentation should be; whether Component 14 should be a lens or independent score; narrative risk safeguard vs. narrative capture
- **Composite Risk**: Medium — silent scoring degradation in a test-poor system, mitigated by phased rollout and advisory-only positioning

---

## Proposed Architecture

### Phase 1: Minimum Viable Augmentation (Prompt-Level)

**Moat Architecture** (Component 4) — Add agent_consumability dimension:
```
7. agent_consumability: API-first readiness, MCP compatibility, machine-readable interfaces, structured data exposure
```
Scored 0-10 alongside existing 6 moat types, with month 1/6/12/24 compounding trajectory.

**Portfolio Evaluation** (Component 2) — Add agent ecosystem dimension:
```
6. agent_ecosystem: Can agents discover, evaluate, and transact with this venture programmatically? Is there agent cross-sell potential across the portfolio?
```
Scored 0-10 alongside existing 5 dimensions.

**Design Evaluation** (Component 10) — Add machine interface quality:
```
6. machine_interface_quality: API design clarity, structured data completeness, schema.org readiness, agent-friendly documentation
```
Scored 1-10 alongside existing 5 dimensions.

**Strategic Context Loader** — Add static agent economy context block:
```javascript
// In strategic-context-loader.js, add to context assembly
agentEconomyContext: {
  market_size_2026: '$10.9B',
  cagr: '46.3%',
  enterprise_adoption: '40% of apps embedding agents by 2026',
  key_protocols: ['MCP (97M monthly SDK downloads)', 'Google A2A', 'Universal Commerce Protocol'],
  pricing_shift: 'Seat-based SaaS collapsing → usage/outcome-based',
  risk_signal: '40%+ agentic projects face cancellation by 2027 (Gartner)'
}
```
Replace with dynamic Research Department feed in Phase 3.

### Phase 2: Component 14 (Advisory-Only)

**Agent Discoverability** — 5 sub-dimensions:
1. `machine_readability` (25%): Structured data, schema.org, JSON-LD exposure
2. `protocol_compatibility` (25%): MCP server availability, A2A readiness, standard API surface
3. `agent_purchasing_friction` (20%): Usage-based pricing, programmatic signup, API-key provisioning
4. `discovery_surface_area` (15%): Registry presence, agent marketplace listings, tool catalog inclusion
5. `data_freshness` (15%): Real-time pricing, inventory, capability signals for agent decision-making

Advisory only (weight 0.00 in composite) — surfaces as signal for chairman review, like narrative_risk and attention_capital.

### Phase 3: Dynamic Feed + Cross-Component Integration

- Research Department maintains `agent_economy_pulse` table with periodically updated signals
- Strategic context loader pulls live data
- Cross-component analysis: Component 14 scores modulate confidence bands on Components 2, 4, 9, 10
- `agent_economy_weight` field in evaluation profiles, starting at 0.0, increased as empirical data validates signal quality

### Safety Mechanisms

1. **Narrative Risk correlation**: Run Component 11 with explicit agent-economy hype detection — flag ventures where agent-market scores are high but Narrative Risk band is NR-High or NR-Critical
2. **Score separation**: Agent dimensions stored as sub-fields within component outputs, not folded into main dimension scores — allows filtering and comparison
3. **Snapshot tests**: Baseline 3 components BEFORE prompt changes; verify post-change schema validity and <15% score drift
4. **Time-gating**: New evaluation profile "agent_economy_v1" created alongside default — chairman can opt into agent-aware evaluation per venture

---

## Open Questions

1. **When should agent-economy weight move from 0.0 to non-zero?** What empirical signal would justify adding Component 14 to the weighted composite? (e.g., 3+ ventures where agent discoverability predicted real traction)
2. **How should the financial model (modeling.js) handle dual TAM?** Should it produce separate human-TAM and agent-TAM projections, or a blended estimate?
3. **Should the Research Department's agent economy pulse track specific signals?** (MCP server registry growth, agent transaction volumes, enterprise agent budget allocation, framework market share)
4. **What about the marketing-to-agents dimension for EXISTING portfolio ventures?** Stage Zero evaluates new ventures, but current ventures may need agent-readiness assessment retroactively.
5. **How does the Narrative Risk component distinguish genuine agent-economy signal from hype?** Need explicit heuristics or ground-truth anchors.

---

## Suggested Next Steps

1. **Create an SD for Phase 1** — Prompt-level changes to 3 components + static context block + snapshot tests (~8 hours, low risk, fully reversible)
2. **Run /learn on the three research documents** — Capture the agent economy market data, infrastructure stack taxonomy, and protocol convergence signals as organizational knowledge
3. **Brainstorm the Research Department's agent economy tracking scope** — Separate session to define what signals to monitor and how to surface them
4. **After Phase 1 runs on 5-10 ventures**: Evaluate whether agent-economy scores actually differentiated venture quality, then decide on Phase 2 timing
