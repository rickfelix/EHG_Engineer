# Brainstorm: Mental Models Repository — Full Integration Architecture

## Metadata
- **Date**: 2026-03-06
- **Domain**: Architecture (with Venture cross-domain elements)
- **Phase**: Design
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives) — two rounds (concept + integration)
- **Related Ventures**: PortraitPro AI (active)
- **Builds On**: `brainstorm/2026-03-06-mental-models-repository-venture-workflow.md`

---

## Problem Statement

The EHG 25-Stage Venture Workflow makes hundreds of decisions per venture — from initial opportunity identification (Stage 0) through launch and ongoing operations. These decisions rely on implicit mental models that are:

1. **Hardcoded into LLM prompts** — Stage 0's `deconstructToFirstPrinciples` already applies First Principles Thinking, but it's baked into a single prompt string. No other models are applied. No operator knows this is happening.
2. **Inconsistently applied across paths** — Competitor Teardown applies first-principles deconstruction. Discovery Mode does not. Blueprint Browse applies nothing (no LLM calls). Each path produces venture concepts of varying analytical quality.
3. **Not tracked for effectiveness** — When a venture succeeds or fails at Stage 3's Kill Gate, there's no linkage back to which analytical frameworks were used during its conception. No institutional learning accumulates.
4. **Missing from critical downstream stages** — Branding (Stages 10-12), marketing material planning (Stages 13-16), and post-launch operations have no structured decision frameworks at all.

The user requires a **fully automated** integration that works within the current application design, requires zero new UI elements, and does not regress any existing Stage 0 behavior.

## Discovery Summary

### Key Design Decisions (from user)

| Decision | Choice |
|----------|--------|
| Delivery mechanism | AI auto-suggests based on stage/context/archetype |
| Output types | All three: guided exercises, scored evaluations, structured artifacts |
| Stage scope | Stages 0-12 (TRUTH, ENGINE, IDENTITY) + Stages 13-16 (BUILD) + Stages 17-25 (LAUNCH) + Operations |
| Branding/Design | Yes — mental models applied to product branding, visual identity, positioning |
| Marketing material | Yes — marketing asset planning, channel selection, content strategy |
| LEO integration | Venture workflow only (not LEO Protocol itself) |
| Learning system | Track & rank effectiveness correlated with venture outcomes |
| Automation level | Fully automated — zero new buttons, zero new screens |

### Critical Constraint (from user)
> "Stage 0 already has a lot of logic built into it. How do we integrate it into Stage 0 without taking two steps backwards?"

This drove the 3-layer integration architecture that uses existing extension points and follows established patterns already in the codebase.

---

## Current Stage 0 Architecture (As-Is)

### Data Flow
```
User clicks "Explore Opportunities"
         │
         ├── "Analyze a Competitor" → CompetitorTeardownDialog (enter URLs)
         │     └── Backend: analyzeCompetitor() → deconstructToFirstPrinciples() → [gapAnalysis()]
         │
         ├── "Find Me Opportunities" → DiscoveryModeDialog (4 radio buttons)
         │     ├── Trend Scanner (app_rankings + LLM)
         │     ├── Democratization Finder (LLM)
         │     ├── Capability Overhang (LLM)
         │     └── Nursery Re-eval (venture_nursery + LLM)
         │
         └── Blueprint Browse → Approve button on BlueprintCard
               └── Backend: loadBlueprint() → applyCustomizations() (no LLM)
         │
         ▼
    PathOutput (standardized contract)
         │
         ▼
    Synthesis (13 components in Promise.all())
    ├── 1. Cross-Reference Intellectual Capital
    ├── 2. Portfolio-Aware Evaluation
    ├── 3. Active Problem Reframing ← rewrites problem statement
    ├── 4. Moat Architecture (7 moat types)
    ├── 5. Chairman Constraints (10 hard constraints)
    ├── 6. Time-Horizon Positioning
    ├── 7. Venture Archetype Recognition (6 archetypes)
    ├── 8. Build Cost Estimation
    ├── 9. Virality Analysis
    ├── 10. Design Evaluation
    ├── 11. Narrative Risk (advisory)
    ├── 12. Tech Trajectory (advisory)
    └── 13. Attention Capital (advisory)
         │
         ▼
    Chairman Review (deterministic: constraints.verdict → maturity → decision)
         │
         ▼
    Persist to DB (ventures, venture_briefs, venture_artifacts, chairman_decisions)
         │
         ▼
    Stage 1 → Stage 2 → Stage 3 (Kill Gate) → ... → Stage 25 → Operations
```

### Existing Extension Points Used

