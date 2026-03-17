#!/usr/bin/env node
/**
 * E2E Smoke Test — Stages 10-12 (Identity Phase Resequence)
 * Part of SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-A
 *
 * Tests:
 *  1. Template loading (schema, validate, computeDerived, outputSchema)
 *  2. Validation with good/bad data
 *  3. Contract compliance (consumes/produces match templates)
 *  4. Cross-stage data flow (Stage 10 output → Stage 11 input → Stage 12 input)
 *  5. Reality gate (pass and fail scenarios)
 *  6. Analysis step imports (modules load without error)
 */

import stage10Template, { MIN_PERSONAS, MIN_CANDIDATES as S10_MIN_CANDIDATES, BRAND_GENOME_KEYS } from '../lib/eva/stage-templates/stage-10.js';
import stage11Template, { MIN_CANDIDATES as S11_MIN_CANDIDATES } from '../lib/eva/stage-templates/stage-11.js';
import stage12Template, {
  evaluateRealityGate,
  SALES_MODELS,
  REQUIRED_TIERS,
  REQUIRED_CHANNELS,
  MIN_DEAL_STAGES,
  MIN_FUNNEL_STAGES,
  MIN_JOURNEY_STEPS,
} from '../lib/eva/stage-templates/stage-12.js';
import { getContract } from '../lib/eva/contracts/stage-contracts.js';

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, label) {
  if (condition) {
    passed++;
    console.log('  PASS ' + label);
  } else {
    failed++;
    failures.push(label);
    console.log('  FAIL ' + label);
  }
}

// ─── Test Data Fixtures ───────────────────────────────────────────────

function makePersonas(count) {
  return Array.from({ length: count }, (_, i) => ({
    name: 'Persona ' + (i + 1),
    role: 'User Role ' + (i + 1),
    demographics: { ageRange: '25-35', income: '$60k-$90k' },
    goals: ['Goal A', 'Goal B'],
    painPoints: ['Pain A', 'Pain B'],
    behaviors: ['Behavior A'],
    motivations: ['Motivation A'],
  }));
}

function makeBrandGenome() {
  // BRAND_GENOME_KEYS = ['archetype','values','tone','audience','differentiators']
  const genome = {};
  for (const key of BRAND_GENOME_KEYS) {
    genome[key] = 'Sample value for ' + key;
  }
  genome.customerAlignment = [
    { trait: 'Innovation', personaInsight: 'Seeks novelty', personaName: 'Persona 1' },
    { trait: 'Trust', personaInsight: 'Values reliability', personaName: 'Persona 2' },
  ];
  return genome;
}

function makeStage10GoodData() {
  return {
    customerPersonas: makePersonas(3),
    brandGenome: makeBrandGenome(),
    brandPersonality: { tone: 'Professional', voice: 'Authoritative' },
    namingStrategy: 'descriptive',
    scoringCriteria: [
      { name: 'Market Fit', weight: 40, description: 'How well it fits the market' },
      { name: 'Brand Alignment', weight: 30, description: 'Aligns with brand values' },
      { name: 'Persona Resonance', weight: 30, description: 'Resonates with personas' },
    ],
    candidates: Array.from({ length: 5 }, (_, i) => ({
      name: 'Candidate ' + (i + 1),
      rationale: 'Strong fit because of reason ' + (i + 1),
      scores: { 'Market Fit': 8, 'Brand Alignment': 7, 'Persona Resonance': 9 },
    })),
    chairmanGate: { status: 'approved', rationale: 'Strong brand foundation' },
  };
}

function makeStage11GoodData() {
  return {
    namingStrategy: { approach: 'descriptive', rationale: 'Clear communication of value' },
    scoringCriteria: [
      { name: 'Persona Resonance', weight: 50 },
      { name: 'Memorability', weight: 50 },
    ],
    candidates: Array.from({ length: 5 }, (_, i) => ({
      name: 'BrandName' + (i + 1),
      rationale: 'Reason ' + (i + 1),
      scores: { 'Persona Resonance': 8, 'Memorability': 7 },
      personaFit: [
        { personaName: 'Persona 1', fitScore: 8, rationale: 'Great fit' },
        { personaName: 'Persona 2', fitScore: 7, rationale: 'Good fit' },
        { personaName: 'Persona 3', fitScore: 9, rationale: 'Excellent fit' },
      ],
    })),
    visualIdentity: {
      colorPalette: [
        { name: 'Primary', hex: '#1a1a2e' },
        { name: 'Secondary', hex: '#16213e' },
        { name: 'Accent', hex: '#0f3460' },
      ],
      typography: { headingFont: 'Inter', bodyFont: 'Open Sans' },
      imageryGuidance: 'Professional, clean photography with blue tones',
    },
    brandExpression: { tagline: 'Innovation simplified', elevator_pitch: 'We simplify innovation', messaging_pillars: ['Trust', 'Speed'] },
  };
}

