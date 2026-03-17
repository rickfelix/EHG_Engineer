#!/usr/bin/env node
/** Stage 4 E2E Test — Competitive Landscape (node scripts/test-stage4-e2e.js) */
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const toURL = (p) => `file://${join(ROOT, p).replace(/\\/g, '/')}`;

let passed = 0, failed = 0;
const failures = [];
function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS  ${label}`); }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}`); }
}

// ─── Mock Supabase ──────────────────────────────────────────
function createMockSupabase(tableData = {}, defaults = {}) {
  const { ventureId = 'test-venture-id' } = defaults;
  for (const [table, rows] of Object.entries(tableData)) {
    for (const row of rows) {
      if (table === 'venture_artifacts') {
        if (!('venture_id' in row)) row.venture_id = ventureId;
        if (!('is_current' in row)) row.is_current = true;
        if (!('created_at' in row)) row.created_at = new Date().toISOString();
      }
    }
  }
  return {
    from(table) {
      const rows = tableData[table] || [];
      let filters = [], inFilters = [];
      const chain = {
        select: () => chain, order: () => chain,
        eq: (col, val) => { filters.push({ col, val }); return chain; },
        in: (col, vals) => { inFilters.push({ col, vals }); return chain; },
        is: () => chain, limit: () => chain,
        maybeSingle: () => chain, single: () => chain,
        then(resolve) {
          let filtered = rows;
          for (const f of filters) filtered = filtered.filter(r => r[f.col] === f.val);
          for (const f of inFilters) filtered = filtered.filter(r => f.vals.includes(r[f.col]));
          resolve({ data: filtered.length > 0 ? (filtered.length === 1 ? filtered[0] : filtered) : null, error: null });
        },
      };
      return chain;
    },
  };
}

function silentLogger() {
  return { log: () => {}, warn: () => {}, error: () => {}, info: () => {} };
}

// ─── Mock Data ──────────────────────────────────────────────
const MOCK_STAGE1_OUTPUT = {
  description: 'A platform that connects freelance designers with small businesses needing brand identity work quickly and affordably.',
  problemStatement: 'Small businesses struggle to find affordable, quality design services for brand identity work.',
  valueProp: 'Affordable brand identity design from vetted freelance designers, delivered in 48 hours.',
  targetMarket: 'Small businesses and startups needing brand identity design',
  archetype: 'marketplace',
};

const MOCK_STAGE3_OUTPUT = {
  overallScore: 72, decision: 'pass', blockProgression: false, reasons: [],
  marketFit: 75, customerNeed: 80, momentum: 65, revenuePotential: 70,
  competitiveBarrier: 60, executionFeasibility: 72, designQuality: 68,
  competitorEntities: [{ name: 'Fiverr', positioning: 'General freelance marketplace', threat_level: 'H' }],
};

function makeCompetitor(overrides = {}) {
  return {
    name: 'Acme Corp', position: 'Market leader in SaaS design tools', threat: 'H',
    pricingModel: 'subscription',
    strengths: ['Strong brand', 'Large user base'],
    weaknesses: ['Expensive', 'Slow iteration'],
    swot: {
      strengths: ['Market dominance'], weaknesses: ['High price'],
      opportunities: ['SMB expansion'], threats: ['New entrants'],
    },
    ...overrides,
  };
}

function makeGoodData(competitorOverrides = []) {
  const competitors = competitorOverrides.length > 0
    ? competitorOverrides.map(o => makeCompetitor(o))
    : [makeCompetitor(), makeCompetitor({ name: 'Beta Inc', threat: 'M' }), makeCompetitor({ name: 'Gamma LLC', threat: 'L' })];
  return { competitors };
}

const MOCK_STAGE2_OUTPUT = { compositeScore: 70, critiques: [] };

