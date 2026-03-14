# Phase 2 Deep Dive: Group 4 — THE_BLUEPRINT (Stages 13-16)

## Context from Phase 1

This is Phase 2 of a hierarchical triangulation review of a 25-stage venture workflow. Phase 1 assessed all 25 stages at a high level across 6 groups. This prompt focuses on **Group 4: THE_BLUEPRINT (Stages 13-16)**, which covers the strategic planning phase from product roadmap through financial projections.

### Phase 1 Consensus for Group 4
- **Logic & Flow: 7/10** — The conceptual sequence (Roadmap → Architecture → Risks → Financials) is logical but the component names obscure it completely.
- **Functionality: 7/10** — Both gates (kill at 13, promotion at 16) work correctly. All 4 renderers function.
- **UI/Visual Design: 7/10** — Consistent visual patterns. Financial projections (Stage 16) and risk register (Stage 15) are well-designed.
- **UX/Workflow: 5/10** — Lowest UX score of any group. 3 of 4 stages have component names completely unrelated to their content. "SchemaFirewall" rendering financial projections is the most jarring example.
- **Architecture: 5/10** — Lowest architecture score. Gate nomenclature diverges between Stage 13 (pass/conditional_pass/kill) and Stage 16 (promote/conditional/hold). All 4 stages reimplement common patterns locally.

### Phase 1 Issues to Investigate
1. **All 4 naming mismatches**: TechStackInterrogation→Product Roadmap, DataModelArchitecture→Technical Architecture, EpicUserStoryBreakdown→Risk Register, SchemaFirewall→Financial Projections. How severe is the impact? What are the correct names?
2. **Gate nomenclature divergence**: Stage 13 uses pass/conditional_pass/kill (DECISION_BANNER). Stage 16 uses promote/conditional/hold (GATE_BANNER). Same concept, different constant names, different value strings.
3. **Financial projections placement**: Is Stage 16 (financial projections) correctly placed in THE_BLUEPRINT phase, or should it be in THE_ENGINE (alongside Stage 5's profitability forecasting and Stage 7's revenue architecture)?
4. **formatCurrency duplication**: Stage 16 has another copy of formatCurrency (also in Stages 5, 7, 9, 12).
5. **Kill gate at Stage 13 placement**: A kill gate at the product roadmap stage. Is this the right checkpoint for a go/no-go decision?

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
- Stages 1-3: Compact header (no tabs) — defined in BuildingMode.tsx
- Stages 4-25: Full 5-tab layout (Stage, Artifacts, Timeline, AI Insights, Settings)
- All Group 4 stages (13-16) use the full 5-tab layout

### Gate System
- **Stage 13**: Kill gate (`gateType: 'kill'`) — uses pass/conditional_pass/kill values with DECISION_BANNER/DECISION_BADGE constants
- **Stage 14**: No gate (`gateType: 'none'`)
- **Stage 15**: No gate (`gateType: 'none'`)
- **Stage 16**: Promotion gate (`gateType: 'promotion'`) — uses promote/conditional/hold values with GATE_BANNER/GATE_BADGE constants

### Config
All 4 stages with chunk: 'THE_BLUEPRINT':
```typescript
{ stageNumber: 13, stageName: 'Tech Stack Interrogation', componentPath: 'Stage13TechStackInterrogation.tsx', gateType: 'kill', chunk: 'THE_BLUEPRINT' }
{ stageNumber: 14, stageName: 'Data Model Architecture', componentPath: 'Stage14DataModelArchitecture.tsx', gateType: 'none', chunk: 'THE_BLUEPRINT' }
{ stageNumber: 15, stageName: 'Epic User Story Breakdown', componentPath: 'Stage15EpicUserStoryBreakdown.tsx', gateType: 'none', chunk: 'THE_BLUEPRINT' }
{ stageNumber: 16, stageName: 'Schema Firewall', componentPath: 'Stage16SchemaFirewall.tsx', gateType: 'promotion', chunk: 'THE_BLUEPRINT' }
```

### Component Names vs Content
ALL 4 stages have naming mismatches (worst group for this issue):
| Stage | Component Name | Actually Renders | Backend File | Match? |
|-------|---------------|-----------------|--------------|--------|
| 13 | TechStackInterrogation | Product Roadmap | stage-13-product-roadmap.js | NO |
| 14 | DataModelArchitecture | Technical Architecture | stage-14-technical-architecture.js | ~YES (close) |
| 15 | EpicUserStoryBreakdown | Risk Register | stage-15-risk-register.js | NO |
| 16 | SchemaFirewall | Financial Projections | stage-16-financial-projections.js | NO |

---

## Source Code

### Stage 13: Tech Stack Interrogation [NAMING MISMATCH → Product Roadmap] (324 LOC)
**File**: Stage13TechStackInterrogation.tsx
**Backend**: stage-13-product-roadmap.js
**Purpose**: Kill gate with product roadmap — vision statement, milestones grouped by now/next/later, phase timeline.

