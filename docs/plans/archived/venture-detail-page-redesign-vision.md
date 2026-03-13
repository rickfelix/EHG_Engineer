# Vision: Venture Detail Page Redesign — Mode-Aware Progressive Reveal

## Executive Summary

The Venture Detail page is the Chairman's primary interface for understanding and governing a single venture. Today it presents a static 8-tab layout regardless of where the venture is in its lifecycle — showing building-focused content even for ventures that have launched and moved to operations mode.

This vision defines a **mode-aware progressive reveal** system where the Venture Detail page adapts its content, layout, and decision surface based on the venture's `pipeline_mode`. During the building phase (stages 1-25), the page centers on **stage progress, upcoming gates, artifacts, and blockers**. Once a venture launches and enters operations mode, the 25-stage timeline collapses into a compact summary and the page shifts to surface **health metrics, revenue performance, AI agent status, and operational decisions**.

**Note**: The Chairman is the only human operator. All "workers" in the system are AI agents. The UI should reflect this — "AI Agents" not "Workers".

The guiding principle is **decision readiness**: at any point in the venture's lifecycle, the Chairman should see exactly what they need to decide — nothing more, nothing less. This aligns with Chairman Vision V2's Layer 0/1/2 progressive disclosure model and extends it with lifecycle-aware context.

## Problem Statement

**Who is affected**: The Chairman (sole governance role) who manages a portfolio of ventures across multiple lifecycle stages.

**Current pain points**:
1. **Wrong stage count**: Page shows "Stage X of 40" due to legacy tier routing (`DEFAULT_STAGE_LIMIT = 40`), when the canonical system has 25 stages across 6 phases.
2. **No mode awareness**: The 8-tab layout (Overview, Workflow, Research, Brand Variants, Financial, Team, Timeline, Exit) displays identically for building-mode and operations-mode ventures.
3. **Decision friction**: Kill gates (stages 3, 5, 13, 23), promotion gates (16, 17, 22), and advisory checkpoints (Validation@3, Profitability@5, Schema Firewall@16) are buried in workflow tabs rather than surfaced prominently.
4. **Cognitive overload**: All information is available at all times — no progressive disclosure based on what matters NOW.
5. **Dead UI code**: ~15+ files reference deprecated 40-stage system (`WORKFLOW_STAGES`, hardcoded `40`).

**Impact**: The Chairman cannot quickly assess a venture's status or make timely governance decisions. Time is wasted navigating irrelevant tabs and interpreting stale UI patterns.

## Personas

### Chairman (Governance Mode)
- **Goals**: Make timely kill/promote/advance decisions; assess portfolio health; ensure ventures follow the 25-stage methodology
- **Mindset**: Strategic, time-constrained, needs signal not noise
- **Key activities**: Review gate decisions, approve stage transitions, monitor health metrics, trigger kills on failing ventures
- **Context switching**: Manages multiple ventures simultaneously — needs to quickly understand "where is this venture and what do I need to do?"

### Chairman (Operations Observer)
- **Goals**: Monitor launched ventures' health; track revenue, team capacity, operational risks
- **Mindset**: Hands-off unless metrics trigger alarm — ventures in operations should run autonomously
- **Key activities**: Review health dashboards, intervene on declining metrics, approve growth/scaling transitions
- **Context switching**: Operations ventures need less frequent but deeper reviews than building ventures

## Information Architecture

### Route Structure
- `/chairman/ventures/:id` — Single unified route, content adapts based on `pipeline_mode`
- `/chairman/ventures/:id/stage/:number` — Dedicated stage page (navigated from timeline click)
- `/chairman/operations/:ventureId` — Existing operations dashboard (preserved until explicitly deprecated)

### View Modes by Pipeline Mode

| Pipeline Mode | Primary View | Secondary View | Timeline Display |
|---------------|-------------|----------------|-----------------|
| `building` | Stage Progress + Next Gate | Artifacts + Blockers | Full 25-stage horizontal timeline |
| `operations` | Health Dashboard + KPIs | Operational Risks + AI Agents | Collapsed "journey complete" badge |
| `growth` | Growth Metrics + Scaling Readiness | Resource Allocation | Collapsed badge |
| `scaling` | Scale Metrics + Infrastructure | AI Agent Expansion | Collapsed badge |
| `exit_prep` | Exit Readiness Checklist | Valuation + Legal | Collapsed badge |
| `divesting` | Transaction Status | Handoff Progress | Collapsed badge |
| `sold` | Archive Summary | Historical Performance | Collapsed badge (read-only) |

### Building Mode Page Structure