// ─── Test 1: Template Validation ────────────────────────────
async function testTemplateValidation() {
  console.log('\n--- Test 1: Template Validation ---');
  const T = (await import(toURL('lib/eva/stage-templates/stage-04.js'))).default;

  assert(T.id === 'stage-04' && T.version === '2.0.0', 'Template id and version correct');
  assert(typeof T.validate === 'function' && typeof T.computeDerived === 'function', 'Has validate() and computeDerived()');
  assert(typeof T.analysisStep === 'function', 'Has analysisStep');
  assert(Array.isArray(T.outputSchema), 'Has outputSchema array');

  // Good data validates
  const good = makeGoodData();
  const { valid, errors } = T.validate(good, {}, { logger: silentLogger() });
  assert(valid === true, 'Good data validates');
  assert(errors.length === 0, 'No validation errors');

  // Empty data fails
  const bad = T.validate({}, {}, { logger: silentLogger() });
  assert(bad.valid === false, 'Empty data fails');

  // No competitors fails
  const noComp = T.validate({ competitors: [] }, {}, { logger: silentLogger() });
  assert(noComp.valid === false, 'Empty competitors array fails');

  // Duplicate competitor names fail
  const dups = makeGoodData([{ name: 'Same Co' }, { name: 'same co' }, { name: 'Other' }]);
  const dupResult = T.validate(dups, {}, { logger: silentLogger() });
  assert(dupResult.valid === false && dupResult.errors.some(e => e.includes('Duplicate')), 'Duplicate competitor names fail');

  // Invalid threat level fails
  const badThreat = makeGoodData([{ name: 'A', threat: 'X' }, { name: 'B' }, { name: 'C' }]);
  const threatResult = T.validate(badThreat, {}, { logger: silentLogger() });
  assert(threatResult.valid === false, 'Invalid threat level fails');

  // Invalid pricingModel fails
  const badPricing = makeGoodData([{ name: 'A', pricingModel: 'barter' }, { name: 'B' }, { name: 'C' }]);
  const pricingResult = T.validate(badPricing, {}, { logger: silentLogger() });
  assert(pricingResult.valid === false, 'Invalid pricingModel enum fails');

  // Missing SWOT fails
  const noSwot = makeGoodData([{ name: 'A', swot: null }, { name: 'B' }, { name: 'C' }]);
  const swotResult = T.validate(noSwot, {}, { logger: silentLogger() });
  assert(swotResult.valid === false, 'Missing SWOT fails');

  // Cross-stage prereq: Stage 3 validation
  const withS3 = T.validate(makeGoodData(), { stage03: MOCK_STAGE3_OUTPUT }, { logger: silentLogger() });
  assert(withS3.valid === true, 'Validates with Stage 3 prereqs');

  // Exported constants
  const { THREAT_LEVELS, PRICING_MODELS } = await import(toURL('lib/eva/stage-templates/stage-04.js'));
  assert(THREAT_LEVELS.length === 3 && THREAT_LEVELS.includes('H'), 'THREAT_LEVELS exported');
  assert(PRICING_MODELS.length === 6 && PRICING_MODELS.includes('subscription'), 'PRICING_MODELS exported');
}

