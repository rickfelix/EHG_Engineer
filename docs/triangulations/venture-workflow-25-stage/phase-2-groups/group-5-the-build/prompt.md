# Phase 2 Deep Dive: Group 5 — THE_BUILD (Stages 17-22)

## Context from Phase 1

This is Phase 2 of a hierarchical triangulation review of a 25-stage venture workflow. Phase 1 assessed all 25 stages at a high level across 6 groups. This prompt focuses on **Group 5: THE_BUILD (Stages 17-22)**, which covers the build execution phase from readiness assessment through release preparation. This is the largest group (6 stages) and has the most gate nomenclature fragmentation.

### Phase 1 Consensus for Group 5
- **Logic & Flow: 8/10** — The strongest sequential logic in the workflow: Readiness → Plan → Execute → Test → Review → Release. A classic software build cycle.
- **Functionality: 8/10** — All 6 renderers functional. Two promotion gates (17, 22) work correctly. Three phantom gates (19, 20, 21) render UI but aren't enforced.
- **UI/Visual Design: 7/10** — Consistent patterns. Stages 18, 21, 22 use 3-column metric grids (inconsistent with the 4-column standard elsewhere).
- **UX/Workflow: 6/10** — All 6 stages have naming mismatches. Gate nomenclature fragmentation is worst here (5 different decision value patterns in 6 stages).
- **Architecture: 5/10** — Tied for lowest architecture score. 5 different gate nomenclature patterns, 3 phantom gates, all 6 naming mismatches, and every stage reimplements collapsible advisory details locally.

### Phase 1 Issues to Investigate
1. **Gate nomenclature fragmentation (worst group)**: 5 different patterns in 6 stages:
   - Stage 17: go/conditional_go/no_go (DECISION_BANNER)
   - Stage 19: complete/continue/blocked (COMPLETION_BANNER) — phantom
   - Stage 20: pass/conditional_pass/fail (QUALITY_BANNER) — phantom
   - Stage 21: approve/conditional/reject (REVIEW_BANNER) — phantom
   - Stage 22: release/hold/cancel (RELEASE_BANNER)
2. **3 phantom gates (19, 20, 21)**: All render decision banners but config says `gateType: 'none'`. Should any be promoted to enforced gates?
3. **All 6 naming mismatches**: EnvironmentConfig→Build Readiness, MvpDevelopmentLoop→Sprint Planning, IntegrationApiLayer→Build Execution, SecurityPerformance→Quality Assurance, QaUat→Build Review, Deployment→Release Readiness
4. **3-column metric grid inconsistency**: Stages 18, 21, 22 use 3-column metric grids while most other stages use 4-column. Is this intentional or inconsistent?
5. **Build cycle completeness**: Does the 6-stage build cycle cover all necessary phases? Are any stages redundant or missing?

### Gap Importance Rubric
For every gap or issue you identify, rate its importance on this scale:
| Score | Label | Meaning |
|-------|-------|---------|
| 1 | Cosmetic | Nice to fix, no user impact |
| 2 | Minor | Slightly confusing or inconsistent |
| 3 | Moderate | Affects usability or developer experience |
| 4 | Significant | Users will notice, trust reduced |
| 5 | Critical | Broken functionality or trust-breaking |

---

## Architecture Overview

### Data Flow
```
Backend (stage-NN.js) → venture_stage_work.advisory_data (JSONB)
  → useStageDisplayData() hook → StageContentRouter → Stage renderer component
```

### Layout System
- Stages 1-3: Compact header (no tabs)
- Stages 4-25: Full 5-tab layout (Stage, Artifacts, Timeline, AI Insights, Settings)
- All Group 5 stages (17-22) use the full 5-tab layout

### Gate System
- **Stage 17**: Promotion gate (`gateType: 'promotion'`) — go/conditional_go/no_go (DECISION_BANNER)
- **Stage 18**: No gate (`gateType: 'none'`)
- **Stage 19**: Phantom gate (`gateType: 'none'`) — renders COMPLETION_BANNER with complete/continue/blocked
- **Stage 20**: Phantom gate (`gateType: 'none'`) — renders QUALITY_BANNER with pass/conditional_pass/fail
- **Stage 21**: Phantom gate (`gateType: 'none'`) — renders REVIEW_BANNER with approve/conditional/reject
- **Stage 22**: Promotion gate (`gateType: 'promotion'`) — release/hold/cancel (RELEASE_BANNER)

### Config
All 6 stages with chunk: 'THE_BUILD':
```typescript
{ stageNumber: 17, stageName: 'Environment Config', componentPath: 'Stage17EnvironmentConfig.tsx', gateType: 'promotion', chunk: 'THE_BUILD' }
{ stageNumber: 18, stageName: 'MVP Development Loop', componentPath: 'Stage18MvpDevelopmentLoop.tsx', gateType: 'none', chunk: 'THE_BUILD' }
{ stageNumber: 19, stageName: 'Integration API Layer', componentPath: 'Stage19IntegrationApiLayer.tsx', gateType: 'none', chunk: 'THE_BUILD' }
{ stageNumber: 20, stageName: 'Security Performance', componentPath: 'Stage20SecurityPerformance.tsx', gateType: 'none', chunk: 'THE_BUILD' }
{ stageNumber: 21, stageName: 'QA UAT', componentPath: 'Stage21QaUat.tsx', gateType: 'none', chunk: 'THE_BUILD' }
{ stageNumber: 22, stageName: 'Deployment', componentPath: 'Stage22Deployment.tsx', gateType: 'promotion', chunk: 'THE_BUILD' }
```

### Component Names vs Content
ALL 6 stages have naming mismatches:
| Stage | Component Name | Actually Renders | Backend File | Match? |
|-------|---------------|-----------------|--------------|--------|
| 17 | EnvironmentConfig | Build Readiness | stage-17-build-readiness.js | NO |
| 18 | MvpDevelopmentLoop | Sprint Planning | stage-18-sprint-planning.js | NO |
| 19 | IntegrationApiLayer | Build Execution | stage-19-build-execution.js | NO |
| 20 | SecurityPerformance | Quality Assurance | stage-20-quality-assurance.js | NO |
| 21 | QaUat | Build Review | stage-21-build-review.js | NO |
| 22 | Deployment | Release Readiness | stage-22-release-readiness.js | NO |

---

## Source Code

