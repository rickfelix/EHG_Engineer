/**
 * SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-H (FR-1) — FLEET-WIDE SHAPE CENSUS.
 *
 * FR-1 turned an unmapped caller field from a console.warn into a THROW. That is the right
 * call -- a warn on a background sub-agent run is indistinguishable from silence -- but it
 * makes PERSISTED_ELSEWHERE a fleet-wide compatibility contract rather than a local
 * bookkeeping list: any registered sub-agent whose result object carries a top-level key the
 * writer has not learned now HARD-FAILS at write time instead of quietly losing that key.
 *
 * Two prior verification passes on this SD each found real gaps by driving the writer with
 * real module shapes (options/metrics, then baseline_applied/mode), and each pass believed it
 * had covered the fleet because it sampled the sub-agents it happened to think of. This file
 * exists so the coverage stops being a function of who is reading: it enumerates the shape of
 * EVERY sub-agent module reachable through executor.js's own resolution rule
 * (`../sub-agents/${code.toLowerCase()}.js`, executor.js:251) and drives the REAL
 * storeSubAgentResults with each one.
 *
 * WHY DRIVE THE WRITER RATHER THAN ASSERT ON A KEY LIST: a list-vs-list test restates
 * PERSISTED_ELSEWHERE instead of testing it, and would have passed against every version of
 * this writer including the ones that threw on RISK. The throw is the observable, so the
 * throw is what each case asserts against.
 *
 * SHAPES ARE COPIED FROM THE MODULES, NOT IMPORTED: importing them would execute real
 * Supabase reads. Each shape below is the module's own literal result object at the cited
 * line, plus the two fields executor.js unconditionally attaches to every result before
 * storage (`execution_time_ms` at :378, `hallucination_check` at :418/:467).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

function makeMockSupabase(capture) {
  return {
    from(table) {
      return {
        select() { return this; },
        eq() { return this; },
        is() { return this; },
        gte() { return this; },
        order() { return this; },
        limit() { return Promise.resolve({ data: [], error: null }); },
        maybeSingle() { return Promise.resolve({ data: null, error: null }); },
        insert(record) {
          capture.insertedTable = table;
          capture.inserted = record;
          return {
            select: () => ({
              single: async () => ({ data: { id: 'mock-row-id', ...record }, error: null })
            })
          };
        },
        update(fields) {
          return {
            eq: () => ({
              select: () => ({ single: async () => ({ data: { id: 'mock-row-id', ...fields }, error: null }) })
            })
          };
        }
      };
    }
  };
}

/**
 * The result-object shape each registered sub-agent hands to storeSubAgentResults, keyed by
 * the code executor.js resolves. `where` cites the exact literal this was transcribed from so
 * a future reader can re-verify rather than trust this file.
 */
