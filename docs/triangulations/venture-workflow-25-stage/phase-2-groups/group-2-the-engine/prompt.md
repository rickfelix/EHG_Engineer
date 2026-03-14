# Phase 2 Deep Dive: Group 2 — THE_ENGINE (Stages 6-9)

## Context from Phase 1

This is Phase 2 of a hierarchical triangulation review of a 25-stage venture workflow. Phase 1 assessed all 25 stages at a high level across 6 groups. This prompt focuses on **Group 2: THE_ENGINE (Stages 6-9)**, which covers the business modeling phase from risk evaluation through exit strategy.

### Phase 1 Consensus for Group 2
- **Logic & Flow: 8/10** — Business modeling flow (Risk → Revenue → BMC → Exit) is a solid, standard approach.
- **Functionality: 8/10** — No gates approach correctly fits the informational/structuring nature of these stages. Stage 9's reality gate renders but isn't enforced.
- **UI/Visual Design: 7/10** — Stage 8 BMC canvas with CSS Grid is a design highlight. Consistent visual patterns across all 4 stages.
- **UX/Workflow: 7/10** — Standardized 5-tab interface provides predictability. Each stage has a clear verdict-first banner.
- **Architecture: 7/10** — Chunk names already use Vision V2 (`THE_ENGINE`). No shared components used — each stage reimplements collapsible advisory details pattern.

### Phase 1 Issues to Investigate
1. **Stage 9 reality gate formalization**: Stage 9 renders a PASS/BLOCKED gate banner but `venture-workflow.ts` sets `gateType: 'none'`. Should this be formalized as an enforced gate (Phase 2→3 transition) or remain informational?
2. **BMC canvas mobile experience**: Desktop uses a 5-column CSS Grid with named grid areas matching the traditional Osterwalder layout. Mobile falls back to stacked 1/2-column. Does the fallback preserve enough spatial context?
3. **`formatCurrency` duplication**: Both Stage 7 and Stage 5 (Group 1) define identical `formatCurrency` helper functions. Stage 9 has its own copy too.
4. **No shared component usage**: Unlike Stages 1-2 which use `AdvisoryDataPanel` and `ArtifactListPanel`, all 4 Group 2 stages reimplement collapsible advisory details locally.
5. **Color map duplication**: Status colors, score badge colors, and banner patterns are redefined per-stage rather than shared.

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
- All Group 2 stages (6-9) use the full 5-tab layout

### Gate System
- **Stage 6**: No gate (`gateType: 'none'`)
- **Stage 7**: No gate (`gateType: 'none'`)
- **Stage 8**: No gate (`gateType: 'none'`)
- **Stage 9**: No gate (`gateType: 'none'`) — BUT renders a PASS/BLOCKED reality gate banner (phantom gate)

### Config
All 4 stages configured with `chunk: 'THE_ENGINE'` in `venture-workflow.ts`:
```typescript
{ stageNumber: 6, stageName: 'Risk Evaluation', componentPath: 'Stage6RiskEvaluation.tsx', gateType: 'none', chunk: 'THE_ENGINE' }
{ stageNumber: 7, stageName: 'Revenue Architecture', componentPath: 'Stage7RevenueArchitecture.tsx', gateType: 'none', chunk: 'THE_ENGINE' }
{ stageNumber: 8, stageName: 'Business Model Canvas', componentPath: 'Stage8BusinessModelCanvas.tsx', gateType: 'none', chunk: 'THE_ENGINE' }
{ stageNumber: 9, stageName: 'Exit Strategy', componentPath: 'Stage9ExitStrategy.tsx', gateType: 'none', chunk: 'THE_ENGINE' }
```

### Component Names vs Content
Unlike Groups 4-6 (which have severe naming mismatches), Group 2 component names **match** their content:
- Stage6**RiskEvaluation** → Shows risk register ✓
- Stage7**RevenueArchitecture** → Shows pricing/revenue ✓
- Stage8**BusinessModelCanvas** → Shows BMC ✓
- Stage9**ExitStrategy** → Shows exit strategy ✓

---

## Source Code