### Stage 17: Environment Config [NAMING MISMATCH → Build Readiness] (299 LOC)
**File**: `Stage17EnvironmentConfig.tsx`
**Backend**: `stage-17-build-readiness.js`
**Purpose**: Promotion gate with readiness checklist by category, progress bar, blockers with severity/mitigation, readiness percentage, collapsible advisory.

```tsx
/**
 * Stage17EnvironmentConfig — Build Readiness renderer (Stage 17, promotion gate)
 *
 * Readiness decision banner (go/conditional/no-go), checklist by category,
 * blockers with severity, readiness percentage, collapsible advisory.
 * Data shape matches backend: stage-17-build-readiness.js
 *
 * SD-LEO-ORCH-STAGE-VENTURE-WORKFLOW-001-H
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
  go: "GO",
  conditional_go: "CONDITIONAL",
  no_go: "NO-GO",
};

const STATUS_COLORS: Record<string, string> = {
  complete: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  not_started: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400",
  blocked: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

const CATEGORY_LABELS: Record<string, string> = {
  architecture: "Architecture",
  team_readiness: "Team Readiness",
  tooling: "Tooling",
  environment: "Environment",
  dependencies: "Dependencies",
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  low: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
};

const CATEGORY_ORDER = ["architecture", "team_readiness", "tooling", "environment", "dependencies"];

export default function Stage17EnvironmentConfig({
  stageData,
  className,
}: StageRendererProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const ad = stageData.advisoryData;

  const checklist = ad?.checklist as Record<string, ChecklistItem[]> | undefined;
  const rawBlockers = ad?.blockers;
  const blockers: Blocker[] = Array.isArray(rawBlockers) ? rawBlockers : [];
  const totalItems = ad?.total_items as number | undefined;
  const completedItems = ad?.completed_items as number | undefined;
  const readinessPct = ad?.readiness_pct as number | undefined;
  const blockerCount = (ad?.blocker_count as number) ?? blockers.length;
  const buildReadiness = ad?.buildReadiness as { decision?: string; rationale?: string; conditions?: string[] } | undefined;

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
  const hasAdvisoryDetails = advisoryEntries.length > 0;

  return (
    <div className={`space-y-3 ${className ?? ""}`}>
      {/* Build Readiness Decision Banner */}
      {hasDecision && (
        <div className={`flex flex-col gap-2 p-4 rounded-lg border ${DECISION_BANNER[decision!] ?? DECISION_BANNER.no_go}`}>
          <div className="flex items-center gap-3 flex-wrap">
            <Badge
              variant="default"
              className={`uppercase text-sm px-3 py-1 ${DECISION_BADGE[decision!] ?? DECISION_BADGE.no_go}`}
            >
              {DECISION_LABELS[decision!] ?? decision}
            </Badge>
            <span className="text-sm font-medium">Build Readiness Promotion Gate</span>
            {readinessPct != null && (
              <>
                <span className="opacity-50">·</span>
                <span className="text-sm">{readinessPct}% ready</span>
              </>
            )}
          </div>
          {buildReadiness?.rationale && (
            <p className="text-xs mt-1">{buildReadiness.rationale}</p>
          )}
          {buildReadiness?.conditions && buildReadiness.conditions.length > 0 && (
            <ul className="space-y-1 mt-1">
              {buildReadiness.conditions.map((c, i) => (
                <li key={i} className="text-xs flex items-start gap-1.5">
                  <span className="mt-0.5 shrink-0">•</span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Total Items
            </span>
            <p className="text-2xl font-bold mt-1">{totalItems ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Completed
            </span>
            <p className="text-2xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">{completedItems ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Readiness
            </span>
            <p className="text-2xl font-bold mt-1">{readinessPct != null ? `${readinessPct}%` : "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Blockers
            </span>
            <p className={`text-2xl font-bold mt-1 ${blockerCount > 0 ? "text-red-600 dark:text-red-400" : ""}`}>{blockerCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Readiness Progress Bar */}
      {readinessPct != null && (
        <div className="h-3 bg-muted/30 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${readinessPct >= 80 ? "bg-emerald-500" : readinessPct >= 50 ? "bg-amber-500" : "bg-red-500"}`}
            style={{ width: `${readinessPct}%` }}
          />
        </div>
      )}

      {/* Checklist by Category */}
      {checklist && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Readiness Checklist</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {CATEGORY_ORDER.map((catKey) => {
                const items = checklist[catKey];
                if (!items || items.length === 0) return null;
                return (
                  <div key={catKey} className="space-y-2">
                    <span className="text-xs font-semibold uppercase text-muted-foreground">
                      {CATEGORY_LABELS[catKey] ?? catKey}
                    </span>
                    {items.map((item, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between text-sm border-b border-muted pb-1.5 last:border-0"
                      >
                        <div className="flex items-center gap-2 flex-1">
                          <Badge className={`text-[9px] px-1.5 py-0 ${STATUS_COLORS[item.status ?? "not_started"]}`}>
                            {(item.status ?? "not_started").replace(/_/g, " ")}
                          </Badge>
                          <span className="font-medium">{item.name}</span>
                        </div>
                        {item.owner && (
                          <span className="text-xs text-muted-foreground">{item.owner}</span>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Blockers */}
      {blockers.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-red-600 dark:text-red-400">Blockers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {blockers.map((b, i) => (
                <div key={i} className="p-3 rounded-lg border border-red-500/20 bg-red-500/5 space-y-1.5">
                  <div className="flex items-start gap-2">
                    {b.severity && (
                      <Badge className={`text-[10px] uppercase shrink-0 ${SEVERITY_COLORS[b.severity] ?? SEVERITY_COLORS.medium}`}>
                        {b.severity}
                      </Badge>
                    )}
                    <span className="text-sm">{b.description}</span>
                  </div>
                  {b.mitigation && (
                    <div className="text-xs p-2 rounded bg-emerald-500/10 border border-emerald-500/20">
                      <span className="font-semibold text-emerald-700 dark:text-emerald-400">Mitigation: </span>
                      <span className="text-emerald-700 dark:text-emerald-400">{b.mitigation}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Full Advisory Details */}
      {hasAdvisoryDetails && (
        <Card>
          <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
            <CollapsibleTrigger asChild>
              <CardHeader className="pb-2 cursor-pointer hover:bg-muted/30 transition-colors">
                <CardTitle className="text-sm flex items-center gap-2">
                  Full Advisory Details
                  <ChevronDown
                    className={`w-4 h-4 ml-auto transition-transform ${detailsOpen ? "rotate-180" : ""}`}
                  />
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent>
                <div className="space-y-2">
                  {advisoryEntries.map(([key, value]) => (
                    <div
                      key={key}
                      className="flex justify-between text-sm border-b border-muted pb-1 last:border-0"
                    >
                      <span className="text-muted-foreground capitalize">
                        {key.replace(/_/g, " ")}
                      </span>
                      <span className="font-medium text-right max-w-[60%]">
                        {typeof value === "object"
                          ? JSON.stringify(value)
                          : String(value ?? "—")}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      )}
    </div>
  );
}
```

### Stage 18: MVP Development Loop [NAMING MISMATCH → Sprint Planning] (225 LOC)
**File**: `Stage18MvpDevelopmentLoop.tsx`
**Backend**: `stage-18-sprint-planning.js`
**Purpose**: Sprint goal banner, item cards with priority/type/architecture layer badges, story points summary, SD bridge payloads, collapsible advisory. No gate.

```tsx
/**
 * Stage18MvpDevelopmentLoop — Sprint Planning renderer (Stage 18)
 *
 * Sprint goal, item cards with priority/type/architecture layer badges,
 * story points summary, SD bridge payloads, collapsible advisory.
 * Data shape matches backend: stage-18-sprint-planning.js
 *
 * SD-LEO-ORCH-STAGE-VENTURE-WORKFLOW-001-H
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import type { StageRendererProps } from "@/components/ventures/stages/StageRendererProps";

interface SprintItem {
  title?: string;
  description?: string;
  priority?: string;
  type?: string;
  scope?: string;
  success_criteria?: string;
  story_points?: number;
  architectureLayer?: string;
  milestoneRef?: string;
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  low: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
};

const TYPE_COLORS: Record<string, string> = {
  feature: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400",
  bugfix: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  enhancement: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  refactor: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400",
  infra: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400",
};

const LAYER_COLORS: Record<string, string> = {
  frontend: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  backend: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  database: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  infrastructure: "bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400",
  integration: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  security: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

export default function Stage18MvpDevelopmentLoop({
  stageData,
  className,
}: StageRendererProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const ad = stageData.advisoryData;

  const sprintName = ad?.sprint_name as string | undefined;
  const sprintDuration = ad?.sprint_duration_days as number | undefined;
  const sprintGoal = ad?.sprint_goal as string | undefined;
  const rawItems = ad?.items;
  const items: SprintItem[] = Array.isArray(rawItems) ? rawItems : [];
  const totalItems = (ad?.total_items as number) ?? items.length;
  const totalPoints = (ad?.total_story_points as number) ?? items.reduce((s, i) => s + (i.story_points ?? 0), 0);

  const ADVISORY_EXCLUDE = [
    "sprint_name", "sprint_duration_days", "sprint_goal", "items",
    "total_items", "total_story_points", "sd_bridge_payloads",
    "fourBuckets", "usage", "llmFallbackCount",
  ];
  const advisoryEntries = ad
    ? Object.entries(ad).filter(([key]) => !ADVISORY_EXCLUDE.includes(key))
    : [];
  const hasAdvisoryDetails = advisoryEntries.length > 0;

  return (
    <div className={`space-y-3 ${className ?? ""}`}>
      {/* Sprint Goal Banner */}
      {sprintGoal && (
        <div className="p-4 rounded-lg border bg-blue-500/10 border-blue-500/30">
          <div className="flex items-center gap-2 mb-1">
            {sprintName && <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">{sprintName}</span>}
            {sprintDuration && (
              <Badge variant="outline" className="text-[10px]">{sprintDuration} days</Badge>
            )}
          </div>
          <p className="text-sm text-blue-700 dark:text-blue-400">{sprintGoal}</p>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Items
            </span>
            <p className="text-2xl font-bold mt-1">{totalItems}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Story Points
            </span>
            <p className="text-2xl font-bold mt-1">{totalPoints}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Avg Points
            </span>
            <p className="text-2xl font-bold mt-1">
              {totalItems > 0 ? (totalPoints / totalItems).toFixed(1) : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Sprint Items */}
      {items.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Sprint Backlog</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {items.map((item, i) => (
                <div key={i} className="p-3 rounded-lg border bg-muted/20 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium flex-1">{item.title}</span>
                    <div className="flex gap-1 shrink-0 items-center">
                      {item.story_points != null && (
                        <Badge variant="outline" className="text-[10px]">
                          {item.story_points} pts
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {item.priority && (
                      <Badge className={`text-[9px] px-1.5 py-0 uppercase ${PRIORITY_COLORS[item.priority] ?? PRIORITY_COLORS.medium}`}>
                        {item.priority}
                      </Badge>
                    )}
                    {item.type && (
                      <Badge className={`text-[9px] px-1.5 py-0 ${TYPE_COLORS[item.type] ?? TYPE_COLORS.feature}`}>
                        {item.type}
                      </Badge>
                    )}
                    {item.architectureLayer && (
                      <Badge className={`text-[9px] px-1.5 py-0 ${LAYER_COLORS[item.architectureLayer] ?? ""}`}>
                        {item.architectureLayer}
                      </Badge>
                    )}
                    {item.milestoneRef && (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                        {item.milestoneRef}
                      </Badge>
                    )}
                  </div>
                  {item.description && (
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  )}
                  {item.success_criteria && (
                    <p className="text-xs text-emerald-700 dark:text-emerald-400">
                      Success: {item.success_criteria}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Full Advisory Details */}
      {hasAdvisoryDetails && (
        <Card>
          <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
            <CollapsibleTrigger asChild>
              <CardHeader className="pb-2 cursor-pointer hover:bg-muted/30 transition-colors">
                <CardTitle className="text-sm flex items-center gap-2">
                  Full Advisory Details
                  <ChevronDown
                    className={`w-4 h-4 ml-auto transition-transform ${detailsOpen ? "rotate-180" : ""}`}
                  />
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent>
                <div className="space-y-2">
                  {advisoryEntries.map(([key, value]) => (
                    <div
                      key={key}
                      className="flex justify-between text-sm border-b border-muted pb-1 last:border-0"
                    >
                      <span className="text-muted-foreground capitalize">
                        {key.replace(/_/g, " ")}
                      </span>
                      <span className="font-medium text-right max-w-[60%]">
                        {typeof value === "object"
                          ? JSON.stringify(value)
                          : String(value ?? "—")}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      )}
    </div>
  );
}
```

### Stage 19: Integration API Layer [NAMING MISMATCH → Build Execution] (260 LOC)
**File**: `Stage19IntegrationApiLayer.tsx`
**Backend**: `stage-19-build-execution.js`
**Purpose**: Phantom gate (COMPLETION_BANNER with complete/continue/blocked), task cards with status badges, issues list with severity, completion percentage bar, collapsible advisory.

```tsx
/**
 * Stage19IntegrationApiLayer — Build Execution renderer (Stage 19)
 *
 * Sprint completion decision banner, task cards with status badges,
 * status breakdown, issues list, completion percentage bar.
 * Data shape matches backend: stage-19-build-execution.js
 *
 * SD-LEO-ORCH-STAGE-VENTURE-WORKFLOW-001-H
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import type { StageRendererProps } from "@/components/ventures/stages/StageRendererProps";

interface Task {
  name?: string;
  description?: string;
  assignee?: string;
  status?: string;
  sprint_item_ref?: string;
}

interface Issue {
  description?: string;
  severity?: string;
  status?: string;
}

const COMPLETION_BANNER: Record<string, string> = {
  complete: "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400",
  continue: "bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-400",
  blocked: "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400",
};

const COMPLETION_BADGE: Record<string, string> = {
  complete: "bg-emerald-600 hover:bg-emerald-700",
  continue: "bg-blue-600 hover:bg-blue-700",
  blocked: "bg-red-600 hover:bg-red-700",
};

const TASK_STATUS_COLORS: Record<string, string> = {
  done: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  pending: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400",
  blocked: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

const ISSUE_SEVERITY: Record<string, string> = {
  critical: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  low: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
};

export default function Stage19IntegrationApiLayer({
  stageData,
  className,
}: StageRendererProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const ad = stageData.advisoryData;

  const rawTasks = ad?.tasks;
  const tasks: Task[] = Array.isArray(rawTasks) ? rawTasks : [];
  const rawIssues = ad?.issues;
  const issues: Issue[] = Array.isArray(rawIssues) ? rawIssues : [];
  const totalTasks = (ad?.total_tasks as number) ?? tasks.length;
  const completedTasks = (ad?.completed_tasks as number) ?? tasks.filter((t) => t.status === "done").length;
  const blockedTasks = (ad?.blocked_tasks as number) ?? tasks.filter((t) => t.status === "blocked").length;
  const completionPct = (ad?.completion_pct as number) ?? (totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0);
  const sprintCompletion = ad?.sprintCompletion as { decision?: string; readyForQa?: boolean; rationale?: string } | undefined;

  const decision = sprintCompletion?.decision;

  const ADVISORY_EXCLUDE = [
    "tasks", "issues", "total_tasks", "completed_tasks", "blocked_tasks",
    "completion_pct", "sprintCompletion", "tasks_by_status", "financialContract",
    "dataSource", "fourBuckets", "usage", "llmFallbackCount",
  ];
  const advisoryEntries = ad
    ? Object.entries(ad).filter(([key]) => !ADVISORY_EXCLUDE.includes(key))
    : [];
  const hasAdvisoryDetails = advisoryEntries.length > 0;

  return (
    <div className={`space-y-3 ${className ?? ""}`}>
      {/* Sprint Completion Banner */}
      {decision && (
        <div className={`flex flex-col gap-2 p-4 rounded-lg border ${COMPLETION_BANNER[decision] ?? COMPLETION_BANNER.continue}`}>
          <div className="flex items-center gap-3 flex-wrap">
            <Badge
              variant="default"
              className={`uppercase text-sm px-3 py-1 ${COMPLETION_BADGE[decision] ?? COMPLETION_BADGE.continue}`}
            >
              {decision.toUpperCase()}
            </Badge>
            <span className="text-sm font-medium">Sprint Status</span>
            {sprintCompletion?.readyForQa && (
              <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px]">
                QA Ready
              </Badge>
            )}
          </div>
          {sprintCompletion?.rationale && (
            <p className="text-xs">{sprintCompletion.rationale}</p>
          )}
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Total Tasks
            </span>
            <p className="text-2xl font-bold mt-1">{totalTasks}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Completed
            </span>
            <p className="text-2xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">{completedTasks}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Blocked
            </span>
            <p className={`text-2xl font-bold mt-1 ${blockedTasks > 0 ? "text-red-600 dark:text-red-400" : ""}`}>{blockedTasks}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Progress
            </span>
            <p className="text-2xl font-bold mt-1">{completionPct}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Progress Bar */}
      <div className="h-3 bg-muted/30 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${completionPct >= 80 ? "bg-emerald-500" : completionPct >= 50 ? "bg-blue-500" : "bg-amber-500"}`}
          style={{ width: `${completionPct}%` }}
        />
      </div>

      {/* Task List */}
      {tasks.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {tasks.map((task, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-sm border-b border-muted pb-2 last:border-0 last:pb-0"
                >
                  <div className="flex items-center gap-2 flex-1">
                    <Badge className={`text-[9px] px-1.5 py-0 ${TASK_STATUS_COLORS[task.status ?? "pending"]}`}>
                      {(task.status ?? "pending").replace(/_/g, " ")}
                    </Badge>
                    <span className="font-medium">{task.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {task.sprint_item_ref && (
                      <Badge variant="outline" className="text-[9px]">{task.sprint_item_ref}</Badge>
                    )}
                    {task.assignee && (
                      <span className="text-xs text-muted-foreground">{task.assignee}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Issues */}
      {issues.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-amber-600 dark:text-amber-400">Issues</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {issues.map((issue, i) => (
                <div key={i} className="p-2 rounded-lg border bg-muted/20 flex items-start gap-2">
                  {issue.severity && (
                    <Badge className={`text-[9px] px-1.5 py-0 uppercase shrink-0 ${ISSUE_SEVERITY[issue.severity] ?? ISSUE_SEVERITY.medium}`}>
                      {issue.severity}
                    </Badge>
                  )}
                  <span className="text-xs flex-1">{issue.description}</span>
                  {issue.status && (
                    <Badge variant="outline" className="text-[9px] shrink-0">{issue.status}</Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Full Advisory Details */}
      {hasAdvisoryDetails && (
        <Card>
          <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
            <CollapsibleTrigger asChild>
              <CardHeader className="pb-2 cursor-pointer hover:bg-muted/30 transition-colors">
                <CardTitle className="text-sm flex items-center gap-2">
                  Full Advisory Details
                  <ChevronDown
                    className={`w-4 h-4 ml-auto transition-transform ${detailsOpen ? "rotate-180" : ""}`}
                  />
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent>
                <div className="space-y-2">
                  {advisoryEntries.map(([key, value]) => (
                    <div
                      key={key}
                      className="flex justify-between text-sm border-b border-muted pb-1 last:border-0"
                    >
                      <span className="text-muted-foreground capitalize">
                        {key.replace(/_/g, " ")}
                      </span>
                      <span className="font-medium text-right max-w-[60%]">
                        {typeof value === "object"
                          ? JSON.stringify(value)
                          : String(value ?? "—")}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      )}
    </div>
  );
}
```

### Stage 20: Security Performance [NAMING MISMATCH → Quality Assurance] (272 LOC)
**File**: `Stage20SecurityPerformance.tsx`
**Backend**: `stage-20-quality-assurance.js`
**Purpose**: Phantom gate (QUALITY_BANNER with pass/conditional_pass/fail), test suites with pass rates and coverage bars, known defects, overall quality metrics, collapsible advisory.

```tsx
/**
 * Stage20SecurityPerformance — Quality Assurance renderer (Stage 20)
 *
 * Quality decision banner, test suites with pass rates and coverage,
 * known defects, overall metrics, collapsible advisory.
 * Data shape matches backend: stage-20-quality-assurance.js
 *
 * SD-LEO-ORCH-STAGE-VENTURE-WORKFLOW-001-H
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import type { StageRendererProps } from "@/components/ventures/stages/StageRendererProps";

interface TestSuite {
  name?: string;
  type?: string;
  total_tests?: number;
  passing_tests?: number;
  coverage_pct?: number;
}

interface Defect {
  description?: string;
  severity?: string;
  status?: string;
}

const QUALITY_BANNER: Record<string, string> = {
  pass: "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400",
  conditional_pass: "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400",
  fail: "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400",
};

const QUALITY_BADGE: Record<string, string> = {
  pass: "bg-emerald-600 hover:bg-emerald-700",
  conditional_pass: "bg-amber-500 hover:bg-amber-600",
  fail: "bg-red-600 hover:bg-red-700",
};

const SUITE_TYPE_COLORS: Record<string, string> = {
  unit: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  integration: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400",
  e2e: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
};

const DEFECT_SEVERITY: Record<string, string> = {
  critical: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  low: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
};

export default function Stage20SecurityPerformance({
  stageData,
  className,
}: StageRendererProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const ad = stageData.advisoryData;

  const rawSuites = ad?.test_suites;
  const suites: TestSuite[] = Array.isArray(rawSuites) ? rawSuites : [];
  const rawDefects = ad?.known_defects;
  const defects: Defect[] = Array.isArray(rawDefects) ? rawDefects : [];
  const overallPassRate = ad?.overall_pass_rate as number | undefined;
  const coveragePct = ad?.coverage_pct as number | undefined;
  const criticalFailures = ad?.critical_failures as number | undefined;
  const totalTests = ad?.total_tests as number | undefined;
  const qualityGatePassed = ad?.quality_gate_passed as boolean | undefined;
  const qualityDecision = ad?.qualityDecision as { decision?: string; rationale?: string } | undefined;

  const decision = qualityDecision?.decision;

  const ADVISORY_EXCLUDE = [
    "test_suites", "known_defects", "overall_pass_rate", "coverage_pct",
    "critical_failures", "totalFailures", "total_tests", "total_passing",
    "quality_gate_passed", "qualityDecision", "financialContract",
    "dataSource", "fourBuckets", "usage", "llmFallbackCount",
  ];
  const advisoryEntries = ad
    ? Object.entries(ad).filter(([key]) => !ADVISORY_EXCLUDE.includes(key))
    : [];
  const hasAdvisoryDetails = advisoryEntries.length > 0;

  return (
    <div className={`space-y-3 ${className ?? ""}`}>
      {/* Quality Decision Banner */}
      {decision && (
        <div className={`flex flex-col gap-2 p-4 rounded-lg border ${QUALITY_BANNER[decision] ?? QUALITY_BANNER.fail}`}>
          <div className="flex items-center gap-3 flex-wrap">
            <Badge
              variant="default"
              className={`uppercase text-sm px-3 py-1 ${QUALITY_BADGE[decision] ?? QUALITY_BADGE.fail}`}
            >
              {decision === "conditional_pass" ? "CONDITIONAL" : decision.toUpperCase()}
            </Badge>
            <span className="text-sm font-medium">Quality Gate</span>
            {qualityGatePassed != null && (
              <Badge className={qualityGatePassed ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"} >
                {qualityGatePassed ? "Gate Passed" : "Gate Failed"}
              </Badge>
            )}
          </div>
          {qualityDecision?.rationale && (
            <p className="text-xs">{qualityDecision.rationale}</p>
          )}
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Pass Rate
            </span>
            <p className={`text-2xl font-bold mt-1 ${(overallPassRate ?? 0) >= 95 ? "text-emerald-600 dark:text-emerald-400" : (overallPassRate ?? 0) >= 85 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
              {overallPassRate != null ? `${overallPassRate}%` : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Coverage
            </span>
            <p className={`text-2xl font-bold mt-1 ${(coveragePct ?? 0) >= 60 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
              {coveragePct != null ? `${coveragePct}%` : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Total Tests
            </span>
            <p className="text-2xl font-bold mt-1">{totalTests ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Critical Failures
            </span>
            <p className={`text-2xl font-bold mt-1 ${(criticalFailures ?? 0) > 0 ? "text-red-600 dark:text-red-400" : ""}`}>
              {criticalFailures ?? 0}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Test Suites */}
      {suites.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Test Suites</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {suites.map((suite, i) => {
                const passRate = suite.total_tests && suite.total_tests > 0
                  ? Math.round(((suite.passing_tests ?? 0) / suite.total_tests) * 100)
                  : 0;
                return (
                  <div key={i} className="p-3 rounded-lg border bg-muted/20 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{suite.name}</span>
                        {suite.type && (
                          <Badge className={`text-[9px] px-1.5 py-0 ${SUITE_TYPE_COLORS[suite.type] ?? ""}`}>
                            {suite.type}
                          </Badge>
                        )}
                      </div>
                      <span className="text-sm font-medium">
                        {suite.passing_tests ?? 0}/{suite.total_tests ?? 0}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-muted/30 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${passRate >= 95 ? "bg-emerald-500" : passRate >= 85 ? "bg-amber-500" : "bg-red-500"}`}
                          style={{ width: `${passRate}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground w-10 text-right">{passRate}%</span>
                    </div>
                    {suite.coverage_pct != null && (
                      <span className="text-xs text-muted-foreground">Coverage: {suite.coverage_pct}%</span>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Known Defects */}
      {defects.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Known Defects</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {defects.map((d, i) => (
                <div key={i} className="p-2 rounded-lg border bg-muted/20 flex items-start gap-2">
                  {d.severity && (
                    <Badge className={`text-[9px] px-1.5 py-0 uppercase shrink-0 ${DEFECT_SEVERITY[d.severity] ?? DEFECT_SEVERITY.medium}`}>
                      {d.severity}
                    </Badge>
                  )}
                  <span className="text-xs flex-1">{d.description}</span>
                  {d.status && (
                    <Badge variant="outline" className="text-[9px] shrink-0">{d.status}</Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Full Advisory Details */}
      {hasAdvisoryDetails && (
        <Card>
          <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
            <CollapsibleTrigger asChild>
              <CardHeader className="pb-2 cursor-pointer hover:bg-muted/30 transition-colors">
                <CardTitle className="text-sm flex items-center gap-2">
                  Full Advisory Details
                  <ChevronDown
                    className={`w-4 h-4 ml-auto transition-transform ${detailsOpen ? "rotate-180" : ""}`}
                  />
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent>
                <div className="space-y-2">
                  {advisoryEntries.map(([key, value]) => (
                    <div
                      key={key}
                      className="flex justify-between text-sm border-b border-muted pb-1 last:border-0"
                    >
                      <span className="text-muted-foreground capitalize">
                        {key.replace(/_/g, " ")}
                      </span>
                      <span className="font-medium text-right max-w-[60%]">
                        {typeof value === "object"
                          ? JSON.stringify(value)
                          : String(value ?? "—")}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      )}
    </div>
  );
}
```

### Stage 21: QA UAT [NAMING MISMATCH → Build Review] (237 LOC)
**File**: `Stage21QaUat.tsx`
**Backend**: `stage-21-build-review.js`
**Purpose**: Phantom gate (REVIEW_BANNER with approve/conditional/reject), integration test results with source→target flow, pass rate, environment badge, failing integrations with error messages, collapsible advisory.

```tsx
/**
 * Stage21QaUat — Build Review / Integration Testing renderer (Stage 21)
 *
 * Review decision banner, integration test results with source→target flow,
 * pass rate, failing integrations, environment badge, collapsible advisory.
 * Data shape matches backend: stage-21-build-review.js
 *
 * SD-LEO-ORCH-STAGE-VENTURE-WORKFLOW-001-H
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import type { StageRendererProps } from "@/components/ventures/stages/StageRendererProps";

interface Integration {
  name?: string;
  source?: string;
  target?: string;
  status?: string;
  severity?: string;
  environment?: string;
  errorMessage?: string | null;
}

const REVIEW_BANNER: Record<string, string> = {
  approve: "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400",
  conditional: "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400",
  reject: "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400",
};

const REVIEW_BADGE: Record<string, string> = {
  approve: "bg-emerald-600 hover:bg-emerald-700",
  conditional: "bg-amber-500 hover:bg-amber-600",
  reject: "bg-red-600 hover:bg-red-700",
};

const STATUS_COLORS: Record<string, string> = {
  pass: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  fail: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  skip: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400",
  pending: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
};

const ENV_COLORS: Record<string, string> = {
  development: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  staging: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  production: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
};

export default function Stage21QaUat({
  stageData,
  className,
}: StageRendererProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const ad = stageData.advisoryData;

  const rawIntegrations = ad?.integrations;
  const integrations: Integration[] = Array.isArray(rawIntegrations) ? rawIntegrations : [];
  const environment = ad?.environment as string | undefined;
  const totalIntegrations = (ad?.total_integrations as number) ?? integrations.length;
  const passingIntegrations = (ad?.passing_integrations as number) ?? integrations.filter((i) => i.status === "pass").length;
  const passRate = (ad?.pass_rate as number) ?? (totalIntegrations > 0 ? Math.round((passingIntegrations / totalIntegrations) * 100) : 0);
  const allPassing = ad?.all_passing as boolean | undefined;
  const reviewDecision = ad?.reviewDecision as { decision?: string; rationale?: string; conditions?: string[] } | undefined;

  const decision = reviewDecision?.decision;

  const ADVISORY_EXCLUDE = [
    "integrations", "environment", "total_integrations", "passing_integrations",
    "failing_integrations", "pass_rate", "all_passing", "reviewDecision",
    "dataSource", "fourBuckets", "usage", "llmFallbackCount",
  ];
  const advisoryEntries = ad
    ? Object.entries(ad).filter(([key]) => !ADVISORY_EXCLUDE.includes(key))
    : [];
  const hasAdvisoryDetails = advisoryEntries.length > 0;

  return (
    <div className={`space-y-3 ${className ?? ""}`}>
      {/* Review Decision Banner */}
      {decision && (
        <div className={`flex flex-col gap-2 p-4 rounded-lg border ${REVIEW_BANNER[decision] ?? REVIEW_BANNER.reject}`}>
          <div className="flex items-center gap-3 flex-wrap">
            <Badge
              variant="default"
              className={`uppercase text-sm px-3 py-1 ${REVIEW_BADGE[decision] ?? REVIEW_BADGE.reject}`}
            >
              {decision === "approve" ? "APPROVED" : decision === "conditional" ? "CONDITIONAL" : "REJECTED"}
            </Badge>
            <span className="text-sm font-medium">Build Review</span>
            {environment && (
              <Badge className={`text-[10px] ${ENV_COLORS[environment] ?? ""}`}>
                {environment}
              </Badge>
            )}
            <span className="opacity-50">·</span>
            <span className="text-sm">{passingIntegrations}/{totalIntegrations} passing</span>
          </div>
          {reviewDecision?.rationale && (
            <p className="text-xs">{reviewDecision.rationale}</p>
          )}
          {reviewDecision?.conditions && reviewDecision.conditions.length > 0 && (
            <ul className="space-y-1 mt-1">
              {reviewDecision.conditions.map((c, i) => (
                <li key={i} className="text-xs flex items-start gap-1.5">
                  <span className="mt-0.5 shrink-0">•</span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Integrations
            </span>
            <p className="text-2xl font-bold mt-1">{totalIntegrations}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Pass Rate
            </span>
            <p className={`text-2xl font-bold mt-1 ${allPassing ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
              {passRate}%
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Status
            </span>
            <p className={`text-2xl font-bold mt-1 ${allPassing ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
              {allPassing ? "All Pass" : "Issues"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Integration Test Results */}
      {integrations.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Integration Tests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {integrations.map((integ, i) => (
                <div
                  key={i}
                  className={`p-3 rounded-lg border space-y-1.5 ${integ.status === "fail" ? "bg-red-500/5 border-red-500/20" : "bg-muted/20"}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge className={`text-[9px] px-1.5 py-0 uppercase ${STATUS_COLORS[integ.status ?? "pending"]}`}>
                        {integ.status ?? "pending"}
                      </Badge>
                      <span className="text-sm font-medium">{integ.name}</span>
                    </div>
                    {integ.severity && (
                      <Badge variant="outline" className="text-[9px]">{integ.severity}</Badge>
                    )}
                  </div>
                  {(integ.source || integ.target) && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      {integ.source && <span>{integ.source}</span>}
                      {integ.source && integ.target && <span>→</span>}
                      {integ.target && <span>{integ.target}</span>}
                    </div>
                  )}
                  {integ.errorMessage && (
                    <p className="text-xs text-red-600 dark:text-red-400 bg-red-500/10 p-1.5 rounded">
                      {integ.errorMessage}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Full Advisory Details */}
      {hasAdvisoryDetails && (
        <Card>
          <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
            <CollapsibleTrigger asChild>
              <CardHeader className="pb-2 cursor-pointer hover:bg-muted/30 transition-colors">
                <CardTitle className="text-sm flex items-center gap-2">
                  Full Advisory Details
                  <ChevronDown
                    className={`w-4 h-4 ml-auto transition-transform ${detailsOpen ? "rotate-180" : ""}`}
                  />
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent>
                <div className="space-y-2">
                  {advisoryEntries.map(([key, value]) => (
                    <div
                      key={key}
                      className="flex justify-between text-sm border-b border-muted pb-1 last:border-0"
                    >
                      <span className="text-muted-foreground capitalize">
                        {key.replace(/_/g, " ")}
                      </span>
                      <span className="font-medium text-right max-w-[60%]">
                        {typeof value === "object"
                          ? JSON.stringify(value)
                          : String(value ?? "—")}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      )}
    </div>
  );
}
```

### Stage 22: Deployment [NAMING MISMATCH → Release Readiness] (319 LOC)
**File**: `Stage22Deployment.tsx`
**Backend**: `stage-22-release-readiness.js`
**Purpose**: Promotion gate (RELEASE_BANNER with release/hold/cancel), sprint summary, release items with approval status and category badges, release notes, sprint retrospective (collapsible), promotion gate pass/fail, collapsible advisory.

```tsx
/**
 * Stage22Deployment — Release Readiness renderer (Stage 22, promotion gate)
 *
 * Release decision banner, sprint summary, release items with approval status,
 * sprint retrospective, promotion gate, collapsible advisory.
 * Data shape matches backend: stage-22-release-readiness.js
 *
 * SD-LEO-ORCH-STAGE-VENTURE-WORKFLOW-001-H
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import type { StageRendererProps } from "@/components/ventures/stages/StageRendererProps";

interface ReleaseItem {
  name?: string;
  category?: string;
  status?: string;
  approver?: string;
}

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

export default function Stage22Deployment({
  stageData,
  className,
}: StageRendererProps) {
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
  const releaseDecision = ad?.releaseDecision as { decision?: string; rationale?: string; approver?: string } | undefined;
  const sprintSummary = ad?.sprintSummary as { sprintGoal?: string; itemsPlanned?: number; itemsCompleted?: number; qualityAssessment?: string; integrationStatus?: string } | undefined;
  const sprintRetro = ad?.sprintRetrospective as { wentWell?: string[]; wentPoorly?: string[]; actionItems?: string[] } | undefined;
  const promotionGate = ad?.promotion_gate as { pass?: boolean; blockers?: string[] } | undefined;

  const decision = releaseDecision?.decision;

  const ADVISORY_EXCLUDE = [
    "release_items", "release_notes", "target_date", "total_items",
    "approved_items", "all_approved", "releaseDecision", "sprintSummary",
    "sprintRetrospective", "promotion_gate",
    "fourBuckets", "usage", "llmFallbackCount",
  ];
  const advisoryEntries = ad
    ? Object.entries(ad).filter(([key]) => !ADVISORY_EXCLUDE.includes(key))
    : [];
  const hasAdvisoryDetails = advisoryEntries.length > 0;

  return (
    <div className={`space-y-3 ${className ?? ""}`}>
      {/* Release Decision Banner */}
      {decision && (
        <div className={`flex flex-col gap-2 p-4 rounded-lg border ${RELEASE_BANNER[decision] ?? RELEASE_BANNER.hold}`}>
          <div className="flex items-center gap-3 flex-wrap">
            <Badge
              variant="default"
              className={`uppercase text-sm px-3 py-1 ${RELEASE_BADGE[decision] ?? RELEASE_BADGE.hold}`}
            >
              {decision.toUpperCase()}
            </Badge>
            <span className="text-sm font-medium">Release Decision</span>
            {targetDate && (
              <>
                <span className="opacity-50">·</span>
                <span className="text-sm">Target: {targetDate}</span>
              </>
            )}
            {promotionGate && (
              <Badge className={promotionGate.pass ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"}>
                {promotionGate.pass ? "Gate Pass" : "Gate Fail"}
              </Badge>
            )}
          </div>
          {releaseDecision?.rationale && (
            <p className="text-xs">{releaseDecision.rationale}</p>
          )}
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Release Items
            </span>
            <p className="text-2xl font-bold mt-1">{totalItems}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Approved
            </span>
            <p className="text-2xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">{approvedItems}/{totalItems}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Status
            </span>
            <p className={`text-2xl font-bold mt-1 ${allApproved ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
              {allApproved ? "Ready" : "Pending"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Sprint Summary */}
      {sprintSummary && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Sprint Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {sprintSummary.sprintGoal && (
                <div className="flex justify-between text-sm border-b border-muted pb-2">
                  <span className="text-muted-foreground">Goal</span>
                  <span className="font-medium text-right max-w-[70%]">{sprintSummary.sprintGoal}</span>
                </div>
              )}
              {sprintSummary.itemsPlanned != null && (
                <div className="flex justify-between text-sm border-b border-muted pb-2">
                  <span className="text-muted-foreground">Planned / Completed</span>
                  <span className="font-medium">{sprintSummary.itemsCompleted ?? 0} / {sprintSummary.itemsPlanned}</span>
                </div>
              )}
              {sprintSummary.qualityAssessment && (
                <div className="flex justify-between text-sm border-b border-muted pb-2">
                  <span className="text-muted-foreground">Quality</span>
                  <span className="font-medium text-right max-w-[60%]">{sprintSummary.qualityAssessment}</span>
                </div>
              )}
              {sprintSummary.integrationStatus && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Integration</span>
                  <span className="font-medium text-right max-w-[60%]">{sprintSummary.integrationStatus}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Release Items */}
      {releaseItems.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Release Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {releaseItems.map((item, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-sm border-b border-muted pb-2 last:border-0 last:pb-0"
                >
                  <div className="flex items-center gap-2">
                    <Badge className={`text-[9px] px-1.5 py-0 ${ITEM_STATUS_COLORS[item.status ?? "pending"]}`}>
                      {item.status ?? "pending"}
                    </Badge>
                    <span className="font-medium">{item.name}</span>
                    {item.category && (
                      <Badge className={`text-[9px] px-1.5 py-0 ${CATEGORY_COLORS[item.category] ?? ""}`}>
                        {item.category}
                      </Badge>
                    )}
                  </div>
                  {item.approver && (
                    <span className="text-xs text-muted-foreground">{item.approver}</span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Release Notes */}
      {releaseNotes && (
        <div className="p-4 rounded-lg border bg-blue-500/10 border-blue-500/30">
          <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase">Release Notes</span>
          <p className="text-sm text-blue-700 dark:text-blue-400 mt-1">{releaseNotes}</p>
        </div>
      )}

      {/* Sprint Retrospective */}
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
                <div className="space-y-3">
                  {sprintRetro.wentWell && sprintRetro.wentWell.length > 0 && (
                    <div>
                      <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase">Went Well</span>
                      <ul className="mt-1 space-y-0.5">
                        {sprintRetro.wentWell.map((item, i) => (
                          <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                            <span className="mt-0.5 shrink-0">+</span><span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {sprintRetro.wentPoorly && sprintRetro.wentPoorly.length > 0 && (
                    <div>
                      <span className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase">Went Poorly</span>
                      <ul className="mt-1 space-y-0.5">
                        {sprintRetro.wentPoorly.map((item, i) => (
                          <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                            <span className="mt-0.5 shrink-0">-</span><span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {sprintRetro.actionItems && sprintRetro.actionItems.length > 0 && (
                    <div>
                      <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase">Action Items</span>
                      <ul className="mt-1 space-y-0.5">
                        {sprintRetro.actionItems.map((item, i) => (
                          <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                            <span className="mt-0.5 shrink-0">→</span><span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      )}

      {/* Full Advisory Details */}
      {hasAdvisoryDetails && (
        <Card>
          <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
            <CollapsibleTrigger asChild>
              <CardHeader className="pb-2 cursor-pointer hover:bg-muted/30 transition-colors">
                <CardTitle className="text-sm flex items-center gap-2">
                  Full Advisory Details
                  <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${detailsOpen ? "rotate-180" : ""}`} />
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent>
                <div className="space-y-2">
                  {advisoryEntries.map(([key, value]) => (
                    <div key={key} className="flex justify-between text-sm border-b border-muted pb-1 last:border-0">
                      <span className="text-muted-foreground capitalize">{key.replace(/_/g, " ")}</span>
                      <span className="font-medium text-right max-w-[60%]">
                        {typeof value === "object" ? JSON.stringify(value) : String(value ?? "—")}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      )}
    </div>
  );
}
```

---

## Evaluation Instructions

### Per-Stage Analysis
For each of the 6 stages, evaluate:
1. **Data handling correctness**: Does the renderer safely extract and normalize advisory data?
2. **Visual hierarchy**: Is the most important information displayed first?
3. **Layout responsiveness**: Does the layout work on mobile/tablet/desktop?
4. **Gate implementation** (Stages 17, 22 enforced; 19, 20, 21 phantom): Is the gate logic correct? Are values appropriate?
5. **Naming mismatch severity**: How much does the component name diverge from what it actually renders?
6. **Loading/empty states**: What does the user see while data is being generated?
7. **Accessibility**: Color contrast, screen reader support, keyboard navigation.

### Cross-Stage Analysis
1. **Build cycle coherence**: Readiness → Plan → Execute → Test → Review → Release. Does this tell a coherent build story?
2. **Gate nomenclature fragmentation**: 5 different value patterns in 6 stages. Can they be standardized? What should the canonical values be?
3. **Phantom gate philosophy**: Should stages 19 (execution), 20 (QA), or 21 (review) be promoted to enforced gates? Which is most critical?
4. **Metric grid inconsistency**: 3-column grids in stages 18, 21, 22 vs 4-column elsewhere. Is this justified by data density?
5. **Code duplication**: Collapsible advisory, color maps, normalization patterns repeated 6 times. What's the extraction priority?
6. **All 6 naming mismatches**: Does renaming all 6 simultaneously risk breaking anything? What's the safest migration path?

### Scoring Dimensions
Score each dimension 1-10 for the group:
| Dimension | Question |
|-----------|----------|
| Logic & Flow | Is the stage ordering and progression logical? |
| Functionality | Does each stage work correctly end-to-end? |
| UI/Visual Design | Does it look professional and consistent? |
| UX/Workflow | Is the user experience intuitive and efficient? |
| Architecture | Is the technical design clean, maintainable, scalable? |

### Output Format
For each stage provide:
- Scores table (5 dimensions)
- Top 3 strengths
- Top 3 concerns (each with Gap Importance score 1-5)
- Top 3 recommendations

Then provide:
- Group-level scores
- Cross-stage analysis
- The 3 most impactful changes for this group
