#!/usr/bin/env node
/** Stage 7 E2E Test — Pricing Strategy (node scripts/test-stage7-e2e.js)
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
          let filtered = [...rows];
          for (const f of eqFilters) filtered = filtered.filter(r => r[f.c] === f.v);
          for (const f of inFilters) filtered = filtered.filter(r => f.v.includes(r[f.c]));
          resolve({ data: filtered.length === 0 ? null : filtered, error: null });
        },
      };
      return chain;
    },
  };
}

async function run() {
  console.log('\n═══ Stage 07 E2E Tests ═══\n');

  const stage07Mod = await import(toURL('lib/eva/stage-templates/stage-07.js'));
  const stage07Template = stage07Mod.default;
  const { BILLING_PERIODS, PRICING_MODELS } = stage07Mod;
  const { validatePreStage } = await import(toURL('lib/eva/contracts/stage-contracts.js'));
  const { fetchUpstreamArtifacts } = await import(toURL('lib/eva/stage-execution-engine.js'));

  // ═══════════════════════════════════════════════════════════════════
  // 1. Template Structure
  // ═══════════════════════════════════════════════════════════════════
  console.log('── 1. Template Structure ──');
  assert(stage07Template.id === 'stage-07', 'Template ID');
  assert(stage07Template.slug === 'pricing', 'Template slug');
  assert(stage07Template.version === '2.0.0', 'Template version');
  assert(typeof stage07Template.validate === 'function', 'Has validate()');
  assert(typeof stage07Template.computeDerived === 'function', 'Has computeDerived()');
  assert(typeof stage07Template.analysisStep === 'function', 'Has analysisStep');
  assert(stage07Template.outputSchema !== undefined, 'outputSchema attached');
  assert(stage07Template.schema.tiers, 'Schema: tiers');
  assert(stage07Template.schema.pricing_model, 'Schema: pricing_model');
  assert(stage07Template.schema.gross_margin_pct, 'Schema: gross_margin_pct');
  assert(stage07Template.schema.churn_rate_monthly, 'Schema: churn_rate_monthly');
  assert(stage07Template.schema.cac, 'Schema: cac');
  assert(stage07Template.schema.arpa, 'Schema: arpa');
  assert(stage07Template.schema.ltv, 'Schema: ltv (derived)');
  assert(stage07Template.schema.cac_ltv_ratio, 'Schema: cac_ltv_ratio (derived)');
  assert(stage07Template.schema.payback_months, 'Schema: payback_months (derived)');
  assert(Array.isArray(BILLING_PERIODS) && BILLING_PERIODS.length === 3, 'BILLING_PERIODS has 3 items');
  assert(Array.isArray(PRICING_MODELS) && PRICING_MODELS.length === 6, 'PRICING_MODELS has 6 items');

  // ═══════════════════════════════════════════════════════════════════
  // 2. Template Validation
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n── 2. Template Validation ──');

  const goodTier = {
    name: 'Pro', price: 49, billing_period: 'monthly',
    target_segment: 'SMBs', included_units: '100 users',
  };

  const goodData = {
    currency: 'USD', pricing_model: 'subscription',
    tiers: [goodTier], gross_margin_pct: 70,
    churn_rate_monthly: 5, cac: 200, arpa: 49,
  };

  const v1 = stage07Template.validate(goodData, {}, { logger: silentLogger });
  assert(v1.valid === true && v1.errors.length === 0, 'Valid data passes');

  // Multiple tiers
  const multiTier = { ...goodData, tiers: [goodTier, { ...goodTier, name: 'Enterprise', price: 199 }] };
  const v2 = stage07Template.validate(multiTier, {}, { logger: silentLogger });
  assert(v2.valid === true, 'Multiple valid tiers pass');

  // Empty tiers
  const v3 = stage07Template.validate({ ...goodData, tiers: [] }, {}, { logger: silentLogger });
  assert(v3.valid === false, 'Empty tiers fails (minItems: 1)');

  // Invalid pricing_model
  const v4 = stage07Template.validate({ ...goodData, pricing_model: 'barter' }, {}, { logger: silentLogger });
  assert(v4.valid === false, 'Invalid pricing_model fails');

  // Missing currency
  const v5 = stage07Template.validate({ ...goodData, currency: '' }, {}, { logger: silentLogger });
  assert(v5.valid === false, 'Empty currency fails');

  // Invalid billing_period
  const badBilling = { ...goodData, tiers: [{ ...goodTier, billing_period: 'weekly' }] };
  const v6 = stage07Template.validate(badBilling, {}, { logger: silentLogger });
  assert(v6.valid === false, 'Invalid billing_period fails');

  // gross_margin_pct > 100
  const v7 = stage07Template.validate({ ...goodData, gross_margin_pct: 101 }, {}, { logger: silentLogger });
  assert(v7.valid === false, 'gross_margin_pct > 100 fails');

  // churn_rate_monthly > 100
  const v8 = stage07Template.validate({ ...goodData, churn_rate_monthly: 101 }, {}, { logger: silentLogger });
  assert(v8.valid === false, 'churn_rate_monthly > 100 fails');

  // Negative cac
  const v9 = stage07Template.validate({ ...goodData, cac: -10 }, {}, { logger: silentLogger });
  assert(v9.valid === false, 'Negative cac fails');

  // Cross-stage prereqs: stage05
  const v10 = stage07Template.validate(goodData, { stage05: { unitEconomics: {} } }, { logger: silentLogger });
  assert(v10.valid === true, 'Cross-stage with stage05 passes');

  // All 6 pricing models valid
  for (const model of PRICING_MODELS) {
    const vm = stage07Template.validate({ ...goodData, pricing_model: model }, {}, { logger: silentLogger });
    assert(vm.valid === true, `pricing_model "${model}" passes`);
  }

  // ═══════════════════════════════════════════════════════════════════
  // 3. computeDerived
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n── 3. computeDerived ──');

  // Standard case: churn 5%, gross margin 70%, arpa 49, cac 200
  const d1 = stage07Template.computeDerived(goodData, { logger: silentLogger });

  // LTV = (ARPA * gross_margin_pct/100) / churn_decimal
  // = (49 * 0.70) / 0.05 = 34.3 / 0.05 = 686
  const expectedLTV = (49 * 0.70) / 0.05;
  assert(Math.abs(d1.ltv - expectedLTV) < 0.01, `LTV = ${expectedLTV} (got ${d1.ltv})`);

  // CAC:LTV = 200 / 686 ≈ 0.2915
  const expectedRatio = 200 / expectedLTV;
  assert(Math.abs(d1.cac_ltv_ratio - expectedRatio) < 0.01, `CAC:LTV ratio ≈ ${expectedRatio.toFixed(4)} (got ${d1.cac_ltv_ratio})`);

  // Payback = CAC / (ARPA * gross_margin_pct/100) = 200 / 34.3 ≈ 5.83
  const expectedPayback = 200 / (49 * 0.70);
  assert(Math.abs(d1.payback_months - expectedPayback) < 0.01, `Payback ≈ ${expectedPayback.toFixed(2)} months (got ${d1.payback_months})`);

  assert(d1.warnings.length === 0, 'No warnings for standard case');
  assert(d1.positioningDecision !== null, 'positioningDecision computed');
  assert(d1.positioningDecision.position === 'subscription', 'positioningDecision.position = subscription');

  // Zero churn: LTV = null with warning
  const zeroChurn = { ...goodData, churn_rate_monthly: 0 };
  const d2 = stage07Template.computeDerived(zeroChurn, { logger: silentLogger });
  assert(d2.ltv === null, 'Zero churn → LTV null');
  assert(d2.cac_ltv_ratio === null, 'Zero churn → CAC:LTV null');
  assert(d2.warnings.some(w => w.type === 'churn_zero'), 'Zero churn produces warning');

  // High churn: warning
  const highChurn = { ...goodData, churn_rate_monthly: 35 };
  const d3 = stage07Template.computeDerived(highChurn, { logger: silentLogger });
  assert(d3.warnings.some(w => w.type === 'high_churn'), 'High churn (35%) produces warning');

  // Zero gross profit: payback null with warning
  const zeroMargin = { ...goodData, gross_margin_pct: 0 };
  const d4 = stage07Template.computeDerived(zeroMargin, { logger: silentLogger });
  assert(d4.payback_months === null || d4.payback_months === undefined || !Number.isFinite(d4.payback_months) || d4.warnings.some(w => w.type === 'zero_gross_profit'),
    'Zero margin → payback issue handled');

  // No pricing_model → null positioningDecision
  const noPM = { ...goodData, pricing_model: null };
  const d5 = stage07Template.computeDerived(noPM, { logger: silentLogger });
  assert(d5.positioningDecision === null, 'Null pricing_model → null positioningDecision');

  // ═══════════════════════════════════════════════════════════════════
  // 4. fetchUpstreamArtifacts
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n── 4. fetchUpstreamArtifacts ──');
  const mockSupa = createMockSupabase({
    venture_artifacts: [
      { lifecycle_stage: 1, metadata: { description: 'AI tool' }, content: {}, venture_id: 'test-v', is_current: true },
      { lifecycle_stage: 5, metadata: { unitEconomics: { cac: 100 } }, content: {}, venture_id: 'test-v', is_current: true },
    ],
  });

  const upstream = await fetchUpstreamArtifacts(mockSupa, 'test-v', [1, 5]);
  assert(upstream !== null, 'fetchUpstreamArtifacts returns data');
  const hasS1 = upstream.stage1Data || upstream['1'];
  const hasS5 = upstream.stage5Data || upstream['5'];
  assert(hasS1 !== undefined, 'Upstream has stage 1');
  assert(hasS5 !== undefined, 'Upstream has stage 5');

  // ═══════════════════════════════════════════════════════════════════
  // 5. Cross-Stage Contracts
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n── 5. Cross-Stage Contracts ──');

  // Stage 7 consumes Stage 5 unitEconomics
  const c1 = validatePreStage(7, new Map([[5, { unitEconomics: { cac: 100 } }]]), { logger: silentLogger });
  assert(c1.valid === true, 'Stage 5 → Stage 7 contract passes');

  // Stage 8 consumes Stage 7 pricing_model + tiers
  const s7Output = { pricing_model: 'subscription', tiers: [goodTier] };
  const c2 = validatePreStage(8, new Map([[7, s7Output]]), { logger: silentLogger });
  assert(c2.valid === true, 'Stage 7 → Stage 8 contract passes');

  // ═══════════════════════════════════════════════════════════════════
  // 6. Execution Flow
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n── 6. Execution Flow ──');
  assert(typeof stage07Template.analysisStep === 'function', 'analysisStep registered');
  assert(typeof stage07Template.computeDerived === 'function', 'computeDerived exists (dead code)');

  // ═══════════════════════════════════════════════════════════════════
  // 7. Analysis Step Audit Flags (source inspection)
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n── 7. Analysis Step Audit ──');
  const src = readFileSync(join(ROOT, 'lib/eva/stage-templates/analysis-steps/stage-07-pricing-strategy.js'), 'utf8');

  // Check: does analysis step import PRICING_MODELS from template (DRY)?
  const importsFromTemplate = src.includes("from '../stage-07.js'") || src.includes("from '../stage-07'");
  assert(importsFromTemplate, '[AUDIT] Should import PRICING_MODELS from template (DRY)');

  // Check: does analysis step produce pricing_model (snake_case to match template)?
  const hasPricingModelSnake = src.includes('pricing_model');
  assert(hasPricingModelSnake, '[AUDIT] Should output pricing_model (snake_case, not camelCase)');

  // Check: does analysis step produce flat unit economics fields?
  const hasFlatUnitEcon = /gross_margin_pct\s*[=,]/.test(src) && /churn_rate_monthly\s*[=,]/.test(src);
  assert(hasFlatUnitEcon, '[AUDIT] Analysis step produces flat unit economics fields');

  // Check: does analysis step use current Stage 5 field name (churnRate, not monthlyChurn)?
  const usesChurnRate = src.includes('churnRate');
  const usesMonthlyChurn = src.includes('monthlyChurn');
  assert(usesChurnRate || !usesMonthlyChurn, '[AUDIT] Should use churnRate (not stale monthlyChurn) from Stage 5');

  // Check: LLM fallback detection
  const hasFallback = src.includes('llmFallback') || src.includes('fallbackCount');
  assert(hasFallback, '[AUDIT] Analysis step should have LLM fallback detection');

  // Check: PRICING_MODELS enum values match template
  const templateModels = PRICING_MODELS;
  const srcModelMatch = src.match(/PRICING_MODELS\s*=\s*\[([\s\S]*?)\]/);
  if (srcModelMatch) {
    const srcModels = srcModelMatch[1].match(/'([^']+)'/g)?.map(s => s.replace(/'/g, ''));
    const match = srcModels && templateModels.every(m => srcModels.includes(m)) && srcModels.every(m => templateModels.includes(m));
    assert(match, `[AUDIT] Analysis step PRICING_MODELS should match template (template: ${templateModels.join(',')})`);
  } else {
    // If no local PRICING_MODELS, it's imported from template (good)
    assert(importsFromTemplate, '[AUDIT] PRICING_MODELS should be imported or match template');
  }

  // ═══════════════════════════════════════════════════════════════════
  // 8. Error Cases
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n── 8. Error Cases ──');

  // Validate with no tiers
  const noTiers = stage07Template.validate({ ...goodData, tiers: null }, {}, { logger: silentLogger });
  assert(noTiers.valid === false, 'Null tiers fails');

  // Validate with empty object
  const empty = stage07Template.validate({}, {}, { logger: silentLogger });
  assert(empty.valid === false, 'Empty object fails');

  // computeDerived with zero arpa
  const zeroArpa = stage07Template.computeDerived({ ...goodData, arpa: 0 }, { logger: silentLogger });
  assert(zeroArpa.ltv !== undefined, 'Zero arpa → computeDerived does not crash');

  // ═══════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════
  console.log(`\n═══ Results: ${passed} passed, ${failed} failed ═══`);
  if (failures.length > 0) {
    console.log('\nFailures:');
    failures.forEach(f => console.log(`  ❌ ${f}`));
  }
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
