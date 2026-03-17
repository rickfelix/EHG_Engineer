#!/usr/bin/env node
/** Stage 3 E2E Test — Kill Gate / Hybrid Scoring (node scripts/test-stage3-e2e.js) */
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

// ─── Mock Supabase (auto-populates venture_id, is_current, created_at) ──
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
      const data = tableData[table] || [];
      return createChainableQuery([...data]);
    },
  };
}
function createChainableQuery(data) {
  const b = {
    _data: data, select() { return b; },
    eq(f, v) { b._data = b._data.filter(r => r[f] === v); return b; },
    in(f, v) { b._data = b._data.filter(r => v.includes(r[f])); return b; },
    not() { return b; }, gte() { return b; }, order() { return b; }, limit() { return b; },
    single() { return Promise.resolve({ data: b._data[0] || null, error: null }); },
    then(resolve) { resolve({ data: b._data, error: null }); },
  };
  return b;
}
function silentLogger() { return { log: () => {}, warn: () => {}, error: () => {} }; }

// ─── Mock Data ──────────────────────────────────────────────
const MOCK_STAGE1_OUTPUT = {
  description: 'A platform that connects freelance designers with small businesses needing branding work on demand.',
  problemStatement: 'Small businesses struggle to find affordable design help quickly.',
  valueProp: 'On-demand design talent at SMB-friendly prices.',
  targetMarket: 'Small businesses with 1-50 employees',
  archetype: 'marketplace',
  keyAssumptions: ['SMBs will pay $500+/project'],
};
const MOCK_STAGE2_OUTPUT = {
  analysis: { strategic: 'Strong market opportunity.', technical: 'Proven patterns.', tactical: 'Growth via referrals.' },
  metrics: { marketFit: 72, customerNeed: 85, momentum: 60, revenuePotential: 68, competitiveBarrier: 55, executionFeasibility: 74, designQuality: 70 },
  evidence: { market: 'Large TAM.', customer: 'Survey confirms.', competitive: 'Fragmented.', execution: 'Commodity.', design: 'Tested well.' },
  compositeScore: 69,
  critiques: [
    { model: 'market-strategist', summary: 'Good fit', strengths: ['TAM'], risks: ['Timing'], score: 72 },
    { model: 'customer-advocate', summary: 'Strong need', strengths: ['Pain'], risks: ['Price'], score: 85 },
    { model: 'growth-hacker', summary: 'Moderate', strengths: ['Viral'], risks: ['CAC'], score: 60 },
    { model: 'revenue-analyst', summary: 'Solid', strengths: ['Model'], risks: ['Ceiling'], score: 68 },
    { model: 'moat-architect', summary: 'Weak moat', strengths: ['Network'], risks: ['Low switch cost'], score: 55 },
    { model: 'ops-realist', summary: 'Feasible', strengths: ['Stack'], risks: ['Supply'], score: 74 },
    { model: 'product-designer', summary: 'Clean UX', strengths: ['Simple'], risks: ['Mobile'], score: 70 },
  ],
};
const METRICS = ['marketFit', 'customerNeed', 'momentum', 'revenuePotential', 'competitiveBarrier', 'executionFeasibility', 'designQuality'];

// Helper: build Stage 3 data with given scores
function makeStage3Data(scoreMap, extras = {}) {
  return { ...Object.fromEntries(METRICS.map(m => [m, scoreMap[m] ?? 70])), ...extras };
}