**Hero Area** (always visible at top):
- Venture name, current stage (X of 25), phase name, progress bar
- Next Decision Card: prominently shows the next kill/promotion gate
- Gate actions: [Review Evidence] [Kill/Hold] [Advance/Promote]
- "Review Evidence" triggers **inline expansion** below the card showing artifacts + quality scores + EVA recommendation

**Tabs** (4 tabs, reduced from current 8):
1. **Artifacts** — Stage-by-stage deliverables with completion status and quality scores
2. **Risks & Blockers** — AI-generated risks from EVA analyzing venture data (not manual input)
3. **Timeline** — 25-stage horizontal timeline with phase groupings; clicking a stage navigates to `/ventures/:id/stage/:number`
4. **Financials** — Financial model, burn rate, runway

**Stage Page** (`/ventures/:id/stage/:number`):
- Required artifacts checklist with completion status and quality scores
- Focused, single-purpose page for managing stage deliverables

### Operations Mode Page Structure

**Hero Area** (transformed from building mode):
- Venture name, "LAUNCHED" badge, key metrics (health score, revenue, AI agent count)
- Collapsed journey badge: "✓ 25/25 stages complete [View Journey ▸]"
- Journey expands inline showing 6 phase completions + gate/advisory pass stats
- **No decision card by default** — operations ventures run autonomously

**Decision Card Reappears On Triggers:**
- Health score drops below threshold (e.g., < 70/100)
- Revenue declines X% month-over-month
- AI agent failure rate spikes above threshold
- (Mode transition readiness is NOT a trigger — Chairman initiates transitions manually)

**Tabs** (4 tabs, swapped from building mode):
1. **Health Trends** — Health score over time, customer satisfaction, churn, uptime charts
2. **Revenue** — MRR, growth rate, revenue breakdown, projections
3. **AI Agents** — Agent status, error rates, capacity, infrastructure health
4. **Risk Signals** — Declining metrics, alerts, intervention triggers

### Data Sources
- **Stage data**: `lifecycle_stage_config` (25 stages), `venture_artifacts` (per-stage outputs)
- **Gate data**: `KILL_GATE_STAGES`, `PROMOTION_GATE_STAGES` from `venture-workflow.ts`
- **Advisory data**: `advisory_checkpoints` table (3 checkpoints)
- **Health data**: Existing operations hooks (`useVentureOperations`)
- **Pipeline mode**: `ventures.pipeline_mode` column

## Key Decision Points

### Gate-Driven Decision Surface
The Venture Detail page must prominently surface the NEXT decision the Chairman needs to make:

| Stage | Gate Type | Decision | Chairman Action |
|-------|-----------|----------|-----------------|
| 3 | Kill Gate (Validation Checkpoint) | Does this venture pass initial validation? | Kill or Advance |
| 5 | Kill Gate (Profitability Gate) | Is the business model viable? | Kill or Advance |
| 13 | Kill Gate | Pre-blueprint validation | Kill or Advance |
| 16 | Promotion Gate (Schema Firewall) | Architecture approved? | Promote or Hold |
| 17 | Promotion Gate | Build loop entry | Promote or Hold |
| 22 | Promotion Gate | Pre-launch readiness | Promote or Hold |
| 23 | Kill Gate | Final launch gate | Kill or Launch |
| 25 | Transition | Venture launched | Transition to Operations |

### Mode Transition Decisions
- **building → operations**: Automatic when Stage 25 completes, but Chairman should confirm
- **operations → growth**: Chairman decides when metrics warrant scaling investment
- **Later transitions**: Defined by operational triggers (TBD in future vision iterations)

## Integration Patterns

### With Existing Systems
- **Chairman Briefing page**: Venture summaries on the Briefing page link to Venture Detail. The detail page provides Layer 2 depth for what Briefing shows at Layer 0.
- **Operations Dashboard**: Existing `/chairman/operations/:ventureId` continues to work. Operations mode content in Venture Detail reuses the same data hooks (`useVentureOperations`).
- **EVA System**: Gate decisions can be informed by EVA recommendations. The decision surface includes EVA-generated context where available.
- **Venture Artifacts**: `venture_artifacts` table with quality scores feeds the artifact display in building mode.

### Component Reuse
- **Journey Badge**: Collapsed timeline component reusable across portfolio views and Briefing page
- **Gate Decision Card**: Standardized component for kill/promote decisions, reusable in Briefing
- **Health Score Widget**: From Operations dashboard, embedded in operations mode view

## Evolution Plan

### Phase 0: Foundation Fix (Immediate)
- Migrate all 40-stage references to canonical 25-stage `TOTAL_STAGES`
- Fix `VentureDetail.tsx` tier routing to read DB `tier` column instead of `metadata.tier`
- Remove deprecated `WORKFLOW_STAGES` constant and all consumers

