#!/usr/bin/env node
/** Stage 9 E2E Test — Exit Strategy (node scripts/test-stage9-e2e.js)
 * Tests: template validation, computeDerived + reality gate, cross-stage contracts,
 *        analysis step structure audit, fetchUpstreamArtifacts, error cases.
 */
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const toURL = (p) => `file://${join(ROOT, p).replace(/\\/g, '/')}`;

let passed = 0, failed = 0;
const failures = [];
function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS  ${label}`); }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}`); }
}

const silentLogger = { log() {}, warn() {}, error() {}, info() {} };

function createMockSupabase(tableData = {}) {
  return {
    from(table) {
      let eqFilters = [];
      const chain = {
        select: () => chain, eq: (c, v) => { eqFilters.push({ c, v }); return chain; },
        in: () => chain, order: () => chain, limit: () => chain,
        maybeSingle: () => chain, single: () => chain,
        then(resolve) {
          const rows = tableData[table] || [];
          const stageFilter = eqFilters.find(f => f.c === 'lifecycle_stage');
          if (stageFilter) {
            const match = rows.find(r => r.lifecycle_stage === stageFilter.v);
            resolve({ data: match || null, error: null });
          } else { resolve({ data: rows, error: null }); }
        },
      };
      return chain;
    },
  };
}

function makeValidItem(text = 'Item', priority = 1) {
  return { text, priority, evidence: 'Source: Stage 1' };
}

function makeValidBMCData() {
  const BMC_BLOCKS = [
    'customerSegments', 'valuePropositions', 'channels', 'customerRelationships',
    'revenueStreams', 'keyResources', 'keyActivities', 'keyPartnerships', 'costStructure',
  ];
  const data = {};
  for (const block of BMC_BLOCKS) {
    const min = block === 'keyPartnerships' ? 1 : 2;
    data[block] = { items: Array.from({ length: min }, (_, i) => makeValidItem(`${block} ${i + 1}`)) };
  }
  return data;
}

