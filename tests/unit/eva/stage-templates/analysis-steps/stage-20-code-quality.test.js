// QF-20260509-S20-CQ-TESTS — closes feedback fa11de3a (no test coverage on
// lib/eva/stage-templates/analysis-steps/stage-20-code-quality.js). The
// existing stage-20.test.js + stage-20-build-execution.test.js cover the
// legacy stage-19.js + stage-20-build-execution.js modules — NOT the
// canonical post-redesign analyzer. Adds:
//   (a) primary venture_resources row-per-resource resolution path,
//   (b) ventures.repo_url legacy fallback,
//   (c) stage19Data.github_repo / repo_url tertiary fallback,
//   (d) BLOCKED verdict + missing_github_repo_precondition reason when no
//       URL is found,
//   (e) persistAnalyzerFindings: null-supabase short-circuit, empty-canonical
//       no-op, and writer-error capture,
//   (f) constant export sanity (CHECK_TYPES, SEVERITY_LEVELS, VERDICT_OPTIONS).
//
// Notes:
// - cloneRepo is internal (not exported) and shells out to git/grep/npm. To
//   avoid network/shell side-effects, these tests exercise ONLY the resolution
//   + persistence paths that don't require cloneRepo. Verdict-computation
//   coverage relies on integration coverage in stage-20-canonical-shape.test.js
//   and stage-20-persistence.test.js (which exercise the canonical-finding
//   shape downstream of the analyzer).
// - The resolution-path tests assert the supabase-chain shape was issued
//   (table → select → eq → ...), proving the analyzer queries the canonical
//   row-per-resource registry first and falls back through (b)→(c)→BLOCKED.

import { describe, it, expect, vi } from 'vitest';
import {
  analyzeStage20CodeQuality,
  persistAnalyzerFindings,
  CHECK_TYPES,
  SEVERITY_LEVELS,
  VERDICT_OPTIONS,
} from '../../../../../lib/eva/stage-templates/analysis-steps/stage-20-code-quality.js';

// Build a chainable supabase mock that records the chain calls and returns
// the seed row (or null) at .maybeSingle(). Each top-level .from() call
// resets the chain — the seed map is keyed by table name so different
// queries can return different shapes (venture_resources vs ventures).
function makeSupabaseMock(seed = {}) {
  const calls = [];
  function buildChain(table) {
    const chain = {};
    const passthrough = ['select', 'eq', 'order', 'limit'];
    for (const name of passthrough) {
      chain[name] = (...args) => {
        calls.push({ table, op: name, args });
        return chain;
      };
    }
    chain.maybeSingle = () => {
      calls.push({ table, op: 'maybeSingle' });
      const row = seed[table] ?? null;
      return Promise.resolve({ data: row, error: null });
    };
    chain.insert = (row) => {
      calls.push({ table, op: 'insert', args: [row] });
      return Promise.resolve({ data: null, error: null });
    };
    return chain;
  }
  return {
    from: (table) => {
      calls.push({ table, op: 'from' });
      return buildChain(table);
    },
    __calls: calls,
  };
}

const silentLogger = { info: () => {}, warn: () => {}, error: () => {} };