### Phase 1: Building Mode Redesign
- Replace 8-tab layout with decision-readiness layout for `pipeline_mode='building'`
- Implement gate decision surface (next kill/promotion gate prominently displayed)
- Add stage artifact display and blocker/risk panel
- 25-stage horizontal timeline with phase groupings

### Phase 2: Operations Mode + Collapse
- Implement collapsed "journey complete" badge for post-launch ventures
- Integrate operations health dashboard content into Venture Detail page
- Progressive reveal: operations mode shows health/KPIs instead of stages
- Expandable journey badge for historical stage review

### Phase 3: Additional Pipeline Modes (Future)
- Define UI patterns for growth, scaling, exit_prep, divesting, sold
- Each mode's content configuration driven by mode-specific widget declarations
- Architecture should support adding new modes without restructuring the page

## Out of Scope

- **Mobile-first redesign**: Mobile responsiveness is desired but not the primary design target for this vision
- **Operations dashboard replacement**: The existing `/chairman/operations` page is preserved; this vision adds operations content to Venture Detail but does not remove the standalone page
- **Pipeline mode automation**: Automatic transitions between modes (e.g., auto-detecting when to move from operations to growth) are out of scope — Chairman triggers transitions manually
- **Venture creation/editing**: This vision covers the read/governance experience, not venture CRUD
- **Multi-venture comparison**: Comparing ventures side-by-side is a portfolio-level feature, not venture detail

## UI/UX Wireframes

### Building Mode — Stage-Focused Hero + Tabs
```
┌─── HERO ────────────────────────────────────────────────────────┐
│  PortraitPro AI                    Stage 3 of 25               │
│  Phase 1: THE TRUTH                ▓▓▓░░░░░░░░░░  12%         │
├─────────────────────────────────────────────────────────────────┤
│  🔶 UPCOMING: Kill Gate at Stage 3                              │
│  "Does this venture pass initial validation?"                   │
│  Advisory: Validation Checkpoint                                │
│  [Review Evidence]  [🚫 Kill]  [✓ Advance]                     │
├─────────────────────────────────────────────────────────────────┤
│  ┌─── EVIDENCE (inline expansion on Review click) ──────────┐  │
│  │ Market Research: 85/100 ✓  User Interviews: 92/100 ✓     │  │
│  │ Competitive Map: Not started  Problem Statement: Not done │  │
│  │ EVA Recommendation: ADVANCE (evidence score 78%)          │  │
│  └──────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│ [● Artifacts]  [Risks & Blockers]  [Timeline]  [Financials]   │
├─────────────────────────────────────────────────────────────────┤
│ Stage 3 Artifacts:                                              │
│                                                                 │
│  ✓ Market Research .................. 85/100 (quality)         │
│  ✓ User Interviews .................. 92/100                   │
│  ◯ Competitive Map .................. Not started              │
│  ◯ Problem Statement ................. Not started              │
│                                                                 │
│ Advisory Checkpoints:                                           │
│  ● Validation @3 ........ ACTIVE (this stage!)                 │
│  ◯ Profitability @5 ..... UPCOMING                             │
│  ◯ Schema FW @16 ........ FUTURE                               │
├─────────────────────────────────────────────────────────────────┤
│ Timeline (clickable → navigates to /ventures/:id/stage/:num)   │
│ [1][2][●3][4][5] | [6][7][8][9] | [10][11][12] | [13]...      │
│  THE TRUTH          THE ENGINE     THE IDENTITY    BLUEPRINT   │
│  ═══════▶                                                       │
└─────────────────────────────────────────────────────────────────┘
```

### Operations Mode — Health-Focused Hero + Tabs
```
┌─── HERO (transformed) ──────────────────────────────────────────┐
│  PortraitPro AI                    LAUNCHED ✓                   │
│  Health: 92/100   Revenue: $12.4K/mo   AI Agents: 3            │
│  ✓ 25/25 stages complete   [View Journey ▸]                    │
└─────────────────────────────────────────────────────────────────┘
  (No decision card — operations ventures run autonomously
   until a trigger fires: health drop, revenue decline, agent errors)

┌─── TABS (swapped for operations) ───────────────────────────────┐
│ [● Health]  [Revenue]  [AI Agents]  [Risk Signals]             │
├─────────────────────────────────────────────────────────────────┤
│ Tab: Health (currently selected)                                │
│                                                                 │
│  Customer Satisfaction:  4.2/5.0  ↑ 0.3                       │
│  Churn Rate:             3.1%     ↓ improving                  │
│  Uptime:                 99.9%                                  │
│  AI Agent Errors:        2 (last 30 days)                      │
│                                                                 │
│  [====== Health Trend Chart (30 days) ======]                  │
└─────────────────────────────────────────────────────────────────┘
```

