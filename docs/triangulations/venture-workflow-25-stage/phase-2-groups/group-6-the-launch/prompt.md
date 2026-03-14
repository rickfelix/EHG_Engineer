# Phase 2 Deep Dive: Group 6 — THE_LAUNCH (Stages 23-25)

## Context from Phase 1

This is Phase 2 of a hierarchical triangulation review of a 25-stage venture workflow. Phase 1 assessed all 25 stages at a high level across 6 groups. This prompt focuses on **Group 6: THE_LAUNCH (Stages 23-25)**, which covers the launch execution phase from marketing preparation through operations handoff. This is the **lowest-scoring group** (5.4/10) with a **confirmed critical bug** at Stage 23.

### Phase 1 Consensus for Group 6
- **Logic & Flow: 6/10** — Marketing -> Launch Readiness -> Launch Execution is logical but Stage 23's missing kill gate breaks the decision flow.
- **Functionality: 4/10** — Lowest functionality score of any group. Stage 23 kill gate is configured but NOT rendered (confirmed bug). Stage 24 renders a gate that isn't enforced (phantom).
- **UI/Visual Design: 7/10** — Despite the bugs, the visual quality is decent. Stage 25's operations handoff with monitoring dashboards, alerts, escalation contacts, and SLA targets is genuinely well-designed.
- **UX/Workflow: 5/10** — The kill gate bug at Stage 23 breaks trust at the highest-stakes moment. All 3 naming mismatches add confusion.
- **Architecture: 5/10** — Stage 23 missing gate implementation, Stage 24 phantom gate, all naming mismatches, and gate nomenclature inconsistency.

### Phase 1 Issues to Investigate
1. **Stage 23 kill gate BUG (P0)**: Config at `venture-workflow.ts:277` sets `gateType: 'kill'`, component comment says "kill gate", but the component has NO gate banner code — no DECISION_BANNER constant, no gate decision extraction, no banner rendering. This is the only confirmed broken gate in the entire 25-stage workflow.
2. **Stage 24 phantom gate formalization**: Renders DECISION_BANNER with go/conditional_go/no_go values but `gateType: 'none'`. Should this be promoted to an enforced gate (launch readiness is high-stakes)?
3. **All 3 naming mismatches**: ProductionLaunch->Marketing Preparation, GrowthMetricsOptimization->Launch Readiness, ScalePlanning->Launch Execution
4. **Operations mode transition**: Stage 25 transitions from "venture pipeline" to "operations mode" with a LAUNCHED banner. Is this transition well-handled? Is there enough context for what happens AFTER Stage 25?
5. **Launch sequence completeness**: Marketing -> Readiness -> Execution. Is this sufficient for a launch phase, or are stages missing (e.g., legal review, compliance check, rollback plan)?

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
Backend (stage-NN.js) -> venture_stage_work.advisory_data (JSONB)
  -> useStageDisplayData() hook -> StageContentRouter -> Stage renderer component
