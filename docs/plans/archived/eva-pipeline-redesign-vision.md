# Vision: EVA 25-Stage Pipeline Redesign

**Vision Key**: `VISION-EVA-PIPELINE-REDESIGN-L2-001`
**Architecture Plan**: `ARCH-EVA-PIPELINE-REDESIGN-001` → [Architecture Plan](./eva-pipeline-redesign-architecture.md)
**Source Brainstorm**: [brainstorm/2026-03-04-eva-stage-execution-worker.md](../../brainstorm/2026-03-04-eva-stage-execution-worker.md)
**Brainstorm Session**: `697e02a4-dde8-4170-81e6-0cc641a18813`

## Executive Summary

The EVA venture evaluation pipeline processes ventures through 25 stages from initial synthesis to launch. However, stages 17-25 currently simulate build and operations phases using LLM imagination instead of real data — the LLM role-plays as developers, QA teams, and launch managers while no actual code is built. This creates a fundamental integrity problem: Stage 25 recommends "continue" at 85% confidence while every upstream stage failed because nothing real exists.

This redesign transforms the pipeline from a broken end-to-end simulation into four distinct operating modes: **Evaluation** (Stages 0-17), **Build** (Stages 18-22), **Launch** (Stages 23-25), and **Operations** (continuous post-launch services). The hard separation at the Stage 17/18 boundary makes Stages 0-17 a self-contained chairman evaluation tool. The chairman deliberately promotes a venture to BUILD — and from that point forward, stages consume real SD execution data, real test coverage, and real build artifacts instead of LLM fiction.

Additionally, the Identity Phase (Stages 10-12) is resequenced to follow the correct dependency chain (Customer → Brand → GTM), the Launch Phase (Stages 23-25) is redesigned as Marketing Prep → Launch Readiness → Go-Live, and six continuous operational services replace the old Stages 24-25 content that assumed a live product existed during evaluation. A new Capability Contribution Score enforces EHG's core doctrine that every venture must strengthen the global capability set, and a Financial Data Contract eliminates the contradictory financial numbers that currently appear at different chairman gates.

## Problem Statement

**Who is affected:** The EHG Chairman — the sole human operator orchestrating AI agents to build ventures.

**What the problem is:** The current 25-stage pipeline has three critical failures:

1. **Stages 17-25 are fiction.** The LLM imagines build execution, QA results, launch metrics, and portfolio review. The stage execution infrastructure to create real SDs exists (`lifecycle-sd-bridge.js`, `sd-completed.js`, `venture_stage_work` table) but the analysis steps bypass all of it and ask the LLM to simulate.

2. **Financial data contradicts across stages.** Stage 5 estimates $400K capital; Stage 16 says $150K. CAC varies from $2,500 to $363. No cross-stage contract enforces consistency. The chairman sees different numbers at different gates.

3. **Identity phases have wrong dependency order.** Brand genome is defined before customer personas exist. Visual branding has no stage at all. GTM strategy doesn't reference the customer it's targeting.

4. **Kill decisions are ignored.** Stages 3 and 5 can issue kill/reject decisions, but stages 6-16 continue executing as if the venture was approved — wasting LLM tokens on rejected ventures.

5. **No post-launch operations.** The pipeline assumes a live product exists at Stage 24-25 but provides no continuous monitoring, customer service, or feedback loops after launch.

**Current impact:** The chairman cannot trust the pipeline output. Evaluation data contradicts itself. Build/launch stages are meaningless simulations. Post-launch ventures have no operational monitoring. The pipeline is useful only through Stage 16 — and even there, financial inconsistency undermines decision quality.

## Personas

### The Chairman (Primary)
- **Goals:** Evaluate ventures quickly, make high-quality go/no-go decisions, monitor live venture health, minimize time spent on routine tasks
- **Mindset:** Strategic thinker operating through a GUI. Wants to see curated, decision-ready data — not raw LLM output. Trusts the system when data is consistent; loses trust when numbers contradict.
- **Key activities:** Review evaluation dossiers, approve/reject at gates (3, 5, 17, 22, 24), promote ventures to BUILD, monitor live venture operations, trigger enhancement cycles from feedback patterns
- **Pain points:** Contradictory financial data across stages, meaningless build simulation data, no visibility into post-launch venture health, too many touch points for routine decisions

### The EVA Orchestrator (System)
- **Goals:** Auto-advance ventures through stages, pause only at chairman gates, maintain data integrity across stages, enforce kill decisions and gate blocks
- **Mindset:** Autonomous executor with strict contract adherence. Every stage produces artifacts that downstream stages consume. No hallucination — only real data or explicit "not yet available."
- **Key activities:** Poll for stage advancement opportunities, execute analysis steps, validate cross-stage contracts, block progression at gates, create real SDs at Stage 18 and 23
- **Pain points:** Current analysis steps bypass real data infrastructure, gate blocks not enforced, no financial consistency validation, no kill-decision propagation