// ─── Test 2: computeDerived — stage5Handoff ─────────────────
async function testComputeDerived() {
  console.log('\n--- Test 2: computeDerived — stage5Handoff ---');
  const T = (await import(toURL('lib/eva/stage-templates/stage-04.js'))).default;

  const data = makeGoodData([
    { name: 'Alpha', threat: 'H', pricingModel: 'subscription', swot: { strengths: ['s'], weaknesses: ['w'], opportunities: ['Market gap A'], threats: ['t'] } },
    { name: 'Beta', threat: 'M', pricingModel: 'freemium', swot: { strengths: ['s'], weaknesses: ['w'], opportunities: ['Market gap B'], threats: ['t'] } },
    { name: 'Gamma', threat: 'L', pricingModel: 'subscription', swot: { strengths: ['s'], weaknesses: ['w'], opportunities: ['Market gap A'], threats: ['t'] } },
  ]);

  const result = T.computeDerived(data, { logger: silentLogger() });

  assert(result.stage5Handoff !== null, 'stage5Handoff is computed');
  assert(typeof result.stage5Handoff.pricingLandscape === 'string', 'pricingLandscape is a string');
  assert(result.stage5Handoff.pricingLandscape.includes('Alpha'), 'pricingLandscape includes competitor names');
  assert(typeof result.stage5Handoff.competitivePositioning === 'string', 'competitivePositioning is a string');
  assert(result.stage5Handoff.competitivePositioning.includes('1 high-threat'), 'competitivePositioning counts H threats');
  assert(Array.isArray(result.stage5Handoff.marketGaps), 'marketGaps is an array');
  assert(result.stage5Handoff.marketGaps.includes('Market gap A'), 'marketGaps includes opportunities');
  // Deduplication: 'Market gap A' appears in Alpha and Gamma but should only be listed once
  assert(result.stage5Handoff.marketGaps.filter(g => g === 'Market gap A').length === 1, 'marketGaps deduplicates');

  // No high threats
  const noHigh = makeGoodData([
    { name: 'A', threat: 'M', swot: { strengths: ['s'], weaknesses: ['w'], opportunities: ['o'], threats: ['t'] } },
    { name: 'B', threat: 'L', swot: { strengths: ['s'], weaknesses: ['w'], opportunities: ['o'], threats: ['t'] } },
    { name: 'C', threat: 'L', swot: { strengths: ['s'], weaknesses: ['w'], opportunities: ['o'], threats: ['t'] } },
  ]);
  const noHighResult = T.computeDerived(noHigh, { logger: silentLogger() });
  assert(noHighResult.stage5Handoff.competitivePositioning.includes('No high-threat'), 'No high threats message');
}

// ─── Test 3: Analysis Step Structure ────────────────────────
async function testAnalysisStepStructure() {
  console.log('\n--- Test 3: Analysis Step Structure ---');
  const { MIN_COMPETITORS } = await import(toURL('lib/eva/stage-templates/analysis-steps/stage-04-competitive-landscape.js'));

  assert(MIN_COMPETITORS === 3, 'MIN_COMPETITORS is 3');

  // Verify pricingModel schema mismatch documentation:
  // Template schema expects pricingModel as enum string ('subscription', 'freemium', etc.)
  // But LLM prompt asks for complex object {type, lowTier, highTier, freeOption, notes}
  // Analysis step passes c.pricingModel || null (the raw LLM object) without normalizing to enum
  const T = (await import(toURL('lib/eva/stage-templates/stage-04.js'))).default;
  const { PRICING_MODELS } = await import(toURL('lib/eva/stage-templates/stage-04.js'));

  // Demonstrate the mismatch: an object pricingModel fails template validation
  const objPricing = makeGoodData([
    { name: 'A', pricingModel: { type: 'subscription', lowTier: '$10/mo', highTier: '$99/mo', freeOption: false } },
    { name: 'B' }, { name: 'C' },
  ]);
  const result = T.validate(objPricing, {}, { logger: silentLogger() });
  assert(result.valid === false, 'Object pricingModel fails template validation (schema expects enum string)');

  // Verify all PRICING_MODELS are valid enum values
  for (const pm of PRICING_MODELS) {
    assert(typeof pm === 'string' && pm.length > 0, `PRICING_MODELS: '${pm}' is a string`);
  }
}

