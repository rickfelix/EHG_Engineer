---
category: feature
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [feature, auto-generated]
---
# Opportunity Matrix Analyzer - Enhanced PRD



## Table of Contents

- [Metadata](#metadata)
- [Executive Summary](#executive-summary)
- [1.5. Database Schema Integration](#15-database-schema-integration)
  - [Core Entity Dependencies](#core-entity-dependencies)
- [1.6. Integration Hub Connectivity](#16-integration-hub-connectivity)
  - [Integration Requirements](#integration-requirements)
- [1. Core Business Logic](#1-core-business-logic)
  - [Opportunity Classification Engine](#opportunity-classification-engine)
  - [Green Box Analyzer (Quick Wins)](#green-box-analyzer-quick-wins)
  - [Yellow Box Analyzer (Strategic Investments)](#yellow-box-analyzer-strategic-investments)
  - [Red Box Analyzer (Defensive Priorities)](#red-box-analyzer-defensive-priorities)
- [2. Data Architecture](#2-data-architecture)
  - [Opportunity Matrix Schema](#opportunity-matrix-schema)
- [3. UI Components](#3-ui-components)
  - [Opportunity Matrix Visualization](#opportunity-matrix-visualization)
  - [Opportunity Detail Panel](#opportunity-detail-panel)
- [4. Integration Services](#4-integration-services)
  - [Real-time Opportunity Detection](#real-time-opportunity-detection)
  - [Chairman Strategic Guidance Integration](#chairman-strategic-guidance-integration)
- [5. Testing Specifications](#5-testing-specifications)
- [6. Implementation Checklist](#6-implementation-checklist)
  - [Phase 1: Core Analytics (Week 1)](#phase-1-core-analytics-week-1)
  - [Phase 2: Data Infrastructure (Week 2)](#phase-2-data-infrastructure-week-2)
  - [Phase 3: Visualization (Week 3)](#phase-3-visualization-week-3)
  - [Phase 4: Integration (Week 4)](#phase-4-integration-week-4)
- [7. Success Metrics](#7-success-metrics)

## Metadata
- **Category**: Feature
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, testing, unit, schema

## Executive Summary

**The Opportunity Matrix Analyzer** is a strategic competitive intelligence tool that automatically identifies and categorizes market opportunities based on competitor weaknesses, market gaps, and strategic positioning. It provides actionable insights for B2C SaaS ventures to exploit competitive vulnerabilities and capture market share.

**Status:** Production Ready • **Owner:** EVA Core + Chairman Oversight  
**Stack:** React + TypeScript + Tailwind • Supabase • D3.js for visualizations  
**Integration:** Stage 4 (Competitive Intelligence) → Stage 5 (Profitability) → Stage 17 (GTM)

---

## 1.5. Database Schema Integration

**Canonical Schema Reference**: `enhanced_prds/stage_56_database_schema_enhanced.md`

### Core Entity Dependencies

The Opportunity Matrix Analyzer integrates directly with the universal database schema to ensure all competitive opportunity data is properly structured and accessible across stages:

- **Venture Entity**: Core venture information for competitive positioning and opportunity analysis context
- **Chairman Feedback Schema**: Executive strategic preferences and competitive frameworks  
- **Competitive Intelligence Schema**: Market analysis and competitor positioning data
- **Opportunity Matrix Schema**: Green/yellow/red box opportunity classifications and strategies
- **Market Analysis Schema**: Industry trends, gaps, and competitive landscape insights

```typescript
interface OpportunityMatrixDatabaseIntegration {
  ventureEntity: Stage56VentureSchema;
  chairmanFeedback: Stage56ChairmanFeedbackSchema;  
  competitiveIntelligence: Stage56CompetitiveIntelligenceSchema;
  opportunityMatrix: Stage56OpportunityMatrixSchema;
  marketAnalysis: Stage56MarketAnalysisSchema;
  auditTrail: Stage56AuditSchema;
}
```

#### Universal Contract Enforcement

- **Opportunity Data Contracts**: All competitive analysis operations conform to Stage 56 opportunity contracts
- **Cross-Stage Opportunity Consistency**: Opportunity analysis properly coordinated with competitive intelligence and strategic planning stages  
- **Audit Trail Compliance**: Complete opportunity documentation for strategic governance and competitive decision-making

## 1.6. Integration Hub Connectivity  

**Integration Hub Reference**: `enhanced_prds/stage_51_integration_hub_enhanced.md`

### Integration Requirements

Opportunity Matrix Analyzer connects to multiple external services via Integration Hub connectors:

- **Market Intelligence Platforms**: Industry analysis and competitor data via Intelligence Hub connectors
- **Competitive Analysis Tools**: Positioning and feature comparison via Analysis Hub connectors  
- **Strategic Planning Systems**: Opportunity prioritization via Planning Hub connectors
- **Customer Research Platforms**: Market gap identification via Research Hub connectors
- **Data Visualization Tools**: Matrix presentation and insights via Visualization Hub connectors

All integrations follow the standardized Hub connectivity patterns for authentication, rate limiting, error handling, and data transformation as defined in the Integration Hub specification.

## 1. Core Business Logic

### Opportunity Classification Engine

```typescript
interface OpportunityMatrixEngine {
  // Opportunity identification
  identifyGreenBoxOpportunities(
    venture: VentureProfile,
    competitors: CompetitorProfile[]
  ): GreenBoxOpportunity[]
  
  identifyYellowBoxOpportunities(
    venture: VentureProfile,
    competitors: CompetitorProfile[]
  ): YellowBoxOpportunity[]
  
  identifyRedBoxThreats(
    venture: VentureProfile,
    competitors: CompetitorProfile[]
  ): RedBoxThreat[]
  
  // Strategic scoring
  calculateOpportunityScore(
    opportunity: MarketOpportunity,
    ventureCapabilities: Capability[]
  ): OpportunityScore
  
  estimateTimeToCapture(
    opportunity: MarketOpportunity,
    currentPosition: MarketPosition
  ): TimeToCapture
  
  assessExecutionDifficulty(
    opportunity: MarketOpportunity,
    resources: ResourceProfile
  ): ExecutionDifficulty
}
```

### Green Box Analyzer (Quick Wins)

```typescript
export class GreenBoxAnalyzer {
  private readonly QUICK_WIN_THRESHOLD = 90; // days to capture
  private readonly MIN_CONFIDENCE = 0.7;
  
  findQuickWins(
    marketData: MarketAnalysis,
    competitorWeaknesses: Weakness[]
  ): GreenBoxOpportunity[] {
    const opportunities: GreenBoxOpportunity[] = [];
    
    // 1. Underserved features with low competition
    const underservedFeatures = this.findUnderservedFeatures(
      marketData.customerRequests,
      competitorWeaknesses
    );
    
    // 2. Price arbitrage opportunities
    const priceGaps = this.identifyPriceGaps(
      marketData.pricingData,
      marketData.valuePerception
    );
    
    // 3. Poor competitor UX/Support areas
    const uxOpportunities = this.findUXGaps(
      competitorWeaknesses.filter(w => w.category === 'user_experience')
    );
    
    // 4. Undefended market segments
    const segmentGaps = this.findSegmentGaps(
      marketData.segments,
      competitorWeaknesses
    );
    
    return opportunities.filter(o => 
      o.timeToCapture <= this.QUICK_WIN_THRESHOLD &&
      o.confidence >= this.MIN_CONFIDENCE
    );
  }
  
  private findUnderservedFeatures(
    requests: CustomerRequest[],
    weaknesses: Weakness[]
  ): FeatureOpportunity[] {
    // Analyze customer requests vs competitor capabilities
    const requestFrequency = this.calculateRequestFrequency(requests);
    const competitorCoverage = this.assessCompetitorCoverage(weaknesses);
    
    return requestFrequency
      .filter(f => competitorCoverage[f.feature] < 0.3)
      .map(f => ({
        type: 'green_box',
        feature: f.feature,
        demand: f.frequency,
        competition: competitorCoverage[f.feature],
        timeToCapture: this.estimateFeatureDevelopment(f.feature),
        revenue_impact: this.estimateRevenueImpact(f.frequency),
        confidence: this.calculateConfidence(f)
      }));
  }
}
```

### Yellow Box Analyzer (Strategic Investments)

```typescript
export class YellowBoxAnalyzer {
  private readonly STRATEGIC_HORIZON = 365; // days
  private readonly MIN_ROI = 2.5;
  
  identifyStrategicOpportunities(
    venture: VentureProfile,
    market: MarketAnalysis,
    competitors: CompetitorProfile[]
  ): YellowBoxOpportunity[] {
    const opportunities: YellowBoxOpportunity[] = [];
    
    // 1. Market expansion opportunities
    const expansions = this.analyzeExpansionOpportunities(
      venture.currentMarkets,
      market.adjacentMarkets,
      competitors.map(c => c.markets)
    );
    
    // 2. Technology moat building
    const moatOpportunities = this.identifyMoatBuilding(
      venture.capabilities,
      market.technologyTrends,
      competitors.map(c => c.techStack)
    );
    
    // 3. Partnership/Integration plays
    const partnerships = this.findPartnershipOpportunities(
      venture.integrations,
      market.ecosystem,
      competitors.map(c => c.partnerships)
    );
    
    // 4. Brand positioning gaps
    const brandGaps = this.analyzeBrandPositioning(
      venture.brand,
      market.perceptionData,
      competitors.map(c => c.brand)
    );
    
    return opportunities.filter(o =>
      o.roi >= this.MIN_ROI &&
      o.timeToCapture <= this.STRATEGIC_HORIZON
    );
  }
  
  private analyzeExpansionOpportunities(
    current: Market[],
    adjacent: Market[],
    competitorMarkets: Market[][]
  ): ExpansionOpportunity[] {
    const competitorDensity = this.calculateMarketDensity(competitorMarkets);
    const marketAttractiveness = this.scoreMarketAttractiveness(adjacent);
    
    return adjacent
      .filter(m => !current.includes(m))
      .map(market => ({
        type: 'yellow_box',
        market,
        competition_density: competitorDensity[market.id],
        attractiveness: marketAttractiveness[market.id],
        entry_barriers: this.assessEntryBarriers(market),
        required_investment: this.estimateMarketEntry(market),
        expected_roi: this.calculateExpectedROI(market),
        timeToCapture: this.estimateMarketPenetration(market)
      }))
      .sort((a, b) => b.expected_roi - a.expected_roi);
  }
}
```

### Red Box Analyzer (Defensive Priorities)

```typescript
export class RedBoxAnalyzer {
  private readonly THREAT_THRESHOLD = 0.7;
  private readonly CRITICAL_RETENTION = 0.85;
  
  identifyCompetitiveThreats(
    venture: VentureProfile,
    competitors: CompetitorProfile[],
    market: MarketAnalysis
  ): RedBoxThreat[] {
    const threats: RedBoxThreat[] = [];
    
    // 1. Direct competitive threats
    const directThreats = this.analyzeDirectThreats(
      venture.customerBase,
      competitors.filter(c => c.aggressive_expansion)
    );
    
    // 2. Substitution threats
    const substitutes = this.identifySubstitutionRisks(
      venture.value_proposition,
      market.emergingAlternatives
    );
    
    // 3. Customer churn vulnerabilities
    const churnRisks = this.assessChurnVulnerabilities(
      venture.customerSatisfaction,
      competitors.map(c => c.offerings)
    );
    
    // 4. Technology disruption risks
    const disruptionRisks = this.evaluateDisruptionThreats(
      venture.techStack,
      market.emergingTechnologies
    );
    
    return threats
      .filter(t => t.severity >= this.THREAT_THRESHOLD)
      .sort((a, b) => b.urgency - a.urgency);
  }
  
  generateDefensiveStrategy(threat: RedBoxThreat): DefensiveAction[] {
    const actions: DefensiveAction[] = [];
    
    switch (threat.type) {
      case 'customer_poaching':
        actions.push(
          this.createRetentionProgram(threat),
          this.improveSwitchingCosts(threat),
          this.enhanceCustomerSuccess(threat)
        );
        break;
        
      case 'feature_parity':
        actions.push(
          this.accelerateInnovation(threat),
          this.deepenIntegrations(threat),
          this.buildDataMoat(threat)
        );
        break;
        
      case 'price_war':
        actions.push(
          this.optimizePricing(threat),
          this.differentiateValue(threat),
          this.segmentPricing(threat)
        );
        break;
    }
    
    return actions.sort((a, b) => b.impact - a.impact);
  }
}
```

## 2. Data Architecture

### Opportunity Matrix Schema

```typescript
interface OpportunityMatrixData {
  matrix_id: string // UUID primary key
  venture_id: string
  analysis_date: Date
  
  // Market context
  market_snapshot: MarketSnapshot
  competitor_positions: CompetitorPosition[]
  venture_position: VenturePosition
  
  // Opportunity categories
  green_box_opportunities: GreenBoxOpportunity[]
  yellow_box_opportunities: YellowBoxOpportunity[]
  red_box_threats: RedBoxThreat[]
  
  // Strategic recommendations
  priority_actions: PriorityAction[]
  resource_allocation: ResourceAllocation
  timeline: StrategicTimeline
  
  // Performance tracking
  previous_matrix_id?: string
  opportunities_captured: OpportunityCaptureRecord[]
  threats_mitigated: ThreatMitigationRecord[]
  
  // Chairman oversight
  chairman_review?: ChairmanStrategicGuidance
  approval_status: 'pending' | 'approved' | 'revision_required'
  
  created_at: Date
  updated_at: Date
}

interface GreenBoxOpportunity {
  opportunity_id: string
  type: 'feature' | 'segment' | 'price' | 'ux' | 'support'
  
  // Opportunity details
  title: string
  description: string
  market_evidence: MarketEvidence[]
  competitor_weakness: string
  
  // Scoring
  demand_score: number // 0-100
  competition_score: number // 0-100 (lower is better)
  ease_score: number // 0-100
  composite_score: number // Weighted average
  
  // Execution
  timeToCapture: number // days
  required_resources: Resource[]
  implementation_steps: Step[]
  success_metrics: Metric[]
  
  // Impact
  revenue_impact: RevenueImpact
  market_share_impact: number // percentage points
  customer_acquisition_potential: number
  
  // Risk
  execution_risk: 'low' | 'medium' | 'high'
  competitive_response_risk: 'low' | 'medium' | 'high'
  
  confidence: number // 0-1
  data_sources: DataSource[]
}

interface YellowBoxOpportunity {
  opportunity_id: string
  type: 'expansion' | 'moat' | 'partnership' | 'brand' | 'technology'
  
  // Strategic details
  title: string
  strategic_rationale: string
  market_dynamics: MarketDynamic[]
  competitive_advantage: string
  
  // Investment analysis
  required_investment: Investment
  expected_roi: number
  payback_period: number // months
  break_even_point: Date
  
  // Execution planning
  timeToCapture: number // days
  phases: ExecutionPhase[]
  milestones: Milestone[]
  dependencies: Dependency[]
  
  // Strategic impact
  long_term_value: number
  defensibility_increase: number // 0-100
  market_position_improvement: MarketPositionDelta
  
  // Risks and mitigation
  strategic_risks: StrategicRisk[]
  mitigation_strategies: MitigationStrategy[]
  
  confidence: number // 0-1
  assumptions: Assumption[]
}

interface RedBoxThreat {
  threat_id: string
  type: 'competition' | 'substitution' | 'churn' | 'disruption' | 'commoditization'
  
  // Threat assessment
  title: string
  threat_description: string
  competitor_actions: CompetitorAction[]
  market_signals: MarketSignal[]
  
  // Severity and urgency
  severity: number // 0-100
  urgency: number // 0-100
  time_to_impact: number // days
  probability: number // 0-1
  
  // Business impact
  revenue_at_risk: number
  customers_at_risk: number
  market_share_at_risk: number
  
  // Defensive strategy
  defensive_actions: DefensiveAction[]
  required_resources: Resource[]
  implementation_priority: 'critical' | 'high' | 'medium'
  
  // Monitoring
  early_warning_signals: Signal[]
  monitoring_metrics: Metric[]
  trigger_thresholds: Threshold[]
  
  detection_date: Date
  last_updated: Date
}
```

## 3. UI Components

### Opportunity Matrix Visualization

```tsx
interface MatrixVisualizationProps {
  opportunities: OpportunityMatrixData
  interactiveMode?: boolean
  onOpportunitySelect?: (id: string) => void
  showTimeline?: boolean
}

export const OpportunityMatrixVisualization: React.FC<MatrixVisualizationProps> = ({
  opportunities,
  interactiveMode = true,
  onOpportunitySelect,
  showTimeline = false
}) => {
  return (
    <div className="relative w-full h-[600px] bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6">
      {/* Matrix Grid */}
      <svg className="w-full h-full" viewBox="0 0 1000 600">
        {/* Axes */}
        <line x1="50" y1="550" x2="950" y2="550" stroke="#94a3b8" strokeWidth="2"/>
        <line x1="50" y1="50" x2="50" y2="550" stroke="#94a3b8" strokeWidth="2"/>
        
        {/* Axis Labels */}
        <text x="500" y="590" textAnchor="middle" className="fill-slate-600 text-sm font-medium">
          Time to Capture →
        </text>
        <text x="20" y="300" transform="rotate(-90, 20, 300)" textAnchor="middle" className="fill-slate-600 text-sm font-medium">
          Impact Potential →
        </text>
        
        {/* Quadrant Backgrounds */}
        <rect x="50" y="50" width="450" height="250" fill="#10b981" opacity="0.1"/>
        <rect x="500" y="50" width="450" height="250" fill="#eab308" opacity="0.1"/>
        <rect x="50" y="300" width="900" height="250" fill="#ef4444" opacity="0.1"/>
        
        {/* Quadrant Labels */}
        <text x="275" y="80" textAnchor="middle" className="fill-emerald-700 font-semibold">
          GREEN BOX (Quick Wins)
        </text>
        <text x="725" y="80" textAnchor="middle" className="fill-amber-700 font-semibold">
          YELLOW BOX (Strategic)
        </text>
        <text x="500" y="330" textAnchor="middle" className="fill-red-700 font-semibold">
          RED BOX (Defensive)
        </text>
        
        {/* Plot Opportunities */}
        {opportunities.green_box_opportunities.map((opp, i) => (
          <g key={opp.opportunity_id}>
            <circle
              cx={50 + (opp.timeToCapture / 90) * 450}
              cy={300 - (opp.composite_score / 100) * 250}
              r="12"
              fill="#10b981"
              stroke="#047857"
              strokeWidth="2"
              className={interactiveMode ? "cursor-pointer hover:r-16 transition-all" : ""}
              onClick={() => onOpportunitySelect?.(opp.opportunity_id)}
            />
            <text
              x={50 + (opp.timeToCapture / 90) * 450}
              y={300 - (opp.composite_score / 100) * 250 + 4}
              textAnchor="middle"
              className="fill-white text-xs font-bold pointer-events-none"
            >
              {i + 1}
            </text>
          </g>
        ))}
        
        {opportunities.yellow_box_opportunities.map((opp, i) => (
          <g key={opp.opportunity_id}>
            <circle
              cx={500 + (Math.min(opp.timeToCapture, 365) / 365) * 450}
              cy={300 - (opp.expected_roi / 10) * 250}
              r="12"
              fill="#eab308"
              stroke="#a16207"
              strokeWidth="2"
              className={interactiveMode ? "cursor-pointer hover:r-16 transition-all" : ""}
              onClick={() => onOpportunitySelect?.(opp.opportunity_id)}
            />
            <text
              x={500 + (Math.min(opp.timeToCapture, 365) / 365) * 450}
              y={300 - (opp.expected_roi / 10) * 250 + 4}
              textAnchor="middle"
              className="fill-white text-xs font-bold pointer-events-none"
            >
              Y{i + 1}
            </text>
          </g>
        ))}
        
        {opportunities.red_box_threats.map((threat, i) => (
          <g key={threat.threat_id}>
            <rect
              x={50 + (threat.time_to_impact / 365) * 900 - 12}
              y={538 - (threat.severity / 100) * 238 - 12}
              width="24"
              height="24"
              fill="#ef4444"
              stroke="#b91c1c"
              strokeWidth="2"
              className={interactiveMode ? "cursor-pointer hover:scale-110 transition-all" : ""}
              onClick={() => onOpportunitySelect?.(threat.threat_id)}
            />
            <text
              x={50 + (threat.time_to_impact / 365) * 900}
              y={538 - (threat.severity / 100) * 238 + 4}
              textAnchor="middle"
              className="fill-white text-xs font-bold pointer-events-none"
            >
              R{i + 1}
            </text>
          </g>
        ))}
      </svg>
      
      {/* Timeline Overlay */}
      {showTimeline && (
        <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-white to-transparent">
          <div className="flex justify-between px-12 pt-2">
            <span className="text-xs text-slate-600">Now</span>
            <span className="text-xs text-slate-600">30 days</span>
            <span className="text-xs text-slate-600">90 days</span>
            <span className="text-xs text-slate-600">6 months</span>
            <span className="text-xs text-slate-600">1 year</span>
          </div>
        </div>
      )}
    </div>
  );
};
```

### Opportunity Detail Panel

```tsx
interface OpportunityDetailProps {
  opportunity: GreenBoxOpportunity | YellowBoxOpportunity | RedBoxThreat
  onActionClick?: (action: string) => void
  showExecutionPlan?: boolean
}

export const OpportunityDetailPanel: React.FC<OpportunityDetailProps> = ({
  opportunity,
  onActionClick,
  showExecutionPlan = true
}) => {
  const isGreen = 'demand_score' in opportunity;
  const isYellow = 'expected_roi' in opportunity;
  const isRed = 'severity' in opportunity;
  
  return (
    <div className="bg-white rounded-xl shadow-lg p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${
            isGreen ? 'bg-emerald-500' : 
            isYellow ? 'bg-amber-500' : 
            'bg-red-500'
          }`} />
          <h3 className="text-lg font-semibold text-gray-900">
            {isGreen ? (opportunity as GreenBoxOpportunity).title :
             isYellow ? (opportunity as YellowBoxOpportunity).title :
             (opportunity as RedBoxThreat).title}
          </h3>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
          isGreen ? 'bg-emerald-100 text-emerald-700' :
          isYellow ? 'bg-amber-100 text-amber-700' :
          'bg-red-100 text-red-700'
        }`}>
          {isGreen ? 'Quick Win' : isYellow ? 'Strategic' : 'Defensive'}
        </span>
      </div>
      
      {/* Key Metrics */}
      <div className="grid grid-cols-3 gap-4">
        {isGreen && (
          <>
            <MetricCard
              label="Time to Capture"
              value={`${(opportunity as GreenBoxOpportunity).timeToCapture} days`}
              trend="neutral"
            />
            <MetricCard
              label="Demand Score"
              value={`${(opportunity as GreenBoxOpportunity).demand_score}/100`}
              trend="positive"
            />
            <MetricCard
              label="Competition"
              value={`${(opportunity as GreenBoxOpportunity).competition_score}/100`}
              trend={opportunity.competition_score < 30 ? 'positive' : 'negative'}
            />
          </>
        )}
        
        {isYellow && (
          <>
            <MetricCard
              label="ROI"
              value={`${(opportunity as YellowBoxOpportunity).expected_roi}x`}
              trend="positive"
            />
            <MetricCard
              label="Payback Period"
              value={`${(opportunity as YellowBoxOpportunity).payback_period} mo`}
              trend="neutral"
            />
            <MetricCard
              label="Investment"
              value={formatCurrency((opportunity as YellowBoxOpportunity).required_investment.total)}
              trend="negative"
            />
          </>
        )}
        
        {isRed && (
          <>
            <MetricCard
              label="Severity"
              value={`${(opportunity as RedBoxThreat).severity}/100`}
              trend="negative"
            />
            <MetricCard
              label="Time to Impact"
              value={`${(opportunity as RedBoxThreat).time_to_impact} days`}
              trend={threat.time_to_impact < 30 ? 'negative' : 'neutral'}
            />
            <MetricCard
              label="Revenue at Risk"
              value={formatCurrency((opportunity as RedBoxThreat).revenue_at_risk)}
              trend="negative"
            />
          </>
        )}
      </div>
      
      {/* Description */}
      <div className="prose prose-sm max-w-none">
        <h4 className="text-sm font-semibold text-gray-700">Description</h4>
        <p className="text-gray-600">
          {isGreen ? (opportunity as GreenBoxOpportunity).description :
           isYellow ? (opportunity as YellowBoxOpportunity).strategic_rationale :
           (opportunity as RedBoxThreat).threat_description}
        </p>
      </div>
      
      {/* Execution Plan */}
      {showExecutionPlan && (
        <div className="border-t pt-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">
            {isRed ? 'Defensive Actions' : 'Implementation Steps'}
          </h4>
          <div className="space-y-2">
            {isGreen && (opportunity as GreenBoxOpportunity).implementation_steps.map((step, i) => (
              <StepItem key={i} step={step} number={i + 1} />
            ))}
            {isYellow && (opportunity as YellowBoxOpportunity).phases.map((phase, i) => (
              <PhaseItem key={i} phase={phase} number={i + 1} />
            ))}
            {isRed && (opportunity as RedBoxThreat).defensive_actions.map((action, i) => (
              <ActionItem key={i} action={action} number={i + 1} onActionClick={onActionClick} />
            ))}
          </div>
        </div>
      )}
      
      {/* Confidence Indicator */}
      <div className="flex items-center justify-between pt-4 border-t">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Confidence:</span>
          <div className="flex gap-1">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full ${
                  i < Math.floor((opportunity.confidence || opportunity.probability || 0) * 5)
                    ? 'bg-blue-500'
                    : 'bg-gray-300'
                }`}
              />
            ))}
          </div>
          <span className="text-xs text-gray-600">
            {Math.round((opportunity.confidence || opportunity.probability || 0) * 100)}%
          </span>
        </div>
        
        {onActionClick && (
          <button
            onClick={() => onActionClick('execute')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              isGreen ? 'bg-emerald-600 hover:bg-emerald-700 text-white' :
              isYellow ? 'bg-amber-600 hover:bg-amber-700 text-white' :
              'bg-red-600 hover:bg-red-700 text-white'
            }`}
          >
            {isRed ? 'Activate Defense' : 'Start Execution'}
          </button>
        )}
      </div>
    </div>
  );
};
```

## 4. Integration Services

### Real-time Opportunity Detection

```typescript
export class OpportunityDetectionService {
  private readonly SCAN_INTERVAL = 3600000; // 1 hour
  private scanTimer?: NodeJS.Timeout;
  
  async startContinuousMonitoring(ventureId: string): Promise<void> {
    // Initial scan
    await this.performOpportunityScan(ventureId);
    
    // Schedule recurring scans
    this.scanTimer = setInterval(async () => {
      await this.performOpportunityScan(ventureId);
    }, this.SCAN_INTERVAL);
  }
  
  private async performOpportunityScan(ventureId: string): Promise<void> {
    const scanId = generateScanId();
    
    try {
      // 1. Collect fresh market data
      const marketData = await this.collectMarketData(ventureId);
      
      // 2. Update competitor intelligence
      const competitorData = await this.updateCompetitorIntelligence(ventureId);
      
      // 3. Analyze for opportunities
      const greenBox = await this.greenBoxAnalyzer.findQuickWins(
        marketData,
        competitorData.weaknesses
      );
      
      const yellowBox = await this.yellowBoxAnalyzer.identifyStrategicOpportunities(
        ventureId,
        marketData,
        competitorData.profiles
      );
      
      const redBox = await this.redBoxAnalyzer.identifyCompetitiveThreats(
        ventureId,
        competitorData.profiles,
        marketData
      );
      
      // 4. Compare with previous scan
      const changes = await this.detectSignificantChanges(
        ventureId,
        { greenBox, yellowBox, redBox }
      );
      
      // 5. Generate alerts for new opportunities
      if (changes.hasSignificantChanges) {
        await this.generateAlerts(ventureId, changes);
      }
      
      // 6. Update opportunity matrix
      await this.updateOpportunityMatrix(ventureId, {
        green_box_opportunities: greenBox,
        yellow_box_opportunities: yellowBox,
        red_box_threats: redBox,
        market_snapshot: marketData,
        competitor_positions: competitorData.profiles,
        analysis_date: new Date()
      });
      
      // 7. Trigger Chairman review if needed
      if (changes.requiresChairmanReview) {
        await this.requestChairmanReview(ventureId, changes);
      }
      
    } catch (error) {
      console.error(`Opportunity scan failed for venture ${ventureId}:`, error);
      await this.logScanError(scanId, error);
    }
  }
}
```

### Chairman Strategic Guidance Integration

```typescript
interface ChairmanStrategicGuidance {
  guidance_id: string
  matrix_id: string
  
  // Strategic priorities
  priority_opportunities: string[] // opportunity_ids in order
  ignored_opportunities: string[] // opportunities to skip
  custom_opportunities: CustomOpportunity[] // Chairman-identified opportunities
  
  // Resource guidance
  resource_allocation: {
    green_box_budget: number // % of resources
    yellow_box_budget: number
    red_box_budget: number
  }
  
  // Strategic direction
  strategic_focus: 'aggressive_growth' | 'balanced' | 'defensive' | 'opportunistic'
  risk_tolerance: 'conservative' | 'moderate' | 'aggressive'
  time_horizon: 'short_term' | 'medium_term' | 'long_term'
  
  // Specific guidance
  must_win_battles: string[] // Critical opportunities
  acceptable_losses: string[] // Areas to concede
  partnership_preferences: PartnershipPreference[]
  
  // Constraints
  budget_constraint?: number
  timeline_constraint?: Date
  resource_constraints?: ResourceConstraint[]
  
  created_at: Date
  expires_at: Date
}

export class ChairmanGuidanceProcessor {
  async applyChairmanGuidance(
    matrix: OpportunityMatrixData,
    guidance: ChairmanStrategicGuidance
  ): Promise<OpportunityMatrixData> {
    // Reorder opportunities based on Chairman priorities
    const prioritizedMatrix = this.reprioritizeOpportunities(matrix, guidance);
    
    // Apply resource allocation
    const resourceAllocated = this.allocateResources(
      prioritizedMatrix,
      guidance.resource_allocation
    );
    
    // Adjust risk profiles
    const riskAdjusted = this.adjustForRiskTolerance(
      resourceAllocated,
      guidance.risk_tolerance
    );
    
    // Add custom opportunities
    const withCustom = this.addCustomOpportunities(
      riskAdjusted,
      guidance.custom_opportunities
    );
    
    // Generate execution timeline
    const timeline = this.generateTimeline(
      withCustom,
      guidance.time_horizon,
      guidance.must_win_battles
    );
    
    return {
      ...withCustom,
      chairman_review: guidance,
      priority_actions: this.generatePriorityActions(withCustom, guidance),
      timeline,
      approval_status: 'approved'
    };
  }
}
```

## 5. Testing Specifications

```typescript
describe('OpportunityMatrixAnalyzer', () => {
  describe('GreenBoxAnalyzer', () => {
    it('should identify quick win opportunities with < 90 day capture time');
    it('should filter opportunities by minimum confidence threshold');
    it('should accurately calculate revenue impact from feature demand');
    it('should detect underserved features with low competition');
  });
  
  describe('YellowBoxAnalyzer', () => {
    it('should identify strategic opportunities with ROI > 2.5x');
    it('should calculate market expansion opportunities correctly');
    it('should assess technology moat building potential');
    it('should rank opportunities by expected ROI');
  });
  
  describe('RedBoxAnalyzer', () => {
    it('should detect competitive threats above severity threshold');
    it('should generate appropriate defensive strategies');
    it('should prioritize threats by urgency and impact');
    it('should identify early warning signals');
  });
  
  describe('OpportunityDetectionService', () => {
    it('should perform continuous monitoring at specified intervals');
    it('should detect significant changes between scans');
    it('should generate alerts for new high-priority opportunities');
    it('should trigger Chairman review for critical changes');
  });
});
```

## 6. Implementation Checklist

### Phase 1: Core Analytics (Week 1)
- [ ] Implement GreenBoxAnalyzer with quick win detection
- [ ] Implement YellowBoxAnalyzer with ROI calculations
- [ ] Implement RedBoxAnalyzer with threat assessment
- [ ] Create opportunity scoring algorithms

### Phase 2: Data Infrastructure (Week 2)
- [ ] Set up opportunity matrix database schema
- [ ] Implement data collection pipelines
- [ ] Create competitive intelligence aggregation
- [ ] Build market signal detection

### Phase 3: Visualization (Week 3)
- [ ] Build OpportunityMatrixVisualization component
- [ ] Create OpportunityDetailPanel
- [ ] Implement interactive matrix navigation
- [ ] Add timeline and resource views

### Phase 4: Integration (Week 4)
- [ ] Connect to Stage 4 Competitive Intelligence
- [ ] Integrate Chairman guidance system
- [ ] Set up real-time monitoring service
- [ ] Complete testing and optimization

## 7. Success Metrics

- ✅ Identify 10+ opportunities per venture per month
- ✅ Achieve 80% accuracy in opportunity scoring
- ✅ Capture 60% of identified green box opportunities
- ✅ Reduce competitive blind spots by 70%
- ✅ Generate $500K+ incremental revenue from opportunity capture