### Stage 6: Risk Evaluation (411 LOC)
**File**: `Stage6RiskEvaluation.tsx`
**Backend**: `stage-06-risk-matrix.js`
**Purpose**: Risk register with summary banner, 4 metric cards, sortable risk table with expandable mitigations, category distribution bars.

```tsx
/**
 * Stage6RiskEvaluation — Risk Evaluation renderer (Stage 6)
 *
 * Analytics/Scoring View template: Summary banner, 2x2 metric cards,
 * risk table with expandable mitigations, category breakdown.
 * Data shape matches backend: stage-06-risk-matrix.js
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { StageRendererProps } from "@/components/ventures/stages/StageRendererProps";

// Backend data shape from stage-06-risk-matrix.js
interface Risk {
  id?: string;
  category?: string;
  description?: string;
  severity?: number; // 1-5
  probability?: number; // 1-5
  impact?: number; // 1-5
  score?: number; // severity × probability × impact
  mitigation?: string;
  owner?: string;
  status?: string; // open, mitigated, accepted, closed
  review_date?: string;
  source_stage?: number;
}

// Score thresholds for color coding
const SCORE_BANNER: Record<string, string> = {
  critical: "bg-red-600/10 border-red-600/30 text-red-700 dark:text-red-400",
  high: "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400",
  moderate: "bg-yellow-500/10 border-yellow-500/30 text-yellow-700 dark:text-yellow-400",
  low: "bg-green-600/10 border-green-600/30 text-green-700 dark:text-green-400",
};

const SCORE_BADGE: Record<string, { variant: "default" | "secondary" | "destructive"; className: string }> = {
  critical: { variant: "destructive", className: "" },
  high: { variant: "secondary", className: "bg-amber-500 text-white hover:bg-amber-600" },
  moderate: { variant: "secondary", className: "bg-yellow-500 text-white hover:bg-yellow-600" },
  low: { variant: "default", className: "bg-green-600 hover:bg-green-700" },
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  mitigated: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  accepted: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  closed: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
};

function getRiskLevel(normalizedScore: number | undefined): string {
  if (normalizedScore == null) return "moderate";
  if (normalizedScore >= 8) return "critical";
  if (normalizedScore >= 6) return "high";
  if (normalizedScore >= 4) return "moderate";
  return "low";
}

function getScoreBadgeColor(score: number): string {
  if (score >= 75) return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
  if (score >= 50) return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
  if (score >= 25) return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
  return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
}

function normalizeRisk(raw: unknown): Risk {
  if (typeof raw === "string") return { description: raw };
  const r = raw as Record<string, unknown>;
  return {
    id: (r?.id as string) || undefined,
    category: (r?.category as string) || "Unknown",
    description: (r?.description as string) || "No description",
    severity: typeof r?.severity === "number" ? r.severity : undefined,
    probability: typeof r?.probability === "number" ? r.probability : undefined,
    impact: typeof r?.impact === "number" ? r.impact : undefined,
    score: typeof r?.score === "number" ? r.score : undefined,
    mitigation: (r?.mitigation as string) || undefined,
    owner: (r?.owner as string) || undefined,
    status: (r?.status as string) || "open",
    review_date: (r?.review_date as string) || undefined,
    source_stage: typeof r?.source_stage === "number" ? r.source_stage : undefined,
  };
}

function RiskRow({ risk }: { risk: Risk }) {
  const [expanded, setExpanded] = useState(false);
  const hasMitigation = !!risk.mitigation;
  const score = risk.score ?? 0;

  return (
    <>
      <TableRow
        className={hasMitigation ? "cursor-pointer" : ""}
        onClick={() => hasMitigation && setExpanded(!expanded)}
      >
        <TableCell className="font-medium text-xs max-w-[250px]">
          <div className="flex items-center gap-1.5">
            {hasMitigation && (
              expanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                       : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            )}
            <span className="truncate">{risk.description}</span>
          </div>
        </TableCell>
        <TableCell>
          {risk.category && <Badge variant="outline" className="text-[10px]">{risk.category}</Badge>}
        </TableCell>
        <TableCell className="text-center">
          <Badge className={`text-[10px] ${getScoreBadgeColor(score)}`}>{score}</Badge>
        </TableCell>
        <TableCell className="text-center text-xs text-muted-foreground">{risk.severity ?? "—"}</TableCell>
        <TableCell className="text-center text-xs text-muted-foreground">{risk.probability ?? "—"}</TableCell>
        <TableCell className="text-center text-xs text-muted-foreground">{risk.impact ?? "—"}</TableCell>
        <TableCell>
          {risk.status && (
            <Badge className={`text-[10px] capitalize ${STATUS_COLORS[risk.status] ?? ""}`}>{risk.status}</Badge>
          )}
        </TableCell>
      </TableRow>
      {expanded && hasMitigation && (
        <TableRow className="bg-muted/20 hover:bg-muted/20">
          <TableCell colSpan={7} className="py-2 px-4">
            <div className="space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Mitigation Strategy
              </span>
              <p className="text-xs text-muted-foreground">{risk.mitigation}</p>
              <div className="flex gap-4 text-[10px] text-muted-foreground/70 mt-1">
                {risk.owner && <span>Owner: {risk.owner}</span>}
                {risk.source_stage != null && <span>Source: Stage {risk.source_stage}</span>}
                {risk.review_date && <span>Review: {risk.review_date}</span>}
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export default function Stage6RiskEvaluation({ stageData, className }: StageRendererProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const ad = stageData.advisoryData;

  const rawRisks = ad?.risks;
  const risks: Risk[] = Array.isArray(rawRisks) ? rawRisks.map(normalizeRisk) : [];
  const sortedRisks = [...risks].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  const aggregateRiskScore = ad?.aggregate_risk_score as number | undefined;
  const normalizedRiskScore = ad?.normalized_risk_score as number | undefined;
  const highestRiskFactor = ad?.highest_risk_factor as string | undefined;
  const mitigationCoverage = ad?.mitigation_coverage_pct as number | undefined;
  const totalRisks = ad?.totalRisks as number | undefined ?? risks.length;
  const categoryCoverage = ad?.categoryCoverage as number | undefined;
  const risksByCategory = ad?.risksByCategory as Record<string, number> | undefined;

  const criticalCount = risks.filter((r) => (r.score ?? 0) >= 75).length;
  const mitigatedCount = risks.filter((r) => r.status === "mitigated" || r.status === "closed").length;
  const riskLevel = getRiskLevel(normalizedRiskScore);

  const ADVISORY_EXCLUDE = [
    "risks", "aggregate_risk_score", "normalized_risk_score", "highest_risk_factor",
    "mitigation_coverage_pct", "totalRisks", "categoryCoverage", "risksByCategory",
    "fourBuckets", "usage", "llmFallbackCount",
  ];
  const advisoryEntries = ad ? Object.entries(ad).filter(([key]) => !ADVISORY_EXCLUDE.includes(key)) : [];
  const hasAdvisoryDetails = advisoryEntries.length > 0;
  const hasRisks = risks.length > 0;
  const hasBanner = hasRisks || aggregateRiskScore != null;

  return (
    <div className={`space-y-3 ${className ?? ""}`}>
      {/* Summary Banner — verdict first, like Stages 3-5 */}
      {hasBanner && (
        <div className={`flex flex-col gap-2 p-4 rounded-lg border ${SCORE_BANNER[riskLevel]}`}>
          <div className="flex items-center gap-3 flex-wrap">
            <Badge variant={SCORE_BADGE[riskLevel].variant}
              className={`uppercase text-sm px-3 py-1 ${SCORE_BADGE[riskLevel].className}`}>
              {riskLevel}
            </Badge>
            <span className="text-sm">{totalRisks} risk{totalRisks !== 1 ? "s" : ""} identified</span>
            {criticalCount > 0 && <span className="text-sm font-medium">{criticalCount} critical</span>}
            {mitigatedCount > 0 && <span className="text-sm opacity-70">{mitigatedCount} mitigated</span>}
          </div>
          <div className="flex items-center gap-3 flex-wrap text-sm opacity-90">
            {aggregateRiskScore != null && <span>Aggregate Score: {aggregateRiskScore}</span>}
            {normalizedRiskScore != null && <span>Normalized: {normalizedRiskScore.toFixed(1)}/10</span>}
            {highestRiskFactor && <><span className="opacity-50">·</span><span>Highest: {highestRiskFactor}</span></>}
            {mitigationCoverage != null && <><span className="opacity-50">·</span><span>Mitigation Coverage: {mitigationCoverage}%</span></>}
          </div>
        </div>
      )}

      {/* Metric Cards — 4-column grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Overall Risk Score, Total Risks, Mitigated, Critical (Score ≥75) */}
        {/* Each card: text-[10px] label + text-2xl value */}
      </div>

      {/* Risk Table — sorted by score descending (worst first) */}
      {/* 7-column table: Description | Category | Score | Sev | Prob | Impact | Status */}
      {/* Each row expandable to show mitigation strategy, owner, source stage, review date */}

      {/* Category Breakdown — horizontal bar chart showing distribution */}
      {/* Only renders if risksByCategory data exists */}

      {/* Full Advisory Details — collapsed by default (same pattern as all stages) */}
    </div>
  );
}
```

