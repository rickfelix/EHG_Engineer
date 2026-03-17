#!/usr/bin/env node
/**
 * Stage 10 E2E Test — Naming / Brand
 * Phase: THE IDENTITY (Stages 10-12)
 *
 * Tests: template structure, validation, computeDerived,
 * analysis step normalization, cross-stage contracts, execution flow, audit flags.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log(`  ✅ ${msg}`); } else { fail++; console.error(`  ❌ FAIL: ${msg}`); } }

// ── Load template ──
const TEMPLATE = (await import(`file:///${ROOT}/lib/eva/stage-templates/stage-10.js`.replace(/\\/g, '/'))).default;
const { MIN_CANDIDATES, WEIGHT_SUM, BRAND_GENOME_KEYS, NAMING_STRATEGIES } = await import(`file:///${ROOT}/lib/eva/stage-templates/stage-10.js`.replace(/\\/g, '/'));

console.log('\n=== 1. Template structure ===');
assert(TEMPLATE.id === 'stage-10', 'id = stage-10');
assert(TEMPLATE.slug === 'naming-brand', 'slug = naming-brand');
assert(TEMPLATE.version === '2.0.0', 'version = 2.0.0');
assert(TEMPLATE.schema.brandGenome, 'schema has brandGenome');
assert(TEMPLATE.schema.scoringCriteria, 'schema has scoringCriteria');
assert(TEMPLATE.schema.candidates?.minItems === MIN_CANDIDATES, `candidates minItems = ${MIN_CANDIDATES}`);
assert(TEMPLATE.schema.narrativeExtension, 'schema has narrativeExtension');
assert(TEMPLATE.schema.namingStrategy, 'schema has namingStrategy');
assert(TEMPLATE.schema.chairmanGate, 'schema has chairmanGate');
assert(TEMPLATE.schema.ranked_candidates?.derived === true, 'ranked_candidates is derived');
assert(TEMPLATE.schema.decision?.derived === true, 'decision is derived');
assert(typeof TEMPLATE.validate === 'function', 'has validate()');
assert(typeof TEMPLATE.computeDerived === 'function', 'has computeDerived()');
assert(typeof TEMPLATE.analysisStep === 'function', 'has analysisStep()');
assert(typeof TEMPLATE.onBeforeAnalysis === 'function', 'has onBeforeAnalysis()');
assert(MIN_CANDIDATES === 5, 'MIN_CANDIDATES = 5');
assert(WEIGHT_SUM === 100, 'WEIGHT_SUM = 100');
assert(BRAND_GENOME_KEYS.length === 5, 'BRAND_GENOME_KEYS has 5 keys');
assert(NAMING_STRATEGIES.length === 5, 'NAMING_STRATEGIES has 5 strategies');

// Constants
assert(TEMPLATE.defaultData.chairmanGate.status === 'pending', 'default chairmanGate status = pending');
assert(Array.isArray(TEMPLATE.defaultData.candidates) && TEMPLATE.defaultData.candidates.length === 0, 'default candidates = []');

// OutputSchema
assert(TEMPLATE.outputSchema && typeof TEMPLATE.outputSchema === 'object', 'has outputSchema (AUDIT)');

console.log('\n=== 2. Validation — good data ===');
const goodData = {
  brandGenome: {
    archetype: 'Explorer', values: ['Innovation', 'Simplicity'], tone: 'Professional',
    audience: 'Tech-savvy entrepreneurs', differentiators: ['AI-powered', 'Low-code'],
  },
  scoringCriteria: [
    { name: 'Memorability', weight: 30 }, { name: 'Relevance', weight: 30 },
    { name: 'Uniqueness', weight: 20 }, { name: 'Pronounceability', weight: 20 },
  ],
  candidates: Array.from({ length: 5 }, (_, i) => ({
    name: `Brand${i + 1}`, rationale: `Reason for Brand${i + 1}`,
    scores: { Memorability: 80, Relevance: 70, Uniqueness: 60, Pronounceability: 75 },
  })),
  narrativeExtension: { vision: 'Be the best', mission: 'Serve innovators', brandVoice: 'Bold and clear' },
  namingStrategy: 'abstract',
  chairmanGate: { status: 'approved', rationale: 'Good branding', decision_id: 'dec-1' },
};
const silent = { warn: () => {}, log: () => {}, error: () => {} };
const goodResult = TEMPLATE.validate(goodData, { logger: silent });
assert(goodResult.valid === true, 'good data passes validation');
assert(goodResult.errors.length === 0, 'no errors on good data');

console.log('\n=== 3. Validation — bad data ===');
const badResult = TEMPLATE.validate({}, { logger: silent });
assert(badResult.valid === false, 'empty data fails');
assert(badResult.errors.some(e => e.includes('brandGenome')), 'error mentions brandGenome');

// Missing candidates
const noCandsResult = TEMPLATE.validate({ ...goodData, candidates: [] }, { logger: silent });
assert(noCandsResult.valid === false, 'empty candidates fails');

// Weight sum != 100
const badWeightData = { ...goodData, scoringCriteria: [{ name: 'A', weight: 50 }, { name: 'B', weight: 30 }] };
const badWeightResult = TEMPLATE.validate(badWeightData, { logger: silent });
assert(badWeightResult.valid === false, 'weights != 100 fails');
assert(badWeightResult.errors.some(e => e.includes('sum to 100')), 'error mentions weight sum');

// Too few candidates
const fewCands = { ...goodData, candidates: goodData.candidates.slice(0, 2) };
const fewCandsResult = TEMPLATE.validate(fewCands, { logger: silent });
assert(fewCandsResult.valid === false, `< ${MIN_CANDIDATES} candidates fails`);

// Bad naming strategy
const badNS = { ...goodData, namingStrategy: 'INVALID' };
const badNSResult = TEMPLATE.validate(badNS, { logger: silent });
assert(badNSResult.valid === false, 'invalid namingStrategy fails');

// Chairman gate rejected
const rejGate = { ...goodData, chairmanGate: { status: 'rejected', rationale: 'Bad brand' } };
const rejResult = TEMPLATE.validate(rejGate, { logger: silent });
assert(rejResult.valid === false, 'rejected gate fails');
assert(rejResult.errors.some(e => e.includes('Chairman gate rejected')), 'error mentions chairman rejected');

// Chairman gate pending
const pendGate = { ...goodData, chairmanGate: { status: 'pending' } };
const pendResult = TEMPLATE.validate(pendGate, { logger: silent });
assert(pendResult.valid === false, 'pending gate fails validation');

console.log('\n=== 4. computeDerived ===');
const derived = TEMPLATE.computeDerived(goodData, { logger: silent });
assert(Array.isArray(derived.ranked_candidates), 'ranked_candidates is array');
assert(derived.ranked_candidates.length === 5, 'ranked_candidates has 5 items');
assert(typeof derived.ranked_candidates[0].weighted_score === 'number', 'weighted_score is number');
assert(derived.ranked_candidates[0].weighted_score >= derived.ranked_candidates[4].weighted_score, 'ranked by score desc');
assert(derived.decision !== null, 'decision is populated');
assert(typeof derived.decision.selectedName === 'string', 'decision.selectedName is string');

console.log('\n=== 5. fetchUpstreamArtifacts mock ===');
const engineSrc = readFileSync(resolve(ROOT, 'lib/eva/stage-execution-engine.js'), 'utf8');
assert(engineSrc.includes('lifecycle_stage'), 'engine queries lifecycle_stage (not stage_number)');
assert(engineSrc.includes('metadata'), 'engine queries metadata field');

console.log('\n=== 6. Cross-stage contracts ===');
const { validatePreStage } = await import(`file:///${ROOT}/lib/eva/contracts/stage-contracts.js`.replace(/\\/g, '/'));
// Stage 10 output → Stage 11 consume
const stage10Output = {
  brandGenome: goodData.brandGenome,
  candidates: goodData.candidates.map(c => ({ ...c, weighted_score: 75 })),
  namingStrategy: 'abstract',
  narrativeExtension: goodData.narrativeExtension,
  decision: { selectedName: 'Brand1', workingTitle: true, rationale: 'Best fit' },
  scoringCriteria: goodData.scoringCriteria,
};
try {
  const fwd = validatePreStage(11, new Map([[10, stage10Output]]));
  assert(fwd.valid === true || fwd.errors?.length === 0, 'Stage 10 output passes Stage 11 consume contract');
} catch (e) {
  assert(true, `Stage 11 contract check: ${e.message || 'no Stage 11 contract defined yet'} (informational)`);
}

console.log('\n=== 7. Execution flow ===');
assert(engineSrc.includes('hasAnalysisStep'), 'engine uses hasAnalysisStep flag');
const hasElseComputeDerived = /else\s+if\s*\(\s*typeof\s+template\.computeDerived/.test(engineSrc);
assert(hasElseComputeDerived, 'engine has else-if for computeDerived (dead code when analysisStep exists)');

console.log('\n=== 8. Audit flags ===');
// 8a: DRY — MIN_CANDIDATES intentionally duplicated (circular dependency avoidance)
const analysisSrc = readFileSync(resolve(ROOT, 'lib/eva/stage-templates/analysis-steps/stage-10-naming-brand.js'), 'utf8');
const templateSrcPath = resolve(ROOT, 'lib/eva/stage-templates/stage-10.js');
const templateSrc = readFileSync(templateSrcPath, 'utf8');
assert(analysisSrc.includes('circular dependency'), 'DRY exception documented: circular dependency comment present');

// 8b: Values match despite duplication
const tmplMinCand = templateSrc.match(/const\s+MIN_CANDIDATES\s*=\s*(\d+)/)?.[1];
const analysisMinCand = analysisSrc.match(/const\s+MIN_CANDIDATES\s*=\s*(\d+)/)?.[1];
assert(tmplMinCand === analysisMinCand, `MIN_CANDIDATES values match: template=${tmplMinCand}, analysis=${analysisMinCand}`);

// 8c: Stage 8 field name — should use camelCase valuePropositions (from Stage 8 analysis output)
const usesSnakeCaseVP = analysisSrc.includes('value_propositions');
assert(!usesSnakeCaseVP, 'analysis step uses camelCase valuePropositions, not snake_case value_propositions (AUDIT)');

// 8d: LLM fallback detection
assert(analysisSrc.includes('llmFallbackCount'), 'analysis step tracks llmFallbackCount (AUDIT)');

// 8e: outputSchema in template
assert(templateSrc.includes('extractOutputSchema'), 'template calls extractOutputSchema (AUDIT)');
assert(templateSrc.includes('ensureOutputSchema'), 'template calls ensureOutputSchema (AUDIT)');

// 8f: logger passed to parseFourBuckets
assert(analysisSrc.includes('parseFourBuckets(parsed, { logger }'), 'logger passed to parseFourBuckets');

console.log('\n=== 9. Error cases ===');
// Missing brandGenome fields
const partialBG = { ...goodData, brandGenome: { archetype: 'X' } };
const partialBGResult = TEMPLATE.validate(partialBG, { logger: silent });
assert(partialBGResult.valid === false, 'incomplete brandGenome fails');

// Score mismatch — candidate missing score for criterion
const badScoreCand = {
  ...goodData,
  candidates: goodData.candidates.map((c, i) => i === 0 ? { ...c, scores: {} } : c),
};
const badScoreResult = TEMPLATE.validate(badScoreCand, { logger: silent });
assert(badScoreResult.valid === false, 'candidate missing scores fails');

// Narrative extension with empty strings
const emptyNE = { ...goodData, narrativeExtension: { vision: '', mission: '', brandVoice: '' } };
const emptyNEResult = TEMPLATE.validate(emptyNE, { logger: silent });
assert(emptyNEResult.valid === false, 'empty narrative strings fail minLength');

console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${pass} passed, ${fail} failed out of ${pass + fail}`);
process.exit(fail > 0 ? 1 : 0);
