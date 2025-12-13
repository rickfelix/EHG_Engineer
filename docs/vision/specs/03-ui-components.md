# UI Components Specification

**Vision v2 Chairman's OS - Glass Cockpit Architecture**

> "One glance tells the whole story."

---

## Table of Contents

1. [Design Philosophy](#design-philosophy)
2. [Component Hierarchy](#component-hierarchy)
3. [Chairman's Office Components](#chairmans-office-components)
4. [Factory Floor Components](#factory-floor-components)
5. [Shared Components](#shared-components)
6. [State Management](#state-management)
7. [Migration from Legacy 7-Stage](#migration-from-legacy-7-stage)

---

## Design Philosophy

### Core Principles

1. **Glanceability** - Status should be visible in <2 seconds
2. **Progressive Disclosure** - Summary → Detail on demand
3. **Decision Orientation** - Every view answers: "What needs my attention?"
4. **Minimal Cognitive Load** - Chairman thinks in outcomes, not processes

### Production UI Requirements (Non-Negotiable)

These rules make the UI spec implementable without “guessing” during development.

#### Client ↔ Server Boundary (Production Safety)

- The UI (browser) operates only as the **Chairman** using `authenticated` session.
- The UI MUST NEVER possess or transmit a `service_role` key.
- Any agent automation is server-side only (see `02-api-contracts.md` “Production Safety Rules”).

#### Data Freshness & Update Strategy

| View/Widget | Primary Endpoint | Refresh Strategy | UX Requirement |
|------------|------------------|------------------|----------------|
| BriefingDashboard | `GET /api/chairman/briefing` | Poll every 5 min + manual refresh | Show “Last updated” timestamp; refresh does not block interactions |
| DecisionQueue | `GET /api/chairman/decisions` | Poll every 30–60s while open | New items appear without full page reload |
| VentureDetail | `GET /api/ventures/:id` | Poll every 30–60s when venture is active | Stage status updates smoothly (no jumpy layout) |
| ActiveAgentsWidget | (embedded in briefing payload) | Same as briefing | “working/queued” counts must match payload |
| Trace Viewer | `GET /api/traces/:correlationId` | Poll every 3–10s while in_progress | Timeline appends new events; never reorders existing events |

#### Loading / Empty / Error States (Per Screen)

- **BriefingDashboard**
  - **Loading**: skeleton cards for greeting/command strip/decision stack; page chrome visible immediately.
  - **Empty**: “No ventures yet” onboarding with CTA (create/seed first venture).
  - **Error**: inline banner + “Retry” + show last cached briefing if available.
- **Decision actions (`POST /api/chairman/decide`)**
  - **In-flight**: disable buttons; show spinner on clicked action.
  - **Success**: optimistic removal of the decision card + background refresh.
  - **Failure**: toast/banner with actionable message; re-enable buttons; do not drop decision from UI.
  - **Conflict** (already decided): show “Already resolved” and refresh.
- **VentureDetail**
  - **Loading**: skeleton stage timeline + side panels.
  - **Error**: show “Unable to load venture” with retry; preserve route.
  - **Not found**: explicit 404 state with link back to `/chairman`.

#### Deep-Link Navigation Contract (Critical)

The system supports deep-linking to a stage via query param:
- **Canonical URL**: `/ventures/:id?stage=N`
- **Behavior**:
  - If `stage` is missing: open venture at its current stage (highlighted).
  - If `stage` is invalid (<1, >25, NaN): fallback to current stage and show a small notice.
  - If `stage` is valid but data is still loading: defer scroll/expand until data arrives.
  - After navigation: stage timeline auto-scrolls the target stage into view and expands its artifacts panel.

#### Accessibility (A11y) Requirements

- All decision actions must be keyboard operable (Tab/Enter/Space).
- Modals must trap focus and close on Escape.
- Buttons/links must have accessible names (venture + stage).
- Color is never the only signal (badges + text labels required).

### Visual Language

```
Health Indicators:
  🟢 Green  - On track, no action needed
  🟡 Yellow - Attention recommended
  🔴 Red    - Action required
  ⚪ Gray   - Paused or inactive

Stage Progress:
  ████████░░░░░░░░░░░░░░░░░ 32% (Stage 8 of 25)
  [THE TRUTH] [THE ENGINE*] [THE IDENTITY] [THE BLUEPRINT] [THE BUILD] [LAUNCH]
```

---

## Component Hierarchy

```
App
├── ChairmanLayout                    # /chairman/* routes
│   ├── ChairmanHeader
│   │   ├── EVAGreeting
│   │   └── GlobalHealthIndicator
│   ├── ChairmanSidebar
│   │   ├── NavigationMenu
│   │   └── QuickStats
│   └── ChairmanContent
│       ├── BriefingDashboard         # /chairman (default) - "God View"
│       │   ├── EVAGreeting
│       │   ├── QuickStatCard (x4)    # Command Strip: Decisions, Agents, Risk, Spend
│       │   ├── DecisionStack
│       │   │   └── DecisionCard      # With 1-click drill-down
│       │   ├── RiskWidget            # Ventures at risk
│       │   ├── ActiveAgentsWidget    # Live agent status
│       │   ├── PortfolioSummary
│       │   ├── FinancialWidget       # Budget & spend overview
│       │   └── AlertsFeed
│       ├── DecisionQueue             # /chairman/decisions
│       │   ├── DecisionCard
│       │   └── DecisionModal
│       └── PortfolioView             # /chairman/portfolio
│           ├── VentureGrid
│           └── VentureCard
│
├── FactoryLayout                     # /ventures/* routes
│   ├── FactoryHeader
│   │   ├── VentureBreadcrumb
│   │   └── StageProgress
│   ├── FactorySidebar
│   │   ├── StageNavigator
│   │   └── ArtifactList
│   └── FactoryContent
│       ├── VentureDetail             # /ventures/:id
│       │   ├── StageTimeline
│       │   ├── AssumptionRegistry
│       │   └── TokenLedger
│       └── StageExecution            # /ventures/:id/stage/:num
│           ├── StageObjectives
│           ├── CrewProgress
│           └── ArtifactViewer
│
└── SharedComponents
    ├── HealthBadge
    ├── ProgressRing
    ├── TokenBudgetBar
    ├── AssumptionCard
    └── DecisionButton
```

---

## Opportunity Discovery (Deal Flow) UI (Autonomous Ideation)

Vision v2 supports autonomous opportunity discovery: AI generates **Opportunity Blueprints** which the Chairman can browse and instantiate into Stage 0 ventures.

### Chairman’s Office Additions

#### OpportunityInbox

- **Purpose**: a curated “deal flow” feed of AI-generated blueprints (not ventures).
- **Inputs**:
  - `GET /api/blueprints?status=approved`
  - optional filtering by `status`, `category`, `focus_tags`
- **Actions**:
  - **Generate**: triggers `POST /api/blueprints/generate` (manual mode)
  - **Review**: triggers `POST /api/blueprints/:id/review` (board simulation)
  - **Instantiate Venture**: triggers `POST /api/blueprints/:id/instantiate` (creates Stage 0 venture + Inception Brief)
  - **Dismiss/Reject**: logs `blueprint_selection_signals` for learning

- **Morning Briefing integration**:
  - The Briefing dashboard MUST include a glanceable widget driven by `briefing.opportunity_inbox`:
    - `new_since_last_briefing`
    - `total_approved`
    - `pending_reviews`
    - `top_blueprints` (top 3–5 cards)

#### BlueprintGenerationProgress

- **Purpose**: real-time status telemetry for a running generation job.
- **Data**:
  - `GET /api/blueprints/jobs/:id` (job + recent events)
- **UI states**:
  - queued / running / completed / failed
  - event timeline (append-only) with `progress_pct`, `agent_name`, `tokens_used`

#### BoardReviewVisualization

- **Purpose**: visualize 7-member board votes and the consensus verdict.
- **Display**:
  - vote cards: member → vote → rationale
  - consensus gauge and verdict summary

### Factory Floor / Venture Creation Integration

#### Create Venture from Blueprint (Stage 0)

- When the Chairman chooses **Instantiate Venture**, the system creates:
  - a new venture at **Stage 0**
  - an **Inception Brief** with `entry_method='blueprint'`
- The venture MUST NOT be auto-promoted to Stage 1; promotion remains a separate Chairman decision (atomic/idempotent RPC).

---

## Chairman's Office Components

### BriefingDashboard

The Chairman's home view. EVA's synthesized morning briefing with full "God View" capability.

```typescript
// src/components/chairman/BriefingDashboard.tsx

interface BriefingDashboardProps {
  briefing: ChairmanBriefing;
  onDecision: (decisionId: string, choice: DecisionChoice) => void;
  onVentureClick: (ventureId: string) => void;
  onStageClick: (ventureId: string, stage: number) => void;  // Deep-link to specific stage
}

export function BriefingDashboard({
  briefing,
  onDecision,
  onVentureClick,
  onStageClick
}: BriefingDashboardProps) {
  return (
    <div className="grid grid-cols-12 gap-6 p-6">
      {/* Row 1: EVA Greeting - Full Width */}
      <div className="col-span-12">
        <EVAGreeting
          greeting={briefing.greeting}
          healthScore={briefing.global_health_score}
        />
      </div>

      {/* Row 2: Command Strip - God View Quick Stats */}
      <div className="col-span-12">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <QuickStatCard
            label="Decisions Pending"
            value={briefing.decision_count}
            icon={AlertTriangle}
            color="amber"
            onClick={() => document.getElementById('decision-stack')?.scrollIntoView()}
          />
          <QuickStatCard
            label="Active Agents"
            value={briefing.active_agents.total_working}
            subtext={`${briefing.active_agents.total_queued} queued`}
            icon={Bot}
            color="blue"
          />
          <QuickStatCard
            label="New Opportunities"
            value={briefing.opportunity_inbox.new_since_last_briefing}
            subtext={`${briefing.opportunity_inbox.total_approved} approved`}
            icon={Sparkles}
            color="indigo"
            onClick={() => document.getElementById('opportunity-inbox')?.scrollIntoView()}
          />
          <QuickStatCard
            label="At Risk"
            value={briefing.risk_overview.ventures_at_risk}
            icon={ShieldAlert}
            color={briefing.risk_overview.ventures_at_risk > 0 ? 'red' : 'green'}
            trend={briefing.risk_overview.trend}
          />
          <QuickStatCard
            label="MTD Spend"
            value={`$${briefing.financial_overview.total_spent_usd.toFixed(2)}`}
            subtext={`of $${briefing.financial_overview.total_budget_usd}`}
            icon={DollarSign}
            color="green"
            trend={briefing.financial_overview.burn_rate_trend}
          />
        </div>
      </div>

      {/* Row 3: Primary Focus Area */}
      <div className="col-span-12 lg:col-span-8" id="decision-stack">
        <DecisionStack
          decisions={briefing.decision_stack}
          onDecision={onDecision}
          onVentureClick={onVentureClick}
          onStageClick={onStageClick}
        />
      </div>

      {/* Row 3: Right Sidebar - Risk & Agents */}
      <div className="col-span-12 lg:col-span-4 space-y-4">
        <RiskWidget
          risks={briefing.risk_overview}
          onVentureClick={onVentureClick}
          onStageClick={onStageClick}
        />
        <ActiveAgentsWidget
          agents={briefing.active_agents}
          onVentureClick={onVentureClick}
        />
      </div>

      {/* Row 4: Secondary Widgets */}
      <div className="col-span-12 lg:col-span-4">
        <PortfolioSummary
          health={briefing.portfolio_health}
          onVentureClick={onVentureClick}
        />
      </div>

      <div className="col-span-12 lg:col-span-4">
        <FinancialWidget
          financial={briefing.financial_overview}
          onVentureClick={onVentureClick}
        />
      </div>

      <div className="col-span-12 lg:col-span-4">
        <AlertsFeed
          alerts={briefing.alerts}
          onVentureClick={onVentureClick}
        />
      </div>
    </div>
  );
}
```

### DecisionStack

The heart of Chairman's OS - decisions requiring attention.

```typescript
// src/components/chairman/DecisionStack.tsx

interface DecisionStackProps {
  decisions: DecisionStackItem[];
  onDecision: (decisionId: string, choice: DecisionChoice) => void;
  onVentureClick: (ventureId: string) => void;
  onStageClick: (ventureId: string, stage: number) => void;  // 1-click drill-down
}

interface DecisionStackItem {
  id: string;
  venture_id: string;
  venture_name: string;
  type: 'gate_decision' | 'pivot_request' | 'kill_recommendation';
  gate_type?: GateType; // Present when type === 'gate_decision'
  stage: number;
  stage_name: string;
  urgency: 'high' | 'medium' | 'low';
  summary: string;
  recommendation: DecisionType;
  evidence_summary: string;
  created_at: string;
}

type DecisionChoice = 'proceed' | 'pivot' | 'fix' | 'kill' | 'pause';

export function DecisionStack({
  decisions,
  onDecision,
  onVentureClick,
  onStageClick
}: DecisionStackProps) {
  if (decisions.length === 0) {
    return (
      <Card className="p-8 text-center">
        <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
        <h3 className="text-lg font-medium">All Clear</h3>
        <p className="text-gray-500">No decisions pending. Your ventures are progressing.</p>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          Decisions Awaiting ({decisions.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {decisions.map((decision) => (
          <DecisionCard
            key={decision.id}
            decision={decision}
            onDecision={onDecision}
            onVentureClick={onVentureClick}
            onStageClick={onStageClick}
          />
        ))}
      </CardContent>
    </Card>
  );
}
```

### DecisionCard

Individual decision with context, action buttons, and **1-click drill-down navigation**.

```typescript
// src/components/chairman/DecisionCard.tsx

interface DecisionCardProps {
  decision: DecisionStackItem;
  onDecision: (decisionId: string, choice: DecisionChoice) => void;
  onVentureClick: (ventureId: string) => void;
  onStageClick: (ventureId: string, stage: number) => void;  // 1-click to stage artifacts
}

export function DecisionCard({
  decision,
  onDecision,
  onVentureClick,
  onStageClick
}: DecisionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const urgencyColors = {
    high: 'border-l-red-500 bg-red-50 dark:bg-red-950/20',
    medium: 'border-l-amber-500 bg-amber-50 dark:bg-amber-950/20',
    low: 'border-l-blue-500 bg-blue-50 dark:bg-blue-950/20',
  };

  return (
    <div className={`border-l-4 rounded-lg p-4 ${urgencyColors[decision.urgency]}`}>
      {/* Header - Clickable for drill-down */}
      <div className="flex items-start justify-between">
        <div>
          {/* 1-CLICK DRILL-DOWN: Venture + Stage link */}
          <button
            onClick={() => onStageClick(decision.venture_id, decision.stage)}
            className="font-medium text-blue-600 hover:text-blue-800 hover:underline text-left"
          >
            {decision.venture_name} → Stage {decision.stage}
          </button>
          <p className="text-sm text-gray-600">{decision.stage_name}</p>
        </div>
        <Badge variant={decision.type === 'kill_recommendation' ? 'destructive' : 'secondary'}>
          {decision.type.replace('_', ' ')}
        </Badge>
      </div>

      {/* Summary */}
      <p className="mt-2 text-sm">{decision.summary}</p>

      {/* EVA Recommendation */}
      <div className="mt-3 p-2 bg-white/50 dark:bg-black/20 rounded">
        <span className="text-xs text-gray-500">EVA Recommends:</span>
        <span className="ml-2 font-medium capitalize">{decision.recommendation}</span>
      </div>

      {/* Evidence Toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="mt-2 text-xs text-blue-600 hover:underline"
      >
        {expanded ? 'Hide' : 'Show'} Evidence
      </button>

      {expanded && (
        <div className="mt-2 text-sm text-gray-600 bg-gray-50 dark:bg-gray-800 p-3 rounded">
          {decision.evidence_summary}
        </div>
      )}

      {/* Action Buttons */}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="default"
          size="sm"
          onClick={() => onDecision(decision.id, decision.recommendation)}
        >
          Accept: {decision.recommendation}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowModal(true)}
        >
          Other Options...
        </Button>
        {/* Quick navigation to venture overview */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onVentureClick(decision.venture_id)}
        >
          <ExternalLink className="w-4 h-4 mr-1" />
          View Venture
        </Button>
      </div>

      {/* Decision Modal */}
      {showModal && (
        <DecisionModal
          decision={decision}
          onDecision={onDecision}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
```

### PortfolioSummary

High-level portfolio health view.

```typescript
// src/components/chairman/PortfolioSummary.tsx

interface PortfolioSummaryProps {
  health: PortfolioHealth;
  onVentureClick: (ventureId: string) => void;
}

interface PortfolioHealth {
  total_ventures: number;
  active: number;
  paused: number;
  killed_this_month: number;
  launched_this_month: number;
  by_phase: PhaseDistribution[];
}

interface PhaseDistribution {
  phase: string;
  count: number;
  avg_health: number;
}

export function PortfolioSummary({ health, onVentureClick }: PortfolioSummaryProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Portfolio Health</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <StatBox label="Active" value={health.active} color="green" />
          <StatBox label="Paused" value={health.paused} color="gray" />
          <StatBox label="Killed (MTD)" value={health.killed_this_month} color="red" />
          <StatBox label="Launched (MTD)" value={health.launched_this_month} color="blue" />
        </div>

        {/* Phase Distribution */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-500">By Phase</h4>
          {health.by_phase.map((phase) => (
            <PhaseBar
              key={phase.phase}
              phase={phase.phase}
              count={phase.count}
              total={health.total_ventures}
              health={phase.avg_health}
            />
          ))}
        </div>

        {/* View All Link */}
        <Link
          to="/chairman/portfolio"
          className="mt-4 block text-center text-sm text-blue-600 hover:underline"
        >
          View All {health.total_ventures} Ventures
        </Link>
      </CardContent>
    </Card>
  );
}
```

---

## Factory Floor Components

### VentureDetail

Detailed view of a single venture's 25-stage journey.

```typescript
// src/components/factory/VentureDetail.tsx

interface VentureDetailProps {
  venture: VentureDetailResponse;
  onStageClick: (stageNumber: number) => void;
}

export function VentureDetail({ venture, onStageClick }: VentureDetailProps) {
  return (
    <div className="space-y-6">
      {/* Venture Header */}
      <VentureHeader venture={venture} />

      {/* Stage Timeline - The 25-Stage Journey */}
      <StageTimeline
        stages={venture.stages}
        currentStage={venture.current_stage}
        onStageClick={onStageClick}
      />

      {/* Three Column Layout */}
      <div className="grid grid-cols-12 gap-6">
        {/* Assumptions Registry */}
        <div className="col-span-12 lg:col-span-4">
          <AssumptionRegistry assumptions={venture.assumptions} />
        </div>

        {/* Current Stage Detail */}
        <div className="col-span-12 lg:col-span-5">
          <CurrentStageCard
            // Stage 0 is INCEPTION (pre-lifecycle) and may not exist in `venture.stages`.
            // CurrentStageCard MUST handle stage 0 by rendering the Inception Brief panel instead.
            stage={venture.current_stage === 0 ? undefined : venture.stages[venture.current_stage - 1]}
            inceptionBrief={venture.current_stage === 0 ? venture.inception_brief : undefined}
          />
        </div>

        {/* Token Ledger */}
        <div className="col-span-12 lg:col-span-3">
          <TokenLedger ledger={venture.token_ledger} />
        </div>
      </div>
    </div>
  );
}
```

### StageTimeline

Visual representation of the 25-stage journey.

```typescript
// src/components/factory/StageTimeline.tsx

interface StageTimelineProps {
  stages: StageInfo[];
  currentStage: number;
  onStageClick: (stageNumber: number) => void;
}

// The 6 phases with their stage ranges (Stage 0 is a pre-lifecycle "INCEPTION" chip)
const PHASES = [
  // NOTE: Phase IDs must align with API `PhaseName` (see `02-api-contracts.md`)
  { id: 'THE_TRUTH', range: [1, 5], color: 'blue' },
  { id: 'THE_ENGINE', range: [6, 9], color: 'purple' },
  { id: 'THE_IDENTITY', range: [10, 12], color: 'pink' },
  { id: 'THE_BLUEPRINT', range: [13, 16], color: 'indigo' },
  { id: 'THE_BUILD_LOOP', range: [17, 20], color: 'green' },
  { id: 'LAUNCH_LEARN', range: [21, 25], color: 'amber' }, // Display name: "Launch & Learn"
];

export function StageTimeline({ stages, currentStage, onStageClick }: StageTimelineProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>25-Stage Journey</CardTitle>
        <p className="text-sm text-gray-500">
          {currentStage === 0
            ? 'Currently at Stage 0: INCEPTION'
            : `Currently at Stage ${currentStage}: ${stages[currentStage - 1]?.stage_name}`}
        </p>
      </CardHeader>
      <CardContent>
        {/* Stage 0 Chip (Pre-Lifecycle) */}
        <div className="mb-2 flex items-center gap-2">
          <button
            onClick={() => onStageClick(0)}
            className={`rounded px-2 py-1 text-xs font-medium border ${
              currentStage === 0 ? 'bg-cyan-100 text-cyan-800 border-cyan-200' : 'bg-transparent text-gray-600 border-gray-200'
            }`}
            title="Stage 0: INCEPTION"
          >
            INCEPTION
          </button>
          <span className="text-xs text-gray-500">Pre-lifecycle capture + gating</span>
        </div>

        {/* Phase Headers */}
        <div className="flex mb-2">
          {PHASES.map((phase) => (
            <div
              key={phase.id}
              className={`flex-1 text-center text-xs font-medium text-${phase.color}-600`}
              style={{ flex: phase.range[1] - phase.range[0] + 1 }}
            >
              {phase.id}
            </div>
          ))}
        </div>

        {/* Stage Dots */}
        <div className="flex gap-1">
          {stages.map((stage, idx) => (
            <StageNode
              key={stage.stage_number}
              stage={stage}
              isCurrent={stage.stage_number === currentStage}
              onClick={() => onStageClick(stage.stage_number)}
            />
          ))}
        </div>

        {/* Progress Bar */}
        <div className="mt-4">
          <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-green-500 transition-all"
              style={{ width: `${(currentStage / 25) * 100}%` }}
            />
          </div>
          <p className="text-right text-xs text-gray-500 mt-1">
            {Math.round((currentStage / 25) * 100)}% Complete
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function StageNode({ stage, isCurrent, onClick }: StageNodeProps) {
  const statusColors = {
    completed: 'bg-green-500',
    in_progress: 'bg-blue-500 animate-pulse',
    pending: 'bg-gray-300 dark:bg-gray-600',
    skipped: 'bg-gray-400 line-through',
  };

  return (
    <button
      onClick={onClick}
      className={`
        w-4 h-4 rounded-full transition-all
        ${statusColors[stage.status]}
        ${isCurrent ? 'ring-2 ring-offset-2 ring-blue-500 scale-125' : ''}
        hover:scale-110
      `}
      title={`Stage ${stage.stage_number}: ${stage.stage_name}`}
    />
  );
}
```

### ArtifactViewer + ArtifactEditorModal

Factory Floor requires a first-class artifact experience:

- **Viewer**: read artifact content inline (markdown/code/text) or link out if stored externally.
- **Editor**: allow Chairman/Entrepreneur to “Override Agent Output” by creating a new version.

```typescript
// src/components/factory/ArtifactViewer.tsx
interface ArtifactViewerProps {
  artifactId: string;
}

// Data dependency
// GET /api/artifacts/:id

// src/components/factory/ArtifactEditorModal.tsx
interface ArtifactEditorModalProps {
  artifactId: string;
  isOpen: boolean;
  onClose: () => void;
}

// Data dependencies
// GET /api/artifacts/:id
// GET /api/artifacts/:id/versions
// PATCH /api/artifacts/:id   (Idempotency-Key required)
```

**Production behaviors:**
- **Loading**: skeleton content + disabled “Edit” button until artifact loads.
- **Error**: show error state with retry; never drop user edits.
- **Versioning**: after successful save, UI shows “Version X saved” and updates `is_human_modified`.
- **Restore** (optional): select a prior version and re-promote it as current via PATCH (future).

### TelemetryPanel (Live Telemetry)

Live telemetry shows what agents are doing now, with safe production defaults.

```typescript
// src/components/factory/TelemetryPanel.tsx
interface TelemetryPanelProps {
  ventureId: string;
}

// Data dependencies
// Primary: SSE GET /api/realtime/telemetry
// Fallback: Poll GET /api/ventures/:id every 30–60s (stage + crew_assignment)
```

**Production behaviors:**
- If SSE disconnects, show “Realtime disconnected; switching to polling” notice.
- Never show “service_role” details; only user-safe telemetry fields.

### CrewDispatchModal (Manual Crew Trigger)

Manual crew trigger for Entrepreneur mode.

```typescript
// src/components/factory/CrewDispatchModal.tsx
interface CrewDispatchModalProps {
  ventureId: string;
  stageNumber: number;
  isOpen: boolean;
  onClose: () => void;
}

// Data dependency
// POST /api/crews/dispatch (Idempotency-Key required)
```

**Production behaviors:**
- Validate `stageNumber` 1–25 client-side.
- Disable submit while in-flight; show returned `task_contract_id` on success.

### AssumptionRegistry

Track assumptions vs reality throughout the journey.

```typescript
// src/components/factory/AssumptionRegistry.tsx

interface AssumptionRegistryProps {
  assumptions: Assumption[];
}

interface Assumption {
  id: string;
  category: 'market' | 'customer' | 'technical' | 'financial';
  text: string;
  confidence: number;
  stage_created: number;
  reality_status: 'pending' | 'validated' | 'invalidated';
  validation_evidence?: string;
}

export function AssumptionRegistry({ assumptions }: AssumptionRegistryProps) {
  const [filter, setFilter] = useState<string>('all');

  const categoryIcons = {
    market: TrendingUp,
    customer: Users,
    technical: Code,
    financial: DollarSign,
  };

  const statusColors = {
    pending: 'bg-gray-100 text-gray-700',
    validated: 'bg-green-100 text-green-700',
    invalidated: 'bg-red-100 text-red-700',
  };

  const filtered = filter === 'all'
    ? assumptions
    : assumptions.filter(a => a.reality_status === filter);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="w-5 h-5" />
          Assumptions Registry
        </CardTitle>
        {/* Filter Tabs */}
        <div className="flex gap-2 mt-2">
          {['all', 'pending', 'validated', 'invalidated'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2 py-1 text-xs rounded ${
                filter === f ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {filtered.map((assumption) => {
            const Icon = categoryIcons[assumption.category];
            return (
              <div
                key={assumption.id}
                className={`p-3 rounded-lg ${statusColors[assumption.reality_status]}`}
              >
                <div className="flex items-start gap-2">
                  <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm">{assumption.text}</p>
                    <div className="flex items-center gap-2 mt-1 text-xs opacity-75">
                      <span>Stage {assumption.stage_created}</span>
                      <span>|</span>
                      <span>{Math.round(assumption.confidence * 100)}% confident</span>
                    </div>
                    {assumption.validation_evidence && (
                      <p className="mt-1 text-xs italic">
                        {assumption.validation_evidence}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
```

### TokenLedger

Visual token budget tracking by phase.

```typescript
// src/components/factory/TokenLedger.tsx

interface TokenLedgerProps {
  ledger: TokenLedgerData;
}

interface TokenLedgerData {
  by_phase: Record<string, { budget: number; consumed: number }>;
  total_budget: number;
  total_consumed: number;
}

export function TokenLedger({ ledger }: TokenLedgerProps) {
  const burnPercent = (ledger.total_consumed / ledger.total_budget) * 100;
  const isOverBudget = burnPercent > 100;
  const isWarning = burnPercent > 75 && !isOverBudget;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cpu className="w-5 h-5" />
          Token Budget
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Total Progress */}
        <div className="mb-4">
          <div className="flex justify-between text-sm mb-1">
            <span>Total Used</span>
            <span className={isOverBudget ? 'text-red-600' : isWarning ? 'text-amber-600' : ''}>
              {ledger.total_consumed.toLocaleString()} / {ledger.total_budget.toLocaleString()}
            </span>
          </div>
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${
                isOverBudget ? 'bg-red-500' : isWarning ? 'bg-amber-500' : 'bg-blue-500'
              }`}
              style={{ width: `${Math.min(burnPercent, 100)}%` }}
            />
          </div>
          <p className="text-right text-xs text-gray-500 mt-1">
            {burnPercent.toFixed(1)}%
          </p>
        </div>

        {/* By Phase */}
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-gray-500">By Phase</h4>
          {Object.entries(ledger.by_phase).map(([phase, data]) => (
            <PhaseTokenBar
              key={phase}
              phase={phase}
              budget={data.budget}
              consumed={data.consumed}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
```

### Stage 0: Inception Brief + Promotion UX (Factory Floor)

When `venture.current_stage === 0`, the Factory Floor MUST surface Stage 0 as a first-class “pre-stage”:

- **InceptionBriefPanel**: renders the latest Inception Brief (structured fields + version history).
- **Optional actions**:
  - **Run Inception Triage (Simulation)**: triggers a bounded crew run and stores a “triage_report” artifact tagged by Four Buckets.
  - **Run Complexity Assessment**: on-demand tier recommendation and token budget guidance.
- **Promote to Stage 1**:
  - Uses `POST /api/ventures/:id/promote`
  - Requires confirmation (explicit user intent)
  - Must be idempotent (client retries safe via `Idempotency-Key`)

---

## God View Widgets (New)

These widgets provide the Chairman's "at-a-glance" dashboard capabilities.

### QuickStatCard

Command strip stat card for God View metrics.

```typescript
// src/components/chairman/QuickStatCard.tsx

interface QuickStatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  icon: React.ComponentType<{ className?: string }>;
  color: 'amber' | 'blue' | 'red' | 'green' | 'gray';
  trend?: 'increasing' | 'stable' | 'decreasing' | 'improving' | 'degrading';
  onClick?: () => void;
}

const colorMap = {
  amber: 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/30 dark:border-amber-800',
  blue: 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/30 dark:border-blue-800',
  red: 'bg-red-50 border-red-200 text-red-700 dark:bg-red-950/30 dark:border-red-800',
  green: 'bg-green-50 border-green-200 text-green-700 dark:bg-green-950/30 dark:border-green-800',
  gray: 'bg-gray-50 border-gray-200 text-gray-700 dark:bg-gray-800 dark:border-gray-700',
};

const trendIcons = {
  increasing: { icon: TrendingUp, color: 'text-red-500' },
  decreasing: { icon: TrendingDown, color: 'text-green-500' },
  stable: { icon: Minus, color: 'text-gray-400' },
  improving: { icon: TrendingUp, color: 'text-green-500' },
  degrading: { icon: TrendingDown, color: 'text-red-500' },
};

export function QuickStatCard({
  label,
  value,
  subtext,
  icon: Icon,
  color,
  trend,
  onClick
}: QuickStatCardProps) {
  const TrendIcon = trend ? trendIcons[trend].icon : null;

  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`
        p-4 rounded-lg border transition-all text-left w-full
        ${colorMap[color]}
        ${onClick ? 'hover:shadow-md cursor-pointer' : 'cursor-default'}
      `}
    >
      <div className="flex items-start justify-between">
        <Icon className="w-5 h-5 opacity-70" />
        {trend && TrendIcon && (
          <TrendIcon className={`w-4 h-4 ${trendIcons[trend].color}`} />
        )}
      </div>
      <div className="mt-2">
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-sm opacity-70">{label}</p>
        {subtext && <p className="text-xs opacity-50 mt-1">{subtext}</p>}
      </div>
    </button>
  );
}
```

### RiskWidget

Ventures at risk with drill-down capability.

```typescript
// src/components/chairman/RiskWidget.tsx

interface RiskWidgetProps {
  risks: RiskOverview;
  onVentureClick: (ventureId: string) => void;
  onStageClick: (ventureId: string, stage: number) => void;
}

const riskTypeLabels = {
  token_overburn: 'Budget Overrun',
  stalled: 'Stalled Progress',
  assumption_invalidated: 'Assumption Invalid',
  gate_blocked: 'Gate Blocked',
};

const severityColors = {
  critical: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-950/30 dark:text-red-300',
  warning: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300',
};

export function RiskWidget({ risks, onVentureClick, onStageClick }: RiskWidgetProps) {
  if (risks.ventures_at_risk === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-green-500" />
            Risk Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-green-600">All ventures healthy</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-red-500" />
          At Risk ({risks.ventures_at_risk})
          <Badge variant="outline" className="ml-auto text-xs">
            {risks.trend}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {risks.critical_items.slice(0, 3).map((risk, idx) => (
          <button
            key={idx}
            onClick={() => risk.stage
              ? onStageClick(risk.venture_id, risk.stage)
              : onVentureClick(risk.venture_id)
            }
            className={`
              w-full text-left p-2 rounded border text-xs
              hover:shadow-sm transition-shadow
              ${severityColors[risk.severity]}
            `}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">{risk.venture_name}</span>
              <Badge variant="outline" className="text-xs">
                {riskTypeLabels[risk.risk_type]}
              </Badge>
            </div>
            <p className="mt-1 opacity-80 truncate">{risk.message}</p>
          </button>
        ))}
        {risks.critical_items.length > 3 && (
          <p className="text-xs text-gray-500 text-center">
            +{risks.critical_items.length - 3} more
          </p>
        )}
      </CardContent>
    </Card>
  );
}
```

### ActiveAgentsWidget

Live view of working agents.

```typescript
// src/components/chairman/ActiveAgentsWidget.tsx

interface ActiveAgentsWidgetProps {
  agents: ActiveAgentsOverview;
  onVentureClick: (ventureId: string) => void;
}

export function ActiveAgentsWidget({ agents, onVentureClick }: ActiveAgentsWidgetProps) {
  if (agents.total_working === 0 && agents.total_queued === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Bot className="w-4 h-4 text-gray-400" />
            Agent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500">No active agents</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Bot className="w-4 h-4 text-blue-500 animate-pulse" />
          Active Agents ({agents.total_working})
          {agents.total_queued > 0 && (
            <span className="text-xs text-gray-500 ml-auto">
              {agents.total_queued} queued
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {agents.agents.filter(a => a.status === 'working').slice(0, 3).map((agent, idx) => (
          <button
            key={idx}
            onClick={() => onVentureClick(agent.venture_id)}
            className="w-full text-left p-2 rounded bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-100 transition-colors"
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-blue-700 dark:text-blue-300">
                {agent.venture_name}
              </span>
              <span className="text-blue-500">{agent.duration_minutes}m</span>
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-gray-600">
              <span>Stage {agent.stage}</span>
              <span className="opacity-50">•</span>
              <span>{agent.crew_type}</span>
            </div>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}
```

### FinancialWidget

Budget and spend overview.

```typescript
// src/components/chairman/FinancialWidget.tsx

interface FinancialWidgetProps {
  financial: FinancialOverview;
  onVentureClick: (ventureId: string) => void;
}

export function FinancialWidget({ financial, onVentureClick }: FinancialWidgetProps) {
  const percentUsed = (financial.total_spent_usd / financial.total_budget_usd) * 100;
  const isWarning = percentUsed > 75;
  const isCritical = percentUsed > 90;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <DollarSign className="w-4 h-4" />
          Financial Overview
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Budget Progress Bar */}
        <div className="mb-4">
          <div className="flex justify-between text-xs mb-1">
            <span>MTD Spend</span>
            <span className={isCritical ? 'text-red-600' : isWarning ? 'text-amber-600' : ''}>
              ${financial.total_spent_usd.toFixed(2)} / ${financial.total_budget_usd.toFixed(2)}
            </span>
          </div>
          <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${
                isCritical ? 'bg-red-500' : isWarning ? 'bg-amber-500' : 'bg-green-500'
              }`}
              style={{ width: `${Math.min(percentUsed, 100)}%` }}
            />
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-2 gap-2 text-xs mb-3">
          <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded">
            <p className="text-gray-500">Remaining</p>
            <p className="font-medium">${financial.budget_remaining_usd.toFixed(2)}</p>
          </div>
          <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded">
            <p className="text-gray-500">Projected</p>
            <p className="font-medium">${financial.projected_monthly_usd.toFixed(2)}</p>
          </div>
        </div>

        {/* Top Spenders */}
        <p className="text-xs text-gray-500 mb-2">Top Spenders</p>
        <div className="space-y-1">
          {financial.top_spenders.slice(0, 3).map((spender) => (
            <button
              key={spender.venture_id}
              onClick={() => onVentureClick(spender.venture_id)}
              className="w-full flex items-center justify-between text-xs p-1 hover:bg-gray-50 dark:hover:bg-gray-800 rounded"
            >
              <span>{spender.venture_name}</span>
              <span className={spender.percent_consumed > 80 ? 'text-red-600' : ''}>
                ${spender.spent_usd.toFixed(2)} ({spender.percent_consumed.toFixed(0)}%)
              </span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
```

---

## Shared Components

### HealthBadge

Consistent health indicator across all views.

```typescript
// src/components/shared/HealthBadge.tsx

interface HealthBadgeProps {
  score: 'green' | 'yellow' | 'red' | number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export function HealthBadge({ score, size = 'md', showLabel = false }: HealthBadgeProps) {
  // Convert numeric score to color
  const color = typeof score === 'number'
    ? score >= 70 ? 'green' : score >= 40 ? 'yellow' : 'red'
    : score;

  const sizeClasses = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-6 h-6',
  };

  const colorClasses = {
    green: 'bg-green-500',
    yellow: 'bg-amber-500',
    red: 'bg-red-500',
  };

  return (
    <div className="flex items-center gap-2">
      <div className={`rounded-full ${sizeClasses[size]} ${colorClasses[color]}`} />
      {showLabel && (
        <span className="text-sm capitalize">{color}</span>
      )}
    </div>
  );
}
```

### ProgressRing

Circular progress indicator for stage completion.

```typescript
// src/components/shared/ProgressRing.tsx

interface ProgressRingProps {
  progress: number; // 0-100
  size?: number;
  strokeWidth?: number;
  showLabel?: boolean;
}

export function ProgressRing({
  progress,
  size = 60,
  strokeWidth = 6,
  showLabel = true
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress / 100) * circumference;

  const getColor = (p: number) => {
    if (p >= 100) return 'text-green-500';
    if (p >= 50) return 'text-blue-500';
    return 'text-gray-400';
  };

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-gray-200 dark:text-gray-700"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={`transition-all duration-500 ${getColor(progress)}`}
        />
      </svg>
      {showLabel && (
        <span className="absolute text-xs font-medium">
          {Math.round(progress)}%
        </span>
      )}
    </div>
  );
}
```

---

## State Management

### Global State Architecture

```typescript
// src/store/index.ts

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ChairmanState {
  // Briefing data (cached, refreshed periodically)
  briefing: ChairmanBriefing | null;
  briefingLoadedAt: Date | null;

  // Active venture context (when in Factory Floor)
  activeVentureId: string | null;
  activeVenture: VentureDetailResponse | null;

  // UI state
  sidebarCollapsed: boolean;
  theme: 'light' | 'dark' | 'system';

  // Actions
  loadBriefing: () => Promise<void>;
  loadVenture: (id: string) => Promise<void>;
  submitDecision: (decisionId: string, choice: DecisionChoice, notes?: string) => Promise<void>;
  toggleSidebar: () => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
}

export const useChairmanStore = create<ChairmanState>()(
  persist(
    (set, get) => ({
      briefing: null,
      briefingLoadedAt: null,
      activeVentureId: null,
      activeVenture: null,
      sidebarCollapsed: false,
      theme: 'system',

      loadBriefing: async () => {
        const res = await fetch('/api/chairman/briefing');
        const briefing = await res.json();
        set({ briefing, briefingLoadedAt: new Date() });
      },

      loadVenture: async (id: string) => {
        set({ activeVentureId: id });
        const res = await fetch(`/api/ventures/${id}`);
        const venture = await res.json();
        set({ activeVenture: venture });
      },

      submitDecision: async (decisionId, choice, notes) => {
        const res = await fetch('/api/chairman/decide', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decision_id: decisionId, decision: choice, notes }),
        });
        if (res.ok) {
          // Refresh briefing to reflect decision
          get().loadBriefing();
        }
      },

      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'chairman-storage',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        theme: state.theme,
      }),
    }
  )
);
```

### React Query Integration

```typescript
// src/hooks/useChairmanData.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export function useBriefing() {
  return useQuery({
    queryKey: ['chairman', 'briefing'],
    queryFn: () => fetch('/api/chairman/briefing').then(r => r.json()),
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 5 * 60 * 1000, // Auto-refresh every 5 min
  });
}

export function useVenture(id: string) {
  return useQuery({
    queryKey: ['ventures', id],
    queryFn: () => fetch(`/api/ventures/${id}`).then(r => r.json()),
    enabled: !!id,
  });
}

export function useDecision() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ decisionId, choice, notes }: DecisionInput) => {
      const res = await fetch('/api/chairman/decide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision_id: decisionId, decision: choice, notes }),
      });
      return res.json();
    },
    onSuccess: () => {
      // Invalidate briefing to trigger refetch
      queryClient.invalidateQueries({ queryKey: ['chairman', 'briefing'] });
    },
  });
}
```

### Realtime Wiring (SSE)

UI uses SSE for realtime alerts/telemetry:
- `GET /api/realtime/alerts` → updates `AlertsFeed` and optionally surfaces toast notifications.
- `GET /api/realtime/telemetry` → updates `TelemetryPanel`.

If SSE is unavailable, UI MUST degrade to polling without breaking core workflows.

---

## Migration from Legacy 7-Stage

### Zombie Code Identification

The current `VenturesManager.jsx` contains hardcoded 7-stage labels that must be replaced:

```typescript
// BEFORE: Legacy 7-stage (VenturesManager.jsx:89-99)
const getStageLabel = (stage) => {
  const labels = {
    1: 'Ideation',
    2: 'Validation',
    3: 'Development',
    4: 'Launch',
    5: 'Growth',
    6: 'Scale',
    7: 'Exit'
  };
  return labels[stage] || `Stage ${stage}`;
};

// AFTER: Vision v2 25-stage (use shared constant)
import { STAGE_CONFIG } from '@/constants/stages';

const getStageLabel = (stageNumber: number): string => {
  return STAGE_CONFIG[stageNumber]?.name || `Stage ${stageNumber}`;
};
```

### Stage Constants File

```typescript
// src/constants/stages.ts

export const STAGES = [
  // Phase: THE TRUTH (1-5)
  { number: 1, name: 'Draft Idea & Chairman Review', phase: 'THE_TRUTH', gate: 'auto_advance' },
  { number: 2, name: 'AI Multi-Model Critique', phase: 'THE_TRUTH', gate: 'auto_advance' },
  { number: 3, name: 'Market Validation & RAT', phase: 'THE_TRUTH', gate: 'advisory_checkpoint' },
  { number: 4, name: 'Competitive Intelligence', phase: 'THE_TRUTH', gate: 'auto_advance' },
  { number: 5, name: 'Profitability Forecasting', phase: 'THE_TRUTH', gate: 'advisory_checkpoint' },

  // Phase: THE ENGINE (6-9)
  { number: 6, name: 'Risk Evaluation Matrix', phase: 'THE_ENGINE', gate: 'auto_advance' },
  { number: 7, name: 'Pricing Strategy', phase: 'THE_ENGINE', gate: 'auto_advance' },
  { number: 8, name: 'Business Model Canvas', phase: 'THE_ENGINE', gate: 'auto_advance' },
  { number: 9, name: 'Exit-Oriented Design', phase: 'THE_ENGINE', gate: 'auto_advance' },

  // Phase: THE IDENTITY (10-12)
  { number: 10, name: 'Strategic Naming (SD)', phase: 'THE_IDENTITY', gate: 'auto_advance' },
  { number: 11, name: 'Go-to-Market Strategy', phase: 'THE_IDENTITY', gate: 'auto_advance' },
  { number: 12, name: 'Sales & Success Logic', phase: 'THE_IDENTITY', gate: 'auto_advance' },

  // Phase: THE BLUEPRINT (13-16)
  { number: 13, name: 'Tech Stack Interrogation (Gate)', phase: 'THE_BLUEPRINT', gate: 'advisory_checkpoint' },
  { number: 14, name: 'Data Model & Architecture (SD)', phase: 'THE_BLUEPRINT', gate: 'auto_advance' },
  { number: 15, name: 'Epic & User Story Breakdown (SD)', phase: 'THE_BLUEPRINT', gate: 'auto_advance' },
  { number: 16, name: 'Schema Generation (Gate, SD)', phase: 'THE_BLUEPRINT', gate: 'advisory_checkpoint' },

  // Phase: THE BUILD LOOP (17-20)
  { number: 17, name: 'Environment & Agent Config (SD)', phase: 'THE_BUILD_LOOP', gate: 'auto_advance' },
  { number: 18, name: 'MVP Development Loop (SD)', phase: 'THE_BUILD_LOOP', gate: 'auto_advance' },
  { number: 19, name: 'Integration & API Layer (SD)', phase: 'THE_BUILD_LOOP', gate: 'auto_advance' },
  { number: 20, name: 'Security & Performance (SD)', phase: 'THE_BUILD_LOOP', gate: 'auto_advance' },

  // Phase: LAUNCH & LEARN (21-25)
  { number: 21, name: 'QA & UAT (SD)', phase: 'LAUNCH_LEARN', gate: 'auto_advance' },
  { number: 22, name: 'Deployment & Infrastructure (SD)', phase: 'LAUNCH_LEARN', gate: 'auto_advance' },
  { number: 23, name: 'Production Launch (Gate)', phase: 'LAUNCH_LEARN', gate: 'advisory_checkpoint' },
  { number: 24, name: 'Analytics & Feedback', phase: 'LAUNCH_LEARN', gate: 'auto_advance' },
  { number: 25, name: 'Optimization & Scale (SD)', phase: 'LAUNCH_LEARN', gate: 'hard_gate' },
] as const;

export const STAGE_CONFIG = Object.fromEntries(
  STAGES.map(s => [s.number, s])
);

export const PHASES = [
  { id: 'THE_TRUTH', name: 'The Truth', range: [1, 5], color: 'blue' },
  { id: 'THE_ENGINE', name: 'The Engine', range: [6, 9], color: 'purple' },
  { id: 'THE_IDENTITY', name: 'The Identity', range: [10, 12], color: 'pink' },
  { id: 'THE_BLUEPRINT', name: 'The Blueprint', range: [13, 16], color: 'indigo' },
  { id: 'THE_BUILD_LOOP', name: 'The Build Loop', range: [17, 20], color: 'green' },
  { id: 'LAUNCH_LEARN', name: 'Launch & Learn', range: [21, 25], color: 'amber' },
] as const;

export const getPhaseForStage = (stageNumber: number): typeof PHASES[number] | undefined => {
  return PHASES.find(p => stageNumber >= p.range[0] && stageNumber <= p.range[1]);
};
```

### Migration Checklist

- [ ] Create `src/constants/stages.ts` with 25-stage config
- [ ] Update `VenturesManager.jsx` to use new stage constants
- [ ] Add new routes: `/chairman`, `/chairman/decisions`, `/chairman/portfolio`
- [ ] Create `ChairmanLayout` wrapper component
- [ ] Create `FactoryLayout` wrapper component
- [ ] Implement `BriefingDashboard` component
- [ ] Implement `StageTimeline` component
- [ ] Implement `DecisionStack` and `DecisionCard` components
- [ ] Add Zustand store for Chairman state
- [ ] Configure React Query for data fetching
- [ ] Add dark mode support to new components
- [ ] Write E2E tests for Chairman decision flow

---

## Related Specifications

- [01-database-schema.md](./01-database-schema.md) - Database tables powering these components
- [02-api-contracts.md](./02-api-contracts.md) - API endpoints these components consume
- [04-eva-orchestration.md](./04-eva-orchestration.md) - EVA state machine driving stage transitions
