#!/usr/bin/env node
/**
 * Stage 13 E2E Test — Product Roadmap
 * Phase: THE BLUEPRINT (Stages 13-16)
 *
 * Tests: template structure, validation, evaluateKillGate,
 * computeDerived, execution flow, audit flags.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log(`  ✅ ${msg}`); } else { fail++; console.error(`  ❌ FAIL: ${msg}`); } }

// ── Load template ──
const mod = await import(`file:///${ROOT}/lib/eva/stage-templates/stage-13.js`.replace(/\\/g, '/'));
const TEMPLATE = mod.default;
const { evaluateKillGate } = mod;
const { MIN_MILESTONES, MIN_TIMELINE_MONTHS, MIN_DELIVERABLES_PER_MILESTONE } = mod;
const silent = { warn: () => {}, log: () => {}, error: () => {} };

console.log('\n=== 1. Template structure ===');
assert(TEMPLATE.id === 'stage-13', 'id = stage-13');
assert(TEMPLATE.slug === 'product-roadmap', 'slug = product-roadmap');
assert(TEMPLATE.version === '2.0.0', 'version = 2.0.0');
assert(TEMPLATE.schema.vision_statement, 'schema has vision_statement');
assert(TEMPLATE.schema.milestones?.minItems === MIN_MILESTONES, `milestones minItems = ${MIN_MILESTONES}`);
assert(TEMPLATE.schema.phases?.minItems === 1, 'phases minItems = 1');
assert(TEMPLATE.schema.timeline_months?.derived === true, 'timeline_months is derived');
assert(TEMPLATE.schema.milestone_count?.derived === true, 'milestone_count is derived');
assert(TEMPLATE.schema.decision?.derived === true, 'decision is derived');
assert(TEMPLATE.schema.blockProgression?.derived === true, 'blockProgression is derived');
assert(TEMPLATE.schema.reasons?.derived === true, 'reasons is derived');
assert(typeof TEMPLATE.validate === 'function', 'has validate()');
assert(typeof TEMPLATE.computeDerived === 'function', 'has computeDerived()');
assert(typeof TEMPLATE.analysisStep === 'function', 'has analysisStep()');
assert(typeof evaluateKillGate === 'function', 'evaluateKillGate is exported');

// OutputSchema
assert(TEMPLATE.outputSchema && typeof TEMPLATE.outputSchema === 'object', 'has outputSchema (AUDIT)');

console.log('\n=== 2. Validation — good data ===');
const goodData = {
  vision_statement: 'Build a comprehensive SaaS platform for SMB market automation and analytics',
  milestones: Array.from({ length: 3 }, (_, i) => ({
    name: `Milestone ${i}`, date: `2026-0${i + 3}-01`,
    deliverables: [`Deliverable ${i}`], dependencies: [], priority: i === 0 ? 'now' : 'next',
  })),
  phases: [{ name: 'Phase 1', start_date: '2026-03-01', end_date: '2026-06-01' }],
};
const goodResult = TEMPLATE.validate(goodData, { logger: silent });
assert(goodResult.valid === true, 'good data passes validation');
assert(goodResult.errors.length === 0, 'no errors');

console.log('\n=== 3. Validation — bad data ===');
const badResult = TEMPLATE.validate({}, { logger: silent });
assert(badResult.valid === false, 'empty data fails');

// Short vision statement
const shortVision = { ...goodData, vision_statement: 'Too short' };
assert(TEMPLATE.validate(shortVision, { logger: silent }).valid === false, 'short vision_statement fails');

// Too few milestones
const fewMs = { ...goodData, milestones: goodData.milestones.slice(0, 1) };
assert(TEMPLATE.validate(fewMs, { logger: silent }).valid === false, `< ${MIN_MILESTONES} milestones fails`);

// No phases
const noPhases = { ...goodData, phases: [] };
assert(TEMPLATE.validate(noPhases, { logger: silent }).valid === false, 'empty phases fails');

// Milestone missing deliverables
const noDeliverables = {
  ...goodData,
  milestones: goodData.milestones.map((m, i) => i === 0 ? { ...m, deliverables: [] } : m),
};
assert(TEMPLATE.validate(noDeliverables, { logger: silent }).valid === false, 'milestone without deliverables fails');

console.log('\n=== 4. evaluateKillGate ===');
// Pass case
const gatePass = evaluateKillGate({
  milestone_count: 3,
  milestones: goodData.milestones,
  timeline_months: 6,
});
assert(gatePass.decision === 'pass', 'kill gate passes with good data');
assert(gatePass.blockProgression === false, 'blockProgression false on pass');
assert(gatePass.reasons.length === 0, 'no reasons');

// Kill: too few milestones
const gateFew = evaluateKillGate({ milestone_count: 1, milestones: [{ name: 'M1', deliverables: ['D1'], priority: 'now' }], timeline_months: 6 });
assert(gateFew.decision === 'kill', 'kills with < 3 milestones');
assert(gateFew.reasons.some(r => r.type === 'insufficient_milestones'), 'reason type = insufficient_milestones');

// Kill: no deliverables
const gateNoDeliv = evaluateKillGate({
  milestone_count: 3,
  milestones: [
    { name: 'M1', deliverables: ['D1'], priority: 'now' },
    { name: 'M2', deliverables: [], priority: 'next' },
    { name: 'M3', deliverables: ['D3'], priority: 'later' },
  ],
  timeline_months: 6,
});
assert(gateNoDeliv.decision === 'kill', 'kills with missing deliverables');
assert(gateNoDeliv.reasons.some(r => r.type === 'milestone_missing_deliverables'), 'reason type = milestone_missing_deliverables');

// Kill: timeline too short
const gateShort = evaluateKillGate({ milestone_count: 3, milestones: goodData.milestones, timeline_months: 1 });
assert(gateShort.decision === 'kill', 'kills with short timeline');
assert(gateShort.reasons.some(r => r.type === 'timeline_too_short'), 'reason type = timeline_too_short');

// Kill: no 'now' priority
const gateNoNow = evaluateKillGate({
  milestone_count: 3,
  milestones: Array.from({ length: 3 }, (_, i) => ({
    name: `M${i}`, deliverables: [`D${i}`], priority: 'later',
  })),
  timeline_months: 6,
});
assert(gateNoNow.decision === 'kill', 'kills with no now priority');
assert(gateNoNow.reasons.some(r => r.type === 'no_now_priority_milestone'), 'reason type = no_now_priority_milestone');

console.log('\n=== 5. fetchUpstreamArtifacts mock ===');
const engineSrc = readFileSync(resolve(ROOT, 'lib/eva/stage-execution-engine.js'), 'utf8');
assert(engineSrc.includes('lifecycle_stage'), 'engine queries lifecycle_stage');

console.log('\n=== 6. Execution flow ===');
assert(engineSrc.includes('hasAnalysisStep'), 'engine uses hasAnalysisStep flag');
const hasElseComputeDerived = /else\s+if\s*\(\s*typeof\s+template\.computeDerived/.test(engineSrc);
assert(hasElseComputeDerived, 'engine has else-if for computeDerived (dead code when analysisStep exists)');

console.log('\n=== 7. Audit flags ===');
const analysisSrc = readFileSync(resolve(ROOT, 'lib/eva/stage-templates/analysis-steps/stage-13-product-roadmap.js'), 'utf8');
const templateSrc = readFileSync(resolve(ROOT, 'lib/eva/stage-templates/stage-13.js'), 'utf8');

// 7a: outputSchema
assert(templateSrc.includes('extractOutputSchema'), 'template calls extractOutputSchema (AUDIT)');
assert(templateSrc.includes('ensureOutputSchema'), 'template calls ensureOutputSchema (AUDIT)');

// 7b: DRY exception documented
assert(analysisSrc.includes('circular dependency'), 'DRY exception documented (AUDIT)');

// 7c: LLM fallback detection
assert(analysisSrc.includes('llmFallbackCount'), 'analysis step tracks llmFallbackCount (AUDIT)');

// 7d: Kill gate called from analysis step
assert(analysisSrc.includes('evaluateKillGate'), 'analysis step calls evaluateKillGate (AUDIT)');

// 7e: logger passed to parseFourBuckets
assert(analysisSrc.includes('parseFourBuckets(parsed, { logger }'), 'logger passed to parseFourBuckets');

console.log('\n=== 8. Error cases ===');
// Missing name in milestone
const noName = {
  ...goodData,
  milestones: goodData.milestones.map((m, i) => i === 0 ? { ...m, name: null } : m),
};
assert(TEMPLATE.validate(noName, { logger: silent }).valid === false, 'null milestone name fails');

// Missing date in milestone
const noDate = {
  ...goodData,
  milestones: goodData.milestones.map((m, i) => i === 0 ? { ...m, date: '' } : m),
};
assert(TEMPLATE.validate(noDate, { logger: silent }).valid === false, 'empty milestone date fails');

console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${pass} passed, ${fail} failed out of ${pass + fail}`);
process.exit(fail > 0 ? 1 : 0);
