#!/usr/bin/env node
/**
 * Stage 25 E2E Test — Venture Review
 * Phase: LAUNCH & LEARN (Stages 23-25)
 *
 * Tests: template structure, validation, computeDerived,
 * drift detection, execution flow, audit flags.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log(`  ✅ ${msg}`); } else { fail++; console.error(`  ❌ FAIL: ${msg}`); } }

// ── Load template ──
const mod = await import(`file:///${ROOT}/lib/eva/stage-templates/stage-25.js`.replace(/\\/g, '/'));
const TEMPLATE = mod.default;
const { REVIEW_CATEGORIES, INITIATIVE_STATUSES, VENTURE_DECISIONS, CONFIDENCE_LEVELS, NEXT_STEP_PRIORITIES, SEMANTIC_DRIFT_LEVELS, HEALTH_BANDS, MIN_INITIATIVES_PER_CATEGORY, detectDrift } = mod;
const silent = { warn: () => {}, log: () => {}, error: () => {} };

console.log('\n=== 1. Template structure ===');
assert(TEMPLATE.id === 'stage-25', 'id = stage-25');
assert(TEMPLATE.slug === 'venture-review', 'slug = venture-review');
assert(TEMPLATE.version === '1.0.0', 'version = 1.0.0');
assert(TEMPLATE.schema.review_summary?.required === true, 'review_summary required');
assert(TEMPLATE.schema.initiatives?.required === true, 'initiatives required');
assert(TEMPLATE.schema.current_vision?.required === true, 'current_vision required');
assert(TEMPLATE.schema.next_steps?.type === 'array', 'next_steps is array');
assert(TEMPLATE.schema.next_steps?.minItems === 1, 'next_steps minItems = 1');
assert(TEMPLATE.schema.total_initiatives?.derived === true, 'total_initiatives is derived');
assert(TEMPLATE.schema.all_categories_reviewed?.derived === true, 'all_categories_reviewed is derived');
assert(TEMPLATE.schema.drift_detected?.derived === true, 'drift_detected is derived');
assert(TEMPLATE.schema.drift_check?.derived === true, 'drift_check is derived');
assert(TEMPLATE.schema.ventureDecision?.derived === true, 'ventureDecision is derived');
assert(typeof TEMPLATE.validate === 'function', 'has validate()');
assert(typeof TEMPLATE.computeDerived === 'function', 'has computeDerived()');
assert(typeof TEMPLATE.analysisStep === 'function', 'has analysisStep()');
assert(typeof TEMPLATE.onBeforeAnalysis === 'function', 'has onBeforeAnalysis()');
assert(typeof TEMPLATE.onComplete === 'function', 'has onComplete()');
assert(REVIEW_CATEGORIES.length === 5, 'REVIEW_CATEGORIES has 5 entries');
assert(INITIATIVE_STATUSES.length === 5, 'INITIATIVE_STATUSES has 5 entries');
assert(VENTURE_DECISIONS.length === 5, 'VENTURE_DECISIONS has 5 entries');
assert(CONFIDENCE_LEVELS.length === 3, 'CONFIDENCE_LEVELS has 3 entries');
assert(NEXT_STEP_PRIORITIES.length === 4, 'NEXT_STEP_PRIORITIES has 4 entries');
assert(SEMANTIC_DRIFT_LEVELS.length === 3, 'SEMANTIC_DRIFT_LEVELS has 3 entries');
assert(HEALTH_BANDS.length === 4, 'HEALTH_BANDS has 4 entries');
assert(MIN_INITIATIVES_PER_CATEGORY === 1, 'MIN_INITIATIVES_PER_CATEGORY = 1');
assert(typeof detectDrift === 'function', 'detectDrift is exported');

// OutputSchema
assert(TEMPLATE.outputSchema && typeof TEMPLATE.outputSchema === 'object', 'has outputSchema (AUDIT)');

console.log('\n=== 2. Validation — good data ===');
const goodData = {
  review_summary: 'Comprehensive venture review covering all major dimensions and milestones.',
  initiatives: Object.fromEntries(REVIEW_CATEGORIES.map(cat => [cat, [
    { title: `${cat} initiative`, status: 'completed', outcome: 'Successfully delivered' },
  ]])),
  current_vision: 'A comprehensive SaaS platform for enterprise resource planning.',
  next_steps: [{ action: 'Plan next iteration', owner: 'Product Lead', timeline: 'Q2 2026', priority: 'high' }],
  chairmanGate: { status: 'approved', rationale: 'Venture approved for continuation', decision_id: 'dec-001' },
};
const goodResult = TEMPLATE.validate(goodData, { logger: silent });
assert(goodResult.valid === true, 'good data passes validation');
assert(goodResult.errors.length === 0, 'no errors');

console.log('\n=== 3. Validation — bad data ===');
assert(TEMPLATE.validate({}, { logger: silent }).valid === false, 'empty data fails');

// Missing review_summary
const noSummary = { ...goodData, review_summary: '' };
assert(TEMPLATE.validate(noSummary, { logger: silent }).valid === false, 'empty review_summary fails');

// Missing initiatives
const noInit = { ...goodData, initiatives: {} };
assert(TEMPLATE.validate(noInit, { logger: silent }).valid === false, 'empty initiatives fails');

// Missing current_vision
const noVision = { ...goodData, current_vision: '' };
assert(TEMPLATE.validate(noVision, { logger: silent }).valid === false, 'empty current_vision fails');

// Empty next_steps
const noSteps = { ...goodData, next_steps: [] };
assert(TEMPLATE.validate(noSteps, { logger: silent }).valid === false, 'empty next_steps fails');

// Chairman gate pending
const pendingGate = { ...goodData, chairmanGate: { status: 'pending' } };
assert(TEMPLATE.validate(pendingGate, { logger: silent }).valid === false, 'pending chairman gate fails');

// Chairman gate rejected
const rejectedGate = { ...goodData, chairmanGate: { status: 'rejected', rationale: 'Not ready' } };
assert(TEMPLATE.validate(rejectedGate, { logger: silent }).valid === false, 'rejected chairman gate fails');

// Invalid initiative status
const badInitStatus = {
  ...goodData,
  initiatives: { ...goodData.initiatives, product: [{ title: 'x', status: 'INVALID', outcome: 'y' }] },
};
assert(TEMPLATE.validate(badInitStatus, { logger: silent }).valid === false, 'invalid initiative status fails');

console.log('\n=== 4. computeDerived ===');
const derived = TEMPLATE.computeDerived(goodData, null, { logger: silent });
assert(derived.total_initiatives === 5, 'total_initiatives = 5');
assert(derived.all_categories_reviewed === true, 'all categories reviewed');
assert(derived.drift_detected === false, 'no drift without Stage 1 data');
assert(derived.drift_check !== null, 'drift_check present');
assert(derived.ventureDecision !== null, 'ventureDecision present');
assert(derived.ventureDecision.decision === 'continue', 'decision = continue (all reviewed, no drift)');

// With Stage 1 data — aligned vision
const stage01Aligned = { venture_name: 'SaaS Platform', elevator_pitch: 'comprehensive enterprise resource planning solution' };
const derivedAligned = TEMPLATE.computeDerived(goodData, { stage01: stage01Aligned }, { logger: silent });
assert(derivedAligned.drift_detected === false, 'no drift with aligned vision');

// With Stage 1 data — drifted vision
const stage01Drifted = { venture_name: 'Crypto Exchange', elevator_pitch: 'decentralized blockchain trading marketplace' };
const derivedDrifted = TEMPLATE.computeDerived(goodData, { stage01: stage01Drifted }, { logger: silent });
assert(derivedDrifted.drift_detected === true, 'drift detected with different vision');
assert(derivedDrifted.ventureDecision.decision === 'pivot', 'pivot recommended on drift');

console.log('\n=== 5. detectDrift ===');
// No original vision
const noDrift = detectDrift({ original_vision: null, current_vision: 'SaaS platform' });
assert(noDrift.drift_detected === false, 'no drift without original');

// Aligned visions
const aligned = detectDrift({
  original_vision: 'Build a comprehensive SaaS platform for enterprise resource planning',
  current_vision: 'A comprehensive SaaS platform for enterprise resource planning',
});
assert(aligned.drift_detected === false, 'aligned visions → no drift');

// Drifted visions
const drifted = detectDrift({
  original_vision: 'Build a comprehensive SaaS platform for enterprise resource planning',
  current_vision: 'Decentralized blockchain cryptocurrency trading marketplace exchange',
});
assert(drifted.drift_detected === true, 'completely different visions → drift');

console.log('\n=== 6. fetchUpstreamArtifacts mock ===');
const engineSrc = readFileSync(resolve(ROOT, 'lib/eva/stage-execution-engine.js'), 'utf8');
assert(engineSrc.includes('lifecycle_stage'), 'engine queries lifecycle_stage');

console.log('\n=== 7. Execution flow ===');
assert(engineSrc.includes('hasAnalysisStep'), 'engine uses hasAnalysisStep flag');
const hasElseComputeDerived = /else\s+if\s*\(\s*typeof\s+template\.computeDerived/.test(engineSrc);
assert(hasElseComputeDerived, 'engine has else-if for computeDerived (dead code when analysisStep exists)');

console.log('\n=== 8. Audit flags ===');
const analysisSrc = readFileSync(resolve(ROOT, 'lib/eva/stage-templates/analysis-steps/stage-25-venture-review.js'), 'utf8');
const templateSrc = readFileSync(resolve(ROOT, 'lib/eva/stage-templates/stage-25.js'), 'utf8');

// 8a: outputSchema
assert(templateSrc.includes('extractOutputSchema'), 'template calls extractOutputSchema (AUDIT)');
assert(templateSrc.includes('ensureOutputSchema'), 'template calls ensureOutputSchema (AUDIT)');

// 8b: DRY exception documented
assert(analysisSrc.includes('circular dependency'), 'DRY exception documented (AUDIT)');

// 8c: LLM fallback detection
assert(analysisSrc.includes('llmFallbackCount'), 'analysis step tracks llmFallbackCount (AUDIT)');

// 8d: Field casing — analysis output uses snake_case for template schema
assert(analysisSrc.includes('total_initiatives'), 'analysis uses total_initiatives (snake_case, AUDIT)');
assert(analysisSrc.includes('all_categories_reviewed'), 'analysis uses all_categories_reviewed (snake_case, AUDIT)');
assert(analysisSrc.includes('review_summary'), 'analysis returns review_summary (AUDIT)');
assert(analysisSrc.includes('current_vision'), 'analysis returns current_vision (AUDIT)');
assert(analysisSrc.includes('next_steps'), 'analysis returns next_steps (AUDIT)');
assert(analysisSrc.includes('drift_detected'), 'analysis returns drift_detected (AUDIT)');
assert(analysisSrc.includes('drift_check'), 'analysis returns drift_check (AUDIT)');

// 8e: Stale Stage 23 field refs (after Stage 23 fix, launch_tasks is snake_case)
assert(!analysisSrc.includes('stage23Data.totalTasks'), 'no stale totalTasks ref (AUDIT)');
assert(analysisSrc.includes('stage23Data.launch_tasks'), 'uses correct launch_tasks ref (AUDIT)');

// 8f: detectDrift imported and called from analysis step
assert(analysisSrc.includes('detectDrift'), 'analysis step imports detectDrift (AUDIT)');

// 8g: logger passed to parseFourBuckets
assert(analysisSrc.includes('parseFourBuckets(parsed, { logger }'), 'logger passed to parseFourBuckets');

console.log('\n=== 9. Error cases ===');
assert(TEMPLATE.validate(null, { logger: silent }).valid === false, 'null data fails');
assert(TEMPLATE.validate('string', { logger: silent }).valid === false, 'string data fails');

console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${pass} passed, ${fail} failed out of ${pass + fail}`);
process.exit(fail > 0 ? 1 : 0);
