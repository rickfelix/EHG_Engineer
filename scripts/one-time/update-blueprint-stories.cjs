#!/usr/bin/env node
/**
 * One-time: Update user stories for SD-EVA-FEAT-TEMPLATES-BLUEPRINT-001
 * Enriches implementation_context and architecture_references to pass quality gate
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  // Story 1: Template upgrade to v2.0.0
  const story1Update = {
    implementation_context: `## Implementation Guidance

**File Locations:**
- Templates: lib/eva/stage-templates/stage-13.js, stage-14.js, stage-15.js, stage-16.js
- New analysis steps: lib/eva/stage-templates/analysis-steps/stage-13-roadmap.js, stage-14-architecture.js, stage-15-resource-planning.js, stage-16-financial-projections.js
- Analysis step registry: lib/eva/stage-templates/analysis-steps/index.js
- LLM client: lib/llm/index.js (getLLMClient)

**Upgrade Pattern (proven across stages 1-9):**
1. Add import at top of template: import { analyzeStageNN } from './analysis-steps/stage-NN-slug.js'
2. Bump version field: version: '2.0.0' (was '1.0.0')
3. Attach analysisStep: TEMPLATE.analysisStep = analyzeStageNN
4. Register in analysis-steps/index.js exports

**Each analysis step module structure:**
- Module-level SYSTEM_PROMPT const with JSON schema
- Single exported async function: analyzeStageNN({ stage1Data, ...upstreamData, ventureName })
- Module-private parseJSON(text) helper stripping markdown fences
- Module-private clamp(val, min, max) for number normalization
- Import getLLMClient({ purpose: 'content-generation' }) from ../../../llm/index.js
- Call client.complete(SYSTEM_PROMPT, userPrompt), parse response, normalize, return

**Input Data Contracts:**
- stage1Data: { description: string, targetMarket: string, archetype: string }
- stage5Data: { year1: { revenue: number }, year3: { revenue: number }, roi3y: number, unitEconomics: { ltvCacRatio: number } }
- stage6Data: { totalRisks: number, highRiskCount: number, risks: Array }
- stage7Data: { pricingModel: string, unitEconomics: { arpa: number } }
- stage13Data: { milestones: Array, vision_statement: string }
- stage14Data: { layers: Array, constraints: Array, security: Object, dataEntities: Array }
- stage15Data: { team_members: Array, compute_budget: Object, risks: Array }

**Dependencies:** getLLMClient from lib/llm/index.js (existing, no changes needed)`,

    architecture_references: [
      'docs/plans/eva-platform-architecture.md Section 8.4 (THE BLUEPRINT phase specs)',
      'lib/eva/stage-templates/analysis-steps/stage-06-risk-matrix.js (reference pattern)',
      'lib/eva/stage-templates/analysis-steps/stage-09-exit-strategy.js (reference pattern)',
      'lib/eva/stage-templates/stage-01.js (v2.0.0 upgrade pattern)',
      'lib/eva/stage-templates/stage-06.js (v2.0.0 upgrade pattern)'
    ],

    given_when_then: [
      {
        given: 'Stage template files stage-13.js through stage-16.js exist in lib/eva/stage-templates/ with version 1.0.0 and no analysisStep property',
        when: 'I import each template and check TEMPLATE.version and TEMPLATE.analysisStep',
        then: 'Each template returns version 2.0.0 and analysisStep is an async function that accepts { stage1Data, ventureName } and returns a Promise<Object>'
      },
      {
        given: 'The analysis-steps/index.js registry currently exports stages 1-9',
        when: 'I import { analyzeStage13, analyzeStage14, analyzeStage15, analyzeStage16 } from the registry',
        then: 'All four functions are defined and are async functions'
      },
      {
        given: 'A stage-13.js template file at v1.0.0 with existing validate() and computeDerived() functions',
        when: 'I upgrade it to v2.0.0 by adding analysisStep import and attachment',
        then: 'The existing validate() still works with v1.0 data (backward compatible) and analysisStep is additionally available'
      }
    ]
  };

  // Story 2: Stage 13 roadmap
  const story2Update = {
    implementation_context: `## Implementation Guidance

**File to create:** lib/eva/stage-templates/analysis-steps/stage-13-roadmap.js

**Function signature:** export async function analyzeStage13({ stage1Data, stage3Data, stage4Data, stage5Data, stage6Data, stage7Data, stage8Data, stage9Data, ventureName })

**Input contracts (upstream stage data):**
- stage1Data.description (string, required): Venture description
- stage1Data.targetMarket (string): Target market segment
- stage1Data.archetype (string): Venture archetype (e.g., 'marketplace', 'saas')
- stage5Data.year1.revenue / stage5Data.year3.revenue (number): Revenue projections
- stage6Data.totalRisks / stage6Data.highRiskCount (number): Risk profile
- stage7Data.pricingModel (string): Pricing strategy type
- stage9Data.exit_paths (array): Exit strategy context

**Output schema (returned JSON):**
{
  vision_statement: string (min 20 chars),
  milestones: Array<{
    title: string, description: string, targetDate: string,
    priority: 'now'|'next'|'later',
    deliverables: Array<{ name: string, description: string, type: 'feature'|'infrastructure'|'integration'|'documentation' }>,
    outcomes: string[],
    dependencies: string[]  // optional refs to other milestones
  }>,
  kill_gate: { pass: boolean, reasons: string[] }
}

**Kill Gate logic:** At least 1 milestone with priority='now' that has >= 1 deliverable. Fail if all milestones are 'later'.

**LLM pattern:** Import getLLMClient({ purpose: 'content-generation' }), define SYSTEM_PROMPT with JSON schema, build user prompt from upstream data, call client.complete(), parseJSON(), normalize enums with fallbacks.

**Reference files:** stage-06-risk-matrix.js, stage-09-exit-strategy.js (same pattern)`,

    architecture_references: [
      'docs/plans/eva-platform-architecture.md lines 799-815 (Stage 13 v2.0 target schema)',
      'lib/eva/stage-templates/analysis-steps/stage-09-exit-strategy.js (closest analysis step pattern)',
      'lib/eva/stage-templates/stage-13.js (existing template with evaluateKillGate function)'
    ],

    given_when_then: [
      {
        given: 'stage1Data with description="AI-powered project management SaaS", targetMarket="SMB teams", and stage5Data with year1.revenue=500000, year3.revenue=2000000',
        when: 'I call analyzeStage13({ stage1Data, stage5Data, ventureName: "ProjectAI" })',
        then: 'Returns object with vision_statement (>= 20 chars), milestones array with >= 3 items, each having title, description, targetDate, priority (now|next|later), deliverables[] with type enum, and outcomes[]'
      },
      {
        given: 'Stage 13 output where all milestones have priority="later" and none have priority="now"',
        when: 'evaluateKillGate(stage13Output) is called',
        then: 'Returns { pass: false, reasons: ["No now-priority milestone found. At least one milestone must be prioritized for immediate execution."] }'
      },
      {
        given: 'LLM returns JSON with priority="urgent" (invalid enum value) for a milestone',
        when: 'Normalization runs on the parsed output',
        then: 'The priority is normalized to "now" (default fallback) and the output passes schema validation'
      },
      {
        given: 'No upstream stage data provided (stage5Data=undefined, stage6Data=undefined)',
        when: 'analyzeStage13({ stage1Data, ventureName }) is called with only required params',
        then: 'Financial and risk context strings default to "No financial data" / "No risk data", and the LLM still generates a valid roadmap'
      }
    ]
  };

  // Story 3: Stages 14-16
  const story3Update = {
    implementation_context: `## Implementation Guidance

**Files to create:**
- lib/eva/stage-templates/analysis-steps/stage-14-architecture.js
- lib/eva/stage-templates/analysis-steps/stage-15-resource-planning.js
- lib/eva/stage-templates/analysis-steps/stage-16-financial-projections.js

**Stage 14 - Technical Architecture:**
Function: export async function analyzeStage14({ stage1Data, stage6Data, stage13Data, ventureName })
Output schema:
{
  architecture_summary: string,
  layers: Array<{ name: string, technology: string, components: string[], rationale: string }>,
  additionalLayers: Array (optional),
  constraints: Array<{ description: string, impact: string, category: 'performance'|'security'|'scalability'|'compliance'|'budget'|'timeline' }>,
  security: { authStrategy: string, dataClassification: string, complianceRequirements: string[] },
  dataEntities: Array<{ name: string, description: string, relationships: string[], estimatedVolume: string }>,
  techStack: { frontend: string, backend: string, database: string, hosting: string }
}
Minimum: 5 core layers (presentation, api, business_logic, data, infrastructure), 2+ data entities

**Stage 15 - Resource Planning:**
Function: export async function analyzeStage15({ stage1Data, stage5Data, stage13Data, stage14Data, ventureName })
Output schema:
{
  team_members: Array<{ role: string, name: string, allocation_pct: number, monthly_cost: number, skills: string[] }>,
  skill_gaps: Array<{ skill: string, hiring_priority: 'critical'|'high'|'medium'|'low', timeline: string }>,
  risks: Array<{ title: string, description: string, severity: 'critical'|'high'|'medium'|'low', priority: 'immediate'|'short_term'|'long_term', phaseRef: string, mitigationPlan: string }>,
  compute_budget: { monthly_cost: number, services: Array<{ name: string, cost: number }> }
}
Minimum: 2+ team members with distinct roles, severity/priority as strict enums

**Stage 16 - Financial Projections:**
Function: export async function analyzeStage16({ stage1Data, stage5Data, stage7Data, stage13Data, stage15Data, ventureName })
Output schema:
{
  phases: Array<{ phaseName: string, duration: string, costs: { personnel: number, infrastructure: number, marketing: number, other: number }, revenue: { projected: number, source: string } }>,
  pnl: { revenue: number, cogs: number, grossMargin: number, opex: { rd: number, sm: number, ga: number }, ebitda: number, netIncome: number },
  initialCapital: number,
  cashBalanceEnd: number,
  viabilityWarnings: Array<{ type: string, message: string, recommendation: string }>,
  promotion_gate: { pass: boolean, reasons: string[] }
}
Viability warnings triggered when: cash < 3 months runway, burn > plan, margins < Stage 5 projections
Promotion Gate: positive cash trajectory + manageable burn + margin alignment

**Shared patterns across all 3:**
- Import getLLMClient({ purpose: 'content-generation' })
- Module-private parseJSON() with markdown fence stripping
- Module-private clamp(val, min, max) for number normalization
- Optional chaining for all upstream data access
- Fallback context strings when upstream data is missing`,

    architecture_references: [
      'docs/plans/eva-platform-architecture.md lines 817-872 (Stages 14-16 v2.0 target schemas)',
      'lib/eva/stage-templates/analysis-steps/stage-06-risk-matrix.js (risk scoring pattern for Stage 15)',
      'lib/eva/stage-templates/analysis-steps/stage-09-exit-strategy.js (financial analysis pattern for Stage 16)',
      'lib/eva/stage-templates/stage-16.js (existing evaluatePromotionGate function)'
    ],

    given_when_then: [
      {
        given: 'stage13Data with 3 milestones including deliverables typed as feature/infrastructure, and stage6Data with 5 risks',
        when: 'analyzeStage14({ stage1Data, stage6Data, stage13Data, ventureName: "ProjectAI" }) is called',
        then: 'Returns object with 5+ layers (presentation, api, business_logic, data, infrastructure), constraints[] with category enum, security object with authStrategy/dataClassification/complianceRequirements, and dataEntities[] with 2+ entities'
      },
      {
        given: 'stage14Data with architecture layers and stage13Data with roadmap milestones',
        when: 'analyzeStage15({ stage1Data, stage5Data, stage13Data, stage14Data, ventureName }) is called',
        then: 'Returns team_members[] with 2+ distinct roles each having allocation_pct and monthly_cost, skill_gaps[] with hiring_priority enum, risks[] with severity/priority enums and phaseRef, and compute_budget with monthly_cost'
      },
      {
        given: 'stage5Data with year1 revenue of 500000, stage7Data with pricingModel="subscription", stage13Data with 3 milestones, stage15Data with team costs',
        when: 'analyzeStage16({ stage1Data, stage5Data, stage7Data, stage13Data, stage15Data, ventureName }) is called',
        then: 'Returns phases[] aligned with milestones, pnl object with revenue/cogs/grossMargin/opex(rd,sm,ga)/ebitda/netIncome, cashBalanceEnd > 0 for viable ventures, and promotion_gate with pass/reasons'
      },
      {
        given: 'Stage 16 output where cashBalanceEnd is negative and monthly burn exceeds revenue by 3x',
        when: 'Viability check runs and evaluatePromotionGate() is called',
        then: 'viabilityWarnings includes warning with type="cash_runway" and promotion_gate returns { pass: false, reasons: ["Negative cash trajectory", "Burn rate exceeds revenue projections"] }'
      }
    ]
  };

  // Update all 3 stories
  const updates = [
    { id: 'bdb5257e-72aa-4a05-83ac-c43792c02964', ...story1Update },
    { id: '4632a375-6861-4540-a406-a6036ae0bddb', ...story2Update },
    { id: '9d41f4e2-765c-476d-827f-1bac57aff9f4', ...story3Update },
  ];

  for (const { id, ...fields } of updates) {
    const { error } = await supabase
      .from('user_stories')
      .update(fields)
      .eq('id', id);

    if (error) {
      console.log('Error updating', id, ':', error.message);
    } else {
      console.log('Updated story:', id);
    }
  }

  console.log('All 3 stories updated with enriched implementation_context, architecture_references, and given_when_then');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
