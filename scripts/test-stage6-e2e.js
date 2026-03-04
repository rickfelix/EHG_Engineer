#!/usr/bin/env node
/** Stage 6 E2E Test — Risk Matrix (node scripts/test-stage6-e2e.js)
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
  console.log('\n═══ Stage 06 E2E Tests ═══\n');

  const stage06Mod = await import(toURL('lib/eva/stage-templates/stage-06.js'));
  const stage06Template = stage06Mod.default;
  const { RISK_CATEGORIES, RISK_STATUSES } = stage06Mod;
  const { validatePreStage } = await import(toURL('lib/eva/contracts/stage-contracts.js'));
  const { fetchUpstreamArtifacts } = await import(toURL('lib/eva/stage-execution-engine.js'));

  // ═══════════════════════════════════════════════════════════════════
  // 1. Template Structure
  // ═══════════════════════════════════════════════════════════════════
  console.log('── 1. Template Structure ──');
  assert(stage06Template.id === 'stage-06', 'Template ID');
  assert(stage06Template.slug === 'risk-matrix', 'Template slug');
  assert(stage06Template.version === '2.0.0', 'Template version');
  assert(typeof stage06Template.validate === 'function', 'Has validate()');
  assert(typeof stage06Template.computeDerived === 'function', 'Has computeDerived()');
  assert(typeof stage06Template.analysisStep === 'function', 'Has analysisStep');
  assert(stage06Template.outputSchema !== undefined, 'outputSchema attached');
  assert(stage06Template.schema.risks, 'Schema: risks');
  assert(stage06Template.schema.aggregate_risk_score, 'Schema: aggregate_risk_score');
  assert(stage06Template.schema.normalized_risk_score, 'Schema: normalized_risk_score');
  assert(stage06Template.schema.highest_risk_factor, 'Schema: highest_risk_factor');
  assert(stage06Template.schema.mitigation_coverage_pct, 'Schema: mitigation_coverage_pct');
  assert(Array.isArray(RISK_CATEGORIES) && RISK_CATEGORIES.length === 6, 'RISK_CATEGORIES has 6 items');
  assert(Array.isArray(RISK_STATUSES) && RISK_STATUSES.includes('open'), 'RISK_STATUSES exported');

  // ═══════════════════════════════════════════════════════════════════
  // 2. Template Validation
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n── 2. Template Validation ──');

  const goodRisk = {
    id: 'RISK-001', category: 'Market', description: 'Market saturation in target segment',
    severity: 4, probability: 3, impact: 4, mitigation: 'Diversify into adjacent market segments',
    owner: 'CEO', status: 'open', review_date: '2026-04-01',
  };

  const goodData = { risks: [goodRisk] };
  const v1 = stage06Template.validate(goodData, {}, { logger: silentLogger });
  assert(v1.valid === true && v1.errors.length === 0, 'Valid data passes');

  // Multiple risks
  const multiRisk = { risks: [goodRisk, { ...goodRisk, id: 'RISK-002', category: 'Technical' }] };
  const v2 = stage06Template.validate(multiRisk, {}, { logger: silentLogger });
  assert(v2.valid === true, 'Multiple valid risks pass');

  // Empty risks array
  const v3 = stage06Template.validate({ risks: [] }, {}, { logger: silentLogger });
  assert(v3.valid === false, 'Empty risks fails (minItems: 1)');

  // Missing required field (description too short)
  const shortDesc = { risks: [{ ...goodRisk, description: 'Short' }] };
  const v4 = stage06Template.validate(shortDesc, {}, { logger: silentLogger });
  assert(v4.valid === false, 'Short description fails (minLength: 10)');

  // Invalid category
  const badCat = { risks: [{ ...goodRisk, category: 'Unknown' }] };
  const v5 = stage06Template.validate(badCat, {}, { logger: silentLogger });
  assert(v5.valid === false, 'Invalid category fails');

  // Severity out of range
  const badSev = { risks: [{ ...goodRisk, severity: 6 }] };
  const v6 = stage06Template.validate(badSev, {}, { logger: silentLogger });
  assert(v6.valid === false, 'Severity > 5 fails');

  const badSevLow = { risks: [{ ...goodRisk, severity: 0 }] };
  const v7 = stage06Template.validate(badSevLow, {}, { logger: silentLogger });
  assert(v7.valid === false, 'Severity 0 fails (min 1)');

  // Invalid status
  const badStatus = { risks: [{ ...goodRisk, status: 'invalid' }] };
  const v8 = stage06Template.validate(badStatus, {}, { logger: silentLogger });
  assert(v8.valid === false, 'Invalid status fails');

  // Cross-stage prereqs
  const v9 = stage06Template.validate(goodData, { stage05: { unitEconomics: {} } }, { logger: silentLogger });
  assert(v9.valid === true, 'Cross-stage with stage05 passes');

  // Residual fields validation
  const withResidual = { risks: [{ ...goodRisk, residual_severity: 2, residual_probability: 1, residual_impact: 2 }] };
  const v10 = stage06Template.validate(withResidual, {}, { logger: silentLogger });
  assert(v10.valid === true, 'Valid residual fields pass');

  const badResidual = { risks: [{ ...goodRisk, residual_severity: 10 }] };
  const v11 = stage06Template.validate(badResidual, {}, { logger: silentLogger });
  assert(v11.valid === false, 'Residual severity > 5 fails');

  // ═══════════════════════════════════════════════════════════════════
  // 3. computeDerived
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n── 3. computeDerived ──');

  const risks = [
    { ...goodRisk, severity: 4, probability: 3, impact: 4 },
    { ...goodRisk, id: 'RISK-002', category: 'Technical', severity: 2, probability: 2, impact: 3, status: 'mitigated' },
    { ...goodRisk, id: 'RISK-003', category: 'Financial', severity: 5, probability: 4, impact: 5 },
  ];

  const d1 = stage06Template.computeDerived({ risks }, { logger: silentLogger });

  // Score = severity * probability * impact
  assert(d1.risks[0].score === 4 * 3 * 4, `Risk 1 score = ${4 * 3 * 4} (got ${d1.risks[0].score})`);
  assert(d1.risks[1].score === 2 * 2 * 3, `Risk 2 score = ${2 * 2 * 3} (got ${d1.risks[1].score})`);
  assert(d1.risks[2].score === 5 * 4 * 5, `Risk 3 score = ${5 * 4 * 5} (got ${d1.risks[2].score})`);

  // Aggregate = average of scores
  const expectedAvg = Math.round((48 + 12 + 100) / 3);
  assert(d1.aggregate_risk_score === expectedAvg, `Aggregate score = ${expectedAvg} (got ${d1.aggregate_risk_score})`);

  // Highest risk factor
  assert(d1.highest_risk_factor === 'Financial', `Highest risk = Financial (got ${d1.highest_risk_factor})`);

  // Mitigation coverage: 1/3 mitigated
  assert(Math.abs(d1.mitigation_coverage_pct - 33.33) < 0.1, `Mitigation coverage ≈ 33.33% (got ${d1.mitigation_coverage_pct})`);

  // Normalized score: on 0-10 scale from 1-125
  assert(typeof d1.normalized_risk_score === 'number', 'normalized_risk_score computed');
  assert(d1.normalized_risk_score >= 0 && d1.normalized_risk_score <= 10, 'normalized_risk_score in 0-10 range');

  // Residual scores
  const withRes = [{ ...goodRisk, severity: 4, probability: 3, impact: 4, residual_severity: 2, residual_probability: 1, residual_impact: 2 }];
  const d2 = stage06Template.computeDerived({ risks: withRes }, { logger: silentLogger });
  assert(d2.risks[0].residual_score === 2 * 1 * 2, `Residual score = ${2 * 1 * 2}`);

  // No residual fields → no residual_score
  const d3 = stage06Template.computeDerived({ risks: [goodRisk] }, { logger: silentLogger });
  assert(d3.risks[0].residual_score === undefined, 'No residual fields → no residual_score');

  // All closed → 100% mitigation
  const allClosed = [{ ...goodRisk, status: 'closed' }, { ...goodRisk, id: 'R2', status: 'mitigated' }];
  const d4 = stage06Template.computeDerived({ risks: allClosed }, { logger: silentLogger });
  assert(d4.mitigation_coverage_pct === 100, 'All mitigated/closed → 100%');

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

  // Stage 6 consumes Stage 5 unitEconomics
  const c1 = validatePreStage(6, new Map([[5, { unitEconomics: { cac: 100 } }]]), { logger: silentLogger });
  assert(c1.valid === true, 'Stage 5 → Stage 6 contract passes');

  // ═══════════════════════════════════════════════════════════════════
  // 6. Execution Flow
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n── 6. Execution Flow ──');
  assert(typeof stage06Template.analysisStep === 'function', 'analysisStep registered');
  assert(typeof stage06Template.computeDerived === 'function', 'computeDerived exists (dead code)');

  // ═══════════════════════════════════════════════════════════════════
  // 7. Analysis Step Audit Flags (source inspection)
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n── 7. Analysis Step Audit ──');
  const src = readFileSync(join(ROOT, 'lib/eva/stage-templates/analysis-steps/stage-06-risk-matrix.js'), 'utf8');

  // Check: does analysis step produce severity, probability, impact (3-factor)?
  const hasSeverity = src.includes('severity');
  assert(hasSeverity, '[AUDIT] Analysis step should produce severity field');

  // Check: does analysis step produce impact field (not just consequence)?
  const hasImpact = src.includes('impact');
  assert(hasImpact, '[AUDIT] Analysis step should produce impact field');

  // Check: 3-factor scoring in analysis step output
  const has3Factor = /severity.*probability.*impact|score.*=.*severity.*\*.*probability.*\*.*impact/s.test(src);
  assert(has3Factor, '[AUDIT] Analysis step should use 3-factor scoring (severity*probability*impact)');

  // Check: analysis step produces aggregate_risk_score
  const hasAggregate = src.includes('aggregate_risk_score');
  assert(hasAggregate, '[AUDIT] Analysis step should produce aggregate_risk_score');

  // Check: analysis step produces normalized_risk_score
  const hasNormalized = src.includes('normalized_risk_score');
  assert(hasNormalized, '[AUDIT] Analysis step should produce normalized_risk_score');

  // Check: DRY — imports RISK_CATEGORIES from template
  const importsFromTemplate = src.includes("from '../stage-06.js'") || src.includes("from '../stage-06'");
  assert(importsFromTemplate, '[AUDIT] Should import RISK_CATEGORIES from template (DRY)');

  // Check: LLM fallback detection
  const hasFallback = src.includes('llmFallback') || src.includes('fallbackCount');
  assert(hasFallback, '[AUDIT] Analysis step should have LLM fallback detection');

  // ═══════════════════════════════════════════════════════════════════
  // 8. Error Cases
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n── 8. Error Cases ──');

  // Validate with no risks
  const noRisks = stage06Template.validate({ risks: null }, {}, { logger: silentLogger });
  assert(noRisks.valid === false, 'Null risks fails');

  // Validate with empty object
  const empty = stage06Template.validate({}, {}, { logger: silentLogger });
  assert(empty.valid === false, 'Empty object fails');

  // computeDerived with empty risks (should not crash)
  const emptyDerived = stage06Template.computeDerived({ risks: [] }, { logger: silentLogger });
  assert(emptyDerived.aggregate_risk_score === 0, 'Empty risks → aggregate 0');
  assert(emptyDerived.highest_risk_factor === null, 'Empty risks → null highest factor');
  assert(emptyDerived.mitigation_coverage_pct === 0, 'Empty risks → 0% coverage');

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
