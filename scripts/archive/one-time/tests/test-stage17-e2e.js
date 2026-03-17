#!/usr/bin/env node
/**
 * Stage 17 E2E Test — Pre-Build Checklist
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
const mod = await import(`file:///${ROOT}/lib/eva/stage-templates/stage-17.js`.replace(/\\/g, '/'));
const TEMPLATE = mod.default;
const { CHECKLIST_CATEGORIES, ITEM_STATUSES, SEVERITY_LEVELS, BUILD_READINESS_DECISIONS, MIN_ITEMS_PER_CATEGORY } = mod;
const silent = { warn: () => {}, log: () => {}, error: () => {} };

console.log('\n=== 1. Template structure ===');
assert(TEMPLATE.id === 'stage-17', 'id = stage-17');
assert(TEMPLATE.slug === 'pre-build-checklist', 'slug = pre-build-checklist');
assert(TEMPLATE.version === '2.0.0', 'version = 2.0.0');
assert(TEMPLATE.schema.checklist?.required === true, 'checklist required');
assert(TEMPLATE.schema.total_items?.derived === true, 'total_items is derived');
assert(TEMPLATE.schema.readiness_pct?.derived === true, 'readiness_pct is derived');
assert(TEMPLATE.schema.buildReadiness?.derived === true, 'buildReadiness is derived');
assert(typeof TEMPLATE.validate === 'function', 'has validate()');
assert(typeof TEMPLATE.computeDerived === 'function', 'has computeDerived()');
assert(typeof TEMPLATE.analysisStep === 'function', 'has analysisStep()');
assert(CHECKLIST_CATEGORIES.length === 5, 'CHECKLIST_CATEGORIES has 5 entries');
assert(ITEM_STATUSES.length === 4, 'ITEM_STATUSES has 4 entries');
assert(SEVERITY_LEVELS.length === 4, 'SEVERITY_LEVELS has 4 entries');
assert(BUILD_READINESS_DECISIONS.length === 3, 'BUILD_READINESS_DECISIONS has 3 entries');

// OutputSchema
assert(TEMPLATE.outputSchema && typeof TEMPLATE.outputSchema === 'object', 'has outputSchema (AUDIT)');

console.log('\n=== 2. Validation — good data ===');
const goodItem = (name, status = 'complete') => ({ name, status, owner: 'Engineer', notes: '' });
const goodData = {
  checklist: {
    architecture: [goodItem('Arch Design')],
    team_readiness: [goodItem('Team Hired')],
    tooling: [goodItem('CI/CD Setup')],
    environment: [goodItem('Dev Env')],
    dependencies: [goodItem('Deps Audited')],
  },
  blockers: [],
};
const goodResult = TEMPLATE.validate(goodData, { logger: silent });
assert(goodResult.valid === true, 'good data passes validation');
assert(goodResult.errors.length === 0, 'no errors');

console.log('\n=== 3. Validation — bad data ===');
assert(TEMPLATE.validate({}, { logger: silent }).valid === false, 'empty data fails');

// Missing category
const missingCat = { checklist: { architecture: [goodItem('A')] }, blockers: [] };
assert(TEMPLATE.validate(missingCat, { logger: silent }).valid === false, 'missing categories fails');

// Invalid status
const badStatus = {
  checklist: Object.fromEntries(CHECKLIST_CATEGORIES.map(c => [c, [{ name: 'X', status: 'INVALID' }]])),
};
assert(TEMPLATE.validate(badStatus, { logger: silent }).valid === false, 'invalid item status fails');

// Bad blocker severity
const badBlocker = {
  ...goodData,
  blockers: [{ description: 'Block', severity: 'INVALID', mitigation: 'Fix' }],
};
assert(TEMPLATE.validate(badBlocker, { logger: silent }).valid === false, 'bad blocker severity fails');

console.log('\n=== 4. fetchUpstreamArtifacts mock ===');
const engineSrc = readFileSync(resolve(ROOT, 'lib/eva/stage-execution-engine.js'), 'utf8');
assert(engineSrc.includes('lifecycle_stage'), 'engine queries lifecycle_stage');

console.log('\n=== 5. Execution flow ===');
assert(engineSrc.includes('hasAnalysisStep'), 'engine uses hasAnalysisStep flag');
const hasElseComputeDerived = /else\s+if\s*\(\s*typeof\s+template\.computeDerived/.test(engineSrc);
assert(hasElseComputeDerived, 'engine has else-if for computeDerived (dead code when analysisStep exists)');

console.log('\n=== 6. Audit flags ===');
const analysisSrc = readFileSync(resolve(ROOT, 'lib/eva/stage-templates/analysis-steps/stage-17-build-readiness.js'), 'utf8');
const templateSrc = readFileSync(resolve(ROOT, 'lib/eva/stage-templates/stage-17.js'), 'utf8');

// 6a: outputSchema
assert(templateSrc.includes('extractOutputSchema'), 'template calls extractOutputSchema (AUDIT)');
assert(templateSrc.includes('ensureOutputSchema'), 'template calls ensureOutputSchema (AUDIT)');

// 6b: DRY exception documented
assert(analysisSrc.includes('circular dependency'), 'DRY exception documented (AUDIT)');

// 6c: LLM fallback detection
assert(analysisSrc.includes('llmFallbackCount'), 'analysis step tracks llmFallbackCount (AUDIT)');

// 6d: Field casing — analysis output must use snake_case matching template schema
assert(analysisSrc.includes('total_items'), 'analysis uses total_items (snake_case, AUDIT)');
assert(analysisSrc.includes('completed_items'), 'analysis uses completed_items (snake_case, AUDIT)');
assert(analysisSrc.includes('blocker_count'), 'analysis uses blocker_count (snake_case, AUDIT)');
assert(analysisSrc.includes('readiness_pct'), 'analysis computes readiness_pct (AUDIT)');
assert(analysisSrc.includes('all_categories_present'), 'analysis computes all_categories_present (AUDIT)');

// 6e: Analysis step outputs checklist object (not flat readinessItems)
assert(analysisSrc.includes('checklist:') || analysisSrc.includes('checklist,'), 'analysis outputs checklist object (AUDIT)');

// 6f: Stale upstream field refs — should use correct field names
assert(!analysisSrc.includes('systemType'), 'no stale systemType reference (AUDIT)');
assert(!analysisSrc.includes('teamSize'), 'no stale teamSize reference (AUDIT)');
assert(!analysisSrc.includes('totalBudget'), 'no stale totalBudget reference (AUDIT)');
assert(!analysisSrc.includes('runwayMonths'), 'no stale runwayMonths reference (AUDIT)');

// 6g: Blockers include mitigation field
assert(analysisSrc.includes('mitigation'), 'blockers include mitigation field (AUDIT)');

// 6h: logger passed to parseFourBuckets
assert(analysisSrc.includes('parseFourBuckets(parsed, { logger }'), 'logger passed to parseFourBuckets');

console.log('\n=== 7. Error cases ===');
assert(TEMPLATE.validate(null, { logger: silent }).valid === false, 'null data fails');
assert(TEMPLATE.validate('string', { logger: silent }).valid === false, 'string data fails');

console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${pass} passed, ${fail} failed out of ${pass + fail}`);
process.exit(fail > 0 ? 1 : 0);