```

### Layout System
- Stages 1-3: Compact header (no tabs)
- Stages 4-25: Full 5-tab layout (Stage, Artifacts, Timeline, AI Insights, Settings)
- All Group 6 stages (23-25) use the full 5-tab layout

### Gate System
- **Stage 23**: Kill gate (`gateType: 'kill'`) — **BUG: gate banner NOT rendered** despite config and component comment declaring it
- **Stage 24**: Phantom gate (`gateType: 'none'`) — renders DECISION_BANNER with go/conditional_go/no_go values
- **Stage 25**: Pipeline terminus (`gateType: 'none'`) — renders LAUNCHED banner for operations mode transition

### Config
All 3 stages with chunk: 'THE_LAUNCH':
```typescript
{ stageNumber: 23, stageName: 'Production Launch', componentPath: 'Stage23ProductionLaunch.tsx', gateType: 'kill', chunk: 'THE_LAUNCH' }
{ stageNumber: 24, stageName: 'Growth Metrics Optimization', componentPath: 'Stage24GrowthMetricsOptimization.tsx', gateType: 'none', chunk: 'THE_LAUNCH' }
{ stageNumber: 25, stageName: 'Scale Planning', componentPath: 'Stage25ScalePlanning.tsx', gateType: 'none', chunk: 'THE_LAUNCH' }
```

### Component Names vs Content
ALL 3 stages have naming mismatches:
| Stage | Component Name | Actually Renders | Backend File | Match? |
|-------|---------------|-----------------|--------------|--------|
| 23 | ProductionLaunch | Marketing Preparation | stage-23-marketing-prep.js | NO |
| 24 | GrowthMetricsOptimization | Launch Readiness | stage-24-launch-readiness.js | NO |
| 25 | ScalePlanning | Launch Execution | stage-25-launch-execution.js | NO |

### Comparison: Working Kill Gate vs Broken Kill Gate
For reference, Stage 13's working kill gate implementation:
```tsx
// Stage 13 — WORKING kill gate (for comparison with Stage 23's MISSING gate)
const DECISION_BANNER: Record<string, string> = {
  pass: "bg-green-600/10 border-green-600/30 text-green-700 dark:text-green-400",
  conditional_pass: "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400",
  kill: "bg-red-600/10 border-red-600/30 text-red-700 dark:text-red-400",
};
const DECISION_BADGE: Record<string, { variant: ...; className: string }> = { ... };
const DECISION_LABELS: Record<string, string> = { pass: "APPROVED", conditional_pass: "CONDITIONAL", kill: "KILLED" };
// Lines 108-142 render the banner with decision badge, reasons, and remediation steps
```

Stage 23 has NONE of this code — no DECISION_BANNER, no decision extraction, no banner rendering.

---

## Source Code

### Stage 23: Production Launch [NAMING MISMATCH -> Marketing Preparation] — KILL GATE BUG (199 LOC)
**File**: Stage23ProductionLaunch.tsx
**Backend**: stage-23-marketing-prep.js
**Purpose**: Should be a kill gate for marketing readiness. Currently renders marketing items and readiness percentage but has NO gate decision banner. This is the confirmed P0 bug from Phase 1.

```tsx
/**
 * Stage23ProductionLaunch — Marketing Preparation renderer (Stage 23, kill gate)
 *
 * Marketing strategy summary, marketing items with type/priority badges,
 * target audience, SD bridge payloads, collapsible advisory.
 * Data shape matches backend: stage-23-marketing-prep.js
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

interface MarketingItem {
  title?: string;
  description?: string;
  type?: string;
  priority?: string;
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  low: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
};

const TYPE_COLORS: Record<string, string> = {
  landing_page: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  social_media_campaign: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  press_release: "bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400",
  email_campaign: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  content_blog: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  video_promo: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
  ad_creative: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  product_demo: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  case_study: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  launch_announcement: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const TYPE_LABELS: Record<string, string> = {
  landing_page: "Landing Page",
  social_media_campaign: "Social Media",
  press_release: "Press Release",
  email_campaign: "Email Campaign",
  content_blog: "Blog Content",
  video_promo: "Video Promo",
  ad_creative: "Ad Creative",
  product_demo: "Product Demo",
  case_study: "Case Study",
  launch_announcement: "Launch Announcement",
};

export default function Stage23ProductionLaunch({
  stageData,
  className,
}: StageRendererProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const ad = stageData.advisoryData;

  const rawItems = ad?.marketing_items;
  const items: MarketingItem[] = Array.isArray(rawItems) ? rawItems : [];
  const strategySummary = ad?.marketing_strategy_summary as string | undefined;
  const targetAudience = ad?.target_audience as string | undefined;
  const totalItems = (ad?.total_marketing_items as number) ?? items.length;
  const sdsCreated = ad?.sds_created_count as number | undefined;
  const readinessPct = ad?.marketing_readiness_pct as number | undefined;

  const ADVISORY_EXCLUDE = [
    "marketing_items", "marketing_strategy_summary", "target_audience",
    "total_marketing_items", "sds_created_count", "marketing_readiness_pct",
    "sd_bridge_payloads", "marketing_sds",
    "fourBuckets", "_usage", "_latencyMs",
  ];
  const advisoryEntries = ad
    ? Object.entries(ad).filter(([key]) => !ADVISORY_EXCLUDE.includes(key))
    : [];
  const hasAdvisoryDetails = advisoryEntries.length > 0;

  return (
    <div className={`space-y-3 ${className ?? ""}`}>
      {/* Strategy Summary */}
      {strategySummary && (
        <div className="p-4 rounded-lg border bg-pink-500/10 border-pink-500/30">
          <p className="text-sm text-pink-700 dark:text-pink-400">{strategySummary}</p>
        </div>
      )}

      {/* Target Audience */}
      {targetAudience && (
        <div className="p-3 rounded-lg border bg-violet-500/10 border-violet-500/30">
          <span className="text-xs font-semibold text-violet-600 dark:text-violet-400 uppercase">Target Audience</span>
          <p className="text-sm text-violet-700 dark:text-violet-400 mt-1">{targetAudience}</p>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Marketing Items
            </span>
            <p className="text-2xl font-bold mt-1">{totalItems}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              SDs Created
            </span>
            <p className="text-2xl font-bold mt-1">{sdsCreated ?? 0}</p>
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
      </div>

      {/* Marketing Items */}
      {items.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Marketing Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {items.map((item, i) => (
                <div key={i} className="p-3 rounded-lg border bg-muted/20 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium flex-1">{item.title}</span>
                    <div className="flex gap-1 shrink-0">
                      {item.priority && (
                        <Badge className={`text-[9px] px-1.5 py-0 uppercase ${PRIORITY_COLORS[item.priority] ?? PRIORITY_COLORS.medium}`}>
                          {item.priority}
                        </Badge>
                      )}
                    </div>
                  </div>
                  {item.type && (
                    <Badge className={`text-[9px] px-1.5 py-0 ${TYPE_COLORS[item.type] ?? ""}`}>
                      {TYPE_LABELS[item.type] ?? item.type.replace(/_/g, " ")}
                    </Badge>
                  )}
                  {item.description && (
                    <p className="text-xs text-muted-foreground">{item.description}</p>
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

### Stage 24: Growth Metrics Optimization [NAMING MISMATCH -> Launch Readiness] (279 LOC)
**File**: Stage24GrowthMetricsOptimization.tsx
**Backend**: stage-24-launch-readiness.js
**Purpose**: Phantom gate with launch readiness checklist, risks with mitigation, operational plans. Renders DECISION_BANNER with go/conditional_go/no_go but config says gateType: 'none'.

```tsx
/**
 * Stage24GrowthMetricsOptimization — Launch Readiness renderer (Stage 24)
 *
 * Go/no-go decision banner, readiness checklist with pass/fail badges,
 * readiness score, launch risks, operational plans (incident response,
 * monitoring, rollback), collapsible advisory.
 * Data shape matches backend: stage-24-launch-readiness.js
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

interface LaunchRisk {
  risk?: string;
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

const CHECK_STATUS_COLORS: Record<string, string> = {
  pass: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  fail: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  waived: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400",
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  low: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
};

const CHECKLIST_LABELS: Record<string, string> = {
  release_confirmed: "Release Confirmed",
  marketing_complete: "Marketing Complete",
  monitoring_ready: "Monitoring Ready",
  rollback_plan_exists: "Rollback Plan",
};

export default function Stage24GrowthMetricsOptimization({
  stageData,
  className,
}: StageRendererProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [plansOpen, setPlansOpen] = useState(false);
  const ad = stageData.advisoryData;

  const decision = ad?.go_no_go_decision as string | undefined;
  const rationale = ad?.decision_rationale as string | undefined;
  const readinessScore = ad?.readiness_score as number | undefined;
  const allChecksPass = ad?.all_checks_pass as boolean | undefined;
  const checklist = ad?.readiness_checklist as Record<string, { status?: string; evidence?: string; verified_at?: string }> | undefined;
  const rawRisks = ad?.launch_risks;
  const risks: LaunchRisk[] = Array.isArray(rawRisks) ? rawRisks : [];
  const incidentPlan = ad?.incident_response_plan as string | undefined;
  const monitoringSetup = ad?.monitoring_setup as string | undefined;
  const rollbackPlan = ad?.rollback_plan as string | undefined;

  const ADVISORY_EXCLUDE = [
    "go_no_go_decision", "decision_rationale", "readiness_score",
    "all_checks_pass", "blocking_items", "readiness_checklist",
    "launch_risks", "incident_response_plan", "monitoring_setup", "rollback_plan",
    "fourBuckets", "_usage", "_latencyMs",
  ];
  const advisoryEntries = ad
    ? Object.entries(ad).filter(([key]) => !ADVISORY_EXCLUDE.includes(key))
    : [];
  const hasAdvisoryDetails = advisoryEntries.length > 0;

  return (
    <div className={`space-y-3 ${className ?? ""}`}>
      {/* Go/No-Go Decision Banner */}
      {decision && (
        <div className={`flex flex-col gap-2 p-4 rounded-lg border ${DECISION_BANNER[decision] ?? DECISION_BANNER.no_go}`}>
          <div className="flex items-center gap-3 flex-wrap">
            <Badge
              variant="default"
              className={`uppercase text-sm px-3 py-1 ${DECISION_BADGE[decision] ?? DECISION_BADGE.no_go}`}
            >
              {decision === "go" ? "GO" : decision === "conditional_go" ? "CONDITIONAL GO" : "NO-GO"}
            </Badge>
            <span className="text-sm font-medium">Launch Readiness</span>
            {readinessScore != null && (
              <>
                <span className="opacity-50">·</span>
                <span className="text-sm">Score: {readinessScore}%</span>
              </>
            )}
          </div>
          {rationale && <p className="text-xs">{rationale}</p>}
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Readiness
            </span>
            <p className={`text-2xl font-bold mt-1 ${(readinessScore ?? 0) >= 80 ? "text-emerald-600 dark:text-emerald-400" : (readinessScore ?? 0) >= 50 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
              {readinessScore != null ? `${readinessScore}%` : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Checks
            </span>
            <p className={`text-2xl font-bold mt-1 ${allChecksPass ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
              {allChecksPass ? "All Pass" : "Issues"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Risks
            </span>
            <p className="text-2xl font-bold mt-1">{risks.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Readiness Checklist */}
      {checklist && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Readiness Checklist</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(checklist).map(([key, check]) => (
                <div
                  key={key}
                  className="flex items-center justify-between text-sm border-b border-muted pb-2 last:border-0 last:pb-0"
                >
                  <div className="flex items-center gap-2">
                    <Badge className={`text-[9px] px-1.5 py-0 uppercase ${CHECK_STATUS_COLORS[check.status ?? "pending"]}`}>
                      {check.status ?? "pending"}
                    </Badge>
                    <span className="font-medium">{CHECKLIST_LABELS[key] ?? key.replace(/_/g, " ")}</span>
                  </div>
                  {check.evidence && (
                    <span className="text-xs text-muted-foreground max-w-[50%] text-right">{check.evidence}</span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Launch Risks */}
      {risks.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Launch Risks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {risks.map((r, i) => (
                <div key={i} className="p-3 rounded-lg border bg-muted/20 space-y-1.5">
                  <div className="flex items-start gap-2">
                    {r.severity && (
                      <Badge className={`text-[9px] px-1.5 py-0 uppercase shrink-0 ${SEVERITY_COLORS[r.severity] ?? SEVERITY_COLORS.medium}`}>
                        {r.severity}
                      </Badge>
                    )}
                    <span className="text-sm">{r.risk}</span>
                  </div>
                  {r.mitigation && (
                    <div className="text-xs p-2 rounded bg-emerald-500/10 border border-emerald-500/20">
                      <span className="font-semibold text-emerald-700 dark:text-emerald-400">Mitigation: </span>
                      <span className="text-emerald-700 dark:text-emerald-400">{r.mitigation}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Operational Plans */}
      {(incidentPlan || monitoringSetup || rollbackPlan) && (
        <Card>
          <Collapsible open={plansOpen} onOpenChange={setPlansOpen}>
            <CollapsibleTrigger asChild>
              <CardHeader className="pb-2 cursor-pointer hover:bg-muted/30 transition-colors">
                <CardTitle className="text-sm flex items-center gap-2">
                  Operational Plans
                  <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${plansOpen ? "rotate-180" : ""}`} />
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent>
                <div className="space-y-3">
                  {incidentPlan && (
                    <div>
                      <span className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase">Incident Response</span>
                      <p className="text-xs text-muted-foreground mt-1">{incidentPlan}</p>
                    </div>
                  )}
                  {monitoringSetup && (
                    <div>
                      <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase">Monitoring</span>
                      <p className="text-xs text-muted-foreground mt-1">{monitoringSetup}</p>
                    </div>
                  )}
                  {rollbackPlan && (
                    <div>
                      <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase">Rollback Plan</span>
                      <p className="text-xs text-muted-foreground mt-1">{rollbackPlan}</p>
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

### Stage 25: Scale Planning [NAMING MISMATCH -> Launch Execution] (347 LOC)
**File**: Stage25ScalePlanning.tsx
**Backend**: stage-25-launch-execution.js
**Purpose**: Pipeline terminus. Renders LAUNCHED banner, go-live timestamp, distribution channels, operations handoff with monitoring/alerts/escalation/SLA.

```tsx
/**
 * Stage25ScalePlanning — Launch Execution renderer (Stage 25, pipeline terminus)
 *
 * Launch summary, go-live timestamp, distribution channels with activation
 * status, operations handoff (monitoring dashboards, alerts, escalation
 * contacts, SLA targets, maintenance), collapsible advisory.
 * Data shape matches backend: stage-25-launch-execution.js
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

interface DistributionChannel {
  name?: string;
  type?: string;
  status?: string;
  activation_date?: string | null;
  metrics_endpoint?: string | null;
}

interface Dashboard {
  name?: string;
  url?: string;
  owner?: string;
}

interface Alert {
  name?: string;
  condition?: string;
  severity?: string;
  notify?: string;
}

interface EscalationContact {
  level?: string;
  team?: string;
  channel?: string;
  response_time?: string;
}

const CHANNEL_STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  activating: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  inactive: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  paused: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
};

const CHANNEL_TYPE_COLORS: Record<string, string> = {
  app_store: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  web: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  social: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
  email: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  partner: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  marketplace: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  direct: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
};

const ALERT_SEVERITY: Record<string, string> = {
  critical: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  warning: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  info: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
};

export default function Stage25ScalePlanning({
  stageData,
  className,
}: StageRendererProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [opsOpen, setOpsOpen] = useState(false);
  const ad = stageData.advisoryData;

  const launchSummary = ad?.launch_summary as string | undefined;
  const goLiveTimestamp = ad?.go_live_timestamp as string | undefined;
  const rawChannels = ad?.distribution_channels;
  const channels: DistributionChannel[] = Array.isArray(rawChannels) ? rawChannels : [];
  const activeCount = (ad?.channels_active_count as number) ?? channels.filter((c) => c.status === "active").length;
  const totalCount = (ad?.channels_total_count as number) ?? channels.length;
  const pipelineTerminus = ad?.pipeline_terminus as boolean | undefined;

  const opsHandoff = ad?.operations_handoff as {
    monitoring?: {
      dashboards?: Dashboard[];
      alerts?: Alert[];
      health_check_url?: string | null;
    };
    escalation?: {
      contacts?: EscalationContact[];
      runbook_url?: string | null;
      sla_targets?: Record<string, string>;
    };
    maintenance?: {
      schedule?: string;
      backup_strategy?: string;
      update_policy?: string;
    };
  } | undefined;

  const dashboards: Dashboard[] = Array.isArray(opsHandoff?.monitoring?.dashboards) ? opsHandoff!.monitoring!.dashboards! : [];
  const alerts: Alert[] = Array.isArray(opsHandoff?.monitoring?.alerts) ? opsHandoff!.monitoring!.alerts! : [];
  const contacts: EscalationContact[] = Array.isArray(opsHandoff?.escalation?.contacts) ? opsHandoff!.escalation!.contacts! : [];
  const slaTargets = opsHandoff?.escalation?.sla_targets;
  const maintenance = opsHandoff?.maintenance;

  const ADVISORY_EXCLUDE = [
    "launch_summary", "go_live_timestamp", "distribution_channels",
    "operations_handoff", "pipeline_terminus", "pipeline_mode",
    "channels_active_count", "channels_total_count",
    "fourBuckets", "_usage", "_latencyMs",
  ];
  const advisoryEntries = ad
    ? Object.entries(ad).filter(([key]) => !ADVISORY_EXCLUDE.includes(key))
    : [];
  const hasAdvisoryDetails = advisoryEntries.length > 0;

  return (
    <div className={`space-y-3 ${className ?? ""}`}>
      {/* Pipeline Terminus Banner */}
      {pipelineTerminus && (
        <div className="p-4 rounded-lg border bg-emerald-500/10 border-emerald-500/30">
          <div className="flex items-center gap-3 flex-wrap">
            <Badge className="bg-emerald-600 hover:bg-emerald-700 uppercase text-sm px-3 py-1">
              LAUNCHED
            </Badge>
            <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Pipeline Complete — Operations Mode</span>
            {goLiveTimestamp && (
              <>
                <span className="opacity-50 text-emerald-700 dark:text-emerald-400">·</span>
                <span className="text-sm text-emerald-700 dark:text-emerald-400">{goLiveTimestamp}</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Launch Summary */}
      {launchSummary && (
        <div className="p-4 rounded-lg border bg-indigo-500/10 border-indigo-500/30">
          <p className="text-sm text-indigo-700 dark:text-indigo-400">{launchSummary}</p>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Channels
            </span>
            <p className="text-2xl font-bold mt-1">{totalCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Active
            </span>
            <p className="text-2xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">{activeCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Alerts
            </span>
            <p className="text-2xl font-bold mt-1">{alerts.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Distribution Channels */}
      {channels.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Distribution Channels</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {channels.map((ch, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-sm border-b border-muted pb-2 last:border-0 last:pb-0"
                >
                  <div className="flex items-center gap-2">
                    <Badge className={`text-[9px] px-1.5 py-0 uppercase ${CHANNEL_STATUS_COLORS[ch.status ?? "inactive"]}`}>
                      {ch.status ?? "inactive"}
                    </Badge>
                    <span className="font-medium">{ch.name}</span>
                    {ch.type && (
                      <Badge className={`text-[9px] px-1.5 py-0 ${CHANNEL_TYPE_COLORS[ch.type] ?? ""}`}>
                        {ch.type.replace(/_/g, " ")}
                      </Badge>
                    )}
                  </div>
                  {ch.activation_date && (
                    <Badge variant="outline" className="text-[9px]">{ch.activation_date}</Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Operations Handoff */}
      {opsHandoff && (
        <Card>
          <Collapsible open={opsOpen} onOpenChange={setOpsOpen}>
            <CollapsibleTrigger asChild>
              <CardHeader className="pb-2 cursor-pointer hover:bg-muted/30 transition-colors">
                <CardTitle className="text-sm flex items-center gap-2">
                  Operations Handoff
                  <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${opsOpen ? "rotate-180" : ""}`} />
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent>
                <div className="space-y-4">
                  {/* Dashboards */}
                  {dashboards.length > 0 && (
                    <div>
                      <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase">Dashboards</span>
                      <div className="mt-1 space-y-1">
                        {dashboards.map((d, i) => (
                          <div key={i} className="flex justify-between text-xs border-b border-muted pb-1 last:border-0">
                            <span className="font-medium">{d.name}</span>
                            <span className="text-muted-foreground">{d.owner}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Alerts */}
                  {alerts.length > 0 && (
                    <div>
                      <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase">Alerts</span>
                      <div className="mt-1 space-y-1">
                        {alerts.map((a, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs border-b border-muted pb-1 last:border-0">
                            {a.severity && (
                              <Badge className={`text-[8px] px-1 py-0 ${ALERT_SEVERITY[a.severity] ?? ""}`}>
                                {a.severity}
                              </Badge>
                            )}
                            <span className="font-medium">{a.name}</span>
                            <span className="text-muted-foreground flex-1 text-right">{a.condition}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Escalation Contacts */}
                  {contacts.length > 0 && (
                    <div>
                      <span className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase">Escalation</span>
                      <div className="mt-1 space-y-1">
                        {contacts.map((c, i) => (
                          <div key={i} className="flex items-center justify-between text-xs border-b border-muted pb-1 last:border-0">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[8px] px-1 py-0">{c.level}</Badge>
                              <span className="font-medium">{c.team}</span>
                            </div>
                            <span className="text-muted-foreground">{c.response_time}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* SLA Targets */}
                  {slaTargets && Object.keys(slaTargets).length > 0 && (
                    <div>
                      <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase">SLA Targets</span>
                      <div className="mt-1 space-y-1">
                        {Object.entries(slaTargets).map(([key, val]) => (
                          <div key={key} className="flex justify-between text-xs border-b border-muted pb-1 last:border-0">
                            <span className="text-muted-foreground capitalize">{key.replace(/_/g, " ")}</span>
                            <span className="font-medium">{val}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Maintenance */}
                  {maintenance && (
                    <div>
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Maintenance</span>
                      <div className="mt-1 space-y-1 text-xs text-muted-foreground">
                        {maintenance.schedule && <p>Schedule: {maintenance.schedule}</p>}
                        {maintenance.backup_strategy && <p>Backup: {maintenance.backup_strategy}</p>}
                        {maintenance.update_policy && <p>Updates: {maintenance.update_policy}</p>}
                      </div>
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
For each of the 3 stages, evaluate:
1. **Data handling correctness**: Does the renderer safely extract and normalize advisory data?
2. **Visual hierarchy**: Is the most important information displayed first?
3. **Layout responsiveness**: Does the layout work on mobile/tablet/desktop?
4. **Gate implementation**: Stage 23 — what SHOULD the kill gate look like? Compare to Stage 13's working implementation. Stage 24 — should the phantom gate be promoted? Stage 25 — is the LAUNCHED terminus banner appropriate?
5. **Naming mismatch severity**: How much does the component name diverge from what it actually renders?
6. **Loading/empty states**: What does the user see while data is being generated?
7. **Accessibility**: Color contrast, screen reader support, keyboard navigation.

### Cross-Stage Analysis
1. **Launch narrative coherence**: Marketing -> Readiness -> Execution. Does this tell a coherent launch story?
2. **Kill gate bug impact**: How does the missing Stage 23 gate affect the entire launch phase? What downstream risks exist when ventures can pass through unchecked?
3. **Phantom gate decision**: Should Stage 24's go/conditional_go/no_go gate be promoted to an enforced gate? This is the last checkpoint before launch execution.
4. **Operations transition**: Stage 25 transitions from pipeline to operations mode. Is this transition clear? What happens after Stage 25?
5. **Stage 25 as design exemplar**: Phase 1 called Stage 25's operations handoff "genuinely well-designed." Does the source code confirm this?
6. **Launch phase completeness**: Are any critical launch stages missing (legal, compliance, rollback planning)?
7. **High-stakes trust**: This is the highest-stakes phase — real money, real users, real launch. Does the implementation inspire confidence?

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
