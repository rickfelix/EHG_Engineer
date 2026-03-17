#!/usr/bin/env node
/**
 * Stage 12 E2E Test — Sales Logic
 * Phase: THE IDENTITY (Stages 10-12)
 *
 * Tests: template structure, validation, evaluateRealityGate,
 * computeDerived, cross-stage contracts, execution flow, audit flags.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log(`  ✅ ${msg}`); } else { fail++; console.error(`  ❌ FAIL: ${msg}`); } }

// ── Load template ──
const mod = await import(`file:///${ROOT}/lib/eva/stage-templates/stage-12.js`.replace(/\\/g, '/'));
const TEMPLATE = mod.default;
const { evaluateRealityGate } = mod;
const { SALES_MODELS, MIN_FUNNEL_STAGES, MIN_JOURNEY_STEPS, MIN_DEAL_STAGES } = mod;
const silent = { warn: () => {}, log: () => {}, error: () => {} };

console.log('\n=== 1. Template structure ===');
assert(TEMPLATE.id === 'stage-12', 'id = stage-12');
assert(TEMPLATE.slug === 'sales-logic', 'slug = sales-logic');
assert(TEMPLATE.version === '2.0.0', 'version = 2.0.0');
assert(TEMPLATE.schema.sales_model, 'schema has sales_model');
assert(TEMPLATE.schema.sales_cycle_days, 'schema has sales_cycle_days');
assert(TEMPLATE.schema.deal_stages?.minItems === MIN_DEAL_STAGES, `deal_stages minItems = ${MIN_DEAL_STAGES}`);
assert(TEMPLATE.schema.funnel_stages?.minItems === MIN_FUNNEL_STAGES, `funnel_stages minItems = ${MIN_FUNNEL_STAGES}`);
assert(TEMPLATE.schema.customer_journey?.minItems === MIN_JOURNEY_STEPS, `customer_journey minItems = ${MIN_JOURNEY_STEPS}`);
assert(TEMPLATE.schema.economyCheck?.derived === true, 'economyCheck is derived');
assert(TEMPLATE.schema.reality_gate?.derived === true, 'reality_gate is derived');
assert(typeof TEMPLATE.validate === 'function', 'has validate()');
assert(typeof TEMPLATE.computeDerived === 'function', 'has computeDerived()');
assert(typeof TEMPLATE.analysisStep === 'function', 'has analysisStep()');
assert(typeof evaluateRealityGate === 'function', 'evaluateRealityGate is exported');
assert(SALES_MODELS.length >= 4, 'SALES_MODELS has >= 4 entries');

// OutputSchema
assert(TEMPLATE.outputSchema && typeof TEMPLATE.outputSchema === 'object', 'has outputSchema (AUDIT)');

console.log('\n=== 2. Validation — good data ===');
const goodData = {
  sales_model: 'hybrid',
  sales_cycle_days: 30,
  deal_stages: Array.from({ length: 3 }, (_, i) => ({
    name: `Stage ${i}`, description: `Desc ${i}`, avg_duration_days: 5, mappedFunnelStage: `Funnel ${i}`,
  })),
  funnel_stages: Array.from({ length: 4 }, (_, i) => ({
    name: `Funnel ${i}`, metric: `Metric ${i}`, target_value: 1000 * (i + 1), conversionRateEstimate: 0.25,
  })),
  customer_journey: Array.from({ length: 5 }, (_, i) => ({
    step: `Step ${i}`, funnel_stage: `Funnel ${i % 4}`, touchpoint: `Touch ${i}`,
  })),
};
const goodResult = TEMPLATE.validate(goodData, { logger: silent });
assert(goodResult.valid === true, 'good data passes validation');
assert(goodResult.errors.length === 0, 'no errors');

console.log('\n=== 3. Validation — bad data ===');
const badResult = TEMPLATE.validate({}, { logger: silent });
assert(badResult.valid === false, 'empty data fails');

// Invalid sales model
const badModel = { ...goodData, sales_model: 'INVALID' };
assert(TEMPLATE.validate(badModel, { logger: silent }).valid === false, 'invalid sales_model fails');

// Too few deal stages
const fewDeals = { ...goodData, deal_stages: goodData.deal_stages.slice(0, 1) };
assert(TEMPLATE.validate(fewDeals, { logger: silent }).valid === false, `< ${MIN_DEAL_STAGES} deal stages fails`);

// Too few funnel stages
const fewFunnel = { ...goodData, funnel_stages: goodData.funnel_stages.slice(0, 1) };
assert(TEMPLATE.validate(fewFunnel, { logger: silent }).valid === false, `< ${MIN_FUNNEL_STAGES} funnel stages fails`);

// Too few journey steps
const fewJourney = { ...goodData, customer_journey: goodData.customer_journey.slice(0, 2) };
assert(TEMPLATE.validate(fewJourney, { logger: silent }).valid === false, `< ${MIN_JOURNEY_STEPS} journey steps fails`);

// Conversion rate > 1
const badConv = {
  ...goodData,
  funnel_stages: goodData.funnel_stages.map((fs, i) => i === 0 ? { ...fs, conversionRateEstimate: 1.5 } : fs),
};
assert(TEMPLATE.validate(badConv, { logger: silent }).valid === false, 'conversionRateEstimate > 1 fails');

console.log('\n=== 4. evaluateRealityGate ===');
const stage10Pass = {
  candidates: Array.from({ length: 5 }, (_, i) => ({ name: `B${i}`, weighted_score: 70 })),
};
const stage11Pass = {
  tiers: Array.from({ length: 3 }, (_, i) => ({ name: `T${i}` })),
  channels: Array.from({ length: 8 }, (_, i) => ({ name: `C${i}` })),
};
const stage12Pass = {
  funnel_stages: Array.from({ length: 4 }, (_, i) => ({ name: `F${i}`, metric: `M${i}`, target_value: 1000 })),
  customer_journey: Array.from({ length: 5 }, (_, i) => ({ step: `S${i}` })),
  economyCheck: { totalPipelineValue: 4000, avgConversionRate: 0.25 },
};
const gatePass = evaluateRealityGate({ stage10: stage10Pass, stage11: stage11Pass, stage12: stage12Pass });
assert(gatePass.pass === true, 'reality gate passes with good data');
assert(gatePass.blockers.length === 0, 'no blockers');

// Fail: too few candidates
const gateFewCands = evaluateRealityGate({
  stage10: { candidates: [{ name: 'A', weighted_score: 70 }] },
  stage11: stage11Pass, stage12: stage12Pass,
});
assert(gateFewCands.pass === false, 'fails with < 5 candidates');
assert(gateFewCands.blockers.some(b => b.includes('candidates')), 'blocker mentions candidates');

// Fail: wrong tier count
const gateBadTiers = evaluateRealityGate({
  stage10: stage10Pass,
  stage11: { tiers: [{ name: 'T1' }], channels: stage11Pass.channels },
  stage12: stage12Pass,
});
assert(gateBadTiers.pass === false, 'fails with != 3 tiers');

// Fail: too few funnel stages
const gateFewFunnel = evaluateRealityGate({
  stage10: stage10Pass, stage11: stage11Pass,
  stage12: { ...stage12Pass, funnel_stages: [{ name: 'F1', metric: 'M', target_value: 100 }] },
});
assert(gateFewFunnel.pass === false, 'fails with < 4 funnel stages');

console.log('\n=== 5. fetchUpstreamArtifacts mock ===');
const engineSrc = readFileSync(resolve(ROOT, 'lib/eva/stage-execution-engine.js'), 'utf8');
assert(engineSrc.includes('lifecycle_stage'), 'engine queries lifecycle_stage');

console.log('\n=== 6. Execution flow ===');
assert(engineSrc.includes('hasAnalysisStep'), 'engine uses hasAnalysisStep flag');
const hasElseComputeDerived = /else\s+if\s*\(\s*typeof\s+template\.computeDerived/.test(engineSrc);
assert(hasElseComputeDerived, 'engine has else-if for computeDerived (dead code when analysisStep exists)');

console.log('\n=== 7. Audit flags ===');
const analysisSrc = readFileSync(resolve(ROOT, 'lib/eva/stage-templates/analysis-steps/stage-12-sales-logic.js'), 'utf8');
const templateSrc = readFileSync(resolve(ROOT, 'lib/eva/stage-templates/stage-12.js'), 'utf8');

// 7a: outputSchema
assert(templateSrc.includes('extractOutputSchema'), 'template calls extractOutputSchema (AUDIT)');
assert(templateSrc.includes('ensureOutputSchema'), 'template calls ensureOutputSchema (AUDIT)');

// 7b: DRY exception documented
assert(analysisSrc.includes('circular dependency'), 'DRY exception documented (AUDIT)');

// 7c: LLM fallback detection
assert(analysisSrc.includes('llmFallbackCount'), 'analysis step tracks llmFallbackCount (AUDIT)');

// 7d: Stale Stage 7 field names — should use pricing_model and arpa (not pricingModel/unitEconomics.arpa)
assert(!analysisSrc.includes('pricingModel'), 'no stale pricingModel reference (AUDIT)');
assert(!analysisSrc.includes('unitEconomics'), 'no stale unitEconomics reference (AUDIT)');

// 7e: Reality gate called from analysis step
assert(analysisSrc.includes('evaluateRealityGate'), 'analysis step calls evaluateRealityGate (AUDIT)');

// 7f: logger passed to parseFourBuckets
assert(analysisSrc.includes('parseFourBuckets(parsed, { logger }'), 'logger passed to parseFourBuckets');

console.log('\n=== 8. Error cases ===');
// Zero sales cycle days
const zeroCycle = { ...goodData, sales_cycle_days: 0 };
assert(TEMPLATE.validate(zeroCycle, { logger: silent }).valid === false, 'sales_cycle_days = 0 fails');

// Missing touchpoint
const noTouch = {
  ...goodData,
  customer_journey: goodData.customer_journey.map((cj, i) => i === 0 ? { ...cj, touchpoint: null } : cj),
};
assert(TEMPLATE.validate(noTouch, { logger: silent }).valid === false, 'null touchpoint fails');

console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${pass} passed, ${fail} failed out of ${pass + fail}`);
process.exit(fail > 0 ? 1 : 0);
