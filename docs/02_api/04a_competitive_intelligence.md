---
category: api
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [api, auto-generated]
---
# Stage 04 – Competitive Intelligence Enhanced PRD (v4)



## Table of Contents

- [Metadata](#metadata)
- [EHG Management Model Integration](#ehg-management-model-integration)
  - [Strategic Intelligence Framework](#strategic-intelligence-framework)
  - [Multi-Agent Intelligence Coordination](#multi-agent-intelligence-coordination)
  - [Multi-Company Competitive Intelligence](#multi-company-competitive-intelligence)
- [1) Purpose & Scope](#1-purpose-scope)
- [2) Objectives & KPIs](#2-objectives-kpis)
- [3) Data Contracts (TypeScript/Zod)](#3-data-contracts-typescriptzod)
- [4) Business Logic (Deterministic Analytics)](#4-business-logic-deterministic-analytics)
  - [4.1 Weighted Coverage Score](#41-weighted-coverage-score)
  - [4.2 Differentiation Score (vs. best competitor)](#42-differentiation-score-vs-best-competitor)
  - [4.3 Defensibility Grade](#43-defensibility-grade)
- [5) UI Component Specs (React + Tailwind)](#5-ui-component-specs-react-tailwind)
- [5.5) Database Schema Integration](#55-database-schema-integration)
  - [Integration Hub Connectivity](#integration-hub-connectivity)
- [6) B2C SaaS Competitive Intelligence Integration](#6-b2c-saas-competitive-intelligence-integration)
- [7) SaaS Intelligence & Replication System Integration](#7-saas-intelligence-replication-system-integration)
- [7) Optional AI Hooks (Provider-Agnostic via EVA)](#7-optional-ai-hooks-provider-agnostic-via-eva)
- [7) API Contracts](#7-api-contracts)
  - [7.1 Supabase Tables (preferred)](#71-supabase-tables-preferred)
  - [7.2 HTTP Endpoints (fallback)](#72-http-endpoints-fallback)
- [8) Eventing & Voice](#8-eventing-voice)
- [9) Error Handling & UX](#9-error-handling-ux)
- [10) Security & Privacy](#10-security-privacy)
- [11) Test Plan](#11-test-plan)
- [12) Acceptance Criteria (DoD)](#12-acceptance-criteria-dod)
- [13) Development Checklist](#13-development-checklist)
- [14) Changelog](#14-changelog)

## Metadata
- **Category**: API
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, api, e2e, unit

**Status:** EHG Integrated • **Owner:** LEAD Agent (Strategic) • **Scope:** Multi-agent intelligence with Chairman oversight  
**Stack:** React + Vite + Tailwind • TypeScript/Zod • Supabase • OpenAI Voice Integration

## EHG Management Model Integration

### Strategic Intelligence Framework
**Performance Drive Cycle Integration:**
- **Strategy Development:** Competitive intelligence informs portfolio strategy across EHG companies
- **Goal Setting:** Competition analysis sets market positioning goals
- **Plan Development:** Competitive insights drive tactical planning  
- **Implementation & Monitoring:** Continuous competitive monitoring via Chairman Console

### Multi-Agent Intelligence Coordination
**Agent Responsibilities:**
- **LEAD Agent (Gemini):** Strategic competitive positioning analysis across portfolio
- **PLAN Agent (Cursor):** Tactical competitive response planning
- **EXEC Agent (Claude):** Technical competitive feature analysis
- **EVA Agent:** Real-time intelligence orchestration and synthesis
- **Chairman:** Strategic competitive decisions and priority setting

### Multi-Company Competitive Intelligence
**Cross-Portfolio Analysis:**
- Competitive intelligence shared across all EHG portfolio companies
- Cross-company competitive advantage identification
- Coordinated competitive responses across portfolio
- Chairman oversight of competitive strategic decisions

---

## 1) Purpose & Scope
Establish comprehensive competitive intelligence across the EHG portfolio using multi-agent analysis to capture competitor data, assess cross-company competitive positioning, and generate coordinated defensibility strategies with Chairman Console integration for strategic competitive decisions.

**Feeds:**  
→ Stage 05 (Profitability), 06 (Risk), 09 (Gap Analysis), 15 (Pricing), 17 (GTM)

---

## 2) Objectives & KPIs
- **O1:** Capture and update competitor profiles and feature matrices with strict schemas.  
- **O2:** Compute **Differentiation Score** and **Defensibility Grade** deterministically.  
- **O3 (opt):** Provide AI-assisted landscape summaries and strategy drafts (provider-agnostic).  

**KPIs**
- ≥ **3** benchmark competitors per idea
- Dashboard renders **≤ 2s** for ≤ 20 competitors, 100 features
- 100% Chairman feedback stored & linked
- Optional AI suggestions return in **≤ 10s** median

---

## 3) Data Contracts (TypeScript/Zod)
```ts
// /features/competitive_intelligence/schemas.ts
import { z } from "zod";

export const CompetitorSchema = z.object({
  id: z.string().uuid().optional(),
  ideaId: z.string(),
  name: z.string().min(2),
  website: z.string().url().optional(),
  marketSegment: z.string().optional(),
  pricingNotes: z.string().optional(),
  notes: z.string().optional(),
  marketShareEstimatePct: z.number().min(0).max(100).nullable().optional(),
  lastUpdated: z.string().datetime().optional(),
  // SaaS Intelligence Integration
  automatedFeatures: z.array(z.string()).optional(),
  screenshots: z.array(z.string()).optional(),
  domStructure: z.any().optional(),
  marketFeedback: z.any().optional(),
  sentimentAnalysis: z.object({
    positive: z.number(),
    negative: z.number(),
    neutral: z.number(),
    overallSentiment: z.enum(["positive", "negative", "neutral"]),
    keyThemes: z.array(z.string()),
    // B2C SaaS specific sentiment metrics
    net_sentiment_score: z.number().min(-1).max(1), // -1 to 1 scale
    review_velocity: z.number(), // Reviews per month
    sentiment_trend: z.enum(["improving", "stable", "declining"])
  }).optional(),
  replicationBlueprint: z.object({
    coreFeatures: z.array(z.string()),
    techStack: z.array(z.string()),
    implementationComplexity: z.enum(["low", "medium", "high"]),
    estimatedTimeline: z.string(),
    keyDifferentiators: z.array(z.string())
  }).optional()
});
export type Competitor = z.infer<typeof CompetitorSchema>;

export const FeatureSchema = z.object({
  key: z.string().min(2),               // canonical key (slug)
  label: z.string().min(2),
  category: z.enum(["core","advanced","moat"]).default("core"),
  weight: z.number().min(0).max(10).default(1) // relative importance
});
export type Feature = z.infer<typeof FeatureSchema>;

export const FeatureCoverageSchema = z.object({
  competitorId: z.string(),
  featureKey: z.string(),
  coverage: z.enum(["none","partial","full"]).default("none")
});
export type FeatureCoverage = z.infer<typeof FeatureCoverageSchema>;

export const MarketDefenseStrategySchema = z.object({
  id: z.string().uuid().optional(),
  ideaId: z.string(),
  recommendation: z.string().min(8),
  rationale: z.string().min(8),
  category: z.enum(["positioning","pricing","partnerships","distribution","product","data","switchingCosts","brand"]).default("product"),
  createdAt: z.string().datetime().optional()
});
export type MarketDefenseStrategy = z.infer<typeof MarketDefenseStrategySchema>;

// B2C SaaS Competitive Intelligence System Schemas
export const CompetitiveKPISchema = z.object({
  kpi_id: z.string().uuid().optional(),
  venture_id: z.string(),
  competitor_id: z.string(),
  
  // Financial Health Metrics (estimated from public data)
  estimated_arr: z.number().optional(),
  arr_growth_rate: z.number().optional(), // QoQ or YoY
  ltv_cac_ratio: z.number().optional(),
  estimated_runway_months: z.number().optional(),
  
  // Customer Voice Metrics (B2C specific)
  net_sentiment_score: z.number().min(-1).max(1), // -1 to 1 scale
  review_velocity: z.number(), // Reviews per month
  dau_mau_ratio: z.number().min(0).max(1).optional(), // For B2C engagement
  viral_coefficient: z.number().optional(), // K-factor
  
  // Product Momentum
  feature_release_cadence: z.number(), // Releases per quarter
  integration_count: z.number().optional(),
  app_store_rating: z.number().min(1).max(5).optional(),
  keyword_rankings: z.record(z.number()).optional(), // keyword -> position
  
  // Market Position
  share_of_voice: z.number().min(0).max(100), // Percentage
  technology_differentiation_index: z.number().min(0).max(100), // 0-100 scale
  category_growth_rate: z.number().optional(),
  
  // Metadata
  data_sources: z.array(z.string()),
  confidence_score: z.number().min(0).max(1),
  last_updated: z.string().datetime(),
  calculation_methodology: z.string(),
  
  snapshot_date: z.string().date()
});
export type CompetitiveKPI = z.infer<typeof CompetitiveKPISchema>;

export const OpportunitySignalSchema = z.object({
  signal_id: z.string().uuid().optional(),
  venture_id: z.string(),
  competitor_id: z.string().optional(),
  
  opportunity_type: z.enum(['weak_moat', 'eroding_moat', 'unmet_need', 'market_gap']),
  confidence: z.number().min(0).max(1),
  market_size_estimate: z.number().optional(),
  
  // Strategic insights
  recommended_strategy: z.object({
    product: z.array(z.string()).optional(), // Features to build
    pricing: z.array(z.string()).optional(), // Pricing strategies
    gtm: z.array(z.string()).optional(), // Go-to-market tactics
    timing: z.string().optional() // Optimal launch window
  }),
  
  // Moat analysis
  moat_type: z.enum(['network_effects', 'switching_costs', 'brand', 'scale', 'data']).optional(),
  moat_strength: z.number().min(0).max(10).optional(),
  erosion_signals: z.array(z.string()).optional(),
  
  chairman_approved: z.boolean().default(false),
  detected_at: z.string().datetime().optional()
});
export type OpportunitySignal = z.infer<typeof OpportunitySignalSchema>;

// SaaS Intelligence & Replication System Schemas
export const SaaSIntelligenceJobSchema = z.object({
  id: z.string().uuid().optional(),
  ideaId: z.string(),
  competitorId: z.string(),
  status: z.enum(["pending", "in_progress", "completed", "failed"]),
  jobType: z.enum(["screenshot", "feature_extraction", "sentiment_analysis", "blueprint_generation"]),
  config: z.object({
    targetUrl: z.string().url(),
    screenshotSettings: z.object({
      viewport: z.object({ width: z.number(), height: z.number() }),
      fullPage: z.boolean(),
      formats: z.array(z.enum(["png", "jpg", "webp"]))
    }).optional(),
    extractionSettings: z.object({
      includeText: z.boolean(),
      includeForms: z.boolean(),
      includeNavigation: z.boolean(),
      includeFooter: z.boolean()
    }).optional()
  }),
  results: z.any().optional(),
  error: z.string().optional(),
  createdAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional()
});
export type SaaSIntelligenceJob = z.infer<typeof SaaSIntelligenceJobSchema>;

export const AutomatedSWOTSchema = z.object({
  id: z.string().uuid().optional(),
  competitorId: z.string(),
  strengths: z.array(z.object({
    factor: z.string(),
    evidence: z.array(z.string()),
    confidence: z.number().min(0).max(1)
  })),
  weaknesses: z.array(z.object({
    factor: z.string(),
    evidence: z.array(z.string()),
    confidence: z.number().min(0).max(1)
  })),
  opportunities: z.array(z.object({
    factor: z.string(),
    marketPotential: z.enum(["low", "medium", "high"]),
    confidence: z.number().min(0).max(1)
  })),
  threats: z.array(z.object({
    factor: z.string(),
    severity: z.enum(["low", "medium", "high"]),
    confidence: z.number().min(0).max(1)
  })),
  generatedAt: z.string().datetime().optional(),
  dataSource: z.enum(["automated_scan", "manual_input", "hybrid"])
});
export type AutomatedSWOT = z.infer<typeof AutomatedSWOTSchema>;

export const ChairmanFeedbackSchema = z.object({
  id: z.string().uuid().optional(),
  ideaId: z.string(),
  subjectType: z.literal("competitive_intelligence"),
  note: z.string().min(3),
  mode: z.enum(["text","voice"]).default("text"),
  createdAt: z.string().datetime().optional()
});
export type ChairmanFeedback = z.infer<typeof ChairmanFeedbackSchema>;
````

---

## 4) Business Logic (Deterministic Analytics)

### 4.1 Weighted Coverage Score

Each competitor gets a weighted capability score; the venture (us) gets the same from our planned roadmap.

```ts
// /features/competitive_intelligence/metrics.ts
import { Feature, FeatureCoverage } from "./schemas";

type CoverageToPoints = { none: 0; partial: 0.5; full: 1 };
const COVERAGE_POINTS: CoverageToPoints = { none: 0, partial: 0.5, full: 1 };

export function capabilityScore(coverage: FeatureCoverage[], features: Feature[]) {
  const weightByKey = Object.fromEntries(features.map(f => [f.key, f.weight]));
  return coverage.reduce((sum, row) => {
    const w = weightByKey[row.featureKey] ?? 1;
    return sum + w * COVERAGE_POINTS[row.coverage];
  }, 0);
}
```

### 4.2 Differentiation Score (vs. best competitor)

Penalize parity on core features; reward moats and unique advanced features.

```ts
// /features/competitive_intelligence/metrics.ts (cont.)
export function differentiationScore(
  ourCoverage: FeatureCoverage[],
  bestCompCoverage: FeatureCoverage[],
  features: Feature[]
) {
  const catByKey = Object.fromEntries(features.map(f => [f.key, f.category]));
  const weightByKey = Object.fromEntries(features.map(f => [f.key, f.weight]));

  let score = 0;
  for (const f of features) {
    const our = ourCoverage.find(c => c.featureKey === f.key)?.coverage ?? "none";
    const their = bestCompCoverage.find(c => c.featureKey === f.key)?.coverage ?? "none";
    const w = weightByKey[f.key] ?? 1;
    const cat = catByKey[f.key] ?? "core";

    // reward leads, penalize trailing parity on core
    const delta = COVERAGE_POINTS[our] - COVERAGE_POINTS[their];
    if (delta > 0) score += w * (cat === "moat" ? 2 : 1);         // we lead
    if (delta === 0 && cat === "core" && our !== "none") score -= w * 0.5; // parity on core
    if (delta < 0) score -= w;                                     // they lead
  }
  return Math.max(-50, Math.min(50, Math.round(score))); // clamp to [-50, 50]
}
```

### 4.3 Defensibility Grade

Combine **Differentiation Score**, **estimated switching costs**, and **data network effects** flags.

```ts
export type DefensibilityInputs = {
  diffScore: number;           // -50..50 from above
  switchingCosts: 0|1|2|3;     // none..high (contract length, data migration pain)
  dataNetworkEffects: 0|1|2|3; // none..strong (flywheels, unique datasets)
};

export function defensibilityGrade(inp: DefensibilityInputs) {
  const raw = inp.diffScore + 5*inp.switchingCosts + 5*inp.dataNetworkEffects;
  const score = Math.max(0, Math.min(100, Math.round((raw + 50) )));
  const grade = score >= 80 ? "A" : score >= 65 ? "B" : score >= 50 ? "C" : "D";
  return { score, grade };
}
```

---

## 5) UI Component Specs (React + Tailwind)

```tsx
// /features/competitive_intelligence/CompetitorTable.tsx
import { Competitor } from "./schemas";

export const CompetitorTable = ({ rows }:{ rows: Competitor[] }) => (
  <div className="rounded-xl border p-4">
    <div className="flex items-center justify-between mb-3">
      <h3 className="font-semibold">Competitors</h3>
      <button className="btn">Add Competitor</button>
    </div>
    <table className="w-full text-sm">
      <thead><tr className="text-left">
        <th className="py-2">Name</th><th>Segment</th><th>Market Share</th><th>Updated</th>
      </tr></thead>
      <tbody>
        {rows.map(c=>(
          <tr key={c.id} className="border-t">
            <td className="py-2"><a className="text-blue-600 underline" href={c.website} target="_blank">{c.name}</a></td>
            <td>{c.marketSegment ?? "—"}</td>
            <td>{c.marketShareEstimatePct != null ? `${c.marketShareEstimatePct}%` : "—"}</td>
            <td>{c.lastUpdated?.slice(0,10) ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
```

```tsx
// /features/competitive_intelligence/FeatureMatrix.tsx
import { Feature, FeatureCoverage } from "./schemas";

export const FeatureMatrix = ({
  features, coverageByCompetitor
}:{ features: Feature[]; coverageByCompetitor: Record<string, FeatureCoverage[]> }) => {
  const competitorIds = Object.keys(coverageByCompetitor);
  return (
    <div className="rounded-xl border p-4 overflow-auto">
      <h3 className="font-semibold mb-3">Feature Comparison</h3>
      <table className="text-sm border-collapse">
        <thead>
          <tr>
            <th className="p-2 text-left">Feature</th>
            {competitorIds.map(id => <th key={id} className="p-2 text-left">{id}</th>)}
          </tr>
        </thead>
        <tbody>
          {features.map(f=>(
            <tr key={f.key} className="border-t">
              <td className="p-2">{f.label} <span className="text-xs opacity-60">({f.category})</span></td>
              {competitorIds.map(id=>{
                const cov = coverageByCompetitor[id].find(x=>x.featureKey===f.key)?.coverage ?? "none";
                const badge = cov==="full"?"bg-emerald-100 text-emerald-700":cov==="partial"?"bg-amber-100 text-amber-700":"bg-slate-100 text-slate-600";
                return <td key={id} className="p-2"><span className={`px-2 py-0.5 rounded ${badge}`}>{cov}</span></td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
```

```tsx
// /features/competitive_intelligence/StrategyPanel.tsx
import { MarketDefenseStrategy } from "./schemas";

export const StrategyPanel = ({
  strategies, onAdd
}:{ strategies: MarketDefenseStrategy[]; onAdd:(s:Omit<MarketDefenseStrategy,"id"|"createdAt">)=>void }) => (
  <div className="rounded-xl border p-4 space-y-3">
    <div className="flex items-center justify-between">
      <h3 className="font-semibold">Defensibility Strategies</h3>
      <button className="btn" onClick={()=>onAdd({
        ideaId:"", category:"product", recommendation:"", rationale:""
      })}>Add Strategy</button>
    </div>
    <ul className="space-y-2">
      {strategies.map((s,i)=>(
        <li key={i} className="rounded-lg border p-3">
          <div className="text-xs opacity-70">{s.category}</div>
          <div className="font-medium">{s.recommendation}</div>
          <div className="text-sm opacity-80 mt-1">{s.rationale}</div>
        </li>
      ))}
    </ul>
  </div>
);
```

---

## 5.5) Database Schema Integration

**Canonical Schema Reference**: `enhanced_prds/stage_56_database_schema_enhanced.md`

Stage 04 integrates with canonical database schemas for competitive intelligence and market analysis:

#### Core Entity Dependencies
- **Venture Entity**: Ideas and competitive positioning data from previous stages
- **Competitive Intelligence Schema**: Market analysis results and competitor tracking
- **Chairman Feedback Schema**: Executive strategic decisions on competitive positioning
- **Feedback Intelligence Schema**: AI-powered competitive sentiment and market analysis
- **Market Data Schema**: External market intelligence and competitive metrics

#### Universal Contract Enforcement
- **Competitive Data Contracts**: All market analysis results conform to Stage 56 contracts
- **KPI Tracking Consistency**: Competitive KPIs aligned with canonical performance schemas
- **Strategic Decision Audit**: Competitive decisions tracked per canonical audit requirements
- **Cross-Stage Intelligence Flow**: Market insights properly formatted for downstream stages

```typescript
// Database integration for competitive intelligence
interface Stage04DatabaseIntegration {
  ventureEntity: Stage56VentureSchema;
  competitiveIntelligence: Stage56CompetitiveIntelligenceSchema;
  marketAnalysis: Stage56MarketAnalysisSchema;
  chairmanStrategicDecisions: Stage56ChairmanFeedbackSchema;
  performanceKPIs: Stage56MetricsSchema;
}
```

### Integration Hub Connectivity

**Integration Hub Reference**: `enhanced_prds/stage_51_integration_hub_enhanced.md`

Competitive intelligence leverages Integration Hub for market data and external intelligence:

#### External Intelligence Integration
- **Market Data Providers**: Real-time competitive data via Integration Hub connectors
- **Social Intelligence APIs**: Social media and sentiment analysis through managed endpoints
- **Financial Data Sources**: Market performance and funding data via external API orchestration
- **Competitive Analysis Tools**: Third-party competitive intelligence service integration

```typescript
// Integration Hub for competitive intelligence
interface Stage04IntegrationHub {
  marketDataConnector: Stage51MarketDataConnector;
  socialIntelligenceConnector: Stage51SocialDataConnector;
  financialDataConnector: Stage51FinancialDataConnector;
  competitiveToolsConnector: Stage51CompetitiveToolsConnector;
}
```

## 6) B2C SaaS Competitive Intelligence Integration

Enhanced "Digital Telescope" system for automated competitive KPI tracking, opportunity matrix analysis, and strategic decision support for AI-managed B2C SaaS ventures.

```typescript
// /features/competitive_intelligence/services/b2c-competitive-data-collector.ts
export class B2CCompetitiveDataCollector {
  private collectors = {
    financial: new FinancialProxyCollector(),
    sentiment: new SentimentAnalyzer(),
    product: new ProductMomentumTracker(),
    market: new MarketPositionAnalyzer()
  };
  
  async collectB2CCompetitorData(competitor: CompetitorProfile): Promise<CompetitiveKPI> {
    // Parallel collection optimized for B2C SaaS metrics
    const [financial, voice, product, market] = await Promise.all([
      this.collectors.financial.estimateB2CMetrics(competitor),
      this.collectors.sentiment.analyzeCustomerVoice(competitor),
      this.collectors.product.trackB2CProductVelocity(competitor),
      this.collectors.market.calculateB2CMarketPosition(competitor)
    ]);
    
    return this.synthesizeB2CIntelligence(financial, voice, product, market);
  }
  
  private synthesizeB2CIntelligence(
    financial: FinancialMetrics,
    voice: VoiceMetrics, 
    product: ProductMetrics,
    market: MarketMetrics
  ): CompetitiveKPI {
    return {
      venture_id: this.ventureId,
      competitor_id: financial.competitor_id,
      
      // Financial estimates using public proxies
      estimated_arr: financial.arrEstimate,
      arr_growth_rate: financial.growthRate,
      ltv_cac_ratio: financial.unitEconomicsProxy,
      estimated_runway_months: financial.runwayEstimate,
      
      // B2C customer voice metrics
      net_sentiment_score: voice.netSentimentScore, // -1 to 1
      review_velocity: voice.reviewsPerMonth,
      dau_mau_ratio: voice.engagementRatio,
      viral_coefficient: voice.viralCoefficient,
      
      // Product momentum indicators
      feature_release_cadence: product.releasesPerQuarter,
      integration_count: product.integrationCount,
      app_store_rating: product.appStoreRating,
      keyword_rankings: product.keywordPositions,
      
      // Market position analysis
      share_of_voice: market.shareOfVoice,
      technology_differentiation_index: market.techDifferentiation,
      category_growth_rate: market.categoryGrowth,
      
      // Data quality metadata
      data_sources: ['linkedin', 'crunchbase', 'g2crowd', 'app_store', 'similarweb'],
      confidence_score: this.calculateConfidence([financial, voice, product, market]),
      last_updated: new Date().toISOString(),
      calculation_methodology: 'b2c_saas_proxy_estimation',
      snapshot_date: new Date().toISOString().split('T')[0]
    };
  }
}

// ARR Estimation from Public Data
export class ARREstimator {
  estimateFromHeadcount(
    employeeCount: number,
    industry: 'horizontal_saas' | 'vertical_saas' | 'consumer_saas',
    stage: 'seed' | 'series_a' | 'series_b' | 'series_c_plus'
  ): { min: number; max: number; confidence: number } {
    // B2C SaaS benchmarks (revenue per employee)
    const benchmarks = {
      consumer_saas: {
        seed: 180_000,      // $180k ARR per employee
        series_a: 220_000,  // $220k ARR per employee  
        series_b: 280_000,  // $280k ARR per employee
        series_c_plus: 350_000 // $350k ARR per employee
      },
      horizontal_saas: {
        seed: 200_000,
        series_a: 250_000,
        series_b: 320_000,
        series_c_plus: 400_000
      },
      vertical_saas: {
        seed: 160_000,
        series_a: 200_000,
        series_b: 250_000,
        series_c_plus: 320_000
      }
    };
    
    const revenuePerEmployee = benchmarks[industry][stage];
    
    return {
      min: employeeCount * revenuePerEmployee * 0.7,
      max: employeeCount * revenuePerEmployee * 1.3,
      confidence: employeeCount > 20 ? 0.8 : 0.6 // Higher confidence with more employees
    };
  }
  
  estimateFromAppStoreMetrics(
    downloads: number,
    rating: number,
    category: string
  ): { arr: number; confidence: number } {
    // B2C SaaS app store conversion rates
    const conversionRates = {
      productivity: 0.08,    // 8% trial-to-paid
      business: 0.12,        // 12% trial-to-paid
      finance: 0.15,         // 15% trial-to-paid
      education: 0.06        // 6% trial-to-paid
    };
    
    const avgPricePerUser = {
      productivity: 8,       // $8/month
      business: 15,          // $15/month
      finance: 12,           // $12/month
      education: 6           // $6/month
    };
    
    const conversionRate = conversionRates[category] || 0.08;
    const pricePerUser = avgPricePerUser[category] || 10;
    
    // Estimate ARR from downloads and rating
    const qualityMultiplier = rating >= 4.5 ? 1.2 : rating >= 4.0 ? 1.0 : 0.8;
    const paidUsers = downloads * conversionRate * qualityMultiplier;
    const arr = paidUsers * pricePerUser * 12;
    
    return {
      arr,
      confidence: downloads > 10000 ? 0.7 : 0.5
    };
  }
}

// Opportunity Matrix Analysis
export class OpportunityMatrixAnalyzer {
  generateB2COpportunityMatrix(
    competitors: CompetitiveKPI[],
    marketNeeds: CustomerFeedback[]
  ): OpportunityMatrix {
    const opportunities = [];
    
    // Identify weak moats with high customer needs
    for (const competitor of competitors) {
      const moatStrength = this.assessMoatStrength(competitor);
      const customerNeed = this.assessUnmetNeeds(competitor, marketNeeds);
      
      if (moatStrength < 5 && customerNeed > 7) {
        opportunities.push({
          opportunity_type: 'weak_moat' as const,
          competitor_id: competitor.competitor_id,
          confidence: 0.8,
          moat_strength: moatStrength,
          recommended_strategy: this.generateAttackStrategy(competitor, customerNeed)
        });
      }
      
      // Detect eroding moats (declining trends)
      if (this.detectMoatErosion(competitor)) {
        opportunities.push({
          opportunity_type: 'eroding_moat' as const,
          competitor_id: competitor.competitor_id,
          confidence: 0.7,
          erosion_signals: this.identifyErosionSignals(competitor)
        });
      }
    }
    
    return {
      green_box: opportunities.filter(o => o.confidence > 0.75),
      yellow_box: opportunities.filter(o => o.confidence > 0.5 && o.confidence <= 0.75),
      red_box: opportunities.filter(o => o.confidence <= 0.5),
      recommended_actions: this.generateActionableStrategies(opportunities)
    };
  }
  
  private assessMoatStrength(competitor: CompetitiveKPI): number {
    let strength = 0;
    
    // Network effects: High viral coefficient, DAU/MAU
    if (competitor.viral_coefficient > 1.1) strength += 3;
    if (competitor.dau_mau_ratio > 0.25) strength += 2;
    
    // Switching costs: High integration count
    if (competitor.integration_count > 50) strength += 2;
    
    // Brand: High share of voice, positive sentiment
    if (competitor.share_of_voice > 20) strength += 2;
    if (competitor.net_sentiment_score > 0.5) strength += 1;
    
    return Math.min(strength, 10);
  }
  
  private detectMoatErosion(competitor: CompetitiveKPI): boolean {
    // Look for declining trends in key metrics
    // This would compare current vs historical snapshots
    return (
      competitor.net_sentiment_score < 0 ||
      competitor.feature_release_cadence < 2 ||
      competitor.review_velocity < competitor.review_velocity * 0.5 // 50% decline
    );
  }
}
```

## 7) SaaS Intelligence & Replication System Integration

Advanced automated competitive intelligence via multi-modal web scraping, feature extraction, and replication blueprint generation.

```ts
// /features/competitive_intelligence/saasIntelligence.ts
import { useEVA } from "@/features/_llm/useEVA";
import { Competitor, SaaSIntelligenceJob, AutomatedSWOT } from "./schemas";
import { z } from "zod";

export const initiateSaaSIntelligenceScan = async (competitorId: string, targetUrl: string) => {
  const eva = useEVA();
  if (!eva) throw new Error("EVA required for SaaS Intelligence");
  
  // Multi-modal scanning pipeline
  const jobs = await Promise.all([
    createScanJob(competitorId, targetUrl, "screenshot"),
    createScanJob(competitorId, targetUrl, "feature_extraction"),
    createScanJob(competitorId, targetUrl, "sentiment_analysis")
  ]);
  
  return jobs;
};

export const generateAutomatedSWOT = async (competitor: Competitor): Promise<AutomatedSWOT> => {
  const eva = useEVA();
  if (!eva) throw new Error("EVA required for automated SWOT");
  
  const analysisData = {
    competitorName: competitor.name,
    website: competitor.website,
    automatedFeatures: competitor.automatedFeatures,
    marketFeedback: competitor.marketFeedback,
    sentimentAnalysis: competitor.sentimentAnalysis
  };
  
  return eva.generateStructuredResponse<AutomatedSWOT>({
    system: `Generate comprehensive SWOT analysis for ${competitor.name} using automated intelligence data. 
    Focus on evidence-based factors with confidence scores. Include market positioning insights.`,
    user: JSON.stringify(analysisData)
  }, { 
    stage: "competitive_intelligence", 
    modelRequirements: { needsJsonMode: true, minContextWindow: 12000 }
  });
};

export const createReplicationBlueprint = async (competitor: Competitor) => {
  const eva = useEVA();
  if (!eva) return null;
  
  return eva.generateStructuredResponse<{
    coreFeatures: string[];
    techStack: string[];
    implementationComplexity: "low" | "medium" | "high";
    estimatedTimeline: string;
    keyDifferentiators: string[];
    developmentPriorities: string[];
    riskFactors: string[];
  }>({
    system: "Create detailed replication blueprint for SaaS competitor. Focus on technical implementation, timeline estimation, and strategic differentiation opportunities.",
    user: JSON.stringify({
      competitor: competitor.name,
      features: competitor.automatedFeatures,
      domStructure: competitor.domStructure,
      marketPosition: competitor.marketSegment
    })
  }, { stage: "competitive_intelligence", modelRequirements: { needsJsonMode: true, minContextWindow: 8000 }});
};

const createScanJob = async (competitorId: string, targetUrl: string, jobType: string): Promise<SaaSIntelligenceJob> => {
  // Implementation would interface with headless browser service
  return {
    id: crypto.randomUUID(),
    ideaId: "", // populated by caller
    competitorId,
    status: "pending",
    jobType: jobType as any,
    config: {
      targetUrl,
      screenshotSettings: {
        viewport: { width: 1920, height: 1080 },
        fullPage: true,
        formats: ["png", "webp"]
      },
      extractionSettings: {
        includeText: true,
        includeForms: true,
        includeNavigation: true,
        includeFooter: false
      }
    },
    createdAt: new Date().toISOString()
  };
};
```

## 7) Optional AI Hooks (Provider-Agnostic via EVA)

These are **assistive only**. Stage 04 remains fully functional without them.

```ts
// /features/competitive_intelligence/aiHooks.ts
import { useEVA } from "@/features/_llm/useEVA";
import { Competitor, Feature, MarketDefenseStrategySchema } from "./schemas";
import { z } from "zod";

export const summarizeLandscape = async (competitors: Competitor[], features: Feature[]) => {
  const eva = useEVA();
  if (!eva) return null;
  return eva.generateStructuredResponse<{summary:string; risks:string[]; differentiators:string[]}>({
    system: "Summarize the competitive landscape succinctly. Point to 3–5 crisp differentiators.",
    user: JSON.stringify({ competitors, features })
  }, { stage: "competitive_intelligence", modelRequirements: { needsJsonMode: true, minContextWindow: 6000 }});
};

export const suggestDefenseStrategies = async (input: {
  ideaId: string;
  competitors: Competitor[];
  features: Feature[];
  switchingCosts: 0|1|2|3;
  dataNetworkEffects: 0|1|2|3;
}) => {
  const eva = useEVA();
  if (!eva) return [];
  const StrategyArraySchema = z.array(MarketDefenseStrategySchema).min(3).max(8);
  return eva.generateStructuredResponse(z.any(), // will cast below for type inference
    {
      system: "Propose concrete, actionable strategies with rationales. Avoid generic advice.",
      user: JSON.stringify(input)
    } as any, { stage: "competitive_intelligence", schema: StrategyArraySchema });
};
```

**Failure Behavior:** If EVA is not available or JSON validation fails, UI displays a friendly notice; manual strategies still work.

---

## 7) API Contracts

### 7.1 Supabase Tables (preferred)

* `competitors`: matches `CompetitorSchema` (add RLS by `idea_id`)
* `features`: matches `FeatureSchema` (global catalog + venture-specific links)
* `feature_coverage`: matches `FeatureCoverageSchema`
* `market_defense_strategies`: matches `MarketDefenseStrategySchema`
* `chairman_feedback`: reuse (subject\_type = `"competitive_intelligence"`)
* `saas_intelligence_jobs`: matches `SaaSIntelligenceJobSchema` (automated scanning jobs)
* `automated_swot_analyses`: matches `AutomatedSWOTSchema` (AI-generated SWOT analyses)
* `competitive_kpis`: matches `CompetitiveKPISchema` (B2C SaaS competitive metrics)
* `opportunity_signals`: matches `OpportunitySignalSchema` (market opportunity detection)

### 7.2 HTTP Endpoints (fallback)

* `GET /api/ci/:ideaId/competitors`
* `POST /api/ci/:ideaId/competitors`
* `GET /api/ci/:ideaId/features`
* `POST /api/ci/:ideaId/features`
* `POST /api/ci/:ideaId/coverage/bulk`
* `POST /api/ci/:ideaId/strategies`
* `POST /api/feedback` `{ ideaId, subjectType:"competitive_intelligence", note, mode }`
* `POST /api/ci/:competitorId/saas-scan` - Initiate SaaS Intelligence scan
* `GET /api/ci/:competitorId/scan-status` - Check scan job status
* `POST /api/ci/:competitorId/generate-swot` - Generate automated SWOT analysis
* `POST /api/ci/:competitorId/replication-blueprint` - Create replication blueprint
* `POST /api/ci/:competitorId/collect-b2c-kpis` - Collect B2C SaaS competitive metrics
* `GET /api/ci/:ventureId/opportunity-matrix` - Generate opportunity matrix analysis
* `POST /api/ci/:ventureId/opportunity-signals` - Create opportunity signal tracking

---

## 8) Eventing & Voice

* Emit `ci.updated` on CRUD that changes matrix or strategies.
* Voice: “**Show competitors with partial support for {feature}**” → filter; “**Draft strategies**” → calls optional AI.
* Chairman voice notes create `chairman_feedback` rows.

---

## 9) Error Handling & UX

* Input validation messages inline; preserve unsaved edits.
* Coverage bulk-import CSV with row-level errors report.
* AI errors: non-blocking banner, retry button, log to `llm_calls` (if EVA used).

---

## 10) Security & Privacy

* RLS: users can read/write only their `ideaId` rows; Chairman can read all.
* Avoid scraping PII; redact if passed to AI hooks.
* No external crawling from client; any future scraping runs via secure server tasks.

---

## 11) Test Plan

* **Unit:** `capabilityScore`, `differentiationScore`, `defensibilityGrade`.
* **Contract:** Zod schema parsing for all entities.
* **Integration:** Bulk import → matrix render; RLS enforcement.
* **E2E:** Create competitors → set coverage → view dashboard → add strategies → emit events.
* **Perf:** ≤2s render for 20×100 matrix.

---

## 12) Acceptance Criteria (DoD)

* ✅ At least 3 competitors captured with coverage on ≥10 features
* ✅ Deterministic metrics computed and displayed (DiffScore, Defensibility Grade)
* ✅ Strategies CRUD stored and linked to `ideaId`
* ✅ Chairman feedback captured (text/voice) and linked
* ✅ (Opt) AI summaries/strategies work when EVA configured; degrade gracefully otherwise

---

## 13) Development Checklist

* [ ] Create `/features/competitive_intelligence/` with `schemas.ts`, `metrics.ts`, `aiHooks.ts`, `CompetitorTable.tsx`, `FeatureMatrix.tsx`, `StrategyPanel.tsx`
* [ ] Add Supabase tables & RLS or implement API routes
* [ ] Build route `/ideas/:id/ci` and add to sidebar
* [ ] Wire events + analytics; CSV import for coverage
* [ ] Implement optional AI hooks behind capability check
* [ ] Unit/integration/E2E tests; performance budget checks

---

## 14) Changelog

* **v2 (this doc):** Added strict schemas, deterministic scoring (capability, differentiation, defensibility), React components, optional LLM hooks, API contracts, tests, and DoD.
* **v1:** Basic dashboard description without algorithms or provider-agnostic AI pattern.

