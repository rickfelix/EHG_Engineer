# Phase 2 Deep Dive: Group 3 — THE_IDENTITY (Stages 10-12)

## Context from Phase 1

This is Phase 2 of a hierarchical triangulation review of a 25-stage venture workflow. Phase 1 assessed all 25 stages at a high level across 6 groups. This prompt focuses on **Group 3: THE_IDENTITY (Stages 10-12)**, which covers the identity phase from customer and brand foundation through visual identity to go-to-market and sales strategy.

### Phase 1 Consensus for Group 3
- **Logic & Flow: 8/10** — Brand → Visual Identity → GTM is a coherent identity narrative.
- **Functionality: 8/10** — All renderers extract advisory data correctly. Chairman gate renders binary decision.
- **UI/Visual Design: 8/10** — Stage 10 refactored to 333 LOC with tabbed UI. Consistent violet/blue theming.
- **UX/Workflow: 8/10** — Tabbed navigation provides structured access to complex data. Summary banners always visible.
- **Architecture: 7/10** — Largest correction from ground truth. Architecture and UX revised upward significantly.

Key consensus: Largest correction from ground truth. Stage 10 refactored to 333 LOC with tabbed UI. Architecture and UX revised upward significantly.

### Phase 1 Issues to Investigate
1. **Chairman Brand Governance Gate uniqueness**: Stage 10 has a unique gate type (approved/pending binary decision, not the standard 3-way pattern). Is this well-integrated or confusing relative to other gates?
2. **Tabbed UI effectiveness**: Stage 10 uses 5 tabs (Overview/Candidates/Personas/Brand DNA/Details), Stage 11 uses 4 tabs (Overview/Candidates/Visual/Strategy). Is tabbed navigation appropriate for these stages? Do tabs obscure important information?
3. **Stage 11 naming mismatch (NEW FINDING)**: Component is `Stage11GtmStrategy.tsx` but actually renders "Naming & Visual Identity" (backend is `stage-11-visual-identity.js`). This mismatch was NOT caught in Phase 1's Group 3 analysis because Phase 1 reported "no naming mismatches" for Groups 1-3.
4. **Stage 12 naming mismatch**: Component is `Stage12SalesSuccessLogic.tsx` but renders "GTM & Sales Strategy" (backend is `stage-12-gtm-sales.js`).
5. **Stage 12 phantom reality gate**: Renders Phase 3→4 PASS/BLOCKED gate banner but `gateType: 'none'` in config. Similar to Stage 9's phantom gate.
6. **formatCurrency duplication**: Stage 12 has another copy (also in Stages 5, 7, 9). This is the 4th+ copy.
7. **Dark mode gap in Stage 11**: Some color definitions may lack `dark:` variants.

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
- All Group 3 stages (10-12) use the full 5-tab layout
- Stages 10 and 11 additionally use INTERNAL tabs within their stage content

### Gate System
- **Stage 10**: Chairman Brand Governance Gate (approved/pending — binary, NOT 3-way) — `gateType: 'none'` in config but renders gate-like approval UI
- **Stage 11**: No gate (`gateType: 'none'`)
- **Stage 12**: Phantom reality gate (PASS/BLOCKED) — `gateType: 'none'` in config but renders gate banner

### Config
All 3 stages configured with `chunk: 'THE_IDENTITY'` in `venture-workflow.ts`:
```typescript
{ stageNumber: 10, stageName: 'Customer & Brand', componentPath: 'Stage10CustomerBrand.tsx', gateType: 'none', chunk: 'THE_IDENTITY' }
{ stageNumber: 11, stageName: 'Go-to-Market Strategy', componentPath: 'Stage11GtmStrategy.tsx', gateType: 'none', chunk: 'THE_IDENTITY' }
{ stageNumber: 12, stageName: 'Sales & Success Logic', componentPath: 'Stage12SalesSuccessLogic.tsx', gateType: 'none', chunk: 'THE_IDENTITY' }
```

### Component Names vs Content
- Stage 10 **matches** its content: `Stage10CustomerBrand` → renders Customer & Brand data
- Stage 11 **MISMATCH**: `Stage11GtmStrategy.tsx` → actually renders "Naming & Visual Identity" (backend: `stage-11-visual-identity.js`)
- Stage 12 **MISMATCH**: `Stage12SalesSuccessLogic.tsx` → actually renders "GTM & Sales Strategy" (backend: `stage-12-gtm-sales.js`)

---

## Source Code

### Stage 10: Customer & Brand (333 LOC)
**File**: `Stage10CustomerBrand.tsx`
**Backend**: `stage-10-customer-brand.js`
**Purpose**: Customer personas, brand genome, naming candidates with weighted scoring, and Chairman Brand Governance Gate. Uses 5 internal tabs (Overview/Candidates/Personas/Brand DNA/Details). Chairman gate renders approved/pending binary decision (unique gate pattern).

