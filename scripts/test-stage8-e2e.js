#!/usr/bin/env node
/** Stage 8 E2E Test — Business Model Canvas (node scripts/test-stage8-e2e.js)
 * Tests: template validation, computeDerived, cross-stage contracts,
 *        analysis step structure audit, fetchUpstreamArtifacts, error cases.
 */
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const toURL = (p) => `file://${join(ROOT, p).replace(/\\/g, '/')}`;

let passed = 0, failed = 0;
const failures = [];
function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS  ${label}`); }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}`); }
}

const silentLogger = { log() {}, warn() {}, error() {}, info() {} };

function createMockSupabase(tableData = {}) {
  return {
    from(table) {
      let eqFilters = [], inFilters = [];
      const chain = {
        select: () => chain, eq: (c, v) => { eqFilters.push({ c, v }); return chain; },
        in: (c, v) => { inFilters.push({ c, v }); return chain; },
        order: () => chain, limit: () => chain, maybeSingle: () => chain, single: () => chain,
        then(resolve) {
          const rows = tableData[table] || [];
          const stageFilter = eqFilters.find(f => f.c === 'lifecycle_stage');
          if (stageFilter) {
            const match = rows.find(r => r.lifecycle_stage === stageFilter.v);
            resolve({ data: match || null, error: null });
          } else { resolve({ data: rows, error: null }); }
        },
      };
      return chain;
    },
  };
}

const BMC_BLOCK_NAMES = [
  'customerSegments', 'valuePropositions', 'channels', 'customerRelationships',
  'revenueStreams', 'keyResources', 'keyActivities', 'keyPartnerships', 'costStructure',
];

function makeValidItem(text = 'Test item', priority = 1) {
  return { text, priority, evidence: 'Source: Stage 1' };
}

function makeValidBMCData() {
  const data = {};
  for (const block of BMC_BLOCK_NAMES) {
    const minItems = block === 'keyPartnerships' ? 1 : 2;
    data[block] = { items: Array.from({ length: minItems }, (_, i) => makeValidItem(`${block} item ${i + 1}`)) };
  }
  return data;
}

