# Phase 2 Deep Dive: Group 1 — THE_TRUTH (Stages 1-5)

## Context from Phase 1

This is Phase 2 of a hierarchical triangulation review of a 25-stage venture workflow. Phase 1 assessed all 25 stages at a high level across 6 groups. This prompt focuses on **Group 1: THE_TRUTH (Stages 1-5)**, which covers the foundation phase from raw idea capture through financial viability assessment.

### Phase 1 Consensus for Group 1
- **Logic & Flow: 8/10** — Strong funnel from idea to validation with two well-placed kill gates.
- **Functionality: 8/10** — All renderers extract advisory data correctly. Kill gates at 3 and 5 render proper 3-way banners.
- **UI/Visual Design: 7/10** — Stages 1-2 use shared components. Stages 3-5 use custom but consistent layouts.
- **UX/Workflow: 8/10** — Kill gates provide clear go/no-go decisions. Stage 5 adds financial context.
- **Architecture: 7/10** — Stages 1-2 use shared components (AdvisoryDataPanel, ArtifactListPanel). Stages 3-5 follow universal renderer structure but reimplement patterns locally.

### Phase 1 Issues to Investigate
1. **Shared component dropoff**: Stages 1-2 use shared `AdvisoryDataPanel` and `ArtifactListPanel`. Stages 3-5 do not — they reimplement the collapsible advisory details pattern. Is this justified by complexity, or is it unnecessary duplication?
2. **Compact-to-full layout transition**: Stages 1-3 use a compact header. Stages 4-5 use a full 5-tab layout. Is this transition well-telegraphed or jarring?
3. **Dark mode gap in Stage 2**: Icon colors (star, thumbs-up, thumbs-down) are hardcoded yellow/green/red without `dark:` variants.
4. **Stage 3 animated progress view**: 9-step animation during processing. Is this a good UX pattern or unnecessary complexity?
5. **Stage 5 kill gate placement**: Is financial viability too early for ventures that need concept proof before credible forecasting?

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
- **Stages 1-3**: Compact header (no tabs) — defined in `BuildingMode.tsx`
- **Stages 4-25**: Full 5-tab layout (Stage, Artifacts, Timeline, AI Insights, Settings)

### Gate System
- **Stage 3**: Kill gate (PASS / REVISE / KILL) — threshold: 70/100
- **Stage 5**: Kill gate (pass / conditional_pass / kill) — financial viability
- Gate state stored in `chairman_decisions` table, queried by `useStageDisplayData`

### Shared Components Used
- `AdvisoryDataPanel` — Generic key-value renderer for advisory overflow (used by Stages 1, 2)
- `ArtifactListPanel` — Simple artifact list with date formatting (used by Stages 1, 2)
- Neither is used by Stages 3, 4, or 5

### Config
All 5 stages configured with `chunk: 'THE_TRUTH'` in `venture-workflow.ts`:
```typescript
// Stages 1-5 config snippet
{ stageNumber: 1, stageName: 'Draft Idea', componentPath: 'Stage1DraftIdea.tsx', gateType: 'none', chunk: 'THE_TRUTH' }
{ stageNumber: 2, stageName: 'AI Review', componentPath: 'Stage2AIReview.tsx', gateType: 'none', chunk: 'THE_TRUTH' }
{ stageNumber: 3, stageName: 'Comprehensive Validation', componentPath: 'Stage3ComprehensiveValidation.tsx', gateType: 'kill', chunk: 'THE_TRUTH' }
{ stageNumber: 4, stageName: 'Competitive Intelligence', componentPath: 'Stage4CompetitiveIntelligence.tsx', gateType: 'none', chunk: 'THE_TRUTH' }
{ stageNumber: 5, stageName: 'Profitability Forecasting', componentPath: 'Stage5ProfitabilityForecasting.tsx', gateType: 'kill', chunk: 'THE_TRUTH' }
```

---

## Source Code

### Stage 1: Draft Idea (124 LOC)
**File**: `Stage1DraftIdea.tsx`
**Backend**: `stage-01-draft-idea.js`
**Purpose**: Show venture seed text, initial idea summary, and creation metadata. Falls back to venture-level data when advisory data hasn't been generated yet.

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
          {/* Venture-level fallback when advisory data not yet populated */}
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

### Stage 2: AI Review (176 LOC)
**File**: `Stage2AIReview.tsx`
**Backend**: `stage-02-ai-review.js`
**Purpose**: Show AI feedback score, strengths, weaknesses, recommendation. Displays venture context while review is pending.