// ─── Test 4: Cross-stage Contracts ──────────────────────────
async function testCrossStageContracts() {
  console.log('\n--- Test 4: Cross-stage Contracts ---');
  const { validatePreStage, validatePostStage, CONTRACT_ENFORCEMENT } = await import(toURL('lib/eva/contracts/stage-contracts.js'));

  // Pre-stage: Stage 4 needs Stage 1 and Stage 3
  const upstreamMap = new Map([[1, MOCK_STAGE1_OUTPUT], [3, MOCK_STAGE3_OUTPUT]]);
  const pre = validatePreStage(4, upstreamMap, { logger: silentLogger() });
  assert(pre.valid === true, 'Pre-stage passes with S1+S3');

  // Missing Stage 1 should fail
  const noS1 = validatePreStage(4, new Map([[3, MOCK_STAGE3_OUTPUT]]), { logger: silentLogger() });
  assert(noS1.valid === false, 'Pre-stage fails without Stage 1');

  // Post-stage: good data
  const good4 = makeGoodData();
  good4.stage5Handoff = { pricingLandscape: 'test', competitivePositioning: 'test', marketGaps: ['gap'] };
  const post = validatePostStage(4, good4, { logger: silentLogger() });
  assert(post.valid === true, 'Post-stage passes with good data');

  // Post-stage: empty
  assert(validatePostStage(4, {}, { logger: silentLogger() }).valid === false, 'Post-stage fails empty data');

  // Forward: Stage 4 output satisfies Stage 5 consume contract
  const stage4Map = new Map([[1, MOCK_STAGE1_OUTPUT], [3, MOCK_STAGE3_OUTPUT], [4, good4]]);
  const s5Pre = validatePreStage(5, stage4Map, { logger: silentLogger() });
  assert(s5Pre.valid === true, 'Stage 4 output satisfies Stage 5 consume contract');

  // Advisory mode
  const advisory = validatePreStage(4, new Map(), { logger: silentLogger(), enforcement: CONTRACT_ENFORCEMENT.ADVISORY });
  assert(advisory.blocked === false, 'Advisory mode does not block');
}

// ─── Test 5: executeStage dry-run ───────────────────────────
async function testExecuteStageDryRun() {
  console.log('\n--- Test 5: executeStage() dry-run ---');
  const { validateOutput, loadStageTemplate, fetchUpstreamArtifacts } = await import(toURL('lib/eva/stage-execution-engine.js'));

  const T = await loadStageTemplate(4);
  assert(T.id === 'stage-04', 'loadStageTemplate(4) returns stage-04');

  // validateOutput with good data
  const good = makeGoodData();
  good.stage5Handoff = { pricingLandscape: 'test', competitivePositioning: 'test', marketGaps: [] };
  const vOut = validateOutput(good, T);
  assert(vOut.valid === true, 'validateOutput passes good data');

  // validateOutput with bad data
  const badOut = validateOutput({}, T);
  assert(badOut.valid === false, 'validateOutput fails empty data');

  // fetchUpstreamArtifacts — uses lifecycle_stage, metadata fields
  const supabase = createMockSupabase({
    venture_artifacts: [
      { lifecycle_stage: 1, metadata: MOCK_STAGE1_OUTPUT },
      { lifecycle_stage: 3, metadata: MOCK_STAGE3_OUTPUT },
    ],
  });
  const upstream = await fetchUpstreamArtifacts(supabase, 'test-venture-id', [1, 3]);
  assert(upstream.stage1Data !== undefined, 'fetchUpstreamArtifacts returns stage1Data');
  assert(upstream.stage3Data !== undefined, 'fetchUpstreamArtifacts returns stage3Data');
}

// ─── Test 6: Execution Flow — computeDerived is dead code ───
async function testExecutionFlow() {
  console.log('\n--- Test 6: Execution Flow ---');
  const T = (await import(toURL('lib/eva/stage-templates/stage-04.js'))).default;

  // Stage 4 has both analysisStep and computeDerived
  assert(typeof T.analysisStep === 'function', 'Has analysisStep');
  assert(typeof T.computeDerived === 'function', 'Has computeDerived');
  // Execution engine uses if/else — only analysisStep runs
  // computeDerived.stage5Handoff logic is dead code during normal execution
  // The analysis step produces its own stage5Handoff (line 133)

  // Verify computeDerived produces stage5Handoff independently
  const data = makeGoodData();
  const derived = T.computeDerived(data, { logger: silentLogger() });
  assert(derived.stage5Handoff !== null, 'computeDerived produces stage5Handoff (but dead code during execution)');
}