### Stage 7: Revenue Architecture (358 LOC)
**File**: `Stage7RevenueArchitecture.tsx`
**Backend**: `stage-07-pricing-strategy.js`
**Purpose**: Pricing strategy with positioning banner (premium/parity/discount), metric cards, pricing tier cards, unit economics table, and rationale.

```tsx
/**
 * Stage7RevenueArchitecture — Revenue Architecture renderer (Stage 7)
 *
 * Analytics/Scoring View template: Summary banner with positioning,
 * metric cards (4-col), pricing tier cards, unit economics table,
 * collapsible advisory details.
 * Data shape matches backend: stage-07-pricing-strategy.js
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import type { StageRendererProps } from "@/components/ventures/stages/StageRendererProps";

interface PricingTier {
  name?: string;
  price?: number;
  billing_period?: string;
  target_segment?: string;
  included_units?: string;
}

interface PriceAnchor {
  competitorAvg?: number;
  proposedPrice?: number;
  positioning?: "premium" | "parity" | "discount";
}

const POSITIONING_BANNER: Record<string, string> = {
  premium: "bg-purple-600/10 border-purple-600/30 text-purple-700 dark:text-purple-400",
  parity: "bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-400",
  discount: "bg-green-600/10 border-green-600/30 text-green-700 dark:text-green-400",
};

const POSITIONING_BADGE: Record<string, { variant: "default" | "secondary" | "destructive"; className: string }> = {
  premium: { variant: "default", className: "bg-purple-600 hover:bg-purple-700" },
  parity: { variant: "default", className: "bg-blue-600 hover:bg-blue-700" },
  discount: { variant: "default", className: "bg-green-600 hover:bg-green-700" },
};

const MODEL_LABELS: Record<string, string> = {
  subscription: "Subscription", usage_based: "Usage Based", tiered: "Tiered",
  freemium: "Freemium", enterprise: "Enterprise", marketplace: "Marketplace",
};

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${value < 0 ? "-" : ""}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${value < 0 ? "-" : ""}$${(abs / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

function normalizeTier(raw: unknown): PricingTier {
  if (typeof raw === "string") return { name: raw };
  const t = raw as Record<string, unknown>;
  return {
    name: (t?.name as string) || "Standard",
    price: typeof t?.price === "number" ? t.price : undefined,
    billing_period: (t?.billing_period as string) || "monthly",
    target_segment: (t?.target_segment as string) || undefined,
    included_units: (t?.included_units as string) || undefined,
  };
}

export default function Stage7RevenueArchitecture({ stageData, className }: StageRendererProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const ad = stageData.advisoryData;

  const pricingModel = ad?.pricing_model as string | undefined;
  const primaryValueMetric = ad?.primaryValueMetric as string | undefined;
  const priceAnchor = ad?.priceAnchor as PriceAnchor | undefined;
  const rationale = ad?.rationale as string | undefined;

  // Unit economics — flat fields from backend
  const grossMarginPct = ad?.gross_margin_pct as number | undefined;
  const churnRateMonthly = ad?.churn_rate_monthly as number | undefined;
  const cac = ad?.cac as number | undefined;
  const arpa = ad?.arpa as number | undefined;

  // Derived metrics
  const ltv = arpa != null && grossMarginPct != null && churnRateMonthly != null && churnRateMonthly > 0
    ? (arpa * (grossMarginPct / 100)) / (churnRateMonthly / 100) : undefined;
  const ltvCacRatio = ltv != null && cac != null && cac > 0 ? ltv / cac : undefined;
  const projectedArr = arpa != null ? arpa * 12 : undefined;

  const rawTiers = ad?.tiers;
  const tiers: PricingTier[] = Array.isArray(rawTiers) ? rawTiers.map(normalizeTier) : [];
  const positioning = priceAnchor?.positioning || "parity";

  // Main component renders:
  // 1. Summary Banner — positioning verdict (premium/parity/discount) + pricing model + tier count
  // 2. Metric Cards (4-col): Projected ARR | Pricing Tiers | LTV:CAC Ratio | Gross Margin
  //    - LTV:CAC ratio highlighted amber when < 3:1
  // 3. Pricing Tier Cards — grid of tier cards with name, price, billing period, target segment
  // 4. Unit Economics — key-value table: ARPA, CAC, LTV, LTV:CAC, Gross Margin, Monthly Churn
  //    - Churn highlighted red when > 5%
  //    - LTV:CAC colored green (>=3) or amber (<3)
  // 5. Pricing Rationale — always visible when present
  // 6. Full Advisory Details — collapsed by default
}
```

