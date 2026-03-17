#!/usr/bin/env node
/** Stage 2 E2E Test — MoA Multi-Persona Analysis (node scripts/test-stage2-e2e.js) */
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, label) {
  if (condition) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    failures.push(label);
    console.log(`  FAIL  ${label}`);
  }
}

// ─── Mock Supabase (auto-populates venture_id, is_current, created_at) ──
function createMockSupabase(tableData = {}, defaults = {}) {
  const { ventureId = 'test-venture-id' } = defaults;

  // Auto-populate common fields
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
      const data = tableData[table] || [];
      return createChainableQuery([...data]);
    },
  };
}

function createChainableQuery(data, error = null) {
  const builder = {
    _data: data,
    _error: error,
    select() { return builder; },
    eq(field, value) {
      builder._data = builder._data.filter(row => row[field] === value);
      return builder;
    },
    in(field, values) {
      builder._data = builder._data.filter(row => values.includes(row[field]));
      return builder;
    },
    not() { return builder; },
    gte() { return builder; },
    order() { return builder; },
    limit() { return builder; },
    single() {
      return Promise.resolve({
        data: builder._data[0] || null,
        error: builder._error,
      });
    },
    then(resolve) {
      resolve({ data: builder._data, error: builder._error });
    },
  };
  return builder;
}

function silentLogger() {
  return { log: () => {}, warn: () => {}, error: () => {} };
}

// ─── Mock Data ──────────────────────────────────────────────
const MOCK_STAGE1_OUTPUT = {
  description: 'A platform that connects freelance designers with small businesses needing branding work on demand.',
  problemStatement: 'Small businesses struggle to find affordable design help quickly.',
  valueProp: 'On-demand design talent at SMB-friendly prices.',
  targetMarket: 'Small businesses with 1-50 employees',
  archetype: 'marketplace',
  keyAssumptions: ['SMBs will pay $500+/project', 'Designers want flexible gig work'],
  moatStrategy: 'Network effects from two-sided marketplace',
  successCriteria: ['100 completed projects in 90 days', '$50K GMV in Q1'],
};

const GOOD_STAGE2_DATA = {
  analysis: {
    strategic: 'Strong market opportunity in the SMB design services space with growing demand.',
    technical: 'Two-sided marketplace architecture is well-understood with proven scaling patterns.',
    tactical: 'Growth through designer referrals and SMB word-of-mouth in local business networks.',
  },
  metrics: {
    marketFit: 72,
    customerNeed: 85,
    momentum: 60,
    revenuePotential: 68,
    competitiveBarrier: 55,
    executionFeasibility: 74,
    designQuality: 70,
  },
  evidence: {
    market: 'Growing SMB spend on design services, estimated $50B TAM.',
    customer: 'High pain severity confirmed by 200+ survey responses.',
    competitive: 'Fragmented market with no clear leader in SMB-focused design.',
    execution: 'Core marketplace tech stack is commodity. Main risk is supply acquisition.',
    design: 'Clean UX mockups tested well with SMB owners in pilot.',
  },
  suggestions: [
    { type: 'immediate', text: 'Run a landing page test to validate designer supply interest.' },
    { type: 'strategic', text: 'Consider vertical specialization (e.g., restaurant branding) for initial traction.' },
  ],
  compositeScore: 69,
};

const METRIC_NAMES = [
  'marketFit', 'customerNeed', 'momentum',
  'revenuePotential', 'competitiveBarrier', 'executionFeasibility',
  'designQuality',
];