const FLEET_SHAPES = [
  {
    code: 'RISK',
    where: 'lib/sub-agents/risk.js:44, plus :162/:163/:214/:253 assigned onto results AFTER the literal',
    result: {
      sd_id: 'SD-TEST-001',
      phase: 'LEAD_PRE_APPROVAL',
      timestamp: '2026-09-05T00:00:00.000Z',
      risk_domains: { technical_complexity: { score: 3, level: 'LOW', rationale: 'r' } },
      critical_issues: [],
      warnings: [],
      recommendations: [],
      verdict: 'PASS',
      confidence: 80,
      // THE FOUR BELOW ARE NOT IN THE MODULE'S RESULT LITERAL. They are assigned onto `results`
      // later in execute() (risk.js:162, :163, :214, :253), so a census built by reading result
      // literals alone -- the natural way to do this, and the way the first cut of this file did
      // it -- sees a RISK shape that no RISK run ever actually produces.
      overall_risk_score: 4.17,
      risk_level: 'MEDIUM',
      rationale: 'aggregate risk within tolerance',
      assessment_id: 'ra-uuid-1',
    },
  },
  {
    code: 'RCA',
    where: 'lib/sub-agents/rca.js:48',
    result: {
      rcr_id: 'rcr-uuid-1',
      timestamp: '2026-09-05T00:00:00.000Z',
      verdict: 'PASS',
      confidence: 70,
      critical_issues: [],
      warnings: [],
      recommendations: [],
      analysis: {
        root_cause: 'a real root cause string',
        root_cause_category: 'PROCESS',
        causal_chain: [{ step: 1 }],
        contributing_factors: [],
        pattern_matches: [],
      },
      metadata: {},
    },
  },
  {
    code: 'VENTURE_STACK',
    where: 'lib/sub-agents/venture_stack.js:37',
    result: {
      sd_id: 'SD-TEST-001',
      sub_agent_code: 'VENTURE_STACK',
      timestamp: '2026-09-05T00:00:00.000Z',
      verdict: 'PASS',
      confidence_score: 95,
      summary: 'no forbidden tech',
      findings: {},
      recommendations: [],
      blockers: [],
      warnings: [],
    },
  },
  {
    code: 'STORIES',
    where: 'lib/sub-agents/modules/stories/execute.js:117, plus :242/:335/:415 assigned later',
    result: {
      sd_id: 'SD-TEST-001',
      timestamp: '2026-09-05T00:00:00.000Z',
      stories_processed: 4,
      stories_enhanced: 2,
      // ARRAYS, not counts -- transcribed from execute.js:122-124, which initialises all three to
      // []. Guessing them as numbers would still have passed the does-not-throw arm and quietly
      // mis-stated the shape for the next reader.
      context_added: [{ story_key: 'X:US-001' }],
      already_complete: [],
      failed: [],
      verdict: 'PASS',
      confidence: 90,
      placeholders_removed: 3,
      detected_gaps: [{ type: 'MISSING_AC', description: 'no acceptance criteria' }],
      stories_created: 2,
    },
  },
  // The venture-stage family. Same authored shape across all of them, which is exactly why a
  // sampling-based pass keeps missing the whole family at once.
  ...[
    ['ANALYTICS', 'lib/sub-agents/analytics.js:47'],
    ['CRM', 'lib/sub-agents/crm.js:47'],
    ['LAUNCH', 'lib/sub-agents/launch.js:77'],
    ['MONITORING', 'lib/sub-agents/monitoring.js:46'],
    ['SALES', 'lib/sub-agents/sales.js:50'],
    ['VALUATION', 'lib/sub-agents/valuation.js:62'],
  ].map(([code, where]) => ({
    code,
    where,
    result: {
      sd_id: 'SD-TEST-001',
      sub_agent_code: code,
      timestamp: '2026-09-05T00:00:00.000Z',
      verdict: 'PASS',
      confidence_score: 85,
      summary: 's',
      findings: {},
      recommendations: [],
      blockers: [],
      warnings: [],
      artifact: { artifact_id: 'a1' },
    },
  })),
  ...[
    ['FINANCIAL', 'lib/sub-agents/financial.js:112'],
    ['MARKETING', 'lib/sub-agents/marketing.js:121'],
    ['PRICING', 'lib/sub-agents/pricing.js:81'],
  ].map(([code, where]) => ({
    code,
    where,
    result: {
      sd_id: 'SD-TEST-001',
      sub_agent_code: code,
      timestamp: '2026-09-05T00:00:00.000Z',
      verdict: 'PASS',
      confidence_score: 85,
      summary: 's',
      findings: {},
      recommendations: [],
      blockers: [],
      warnings: [],
      artifact: { artifact_id: 'a1' },
      justification: 'j'.repeat(60),
      conditions: [],
    },
  })),
  {
    code: 'API',
    where: 'lib/sub-agents/api.js:54',
    result: {
      sd_id: 'SD-TEST-001',
      sub_agent_code: 'API',
      timestamp: '2026-09-05T00:00:00.000Z',
      verdict: 'PASS',
      confidence_score: 85,
      validation_mode: 'prospective',
      summary: 's',
      findings: {},
      recommendations: [],
      blockers: [],
      warnings: [],
      justification: 'j'.repeat(60),
      conditions: [],
    },
  },
  {
    code: 'DEPENDENCY',
    where: 'lib/sub-agents/dependency.js:67',
    result: {
      sd_id: 'SD-TEST-001',
      sub_agent_code: 'DEPENDENCY',
      timestamp: '2026-09-05T00:00:00.000Z',
      verdict: 'PASS',
      confidence_score: 85,
      summary: 's',
      findings: {},
      recommendations: [],
      blockers: [],
      warnings: [],
    },
  },
  // The "already known good" arm. These are the shapes the two prior passes verified; they are
  // kept here so a future edit to PERSISTED_ELSEWHERE that fixes one family while breaking one
  // of these is caught by the same run.
  {
    code: 'SECURITY',
    where: 'lib/sub-agents/security.js:88',
    result: {
      verdict: 'PASS', confidence: 90, critical_issues: [], warnings: [], recommendations: [],
      detailed_analysis: 'a', findings: {}, baseline_applied: true, options: {},
    },
  },
  {
    code: 'REGRESSION',
    where: 'lib/sub-agents/regression.js:98',
    result: {
      verdict: 'PASS', confidence: 90, critical_issues: [], warnings: [], recommendations: [],
      detailed_analysis: 'a', findings: {}, options: {}, mode: 'full',
    },
  },
  {
    code: 'DATABASE',
    where: 'lib/sub-agents/database/index.js:106 (via the database.js re-export shim)',
    result: {
      verdict: 'PASS', confidence: 90, critical_issues: [], warnings: [], recommendations: [],
      detailed_analysis: 'a', findings: {}, options: {},
    },
  },
  {
    code: 'DESIGN',
    where: 'lib/sub-agents/design/index.js:169 and :582 (the metadata-bearing early-exit arm)',
    result: {
      verdict: 'PASS', confidence: 90, critical_issues: [], warnings: [], recommendations: [],
      detailed_analysis: 'a', findings: {}, metadata: { skip_reason: 'non_ui' }, options: {},
    },
  },
  {
    code: 'DOCMON',
    where: 'lib/sub-agents/docmon.js:125',
    result: {
      verdict: 'PASS', confidence: 90, validation_mode: 'prospective', critical_issues: [],
      warnings: [], recommendations: [], detailed_analysis: 'a', findings: {}, options: {},
    },
  },
  {
    code: 'PERFORMANCE',
    where: 'lib/sub-agents/performance.js:57',
    result: {
      verdict: 'PASS', confidence: 90, critical_issues: [], warnings: [], recommendations: [],
      detailed_analysis: 'a', findings: {}, options: {},
    },
  },
  {
    code: 'GITHUB',
    where: 'lib/sub-agents/github.js:83',
    result: {
      verdict: 'PASS', confidence: 90, critical_issues: [], warnings: [], recommendations: [],
      detailed_analysis: 'a', findings: {}, options: {},
    },
  },
  {
    code: 'QUICKFIX',
    where: 'lib/sub-agents/quickfix.js:108',
    result: {
      verdict: 'PASS', confidence: 90, critical_issues: [], warnings: [], recommendations: [],
      detailed_analysis: 'a', findings: {}, options: {},
    },
  },
  {
    code: 'UAT',
    where: 'lib/sub-agents/uat.js:54',
    result: {
      verdict: 'PASS', confidence: 90, critical_issues: [], warnings: [], recommendations: [],
      detailed_analysis: 'a', findings: {}, options: {},
    },
  },
  {
    code: 'VALIDATION',
    where: 'lib/sub-agents/validation.js:71',
    result: {
      verdict: 'PASS', confidence: 90, critical_issues: [], warnings: [], recommendations: [],
      detailed_analysis: 'a', findings: {}, options: {},
    },
  },
  {
    code: 'TESTING',
    where: 'lib/sub-agents/testing/index.js:875 createResultsStructure, plus :203 results.metadata and the catch arm results.error',
    result: {
      verdict: 'PASS', confidence: 90, validation_mode: 'retrospective', critical_issues: [],
      warnings: [], recommendations: [], detailed_analysis: 'a',
      findings: { phase3_execution: {}, phase5_verdict: {} },
      options: {},
      // Field names transcribed from testing-verdict-guard.js's REQUIRED_NUMERIC_FIELDS, not
      // invented: SD-FDBK-INFRA-TESTING-VERDICT-ROWS-001's guard refuses a TESTING
      // PASS/CONDITIONAL_PASS row whose test_execution block is missing or unmeasured, and it
      // runs on the same write path as FR-1's check. A TESTING census case that dodged the guard
      // would not be exercising the shape a real TESTING run produces.
      metadata: { measured: true, test_execution: { tests_executed: 12, tests_passed: 12, tests_failed: 0, tests_skipped: 0, framework: 'vitest', command: 'npm run test:unit', exit_code: 0 } },
      error: null,
    },
  },
  {
    code: 'RETRO',
    where: 'lib/sub-agents/retro/index.js:76 (via the retro.js re-export shim)',
    result: {
      verdict: 'PASS', confidence: 90, critical_issues: [], warnings: [], recommendations: [],
      detailed_analysis: 'a', findings: {}, options: {},
    },
  },
];