### Stage 8: Business Model Canvas (276 LOC)
**File**: `Stage8BusinessModelCanvas.tsx`
**Backend**: `stage-08-bmc-generation.js`
**Purpose**: Traditional Osterwalder Business Model Canvas with 9-block grid layout. Desktop uses CSS Grid with named areas; mobile falls back to stacked layout.

```tsx
/**
 * Stage8BusinessModelCanvas — Business Model Canvas renderer (Stage 8)
 *
 * Structured Canvas View with BMC 3x3 grid layout matching the
 * traditional Business Model Canvas format.
 *
 * Grid layout (traditional Osterwalder BMC):
 * +----------+----------+----------+----------+----------+
 * |          |  Key     |          | Customer |          |
 * |  Key     | Activit. |  Value   | Relation.|  Cust.   |
 * | Partners |          |  Props   |          | Segments |
 * |          +----------+          +----------+          |
 * |          |  Key     | (center) | Channels |          |
 * |          | Resource |          |          |          |
 * +----------+----------+----------+----------+----------+
 * | Cost Structure      | Revenue Streams                |
 * +---------------------+--------------------------------+
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import type { StageRendererProps } from "@/components/ventures/stages/StageRendererProps";

interface BMCItem {
  text?: string;
  priority?: number; // 1=critical, 2=important, 3=nice-to-have
  evidence?: string;
}

interface BMCBlock { items?: BMCItem[]; }

const BMC_BLOCKS = [
  { key: "keyPartnerships", label: "Key Partners", gridArea: "partners" },
  { key: "keyActivities", label: "Key Activities", gridArea: "activities" },
  { key: "keyResources", label: "Key Resources", gridArea: "resources" },
  { key: "valuePropositions", label: "Value Propositions", gridArea: "value" },
  { key: "channels", label: "Channels", gridArea: "channels" },
  { key: "customerRelationships", label: "Customer Relationships", gridArea: "relations" },
  { key: "customerSegments", label: "Customer Segments", gridArea: "segments" },
  { key: "costStructure", label: "Cost Structure", gridArea: "costs" },
  { key: "revenueStreams", label: "Revenue Streams", gridArea: "revenue" },
];

const PRIORITY_COLORS: Record<number, string> = {
  1: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  2: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  3: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
};

function normalizeBlock(raw: unknown): BMCBlock {
  if (!raw || typeof raw !== "object") return { items: [] };
  const block = raw as Record<string, unknown>;
  const items = Array.isArray(block.items) ? block.items : [];
  return {
    items: items.map((item) => {
      if (typeof item === "string") return { text: item, priority: 2 };
      const i = item as Record<string, unknown>;
      return {
        text: (i?.text as string) || String(item),
        priority: typeof i?.priority === "number" ? i.priority : 2,
        evidence: (i?.evidence as string) || undefined,
      };
    }),
  };
}

function BMCCell({ label, block, className }: { label: string; block: BMCBlock; className?: string }) {
  const items = block.items || [];
  return (
    <div className={`border border-border rounded-lg p-3 space-y-2 ${className ?? ""}`}>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      {items.length > 0 ? (
        <ul className="space-y-1.5">
          {items.map((item, i) => (
            <li key={i} className="text-xs space-y-0.5">
              <div className="flex items-start gap-1.5">
                <span className="mt-0.5 shrink-0 text-muted-foreground/70">&bull;</span>
                <span>{item.text}</span>
                {item.priority != null && item.priority !== 2 && (
                  <Badge className={`text-[8px] px-1 py-0 ml-auto shrink-0 ${PRIORITY_COLORS[item.priority] ?? ""}`}>
                    {item.priority === 1 ? "Critical" : "Nice-to-have"}
                  </Badge>
                )}
              </div>
              {item.evidence && !item.evidence.startsWith("No evidence") && (
                <p className="text-[10px] text-muted-foreground/60 ml-3">{item.evidence}</p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground/50 italic">Not yet defined</p>
      )}
    </div>
  );
}

export default function Stage8BusinessModelCanvas({ stageData, className }: StageRendererProps) {
  // Main component renders:
  // 1. Summary Banner — "BMC" badge + blocks populated count + total items + critical count
  // 2. Desktop Canvas (lg:grid) — CSS Grid with named areas:
  //    gridTemplateColumns: 'repeat(5, 1fr)'
  //    gridTemplateAreas: partners|activities|value|relations|segments (row 1)
  //                       partners|resources|value|channels|segments (row 2)
  //                       costs|costs|costs|revenue|revenue (row 3)
  //    Color coding: Blue (infrastructure), Purple (value props), Emerald (customer-facing)
  // 3. Mobile/Tablet Fallback (lg:hidden) — stacked 1/2-column grid
  //    Value Propositions spans full width (md:col-span-2)
  //    Blocks arranged in pairs: Partners/Segments, Activities/Relations, etc.
  // 4. Full Advisory Details — collapsed by default
}
```

