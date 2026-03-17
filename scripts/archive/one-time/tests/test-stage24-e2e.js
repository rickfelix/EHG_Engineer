#!/usr/bin/env node
/**
 * Stage 24 E2E Test — Metrics & Learning
 * Phase: LAUNCH & LEARN (Stages 23-25)
 *
 * Tests: template structure, validation, computeDerived,
 * execution flow, audit flags.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log(`  ✅ ${msg}`); } else { fail++; console.error(`  ❌ FAIL: ${msg}`); } }

// ── Load template ──
const mod = await import(`file:///${ROOT}/lib/eva/stage-templates/stage-24.js`.replace(/\\/g, '/'));
const TEMPLATE = mod.default;
const { AARRR_CATEGORIES, TREND_DIRECTIONS, IMPACT_LEVELS, OUTCOME_ASSESSMENTS, MIN_METRICS_PER_CATEGORY, MIN_FUNNELS } = mod;
const silent = { warn: () => {}, log: () => {}, error: () => {} };

console.log('\n=== 1. Template structure ===');
assert(TEMPLATE.id === 'stage-24', 'id = stage-24');
assert(TEMPLATE.slug === 'metrics-learning', 'slug = metrics-learning');
assert(TEMPLATE.version === '1.0.0', 'version = 1.0.0');
assert(TEMPLATE.schema.aarrr?.required === true, 'aarrr required');
assert(TEMPLATE.schema.aarrr?.type === 'object', 'aarrr is object');
assert(TEMPLATE.schema.funnels?.type === 'array', 'funnels is array');
assert(TEMPLATE.schema.funnels?.minItems === MIN_FUNNELS, `funnels minItems = ${MIN_FUNNELS}`);
assert(TEMPLATE.schema.total_metrics?.derived === true, 'total_metrics is derived');
assert(TEMPLATE.schema.categories_complete?.derived === true, 'categories_complete is derived');
assert(TEMPLATE.schema.funnel_count?.derived === true, 'funnel_count is derived');
assert(TEMPLATE.schema.metrics_on_target?.derived === true, 'metrics_on_target is derived');
assert(TEMPLATE.schema.metrics_below_target?.derived === true, 'metrics_below_target is derived');
assert(TEMPLATE.schema.launchOutcome?.derived === true, 'launchOutcome is derived');
assert(typeof TEMPLATE.validate === 'function', 'has validate()');
assert(typeof TEMPLATE.computeDerived === 'function', 'has computeDerived()');
assert(typeof TEMPLATE.analysisStep === 'function', 'has analysisStep()');
assert(AARRR_CATEGORIES.length === 5, 'AARRR_CATEGORIES has 5 entries');
assert(TREND_DIRECTIONS.length === 3, 'TREND_DIRECTIONS has 3 entries');
assert(IMPACT_LEVELS.length === 3, 'IMPACT_LEVELS has 3 entries');
assert(OUTCOME_ASSESSMENTS.length === 4, 'OUTCOME_ASSESSMENTS has 4 entries');
assert(MIN_METRICS_PER_CATEGORY === 1, 'MIN_METRICS_PER_CATEGORY = 1');
assert(MIN_FUNNELS === 1, 'MIN_FUNNELS = 1');

// OutputSchema
assert(TEMPLATE.outputSchema && typeof TEMPLATE.outputSchema === 'object', 'has outputSchema (AUDIT)');

console.log('\n=== 2. Validation — good data ===');
const goodMetric = { name: 'Users', value: 100, target: 200, trendDirection: 'up' };
const goodData = {
  aarrr: {
    acquisition: [{ name: 'New signups', value: 500, target: 400, trendDirection: 'up' }],
    activation: [{ name: 'Onboarding complete', value: 80, target: 90, trendDirection: 'up' }],
    retention: [{ name: 'Day-30 retention', value: 35, target: 40, trendDirection: 'flat' }],
    revenue: [{ name: 'MRR', value: 5000, target: 3000, trendDirection: 'up' }],
    referral: [{ name: 'Referral rate', value: 8, target: 10, trendDirection: 'up' }],
  },
  funnels: [{ name: 'Signup funnel', steps: [{ stage: 'visit', count: 1000 }, { stage: 'signup', count: 500 }] }],
  learnings: [{ insight: 'Users prefer dark mode', action: 'Implement dark mode toggle', impactLevel: 'medium' }],
};
const goodResult = TEMPLATE.validate(goodData, { logger: silent });
assert(goodResult.valid === true, 'good data passes validation');
assert(goodResult.errors.length === 0, 'no errors');

console.log('\n=== 3. Validation — bad data ===');
assert(TEMPLATE.validate({}, { logger: silent }).valid === false, 'empty data fails');

// Missing aarrr
assert(TEMPLATE.validate({ funnels: [{ name: 'f', steps: ['a', 'b'] }] }, { logger: silent }).valid === false, 'missing aarrr fails');

// Empty AARRR category
const emptyAcq = { ...goodData, aarrr: { ...goodData.aarrr, acquisition: [] } };
assert(TEMPLATE.validate(emptyAcq, { logger: silent }).valid === false, 'empty acquisition category fails');

// Invalid metric (missing name)
const badMetric = { ...goodData, aarrr: { ...goodData.aarrr, acquisition: [{ value: 10, target: 20 }] } };
assert(TEMPLATE.validate(badMetric, { logger: silent }).valid === false, 'metric without name fails');

// Empty funnels
const noFunnels = { ...goodData, funnels: [] };
assert(TEMPLATE.validate(noFunnels, { logger: silent }).valid === false, 'empty funnels fails');

// Funnel missing steps
const badFunnel = { ...goodData, funnels: [{ name: 'f', steps: [{ a: 1 }] }] };
assert(TEMPLATE.validate(badFunnel, { logger: silent }).valid === false, 'funnel with <2 steps fails');

// Learning missing insight
const badLearning = { ...goodData, learnings: [{ action: 'Do something' }] };
assert(TEMPLATE.validate(badLearning, { logger: silent }).valid === false, 'learning without insight fails');

console.log('\n=== 4. computeDerived ===');
const derived = TEMPLATE.computeDerived(goodData, null, { logger: silent });
assert(derived.total_metrics === 5, 'total_metrics = 5');
assert(derived.categories_complete === true, 'all categories complete');
assert(derived.funnel_count === 1, 'funnel_count = 1');
assert(derived.metrics_on_target === 2, 'metrics_on_target = 2 (signups, MRR)');
assert(derived.metrics_below_target === 3, 'metrics_below_target = 3');
assert(derived.launchOutcome.assessment === 'failure', 'assessment = failure (40% criteria met)');
assert(typeof derived.launchOutcome.criteriaMetRate === 'number', 'criteriaMetRate is number');

// All metrics on target
const allOnTarget = {
  aarrr: Object.fromEntries(AARRR_CATEGORIES.map(c => [c, [{ name: c, value: 100, target: 50 }]])),
  funnels: [{ name: 'f', steps: ['a', 'b'] }],
  learnings: [],
};
const allOnDerived = TEMPLATE.computeDerived(allOnTarget, null, { logger: silent });
assert(allOnDerived.metrics_on_target === 5, 'all on target');
assert(allOnDerived.launchOutcome.assessment === 'success', '100% → success');

// No metrics (indeterminate)
const emptyAarrr = {
  aarrr: Object.fromEntries(AARRR_CATEGORIES.map(c => [c, []])),
  funnels: [],
};
const emptyDerived = TEMPLATE.computeDerived(emptyAarrr, null, { logger: silent });
assert(emptyDerived.total_metrics === 0, 'no metrics');
assert(emptyDerived.launchOutcome.assessment === 'indeterminate', '0 metrics → indeterminate');

console.log('\n=== 5. fetchUpstreamArtifacts mock ===');
const engineSrc = readFileSync(resolve(ROOT, 'lib/eva/stage-execution-engine.js'), 'utf8');
assert(engineSrc.includes('lifecycle_stage'), 'engine queries lifecycle_stage');

console.log('\n=== 6. Execution flow ===');
assert(engineSrc.includes('hasAnalysisStep'), 'engine uses hasAnalysisStep flag');
const hasElseComputeDerived = /else\s+if\s*\(\s*typeof\s+template\.computeDerived/.test(engineSrc);
assert(hasElseComputeDerived, 'engine has else-if for computeDerived (dead code when analysisStep exists)');

console.log('\n=== 7. Audit flags ===');
const analysisSrc = readFileSync(resolve(ROOT, 'lib/eva/stage-templates/analysis-steps/stage-24-metrics-learning.js'), 'utf8');
const templateSrc = readFileSync(resolve(ROOT, 'lib/eva/stage-templates/stage-24.js'), 'utf8');

// 7a: outputSchema
assert(templateSrc.includes('extractOutputSchema'), 'template calls extractOutputSchema (AUDIT)');
assert(templateSrc.includes('ensureOutputSchema'), 'template calls ensureOutputSchema (AUDIT)');

// 7b: DRY exception documented
assert(analysisSrc.includes('circular dependency'), 'DRY exception documented (AUDIT)');

// 7c: LLM fallback detection
assert(analysisSrc.includes('llmFallbackCount'), 'analysis step tracks llmFallbackCount (AUDIT)');

// 7d: Field casing — analysis output uses snake_case for template schema
assert(analysisSrc.includes('total_metrics'), 'analysis uses total_metrics (snake_case, AUDIT)');
assert(analysisSrc.includes('metrics_on_target'), 'analysis uses metrics_on_target (snake_case, AUDIT)');
assert(analysisSrc.includes('metrics_below_target'), 'analysis uses metrics_below_target (snake_case, AUDIT)');
assert(analysisSrc.includes('categories_complete'), 'analysis uses categories_complete (snake_case, AUDIT)');
assert(analysisSrc.includes('funnel_count'), 'analysis uses funnel_count (snake_case, AUDIT)');

// 7e: Analysis step produces funnels (template requires minItems: 1)
assert(analysisSrc.includes('funnels'), 'analysis step produces funnels (AUDIT)');
assert(analysisSrc.includes('AARRR Conversion Funnel'), 'analysis step has default funnel fallback (AUDIT)');

// 7f: logger passed to parseFourBuckets
assert(analysisSrc.includes('parseFourBuckets(parsed, { logger }'), 'logger passed to parseFourBuckets');

console.log('\n=== 8. Error cases ===');
assert(TEMPLATE.validate(null, { logger: silent }).valid === false, 'null data fails');
assert(TEMPLATE.validate('string', { logger: silent }).valid === false, 'string data fails');

console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${pass} passed, ${fail} failed out of ${pass + fail}`);
process.exit(fail > 0 ? 1 : 0);
