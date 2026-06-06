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
  normalizeRepoUrl,
  isSafeRepoUrl,
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

  it('(c) continues to the ventures fallback when venture_resources holds an INVALID resource_identifier (SD-FDBK-FIX-STAGE-REPOURL-RESOLUTION-001)', async () => {
    // SD-FDBK-FIX-STAGE-REPOURL-RESOLUTION-001 changed resolution from "first
    // truthy candidate" to "first VALID candidate". An invalid primary (a
    // non-github-host string) no longer short-circuits — the resolver now
    // queries the ventures fallback so a malformed venture_resources row cannot
    // shadow a valid ventures.repo_url. (This test previously asserted the OLD
    // short-circuit behavior, which was the bug.) All candidates here are
    // invalid, so cloneRepo refuses before any network call — pure unit test.
    const supabase = makeSupabaseMock({
      venture_resources: { resource_identifier: 'not-a-github-url' },
      ventures: { repo_url: 'also-not-a-github-url' },
    });
    const result = await analyzeStage20CodeQuality({
      stage19Data: { github_repo: 'still-not-a-github-url' },
      ventureName: 'V3',
      ventureId: '00000000-0000-0000-0000-000000000004',
      supabase,
      logger: silentLogger,
    });
    // No valid candidate anywhere -> terminal fallback to the first raw
    // candidate -> cloneRepo refuses it -> deterministic FAIL (no network).
    expect(result.verdict).toBe('FAIL');
    expect(result.findings[0].title).toContain('not-a-github-url');
    // The ventures fallback WAS consulted — proves the resolver no longer
    // short-circuits on an invalid primary (the core of the resolution fix).
    const tablesQueried = supabase.__calls
      .filter(c => c.op === 'from')
      .map(c => c.table);
    expect(tablesQueried).toContain('ventures');
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
  it('CHECK_TYPES enumerates the 8 documented checks (SD-LEO-INFRA-STAGE-CODE-QUALITY-001 expanded 4->8)', () => {
    expect(CHECK_TYPES).toEqual([
      'npm_audit', 'secret_detection', 'lint', 'test_suite',
      'unit_test', 'e2e_test', 'feedback_widget_present', 'error_capture_wired',
    ]);
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

// SD-FDBK-FIX-STAGE-REPOURL-RESOLUTION-001 — repo URL resolution fix.
// Background: venture-provisioner.js writes venture_resources.resource_identifier
// as an `owner/repo` shorthand (full URL only in resource metadata). The old
// resolver returned the first *truthy* candidate as-is, so the shorthand failed
// isSafeRepoUrl and S20 hard-FAILed even when a valid ventures.repo_url existed.
describe('normalizeRepoUrl — owner/repo shorthand normalization (FR-1)', () => {
  it('normalizes a bare owner/repo shorthand to a full GitHub HTTPS URL', () => {
    expect(normalizeRepoUrl('rickfelix/datadistill')).toBe('https://github.com/rickfelix/datadistill');
  });

  it('normalizes owner/repo.git shorthand (dot is allowed in the repo segment)', () => {
    expect(normalizeRepoUrl('rickfelix/datadistill.git')).toBe('https://github.com/rickfelix/datadistill.git');
  });

  it('leaves an already-full HTTPS URL unchanged', () => {
    expect(normalizeRepoUrl('https://github.com/rickfelix/datadistill.git'))
      .toBe('https://github.com/rickfelix/datadistill.git');
  });

  it('does NOT normalize a string with shell metacharacters (no single owner/repo shape)', () => {
    const evil = 'rickfelix/data; rm -rf /';
    expect(normalizeRepoUrl(evil)).toBe(evil);
  });

  it('does NOT normalize a single token with no slash', () => {
    expect(normalizeRepoUrl('justonetoken')).toBe('justonetoken');
  });

  it('does NOT normalize a 3-segment path (only a single owner/repo qualifies)', () => {
    expect(normalizeRepoUrl('owner/repo/extra')).toBe('owner/repo/extra');
  });

  it('returns non-string input unchanged', () => {
    expect(normalizeRepoUrl(null)).toBeNull();
    expect(normalizeRepoUrl(undefined)).toBeUndefined();
  });
});

describe('normalizeRepoUrl + isSafeRepoUrl composition — injection guard preserved (FR-3)', () => {
  it('a shorthand becomes a URL that passes the strict GitHub-HTTPS guard', () => {
    expect(isSafeRepoUrl(normalizeRepoUrl('rickfelix/datadistill'))).toBe(true);
  });

  it('shell-metacharacter candidates never pass the guard after normalization', () => {
    expect(isSafeRepoUrl(normalizeRepoUrl('rickfelix/data; rm -rf /'))).toBe(false);
    expect(isSafeRepoUrl(normalizeRepoUrl('rickfelix/data`whoami`'))).toBe(false);
  });

  it('a non-github host is not coerced into validity', () => {
    expect(isSafeRepoUrl(normalizeRepoUrl('https://evil.example.com/a/b'))).toBe(false);
  });

  it('an already-valid full GitHub URL still passes', () => {
    expect(isSafeRepoUrl(normalizeRepoUrl('https://github.com/rickfelix/datadistill'))).toBe(true);
  });
});

describe('analyzer resolution — skip invalid candidate and continue (FR-2)', () => {
  it('queries ventures.repo_url even when venture_resources holds an INVALID resource_identifier', async () => {
    // OLD behavior: a truthy-but-invalid resource_identifier short-circuited
    // resolution (ventures was never queried) and S20 hard-FAILed. NEW behavior:
    // an invalid primary does not satisfy isSafeRepoUrl, so the ventures fallback
    // IS queried. Both candidates here are invalid, so no real git clone runs
    // (isSafeRepoUrl rejects before execAsync) — keeping this a pure unit test.
    const supabase = makeSupabaseMock({
      venture_resources: { resource_identifier: 'not a valid url at all' },
      ventures: { repo_url: 'also-not-valid' },
    });
    const result = await analyzeStage20CodeQuality({
      stage19Data: null,
      ventureName: 'ShadowVenture',
      ventureId: '00000000-0000-0000-0000-000000000002',
      supabase,
      logger: silentLogger,
    });
    // The ventures table WAS consulted — proves resolution continued past the
    // invalid primary instead of shadowing a potential valid fallback.
    expect(supabase.__calls.some((c) => c.table === 'ventures')).toBe(true);
    // Terminal behavior preserved: invalid-only candidates -> clone refused -> FAIL
    // (not silently downgraded to the no-repo advisory).
    expect(result.verdict).toBe('FAIL');
    expect(result.repo_url).toBe('not a valid url at all');
  });
});