```tsx
/**
 * Stage2AIReview — AI Review stage renderer (Stage 2)
 * Shows AI feedback scores, strengths, weaknesses, and recommendation.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ThumbsUp, ThumbsDown, Star, Loader2 } from "lucide-react";
import type { StageRendererProps } from "@/components/ventures/stages/StageRendererProps";
import { AdvisoryDataPanel } from "./shared/AdvisoryDataPanel";
import { ArtifactListPanel } from "./shared/ArtifactListPanel";

export default function Stage2AIReview({
  stageData, venture, className,
}: StageRendererProps) {
  const ad = stageData.advisoryData;
  const overallScore = ad?.overall_score as number | undefined;
  const strengths = ad?.strengths as string[] | undefined;
  const weaknesses = ad?.weaknesses as string[] | undefined;
  const recommendation = ad?.recommendation as string | undefined;

  const hasReviewData = overallScore != null || recommendation || strengths?.length || weaknesses?.length;
  const description = venture.description;
  const targetMarket = venture.targetMarket;
  const stageZero = venture.metadata?.stage_zero as Record<string, unknown> | undefined;
  const solution = stageZero?.solution as string | undefined;
  const hasVentureContext = description || targetMarket || solution;

  if (!hasReviewData && !hasVentureContext) {
    return (
      <div className={`flex flex-col items-center justify-center py-12 text-muted-foreground ${className ?? ""}`}>
        <Loader2 className="h-8 w-8 animate-spin mb-3" />
        <p className="text-sm">Analyzing venture...</p>
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className ?? ""}`}>
      {hasReviewData && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              {venture.name}
              <Badge variant="secondary" className="text-xs ml-auto capitalize">{stageData.stageStatus}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {overallScore != null && (
              <div className="flex items-center gap-3">
                <Star className="w-5 h-5 text-yellow-500" /> {/* NOTE: No dark: variant */}
                <span className="text-2xl font-bold tabular-nums">{Math.round(overallScore)}</span>
                <span className="text-sm text-muted-foreground">/ 100</span>
              </div>
            )}
            {recommendation && (
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-sm">{recommendation}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!hasReviewData && hasVentureContext && (
        <Card>
          {/* Venture context shown while AI review is pending */}
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">AI review in progress...</span>
            </div>
            {description && <div><span className="text-xs font-medium text-muted-foreground">Problem</span><p className="text-sm mt-0.5">{description}</p></div>}
            {solution && <div><span className="text-xs font-medium text-muted-foreground">Proposed Solution</span><p className="text-sm mt-0.5">{String(solution)}</p></div>}
            {targetMarket && <div><span className="text-xs font-medium text-muted-foreground">Target Market</span><p className="text-sm mt-0.5">{targetMarket}</p></div>}
          </CardContent>
        </Card>
      )}

      {(strengths?.length || weaknesses?.length) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {strengths && strengths.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ThumbsUp className="w-4 h-4 text-green-500" /> {/* NOTE: No dark: variant */}
                  Strengths
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1">
                  {strengths.map((s, i) => (
                    <li key={i} className="text-sm flex items-start gap-2">
                      <span className="text-green-500 mt-1">+</span> {/* NOTE: No dark: variant */}
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          {weaknesses && weaknesses.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ThumbsDown className="w-4 h-4 text-red-500" /> {/* NOTE: No dark: variant */}
                  Weaknesses
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1">
                  {weaknesses.map((w, i) => (
                    <li key={i} className="text-sm flex items-start gap-2">
                      <span className="text-red-500 mt-1">-</span> {/* NOTE: No dark: variant */}
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <AdvisoryDataPanel data={ad} title="Review Details" exclude={["overall_score", "strengths", "weaknesses", "recommendation"]} />
      <ArtifactListPanel artifacts={stageData.artifacts} />
    </div>
  );
}
```

### Stage 3: Comprehensive Validation — Kill Gate (490 LOC)
**File**: `Stage3ComprehensiveValidation.tsx`
**Backend**: `stage-03-comprehensive-validation.js`
**Purpose**: Kill gate with 3-way decision (PASS/REVISE/KILL). Three-column layout: Metrics | Market Fit + Risks | Go Conditions. Includes animated validation progress view shown during processing.

```tsx
// Key excerpts — full file is 490 LOC

// 7 evaluation metrics from backend
const METRIC_LABELS: Record<string, string> = {
  marketFit: "Market Fit", customerNeed: "Customer Need", momentum: "Momentum",
  revenuePotential: "Revenue Potential", competitiveBarrier: "Competitive Barrier",
  executionFeasibility: "Execution Feasibility", designQuality: "Design Quality",
};

// 3-way decision derivation
function deriveDecision(score: number | null): "PASS" | "REVISE" | "KILL" | null {
  if (score == null) return null;
  if (score >= 70) return "PASS";
  if (score >= 50) return "REVISE";
  return "KILL";
}

// Decision banner styles with dark mode
function getDecisionBannerStyle(decision: GateDecision3Way) {
  switch (decision) {
    case "PASS":  return "bg-green-600/10 border-green-600/30 text-green-700 dark:text-green-400";
    case "REVISE": return "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400";
    case "KILL":  return "bg-red-600/10 border-red-600/30 text-red-700 dark:text-red-400";
  }
}

// Main component renders:
// 1. Decision banner (PASS/REVISE/KILL with score and rationale)
// 2. Three-column grid: Metrics | Market Fit + Risks | Go Conditions
// 3. Evidence Brief (collapsible)
// 4. MetricBar helper (progress bar with threshold marker at 70%)

// ValidationProgressView (shown during processing):
// 9-step animated checklist with 4-second intervals per step
// Steps: 7 metric evaluations + "Compiling risk factors" + "Generating kill gate decision"

// MetricBar helper:
// Green (>=70), Amber (>=50), Red (<50) with threshold line at 70%
```

### Stage 4: Competitive Intelligence (346 LOC)
**File**: `Stage4CompetitiveIntelligence.tsx`
**Backend**: `stage-04-competitive-landscape.js`
**Purpose**: Table view of competitors with expandable SWOT rows, market density banner.

```tsx
// Key excerpts — full file is 346 LOC

// Color maps (all with dark: variants)
const THREAT_COLORS = { H: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", M: "...", L: "..." };
const DENSITY_BANNER = { high: "bg-red-600/10 ... dark:text-red-400", medium: "...", low: "..." };
const DENSITY_BADGE = { high: { variant: "destructive" }, medium: { variant: "secondary" }, low: { variant: "default" } };

// Competitor data normalization from untyped advisory data
function normalizeCompetitor(raw: unknown): Competitor {
  if (typeof raw === "string") return { name: raw };
  const c = raw as Record<string, unknown>;
  return { name: c?.name, position: c?.position, threat: c?.threat, pricingModel: c?.pricingModel,
           strengths: Array.isArray(c?.strengths) ? c.strengths : [],
           weaknesses: Array.isArray(c?.weaknesses) ? c.weaknesses : [],
           swot: c?.swot && typeof c.swot === "object" ? { /* normalized */ } : undefined };
}

// CompetitorRow — expandable table row with SWOT quadrant
// SwotQuadrant — 4-color grid (green/red/blue/amber) with dark: variants

// Main component renders:
// 1. Market density banner (verdict-first)
// 2. Competitor table (with expandable SWOT)
// 3. Collapsible advisory details
// ADVISORY_EXCLUDE: ["competitors", "stage5Handoff", "fourBuckets", "usage", "llmFallbackCount"]
```

### Stage 5: Profitability Forecasting — Kill Gate (436 LOC)
**File**: `Stage5ProfitabilityForecasting.tsx`
**Backend**: `stage-05-financial-model.js`
**Purpose**: Financial viability kill gate with P&L table, unit economics, ROI scenarios, and assumptions.

```tsx
// Key excerpts — full file is 436 LOC

type GateDecision = "pass" | "conditional_pass" | "kill";

// Decision banner styles — matches Stage 3 pattern (with dark: variants)
function getDecisionBannerStyle(decision: GateDecision) {
  switch (decision) {
    case "pass":             return "bg-green-600/10 border-green-600/30 text-green-700 dark:text-green-400";
    case "conditional_pass": return "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400";
    case "kill":             return "bg-red-600/10 border-red-600/30 text-red-700 dark:text-red-400";
  }
}

// Formatting helpers
function formatCurrency(value: number | null | undefined): string { /* $1.2M / $50K / $123 */ }
function formatPercent(value: number | null | undefined): string { /* 85% */ }
function formatRoi(value: number | null | undefined): string { /* 120% */ }

// Main component renders:
// 1. Decision banner (pass/conditional_pass/kill with ROI, break-even, reasons, remediation route)
// 2. ROI Scenarios card (Pessimistic/Base/Optimistic — red for negative, green for positive)
// 3. Two-column layout:
//    LEFT: 3-Year P&L table (Revenue, COGS, OpEx, Gross Profit, Net Profit) + Unit Economics (CAC, LTV, ratio, payback, churn, margin)
//    RIGHT: Assumptions (collapsible) + Reasons (always visible)
// 4. Collapsible advisory details
// PLCell helper — red text for negative values
```

---

## Evaluation Instructions

### Per-Stage Analysis
For each of the 5 stages, evaluate:

1. **Data handling correctness**: Does the renderer safely extract and normalize advisory data? Are there edge cases that could crash (null arrays, missing keys, unexpected types)?
2. **Visual hierarchy**: Is the most important information (decision, score, key metrics) displayed first? Is the information density appropriate?
3. **Layout responsiveness**: Does the layout work on mobile/tablet/desktop? Are grid breakpoints sensible?
4. **Gate implementation** (Stages 3, 5): Is the 3-way decision logic correct? Are the threshold values appropriate? Is the gate banner prominent enough?
5. **Loading/empty states**: What does the user see while data is being generated? Is the fallback UX helpful?
6. **Accessibility**: Color contrast, screen reader support, keyboard navigation.

### Cross-Stage Analysis
Evaluate the group as a whole:

1. **Progressive complexity**: Do stages scale in visual complexity proportional to their data density? (Stage 1 is the simplest venture, Stage 5 involves P&L tables.)
2. **Pattern consistency**: Do similar concepts (collapsible sections, badges, metric cards) look and behave the same across stages?
3. **Transition quality**: The user moves from compact header (stages 1-3) to full 5-tab layout (stages 4-5). Is this transition smooth?
4. **Information flow**: Does each stage build on the previous one? Can a user understand the venture's evolving story by progressing through stages 1→5?
5. **Gate philosophy**: Two kill gates in 5 stages. Is this too aggressive for early-stage ventures? Should Stage 3 be a softer checkpoint?

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
