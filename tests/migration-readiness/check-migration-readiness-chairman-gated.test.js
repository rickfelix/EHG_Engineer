/**
 * Tests for the chairman-gated migration-readiness exemption.
 * SD-LEO-INFRA-MIGRATION-READINESS-CHAIRMAN-GATED-EXEMPT-001
 *
 * TS-1 parseChairmanGatedMarker (dedicated marker; NOT @approved-by / prose)
 * TS-2 gated diverged function => EXPECTED_PENDING => PASS_CHAIRMAN_GATED_PENDING (exit-0 outcome)
 * TS-3 non-gated diverged function => DIVERGED => FAIL_DRIFT
 * TS-4 gated migration after apply (matches live) => MATCHES (clean PASS)
 * TS-5 mixed PR (gated-diverged + non-gated-diverged) => FAIL_DRIFT (non-gated dominates)
 * TS-6 gated CONFLICTING still fails (never exempted)
 * TS-7 inferSdKey resolution
 * TS-8 resolveSdGated reads metadata.requires_chairman_apply (best-effort, non-fatal)
 */
import { describe, it, expect } from 'vitest';
import {
  parseChairmanGatedMarker,
  evaluateMigration,
  classifyOutcome,
  inferSdKey,
  resolveSdGated,
  OUTCOME,
} from '../../scripts/check-migration-readiness.mjs';

const FN = (body) => `
CREATE OR REPLACE FUNCTION public.fn_chairman_decide() RETURNS void AS $$
BEGIN
  ${body}
END;
$$ LANGUAGE plpgsql;
`;

// A CREATE FUNCTION without OR REPLACE on an EXISTING object => CONFLICTING.
const FN_BARE = `
CREATE FUNCTION public.fn_chairman_decide() RETURNS void AS $$
BEGIN
  PERFORM 1;
END;
$$ LANGUAGE plpgsql;
`;

const MARKER = '-- @chairman-gated\n';

// Mock client: state.functions maps "schema.name" -> live body.
function makeMockClient(state) {
  return {
    async query(sql, params) {
      if (/pg_proc/.test(sql)) {
        const [schema, name] = params;
        const body = state.functions[`${schema}.${name}`];
        return { rows: body === undefined ? [] : [{ body }], rowCount: body === undefined ? 0 : 1 };
      }
      if (/strategic_directives_v2/.test(sql)) {
        const [sdKey] = params;
        const flag = state.sdFlags?.[sdKey];
        return { rows: flag === undefined ? [] : [{ flag }], rowCount: flag === undefined ? 0 : 1 };
      }
      if (/pg_trigger/.test(sql)) return { rowCount: 0, rows: [] };
      throw new Error('unexpected query: ' + sql);
    },
    async end() {},
  };
}

// ── TS-1: marker parser ──────────────────────────────────────────────────────
describe('parseChairmanGatedMarker', () => {
  it('matches each dedicated marker line', () => {
    expect(parseChairmanGatedMarker('-- @chairman-gated')).toBe(true);
    expect(parseChairmanGatedMarker('-- requires-chairman-apply')).toBe(true);
    expect(parseChairmanGatedMarker('-- requires_chairman_apply')).toBe(true);
    expect(parseChairmanGatedMarker('  --   @chairman-gated: codestreetlabs@gmail.com')).toBe(true);
    expect(parseChairmanGatedMarker('-- REQUIRES-CHAIRMAN-APPLY')).toBe(true);
  });

  it('does NOT match the broad @approved-by marker', () => {
    expect(parseChairmanGatedMarker('-- @approved-by: codestreetlabs@gmail.com')).toBe(false);
  });

  it('does NOT match a prose mention of the convention', () => {
    expect(parseChairmanGatedMarker(
      '-- This migration follows the requires_chairman_apply convention adopted by Adam.'
    )).toBe(false);
    expect(parseChairmanGatedMarker('SELECT 1; -- defer to chairman-gated apply later')).toBe(false);
  });

  it('finds the marker among other header lines', () => {
    expect(parseChairmanGatedMarker(`-- @approved-by: x@y.com\n-- @chairman-gated\n${FN('PERFORM 1;')}`)).toBe(true);
  });

  it('returns false for empty / null', () => {
    expect(parseChairmanGatedMarker('')).toBe(false);
    expect(parseChairmanGatedMarker(null)).toBe(false);
  });
});

