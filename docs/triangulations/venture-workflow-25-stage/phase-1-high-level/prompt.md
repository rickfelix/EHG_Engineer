# Phase 1: High-Level Triangulation — 25-Stage Venture Workflow

## Context

EHG is an AI-powered venture incubation platform. When a user creates a venture (a startup idea), it progresses through a 25-stage workflow — from initial idea capture through launch and operations. Each stage has a custom UI renderer that displays AI-generated analysis data. The system is production-ready, with all 25 renderers shipped.

### Architecture

- **Frontend**: React + TypeScript + Vite, using Shadcn UI components + Tailwind CSS
- **Backend**: Supabase (PostgreSQL), Edge Functions, AI orchestrator (eva-orchestrator.js)
- **Data flow**: Backend analysis (stage-NN.js templates) → `venture_stage_work.advisory_data` (JSONB) → `useStageDisplayData()` hook → Stage renderer component
- **Routing**: Config-driven lazy loading via `venture-workflow.ts` → `StageContentRouter.tsx`
- **Two repos**: EHG (frontend React app) and EHG_Engineer (backend tooling/scripts)

### How Stages Work

1. The EVA orchestrator runs the appropriate stage template (e.g., `stage-05-financial-model.js`)
2. AI analysis output is persisted to `venture_stage_work.advisory_data` as JSONB
3. The frontend hook `useStageDisplayData()` fetches this data
4. `StageContentRouter` reads `venture-workflow.ts` config to determine which React component to lazy-load
5. The stage renderer extracts known fields from `advisoryData` for purpose-built UI
6. Remaining advisory fields dump into a collapsible "Full Advisory Details" section

### Gate System

| Gate Type | Stages | Purpose | Decision Values |
|-----------|--------|---------|-----------------|
| **Kill Gate** | 3, 5, 13, 23 | Terminate unviable ventures | PASS / CONDITIONAL / KILL |
| **Promotion Gate** | 16, 17, 22 | Elevate simulation → production | PROMOTE / CONDITIONAL / HOLD |
| **Pipeline Terminus** | 25 | End of build workflow | LAUNCHED (boolean) |
| **No Gate** | All others | Standard progression | Auto-advance on completion |

Gates require Chairman (human) approval before advancing. Non-gate stages auto-advance via a background worker.

---

## The 25-Stage Workflow

### Stage 0: Inception (Pre-Workflow)
- **Not part of the 25-stage flow** — exists in the Chairman v3 application only
- Captures: problem statement, solution approach, portfolio synergy score, time horizon, constraint scores, moat strategy
- Renders as a Chairman Gate Context View (not through StageContentRouter)

### Group 1: THE_TRUTH (Stages 1-5) — Validation & Market Reality

**Config chunk**: `'foundation'` (legacy name, not yet migrated to `'THE_TRUTH'`)

| Stage | Name | Gate | Backend File | Renderer LOC | Key Features |
|-------|------|------|-------------|--------------|--------------|
| 1 | Draft Idea | None | stage-01-hydration.js | 125 | Seed text display, idea summary, category badge, venture metadata fallback |
| 2 | AI Review | None | stage-02-*.js | ~200 | AI-generated review and feedback |
| 3 | Comprehensive Validation | **KILL** | stage-03-*.js | 491 | 3-column layout: decision banner + 7 evaluation metrics (bar chart with 70-threshold) + market fit + risk factors + go conditions. Progress view fallback (9-step checklist with animation while processing) |
| 4 | Competitive Intelligence | None | stage-04-competitive-landscape.js | ~250 | Market and competitor analysis |
| 5 | Profitability Forecasting | **KILL** | stage-05-financial-model.js | ~300 | Financial viability, P&L metrics |

**Key patterns**: Stage 1 is the simplest renderer. Stage 3 is the most complex in this group with a 3-column kill gate layout. Stages 1-3 use a compact header (no tabs), stages 4-5 get the full 5-tab interface.

### Group 2: THE_ENGINE (Stages 6-9) — Business Model Foundation

**Config chunk**: `'validation'` (legacy name, not yet migrated to `'THE_ENGINE'`)

| Stage | Name | Gate | Backend File | Renderer LOC | Key Features |
|-------|------|------|-------------|--------------|--------------|
| 6 | Risk Evaluation | None | stage-06-*.js | 410 | Risk matrix with expandable table rows, category breakdown bar chart, severity badges, mitigation details in sub-rows |
| 7 | Revenue Architecture | None | stage-07-*.js | ~300 | Revenue model, pricing tiers, monetization strategy |
| 8 | Business Model Canvas | None | stage-08-*.js | 277 | Traditional 9-block Osterwalder layout using CSS Grid, 5-column desktop → 1-2 column mobile responsive, priority badges, evidence text |
| 9 | Exit Strategy | None | stage-09-*.js | ~250 | Exit thesis, acquisition/IPO strategy |

