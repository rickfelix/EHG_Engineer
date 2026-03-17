#!/usr/bin/env node
/**
 * Stage 23 E2E Test — Launch Execution
 * Phase: LAUNCH & LEARN (Stages 23-25)
 *
 * Tests: template structure, validation, computeDerived,
 * kill gate, execution flow, audit flags.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log(`  ✅ ${msg}`); } else { fail++; console.error(`  ❌ FAIL: ${msg}`); } }

// ── Load template ──
const mod = await import(`file:///${ROOT}/lib/eva/stage-templates/stage-23.js`.replace(/\\/g, '/'));
const TEMPLATE = mod.default;
const { GO_DECISIONS, LAUNCH_TYPES, MIN_LAUNCH_TASKS, evaluateKillGate } = mod;
const silent = { warn: () => {}, log: () => {}, error: () => {} };

console.log('\n=== 1. Template structure ===');
assert(TEMPLATE.id === 'stage-23', 'id = stage-23');
assert(TEMPLATE.slug === 'launch-execution', 'slug = launch-execution');
assert(TEMPLATE.version === '1.0.0', 'version = 1.0.0');
assert(TEMPLATE.schema.go_decision?.required === true, 'go_decision required');
assert(TEMPLATE.schema.incident_response_plan?.required === true, 'incident_response_plan required');
assert(TEMPLATE.schema.monitoring_setup?.required === true, 'monitoring_setup required');
assert(TEMPLATE.schema.rollback_plan?.required === true, 'rollback_plan required');
assert(TEMPLATE.schema.launch_tasks?.type === 'array', 'launch_tasks is array');
assert(TEMPLATE.schema.launch_tasks?.minItems === MIN_LAUNCH_TASKS, `launch_tasks minItems = ${MIN_LAUNCH_TASKS}`);
assert(TEMPLATE.schema.launch_date?.required === true, 'launch_date required');
assert(TEMPLATE.schema.decision?.derived === true, 'decision is derived');
assert(TEMPLATE.schema.blockProgression?.derived === true, 'blockProgression is derived');
assert(TEMPLATE.schema.reasons?.derived === true, 'reasons is derived');
assert(typeof TEMPLATE.validate === 'function', 'has validate()');
assert(typeof TEMPLATE.computeDerived === 'function', 'has computeDerived()');
assert(typeof TEMPLATE.analysisStep === 'function', 'has analysisStep()');
assert(GO_DECISIONS.length === 3, 'GO_DECISIONS has 3 entries');
assert(LAUNCH_TYPES.length === 3, 'LAUNCH_TYPES has 3 entries');
assert(MIN_LAUNCH_TASKS === 1, 'MIN_LAUNCH_TASKS = 1');
assert(typeof evaluateKillGate === 'function', 'evaluateKillGate is exported');

// OutputSchema
assert(TEMPLATE.outputSchema && typeof TEMPLATE.outputSchema === 'object', 'has outputSchema (AUDIT)');

console.log('\n=== 2. Validation — good data ===');
const goodData = {
  go_decision: 'go',
  incident_response_plan: 'Escalation to on-call SRE within 15 minutes',
  monitoring_setup: 'Datadog APM + PagerDuty alerts configured',
  rollback_plan: 'Automated rollback via Kubernetes deployment revert',
  launch_tasks: [{ name: 'Deploy to production', status: 'done', owner: 'SRE' }],
  launch_date: '2026-03-15',
};
const goodResult = TEMPLATE.validate(goodData, { logger: silent });
assert(goodResult.valid === true, 'good data passes validation');
assert(goodResult.errors.length === 0, 'no errors');

console.log('\n=== 3. Validation — bad data ===');
assert(TEMPLATE.validate({}, { logger: silent }).valid === false, 'empty data fails');

// Invalid go_decision
const badDecision = { ...goodData, go_decision: 'INVALID' };
assert(TEMPLATE.validate(badDecision, { logger: silent }).valid === false, 'invalid go_decision fails');

// Missing incident_response_plan
const noIRP = { ...goodData, incident_response_plan: '' };
assert(TEMPLATE.validate(noIRP, { logger: silent }).valid === false, 'empty incident_response_plan fails');

// Missing monitoring_setup
const noMon = { ...goodData, monitoring_setup: '' };
assert(TEMPLATE.validate(noMon, { logger: silent }).valid === false, 'empty monitoring_setup fails');

// Missing rollback_plan
const noRollback = { ...goodData, rollback_plan: '' };
assert(TEMPLATE.validate(noRollback, { logger: silent }).valid === false, 'empty rollback_plan fails');

// Missing launch_date
const noDate = { ...goodData, launch_date: '' };
assert(TEMPLATE.validate(noDate, { logger: silent }).valid === false, 'empty launch_date fails');

// Empty launch_tasks
const noTasks = { ...goodData, launch_tasks: [] };
assert(TEMPLATE.validate(noTasks, { logger: silent }).valid === false, 'empty launch_tasks fails');

console.log('\n=== 4. computeDerived ===');
const derivedGo = TEMPLATE.computeDerived(goodData, null, { logger: silent });
assert(derivedGo.decision === 'pass', 'go decision → pass');
assert(derivedGo.blockProgression === false, 'go → no block');
assert(derivedGo.reasons.length === 0, 'go → no reasons');

const derivedNoGo = TEMPLATE.computeDerived({ ...goodData, go_decision: 'no-go' }, null, { logger: silent });
assert(derivedNoGo.decision === 'kill', 'no-go → kill');
assert(derivedNoGo.blockProgression === true, 'no-go → block');
assert(derivedNoGo.reasons.length > 0, 'no-go → has reasons');

console.log('\n=== 5. Kill Gate ===');
// Pass scenario
const gatePass = evaluateKillGate({
  go_decision: 'go',
  incident_response_plan: 'Escalation to SRE within 15 minutes',
  monitoring_setup: 'Datadog APM + PagerDuty alerts',
  rollback_plan: 'Automated rollback via K8s deployment revert',
});
assert(gatePass.decision === 'pass', 'kill gate passes with full plans');
assert(gatePass.blockProgression === false, 'no block');

// Missing plans with go decision
const gateMissingPlans = evaluateKillGate({
  go_decision: 'go',
  incident_response_plan: '',
  monitoring_setup: '',
  rollback_plan: '',
});
assert(gateMissingPlans.decision === 'kill', 'kill gate fails with missing plans');
assert(gateMissingPlans.reasons.length === 3, 'three missing plan reasons');

// Stage 22 not ready
const gateS22Fail = evaluateKillGate({
  go_decision: 'go',
  incident_response_plan: 'Escalation to SRE within 15 minutes',
  monitoring_setup: 'Datadog APM + PagerDuty alerts',
  rollback_plan: 'Automated rollback via K8s deployment revert',
  stage22Data: { promotion_gate: { pass: false, blockers: ['QA fail'] } },
});
assert(gateS22Fail.decision === 'kill', 'kill gate fails when Stage 22 not ready');
assert(gateS22Fail.reasons.some(r => r.type === 'stage22_not_complete'), 'Stage 22 blocker present');

console.log('\n=== 6. fetchUpstreamArtifacts mock ===');
const engineSrc = readFileSync(resolve(ROOT, 'lib/eva/stage-execution-engine.js'), 'utf8');
assert(engineSrc.includes('lifecycle_stage'), 'engine queries lifecycle_stage');

console.log('\n=== 7. Execution flow ===');
assert(engineSrc.includes('hasAnalysisStep'), 'engine uses hasAnalysisStep flag');
const hasElseComputeDerived = /else\s+if\s*\(\s*typeof\s+template\.computeDerived/.test(engineSrc);
assert(hasElseComputeDerived, 'engine has else-if for computeDerived (dead code when analysisStep exists)');

console.log('\n=== 8. Audit flags ===');
const analysisSrc = readFileSync(resolve(ROOT, 'lib/eva/stage-templates/analysis-steps/stage-23-launch-execution.js'), 'utf8');
const templateSrc = readFileSync(resolve(ROOT, 'lib/eva/stage-templates/stage-23.js'), 'utf8');

// 8a: outputSchema
assert(templateSrc.includes('extractOutputSchema'), 'template calls extractOutputSchema (AUDIT)');
assert(templateSrc.includes('ensureOutputSchema'), 'template calls ensureOutputSchema (AUDIT)');

// 8b: DRY exception documented
assert(analysisSrc.includes('circular dependency'), 'DRY exception documented (AUDIT)');

// 8c: LLM fallback detection
assert(analysisSrc.includes('llmFallbackCount'), 'analysis step tracks llmFallbackCount (AUDIT)');

// 8d: Field casing — analysis output uses snake_case for template schema
assert(analysisSrc.includes('launch_tasks'), 'analysis uses launch_tasks (snake_case, AUDIT)');
assert(analysisSrc.includes('planned_launch_date'), 'analysis uses planned_launch_date (snake_case, AUDIT)');
assert(analysisSrc.includes('launch_date'), 'analysis uses launch_date (snake_case, AUDIT)');
assert(analysisSrc.includes('go_decision'), 'analysis derives go_decision (AUDIT)');
assert(analysisSrc.includes('incident_response_plan'), 'analysis derives incident_response_plan (AUDIT)');
assert(analysisSrc.includes('monitoring_setup'), 'analysis derives monitoring_setup (AUDIT)');
assert(analysisSrc.includes('rollback_plan'), 'analysis derives rollback_plan (AUDIT)');

// 8e: Stale Stage 22 field refs (after Stage 22 fix, releaseItems → release_items)
assert(!analysisSrc.includes('stage22Data.releaseItems'), 'no stale releaseItems ref (AUDIT)');

// 8f: Kill gate imported and called from analysis step
assert(analysisSrc.includes('evaluateKillGate'), 'analysis step imports evaluateKillGate (AUDIT)');
assert(analysisSrc.includes('blockProgression'), 'analysis step returns blockProgression (AUDIT)');

// 8g: logger passed to parseFourBuckets
assert(analysisSrc.includes('parseFourBuckets(parsed, { logger }'), 'logger passed to parseFourBuckets');

console.log('\n=== 9. Error cases ===');
assert(TEMPLATE.validate(null, { logger: silent }).valid === false, 'null data fails');
assert(TEMPLATE.validate('string', { logger: silent }).valid === false, 'string data fails');

console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${pass} passed, ${fail} failed out of ${pass + fail}`);
process.exit(fail > 0 ? 1 : 0);
