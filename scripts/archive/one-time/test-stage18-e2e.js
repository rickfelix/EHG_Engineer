#!/usr/bin/env node
/**
 * Stage 18 E2E Test — Sprint Planning
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
const mod = await import(`file:///${ROOT}/lib/eva/stage-templates/stage-18.js`.replace(/\\/g, '/'));
const TEMPLATE = mod.default;
const { PRIORITY_VALUES, SD_TYPES, MIN_SPRINT_ITEMS, SD_BRIDGE_REQUIRED_FIELDS } = mod;
const silent = { warn: () => {}, log: () => {}, error: () => {} };

console.log('\n=== 1. Template structure ===');
assert(TEMPLATE.id === 'stage-18', 'id = stage-18');
assert(TEMPLATE.slug === 'sprint-planning', 'slug = sprint-planning');
assert(TEMPLATE.version === '2.0.0', 'version = 2.0.0');
assert(TEMPLATE.schema.sprint_name?.required === true, 'sprint_name required');
assert(TEMPLATE.schema.sprint_duration_days?.required === true, 'sprint_duration_days required');
assert(TEMPLATE.schema.sprint_goal?.required === true, 'sprint_goal required');
assert(TEMPLATE.schema.items?.minItems === MIN_SPRINT_ITEMS, `items minItems = ${MIN_SPRINT_ITEMS}`);
assert(TEMPLATE.schema.total_items?.derived === true, 'total_items is derived');
assert(TEMPLATE.schema.sd_bridge_payloads?.derived === true, 'sd_bridge_payloads is derived');
assert(typeof TEMPLATE.validate === 'function', 'has validate()');
assert(typeof TEMPLATE.computeDerived === 'function', 'has computeDerived()');
assert(typeof TEMPLATE.analysisStep === 'function', 'has analysisStep()');
assert(PRIORITY_VALUES.length === 4, 'PRIORITY_VALUES has 4 entries');
assert(SD_TYPES.length === 5, 'SD_TYPES has 5 entries');
assert(SD_BRIDGE_REQUIRED_FIELDS.length === 9, 'SD_BRIDGE_REQUIRED_FIELDS has 9 entries');

// OutputSchema
assert(TEMPLATE.outputSchema && typeof TEMPLATE.outputSchema === 'object', 'has outputSchema (AUDIT)');

console.log('\n=== 2. Validation — good data ===');
const goodItem = {
  title: 'Build Auth Module',
  description: 'Implement JWT authentication',
  priority: 'high',
  type: 'feature',
  scope: 'Backend authentication layer',
  success_criteria: 'Users can login/register',
  dependencies: [],
  risks: ['Token expiry handling'],
  target_application: 'ehg',
  story_points: 5,
  architectureLayer: 'backend',
  milestoneRef: 'MVP',
};
const goodData = {
  sprint_name: 'Sprint 1',
  sprint_duration_days: 14,
  sprint_goal: 'Complete core authentication and user management',
  items: [goodItem],
};
const goodResult = TEMPLATE.validate(goodData, { logger: silent });
assert(goodResult.valid === true, 'good data passes validation');
assert(goodResult.errors.length === 0, 'no errors');

console.log('\n=== 3. Validation — bad data ===');
assert(TEMPLATE.validate({}, { logger: silent }).valid === false, 'empty data fails');

// Too long sprint
const longSprint = { ...goodData, sprint_duration_days: 60 };
assert(TEMPLATE.validate(longSprint, { logger: silent }).valid === false, 'too long sprint fails');

// Short goal
const shortGoal = { ...goodData, sprint_goal: 'Short' };
assert(TEMPLATE.validate(shortGoal, { logger: silent }).valid === false, 'short goal fails');

// Invalid priority
const badPri = { ...goodData, items: [{ ...goodItem, priority: 'INVALID' }] };
assert(TEMPLATE.validate(badPri, { logger: silent }).valid === false, 'invalid priority fails');

// Invalid type
const badType = { ...goodData, items: [{ ...goodItem, type: 'INVALID' }] };
assert(TEMPLATE.validate(badType, { logger: silent }).valid === false, 'invalid type fails');

// Missing scope
const noScope = { ...goodData, items: [{ ...goodItem, scope: '' }] };
assert(TEMPLATE.validate(noScope, { logger: silent }).valid === false, 'empty scope fails');

console.log('\n=== 4. fetchUpstreamArtifacts mock ===');
const engineSrc = readFileSync(resolve(ROOT, 'lib/eva/stage-execution-engine.js'), 'utf8');
assert(engineSrc.includes('lifecycle_stage'), 'engine queries lifecycle_stage');

console.log('\n=== 5. Execution flow ===');
assert(engineSrc.includes('hasAnalysisStep'), 'engine uses hasAnalysisStep flag');
const hasElseComputeDerived = /else\s+if\s*\(\s*typeof\s+template\.computeDerived/.test(engineSrc);
assert(hasElseComputeDerived, 'engine has else-if for computeDerived (dead code when analysisStep exists)');

console.log('\n=== 6. Audit flags ===');
const analysisSrc = readFileSync(resolve(ROOT, 'lib/eva/stage-templates/analysis-steps/stage-18-sprint-planning.js'), 'utf8');
const templateSrc = readFileSync(resolve(ROOT, 'lib/eva/stage-templates/stage-18.js'), 'utf8');

// 6a: outputSchema
assert(templateSrc.includes('extractOutputSchema'), 'template calls extractOutputSchema (AUDIT)');
assert(templateSrc.includes('ensureOutputSchema'), 'template calls ensureOutputSchema (AUDIT)');

// 6b: DRY exception documented
assert(analysisSrc.includes('circular dependency'), 'DRY exception documented (AUDIT)');

// 6c: LLM fallback detection
assert(analysisSrc.includes('llmFallbackCount'), 'analysis step tracks llmFallbackCount (AUDIT)');

// 6d: Field casing — analysis output must use snake_case matching template schema
assert(analysisSrc.includes('sprint_name'), 'analysis uses sprint_name (AUDIT)');
assert(analysisSrc.includes('sprint_goal'), 'analysis uses sprint_goal (AUDIT)');
assert(analysisSrc.includes('sprint_duration_days'), 'analysis uses sprint_duration_days (AUDIT)');
assert(analysisSrc.includes('total_items'), 'analysis uses total_items (snake_case, AUDIT)');
assert(analysisSrc.includes('total_story_points'), 'analysis uses total_story_points (AUDIT)');
assert(analysisSrc.includes('sd_bridge_payloads'), 'analysis generates sd_bridge_payloads (AUDIT)');

// 6e: Items have template-required fields
assert(analysisSrc.includes('target_application'), 'items include target_application (AUDIT)');
assert(analysisSrc.includes('success_criteria'), 'items include success_criteria (AUDIT)');

// 6f: Stale upstream field refs
assert(!analysisSrc.includes('stage14Data.components'), 'no stale stage14 components reference (AUDIT)');

// 6g: logger passed to parseFourBuckets
assert(analysisSrc.includes('parseFourBuckets(parsed, { logger }'), 'logger passed to parseFourBuckets');

console.log('\n=== 7. Error cases ===');
assert(TEMPLATE.validate(null, { logger: silent }).valid === false, 'null data fails');
assert(TEMPLATE.validate('string', { logger: silent }).valid === false, 'string data fails');

console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${pass} passed, ${fail} failed out of ${pass + fail}`);
process.exit(fail > 0 ? 1 : 0);