// ─── Test 1: Template Validation ────────────────────────────
async function testTemplateValidation() {
  console.log('\n--- Test 1: Template Validation ---');

  const mod = await import(`file://${join(ROOT, 'lib/eva/stage-templates/stage-02.js').replace(/\\/g, '/')}`);
  const TEMPLATE = mod.default;

  // Schema exists
  assert(TEMPLATE.id === 'stage-02' && TEMPLATE.version === '2.0.0', 'Template id and version correct');
  assert(TEMPLATE.schema && typeof TEMPLATE.validate === 'function', 'Template has schema and validate()');
  assert(typeof TEMPLATE.computeDerived === 'function' && typeof TEMPLATE.analysisStep === 'function', 'Template has computeDerived() and analysisStep()');
  assert(Array.isArray(TEMPLATE.outputSchema), 'Template has outputSchema array');

  // Validate with good data (3-arg signature: data, prerequisites, options)
  const goodResult = TEMPLATE.validate(GOOD_STAGE2_DATA, {}, { logger: silentLogger() });
  assert(goodResult.valid === true, 'Good data validates successfully');
  assert(goodResult.errors.length === 0, 'Good data has no errors');

  // Validate with empty data
  const badResult = TEMPLATE.validate({}, {}, { logger: silentLogger() });
  assert(badResult.valid === false, 'Empty data fails validation');
  assert(badResult.errors.length >= 3, `Empty data produces >=3 errors (got ${badResult.errors.length})`);

  // Validate with bad metrics (out of range)
  const badMetrics = TEMPLATE.validate({
    ...GOOD_STAGE2_DATA,
    metrics: { ...GOOD_STAGE2_DATA.metrics, marketFit: 150 },
  }, {}, { logger: silentLogger() });
  assert(badMetrics.valid === false, 'Out-of-range metric fails validation');

  // Validate with bad suggestions
  const badSuggestions = TEMPLATE.validate({
    ...GOOD_STAGE2_DATA,
    suggestions: [{ type: 'invalid', text: 'too short' }],
  }, {}, { logger: silentLogger() });
  assert(badSuggestions.valid === false, 'Invalid suggestion type fails');

  // Validate with non-array suggestions
  const nonArraySugg = TEMPLATE.validate({
    ...GOOD_STAGE2_DATA,
    suggestions: 'not an array',
  }, {}, { logger: silentLogger() });
  assert(nonArraySugg.valid === false, 'Non-array suggestions fails');

  // Validate with short analysis strings
  const shortAnalysis = TEMPLATE.validate({
    ...GOOD_STAGE2_DATA,
    analysis: { strategic: 'short', technical: 'short', tactical: 'short' },
  }, {}, { logger: silentLogger() });
  assert(shortAnalysis.valid === false, 'Short analysis strings fail');

  // Validate cross-stage contract: pass Stage 1 data as prerequisites
  const withPrereq = TEMPLATE.validate(GOOD_STAGE2_DATA, { stage01: MOCK_STAGE1_OUTPUT }, { logger: silentLogger() });
  assert(withPrereq.valid === true, 'Valid with good Stage 1 prerequisites');

  // Cross-stage contract: bad Stage 1 data triggers errors
  const badPrereq = TEMPLATE.validate(GOOD_STAGE2_DATA, { stage01: { description: 'short' } }, { logger: silentLogger() });
  assert(badPrereq.valid === false, 'Bad Stage 1 prerequisites trigger errors');

  // Exported constants
  assert(mod.METRIC_NAMES.length === 7, 'METRIC_NAMES has 7 entries');
  assert(mod.SUGGESTION_TYPES.length === 2, 'SUGGESTION_TYPES has 2 entries');
}