```tsx
/**
 * Stage13TechStackInterrogation — Product Roadmap renderer (Stage 13, kill gate)
 *
 * Kill gate banner with PASS/CONDITIONAL/KILL decision, vision statement,
 * metric cards (milestones, phases, timeline, priority breakdown),
 * milestones grouped by priority (now/next/later) with deliverables,
 * phases timeline, collapsible advisory details.
 * Data shape matches backend: stage-13-product-roadmap.js
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

// Backend data shape from stage-13-product-roadmap.js
interface Milestone {
  name?: string;
  date?: string;
  deliverables?: string[];
  dependencies?: string[];
  priority?: string; // now | next | later
}

interface Phase {
  name?: string;
  start_date?: string;
  end_date?: string;
}

const DECISION_BANNER: Record<string, string> = {
  pass: "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400",
  conditional_pass: "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400",
  kill: "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400",
};

const DECISION_BADGE: Record<string, string> = {
  pass: "bg-emerald-600 hover:bg-emerald-700",
  conditional_pass: "bg-amber-500 hover:bg-amber-600",
  kill: "bg-red-600 hover:bg-red-700",
};

const DECISION_LABELS: Record<string, string> = {
  pass: "PASS",
  conditional_pass: "CONDITIONAL",
  kill: "KILL",
};

const PRIORITY_COLORS: Record<string, string> = {
  now: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  next: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  later: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
};

export default function Stage13TechStackInterrogation({
  stageData,
  className,
}: StageRendererProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const ad = stageData.advisoryData;

  // Extract fields matching backend shape
  const visionStatement = ad?.vision_statement as string | undefined;
  const rawMilestones = ad?.milestones;
  const milestones: Milestone[] = Array.isArray(rawMilestones) ? rawMilestones : [];
  const rawPhases = ad?.phases;
  const phases: Phase[] = Array.isArray(rawPhases) ? rawPhases : [];
  const timelineMonths = ad?.timeline_months as number | undefined;
  const decision = ad?.decision as string | undefined;
  const reasons = ad?.reasons as string[] | undefined;
  const priorityCounts = ad?.priorityCounts as Record<string, number> | undefined;
  const totalMilestones = (ad?.totalMilestones as number) ?? milestones.length;
  const totalPhases = (ad?.totalPhases as number) ?? phases.length;

  // Group milestones by priority
  const grouped: Record<string, Milestone[]> = { now: [], next: [], later: [] };
  for (const m of milestones) {
    const p = m.priority || "later";
    if (!grouped[p]) grouped[p] = [];
    grouped[p].push(m);
  }

  const hasBanner = decision != null;

  // Filter advisory keys
  const ADVISORY_EXCLUDE = [
    "vision_statement", "milestones", "phases", "timeline_months",
    "milestone_count", "decision", "blockProgression", "reasons",
    "priorityCounts", "totalMilestones", "totalPhases",
    "fourBuckets", "usage", "llmFallbackCount",
  ];
  const advisoryEntries = ad
    ? Object.entries(ad).filter(([key]) => !ADVISORY_EXCLUDE.includes(key))
    : [];
  const hasAdvisoryDetails = advisoryEntries.length > 0;

  return (
    <div className={`space-y-3 ${className ?? ""}`}>
      {/* Kill Gate Decision Banner */}
      {hasBanner && (
        <div className={`flex flex-col gap-2 p-4 rounded-lg border ${DECISION_BANNER[decision!] ?? DECISION_BANNER.pass}`}>
          <div className="flex items-center gap-3 flex-wrap">
            <Badge
              variant="default"
              className={`uppercase text-sm px-3 py-1 ${DECISION_BADGE[decision!] ?? DECISION_BADGE.pass}`}
            >
              {DECISION_LABELS[decision!] ?? decision}
            </Badge>
            <span className="text-sm font-medium">Product Roadmap Kill Gate</span>
            {totalMilestones > 0 && (
              <>
                <span className="opacity-50">·</span>
                <span className="text-sm">{totalMilestones} milestones</span>
              </>
            )}
            {timelineMonths != null && (
              <>
                <span className="opacity-50">·</span>
                <span className="text-sm">{timelineMonths}-month timeline</span>
              </>
            )}
          </div>
          {reasons && reasons.length > 0 && (
            <ul className="space-y-1 mt-1">
              {reasons.map((r, i) => (
                <li key={i} className="text-xs flex items-start gap-1.5">
                  <span className="mt-0.5 shrink-0">•</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Vision Statement */}
      {visionStatement && (
        <div className="p-4 rounded-lg border bg-purple-500/10 border-purple-500/30">
          <p className="text-sm text-purple-700 dark:text-purple-400 italic">
            &ldquo;{visionStatement}&rdquo;
          </p>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Milestones
            </span>
            <p className="text-2xl font-bold mt-1">{totalMilestones}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Phases
            </span>
            <p className="text-2xl font-bold mt-1">{totalPhases}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Timeline
            </span>
            <p className="text-2xl font-bold mt-1">
              {timelineMonths != null ? `${timelineMonths}mo` : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Priority Mix
            </span>
            <div className="flex items-center gap-1 mt-2">
              {(["now", "next", "later"] as const).map((p) => (
                <Badge
                  key={p}
                  className={`text-[10px] px-1.5 py-0 ${PRIORITY_COLORS[p]}`}
                >
                  {p}: {priorityCounts?.[p] ?? grouped[p]?.length ?? 0}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Milestones grouped by priority */}
      {milestones.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Milestones</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {(["now", "next", "later"] as const).map((priority) => {
                const group = grouped[priority] || [];
                if (group.length === 0) return null;
                return (
                  <div key={priority} className="space-y-2">
                    <Badge className={`text-[10px] uppercase ${PRIORITY_COLORS[priority]}`}>
                      {priority} ({group.length})
                    </Badge>
                    {group.map((ms, i) => (
                      <div
                        key={i}
                        className="p-3 rounded-lg border bg-muted/20 space-y-1.5"
                      >
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">{ms.name}</span>
                          {ms.date && (
                            <Badge variant="outline" className="text-[10px]">
                              {ms.date}
                            </Badge>
                          )}
                        </div>
                        {ms.deliverables && ms.deliverables.length > 0 && (
                          <ul className="space-y-0.5">
                            {ms.deliverables.map((d, j) => (
                              <li key={j} className="text-xs text-muted-foreground flex items-start gap-1.5">
                                <span className="mt-0.5 shrink-0">•</span>
                                <span>{d}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {ms.dependencies && ms.dependencies.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {ms.dependencies.map((dep, j) => (
                              <Badge key={j} variant="outline" className="text-[10px] text-amber-600 dark:text-amber-400">
                                {dep}
                              </Badge>
                            ))}
                          </div>
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

      {/* Phases */}
      {phases.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Phases</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {phases.map((phase, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-sm border-b border-muted pb-2 last:border-0 last:pb-0"
                >
                  <span className="font-medium">{phase.name}</span>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {phase.start_date && <span>{phase.start_date}</span>}
                    {phase.start_date && phase.end_date && <span>→</span>}
                    {phase.end_date && <span>{phase.end_date}</span>}
                  </div>
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

### Stage 14: Data Model Architecture [APPROXIMATE MATCH → Technical Architecture] (396 LOC)
**File**: Stage14DataModelArchitecture.tsx
**Backend**: stage-14-technical-architecture.js
**Purpose**: 5-layer architecture stack, security overview, data entities with relationships, integration points.

```tsx
/**
 * Stage14DataModelArchitecture — Technical Architecture renderer (Stage 14)
 *
 * Architecture summary, 5-layer stack (presentation/api/business_logic/data/infrastructure),
 * security overview, data entities with relationships, integration points,
 * constraints, collapsible advisory details.
 * Data shape matches backend: stage-14-technical-architecture.js
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

interface Layer {
  technology?: string;
  components?: string[];
  rationale?: string;
}

interface DataEntity {
  name?: string;
  description?: string;
  relationships?: string[];
  estimatedVolume?: string;
}

interface IntegrationPoint {
  name?: string;
  source_layer?: string;
  target_layer?: string;
  protocol?: string;
}

interface Constraint {
  name?: string;
  description?: string;
  category?: string;
}

const LAYER_ORDER = ["presentation", "api", "business_logic", "data", "infrastructure"] as const;

const LAYER_COLORS: Record<string, string> = {
  presentation: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400",
  api: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  business_logic: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  data: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  infrastructure: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400",
};

const LAYER_LABELS: Record<string, string> = {
  presentation: "Presentation",
  api: "API",
  business_logic: "Business Logic",
  data: "Data",
  infrastructure: "Infrastructure",
};

const PROTOCOL_COLORS: Record<string, string> = {
  REST: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  GraphQL: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
  gRPC: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  WebSocket: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  SQL: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};

const CONSTRAINT_COLORS: Record<string, string> = {
  performance: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  security: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  compliance: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  operational: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400",
};

export default function Stage14DataModelArchitecture({
  stageData,
  className,
}: StageRendererProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const ad = stageData.advisoryData;

  const summary = ad?.architecture_summary as string | undefined;
  const rawLayers = ad?.layers as Record<string, Layer> | undefined;
  const security = ad?.security as { authStrategy?: string; dataClassification?: string; complianceRequirements?: string[] } | undefined;
  const rawEntities = ad?.dataEntities;
  const entities: DataEntity[] = Array.isArray(rawEntities) ? rawEntities : [];
  const rawIntegrations = ad?.integration_points;
  const integrations: IntegrationPoint[] = Array.isArray(rawIntegrations) ? rawIntegrations : [];
  const rawConstraints = ad?.constraints;
  const constraints: Constraint[] = Array.isArray(rawConstraints) ? rawConstraints : [];

  const layerCount = (ad?.layer_count as number) ?? 0;
  const totalComponents = (ad?.total_components as number) ?? 0;
  const allLayersDefined = ad?.all_layers_defined as boolean | undefined;
  const entityCount = (ad?.entity_count as number) ?? entities.length;

  // Filter advisory keys
  const ADVISORY_EXCLUDE = [
    "architecture_summary", "layers", "security", "dataEntities",
    "integration_points", "constraints", "layer_count", "total_components",
    "all_layers_defined", "entity_count", "fourBuckets", "usage", "llmFallbackCount",
  ];
  const advisoryEntries = ad
    ? Object.entries(ad).filter(([key]) => !ADVISORY_EXCLUDE.includes(key))
    : [];
  const hasAdvisoryDetails = advisoryEntries.length > 0;

  return (
    <div className={`space-y-3 ${className ?? ""}`}>
      {/* Architecture Summary */}
      {summary && (
        <div className="p-4 rounded-lg border bg-indigo-500/10 border-indigo-500/30">
          <p className="text-sm text-indigo-700 dark:text-indigo-400">
            {summary}
          </p>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Layers
            </span>
            <p className="text-2xl font-bold mt-1">{layerCount}/5</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Components
            </span>
            <p className="text-2xl font-bold mt-1">{totalComponents}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Entities
            </span>
            <p className="text-2xl font-bold mt-1">{entityCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Coverage
            </span>
            <p className="text-2xl font-bold mt-1">
              {allLayersDefined ? "Full" : "Partial"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Architecture Layers */}
      {rawLayers && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Architecture Layers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {LAYER_ORDER.map((layerKey) => {
                const layer = rawLayers[layerKey];
                if (!layer) return null;
                const isTBD = layer.technology === "TBD";
                return (
                  <div
                    key={layerKey}
                    className={`p-3 rounded-lg border space-y-2 ${isTBD ? "bg-muted/30 opacity-60" : "bg-muted/20"}`}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={`text-[10px] uppercase ${LAYER_COLORS[layerKey]}`}>
                        {LAYER_LABELS[layerKey]}
                      </Badge>
                      <span className="text-sm font-medium">{layer.technology}</span>
                    </div>
                    {layer.components && layer.components.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {layer.components.map((comp, j) => (
                          <Badge key={j} variant="outline" className="text-[10px]">
                            {comp}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {layer.rationale && layer.rationale !== "to be determined" && (
                      <p className="text-xs text-muted-foreground">{layer.rationale}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Security Overview */}
      {security && (security.authStrategy || security.dataClassification) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Security</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {security.authStrategy && (
                <div className="flex justify-between text-sm border-b border-muted pb-2">
                  <span className="text-muted-foreground">Auth Strategy</span>
                  <span className="font-medium">{security.authStrategy}</span>
                </div>
              )}
              {security.dataClassification && (
                <div className="flex justify-between text-sm border-b border-muted pb-2">
                  <span className="text-muted-foreground">Data Classification</span>
                  <span className="font-medium">{security.dataClassification}</span>
                </div>
              )}
              {security.complianceRequirements && security.complianceRequirements.length > 0 && (
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Compliance</span>
                  <div className="flex flex-wrap gap-1">
                    {security.complianceRequirements.map((req, i) => (
                      <Badge key={i} variant="outline" className="text-[10px] text-red-600 dark:text-red-400">
                        {req}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Data Entities */}
      {entities.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Data Entities</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {entities.map((entity, i) => (
                <div
                  key={i}
                  className="p-3 rounded-lg border bg-muted/20 space-y-1.5"
                >
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{entity.name}</span>
                    {entity.estimatedVolume && (
                      <Badge variant="outline" className="text-[10px]">
                        {entity.estimatedVolume}
                      </Badge>
                    )}
                  </div>
                  {entity.description && (
                    <p className="text-xs text-muted-foreground">{entity.description}</p>
                  )}
                  {entity.relationships && entity.relationships.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {entity.relationships.map((rel, j) => (
                        <Badge key={j} variant="outline" className="text-[10px] text-blue-600 dark:text-blue-400">
                          {rel}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Integration Points */}
      {integrations.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Integration Points</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {integrations.map((ip, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-sm border-b border-muted pb-2 last:border-0 last:pb-0"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{ip.name}</span>
                    {ip.protocol && (
                      <Badge className={`text-[10px] ${PROTOCOL_COLORS[ip.protocol] ?? "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400"}`}>
                        {ip.protocol}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    {ip.source_layer && (
                      <Badge className={`text-[9px] px-1 py-0 ${LAYER_COLORS[ip.source_layer] ?? ""}`}>
                        {LAYER_LABELS[ip.source_layer] ?? ip.source_layer}
                      </Badge>
                    )}
                    {ip.source_layer && ip.target_layer && <span>→</span>}
                    {ip.target_layer && (
                      <Badge className={`text-[9px] px-1 py-0 ${LAYER_COLORS[ip.target_layer] ?? ""}`}>
                        {LAYER_LABELS[ip.target_layer] ?? ip.target_layer}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Constraints */}
      {constraints.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Constraints</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {constraints.map((c, i) => (
                <div
                  key={i}
                  className="p-3 rounded-lg border bg-muted/20 space-y-1"
                >
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium">{c.name}</span>
                    {c.category && (
                      <Badge className={`text-[10px] ${CONSTRAINT_COLORS[c.category] ?? CONSTRAINT_COLORS.operational}`}>
                        {c.category}
                      </Badge>
                    )}
                  </div>
                  {c.description && (
                    <p className="text-xs text-muted-foreground">{c.description}</p>
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

### Stage 15: Epic User Story Breakdown [NAMING MISMATCH → Risk Register] (306 LOC)
**File**: Stage15EpicUserStoryBreakdown.tsx
**Backend**: stage-15-risk-register.js
**Purpose**: Risk cards with severity/priority badges, severity breakdown bars, mitigation/contingency plans, financial contract.

```tsx
/**
 * Stage15EpicUserStoryBreakdown — Risk Register renderer (Stage 15)
 *
 * Risk cards with severity/priority badges, severity breakdown metrics,
 * mitigation and contingency plans, budget coherence, financial contract,
 * collapsible advisory details.
 * Data shape matches backend: stage-15-risk-register.js
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

interface Risk {
  title?: string;
  description?: string;
  owner?: string;
  severity?: string;
  priority?: string;
  phaseRef?: string;
  mitigationPlan?: string;
  contingencyPlan?: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  low: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
};

const SEVERITY_BAR: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-amber-500",
  low: "bg-green-500",
};

const PRIORITY_COLORS: Record<string, string> = {
  immediate: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  short_term: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  long_term: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
};

const PRIORITY_LABELS: Record<string, string> = {
  immediate: "Immediate",
  short_term: "Short-term",
  long_term: "Long-term",
};

export default function Stage15EpicUserStoryBreakdown({
  stageData,
  className,
}: StageRendererProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const ad = stageData.advisoryData;

  const rawRisks = ad?.risks;
  const risks: Risk[] = Array.isArray(rawRisks) ? rawRisks : [];
  const totalRisks = (ad?.total_risks as number) ?? risks.length;
  const severityBreakdown = ad?.severity_breakdown as Record<string, number> | undefined;
  const budgetCoherence = ad?.budget_coherence as { aligned?: boolean; notes?: string } | undefined;
  const financialContract = ad?.financialContract as { cac?: number; ltv?: number; capitalRequired?: number } | null;

  // Compute severity breakdown from risks if not provided
  const breakdown = severityBreakdown ?? {
    critical: risks.filter((r) => r.severity === "critical").length,
    high: risks.filter((r) => r.severity === "high").length,
    medium: risks.filter((r) => r.severity === "medium").length,
    low: risks.filter((r) => r.severity === "low").length,
  };
  const maxSeverityCount = Math.max(...Object.values(breakdown), 1);

  // Filter advisory keys
  const ADVISORY_EXCLUDE = [
    "risks", "total_risks", "severity_breakdown", "budget_coherence",
    "financialContract", "fourBuckets", "usage", "llmFallbackCount",
  ];
  const advisoryEntries = ad
    ? Object.entries(ad).filter(([key]) => !ADVISORY_EXCLUDE.includes(key))
    : [];
  const hasAdvisoryDetails = advisoryEntries.length > 0;

  return (
    <div className={`space-y-3 ${className ?? ""}`}>
      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Total Risks
            </span>
            <p className="text-2xl font-bold mt-1">{totalRisks}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Critical
            </span>
            <p className={`text-2xl font-bold mt-1 ${breakdown.critical > 0 ? "text-red-600 dark:text-red-400" : ""}`}>
              {breakdown.critical}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              High
            </span>
            <p className={`text-2xl font-bold mt-1 ${breakdown.high > 0 ? "text-orange-600 dark:text-orange-400" : ""}`}>
              {breakdown.high}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Budget
            </span>
            <p className="text-2xl font-bold mt-1">
              {budgetCoherence?.aligned ? "Aligned" : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Severity Breakdown Bar Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Severity Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {(["critical", "high", "medium", "low"] as const).map((sev) => (
              <div key={sev} className="flex items-center gap-3">
                <Badge className={`text-[10px] w-16 justify-center uppercase ${SEVERITY_COLORS[sev]}`}>
                  {sev}
                </Badge>
                <div className="flex-1 h-5 bg-muted/30 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${SEVERITY_BAR[sev]}`}
                    style={{ width: `${(breakdown[sev] / maxSeverityCount) * 100}%` }}
                  />
                </div>
                <span className="text-sm font-medium w-6 text-right">{breakdown[sev]}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Risk Cards */}
      {risks.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Risk Register</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {risks.map((risk, i) => (
                <div
                  key={i}
                  className="p-3 rounded-lg border bg-muted/20 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium flex-1">{risk.title}</span>
                    <div className="flex gap-1 shrink-0">
                      {risk.severity && (
                        <Badge className={`text-[10px] uppercase ${SEVERITY_COLORS[risk.severity] ?? SEVERITY_COLORS.medium}`}>
                          {risk.severity}
                        </Badge>
                      )}
                      {risk.priority && (
                        <Badge className={`text-[10px] ${PRIORITY_COLORS[risk.priority] ?? PRIORITY_COLORS.short_term}`}>
                          {PRIORITY_LABELS[risk.priority] ?? risk.priority}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {risk.description && (
                    <p className="text-xs text-muted-foreground">{risk.description}</p>
                  )}

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    {risk.owner && (
                      <span className="text-muted-foreground">
                        Owner: <span className="font-medium text-foreground">{risk.owner}</span>
                      </span>
                    )}
                    {risk.phaseRef && (
                      <span className="text-muted-foreground">
                        Phase: <span className="font-medium text-foreground">{risk.phaseRef}</span>
                      </span>
                    )}
                  </div>

                  {risk.mitigationPlan && (
                    <div className="text-xs p-2 rounded bg-emerald-500/10 border border-emerald-500/20">
                      <span className="font-semibold text-emerald-700 dark:text-emerald-400">Mitigation: </span>
                      <span className="text-emerald-700 dark:text-emerald-400">{risk.mitigationPlan}</span>
                    </div>
                  )}

                  {risk.contingencyPlan && (
                    <div className="text-xs p-2 rounded bg-amber-500/10 border border-amber-500/20">
                      <span className="font-semibold text-amber-700 dark:text-amber-400">Contingency: </span>
                      <span className="text-amber-700 dark:text-amber-400">{risk.contingencyPlan}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Financial Contract */}
      {financialContract && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Financial Contract</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-2 rounded-lg bg-muted/20">
                <span className="text-[10px] font-semibold uppercase text-muted-foreground">CAC</span>
                <p className="text-lg font-bold mt-1">
                  {financialContract.cac != null ? `$${financialContract.cac.toLocaleString()}` : "—"}
                </p>
              </div>
              <div className="text-center p-2 rounded-lg bg-muted/20">
                <span className="text-[10px] font-semibold uppercase text-muted-foreground">LTV</span>
                <p className="text-lg font-bold mt-1">
                  {financialContract.ltv != null ? `$${financialContract.ltv.toLocaleString()}` : "—"}
                </p>
              </div>
              <div className="text-center p-2 rounded-lg bg-muted/20">
                <span className="text-[10px] font-semibold uppercase text-muted-foreground">Capital</span>
                <p className="text-lg font-bold mt-1">
                  {financialContract.capitalRequired != null ? `$${financialContract.capitalRequired.toLocaleString()}` : "—"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Budget Coherence Notes */}
      {budgetCoherence?.notes && (
        <div className="p-3 rounded-lg border bg-blue-500/10 border-blue-500/30">
          <p className="text-xs text-blue-700 dark:text-blue-400">{budgetCoherence.notes}</p>
        </div>
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

### Stage 16: Schema Firewall [NAMING MISMATCH → Financial Projections] (377 LOC)
**File**: Stage16SchemaFirewall.tsx
**Backend**: stage-16-financial-projections.js
**Purpose**: Promotion gate with P&L summary, revenue/cost projections, cash balance timeline, funding rounds, viability warnings.

```tsx
/**
 * Stage16SchemaFirewall — Financial Projections renderer (Stage 16, promotion gate)
 *
 * Promotion gate banner, P&L summary, revenue/cost projections chart,
 * cash balance timeline, funding rounds, viability warnings,
 * collapsible advisory details.
 * Data shape matches backend: stage-16-financial-projections.js
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

interface RevenueProjection {
  month?: number;
  revenue?: number;
  costs?: number;
  cost_breakdown?: {
    personnel?: number;
    infrastructure?: number;
    marketing?: number;
    other?: number;
  };
}

interface FundingRound {
  round_name?: string;
  target_amount?: number;
  target_date?: string;
}

interface CashBalance {
  month?: number;
  balance?: number;
}

const GATE_BANNER: Record<string, string> = {
  promote: "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400",
  conditional: "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400",
  hold: "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400",
};

const GATE_BADGE: Record<string, string> = {
  promote: "bg-emerald-600 hover:bg-emerald-700",
  conditional: "bg-amber-500 hover:bg-amber-600",
  hold: "bg-red-600 hover:bg-red-700",
};

function formatCurrency(val: number | undefined): string {
  if (val == null) return "—";
  if (Math.abs(val) >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (Math.abs(val) >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val.toLocaleString()}`;
}

export default function Stage16SchemaFirewall({
  stageData,
  className,
}: StageRendererProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const ad = stageData.advisoryData;

  const initialCapital = ad?.initial_capital as number | undefined;
  const burnRate = ad?.burn_rate as number | undefined;
  const rawProjections = ad?.revenue_projections;
  const projections: RevenueProjection[] = Array.isArray(rawProjections) ? rawProjections : [];
  const rawFunding = ad?.funding_rounds;
  const fundingRounds: FundingRound[] = Array.isArray(rawFunding) ? rawFunding : [];
  const rawCashBalance = ad?.cash_balance_end;
  const cashBalance: CashBalance[] = Array.isArray(rawCashBalance) ? rawCashBalance : [];
  const totalRevenue = ad?.total_projected_revenue as number | undefined;
  const totalCosts = ad?.total_projected_costs as number | undefined;
  const runwayMonths = ad?.runway_months as number | undefined;
  const breakEvenMonth = ad?.break_even_month as number | null | undefined;
  const pnl = ad?.pnl as { grossRevenue?: number; totalCosts?: number; netIncome?: number; margin?: number } | undefined;
  const viabilityWarnings = ad?.viability_warnings as string[] | undefined;
  const promotionGate = ad?.promotion_gate as { decision?: string; reasons?: string[]; score?: number } | undefined;

  const gateDecision = promotionGate?.decision?.toLowerCase();
  const hasGate = gateDecision != null;

  // Find max revenue/cost for bar scaling
  const maxVal = Math.max(
    ...projections.map((p) => Math.max(p.revenue ?? 0, p.costs ?? 0)),
    1
  );

  // Filter advisory keys
  const ADVISORY_EXCLUDE = [
    "initial_capital", "monthly_burn_rate", "burn_rate", "revenue_projections",
    "funding_rounds", "total_projected_revenue", "total_projected_costs",
    "runway_months", "break_even_month", "pnl", "cash_balance_end",
    "viability_warnings", "promotion_gate",
    "fourBuckets", "usage", "llmFallbackCount",
  ];
  const advisoryEntries = ad
    ? Object.entries(ad).filter(([key]) => !ADVISORY_EXCLUDE.includes(key))
    : [];
  const hasAdvisoryDetails = advisoryEntries.length > 0;

  return (
    <div className={`space-y-3 ${className ?? ""}`}>
      {/* Promotion Gate Banner */}
      {hasGate && (
        <div className={`flex flex-col gap-2 p-4 rounded-lg border ${GATE_BANNER[gateDecision!] ?? GATE_BANNER.hold}`}>
          <div className="flex items-center gap-3 flex-wrap">
            <Badge
              variant="default"
              className={`uppercase text-sm px-3 py-1 ${GATE_BADGE[gateDecision!] ?? GATE_BADGE.hold}`}
            >
              {gateDecision === "promote" ? "PROMOTE" : gateDecision === "conditional" ? "CONDITIONAL" : gateDecision?.toUpperCase() ?? "HOLD"}
            </Badge>
            <span className="text-sm font-medium">Schema Firewall Promotion Gate</span>
            {promotionGate?.score != null && (
              <>
                <span className="opacity-50">·</span>
                <span className="text-sm">Score: {promotionGate.score}%</span>
              </>
            )}
          </div>
          {promotionGate?.reasons && promotionGate.reasons.length > 0 && (
            <ul className="space-y-1 mt-1">
              {promotionGate.reasons.map((r, i) => (
                <li key={i} className="text-xs flex items-start gap-1.5">
                  <span className="mt-0.5 shrink-0">•</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Viability Warnings */}
      {viabilityWarnings && viabilityWarnings.length > 0 && (
        <div className="p-3 rounded-lg border bg-amber-500/10 border-amber-500/30">
          <ul className="space-y-1">
            {viabilityWarnings.map((w, i) => (
              <li key={i} className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
                <span className="mt-0.5 shrink-0">⚠</span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Initial Capital
            </span>
            <p className="text-2xl font-bold mt-1">{formatCurrency(initialCapital)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Burn Rate
            </span>
            <p className="text-2xl font-bold mt-1">{formatCurrency(burnRate)}/mo</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Runway
            </span>
            <p className="text-2xl font-bold mt-1">
              {runwayMonths === Infinity ? "∞" : runwayMonths != null ? `${runwayMonths}mo` : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Break-even
            </span>
            <p className="text-2xl font-bold mt-1">
              {breakEvenMonth != null ? `Month ${breakEvenMonth}` : "N/A"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* P&L Summary */}
      {pnl && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">P&L Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="text-center p-2 rounded-lg bg-muted/20">
                <span className="text-[10px] font-semibold uppercase text-muted-foreground">Revenue</span>
                <p className="text-lg font-bold mt-1 text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(pnl.grossRevenue)}
                </p>
              </div>
              <div className="text-center p-2 rounded-lg bg-muted/20">
                <span className="text-[10px] font-semibold uppercase text-muted-foreground">Costs</span>
                <p className="text-lg font-bold mt-1 text-red-600 dark:text-red-400">
                  {formatCurrency(pnl.totalCosts)}
                </p>
              </div>
              <div className="text-center p-2 rounded-lg bg-muted/20">
                <span className="text-[10px] font-semibold uppercase text-muted-foreground">Net Income</span>
                <p className={`text-lg font-bold mt-1 ${(pnl.netIncome ?? 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                  {formatCurrency(pnl.netIncome)}
                </p>
              </div>
              <div className="text-center p-2 rounded-lg bg-muted/20">
                <span className="text-[10px] font-semibold uppercase text-muted-foreground">Margin</span>
                <p className={`text-lg font-bold mt-1 ${(pnl.margin ?? 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                  {pnl.margin != null ? `${pnl.margin}%` : "—"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Revenue vs Cost Projections */}
      {projections.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Monthly Projections</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {projections.map((p, i) => (
                <div key={i} className="space-y-0.5">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="w-12 text-right font-medium">M{p.month ?? i + 1}</span>
                    <div className="flex-1 flex gap-0.5 h-4">
                      <div
                        className="bg-emerald-500 rounded-sm"
                        style={{ width: `${((p.revenue ?? 0) / maxVal) * 100}%` }}
                        title={`Revenue: ${formatCurrency(p.revenue)}`}
                      />
                      <div
                        className="bg-red-400 rounded-sm"
                        style={{ width: `${((p.costs ?? 0) / maxVal) * 100}%` }}
                        title={`Costs: ${formatCurrency(p.costs)}`}
                      />
                    </div>
                    <span className="w-16 text-right text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(p.revenue)}
                    </span>
                  </div>
                </div>
              ))}
              <div className="flex gap-4 mt-2 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-3 h-2 bg-emerald-500 rounded-sm inline-block" /> Revenue</span>
                <span className="flex items-center gap-1"><span className="w-3 h-2 bg-red-400 rounded-sm inline-block" /> Costs</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cash Balance Timeline */}
      {cashBalance.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Cash Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {cashBalance.map((cb, i) => {
                const isNegative = (cb.balance ?? 0) < 0;
                const maxBal = Math.max(...cashBalance.map((c) => Math.abs(c.balance ?? 0)), 1);
                return (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="w-12 text-right font-medium text-muted-foreground">
                      M{cb.month ?? i + 1}
                    </span>
                    <div className="flex-1 h-4 bg-muted/30 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${isNegative ? "bg-red-500" : "bg-blue-500"}`}
                        style={{ width: `${(Math.abs(cb.balance ?? 0) / maxBal) * 100}%` }}
                      />
                    </div>
                    <span className={`w-20 text-right font-medium ${isNegative ? "text-red-600 dark:text-red-400" : ""}`}>
                      {formatCurrency(cb.balance)}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Funding Rounds */}
      {fundingRounds.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Funding Rounds</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {fundingRounds.map((fr, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-sm border-b border-muted pb-2 last:border-0 last:pb-0"
                >
                  <span className="font-medium">{fr.round_name}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(fr.target_amount)}
                    </Badge>
                    {fr.target_date && (
                      <Badge variant="outline" className="text-[10px]">
                        {fr.target_date}
                      </Badge>
                    )}
                  </div>
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

---

## Evaluation Instructions

### Per-Stage Analysis
For each of the 4 stages, evaluate:
1. **Data handling correctness**: Does the renderer safely extract and normalize advisory data?
2. **Visual hierarchy**: Is the most important information displayed first?
3. **Layout responsiveness**: Does the layout work on mobile/tablet/desktop?
4. **Gate implementation** (Stages 13, 16): Is the gate logic correct? Are threshold values appropriate? Is the gate banner prominent enough?
5. **Naming mismatch severity**: How much does the component name diverge from what it actually renders? Impact on developer onboarding and maintenance?
6. **Loading/empty states**: What does the user see while data is being generated?
7. **Accessibility**: Color contrast, screen reader support, keyboard navigation.

### Cross-Stage Analysis
1. **Blueprint narrative coherence**: Roadmap → Architecture → Risks → Financials. Does this sequence make sense as a strategic planning phase?
2. **Naming mismatch pattern**: 3 of 4 stages have names from a completely different domain (tech stack, data model, schema firewall vs roadmap, risk, financial). What does this reveal about the project's evolution?
3. **Gate nomenclature fragmentation**: Stage 13 uses DECISION_BANNER with pass/conditional_pass/kill. Stage 16 uses GATE_BANNER with promote/conditional/hold. Same concept, different implementations.
4. **Financial content placement**: Stage 5 (Profitability Forecasting), Stage 7 (Revenue Architecture), and Stage 16 (Financial Projections) all show financial data. Should Stage 16 be consolidated with the financial stages in THE_ENGINE?
5. **Architecture vs content quality**: Despite the worst naming mismatches, the actual rendered content quality is rated 7/10 for UI. Does good content quality make up for bad architecture?

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