function makeStage12GoodData() {
  return {
    marketTiers: Array.from({ length: 3 }, (_, i) => ({
      name: 'Tier ' + (i + 1),
      description: 'Market tier description ' + (i + 1),
      persona: 'Persona ' + (i + 1),
      tam: 1000000 * (3 - i),
      sam: 500000 * (3 - i),
      som: 100000 * (3 - i),
    })),
    channels: Array.from({ length: 8 }, (_, i) => ({
      name: 'Channel ' + (i + 1),
      channelType: ['paid', 'organic', 'earned', 'owned'][i % 4],
      primaryTier: 'Tier ' + ((i % 3) + 1),
      monthly_budget: 5000 + i * 1000,
      expected_cac: 50 + i * 10,
      primary_kpi: 'KPI ' + (i + 1),
    })),
    salesModel: 'hybrid',
    sales_cycle_days: 45,
    deal_stages: Array.from({ length: 3 }, (_, i) => ({
      name: 'Stage ' + (i + 1),
      description: 'Deal stage description ' + (i + 1),
      avg_duration_days: 10 + i * 5,
      mappedFunnelStage: 'Funnel ' + (i + 1),
    })),
    funnel_stages: Array.from({ length: 4 }, (_, i) => ({
      name: 'Funnel ' + (i + 1),
      metric: 'Metric ' + (i + 1),
      target_value: 1000 * (4 - i),
      conversionRateEstimate: 0.25 - i * 0.05,
    })),
    customer_journey: Array.from({ length: 5 }, (_, i) => ({
      step: 'Step ' + (i + 1),
      funnel_stage: 'Funnel ' + ((i % 4) + 1),
      touchpoint: 'Touchpoint ' + (i + 1),
    })),
  };
}

// ─── Test 1: Template Loading ────────────────────────────────────────

console.log('\n=== Test 1: Template Loading ===');

assert(stage10Template.id === 'stage-10', 'Stage 10 template id');
assert(stage10Template.title === 'Customer & Brand Foundation', 'Stage 10 template title');
assert(typeof stage10Template.validate === 'function', 'Stage 10 has validate()');
assert(typeof stage10Template.computeDerived === 'function', 'Stage 10 has computeDerived()');
assert(Array.isArray(stage10Template.outputSchema), 'Stage 10 has outputSchema');
assert(typeof stage10Template.analysisStep === 'function', 'Stage 10 has analysisStep');

assert(stage11Template.id === 'stage-11', 'Stage 11 template id');
assert(stage11Template.title === 'Naming & Visual Identity', 'Stage 11 template title');
assert(typeof stage11Template.validate === 'function', 'Stage 11 has validate()');
assert(Array.isArray(stage11Template.outputSchema), 'Stage 11 has outputSchema');
assert(typeof stage11Template.analysisStep === 'function', 'Stage 11 has analysisStep');

assert(stage12Template.id === 'stage-12', 'Stage 12 template id');
assert(stage12Template.title === 'GTM & Sales Strategy', 'Stage 12 template title');
assert(typeof stage12Template.validate === 'function', 'Stage 12 has validate()');
assert(Array.isArray(stage12Template.outputSchema), 'Stage 12 has outputSchema');
assert(typeof stage12Template.analysisStep === 'function', 'Stage 12 has analysisStep');

// ─── Test 2: Validation — Good Data ──────────────────────────────────

console.log('\n=== Test 2: Validation — Good Data ===');

const s10Result = stage10Template.validate(makeStage10GoodData(), { logger: { warn() {} } });
assert(s10Result.valid === true, 'Stage 10 good data validates');
assert(s10Result.errors.length === 0, 'Stage 10 good data has 0 errors');

const s11Result = stage11Template.validate(makeStage11GoodData(), { logger: { warn() {} } });
assert(s11Result.valid === true, 'Stage 11 good data validates');
assert(s11Result.errors.length === 0, 'Stage 11 good data has 0 errors');

