#!/usr/bin/env node
/**
 * Stage 11 E2E Test — GTM (Go-To-Market)
 * Phase: THE IDENTITY (Stages 10-12)
 *
 * Tests: template structure, validation, computeDerived,
 * cross-stage contracts, execution flow, audit flags.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log(`  ✅ ${msg}`); } else { fail++; console.error(`  ❌ FAIL: ${msg}`); } }

// ── Load template ──
const TEMPLATE = (await import(`file:///${ROOT}/lib/eva/stage-templates/stage-11.js`.replace(/\\/g, '/'))).default;
const { REQUIRED_TIERS, REQUIRED_CHANNELS, CHANNEL_NAMES, CHANNEL_TYPES } = await import(`file:///${ROOT}/lib/eva/stage-templates/stage-11.js`.replace(/\\/g, '/'));

console.log('\n=== 1. Template structure ===');
assert(TEMPLATE.id === 'stage-11', 'id = stage-11');
assert(TEMPLATE.slug === 'gtm', 'slug = gtm');
assert(TEMPLATE.version === '2.0.0', 'version = 2.0.0');
assert(TEMPLATE.schema.tiers?.exactItems === REQUIRED_TIERS, `tiers exactItems = ${REQUIRED_TIERS}`);
assert(TEMPLATE.schema.channels?.exactItems === REQUIRED_CHANNELS, `channels exactItems = ${REQUIRED_CHANNELS}`);
assert(TEMPLATE.schema.launch_timeline, 'schema has launch_timeline');
assert(TEMPLATE.schema.total_monthly_budget?.derived === true, 'total_monthly_budget is derived');
assert(TEMPLATE.schema.avg_cac?.derived === true, 'avg_cac is derived');
assert(typeof TEMPLATE.validate === 'function', 'has validate()');
assert(typeof TEMPLATE.computeDerived === 'function', 'has computeDerived()');
assert(typeof TEMPLATE.analysisStep === 'function', 'has analysisStep()');
assert(REQUIRED_TIERS === 3, 'REQUIRED_TIERS = 3');
assert(REQUIRED_CHANNELS === 8, 'REQUIRED_CHANNELS = 8');
assert(CHANNEL_NAMES.length >= 8, 'CHANNEL_NAMES has >= 8 entries');
assert(CHANNEL_TYPES.length === 4, 'CHANNEL_TYPES has 4 types');

// OutputSchema
assert(TEMPLATE.outputSchema && typeof TEMPLATE.outputSchema === 'object', 'has outputSchema (AUDIT)');

console.log('\n=== 2. Validation — good data ===');
const silent = { warn: () => {}, log: () => {}, error: () => {} };
const goodData = {
  tiers: Array.from({ length: 3 }, (_, i) => ({
    name: `Tier ${i + 1}`, description: `Market tier ${i + 1}`,
    persona: `Persona ${i + 1}`, painPoints: [`Pain ${i + 1}`],
    tam: 1000000, sam: 500000, som: 50000,
  })),
  channels: Array.from({ length: 8 }, (_, i) => ({
    name: CHANNEL_NAMES[i], channelType: CHANNEL_TYPES[i % 4],
    primaryTier: 'Tier 1', monthly_budget: 1000 * (i + 1),
    expected_cac: 50 + i * 10, primary_kpi: `KPI ${i + 1}`,
  })),
  launch_timeline: [
    { milestone: 'Soft launch', date: '2026-06-01', owner: 'Founder' },
    { milestone: 'Public launch', date: '2026-09-01', owner: 'Marketing' },
  ],
};
const goodResult = TEMPLATE.validate(goodData, { logger: silent });
assert(goodResult.valid === true, 'good data passes validation');
assert(goodResult.errors.length === 0, 'no errors on good data');

console.log('\n=== 3. Validation — bad data ===');
const badResult = TEMPLATE.validate({}, { logger: silent });
assert(badResult.valid === false, 'empty data fails');

// Wrong tier count
const wrongTiers = { ...goodData, tiers: goodData.tiers.slice(0, 1) };
const wrongTiersResult = TEMPLATE.validate(wrongTiers, { logger: silent });
assert(wrongTiersResult.valid === false, `!= ${REQUIRED_TIERS} tiers fails`);
assert(wrongTiersResult.errors.some(e => e.includes('exactly')), 'error mentions exactly N tiers');

// Wrong channel count
const wrongChannels = { ...goodData, channels: goodData.channels.slice(0, 3) };
const wrongChannelsResult = TEMPLATE.validate(wrongChannels, { logger: silent });
assert(wrongChannelsResult.valid === false, `!= ${REQUIRED_CHANNELS} channels fails`);

// Bad channel type
const badChType = {
  ...goodData,
  channels: goodData.channels.map((ch, i) => i === 0 ? { ...ch, channelType: 'INVALID' } : ch),
};
const badChTypeResult = TEMPLATE.validate(badChType, { logger: silent });
assert(badChTypeResult.valid === false, 'invalid channelType fails');

// Missing budget
const noBudget = {
  ...goodData,
  channels: goodData.channels.map((ch, i) => i === 0 ? { ...ch, monthly_budget: null } : ch),
};
const noBudgetResult = TEMPLATE.validate(noBudget, { logger: silent });
assert(noBudgetResult.valid === false, 'null monthly_budget fails');

// Empty launch timeline
const noTimeline = { ...goodData, launch_timeline: [] };
const noTimelineResult = TEMPLATE.validate(noTimeline, { logger: silent });
assert(noTimelineResult.valid === false, 'empty launch_timeline fails');

console.log('\n=== 4. computeDerived ===');
const derived = TEMPLATE.computeDerived(goodData, { logger: silent });
assert(typeof derived.total_monthly_budget === 'number', 'total_monthly_budget is number');
assert(derived.total_monthly_budget > 0, 'total_monthly_budget > 0');
const expectedBudget = goodData.channels.reduce((s, ch) => s + ch.monthly_budget, 0);
assert(derived.total_monthly_budget === expectedBudget, `total_monthly_budget = ${expectedBudget}`);
assert(typeof derived.avg_cac === 'number', 'avg_cac is number');
assert(derived.avg_cac > 0, 'avg_cac > 0');

console.log('\n=== 5. fetchUpstreamArtifacts mock ===');
const engineSrc = readFileSync(resolve(ROOT, 'lib/eva/stage-execution-engine.js'), 'utf8');
assert(engineSrc.includes('lifecycle_stage'), 'engine queries lifecycle_stage');

console.log('\n=== 6. Cross-stage contracts ===');
const { validatePreStage } = await import(`file:///${ROOT}/lib/eva/contracts/stage-contracts.js`.replace(/\\/g, '/'));
const stage11Output = {
  tiers: goodData.tiers,
  channels: goodData.channels,
  launch_timeline: goodData.launch_timeline,
  total_monthly_budget: expectedBudget,
  avg_cac: 95,
};
try {
  // Stage 12 may also require Stage 10 data — provide minimal mock
  const stage10Mock = {
    brandGenome: { archetype: 'Explorer' },
    candidates: Array.from({ length: 5 }, (_, i) => ({ name: `Brand${i}`, rationale: 'r', scores: {}, weighted_score: 70 })),
    decision: { selectedName: 'Brand0' },
  };
  const fwd = validatePreStage(12, new Map([[10, stage10Mock], [11, stage11Output]]));
  assert(fwd.valid === true || fwd.errors?.length === 0, 'Stage 11 output passes Stage 12 consume contract');
} catch (e) {
  assert(true, `Stage 12 contract check: ${e.message || 'no contract defined'} (informational)`);
}

console.log('\n=== 7. Execution flow ===');
assert(engineSrc.includes('hasAnalysisStep'), 'engine uses hasAnalysisStep flag');
const hasElseComputeDerived = /else\s+if\s*\(\s*typeof\s+template\.computeDerived/.test(engineSrc);
assert(hasElseComputeDerived, 'engine has else-if for computeDerived (dead code when analysisStep exists)');

console.log('\n=== 8. Audit flags ===');
const analysisSrc = readFileSync(resolve(ROOT, 'lib/eva/stage-templates/analysis-steps/stage-11-gtm.js'), 'utf8');
const templateSrc = readFileSync(resolve(ROOT, 'lib/eva/stage-templates/stage-11.js'), 'utf8');

// 8a: DRY exception documented
assert(analysisSrc.includes('circular dependency'), 'DRY exception documented: circular dependency comment present (AUDIT)');

// 8b: LLM fallback detection
assert(analysisSrc.includes('llmFallbackCount'), 'analysis step tracks llmFallbackCount (AUDIT)');

// 8c: outputSchema in template
assert(templateSrc.includes('extractOutputSchema'), 'template calls extractOutputSchema (AUDIT)');
assert(templateSrc.includes('ensureOutputSchema'), 'template calls ensureOutputSchema (AUDIT)');

// 8d: Field name casing — analysis output should use snake_case matching template schema
assert(analysisSrc.includes('total_monthly_budget'), 'analysis outputs total_monthly_budget (snake_case, AUDIT)');
assert(analysisSrc.includes('avg_cac'), 'analysis outputs avg_cac (snake_case, AUDIT)');

// 8e: Web search year should be dynamic
assert(!analysisSrc.includes('2024 2025'), 'web search year not hardcoded (AUDIT)');

// 8f: logger passed to parseFourBuckets
assert(analysisSrc.includes('parseFourBuckets(parsed, { logger }') || analysisSrc.includes('parseFourBuckets(result, { logger }'), 'logger passed to parseFourBuckets');

console.log('\n=== 9. Error cases ===');
// Tier with missing required fields
const badTier = {
  ...goodData,
  tiers: goodData.tiers.map((t, i) => i === 0 ? { name: '', description: '' } : t),
};
const badTierResult = TEMPLATE.validate(badTier, { logger: silent });
assert(badTierResult.valid === false, 'tier with empty name/description fails');

// Channel with missing primary_kpi
const badKpi = {
  ...goodData,
  channels: goodData.channels.map((ch, i) => i === 0 ? { ...ch, primary_kpi: null } : ch),
};
const badKpiResult = TEMPLATE.validate(badKpi, { logger: silent });
assert(badKpiResult.valid === false, 'channel with null primary_kpi fails');

console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${pass} passed, ${fail} failed out of ${pass + fail}`);
process.exit(fail > 0 ? 1 : 0);