// ─── Test 1: Template Validation ────────────────────────────
async function testTemplateValidation() {
  console.log('\n--- Test 1: Template Validation ---');
  const mod = await import(toURL('lib/eva/stage-templates/stage-03.js'));
  const T = mod.default;

  assert(T.id === 'stage-03' && T.version === '2.0.0', 'Template id and version correct');
  assert(T.schema && typeof T.validate === 'function', 'Template has schema and validate()');
  assert(typeof T.computeDerived === 'function' && typeof T.analysisStep === 'function', 'Has computeDerived() and analysisStep()');
  assert(Array.isArray(T.outputSchema), 'Has outputSchema array');

  // Good data
  const good = makeStage3Data({ marketFit: 75, customerNeed: 80, momentum: 65, revenuePotential: 70, competitiveBarrier: 60, executionFeasibility: 72, designQuality: 68 });
  assert(T.validate(good, {}, { logger: silentLogger() }).valid === true, 'Good data validates');

  // Empty data fails
  const empty = T.validate({}, {}, { logger: silentLogger() });
  assert(empty.valid === false && empty.errors.length >= 7, 'Empty data fails with >=7 errors');

  // Out of range metric
  assert(T.validate({ ...good, marketFit: 150 }, {}, { logger: silentLogger() }).valid === false, 'Out-of-range metric fails');

  // Cross-stage prerequisites: Stage 2
  assert(T.validate(good, { stage02: MOCK_STAGE2_OUTPUT }, { logger: silentLogger() }).valid === true, 'Valid with Stage 2 prereqs');
  assert(T.validate(good, { stage02: {} }, { logger: silentLogger() }).valid === false, 'Bad Stage 2 prereqs fail');

  // Cross-stage prerequisites: Stage 1
  assert(T.validate(good, { stage01: MOCK_STAGE1_OUTPUT }, { logger: silentLogger() }).valid === true, 'Valid with Stage 1 prereqs');
  assert(T.validate(good, { stage01: { archetype: 'x', problemStatement: 'too short' } }, { logger: silentLogger() }).valid === false, 'Short problemStatement fails');

  // Competitor entities validation
  const withCompetitors = { ...good, competitorEntities: [
    { name: 'Fiverr', positioning: 'Global marketplace', threat_level: 'H' },
    { name: 'Upwork', positioning: 'Freelance platform', threat_level: 'M' },
  ]};
  assert(T.validate(withCompetitors, {}, { logger: silentLogger() }).valid === true, 'Valid competitor entities pass');
  const badCompetitor = { ...good, competitorEntities: [{ name: '', positioning: '', threat_level: 'X' }] };
  assert(T.validate(badCompetitor, {}, { logger: silentLogger() }).valid === false, 'Bad competitor entity fails');

  // Exported constants
  assert(mod.METRICS.length === 7, 'METRICS has 7 entries');
  assert(mod.PASS_THRESHOLD === 70 && mod.REVISE_THRESHOLD === 50 && mod.METRIC_THRESHOLD === 50, 'Thresholds correct');
  assert(mod.THREAT_LEVELS.length === 3, 'THREAT_LEVELS has 3 entries');
}

// ─── Test 2: evaluateKillGate Decision Paths ────────────────
async function testKillGateDecisions() {
  console.log('\n--- Test 2: evaluateKillGate Decision Paths ---');
  const { evaluateKillGate, PASS_THRESHOLD, REVISE_THRESHOLD, METRIC_THRESHOLD } = await import(toURL('lib/eva/stage-templates/stage-03.js'));

  // PASS: overall ≥ 70, all metrics ≥ 50
  const passCase = evaluateKillGate({ overallScore: 75, metrics: Object.fromEntries(METRICS.map(m => [m, 75])) });
  assert(passCase.decision === 'pass', 'PASS: overall 75, all metrics 75');
  assert(passCase.blockProgression === false, 'PASS: does not block');
  assert(passCase.reasons.length === 0, 'PASS: no reasons');

  // PASS at boundary: overall exactly 70, all metrics exactly 50
  const passBoundary = evaluateKillGate({ overallScore: 70, metrics: Object.fromEntries(METRICS.map(m => [m, 50])) });
  assert(passBoundary.decision === 'pass', 'PASS boundary: overall=70, metrics=50');

  // REVISE: overall 50-69, no metric below 50
  const reviseCase = evaluateKillGate({ overallScore: 60, metrics: Object.fromEntries(METRICS.map(m => [m, 60])) });
  assert(reviseCase.decision === 'revise', 'REVISE: overall 60, all metrics 60');
  assert(reviseCase.blockProgression === true, 'REVISE: blocks progression');
  assert(reviseCase.reasons.some(r => r.type === 'overall_in_revise_band'), 'REVISE: has revise_band reason');

  // REVISE at boundary: overall exactly 50
  const reviseLow = evaluateKillGate({ overallScore: 50, metrics: Object.fromEntries(METRICS.map(m => [m, 55])) });
  assert(reviseLow.decision === 'revise', 'REVISE boundary: overall=50');

  // KILL: overall < 50
  const killLow = evaluateKillGate({ overallScore: 45, metrics: Object.fromEntries(METRICS.map(m => [m, 55])) });
  assert(killLow.decision === 'kill', 'KILL: overall 45 (below 50)');
  assert(killLow.blockProgression === true, 'KILL: blocks progression');
  assert(killLow.reasons.some(r => r.type === 'overall_below_kill_threshold'), 'KILL: has overall reason');

  // KILL: one metric below 50 (even if overall is high)
  const killMetric = evaluateKillGate({ overallScore: 72, metrics: { ...Object.fromEntries(METRICS.map(m => [m, 80])), competitiveBarrier: 30 } });
  assert(killMetric.decision === 'kill', 'KILL: one metric 30 despite overall 72');
  assert(killMetric.reasons.some(r => r.type === 'metric_below_threshold' && r.metric === 'competitiveBarrier'), 'KILL: identifies failing metric');

  // KILL: overall 0 (extreme case)
  const killZero = evaluateKillGate({ overallScore: 0, metrics: Object.fromEntries(METRICS.map(m => [m, 0])) });
  assert(killZero.decision === 'kill', 'KILL: all zeros');
  assert(killZero.reasons.length >= 7, 'KILL: at least 7 reasons (one per metric + overall)');

  // KILL: all 100 except one at 49
  const killOneWeak = evaluateKillGate({ overallScore: 93, metrics: { ...Object.fromEntries(METRICS.map(m => [m, 100])), designQuality: 49 } });
  assert(killOneWeak.decision === 'kill', 'KILL: even at overall 93, one metric at 49 kills');

  // Edge: exactly at metric threshold (50) should NOT kill
  const metricBoundary = evaluateKillGate({ overallScore: 70, metrics: { ...Object.fromEntries(METRICS.map(m => [m, 70])), momentum: 50 } });
  assert(metricBoundary.decision === 'pass', 'Metric at exactly 50 does NOT kill');
}

