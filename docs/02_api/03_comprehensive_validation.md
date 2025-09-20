# Stage 03 – Comprehensive Validation Enhanced PRD (v4)

**Status:** EHG Integrated • **Owner:** LEAD Agent (Strategic) • **Scope:** Multi-agent validation with Chairman oversight  
**Stack:** React + Vite + Tailwind • TypeScript/Zod • Supabase • OpenAI Voice Integration

## EHG Management Model Integration

### Performance Drive Cycle Validation
**Strategic Validation Framework:**
- **Strategy Development:** Validation ensures alignment with EHG portfolio strategy
- **Goal Setting:** Each validation contributes to company-specific venture quality goals
- **Plan Development:** Validation results inform tactical planning workflows
- **Implementation & Monitoring:** Chairman Console receives validation intelligence for strategic decisions

### Multi-Agent Validation Orchestration
**Agent Responsibilities:**
- **LEAD Agent (Gemini):** Strategic market validation and portfolio fit analysis
- **PLAN Agent (Cursor):** Tactical feasibility and resource requirement assessment
- **EXEC Agent (Claude):** Technical validation and implementation complexity analysis
- **EVA Agent:** Real-time validation orchestration and quality assurance
- **Chairman:** Strategic override authority and validation priority setting

### Multi-Company Portfolio Context
**Cross-Company Validation:**
- Ideas validated against all EHG portfolio company contexts
- Cross-company synergy opportunities identified during validation
- Resource sharing implications assessed
- Strategic conflicts flagged for Chairman review

---

## 1) Purpose & Scope
Perform comprehensive multi-agent validation of venture ideas within the EHG Management Model framework, combining LEAD strategic analysis, PLAN tactical assessment, and EXEC technical evaluation. Output includes Chairman Console integration, voice-enabled feedback, and cross-portfolio company impact analysis with strict governance compliance.

- Inputs: `DraftIdea` (Stage 01), `AI Review` result (Stage 02), optional competitor list, basic tech outline, and forecast assumptions.
- Outputs: `ValidationResult` (stored), Chairman override (optional), event to next stage.

---

## 2) Objectives & KPIs
- **O1:** Validate every idea across **market**, **technical**, and **financial** rubrics with transparent scoring.
- **O2:** Enforce KPI thresholds and produce a clear **pass/fail** outcome with rationales and next steps.
- **O3:** Provider-agnostic LLM usage with graceful fallback to deterministic results.
- **KPIs:**
  - **100%** of ideas validated within **≤ 60s** median (p50), **≤ 90s** p95
  - **0 schema leaks**: all outputs conform to Zod schemas
  - **100%** overrides logged and linked
  - **< 5%** LLM schema-repair attempts

---