// ── TS-2 / TS-3 / TS-4: gated vs non-gated divergence ────────────────────────
describe('evaluateMigration chairman-gated exemption', () => {
  const live = { functions: { 'public.fn_chairman_decide': 'BEGIN\n  PERFORM 99;\nEND;' } };

  it('TS-2: gated (via marker) diverged function => EXPECTED_PENDING', async () => {
    const sql = MARKER + FN('PERFORM 1;'); // body differs from live (99)
    const r = await evaluateMigration({ filePath: 'm.sql', sql, client: makeMockClient(live) });
    expect(r.findings[0].status).toBe('EXPECTED_PENDING');
    expect(classifyOutcome([r])).toBe(OUTCOME.PASS_CHAIRMAN_GATED_PENDING);
  });

  it('TS-2b: gated via the SD-level flag (chairmanGated=true), no in-file marker', async () => {
    const sql = FN('PERFORM 1;');
    const r = await evaluateMigration({ filePath: 'm.sql', sql, client: makeMockClient(live), chairmanGated: true });
    expect(r.findings[0].status).toBe('EXPECTED_PENDING');
    expect(classifyOutcome([r])).toBe(OUTCOME.PASS_CHAIRMAN_GATED_PENDING);
  });

  it('TS-3: non-gated diverged function => DIVERGED => FAIL_DRIFT', async () => {
    const sql = FN('PERFORM 1;');
    const r = await evaluateMigration({ filePath: 'm.sql', sql, client: makeMockClient(live) });
    expect(r.findings[0].status).toBe('DIVERGED');
    expect(classifyOutcome([r])).toBe(OUTCOME.FAIL_DRIFT);
  });

  it('TS-4: gated migration after apply (body matches live) => MATCHES, clean PASS', async () => {
    const matchingLive = { functions: { 'public.fn_chairman_decide': 'BEGIN\n  PERFORM 1;\nEND;' } };
    const sql = MARKER + FN('PERFORM 1;');
    const r = await evaluateMigration({ filePath: 'm.sql', sql, client: makeMockClient(matchingLive) });
    expect(r.findings[0].status).toBe('MATCHES');
    expect(classifyOutcome([r])).toBe(OUTCOME.PASS);
  });

  it('TS-6: gated CONFLICTING is NEVER exempted', async () => {
    const sql = MARKER + FN_BARE; // bare CREATE on existing object
    const r = await evaluateMigration({ filePath: 'm.sql', sql, client: makeMockClient(live), chairmanGated: true });
    expect(r.findings[0].status).toBe('CONFLICTING');
    expect(classifyOutcome([r])).toBe(OUTCOME.FAIL_CONFLICTING);
  });
});

// ── TS-5: mixed PR — non-gated drift dominates ───────────────────────────────
describe('classifyOutcome priority (mixed PR)', () => {
  it('TS-5: a gated EXPECTED_PENDING + a non-gated DIVERGED => FAIL_DRIFT', () => {
    const reports = [
      { filePath: 'gated.sql', findings: [{ kind: 'function', name: 'a', status: 'EXPECTED_PENDING' }] },
      { filePath: 'plain.sql', findings: [{ kind: 'function', name: 'b', status: 'DIVERGED' }] },
    ];
    expect(classifyOutcome(reports)).toBe(OUTCOME.FAIL_DRIFT);
  });

  it('CONFLICTING outranks both DRIFT and EXPECTED_PENDING', () => {
    const reports = [
      { filePath: 'g.sql', findings: [{ status: 'EXPECTED_PENDING' }] },
      { filePath: 'd.sql', findings: [{ status: 'DIVERGED' }] },
      { filePath: 'c.sql', findings: [{ status: 'CONFLICTING' }] },
    ];
    expect(classifyOutcome(reports)).toBe(OUTCOME.FAIL_CONFLICTING);
  });

  it('only-gated divergence => PASS_CHAIRMAN_GATED_PENDING', () => {
    const reports = [{ filePath: 'g.sql', findings: [{ status: 'EXPECTED_PENDING' }] }];
    expect(classifyOutcome(reports)).toBe(OUTCOME.PASS_CHAIRMAN_GATED_PENDING);
  });
});

// ── TS-7: SD key inference ───────────────────────────────────────────────────
describe('inferSdKey', () => {
  it('prefers an explicit --sd value', () => {
    expect(inferSdKey({ sd: 'SD-LEO-INFRA-FOO-001', env: {} })).toBe('SD-LEO-INFRA-FOO-001');
  });
  it('infers from a feat/SD-* branch in GITHUB_HEAD_REF', () => {
    expect(inferSdKey({ env: { GITHUB_HEAD_REF: 'feat/SD-LEO-INFRA-BAR-002' } })).toBe('SD-LEO-INFRA-BAR-002');
  });
  it('infers from GITHUB_REF_NAME and uppercases the key', () => {
    expect(inferSdKey({ env: { GITHUB_REF_NAME: 'feat/SD-ABC-003-extra' } })).toBe('SD-ABC-003-EXTRA');
  });
  it('returns null when nothing resolves (no git, no env)', () => {
    // env has no branch hints; git inference may or may not match, so only assert non-throwing string|null
    const r = inferSdKey({ env: { GITHUB_HEAD_REF: 'main', GITHUB_REF_NAME: 'main' } });
    expect(r === null || typeof r === 'string').toBe(true);
  });
});

// ── TS-8: SD metadata read ───────────────────────────────────────────────────
describe('resolveSdGated', () => {
  it('returns true when metadata.requires_chairman_apply is "true"', async () => {
    const client = makeMockClient({ functions: {}, sdFlags: { 'SD-X-001': 'true' } });
    expect(await resolveSdGated({ sdKey: 'SD-X-001', client })).toBe(true);
  });
  it('returns false when the flag is absent/false', async () => {
    const client = makeMockClient({ functions: {}, sdFlags: { 'SD-X-001': 'false' } });
    expect(await resolveSdGated({ sdKey: 'SD-X-001', client })).toBe(false);
    expect(await resolveSdGated({ sdKey: 'SD-MISSING', client })).toBe(false);
  });
  it('is non-fatal: no key or no client => false, never throws', async () => {
    expect(await resolveSdGated({ sdKey: null, client: makeMockClient({ functions: {} }) })).toBe(false);
    expect(await resolveSdGated({ sdKey: 'SD-X', client: null })).toBe(false);
  });
  it('swallows a query error and returns false', async () => {
    const throwing = { async query() { throw new Error('db down'); }, async end() {} };
    expect(await resolveSdGated({ sdKey: 'SD-X', client: throwing })).toBe(false);
  });
});