**Key patterns**: No gates in this group. Stage 6 introduces expandable table rows. Stage 8 has a unique grid layout (Osterwalder BMC). Stages 6-9 all use the `'validation'` legacy chunk name.

### Group 3: THE_IDENTITY (Stages 10-12) — Brand & Go-to-Market

**Config chunk**: `'THE_IDENTITY'` (Vision V2 name)

| Stage | Name | Gate | Backend File | Renderer LOC | Key Features |
|-------|------|------|-------------|--------------|--------------|
| 10 | Customer & Brand Foundation | None | stage-10-*.js | **815** | Customer personas (individual collapsibles), brand genome (archetype/values/tone), brand personality (vision/mission/voice), naming decision with availability checks, naming candidates scoring table, Chairman gate banner |
| 11 | Go-to-Market Strategy | None | stage-11-*.js | ~400 | Target markets, acquisition channels, launch timeline |
| 12 | Sales & Success Logic | None | stage-12-*.js | ~350 | Sales process stages, success metrics, customer journey |

**Key patterns**: Stage 10 is the largest renderer at 815 LOC — significantly oversized compared to the ~250 average. It handles 5+ distinct data domains (personas, genome, personality, naming, scoring). No gates in this group.

### Group 4: THE_BLUEPRINT (Stages 13-16) — Technical Architecture

**Config chunk**: `'THE_BLUEPRINT'`

| Stage | Name | Gate | Backend File | Renderer LOC | Key Features |
|-------|------|------|-------------|--------------|--------------|
| 13 | Tech Stack Interrogation | **KILL** | stage-13-product-roadmap.js | 325 | Kill gate decision banner, priority-based milestone grouping (now/next/later), phases timeline, vision statement. **Naming mismatch**: Component says "Tech Stack" but backend is "product roadmap" |
| 14 | Data Model & Architecture | None | stage-14-technical-architecture.js | 397 | 5-layer architecture stack (Presentation → Infrastructure), data entities table, integration points with protocol badges, security section, constraints by category |
| 15 | Epic & User Story Breakdown | None | stage-15-*.js | ~300 | Epics, user stories, estimates |
| 16 | Schema Firewall | **PROMOTION** | stage-16-financial-projections.js | 378 | Promotion gate, P&L summary grid, monthly projections bar chart, cash balance timeline, funding rounds, viability warnings. **Naming mismatch**: Component says "Schema Firewall" but backend is "financial projections" |

**Key patterns**: Two gates in this group. **Significant naming mismatches** between component names (which match `venture-workflow.ts` config) and backend analysis functions (which match actual data content). Stage 14 is the most architecturally complex with 5-layer stack visualization.

### Group 5: THE_BUILD (Stages 17-22) — Implementation

**Config chunk**: `'THE_BUILD'`

| Stage | Name | Gate | Backend File | Renderer LOC | Key Features |
|-------|------|------|-------------|--------------|--------------|
| 17 | Environment Config | **PROMOTION** | stage-17-build-readiness.js | 299 | Promotion gate, readiness checklist by category, blockers with severity, readiness progress bar |
| 18 | MVP Development Loop | None | stage-18-sprint-planning.js | 226 | Sprint goal banner, backlog cards with multi-badge tagging (priority/type/layer/milestone), story points |
| 19 | Integration & API Layer | None | stage-19-build-execution.js | 261 | Sprint completion decision banner (COMPLETE/CONTINUE/BLOCKED), task status tracking, completion progress bar, issues with severity. **Naming mismatch**: Component says "Integration API" but backend is "build execution" |
| 20 | Security & Performance | None | stage-20-quality-assurance.js | 273 | Quality gate (PASS/CONDITIONAL/FAIL), test suites with pass ratio bars, coverage metrics, defects list. **Naming mismatch**: Component says "Security Performance" but backend is "QA" |
| 21 | QA & UAT | None | stage-21-build-review.js | 238 | Review decision (APPROVE/CONDITIONAL/REJECT), integration test cards with source→target flow, environment badges, error messages |
| 22 | Deployment | **PROMOTION** | stage-22-release-readiness.js | 320 | Promotion gate + release decision, sprint summary, release items table, release notes, sprint retrospective (collapsible), two collapsibles |

**Key patterns**: This is the most gate-heavy group (2 promotion gates + 2 implicit quality gates at stages 20 and 21). Multiple naming mismatches. Stages 18-21 represent a build loop (plan → execute → test → review). Stage 22 wraps up with release readiness.

### Group 6: THE_LAUNCH (Stages 23-25) — Launch & Go-Live

**Config chunk**: `'THE_LAUNCH'`

