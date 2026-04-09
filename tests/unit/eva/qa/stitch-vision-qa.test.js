/**
 * Unit tests for lib/eva/qa/stitch-vision-qa.js
 * SD-LEO-ORCH-STAGE-STITCH-DESIGN-001-C (US-007)
 *
 * Covers:
 * - Happy path with mocked Anthropic client
 * - Missing ANTHROPIC_API_KEY → vision_api_unavailable
 * - Anthropic SDK throws → vision_api_unavailable (graceful)
 * - Daily budget exceeded → daily_budget_exceeded (no API call)
 * - All screens fail → vision_api_unavailable
 * - Empty manifest → no_screens
 * - aggregateRubrics + estimateCallCostUsd unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  reviewStitchExport,
  setAnthropicClientLoader,
  setSupabaseClientLoader,
  aggregateRubrics,
  estimateCallCostUsd,
  RUBRIC_CATEGORIES,
} = await import('../../../../lib/eva/qa/stitch-vision-qa.js');

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

function makeAnthropicMock({ rubricResponse, throwError } = {}) {
  return {
    messages: {
      create: vi.fn().mockImplementation(() => {
        if (throwError) return Promise.reject(throwError);
        const text = JSON.stringify(rubricResponse || {
          brand: { score: 8, findings: ['Strong visual identity'] },
          layout: { score: 7, findings: ['Slight grid drift on hero'] },
          typography: { score: 9, findings: [] },
          color: { score: 8, findings: ['Reduce accent color saturation'] },
        });
        return Promise.resolve({
          content: [{ type: 'text', text }],
          usage: { input_tokens: 1500, output_tokens: 400 },
        });
      }),
    },
  };
}

function makeSupabaseMock({
  configRow = { taste_gate_config: { stitch_qa_daily_budget_usd: 0.50 } },
  todaySpendRows = [],
  configError = null,
  insertResults = [{ data: { id: 'qa-row-id' }, error: null }],
  // Current is_current=true stitch_qa_report row for the venture (pre-flip).
  // First select returns this; subsequent calls return [] (as if flipped).
  currentQaReport = null,
} = {}) {
  const calls = { from: [], select: [], insert: [], eq: [], update: [] };
  let insertIdx = 0;
  let currentQaConsumed = false;
  // Track how the current chain is being used so we can route .single vs .then correctly.
  const makeChain = (table) => {
    const chain = { _table: table, _eqs: [] };
    chain.select = (cols) => { calls.select.push({ table, cols }); return chain; };
    chain.insert = (row) => {
      calls.insert.push({ table, row });
      return {
        select: () => ({
          single: () => {
            const res = insertResults[Math.min(insertIdx, insertResults.length - 1)];
            insertIdx++;
            return Promise.resolve(res);
          },
        }),
      };
    };
    chain.update = (patch) => {
      const updateChain = { _patch: patch, _table: table };
      updateChain.eq = (col, val) => {
        calls.update.push({ table, patch, col, val });
        return {
          then: (resolve, reject) =>
            Promise.resolve({ data: null, error: null }).then(resolve, reject),
        };
      };
      return updateChain;
    };
    chain.eq = (col, val) => {
      calls.eq.push({ table, col, val });
      chain._eqs.push({ col, val });
      return chain;
    };
    chain.gte = () => chain;
    chain.limit = () => chain;
    chain.single = () => {
      if (table === 'chairman_dashboard_config') {
        return Promise.resolve(configError ? { data: null, error: configError } : { data: configRow, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    };
    // Awaiting the chain directly (without .single) resolves here.
    // For venture_artifacts we have three distinct shapes:
    //   1. getRemainingDailyBudget: .select('metadata').eq(artifact_type,'stitch_qa_report').gte(...) → returns todaySpendRows
    //   2. persistQaReport precheck: .select('id, version').eq(venture_id,...)....eq(is_current, true).limit(1) → returns [currentQaReport] or []
    //   3. Any other: []
    chain.then = (resolve, reject) => {
      if (table === 'venture_artifacts') {
        const eqCols = chain._eqs.map((e) => e.col);
        const isPrecheck = eqCols.includes('venture_id') && eqCols.includes('lifecycle_stage') && eqCols.includes('is_current');
        if (isPrecheck && currentQaReport && !currentQaConsumed) {
          currentQaConsumed = true;
          return Promise.resolve({ data: [currentQaReport], error: null }).then(resolve, reject);
        }
        if (isPrecheck) {
          return Promise.resolve({ data: [], error: null }).then(resolve, reject);
        }
        // Daily budget sum
        return Promise.resolve({ data: todaySpendRows, error: null }).then(resolve, reject);
      }
      return Promise.resolve({ data: [], error: null }).then(resolve, reject);
    };
    return chain;
  };

  const client = {
    from: (table) => {
      calls.from.push(table);
      return makeChain(table);
    },
  };
  return { client, calls };
}

const sampleManifest = (screenCount = 2) => ({
  screen_count: screenCount,
  venture_artifact_id: 'export-id',
  png_files_base64: Array.from({ length: screenCount }, (_, i) => ({
    screen_id: `s${i + 1}`,
    base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=',
  })),
});

// -------------------------------------------------------------------------
// Tests
// -------------------------------------------------------------------------

describe('stitch-vision-qa', () => {
  beforeEach(() => {
    setAnthropicClientLoader(null);
    setSupabaseClientLoader(null);
  });

  // -----------------------------------------------------------------------
  // estimateCallCostUsd
  // -----------------------------------------------------------------------
  describe('estimateCallCostUsd', () => {
    it('returns cost > 0 for at least one screen', () => {
      expect(estimateCallCostUsd(1)).toBeGreaterThan(0);
    });
    it('scales linearly with screen count', () => {
      const c1 = estimateCallCostUsd(1);
      const c4 = estimateCallCostUsd(4);
      expect(c4).toBeCloseTo(c1 * 4, 5);
    });
    it('returns 0 for zero screens', () => {
      expect(estimateCallCostUsd(0)).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // aggregateRubrics
  // -----------------------------------------------------------------------
  describe('aggregateRubrics', () => {
    it('averages scores across screens', () => {
      const perScreen = [
        { rubric: { brand: { score: 6, findings: [] }, layout: { score: 8, findings: [] }, typography: { score: 7, findings: [] }, color: { score: 9, findings: [] } } },
        { rubric: { brand: { score: 8, findings: [] }, layout: { score: 8, findings: [] }, typography: { score: 9, findings: [] }, color: { score: 7, findings: [] } } },
      ];
      const agg = aggregateRubrics(perScreen);
      expect(agg.brand.score).toBe(7);
      expect(agg.layout.score).toBe(8);
      expect(agg.typography.score).toBe(8);
      expect(agg.color.score).toBe(8);
    });

    it('dedupes findings across screens', () => {
      const perScreen = [
        { rubric: { brand: { score: 8, findings: ['Same finding'] }, layout: { score: 8, findings: [] }, typography: { score: 8, findings: [] }, color: { score: 8, findings: [] } } },
        { rubric: { brand: { score: 8, findings: ['Same finding', 'Different finding'] }, layout: { score: 8, findings: [] }, typography: { score: 8, findings: [] }, color: { score: 8, findings: [] } } },
      ];
      const agg = aggregateRubrics(perScreen);
      expect(agg.brand.findings).toHaveLength(2);
      expect(agg.brand.findings).toContain('Same finding');
      expect(agg.brand.findings).toContain('Different finding');
    });

    it('handles empty perScreen array', () => {
      const agg = aggregateRubrics([]);
      for (const cat of RUBRIC_CATEGORIES) {
        expect(agg[cat].score).toBe(0);
        expect(agg[cat].findings).toEqual([]);
      }
    });
  });

  // -----------------------------------------------------------------------
  // reviewStitchExport — happy path
  // -----------------------------------------------------------------------
  describe('reviewStitchExport — happy path', () => {
    it('TS-3: returns completed status with rubric and persists qa row', async () => {
      const { client: sb, calls } = makeSupabaseMock();
      setSupabaseClientLoader(() => sb);
      setAnthropicClientLoader(() => makeAnthropicMock());

      const result = await reviewStitchExport('venture-1', sampleManifest(2));

      expect(result.status).toBe('completed');
      expect(result.rubric.brand.score).toBe(8);
      expect(result.rubric.typography.score).toBe(9);
      expect(result.qa_report_id).toBe('qa-row-id');
      expect(result.total_cost_usd).toBeGreaterThan(0);

      // Verify a stitch_qa_report row was inserted
      const inserts = calls.insert.filter((c) => c.table === 'venture_artifacts');
      expect(inserts).toHaveLength(1);
      expect(inserts[0].row.artifact_type).toBe('stitch_qa_report');
      expect(inserts[0].row.metadata.status).toBe('completed');
      expect(inserts[0].row.metadata.rubric.brand.score).toBe(8);
    });
  });

  // -----------------------------------------------------------------------
  // reviewStitchExport — degraded paths
  // -----------------------------------------------------------------------
  describe('reviewStitchExport — degraded paths', () => {
    it('TS-4: missing ANTHROPIC_API_KEY returns vision_api_unavailable, no API calls', async () => {
      const { client: sb, calls } = makeSupabaseMock();
      setSupabaseClientLoader(() => sb);
      // Loader returns null → simulates missing key
      setAnthropicClientLoader(() => null);

      const result = await reviewStitchExport('venture-1', sampleManifest(2));

      expect(result.status).toBe('vision_api_unavailable');
      expect(result.error_message).toBeTruthy();
      expect(result.total_cost_usd).toBe(0);
      // Row still inserted
      expect(calls.insert.filter((c) => c.table === 'venture_artifacts')).toHaveLength(1);
    });

    it('TS-5: Anthropic SDK throws → vision_api_unavailable (no exception escapes)', async () => {
      const { client: sb, calls } = makeSupabaseMock();
      setSupabaseClientLoader(() => sb);
      setAnthropicClientLoader(() => makeAnthropicMock({ throwError: new Error('503 Service Unavailable') }));

      // Must NOT throw — call directly and assert resolves with degraded payload
      const result = await reviewStitchExport('venture-1', sampleManifest(2));

      expect(result.status).toBe('vision_api_unavailable');
      expect(result.error_message).toContain('503');
      // Row still inserted
      expect(calls.insert.filter((c) => c.table === 'venture_artifacts')).toHaveLength(1);
    });

    it('TS-6: daily budget exceeded → daily_budget_exceeded, no API call', async () => {
      const anthropicMock = makeAnthropicMock();
      const { client: sb, calls } = makeSupabaseMock({
        configRow: { taste_gate_config: { stitch_qa_daily_budget_usd: 0.000001 } },
      });
      setSupabaseClientLoader(() => sb);
      setAnthropicClientLoader(() => anthropicMock);

      const result = await reviewStitchExport('venture-1', sampleManifest(4));

      expect(result.status).toBe('daily_budget_exceeded');
      expect(result.total_cost_usd).toBe(0);
      // Crucially: no API call was made
      expect(anthropicMock.messages.create).not.toHaveBeenCalled();
      // Row still inserted
      expect(calls.insert.filter((c) => c.table === 'venture_artifacts')).toHaveLength(1);
    });

    it('returns no_screens when manifest has empty png_files_base64', async () => {
      const { client: sb, calls } = makeSupabaseMock();
      setSupabaseClientLoader(() => sb);
      setAnthropicClientLoader(() => makeAnthropicMock());

      const result = await reviewStitchExport('venture-1', { screen_count: 0, png_files_base64: [] });

      expect(result.status).toBe('no_screens');
      expect(calls.insert.filter((c) => c.table === 'venture_artifacts')).toHaveLength(1);
    });

    it('all screens fail → vision_api_unavailable', async () => {
      const { client: sb } = makeSupabaseMock();
      setSupabaseClientLoader(() => sb);
      // Mock that throws on every call
      setAnthropicClientLoader(() => ({
        messages: {
          create: vi.fn().mockRejectedValue(new Error('rate limited')),
        },
      }));

      const result = await reviewStitchExport('venture-1', sampleManifest(3));
      expect(result.status).toBe('vision_api_unavailable');
      expect(result.error_message).toContain('rate limited');
    });
  });

  // -----------------------------------------------------------------------
  // Malformed responses
  // -----------------------------------------------------------------------
  describe('reviewStitchExport — malformed API responses', () => {
    it('handles non-JSON text response gracefully', async () => {
      const { client: sb } = makeSupabaseMock();
      setSupabaseClientLoader(() => sb);
      setAnthropicClientLoader(() => ({
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [{ type: 'text', text: 'not json at all' }],
            usage: { input_tokens: 1500, output_tokens: 100 },
          }),
        },
      }));

      const result = await reviewStitchExport('venture-1', sampleManifest(1));
      expect(result.status).toBe('vision_api_unavailable');
      expect(result.error_message).toContain('non-JSON');
    });

    it('handles missing rubric category in response', async () => {
      const { client: sb } = makeSupabaseMock();
      setSupabaseClientLoader(() => sb);
      setAnthropicClientLoader(() => makeAnthropicMock({
        rubricResponse: {
          brand: { score: 8, findings: [] },
          layout: { score: 7, findings: [] },
          // missing typography and color
        },
      }));

      const result = await reviewStitchExport('venture-1', sampleManifest(1));
      expect(result.status).toBe('vision_api_unavailable');
    });
  });

  // -----------------------------------------------------------------------
  // Idempotency: respect the partial unique index on venture_artifacts
  // (venture_id, lifecycle_stage, artifact_type) WHERE is_current=true
  //
  // Regression tests for adversarial review findings #1 and #2.
  // -----------------------------------------------------------------------
  describe('reviewStitchExport — idempotency + unique index handling', () => {
    it('flips existing is_current=true row before inserting new one (no unique violation)', async () => {
      const { client: sb, calls } = makeSupabaseMock({
        currentQaReport: { id: 'prior-qa-row', version: 3 },
      });
      setSupabaseClientLoader(() => sb);
      setAnthropicClientLoader(() => makeAnthropicMock());

      const result = await reviewStitchExport('venture-1', sampleManifest(2));

      expect(result.status).toBe('completed');
      expect(result.qa_report_id).toBe('qa-row-id');

      // Assert the existing row was flipped: UPDATE was called with patch {is_current:false}
      // targeting the prior row's id.
      const flipCall = calls.update.find(
        (u) => u.table === 'venture_artifacts' && u.patch?.is_current === false && u.val === 'prior-qa-row'
      );
      expect(flipCall).toBeDefined();

      // Assert the new row's version was bumped to prior + 1
      const insertedRow = calls.insert.find((c) => c.table === 'venture_artifacts')?.row;
      expect(insertedRow?.version).toBe(4);
      expect(insertedRow?.is_current).toBe(true);
    });

    it('skips flip step when no existing is_current row exists', async () => {
      const { client: sb, calls } = makeSupabaseMock({
        currentQaReport: null, // no existing row
      });
      setSupabaseClientLoader(() => sb);
      setAnthropicClientLoader(() => makeAnthropicMock());

      const result = await reviewStitchExport('venture-1', sampleManifest(2));

      expect(result.status).toBe('completed');
      // No UPDATE calls (nothing to flip)
      const flipCalls = calls.update.filter(
        (u) => u.table === 'venture_artifacts' && u.patch?.is_current === false
      );
      expect(flipCalls).toHaveLength(0);

      // New row version starts at 1
      const insertedRow = calls.insert.find((c) => c.table === 'venture_artifacts')?.row;
      expect(insertedRow?.version).toBe(1);
    });

    it('retries insert once on 23505 unique_violation from concurrent exporter', async () => {
      // First insert: simulated unique violation (concurrent exporter snuck in)
      // Second insert: succeeds after retry flips the intruder
      const { client: sb, calls } = makeSupabaseMock({
        currentQaReport: null,
        insertResults: [
          { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "idx_venture_artifacts_idempotent"' } },
          { data: { id: 'qa-row-after-retry' }, error: null },
        ],
      });
      setSupabaseClientLoader(() => sb);
      setAnthropicClientLoader(() => makeAnthropicMock());

      const result = await reviewStitchExport('venture-1', sampleManifest(1));

      expect(result.status).toBe('completed');
      expect(result.qa_report_id).toBe('qa-row-after-retry');

      // Two insert attempts happened
      const inserts = calls.insert.filter((c) => c.table === 'venture_artifacts');
      expect(inserts).toHaveLength(2);
    });

    it('returns null qa_report_id when both insert attempts fail', async () => {
      const { client: sb } = makeSupabaseMock({
        currentQaReport: null,
        insertResults: [
          { data: null, error: { code: '23505', message: 'duplicate key' } },
          { data: null, error: { code: 'OTHER', message: 'persistence still failed' } },
        ],
      });
      setSupabaseClientLoader(() => sb);
      setAnthropicClientLoader(() => makeAnthropicMock());

      const result = await reviewStitchExport('venture-1', sampleManifest(1));

      expect(result.status).toBe('completed'); // QA completed; only persistence failed
      expect(result.qa_report_id).toBeNull();
    });

    it('sanitizes API-key-shaped tokens in error_message before persistence', async () => {
      const { client: sb, calls } = makeSupabaseMock({
        currentQaReport: null,
      });
      setSupabaseClientLoader(() => sb);
      // Simulate an adapter error that leaks an API-key-shaped token in its message.
      // Using a direct throwError so the message is NOT pre-truncated by JSON.parse.
      setAnthropicClientLoader(() =>
        makeAnthropicMock({
          throwError: new Error('Upstream auth failed: sk-proj-ABCDEF1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ leaked'),
        })
      );

      const result = await reviewStitchExport('venture-1', sampleManifest(1));

      // All screens failed → degraded manifest
      expect(result.status).toBe('vision_api_unavailable');

      const insertedRow = calls.insert.find((c) => c.table === 'venture_artifacts')?.row;
      expect(insertedRow?.metadata?.error_message).not.toContain('sk-proj-ABCDEF');
      expect(insertedRow?.metadata?.error_message).toContain('<redacted-key>');
    });
  });
});