## 3) Data Contracts (TypeScript/Zod)
```ts
// /features/comprehensive_validation/schemas.ts
import { z } from "zod";

/** Input attachments (optional) */
export const CompetitorSchema = z.object({
  name: z.string(),
  url: z.string().url().optional(),
  positioning: z.string().optional(),
  priceNotes: z.string().optional()
});
export type Competitor = z.infer<typeof CompetitorSchema>;

export const TechOutlineSchema = z.object({
  targetStack: z.array(z.string()).default([]),
  integrations: z.array(z.string()).default([]),
  constraints: z.array(z.string()).default([]),
});
export type TechOutline = z.infer<typeof TechOutlineSchema>;

export const FinanceAssumptionsSchema = z.object({
  price: z.number().positive(),
  grossMarginPct: z.number().min(0).max(1),
  cac: z.number().nonnegative(),
  churnPctMo: z.number().min(0).max(1),
  ltvMonths: z.number().min(1).max(120),
});
export type FinanceAssumptions = z.infer<typeof FinanceAssumptionsSchema>;

/** Core result */
export const DimensionKey = z.enum(["market","technical","financial"]);

export const DimensionResultSchema = z.object({
  key: DimensionKey,
  score: z.number().min(1).max(10),
  pass: z.boolean(),
  rationale: z.string().min(12).max(1200),
  blockers: z.array(z.string()).max(10).optional(),
  recommendations: z.array(z.string()).max(10).optional(),
});

export const ValidationResultSchema = z.object({
  ideaId: z.string(),
  dimensions: z.array(DimensionResultSchema).length(3),
  overall: z.number().min(1).max(10),
  kpiThresholdsMet: z.boolean(),
  decision: z.enum(["advance","revise","reject"]),
  createdAt: z.string().datetime(),
  provider: z.string().optional(),
  model: z.string().optional(),
  tokens: z.object({ input: z.number(), output: z.number() }).optional(),
  costUsd: z.number().nonnegative().optional(),
  latencyMs: z.number().nonnegative().optional(),
});
export type ValidationResult = z.infer<typeof ValidationResultSchema>;
````

**Database Schema Integration**

**Canonical Schema Reference**: `enhanced_prds/stage_56_database_schema_enhanced.md`

Stage 03 integrates with canonical database schemas for comprehensive validation workflows:

#### Core Entity Dependencies
- **Venture Entity**: Ideas and validation state from previous stages
- **Chairman Feedback Schema**: Executive validation overrides and strategic input
- **Feedback Intelligence Schema**: AI-powered validation scoring and analysis
- **Validation Results Schema**: Standardized validation outcome tracking
- **Audit Trail Schema**: Complete validation process documentation

#### Universal Contract Enforcement
- **Validation Data Contracts**: All validation results conform to Stage 56 contracts
- **Multi-Dimensional Scoring**: Scoring schemas aligned with canonical definitions
- **Decision Audit Trails**: Validation decisions tracked per canonical audit requirements
- **Cross-Stage Data Flow**: Validation outcomes properly formatted for downstream stages

```typescript
// Canonical schema integration for validation
interface Stage03DatabaseIntegration {
  ventureEntity: Stage56VentureSchema;
  validationResults: Stage56ValidationSchema;
  chairmanOverrides: Stage56ChairmanFeedbackSchema;
  auditTrail: Stage56AuditSchema;
  performanceMetrics: Stage56MetricsSchema;
}
```

**Integration Hub Connectivity**

**Integration Hub Reference**: `enhanced_prds/stage_51_integration_hub_enhanced.md`

Validation processes leverage Integration Hub for AI service coordination:

#### External AI Service Integration
- **Multi-Model AI Validation**: Coordinated AI validation via Integration Hub connectors
- **External Data Sources**: Market data and competitive intelligence via managed APIs
- **Analytics Integration**: Validation performance streaming to analytics platforms
- **Third-Party Validators**: External validation service integration with contract enforcement

```typescript
// Integration Hub for validation services
interface Stage03IntegrationHub {
  aiValidationConnector: Stage51AIServiceConnector;
  marketDataConnector: Stage51ExternalDataConnector;
  analyticsConnector: Stage51AnalyticsConnector;
  thirdPartyValidatorConnector: Stage51ExternalServiceConnector;
}
```

**DB (Supabase) Stage-Specific Tables**

* `validations`: `id uuid pk`, `idea_id fk`, `dimensions jsonb`, `overall numeric`, `kpi_thresholds_met bool`, `decision text`, `provider text`, `model text`, `tokens_in int`, `tokens_out int`, `cost_usd numeric`, `latency_ms int`, `created_at timestamptz`
* Reuse `llm_calls` (telemetry) and `chairman_feedback` (overrides)

---

## 4) Deterministic Rules Engine (Business Logic)

Concrete, testable rules produce **baseline** scores before AI synthesis.

```ts
// /features/comprehensive_validation/rules.ts
import { Competitor, FinanceAssumptions, TechOutline } from "./schemas";

export type MarketInputs = {
  tamUsd: number;       // total addressable market
  growthRateYoY: number; // 0..1
  competitors: Competitor[];
  problemClarity: number; // 0..2 (from Stage 02 signals or heuristic)
};

export type TechnicalInputs = {
  tech: TechOutline;
  complexityPoints: number; // story-points-esque estimate, 20 good / 100 high risk
  teamCapability: number;   // 0..2 (in-house/tooling maturity)
  integrationRisk: number;  // 0..2 (sum of brittle deps)
};

export type FinancialInputs = FinanceAssumptions & {
  // derived:
  ltvToCacMin: number; // min acceptable LTV/CAC (e.g., 3)
};

export const THRESHOLDS = {
  market: { minScore: 6, minTAM: 1_000_000, maxCompetitors: 12, minGrowth: 0.05 },
  technical: { minScore: 6, maxComplexity: 80, maxIntegrationRisk: 2 },
  financial: { minScore: 6, minGM: 0.5, minLtvToCac: 3, maxPaybackMonths: 18 },
  overallPass: { minAvg: 7, minEach: 6 },
};

