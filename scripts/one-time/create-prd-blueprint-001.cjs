#!/usr/bin/env node
/**
 * One-time script: Create PRD for SD-EVA-FEAT-TEMPLATES-BLUEPRINT-001
 * Stages 13-16 (THE BLUEPRINT phase)
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const sdUuid = 'b84edc1a-48e0-4172-b3cc-0c95a4c843b9';

  const prd = {
    id: 'PRD-EVA-FEAT-TEMPLATES-BLUEPRINT-001',
    sd_id: sdUuid,
    title: 'Stage Templates: THE BLUEPRINT (Stages 13-16) - Active analysisSteps',
    status: 'planning',
    version: '1.0.0',

    executive_summary: 'Implement active LLM-powered analysisSteps for Stages 13-16 (Product Roadmap, Technical Architecture, Resource Planning, Financial Projections) with structured JSON outputs, v2.0 enhanced schemas, Kill Gate at Stage 13, and Promotion Gate at Stage 16. Follows the proven v2.0.0 pattern from Stages 1-9 (B-1 and B-2). Consumes upstream stage data to generate THE BLUEPRINT phase outputs that feed into THE BUILD LOOP (Phase 5).',

    functional_requirements: [
      {
        id: 'FR-1',
        priority: 'CRITICAL',
        requirement: 'Stage 13 analysisStep generates a Product Roadmap consuming Stages 1-12 data, with milestones prioritized as now/next/later and deliverables typed by category.',
        description: 'Adds stage-13-roadmap.js analysisStep that reads all upstream stage data and produces a structured roadmap. Each milestone includes priority enum (now|next|later), typed deliverables (feature|infrastructure|integration|documentation), measurable outcomes, and optional inter-milestone dependencies. The Kill Gate function is enhanced to validate at least one now-priority milestone exists with deliverables.',
        acceptance_criteria: [
          'Given Stages 1-12 outputs exist, when Stage 13 analysisStep runs, then it produces milestones[] where each milestone has title, description, targetDate, priority (now|next|later), deliverables[] with type enum, and outcomes[].',
          'Given a roadmap with no now-priority milestones, when Kill Gate evaluates, then it returns FAIL with reason explaining the gap.',
          'Given valid upstream data, when analysisStep completes, then at least 3 milestones are generated with at least 1 having priority=now.'
        ]
      },
      {
        id: 'FR-2',
        priority: 'CRITICAL',
        requirement: 'Stage 14 analysisStep synthesizes Technical Architecture consuming Stage 13 deliverables and Stage 6 risks, with security section and Schema-Lite data entities.',
        description: 'Adds stage-14-architecture.js analysisStep that maps Stage 13 deliverables to architecture layers (presentation, api, business_logic, data, infrastructure), generates constraints with category enums, adds a security object (authStrategy, dataClassification, complianceRequirements), and produces Schema-Lite dataEntities with relationships and estimated volume.',
        acceptance_criteria: [
          'Given Stage 13 roadmap exists, when Stage 14 analysisStep runs, then it produces layers[] covering at least the 5 core layers with technology and components.',
          'Given Stage 6 risks exist, when Stage 14 runs, then constraints[] includes at least one constraint with category from enum (performance|security|scalability|compliance|budget|timeline).',
          'Given any venture, when Stage 14 completes, then security object includes authStrategy, dataClassification, and complianceRequirements[] fields.',
          'Given any venture, when Stage 14 completes, then dataEntities[] includes at least 2 entities with name, description, relationships[], and estimatedVolume.'
        ]
      },
      {
        id: 'FR-3',
        priority: 'CRITICAL',
        requirement: 'Stage 15 analysisStep generates Resource Planning from Stages 13-14 with team allocation, compute budget, and risk-linked severity/priority enums.',
        description: 'Adds stage-15-resource-planning.js analysisStep. Generates team_members with roles, allocation percentages, and cost estimates; skill_gaps with hiring priorities; compute and infrastructure budget; and risks with severity (critical|high|medium|low) and priority (immediate|short_term|long_term) enums linked to roadmap phases via phaseRef.',
        acceptance_criteria: [
          'Given Stages 13-14 exist, when Stage 15 analysisStep runs, then team_members[] includes at least 2 members with distinct roles, allocation_pct, and monthly_cost.',
          'Given any venture, when Stage 15 completes, then skill_gaps[] identifies missing capabilities with hiring_priority enum.',
          'Given roadmap phases exist, when Stage 15 runs, then risks[] each have severity enum (critical|high|medium|low), priority enum (immediate|short_term|long_term), and phaseRef linking to a Stage 13 milestone.',
          'Given Stage 14 architecture, when Stage 15 completes, then compute_budget object includes monthly infrastructure costs and service requirements.'
        ]
      },
      {
        id: 'FR-4',
        priority: 'CRITICAL',
        requirement: 'Stage 16 analysisStep produces Startup Standard P&L with per-phase financial projections consuming Stages 5, 7, 13-15 and evaluates the Promotion Gate.',
        description: 'Adds stage-16-financial-projections.js analysisStep. Generates phases[] aligned with Stage 13 roadmap phases, each with detailed cost breakdown (personnel, infrastructure, marketing, other) and revenue projections from Stage 7 pricing model. Produces a Startup Standard P&L (Revenue, COGS, Gross Margin, OpEx subdivided into R&D/S&M/G&A, EBITDA, Net Income). Calculates cashBalanceEnd and generates viabilityWarnings. Promotion Gate validates financial viability.',
        acceptance_criteria: [
          'Given Stages 5, 7, 13-15 exist, when Stage 16 analysisStep runs, then phases[] has one entry per Stage 13 milestone with costs object (personnel, infrastructure, marketing, other) and revenue projections.',
          'Given valid financial data, when Stage 16 completes, then pnl object includes revenue, cogs, grossMargin, opex (rd, sm, ga), ebitda, and netIncome fields.',
          'Given cash position falls below 3 months runway, when viability checks run, then viabilityWarnings[] includes a warning with type and recommendation.',
          'Given all Stage 16 outputs, when Promotion Gate evaluates, then it returns PASS/FAIL with structured reasons based on cash trajectory, burn rate, and margin alignment.'
        ]
      },
      {
        id: 'FR-5',
        priority: 'HIGH',
        requirement: 'All 4 templates (stage-13 through stage-16) upgraded to v2.0.0 with analysisStep property exported.',
        description: 'Updates each template to version 2.0.0 with enhanced schema fields matching the architecture doc v2.0 targets. Adds analysisStep property referencing the corresponding analysis-steps module. Maintains backward compatibility with existing validate() and computeDerived() functions.',
        acceptance_criteria: [
          'Given any of stage-13 through stage-16 templates, when template.version is checked, then it returns 2.0.0.',
          'Given any of stage-13 through stage-16 templates, when template.analysisStep is accessed, then it returns the corresponding async analysis function.',
          'Given existing validate() functions, when called with v1.0 data, then they still pass (backward compatibility).'
        ]
      },
      {
        id: 'FR-6',
        priority: 'HIGH',
        requirement: 'Unit tests cover all 4 analysisSteps with LLM response mocking.',
        description: 'Creates test files for each analysisStep that mock the LLM client, verify JSON parsing, validate output schema compliance, test error handling for malformed LLM responses, and verify enum normalization. Follows the test pattern from B-2 (stages 6-9).',
        acceptance_criteria: [
          'Given a mocked LLM response, when each analysisStep is called, then the output matches the expected v2.0 schema.',
          'Given a malformed LLM response (invalid JSON), when analysisStep processes it, then it throws a descriptive error.',
          'Given enum values outside the allowed set, when normalization runs, then they are clamped to valid defaults.',
          'Given all test files, when npm run test:unit runs, then all stage-13 through stage-16 tests pass.'
        ]
      }
    ],

    system_architecture: {
      overview: 'Each analysisStep follows the proven pattern from stages 1-9: import getLLMClient from lib/llm/index.js, define a SYSTEM_PROMPT with JSON schema, construct a user prompt from upstream stage data, call client.complete(), parse JSON, normalize/validate output, and return structured data.',
      components: [
        { name: 'stage-13-roadmap.js', type: 'analysis-step', path: 'lib/eva/stage-templates/analysis-steps/', description: 'Product roadmap generation from Stages 1-12' },
        { name: 'stage-14-architecture.js', type: 'analysis-step', path: 'lib/eva/stage-templates/analysis-steps/', description: 'Technical architecture synthesis from Stage 13 + Stage 6' },
        { name: 'stage-15-resource-planning.js', type: 'analysis-step', path: 'lib/eva/stage-templates/analysis-steps/', description: 'Resource/team allocation from Stages 13-14' },
        { name: 'stage-16-financial-projections.js', type: 'analysis-step', path: 'lib/eva/stage-templates/analysis-steps/', description: 'Financial modeling with P&L from Stages 5, 7, 13-15' },
        { name: 'stage-13.js', type: 'template-upgrade', path: 'lib/eva/stage-templates/', description: 'Updated to v2.0.0 with analysisStep property' },
        { name: 'stage-14.js', type: 'template-upgrade', path: 'lib/eva/stage-templates/', description: 'Updated to v2.0.0 with analysisStep property' },
        { name: 'stage-15.js', type: 'template-upgrade', path: 'lib/eva/stage-templates/', description: 'Updated to v2.0.0 with analysisStep property' },
        { name: 'stage-16.js', type: 'template-upgrade', path: 'lib/eva/stage-templates/', description: 'Updated to v2.0.0 with analysisStep property' }
      ],
      data_flow: 'Stages 1-12 data -> Stage 13 (roadmap) -> Stage 14 (architecture) -> Stage 15 (resources/risks) -> Stage 16 (financials + Promotion Gate). Each stage consumes upstream outputs via parameter destructuring.',
      integration_points: [
        'getLLMClient() from lib/llm/index.js for LLM calls',
        'Template registry in lib/eva/stage-templates/index.js exports updated templates',
        'Stage runner calls template.analysisStep() during execution',
        'Kill Gate (stage 13) and Promotion Gate (stage 16) functions exported for deterministic evaluation'
      ]
    },

    test_scenarios: [
      {
        id: 'TS-1',
        scenario: 'Stage 13 happy path: generate roadmap with prioritized milestones',
        given: 'Stages 1-12 outputs exist with venture description, market data, financial model, and risk matrix',
        when: 'analyzeStage13() is invoked with upstream data',
        then: 'Output contains milestones[] with priority enum (now/next/later), deliverables[] with type enum, outcomes[], and at least 3 milestones with 1 now-priority',
        test_type: 'unit'
      },
      {
        id: 'TS-2',
        scenario: 'Stage 14 happy path: synthesize architecture with security and Schema-Lite',
        given: 'Stage 13 roadmap and Stage 6 risk matrix exist',
        when: 'analyzeStage14() is invoked',
        then: 'Output contains 5+ layers, constraints[] with category enum, security object, and dataEntities[] with relationships',
        test_type: 'unit'
      },
      {
        id: 'TS-3',
        scenario: 'Stage 15 happy path: resource allocation with risk classification',
        given: 'Stages 13-14 outputs exist',
        when: 'analyzeStage15() is invoked',
        then: 'Output contains team_members[] (min 2 with distinct roles), skill_gaps[], risks[] with severity/priority enums, and compute_budget',
        test_type: 'unit'
      },
      {
        id: 'TS-4',
        scenario: 'Stage 16 happy path: P&L generation with Promotion Gate',
        given: 'Stages 5, 7, 13-15 outputs exist',
        when: 'analyzeStage16() is invoked',
        then: 'Output contains phases[] with cost breakdowns, pnl object with all P&L fields, cashBalanceEnd, and Promotion Gate evaluation',
        test_type: 'unit'
      },
      {
        id: 'TS-5',
        scenario: 'Kill Gate failure: no now-priority milestones',
        given: 'Stage 13 output has all milestones with priority=later',
        when: 'evaluateKillGate() runs',
        then: 'Returns FAIL verdict with reason about missing now-priority milestone',
        test_type: 'unit'
      },
      {
        id: 'TS-6',
        scenario: 'Promotion Gate failure: negative cash trajectory',
        given: 'Stage 16 output shows declining cashBalanceEnd with burn exceeding revenue',
        when: 'evaluatePromotionGate() runs',
        then: 'Returns FAIL verdict with viabilityWarnings about cash runway',
        test_type: 'unit'
      },
      {
        id: 'TS-7',
        scenario: 'Malformed LLM response handling',
        given: 'LLM returns invalid JSON (missing closing brace)',
        when: 'parseJSON() is called',
        then: 'Throws descriptive error with first 200 chars of response for debugging',
        test_type: 'unit'
      },
      {
        id: 'TS-8',
        scenario: 'Enum normalization for out-of-range values',
        given: 'LLM returns priority=urgent instead of now|next|later',
        when: 'Normalization runs',
        then: 'Value is clamped to default (now), output is valid',
        test_type: 'unit'
      }
    ],

    acceptance_criteria: [
      'Stages 13-16 each have an active analysisStep that generates structured JSON output via LLM and normalizes/validates all fields.',
      'Stage 13 generates roadmap with milestones[].priority enum (now|next|later), deliverables[].type enum, outcomes[], and optional dependencies[].',
      'Stage 14 generates architecture with 5+ layers, constraints[].category enum, security object (authStrategy, dataClassification, complianceRequirements), and dataEntities[] (Schema-Lite).',
      'Stage 15 generates resource plan with team_members[], skill_gaps[], risks[] with severity/priority enums, phaseRef, and compute_budget.',
      'Stage 16 generates P&L with phases[] cost breakdowns, pnl object (Revenue/COGS/Gross Margin/OpEx/EBITDA/Net Income), cashBalanceEnd, and viabilityWarnings[].',
      'Kill Gate at Stage 13 validates at least one now-priority milestone with deliverables.',
      'Promotion Gate at Stage 16 validates positive cash trajectory, manageable burn, and margin alignment.',
      'All 4 templates upgraded to version 2.0.0 with analysisStep property.',
      'Unit tests pass for all 4 analysisSteps with mocked LLM responses.'
    ],

    risks: [
      {
        risk: 'LLM output may not match enhanced v2.0 schema fields',
        severity: 'medium',
        mitigation: 'Strict JSON schema in SYSTEM_PROMPT with all required fields. Normalization functions provide defaults. Proven pattern from stages 1-9.'
      },
      {
        risk: 'Cross-stage data contracts may have gaps when upstream stages have sparse data',
        severity: 'medium',
        mitigation: 'Each analysisStep uses optional chaining and fallback defaults. Financial context degrades gracefully to N/A when Stage 5/7 data is unavailable.'
      },
      {
        risk: 'Promotion Gate edge cases with borderline financial viability',
        severity: 'low',
        mitigation: 'Existing evaluatePromotionGate handles core checks. Enhanced version adds configurable thresholds for runway months and margin percentages.'
      }
    ],

    metadata: {
      parent_sd: 'SD-EVA-ORCH-TEMPLATE-GAPFILL-001',
      sibling_pattern: 'Follows exact pattern from B-1 (Stages 1-5) and B-2 (Stages 6-9)',
      architecture_reference: 'docs/plans/eva-platform-architecture.md Section 8.4',
      vision_reference: 'docs/plans/eva-venture-lifecycle-vision.md Section 2.4',
      files_to_create: [
        'lib/eva/stage-templates/analysis-steps/stage-13-roadmap.js',
        'lib/eva/stage-templates/analysis-steps/stage-14-architecture.js',
        'lib/eva/stage-templates/analysis-steps/stage-15-resource-planning.js',
        'lib/eva/stage-templates/analysis-steps/stage-16-financial-projections.js',
        'tests/unit/eva/stage-13-roadmap.test.js',
        'tests/unit/eva/stage-14-architecture.test.js',
        'tests/unit/eva/stage-15-resource-planning.test.js',
        'tests/unit/eva/stage-16-financial-projections.test.js'
      ],
      files_to_modify: [
        'lib/eva/stage-templates/stage-13.js',
        'lib/eva/stage-templates/stage-14.js',
        'lib/eva/stage-templates/stage-15.js',
        'lib/eva/stage-templates/stage-16.js'
      ]
    }
  };

  const { data, error } = await supabase
    .from('product_requirements_v2')
    .insert(prd)
    .select('id, sd_id, title, status')
    .single();

  if (error) {
    console.log('Error creating PRD:', error.message);
    console.log('Details:', JSON.stringify(error));
  } else {
    console.log('PRD created successfully');
    console.log('PRD ID:', data.id);
    console.log('Title:', data.title);
    console.log('Status:', data.status);
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