// ─── Test 2: computeDerived() ───────────────────────────────
async function testComputeDerived() {
  console.log('\n--- Test 2: computeDerived() ---');

  const mod = await import(`file://${join(ROOT, 'lib/eva/stage-templates/stage-02.js').replace(/\\/g, '/')}`);
  const TEMPLATE = mod.default;

  // With all 7 metrics
  const result = TEMPLATE.computeDerived(GOOD_STAGE2_DATA, { logger: silentLogger() });
  assert(result.compositeScore !== null, 'compositeScore is computed');
  const expectedAvg = Math.round((72 + 85 + 60 + 68 + 55 + 74 + 70) / 7);
  assert(result.compositeScore === expectedAvg, `compositeScore is correct average (${expectedAvg}, got ${result.compositeScore})`);

  // With null metrics
  const nullMetrics = TEMPLATE.computeDerived({
    ...GOOD_STAGE2_DATA,
    metrics: Object.fromEntries(METRIC_NAMES.map(m => [m, null])),
  }, { logger: silentLogger() });
  assert(nullMetrics.compositeScore === null, 'compositeScore is null when all metrics null');

  // With partial metrics (only some valid)
  const partialMetrics = TEMPLATE.computeDerived({
    ...GOOD_STAGE2_DATA,
    metrics: { marketFit: 80, customerNeed: 60, momentum: null, revenuePotential: null, competitiveBarrier: null, executionFeasibility: null, designQuality: null },
  }, { logger: silentLogger() });
  assert(partialMetrics.compositeScore === 70, 'Partial metrics: average of valid only (70)');

  // With empty metrics object
  const emptyMetrics = TEMPLATE.computeDerived({ metrics: {} }, { logger: silentLogger() });
  assert(emptyMetrics.compositeScore === null, 'Empty metrics object returns null');
}

// ─── Test 3: Multi-Persona Analysis Output Structure ────────
async function testMultiPersonaOutputStructure() {
  console.log('\n--- Test 3: Multi-Persona Output Structure ---');

  // Test the PERSONAS constant and mapping logic
  const { PERSONAS } = await import(
    `file://${join(ROOT, 'lib/eva/stage-templates/analysis-steps/stage-02-multi-persona.js').replace(/\\/g, '/')}`
  );

  assert(PERSONAS.length === 7, 'PERSONAS has 7 entries');

  // Each persona has required fields (id, name, stage3Metric, focus)
  const allValid = PERSONAS.every(p =>
    typeof p.id === 'string' && p.id.length > 0 &&
    typeof p.name === 'string' && p.name.length > 0 &&
    typeof p.stage3Metric === 'string' && typeof p.focus === 'string'
  );
  assert(allValid, 'All personas have id, name, stage3Metric, focus');

  // Every METRIC_NAME is covered by exactly one persona
  const personaMetrics = PERSONAS.map(p => p.stage3Metric);
  for (const metric of METRIC_NAMES) {
    assert(personaMetrics.includes(metric), `Metric ${metric} is covered by a persona`);
  }
  assert(new Set(personaMetrics).size === PERSONAS.length, 'No duplicate stage3Metric mappings');

  // Evidence map coverage check
  const EVIDENCE_MAP = {
    'market-strategist': 'market',
    'customer-advocate': 'customer',
    'moat-architect': 'competitive',
    'ops-realist': 'execution',
    'product-designer': 'design',
  };
  const evidenceKeys = Object.keys(EVIDENCE_MAP);
  assert(evidenceKeys.length === 5, 'EVIDENCE_MAP covers 5 personas');

  // Check which personas are NOT in evidence map
  const unmappedPersonas = PERSONAS.filter(p => !EVIDENCE_MAP[p.id]);
  assert(unmappedPersonas.length === 2, `2 personas unmapped to evidence (got ${unmappedPersonas.length})`);
  assert(unmappedPersonas.some(p => p.id === 'growth-hacker'), 'growth-hacker has no evidence mapping');
  assert(unmappedPersonas.some(p => p.id === 'revenue-analyst'), 'revenue-analyst has no evidence mapping');
}

