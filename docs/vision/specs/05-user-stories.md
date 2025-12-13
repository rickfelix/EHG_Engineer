# User Stories & Personas Specification

**Vision v2 Chairman's OS - Human Workflow Definitions**

> "The system adapts to the human, not the other way around."

---

## Table of Contents

1. [Overview](#overview)
2. [Persona 1: The Chairman (Strategic Mode)](#persona-1-the-chairman-strategic-mode)
3. [Persona 2: The Solo Entrepreneur (Builder Mode)](#persona-2-the-solo-entrepreneur-builder-mode)
4. [Persona 3: EVA (Chief of Staff)](#persona-3-eva-chief-of-staff)
5. [Persona Switching](#persona-switching)
6. [Story Cross-Reference Matrix](#story-cross-reference-matrix)

---

## Overview

The Chairman's OS serves two distinct human personas - sometimes the same person wearing different hats. Understanding these personas is critical for UX design.

### The Two Hats Problem

```
┌─────────────────────────────────────────────────────────────────────┐
│                        RICK (The Human)                             │
│                                                                     │
│   ┌───────────────────┐              ┌───────────────────┐          │
│   │   CHAIRMAN HAT    │              │  ENTREPRENEUR HAT │          │
│   │   "What's the     │              │  "Show me the     │          │
│   │    status?"       │              │   code."          │          │
│   │                   │              │                   │          │
│   │   Strategic       │              │   Tactical        │          │
│   │   Decisions       │              │   Execution       │          │
│   │   Portfolio View  │              │   Single Venture  │          │
│   └───────────────────┘              └───────────────────┘          │
│             │                                  │                    │
│             │         CONTEXT SWITCH           │                    │
│             └──────────────────────────────────┘                    │
└─────────────────────────────────────────────────────────────────────┘
```

**Key Insight:** The same person needs radically different interfaces depending on their current cognitive mode. The system must support seamless switching.

---

## Persona 1: The Chairman (Strategic Mode)

### Profile

| Attribute | Value |
|-----------|-------|
| **Role** | Chief Executive / Portfolio Manager |
| **Primary View** | `/chairman` (Morning Briefing Dashboard) |
| **Mindset** | "I need to make high-stakes decisions with minimal cognitive load" |
| **Time Horizon** | Weeks to Months |
| **Key Metric** | Portfolio Health Score |

### Focus Areas

1. **High-level Decisions** - Approve/reject stage gates
2. **Risk Management** - Identify ventures that need attention
3. **Token Budget Allocation** - Control AI spending
4. **Portfolio Health** - Monitor all ventures at once

### User Stories

#### US-CH-001: Morning Briefing ("God View")

**Story:**
> "As the Chairman, I want a 'Morning Briefing' that gives me a complete God View of the portfolio - Cash flow, Risk, Active Agents, and Pending Decisions - all at a glance."

**Acceptance Criteria:**
- [ ] Briefing appears on `/chairman` dashboard by default
- [ ] **Command Strip** shows 4 key metrics at a glance:
  - [ ] Pending decisions count with urgency indicator
  - [ ] Active agents count (working + queued)
  - [ ] Ventures at risk count with trend indicator
  - [ ] MTD spend with budget remaining
- [ ] Displays global health score (green/yellow/red)
- [ ] Lists top 3 urgent items with one-sentence summaries
- [ ] Greeting is personalized and time-aware ("Good morning, Rick...")
- [ ] **Financial Widget** shows:
  - [ ] Budget vs. spend progress bar
  - [ ] Projected monthly spend
  - [ ] Top 3 spenders (clickable to venture)
- [ ] **Risk Widget** shows ventures at risk (clickable to drill down)
- [ ] **Active Agents Widget** shows live agent status
- [ ] Portfolio distribution by phase is visible
- [ ] Can be refreshed on demand

**Related Component:** `BriefingDashboard` in [03-ui-components.md](./03-ui-components.md)
**Related API:** `GET /api/chairman/briefing` in [02-api-contracts.md](./02-api-contracts.md)

---

#### US-CH-002: Single-Click Gate Approval

**Story:**
> "As the Chairman, I want to approve/reject a 'Stage Gate' with a single click."

**Acceptance Criteria:**
- [ ] Decision card shows venture name, current stage, and EVA's recommendation
- [ ] "Accept Recommendation" button is prominent (green)
- [ ] "Other Options" button expands to show: Proceed / Pivot / Fix / Kill / Pause
- [ ] If overriding EVA's recommendation, system requires brief justification
- [ ] Decision is recorded with timestamp and notes
- [ ] Next stage begins automatically after approval
- [ ] Button is disabled while request is in-flight (prevents double-submit)
- [ ] If request fails (network/500), user sees an error and can retry safely
- [ ] If decision was already resolved, UI shows “Already resolved” and refreshes briefing/decision list
- [ ] Requests are idempotent using `Idempotency-Key` (see `POST /api/chairman/decide` in `02-api-contracts.md`)

**Related API:** `POST /api/chairman/decide` in [02-api-contracts.md](./02-api-contracts.md)

---

#### US-CH-003: Token Budget Caps

**Story:**
> "As the Chairman, I want to set a 'Token Cap' for a venture so it doesn't burn cash while I sleep."

**Acceptance Criteria:**
- [ ] Can set per-venture hard cap (absolute maximum)
- [ ] Can set per-venture soft cap (warning threshold, default 85%)
- [ ] System automatically pauses venture when hard cap is reached
- [ ] Chairman receives alert when soft cap is breached
- [ ] Can adjust caps at any time without affecting running work
- [ ] Historical token spend is visible per phase

**Related Schema:** `venture_token_ledger` in [01-database-schema.md](./01-database-schema.md)

---

#### US-CH-004: Global Portfolio Health

**Story:**
> "As the Chairman, I want to see a 'Global Health' view of all portfolios."

**Acceptance Criteria:**
- [ ] Dashboard shows all portfolios with aggregate health score
- [ ] Drill-down from Portfolio → Ventures within that portfolio
- [ ] Visual indicators: ventures by phase, tokens consumed, decisions pending
- [ ] "Kill Rate" visible (ventures killed this month vs. last month)
- [ ] "Launch Rate" visible (ventures reaching Stage 23+)
- [ ] Can filter by: portfolio, status, phase, health score

**Related Component:** `PortfolioSummary` in [03-ui-components.md](./03-ui-components.md)

---

#### US-CH-005: Circuit Breaker Alerts

**Story:**
> "As the Chairman, I want to be immediately notified when a venture hits a circuit breaker (hard cap, burn rate exceeded, anomaly detected)."

**Acceptance Criteria:**
- [ ] Push notification (or dashboard alert) within 30 seconds of trigger
- [ ] Alert shows: venture name, trigger reason, tokens consumed, recommended action
- [ ] Can acknowledge and investigate or delegate to EVA
- [ ] Circuit breaker triggers are logged for post-mortem
- [ ] Can configure alert preferences (email, push, dashboard only)

---

#### US-CH-006: One-Click Drill-Down

**Story:**
> "As the Chairman, I want to click on any alert, decision, or risk item and instantly be transported to the specific Venture's Factory Floor at the relevant stage."

**Acceptance Criteria:**
- [ ] Decision card venture name is clickable
- [ ] Clicking navigates directly to `/ventures/:id?stage=N` (deep-link to stage)
- [ ] Risk widget items drill down to the affected stage
- [ ] Alert items drill down to the relevant venture/stage
- [ ] Maximum **1 click** from briefing to stage artifacts
- [ ] Back navigation returns to Chairman dashboard with state preserved
- [ ] Stage artifacts load immediately on drill-down
- [ ] If `stage` query param is missing, defaults to current stage
- [ ] If `stage` is invalid (<1, >25, NaN), defaults to current stage and shows a small notice
- [ ] If venture does not exist or is not accessible, show 404/Forbidden state with link back to `/chairman`

**Implementation:**
- `onStageClick(ventureId, stage)` handler on all clickable items
- Router navigates to `/ventures/:id?stage=N`
- Factory Floor auto-scrolls to and expands the target stage

**Related Component:** `DecisionCard`, `RiskWidget` in [03-ui-components.md](./03-ui-components.md)

---

## Persona 2: The Solo Entrepreneur (Builder Mode)

### Profile

| Attribute | Value |
|-----------|-------|
| **Role** | Hands-on Founder / Technical Lead |
| **Primary View** | `/ventures/:id` (Factory Floor) |
| **Mindset** | "I need to see exactly what the agents produced and fix it if needed" |
| **Time Horizon** | Hours to Days |
| **Key Metric** | Stage Progress & Artifact Quality |

### Focus Areas

1. **Inspection** - See raw agent outputs
2. **Quality Assurance** - Verify work meets standards
3. **Direct Intervention** - Override or rewrite agent work
4. **Real-time Monitoring** - Watch agents work live

### User Stories

#### US-SE-001: Stage Drill-Down

**Story:**
> "As the Entrepreneur, I want to 'Drill Down' into Stage 7 to see the exact artifacts the agents created."

**Acceptance Criteria:**
- [ ] Click any stage in the 25-stage timeline to expand
- [ ] Shows all artifacts produced at that stage (documents, code, analyses)
- [ ] Artifacts are viewable in-place (no download required for common formats)
- [ ] Shows which crew produced the artifact
- [ ] Shows tokens consumed at that stage
- [ ] Can download raw artifact as file

**Related Component:** `StageTimeline` in [03-ui-components.md](./03-ui-components.md)

---

#### US-SE-002: Override Agent Output

**Story:**
> "As the Entrepreneur, I want to 'Override' an agent's output by highlighting text and rewriting it."

**Acceptance Criteria:**
- [ ] When viewing an artifact, can enter "edit mode"
- [ ] Can select text and replace it with custom text
- [ ] Original text is preserved in version history
- [ ] System marks artifact as "human-modified"
- [ ] Can restore original agent output at any time
- [ ] Modified artifacts are used in downstream stages

---

#### US-SE-003: Live Telemetry

**Story:**
> "As the Entrepreneur, I want to see 'Live Telemetry' of which agent is working on what right now."

**Acceptance Criteria:**
- [ ] Dashboard shows all active agents with real-time status
- [ ] Shows: agent type, current task, tokens consumed, time elapsed
- [ ] Visual indicator of agent progress (spinner, progress bar)
- [ ] Can see queue of pending tasks
- [ ] Alerts if an agent is stuck (no progress for 5+ minutes)
- [ ] Can cancel a running agent task

**Related Schema:** `agent_task_contracts` and `agent_execution_traces` in [01-database-schema.md](./01-database-schema.md)

---

#### US-SE-004: Manual Crew Trigger

**Story:**
> "As the Entrepreneur, I want to manually trigger a specific Crew for a specific task."

**Acceptance Criteria:**
- [ ] Can select crew type from registry (Market Validation, Technical Spec, etc.)
- [ ] Can provide custom objective and constraints
- [ ] Can attach input artifacts for context
- [ ] System shows estimated token cost before execution
- [ ] Task appears in telemetry immediately
- [ ] Results delivered to venture artifacts

---

#### US-SE-005: Assumption Reality Check

**Story:**
> "As the Entrepreneur, I want to mark an assumption as 'Validated' or 'Invalidated' and see how it affects the venture."

**Acceptance Criteria:**
- [ ] Assumption registry shows all assumptions with confidence scores
- [ ] Can click assumption and update status: Validated / Invalidated / Partially Validated
- [ ] When marking invalidated, prompted to provide evidence
- [ ] System calculates impact on venture health score
- [ ] Critical assumption invalidation triggers Chairman alert
- [ ] History of assumption changes is preserved

**Related Component:** `AssumptionRegistry` in [03-ui-components.md](./03-ui-components.md)

---

## Persona 3: EVA (Chief of Staff)

### Profile

| Attribute | Value |
|-----------|-------|
| **Role** | AI Orchestrator / Gatekeeper |
| **Primary Interface** | Backend services, no direct UI |
| **Mindset** | "Protect the Chairman's time and the organization's resources" |
| **Key Metric** | Decision Quality & Efficiency |

### Focus Areas

1. **Orchestration** - Dispatch work to correct crews
2. **Protection** - Filter noise, surface only what matters
3. **Translation** - Convert natural language to technical tasks
4. **Synthesis** - Aggregate data into actionable insights

### User Stories

#### US-EVA-001: Quality Gate Filtering

**Story:**
> "As EVA, I want to intercept low-confidence agent outputs and reject them *before* bothering the Chairman."

**Acceptance Criteria:**
- [ ] All crew outputs pass through EVA quality gate
- [ ] If confidence < 70%, EVA requests revision from crew
- [ ] If confidence < 50% after 2 retries, EVA flags for human review (but not Chairman)
- [ ] Only high-confidence outputs reach Chairman's decision queue
- [ ] EVA logs all rejections with reasons
- [ ] Chairman can audit EVA's rejection history

**Related Logic:** Quality Gate in [04-eva-orchestration.md](./04-eva-orchestration.md)

---

#### US-EVA-002: Natural Language Translation

**Story:**
> "As EVA, I want to translate natural language commands ('Pivot Solara to Enterprise') into technical directives."

**Acceptance Criteria:**
- [ ] Parses Chairman's natural language input
- [ ] Extracts entities: venture name, action type, target segment
- [ ] Maps action to specific stages that need re-execution
- [ ] Estimates token cost for the translated work
- [ ] Presents interpretation back to Chairman for confirmation
- [ ] If ambiguous, asks clarifying question before proceeding

**Related Schema:** `chairman_directives.eva_interpretation` in [01-database-schema.md](./01-database-schema.md)

---

#### US-EVA-003: Proactive Alerts

**Story:**
> "As EVA, I want to proactively alert the Chairman when a venture is showing warning signs (budget burn, stalled progress, invalidated assumptions)."

**Acceptance Criteria:**
- [ ] Monitors all ventures continuously
- [ ] Triggers alert when: token burn > 150% expected, no progress for 24h, critical assumption invalidated
- [ ] Aggregates multiple alerts into single briefing item (no alert fatigue)
- [ ] Prioritizes alerts by urgency and impact
- [ ] Provides recommended action with each alert
- [ ] Can be silenced for specific ventures (vacation mode)

---

## Persona Switching

### When to Switch Modes

| Current Mode | Trigger | Switch To |
|--------------|---------|-----------|
| Chairman | Click venture name in briefing | Entrepreneur (that venture) |
| Chairman | Click "Global Health" widget | Remain in Chairman |
| Entrepreneur | Click "Back to Briefing" | Chairman |
| Entrepreneur | Complete current stage review | Remain in Entrepreneur |
| Any | URL navigation to `/chairman` | Chairman |
| Any | URL navigation to `/ventures/:id` | Entrepreneur |

### UI Affordances for Mode Switching

1. **Persistent Header** - Always shows current mode and one-click switch
2. **Breadcrumb Navigation** - Chairman > Portfolio > Venture > Stage
3. **Keyboard Shortcut** - `Cmd+Shift+C` toggles to Chairman mode
4. **Context Preservation** - Switching modes doesn't lose state

### Mode-Specific UI Differences

| Element | Chairman Mode | Entrepreneur Mode |
|---------|---------------|-------------------|
| **Primary Color** | Deep Blue (authority) | Warm Orange (energy) |
| **Default View** | Decision cards | Stage timeline |
| **Token Display** | Portfolio total | This venture only |
| **Navigation** | Ventures as cards | Stages as timeline |
| **Actions** | Approve/Reject | Edit/Override |

---

## Story Cross-Reference Matrix

Maps user stories to related technical specifications.

| Story ID | Title | Database | API | UI | EVA |
|----------|-------|----------|-----|----|----|
| US-CH-001 | Morning Briefing (God View) | `chairman_decisions` | `/api/chairman/briefing` | `BriefingDashboard`, `QuickStatCard`, `RiskWidget`, `ActiveAgentsWidget`, `FinancialWidget` | `fn_chairman_briefing` |
| US-CH-002 | Gate Approval | `chairman_decisions` | `/api/chairman/decide` | `DecisionCard` | Event handler |
| US-CH-003 | Token Caps | `venture_budget_settings`, `venture_token_ledger` | `/api/ventures/:id/budget` | `TokenLedger` | Circuit breaker |
| US-CH-004 | Portfolio Health | `ventures`, `portfolios` | `/api/chairman/portfolio` | `PortfolioSummary` | Aggregation |
| US-CH-005 | Circuit Breaker | `circuit_breaker_events`, `chairman_alerts` | `GET /api/realtime/alerts` (SSE) | `AlertsFeed` | `checkCircuitBreaker` |
| US-CH-006 | One-Click Drill-Down | - | - | `DecisionCard`, `RiskWidget` | - |
| US-SE-001 | Stage Drill-Down | `venture_artifacts` | `/api/ventures/:id` | `StageTimeline` | - |
| US-SE-002 | Override Output | `venture_artifacts` | `/api/artifacts/:id` | `ArtifactViewer`, `ArtifactEditorModal` | - |
| US-SE-003 | Live Telemetry | `agent_task_contracts` | `GET /api/realtime/telemetry` (SSE) | `TelemetryPanel` | - |
| US-SE-004 | Manual Trigger | `agent_task_contracts` | `/api/crews/dispatch` | `CrewDispatchModal` | `dispatchToCrew` |
| US-SE-005 | Assumption Check | `assumption_sets` | `/api/assumptions/:id` | `AssumptionRegistry` | Alert trigger |
| US-EVA-001 | Quality Gate | `agent_task_contracts` | - | - | Quality gate logic |
| US-EVA-002 | NL Translation | `chairman_directives` | `/api/chairman/command` | - | NLP pipeline |
| US-EVA-003 | Proactive Alerts | `chairman_alerts` | `GET /api/realtime/alerts` (SSE) | `AlertsFeed` | Monitor loop |

---

## Related Specifications

- [01-database-schema.md](./01-database-schema.md) - Tables powering these stories
- [02-api-contracts.md](./02-api-contracts.md) - API endpoints for story implementation
- [03-ui-components.md](./03-ui-components.md) - UI components referenced in acceptance criteria
- [04-eva-orchestration.md](./04-eva-orchestration.md) - EVA logic implementing EVA stories
