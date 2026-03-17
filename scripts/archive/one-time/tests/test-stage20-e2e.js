#!/usr/bin/env node
/**
 * Stage 20 E2E Test — Quality Assurance
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
const mod = await import(`file:///${ROOT}/lib/eva/stage-templates/stage-20.js`.replace(/\\/g, '/'));
const TEMPLATE = mod.default;
const { DEFECT_SEVERITIES, DEFECT_STATUSES, MIN_TEST_SUITES, MIN_COVERAGE_PCT, TEST_SUITE_TYPES, QUALITY_DECISIONS } = mod;
const silent = { warn: () => {}, log: () => {}, error: () => {} };

console.log('\n=== 1. Template structure ===');
assert(TEMPLATE.id === 'stage-20', 'id = stage-20');
assert(TEMPLATE.slug === 'quality-assurance', 'slug = quality-assurance');
assert(TEMPLATE.version === '2.0.0', 'version = 2.0.0');
assert(TEMPLATE.schema.test_suites?.type === 'array', 'test_suites is array');
assert(TEMPLATE.schema.test_suites?.minItems === MIN_TEST_SUITES, `test_suites minItems = ${MIN_TEST_SUITES}`);
assert(TEMPLATE.schema.known_defects?.type === 'array', 'known_defects is array');
assert(TEMPLATE.schema.overall_pass_rate?.derived === true, 'overall_pass_rate is derived');
assert(TEMPLATE.schema.coverage_pct?.derived === true, 'coverage_pct is derived');
assert(TEMPLATE.schema.total_tests?.derived === true, 'total_tests is derived');
assert(TEMPLATE.schema.total_passing?.derived === true, 'total_passing is derived');
assert(TEMPLATE.schema.quality_gate_passed?.derived === true, 'quality_gate_passed is derived');
assert(TEMPLATE.schema.qualityDecision?.derived === true, 'qualityDecision is derived');
assert(typeof TEMPLATE.validate === 'function', 'has validate()');
assert(typeof TEMPLATE.computeDerived === 'function', 'has computeDerived()');
assert(typeof TEMPLATE.analysisStep === 'function', 'has analysisStep()');
assert(DEFECT_SEVERITIES.length === 4, 'DEFECT_SEVERITIES has 4 entries');
assert(DEFECT_STATUSES.length === 5, 'DEFECT_STATUSES has 5 entries');
assert(TEST_SUITE_TYPES.length === 3, 'TEST_SUITE_TYPES has 3 entries');
assert(QUALITY_DECISIONS.length === 3, 'QUALITY_DECISIONS has 3 entries');
assert(MIN_TEST_SUITES === 1, 'MIN_TEST_SUITES = 1');
assert(MIN_COVERAGE_PCT === 60, 'MIN_COVERAGE_PCT = 60');

// OutputSchema
assert(TEMPLATE.outputSchema && typeof TEMPLATE.outputSchema === 'object', 'has outputSchema (AUDIT)');

console.log('\n=== 2. Validation — good data ===');
const goodSuite = {
  name: 'Auth Unit Tests',
  type: 'unit',
  total_tests: 50,
  passing_tests: 48,
  coverage_pct: 85,
};
const goodData = {
  test_suites: [goodSuite],
  known_defects: [
    { description: 'Token refresh race condition', severity: 'medium', status: 'open' },
  ],
};
const goodResult = TEMPLATE.validate(goodData, { logger: silent });
assert(goodResult.valid === true, 'good data passes validation');
assert(goodResult.errors.length === 0, 'no errors');

console.log('\n=== 3. Validation — bad data ===');
assert(TEMPLATE.validate({}, { logger: silent }).valid === false, 'empty data fails');

// Invalid suite type
const badType = { test_suites: [{ ...goodSuite, type: 'INVALID' }] };
assert(TEMPLATE.validate(badType, { logger: silent }).valid === false, 'invalid suite type fails');

// Missing suite name
const noName = { test_suites: [{ ...goodSuite, name: '' }] };
assert(TEMPLATE.validate(noName, { logger: silent }).valid === false, 'empty suite name fails');

// passing > total
const overPass = { test_suites: [{ ...goodSuite, passing_tests: 100, total_tests: 50 }] };
assert(TEMPLATE.validate(overPass, { logger: silent }).valid === false, 'passing > total fails');

// Invalid defect severity
const badSev = { test_suites: [goodSuite], known_defects: [{ description: 'Bug', severity: 'INVALID', status: 'open' }] };
assert(TEMPLATE.validate(badSev, { logger: silent }).valid === false, 'invalid defect severity fails');

// Invalid defect status
const badDefStatus = { test_suites: [goodSuite], known_defects: [{ description: 'Bug', severity: 'high', status: 'INVALID' }] };
assert(TEMPLATE.validate(badDefStatus, { logger: silent }).valid === false, 'invalid defect status fails');

console.log('\n=== 4. computeDerived ===');
const derivedInput = {
  test_suites: [
    { name: 'Unit', type: 'unit', total_tests: 100, passing_tests: 95, coverage_pct: 80 },
    { name: 'E2E', type: 'e2e', total_tests: 20, passing_tests: 18, coverage_pct: 60 },
  ],
  known_defects: [],
};
const derived = TEMPLATE.computeDerived(derivedInput, { logger: silent });
assert(derived.total_tests === 120, 'total_tests = 120');
assert(derived.total_passing === 113, 'total_passing = 113');
assert(derived.overall_pass_rate === 94.17, 'overall_pass_rate = 94.17');
assert(derived.coverage_pct === 70, 'coverage_pct = 70 (avg)');
assert(derived.quality_gate_passed === false, 'quality_gate not passed (not 100% pass rate)');
assert(derived.qualityDecision.decision === 'conditional_pass', 'conditional_pass (high pass rate, ok coverage)');

// Perfect pass
const perfectInput = {
  test_suites: [
    { name: 'Unit', type: 'unit', total_tests: 100, passing_tests: 100, coverage_pct: 90 },
  ],
  known_defects: [],
};
const perfectDerived = TEMPLATE.computeDerived(perfectInput, { logger: silent });
assert(perfectDerived.quality_gate_passed === true, 'quality_gate passed (100% pass, 90% coverage)');
assert(perfectDerived.qualityDecision.decision === 'pass', 'decision = pass');

console.log('\n=== 5. fetchUpstreamArtifacts mock ===');
const engineSrc = readFileSync(resolve(ROOT, 'lib/eva/stage-execution-engine.js'), 'utf8');
assert(engineSrc.includes('lifecycle_stage'), 'engine queries lifecycle_stage');

console.log('\n=== 6. Execution flow ===');
assert(engineSrc.includes('hasAnalysisStep'), 'engine uses hasAnalysisStep flag');
const hasElseComputeDerived = /else\s+if\s*\(\s*typeof\s+template\.computeDerived/.test(engineSrc);
assert(hasElseComputeDerived, 'engine has else-if for computeDerived (dead code when analysisStep exists)');

console.log('\n=== 7. Audit flags ===');
const analysisSrc = readFileSync(resolve(ROOT, 'lib/eva/stage-templates/analysis-steps/stage-20-quality-assurance.js'), 'utf8');
const templateSrc = readFileSync(resolve(ROOT, 'lib/eva/stage-templates/stage-20.js'), 'utf8');

// 7a: outputSchema
assert(templateSrc.includes('extractOutputSchema'), 'template calls extractOutputSchema (AUDIT)');
assert(templateSrc.includes('ensureOutputSchema'), 'template calls ensureOutputSchema (AUDIT)');

// 7b: DRY exception documented
assert(analysisSrc.includes('circular dependency'), 'DRY exception documented (AUDIT)');

// 7c: LLM fallback detection
assert(analysisSrc.includes('llmFallbackCount'), 'analysis step tracks llmFallbackCount (AUDIT)');

// 7d: Field casing — analysis output must use snake_case matching template schema
assert(analysisSrc.includes('test_suites'), 'analysis uses test_suites (snake_case, AUDIT)');
assert(analysisSrc.includes('known_defects'), 'analysis uses known_defects (snake_case, AUDIT)');
assert(analysisSrc.includes('overall_pass_rate'), 'analysis uses overall_pass_rate (snake_case, AUDIT)');
assert(analysisSrc.includes('total_tests'), 'analysis uses total_tests (snake_case, AUDIT)');
assert(analysisSrc.includes('total_passing'), 'analysis uses total_passing (snake_case, AUDIT)');
assert(analysisSrc.includes('quality_gate_passed'), 'analysis computes quality_gate_passed (AUDIT)');

// 7e: Stale Stage 19 field refs (after Stage 19 fix, fields are snake_case)
assert(!analysisSrc.includes('stage19Data.totalTasks'), 'no stale totalTasks ref (AUDIT)');
assert(!analysisSrc.includes('stage19Data.completedTasks'), 'no stale completedTasks ref (AUDIT)');
assert(!analysisSrc.includes('stage19Data.blockedTasks'), 'no stale blockedTasks ref (AUDIT)');

// 7f: Stale Stage 18 field refs
assert(!analysisSrc.includes('stage18Data.sprintGoal'), 'no stale sprintGoal ref (AUDIT)');

// 7g: logger passed to parseFourBuckets
assert(analysisSrc.includes('parseFourBuckets(parsed, { logger }'), 'logger passed to parseFourBuckets');

console.log('\n=== 8. Error cases ===');
assert(TEMPLATE.validate(null, { logger: silent }).valid === false, 'null data fails');
assert(TEMPLATE.validate('string', { logger: silent }).valid === false, 'string data fails');

console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${pass} passed, ${fail} failed out of ${pass + fail}`);
process.exit(fail > 0 ? 1 : 0);