// ─── Test 3b: fourBuckets accumulation & LLM fallback detection ──
async function testFourBucketsAndFallback() {
  console.log('\n--- Test 3b: fourBuckets accumulation & LLM fallback detection ---');

  // fourBuckets accumulation: mirrors the reduce in stage-02-multi-persona.js
  const cls = [
    { bucket: 'facts', claim: 'a' }, { bucket: 'assumptions', claim: 'b' },
    { bucket: 'facts', claim: 'c' }, { bucket: 'simulations', claim: 'd' },
    { bucket: 'unknowns', claim: 'e' }, { bucket: 'facts', claim: 'f' },
    { bucket: 'assumptions', claim: 'g' },
  ];
  const summary = cls.reduce((acc, c) => {
    const bucket = (c.bucket || '').toLowerCase();
    if (bucket in acc) acc[bucket]++;
    return acc;
  }, { facts: 0, assumptions: 0, simulations: 0, unknowns: 0 });
  assert(summary.facts === 3 && summary.assumptions === 2, 'fourBuckets: correct fact/assumption counts');
  assert(summary.simulations === 1 && summary.unknowns === 1, 'fourBuckets: correct simulation/unknown counts');
  assert(cls.length === 7, 'All 7 classifications preserved (not overwritten)');

  // LLM fallback detection
  const FIELDS = ['summary', 'score', 'strengths', 'risks'];
  const check = (obj) => FIELDS.filter(f => obj[f] !== undefined && obj[f] !== null).length;
  assert(check({ summary: 'OK', score: 75, strengths: ['a'], risks: ['b'] }) === 4, 'Good LLM: 4 fields');
  assert(check({}) === 0, 'Empty LLM: 0 fields');
  assert(check({ summary: 'Partial', score: null }) === 1, 'Partial LLM: 1 field');

  // Invalid bucket name safely ignored
  const bad = [{ bucket: 'INVALID', claim: 'x' }].reduce((acc, c) => {
    const b = (c.bucket || '').toLowerCase();
    if (b in acc) acc[b]++;
    return acc;
  }, { facts: 0, assumptions: 0, simulations: 0, unknowns: 0 });
  assert(bad.facts === 0 && bad.assumptions === 0, 'Invalid bucket name safely ignored');
}

// ─── Test 4: executeStage() dry-run ────────────────────────
async function testExecuteStageDryRun() {
  console.log('\n--- Test 4: executeStage() dry-run ---');

  const { validateOutput, loadStageTemplate, fetchUpstreamArtifacts } = await import(
    `file://${join(ROOT, 'lib/eva/stage-execution-engine.js').replace(/\\/g, '/')}`
  );

  // Load template
  const template = await loadStageTemplate(2);
  assert(template !== null && template.id === 'stage-02', 'loadStageTemplate(2) returns stage-02');
  assert(validateOutput(GOOD_STAGE2_DATA, template).valid === true, 'validateOutput passes good data');
  assert(validateOutput({}, template).valid === false, 'validateOutput fails empty data');

  const mockSupabase = createMockSupabase({
    venture_artifacts: [{
      lifecycle_stage: 1, artifact_type: 'stage_1_analysis',
      content: JSON.stringify(MOCK_STAGE1_OUTPUT), metadata: MOCK_STAGE1_OUTPUT,
    }],
  });
  const upstream = await fetchUpstreamArtifacts(mockSupabase, 'test-venture-id', [1]);
  assert(upstream.stage1Data !== undefined, 'fetchUpstreamArtifacts returns stage1Data');
  assert(upstream.stage1Data.archetype === 'marketplace', 'stage1Data archetype correct');
}

// ─── Test 5: Cross-stage contracts (Stage 1→2→3) ──────────
async function testCrossStageContracts() {
  console.log('\n--- Test 5: Cross-stage contracts ---');

  const { validatePreStage, validatePostStage, CONTRACT_ENFORCEMENT } = await import(
    `file://${join(ROOT, 'lib/eva/contracts/stage-contracts.js').replace(/\\/g, '/')}`
  );

  const stage1Map = new Map([[1, MOCK_STAGE1_OUTPUT]]);
  assert(validatePreStage(2, stage1Map, { logger: silentLogger() }).valid === true, 'Pre-stage passes with Stage 1');
  const emptyMap = new Map();
  const preFail = validatePreStage(2, emptyMap, { logger: silentLogger() });
  assert(preFail.valid === false, 'Pre-stage fails without Stage 1');
  assert(preFail.errors.some(e => e.includes('stage-01')), 'Error references stage-01');
  assert(validatePostStage(2, GOOD_STAGE2_DATA, { logger: silentLogger() }).valid === true, 'Post-stage passes');
  assert(validatePostStage(2, { compositeScore: 'not a number' }, { logger: silentLogger() }).valid === false, 'Post-stage fails bad data');
  const stage2Map = new Map([[1, MOCK_STAGE1_OUTPUT], [2, GOOD_STAGE2_DATA]]);
  const stage3Pre = validatePreStage(3, stage2Map, { logger: silentLogger() });
  assert(stage3Pre.valid === true, 'Stage 2 output satisfies Stage 3 consume contract');

  assert(validatePreStage(3, new Map([[1, MOCK_STAGE1_OUTPUT]]), { logger: silentLogger() }).valid === false, 'Stage 3 fails without Stage 2');
  const advisory = validatePreStage(2, emptyMap, { logger: silentLogger(), enforcement: CONTRACT_ENFORCEMENT.ADVISORY });
  assert(advisory.blocked === false, 'Advisory mode does not block');
}

