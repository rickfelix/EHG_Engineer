# EVA Venture Lifecycle: Definitive Vision

> **Version**: 4.5
> **Created**: 2026-02-12
> **Status**: Draft (Revised + 30 Chairman Clarifications)
> **Supersedes**: `kb/ehg-review/00_unified_vision_2025.md`, `kb/ehg-review/01_vision_ehg_eva.md`, `docs/guides/workflow/25-stage-venture-lifecycle-overview.md`
> **Companion**: Architecture Document (Step 2, forthcoming)
> **Inputs**: Gemini vision diagrams, 25-stage CLI vs GUI gap analysis (PR #1117), CLI implementation review (`stages_v2.yaml`, Decision Filter Engine, Reality Gates, SD Bridge), brainstorming decisions (2026-02-11)

---

## 1. Purpose & Scope

### What This Document Is

The definitive specification for the EVA Venture Lifecycle -- the 25-stage, 6-phase workflow that takes a venture from initial idea to live product and ongoing operations. It defines the phases, stages, gates, decision points, automation boundaries, and data contracts that govern how every EHG venture progresses.

### What This Document Is Not

- **Not an architecture document**. How shared services, EVA orchestration, and layered scheduling work is covered in the companion Architecture Document.
- **Not a Gemini diagram**. The Gemini vision diagrams (7 images, 5-phase model) were ONE input to this document. Where this document and Gemini diagrams diverge, this document is authoritative.
- **Not the gap analysis**. The 25-stage CLI vs GUI gap analysis (5,335 lines, PR #1117) informed every stage definition here. The analysis itself is the evidence base; this document is the decision.

### Relationship to Other Documents

| Document | Relationship |
|----------|-------------|
| Gemini vision diagrams (7 images) | Input. Diverges from Stage 4 onward. See Section 7. |
| CLI vs GUI gap analysis | Evidence base. P0 consensus items are incorporated into stage definitions. |
| Architecture Document (Step 2) | Companion. Defines HOW to implement what this vision specifies. |
| `brainstorm/topic-5-ehg-vision.md` | Input. Capability doctrine and narrative mask inform philosophy. |
| `stages_v2.yaml` | Implementation. The YAML configuration that codifies this vision into executable stages. |

---

## 2. Core Philosophy

### Capital-Efficient Venture Creation via AI Orchestration

EHG creates ventures by applying AI intelligence at every stage of the lifecycle. The system doesn't just collect data -- it actively generates insight, challenges assumptions, and surfaces decisions. Each stage produces analytical output that downstream stages consume, creating a compounding intelligence chain.

### Maximum Automation, Minimum Human Intervention

The lifecycle is designed to run autonomously. The default state of every stage is **automated execution** -- the Chairman is only pulled in when the system genuinely cannot proceed without human judgment. This is not delegation; it is architecture. The system is built so that human intervention is the exception, not the rule.

**The automation contract**: If a stage can produce its output by consuming prior stage data and applying deterministic logic or LLM analysis, it runs without asking. The Chairman is only pulled in for three categories of decisions:
1. **Brand identity** (Stage 10) -- Creative/strategic judgment the Chairman cares about personally
2. **Release to production** (Stage 22) -- Business judgment on shipping
3. **Venture future** (Stage 25) -- Strategic portfolio decision every ops cycle

Kill gates (Stages 3, 5) are fully automated. The Decision Filter Engine escalates to the Chairman only when its 6 triggers fire -- otherwise the gate resolves and the venture advances without notification.

### The Chairman Governance Model

**AI-only operation.** The Chairman is the only human in the entire system. There are no employees, operators, contractors, or manual reviewers. All analysis, generation, execution, support, billing, legal compliance, and infrastructure management are performed by AI agents. The Chairman's role is strategic, not operational:

- **Reviews decisions, not data**. The Chairman never enters data into forms. EVA generates all stage artifacts. The Chairman reviews synthesized outputs and decides at gates.
- **Override authority, not approval authority**. Gates resolve automatically. The Chairman intervenes when override is warranted, not when approval is routine.
- **Ultimate kill authority**. The Chairman can kill any venture at any stage, at any time, regardless of gate outcomes. Automated gates are a convenience, not a constraint on the Chairman's authority.
- **Time commitment**: Under normal operation, the Chairman touches a venture at 3 mandatory blocking stages (10, 22, 25) plus DFE escalations. Kill gates (3, 5) are fully automated -- the Decision Filter Engine is the only path to Chairman involvement there. Everything else runs without asking.
- **Decision queue as rate limiter**. Ventures block on pending Chairman decisions. The Chairman's review cadence determines portfolio throughput. This is deliberate -- authority over speed.

### Unlimited Compute

Compute is not a constraint. The cost of AI processing, cloud infrastructure, and LLM calls is trivial compared to the value of ventures that succeed. The system does not optimize for token savings or impose per-venture compute budgets. If a stage needs more analysis, it runs more analysis. If infrastructure needs scaling, it scales. The only compute-related gate is the DFE's `cost_threshold` trigger, which alerts the Chairman to significant cost jumps -- not to constrain spending, but to maintain awareness.

### CLI as Authoritative Interface

The CLI is the authoritative interface for all venture progression. It enforces:
- **Pure function gates**: Deterministic scoring based on data, not opinion
- **Lean schema**: Structured data with enums where aggregation matters, free text where narrative matters
- **Cross-stage contracts**: Each stage explicitly defines what it produces for downstream consumption
- **Text-based workflow**: Compatible with AI agents, version control, and automation

A lightweight Chairman Dashboard provides monitoring (portfolio health, decisions queue, activity feed) but does NOT drive venture progression.

### Active Intelligence, Not Passive Collection

Every stage (2-25) includes an `analysisStep` -- an LLM-driven synthesis that consumes prior stage data and generates structured output. This transforms the lifecycle from a form-filling exercise into an analytical engine. The venture gets smarter at every stage.

The `analysisStep` is the single most important pattern in the lifecycle. It means:
- Stage 4 doesn't wait for someone to research competitors -- it discovers them from the idea + market data
- Stage 6 doesn't wait for someone to list risks -- it generates risks from Stage 5's financial model
- Stage 8 doesn't wait for someone to fill in a BMC -- it synthesizes all 7 prior stages into a complete canvas
- Stage 16 doesn't wait for someone to build a spreadsheet -- it generates a P&L from 7 upstream stages

**Nothing waits for human input except at decision gates.**

### Design for Exit

Every venture is designed from inception to be acquirable. Data architecture supports due diligence. Governance creates clean audit trails. This does not mean every venture will be sold -- it means no venture is architecturally trapped.

---

## 3. Automation Architecture

### Three Layers of Automated Control

The lifecycle runs autonomously through three complementary mechanisms:

```
Layer 1: DECISION FILTER ENGINE (Stage-Specific)
  Pure function. Evaluates 6 triggers at every stage.
  Output: AUTO_PROCEED | PRESENT_TO_CHAIRMAN | PRESENT_TO_CHAIRMAN_WITH_MITIGATIONS
  Default: When in doubt, escalate (conservative).

Layer 2: REALITY GATES (Phase Boundaries)
  Always-on, non-configurable, fail-closed.
  5 enforced boundaries at phase transitions.
  No human can override a failed reality gate.

Layer 3: ANALYSISSTEP ENGINE (Stage Interior)
  LLM-driven synthesis at every stage (2-25).
  Consumes prior stage data. Generates structured output.
  Fully automated -- Chairman never sees intermediate analysis.
```

### Decision Filter Engine

The Decision Filter Engine is the central automation mechanism. It is a **pure function** (no side effects, deterministic given the same inputs) that evaluates every gate decision against 6 configurable triggers:

| Trigger | What It Detects | Example |
|---------|----------------|---------|
| `cost_threshold` | Spend exceeds configured threshold | Cloud infrastructure estimate > $50K/year |
| `new_tech_vendor` | New technology or vendor not previously approved | Introducing a new payment processor |
| `strategic_pivot` | Direction change from original idea | Changing target market segment |
| `low_score` | Gate score below configured threshold | Kill gate score at 45 when threshold is 50 |
| `novel_pattern` | Pattern not seen in previous ventures | First venture in a new industry vertical |
| `constraint_drift` | Assumptions from prior stages no longer hold | TAM estimate revised downward by >30% |

**Outputs:**
- `AUTO_PROCEED` -- No triggers fired. Venture advances automatically. Chairman is not notified.
- `PRESENT_TO_CHAIRMAN` -- One or more triggers fired. Full context prepared. Chairman decides.
- `PRESENT_TO_CHAIRMAN_WITH_MITIGATIONS` -- Triggers fired but mitigations exist. Chairman decides with recommendations.

**Key property**: The Chairman Preference Store allows venture-specific or global trigger thresholds. For a venture the Chairman trusts, thresholds can be loosened. For a high-risk venture, thresholds can be tightened. The engine adapts without code changes.

### Reality Gates (Non-Negotiable)

Five Reality Gates enforce hard constraints at phase boundaries. These are always-on, non-configurable, and fail-closed:

| Reality Gate | Location | What It Checks |
|-------------|----------|----------------|
| Financial Reality | Phase 1 → 2 boundary | Unit economics exist and are internally consistent |
| Market Reality | Phase 2 → 3 boundary | Competitive data gathered, revenue model defined |
| Planning Reality | Phase 3 → 4 boundary | Identity stages complete, roadmap feasible |
| Build Reality | Phase 4 → 5 boundary | All blueprint stages pass promotion gate |
| Launch Reality | Phase 5 → 6 boundary | Release decision = "release", all build stages complete |

**No human can override a failed Reality Gate.** If the financial numbers don't add up, the venture cannot proceed to THE ENGINE. This is architecture, not bureaucracy.

### What the Chairman Actually Sees

Under normal automated operation, here is the Chairman's complete interaction with a venture:

| Touchpoint | Stage | What Happens | Chairman Action | Frequency |
|------------|:-----:|-------------|-----------------|-----------|
| Brand Approval | 10 | Full brand package generated (name, voice, visual direction, narrative). | Approve, revise, or reject. **Venture blocks until approved.** | Once per venture |
| Release Decision | 22 | Full BUILD LOOP synthesis. Technical readiness + business review. | Decide: release / hold / cancel. **Venture blocks.** | Per scope-based sprint completion |
| Venture Decision | 25 | Complete journey synthesis. Financial comparison. Health score. | Decide: continue / pivot / expand / sunset / exit. **Venture blocks.** | Per risk-adaptive ops cycle |
| DFE Escalation | Any | Decision Filter triggers fired. Context + mitigations presented. | Decide: proceed / block / modify. **Venture blocks.** | Only when triggered |

**Everything else is automated.** Kill gates (Stages 3, 5), all analysis stages (1-2, 4, 6-9, 11-21, 23-24), and all intermediate gates run without Chairman involvement under normal conditions.

### Advisory Checkpoints (Optional, Non-Blocking)

The system generates advisory notifications at four points. These are informational -- the Chairman can review them at leisure or ignore them entirely:

| Checkpoint | Stage | What It Shows |
|-----------|:-----:|---------------|
| Post-Kill Gate | 3 | Analysis summary, score breakdown, survivor status (gate resolved automatically) |
| Post-Financial Gate | 5 | Unit economics summary, ROI assessment (gate resolved automatically) |
| Promotion Gate | 16 | Full financial projections, viability assessment |
| Launch Brief | 23 | Launch plan summary, success criteria defined |

These appear in the Chairman Dashboard decisions queue but do not block venture progression. The kill gate advisories are particularly important -- even though the gates auto-resolve, the Chairman can review outcomes asynchronously and exercise ultimate kill authority retroactively at any time.

### Conditional Outcome Resolution

When gates produce conditional outcomes (conditional_pass, conditional_go, conditional approval), follow-up items must be resolved. Resolution uses **severity-based routing**:

| Severity | Resolution | Chairman Involvement |
|----------|-----------|:--------------------:|
| Critical | DFE escalates immediately to Chairman | Chairman decides |
| Non-critical | Auto-tracked. Next stage's analysisStep attempts resolution. | None (unless unresolved after 2 stages, then DFE escalates) |

The DFE classifies conditional item severity based on its 6 triggers. This keeps the Chairman focused on genuinely important conditions while the system handles routine ones.

### Sprint Cadence

THE BUILD LOOP operates on **scope-based sprints** -- sprints end when the planned scope is complete, not on a fixed calendar. This means:
- A simple feature might ship in 3 days
- A complex capability might take 3 weeks
- The Chairman sees Stage 22 release decisions at natural completion points, not on an artificial 2-week clock
- LEO Protocol determines sprint boundaries based on SD complexity and dependencies

---

### Ground Truth: Web-Grounded AnalysisSteps

Not all stages make factual claims about the external world. Stage 2 (Idea Analysis) is opinion. Stage 8 (BMC) is synthesis of prior stages. Stage 14 (Architecture) is design. These don't need external grounding -- LLM reasoning is the right tool.

But some stages critically depend on real-world facts. These stages use **web-search-grounded analysisSteps** -- the LLM must cite external sources for factual claims:

| Stage | Why Grounding Is Critical | Risk if Ungrounded |
|:-----:|--------------------------|-------------------|
| **4** | Competitors exist and have these features/pricing | Building against phantom competitors |
| **5** | Market size, CAC benchmarks, industry economics | Financial model built on hallucinated numbers |
| **7** | Competitor pricing ranges, market price points | Pricing strategy based on fiction |
| **11** | Channel effectiveness for this market segment | GTM plan targeting channels that don't apply |

**All other stages** use standard LLM synthesis (no web search required).

**The Four Buckets Golden Nugget** (Fact/Assumption/Simulation/Unknown) runs on ALL stages regardless, classifying every claim by its epistemic status. This creates a dual-layer system:
1. **Grounded stages** produce claims backed by cited external data
2. **All stages** self-classify confidence via Four Buckets
3. **Assumptions vs Reality** validates post-launch (Stage 24)

This is the minimum effective dose -- ground the stages that make real-world claims, let the LLM reason freely everywhere else.

### Reality Gate Failure Recovery

When a Reality Gate fails, the venture cannot proceed forward. The recovery process is fully automated:

1. **Identify failing check** -- The Reality Gate reports what failed (e.g., "unit economics internally inconsistent")
2. **Map to responsible stage(s)** -- The gate check maps to specific upstream stage outputs
3. **Re-run those analysisSteps** -- Up to 3 attempts with failure context injected ("previous output failed because X; regenerate addressing this issue")
4. **If retries exhausted: Auto-kill** -- The venture is not viable at this time. Status: `killed_at_reality_gate` with full diagnostic data

**No Chairman involvement** in Reality Gate failures. The Chairman sees the outcome in advisory notifications (and retains anytime kill authority) but does not block the recovery process. Reality Gates remain truly non-negotiable -- no human can override them, and the system handles recovery autonomously.

---

## 4. Phase Structure

### The Six Phases

```
Phase 1: THE TRUTH (Stages 1-5)      "Is this worth pursuing?"
Phase 2: THE ENGINE (Stages 6-9)     "How will this make money?"
Phase 3: THE IDENTITY (Stages 10-12)  "Who are we and how do we reach customers?"
Phase 4: THE BLUEPRINT (Stages 13-16) "What exactly are we building?"
Phase 5: THE BUILD LOOP (Stages 17-22) "Build, test, and release the product."
Phase 6: LAUNCH & LEARN (Stages 23-25) "Ship it, measure it, decide what's next."
```

### Phase Boundaries and Gate Types

The lifecycle uses four types of gates:

| Gate Type | Count | Purpose | Human Involvement |
|-----------|:-----:|---------|-------------------|
| **Kill Gates** | 2 | Can terminate a venture (Stages 3, 5) | Fully automated. DFE escalation only. |
| **Promotion Gates** | 3 | Verify readiness to advance (Stages 16, 17, 22) | Automated except Stage 22 (Chairman decision) |
| **Reality Gates** | 5 | Hard constraints at phase boundaries | Fully automated, no override possible |
| **Decision Filter** | Any stage | Escalation triggers | Chairman only when triggers fire |

### Gate Design Principle

Gates use multi-value decision enums, not booleans. A gate never just says "pass" or "fail" -- it says what kind of pass or what kind of fail, and what happens next. This enables:
- **Conditional outcomes** with tracked remediation items
- **Aggregation** across ventures (how many killed at Stage 3 this quarter?)
- **Pattern detection** (what types of ventures fail at Stage 5?)

---

## 5. Stage Inventory

### Linear Progression: Stages 1-23

| Stage | Name | Purpose | Key Output | Automation |
|:-----:|------|---------|------------|:----------:|
| **1** | Idea Capture | Capture structured idea with problem statement | `problemStatement` (required), `valueProp`, Stage 0 synthesis consumption | Fully automated |
| **2** | Idea Analysis | Multi-perspective analytical critique | analysisStep output, 0-100 integer scoring, categories aligned to Stage 3 metrics | Fully automated |
| **3** | Kill Gate | First survival checkpoint | Hybrid score (50% deterministic + 50% AI), formal Stage 2→3 artifact contract | Fully automated (DFE escalation only) |
| **4** | Competitive Landscape | Map the competitive field | Competitor discovery via analysisStep, `competitiveIntensity` (0-100), pricing model per competitor, stage5Handoff artifact | Fully automated |
| **5** | Kill Gate (Financial) | Financial viability check | Unit economics (CAC, LTV, LTV:CAC, payback), ROI 25% threshold with bands | Fully automated (DFE escalation only) |
| **6** | Risk Assessment | Identify and score risks | Risk generation from Stage 5 financial data, 2-factor scoring (probability x consequence), aggregate risk metrics | Fully automated |
| **7** | Revenue Architecture | Design pricing and revenue model | Pricing strategy consuming Stages 4-6, `pricingModel` enum (6 values), competitive context carry-through | Fully automated |
| **8** | Business Model Canvas | Synthesize all prior stages into BMC | 9-block generation from Stages 1-7, evidence field required, cross-block validation | Fully automated |
| **9** | Exit Strategy | Plan for eventual exit | Exit type enum (5 values), lightweight valuation (revenue multiple range), Reality Gate preserved | Fully automated |
| **10** | Naming/Brand | Establish brand identity | Brand genome + name generation, narrative extension (vision/mission/brand_voice), `naming_strategy` enum | **Chairman approves (BLOCKS)** |
| **11** | GTM Strategy | Go-to-market planning | Tier/channel/timeline generation, 8 channels ($0 budget = backlog), persona + pain_points, `target_cac` per tier | Fully automated |
| **12** | Sales Identity | Define sales model and process | Sales logic generation, wired to Stage 7 pricing + Stage 11 channels, conversion rate estimates on funnel stages, Economy Check in Reality Gate | Fully automated |
| **13** | Product Roadmap | Define what to build and when | Roadmap generation from Stages 1-12, priority (now/next/later) per milestone, deliverable types enum | Fully automated |
| **14** | Technical Architecture | System design | Architecture generation, 4 core layers + additional_layers + cross-cutting (security), Schema-Lite data entities | Fully automated |
| **15** | Resource Planning | AI agent allocation and compute budget | Agent capability mapping from Stages 12-14, service/tool requirements per build phase, budget coherence checks | Fully automated |
| **16** | Financial Projections | Full financial model | "Startup Standard" P&L, phase-variable costs from Stage 15, sensitivity analysis, viability warnings, promotion gate | Automated (advisory checkpoint) |
| **17** | Pre-Build Checklist | Readiness verification | Checklist generation from Blueprint stages, `build_readiness`: go/conditional_go/no_go, priority + source_stage_ref per item | Fully automated |
| **18** | Sprint Planning | Define implementation work | Items generated from Stage 13 "now" deliverables, SD Bridge to LEO Protocol, capacity/budget checks | Fully automated |
| **19** | Build Execution | Track implementation progress | Task initialization 1:1 from Stage 18, `sprint_completion`: complete/partial/blocked, layer progress tracking | Fully automated (LEO executes) |
| **20** | Quality Assurance | Test the build | QA scoping from Stages 18/19, `quality_decision`: pass/conditional_pass/fail, 95% pass threshold, test type + traceability | Fully automated |
| **21** | Build Review | Holistic readiness review | Consuming Stages 14/19/20, `review_decision`: approve/conditional/reject, lightweight UAT | Fully automated |
| **22** | Release Readiness | Final release gate | Synthesize entire BUILD LOOP, `release_decision`: release/hold/cancel, sprint retrospective | **Chairman decides** |
| **23** | Launch Execution | Go live | Launch brief from Stage 22, `launch_type` enum, `success_criteria` as contract with Stage 24, enhanced kill gate validates upstream | Fully automated |

### Recurring Operations Loop: Stages 24-25

After launch, Stages 24 and 25 repeat on a cadence determined by venture stage and risk profile. Each cycle is versioned.

| Stage | Name | Purpose | Key Output | Automation |
|:-----:|------|---------|------------|:----------:|
| **24** | Metrics & Learning | Measure actual vs expected | Launch scorecard, `success_criteria_evaluation` mapping Stage 23 targets to AARRR metrics, `launch_outcome` | Fully automated |
| **25** | Venture Review | Decide venture's future | `venture_decision`: continue/pivot/expand/sunset/exit, `venture_health` (5 dimensions), financial comparison | **Chairman decides** |

**Risk-Adaptive Cadence**: The ops cycle frequency adapts to venture health:

| Venture State | Cycle Frequency | Rationale |
|---------------|:---------------:|-----------|
| New / high-risk | Weekly | Close attention during early operations |
| Moderate risk | Bi-weekly to monthly | Standard monitoring cadence |
| Stable / low-risk | Monthly to quarterly | Earned autonomy through consistent health |

The system adjusts cadence automatically based on the `venture_health` score from Stage 25. Chairman sees every cycle regardless of frequency (per governance model).

**Cycle triggers for off-schedule iterations:**
- Declining metrics trigger enhancement SDs via LEO
- Competitor moves trigger analysis cycles
- Market shifts trigger re-evaluation
- Budget burn anomalies trigger immediate review

### Cross-Stage Data Contracts

Every stage defines:
1. **What it consumes** from upstream stages (mandatory inputs)
2. **What it produces** for downstream stages (artifacts with defined schema)
3. **What decision it makes** (if it's a gate stage)

Stages never duplicate prior stage data. They consume it. Stage 4 doesn't re-analyze competitors from scratch -- it consumes Stage 3's competitor handoff and adds competitive intelligence. Stage 7 doesn't re-research pricing -- it consumes Stage 4's competitor pricing data and Stage 5's unit economics.

### The analysisStep Pattern

Every stage from 2-25 follows the same pattern:

```
analysisStep:
  input: [consumed stage artifacts]
  process: LLM synthesis with structured prompt
  output: structured artifact (JSON schema)
  validation: cross-stage contract checks
```

This is the **engine** of the lifecycle. Without analysisSteps, stages are passive containers waiting for human input. With analysisSteps, stages are active processors that generate intelligence from prior data.

---

## 6. Venture Lifecycle Flow

### End-to-End Flow

```
IDEA (Stage 0 synthesis)
    |
    v
THE TRUTH (1-5): Capture --> Analyze --> [Kill Gate] --> Compete --> [Financial Kill Gate]
    |                                    (automated)                  (automated)
    |
    | Survive both kill gates [Reality Gate: Financial Reality]
    v
THE ENGINE (6-9): Risk --> Revenue --> BMC --> Exit Design
    |
    | Business model validated [Reality Gate: Market Reality]
    v
THE IDENTITY (10-12): [Brand] --> GTM --> Sales
    |                     ^
    |             Chairman reviews
    |             full brand package
    |
    | Know who we are and how we reach customers [Reality Gate: Planning Reality]
    v
THE BLUEPRINT (13-16): Roadmap --> Architecture --> Resources --> Financial Projections
    |
    | Promotion gate: viable financials [Reality Gate: Build Reality]
    v
THE BUILD LOOP (17-22): Checklist --> Sprint --> Build --> QA --> Review --> [Release Gate]
    |                                   |                                        ^
    |                            SD Bridge to LEO                       Chairman decides
    |
    | Release gate: ready to ship [Reality Gate: Launch Reality]
    v
LAUNCH & LEARN (23-25): Launch --> Metrics --> [Venture Decision]
    |                                                ^
    |                                        Chairman decides
    |
    |    continue --> Loop back to Stage 24 (next versioned cycle)
    |    pivot -----> System identifies invalidated stages, Chairman confirms re-entry point
    |    expand ----> New features/scope within same venture (triggers LEO SDs)
    |    sunset ----> Graceful wind-down process
    |    exit ------> Triggers exit execution workflow
    v
RECURRING OPS (24<-->25): Versioned cycles on a cadence
```

### Chairman Decision Points (Complete List)

| Decision Point | Stage | Outcomes | Automation Status |
|----------------|:-----:|----------|-------------------|
| Brand identity | 10 | approved / revise / working_title | **Chairman reviews** full brand package (name, voice, visual, narrative) |
| Release | 22 | release / hold / cancel | **Chairman decides** every sprint cycle (business judgment) |
| Venture future | 25 | continue / pivot / expand / sunset / exit | **Chairman decides** every ops cycle (strategic judgment) |
| DFE escalation | Any | proceed / block / modify | **Chairman decides** (only when triggers fire) |

### Fully Automated Decision Points

| Decision Point | Stage | Outcomes | Why No Human Needed |
|----------------|:-----:|----------|---------------------|
| Kill (viability) | 3 | pass / kill / revise | Hybrid scoring resolves deterministically. DFE escalates if triggers fire. |
| Kill (financial) | 5 | pass / kill / revise | Unit economics evaluated against thresholds. DFE escalates if triggers fire. |
| Build readiness | 17 | go / conditional_go / no_go | Deterministic checklist evaluation from Blueprint stages |
| Sprint completion | 19 | complete / partial / blocked | LEO Protocol status reporting |
| Quality | 20 | pass / conditional_pass / fail | Automated test results against 95% threshold |
| Build review | 21 | approve / conditional / reject | Synthesis of Stages 14/19/20 data |
| Launch outcome | 24 | Scorecard metrics | AARRR measurement against Stage 23 success criteria |

### How Pivots Work

When Stage 25 produces a `pivot` decision, the venture re-enters the lifecycle at an earlier stage:

1. **System determines re-entry**: The Stage 25 analysisStep identifies which upstream stages are invalidated by the pivot (e.g., a market pivot invalidates Stages 4, 11, 12; a pricing pivot invalidates Stages 5, 7, 16).
2. **Chairman confirms re-entry point**: The system recommends the earliest invalidated stage. Chairman confirms or adjusts.
3. **Downstream stages regenerate**: All stages from the re-entry point forward are re-executed with the pivot context. Prior stage data is preserved where still valid.
4. **Pivot is versioned**: The venture maintains a pivot history, enabling Assumptions vs Reality tracking across pivots.

### How Ventures Enter the Lifecycle

**EVA proposes, Chairman approves.** No venture enters the lifecycle without Chairman authorization.

- **EVA generates ideas** from market signals, portfolio gaps, technology trends, and competitive analysis. Ideas queue in the Chairman Dashboard.
- **Chairman curates the queue**. Reviews EVA's proposals and selects which ideas enter Stage 1. This is the funnel control -- the Chairman decides what the portfolio works on.
- **Chairman direct creation** is also supported. The Chairman can inject ideas directly into Stage 1 without EVA's proposal step.

**Unlimited concurrent ventures** can be in-flight simultaneously. The system handles all orchestration. The Chairman's decision queue (Stages 10, 22, 25 + DFE) is the natural throughput governor.

### How Ventures Exit the Lifecycle

Ventures exit via the Stage 25 `venture_decision`, kill gates (Stages 3, 5), or Reality Gate failures. All exit paths trigger an **automated graceful shutdown sequence**:

1. **User notification** -- Active users receive advance notice with timeline
2. **Data export** -- User data exported and made available for download
3. **Infrastructure teardown** -- Cloud resources decommissioned in dependency order
4. **Code archive** -- Codebase archived to version-controlled storage
5. **Post-mortem retrospective** -- Automated analysis of venture performance, lessons captured for future ventures

The Chairman's decision to kill, sunset, or exit is the only human input. The shutdown sequence itself is fully automated. For kill gates and Reality Gate failures, the sequence runs immediately after the automated kill decision.

Exit paths:
- **sunset**: Full graceful shutdown sequence (notification period for active users)
- **exit**: Triggers exit execution workflow (exit strategy from Stage 9 becomes actionable). Shutdown deferred until transaction completes.
- **killed** (Stages 3, 5, or Reality Gate): Abbreviated shutdown (no users yet, skip notification/export steps)

---

## 7. Key Differentiators from Gemini Vision

The Gemini vision diagrams show a 5-phase, 25-stage model. Only Stages 1-3 align with the CLI. Here's where and why they diverge:

### 1. Engineering Execution Delegated to LEO

**Gemini**: Phases 3-4 (DEVELOPMENT, SCALING) are engineering-heavy -- core development, QA, deployment, growth optimization.

**This Vision**: Engineering execution is LEO Protocol's domain. The venture lifecycle defines WHAT needs to happen (Sprint Planning, QA requirements, Release criteria). LEO creates SDs, writes PRDs, implements code, runs tests, and deploys. Build Loop stages (17-22) are orchestration checkpoints, not implementation stages.

**The SD Bridge** (Stage 18) is the interface between lifecycle and engineering. It converts sprint items into SD payloads enriched with architecture context and assignee recommendations from Stage 14/15. Once items cross the bridge, LEO Protocol takes over execution autonomously.

### 2. GTM as First-Class Stage(s)

**Gemini**: No dedicated GTM stages. Marketing appears only in Phase 4 (Scaling) as "Go-to-Market Execution."

**This Vision**: GTM Strategy (Stage 11) and Sales Identity (Stage 12) are dedicated stages in THE IDENTITY phase. How you reach and convert customers is a first-class business activity, not an afterthought during scaling.

### 3. Brand/Identity Retained and Broadened

**Gemini**: No naming, brand, or identity stages.

**This Vision**: THE IDENTITY phase (Stages 10-12) covers brand naming, visual identity, cultural design style, GTM strategy, and sales model. Brand is broader than naming -- it includes app styling, customer segment definition, and customer profiles.

### 4. Exit Designed-For but Deferred

**Gemini**: Full Phase 5 (EXIT) with 5 stages for exit execution (exit strategy finalization, buyer identification, due diligence, transaction execution, value realization).

**This Vision**: Exit Strategy is Stage 9 (early in THE ENGINE). Every venture is designed for exit from the start. Full exit execution workflow is deferred -- it will be built when a venture actually reaches exit readiness, without requiring re-architecture.

### 5. Investment as Automated Portfolio Optimization

**Gemini**: Stage 10 is a formal GO/NO-GO "Investment Decision" with investment committee presentation and capital allocation.

**This Vision**: Investment decisions are automated portfolio optimization gates. EVA decides based on capacity + value case ranking. No human bottleneck for capital allocation. Chairman retains kill authority but doesn't manually approve capital for each venture.

### 6. Phase Structure

**Gemini**: 5 phases (IDEATION, VALIDATION, DEVELOPMENT, SCALING, EXIT) with 4 validation gates at 85%.

**This Vision**: 6 phases (THE TRUTH, THE ENGINE, THE IDENTITY, THE BLUEPRINT, THE BUILD LOOP, LAUNCH & LEARN) with kill gates at Stages 3 and 5, promotion gate at Stage 16, release gate at Stage 22, and venture decision at Stage 25. Plus 5 always-on Reality Gates at phase boundaries and a Decision Filter Engine that evaluates at every stage.

---

## 8. Venture Decision Taxonomy

All decisions in the lifecycle use multi-value enums, not booleans.

### Gate Decisions (Within Phases)

| Decision | Values | Used At | Automation |
|----------|--------|---------|:----------:|
| kill_gate_decision | pass / kill / revise | Stages 3, 5 | Automated (DFE escalation only) |
| build_readiness | go / conditional_go / no_go | Stage 17 | Automated |
| sprint_completion | complete / partial / blocked | Stage 19 | Automated |
| quality_decision | pass / conditional_pass / fail | Stage 20 | Automated |
| review_decision | approve / conditional / reject | Stage 21 | Automated |
| release_decision | release / hold / cancel | Stage 22 | Chairman decides |

### Venture Decisions (Lifecycle-Level)

| Decision | Values | Used At | Automation |
|----------|--------|---------|:----------:|
| venture_decision | continue / pivot / expand / sunset / exit | Stage 25 | Chairman decides |
| brand_status | approved / revise / working_title | Stage 10 | Chairman reviews |
| launch_outcome | Scorecard against AARRR | Stage 24 | Automated |

### Decision Filter Outputs (Any Stage)

| Output | Meaning | Chairman Involvement |
|--------|---------|:--------------------:|
| AUTO_PROCEED | No triggers fired | None |
| PRESENT_TO_CHAIRMAN | Trigger(s) fired, needs judgment | Decides |
| PRESENT_TO_CHAIRMAN_WITH_MITIGATIONS | Trigger(s) fired, mitigations available | Decides with recommendations |

### Chairman Decisions (Override Authority)

| Decision | Values | Context |
|----------|--------|---------|
| Chairman override | GO / NO_GO / PAUSE / PIVOT | Any gate where Chairman intervenes |

### Decision Design Principles

1. **Every gate produces a decision, not a score**. Scores feed into decisions, but the output is always a named decision value.
2. **Conditional outcomes have follow-up requirements**. `conditional_pass` means "pass but fix these items." The items are tracked.
3. **Kill is not failure**. Killing a venture at Stage 3 is the system working correctly. Capital efficiency means killing bad ideas early and cheaply.
4. **Automated by default**. Every decision has an automated resolution path. Human involvement is triggered only at 3 mandatory stages (10: brand, 22: release, 25: venture future) or by Decision Filter Engine escalation at any stage.

---

## 9. The SD Bridge: Lifecycle to Engineering

Stage 18 (Sprint Planning) is the interface between the venture lifecycle and LEO Protocol engineering execution.

### How It Works

```
Stage 13 (Roadmap)
  "now" priority milestones + deliverables
       |
       v
Stage 18 analysisStep
  Generates sprint items from "now" deliverables
  Enriches with: Stage 14 architecture context, Stage 15 assignee recommendations
  Validates against: Stage 17 readiness (build_readiness = go)
       |
       v
SD Bridge (convertSprintToSDs)
  Sprint items --> Strategic Directive payloads
  Each SD gets: title, type, estimated LOC, architecture layer, acceptance criteria
       |
       v
LEO Protocol
  Creates SDs, sprints PRDs, implements code, runs tests
  Reports back: completion status, test results, issues
       |
       v
Stage 19 (Build Execution)
  Tasks initialized 1:1 from Stage 18 items
  Tracks: sprint_completion, layer progress, issue severity/status
```

### Why This Matters

The SD Bridge means the venture lifecycle never has to understand how code gets written. It specifies WHAT needs to happen (from the roadmap) and LEO figures out HOW. This separation is what makes the Build Loop stages (17-22) lightweight orchestration checkpoints rather than heavy engineering management stages.

---

## 10. Post-Launch Operations

After launch (Stage 23), ventures enter the recurring ops loop (24-25). Between review cycles, live ventures need ongoing operational attention. The operating model is **event-driven from metrics**, not an always-on ops team.

### Decided

| Operational Area | How It's Handled | Automation Level |
|-----------------|-----------------|:----------------:|
| **Bug fixes** | Stage 24 metrics identify issues. LEO Protocol auto-generates SDs for fixes. | Fully automated |
| **Customer support** | AI-driven support automation. No human support agents. | Fully automated |
| **Infrastructure monitoring** | Existing inbox/feedback system surfaces issues. LEO generates SDs for remediation. | Fully automated |
| **Infrastructure scaling** | Auto-scale within pre-configured bounds. DFE `cost_threshold` trigger fires for significant cost jumps (e.g., 10x increase). Below threshold, fully autonomous. | Fully automated (DFE gate) |
| **Feature enhancements** | Stage 24 declining metrics → LEO enhancement SDs. Stage 25 "expand" → new scope SDs. | Fully automated |
| **Billing & payments** | Stripe (or equivalent) configured at Stage 20 Launch Prep. Subscriptions, invoicing, tax compliance, and dunning automated. Chairman involved only for pricing model changes (routed via DFE `strategic_pivot`). | Fully automated |
| **Legal & compliance** | Pre-built template library (ToS, privacy policy, GDPR/CCPA, cookie banners) auto-configured per venture at Stage 20. Novel situations (new jurisdictions, regulated industries) escalate to Chairman via DFE. | Automated + DFE |
| **Data & analytics** | Auto-collect AARRR metrics, auto-analyze trends, auto-generate insights. DFE escalates anomalies (retention cliff, revenue decline). EVA auto-adjusts (A/B tests, funnel optimization) without approval. | Fully automated (DFE alerts) |

### Needs Deep Research (Step 6)

| Operational Area | Open Question |
|-----------------|--------------|
| **Marketing execution** | Make vs buy? Automate in-house (Marketing Service) or purchase external marketing services? Flagged for triangulated deep research in Step 6 of the 8-step plan. |

### Design Principle

Post-launch operations follow the same philosophy as the lifecycle itself: **the system operates, the Chairman reviews decisions.** Metrics drive action. Declining KPIs auto-generate work. The Chairman's Stage 25 review is the governance checkpoint -- not day-to-day operational oversight.

---

## 11. Success Metrics

### Venture Health (5 Dimensions)

| Dimension | What It Measures | Key Indicators |
|-----------|-----------------|----------------|
| **Product** | Is the product solving the problem? | Validation score, feature completeness, user satisfaction |
| **Market** | Is there demand and competitive positioning? | TAM confirmation, competitive gap, channel traction |
| **Technical** | Is the implementation sound? | QA pass rate, technical debt ratio, security posture |
| **Financial** | Do the economics work? | Unit economics (CAC, LTV, LTV:CAC), burn rate, revenue trajectory |
| **Operations** | Are AI agents performing effectively? | Agent task completion rate, automation coverage, DFE escalation frequency |

### Lifecycle Effectiveness

| Metric | What It Measures |
|--------|-----------------|
| Kill rate at Stage 3 | Are we killing bad ideas early? Higher is better (means filter is working). |
| Stage cycle time | How long does each stage take? Trending down = system improving. |
| Assumptions vs Reality delta | How accurate were early-stage predictions? Tracked via Golden Nuggets. |
| Decision reversal rate | How often do later stages contradict earlier decisions? Lower is better. |
| Cross-venture pattern reuse | Are learnings from one venture accelerating others? |
| Chairman interventions per venture | How many DFE escalations? Trending down = system learning Chairman preferences. |
| AUTO_PROCEED rate | What % of stage transitions require no human involvement? Target: >90%. |

### The Compounding Intelligence Signal

The lifecycle improves over iterations. Each venture that completes (or is killed) contributes:
- **Issue patterns** to the learning system (via LEO Protocol retrospectives)
- **Assumptions vs Reality** calibration data (via Golden Nuggets)
- **Decision Filter tuning** (Chairman preferences become the system's defaults)
- **Stage refinements** (via the gap analysis -> corrective measures cycle)

The second venture through the lifecycle should be faster and better-validated than the first. The tenth should be dramatically better. This compounding improvement is the primary success metric for the lifecycle itself.

---

## 12. Portfolio Intelligence

The lifecycle operates at two levels: individual ventures progressing through 25 stages, and the portfolio as a whole learning and optimizing across all ventures. This section defines how multi-venture intelligence works.

### Cross-Venture Knowledge Transfer

Every stage outcome feeds a **portfolio knowledge base** that accelerates future ventures. This is fully automated -- the system gets smarter without Chairman involvement.

| Knowledge Type | How It Transfers | Example |
|---------------|-----------------|---------|
| **Calibration data** | Stage 3/5 kill gate thresholds adjust based on actual outcomes at Stage 24 | If ventures passing at score 65 consistently succeed, threshold adjusts downward |
| **Successful patterns** | Architecture, pricing, and GTM patterns from successful ventures seed future ones | SaaS venture #2 inherits proven architecture patterns from venture #1 |
| **Failure signals** | Failed ventures contribute anti-patterns that future stages flag | "Marketplace pricing in B2B SaaS" flagged as risky based on prior failure |
| **DFE preference learning** | Chairman decisions at DFE escalations tune future trigger thresholds | If Chairman always approves `novel_pattern` for fintech, threshold loosens |

### Venture Templates

Successful ventures automatically produce **reusable templates** for similar future ventures:

- **What gets templated**: Scoring thresholds, architecture patterns, DFE trigger calibrations, pricing model parameters, GTM channel effectiveness
- **When templates are created**: After a venture reaches Stage 25 with "continue" or "exit" decision
- **How templates are applied**: EVA recommends applicable templates at Stage 1 based on venture domain similarity. The analysisStep consumes template data as additional context.
- **No Chairman involvement**: Template creation and application are fully automated. The Chairman's Stage 1 approval of the venture implicitly accepts the template recommendation.

### Portfolio Prioritization

When multiple ventures need Chairman decisions simultaneously, the system ranks them by **expected value**:

| Ranking Factor | Weight | Source |
|---------------|:------:|--------|
| Financial projections | High | Stage 16 P&L, Stage 24 actual revenue |
| Market opportunity | Medium | Stage 4 TAM, Stage 5 unit economics |
| Venture health score | Medium | Stage 25 5-dimension health assessment |
| Stage maturity | Low | Later-stage ventures (closer to revenue) get slight priority |
| Time in queue | Tiebreaker | FIFO among equally ranked ventures |

The Chairman sees the highest-value decisions first. The ranking is fully automated and updates as venture data changes.

### Resource Contention Management

With unlimited concurrent ventures, shared resources (infrastructure, API limits, shared services) may contend:

- **Default**: Ventures run in parallel. Most resources are venture-isolated.
- **Contention detected**: System auto-schedules based on venture priority ranking. Higher-priority ventures get resources first; lower-priority ventures queue.
- **DFE escalation**: Fires only if contention would materially delay a high-priority venture. Chairman can adjust priorities or allocate additional resources.
- **No manual scheduling**: The system handles all resource orchestration autonomously.

### Chairman Dashboard & Notifications

The Chairman interacts with the portfolio through a **unified dashboard with smart notifications**:

**Dashboard Views:**
- **Decision Queue**: Pending decisions ranked by venture priority. Shows decision type, venture name, urgency, and recommended action.
- **Health Heatmap**: All ventures at a glance, color-coded by health score across 5 dimensions.
- **Event Feed**: Significant events (kills, launches, DFE escalations, Reality Gate outcomes).
- **Portfolio Metrics**: Aggregate kill rate, success rate, average cycle time, total revenue.

**Notification Strategy:**
| Event Type | Notification | Timing |
|-----------|:------------:|--------|
| Blocking decision needed (Stages 10, 22, 25) | Immediate | As soon as venture reaches gate |
| DFE escalation | Immediate | When trigger fires |
| Reality Gate failure / auto-kill | Daily digest | Batched (informational, not blocking) |
| Advisory checkpoints (Stages 3, 5, 16, 23) | Daily digest | Batched (non-blocking) |
| Routine stage completions | Weekly summary | Aggregated across all ventures |

The Chairman controls notification preferences per venture and globally. The default is to minimize interruptions while ensuring blocking decisions are never delayed.

---

## Appendix A: Stage 0 (Pre-Lifecycle)

Stage 0 is the ideation synthesis that feeds into Stage 1. It is not formally part of the 25-stage lifecycle but is the entry point. Stage 0 consumes:
- Chairman ideas (direct input)
- EVA opportunity detection (automated)
- External signals (market, competitive, technology)

Stage 0 produces a structured synthesis that Stage 1 consumes as its primary input. The gap between Stage 0 output and Stage 1 input was identified as the #1 gap in Stage 1 of the analysis.

---

## Appendix B: Golden Nuggets

Four cross-cutting mechanisms are integrated into the lifecycle:

| Nugget | Purpose | Stages |
|--------|---------|--------|
| **Assumptions vs Reality** | Track early assumptions, compare to actual outcomes | 2, 3, 5, 23, 24, 25 |
| **Token Budget Profiles** | Treat compute as capital with explicit budgets | 5 (profile selection) |
| **Four Buckets** | Classify outputs as Fact / Assumption / Simulation / Unknown | 3, 5, 16 (epistemic gates) |
| **Crew Tournament** | Multi-agent competition for brand messaging | 11 (pilot) |

These are already implemented in the database (`assumption_sets`, `venture_token_ledger`, `epistemic_classification`).

---

## Appendix C: Scoring Models

### Stage 3: Hybrid Kill Gate Scoring

The first kill gate uses a hybrid model established in the triangulation consensus:

| Component | Weight | Source |
|-----------|:------:|--------|
| Deterministic scoring | 50% | Weighted average of 6 metrics (per-metric threshold: 50/100) |
| AI calibration | 50% | LLM analysis consuming Stage 2 output + market context |

**Per-metric threshold**: Any individual metric scoring below 50 can trigger the kill gate regardless of aggregate score. This prevents a venture with one catastrophic weakness from being saved by strong scores elsewhere.

### Stage 5: Financial Kill Gate

| Metric | Threshold | Treatment |
|--------|-----------|-----------|
| ROI | 25% minimum | With bands: <25% = kill, 25-50% = caution, >50% = strong |
| LTV:CAC | >3:1 | Required for proceed |
| Payback period | Industry-dependent | Configurable per venture type |

Unit economics are **generated** by the Stage 5 analysisStep from Stage 4's competitor pricing data and the idea's value proposition. The gate resolves automatically against the thresholds above. The Chairman only sees the results if the Decision Filter Engine escalates (e.g., `low_score` trigger, or `novel_pattern` for an unfamiliar industry).

---

## Appendix D: Enum Reference

Complete enumeration of all multi-value decisions and categorization fields:

### Decision Enums

| Enum | Values | Used At |
|------|--------|---------|
| kill_gate_decision | pass, kill, revise | Stages 3, 5 |
| build_readiness | go, conditional_go, no_go | Stage 17 |
| sprint_completion | complete, partial, blocked | Stage 19 |
| quality_decision | pass, conditional_pass, fail | Stage 20 |
| review_decision | approve, conditional, reject | Stage 21 |
| release_decision | release, hold, cancel | Stage 22 |
| venture_decision | continue, pivot, expand, sunset, exit | Stage 25 |
| brand_status | approved, revise, working_title | Stage 10 |
| dfe_output | auto_proceed, present_to_chairman, present_to_chairman_with_mitigations | Any stage |

### Categorization Enums

| Enum | Values | Used At |
|------|--------|---------|
| pricing_model | freemium, subscription, one_time, usage_based, tiered, marketplace | Stage 7 |
| exit_type | acquisition, ipo, merger, mbo, liquidation | Stage 9 |
| naming_strategy | descriptive, abstract, acronym, founder, portmanteau, other | Stage 10 |
| launch_type | soft_launch, beta, ga_release, phased_rollout, big_bang | Stage 23 |
| milestone_priority | now, next, later | Stage 13 |
| issue_severity | critical, high, medium, low | Stage 19 |
| risk_source | financial, technical, market, operational, regulatory, competitive | Stage 6 |

---

*Document revised as Step 1 of the 8-step vision & architecture plan.*
*Version 4.5 revision: 30 Chairman clarification decisions applied. Decisions 1-18: kill gates, release, brand, ops cadence, roadmap, pivot model, retroactive kill authority, conditional resolution, expand scope, idea pipeline, concurrency, brand blocking, sprint cadence, decision queuing, ground truth grounding, Reality Gate failure recovery, post-launch operations. Decisions 19-25: AI-only operation, unlimited compute, billing automation, legal/compliance templates, data/analytics pipeline, infrastructure scaling, venture shutdown sequence. Decisions 26-30: cross-venture knowledge transfer, portfolio prioritization, resource contention management, venture templates, Chairman dashboard and notifications.*
*Primary evidence base: 25-stage CLI vs GUI gap analysis (PR #1117, 5,335 lines)*
*CLI implementation review: stages_v2.yaml, Decision Filter Engine, Reality Gates, SD Bridge*
*Brainstorming decisions: 2026-02-11 session (12 points captured in `docs/plans/vision-architecture-next-steps.md`)*