### Stage 9: Exit Strategy (401 LOC)
**File**: `Stage9ExitStrategy.tsx`
**Backend**: `stage-09-exit-strategy.js`
**Purpose**: Exit strategy with reality gate verdict, valuation estimates, exit paths with probability bars, target acquirers with fit scores, milestone timeline.

```tsx
/**
 * Stage9ExitStrategy — Exit Strategy renderer (Stage 9)
 *
 * Analytics/Scoring View: Summary banner with exit thesis + horizon,
 * valuation range card, exit paths with probability bars, target acquirers
 * with fit scores, milestone timeline, reality gate verdict,
 * collapsible advisory details.
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import type { StageRendererProps } from "@/components/ventures/stages/StageRendererProps";

interface ExitPath {
  type?: string; description?: string; probability_pct?: number;
}
interface TargetAcquirer {
  name?: string; rationale?: string; fit_score?: number; // 1-5
}
interface ValuationEstimate {
  method?: string; revenueBase?: number;
  multipleLow?: number; multipleBase?: number; multipleHigh?: number;
  estimatedRange?: { low?: number; base?: number; high?: number };
}
interface Milestone { date?: string; success_criteria?: string; }
interface RealityGate {
  pass?: boolean; rationale?: string; blockers?: string[]; required_next_actions?: string[];
}

const EXIT_TYPE_LABELS: Record<string, string> = {
  acquisition: "Acquisition", ipo: "IPO", merger: "Merger",
  mbo: "Management Buyout", liquidation: "Liquidation",
};

const FIT_SCORE_COLORS: Record<number, string> = {
  5: "bg-emerald-500", 4: "bg-emerald-400", 3: "bg-amber-400",
  2: "bg-orange-400", 1: "bg-red-400",
};

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(abs / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

// NOTE: This is the 3rd copy of formatCurrency (also in Stage 5 and Stage 7)

function normalizeExitPath(raw: unknown): ExitPath { /* string fallback + typed extraction */ }
function normalizeAcquirer(raw: unknown): TargetAcquirer { /* string fallback + typed extraction */ }

export default function Stage9ExitStrategy({ stageData, className }: StageRendererProps) {
  const ad = stageData.advisoryData;
  const exitThesis = ad?.exit_thesis as string | undefined;
  const exitHorizonMonths = ad?.exit_horizon_months as number | undefined;
  const exitPaths: ExitPath[] = /* normalized + sorted by probability desc */;
  const acquirers: TargetAcquirer[] = /* normalized + sorted by fit_score desc */;
  const valuation = ad?.valuationEstimate as ValuationEstimate | undefined;
  const milestones: Milestone[] = /* from ad?.milestones */;
  const realityGate = ad?.reality_gate as RealityGate | undefined;

  // Reality gate uses binary PASS/BLOCKED (not 3-way like kill gates)
  const gatePass = realityGate?.pass;
  const gateBannerClass = gatePass
    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
    : "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400";

  // Main component renders (in order):
  // 1. Reality Gate Banner — "Phase 2→3 Reality Gate" with PASS/BLOCKED badge
  //    Shows rationale and blockers list (if any)
  //    NOTE: This gate renders UI but is NOT enforced (gateType: 'none' in config)
  //    This makes it a "phantom gate" — visual only, no stage advancement control
  //
  // 2. Summary Banner — Exit thesis + primary path type + probability + horizon
  //    Purple theme (bg-purple-500/10)
  //
  // 3. Valuation Range Cards (4-col): Low | Base | High | Revenue Base
  //    Base valuation highlighted in purple
  //    Each shows multiple (e.g., "3.5x revenue")
  //
  // 4. Exit Paths — probability bars (purple fill, sorted highest first)
  //    Each path: type label, probability %, description
  //
  // 5. Target Acquirers — fit score using colored dot matrix (5 dots)
  //    Sorted by fit_score descending, includes rationale
  //    FIT_SCORE_COLORS: 5=emerald, 4=emerald-400, 3=amber, 2=orange, 1=red
  //
  // 6. Milestones — timeline with date badges + success criteria
  //
  // 7. Full Advisory Details — collapsed by default
}
```