### The LEO Protocol (System)
- **Goals:** Execute SDs created by the pipeline (Stages 18 and 23), report real build progress back to the pipeline, maintain LEAD→PLAN→EXEC workflow integrity
- **Mindset:** The build engine. Takes sprint plans and marketing material requests, executes them through the full SD workflow, reports completion and quality metrics back to the pipeline.
- **Key activities:** Receive SD creation requests from lifecycle-sd-bridge.js, execute through LEAD→PLAN→EXEC, write completion data to venture_stage_work, trigger stage re-evaluation when SDs complete
- **Pain points:** Currently creates SDs but pipeline doesn't wait for completion, real build data written to venture_stage_work but no stage reads it

## Information Architecture

### Four Operating Modes

```
Mode 1: EVALUATION (Stages 0-17)
├── Phase 1: THE TRUTH (0-5)     — "Is this worth pursuing?"
├── Phase 2: THE ENGINE (6-9)     — "How will this make money?"
├── Phase 3: THE IDENTITY (10-12) — "Who is the customer, how do we reach them?"
└── Phase 4: THE BLUEPRINT (13-17) — "What exactly are we building?"

Mode 2: BUILD (Stages 18-22)      — Chairman-triggered promotion
├── Stage 18: Sprint Planning      — Creates real SDs
├── Stages 19-21: Build Tracking   — Reads real SD progress
└── Stage 22: Release Gate         — Chairman approval on real artifacts

Mode 3: LAUNCH (Stages 23-25)     — Marketing, readiness, go-live
├── Stage 23: Marketing Prep       — Creates marketing material SDs
├── Stage 24: Launch Readiness     — Chairman go/no-go
└── Stage 25: Launch Execution     — Go-live, handoff to operations

Mode 4: OPERATIONS (Post-pipeline) — Continuous services
├── Financial Sync                  — Stripe integration
├── Customer Service Agent          — Shared, venture-aware
├── Feedback Classifier             — Multi-source → Universal Inbox
├── Metrics Collector               — AARRR framework
├── Health Scorer                   — Aggregate health
└── Enhancement Detector            — Auto-create SDs from patterns
```

### Data Flow Architecture

```
Stage 0 → venture_artifacts (synthesis) → Stage 1-5
Stage 5 → financial_contract (canonical) → Stages 7, 12, 16
Stage 10 → venture_artifacts (customers) → Customer Intelligence UI
Stage 11 → venture_artifacts (branding)  → Brand Genome Wizard UI
Stage 12 → venture_artifacts (GTM)       → GTM Dashboard UI
Stage 17 → chairman_decisions (promote?) → Stage 18
Stage 18 → strategic_directives_v2 (SDs) → LEO Protocol
LEO      → venture_stage_work (progress) → Stages 19-22
Stage 23 → strategic_directives_v2 (SDs) → Content Forge
Stage 25 → operations_handoff            → 6 continuous workers
```

### Navigation Structure (Chairman V3)

```
Chairman Dashboard
├── Venture Pipeline (existing, enhanced)
│   ├── Stage-by-stage view with gate actions
│   ├── 7 dedicated gate renderers (3, 5, 10, 11, 17, 22, 24)
│   └── Launch progress timeline (stages 23-25)
├── Live Ventures (NEW)
│   ├── Overview table (all active ventures, health scores)
│   └── Per-venture detail (Revenue, CS, Feedback, Metrics, Health)
├── Capability Registry (NEW)
│   └── Cross-venture capability graph
├── Customer Intelligence (existing, wired to Stage 10)
├── Brand Genome (existing, wired to Stage 11)
├── GTM Dashboard (existing, wired to Stage 12)
└── Content Forge (existing, wired to Stage 23)
```

## Key Decision Points

1. **Stage 17/18 Boundary (Hard Separation):** Stages 0-17 are a self-contained evaluation tool. The chairman must take deliberate action to promote a venture to BUILD. This is not an automatic transition — it's the most consequential decision in the pipeline.

2. **Real Data vs Simulation (Build Loop):** Stages 19-22 consume real SD execution data from `venture_stage_work` instead of LLM simulation. This means the build loop takes weeks/months (real development time) instead of 15 minutes (LLM fiction). The chairman sees actual test coverage, real QA results, and genuine build progress.

3. **Kill Decision Propagation:** When Stage 3 or 5 issues a kill decision, all downstream stages halt immediately. No more wasting LLM tokens analyzing a venture the chairman already rejected. The stage execution engine checks upstream gate decisions before proceeding.

4. **Gate Block Enforcement:** When `evaluatePromotionGate()` returns `blockProgression: true`, the orchestrator actually blocks. Currently this flag is computed but ignored. After the redesign, gates are non-negotiable.