(async () => {
  console.log('\n=== Stage 8: Business Model Canvas — E2E Tests ===\n');

  // ── Load template ──
  const { default: TEMPLATE, BMC_BLOCKS, MIN_ITEMS, DEFAULT_MIN_ITEMS } = await import(toURL('lib/eva/stage-templates/stage-08.js'));

  console.log('— Template structure —');
  assert(TEMPLATE.id === 'stage-08', 'Template id is stage-08');
  assert(TEMPLATE.slug === 'bmc', 'Template slug is bmc');
  assert(TEMPLATE.version === '2.0.0', 'Template version is 2.0.0');
  assert(typeof TEMPLATE.validate === 'function', 'Template has validate()');
  assert(typeof TEMPLATE.computeDerived === 'function', 'Template has computeDerived()');
  assert(typeof TEMPLATE.analysisStep === 'function', 'Template has analysisStep()');
  assert(TEMPLATE.outputSchema && typeof TEMPLATE.outputSchema === 'object', 'Template has outputSchema');
  assert(Array.isArray(BMC_BLOCKS) && BMC_BLOCKS.length === 9, 'BMC_BLOCKS has 9 blocks');
  assert(BMC_BLOCKS.includes('customerSegments'), 'BMC_BLOCKS includes customerSegments');
  assert(BMC_BLOCKS.includes('revenueStreams'), 'BMC_BLOCKS includes revenueStreams');
  assert(MIN_ITEMS.keyPartnerships === 1, 'keyPartnerships min items is 1');
  assert(DEFAULT_MIN_ITEMS === 2, 'Default min items is 2');

  // All 9 blocks in schema
  for (const block of BMC_BLOCK_NAMES) {
    assert(TEMPLATE.schema[block] !== undefined, `Schema has ${block}`);
  }

  // defaultData has all 9 blocks with empty items
  for (const block of BMC_BLOCK_NAMES) {
    assert(TEMPLATE.defaultData[block]?.items !== undefined && Array.isArray(TEMPLATE.defaultData[block].items), `defaultData has ${block}.items`);
  }

  // ── Validation — valid data ──
  console.log('\n— Validation (valid data) —');
  const validData = makeValidBMCData();
  const validResult = TEMPLATE.validate(validData, null, { logger: silentLogger });
  assert(validResult.valid === true, 'Valid BMC data passes validation');
  assert(validResult.errors.length === 0, 'No errors for valid data');

  // ── Validation — missing blocks ──
  console.log('\n— Validation (missing blocks) —');
  const missingBlocks = { customerSegments: { items: [makeValidItem(), makeValidItem()] } };
  const missingResult = TEMPLATE.validate(missingBlocks, null, { logger: silentLogger });
  assert(missingResult.valid === false, 'Missing blocks fails validation');
  assert(missingResult.errors.length >= 8, 'At least 8 errors for 8 missing blocks');

  // ── Validation — empty items ──
  console.log('\n— Validation (empty items) —');
  const emptyItems = {};
  for (const block of BMC_BLOCK_NAMES) { emptyItems[block] = { items: [] }; }
  const emptyResult = TEMPLATE.validate(emptyItems, null, { logger: silentLogger });
  assert(emptyResult.valid === false, 'Empty items fails validation');

  // ── Validation — keyPartnerships needs only 1 item ──
  console.log('\n— Validation (keyPartnerships min items) —');
  const partnerData = makeValidBMCData();
  partnerData.keyPartnerships = { items: [makeValidItem()] };
  const partnerResult = TEMPLATE.validate(partnerData, null, { logger: silentLogger });
  assert(partnerResult.valid === true, 'keyPartnerships with 1 item is valid');

  // ── Validation — invalid priority (0, 4, non-integer) ──
  console.log('\n— Validation (invalid priority) —');
  const badPriority = makeValidBMCData();
  badPriority.customerSegments.items[0].priority = 0;
  const prioResult = TEMPLATE.validate(badPriority, null, { logger: silentLogger });
  assert(prioResult.valid === false, 'Priority 0 fails validation');

  const highPriority = makeValidBMCData();
  highPriority.customerSegments.items[0].priority = 4;
  const highPrioResult = TEMPLATE.validate(highPriority, null, { logger: silentLogger });
  assert(highPrioResult.valid === false, 'Priority 4 fails validation');

  // ── Validation — empty text ──
  console.log('\n— Validation (empty text) —');
  const emptyText = makeValidBMCData();
  emptyText.valuePropositions.items[0].text = '';
  const textResult = TEMPLATE.validate(emptyText, null, { logger: silentLogger });
  assert(textResult.valid === false, 'Empty text fails validation');

  // ── Validation — cross-stage contract (Stage 7 prerequisites) ──
  console.log('\n— Validation (cross-stage prerequisites) —');
  const stage07Good = { pricing_model: 'subscription', tiers: [{ name: 'Basic', price: 29, billing_period: 'monthly', target_segment: 'SMB' }] };
  const crossGood = TEMPLATE.validate(validData, { stage07: stage07Good }, { logger: silentLogger });
  assert(crossGood.valid === true, 'Valid Stage 7 prerequisites pass');

  const stage07Bad = { pricing_model: null, tiers: [] };
  const crossBad = TEMPLATE.validate(validData, { stage07: stage07Bad }, { logger: silentLogger });
  // Note: validateCrossStageContract may not fail for null string depending on implementation
  // But empty tiers should fail minItems:1
  assert(crossBad.errors.length > 0 || crossBad.valid === false, 'Bad Stage 7 prerequisites produce errors or fail');

  // ── computeDerived ──
  console.log('\n— computeDerived —');
  const derived = TEMPLATE.computeDerived(validData, { logger: silentLogger });
  assert(Array.isArray(derived.cross_links), 'computeDerived returns cross_links array');
  assert(derived.cross_links.length === 2, 'cross_links has 2 entries');
  assert(derived.cross_links.some(l => l.stage_id === 'stage-06'), 'cross_links references stage-06');
  assert(derived.cross_links.some(l => l.stage_id === 'stage-07'), 'cross_links references stage-07');
  // Verify all BMC blocks preserved
  for (const block of BMC_BLOCK_NAMES) {
    assert(derived[block]?.items !== undefined, `computeDerived preserves ${block}`);
  }

  // ── fetchUpstreamArtifacts mock ──
  console.log('\n— fetchUpstreamArtifacts —');
  const { fetchUpstreamArtifacts } = await import(toURL('lib/eva/stage-execution-engine.js'));
  const stage7Artifact = {
    lifecycle_stage: 'stage_7_pricing',
    metadata: { pricing_model: 'subscription', tiers: [{ name: 'Pro', price: 49 }], arpa: 49, gross_margin_pct: 70 },
  };
  const mockSupabase = createMockSupabase({
    venture_artifacts: [stage7Artifact],
  });
  const upstream = await fetchUpstreamArtifacts(mockSupabase, 'test-venture-id', 8, { logger: silentLogger });
  assert(upstream !== null && typeof upstream === 'object', 'fetchUpstreamArtifacts returns object');

  // ── Cross-stage contracts (Stage 7→8 and Stage 8→9) ──
  console.log('\n— Cross-stage contracts —');
  const { validatePreStage } = await import(toURL('lib/eva/contracts/stage-contracts.js'));

  // Stage 7 output → Stage 8 consume contract
  const stage7Output = new Map([[7, { pricing_model: 'subscription', tiers: [{ name: 'Pro', price: 49 }] }]]);
  const pre8 = validatePreStage(8, stage7Output);
  assert(pre8.valid === true, 'Stage 7 output satisfies Stage 8 consume contract');

  // Stage 8 output → Stage 9 consume contract
  const stage8Output = {
    customerSegments: { items: [makeValidItem('SMB'), makeValidItem('Enterprise')] },
    valuePropositions: { items: [makeValidItem('Save time'), makeValidItem('Reduce cost')] },
    revenueStreams: { items: [makeValidItem('Subscriptions'), makeValidItem('Services')] },
  };
  const multiStageMap = new Map([
    [6, { risks: [{ category: 'Market', score: 10 }], aggregate_risk_score: 10 }],
    [7, { tiers: [{ name: 'Pro', price: 49 }] }],
    [8, stage8Output],
  ]);
  const pre9 = validatePreStage(9, multiStageMap);
  assert(pre9.valid === true, 'Stage 8 output satisfies Stage 9 consume contract');

  // ── Execution flow ──
  console.log('\n— Execution flow —');
  const engineSrc = readFileSync(join(ROOT, 'lib/eva/stage-execution-engine.js'), 'utf8');
  const hasAnalysisFirst = /if\s*\(hasAnalysisStep\)/.test(engineSrc);
  const hasComputeElse = /else\s+if\s*\(typeof\s+template\.computeDerived/.test(engineSrc);
  assert(hasAnalysisFirst && hasComputeElse, 'Engine uses if/else between analysisStep and computeDerived (computeDerived is dead code)');
  assert(typeof TEMPLATE.analysisStep === 'function', 'Template has analysisStep (overrides computeDerived)');

  // ── Analysis step audit flags ──
  console.log('\n— Analysis step audit flags —');
  const analysisSrc = readFileSync(join(ROOT, 'lib/eva/stage-templates/analysis-steps/stage-08-bmc-generation.js'), 'utf8');

  // AUDIT: BMC_BLOCKS imported from template (DRY)
  const importsBMCFromTemplate = /import\s+\{[^}]*BMC_BLOCKS[^}]*\}\s+from\s+['"]\.\.\/stage-08\.js['"]/.test(analysisSrc);
  assert(importsBMCFromTemplate, '[AUDIT] Analysis step imports BMC_BLOCKS from template (DRY)');

  // AUDIT: Stage 7 field names use snake_case (pricing_model, not pricingModel)
  const usesSnakeCasePricingModel = /stage7Data\.pricing_model/.test(analysisSrc) || /stage7Data\?\.\s*pricing_model/.test(analysisSrc);
  const usesOldCamelCase = /stage7Data\.pricingModel/.test(analysisSrc) || /stage7Data\?\.\s*pricingModel/.test(analysisSrc);
  assert(usesSnakeCasePricingModel && !usesOldCamelCase, '[AUDIT] Stage 7 pricing_model uses snake_case (PR #1754 alignment)');

  // AUDIT: Stage 7 arpa is top-level (not nested under unitEconomics)
  const usesTopLevelArpa = /stage7Data\.arpa|stage7Data\?\.\s*arpa/.test(analysisSrc);
  const usesNestedArpa = /stage7Data\.unitEconomics\?\.\s*arpa|stage7Data\?\.\unitEconomics\?\.\s*arpa/.test(analysisSrc);
  assert(usesTopLevelArpa && !usesNestedArpa, '[AUDIT] Stage 7 arpa is top-level (not nested under unitEconomics)');

  // AUDIT: LLM fallback detection
  const hasLLMFallback = /llmFallbackCount/.test(analysisSrc);
  assert(hasLLMFallback, '[AUDIT] Analysis step has LLM fallback detection (llmFallbackCount)');

  // AUDIT: Logger passed to parseFourBuckets
  const loggerPassed = /parseFourBuckets\([^)]*logger/.test(analysisSrc);
  assert(loggerPassed, '[AUDIT] Logger passed to parseFourBuckets');

  // ── Error cases ──
  console.log('\n— Error cases —');

  // Null data
  const nullResult = TEMPLATE.validate(null, null, { logger: silentLogger });
  assert(nullResult.valid === false, 'Null data fails validation');

  // Block is not an object
  const badBlock = makeValidBMCData();
  badBlock.channels = 'not an object';
  const badBlockResult = TEMPLATE.validate(badBlock, null, { logger: silentLogger });
  assert(badBlockResult.valid === false, 'Non-object block fails validation');

  // Item missing text
  const noText = makeValidBMCData();
  delete noText.revenueStreams.items[0].text;
  const noTextResult = TEMPLATE.validate(noText, null, { logger: silentLogger });
  assert(noTextResult.valid === false, 'Item without text fails validation');

  // ── Summary ──
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failures.length > 0) {
    console.log('\nFailures:');
    failures.forEach(f => console.log(`  ✗ ${f}`));
  }
  process.exit(failed > 0 ? 1 : 0);
})();