### Operations Mode — Trigger-Activated Decision Card
```
When health drops below 70/100 or revenue declines:

┌─── HERO (with decision card reappearing) ───────────────────────┐
│  PortraitPro AI                    LAUNCHED ✓                   │
│  Health: 65/100 ⚠️  Revenue: $9.2K/mo ↓26%  AI Agents: 3     │
│  ✓ 25/25 stages complete   [View Journey ▸]                    │
├─────────────────────────────────────────────────────────────────┤
│  ⚠️ INTERVENTION NEEDED: Health declining                       │
│  Health dropped from 92 → 65 in 14 days                        │
│  Primary driver: Churn rate increased to 8.2%                  │
│  [Review Metrics]  [Acknowledge]  [Escalate to Kill Review]    │
└─────────────────────────────────────────────────────────────────┘
```

### Collapsed Journey Badge (Expanded State)
```
┌─────────────────────────────────────────────────────────────────┐
│ JOURNEY COMPLETE                              [Collapse ▾]     │
│ ┌────────┬────────┬────────┬──────────┬───────┬────────┐      │
│ │ TRUTH  │ ENGINE │IDENTITY│BLUEPRINT │ BUILD │ LAUNCH │      │
│ │ ✓✓✓✓✓  │ ✓✓✓✓   │ ✓✓✓    │ ✓✓✓✓     │ ✓✓✓✓  │ ✓✓✓✓✓  │      │
│ │5 stages│4 stages│3 stages│4 stages  │4 stg  │5 stages│      │
│ └────────┴────────┴────────┴──────────┴───────┴────────┘      │
│ Kill Gates: 4/4 passed  Promotions: 3/3  Advisories: 3/3      │
└─────────────────────────────────────────────────────────────────┘
```

### Stage Page (`/ventures/:id/stage/:number`)
```
┌─────────────────────────────────────────────────────────────────┐
│  ← Back to PortraitPro AI                                      │
│                                                                 │
│  Stage 3: Customer Discovery                                   │
│  Phase 1: THE TRUTH                                            │
│  Gate: Kill Gate (Validation Checkpoint)                       │
├─────────────────────────────────────────────────────────────────┤
│  Required Artifacts:                                            │
│                                                                 │
│  ✓ Market Research Report ............ 85/100                  │
│    Uploaded 2026-03-01 · Validated by EVA                      │
│                                                                 │
│  ✓ User Interview Summary ............ 92/100                  │
│    Uploaded 2026-03-03 · Validated by EVA                      │
│                                                                 │
│  ◯ Competitive Analysis Map .......... Not started             │
│    Required for gate passage                                   │
│                                                                 │
│  ◯ Problem Statement Document ........ Not started             │
│    Required for gate passage                                   │
│                                                                 │
│  Completion: 2 of 4 artifacts (50%)                            │
│  Quality Average: 88.5/100                                     │
└─────────────────────────────────────────────────────────────────┘
```

## Success Criteria

1. **Correct stage display**: All views show "Stage X of 25" using canonical `TOTAL_STAGES` — zero references to 40-stage system remain
2. **Mode-aware content**: Venture Detail page displays different content based on `pipeline_mode` (building vs operations at minimum)
3. **Decision surface**: Next kill gate or promotion gate is visible within 2 seconds of page load, without navigating tabs
4. **Collapsed timeline**: Post-launch ventures show a compact journey summary that expands on click
5. **Gate action**: Chairman can take kill/promote/advance action directly from the venture detail page
6. **Artifact visibility**: Building mode shows stage artifacts with quality scores from `venture_artifacts` table
7. **Blocker surfacing**: Active blockers and risks are visible on the primary view, not buried in tabs
8. **Advisory checkpoints**: All 3 advisory checkpoints (Validation, Profitability, Schema Firewall) are visible with pass/pending status
9. **Operations health**: Operations mode surfaces health score, revenue metrics, and AI agent status from existing data hooks
10. **Trigger-based decisions**: Decision card reappears in operations mode when health drops, revenue declines, or AI agent errors spike
11. **Stage navigation**: Clicking any stage in the timeline navigates to a dedicated stage page showing the required artifacts checklist
12. **AI-generated risks**: Risks & Blockers tab shows EVA-analyzed risk signals, not manual input
10. **Zero regression**: Existing Operations dashboard (`/chairman/operations`) continues to function unchanged