export function scoreMarket(m: MarketInputs): { score:number; pass:boolean; notes:string[] } {
  const notes:string[] = [];
  let score = 1;
  if (m.tamUsd >= THRESHOLDS.market.minTAM) score += 3; else notes.push("Small TAM");
  if (m.growthRateYoY >= THRESHOLDS.market.minGrowth) score += 2; else notes.push("Low growth rate");
  if (m.competitors.length <= THRESHOLDS.market.maxCompetitors) score += 2; else notes.push("Crowded competitive set");
  score += m.problemClarity; // 0..2
  score = Math.max(1, Math.min(10, score));
  return { score, pass: score >= THRESHOLDS.market.minScore, notes };
}

export function scoreTechnical(t: TechnicalInputs): { score:number; pass:boolean; notes:string[] } {
  const notes:string[] = [];
  let score = 1;
  if (t.complexityPoints <= THRESHOLDS.technical.maxComplexity) score += 3; else notes.push("High complexity");
  if (t.integrationRisk <= THRESHOLDS.technical.maxIntegrationRisk) score += 2; else notes.push("Integration risk");
  score += t.teamCapability;  // 0..2
  score += t.tech.targetStack.length ? 1 : 0;
  score = Math.max(1, Math.min(10, score));
  return { score, pass: score >= THRESHOLDS.technical.minScore, notes };
}

export function scoreFinancial(f: FinancialInputs): { score:number; pass:boolean; notes:string[]; paybackMonths:number; ltvToCac:number } {
  const notes:string[] = [];
  const arpu = f.price; // simplification for Stage 03
  const ltv = arpu * f.ltvMonths * f.grossMarginPct;
  const ltvToCac = ltv / Math.max(1, f.cac);
  const paybackMonths = Math.ceil(f.cac / Math.max(1, arpu * f.grossMarginPct));

  let score = 1;
  if (f.grossMarginPct >= THRESHOLDS.financial.minGM) score += 3; else notes.push("Low gross margin");
  if (ltvToCac >= THRESHOLDS.financial.minLtvToCac) score += 3; else notes.push("Weak LTV/CAC");
  if (paybackMonths <= THRESHOLDS.financial.maxPaybackMonths) score += 2; else notes.push("Slow CAC payback");
  score = Math.max(1, Math.min(10, score));

  const pass = score >= THRESHOLDS.financial.minScore;
  return { score, pass, notes, paybackMonths, ltvToCac };
}

export function decide(overall:number, dims:{market:number;technical:number;financial:number}) {
  const passAll = overall >= THRESHOLDS.overallPass.minAvg &&
                  dims.market >= THRESHOLDS.overallPass.minEach &&
                  dims.technical >= THRESHOLDS.overallPass.minEach &&
                  dims.financial >= THRESHOLDS.overallPass.minEach;
  return passAll ? "advance" : overall >= 5 ? "revise" : "reject";
}
```

---

## 5) LLM Synthesis (Provider-Agnostic)

LLM enhances **rationales**, **blockers**, and **recommendations** while returning strict JSON. On failure, the deterministic result still ships.

```ts
// /features/comprehensive_validation/ai.ts
import { z } from "zod";
import { useEVA } from "@/features/_llm/useEVA";
import { DimensionResultSchema, ValidationResultSchema, ValidationResult } from "./schemas";

const AIDimensionArraySchema = z.array(DimensionResultSchema).length(3);
type AIDimensions = z.infer<typeof AIDimensionArraySchema>;

export async function performValidationAI(input: {
  idea: { id: string; title: string; description: string };
  market: { tamUsd:number; growthRateYoY:number; competitors:any[]; problemClarity:number; baseScore:number };
  technical: { complexityPoints:number; teamCapability:number; integrationRisk:number; targetStack:string[]; baseScore:number };
  financial: { price:number; grossMarginPct:number; cac:number; churnPctMo:number; ltvMonths:number; paybackMonths:number; ltvToCac:number; baseScore:number };
}): Promise<AIDimensions> {
  const eva = useEVA();
  const prompt = {
    system: [
      "Validate a startup idea across market, technical, and financial.",
      "For each dimension, return {key, score 1-10, pass, rationale (<=6 sentences), blockers[], recommendations[]}.",
      "Reflect provided baselines where reasonable; adjust if you have strong rationale."
    ].join(" "),
    user: JSON.stringify(input)
  };
  return eva.generateStructuredResponse<AIDimensions>(prompt, {
    schema: AIDimensionArraySchema,
    stage: "comprehensive_validation",
    modelRequirements: { minContextWindow: 8000, needsJsonMode: true }
  });
}
```

---

## 6) Service Orchestration

Blend deterministic scores with AI results using a tunable weight; enforce thresholds; persist.

```ts
// /features/comprehensive_validation/service.ts
import { ValidationResult, ValidationResultSchema } from "./schemas";
import { scoreMarket, scoreTechnical, scoreFinancial, decide } from "./rules";
import { performValidationAI } from "./ai";