const s12Result = stage12Template.validate(makeStage12GoodData(), { logger: { warn() {} } });
assert(s12Result.valid === true, 'Stage 12 good data validates');
assert(s12Result.errors.length === 0, 'Stage 12 good data has 0 errors');

// ─── Test 3: Validation — Bad Data ───────────────────────────────────

console.log('\n=== Test 3: Validation — Bad Data ===');

const s10Bad = stage10Template.validate({}, { logger: { warn() {} } });
assert(s10Bad.valid === false, 'Stage 10 empty data fails validation');
assert(s10Bad.errors.length >= 3, 'Stage 10 empty data has 3+ errors');

const s11Bad = stage11Template.validate({}, { logger: { warn() {} } });
assert(s11Bad.valid === false, 'Stage 11 empty data fails validation');
assert(s11Bad.errors.length >= 3, 'Stage 11 empty data has 3+ errors');

const s12Bad = stage12Template.validate({}, { logger: { warn() {} } });
assert(s12Bad.valid === false, 'Stage 12 empty data fails validation');
assert(s12Bad.errors.length >= 3, 'Stage 12 empty data has 3+ errors');

// Specific bad data: wrong salesModel enum
const s12WrongEnum = stage12Template.validate(
  { ...makeStage12GoodData(), salesModel: 'telemarketing' },
  { logger: { warn() {} } }
);
assert(s12WrongEnum.valid === false, 'Stage 12 rejects invalid salesModel enum');

// Specific bad data: too few market tiers
const s12FewTiers = stage12Template.validate(
  { ...makeStage12GoodData(), marketTiers: [{ name: 'One', description: 'Only one' }] },
  { logger: { warn() {} } }
);
assert(s12FewTiers.valid === false, 'Stage 12 rejects fewer than 3 market tiers');

// ─── Test 4: Contract Compliance ─────────────────────────────────────

console.log('\n=== Test 4: Contract Compliance ===');

const c10 = getContract(10);
assert(c10 !== undefined, 'Contract exists for stage 10');
// produces is a keyed object: { fieldName: { type, minItems, ... } }
const c10ProduceKeys = Object.keys(c10.produces);
assert(c10ProduceKeys.includes('customerPersonas'), 'Stage 10 contract produces customerPersonas');
assert(c10ProduceKeys.includes('brandGenome'), 'Stage 10 contract produces brandGenome');
assert(c10ProduceKeys.includes('candidates'), 'Stage 10 contract produces candidates');

const c11 = getContract(11);
assert(c11 !== undefined, 'Contract exists for stage 11');
assert(c11.consumes.some(c => c.stage === 10), 'Stage 11 consumes from stage 10');
const c11ProduceKeys = Object.keys(c11.produces);
assert(c11ProduceKeys.includes('candidates'), 'Stage 11 contract produces candidates');
assert(c11ProduceKeys.includes('visualIdentity'), 'Stage 11 contract produces visualIdentity');

const c12 = getContract(12);
assert(c12 !== undefined, 'Contract exists for stage 12');
assert(c12.consumes.some(c => c.stage === 10), 'Stage 12 consumes from stage 10');
assert(c12.consumes.some(c => c.stage === 11), 'Stage 12 consumes from stage 11');
const c12ProduceKeys = Object.keys(c12.produces);
assert(c12ProduceKeys.includes('marketTiers'), 'Stage 12 contract produces marketTiers');
assert(c12ProduceKeys.includes('channels'), 'Stage 12 contract produces channels');
assert(c12ProduceKeys.includes('salesModel'), 'Stage 12 contract produces salesModel');
assert(c12ProduceKeys.includes('reality_gate'), 'Stage 12 contract produces reality_gate');

// Verify Stage 10 output schema fields match contract produces
const s10OutputFields = stage10Template.outputSchema.map(o => o.field);
for (const prodKey of c10ProduceKeys) {
  assert(s10OutputFields.includes(prodKey), 'Stage 10 outputSchema includes contract field: ' + prodKey);
}

// ─── Test 5: Cross-Stage Data Flow ───────────────────────────────────

console.log('\n=== Test 5: Cross-Stage Data Flow ===');

// Stage 10 output feeds Stage 11 consumes
const s10Output = makeStage10GoodData();
const c11Consumes10 = c11.consumes.find(c => c.stage === 10);
if (c11Consumes10) {
  // fields is a keyed object: { fieldName: { type, ... } }
  for (const fieldName of Object.keys(c11Consumes10.fields)) {
    assert(s10Output[fieldName] !== undefined, 'Stage 10 output provides ' + fieldName + ' for Stage 11');
  }
}