5. **Capability Admission Doctrine:** New synthesis component 13 scores capability contribution (0-25). Stage 3 enforces a hard rule: score < 10/25 triggers automatic kill unless explicitly overridden. This programs EHG's core doctrine ("every venture strengthens the nervous system") into the pipeline.

6. **Financial Contract Enforcement:** Stage 5 sets canonical financial numbers. Downstream stages (7, 12, 16) can refine within ±20% but cannot contradict by >50% without explicit flagging. This eliminates the $400K vs $150K problem.

7. **Pipeline Terminus at Stage 25:** The venture pipeline ends at launch. AARRR metrics, drift detection, health scoring, and enhancement cycles are continuous operational services — not one-time stage analyses.

## Integration Patterns

### EVA Pipeline → LEO Protocol (Build Bridge)
- `lifecycle-sd-bridge.js` creates orchestrator + child SDs from Stage 18 sprint plans
- LEO executes SDs through full LEAD→PLAN→EXEC workflow
- `sd-completed.js` event handler writes real completion data to `venture_stage_work`
- Stages 19-22 query `venture_stage_work` for real progress data
- Same pattern repeats at Stage 23 for marketing material SDs

### Pipeline → Existing GUI Components
- Stage 10 output → `venture_artifacts` → Customer Intelligence page (4 existing tabs)
- Stage 11 output → `venture_artifacts` → Brand Genome Wizard (5 existing steps)
- Stage 12 output → `venture_artifacts` → GTM Dashboard (5 existing pages)
- Stage 23 SDs → Content Forge via `fromSD` query parameter
- All integration is data-driven through `venture_artifacts` — no tight coupling

### Stage Execution Worker → Stage Execution Engine
- Worker polls `ventures` table for advancement opportunities
- Calls existing `executeStage()` for each stage
- Respects gate decisions, financial contracts, capability scores
- Pauses at 5 chairman gates, auto-advances everywhere else

### Operations → Universal Inbox
- Customer feedback from all channels → Universal Inbox
- Enhancement Detector identifies patterns → auto-creates SDs
- Health Scorer aggregates all signals → chairman alert thresholds

## Evolution Plan

### Phase 1: Foundation (Children E, F + Immediate Fixes)
- Capability Contribution Score (Stage 0 component 13, Stage 3 hard-rule)
- Financial Data Contract (cross-stage validation)
- Immediate code fixes (ROI bands, date injection, kill-decision propagation, gate enforcement)

### Phase 2: Identity & Contracts (Children A, G)
- Identity Phase resequence (Stages 10-12 redesign with new schemas)
- Full stage documentation rewrite (all 25 stages)

### Phase 3: Build Loop (Children C, D)
- Build Loop real data wiring (Stages 19-22 read venture_stage_work)
- Stage execution worker (auto-advance with chairman gates)

### Phase 4: Launch Phase (Children B, J)
- Launch Phase redesign (Stages 23-25 new templates)
- Launch workflow UI (Stage 23/24/25 renderers, Launch Progress page)

### Phase 5: GUI Integration (Children H, K)
- Stage renderer UI updates (7 Tier 1 gate renderers)
- Pipeline-to-GUI wiring (Customer Intelligence, Brand Genome, GTM dashboards)

### Phase 6: Operations (Child I)
- Operations dashboard (Live Ventures page)
- 6 background workers (financial sync, CS agent, feedback classifier, metrics, health, enhancement detection)
- 4 new database tables

## Out of Scope

- **Board governance UI** — Deferred until 3+ live ventures require portfolio-level reporting
- **External data feeds for Stage 0** (e.g., live market data APIs) — stubbed but not wired
- **Multi-chairman support** — EHG has one chairman; multi-user access is not in scope
- **Real-time collaborative editing** of stage outputs — chairman reviews, not co-edits
- **Mobile-responsive chairman UI** — desktop-first, tablet acceptable
- **Internationalization (i18n)** — English only
- **AI model selection per stage** — uses existing client-factory.js routing
- **Venture portfolio optimization** (cross-venture resource allocation) — operations scope, not pipeline
- **Automated A/B testing** in Content Forge — manual content creation and approval
- **Third-party integrations beyond Stripe** for financial sync — Stripe-first, expand later

## UI/UX Wireframes

### Chairman Gate Experience (Stage 17 — Promotion Gate)