export async function runComprehensiveValidation(ctx: {
  idea: { id:string; title:string; description:string };
  market: { tamUsd:number; growthRateYoY:number; competitors:any[]; problemClarity:number };
  technical: { complexityPoints:number; teamCapability:number; integrationRisk:number; targetStack:string[] };
  financial: { price:number; grossMarginPct:number; cac:number; churnPctMo:number; ltvMonths:number; ltvToCacMin:number };
}): Promise<ValidationResult> {
  // 1) Deterministic baselines
  const m = scoreMarket({ ...ctx.market, competitors: ctx.market.competitors });
  const t = scoreTechnical({ ...ctx.technical, tech: { targetStack: ctx.technical.targetStack, integrations: [], constraints: [] } });
  const f = scoreFinancial({ ...ctx.financial });

  // 2) Ask AI for rationales + adjustments
  let dimensionsAI;
  try {
    dimensionsAI = await performValidationAI({
      idea: ctx.idea,
      market: { ...ctx.market, competitors: ctx.market.competitors, baseScore: m.score },
      technical: { ...ctx.technical, baseScore: t.score },
      financial: { ...ctx.financial, paybackMonths: f.paybackMonths, ltvToCac: f.ltvToCac, baseScore: f.score }
    });
  } catch {
    dimensionsAI = [
      { key: "market", score: m.score, pass: m.pass, rationale: (m.notes.join("; ") || "Deterministic baseline."), blockers: [], recommendations: [] },
      { key: "technical", score: t.score, pass: t.pass, rationale: (t.notes.join("; ") || "Deterministic baseline."), blockers: [], recommendations: [] },
      { key: "financial", score: f.score, pass: f.pass, rationale: (f.notes.join("; ") || "Deterministic baseline."), blockers: [], recommendations: [] }
    ] as const;
  }

  // 3) Weighted fusion (default 30% deterministic, 70% AI)
  const wBase = 0.30, wAI = 0.70;
  const fused = {
    market: Math.round(m.score*wBase + dimensionsAI.find(d=>d.key==="market")!.score*wAI),
    technical: Math.round(t.score*wBase + dimensionsAI.find(d=>d.key==="technical")!.score*wAI),
    financial: Math.round(f.score*wBase + dimensionsAI.find(d=>d.key==="financial")!.score*wAI),
  };
  const overall = Math.round((fused.market + fused.technical + fused.financial) / 3);
  const decision = decide(overall, fused);

  const final: ValidationResult = ValidationResultSchema.parse({
    ideaId: ctx.idea.id,
    dimensions: dimensionsAI.map(d => ({ ...d, score: (d.key==="market"?fused.market:d.key==="technical"?fused.technical:fused.financial) })),
    overall,
    kpiThresholdsMet: decision === "advance",
    decision,
    createdAt: new Date().toISOString(),
    // provider/model/tokens/cost/latency are captured by EVA telemetry; may be echoed in a persistence step
  });

  return final;
}
```

---

## 7) UI – Validation Dashboard

```tsx
// /features/comprehensive_validation/ValidationDashboard.tsx
import { useState, useEffect } from "react";
import { ValidationResult } from "./schemas";
import { LLMProviderBadge } from "@/features/_llm/ui/LLMProviderBadge";