| Stage | Name | Gate | Backend File | Renderer LOC | Key Features |
|-------|------|------|-------------|--------------|--------------|
| 23 | Production Launch | **KILL** | stage-23-marketing-prep.js | 200 | Marketing items with type/priority badges, strategy summary, target audience. **Notable**: Marked as kill gate in config but **no kill gate banner rendered in the component**. **Naming mismatch**: Component says "Production Launch" but backend is "marketing prep" |
| 24 | Analytics & Feedback | None | stage-24-launch-readiness.js | 279 | Go/no-go decision banner, readiness checklist with pass/fail, readiness score, launch risks with mitigation, operational plans (collapsible) |
| 25 | Optimization & Scale | None | stage-25-launch-execution.js | 347 | Pipeline terminus LAUNCHED banner, launch summary, distribution channels with status/type badges, operations handoff (dashboards/alerts/escalation/SLA/maintenance) |

**Key patterns**: Stage 23 has a kill gate in config but doesn't render it — possible bug. Stage 24 functions as a de facto gate (go/no-go) but isn't classified as one. Stage 25 is the pipeline terminus with the most operational content.

---

## Shared UI Patterns Across All 25 Stages

### Universal Renderer Structure
Every renderer follows this layout order:
1. Gate/Decision Banner (if applicable)
2. Summary/Context Banner (strategy, vision, etc.)
3. Metric Cards (grid of 2-4 KPIs)
4. Primary Content (lists, tables, charts, grids)
5. Collapsible "Full Advisory Details" (catch-all for remaining data)

### Shared Design Tokens
- **Gate colors**: emerald (pass) / amber (conditional) / red (fail)
- **Severity badges**: red (critical) / orange (high) / amber (medium) / green (low)
- **Status badges**: emerald (complete) / blue (in_progress) / slate (not_started) / red (blocked)
- **Metric cards**: `text-[10px]` label + `text-2xl font-bold` value
- **Collapsible pattern**: Card + Collapsible + ChevronDown with rotate-180 animation
- **Missing values**: Em-dash `—` (not hyphen `-`)
- **Dark mode**: Every color includes both light and `dark:` variants

### Shared Components
- `AdvisoryDataPanel` — Generic key-value display with smart formatting
- `ArtifactListPanel` — Stage artifact list with type badges and dates
- `StageContentFallback` — Loading, error, and no-renderer states
- `StageContentRouter` — Config-driven lazy loading with error boundary

### Advisory Data Exclusion Pattern
Each renderer filters out known keys for purpose-built UI. Remaining keys dump to collapsible advisory. This prevents data loss when the backend adds new fields.

---

## Known Issues (Pre-Identified)

1. **Legacy chunk names**: Stages 1-9 use `'foundation'` and `'validation'` instead of Vision V2 names `'THE_TRUTH'` and `'THE_ENGINE'`
2. **Naming mismatches** (7 occurrences): Component names don't match backend analysis file names (e.g., Stage 16 "Schema Firewall" renders financial projections)
3. **Stage 23 missing kill gate banner**: Config says kill gate, but renderer has no gate banner
4. **Stage 10 oversized**: 815 LOC vs ~250 average — handles too many domains
5. **No shared primitive extraction**: Color maps, badge patterns, and metric cards are duplicated across 25 files
6. **Stage 0 disconnected**: Inception exists only in Chairman v3, not integrated with the 25-stage flow

---

---

## Appendix A: User Journey Walkthrough

This describes what a user actually experiences when using the 25-stage workflow.

### Creating a Venture (Stage 0 → Stage 1)

1. **The Chairman** (human decision-maker) creates a new venture in the Chairman v3 application. They provide: venture name, problem statement, solution approach, target market, and initial category.
2. **Stage 0 (Inception)** happens automatically in the Chairman app — it captures portfolio synergy score, time horizon classification, constraint scores, and moat strategy. This is a Chairman gate context view, separate from the 25-stage workflow.
3. The venture is created with `current_lifecycle_stage: 1` and `pipeline_mode: 'building'`.
4. The user navigates to the venture detail page, which renders `BuildingMode`.

### Early Stages (1-3): Compact Header

5. **Stages 1-3 render with a compact header** — just the venture name, inline stage badge, and action buttons. No tabs. The stage content renders directly below.
6. At **Stage 1** (Draft Idea), the user sees their seed text, idea summary, target market, and value proposition. If AI analysis hasn't completed yet, they see a spinner with "Capturing idea..."
7. The user clicks **"Mark Complete"** → the stage auto-advances to Stage 2.
8. At **Stage 2** (AI Review), EVA orchestrator runs analysis and generates AI feedback. The user reviews it.
9. At **Stage 3** (Comprehensive Validation), this is the **first kill gate**. The user sees:
   - A **decision banner** — PASS (green), REVISE (amber), or KILL (red)
   - 7 evaluation metrics with bar charts and a 70-point threshold line
   - Market fit assessment, risk factors, and go/no-go conditions
   - If still processing: an animated 9-step validation progress checklist
10. The **Chairman must approve** the kill gate. Two buttons appear: "Approve" (green) and "Reject" (red). The venture cannot advance until the Chairman decides.

### Middle Stages (4-25): Full Tabbed Layout

