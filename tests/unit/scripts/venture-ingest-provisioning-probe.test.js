/**
 * QF-20260817-752 — provisioning readiness probe + post-provision verification for the
 * venture ingest-key ceremony (docs/reference/anon-write-contract.md FR-2/FR-3).
 * Provisioning itself (fn_provision_venture_ingest_key) is chairman-hand only and is never
 * called anywhere in this file or the script under test — see its own header.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  evaluateReadiness,
  runReadinessProbe,
  verifySubmissionLanded,
  KNOWN_VENTURES,
} from '../../../scripts/venture-ingest-provisioning-probe.mjs';

const SOURCE_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../../scripts/venture-ingest-provisioning-probe.mjs');

describe('sequencing guard (SD-binding, verbatim from the QF)', () => {
  it('mentions fn_provision_venture_ingest_key only in prose/comments, never as a call — chairman-hand only', () => {
    const source = readFileSync(SOURCE_PATH, 'utf8');
    // The identifier legitimately appears in the file's own explanatory header comment; what must
    // never appear is an actual invocation shape: a direct call, an .rpc() dispatch, or the name
    // as a bare SQL statement target.
    expect(source).not.toMatch(/fn_provision_venture_ingest_key\s*\(/);
    expect(source).not.toMatch(/\.rpc\(\s*['"]fn_provision_venture_ingest_key['"]/);
    // Sanity: the identifier IS present (in the explanatory comment) — a future refactor that
    // silently drops the guard's own documentation should not read as passing.
    expect(source).toContain('fn_provision_venture_ingest_key');
  });
});

/** Minimal chainable fake matching the two query shapes this file issues. */
function fakeSupabase({ keyRows = {}, feedbackResult = { data: [], error: null, count: 0 } } = {}) {
  return {
    from(table) {
      if (table === 'venture_ingest_keys') {
        let ventureId;
        const builder = {
          select: () => builder,
          eq: (_col, val) => { ventureId = val; return builder; },
          limit: () => Promise.resolve({ data: keyRows[ventureId] ? [{ venture_id: ventureId }] : [], error: null }),
        };
        return builder;
      }
      if (table === 'feedback') {
        const builder = {
          select: () => builder,
          eq: () => builder,
          gte: () => builder,
          order: () => builder,
          limit: () => Promise.resolve(feedbackResult),
        };
        return builder;
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

describe('evaluateReadiness (pure)', () => {
  it('is ready with no blockers when caller exists, deployed, and no key row yet', () => {
    const v = { id: 'v1', name: 'Test', hasLiveCaller: true, deploymentLive: true, deploymentNote: '' };
    expect(evaluateReadiness(v, false)).toEqual({
      ventureId: 'v1', ventureName: 'Test', liveCallerExists: true, deploymentLive: true,
      keyRowExists: false, ready: true, blockers: [],
    });
  });

  it('blocks on no live caller', () => {
    const v = { id: 'v1', name: 'Test', hasLiveCaller: false, deploymentLive: true, deploymentNote: '' };
    const r = evaluateReadiness(v, false);
    expect(r.ready).toBe(false);
    expect(r.blockers).toContain('no live caller');
  });

  it('blocks on not deployed, including the deploymentNote', () => {
    const v = { id: 'v1', name: 'Test', hasLiveCaller: true, deploymentLive: false, deploymentNote: 'CF token pending' };
    const r = evaluateReadiness(v, false);
    expect(r.ready).toBe(false);
    expect(r.blockers[0]).toContain('CF token pending');
  });

  it('blocks and warns about rotation when a key row already exists — this is the sequencing guard made visible', () => {
    const v = { id: 'v1', name: 'Test', hasLiveCaller: true, deploymentLive: true, deploymentNote: '' };
    const r = evaluateReadiness(v, true);
    expect(r.ready).toBe(false);
    expect(r.blockers.some((b) => b.includes('ROTATES'))).toBe(true);
  });

  it('accumulates multiple blockers rather than short-circuiting on the first', () => {
    const v = { id: 'v1', name: 'Test', hasLiveCaller: false, deploymentLive: false, deploymentNote: 'x' };
    const r = evaluateReadiness(v, true);
    expect(r.blockers).toHaveLength(3);
  });
});

describe('KNOWN_VENTURES (hand-maintained fact table sanity)', () => {
  it('every entry has a well-formed UUID id and non-empty name', () => {
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const v of KNOWN_VENTURES) {
      expect(v.id).toMatch(uuidRe);
      expect(v.name.length).toBeGreaterThan(0);
    }
  });

  it('AltifyAI is marked not-deployed — matches the QF description at authoring time', () => {
    const altifyai = KNOWN_VENTURES.find((v) => v.name === 'AltifyAI');
    expect(altifyai.deploymentLive).toBe(false);
  });
});

describe('runReadinessProbe', () => {
  it('reads key-row-exists per venture and folds it into evaluateReadiness', async () => {
    const supabase = fakeSupabase({ keyRows: { [KNOWN_VENTURES[0].id]: true } });
    const results = await runReadinessProbe(supabase, KNOWN_VENTURES);
    expect(results).toHaveLength(2);
    expect(results[0].keyRowExists).toBe(true);
    expect(results[0].ready).toBe(false);
    expect(results[1].keyRowExists).toBe(false);
  });

  it('propagates a DB read error instead of silently treating it as key-row-absent', async () => {
    const supabase = { from: () => ({ select: () => ({ eq: () => ({ limit: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }) }) }) };
    await expect(runReadinessProbe(supabase, [KNOWN_VENTURES[0]])).rejects.toThrow('venture_ingest_keys read failed: boom');
  });
});

describe('verifySubmissionLanded', () => {
  it('reports landed:true with the exact count when rows exist', async () => {
    const supabase = fakeSupabase({ feedbackResult: { data: [{ id: 'f1', created_at: '2026-08-17T10:00:00Z' }], error: null, count: 3 } });
    const r = await verifySubmissionLanded(supabase, 'v1', '2026-08-17T00:00:00Z');
    expect(r).toEqual({ landed: true, count: 3, sample: [{ id: 'f1', created_at: '2026-08-17T10:00:00Z' }] });
  });

  it('reports landed:false on zero rows — client no-error is not evidence, this is', async () => {
    const supabase = fakeSupabase({ feedbackResult: { data: [], error: null, count: 0 } });
    const r = await verifySubmissionLanded(supabase, 'v1', '2026-08-17T00:00:00Z');
    expect(r.landed).toBe(false);
  });

  it('throws on a DB error rather than reporting a false landed:false', async () => {
    const supabase = { from: () => ({ select: () => ({ eq: () => ({ gte: () => ({ order: () => ({ limit: () => Promise.resolve({ data: null, error: { message: 'timeout' }, count: null }) }) }) }) }) }) };
    await expect(verifySubmissionLanded(supabase, 'v1', '2026-08-17T00:00:00Z')).rejects.toThrow('feedback verification read failed: timeout');
  });
});