| Extension Point | Where | Pattern | Mental Models Usage |
|----------------|-------|---------|-------------------|
| `deps.synthesize` wrapper | Orchestrator Step 2 | Injectable function | Add Component 14 |
| `strategicContext.formattedPromptBlock` | Discovery Mode LLM calls | Context block injection | Add `mentalModelContextBlock` |
| `getCapabilityContextBlock()` | Discovery Mode LLM calls | Context block injection | Same pattern |
| `deps` parameter bag | All path handlers | Dependency injection | Pass model context |
| `onBeforeAnalysis` hook | Stage 1 template | Pre-analysis context injection | Inject model recommendations |
| `venture.created` event | Post-persist | Event handler registration | Effectiveness tracking |
| `chairman_constraints` DB table | Component 5 | Runtime-loaded constraint rows | Model-grounded constraints |
| `evaluation_profiles` DB table | Profile service | Configurable weights | Advisory weighting |

---

## 3-Layer Integration Architecture (To-Be)

### Layer 1: Path-Level Injection (Inside Existing Path LLM Calls)

**Purpose**: Inform the LLM prompts that *generate* the venture concept with relevant mental models. This is the highest-impact layer because it shapes the venture from conception.

**Pattern**: Identical to how `strategicContext` and `capabilityContext` are already injected into Discovery Mode prompts. A new `getMentalModelContextBlock()` function returns a formatted prompt block.

```
getMentalModelContextBlock(stage, path, strategy, archetype?)
  → Queries mental_models table for matching models
  → Selects top 3-5 by (path_affinity * historical_effectiveness)
  → Returns formatted prompt block:

    "=== ANALYTICAL FRAMEWORKS ===
     Apply these mental models to sharpen your analysis:

     1. JOBS TO BE DONE: What job is the customer hiring this product to do?
        Focus on the functional, emotional, and social dimensions.

     2. INVERSION: What would guarantee this venture fails?
        List those failure modes and verify the analysis avoids them.

     3. BLUE OCEAN STRATEGY: Where is the uncontested market space?
        Don't just improve on competitors — find where they aren't.
     ==="
```

**Per-Path Integration**:

#### Competitor Teardown
| LLM Call | Current Behavior | With Mental Models |
|----------|-----------------|-------------------|
| `analyzeCompetitor(url)` | Extracts features, weaknesses, automation potential | + JTBD framing ("what job does this competitor's customer hire them for?"), Inversion ("what weaknesses would kill this business?") |
| `deconstructToFirstPrinciples(analyses)` | Already applies First Principles (hardcoded) | + Blue Ocean ("where's the uncontested space?"), Signal vs. Noise ("which findings are actionable vs. noise?"), Leverage ("which automation has disproportionate impact?") |
| `runGapAnalysis(analyses)` | Finds gaps across competitors | + Pareto Principle ("which 20% of gaps represent 80% of opportunity?"), Survivorship Bias ("are we only studying successful competitors?") |

**Code change**: ~15 lines in `competitor-teardown.js` — add `mentalModelContext` to the prompt template string, same as existing context blocks.

#### Discovery Mode (All 4 Strategies)
| Strategy | Current Context Injected | Mental Models Added |
|----------|------------------------|-------------------|
| Trend Scanner | `strategicContext` + `capabilityContext` + `app_rankings` data | Signal vs. Noise, Pareto Principle, Second-Order Thinking |
| Democratization Finder | `strategicContext` + `capabilityContext` | Blue Ocean Strategy, Leverage, First Principles |
| Capability Overhang | `capabilityContext` (tuned for overhang) | Circle of Competence, Activation Energy, Opportunity Cost |
| Nursery Re-eval | `venture_nursery` data | Zero-Based Thinking, Rational Optimism, Antifragility |

**Code change**: ~10 lines in `discovery-mode.js` — add `mentalModelContext` to the prompt assembly section, following the existing `capabilityContext` pattern.

#### Blueprint Browse
No LLM calls in this path — mental models apply at Layer 2 (synthesis) only.

### Layer 2: Synthesis Component 14 (Post-Path Analysis)

**Purpose**: Run model-specific evaluation exercises on the PathOutput after the path completes. This produces structured analytical artifacts that persist with the venture record.

**Runs inside** the existing `Promise.all()` alongside components 1-13.

**Implementation**:
```javascript
// Wrapper pattern — zero changes to orchestrator
async function enhancedSynthesis(pathOutput, deps) {
  const result = await runSynthesis(pathOutput, deps);  // existing 13 components

  // Component 14: Mental Model Analysis (advisory, fail-safe)
  result.metadata.synthesis.advisory = result.metadata.synthesis.advisory || {};
  result.metadata.synthesis.advisory.mental_model_analysis =
    await analyzeMentalModels(pathOutput, deps).catch(() => null);

  return result;
}
```

**Inside `analyzeMentalModels()`**:
1. Query `mental_models` for stage=0 + detected archetype models
2. Select top 3-5 models (excluding any already applied in Layer 1)
3. Run exercise templates in nested `Promise.all()` (parallel, not sequential)
4. 8-second timeout via `Promise.race()` — returns partial results if exceeded
5. Return structured results:

```javascript
{
  component: 'mental_model_analysis',
  models_applied: [
    {
      model_id: 'uuid',
      model_name: 'Inversion',
      exercise_type: 'scored_evaluation',
      output: { /* model-specific structured result */ },
      score: 7.5,
      confidence: 0.8,
      key_insight: "Three failure modes identified: dependency on single platform..."
    }
  ],
  layer1_models: ['JTBD', 'Blue Ocean'],  // already applied in path
  composite_insight: "Cross-model synthesis: ...",
  duration_ms: 3200
}
```

6. Log applications to `mental_model_applications` table (async, non-blocking via `setImmediate`)

### Layer 3: Stage Progression (Stages 1-25 + Operations)

**Purpose**: Carry mental model context forward through the entire venture lifecycle. Each stage reads which models were applied and continues the analytical thread.

**Mechanism**: `onBeforeAnalysis` hook pattern (already proven in Stage 1's `recommendTemplates()`).

#### THE TRUTH (Stages 1-5)

| Stage | Key Decision | Primary Models | Application |
|-------|-------------|----------------|-------------|
| 1: Idea Capture | Formalize the venture concept | First Principles, JTBD | Sharpen problem statement, validate assumptions from Stage 0 |
| 2: Idea Validation (MoA) | Multi-persona analysis | Double Think, Agency Math | Force consideration of opposing perspectives, categorize controllables |
| 3: Kill Gate | Go/No-Go decision | Inversion, Meaningful Metrics, Grit vs. Quit | "What would guarantee failure?" + "Are we measuring real success?" |
| 4: Competitive Intel | Competitor landscape | Blue Ocean, Survivorship Bias | Find uncontested space; study failures, not just winners |
| 5: Profitability Kill Gate | Financial viability | Margin of Safety, Opportunity Cost | Buffer estimates; consider what else this capital could do |

#### THE ENGINE (Stages 6-9)

| Stage | Key Decision | Primary Models | Application |
|-------|-------------|----------------|-------------|
| 6: Business Model | Revenue mechanics | Leverage, Network Effects, Pareto Principle | Focus on high-leverage revenue; identify compounding mechanics |
| 7: Growth Strategy | Scaling plan | Compounding, Reflexivity, Three Horizons | Small gains compound; actions shape market; plan across time horizons |
| 8: Pricing | Price architecture | Law of Contrast, Friction Reduction, Forcing Functions | Price relative to alternatives; reduce purchase friction; design for desired behavior |
| 9: Financial Projections | Forecast & plan | Probabilistic Thinking, Margin of Safety, Rational Optimism | Assign probabilities to scenarios; build buffers; ground optimism in data |

#### THE IDENTITY (Stages 10-12) — Branding & Design

| Stage | Key Decision | Primary Models | Application |
|-------|-------------|----------------|-------------|
| 10: Brand Identity | Visual identity, brand voice, design system | **Law of Contrast** — position brand relative to competitors. **Reflexivity** — brand perception shapes user behavior, which shapes brand. **Emotional Blindness Triggers** — identify emotional associations to leverage or avoid | **Guided exercise**: Brand positioning canvas scored against each model. **Artifact**: Brand guidelines document with model-grounded rationale for each decision. |
| 11: Positioning | Market positioning, messaging hierarchy | **Pyramid Principle** — lead with the answer (value prop), not the story. **Law of Motivational Beliefs** — what does your customer *want to believe*? Your positioning should reinforce that. **JTBD** — position around the job, not the product | **Scored evaluation**: Messaging tested against each model's criteria. **Artifact**: Positioning statement with JTBD alignment score. |
| 12: Narrative | Brand story, content pillars | **Narcissism Razor** — customers aren't thinking about your brand; speak to *their* concerns. **Signal vs. Noise** — which brand touchpoints actually drive perception vs. are invisible? **Compounding** — content and brand equity compound; short-term campaigns don't | **Guided exercise**: Narrative audit through each model lens. **Artifact**: Content pillar strategy with compounding-potential ratings. |

#### THE BUILD (Stages 13-16) — Marketing Material & Planning

| Stage | Key Decision | Primary Models | Application |
|-------|-------------|----------------|-------------|
| 13: Marketing Strategy | Channel selection, campaign architecture | **Pareto Principle** — which 20% of channels drive 80% of acquisition? **Meaningful Metrics** — track conversions and LTV, not impressions and likes. **Friction Reduction** — minimize steps from ad impression to conversion | **Scored evaluation**: Each proposed channel scored against Pareto leverage and friction analysis. **Artifact**: Channel priority matrix with model-backed rationale. |
| 14: Marketing Assets | Image creation, copy, visual content | **Blue Ocean Strategy** — marketing that doesn't look like everyone else's (avoid "AI startup aesthetic"). **JTBD** — marketing copy speaks to the job, not features ("You need X done" vs. "We have Y feature"). **Inversion** — "What would make someone scroll past this ad?" → avoid that | **Guided exercise**: Asset brief generator that applies each model to the creative direction. **Artifact**: Marketing asset spec with model-informed constraints (e.g., "No feature lists in hero — JTBD framing only"). |
| 15: Launch Prep | Launch timeline, campaign sequencing | **Activation Energy** — what's the minimum push needed to get first users? **Forcing Functions** — design launch with built-in urgency (limited beta, waitlist). **Second-Order Thinking** — what happens after the launch spike? Plan for Day 31 | **Scored evaluation**: Launch plan stress-tested against each model. |
| 16: GTM Execution | Go-to-market execution | **Agency Math** — what can you control (product), influence (community), and not control (market timing)? **Compounding** — invest in compounding channels (SEO, content, community) over decaying ones (paid ads). **Reflexivity** — early traction signals shape the market's response to you | **Artifact**: GTM execution plan with model-backed channel allocations. |

#### LAUNCH (Stages 17-25) — Execution & Scaling

| Stage Range | Key Decisions | Primary Models |
|-------------|--------------|----------------|
| 17-19: Initial Launch | User onboarding, early metrics, first iterations | Meaningful Metrics, Friction Reduction, Activation Energy |
| 20-22: Growth Phase | Scaling what works, retention | Compounding, Network Effects, Leverage, Grit vs. Quit |
| 23-25: Maturity | Optimization, expansion, handoff | Three Horizons, Zero-Based Thinking, Antifragility |

#### OPERATIONS (Post-Stage 25)

| Area | Key Decisions | Primary Models | Application |
|------|--------------|----------------|-------------|
| Portfolio Management | Which ventures to double down, maintain, or sunset | **Three Horizons of Growth** — balance defend/build/create across the portfolio. **Opportunity Cost** — every dollar in Venture A is a dollar not in Venture B. **Zero-Based Thinking** — "If we were starting fresh, would we fund this?" | **Scored evaluation**: Quarterly portfolio review using model-based rubrics. |
| Operational Optimization | Process improvement, cost reduction | **Theory of Constraints** — find and optimize the bottleneck. **Pareto Principle** — which 20% of operations drive 80% of cost or value? **Friction Reduction** — remove operational friction that slows delivery | **Guided exercise**: Constraint identification and bottleneck scoring. |
| Venture Health Monitoring | Ongoing performance tracking | **Meaningful Metrics** — are we tracking what matters? **Antifragility** — are disruptions making us stronger? **Reflexivity** — how is our success changing the competitive landscape? | **Artifact**: Venture health dashboard with model-aligned KPIs. |
| Strategic Pivots | When to pivot, expand, or kill a running venture | **Grit vs. Quit** — are we in the "messy middle" of something worthwhile, or riding a dead horse? **Inversion** — what would guarantee this venture fails from here? Are we doing any of those things? **Regret Minimization** — in 10 years, will we regret not pivoting? | **Guided exercise**: Pivot analysis through each model lens with go/no-go recommendation. |
| Marketing Refresh | Ongoing marketing performance, creative fatigue | **Signal vs. Noise** — which campaigns still drive real conversions? **Law of Reversed Effort** — sometimes marketing harder makes it worse (ad fatigue). **Compounding** — shift budget from decaying channels to compounding ones | **Scored evaluation**: Campaign performance through model lenses. |
| Brand Evolution | Brand refresh, repositioning | **Reflexivity** — your brand's success has changed how the market sees you. **Law of Contrast** — new competitors change your positioning baseline. **McKinsey 7-S** — is the organization still aligned with the brand promise? | **Artifact**: Brand health audit with model-grounded recommendations. |

---

## Mental Models Catalog (43 Models)

### McKinsey Frameworks (4)

| # | Model | Core Concept | Primary Stages |
|---|-------|-------------|----------------|
| 1 | **MECE** | Break problems into non-overlapping, complete parts | 0, 1-3, 6-7 |
| 2 | **McKinsey 7-S Framework** | 7 organizational elements that must align | 10-12, Ops |
| 3 | **Three Horizons of Growth** | Portfolio across defend/build/create timelines | 6-9, Ops |
| 4 | **Pyramid Principle (Minto)** | Answer-first communication structure | 10-12 (messaging) |

### Decision & Reasoning Models (12)

| # | Model | Core Concept | Primary Stages |
|---|-------|-------------|----------------|
| 5 | **First Principles Thinking** | Decompose to fundamentals, rebuild | 0, 1-2 |
| 6 | **Inversion** | Define opposite of success, avoid it | 0, 3-5, 14 |
| 7 | **Second-Order Thinking** | Consequences of consequences | 0, 6-9, 15 |
| 8 | **Occam's Razor** | Simplest explanation wins | 1-3 |
| 9 | **Signal vs. Noise** | Actionable info vs. chatter | 0, 1-5, 12, Ops |
| 10 | **Probabilistic Thinking** | Assign probabilities, update with evidence | 0, 3-5, 9 |
| 11 | **Double Think** | Hold paradoxical ideas simultaneously | 0, 2-5 |
| 12 | **Map is Not the Territory** | Models are approximations, not reality | 1-3 |
| 13 | **Hanlon's Razor** | Don't attribute to malice what's explained by incompetence | 3-5, Ops |
| 14 | **Law of Causes and Effect** | Outcomes = stacking of smaller causes | 1-3, Ops |
| 15 | **Zero-Based Thinking** | "If starting from scratch, what would I do?" | 0, 23-25, Ops |
| 16 | **Agency Math** | Control / influence / outside control | 0, 3-5, 16 |

### Market & Strategy Models (8)

| # | Model | Core Concept | Primary Stages |
|---|-------|-------------|----------------|
| 17 | **Blue Ocean Strategy** | Create uncontested market space | 0, 1-3, 6, 14 |
| 18 | **Jobs to Be Done** | Customers hire products to do jobs | 1-3, 6-7, 11, 14 |
| 19 | **Network Effects** | Value increases with more users | 6-9, 20-22 |
| 20 | **Pareto Principle (80/20)** | 80% of results from 20% of effort | 6-9, 13, Ops |
| 21 | **Theory of Constraints** | Find and optimize the bottleneck | 6-9, Ops |
| 22 | **Opportunity Cost** | True cost = best alternative forgone | 0, 6-7, Ops |
| 23 | **Margin of Safety** | Build buffer for estimation error | 5, 6-9 |
| 24 | **Survivorship Bias** | Study failures, not just winners | 0, 1-4 |

### Psychology & Behavior Models (10)

| # | Model | Core Concept | Primary Stages |
|---|-------|-------------|----------------|
| 25 | **Law of Affective Realism** | Perception filtered through emotion | 0, 1-3 |
| 26 | **Law of Contrast** | Satisfaction driven by comparison | 3-5, 8, 10-12 |
| 27 | **Law of Motivational Beliefs** | People believe what they want to believe | 3-5, 11 |
| 28 | **Emotional Blindness Triggers** | Strong emotions override reason | 0 (chairman), 10 |
| 29 | **Narcissism Razor** | Others aren't judging you | 12, 14 |
| 30 | **Gawdat's Formula for Happiness** | Happiness = perception - expectations | Ops |
| 31 | **Law of Reversed Effort** | Trying harder sometimes makes it worse | Ops (marketing) |
| 32 | **Friction Reduction** | Make desired actions easy, undesired hard | 6-9, 13, 15 |
| 33 | **Forcing Functions & Ulysses Contract** | Design environment to force desired actions | 6-9, 15 |
| 34 | **Regret Minimization Framework** | Choose the option you'd least regret | 0, Ops (pivots) |

### Growth & Resilience Models (9)

| # | Model | Core Concept | Primary Stages |
|---|-------|-------------|----------------|
| 35 | **Compounding** | Small consistent improvements → exponential gains | 6-9, 12, 13, 16, Ops |
| 36 | **Antifragility** | Gain strength from disorder | 6-9, 23-25, Ops |
| 37 | **Leverage** | High-leverage activities yield disproportionate returns | 0, 6-9 |
| 38 | **Rational Optimism** | Optimism grounded in data | 0, 1-3, Nursery Re-eval |
| 39 | **Grit vs. Quit** | Persevere through messy middle vs. walk away | 3-5, 20-22, Ops |
| 40 | **Meaningful Metrics** | Optimize real success, not vanity | 3-5, 6-9, 13, 17-19, Ops |
| 41 | **Reflexivity** | Actions influence environment, environment influences actions | 6-9, 10, 16, Ops |
| 42 | **Activation Energy** | Initial effort threshold to start a process | 0, 1, 15 |
| 43 | **Circle of Competence** | Know what you know — and don't | 0, 6-7, Capability Overhang |

---

## Team Perspectives

### Round 1: Concept Viability (from first brainstorm)

#### Challenger
- **Blind Spots**: Chairman already has unnamed mental models baked into entry path routing; market assumptions embedded in Stage 0 path selection; outcome tracking has measurement problem (model vs. operator?)
- **Assumptions at Risk**: More structured information ≠ better decisions; effectiveness ranking corrupted by survivorship bias; auto-suggestion may kill novel ventures by routing to "proven" models
- **Worst Case**: Sophisticated rationalization engine giving false confidence. 10x opportunities filtered because they don't score well on conventional frameworks.

#### Visionary
- **Opportunities**: "Mental Model as Moat" — methodology differentiation; cross-venture learning loops; AI agent scaling (Chairman 3-4 → 8-10 concurrent ventures)
- **Synergies**: Skill Assessment System pattern reuse; Stage 0 synthesis engine (components 11-14); Research Department intelligence injection; Narrative Risk framework backbone
- **Upside Scenario**: Chairman scales to 8-10 concurrent ventures. Calibrated model effectiveness becomes a sellable asset. "Moneyball of startups."

#### Pragmatist
- **Feasibility**: 6.5/10 (concept level)
- **Resources**: 18-23 person-weeks full MVP; ~$180-240K developer time
- **Recommended Path**: Phase 1 MVP (8-10 weeks), 12-15 models, Stage 0 + THE TRUTH only

### Round 2: Integration Architecture

#### Challenger
- **Blind Spots**: (1) `Promise.all()` fail-fast gives new component veto power over existing 13 — needs `.catch(() => null)` guard. (2) Write side-effect (`mental_model_applications` logging) inside synthesis creates dirty-write surface at scale. (3) Auto-selection logic is unspecified but determines latency, cost, and output determinism.
- **Assumptions at Risk**: (1) `deps.synthesize` wrapper may have undocumented downstream expectations about component count/shape. (2) "Advisory only" status enforced by convention, not code — fragile across maintenance cycles. (3) LLM exercise templates are non-deterministic, complicating audit trails.
- **Worst Case**: Silent latency regression (Component 14 becomes P99 bottleneck at 30s) + duplicate write corruption in `mental_model_applications` — invisible from product perspective, discovered weeks later during analytics.

#### Visionary
- **Opportunities**: (1) `dataFeed` extension on Tech Trajectory is pre-wired — inject model-relevance payload that flows into every component. (2) Chairman constraints DB table can carry model-grounded constraints across all 12 stages. (3) `venture.created` event creates a self-improving feedback loop without ML infrastructure.
- **Synergies**: Stage 1 `recommendTemplates()` is the proven pattern for `onBeforeAnalysis` context injection. Existing `strategicContext` + `capabilityContext` injection in Discovery Mode is the exact pattern for Layer 1.
- **Upside Scenario**: Mental models become the "strategic coherence layer" — ventures that reach Stage 12 are demonstrably coherent because their execution and identity reflect strategic logic from Stage 0. Infrastructure cost: zero new UI, zero new compute paths, zero existing file modifications.

#### Pragmatist
- **Feasibility**: 6/10
- **Resources**: 3-4 weeks solo dev (810-1,120 LOC); 4 DB tables; LLM cost $0.002-0.45/venture depending on model tier
- **Constraints**: (1) Time-budget pressure — Component 14 with 3-5 LLM calls must use nested `Promise.all()` + 8s timeout to avoid becoming bottleneck. (2) Content authorship is domain expert work, not engineering — rushed templates = noise amplified by effectiveness tracking. (3) Advisory-only status needs structural enforcement (namespace under `metadata.synthesis.advisory`).
- **Recommended Path**: (1) Instrument current pipeline P95 latency first (2-4 hours). (2) DB migrations + 5-7 seed models. (3) Component 14 with hardcoded selection. (4) Scoring algorithm + archetype affinity. (5) Stage 1-5 hooks as follow-on SD.

### Synthesis

- **Consensus Points**: `deps.synthesize` wrapper is correct integration point; time-budget is #1 technical risk; content quality is #1 non-technical risk; advisory namespace enforcement is mandatory; self-improving feedback loop via `venture.created` event is the long-term differentiator
- **Tension Points**: Visionary's "coherence layer across all 12 stages" (ambitious scope) vs Pragmatist's "Stage 0 first, hooks later" (incremental); Challenger's "auto-suggestion kills novel ventures" vs Visionary's "methodology differentiation"; write-side-effects in synthesis (logging) as risk vs. necessity for learning
- **Composite Risk**: **Medium-Low** — architecture is well-suited for additive integration; risks are operational (latency, content quality) not structural

---

## Architecture Design

### 3-Layer Integration

```
Layer 1: PATH-LEVEL (inside existing path LLM calls)
┌─────────────────────────────────────────────────────────────────┐
│  getMentalModelContextBlock(stage=0, path, strategy)            │
│  → Queries mental_models for path+strategy-relevant models      │
│  → Returns formatted prompt block (same shape as strategic ctx) │
│  → Injected into: competitor teardown (2-3 calls)               │
│                    discovery mode (1 call per strategy)          │
│  → NOT injected into: blueprint browse (no LLM calls)           │
│  Code change: ~15 lines per path handler (follows existing      │
│  context injection pattern)                                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
Layer 2: SYNTHESIS COMPONENT 14 (post-path, in Promise.all)
┌─────────────────────────────────────────────────────────────────┐
│  deps.synthesize wrapper → runSynthesis() + analyzeMentalModels │
│  → Runs model exercises via nested Promise.all() (parallel)     │
│  → 8-second timeout via Promise.race()                          │
│  → Stores in metadata.synthesis.advisory.mental_model_analysis  │
│  → Logs to mental_model_applications (async, non-blocking)      │
│  → .catch(() => null) fail-safe — never blocks existing 13      │
│  Code change: 0 lines in orchestrator (wrapper pattern)         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
Layer 3: STAGE PROGRESSION (Stages 1-25 + Operations)
┌─────────────────────────────────────────────────────────────────┐
│  onBeforeAnalysis hooks read venture.metadata for applied models│
│  → Stage-appropriate models injected into analysis context      │
│  → Outcomes tracked for effectiveness learning                  │
│  → Proven pattern from Stage 1 recommendTemplates()             │
│  Code change: ~10 lines per stage template hook                 │
└─────────────────────────────────────────────────────────────────┘
```

### Safety Guarantees

| Guarantee | Mechanism | Enforcement |
|-----------|-----------|-------------|
| **Fail-safe** | `.catch(() => null)` on Component 14 | If mental model analysis crashes, existing 13 components unaffected |
| **Advisory-only** | `metadata.synthesis.advisory.*` namespace | Excluded from `extractComponentScore()` and `calculateWeightedScore()` |
| **Time-bounded** | `Promise.race([analysis, timeout(8000)])` | Component 14 never exceeds 8s regardless of model count |
| **Non-blocking logging** | `setImmediate(() => logApplication(...))` | DB writes don't block synthesis pipeline |
| **Idempotent** | Unique constraint on `(venture_id, model_id, stage)` | Retry-safe, no duplicate application records |

### Database Schema

```sql
-- Core model definitions (seed with 43 models)
CREATE TABLE mental_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL,  -- decision, market, psychology, growth, framework
  description TEXT NOT NULL,
  core_concept TEXT NOT NULL,
  applicable_stages INTEGER[] NOT NULL,    -- [0, 1, 2, 3, ...]
  applicable_paths TEXT[],                  -- ['competitor_teardown', 'discovery_mode']
  applicable_strategies TEXT[],             -- ['trend_scanner', 'democratization_finder']
  applicable_archetypes TEXT[],             -- venture archetypes
  difficulty_level TEXT DEFAULT 'intermediate',
  exercise_template JSONB,                  -- parameterized prompt template
  evaluation_rubric JSONB,                  -- scoring dimensions and weights
  artifact_template JSONB,                  -- output structure template
  prompt_context_block TEXT,                -- pre-formatted injection block for Layer 1
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Track which models were applied to which ventures at which stages
CREATE TABLE mental_model_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID REFERENCES mental_models(id) NOT NULL,
  venture_id UUID,
  stage_number INTEGER NOT NULL,
  layer TEXT NOT NULL,                      -- 'path_injection' | 'synthesis' | 'stage_hook'
  path_used TEXT,                           -- 'competitor_teardown' | 'discovery_mode' | null
  strategy_used TEXT,                       -- 'trend_scanner' | etc. | null
  applied_by TEXT DEFAULT 'ai_auto',        -- 'ai_auto' | 'manual'
  exercise_output JSONB,                    -- structured exercise result
  evaluation_score NUMERIC,                 -- 0-10 model-specific score
  artifact_data JSONB,                      -- generated artifact
  operator_rating INTEGER,                  -- 1-5 usefulness (optional, from Operations)
  duration_ms INTEGER,                      -- execution time
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(venture_id, model_id, stage_number, layer)  -- idempotency
);

-- Aggregate effectiveness scores (computed periodically)
CREATE TABLE mental_model_effectiveness (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID REFERENCES mental_models(id) NOT NULL,
  stage_number INTEGER NOT NULL,
  path TEXT,
  strategy TEXT,
  venture_archetype TEXT,
  application_count INTEGER DEFAULT 0,
  avg_evaluation_score NUMERIC,
  avg_operator_rating NUMERIC,
  stage_progression_correlation NUMERIC,    -- -1.0 to 1.0 (did ventures using this model pass kill gates?)
  revenue_correlation NUMERIC,
  composite_effectiveness_score NUMERIC,    -- weighted blend
  last_calculated_at TIMESTAMPTZ,
  UNIQUE(model_id, stage_number, path, strategy, venture_archetype)
);

-- Archetype affinity (which models work best for which venture types)
CREATE TABLE model_archetype_affinity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID REFERENCES mental_models(id) NOT NULL,
  archetype TEXT NOT NULL,
  path TEXT,                                -- optional: affinity may vary by entry path
  affinity_score NUMERIC DEFAULT 0.5,       -- 0.0 to 1.0
  sample_size INTEGER DEFAULT 0,
  confidence_level TEXT DEFAULT 'low',      -- low | medium | high
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(model_id, archetype, path)
);
```

### Self-Improving Feedback Loop

```
Stage 0: venture created → venture.created event
  → Handler writes model-attribution record to mental_model_applications
  → Records: which models, which path, which strategy, which archetype

Stage 3: Kill Gate pass/fail
  → Effectiveness tracker queries: "which models were applied to this venture?"
  → Updates mental_model_effectiveness: stage_progression_correlation
  → Ventures that passed with Model X → X's correlation goes up

Stage 5: Profitability Kill Gate
  → Stronger signal: revenue viability linked to model applications
  → Updates revenue_correlation

Stage 12+: Later stages
  → Strongest signals: ventures that progress deep had better model selection

Periodic job (cron or on-demand):
  → Recalculates composite_effectiveness_score
  → Updates model_archetype_affinity
  → Next venture through Stage 0 gets smarter model suggestions
```

---

## Implementation Phases

### Phase 1: Stage 0 Foundation (3-4 weeks)
- DB migrations (4 tables)
- Seed 15-20 core models with exercise templates (Stage 0 + THE TRUTH focus)
- `getMentalModelContextBlock()` function
- Layer 1: Inject into Competitor Teardown and Discovery Mode (both files)
- Layer 2: Component 14 with `deps.synthesize` wrapper
- `venture.created` event handler for attribution tracking
- Basic effectiveness logging (application records, no scoring yet)
- **LOC**: ~800-1,000 new code + ~50 lines modifying existing path handlers

### Phase 2: Stage Progression + Scoring (2-3 weeks)
- Layer 3: `onBeforeAnalysis` hooks for Stages 1-5
- Effectiveness scoring algorithm (correlate with Kill Gate outcomes)
- Model auto-selection based on archetype affinity + effectiveness
- Expand model catalog to full 43
- **LOC**: ~400-600

### Phase 3: Full Lifecycle + Branding/Marketing (3-4 weeks)
- Stages 6-9 (THE ENGINE) hooks
- Stages 10-12 (THE IDENTITY) — branding/design model integration
- Stages 13-16 (THE BUILD) — marketing material planning models
- Scored evaluations and structured artifact output types
- **LOC**: ~500-700

### Phase 4: Operations + Cross-Venture Analytics (2-3 weeks)
- Post-Stage 25 Operations framework
- Portfolio-level model analytics (which models drive success across ventures)
- Cross-venture effectiveness comparison
- Model retirement/deprioritization logic
- **LOC**: ~300-500

### Total: ~2,000-2,800 LOC across 10-14 weeks

---

## Risk Mitigations

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Component 14 becomes latency bottleneck | High | Nested `Promise.all()` + 8s `Promise.race()` timeout; measure P95 before committing |
| `Promise.all()` fail-fast kills existing 13 components | Critical | `.catch(() => null)` wrapper — guaranteed |
| Exercise templates produce noise, not signal | Medium | Start with 5-7 hand-crafted templates; expand only after measuring operator value |
| Advisory status eroded over time | Medium | Namespace enforcement (`metadata.synthesis.advisory.*`); code review convention |
| Effectiveness tracking reflects correlation, not causation | Low | Document limitation; require n≥5 ventures before adjusting model selection |
| Write side-effects in synthesis pipeline | Low | Async logging via `setImmediate`; idempotent unique constraint |

---

## Open Questions

1. **Adversarial model guarantee**: Should every suggestion set include at least one "adversarial" model (Inversion, Survivorship Bias) to counter confirmation bias?
2. **Model tier for exercise LLM calls**: Use fast/cheap model (Haiku-class, $0.002/venture) or capable model (Sonnet-class, $0.10/venture)?
3. **Operations stage numbering**: Post-Stage 25 needs formal scheme — Stage 26+? Or Operations.1, Operations.2?
4. **Cross-venture anonymization**: How much venture context is shared in effectiveness rankings?
5. **Brand/marketing template authoring**: Who creates the branding and marketing exercise templates? Domain expert or AI-generated with review?
6. **Blueprint Browse gap**: Blueprints have no LLM calls — should we add a mental-model-informed "blueprint evaluation" step before approval?

## Suggested Next Steps

1. **Create Vision + Architecture Plan** — Register in EVA for HEAL scoring, then create SDs
2. **Phase 1 SD** — Stage 0 integration (3-4 weeks): DB tables, Layer 1 + Layer 2, seed models
3. **Validate time-budget first** — Instrument current Stage 0 P95 latency (2-4 hours) before committing to inline vs. async approach
4. **Author seed templates in parallel** — 5-7 hand-crafted exercise templates for Stage 0's highest-impact models (First Principles, JTBD, Blue Ocean, Inversion, Signal vs. Noise)