// ─── Test 7: Error Cases ────────────────────────────────────
async function testErrorCases() {
  console.log('\n--- Test 7: Error Cases ---');
  const T = (await import(toURL('lib/eva/stage-templates/stage-04.js'))).default;

  // Single competitor (below MIN_COMPETITORS=3 but template requires minItems=1)
  const single = T.validate({ competitors: [makeCompetitor()] }, {}, { logger: silentLogger() });
  assert(single.valid === true, 'Single competitor passes template validation (minItems=1)');

  // Competitor with empty strengths
  const emptyStr = makeGoodData([{ name: 'A', strengths: [] }, { name: 'B' }, { name: 'C' }]);
  const emptyStrResult = T.validate(emptyStr, {}, { logger: silentLogger() });
  assert(emptyStrResult.valid === false, 'Empty strengths array fails');

  // Competitor with empty SWOT arrays
  const emptySWOT = makeGoodData([
    { name: 'A', swot: { strengths: [], weaknesses: ['w'], opportunities: ['o'], threats: ['t'] } },
    { name: 'B' }, { name: 'C' },
  ]);
  const emptySWOTResult = T.validate(emptySWOT, {}, { logger: silentLogger() });
  assert(emptySWOTResult.valid === false, 'Empty SWOT strengths fails');

  // Missing competitor name
  const noName = makeGoodData([{ name: '' }, { name: 'B' }, { name: 'C' }]);
  const noNameResult = T.validate(noName, {}, { logger: silentLogger() });
  assert(noNameResult.valid === false, 'Empty competitor name fails');

  // Very long competitor name (should still pass — no max length)
  const longName = makeGoodData([{ name: 'A'.repeat(500) }, { name: 'B' }, { name: 'C' }]);
  const longNameResult = T.validate(longName, {}, { logger: silentLogger() });
  assert(longNameResult.valid === true, 'Very long competitor name passes (no max length)');
}

// ─── Test 8: Stage 3→4 Transition Integrity ─────────────────
async function testTransitionIntegrity() {
  console.log('\n--- Test 8: Stage 3→4 Transition Integrity ---');
  const { validatePreStage } = await import(toURL('lib/eva/contracts/stage-contracts.js'));

  // Stage 3 output satisfies Stage 4 contract
  const s3Output = { ...MOCK_STAGE3_OUTPUT };
  const stage3Map = new Map([[1, MOCK_STAGE1_OUTPUT], [3, s3Output]]);
  const result = validatePreStage(4, stage3Map, { logger: silentLogger() });
  assert(result.valid === true, 'Stage 3 output satisfies Stage 4 contract');

  // Stage 3 without competitorEntities (optional field)
  const s3NoComp = { ...MOCK_STAGE3_OUTPUT, competitorEntities: undefined };
  const noCompMap = new Map([[1, MOCK_STAGE1_OUTPUT], [3, s3NoComp]]);
  const noCompResult = validatePreStage(4, noCompMap, { logger: silentLogger() });
  assert(noCompResult.valid === true, 'Stage 4 contract passes without competitorEntities (optional)');

  // Stage 1 provides required fields for Stage 4
  assert(typeof MOCK_STAGE1_OUTPUT.description === 'string', 'Stage 1 provides description');
  assert(typeof MOCK_STAGE1_OUTPUT.valueProp === 'string', 'Stage 1 provides valueProp');
  assert(typeof MOCK_STAGE1_OUTPUT.targetMarket === 'string', 'Stage 1 provides targetMarket');
}

// ─── Main ───────────────────────────────────────────────────
async function main() {
  console.log('=== Stage 4 E2E Test Suite ===\n');
  await testTemplateValidation();
  await testComputeDerived();
  await testAnalysisStepStructure();
  await testCrossStageContracts();
  await testExecuteStageDryRun();
  await testExecutionFlow();
  await testErrorCases();
  await testTransitionIntegrity();

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failures.length > 0) {
    console.log('Failures:');
    failures.forEach(f => console.log(`  - ${f}`));
  }
  process.exit(failed > 0 ? 2 : 0);
}

main().catch(e => { console.error('FATAL: Test suite crashed:', e.message); console.error(e); process.exit(2); });