/**
 * executor.js attaches these to EVERY result object before calling storeSubAgentResults,
 * regardless of which module produced it (executor.js:378 and :418/:467). A census that omits
 * them would test a shape no real run ever produces.
 */
function withExecutorAttachments(result) {
  return {
    ...result,
    execution_time_ms: 1234,
    hallucination_check: { passed: true, score: 100 },
  };
}

describe('SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-H FR-1 — every registered sub-agent shape must survive the fail-loud writer', () => {
  const capture = {};

  beforeEach(() => {
    capture.inserted = null;
    capture.insertedTable = null;

    vi.doMock('../../../lib/sub-agent-executor/supabase-client.js', () => ({
      getSupabaseClient: async () => makeMockSupabase(capture)
    }));
    vi.doMock('../../../scripts/modules/sd-id-normalizer.js', () => ({
      normalizeSDId: async (_s, v) => (String(v).startsWith('SD-') ? '11111111-2222-3333-4444-555555555555' : v)
    }));
    vi.doMock('../../../lib/artifact-tools.js', () => ({
      createArtifact: async () => ({ artifact_id: 'artifact-1', token_count: 10, summary: 'compressed' })
    }));
    // Same rationale as results-storage-payload-fidelity.test.js: verifyReadback builds its own
    // real client by design, so it is stubbed here and covered on its own elsewhere.
    vi.doMock('../../../lib/checkers/readback-checker.mjs', async (importOriginal) => {
      const actual = await importOriginal();
      return { ...actual, verifyReadback: vi.fn().mockImplementation(async () => ({ verdict: 'PASS', row: capture.inserted || {} })) };
    });
  });

  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('../../../lib/sub-agent-executor/supabase-client.js');
    vi.doUnmock('../../../scripts/modules/sd-id-normalizer.js');
    vi.doUnmock('../../../lib/artifact-tools.js');
    vi.doUnmock('../../../lib/checkers/readback-checker.mjs');
  });

  for (const shape of FLEET_SHAPES) {
    it(`${shape.code}: real result shape writes without UNRECOGNIZED_FIELD_DROPPED (${shape.where})`, async () => {
      const { storeSubAgentResults } = await import('../../../lib/sub-agent-executor/results-storage.js');
      await expect(
        storeSubAgentResults(shape.code, 'SD-TEST-001', null, withExecutorAttachments(shape.result), { phase: 'EXEC' })
      ).resolves.toBeTruthy();
      expect(capture.insertedTable).toBe('sub_agent_execution_results');
    });
  }

  /**
   * The census above proves nothing is REFUSED. This proves the newly-exempted fields are
   * actually PRESERVED -- the distinction the second verification pass on this SD had to make
   * explicitly, because "declare it in PERSISTED_ELSEWHERE" silences the throw whether or not
   * the content survives, and a silenced throw over a dropped field is the original defect
   * wearing the fix's clothes.
   */
  it('RISK: risk_domains / timestamp / assessment_id are PRESERVED in metadata, not merely exempted', async () => {
    const { storeSubAgentResults } = await import('../../../lib/sub-agent-executor/results-storage.js');
    const riskDomains = { technical_complexity: { score: 7, level: 'HIGH', rationale: 'migration + auth' } };
    await storeSubAgentResults('RISK', 'SD-TEST-001', null, withExecutorAttachments({
      sd_id: 'SD-TEST-001',
      phase: 'LEAD_PRE_APPROVAL',
      timestamp: '2026-09-05T12:00:00.000Z',
      risk_domains: riskDomains,
      critical_issues: [],
      warnings: [],
      recommendations: [],
      verdict: 'PASS',
      confidence: 80,
      overall_risk_score: 7.5,
      risk_level: 'HIGH',
      rationale: 'migration plus auth surface',
      assessment_id: 'ra-uuid-42',
    }), { phase: 'EXEC' });

    expect(capture.inserted.metadata.risk_domains).toEqual(riskDomains);
    expect(capture.inserted.metadata.timestamp).toBe('2026-09-05T12:00:00.000Z');
    expect(capture.inserted.metadata.assessment_id).toBe('ra-uuid-42');
    expect(capture.inserted.metadata.overall_risk_score).toBe(7.5);
    expect(capture.inserted.metadata.risk_level).toBe('HIGH');
    expect(capture.inserted.metadata.rationale).toBe('migration plus auth surface');
    // metadata.timestamp must NOT be conflated with the row's own write time. They answer
    // different questions ("when was this measured" vs "when was it filed"), and a freshness
    // check reading the wrong one is unfalsifiable.
    expect(capture.inserted.created_at).not.toBe(capture.inserted.metadata.timestamp);
  });

  it('RCA: the analysis block — the whole substance of an RCA run — is PRESERVED, not dropped', async () => {
    const { storeSubAgentResults } = await import('../../../lib/sub-agent-executor/results-storage.js');
    const analysis = {
      root_cause: 'the writer refused a field it had never been taught',
      root_cause_category: 'PROCESS',
      causal_chain: [{ step: 1, event: 'field added upstream' }],
      contributing_factors: [{ factor: 'warn-only diagnostic' }],
      pattern_matches: [],
    };
    await storeSubAgentResults('RCA', 'SD-TEST-001', null, withExecutorAttachments({
      rcr_id: 'rcr-uuid-9',
      timestamp: '2026-09-05T12:00:00.000Z',
      verdict: 'PASS',
      confidence: 70,
      critical_issues: [],
      warnings: [],
      recommendations: ['do the thing'],
      analysis,
      metadata: {},
    }), { phase: 'EXEC' });

    expect(capture.inserted.metadata.analysis).toEqual(analysis);
    expect(capture.inserted.metadata.rcr_id).toBe('rcr-uuid-9');
  });

  it('venture-stage family: blockers and artifact are PRESERVED, not dropped', async () => {
    const { storeSubAgentResults } = await import('../../../lib/sub-agent-executor/results-storage.js');
    const blockers = ['Forbidden venture-stack tech specified: kafka'];
    const artifact = { artifact_id: 'artifact-77', token_count: 500 };
    await storeSubAgentResults('VENTURE_STACK', 'SD-TEST-001', null, withExecutorAttachments({
      sd_id: 'SD-TEST-001',
      sub_agent_code: 'VENTURE_STACK',
      timestamp: '2026-09-05T12:00:00.000Z',
      verdict: 'FAIL',
      confidence_score: 95,
      summary: 'forbidden tech found',
      findings: {},
      recommendations: [],
      blockers,
      warnings: [],
      artifact,
    }), { phase: 'EXEC' });

    expect(capture.inserted.metadata.blockers).toEqual(blockers);
    expect(capture.inserted.metadata.artifact).toEqual(artifact);
  });

  it('STORIES: the per-story counters are PRESERVED, including the falsy ones', async () => {
    const { storeSubAgentResults } = await import('../../../lib/sub-agent-executor/results-storage.js');
    await storeSubAgentResults('STORIES', 'SD-TEST-001', null, withExecutorAttachments({
      sd_id: 'SD-TEST-001',
      timestamp: '2026-09-05T12:00:00.000Z',
      stories_processed: 0,
      stories_enhanced: 0,
      context_added: [],
      already_complete: [],
      failed: [],
      verdict: 'PASS',
      confidence: 90,
      placeholders_removed: 0,
      detected_gaps: [],
      stories_created: 0,
    }), { phase: 'EXEC' });

    const md = capture.inserted.metadata;
    // EVERY value here is falsy on purpose. A `results.x || null` style write -- which is how the
    // four pre-existing exemptions are written -- would turn all eight into null, and "zero
    // stories failed" would become indistinguishable from "we did not record whether any failed".
    // That is the same claim-vs-reality gap as the hollow PASS rows FR-3 censused, one field down.
    // The spread is keyed on `k in results` for exactly this reason; these assertions pin it.
    expect(md.stories_processed).toBe(0);
    expect(md.stories_enhanced).toBe(0);
    expect(md.context_added).toEqual([]);
    expect(md.already_complete).toEqual([]);
    expect(md.failed).toEqual([]);
    expect(md.placeholders_removed).toBe(0);
    expect(md.detected_gaps).toEqual([]);
    expect(md.stories_created).toBe(0);
    // Presence, not just value: an absent key and a falsy key read identically through `md.x`
    // truthiness but not through `in`.
    for (const k of ['stories_processed', 'stories_enhanced', 'context_added', 'already_complete', 'failed']) {
      expect(k in md).toBe(true);
    }
  });

  /**
   * THE ANTI-DRIFT ASSERTION, and the reason this SD needed three verification passes.
   *
   * Passes 1 and 2 each fixed the gaps they found by editing TWO places -- the metadata object and
   * PERSISTED_ELSEWHERE -- and a field satisfying only one of them is silently wrong in opposite
   * directions: exempted-but-not-written is a field that vanishes with the throw suppressed (the
   * original QF-20260803-007 defect, restored); written-but-not-exempted throws on every run. The
   * writer now DERIVES the exemption list from the same frozen object it writes from, so this test
   * asserts the property that derivation buys rather than re-listing the fields a third time.
   */
  it('every declared top-level field is BOTH exempt from the throw AND preserved -- they cannot drift apart', async () => {
    const mod = await import('../../../lib/sub-agent-executor/results-storage.js');
    const declared = Object.keys(mod.TOP_LEVEL_FIELDS_PERSISTED_TO_METADATA);
    expect(declared.length).toBeGreaterThan(0);

    // A sentinel value per field, so "preserved" cannot be satisfied by a coincidental default.
    const payload = { verdict: 'PASS', confidence: 90, detailed_analysis: 'a' };
    for (const k of declared) payload[k] = `sentinel::${k}`;

    await expect(
      mod.storeSubAgentResults('VALIDATION', 'SD-TEST-001', null, withExecutorAttachments(payload), { phase: 'EXEC' })
    ).resolves.toBeTruthy();

    for (const k of declared) {
      expect(capture.inserted.metadata[k]).toBe(`sentinel::${k}`);
    }
  });

  /**
   * The guard is only worth having if it still BITES. A census that only ever asserts
   * "does not throw" would pass just as well against a writer that exempted everything.
   */
  it('still refuses a genuinely unknown field — the fail-loud contract is not blanket-exempted', async () => {
    const { storeSubAgentResults } = await import('../../../lib/sub-agent-executor/results-storage.js');
    await expect(
      storeSubAgentResults('VALIDATION', 'SD-TEST-001', null, withExecutorAttachments({
        verdict: 'PASS',
        confidence: 90,
        detailed_analysis: 'a',
        reccomendations: ['typo of recommendations'],
      }), { phase: 'EXEC' })
    ).rejects.toThrow(/UNRECOGNIZED_FIELD_DROPPED.*reccomendations/s);
  });
});
