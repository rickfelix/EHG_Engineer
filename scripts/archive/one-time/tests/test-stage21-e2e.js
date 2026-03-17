#!/usr/bin/env node
/**
 * Stage 21 E2E Test — Integration Testing / Build Review
 * Phase: THE BUILD LOOP (Stages 17-22)
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
const mod = await import(`file:///${ROOT}/lib/eva/stage-templates/stage-21.js`.replace(/\\/g, '/'));
const TEMPLATE = mod.default;
const { INTEGRATION_STATUSES, REVIEW_DECISIONS, MIN_INTEGRATIONS } = mod;
const silent = { warn: () => {}, log: () => {}, error: () => {} };

console.log('\n=== 1. Template structure ===');
assert(TEMPLATE.id === 'stage-21', 'id = stage-21');
assert(TEMPLATE.slug === 'integration-testing', 'slug = integration-testing');
assert(TEMPLATE.version === '2.0.0', 'version = 2.0.0');
assert(TEMPLATE.schema.integrations?.type === 'array', 'integrations is array');
assert(TEMPLATE.schema.integrations?.minItems === MIN_INTEGRATIONS, `integrations minItems = ${MIN_INTEGRATIONS}`);
assert(TEMPLATE.schema.environment?.required === true, 'environment required');
assert(TEMPLATE.schema.total_integrations?.derived === true, 'total_integrations is derived');
assert(TEMPLATE.schema.passing_integrations?.derived === true, 'passing_integrations is derived');
assert(TEMPLATE.schema.failing_integrations?.derived === true, 'failing_integrations is derived');
assert(TEMPLATE.schema.pass_rate?.derived === true, 'pass_rate is derived');
assert(TEMPLATE.schema.all_passing?.derived === true, 'all_passing is derived');
assert(TEMPLATE.schema.reviewDecision?.derived === true, 'reviewDecision is derived');
assert(typeof TEMPLATE.validate === 'function', 'has validate()');
assert(typeof TEMPLATE.computeDerived === 'function', 'has computeDerived()');
assert(typeof TEMPLATE.analysisStep === 'function', 'has analysisStep()');
assert(INTEGRATION_STATUSES.length === 4, 'INTEGRATION_STATUSES has 4 entries');
assert(REVIEW_DECISIONS.length === 3, 'REVIEW_DECISIONS has 3 entries');
assert(MIN_INTEGRATIONS === 1, 'MIN_INTEGRATIONS = 1');

// OutputSchema
assert(TEMPLATE.outputSchema && typeof TEMPLATE.outputSchema === 'object', 'has outputSchema (AUDIT)');

console.log('\n=== 2. Validation — good data ===');
const goodInteg = {
  name: 'Auth API → User DB',
  source: 'Auth Service',
  target: 'User Database',
  status: 'pass',
};
const goodData = {
  integrations: [goodInteg],
  environment: 'staging',
};
const goodResult = TEMPLATE.validate(goodData, { logger: silent });
assert(goodResult.valid === true, 'good data passes validation');
assert(goodResult.errors.length === 0, 'no errors');

console.log('\n=== 3. Validation — bad data ===');
assert(TEMPLATE.validate({}, { logger: silent }).valid === false, 'empty data fails');

// Invalid status
const badStatus = { integrations: [{ ...goodInteg, status: 'INVALID' }], environment: 'staging' };
assert(TEMPLATE.validate(badStatus, { logger: silent }).valid === false, 'invalid integration status fails');

// Missing name
const noName = { integrations: [{ ...goodInteg, name: '' }], environment: 'staging' };
assert(TEMPLATE.validate(noName, { logger: silent }).valid === false, 'empty integration name fails');

// Missing source
const noSrc = { integrations: [{ ...goodInteg, source: '' }], environment: 'staging' };
assert(TEMPLATE.validate(noSrc, { logger: silent }).valid === false, 'empty source fails');

// Missing environment
const noEnv = { integrations: [goodInteg], environment: '' };
assert(TEMPLATE.validate(noEnv, { logger: silent }).valid === false, 'empty environment fails');

console.log('\n=== 4. computeDerived ===');
const derivedInput = {
  integrations: [
    { name: 'Auth', source: 'A', target: 'B', status: 'pass' },
    { name: 'Payment', source: 'C', target: 'D', status: 'fail', error_message: 'Timeout' },
    { name: 'Email', source: 'E', target: 'F', status: 'pass' },
    { name: 'Cache', source: 'G', target: 'H', status: 'skip' },
  ],
  environment: 'staging',
};
const derived = TEMPLATE.computeDerived(derivedInput, { logger: silent });
assert(derived.total_integrations === 4, 'total_integrations = 4');
assert(derived.passing_integrations === 2, 'passing_integrations = 2');
assert(derived.failing_integrations.length === 1, 'failing_integrations has 1 entry');
assert(derived.pass_rate === 50, 'pass_rate = 50');
assert(derived.all_passing === false, 'not all passing');
assert(derived.reviewDecision.decision === 'reject', 'reject (50% pass rate)');

// All passing
const allPassInput = {
  integrations: [
    { name: 'Auth', source: 'A', target: 'B', status: 'pass' },
    { name: 'DB', source: 'C', target: 'D', status: 'pass' },
  ],
  environment: 'production',
};
const allPassDerived = TEMPLATE.computeDerived(allPassInput, { logger: silent });
assert(allPassDerived.all_passing === true, 'all_passing when all pass');
assert(allPassDerived.reviewDecision.decision === 'approve', 'approve when all passing');

console.log('\n=== 5. fetchUpstreamArtifacts mock ===');
const engineSrc = readFileSync(resolve(ROOT, 'lib/eva/stage-execution-engine.js'), 'utf8');
assert(engineSrc.includes('lifecycle_stage'), 'engine queries lifecycle_stage');

console.log('\n=== 6. Execution flow ===');
assert(engineSrc.includes('hasAnalysisStep'), 'engine uses hasAnalysisStep flag');
const hasElseComputeDerived = /else\s+if\s*\(\s*typeof\s+template\.computeDerived/.test(engineSrc);
assert(hasElseComputeDerived, 'engine has else-if for computeDerived (dead code when analysisStep exists)');

console.log('\n=== 7. Audit flags ===');
const analysisSrc = readFileSync(resolve(ROOT, 'lib/eva/stage-templates/analysis-steps/stage-21-build-review.js'), 'utf8');
const templateSrc = readFileSync(resolve(ROOT, 'lib/eva/stage-templates/stage-21.js'), 'utf8');

// 7a: outputSchema
assert(templateSrc.includes('extractOutputSchema'), 'template calls extractOutputSchema (AUDIT)');
assert(templateSrc.includes('ensureOutputSchema'), 'template calls ensureOutputSchema (AUDIT)');

// 7b: DRY exception documented
assert(analysisSrc.includes('circular dependency'), 'DRY exception documented (AUDIT)');

// 7c: LLM fallback detection
assert(analysisSrc.includes('llmFallbackCount'), 'analysis step tracks llmFallbackCount (AUDIT)');

// 7d: Field casing — analysis output must use snake_case matching template schema
assert(analysisSrc.includes('total_integrations'), 'analysis uses total_integrations (snake_case, AUDIT)');
assert(analysisSrc.includes('passing_integrations'), 'analysis uses passing_integrations (snake_case, AUDIT)');
assert(analysisSrc.includes('failing_integrations'), 'analysis uses failing_integrations (snake_case, AUDIT)');
assert(analysisSrc.includes('pass_rate'), 'analysis uses pass_rate (snake_case, AUDIT)');
assert(analysisSrc.includes('all_passing'), 'analysis uses all_passing (snake_case, AUDIT)');

// 7e: Stale Stage 20 field refs (after Stage 20 fix, fields are snake_case)
assert(!analysisSrc.includes('stage20Data.overallPassRate'), 'no stale overallPassRate ref (AUDIT)');
assert(!analysisSrc.includes('stage20Data.coveragePct'), 'no stale coveragePct ref (AUDIT)');
assert(!analysisSrc.includes('stage20Data.knownDefects'), 'no stale knownDefects ref (AUDIT)');

// 7f: Environment in output
assert(analysisSrc.includes('environment:') || analysisSrc.includes("'environment'"), 'analysis outputs environment field (AUDIT)');

// 7g: logger passed to parseFourBuckets
assert(analysisSrc.includes('parseFourBuckets(parsed, { logger }'), 'logger passed to parseFourBuckets');

console.log('\n=== 8. Error cases ===');
assert(TEMPLATE.validate(null, { logger: silent }).valid === false, 'null data fails');
assert(TEMPLATE.validate('string', { logger: silent }).valid === false, 'string data fails');

console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${pass} passed, ${fail} failed out of ${pass + fail}`);
process.exit(fail > 0 ? 1 : 0);