11. Starting at **Stage 4**, the layout switches to the full **5-tab interface**:
    - **Stage Content** — the main stage renderer
    - **Artifacts** — documents and files generated by this stage
    - **Risks & Blockers** — risk register
    - **Timeline** — stage progression history
    - **Financials** — financial data related to this stage
12. A `JourneyBadge` appears showing the venture's journey through phases.
13. A `BuildingHero` provides a phase-level summary header.

### Gate Stages: Chairman Decision Points

14. At each **kill gate** (3, 5, 13, 23), the venture can be TERMINATED. The Chairman sees the analysis, sees the AI recommendation, and makes a go/no-go call. If KILLED, the venture is archived.
15. At each **promotion gate** (16, 17, 22), the venture is ELEVATED from simulation to production-readiness. The Chairman signs off on schema readiness (16), environment readiness (17), and deployment readiness (22).
16. **Non-gate stages auto-advance** — the user clicks "Mark Complete" and the background `stage-advance-worker.js` moves to the next stage.

### Build Loop (Stages 17-22)

17. This is where the venture goes from "planning" to "built":
    - Stage 17: Build readiness checklist — is the team ready?
    - Stage 18: Sprint planning — backlog items with story points
    - Stage 19: Build execution — task tracking, completion progress
    - Stage 20: Quality assurance — test suites, coverage, defects
    - Stage 21: Build review — integration tests, approve/reject
    - Stage 22: Release readiness — release items, sprint retro, deployment decision

### Launch (Stages 23-25)

18. **Stage 23** (kill gate): Final go/no-go before launch. Marketing readiness check.
19. **Stage 24**: Launch readiness assessment with go/no-go decision, operational plans.
20. **Stage 25** (pipeline terminus): The venture is LAUNCHED. User sees:
    - A green "LAUNCHED" banner with the go-live timestamp
    - Distribution channel activation status
    - Operations handoff: dashboards, alerts, escalation contacts, SLA targets

### After Stage 25: Operations Mode

21. When Stage 25 completes, `pipeline_terminus` is set to `true` and `pipeline_mode` changes to `'operations'`.
22. The UI automatically switches from `BuildingMode` to **`OperationsMode`**, which has its own layout:
    - `JourneyBadgeCollapsible` — collapsed summary of the 25-stage journey
    - `OperationsHero` — LAUNCHED badge, key metrics, trigger alerts
    - **4 Operations Tabs**:
      1. **Health Trends** — system health metrics and trends
      2. **Revenue** — revenue analytics and performance
      3. **AI Agents** — autonomous operations agents status
      4. **Risk Signals** — risk monitoring and alerts
    - A **popover menu** allows drilling back to any completed stage (1-25) for historical review
23. Beyond operations, ventures can transition to: `growth`, `scaling`, `exit_prep`, `divesting`, or `sold` modes (each with their own renderer, though these are future work).

### Stage History / Drillback

24. At any point, users can **view historical stages** — clicking on a past stage number loads that stage's renderer with the data as it was at completion time. A clear "viewing historical stage" indicator appears, with a button to return to the current stage.

---

## Appendix B: Real Advisory Data Example (Stage 17)

This is what the `venture_stage_work.advisory_data` JSONB looks like for Stage 17 (Build Readiness). The renderer extracts these specific fields:

```json
{
  "checklist": {
    "architecture": [
      { "name": "Core schema defined", "status": "complete", "owner": "Tech Lead", "notes": "All tables migrated" },
      { "name": "API contracts documented", "status": "in_progress", "owner": "Backend", "notes": "3 of 5 done" }
    ],
    "team_readiness": [
      { "name": "Dev team staffed", "status": "complete", "owner": "PM", "notes": null },
      { "name": "QA resources allocated", "status": "not_started", "owner": "QA Lead", "notes": "Waiting on hiring" }
    ],
    "tooling": [
      { "name": "CI/CD pipeline configured", "status": "complete", "owner": "DevOps", "notes": null }
    ],
    "environment": [
      { "name": "Staging environment deployed", "status": "blocked", "owner": "DevOps", "notes": "AWS quota limit" }
    ],
    "dependencies": [
      { "name": "Payment gateway SDK integrated", "status": "in_progress", "owner": "Backend", "notes": "Stripe sandbox working" }
    ]
  },
  "blockers": [
    { "description": "AWS staging quota exceeded", "severity": "critical", "mitigation": "Submit support ticket for quota increase" },
    { "description": "QA team not yet hired", "severity": "high", "mitigation": "Use contractor QA for first sprint" }
  ],
  "total_items": 7,
  "completed_items": 3,
  "readiness_pct": 43,
  "all_categories_present": true,
  "blocker_count": 2,
  "buildReadiness": {
    "decision": "conditional_go",
    "rationale": "Core architecture is solid but staging environment and QA staffing are blocking full readiness. Recommend conditional start with contractor QA.",
    "conditions": [
      "Resolve AWS staging quota within 5 business days",
      "Onboard contractor QA for sprint 1",
      "Complete remaining API contract documentation"
    ]
  },
  "fourBuckets": { "...internal LLM metadata..." },
  "usage": { "prompt_tokens": 2400, "completion_tokens": 1800 },
  "llmFallbackCount": 0
}
```