export const ValidationDashboard = ({ run, ideaId }:{ run:()=>Promise<ValidationResult>, ideaId:string }) => {
  const [res, setRes] = useState<ValidationResult|null>(null);
  const [err, setErr] = useState<string|null>(null);
  useEffect(()=>{ run().then(setRes).catch(e=>setErr(String(e))); },[run]);

  if (err) return <div className="rounded-xl border p-4 text-red-600">Validation failed: {err}</div>;
  if (!res) return <div className="rounded-xl border p-4 animate-pulse">Validating…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Comprehensive Validation</h3>
        <div className="flex gap-2">
          {res.provider && res.model && <LLMProviderBadge provider={res.provider} model={res.model} />}
          {res.costUsd != null && <span className="text-xs opacity-60">${res.costUsd.toFixed(4)}</span>}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {res.dimensions.map(d => (
          <div key={d.key} className="rounded-xl border p-3">
            <div className="text-sm opacity-70">{d.key}</div>
            <div className={`text-2xl font-bold ${d.pass ? "text-emerald-600":"text-rose-600"}`}>{d.score}/10</div>
            <p className="text-sm mt-1">{d.rationale}</p>
            {!!d.blockers?.length && <ul className="mt-2 text-sm list-disc pl-4">{d.blockers.map((b,i)=><li key={i}>{b}</li>)}</ul>}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <DecisionBadge value={res.decision} />
        <div className="text-sm opacity-70">Overall: {res.overall}/10 • KPI: {res.kpiThresholdsMet ? "Met" : "Not Met"}</div>
      </div>
      <ChairmanOverrideControls validation={res} ideaId={ideaId}/>
    </div>
  );
};

const DecisionBadge = ({ value }:{value:"advance"|"revise"|"reject"}) => {
  const styles = { advance:"bg-emerald-100 text-emerald-700", revise:"bg-amber-100 text-amber-700", reject:"bg-rose-100 text-rose-700" };
  return <span className={`px-2 py-1 rounded-md text-sm ${styles[value]}`}>{value.toUpperCase()}</span>;
};

// Implement ChairmanOverrideControls to capture accept/revise/reject with optional voice note
```

---

## 8) API & Orchestration

### 8.1 Preferred (Supabase)

* Insert row into `validations` after `runComprehensiveValidation`.
* Join with `llm_calls` via `trace_id` (from EVA) for telemetry views.
* Store overrides into `chairman_feedback` (`subject_type='validation'`).

### 8.2 HTTP Routes (fallback)

* `POST /api/validation/run` → **Body** `{ ideaId, market, technical, financial }` → **200** `ValidationResult`
* `GET /api/validation/:id` → returns stored artifact

---

## 9) Provider Switching & Policies

* Uses **EVA LLM Router** with stage key `comprehensive_validation`.
* Example policy (in `/features/_llm/llm.config.ts`):

```ts
export const STAGE_MODEL_POLICY = {
  comprehensive_validation: {
    primary: ["anthropic","claude-3-5-sonnet"],
    fallback: [["openai","gpt-4.1-mini"], ["gemini","gemini-2.0-pro"], ["local","llama-3.1-70b"]]
  }
};
```

* On failure, deterministic-only result still produced.

---

## 10) Telemetry, Cost & Auditing

* EVA logs provider, model, tokens, latency, and **USD cost** into `llm_calls`.
* `validations` table stores a copy of roll-up telemetry.
* Dashboard displays **ProviderBadge** and cost.
* Alerts on repeated **ALL\_PROVIDERS\_FAILED**.

---

## 11) Error Handling & Fallbacks

* One **schema-repair** attempt for near-JSON from LLM.
* **Provider fallback chain** with minimal retries per provider.
* Deterministic-only result if AI layer unavailable.
* Clear UI states: running, partial, failure, override.

---

## 12) Accessibility

* Keyboard accessible controls; focus management post-validation.
* Live region status for “Validating…”.
* Color contrast ≥ 4.5:1 for pass/fail badges.

---

## 13) Security & Privacy

* Redact PII from prompts by default.
* Store only schema-validated JSON (no raw model text).
* RLS: Owners and Chairman can view; others denied.

---

## 14) Test Plan

* **Unit:** `scoreMarket`, `scoreTechnical`, `scoreFinancial`, `decide`.
* **Contract:** `ValidationResultSchema` strict parsing.
* **Integration:** LLM fail → fallback provider → deterministic fallback.
* **E2E:** Stage 01 → Stage 02 → Stage 03 end-to-end path including override.
* **Performance:** p50 < 60s with 1 fallback; deterministic path < 3s.

---

## 15) Acceptance Criteria (DoD)

* ✅ `ValidationResult` stored and strictly schema-valid.
* ✅ Decision consistent with thresholds; rationales present.
* ✅ Provider switching works with no code changes.
* ✅ Chairman override captured (text/voice) and linked.
* ✅ UI dashboard shows dimension scores, blockers, recommendations.

---

## 16) Development Checklist

* [ ] Create `/features/comprehensive_validation/` with `schemas.ts`, `rules.ts`, `ai.ts`, `service.ts`, `ValidationDashboard.tsx`.
* [ ] Add Supabase tables/RLS or API routes.
* [ ] Wire EVA LLM Router stage policy.
* [ ] Add analytics and cost logging.
* [ ] Implement `ChairmanOverrideControls` (voice optional).
* [ ] Unit/integration/E2E tests in CI.
* [ ] Docs: ENV (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, local LLM URL).

---

## 17) Changelog

* **v2 (this doc):** Added deterministic scoring rules, provider-agnostic LLM synthesis, schemas, thresholds, UI, telemetry, error handling, and DoD.
* **v1:** Business-only PRD with generic “validate market/technical/financial.”