```
┌─────────────────────────────────────────────────────────────────┐
│ PROMOTION GATE — NicheBrief AI                    Stage 17/18  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ EVALUATION SUMMARY                                              │
│ ┌─────────────────┬─────────────────┬──────────────────────┐   │
│ │ DFE Score: 78   │ Kill Gate: PASS │ Financial: VIABLE    │   │
│ │ Capability: 18/25│ Identity: ✅    │ Blueprint: ✅        │   │
│ └─────────────────┴─────────────────┴──────────────────────┘   │
│                                                                 │
│ BUILD ESTIMATE                                                  │
│ ┌──────────────────────────────────────────────────────────┐   │
│ │ Estimated SDs: 12 (3 infrastructure, 6 feature, 3 QA)   │   │
│ │ Timeline: 8-14 weeks                                     │   │
│ │ Infrastructure: Supabase + Vercel ($50/mo)               │   │
│ │ Token Budget: ~$30/mo (production)                       │   │
│ └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│ CAPABILITY CONTRIBUTION                                         │
│ ┌──────────────────────────────────────────────────────────┐   │
│ │ Score: 18/25 — Above threshold (10/25 minimum)           │   │
│ │ New Capability: Content Intelligence Engine (reusable)    │   │
│ │ Reuse Potential: 3 ventures could use this capability     │   │
│ └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│ Chairman Decision:                                              │
│ [🚀 PROMOTE TO BUILD]  [⏸️ PARK]  [❌ REJECT]                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Live Ventures Operations Dashboard

```
┌─────────────────────────────────────────────────────────────────┐
│ LIVE VENTURES (3 active)                                        │
├──────────┬──────────┬──────────┬──────────┬─────────────────────┤
│ Venture  │ Revenue  │ CS Load  │ Feedback │ Health              │
├──────────┼──────────┼──────────┼──────────┼─────────────────────┤
│ Truth    │ $12.4K   │ 3 open   │ 8 new    │ ██████░░ 78         │
│ Engine   │ ↑ 12%    │ avg 2h   │ 2 urgent │                     │
├──────────┼──────────┼──────────┼──────────┼─────────────────────┤
│ Niche    │ $3.2K    │ 1 open   │ 3 new    │ ████████ 92         │
│ Brief    │ ↑ 45%    │ avg 30m  │ 0 urgent │                     │
├──────────┼──────────┼──────────┼──────────┼─────────────────────┤
│ Creator  │ $0.8K    │ 7 open   │ 12 new   │ ████░░░░ 45         │
│ Flow     │ ↓ 5%     │ avg 8h   │ 5 urgent │ ATTENTION           │
└──────────┴──────────┴──────────┴──────────┴─────────────────────┘
```

### Launch Progress Timeline (Stages 23-25)

```
┌─────────────────────────────────────────────────────────────────┐
│ LAUNCH PROGRESS — NicheBrief AI                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Stage 23: Marketing Prep    Stage 24: Readiness   Stage 25: Go  │
│ ████████████████░░░░░░░░    ░░░░░░░░░░░░░░░░░░░   ░░░░░░░░░░░  │
│ 60% (2/4 SDs)               Pending                Pending      │
│                                                                 │
│ Material SDs:                                                   │
│ ✅ SD-MKT-001: Landing Page Copy      [Done]                    │
│ ✅ SD-MKT-002: Product Screenshots    [Done]                    │
│ 🔄 SD-MKT-003: Demo Video            [60%]                     │
│ ⬜ SD-MKT-004: Social Media Assets    [Queue]                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Success Criteria

1. **Financial consistency across stages**: Stage 5, 7, 12, and 16 financial data deviates by no more than ±20% without explicit flagging. No contradiction > 50%.

2. **Kill decision enforcement**: When Stage 3 or 5 issues a kill decision, zero downstream stages execute for that venture.

3. **Build loop uses real data**: Stages 19-22 query `venture_stage_work` table and display actual SD completion, test coverage, and QA results — not LLM-generated fiction.

4. **Capability doctrine programmatic**: Every venture evaluated gets a Capability Contribution Score (0-25) at Stage 0, and Stage 3 enforces the <10/25 hard-rule.

5. **Gate blocks enforced**: When `blockProgression: true` is returned by any gate function, the pipeline halts until chairman action.

6. **Identity phase produces usable data**: Stage 10 customer personas populate Customer Intelligence UI, Stage 11 visual branding populates Brand Genome Wizard, Stage 12 GTM data populates GTM Dashboard — no manual data entry required.

7. **Stage execution worker auto-advances**: Ventures progress through all non-gate stages without human intervention. The chairman touches the pipeline at exactly 5 gates.

8. **Launch phase creates real assets**: Stage 23 creates marketing material SDs that execute through LEO, producing actual landing pages, screenshots, and content — not simulated marketing plans.

9. **Post-launch operations visible**: Live ventures have a chairman-facing dashboard showing revenue, CS load, feedback pipeline, health score, and enhancement queue updated in near-real-time.

10. **Pipeline integrity end-to-end**: No stage produces output that contradicts upstream stage decisions. Stage 25 "continue" recommendation is only possible when all upstream stages passed.