```tsx
/**
 * Stage10CustomerBrand — Customer & Brand Foundation renderer (Stage 10)
 *
 * Phase: THE IDENTITY (Stages 10-12)
 * Layout: Chairman gate + summary banner (always visible) then tabbed content:
 * Overview | Candidates | Personas | Brand DNA | Details
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronDown } from "lucide-react";
import type { StageRendererProps } from "@/components/ventures/stages/StageRendererProps";

// ── Interfaces ──────────────────────────────────────────────────────────────
interface Demographics { role?: string; income?: string; ageRange?: string; industry?: string; location?: string; companySize?: string; }
interface CustomerPersona { name?: string; demographics?: Demographics; goals?: string[]; painPoints?: string[]; behaviors?: string[]; motivations?: string[]; }
interface CustomerAlignment { trait?: string; personaName?: string; personaInsight?: string; }
interface BrandGenome { archetype?: string; values?: string[]; tone?: string; audience?: string; differentiators?: string[]; customerAlignment?: CustomerAlignment[]; }
interface BrandPersonality { vision?: string; mission?: string; brandVoice?: string; }
interface ScoringCriterion { name?: string; weight?: number; }
interface NamingCandidate { name?: string; rationale?: string; scores?: Record<string, number>; }
interface NamingDecision { selectedName?: string; workingTitle?: boolean; rationale?: string; availabilityChecks?: { domain?: string; trademark?: string; social?: string }; }
interface ChairmanGate { status?: string; rationale?: string; }

// ── Constants & helpers ─────────────────────────────────────────────────────
const NAMING_LABELS: Record<string, string> = { descriptive: "Descriptive", abstract: "Abstract", acronym: "Acronym", founder: "Founder-Based", metaphorical: "Metaphorical" };
const AVAIL_COLORS: Record<string, string> = { available: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400", pending: "bg-amber-500/20 text-amber-700 dark:text-amber-400", taken: "bg-red-500/20 text-red-700 dark:text-red-400", unknown: "bg-gray-500/20 text-gray-700 dark:text-gray-400" };
const BULLET_COLORS: Record<string, { label: string; dot: string }> = {
  emerald: { label: "text-emerald-600 dark:text-emerald-400", dot: "text-emerald-500" },
  red: { label: "text-red-600 dark:text-red-400", dot: "text-red-500" },
  violet: { label: "text-violet-600 dark:text-violet-400", dot: "text-violet-500" },
};
const ADVISORY_EXCLUDE = new Set(["customerPersonas", "brandGenome", "brandPersonality", "namingStrategy", "scoringCriteria", "candidates", "decision", "chairmanGate", "totalPersonas", "totalCandidates", "totalCriteria", "personaCoverageScore", "sourceProvenance", "fourBuckets", "usage", "llmFallbackCount"]);

function normPersona(raw: unknown): CustomerPersona {
  if (typeof raw === "string") return { name: raw };
  const p = raw as Record<string, unknown>;
  return { name: (p?.name as string) || "Unnamed Persona", demographics: p?.demographics && typeof p.demographics === "object" ? (p.demographics as Demographics) : undefined, goals: Array.isArray(p?.goals) ? p.goals.map(String) : [], painPoints: Array.isArray(p?.painPoints) ? p.painPoints.map(String) : [], behaviors: Array.isArray(p?.behaviors) ? p.behaviors.map(String) : [], motivations: Array.isArray(p?.motivations) ? p.motivations.map(String) : [] };
}
function normCandidate(raw: unknown): NamingCandidate {
  if (typeof raw === "string") return { name: raw, rationale: "", scores: {} };
  const c = raw as Record<string, unknown>;
  return { name: (c?.name as string) || "Unnamed", rationale: (c?.rationale as string) || "", scores: c?.scores && typeof c.scores === "object" ? (c.scores as Record<string, number>) : {} };
}
function weightedScore(c: NamingCandidate, cr: ScoringCriterion[]): number {
  return cr.reduce((s, x) => s + ((c.scores?.[x.name ?? ""] ?? 0) * (x.weight ?? 0)) / 100, 0);
}

/** Labeled bullet list. Returns null when empty. */
function BulletList({ label, items, color }: { label: string; items?: string[]; color?: string }) {
  if (!items?.length) return null;
  const c = color ? BULLET_COLORS[color] : null;
  return (
    <div>
      <span className={`text-[10px] font-semibold uppercase tracking-wide ${c?.label ?? "text-muted-foreground"}`}>{label}</span>
      <ul className="mt-1 space-y-1">
        {items.map((t, i) => (
          <li key={i} className={`text-xs flex items-start gap-1.5 ${c ? "" : "text-muted-foreground"}`}>
            <span className={`mt-0.5 shrink-0 ${c?.dot ?? ""}`}>&bull;</span><span>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Key-value row used in Brand Genome and Details. */
function KVRow({ label, value, maxW = "65%" }: { label: string; value: string; maxW?: string }) {
  return (
    <div className="flex justify-between text-sm border-b border-muted pb-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right" style={{ maxWidth: maxW }}>{value}</span>
    </div>
  );
}

// ── Component ───────────────────────────────────────────────────────────────
export default function Stage10CustomerBrand({ stageData, className }: StageRendererProps) {
  const [personasOpen, setPersonasOpen] = useState<Record<number, boolean>>({});
  const [detailsOpen, setDetailsOpen] = useState(false);
  const ad = stageData.advisoryData;

  const personas: CustomerPersona[] = Array.isArray(ad?.customerPersonas) ? ad.customerPersonas.map(normPersona) : [];
  const brandGenome = ad?.brandGenome as BrandGenome | undefined;
  const brandPersonality = ad?.brandPersonality as BrandPersonality | undefined;
  const namingStrategy = ad?.namingStrategy as string | undefined;
  const criteria: ScoringCriterion[] = Array.isArray(ad?.scoringCriteria) ? ad.scoringCriteria : [];
  const candidates: NamingCandidate[] = Array.isArray(ad?.candidates) ? ad.candidates.map(normCandidate) : [];
  const decision = ad?.decision as NamingDecision | undefined;
  const chairmanGate = ad?.chairmanGate as ChairmanGate | undefined;
  const srcProv = ad?.sourceProvenance as Record<string, unknown> | undefined;

  const ranked = [...candidates].sort((a, b) => weightedScore(b, criteria) - weightedScore(a, criteria));
  const nPersonas = personas.length, nCandidates = candidates.length;
  const upstream = typeof srcProv?.upstreamCount === "number" ? srcProv.upstreamCount : 0;
  const gateStatus = chairmanGate?.status;
  const hasGate = chairmanGate != null && gateStatus != null;
  const gatePassed = gateStatus === "approved" || gateStatus === "pass";
  const hasBanner = decision?.selectedName != null || brandGenome?.archetype != null;
  const advEntries = ad ? Object.entries(ad).filter(([k]) => !ADVISORY_EXCLUDE.has(k)) : [];

  const personalityFields = brandPersonality ? ([
    { key: "Vision", val: brandPersonality.vision },
    { key: "Mission", val: brandPersonality.mission },
    { key: "Brand Voice", val: brandPersonality.brandVoice, muted: true },
  ] as const).filter((f) => f.val) : [];

  return (
    <div className={`space-y-3 ${className ?? ""}`}>
      {/* Chairman Gate — always visible */}
      {hasGate && (
        <div className={`flex flex-col gap-2 p-4 rounded-lg border ${gatePassed ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400" : "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400"}`}>
          <div className="flex items-center gap-3">
            <Badge variant="default" className={`uppercase text-sm px-3 py-1 ${gatePassed ? "bg-emerald-600 hover:bg-emerald-700" : "bg-amber-600 hover:bg-amber-700"}`}>
              {gatePassed ? "APPROVED" : (gateStatus?.toUpperCase() ?? "PENDING")}
            </Badge>
            <span className="text-sm font-medium">Chairman Brand Governance Gate</span>
          </div>
          {chairmanGate.rationale && <p className="text-sm opacity-90">{chairmanGate.rationale}</p>}
        </div>
      )}

      {/* Summary Banner — always visible */}
      {hasBanner && (
        <div className="flex flex-col gap-2 p-4 rounded-lg border bg-violet-500/10 border-violet-500/30 text-violet-700 dark:text-violet-400">
          <div className="flex items-center gap-3 flex-wrap">
            <Badge variant="default" className="uppercase text-sm px-3 py-1 bg-violet-600 hover:bg-violet-700">{decision?.selectedName ?? "Brand Foundation"}</Badge>
            {brandGenome?.archetype && <Badge variant="outline" className="text-xs">{brandGenome.archetype}</Badge>}
            {namingStrategy && (<><span className="opacity-50">&middot;</span><span className="text-sm">{NAMING_LABELS[namingStrategy] ?? namingStrategy} naming</span></>)}
            <span className="opacity-50">&middot;</span><span className="text-sm">{nPersonas} persona{nPersonas !== 1 ? "s" : ""}</span>
            <span className="opacity-50">&middot;</span><span className="text-sm">{nCandidates} candidate{nCandidates !== 1 ? "s" : ""}</span>
            {upstream > 0 && (<><span className="opacity-50">&middot;</span><span className="text-sm">{upstream}/4 upstream sources</span></>)}
          </div>
          {decision?.rationale && <p className="text-sm opacity-90">{decision.rationale}</p>}
        </div>
      )}

      {/* Tabbed content */}
      <Tabs defaultValue="overview">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="candidates">Candidates</TabsTrigger>
          <TabsTrigger value="personas">Personas</TabsTrigger>
          <TabsTrigger value="brand-dna">Brand DNA</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>

        {/* ── Overview ─────────────────────────────────────────────────── */}
        <TabsContent value="overview" className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {([["Personas", nPersonas], ["Candidates", nCandidates], ["Scoring Criteria", criteria.length]] as const).map(([l, v]) => (
              <Card key={l}><CardContent className="pt-4 pb-3 px-4">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{l}</span>
                <p className="text-2xl font-bold mt-1">{v}</p>
              </CardContent></Card>
            ))}
            <Card><CardContent className="pt-4 pb-3 px-4">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Naming Strategy</span>
              <p className="text-lg font-bold mt-1">{NAMING_LABELS[namingStrategy ?? ""] ?? namingStrategy ?? "\u2014"}</p>
            </CardContent></Card>
          </div>
          {decision?.selectedName && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Selected Name</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-xl font-bold text-violet-600 dark:text-violet-400">{decision.selectedName}</span>
                  {decision.workingTitle && <Badge variant="outline" className="text-xs">Working Title</Badge>}
                </div>
                {decision.availabilityChecks && (
                  <div className="flex gap-2 flex-wrap">
                    {Object.entries(decision.availabilityChecks).map(([k, s]) => (
                      <Badge key={k} className={`text-xs px-2 py-0.5 ${AVAIL_COLORS[s ?? "unknown"] ?? AVAIL_COLORS.unknown}`}>{k}: {s ?? "unknown"}</Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Candidates ───────────────────────────────────────────────── */}
        <TabsContent value="candidates">
          {ranked.length > 0 && criteria.length > 0 ? (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Naming Candidates</CardTitle></CardHeader>
              <CardContent><div className="overflow-x-auto"><table className="w-full text-sm">
                <thead><tr className="border-b border-muted">
                  <th className="text-left py-2 pr-3 text-muted-foreground font-medium">Name</th>
                  {criteria.map((cr) => (
                    <th key={cr.name} className="text-center py-2 px-2 text-muted-foreground font-medium text-xs">{cr.name}<span className="block text-[10px] opacity-60">{cr.weight}%</span></th>
                  ))}
                  <th className="text-center py-2 pl-3 text-muted-foreground font-medium">Total</th>
                </tr></thead>
                <tbody>{ranked.map((c, i) => {
                  const total = weightedScore(c, criteria), sel = c.name === decision?.selectedName;
                  return (
                    <tr key={i} className={`border-b border-muted last:border-0 ${sel ? "bg-violet-500/5" : ""}`}>
                      <td className="py-2 pr-3"><div className="flex items-center gap-2">
                        <span className={`font-medium ${sel ? "text-violet-600 dark:text-violet-400" : ""}`}>{c.name}</span>
                        {sel && <Badge variant="default" className="text-[10px] px-1.5 py-0 bg-violet-600">Selected</Badge>}
                      </div></td>
                      {criteria.map((cr) => <td key={cr.name} className="text-center py-2 px-2 tabular-nums">{c.scores?.[cr.name ?? ""] ?? "\u2014"}</td>)}
                      <td className="text-center py-2 pl-3 font-bold tabular-nums">{Math.round(total)}</td>
                    </tr>);
                })}</tbody>
              </table></div></CardContent>
            </Card>
          ) : <p className="text-sm text-muted-foreground py-4">No candidates or scoring criteria available.</p>}
        </TabsContent>

        {/* ── Personas ─────────────────────────────────────────────────── */}
        <TabsContent value="personas">
          {personas.length > 0 ? (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Customer Personas</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {personas.map((p, i) => {
                  const open = personasOpen[i] ?? false, d = p.demographics;
                  return (
                    <Collapsible key={i} open={open} onOpenChange={() => setPersonasOpen((prev) => ({ ...prev, [i]: !prev[i] }))}>
                      <CollapsibleTrigger className="w-full flex items-center justify-between p-3 rounded-lg border bg-blue-500/5 border-blue-500/20 hover:bg-blue-500/10 transition-colors cursor-pointer">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold">{p.name}</span>
                          {d?.role && <Badge variant="outline" className="text-xs">{d.role}</Badge>}
                          {d?.companySize && <span className="text-xs text-muted-foreground">{d.companySize}</span>}
                        </div>
                        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
                      </CollapsibleTrigger>
                      <CollapsibleContent><div className="p-3 space-y-3">
                        {d && <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          {d.ageRange && <span>Age: {d.ageRange}</span>}{d.industry && <span>Industry: {d.industry}</span>}
                          {d.income && <span>Income: {d.income}</span>}{d.location && <span>Location: {d.location}</span>}
                        </div>}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <BulletList label="Goals" items={p.goals} color="emerald" />
                          <BulletList label="Pain Points" items={p.painPoints} color="red" />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <BulletList label="Behaviors" items={p.behaviors} />
                          <BulletList label="Motivations" items={p.motivations} />
                        </div>
                      </div></CollapsibleContent>
                    </Collapsible>);
                })}
              </CardContent>
            </Card>
          ) : <p className="text-sm text-muted-foreground py-4">No customer personas defined.</p>}
        </TabsContent>

        {/* ── Brand DNA (genome + personality) ─────────────────────────── */}
        <TabsContent value="brand-dna" className="space-y-3">
          {brandGenome && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Brand Genome</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {brandGenome.archetype && <KVRow label="Archetype" value={brandGenome.archetype} />}
                  {brandGenome.tone && <KVRow label="Tone" value={brandGenome.tone} />}
                </div>
                {brandGenome.audience && <KVRow label="Audience" value={brandGenome.audience} />}
                {brandGenome.values && brandGenome.values.length > 0 && (
                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Core Values</span>
                    <div className="flex flex-wrap gap-1.5 mt-1">{brandGenome.values.map((v, i) => <Badge key={i} variant="secondary" className="text-xs">{v}</Badge>)}</div>
                  </div>
                )}
                <BulletList label="Differentiators" items={brandGenome.differentiators} color="violet" />
                {brandGenome.customerAlignment && brandGenome.customerAlignment.length > 0 && (
                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Customer Alignment</span>
                    <div className="mt-1 space-y-2">{brandGenome.customerAlignment.map((ca, i) => (
                      <div key={i} className="p-2 rounded border border-violet-500/15 bg-violet-500/5 space-y-0.5">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-medium">{ca.trait}</span><span className="text-muted-foreground">&rarr;</span>
                          <Badge variant="outline" className="text-[10px]">{ca.personaName}</Badge>
                        </div>
                        {ca.personaInsight && <p className="text-[11px] text-muted-foreground">{ca.personaInsight}</p>}
                      </div>
                    ))}</div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          {personalityFields.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Brand Personality</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {personalityFields.map((f) => (
                  <div key={f.key}>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{f.key}</span>
                    <p className={`text-sm mt-0.5 ${"muted" in f && f.muted ? "text-muted-foreground" : ""}`}>{f.val}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          {!brandGenome && personalityFields.length === 0 && <p className="text-sm text-muted-foreground py-4">No brand DNA data available.</p>}
        </TabsContent>

        {/* ── Details (advisory overflow) ──────────────────────────────── */}
        <TabsContent value="details">
          {advEntries.length > 0 ? (
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
                <CollapsibleContent><CardContent><div className="space-y-2">
                  {advEntries.map(([k, v]) => (
                    <div key={k} className="flex justify-between text-sm border-b border-muted pb-1 last:border-0">
                      <span className="text-muted-foreground capitalize">{k.replace(/_/g, " ")}</span>
                      <span className="font-medium text-right max-w-[60%]">{typeof v === "object" ? JSON.stringify(v) : String(v ?? "\u2014")}</span>
                    </div>
                  ))}
                </div></CardContent></CollapsibleContent>
              </Collapsible>
            </Card>
          ) : <p className="text-sm text-muted-foreground py-4">No additional advisory details.</p>}
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

### Stage 11: Go-to-Market Strategy [NAMING MISMATCH] (380 LOC)
**File**: `Stage11GtmStrategy.tsx`
**Backend**: `stage-11-visual-identity.js` (MISMATCH: component name says "GtmStrategy" but backend and content are "Visual Identity")
**Purpose**: Naming & Visual Identity — naming candidates with weighted scoring and persona fit, visual identity (color palette + typography + imagery guidance), brand expression (tagline + elevator pitch + messaging pillars). Uses 4 internal tabs (Overview/Candidates/Visual Identity/Strategy).

```tsx
/**
 * Stage11GtmStrategy — Naming & Visual Identity renderer (Stage 11)
 *
 * Analytics/Scoring View: Decision banner with selected name + availability,
 * metric cards, brand expression (tagline + elevator pitch + pillars),
 * candidate ranking with weighted scoring + persona fit, visual identity
 * (color palette swatches + typography + imagery guidance),
 * collapsible advisory details.
 * Data shape matches backend: stage-11-visual-identity.js
 *
 * SD-LEO-ORCH-STAGE-VENTURE-WORKFLOW-001-H
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import type { StageRendererProps } from "@/components/ventures/stages/StageRendererProps";

// Backend data shape from stage-11-visual-identity.js
interface ScoringCriterion { name?: string; weight?: number }
interface PersonaFit { personaName?: string; fitScore?: number; reasoning?: string }
interface Candidate { name?: string; scores?: Record<string, number>; rationale?: string; personaFit?: PersonaFit[] }
interface ColorSwatch { name?: string; hex?: string; usage?: string; personaAlignment?: string }
interface Typography { heading?: string; body?: string; rationale?: string }
interface VisualIdentity { colorPalette?: ColorSwatch[]; typography?: Typography; imageryGuidance?: string }
interface BrandExpression { tagline?: string; elevator_pitch?: string; messaging_pillars?: string[] }
interface NamingDecision { selectedName?: string; workingTitle?: boolean; rationale?: string; availabilityChecks?: Record<string, string> }
interface NamingStrategy { approach?: string; rationale?: string }

const APPROACH_LABELS: Record<string, string> = {
  descriptive: "Descriptive", abstract: "Abstract", metaphorical: "Metaphorical",
  acronym: "Acronym", compound: "Compound", invented: "Invented",
};

const AVAILABILITY_COLORS: Record<string, string> = {
  available: "bg-emerald-600 hover:bg-emerald-700", confirmed: "bg-emerald-600 hover:bg-emerald-700",
  pending: "bg-amber-500 hover:bg-amber-600", unavailable: "bg-red-600 hover:bg-red-700",
  taken: "bg-red-600 hover:bg-red-700",
};

function normalizeCandidate(raw: unknown): Candidate {
  if (typeof raw === "string") return { name: raw, scores: {}, personaFit: [] };
  const c = raw as Record<string, unknown>;
  return {
    name: (c?.name as string) || "Unnamed",
    scores: (c?.scores as Record<string, number>) || {},
    rationale: (c?.rationale as string) || undefined,
    personaFit: Array.isArray(c?.personaFit) ? c.personaFit : [],
  };
}

function totalScore(candidate: Candidate): number {
  if (!candidate.scores) return 0;
  return Object.values(candidate.scores).reduce((sum, v) => sum + (v ?? 0), 0);
}

function CandidateCard({ candidate, rank, maxScore, isSelected }: {
  candidate: Candidate; rank: number; maxScore: number; isSelected: boolean;
}) {
  const [open, setOpen] = useState(false);
  const total = totalScore(candidate);
  const pct = maxScore > 0 ? (total / maxScore) * 100 : 0;
  const fits = candidate.personaFit || [];

  return (
    <div className={`rounded-lg border p-4 space-y-3 ${isSelected ? "bg-violet-500/10 border-violet-500/30" : "bg-muted/20"}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-muted-foreground w-5">#{rank}</span>
          <span className="font-semibold text-sm">{candidate.name}</span>
          {isSelected && <Badge className="text-[9px] px-1.5 py-0 bg-violet-600 hover:bg-violet-700">SELECTED</Badge>}
        </div>
        <span className="text-lg font-bold">{total}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all ${isSelected ? "bg-violet-500" : "bg-blue-500"}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      {candidate.scores && Object.keys(candidate.scores).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(candidate.scores).map(([key, val]) => (
            <span key={key} className="text-[10px] text-muted-foreground">
              {key}: <span className="font-medium text-foreground">{val}</span>
            </span>
          ))}
        </div>
      )}
      {candidate.rationale && <p className="text-xs text-muted-foreground">{candidate.rationale}</p>}
      {fits.length > 0 && (
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
            <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
            Persona Fit ({fits.length})
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-2 mt-2">
              {fits.map((pf, i) => (
                <div key={i} className="flex items-start gap-3 text-xs border-b border-muted pb-2 last:border-0 last:pb-0">
                  <div className="flex items-center gap-1.5 shrink-0 w-28">
                    <div className="w-8 h-1.5 rounded-full overflow-hidden bg-muted">
                      <div className="h-full rounded-full bg-violet-500" style={{ width: `${Math.min(pf.fitScore ?? 0, 100)}%` }} />
                    </div>
                    <span className="font-medium">{pf.fitScore ?? 0}%</span>
                  </div>
                  <div>
                    <span className="font-medium">{pf.personaName}</span>
                    {pf.reasoning && <p className="text-muted-foreground/70 mt-0.5">{pf.reasoning}</p>}
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

export default function Stage11GtmStrategy({ stageData, className }: StageRendererProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const ad = stageData.advisoryData;

  const namingStrategy = ad?.namingStrategy as NamingStrategy | undefined;
  const criteria: ScoringCriterion[] = Array.isArray(ad?.scoringCriteria) ? ad.scoringCriteria : [];
  const candidates: Candidate[] = Array.isArray(ad?.candidates)
    ? ad.candidates.map(normalizeCandidate).sort((a, b) => totalScore(b) - totalScore(a)) : [];
  const visualIdentity = ad?.visualIdentity as VisualIdentity | undefined;
  const brandExpression = ad?.brandExpression as BrandExpression | undefined;
  const decision = ad?.decision as NamingDecision | undefined;
  const totalCandidatesCount = (ad?.totalCandidates as number) ?? candidates.length;
  const totalCriteriaCount = (ad?.totalCriteria as number) ?? criteria.length;

  const maxPossible = criteria.reduce((sum, c) => sum + (c.weight ?? 0), 0);
  const topScore = candidates.length > 0 ? totalScore(candidates[0]) : 0;
  const approach = namingStrategy?.approach || "descriptive";
  const hasBanner = decision?.selectedName != null;
  const colorPalette = visualIdentity?.colorPalette || [];
  const typography = visualIdentity?.typography;
  const pillars = brandExpression?.messaging_pillars || [];

  const ADVISORY_EXCLUDE = [
    "namingStrategy", "scoringCriteria", "candidates", "visualIdentity",
    "brandExpression", "decision", "totalCandidates", "totalCriteria",
    "fourBuckets", "usage", "llmFallbackCount",
  ];
  const advisoryEntries = ad ? Object.entries(ad).filter(([key]) => !ADVISORY_EXCLUDE.includes(key)) : [];

  return (
    <div className={`space-y-3 ${className ?? ""}`}>
      {/* Decision Banner — always visible */}
      {hasBanner && (
        <div className="flex flex-col gap-2 p-4 rounded-lg border bg-violet-500/10 border-violet-500/30 text-violet-700 dark:text-violet-400">
          <div className="flex items-center gap-3 flex-wrap">
            <Badge variant="default" className="uppercase text-sm px-3 py-1 bg-violet-600 hover:bg-violet-700">
              {decision!.selectedName}
            </Badge>
            {decision!.workingTitle && <Badge variant="outline" className="text-xs">Working Title</Badge>}
            <Badge variant="outline" className="text-xs">{APPROACH_LABELS[approach] ?? approach}</Badge>
            <span className="text-sm">{totalCandidatesCount} candidate{totalCandidatesCount !== 1 ? "s" : ""} evaluated</span>
          </div>
          {decision!.availabilityChecks && (
            <div className="flex items-center gap-2 flex-wrap">
              {Object.entries(decision!.availabilityChecks).map(([channel, status]) => (
                <Badge key={channel} className={`text-[10px] px-1.5 py-0 ${AVAILABILITY_COLORS[status] ?? "bg-gray-500 hover:bg-gray-600"}`}>
                  {channel}: {status}
                </Badge>
              ))}
            </div>
          )}
          {decision!.rationale && <p className="text-sm opacity-90">{decision!.rationale}</p>}
        </div>
      )}

      {/* Tabbed content sections */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="candidates">Candidates</TabsTrigger>
          <TabsTrigger value="visual">Visual Identity</TabsTrigger>
          <TabsTrigger value="strategy">Strategy</TabsTrigger>
        </TabsList>

        {/* Overview: Metric cards + Brand Expression */}
        <TabsContent value="overview" className="space-y-3 mt-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Candidates", value: <p className="text-2xl font-bold mt-1">{totalCandidatesCount}</p> },
              { label: "Criteria", value: <p className="text-2xl font-bold mt-1">{totalCriteriaCount}</p> },
              { label: "Top Score", value: (
                <p className="text-2xl font-bold mt-1 text-violet-600 dark:text-violet-400">
                  {topScore}{maxPossible > 0 && <span className="text-sm font-normal text-muted-foreground">/{maxPossible}</span>}
                </p>
              )},
              { label: "Colors", value: (
                <div className="flex gap-1 mt-2">
                  {colorPalette.length > 0
                    ? colorPalette.map((c, i) => <div key={i} className="w-6 h-6 rounded-md border border-border" style={{ backgroundColor: c.hex }} title={c.name} />)
                    : <span className="text-2xl font-bold">0</span>}
                </div>
              )},
            ].map((card) => (
              <Card key={card.label}>
                <CardContent className="pt-4 pb-3 px-4">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{card.label}</span>
                  {card.value}
                </CardContent>
              </Card>
            ))}
          </div>
          {brandExpression && (brandExpression.tagline || brandExpression.elevator_pitch) && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Brand Expression</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {brandExpression.tagline && (
                  <p className="text-lg font-semibold text-violet-700 dark:text-violet-400 italic">&ldquo;{brandExpression.tagline}&rdquo;</p>
                )}
                {brandExpression.elevator_pitch && <p className="text-sm text-muted-foreground">{brandExpression.elevator_pitch}</p>}
                {pillars.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Messaging Pillars</span>
                    {pillars.map((pillar, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        <span className="shrink-0 w-5 h-5 rounded-full bg-violet-500/20 text-violet-600 dark:text-violet-400 flex items-center justify-center text-[10px] font-bold mt-0.5">{i + 1}</span>
                        <span>{pillar}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Candidates: Scoring criteria + Candidate cards */}
        <TabsContent value="candidates" className="space-y-3 mt-3">
          {criteria.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Scoring Criteria</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {criteria.map((c, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{c.name}</span>
                      <span className="text-muted-foreground">{c.weight != null ? `${c.weight}%` : "\u2014"}</span>
                    </div>
                    {c.weight != null && (
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-violet-500/60 transition-all" style={{ width: `${Math.min(c.weight, 100)}%` }} />
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          {candidates.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  Naming Candidates
                  {namingStrategy?.rationale && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">{APPROACH_LABELS[approach] ?? approach} approach</span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {candidates.map((candidate, i) => (
                  <CandidateCard key={i} candidate={candidate} rank={i + 1} maxScore={maxPossible} isSelected={decision?.selectedName === candidate.name} />
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Visual Identity: Color palette + Typography + Imagery */}
        <TabsContent value="visual" className="space-y-3 mt-3">
          {visualIdentity && (colorPalette.length > 0 || typography) ? (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Visual Identity</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {colorPalette.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Color Palette</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {colorPalette.map((color, i) => (
                        <div key={i} className="flex items-start gap-3 p-3 rounded-lg border bg-muted/20">
                          <div className="w-12 h-12 rounded-lg border border-border shrink-0" style={{ backgroundColor: color.hex }} />
                          <div className="space-y-0.5 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{color.name}</span>
                              <span className="text-[10px] text-muted-foreground font-mono">{color.hex}</span>
                            </div>
                            {color.usage && <p className="text-xs text-muted-foreground">{color.usage}</p>}
                            {color.personaAlignment && <p className="text-[10px] text-muted-foreground/60">{color.personaAlignment}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {typography && (typography.heading || typography.body) && (
                  <div className="space-y-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Typography</span>
                    <div className="grid grid-cols-2 gap-3">
                      {typography.heading && (
                        <div className="p-3 rounded-lg border bg-muted/20 space-y-1">
                          <span className="text-[10px] text-muted-foreground uppercase">Heading</span>
                          <p className="text-lg font-bold">{typography.heading}</p>
                        </div>
                      )}
                      {typography.body && (
                        <div className="p-3 rounded-lg border bg-muted/20 space-y-1">
                          <span className="text-[10px] text-muted-foreground uppercase">Body</span>
                          <p className="text-lg">{typography.body}</p>
                        </div>
                      )}
                    </div>
                    {typography.rationale && <p className="text-xs text-muted-foreground">{typography.rationale}</p>}
                  </div>
                )}
                {visualIdentity.imageryGuidance && (
                  <div className="space-y-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Imagery Guidance</span>
                    <p className="text-sm text-muted-foreground">{visualIdentity.imageryGuidance}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <p className="text-sm text-muted-foreground">No visual identity data available.</p>
          )}
        </TabsContent>

        {/* Strategy: Naming rationale + Advisory details */}
        <TabsContent value="strategy" className="space-y-3 mt-3">
          {namingStrategy?.rationale && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Naming Strategy</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{namingStrategy.rationale}</p>
              </CardContent>
            </Card>
          )}
          {advisoryEntries.length > 0 && (
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
                  <CardContent className="space-y-2">
                    {advisoryEntries.map(([key, value]) => (
                      <div key={key} className="flex justify-between text-sm border-b border-muted pb-1 last:border-0">
                        <span className="text-muted-foreground capitalize">{key.replace(/_/g, " ")}</span>
                        <span className="font-medium text-right max-w-[60%]">
                          {typeof value === "object" ? JSON.stringify(value) : String(value ?? "\u2014")}
                        </span>
                      </div>
                    ))}
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

### Stage 12: Sales & Success Logic [NAMING MISMATCH] (486 LOC)
**File**: `Stage12SalesSuccessLogic.tsx`
**Backend**: `stage-12-gtm-sales.js` (MISMATCH: component name says "SalesSuccessLogic" but backend and content are "GTM & Sales Strategy")
**Purpose**: GTM & Sales Strategy — reality gate banner (Phase 3->4), summary banner with sales model + cycle, metric cards, market tiers with TAM/SAM/SOM bars, acquisition channels, sales funnel with conversion rates, deal stages timeline, customer journey steps. No internal tabs (flat layout).

```tsx
/**
 * Stage12SalesSuccessLogic — GTM & Sales Strategy renderer (Stage 12)
 *
 * Analytics/Scoring View: Reality gate banner, summary banner with sales
 * model + cycle days, metric cards, market tiers with TAM/SAM/SOM,
 * channels table, sales funnel with conversion rates, deal stages timeline,
 * customer journey steps, collapsible advisory details.
 * Data shape matches backend: stage-12-gtm-sales.js
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

// Backend data shape from stage-12-gtm-sales.js
interface MarketTier {
  name?: string;
  description?: string;
  persona?: string | null;
  painPoints?: string[];
  tam?: number;
  sam?: number;
  som?: number;
}

interface Channel {
  name?: string;
  channelType?: string;
  primaryTier?: string;
  monthly_budget?: number;
  expected_cac?: number;
  primary_kpi?: string;
}

interface DealStage {
  name?: string;
  description?: string;
  avg_duration_days?: number;
  mappedFunnelStage?: string | null;
}

interface FunnelStage {
  name?: string;
  metric?: string;
  target_value?: number;
  conversionRateEstimate?: number | null;
}

interface JourneyStep {
  step?: string;
  funnel_stage?: string;
  touchpoint?: string;
}

interface RealityGate {
  pass?: boolean;
  rationale?: string;
  blockers?: string[];
  required_next_actions?: string[];
}

const SALES_MODEL_LABELS: Record<string, string> = {
  "self-serve": "Self-Serve",
  "inside-sales": "Inside Sales",
  enterprise: "Enterprise",
  hybrid: "Hybrid",
  marketplace: "Marketplace",
  channel: "Channel",
};

const CHANNEL_TYPE_COLORS: Record<string, string> = {
  paid: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  organic: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  earned: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  owned: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
};

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "\u2014";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(abs / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

function formatNumber(value: number | null | undefined): string {
  if (value == null) return "\u2014";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return value.toLocaleString();
}

export default function Stage12SalesSuccessLogic({
  stageData,
  className,
}: StageRendererProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const ad = stageData.advisoryData;

  // Extract fields matching backend shape
  const rawTiers = ad?.marketTiers;
  const marketTiers: MarketTier[] = Array.isArray(rawTiers) ? rawTiers : [];
  const rawChannels = ad?.channels;
  const channels: Channel[] = Array.isArray(rawChannels) ? rawChannels : [];
  const salesModel = ad?.salesModel as string | undefined;
  const salesCycleDays = ad?.sales_cycle_days as number | undefined;
  const rawDealStages = ad?.deal_stages;
  const dealStages: DealStage[] = Array.isArray(rawDealStages) ? rawDealStages : [];
  const rawFunnel = ad?.funnel_stages;
  const funnelStages: FunnelStage[] = Array.isArray(rawFunnel) ? rawFunnel : [];
  const rawJourney = ad?.customer_journey;
  const customerJourney: JourneyStep[] = Array.isArray(rawJourney) ? rawJourney : [];
  const totalMonthlyBudget = ad?.total_monthly_budget as number | undefined;
  const avgCac = ad?.avg_cac as number | undefined;
  const realityGate = ad?.reality_gate as RealityGate | undefined;

  // Derived
  const hasBanner = salesModel != null || totalMonthlyBudget != null;
  const totalTam = marketTiers.reduce((s, t) => s + (t.tam ?? 0), 0);

  // Reality gate banner colors
  const gatePass = realityGate?.pass;
  const gateBannerClass = gatePass
    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
    : "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400";

  // Filter advisory keys
  const ADVISORY_EXCLUDE = [
    "marketTiers", "channels", "salesModel", "sales_cycle_days",
    "deal_stages", "funnel_stages", "customer_journey", "economyCheck",
    "reality_gate", "total_monthly_budget", "avg_cac",
    "fourBuckets", "usage", "llmFallbackCount",
  ];
  const advisoryEntries = ad
    ? Object.entries(ad).filter(([key]) => !ADVISORY_EXCLUDE.includes(key))
    : [];
  const hasAdvisoryDetails = advisoryEntries.length > 0;

  return (
    <div className={`space-y-3 ${className ?? ""}`}>
      {/* Reality Gate — Phase 3→4 verdict */}
      {realityGate && (
        <div className={`flex flex-col gap-2 p-4 rounded-lg border ${gateBannerClass}`}>
          <div className="flex items-center gap-3">
            <Badge
              variant="default"
              className={`uppercase text-sm px-3 py-1 ${gatePass ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}`}
            >
              {gatePass ? "PASS" : "BLOCKED"}
            </Badge>
            <span className="text-sm font-medium">Phase 3→4 Reality Gate</span>
          </div>
          {realityGate.rationale && (
            <p className="text-sm opacity-90">{realityGate.rationale}</p>
          )}
          {realityGate.blockers && realityGate.blockers.length > 0 && (
            <ul className="space-y-1 mt-1">
              {realityGate.blockers.map((b, i) => (
                <li key={i} className="text-xs flex items-start gap-1.5">
                  <span className="mt-0.5 shrink-0">&bull;</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Summary Banner */}
      {hasBanner && (
        <div className="flex flex-col gap-2 p-4 rounded-lg border bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-400">
          <div className="flex items-center gap-3 flex-wrap">
            <Badge variant="default" className="uppercase text-sm px-3 py-1 bg-blue-600 hover:bg-blue-700">
              GTM Strategy
            </Badge>
            {salesModel && (
              <Badge variant="outline" className="text-xs">
                {SALES_MODEL_LABELS[salesModel] ?? salesModel}
              </Badge>
            )}
            {salesCycleDays != null && (
              <>
                <span className="opacity-50">&middot;</span>
                <span className="text-sm">{salesCycleDays}-day cycle</span>
              </>
            )}
            <span className="text-sm">
              {marketTiers.length} tier{marketTiers.length !== 1 ? "s" : ""}
            </span>
            <span className="opacity-50">&middot;</span>
            <span className="text-sm">{channels.length} channels</span>
          </div>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Monthly Budget
            </span>
            <p className="text-2xl font-bold mt-1">
              {formatCurrency(totalMonthlyBudget)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Avg CAC
            </span>
            <p className="text-2xl font-bold mt-1">
              {avgCac != null ? formatCurrency(avgCac) : "\u2014"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Sales Cycle
            </span>
            <p className="text-2xl font-bold mt-1">
              {salesCycleDays != null ? `${salesCycleDays}d` : "\u2014"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Total TAM
            </span>
            <p className="text-2xl font-bold mt-1">
              {formatCurrency(totalTam)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Market Tiers */}
      {marketTiers.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Market Tiers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {marketTiers.map((tier, i) => (
                <div key={i} className="p-3 rounded-lg border bg-muted/20 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{tier.name}</span>
                      {tier.persona && (
                        <Badge variant="outline" className="text-[10px]">
                          {tier.persona}
                        </Badge>
                      )}
                    </div>
                  </div>
                  {tier.description && (
                    <p className="text-xs text-muted-foreground">{tier.description}</p>
                  )}
                  {/* TAM/SAM/SOM bars */}
                  <div className="grid grid-cols-3 gap-2">
                    {(["tam", "sam", "som"] as const).map((key) => (
                      <div key={key} className="space-y-0.5">
                        <div className="flex justify-between text-[10px]">
                          <span className="text-muted-foreground uppercase">{key}</span>
                          <span className="font-medium">{formatCurrency(tier[key])}</span>
                        </div>
                        {totalTam > 0 && (
                          <div className="h-1 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full bg-blue-500/60"
                              style={{ width: `${Math.min(((tier[key] ?? 0) / totalTam) * 100, 100)}%` }}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {tier.painPoints && tier.painPoints.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {tier.painPoints.map((pp, j) => (
                        <Badge key={j} variant="outline" className="text-[10px] text-red-600 dark:text-red-400 border-red-200 dark:border-red-800">
                          {pp}
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

      {/* Acquisition Channels */}
      {channels.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Acquisition Channels</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {channels.map((ch, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-sm border-b border-muted pb-2 last:border-0 last:pb-0"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium">{ch.name}</span>
                    {ch.channelType && (
                      <Badge className={`text-[10px] px-1.5 py-0 ${CHANNEL_TYPE_COLORS[ch.channelType] ?? ""}`}>
                        {ch.channelType}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
                    {ch.monthly_budget != null && ch.monthly_budget > 0 && (
                      <span>{formatCurrency(ch.monthly_budget)}/mo</span>
                    )}
                    {ch.expected_cac != null && ch.expected_cac > 0 && (
                      <span>CAC {formatCurrency(ch.expected_cac)}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sales Funnel */}
      {funnelStages.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Sales Funnel</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {funnelStages.map((fs, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{fs.name}</span>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{fs.metric}: {formatNumber(fs.target_value)}</span>
                      {fs.conversionRateEstimate != null && (
                        <Badge variant="outline" className="text-[10px]">
                          {(fs.conversionRateEstimate * 100).toFixed(0)}%
                        </Badge>
                      )}
                    </div>
                  </div>
                  {/* Funnel narrowing bar */}
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-blue-500 transition-all"
                      style={{
                        width: `${Math.max(100 - i * (100 / funnelStages.length), 10)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Deal Stages */}
      {dealStages.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Deal Stages</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {dealStages.map((ds, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 text-sm border-b border-muted pb-2 last:border-0 last:pb-0"
                >
                  <Badge variant="outline" className="text-xs shrink-0 mt-0.5">
                    {ds.avg_duration_days != null ? `${ds.avg_duration_days}d` : "\u2014"}
                  </Badge>
                  <div>
                    <span className="font-medium">{ds.name}</span>
                    {ds.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {ds.description}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Customer Journey */}
      {customerJourney.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Customer Journey</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {customerJourney.map((cj, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 text-sm border-b border-muted pb-2 last:border-0 last:pb-0"
                >
                  <span className="shrink-0 w-5 h-5 rounded-full bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center text-[10px] font-bold mt-0.5">
                    {i + 1}
                  </span>
                  <div className="space-y-0.5">
                    <span>{cj.step}</span>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      {cj.funnel_stage && <span>{cj.funnel_stage}</span>}
                      {cj.touchpoint && (
                        <>
                          <span className="opacity-50">&middot;</span>
                          <span>{cj.touchpoint}</span>
                        </>
                      )}
                    </div>
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
                          : String(value ?? "\u2014")}
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

1. **Data handling correctness**: Does the renderer safely extract and normalize advisory data? Are there edge cases that could crash (null arrays, missing keys, unexpected types)?
2. **Visual hierarchy**: Is the most important information (decision, score, key metrics) displayed first? Is the information density appropriate for the data type?
3. **Layout responsiveness**: Does the layout work on mobile/tablet/desktop? Are grid breakpoints sensible?
4. **Gate implementation**: Stage 10 renders a Chairman Brand Governance Gate (binary approved/pending). Stage 12 renders a Phase 3->4 reality gate (PASS/BLOCKED). Both have `gateType: 'none'` in config. How well do these non-enforced gates communicate their status? Are they confusing relative to enforced kill gates in other groups?
5. **Loading/empty states**: What does the user see while data is being generated? Is the fallback UX helpful?
6. **Accessibility**: Color contrast, screen reader support, keyboard navigation.
7. **Tabbed UI effectiveness** (Stages 10-11 specific): Do the internal tabs effectively organize complex data? Do they hide important information that should be immediately visible? Is the tab count appropriate for the data density?

### Cross-Stage Analysis
Evaluate the group as a whole:

1. **Identity narrative coherence**: Brand Foundation (personas, genome, naming) -> Visual Identity (colors, typography, expression) -> GTM & Sales (market tiers, channels, funnel). Does this sequence tell a coherent identity-to-market story? Would a different ordering make more sense?
2. **Pattern consistency**: Do similar concepts (banners, metric cards, collapsible sections, candidate scoring, naming decisions) look and behave the same across stages?
3. **Information flow between stages**: Do later stages build on earlier ones? Stage 10 establishes personas and brand genome. Does Stage 11's visual identity reference those personas? Does Stage 12's market tiers connect to Stage 10's customer segments?
4. **Naming mismatch impact**: Stage 11 (`GtmStrategy`) renders Visual Identity. Stage 12 (`SalesSuccessLogic`) renders GTM & Sales Strategy. What is the developer experience impact? Could this cause routing bugs or confusion during maintenance?
5. **Tabbed UI consistency**: Stage 10 uses 5 internal tabs, Stage 11 uses 4 internal tabs, Stage 12 uses no internal tabs (flat layout). Is this inconsistency justified by data density differences, or does it create a jarring experience?
6. **Chairman gate vs phantom gate**: Two different non-enforced gate patterns in one group. Stage 10 has a binary approved/pending chairman gate. Stage 12 has a binary PASS/BLOCKED reality gate. Neither is enforced by the stage-advance-worker. Does having two non-enforced gate UI patterns in one 3-stage group create confusion about which gates actually block progression?

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