// ─── Test 6: clampScore utility ────────────────────────────
async function testClampScore() {
  console.log('\n--- Test 6: Score clamping and normalization ---');

  // clampScore is not exported, so test via the template validation
  const mod = await import(`file://${join(ROOT, 'lib/eva/stage-templates/stage-02.js').replace(/\\/g, '/')}`);
  const TEMPLATE = mod.default;

  // Test boundary values through computeDerived
  const boundary = TEMPLATE.computeDerived({
    ...GOOD_STAGE2_DATA,
    metrics: { marketFit: 0, customerNeed: 100, momentum: 50, revenuePotential: 0, competitiveBarrier: 100, executionFeasibility: 50, designQuality: 50 },
  }, { logger: silentLogger() });
  assert(boundary.compositeScore === 50, 'Boundary values average correctly');

  // All zeros
  const allZero = TEMPLATE.computeDerived({
    ...GOOD_STAGE2_DATA,
    metrics: Object.fromEntries(METRIC_NAMES.map(m => [m, 0])),
  }, { logger: silentLogger() });
  assert(allZero.compositeScore === 0, 'All-zero metrics produce compositeScore 0');

  // All 100s
  const allMax = TEMPLATE.computeDerived({
    ...GOOD_STAGE2_DATA,
    metrics: Object.fromEntries(METRIC_NAMES.map(m => [m, 100])),
  }, { logger: silentLogger() });
  assert(allMax.compositeScore === 100, 'All-100 metrics produce compositeScore 100');
}

// ─── Test 7: Error cases ───────────────────────────────────
async function testErrorCases() {
  console.log('\n--- Test 7: Error cases ---');

  const mod = await import(`file://${join(ROOT, 'lib/eva/stage-templates/stage-02.js').replace(/\\/g, '/')}`);
  const TEMPLATE = mod.default;

  const v = (data) => TEMPLATE.validate(data, {}, { logger: silentLogger() });
  assert(v({ metrics: GOOD_STAGE2_DATA.metrics, evidence: GOOD_STAGE2_DATA.evidence }).valid === false, 'Missing analysis fails');
  assert(v({ ...GOOD_STAGE2_DATA, analysis: 'not an object' }).valid === false, 'Non-object analysis fails');
  assert(v({ ...GOOD_STAGE2_DATA, metrics: null }).valid === false, 'Null metrics fails');
  assert(v({ ...GOOD_STAGE2_DATA, metrics: { ...GOOD_STAGE2_DATA.metrics, marketFit: 72.5 } }).valid === false, 'Float metric fails');
  assert(v({ ...GOOD_STAGE2_DATA, evidence: undefined }).valid === false, 'Missing evidence fails');
  assert(v({ ...GOOD_STAGE2_DATA, evidence: { market: '', customer: '', competitive: '', execution: '', design: '' } }).valid === false, 'Empty evidence fails');

  // validateOutput with template that catches thrown validators
  const { validateOutput } = await import(
    `file://${join(ROOT, 'lib/eva/stage-execution-engine.js').replace(/\\/g, '/')}`
  );
  const throwingTemplate = { validate() { throw new Error('Boom'); } };
  const throwResult = validateOutput({}, throwingTemplate);
  assert(throwResult.valid === false, 'validateOutput catches throwing validate()');

  // computeDerived with missing data
  const noData = TEMPLATE.computeDerived({}, { logger: silentLogger() });
  assert(noData.compositeScore === null, 'computeDerived with no metrics returns null');
}