---

## Evaluation Instructions

### Per-Stage Analysis
For each of the 4 stages, evaluate:

1. **Data handling correctness**: Does the renderer safely extract and normalize advisory data? Are there edge cases that could crash (null arrays, missing keys, unexpected types)?
2. **Visual hierarchy**: Is the most important information (verdict, score, key metrics) displayed first? Is the information density appropriate for the data type?
3. **Layout responsiveness**: Does the layout work on mobile/tablet/desktop? Are grid breakpoints sensible?
4. **Specialization quality**: Each stage has a distinct visualization paradigm (risk table, pricing tiers, BMC canvas, exit paths). How well does each paradigm serve its data?
5. **Loading/empty states**: What does the user see while data is being generated? Is the fallback UX helpful?
6. **Accessibility**: Color contrast, screen reader support, keyboard navigation.

### Cross-Stage Analysis
Evaluate the group as a whole:

1. **Business model coherence**: Risk → Revenue → BMC → Exit. Does this sequence tell a coherent business model story? Would a different ordering make more sense?
2. **Pattern consistency**: Do similar concepts (banners, metric cards, collapsible sections, color maps) look and behave the same across stages?
3. **Information flow**: Do later stages build on earlier ones? Does Stage 9's exit strategy reference Stage 7's revenue metrics or Stage 6's risk register?
4. **Stage 9 phantom gate**: Stage 9 renders a PASS/BLOCKED reality gate banner but it's not enforced by the stage-advance-worker. Is this appropriate for an informational phase-transition checkpoint, or does it create false trust in gate enforcement?
5. **Code duplication**: `formatCurrency`, collapsible advisory details, color maps, and normalization patterns are repeated across all 4 stages. Quantify the duplication and assess whether extraction to shared utilities is worthwhile.
6. **No gate philosophy**: Unlike Group 1 (two kill gates in 5 stages), Group 2 has zero enforced gates in 4 stages. Is this the right balance for business modeling stages, or should any stage act as a checkpoint?

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