**How the renderer handles this:**
- `checklist` → Rendered as categorized rows with status badges (complete=green, in_progress=blue, not_started=grey, blocked=red)
- `blockers` → Red-bordered cards with severity badges and mitigation in green boxes
- `buildReadiness.decision` → The gate banner color and badge (conditional_go = amber)
- `buildReadiness.conditions` → Bullet list under the banner
- `readiness_pct` → Both in metric cards AND as a full-width progress bar
- `fourBuckets`, `usage`, `llmFallbackCount` → Excluded from advisory display (internal metadata)
- Any other fields not in the exclude list → Dumped into collapsible "Full Advisory Details"

---

## Appendix C: Actual Renderer Source Code (3 Representative Examples)

### Example 1: Stage 1 — Draft Idea (Simplest renderer, 125 lines)

```tsx
/**
 * Stage1DraftIdea — Draft Idea stage renderer (Stage 1)
 * Shows venture seed text, initial idea summary, and creation metadata.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import type { StageRendererProps } from "@/components/ventures/stages/StageRendererProps";
import { AdvisoryDataPanel } from "./shared/AdvisoryDataPanel";
import { ArtifactListPanel } from "./shared/ArtifactListPanel";

export default function Stage1DraftIdea({
  stageData,
  venture,
  className,
}: StageRendererProps) {
  const ad = stageData.advisoryData;
  const seedText = ad?.seed_text as string | undefined;
  const ideaSummary = ad?.idea_summary as string | undefined;
  const category = ad?.category as string | undefined;

  // Venture-level data from stage zero (always available)
  const stageZero = venture.metadata?.stage_zero as Record<string, unknown> | undefined;
  const solution = stageZero?.solution as string | undefined;
  const description = venture.description;
  const targetMarket = venture.targetMarket;
  const valueProposition = venture.valueProposition;

  const hasAdvisoryData = seedText || ideaSummary || category;
  const hasVentureData = description || targetMarket || solution || valueProposition;

  if (!hasAdvisoryData && !hasVentureData) {
    return (
      <div className={`flex flex-col items-center justify-center py-12 text-muted-foreground ${className ?? ""}`}>
        <Loader2 className="h-8 w-8 animate-spin mb-3" />
        <p className="text-sm">Capturing idea...</p>
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className ?? ""}`}>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            {venture.name}
            <Badge variant="secondary" className="text-xs ml-auto capitalize">
              {stageData.stageStatus}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {seedText && (
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-sm whitespace-pre-wrap">{seedText}</p>
            </div>
          )}
          {ideaSummary && (
            <div>
              <span className="text-xs font-medium text-muted-foreground">Idea Summary</span>
              <p className="text-sm mt-0.5">{ideaSummary}</p>
            </div>
          )}
          {!seedText && description && (
            <div>
              <span className="text-xs font-medium text-muted-foreground">Problem</span>
              <p className="text-sm mt-0.5">{description}</p>
            </div>
          )}
          {!ideaSummary && solution && (
            <div>
              <span className="text-xs font-medium text-muted-foreground">Proposed Solution</span>
              <p className="text-sm mt-0.5">{String(solution)}</p>
            </div>
          )}
          {targetMarket && (
            <div>
              <span className="text-xs font-medium text-muted-foreground">Target Market</span>
              <p className="text-sm mt-0.5">{targetMarket}</p>
            </div>
          )}
          {valueProposition && (
            <div>
              <span className="text-xs font-medium text-muted-foreground">Value Proposition</span>
              <p className="text-sm mt-0.5">{valueProposition}</p>
            </div>
          )}
          {category && (
            <Badge variant="outline" className="capitalize">{category}</Badge>
          )}
        </CardContent>
      </Card>

      <AdvisoryDataPanel data={ad} title="Stage Details" exclude={["seed_text", "idea_summary", "category"]} />
      <ArtifactListPanel artifacts={stageData.artifacts} />
    </div>
  );
}
```

### Example 2: Stage 17 — Environment Config / Build Readiness (Promotion gate, 299 lines)

```tsx
/**
 * Stage17EnvironmentConfig — Build Readiness renderer (Stage 17, promotion gate)
 * Data shape matches backend: stage-17-build-readiness.js
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import type { StageRendererProps } from "@/components/ventures/stages/StageRendererProps";

interface ChecklistItem {
  name?: string;
  status?: string;
  owner?: string;
  notes?: string;
}

interface Blocker {
  description?: string;
  severity?: string;
  mitigation?: string;
}

const DECISION_BANNER: Record<string, string> = {
  go: "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400",
  conditional_go: "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400",
  no_go: "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400",
};

const DECISION_BADGE: Record<string, string> = {
  go: "bg-emerald-600 hover:bg-emerald-700",
  conditional_go: "bg-amber-500 hover:bg-amber-600",
  no_go: "bg-red-600 hover:bg-red-700",
};

const DECISION_LABELS: Record<string, string> = {
  go: "GO", conditional_go: "CONDITIONAL", no_go: "NO-GO",
};

const STATUS_COLORS: Record<string, string> = {
  complete: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  not_started: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400",
  blocked: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  low: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
};

const CATEGORY_ORDER = ["architecture", "team_readiness", "tooling", "environment", "dependencies"];
const CATEGORY_LABELS: Record<string, string> = {
  architecture: "Architecture", team_readiness: "Team Readiness",
  tooling: "Tooling", environment: "Environment", dependencies: "Dependencies",
};

export default function Stage17EnvironmentConfig({ stageData, className }: StageRendererProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const ad = stageData.advisoryData;

  const checklist = ad?.checklist as Record<string, ChecklistItem[]> | undefined;
  const rawBlockers = ad?.blockers;
  const blockers: Blocker[] = Array.isArray(rawBlockers) ? rawBlockers : [];
  const totalItems = ad?.total_items as number | undefined;
  const completedItems = ad?.completed_items as number | undefined;
  const readinessPct = ad?.readiness_pct as number | undefined;
  const blockerCount = (ad?.blocker_count as number) ?? blockers.length;
  const buildReadiness = ad?.buildReadiness as {
    decision?: string; rationale?: string; conditions?: string[]
  } | undefined;

  const decision = buildReadiness?.decision;
  const hasDecision = decision != null;

  const ADVISORY_EXCLUDE = [
    "checklist", "blockers", "total_items", "completed_items", "readiness_pct",
    "all_categories_present", "blocker_count", "buildReadiness",
    "fourBuckets", "usage", "llmFallbackCount",
  ];
  const advisoryEntries = ad
    ? Object.entries(ad).filter(([key]) => !ADVISORY_EXCLUDE.includes(key))
    : [];

  return (
    <div className={`space-y-3 ${className ?? ""}`}>
      {/* Build Readiness Decision Banner */}
      {hasDecision && (
        <div className={`flex flex-col gap-2 p-4 rounded-lg border ${DECISION_BANNER[decision!] ?? DECISION_BANNER.no_go}`}>
          <div className="flex items-center gap-3 flex-wrap">
            <Badge variant="default"
              className={`uppercase text-sm px-3 py-1 ${DECISION_BADGE[decision!] ?? DECISION_BADGE.no_go}`}>
              {DECISION_LABELS[decision!] ?? decision}
            </Badge>
            <span className="text-sm font-medium">Build Readiness Promotion Gate</span>
            {readinessPct != null && (
              <><span className="opacity-50">·</span><span className="text-sm">{readinessPct}% ready</span></>
            )}
          </div>
          {buildReadiness?.rationale && <p className="text-xs mt-1">{buildReadiness.rationale}</p>}
          {buildReadiness?.conditions && buildReadiness.conditions.length > 0 && (
            <ul className="space-y-1 mt-1">
              {buildReadiness.conditions.map((c, i) => (
                <li key={i} className="text-xs flex items-start gap-1.5">
                  <span className="mt-0.5 shrink-0">•</span><span>{c}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Total Items | Completed | Readiness | Blockers */}
        {/* ... (4 metric cards with standard pattern) ... */}
      </div>

      {/* Readiness Progress Bar */}
      {readinessPct != null && (
        <div className="h-3 bg-muted/30 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${
            readinessPct >= 80 ? "bg-emerald-500" : readinessPct >= 50 ? "bg-amber-500" : "bg-red-500"
          }`} style={{ width: `${readinessPct}%` }} />
        </div>
      )}

      {/* Checklist by Category */}
      {checklist && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Readiness Checklist</CardTitle></CardHeader>
          <CardContent>
            {CATEGORY_ORDER.map((catKey) => {
              const items = checklist[catKey];
              if (!items || items.length === 0) return null;
              return (
                <div key={catKey} className="space-y-2">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">
                    {CATEGORY_LABELS[catKey] ?? catKey}
                  </span>
                  {items.map((item, i) => (
                    <div key={i} className="flex items-center justify-between text-sm border-b border-muted pb-1.5">
                      <div className="flex items-center gap-2 flex-1">
                        <Badge className={`text-[9px] px-1.5 py-0 ${STATUS_COLORS[item.status ?? "not_started"]}`}>
                          {(item.status ?? "not_started").replace(/_/g, " ")}
                        </Badge>
                        <span className="font-medium">{item.name}</span>
                      </div>
                      {item.owner && <span className="text-xs text-muted-foreground">{item.owner}</span>}
                    </div>
                  ))}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Blockers (severity badges + mitigation) */}
      {/* Full Advisory Details (collapsible) */}
    </div>
  );
}
```

### Example 3: Stage 22 — Deployment / Release Readiness (Promotion gate with retro, 320 lines)

```tsx
/**
 * Stage22Deployment — Release Readiness renderer (Stage 22, promotion gate)
 * Data shape matches backend: stage-22-release-readiness.js
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import type { StageRendererProps } from "@/components/ventures/stages/StageRendererProps";

interface ReleaseItem { name?: string; category?: string; status?: string; approver?: string; }

const RELEASE_BANNER: Record<string, string> = {
  release: "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400",
  hold: "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400",
  cancel: "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400",
};

const RELEASE_BADGE: Record<string, string> = {
  release: "bg-emerald-600 hover:bg-emerald-700",
  hold: "bg-amber-500 hover:bg-amber-600",
  cancel: "bg-red-600 hover:bg-red-700",
};

const ITEM_STATUS_COLORS: Record<string, string> = {
  approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

const CATEGORY_COLORS: Record<string, string> = {
  feature: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  bugfix: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  infrastructure: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  documentation: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  security: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  performance: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  configuration: "bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400",
};

export default function Stage22Deployment({ stageData, className }: StageRendererProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [retroOpen, setRetroOpen] = useState(false);
  const ad = stageData.advisoryData;

  const rawItems = ad?.release_items;
  const releaseItems: ReleaseItem[] = Array.isArray(rawItems) ? rawItems : [];
  const releaseNotes = ad?.release_notes as string | undefined;
  const targetDate = ad?.target_date as string | undefined;
  const totalItems = (ad?.total_items as number) ?? releaseItems.length;
  const approvedItems = (ad?.approved_items as number) ?? releaseItems.filter((i) => i.status === "approved").length;
  const allApproved = ad?.all_approved as boolean | undefined;
  const releaseDecision = ad?.releaseDecision as {
    decision?: string; rationale?: string; approver?: string
  } | undefined;
  const sprintSummary = ad?.sprintSummary as {
    sprintGoal?: string; itemsPlanned?: number; itemsCompleted?: number;
    qualityAssessment?: string; integrationStatus?: string
  } | undefined;
  const sprintRetro = ad?.sprintRetrospective as {
    wentWell?: string[]; wentPoorly?: string[]; actionItems?: string[]
  } | undefined;
  const promotionGate = ad?.promotion_gate as { pass?: boolean; blockers?: string[] } | undefined;

  const decision = releaseDecision?.decision;

  // Excludes already-rendered fields from advisory dump
  const ADVISORY_EXCLUDE = [
    "release_items", "release_notes", "target_date", "total_items",
    "approved_items", "all_approved", "releaseDecision", "sprintSummary",
    "sprintRetrospective", "promotion_gate",
    "fourBuckets", "usage", "llmFallbackCount",
  ];

  return (
    <div className={`space-y-3 ${className ?? ""}`}>
      {/* Release Decision Banner (emerald/amber/red) */}
      {decision && (
        <div className={`flex flex-col gap-2 p-4 rounded-lg border ${RELEASE_BANNER[decision] ?? RELEASE_BANNER.hold}`}>
          <div className="flex items-center gap-3 flex-wrap">
            <Badge variant="default"
              className={`uppercase text-sm px-3 py-1 ${RELEASE_BADGE[decision] ?? RELEASE_BADGE.hold}`}>
              {decision.toUpperCase()}
            </Badge>
            <span className="text-sm font-medium">Release Decision</span>
            {targetDate && (<><span className="opacity-50">·</span><span className="text-sm">Target: {targetDate}</span></>)}
            {promotionGate && (
              <Badge className={promotionGate.pass
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
                : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"}>
                {promotionGate.pass ? "Gate Pass" : "Gate Fail"}
              </Badge>
            )}
          </div>
          {releaseDecision?.rationale && <p className="text-xs">{releaseDecision.rationale}</p>}
        </div>
      )}

      {/* 3-column Metric Cards: Release Items | Approved | Status */}

      {/* Sprint Summary (Goal, Planned/Completed, Quality, Integration) */}

      {/* Release Items List (status + category badges per item) */}

      {/* Release Notes (blue banner) */}
      {releaseNotes && (
        <div className="p-4 rounded-lg border bg-blue-500/10 border-blue-500/30">
          <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase">Release Notes</span>
          <p className="text-sm text-blue-700 dark:text-blue-400 mt-1">{releaseNotes}</p>
        </div>
      )}

      {/* Sprint Retrospective (collapsible: Went Well + / Went Poorly - / Action Items →) */}
      {sprintRetro && (
        <Card>
          <Collapsible open={retroOpen} onOpenChange={setRetroOpen}>
            <CollapsibleTrigger asChild>
              <CardHeader className="pb-2 cursor-pointer hover:bg-muted/30 transition-colors">
                <CardTitle className="text-sm flex items-center gap-2">
                  Sprint Retrospective
                  <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${retroOpen ? "rotate-180" : ""}`} />
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent>
                {/* Three sections: Went Well (green +), Went Poorly (red -), Action Items (blue →) */}
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      )}

      {/* Full Advisory Details (collapsible key-value dump) */}
    </div>
  );
}
```

---

## Appendix D: Data Normalization Layer (useStageDisplayData hook)

This hook is the bridge between backend JSONB data and the renderers. All 25 renderers receive data through this normalization layer:

```typescript
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getStageByNumber } from '@/config/venture-workflow';

const GATE_STAGES = [3, 5, 13, 16, 17, 22, 23];

function chunkToPhase(chunk: string | undefined): string {
  switch (chunk) {
    case 'foundation': case 'THE_TRUTH': return 'The Truth';
    case 'validation': case 'THE_ENGINE': return 'The Engine';
    case 'THE_IDENTITY': return 'The Identity';
    case 'THE_BLUEPRINT': return 'The Blueprint';
    case 'THE_BUILD': return 'The Build';
    case 'THE_LAUNCH': return 'The Launch';
    default: return 'Unknown';
  }
}

export function useStageDisplayData(ventureId: string | undefined, stageNumber: number) {
  // Query 1: venture_stage_work for advisory_data and status
  const stageWorkQuery = useQuery({
    queryKey: ['stage-display', 'stage-work', ventureId, stageNumber],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('venture_stage_work')
        .select('*')
        .eq('venture_id', ventureId)
        .eq('lifecycle_stage', stageNumber)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!ventureId,
    staleTime: 30_000,
  });

  // Query 2: venture_artifacts for stage content
  const artifactsQuery = useQuery({
    queryKey: ['stage-display', 'artifacts', ventureId, stageNumber],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('venture_artifacts')
        .select('*')
        .eq('venture_id', ventureId)
        .eq('lifecycle_stage', stageNumber)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!ventureId,
    staleTime: 30_000,
  });

  // Query 3: chairman_decisions (gate stages only)
  const gateQuery = useQuery({
    queryKey: ['stage-display', 'gate-decision', ventureId, stageNumber],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chairman_decisions')
        .select('*')
        .eq('venture_id', ventureId)
        .eq('lifecycle_stage', stageNumber)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!ventureId && GATE_STAGES.includes(stageNumber),
    staleTime: 30_000,
  });

  // Returns: { data: StageDisplayData | null, isLoading, error }
  // StageDisplayData = { stageNumber, stageName, phaseName, workType, advisoryData, gateDecision, artifacts, stageStatus }
}
```

Key observations for reviewers:
- **Three parallel queries** per stage (stage work, artifacts, gate decisions)
- Gate decision query is **conditionally enabled** — only fires for gate stages
- 30-second stale time means data refreshes every 30s
- `advisoryData` is passed as `Record<string, unknown>` — **completely untyped** at the boundary
- Each renderer then casts fields to local interfaces (type-safe extraction from untyped data)

---

## Your Task

Evaluate this 25-stage venture workflow across five dimensions. For each group AND the system as a whole, provide:

### Dimension 1: Logic & Flow (Is the stage ordering sensible?)
- Does the progression from idea → launch make logical sense?
- Are the stage groupings well-organized?
- Are the gates placed at the right decision points?
- Are there missing stages or redundant ones?
- Does Stage 0 (Inception) belong in or outside the workflow?

### Dimension 2: Functionality (Does each stage work correctly?)
- Based on the architecture described, do the data flows make sense?
- Are there any obvious gaps in the data pipeline?
- Do the gate enforcement mechanisms seem robust?
- Are there stages that seem functionally incomplete?

### Dimension 3: UI/Visual Design (Does it look professional?)
- Is the visual consistency across stages good?
- Is the shared design token system (colors, badges, metrics) well-designed?
- Are there visual anti-patterns (oversized components, inconsistent layouts)?
- How effective is the gate banner system for communicating decisions?

### Dimension 4: UX/Workflow (Is it intuitive for users?)
- Is the 25-stage workflow overwhelming or well-paced?
- Are the tab system and navigation effective?
- Is it clear to users what action to take at each stage?
- How well do the collapsible sections manage information density?
- Is the compact header (stages 1-3) vs. full tabs (stages 4-25) distinction logical?

### Dimension 5: Architecture (Is the technical design sound?)
- Is config-driven lazy loading the right pattern?
- Is the `advisory_data` JSONB approach scalable?
- Should there be more shared component extraction?
- Are the naming mismatches between frontend and backend a real problem?
- How does the error boundary + retry mechanism hold up?

### Output Format

For each of the 6 groups, provide:

```
## Group N: [Name] (Stages X-Y)

### Scores
| Dimension | Score (1-10) | Key Finding |
|-----------|-------------|-------------|
| Logic & Flow | X | ... |
| Functionality | X | ... |
| UI/Visual Design | X | ... |
| UX/Workflow | X | ... |
| Architecture | X | ... |

### Strengths
- ...

### Concerns
- ...

### Recommendations
- ...
```

Then provide an **Overall System Assessment** with aggregate scores and top 5 strategic recommendations.

Finally, identify the **3 most impactful changes** that would improve the entire workflow.
