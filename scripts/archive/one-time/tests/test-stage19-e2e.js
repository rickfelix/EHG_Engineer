#!/usr/bin/env node
/**
 * Stage 19 E2E Test — Build Execution
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
const mod = await import(`file:///${ROOT}/lib/eva/stage-templates/stage-19.js`.replace(/\\/g, '/'));
const TEMPLATE = mod.default;
const { TASK_STATUSES, ISSUE_SEVERITIES, ISSUE_STATUSES, SPRINT_COMPLETION_DECISIONS, MIN_TASKS } = mod;
const silent = { warn: () => {}, log: () => {}, error: () => {} };

console.log('\n=== 1. Template structure ===');
assert(TEMPLATE.id === 'stage-19', 'id = stage-19');
assert(TEMPLATE.slug === 'build-execution', 'slug = build-execution');
assert(TEMPLATE.version === '2.0.0', 'version = 2.0.0');
assert(TEMPLATE.schema.tasks?.type === 'array', 'tasks is array');
assert(TEMPLATE.schema.tasks?.minItems === MIN_TASKS, `tasks minItems = ${MIN_TASKS}`);
assert(TEMPLATE.schema.issues?.type === 'array', 'issues is array');
assert(TEMPLATE.schema.total_tasks?.derived === true, 'total_tasks is derived');
assert(TEMPLATE.schema.completed_tasks?.derived === true, 'completed_tasks is derived');
assert(TEMPLATE.schema.blocked_tasks?.derived === true, 'blocked_tasks is derived');
assert(TEMPLATE.schema.completion_pct?.derived === true, 'completion_pct is derived');
assert(TEMPLATE.schema.tasks_by_status?.derived === true, 'tasks_by_status is derived');
assert(TEMPLATE.schema.sprintCompletion?.derived === true, 'sprintCompletion is derived');
assert(typeof TEMPLATE.validate === 'function', 'has validate()');
assert(typeof TEMPLATE.computeDerived === 'function', 'has computeDerived()');
assert(typeof TEMPLATE.analysisStep === 'function', 'has analysisStep()');
assert(TASK_STATUSES.length === 4, 'TASK_STATUSES has 4 entries');
assert(ISSUE_SEVERITIES.length === 4, 'ISSUE_SEVERITIES has 4 entries');
assert(ISSUE_STATUSES.length === 4, 'ISSUE_STATUSES has 4 entries');
assert(SPRINT_COMPLETION_DECISIONS.length === 3, 'SPRINT_COMPLETION_DECISIONS has 3 entries');
assert(MIN_TASKS === 1, 'MIN_TASKS = 1');

// OutputSchema
assert(TEMPLATE.outputSchema && typeof TEMPLATE.outputSchema === 'object', 'has outputSchema (AUDIT)');

console.log('\n=== 2. Validation — good data ===');
const goodTask = {
  name: 'Build Auth Module',
  status: 'in_progress',
  assignee: 'Dev-1',
  sprint_item_ref: 'Sprint 1 Item 1',
};
const goodData = {
  tasks: [goodTask],
  issues: [
    { description: 'Token expiry edge case', severity: 'medium', status: 'open' },
  ],
};
const goodResult = TEMPLATE.validate(goodData, { logger: silent });
assert(goodResult.valid === true, 'good data passes validation');
assert(goodResult.errors.length === 0, 'no errors');

console.log('\n=== 3. Validation — bad data ===');
assert(TEMPLATE.validate({}, { logger: silent }).valid === false, 'empty data fails');

// Invalid task status
const badStatus = { tasks: [{ ...goodTask, status: 'INVALID' }] };
assert(TEMPLATE.validate(badStatus, { logger: silent }).valid === false, 'invalid task status fails');

// Missing task name
const noName = { tasks: [{ ...goodTask, name: '' }] };
assert(TEMPLATE.validate(noName, { logger: silent }).valid === false, 'empty task name fails');

// Invalid issue severity
const badSev = { tasks: [goodTask], issues: [{ description: 'Bug', severity: 'INVALID', status: 'open' }] };
assert(TEMPLATE.validate(badSev, { logger: silent }).valid === false, 'invalid issue severity fails');

// Invalid issue status
const badIssueStatus = { tasks: [goodTask], issues: [{ description: 'Bug', severity: 'high', status: 'INVALID' }] };
assert(TEMPLATE.validate(badIssueStatus, { logger: silent }).valid === false, 'invalid issue status fails');

// Missing issue description
const noIssueDesc = { tasks: [goodTask], issues: [{ description: '', severity: 'high', status: 'open' }] };
assert(TEMPLATE.validate(noIssueDesc, { logger: silent }).valid === false, 'empty issue description fails');

console.log('\n=== 4. computeDerived ===');
const derivedInput = {
  tasks: [
    { name: 'Task A', status: 'done' },
    { name: 'Task B', status: 'in_progress' },
    { name: 'Task C', status: 'blocked' },
    { name: 'Task D', status: 'pending' },
  ],
  issues: [
    { description: 'Critical bug', severity: 'critical', status: 'open' },
  ],
};
const derived = TEMPLATE.computeDerived(derivedInput, { logger: silent });
assert(derived.total_tasks === 4, 'total_tasks = 4');
assert(derived.completed_tasks === 1, 'completed_tasks = 1');
assert(derived.blocked_tasks === 1, 'blocked_tasks = 1');
assert(derived.completion_pct === 25, 'completion_pct = 25');
assert(derived.tasks_by_status.done === 1, 'tasks_by_status.done = 1');
assert(derived.tasks_by_status.blocked === 1, 'tasks_by_status.blocked = 1');
assert(derived.sprintCompletion.decision === 'blocked', 'sprint blocked (critical issues + blocked tasks)');
assert(derived.sprintCompletion.readyForQa === false, 'not ready for QA when blocked');

// Complete scenario
const completeInput = {
  tasks: [
    { name: 'Task A', status: 'done' },
    { name: 'Task B', status: 'done' },
  ],
  issues: [],
};
const completeDerived = TEMPLATE.computeDerived(completeInput, { logger: silent });
assert(completeDerived.completion_pct === 100, 'completion_pct = 100');
assert(completeDerived.sprintCompletion.decision === 'complete', 'sprint complete when all done');
assert(completeDerived.sprintCompletion.readyForQa === true, 'ready for QA when complete');

console.log('\n=== 5. fetchUpstreamArtifacts mock ===');
const engineSrc = readFileSync(resolve(ROOT, 'lib/eva/stage-execution-engine.js'), 'utf8');
assert(engineSrc.includes('lifecycle_stage'), 'engine queries lifecycle_stage');

console.log('\n=== 6. Execution flow ===');
assert(engineSrc.includes('hasAnalysisStep'), 'engine uses hasAnalysisStep flag');
const hasElseComputeDerived = /else\s+if\s*\(\s*typeof\s+template\.computeDerived/.test(engineSrc);
assert(hasElseComputeDerived, 'engine has else-if for computeDerived (dead code when analysisStep exists)');

console.log('\n=== 7. Audit flags ===');
const analysisSrc = readFileSync(resolve(ROOT, 'lib/eva/stage-templates/analysis-steps/stage-19-build-execution.js'), 'utf8');
const templateSrc = readFileSync(resolve(ROOT, 'lib/eva/stage-templates/stage-19.js'), 'utf8');

// 7a: outputSchema
assert(templateSrc.includes('extractOutputSchema'), 'template calls extractOutputSchema (AUDIT)');
assert(templateSrc.includes('ensureOutputSchema'), 'template calls ensureOutputSchema (AUDIT)');

// 7b: DRY exception documented
assert(analysisSrc.includes('circular dependency'), 'DRY exception documented (AUDIT)');

// 7c: LLM fallback detection
assert(analysisSrc.includes('llmFallbackCount'), 'analysis step tracks llmFallbackCount (AUDIT)');

// 7d: Field casing — analysis output must use snake_case matching template schema
assert(analysisSrc.includes('total_tasks'), 'analysis uses total_tasks (snake_case, AUDIT)');
assert(analysisSrc.includes('completed_tasks'), 'analysis uses completed_tasks (snake_case, AUDIT)');
assert(analysisSrc.includes('blocked_tasks'), 'analysis uses blocked_tasks (snake_case, AUDIT)');
assert(analysisSrc.includes('completion_pct'), 'analysis computes completion_pct (AUDIT)');
assert(analysisSrc.includes('tasks_by_status'), 'analysis computes tasks_by_status (AUDIT)');

// 7e: Stale Stage 18 field refs (after Stage 18 fix, fields are snake_case)
assert(!analysisSrc.includes('stage18Data.sprintGoal'), 'no stale sprintGoal ref (AUDIT)');
assert(!analysisSrc.includes('stage18Data.sprintItems'), 'no stale sprintItems ref (AUDIT)');
assert(analysisSrc.includes('sprint_goal') || analysisSrc.includes('stage18Data.sprint_goal'), 'uses sprint_goal (AUDIT)');

// 7f: Tasks include sprint_item_ref mapping
assert(analysisSrc.includes('sprint_item_ref'), 'tasks include sprint_item_ref (AUDIT)');

// 7g: logger passed to parseFourBuckets
assert(analysisSrc.includes('parseFourBuckets(parsed, { logger }'), 'logger passed to parseFourBuckets');

console.log('\n=== 8. Error cases ===');
assert(TEMPLATE.validate(null, { logger: silent }).valid === false, 'null data fails');
assert(TEMPLATE.validate('string', { logger: silent }).valid === false, 'string data fails');

console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${pass} passed, ${fail} failed out of ${pass + fail}`);
process.exit(fail > 0 ? 1 : 0);