// ─── Test 3: computeDerived ────────────────────────────────
async function testComputeDerived() {
  console.log('\n--- Test 3: computeDerived ---');
  const { default: T } = await import(toURL('lib/eva/stage-templates/stage-03.js'));

  const data = makeStage3Data({ marketFit: 80, customerNeed: 70, momentum: 60, revenuePotential: 75, competitiveBarrier: 65, executionFeasibility: 85, designQuality: 72 });
  const result = T.computeDerived(data, { logger: silentLogger() });

  // overallScore
  const expected = Math.round((80 + 70 + 60 + 75 + 65 + 85 + 72) / 7);
  assert(result.overallScore === expected, `overallScore correct (${expected}, got ${result.overallScore})`);

  // rollupDimensions
  assert(result.rollupDimensions.market === Math.round((80 + 60) / 2), 'rollup market = avg(marketFit, momentum)');
  assert(result.rollupDimensions.technical === Math.round((85 + 65) / 2), 'rollup technical = avg(execFeasibility, compBarrier)');
  assert(result.rollupDimensions.financial === Math.round((75 + 70) / 2), 'rollup financial = avg(revPotential, custNeed)');
  assert(result.rollupDimensions.experience === 72, 'rollup experience = designQuality');

  // Decision: this should be PASS (overall 72, no metric < 50)
  assert(result.decision === 'pass', 'computeDerived: PASS decision');
  assert(result.blockProgression === false, 'computeDerived: not blocking');

  // Decision: REVISE case
  const reviseData = makeStage3Data({ marketFit: 55, customerNeed: 55, momentum: 55, revenuePotential: 55, competitiveBarrier: 55, executionFeasibility: 55, designQuality: 55 });
  const revise = T.computeDerived(reviseData, { logger: silentLogger() });
  assert(revise.decision === 'revise', 'computeDerived: REVISE at overall 55');

  // Decision: KILL case
  const killData = makeStage3Data({ marketFit: 80, customerNeed: 80, momentum: 80, revenuePotential: 80, competitiveBarrier: 30, executionFeasibility: 80, designQuality: 80 });
  const kill = T.computeDerived(killData, { logger: silentLogger() });
  assert(kill.decision === 'kill', 'computeDerived: KILL when one metric < 50');
}

