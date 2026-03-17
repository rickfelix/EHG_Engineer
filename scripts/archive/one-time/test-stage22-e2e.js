#!/usr/bin/env node
/**
 * Stage 22 E2E Test — Release Readiness
 * Phase: THE BUILD LOOP (Stages 17-22)
 *
 * Tests: template structure, validation, computeDerived,
 * execution flow, audit flags, promotion gate.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log(`  ✅ ${msg}`); } else { fail++; console.error(`  ❌ FAIL: ${msg}`); } }

// ── Load template ──
const mod = await import(`file:///${ROOT}/lib/eva/stage-templates/stage-22.js`.replace(/\\/g, '/'));
const TEMPLATE = mod.default;
const { APPROVAL_STATUSES, RELEASE_CATEGORIES, RELEASE_DECISIONS, MIN_RELEASE_ITEMS, MIN_READINESS_PCT, MIN_BUILD_COMPLETION_PCT, evaluatePromotionGate } = mod;
const silent = { warn: () => {}, log: () => {}, error: () => {} };

console.log('\n=== 1. Template structure ===');
assert(TEMPLATE.id === 'stage-22', 'id = stage-22');
assert(TEMPLATE.slug === 'release-readiness', 'slug = release-readiness');
assert(TEMPLATE.version === '2.0.0', 'version = 2.0.0');
assert(TEMPLATE.schema.release_items?.type === 'array', 'release_items is array');
assert(TEMPLATE.schema.release_items?.minItems === MIN_RELEASE_ITEMS, `release_items minItems = ${MIN_RELEASE_ITEMS}`);
assert(TEMPLATE.schema.release_notes?.required === true, 'release_notes required');
assert(TEMPLATE.schema.target_date?.required === true, 'target_date required');
assert(TEMPLATE.schema.total_items?.derived === true, 'total_items is derived');
assert(TEMPLATE.schema.approved_items?.derived === true, 'approved_items is derived');
assert(TEMPLATE.schema.all_approved?.derived === true, 'all_approved is derived');
assert(TEMPLATE.schema.releaseDecision?.derived === true, 'releaseDecision is derived');
assert(TEMPLATE.schema.promotion_gate?.derived === true, 'promotion_gate is derived');
assert(typeof TEMPLATE.validate === 'function', 'has validate()');
assert(typeof TEMPLATE.computeDerived === 'function', 'has computeDerived()');
assert(typeof TEMPLATE.analysisStep === 'function', 'has analysisStep()');
assert(typeof TEMPLATE.onBeforeAnalysis === 'function', 'has onBeforeAnalysis()');
assert(APPROVAL_STATUSES.length === 3, 'APPROVAL_STATUSES has 3 entries');
assert(RELEASE_CATEGORIES.length === 7, 'RELEASE_CATEGORIES has 7 entries');
assert(RELEASE_DECISIONS.length === 3, 'RELEASE_DECISIONS has 3 entries');
assert(MIN_RELEASE_ITEMS === 1, 'MIN_RELEASE_ITEMS = 1');
assert(typeof evaluatePromotionGate === 'function', 'evaluatePromotionGate is exported');

// OutputSchema
assert(TEMPLATE.outputSchema && typeof TEMPLATE.outputSchema === 'object', 'has outputSchema (AUDIT)');

console.log('\n=== 2. Validation — good data ===');
const goodItem = {
  name: 'Auth Module v2',
  category: 'feature',
  status: 'approved',
  approver: 'Product Owner',
};
const goodData = {
  release_items: [goodItem],
  release_notes: 'Release includes auth module v2 with OAuth support.',
  target_date: '2026-03-15',
  chairmanGate: { status: 'approved', rationale: 'Release approved', decision_id: 'dec-001' },
};
const goodResult = TEMPLATE.validate(goodData, { logger: silent });
assert(goodResult.valid === true, 'good data passes validation');
assert(goodResult.errors.length === 0, 'no errors');

console.log('\n=== 3. Validation — bad data ===');
assert(TEMPLATE.validate({}, { logger: silent }).valid === false, 'empty data fails');

// Missing release_notes
const noNotes = { ...goodData, release_notes: '' };
assert(TEMPLATE.validate(noNotes, { logger: silent }).valid === false, 'empty release_notes fails');

// Missing target_date
const noDate = { ...goodData, target_date: '' };
assert(TEMPLATE.validate(noDate, { logger: silent }).valid === false, 'empty target_date fails');

// Invalid category
const badCat = { ...goodData, release_items: [{ ...goodItem, category: 'INVALID' }] };
assert(TEMPLATE.validate(badCat, { logger: silent }).valid === false, 'invalid category fails');

// Invalid status
const badStatus = { ...goodData, release_items: [{ ...goodItem, status: 'INVALID' }] };
assert(TEMPLATE.validate(badStatus, { logger: silent }).valid === false, 'invalid item status fails');

// Chairman gate pending
const pendingGate = { ...goodData, chairmanGate: { status: 'pending' } };
assert(TEMPLATE.validate(pendingGate, { logger: silent }).valid === false, 'pending chairman gate fails');

// Chairman gate rejected
const rejectedGate = { ...goodData, chairmanGate: { status: 'rejected', rationale: 'Not ready' } };
assert(TEMPLATE.validate(rejectedGate, { logger: silent }).valid === false, 'rejected chairman gate fails');

console.log('\n=== 4. computeDerived ===');
const derivedInput = {
  release_items: [
    { name: 'Auth', category: 'feature', status: 'approved', approver: 'PO' },
    { name: 'Bugfix', category: 'bugfix', status: 'pending', approver: 'QA' },
    { name: 'Docs', category: 'documentation', status: 'approved', approver: 'TW' },
  ],
  release_notes: 'Sprint 1 release',
  target_date: '2026-03-15',
};
const derived = TEMPLATE.computeDerived(derivedInput, null, { logger: silent });
assert(derived.total_items === 3, 'total_items = 3');
assert(derived.approved_items === 2, 'approved_items = 2');
assert(derived.all_approved === false, 'not all_approved');
assert(derived.releaseDecision.decision === 'hold', 'hold (some approved)');
assert(derived.promotion_gate.pass === false, 'promotion_gate fails without prerequisites');

// All approved
const allApprovedInput = {
  release_items: [
    { name: 'Auth', category: 'feature', status: 'approved', approver: 'PO' },
    { name: 'Docs', category: 'documentation', status: 'approved', approver: 'TW' },
  ],
  release_notes: 'Sprint 1 release',
  target_date: '2026-03-15',
};
const allApprovedDerived = TEMPLATE.computeDerived(allApprovedInput, null, { logger: silent });
assert(allApprovedDerived.all_approved === true, 'all_approved when all approved');
assert(allApprovedDerived.releaseDecision.decision === 'release', 'release when all approved');

console.log('\n=== 5. Promotion Gate ===');
// All passing prerequisites
const fullPrereqs = {
  stage17: { buildReadiness: { decision: 'go', rationale: 'Ready' } },
  stage18: { items: [{ title: 'Item 1' }] },
  stage19: { sprintCompletion: { decision: 'complete', rationale: 'Done' } },
  stage20: { qualityDecision: { decision: 'pass', rationale: 'All tests pass' } },
  stage21: { reviewDecision: { decision: 'approve', rationale: 'All passing' } },
  stage22: { releaseDecision: { decision: 'release' }, release_items: [{ status: 'approved' }] },
};
const gatePass = evaluatePromotionGate(fullPrereqs);
assert(gatePass.pass === true, 'promotion gate passes with all good prereqs');
assert(gatePass.blockers.length === 0, 'no blockers');

// Failing prerequisites — QA fail
const failPrereqs = {
  ...fullPrereqs,
  stage20: { qualityDecision: { decision: 'fail', rationale: 'Tests failing' } },
};
const gateFail = evaluatePromotionGate(failPrereqs);
assert(gateFail.pass === false, 'promotion gate fails with QA failure');
assert(gateFail.blockers.some(b => b.includes('Quality gate')), 'QA blocker present');

// Warnings — conditional review
const warnPrereqs = {
  ...fullPrereqs,
  stage21: { reviewDecision: { decision: 'conditional', rationale: 'Minor issues' } },
};
const gateWarn = evaluatePromotionGate(warnPrereqs);
assert(gateWarn.pass === true, 'promotion gate passes with warnings');
assert(gateWarn.warnings.length > 0, 'has warnings for conditional review');

console.log('\n=== 6. fetchUpstreamArtifacts mock ===');
const engineSrc = readFileSync(resolve(ROOT, 'lib/eva/stage-execution-engine.js'), 'utf8');
assert(engineSrc.includes('lifecycle_stage'), 'engine queries lifecycle_stage');

console.log('\n=== 7. Execution flow ===');
assert(engineSrc.includes('hasAnalysisStep'), 'engine uses hasAnalysisStep flag');
const hasElseComputeDerived = /else\s+if\s*\(\s*typeof\s+template\.computeDerived/.test(engineSrc);
assert(hasElseComputeDerived, 'engine has else-if for computeDerived (dead code when analysisStep exists)');

console.log('\n=== 8. Audit flags ===');
const analysisSrc = readFileSync(resolve(ROOT, 'lib/eva/stage-templates/analysis-steps/stage-22-release-readiness.js'), 'utf8');
const templateSrc = readFileSync(resolve(ROOT, 'lib/eva/stage-templates/stage-22.js'), 'utf8');

// 8a: outputSchema
assert(templateSrc.includes('extractOutputSchema'), 'template calls extractOutputSchema (AUDIT)');
assert(templateSrc.includes('ensureOutputSchema'), 'template calls ensureOutputSchema (AUDIT)');

// 8b: DRY exception documented
assert(analysisSrc.includes('circular dependency'), 'DRY exception documented (AUDIT)');

// 8c: LLM fallback detection
assert(analysisSrc.includes('llmFallbackCount'), 'analysis step tracks llmFallbackCount (AUDIT)');

// 8d: Field casing — analysis output must use snake_case matching template schema
assert(analysisSrc.includes('release_items'), 'analysis uses release_items (snake_case, AUDIT)');
assert(analysisSrc.includes('release_notes'), 'analysis uses release_notes (snake_case, AUDIT)');
assert(analysisSrc.includes('target_date'), 'analysis uses target_date (snake_case, AUDIT)');
assert(analysisSrc.includes('total_items'), 'analysis uses total_items (snake_case, AUDIT)');
assert(analysisSrc.includes('approved_items'), 'analysis uses approved_items (snake_case, AUDIT)');
assert(analysisSrc.includes('all_approved'), 'analysis uses all_approved (snake_case, AUDIT)');

// 8e: Stale Stage 20 field refs (after Stage 20 fix, fields are snake_case)
assert(!analysisSrc.includes('stage20Data.overallPassRate'), 'no stale overallPassRate ref (AUDIT)');
assert(!analysisSrc.includes('stage20Data.coveragePct'), 'no stale coveragePct ref (AUDIT)');

// 8f: Stale Stage 21 field refs (after Stage 21 fix, fields are snake_case)
assert(!analysisSrc.includes('stage21Data.passingIntegrations'), 'no stale passingIntegrations ref (AUDIT)');
assert(!analysisSrc.includes('stage21Data.totalIntegrations'), 'no stale totalIntegrations ref (AUDIT)');

// 8g: Stale Stage 18 field refs (after Stage 18 fix, fields are snake_case)
assert(!analysisSrc.includes('stage18Data.sprintGoal'), 'no stale sprintGoal ref (AUDIT)');
assert(!analysisSrc.includes('stage18Data.totalItems'), 'no stale totalItems ref (AUDIT)');

// 8h: Stale Stage 19 field refs (after Stage 19 fix, fields are snake_case)
assert(!analysisSrc.includes('stage19Data.completedTasks'), 'no stale completedTasks ref (AUDIT)');
assert(!analysisSrc.includes('stage19Data.totalTasks'), 'no stale totalTasks ref (AUDIT)');
assert(!analysisSrc.includes('stage19Data.openIssues'), 'no stale openIssues ref (AUDIT)');

// 8i: Promotion gate imported and called from analysis step
assert(analysisSrc.includes('evaluatePromotionGate'), 'analysis step imports evaluatePromotionGate (AUDIT)');
assert(analysisSrc.includes('promotion_gate'), 'analysis step returns promotion_gate (AUDIT)');

// 8j: logger passed to parseFourBuckets
assert(analysisSrc.includes('parseFourBuckets(parsed, { logger }'), 'logger passed to parseFourBuckets');

console.log('\n=== 9. Error cases ===');
assert(TEMPLATE.validate(null, { logger: silent }).valid === false, 'null data fails');
assert(TEMPLATE.validate('string', { logger: silent }).valid === false, 'string data fails');

console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${pass} passed, ${fail} failed out of ${pass + fail}`);
process.exit(fail > 0 ? 1 : 0);
