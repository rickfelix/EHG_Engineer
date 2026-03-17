#!/usr/bin/env node
/** Stage 5 E2E Test — Profitability Kill Gate (node scripts/test-stage5-e2e.js)
 * Tests: template validation, evaluateKillGate 3-way gate, computeDerived,
 *        cross-stage contracts, execution flow, error cases.
 */
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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

// ─── Mock Supabase ───────────────────────────────────────────────
function createMockSupabase(tableData = {}, defaults = {}) {
  const { ventureId = 'test-venture-id' } = defaults;
  for (const [table, rows] of Object.entries(tableData)) {
    for (const row of rows) {
      if (table === 'venture_artifacts') {
        if (!('venture_id' in row)) row.venture_id = ventureId;
        if (!('is_current' in row)) row.is_current = true;
        if (!('created_at' in row)) row.created_at = new Date().toISOString();
      }
    }
  }
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
          resolve({ data: filtered.length === 0 ? null : (filtered.length === 1 && (eqFilters.length > 0) ? filtered[0] : filtered), error: null });
        },
      };
      return chain;
    },
  };
}

async function run() {
  console.log('\n═══ Stage 05 E2E Tests ═══\n');

  const stage05Mod = await import(toURL('lib/eva/stage-templates/stage-05.js'));
  const stage05Template = stage05Mod.default;
  const {
    evaluateKillGate, ROI_PASS_THRESHOLD, ROI_CONDITIONAL_THRESHOLD,
    MAX_BREAKEVEN_MONTHS, LTV_CAC_THRESHOLD, PAYBACK_THRESHOLD,
    CONDITIONAL_LTV_CAC_THRESHOLD, CONDITIONAL_PAYBACK_THRESHOLD, ROBUSTNESS_LEVELS,
  } = stage05Mod;

  const { validatePreStage } = await import(toURL('lib/eva/contracts/stage-contracts.js'));
  const { fetchUpstreamArtifacts } = await import(toURL('lib/eva/stage-execution-engine.js'));

  // ═══════════════════════════════════════════════════════════════════
  // 1. Template structure
  // ═══════════════════════════════════════════════════════════════════
  console.log('── 1. Template Structure ──');
  assert(stage05Template.id === 'stage-05', 'Template ID');
  assert(stage05Template.slug === 'profitability', 'Template slug');
  assert(stage05Template.version === '2.0.0', 'Template version');
  assert(typeof stage05Template.validate === 'function', 'Has validate()');
  assert(typeof stage05Template.computeDerived === 'function', 'Has computeDerived()');
  assert(typeof stage05Template.analysisStep === 'function', 'Has analysisStep');
  assert(stage05Template.outputSchema !== undefined, 'outputSchema attached');

  // Schema fields
  assert(stage05Template.schema.initialInvestment, 'Schema: initialInvestment');
  assert(stage05Template.schema.year1, 'Schema: year1');
  assert(stage05Template.schema.unitEconomics, 'Schema: unitEconomics');
  assert(stage05Template.schema.scenarioAnalysis, 'Schema: scenarioAnalysis');
  assert(stage05Template.schema.decision, 'Schema: decision');
  assert(stage05Template.schema.breakEvenMonth, 'Schema: breakEvenMonth');
  assert(stage05Template.schema.roi3y, 'Schema: roi3y');
  assert(stage05Template.schema.blockProgression, 'Schema: blockProgression');
  assert(stage05Template.schema.remediationRoute, 'Schema: remediationRoute');

  // ═══════════════════════════════════════════════════════════════════
  // 2. Template validation (good/bad data)
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n── 2. Template Validation ──');
  const goodData = {
    initialInvestment: 50000,
    year1: { revenue: 120000, cogs: 30000, opex: 40000 },
    year2: { revenue: 250000, cogs: 50000, opex: 60000 },
    year3: { revenue: 400000, cogs: 70000, opex: 80000 },
    unitEconomics: { cac: 100, ltv: 1200, churnRate: 0.03, paybackMonths: 4, grossMargin: 0.7 },
  };

  const v1 = stage05Template.validate(goodData, {}, { logger: silentLogger });
  assert(v1.valid === true && v1.errors.length === 0, 'Valid data passes');

  // Missing initialInvestment
  const v2 = stage05Template.validate({ ...goodData, initialInvestment: null }, {}, { logger: silentLogger });
  assert(v2.valid === false, 'Null initialInvestment fails');

  // Zero initialInvestment
  const v3 = stage05Template.validate({ ...goodData, initialInvestment: 0 }, {}, { logger: silentLogger });
  assert(v3.valid === false, 'Zero initialInvestment fails (min 0.01)');

  // Missing year object
  const v4 = stage05Template.validate({ ...goodData, year1: null }, {}, { logger: silentLogger });
  assert(v4.valid === false, 'Null year1 fails');

  // Missing unitEconomics
  const v5 = stage05Template.validate({ ...goodData, unitEconomics: null }, {}, { logger: silentLogger });
  assert(v5.valid === false, 'Null unitEconomics fails');

  // churnRate > 1
  const v6 = stage05Template.validate({ ...goodData, unitEconomics: { ...goodData.unitEconomics, churnRate: 1.5 } }, {}, { logger: silentLogger });
  assert(v6.valid === false, 'churnRate > 1 fails');

  // grossMargin > 1
  const v7 = stage05Template.validate({ ...goodData, unitEconomics: { ...goodData.unitEconomics, grossMargin: 1.2 } }, {}, { logger: silentLogger });
  assert(v7.valid === false, 'grossMargin > 1 fails');

  // churnRate < 0
  const v8 = stage05Template.validate({ ...goodData, unitEconomics: { ...goodData.unitEconomics, churnRate: -0.1 } }, {}, { logger: silentLogger });
  assert(v8.valid === false, 'churnRate < 0 fails');

  // Cross-stage prereq: stage04 with stage5Handoff
  const v9 = stage05Template.validate(goodData, { stage04: { stage5Handoff: {} } }, { logger: silentLogger });
  assert(v9.valid === true, 'Cross-stage with stage04 stage5Handoff passes');

  // Negative revenue (should still pass validation — min is 0)
  const v10 = stage05Template.validate({ ...goodData, year1: { revenue: 0, cogs: 0, opex: 0 } }, {}, { logger: silentLogger });
  assert(v10.valid === true, 'Zero revenue passes (min 0)');

  // ═══════════════════════════════════════════════════════════════════
  // 3. evaluateKillGate — 3-way decision logic
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n── 3. Kill Gate (3-way) ──');

  // PASS: all above thresholds
  const g1 = evaluateKillGate({ roi3y: 0.30, breakEvenMonth: 18, ltvCacRatio: 3.0, paybackMonths: 12 });
  assert(g1.decision === 'pass' && !g1.blockProgression, 'Full pass: ROI 30%, BE 18, LTV/CAC 3, PB 12');

  // PASS: exact boundaries
  const g2 = evaluateKillGate({ roi3y: 0.25, breakEvenMonth: 24, ltvCacRatio: 2.0, paybackMonths: 18 });
  assert(g2.decision === 'pass', 'Boundary pass: exact thresholds');

  // KILL: ROI < 0.15
  const g3 = evaluateKillGate({ roi3y: 0.10, breakEvenMonth: 12, ltvCacRatio: 5, paybackMonths: 6 });
  assert(g3.decision === 'kill' && g3.blockProgression, 'Kill: ROI 10%');

  // KILL: breakEvenMonth null
  const g4 = evaluateKillGate({ roi3y: 0.30, breakEvenMonth: null, ltvCacRatio: 3, paybackMonths: 10 });
  assert(g4.decision === 'kill', 'Kill: no break-even');

  // KILL: breakEvenMonth > 24
  const g5 = evaluateKillGate({ roi3y: 0.30, breakEvenMonth: 30, ltvCacRatio: 3, paybackMonths: 10 });
  assert(g5.decision === 'kill', 'Kill: break-even > 24');

  // CONDITIONAL_PASS: 0.15 ≤ ROI < 0.25 + strong supplementary
  const g6 = evaluateKillGate({ roi3y: 0.20, breakEvenMonth: 18, ltvCacRatio: 4.0, paybackMonths: 10 });
  assert(g6.decision === 'conditional_pass' && g6.blockProgression, 'Conditional: ROI 20% + strong LTV/CAC & payback');

  // CONDITIONAL_PASS: exactly at 0.15 + strong supplementary
  const g7 = evaluateKillGate({ roi3y: 0.15, breakEvenMonth: 18, ltvCacRatio: 3.0, paybackMonths: 12 });
  assert(g7.decision === 'conditional_pass', 'Conditional: ROI exactly 0.15');

  // KILL: ROI in band but weak LTV/CAC
  const g8 = evaluateKillGate({ roi3y: 0.20, breakEvenMonth: 18, ltvCacRatio: 2.0, paybackMonths: 10 });
  assert(g8.decision === 'kill', 'Kill: ROI 20% + LTV/CAC 2 (need 3)');

  // KILL: ROI in band but payback > 12
  const g9 = evaluateKillGate({ roi3y: 0.20, breakEvenMonth: 18, ltvCacRatio: 4.0, paybackMonths: 15 });
  assert(g9.decision === 'kill', 'Kill: ROI 20% + payback 15 (need ≤12)');

  // KILL: ROI >= 0.25 but LTV/CAC < 2
  const g10 = evaluateKillGate({ roi3y: 0.30, breakEvenMonth: 18, ltvCacRatio: 1.5, paybackMonths: 12 });
  assert(g10.decision === 'kill', 'Kill: good ROI but LTV/CAC 1.5');

  // KILL: ROI >= 0.25 but payback > 18
  const g11 = evaluateKillGate({ roi3y: 0.30, breakEvenMonth: 18, ltvCacRatio: 3.0, paybackMonths: 20 });
  assert(g11.decision === 'kill', 'Kill: good ROI but payback 20');

  // KILL: negative ROI
  const g12 = evaluateKillGate({ roi3y: -0.50, breakEvenMonth: null, ltvCacRatio: 1, paybackMonths: 30 });
  assert(g12.decision === 'kill', 'Kill: negative ROI');
  assert(g12.remediationRoute && g12.remediationRoute.includes('Stage 1'), 'Negative ROI → remediation points to Stage 1');

  // Remediation route: positive but below threshold
  const g13 = evaluateKillGate({ roi3y: 0.05, breakEvenMonth: 12, ltvCacRatio: 5, paybackMonths: 6 });
  assert(g13.remediationRoute && g13.remediationRoute.includes('Stage 2'), 'Low positive ROI → remediation points to Stage 2');

  // Reasons structure
  assert(Array.isArray(g3.reasons) && g3.reasons.length > 0, 'Kill has reasons array');
  assert(g3.reasons[0].type && g3.reasons[0].message, 'Reason has type and message');

  // Threshold constants
  assert(ROI_PASS_THRESHOLD === 0.25, 'ROI_PASS_THRESHOLD = 0.25');
  assert(ROI_CONDITIONAL_THRESHOLD === 0.15, 'ROI_CONDITIONAL_THRESHOLD = 0.15');
  assert(MAX_BREAKEVEN_MONTHS === 24, 'MAX_BREAKEVEN_MONTHS = 24');
  assert(LTV_CAC_THRESHOLD === 2, 'LTV_CAC_THRESHOLD = 2');
  assert(PAYBACK_THRESHOLD === 18, 'PAYBACK_THRESHOLD = 18');
  assert(CONDITIONAL_LTV_CAC_THRESHOLD === 3, 'CONDITIONAL_LTV_CAC = 3');
  assert(CONDITIONAL_PAYBACK_THRESHOLD === 12, 'CONDITIONAL_PAYBACK = 12');
  assert(Array.isArray(ROBUSTNESS_LEVELS) && ROBUSTNESS_LEVELS.includes('resilient'), 'ROBUSTNESS_LEVELS exported');

  // ═══════════════════════════════════════════════════════════════════
  // 4. computeDerived
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n── 4. computeDerived ──');
  const d1 = stage05Template.computeDerived(goodData, { logger: silentLogger });

  assert(d1.grossProfitY1 === 90000, 'grossProfitY1 = 120k - 30k = 90k');
  assert(d1.netProfitY1 === 50000, 'netProfitY1 = 90k - 40k = 50k');
  assert(d1.grossProfitY2 === 200000, 'grossProfitY2 = 250k - 50k = 200k');
  assert(d1.netProfitY2 === 140000, 'netProfitY2 = 200k - 60k = 140k');
  assert(d1.grossProfitY3 === 330000, 'grossProfitY3 = 400k - 70k = 330k');

  // ROI: totalNet = 50k + 140k + 250k = 440k; roi = (440k - 50k) / 50k = 7.8
  const totalNet = d1.netProfitY1 + d1.netProfitY2 + d1.netProfitY3;
  const expectedROI = (totalNet - 50000) / 50000;
  assert(Math.abs(d1.roi3y - expectedROI) < 0.001, `roi3y computed correctly (${d1.roi3y.toFixed(2)})`);

  // Break-even: monthlyNetProfit = 50000/12 ≈ 4166.67; breakEven = ceil(50000/4166.67) = 12
  assert(typeof d1.breakEvenMonth === 'number' && d1.breakEvenMonth > 0, `breakEvenMonth computed (${d1.breakEvenMonth})`);

  // LTV/CAC ratio derived
  assert(d1.unitEconomics.ltvCacRatio === 12, 'ltvCacRatio = 1200/100 = 12');

  // Decision should be pass (high ROI)
  assert(d1.decision === 'pass', 'Good data → pass decision');
  assert(d1.blockProgression === false, 'Pass → no block');

  // Kill case: unprofitable
  const killData = {
    initialInvestment: 200000,
    year1: { revenue: 30000, cogs: 20000, opex: 50000 },
    year2: { revenue: 60000, cogs: 30000, opex: 60000 },
    year3: { revenue: 80000, cogs: 40000, opex: 70000 },
    unitEconomics: { cac: 500, ltv: 300, churnRate: 0.1, paybackMonths: 30, grossMargin: 0.3 },
  };
  const d2 = stage05Template.computeDerived(killData, { logger: silentLogger });
  assert(d2.decision === 'kill', 'Unprofitable → kill');
  assert(d2.blockProgression === true, 'Kill → blocks');
  assert(d2.reasons.length > 0, 'Kill → has reasons');
  assert(d2.remediationRoute !== null, 'Kill → has remediation route');

  // Edge: Y1 net profit is 0 → breakEvenMonth null
  const zeroData = {
    initialInvestment: 100000,
    year1: { revenue: 50000, cogs: 30000, opex: 20000 },
    year2: { revenue: 100000, cogs: 40000, opex: 50000 },
    year3: { revenue: 150000, cogs: 50000, opex: 60000 },
    unitEconomics: { cac: 100, ltv: 500, churnRate: 0.05, paybackMonths: 6, grossMargin: 0.5 },
  };
  // Y1 net = (50k-30k) - 20k = 0 → breakEvenMonth null → kill
  const d3 = stage05Template.computeDerived(zeroData, { logger: silentLogger });
  assert(d3.breakEvenMonth === null, 'Zero Y1 net profit → null breakEvenMonth');
  assert(d3.decision === 'kill', 'Null breakEvenMonth → kill');

  // Edge: cac = 0 → ltvCacRatio null
  const zeroCac = { ...goodData, unitEconomics: { ...goodData.unitEconomics, cac: 0 } };
  const d4 = stage05Template.computeDerived(zeroCac, { logger: silentLogger });
  assert(d4.unitEconomics.ltvCacRatio === null, 'cac 0 → ltvCacRatio null');

  // ═══════════════════════════════════════════════════════════════════
  // 5. fetchUpstreamArtifacts
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n── 5. fetchUpstreamArtifacts ──');
  const MOCK_STAGE1 = { description: 'AI planning', archetype: 'saas', targetMarket: 'SMB' };
  const MOCK_STAGE3 = { overallScore: 72 };
  const MOCK_STAGE4 = { competitors: [], stage5Handoff: { avgMarketPrice: '$49' } };

  const mockSupa = createMockSupabase({
    venture_artifacts: [
      { lifecycle_stage: 1, metadata: MOCK_STAGE1, content: MOCK_STAGE1 },
      { lifecycle_stage: 3, metadata: MOCK_STAGE3, content: MOCK_STAGE3 },
      { lifecycle_stage: 4, metadata: MOCK_STAGE4, content: MOCK_STAGE4 },
    ],
  });

  const upstream = await fetchUpstreamArtifacts(mockSupa, 'test-venture-id', [1, 3, 4]);
  assert(upstream !== null && typeof upstream === 'object', 'fetchUpstreamArtifacts returns object');

  // Check stage data keys exist
  const hasS1 = upstream.stage1Data || upstream['1'];
  const hasS3 = upstream.stage3Data || upstream['3'];
  const hasS4 = upstream.stage4Data || upstream['4'];
  assert(hasS1 !== undefined, 'Upstream has stage 1 data');
  assert(hasS3 !== undefined, 'Upstream has stage 3 data');
  assert(hasS4 !== undefined, 'Upstream has stage 4 data');

  // ═══════════════════════════════════════════════════════════════════
  // 6. Cross-stage contracts
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n── 6. Cross-Stage Contracts ──');

  // Hand-crafted Stage 5 output (what analysis step would produce)
  const stage5Output = {
    initialInvestment: 50000,
    year1: { revenue: 120000, cogs: 30000, opex: 40000 },
    year2: { revenue: 250000, cogs: 50000, opex: 60000 },
    year3: { revenue: 400000, cogs: 70000, opex: 80000 },
    unitEconomics: { cac: 100, ltv: 1200, ltvCacRatio: 12, churnRate: 0.03, paybackMonths: 4, grossMargin: 0.7 },
    decision: 'pass',
    blockProgression: false,
    reasons: [],
  };

  // Stage 6 consumes Stage 5 unitEconomics
  const c1 = validatePreStage(6, new Map([[5, stage5Output]]), { logger: silentLogger });
  assert(c1.valid === true, 'Stage 5 → Stage 6 contract passes');

  // Stage 7 consumes Stage 5 unitEconomics
  const c2 = validatePreStage(7, new Map([[5, stage5Output]]), { logger: silentLogger });
  assert(c2.valid === true, 'Stage 5 → Stage 7 contract passes');

  // Stage 5 consumes Stage 1 archetype + targetMarket
  const c3 = validatePreStage(5, new Map([[1, { archetype: 'saas', targetMarket: 'SMB' }]]), { logger: silentLogger });
  assert(c3.valid === true, 'Stage 1 → Stage 5 contract passes');

  // Missing Stage 1 archetype
  const c4 = validatePreStage(5, new Map([[1, { targetMarket: 'SMB' }]]), { logger: silentLogger });
  assert(c4.valid === false || c4.errors?.length > 0, 'Missing archetype fails Stage 5 contract');

  // ═══════════════════════════════════════════════════════════════════
  // 7. Execution flow verification
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n── 7. Execution Flow ──');
  assert(typeof stage05Template.analysisStep === 'function', 'analysisStep registered on template');
  assert(typeof stage05Template.computeDerived === 'function', 'computeDerived exists (dead code when analysisStep present)');

  // Analysis step exports
  const { ROI_THRESHOLD, MAX_PAYBACK_MONTHS } = await import(toURL('lib/eva/stage-templates/analysis-steps/stage-05-financial-model.js'));
  assert(ROI_THRESHOLD === 0.25, 'Analysis step ROI_THRESHOLD = 0.25');
  assert(MAX_PAYBACK_MONTHS === 24, 'Analysis step MAX_PAYBACK_MONTHS = 24');

  // ═══════════════════════════════════════════════════════════════════
  // 8. Analysis step audit flags (code inspection assertions)
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n── 8. Analysis Step Audit Flags ──');

  // Read analysis step source to verify patterns
  const { readFileSync } = await import('fs');
  const analysisSrc = readFileSync(join(ROOT, 'lib/eva/stage-templates/analysis-steps/stage-05-financial-model.js'), 'utf8');

  // Check: does analysis step import evaluateKillGate from template?
  const usesCanonicalGate = analysisSrc.includes('evaluateKillGate');
  assert(usesCanonicalGate, '[AUDIT] Analysis step should use canonical evaluateKillGate');

  // Check: does analysis step output grossMargin?
  const producesGrossMargin = analysisSrc.includes('grossMargin');
  assert(producesGrossMargin, '[AUDIT] Analysis step should produce grossMargin for template schema');

  // Check: does analysis step output churnRate (not just monthlyChurn)?
  const producesChurnRate = analysisSrc.includes('churnRate');
  assert(producesChurnRate, '[AUDIT] Analysis step should use churnRate (template schema field name)');

  // Check: LLM fallback detection
  const hasFallbackDetection = analysisSrc.includes('llmFallback') || analysisSrc.includes('fallback');
  assert(hasFallbackDetection, '[AUDIT] Analysis step should have LLM fallback detection');

  // Check: logger passed to parseFourBuckets
  const loggerPassed = analysisSrc.includes('parseFourBuckets(parsed, { logger }') || analysisSrc.includes('parseFourBuckets(parsed, {logger}');
  assert(loggerPassed, '[AUDIT] logger should be passed to parseFourBuckets');

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
