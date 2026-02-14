#!/usr/bin/env node
/**
 * One-time script to update user stories for SD-EVA-FEAT-TEMPLATES-ENGINE-001
 * with detailed acceptance criteria and Given-When-Then scenarios.
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  // Story 1: Stage 6 Risk Assessment
  const s6 = await sb.from('user_stories').update({
    user_role: 'EVA Venture Analyst',
    user_want: 'Stage 6 Risk Assessment to have an LLM-powered analysis step that generates risks from Stages 1-5 data with 2-factor probability x consequence scoring and source attribution per risk',
    user_benefit: 'risks are consistently scored using a structured methodology and each risk traces back to the upstream stage that surfaced it, enabling evidence-based risk prioritization',
    acceptance_criteria: [
      'Analysis step function analyzeStage06() accepts {stage1Data, stage3Data, stage4Data, stage5Data, ventureName} and returns a structured risk array',
      'Each risk includes: id (string), category (Market/Product/Technical/Legal-Compliance/Financial/Operational), description (min 10 chars), probability (1-5), consequence (1-5), score (probability * consequence, derived), mitigation (min 10 chars), source_stage (integer 1-5)',
      'Minimum 8 risks generated across at least 3 distinct categories',
      'Aggregate metrics computed: risksByCategory (count per category), averageScore (mean of all risk scores), highRiskCount (risks with score >= 15)',
      'Template stage-06.js upgraded to version 2.0.0 with TEMPLATE.analysisStep = analyzeStage06',
      'Input validation throws descriptive Error if stage1Data is missing or lacks description field',
      'LLM response parsed as JSON with markdown fence stripping; parse failure throws Error with first 200 chars of response'
    ],
    given_when_then: [
      'Given valid Stage 1-5 data with a SaaS venture description, When analyzeStage06() is called, Then it returns an array of >= 8 risks each with probability (1-5), consequence (1-5), and derived score',
      'Given a venture with financial projections from Stage 5, When analyzeStage06() processes the data, Then at least 1 risk has category Financial and source_stage 5',
      'Given no stage1Data is provided, When analyzeStage06() is called, Then it throws an Error with message containing Stage 06',
      'Given the LLM returns malformed JSON, When the response is parsed, Then a descriptive Error is thrown with the first 200 chars of the response',
      'Given stage-06.js template, When inspecting TEMPLATE.version, Then it equals 2.0.0 and TEMPLATE.analysisStep is the analyzeStage06 function'
    ]
  }).eq('id', 'd6f0b7b7-40b1-43cf-9809-6543bce755dd');
  console.log('Stage 6:', s6.error ? s6.error.message : 'OK');

  // Story 2: Stage 7 Revenue Architecture
  const s7 = await sb.from('user_stories').update({
    user_role: 'EVA Venture Analyst',
    user_want: 'Stage 7 Pricing to have an LLM-powered analysis step that generates a pricing strategy consuming Stages 4-6 competitive/financial/risk data with a 6-value pricingModel enum and competitive price anchoring',
    user_benefit: 'pricing decisions are grounded in competitive intelligence and financial constraints, with an explicit pricing model classification that feeds downstream BMC and exit valuation stages',
    acceptance_criteria: [
      'Analysis step function analyzeStage07() accepts {stage1Data, stage4Data, stage5Data, stage6Data, ventureName} and returns pricing strategy object',
      'Output includes pricingModel from enum: freemium, subscription, usage_based, per_seat, marketplace_commission, one_time',
      'Output includes primaryValueMetric (string, what the customer pays for), priceAnchor object with {competitorAvg, proposedPrice, positioning: premium/parity/discount}',
      'At least 2 pricing tiers generated, each with name, price (>= 0), billing_period (monthly/quarterly/annual), and target_segment',
      'Unit economics seeded from Stage 5: gross_margin_pct, churn_rate_monthly, cac, arpa populated from upstream data',
      'Template stage-07.js upgraded to version 2.0.0 with TEMPLATE.analysisStep = analyzeStage07',
      'Input validation throws Error if stage1Data is missing'
    ],
    given_when_then: [
      'Given Stage 4 competitive data with 3 competitors averaging $49/mo, When analyzeStage07() runs, Then priceAnchor.competitorAvg approximates 49 and positioning is one of premium/parity/discount',
      'Given Stage 5 financial data with CAC=200 and LTV=1000, When analyzeStage07() generates tiers, Then at least 2 tiers are returned with price > 0 and valid billing_period',
      'Given valid upstream data, When analyzeStage07() returns, Then pricingModel is one of the 6 allowed enum values',
      'Given no stage1Data, When analyzeStage07() is called, Then it throws an Error',
      'Given stage-07.js template, When inspecting TEMPLATE.version, Then it equals 2.0.0 and TEMPLATE.analysisStep is the analyzeStage07 function'
    ]
  }).eq('id', '8ab8a4fc-917b-4eed-ba95-717168c475a9');
  console.log('Stage 7:', s7.error ? s7.error.message : 'OK');

  // Story 3: Stage 8 BMC
  const s8 = await sb.from('user_stories').update({
    user_role: 'EVA Venture Analyst',
    user_want: 'Stage 8 BMC to have an LLM-powered analysis step that generates all 9 BMC blocks from Stages 1-7 data with structured items containing text, priority (1-3), and evidence citing the source stage',
    user_benefit: 'the Business Model Canvas is automatically populated with evidence-backed entries from prior analysis stages, ensuring completeness and traceability for Phase 2 validation',
    acceptance_criteria: [
      'Analysis step function analyzeStage08() accepts {stage1Data, stage4Data, stage5Data, stage6Data, stage7Data, ventureName} and returns 9 BMC blocks',
      'All 9 blocks populated: customerSegments, valuePropositions, channels, customerRelationships, revenueStreams, keyResources, keyActivities, keyPartnerships, costStructure',
      'Each block contains items array; each item has text (string, min 1 char), priority (integer 1-3), and evidence (string citing source stage)',
      'keyPartnerships requires minimum 1 item; all other blocks require minimum 2 items per existing template validation rules',
      'Cross-block consistency: revenueStreams items reference Stage 7 pricing tiers, costStructure items reference Stage 6 risk mitigations',
      'Template stage-08.js upgraded to version 2.0.0 with TEMPLATE.analysisStep = analyzeStage08',
      'Input validation throws Error if stage1Data is missing'
    ],
    given_when_then: [
      'Given valid Stages 1-7 data for a SaaS venture, When analyzeStage08() runs, Then all 9 BMC blocks are returned with items arrays containing text, priority, and evidence fields',
      'Given Stage 7 data with 2 pricing tiers, When the BMC is generated, Then revenueStreams.items includes at least 1 item referencing the pricing model',
      'Given a venture with 3 key risks from Stage 6, When costStructure is generated, Then at least 1 item references risk mitigation costs',
      'Given no stage1Data, When analyzeStage08() is called, Then it throws an Error',
      'Given stage-08.js template, When inspecting TEMPLATE.version, Then it equals 2.0.0 and TEMPLATE.analysisStep is the analyzeStage08 function'
    ]
  }).eq('id', 'f8e8fc21-f256-48c3-9fe4-5137221f9224');
  console.log('Stage 8:', s8.error ? s8.error.message : 'OK');

  // Story 4: Stage 9 Exit Strategy + Reality Gate
  const s9 = await sb.from('user_stories').update({
    user_role: 'EVA Venture Analyst',
    user_want: 'Stage 9 Exit Strategy to have an LLM-powered analysis step that generates an exit strategy with type enum (acquisition/ipo/merger/mbo/liquidation), buyer type, lightweight valuation using revenue multiples, and a Reality Gate evaluating Phase 2 completeness',
    user_benefit: 'exit viability is assessed systematically with a concrete valuation range, and the Reality Gate enforces Phase 2 completeness before the venture proceeds to Phase 3 identity work',
    acceptance_criteria: [
      'Analysis step function analyzeStage09() accepts {stage1Data, stage5Data, stage6Data, stage7Data, stage8Data, ventureName} and returns exit strategy with valuation',
      'Output includes exit_paths array with type from enum: acquisition, ipo, merger, mbo, liquidation; each path has description and probability_pct (0-100)',
      'Output includes valuationEstimate object with method (default: revenue_multiple), revenueBase (from Stage 5), multipleLow, multipleBase, multipleHigh, and derived estimatedRange {low, base, high}',
      'Output includes target_acquirers array with minimum 3 entries, each having name, rationale, and fit_score (1-5)',
      'Reality Gate evaluation: checks Stage 6 has >= 10 risks, Stage 7 has >= 1 tier with non-null LTV, Stage 8 has all 9 BMC blocks populated; returns {pass, rationale, blockers, required_next_actions}',
      'Template stage-09.js upgraded to version 2.0.0 with TEMPLATE.analysisStep = analyzeStage09',
      'Input validation throws Error if stage1Data is missing'
    ],
    given_when_then: [
      'Given valid Stages 1-8 data with a SaaS venture generating 500k ARR, When analyzeStage09() runs, Then valuationEstimate includes multipleLow < multipleBase < multipleHigh and estimatedRange.base = revenueBase * multipleBase',
      'Given exit_paths in the output, When inspecting each path type, Then all types are one of acquisition/ipo/merger/mbo/liquidation',
      'Given Stage 6 has 12 risks and Stage 7 has 2 tiers with LTV computed and Stage 8 has all 9 blocks, When Reality Gate evaluates, Then pass is true and blockers array is empty',
      'Given Stage 6 has only 5 risks, When Reality Gate evaluates, Then pass is false and blockers includes insufficient risks message',
      'Given no stage1Data, When analyzeStage09() is called, Then it throws an Error',
      'Given stage-09.js template, When inspecting TEMPLATE.version, Then it equals 2.0.0 and TEMPLATE.analysisStep is the analyzeStage09 function'
    ]
  }).eq('id', '67181052-3925-4f78-9b5a-11d1401b58d9');
  console.log('Stage 9:', s9.error ? s9.error.message : 'OK');

  console.log('All stories updated.');
}

main();