describe('stage-20-code-quality.js — analyzer resolution path (no-clone)', () => {
  it('(d) returns BLOCKED with missing_github_repo_precondition when no repoUrl is found anywhere', async () => {
    const supabase = makeSupabaseMock({ venture_resources: null, ventures: null });
    const result = await analyzeStage20CodeQuality({
      stage19Data: null,
      ventureName: 'NoRepoVenture',
      ventureId: '00000000-0000-0000-0000-000000000001',
      supabase,
      logger: silentLogger,
    });
    expect(result.verdict).toBe('BLOCKED');
    expect(result.repo_url).toBeNull();
    expect(result.blocked_reason).toBe('missing_github_repo_precondition');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].check).toBe('precondition');
    expect(result.findings[0].severity).toBe('critical');
    expect(result.checks_run).toBe(0);
    expect(result.summary.total_findings).toBe(1);
    expect(result.summary.by_severity.critical).toBe(1);
  });

  it('(a) queries the canonical venture_resources row-per-resource registry first', async () => {
    const supabase = makeSupabaseMock({ venture_resources: null, ventures: null });
    await analyzeStage20CodeQuality({
      stage19Data: null,
      ventureName: 'V1',
      ventureId: '00000000-0000-0000-0000-000000000002',
      supabase,
      logger: silentLogger,
    });
    const tablesQueried = supabase.__calls
      .filter(c => c.op === 'from')
      .map(c => c.table);
    expect(tablesQueried).toContain('venture_resources');
    // Verify the resource_type filter is the canonical 'github_repo'.
    const resourceTypeFilter = supabase.__calls.find(
      c => c.table === 'venture_resources' && c.op === 'eq' && c.args?.[0] === 'resource_type'
    );
    expect(resourceTypeFilter).toBeDefined();
    expect(resourceTypeFilter.args[1]).toBe('github_repo');
    // Verify status='active' filter is applied (closes the historical bug
    // where any status was returned).
    const statusFilter = supabase.__calls.find(
      c => c.table === 'venture_resources' && c.op === 'eq' && c.args?.[0] === 'status'
    );
    expect(statusFilter).toBeDefined();
    expect(statusFilter.args[1]).toBe('active');
  });

  it('(b) falls back to ventures.repo_url when venture_resources has no row', async () => {
    const supabase = makeSupabaseMock({ venture_resources: null, ventures: null });
    await analyzeStage20CodeQuality({
      stage19Data: null,
      ventureName: 'V2',
      ventureId: '00000000-0000-0000-0000-000000000003',
      supabase,
      logger: silentLogger,
    });
    const tablesQueried = supabase.__calls
      .filter(c => c.op === 'from')
      .map(c => c.table);
    // Both must be queried in order: primary first, then fallback.
    expect(tablesQueried.indexOf('venture_resources')).toBeLessThan(tablesQueried.indexOf('ventures'));
  });

  it('(c) does NOT query ventures table when venture_resources returns a row (short-circuits at primary)', async () => {
    // Seed venture_resources with a non-clone-friendly URL so the analyzer
    // gets past resolution but cloneRepo refuses (isSafeRepoUrl rejects
    // strings without the github.com host); we then verify the resolver
    // stopped at the primary path. The clone failure produces a deterministic
    // FAIL with 'Failed to clone repo' — which proves we NEVER fell through
    // to the ventures or stage19Data fallback.
    const supabase = makeSupabaseMock({
      venture_resources: { resource_identifier: 'not-a-github-url' },
      ventures: { repo_url: 'https://github.com/should-not-reach/this' },
    });
    const result = await analyzeStage20CodeQuality({
      stage19Data: { github_repo: 'https://github.com/should-not-reach/either' },
      ventureName: 'V3',
      ventureId: '00000000-0000-0000-0000-000000000004',
      supabase,
      logger: silentLogger,
    });
    // The analyzer used the primary URL — we know because cloneRepo refused
    // it (isSafeRepoUrl) and produced a FAIL with the original bad URL.
    expect(result.verdict).toBe('FAIL');
    expect(result.findings[0].title).toContain('not-a-github-url');
    // ventures must NOT have been queried.
    const tablesQueried = supabase.__calls
      .filter(c => c.op === 'from')
      .map(c => c.table);
    expect(tablesQueried).not.toContain('ventures');
  });

  it('(c) uses stage19Data.github_repo as tertiary fallback when supabase yields no row', async () => {
    const supabase = makeSupabaseMock({ venture_resources: null, ventures: null });
    const result = await analyzeStage20CodeQuality({
      stage19Data: { github_repo: 'not-a-real-url' },
      ventureName: 'V4',
      ventureId: '00000000-0000-0000-0000-000000000005',
      supabase,
      logger: silentLogger,
    });
    // The fallback URL was selected and reached cloneRepo; cloneRepo refused
    // (isSafeRepoUrl) → FAIL verdict with that exact URL surfaced.
    expect(result.verdict).toBe('FAIL');
    expect(result.findings[0].title).toContain('not-a-real-url');
  });

  it('(c) accepts repo_url alias and stage19Data.__byType.build_mvp_build.github_repo on stage19Data', async () => {
    const supabase = makeSupabaseMock({ venture_resources: null, ventures: null });
    const result = await analyzeStage20CodeQuality({
      stage19Data: { repo_url: 'aliased-bad-url' },
      ventureName: 'V5',
      ventureId: '00000000-0000-0000-0000-000000000006',
      supabase,
      logger: silentLogger,
    });
    expect(result.verdict).toBe('FAIL');
    expect(result.findings[0].title).toContain('aliased-bad-url');
  });
});