(async () => {
  console.log('\n=== Stage 9: Exit Strategy — E2E Tests ===\n');

  // ── Load template ──
  const { default: TEMPLATE, evaluateRealityGate, MIN_RISKS, MIN_ACQUIRERS } = await import(toURL('lib/eva/stage-templates/stage-09.js'));

  console.log('— Template structure —');
  assert(TEMPLATE.id === 'stage-09', 'Template id is stage-09');
  assert(TEMPLATE.slug === 'exit-strategy', 'Template slug is exit-strategy');
  assert(TEMPLATE.version === '2.0.0', 'Template version is 2.0.0');
  assert(typeof TEMPLATE.validate === 'function', 'Template has validate()');
  assert(typeof TEMPLATE.computeDerived === 'function', 'Template has computeDerived()');
  assert(typeof TEMPLATE.analysisStep === 'function', 'Template has analysisStep()');
  assert(MIN_RISKS === 10, 'MIN_RISKS is 10');
  assert(MIN_ACQUIRERS === 3, 'MIN_ACQUIRERS is 3');

  // Schema fields
  assert(TEMPLATE.schema.exit_thesis !== undefined, 'Schema has exit_thesis');
  assert(TEMPLATE.schema.exit_horizon_months !== undefined, 'Schema has exit_horizon_months');
  assert(TEMPLATE.schema.exit_paths !== undefined, 'Schema has exit_paths');
  assert(TEMPLATE.schema.target_acquirers !== undefined, 'Schema has target_acquirers');
  assert(TEMPLATE.schema.milestones !== undefined, 'Schema has milestones');
  assert(TEMPLATE.schema.reality_gate !== undefined, 'Schema has reality_gate (derived)');
  assert(TEMPLATE.schema.reality_gate.derived === true, 'reality_gate is marked derived');

  // ── Validation — valid data ──
  console.log('\n— Validation (valid data) —');
  const validData = {
    exit_thesis: 'This venture targets a high-growth market with unique IP in AI-powered analytics that makes it attractive for acquisition by enterprise SaaS companies.',
    exit_horizon_months: 36,
    exit_paths: [
      { type: 'acquisition', description: 'Strategic acquisition by enterprise SaaS player', probability_pct: 60 },
      { type: 'ipo', description: 'IPO after reaching $50M ARR', probability_pct: 20 },
    ],
    target_acquirers: [
      { name: 'Salesforce', rationale: 'Complementary analytics', fit_score: 4 },
      { name: 'Microsoft', rationale: 'Azure integration', fit_score: 3 },
      { name: 'HubSpot', rationale: 'SMB market fit', fit_score: 3 },
    ],
    milestones: [
      { date: 'Month 12', success_criteria: 'Achieve $1M ARR' },
      { date: 'Month 24', success_criteria: 'Expand to 3 markets' },
    ],
  };
  const validResult = TEMPLATE.validate(validData, null, { logger: silentLogger });
  assert(validResult.valid === true, 'Valid exit strategy data passes');
  assert(validResult.errors.length === 0, 'No errors for valid data');

  // ── Validation — missing fields ──
  console.log('\n— Validation (missing fields) —');
  const empty = {};
  const emptyResult = TEMPLATE.validate(empty, null, { logger: silentLogger });
  assert(emptyResult.valid === false, 'Empty data fails validation');
  assert(emptyResult.errors.length >= 4, 'At least 4 errors for missing required fields');

  // ── Validation — short exit thesis ──
  const shortThesis = { ...validData, exit_thesis: 'Too short' };
  const shortResult = TEMPLATE.validate(shortThesis, null, { logger: silentLogger });
  assert(shortResult.valid === false, 'Short exit_thesis (<20 chars) fails');

  // ── Validation — exit_horizon_months bounds ──
  const badHorizon = { ...validData, exit_horizon_months: 0 };
  const horizonResult = TEMPLATE.validate(badHorizon, null, { logger: silentLogger });
  assert(horizonResult.valid === false, 'exit_horizon_months=0 fails (min 1)');

  const bigHorizon = { ...validData, exit_horizon_months: 121 };
  const bigResult = TEMPLATE.validate(bigHorizon, null, { logger: silentLogger });
  assert(bigResult.valid === false, 'exit_horizon_months=121 fails (max 120)');

  // ── Validation — too few acquirers ──
  const fewAcquirers = { ...validData, target_acquirers: [validData.target_acquirers[0]] };
  const fewResult = TEMPLATE.validate(fewAcquirers, null, { logger: silentLogger });
  assert(fewResult.valid === false, 'Only 1 acquirer fails (min 3)');

  // ── Validation — invalid fit_score ──
  const badFit = { ...validData, target_acquirers: validData.target_acquirers.map((a, i) => i === 0 ? { ...a, fit_score: 6 } : a) };
  const badFitResult = TEMPLATE.validate(badFit, null, { logger: silentLogger });
  assert(badFitResult.valid === false, 'fit_score=6 fails (max 5)');

  // ── Validation — probability_pct > 100 ──
  const badProb = { ...validData, exit_paths: [{ type: 'acquisition', description: 'Test', probability_pct: 101 }] };
  const probResult = TEMPLATE.validate(badProb, null, { logger: silentLogger });
  assert(probResult.valid === false, 'probability_pct=101 fails (max 100)');

  // ── Validation — cross-stage prerequisites ──
  console.log('\n— Validation (cross-stage prerequisites) —');
  const stage06Good = { risks: [{ category: 'Market' }], aggregate_risk_score: 10 };
  const stage07Good = { tiers: [{ name: 'Pro', price: 49 }] };
  const stage08Good = makeValidBMCData();
  const crossResult = TEMPLATE.validate(validData, { stage06: stage06Good, stage07: stage07Good, stage08: stage08Good }, { logger: silentLogger });
  assert(crossResult.valid === true, 'Valid Stage 6-8 prerequisites pass');

  // ── evaluateRealityGate ──
  console.log('\n— evaluateRealityGate —');
  assert(typeof evaluateRealityGate === 'function', 'evaluateRealityGate is exported');

  // Passing gate: 10 risks, tiers + LTV + payback, all 9 BMC blocks
  const passingPrereqs = {
    stage06: { risks: Array.from({ length: 10 }, (_, i) => ({ category: `Risk ${i}` })) },
    stage07: { tiers: [{ name: 'Pro', price: 49 }], ltv: 5000, payback_months: 8 },
    stage08: makeValidBMCData(),
  };
  const passGate = evaluateRealityGate(passingPrereqs);
  assert(passGate.pass === true, 'Reality gate PASSES with full prerequisites');
  assert(passGate.blockers.length === 0, 'No blockers when passing');

  // Failing gate: too few risks
  const fewRisks = {
    stage06: { risks: [{ category: 'Market' }] },
    stage07: { tiers: [{ name: 'Pro', price: 49 }], ltv: 5000, payback_months: 8 },
    stage08: makeValidBMCData(),
  };
  const failGateRisks = evaluateRealityGate(fewRisks);
  assert(failGateRisks.pass === false, 'Reality gate FAILS with too few risks');
  assert(failGateRisks.blockers.some(b => b.includes('Insufficient risks')), 'Blocker mentions insufficient risks');

  // Failing gate: null LTV
  const nullLtv = {
    stage06: { risks: Array.from({ length: 10 }, () => ({ category: 'R' })) },
    stage07: { tiers: [{ name: 'Pro', price: 49 }], ltv: null, payback_months: 8 },
    stage08: makeValidBMCData(),
  };
  const failGateLtv = evaluateRealityGate(nullLtv);
  assert(failGateLtv.pass === false, 'Reality gate FAILS with null LTV');
  assert(failGateLtv.blockers.some(b => b.includes('LTV')), 'Blocker mentions LTV');

  // Failing gate: missing BMC block
  const missingBmc = {
    stage06: { risks: Array.from({ length: 10 }, () => ({ category: 'R' })) },
    stage07: { tiers: [{ name: 'Pro', price: 49 }], ltv: 5000, payback_months: 8 },
    stage08: { ...makeValidBMCData(), customerSegments: { items: [] } },
  };
  const failGateBmc = evaluateRealityGate(missingBmc);
  assert(failGateBmc.pass === false, 'Reality gate FAILS with empty BMC block');
  assert(failGateBmc.blockers.some(b => b.includes('customerSegments')), 'Blocker mentions missing BMC block');

  // ── computeDerived ──
  console.log('\n— computeDerived —');
  const derivedWithPrereqs = TEMPLATE.computeDerived(validData, passingPrereqs, { logger: silentLogger });
  assert(derivedWithPrereqs.reality_gate !== null, 'computeDerived returns reality_gate');
  assert(derivedWithPrereqs.reality_gate.pass === true, 'computeDerived reality_gate passes with full prereqs');

  const derivedNoPrereqs = TEMPLATE.computeDerived(validData, null, { logger: silentLogger });
  assert(derivedNoPrereqs.reality_gate.pass === false, 'computeDerived without prereqs → reality_gate fails');

  // ── fetchUpstreamArtifacts mock ──
  console.log('\n— fetchUpstreamArtifacts —');
  const { fetchUpstreamArtifacts } = await import(toURL('lib/eva/stage-execution-engine.js'));
  const mockSupabase = createMockSupabase({
    venture_artifacts: [
      { lifecycle_stage: 'stage_8_bmc', metadata: makeValidBMCData() },
    ],
  });
  const upstream = await fetchUpstreamArtifacts(mockSupabase, 'test-venture-id', 9, { logger: silentLogger });
  assert(upstream !== null && typeof upstream === 'object', 'fetchUpstreamArtifacts returns object');

  // ── Cross-stage contracts ──
  console.log('\n— Cross-stage contracts —');
  const { validatePreStage } = await import(toURL('lib/eva/contracts/stage-contracts.js'));

  // Stage 6+7+8 → Stage 9 consume contract
  const multiMap = new Map([
    [6, { risks: [{ category: 'Market' }], aggregate_risk_score: 10 }],
    [7, { tiers: [{ name: 'Pro', price: 49 }] }],
    [8, { customerSegments: { items: [makeValidItem()] } }],
  ]);
  const pre9 = validatePreStage(9, multiMap);
  assert(pre9.valid === true, 'Stages 6-8 output satisfies Stage 9 consume contract');

  // ── Execution flow ──
  console.log('\n— Execution flow —');
  const engineSrc = readFileSync(join(ROOT, 'lib/eva/stage-execution-engine.js'), 'utf8');
  const hasAnalysisFirst = /if\s*\(hasAnalysisStep\)/.test(engineSrc);
  const hasComputeElse = /else\s+if\s*\(typeof\s+template\.computeDerived/.test(engineSrc);
  assert(hasAnalysisFirst && hasComputeElse, 'Engine uses if/else between analysisStep and computeDerived');
  assert(typeof TEMPLATE.analysisStep === 'function', 'Template has analysisStep (overrides computeDerived)');

  // ── Analysis step audit flags ──
  console.log('\n— Analysis step audit flags —');
  const analysisSrc = readFileSync(join(ROOT, 'lib/eva/stage-templates/analysis-steps/stage-09-exit-strategy.js'), 'utf8');

  // AUDIT: Stage 7 field names use snake_case
  const usesSnakeCasePricing = /stage7Data\.pricing_model|stage7Data\?\.pricing_model/.test(analysisSrc);
  const usesOldCamelCase = /stage7Data\.pricingModel|stage7Data\?\.pricingModel/.test(analysisSrc);
  assert(usesSnakeCasePricing && !usesOldCamelCase, '[AUDIT] Stage 7 pricing_model uses snake_case (PR #1754 alignment)');

  // AUDIT: Stage 7 arpa is top-level
  const usesTopLevelArpa = /stage7Data\.arpa|stage7Data\?\.arpa/.test(analysisSrc);
  const usesNestedArpa = /stage7Data\.unitEconomics\?\.arpa|stage7Data\?\.unitEconomics\?\.arpa/.test(analysisSrc);
  assert(usesTopLevelArpa && !usesNestedArpa, '[AUDIT] Stage 7 arpa is top-level (not nested under unitEconomics)');

  // AUDIT: LLM fallback detection
  const hasLLMFallback = /llmFallbackCount/.test(analysisSrc);
  assert(hasLLMFallback, '[AUDIT] Analysis step has LLM fallback detection');

  // AUDIT: Reality gate called in analysis step (not dead in computeDerived)
  const callsRealityGate = /evaluateRealityGate/.test(analysisSrc);
  assert(callsRealityGate, '[AUDIT] Analysis step calls evaluateRealityGate (not dead in computeDerived)');

  // AUDIT: outputSchema exists on template
  const templateSrc = readFileSync(join(ROOT, 'lib/eva/stage-templates/stage-09.js'), 'utf8');
  const hasOutputSchema = /outputSchema\s*=\s*extractOutputSchema/.test(templateSrc);
  assert(hasOutputSchema, '[AUDIT] Template has outputSchema via extractOutputSchema');

  // AUDIT: Logger passed to parseFourBuckets
  const loggerPassed = /parseFourBuckets\([^)]*logger/.test(analysisSrc);
  assert(loggerPassed, '[AUDIT] Logger passed to parseFourBuckets');

  // ── Error cases ──
  console.log('\n— Error cases —');
  const nullResult = TEMPLATE.validate(null, null, { logger: silentLogger });
  assert(nullResult.valid === false, 'Null data fails validation');

  const noMilestones = { ...validData, milestones: [] };
  const noMsResult = TEMPLATE.validate(noMilestones, null, { logger: silentLogger });
  assert(noMsResult.valid === false, 'Empty milestones fails (min 1)');

  const noExitPaths = { ...validData, exit_paths: [] };
  const noPathResult = TEMPLATE.validate(noExitPaths, null, { logger: silentLogger });
  assert(noPathResult.valid === false, 'Empty exit_paths fails (min 1)');

  // ── Summary ──
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failures.length > 0) {
    console.log('\nFailures:');
    failures.forEach(f => console.log(`  ✗ ${f}`));
  }
  process.exit(failed > 0 ? 1 : 0);
})();