// ─── Test 4: Hybrid Scoring Structure ───────────────────────
async function testHybridScoringStructure() {
  console.log('\n--- Test 4: Hybrid Scoring Structure ---');
  const { PERSONA_TO_METRIC } = await import(toURL('lib/eva/stage-templates/analysis-steps/stage-03-hybrid-scoring.js'));

  // PERSONA_TO_METRIC covers all 7 metrics
  const mappedMetrics = Object.values(PERSONA_TO_METRIC);
  assert(mappedMetrics.length === 7, 'PERSONA_TO_METRIC has 7 entries');
  for (const m of METRICS) {
    assert(mappedMetrics.includes(m), `PERSONA_TO_METRIC covers ${m}`);
  }

  // Analysis step now uses canonical evaluateKillGate (3-way gate: pass/revise/kill)
  // No more KILL_THRESHOLD=40 mismatch — thresholds are METRIC_THRESHOLD=50, PASS_THRESHOLD=70
  const { METRIC_THRESHOLD: MT, PASS_THRESHOLD: PT } = await import(toURL('lib/eva/stage-templates/stage-03.js'));
  assert(MT === 50, 'Canonical per-metric threshold is 50');
  assert(PT === 70, 'Canonical pass threshold is 70');
}

// ─── Test 5: Cross-stage contracts ──────────────────────────
async function testCrossStageContracts() {
  console.log('\n--- Test 5: Cross-stage contracts ---');
  const { validatePreStage, validatePostStage, CONTRACT_ENFORCEMENT } = await import(toURL('lib/eva/contracts/stage-contracts.js'));

  // Stage 3 pre-stage: needs Stage 1 and Stage 2
  const upstreamMap = new Map([[1, MOCK_STAGE1_OUTPUT], [2, MOCK_STAGE2_OUTPUT]]);
  assert(validatePreStage(3, upstreamMap, { logger: silentLogger() }).valid === true, 'Pre-stage passes with S1+S2');

  // Missing Stage 2 should fail
  const noS2 = validatePreStage(3, new Map([[1, MOCK_STAGE1_OUTPUT]]), { logger: silentLogger() });
  assert(noS2.valid === false, 'Pre-stage fails without Stage 2');

  // Stage 3 post-stage
  const good3 = makeStage3Data({ marketFit: 75, customerNeed: 80, momentum: 65, revenuePotential: 70, competitiveBarrier: 60, executionFeasibility: 72, designQuality: 68 });
  good3.overallScore = 70; good3.decision = 'pass';
  assert(validatePostStage(3, good3, { logger: silentLogger() }).valid === true, 'Post-stage passes with good data');
  assert(validatePostStage(3, {}, { logger: silentLogger() }).valid === false, 'Post-stage fails empty data');

  // Forward: Stage 3 output satisfies Stage 4 consume contract
  const stage3Map = new Map([[1, MOCK_STAGE1_OUTPUT], [2, MOCK_STAGE2_OUTPUT], [3, good3]]);
  const s4Pre = validatePreStage(4, stage3Map, { logger: silentLogger() });
  assert(s4Pre.valid === true, 'Stage 3 output satisfies Stage 4 consume contract');

  // Advisory mode
  const advisory = validatePreStage(3, new Map(), { logger: silentLogger(), enforcement: CONTRACT_ENFORCEMENT.ADVISORY });
  assert(advisory.blocked === false, 'Advisory mode does not block');
}

// ─── Test 6: executeStage dry-run ───────────────────────────
async function testExecuteStageDryRun() {
  console.log('\n--- Test 6: executeStage() dry-run ---');
  const { validateOutput, loadStageTemplate, fetchUpstreamArtifacts } = await import(toURL('lib/eva/stage-execution-engine.js'));

  const template = await loadStageTemplate(3);
  assert(template !== null && template.id === 'stage-03', 'loadStageTemplate(3) returns stage-03');

  const good = makeStage3Data({ marketFit: 75, customerNeed: 80, momentum: 65, revenuePotential: 70, competitiveBarrier: 60, executionFeasibility: 72, designQuality: 68 });
  assert(validateOutput(good, template).valid === true, 'validateOutput passes good data');
  assert(validateOutput({}, template).valid === false, 'validateOutput fails empty data');

  // fetchUpstreamArtifacts for Stage 3 (needs Stage 1 + Stage 2)
  const mockSupabase = createMockSupabase({
    venture_artifacts: [
      { lifecycle_stage: 1, artifact_type: 'stage_1_analysis', content: JSON.stringify(MOCK_STAGE1_OUTPUT), metadata: MOCK_STAGE1_OUTPUT },
      { lifecycle_stage: 2, artifact_type: 'stage_2_analysis', content: JSON.stringify(MOCK_STAGE2_OUTPUT), metadata: MOCK_STAGE2_OUTPUT },
    ],
  });
  const upstream = await fetchUpstreamArtifacts(mockSupabase, 'test-venture-id', [1, 2]);
  assert(upstream.stage1Data !== undefined, 'fetchUpstreamArtifacts returns stage1Data');
  assert(upstream.stage2Data !== undefined, 'fetchUpstreamArtifacts returns stage2Data');
  assert(upstream.stage2Data.critiques?.length === 7, 'stage2Data has 7 critiques');
}

