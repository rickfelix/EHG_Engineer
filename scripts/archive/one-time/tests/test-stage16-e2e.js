#!/usr/bin/env node
/**
 * Stage 16 E2E Test — Financial Projections & Promotion Gate
 * Phase: THE BLUEPRINT (Stages 13-16) — PROMOTION GATE STAGE
 *
 * Tests: template structure, validation, computeDerived,
 * evaluatePromotionGate, execution flow, audit flags.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log(`  ✅ ${msg}`); } else { fail++; console.error(`  ❌ FAIL: ${msg}`); } }

// ── Load template ──
const mod = await import(`file:///${ROOT}/lib/eva/stage-templates/stage-16.js`.replace(/\\/g, '/'));
const TEMPLATE = mod.default;
const { MIN_PROJECTION_MONTHS, evaluatePromotionGate } = mod;
const silent = { warn: () => {}, log: () => {}, error: () => {} };

console.log('\n=== 1. Template structure ===');
assert(TEMPLATE.id === 'stage-16', 'id = stage-16');
assert(TEMPLATE.slug === 'financial-projections', 'slug = financial-projections');
assert(TEMPLATE.version === '3.0.0', 'version = 3.0.0');
assert(TEMPLATE.schema.initial_capital?.required === true, 'initial_capital required');
assert(TEMPLATE.schema.monthly_burn_rate?.required === true, 'monthly_burn_rate required');
assert(TEMPLATE.schema.revenue_projections?.minItems === MIN_PROJECTION_MONTHS, `revenue_projections minItems = ${MIN_PROJECTION_MONTHS}`);
assert(TEMPLATE.schema.runway_months?.derived === true, 'runway_months is derived');
assert(TEMPLATE.schema.promotion_gate?.derived === true, 'promotion_gate is derived');
assert(typeof TEMPLATE.validate === 'function', 'has validate()');
assert(typeof TEMPLATE.computeDerived === 'function', 'has computeDerived()');
assert(typeof TEMPLATE.analysisStep === 'function', 'has analysisStep()');
assert(typeof evaluatePromotionGate === 'function', 'evaluatePromotionGate exported');

// OutputSchema
assert(TEMPLATE.outputSchema && typeof TEMPLATE.outputSchema === 'object', 'has outputSchema (AUDIT)');

console.log('\n=== 2. Validation — good data ===');
const goodProjection = (m, rev, cost) => ({
  month: m, revenue: rev, costs: cost,
  cost_breakdown: { personnel: cost * 0.6, infrastructure: cost * 0.2, marketing: cost * 0.1, other: cost * 0.1 },
});
const goodData = {
  initial_capital: 50000,
  monthly_burn_rate: 8000,
  revenue_projections: [
    goodProjection(1, 0, 8000), goodProjection(2, 500, 8000),
    goodProjection(3, 1000, 8000), goodProjection(4, 2000, 8500),
    goodProjection(5, 3500, 8500), goodProjection(6, 5000, 9000),
  ],
  funding_rounds: [{ round_name: 'Pre-seed', target_amount: 100000, target_date: '2026-06-01' }],
};
const goodResult = TEMPLATE.validate(goodData, { logger: silent });
assert(goodResult.valid === true, 'good data passes validation');
assert(goodResult.errors.length === 0, 'no errors');

console.log('\n=== 3. Validation — bad data ===');
const badResult = TEMPLATE.validate({}, { logger: silent });
assert(badResult.valid === false, 'empty data fails');

// Too few projections
const fewProj = { ...goodData, revenue_projections: [goodProjection(1, 0, 8000)] };
assert(TEMPLATE.validate(fewProj, { logger: silent }).valid === false, 'too few projections fails');

// Negative capital
const negCap = { ...goodData, initial_capital: -100 };
assert(TEMPLATE.validate(negCap, { logger: silent }).valid === false, 'negative capital fails');

// Missing revenue in projection
const badProj = { ...goodData, revenue_projections: goodData.revenue_projections.map((rp, i) => i === 0 ? { ...rp, revenue: undefined } : rp) };
assert(TEMPLATE.validate(badProj, { logger: silent }).valid === false, 'missing revenue in projection fails');

console.log('\n=== 4. evaluatePromotionGate ===');
// All prerequisites met
const stage13Good = { milestones: [{ title: 'M1' }, { title: 'M2' }, { title: 'M3' }], decision: 'pass' };
const stage14Good = { layers: { presentation: { technology: 'React' }, api: { technology: 'Express' }, business_logic: { technology: 'Node' }, data: { technology: 'PostgreSQL' }, infrastructure: { technology: 'AWS' } } };
const stage15Good = { risks: [{ title: 'R1', severity: 'high', priority: 'immediate', mitigationPlan: 'Plan A' }] };
const stage16Good = { initial_capital: 50000, revenue_projections: goodData.revenue_projections };

const gatePass = evaluatePromotionGate({ stage13: stage13Good, stage14: stage14Good, stage15: stage15Good, stage16: stage16Good });
assert(gatePass.pass === true, 'promotion gate passes with all prerequisites');
assert(gatePass.blockers.length === 0, 'no blockers when passing');

// Stage 13 kill gate triggered
const gateFail13 = evaluatePromotionGate({ stage13: { ...stage13Good, decision: 'kill' }, stage14: stage14Good, stage15: stage15Good, stage16: stage16Good });
assert(gateFail13.pass === false, 'promotion gate fails on Stage 13 kill');
assert(gateFail13.blockers.some(b => b.includes('kill gate')), 'blocker mentions kill gate');

// Stage 14 missing layer
const gateFail14 = evaluatePromotionGate({ stage13: stage13Good, stage14: { layers: { presentation: {}, api: {} } }, stage15: stage15Good, stage16: stage16Good });
assert(gateFail14.pass === false, 'promotion gate fails on missing layers');
assert(gateFail14.blockers.length >= 3, 'multiple missing layer blockers');

// Stage 15 no risks
const gateFail15 = evaluatePromotionGate({ stage13: stage13Good, stage14: stage14Good, stage15: { risks: [] }, stage16: stage16Good });
assert(gateFail15.pass === false, 'promotion gate fails on no risks');

// Stage 16 no capital
const gateFail16 = evaluatePromotionGate({ stage13: stage13Good, stage14: stage14Good, stage15: stage15Good, stage16: { initial_capital: 0, revenue_projections: [] } });
assert(gateFail16.pass === false, 'promotion gate fails on zero capital');
assert(gateFail16.blockers.length >= 2, 'blockers for capital + projections');

console.log('\n=== 5. fetchUpstreamArtifacts mock ===');
const engineSrc = readFileSync(resolve(ROOT, 'lib/eva/stage-execution-engine.js'), 'utf8');
assert(engineSrc.includes('lifecycle_stage'), 'engine queries lifecycle_stage');

console.log('\n=== 6. Execution flow ===');
assert(engineSrc.includes('hasAnalysisStep'), 'engine uses hasAnalysisStep flag');
const hasElseComputeDerived = /else\s+if\s*\(\s*typeof\s+template\.computeDerived/.test(engineSrc);
assert(hasElseComputeDerived, 'engine has else-if for computeDerived (dead code when analysisStep exists)');

console.log('\n=== 7. Audit flags ===');
const analysisSrc = readFileSync(resolve(ROOT, 'lib/eva/stage-templates/analysis-steps/stage-16-financial-projections.js'), 'utf8');
const templateSrc = readFileSync(resolve(ROOT, 'lib/eva/stage-templates/stage-16.js'), 'utf8');

// 7a: outputSchema
assert(templateSrc.includes('extractOutputSchema'), 'template calls extractOutputSchema (AUDIT)');
assert(templateSrc.includes('ensureOutputSchema'), 'template calls ensureOutputSchema (AUDIT)');

// 7b: DRY exception documented
assert(analysisSrc.includes('circular dependency'), 'DRY exception documented (AUDIT)');

// 7c: LLM fallback detection
assert(analysisSrc.includes('llmFallbackCount'), 'analysis step tracks llmFallbackCount (AUDIT)');

// 7d: Field casing — analysis output must use snake_case matching template schema
assert(analysisSrc.includes('total_projected_revenue'), 'analysis uses total_projected_revenue (snake_case, AUDIT)');
assert(analysisSrc.includes('total_projected_costs'), 'analysis uses total_projected_costs (snake_case, AUDIT)');

// 7e: Promotion gate called from analysis step
assert(analysisSrc.includes('evaluatePromotionGate'), 'analysis step calls evaluatePromotionGate (AUDIT)');

// 7f: Derived fields computed in analysis step
assert(analysisSrc.includes('runway_months'), 'analysis computes runway_months (AUDIT)');
assert(analysisSrc.includes('burn_rate'), 'analysis computes burn_rate (AUDIT)');
assert(analysisSrc.includes('break_even_month'), 'analysis computes break_even_month (AUDIT)');

// 7g: Stale Stage 14 field names — should NOT use camelCase fallbacks
assert(!analysisSrc.includes('totalComponents'), 'no stale totalComponents reference (AUDIT)');
assert(!analysisSrc.includes('layerCount'), 'no stale layerCount reference (AUDIT)');

// 7h: logger passed to parseFourBuckets
assert(analysisSrc.includes('parseFourBuckets(parsed, { logger }'), 'logger passed to parseFourBuckets');

console.log('\n=== 8. Error cases ===');
assert(TEMPLATE.validate(null, { logger: silent }).valid === false, 'null data fails');
assert(TEMPLATE.validate('string', { logger: silent }).valid === false, 'string data fails');

// Bad funding round
const badFunding = { ...goodData, funding_rounds: [{ round_name: '', target_amount: -1 }] };
const fResult = TEMPLATE.validate(badFunding, { logger: silent });
assert(fResult.valid === false, 'bad funding round fails');

console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${pass} passed, ${fail} failed out of ${pass + fail}`);
process.exit(fail > 0 ? 1 : 0);