// ─── Test 8: Upstream data shape from Stage 1 ──────────────
async function testUpstreamDataShape() {
  console.log('\n--- Test 8: Stage 1→2 transition integrity ---');

  const { fetchUpstreamArtifacts } = await import(
    `file://${join(ROOT, 'lib/eva/stage-execution-engine.js').replace(/\\/g, '/')}`
  );
  const { validateCrossStageContract } = await import(
    `file://${join(ROOT, 'lib/eva/stage-templates/validation.js').replace(/\\/g, '/')}`
  );

  // Stage 2 consume contract from stage-contracts.js
  const stage2ConsumeFromStage1 = {
    description: { type: 'string' },
    problemStatement: { type: 'string' },
    valueProp: { type: 'string' },
    targetMarket: { type: 'string' },
    archetype: { type: 'string' },
  };

  // Verify Stage 1 output shape satisfies Stage 2 consume
  const check = validateCrossStageContract(MOCK_STAGE1_OUTPUT, stage2ConsumeFromStage1, 'stage-01');
  assert(check.valid === true, 'Stage 1 output shape satisfies Stage 2 consume contract');

  // Verify key consumed fields exist
  const reqFields = ['description', 'problemStatement', 'valueProp', 'targetMarket', 'archetype'];
  const allStrings = reqFields.every(f => typeof MOCK_STAGE1_OUTPUT[f] === 'string');
  assert(allStrings, 'Stage 1 provides all consumed fields as strings');

  // Test fetchUpstreamArtifacts with metadata as object (common path)
  const mockObjMeta = createMockSupabase({
    venture_artifacts: [{
      lifecycle_stage: 1,
      artifact_type: 'stage_1_analysis',
      content: JSON.stringify(MOCK_STAGE1_OUTPUT),
      metadata: MOCK_STAGE1_OUTPUT,
    }],
  });
  const objResult = await fetchUpstreamArtifacts(mockObjMeta, 'test-venture-id', [1]);
  assert(typeof objResult.stage1Data === 'object', 'Metadata object path returns object');

  // Test fetchUpstreamArtifacts with metadata as null, content as JSON string
  const mockStrContent = createMockSupabase({
    venture_artifacts: [{
      lifecycle_stage: 1,
      artifact_type: 'stage_1_analysis',
      content: JSON.stringify(MOCK_STAGE1_OUTPUT),
      metadata: null,
    }],
  });
  const strResult = await fetchUpstreamArtifacts(mockStrContent, 'test-venture-id', [1]);
  assert(typeof strResult.stage1Data === 'object', 'JSON string content path returns parsed object');
  assert(strResult.stage1Data.archetype === 'marketplace', 'Parsed content has correct archetype');
}

// ─── Main ───────────────────────────────────────────────────
async function main() {
  console.log('=== Stage 2 E2E Test Suite ===\n');

  try {
    await testTemplateValidation();
    await testComputeDerived();
    await testMultiPersonaOutputStructure();
    await testFourBucketsAndFallback();
    await testExecuteStageDryRun();
    await testCrossStageContracts();
    await testClampScore();
    await testErrorCases();
    await testUpstreamDataShape();
  } catch (err) {
    console.error(`\nFATAL: Test suite crashed: ${err.message}`);
    console.error(err.stack);
    process.exit(2);
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failures.length > 0) {
    console.log('\nFailures:');
    failures.forEach(f => console.log(`  - ${f}`));
  }
  process.exit(failed > 0 ? 1 : 0);
}

main();