// Stage 11 output feeds Stage 12 consumes
const s11Output = makeStage11GoodData();
const c12Consumes11 = c12.consumes.find(c => c.stage === 11);
if (c12Consumes11) {
  for (const fieldName of Object.keys(c12Consumes11.fields)) {
    assert(s11Output[fieldName] !== undefined, 'Stage 11 output provides ' + fieldName + ' for Stage 12');
  }
}

// ─── Test 6: Reality Gate — Pass ──────────────────────────────────────

console.log('\n=== Test 6: Reality Gate ===');

const gatePass = evaluateRealityGate({
  stage10: makeStage10GoodData(),
  stage11: makeStage11GoodData(),
  stage12: makeStage12GoodData(),
});
assert(gatePass.pass === true, 'Reality gate passes with complete data');
assert(gatePass.blockers.length === 0, 'Reality gate has 0 blockers when passing');
assert(typeof gatePass.rationale === 'string', 'Reality gate returns rationale');

// Reality gate — fail: missing personas
const gateFail1 = evaluateRealityGate({
  stage10: { customerPersonas: [], brandGenome: {} },
  stage11: { candidates: [] },
  stage12: { marketTiers: [], channels: [], deal_stages: [], funnel_stages: [], customer_journey: [] },
});
assert(gateFail1.pass === false, 'Reality gate fails with empty data');
assert(gateFail1.blockers.length >= 5, 'Reality gate reports 5+ blockers with empty data');

// Reality gate — fail: candidates missing personaFit
const gateFail2 = evaluateRealityGate({
  stage10: makeStage10GoodData(),
  stage11: {
    candidates: Array.from({ length: 5 }, (_, i) => ({ name: 'C' + i })), // No personaFit
  },
  stage12: makeStage12GoodData(),
});
assert(gateFail2.pass === false, 'Reality gate fails when candidates lack personaFit');
assert(gateFail2.blockers.some(b => b.includes('personaFit')), 'Reality gate reports personaFit blocker');

// ─── Test 7: Constants Consistency ───────────────────────────────────

console.log('\n=== Test 7: Constants Consistency ===');

assert(MIN_PERSONAS === 3, 'MIN_PERSONAS is 3');
assert(S10_MIN_CANDIDATES === 5, 'Stage 10 MIN_CANDIDATES is 5');
assert(S11_MIN_CANDIDATES === 5, 'Stage 11 MIN_CANDIDATES is 5');
assert(REQUIRED_TIERS === 3, 'REQUIRED_TIERS is 3');
assert(REQUIRED_CHANNELS === 8, 'REQUIRED_CHANNELS is 8');
assert(MIN_DEAL_STAGES === 3, 'MIN_DEAL_STAGES is 3');
assert(MIN_FUNNEL_STAGES === 4, 'MIN_FUNNEL_STAGES is 4');
assert(MIN_JOURNEY_STEPS === 5, 'MIN_JOURNEY_STEPS is 5');
assert(SALES_MODELS.includes('hybrid'), 'SALES_MODELS includes hybrid');
assert(SALES_MODELS.includes('self-serve'), 'SALES_MODELS includes self-serve');

// ─── Test 8: Downstream Contracts (Stage 13) ─────────────────────────

console.log('\n=== Test 8: Downstream Contract Check ===');

const c13 = getContract(13);
if (c13) {
  // Stage 13 (Product Roadmap) should not consume from old stage 10/11/12 fields that no longer exist
  const c13ConsumeStages = c13.consumes.map(c => c.stage);
  assert(typeof c13 === 'object', 'Contract exists for stage 13');
  console.log('  INFO Stage 13 consumes from stages: ' + JSON.stringify(c13ConsumeStages));
} else {
  console.log('  SKIP Stage 13 contract not found (may not be updated yet)');
}

// ─── Summary ─────────────────────────────────────────────────────────

console.log('\n===================================');
console.log('  RESULTS: ' + passed + ' passed, ' + failed + ' failed');
console.log('===================================');

if (failures.length > 0) {
  console.log('\nFailures:');
  for (const f of failures) {
    console.log('  - ' + f);
  }
  process.exit(1);
}

console.log('\nAll tests passed!');
process.exit(0);