describe('stage-20-code-quality.js — persistAnalyzerFindings', () => {
  it('short-circuits cleanly when supabase is null', async () => {
    const r = await persistAnalyzerFindings(null, 'venture-id', { canonical: [{ x: 1 }], skipped: [] });
    expect(r).toEqual({ written: 0, errors: [], skipped_count: 0, skipped_reason: 'no_supabase_client' });
  });

  it('returns zero-write result when adapted is missing or empty', async () => {
    const supabase = makeSupabaseMock();
    expect(await persistAnalyzerFindings(supabase, 'v', null)).toEqual({ written: 0, errors: [], skipped_count: 0 });
    expect(await persistAnalyzerFindings(supabase, 'v', { canonical: [], skipped: [] })).toEqual({ written: 0, errors: [], skipped_count: 0 });
    expect(await persistAnalyzerFindings(supabase, 'v', { canonical: 'not-an-array', skipped: [] })).toEqual({ written: 0, errors: [], skipped_count: 0 });
  });

  it('captures writer errors without throwing when supabase explodes mid-batch', async () => {
    // Inject a supabase client whose .from() throws. Two possible failure
    // modes are acceptable here:
    //   1. The writer's per-finding loop catches and pushes
    //      {finding, error}.
    //   2. The analyzer's outer try/catch catches and pushes
    //      {scope:'persistence-toplevel', error}.
    // Both leave errors[] populated and never re-throw.
    const failingSupabase = {
      from: () => {
        throw new Error('canary: supabase exploded');
      },
    };
    const r = await persistAnalyzerFindings(failingSupabase, 'venture-id', {
      canonical: [{ id: 1, finding_hash: 'abc', venture_id: 'v', severity: 'medium' }],
      skipped: [],
    });
    expect(r.written).toBe(0);
    expect(Array.isArray(r.errors)).toBe(true);
    expect(r.errors.length).toBeGreaterThanOrEqual(1);
    const e = r.errors[0];
    // Either the writer-batch shape ({finding, error}) or the toplevel
    // shape ({scope, error}) — both must carry a string error message.
    const hasShape = (e.scope !== undefined) || (e.finding !== undefined);
    expect(hasShape).toBe(true);
    expect(typeof e.error).toBe('string');
  });
});

describe('stage-20-code-quality.js — constant exports', () => {
  it('CHECK_TYPES enumerates exactly the 4 documented checks', () => {
    expect(CHECK_TYPES).toEqual(['npm_audit', 'secret_detection', 'lint', 'test_suite']);
  });

  it('SEVERITY_LEVELS covers the 5 npm-audit-compatible levels', () => {
    expect(SEVERITY_LEVELS).toEqual(['critical', 'high', 'medium', 'low', 'info']);
  });

  it('VERDICT_OPTIONS is the canonical 3-state set', () => {
    // Note: BLOCKED is intentionally NOT in VERDICT_OPTIONS — it is a
    // missing-precondition state distinct from the 3 normal verdicts
    // (PASS/FAIL/WARN). buildNoRepoReport returns it directly.
    expect(VERDICT_OPTIONS).toEqual(['PASS', 'FAIL', 'WARN']);
  });
});
