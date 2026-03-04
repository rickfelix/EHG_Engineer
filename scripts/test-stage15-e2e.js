#!/usr/bin/env node
/**
 * Stage 15 E2E Test — Risk Register
 * Phase: THE BLUEPRINT (Stages 13-16)
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
const mod = await import(`file:///${ROOT}/lib/eva/stage-templates/stage-15.js`.replace(/\\/g, '/'));
const TEMPLATE = mod.default;
const { MIN_RISKS, SEVERITY_ENUM, PRIORITY_ENUM } = mod;
const silent = { warn: () => {}, log: () => {}, error: () => {} };

console.log('\n=== 1. Template structure ===');
assert(TEMPLATE.id === 'stage-15', 'id = stage-15');
assert(TEMPLATE.slug === 'risk-register', 'slug = risk-register');
assert(TEMPLATE.version === '3.0.0', 'version = 3.0.0');
assert(TEMPLATE.schema.risks?.minItems === MIN_RISKS, `risks minItems = ${MIN_RISKS}`);
assert(TEMPLATE.schema.total_risks?.derived === true, 'total_risks is derived');
assert(TEMPLATE.schema.severity_breakdown?.derived === true, 'severity_breakdown is derived');
assert(TEMPLATE.schema.budget_coherence?.derived === true, 'budget_coherence is derived');
assert(typeof TEMPLATE.validate === 'function', 'has validate()');
assert(typeof TEMPLATE.computeDerived === 'function', 'has computeDerived()');
assert(typeof TEMPLATE.analysisStep === 'function', 'has analysisStep()');
assert(SEVERITY_ENUM.length === 4, 'SEVERITY_ENUM has 4 entries');
assert(PRIORITY_ENUM.length === 3, 'PRIORITY_ENUM has 3 entries');

// OutputSchema
assert(TEMPLATE.outputSchema && typeof TEMPLATE.outputSchema === 'object', 'has outputSchema (AUDIT)');

console.log('\n=== 2. Validation — good data ===');
const goodRisk = {
  title: 'Market Risk',
  description: 'Competition may undercut pricing',
  owner: 'CTO',
  severity: 'high',
  priority: 'immediate',
  phaseRef: 'Phase 1',
  mitigationPlan: 'Build unique features',
  contingencyPlan: 'Pivot to niche',
};
const goodData = { risks: [goodRisk, { ...goodRisk, title: 'Tech Risk', severity: 'medium', priority: 'short_term' }] };
const goodResult = TEMPLATE.validate(goodData, { logger: silent });
assert(goodResult.valid === true, 'good data passes validation');
assert(goodResult.errors.length === 0, 'no errors');

console.log('\n=== 3. Validation — bad data ===');
const badResult = TEMPLATE.validate({}, { logger: silent });
assert(badResult.valid === false, 'empty data fails');

// No risks
const noRisks = { risks: [] };
assert(TEMPLATE.validate(noRisks, { logger: silent }).valid === false, 'empty risks array fails');

// Invalid severity
const badSev = { risks: [{ ...goodRisk, severity: 'INVALID' }] };
assert(TEMPLATE.validate(badSev, { logger: silent }).valid === false, 'invalid severity fails');

// Invalid priority
const badPri = { risks: [{ ...goodRisk, priority: 'INVALID' }] };
assert(TEMPLATE.validate(badPri, { logger: silent }).valid === false, 'invalid priority fails');

// Missing mitigation plan
const noMit = { risks: [{ ...goodRisk, mitigationPlan: '' }] };
assert(TEMPLATE.validate(noMit, { logger: silent }).valid === false, 'empty mitigationPlan fails');

// Missing owner
const noOwner = { risks: [{ ...goodRisk, owner: null }] };
assert(TEMPLATE.validate(noOwner, { logger: silent }).valid === false, 'null owner fails');

console.log('\n=== 4. fetchUpstreamArtifacts mock ===');
const engineSrc = readFileSync(resolve(ROOT, 'lib/eva/stage-execution-engine.js'), 'utf8');
assert(engineSrc.includes('lifecycle_stage'), 'engine queries lifecycle_stage');

console.log('\n=== 5. Execution flow ===');
assert(engineSrc.includes('hasAnalysisStep'), 'engine uses hasAnalysisStep flag');
const hasElseComputeDerived = /else\s+if\s*\(\s*typeof\s+template\.computeDerived/.test(engineSrc);
assert(hasElseComputeDerived, 'engine has else-if for computeDerived (dead code when analysisStep exists)');

console.log('\n=== 6. Audit flags ===');
const analysisSrc = readFileSync(resolve(ROOT, 'lib/eva/stage-templates/analysis-steps/stage-15-risk-register.js'), 'utf8');
const templateSrc = readFileSync(resolve(ROOT, 'lib/eva/stage-templates/stage-15.js'), 'utf8');

// 6a: outputSchema
assert(templateSrc.includes('extractOutputSchema'), 'template calls extractOutputSchema (AUDIT)');
assert(templateSrc.includes('ensureOutputSchema'), 'template calls ensureOutputSchema (AUDIT)');

// 6b: DRY exception documented
assert(analysisSrc.includes('circular dependency'), 'DRY exception documented (AUDIT)');

// 6c: LLM fallback detection
assert(analysisSrc.includes('llmFallbackCount'), 'analysis step tracks llmFallbackCount (AUDIT)');

// 6d: Field casing — analysis output must use snake_case matching template schema
assert(analysisSrc.includes('total_risks'), 'analysis uses total_risks (snake_case, AUDIT)');
assert(analysisSrc.includes('severity_breakdown'), 'analysis uses severity_breakdown (snake_case, AUDIT)');
assert(analysisSrc.includes('budget_coherence'), 'analysis uses budget_coherence (snake_case, AUDIT)');

// 6e: Stale Stage 14 field names — should use 'presentation', 'business_logic', 'infrastructure'
assert(!analysisSrc.includes('layers.frontend'), 'no stale layers.frontend reference (AUDIT)');
assert(!analysisSrc.includes('layers.backend'), 'no stale layers.backend reference (AUDIT)');
assert(!analysisSrc.includes("layers.infra'") && !analysisSrc.includes('layers.infra?') && !analysisSrc.includes('layers.infra.'), 'no stale layers.infra reference (AUDIT)');

// 6f: logger passed to parseFourBuckets
assert(analysisSrc.includes('parseFourBuckets(parsed, { logger }'), 'logger passed to parseFourBuckets');

console.log('\n=== 7. Error cases ===');
// Non-object data
assert(TEMPLATE.validate(null, { logger: silent }).valid === false, 'null data fails');
assert(TEMPLATE.validate('string', { logger: silent }).valid === false, 'string data fails');

console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${pass} passed, ${fail} failed out of ${pass + fail}`);
process.exit(fail > 0 ? 1 : 0);
