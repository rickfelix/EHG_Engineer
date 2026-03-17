#!/usr/bin/env node
/**
 * Stage 14 E2E Test — Technical Architecture
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
const mod = await import(`file:///${ROOT}/lib/eva/stage-templates/stage-14.js`.replace(/\\/g, '/'));
const TEMPLATE = mod.default;
const { REQUIRED_LAYERS, MIN_INTEGRATION_POINTS, MIN_DATA_ENTITIES, CONSTRAINT_CATEGORIES } = mod;
const silent = { warn: () => {}, log: () => {}, error: () => {} };

console.log('\n=== 1. Template structure ===');
assert(TEMPLATE.id === 'stage-14', 'id = stage-14');
assert(TEMPLATE.slug === 'technical-architecture', 'slug = technical-architecture');
assert(TEMPLATE.version === '3.0.0', 'version = 3.0.0');
assert(TEMPLATE.schema.architecture_summary, 'schema has architecture_summary');
assert(TEMPLATE.schema.layers, 'schema has layers');
assert(TEMPLATE.schema.security, 'schema has security');
assert(TEMPLATE.schema.dataEntities?.minItems === MIN_DATA_ENTITIES, `dataEntities minItems = ${MIN_DATA_ENTITIES}`);
assert(TEMPLATE.schema.integration_points?.minItems === MIN_INTEGRATION_POINTS, `integration_points minItems = ${MIN_INTEGRATION_POINTS}`);
assert(TEMPLATE.schema.layer_count?.derived === true, 'layer_count is derived');
assert(TEMPLATE.schema.total_components?.derived === true, 'total_components is derived');
assert(TEMPLATE.schema.all_layers_defined?.derived === true, 'all_layers_defined is derived');
assert(TEMPLATE.schema.entity_count?.derived === true, 'entity_count is derived');
assert(typeof TEMPLATE.validate === 'function', 'has validate()');
assert(typeof TEMPLATE.computeDerived === 'function', 'has computeDerived()');
assert(typeof TEMPLATE.analysisStep === 'function', 'has analysisStep()');
assert(REQUIRED_LAYERS.length === 5, 'REQUIRED_LAYERS has 5 entries');
assert(CONSTRAINT_CATEGORIES.length === 4, 'CONSTRAINT_CATEGORIES has 4 entries');

// OutputSchema
assert(TEMPLATE.outputSchema && typeof TEMPLATE.outputSchema === 'object', 'has outputSchema (AUDIT)');

console.log('\n=== 2. Validation — good data ===');
const makeLayer = (tech) => ({ technology: tech, components: ['Component1'], rationale: 'Good rationale for tech choice' });
const goodData = {
  architecture_summary: 'A comprehensive microservices architecture with React frontend and PostgreSQL backend',
  layers: {
    presentation: makeLayer('React'),
    api: makeLayer('Express'),
    business_logic: makeLayer('Node.js'),
    data: makeLayer('PostgreSQL'),
    infrastructure: makeLayer('AWS'),
  },
  security: { authStrategy: 'JWT', dataClassification: 'confidential', complianceRequirements: ['GDPR'] },
  dataEntities: [{ name: 'User', description: 'System user', relationships: ['Order'], estimatedVolume: '~10k/month' }],
  integration_points: [{ name: 'API Gateway', source_layer: 'presentation', target_layer: 'api', protocol: 'REST' }],
  constraints: [{ name: 'Latency', description: 'Sub-100ms response', category: 'performance' }],
};
const goodResult = TEMPLATE.validate(goodData, { logger: silent });
assert(goodResult.valid === true, 'good data passes validation');
assert(goodResult.errors.length === 0, 'no errors');

console.log('\n=== 3. Validation — bad data ===');
const badResult = TEMPLATE.validate({}, { logger: silent });
assert(badResult.valid === false, 'empty data fails');

// Short architecture summary
const shortSummary = { ...goodData, architecture_summary: 'Too short' };
assert(TEMPLATE.validate(shortSummary, { logger: silent }).valid === false, 'short architecture_summary fails');

// Missing layer
const missingLayer = { ...goodData, layers: { ...goodData.layers, api: undefined } };
assert(TEMPLATE.validate(missingLayer, { logger: silent }).valid === false, 'missing required layer fails');

// No integration points
const noIntegrations = { ...goodData, integration_points: [] };
assert(TEMPLATE.validate(noIntegrations, { logger: silent }).valid === false, 'empty integration_points fails');

// Missing security fields
const noAuth = { ...goodData, security: { authStrategy: '', dataClassification: 'internal', complianceRequirements: [] } };
assert(TEMPLATE.validate(noAuth, { logger: silent }).valid === false, 'empty authStrategy fails');

// Invalid constraint category
const badConstraint = { ...goodData, constraints: [{ name: 'C1', description: 'D1', category: 'INVALID' }] };
assert(TEMPLATE.validate(badConstraint, { logger: silent }).valid === false, 'invalid constraint category fails');

console.log('\n=== 4. fetchUpstreamArtifacts mock ===');
const engineSrc = readFileSync(resolve(ROOT, 'lib/eva/stage-execution-engine.js'), 'utf8');
assert(engineSrc.includes('lifecycle_stage'), 'engine queries lifecycle_stage');

console.log('\n=== 5. Execution flow ===');
assert(engineSrc.includes('hasAnalysisStep'), 'engine uses hasAnalysisStep flag');
const hasElseComputeDerived = /else\s+if\s*\(\s*typeof\s+template\.computeDerived/.test(engineSrc);
assert(hasElseComputeDerived, 'engine has else-if for computeDerived (dead code when analysisStep exists)');

console.log('\n=== 6. Audit flags ===');
const analysisSrc = readFileSync(resolve(ROOT, 'lib/eva/stage-templates/analysis-steps/stage-14-technical-architecture.js'), 'utf8');
const templateSrc = readFileSync(resolve(ROOT, 'lib/eva/stage-templates/stage-14.js'), 'utf8');

// 6a: outputSchema
assert(templateSrc.includes('extractOutputSchema'), 'template calls extractOutputSchema (AUDIT)');
assert(templateSrc.includes('ensureOutputSchema'), 'template calls ensureOutputSchema (AUDIT)');

// 6b: DRY exception documented
assert(analysisSrc.includes('circular dependency'), 'DRY exception documented (AUDIT)');

// 6c: LLM fallback detection
assert(analysisSrc.includes('llmFallbackCount'), 'analysis step tracks llmFallbackCount (AUDIT)');

// 6d: Field casing — analysis output must use snake_case matching template schema
assert(analysisSrc.includes('layer_count'), 'analysis uses layer_count (snake_case, AUDIT)');
assert(analysisSrc.includes('total_components'), 'analysis uses total_components (snake_case, AUDIT)');
assert(analysisSrc.includes('all_layers_defined'), 'analysis uses all_layers_defined (snake_case, AUDIT)');
assert(analysisSrc.includes('entity_count'), 'analysis uses entity_count (snake_case, AUDIT)');

// 6e: logger passed to parseFourBuckets
assert(analysisSrc.includes('parseFourBuckets(parsed, { logger }'), 'logger passed to parseFourBuckets');

console.log('\n=== 7. Error cases ===');
// Missing data entity name
const noEntityName = {
  ...goodData,
  dataEntities: [{ name: '', description: 'Desc', relationships: [] }],
};
assert(TEMPLATE.validate(noEntityName, { logger: silent }).valid === false, 'empty entity name fails');

// Layers as non-object
const badLayers = { ...goodData, layers: 'not-an-object' };
assert(TEMPLATE.validate(badLayers, { logger: silent }).valid === false, 'non-object layers fails');

console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${pass} passed, ${fail} failed out of ${pass + fail}`);
process.exit(fail > 0 ? 1 : 0);