// ─── Test 7: Error cases ────────────────────────────────────
async function testErrorCases() {
  console.log('\n--- Test 7: Error cases ---');
  const { default: T } = await import(toURL('lib/eva/stage-templates/stage-03.js'));
  const v = (data) => T.validate(data, {}, { logger: silentLogger() });

  assert(v(makeStage3Data({ marketFit: 72.5 })).valid === false, 'Float metric fails (must be integer)');
  assert(v(makeStage3Data({ marketFit: -1 })).valid === false, 'Negative metric fails');
  assert(v(makeStage3Data({ marketFit: 101 })).valid === false, 'Metric > 100 fails');

  // computeDerived with all zeros
  const zeros = T.computeDerived(makeStage3Data(Object.fromEntries(METRICS.map(m => [m, 0]))), { logger: silentLogger() });
  assert(zeros.overallScore === 0, 'All-zero overallScore is 0');
  assert(zeros.decision === 'kill', 'All-zero is KILL');

  // computeDerived with all 100s
  const maxes = T.computeDerived(makeStage3Data(Object.fromEntries(METRICS.map(m => [m, 100]))), { logger: silentLogger() });
  assert(maxes.overallScore === 100, 'All-100 overallScore is 100');
  assert(maxes.decision === 'pass', 'All-100 is PASS');

  // validateOutput catches throwing validate
  const { validateOutput } = await import(toURL('lib/eva/stage-execution-engine.js'));
  assert(validateOutput({}, { validate() { throw new Error('Boom'); } }).valid === false, 'validateOutput catches throw');
}

// ─── Test 8: Stage 2→3 Transition Integrity ────────────────
async function testTransitionIntegrity() {
  console.log('\n--- Test 8: Stage 2→3 transition integrity ---');
  const { validateCrossStageContract } = await import(toURL('lib/eva/stage-templates/validation.js'));

  // Stage 3 expects from Stage 2: metrics (object), evidence (object)
  const s02Contract = { metrics: { type: 'object' }, evidence: { type: 'object' } };
  assert(validateCrossStageContract(MOCK_STAGE2_OUTPUT, s02Contract, 'stage-02').valid === true, 'Stage 2 output satisfies Stage 3 contract');

  // Stage 3 expects from Stage 1: archetype (string), problemStatement (string, min 20)
  const s01Contract = { archetype: { type: 'string' }, problemStatement: { type: 'string', minLength: 20 } };
  assert(validateCrossStageContract(MOCK_STAGE1_OUTPUT, s01Contract, 'stage-01').valid === true, 'Stage 1 output satisfies Stage 3 contract');

  // Critiques array is essential for hybrid scoring
  assert(Array.isArray(MOCK_STAGE2_OUTPUT.critiques), 'Stage 2 provides critiques array');
  assert(MOCK_STAGE2_OUTPUT.critiques.length === 7, 'Stage 2 provides 7 critiques (one per persona)');
  const allHaveScore = MOCK_STAGE2_OUTPUT.critiques.every(c => typeof c.score === 'number' && typeof c.model === 'string');
  assert(allHaveScore, 'All critiques have score (number) and model (string)');
}

// ─── Main ───────────────────────────────────────────────────
async function main() {
  console.log('=== Stage 3 E2E Test Suite ===\n');
  try {
    await testTemplateValidation();
    await testKillGateDecisions();
    await testComputeDerived();
    await testHybridScoringStructure();
    await testCrossStageContracts();
    await testExecuteStageDryRun();
    await testErrorCases();
    await testTransitionIntegrity();
  } catch (err) {
    console.error(`\nFATAL: Test suite crashed: ${err.message}`);
    console.error(err.stack);
    process.exit(2);
  }
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failures.length > 0) { console.log('\nFailures:'); failures.forEach(f => console.log(`  - ${f}`)); }
  process.exit(failed > 0 ? 1 : 0);
}
main();
