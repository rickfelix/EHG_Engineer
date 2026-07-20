/**
 * QF-20260720-597: lib/coordinator/safe-metadata-merge.mjs
 *
 * Shared atomic-merge helper so future metadata stampers cannot reintroduce the
 * read-spread-write anti-pattern that silently resurrects a concurrently-cleared
 * coordinator hold flag (needs_coordinator_review / requires_human_action). Mirrors
 * clear-coordinator-review.js's exemplar test style: a fake raw-pg client, one atomic
 * `||` merge query, no follow-up read.
 */
import { describe, it, expect, vi } from 'vitest';
import { mergeMetadataKeys } from '../../../lib/coordinator/safe-metadata-merge.mjs';

function fakeClient({ rowCount = 1, queryError = null } = {}) {
  const queries = [];
  return {
    queries,
    query: vi.fn(async (sql, params) => {
      queries.push({ sql, params });
      if (queryError) throw queryError;
      return { rowCount };
    }),
    end: vi.fn(async () => {}),
  };
}

describe('mergeMetadataKeys', () => {
  it('throws synchronously on a missing sdKey (programmer error)', async () => {
    await expect(mergeMetadataKeys()).rejects.toThrow('sdKey is required');
  });

  it('throws synchronously on a non-object patch (programmer error)', async () => {
    await expect(mergeMetadataKeys('SD-TEST-001', 'not-an-object')).rejects.toThrow('patch must be a plain object');
    await expect(mergeMetadataKeys('SD-TEST-001', ['array'])).rejects.toThrow('patch must be a plain object');
  });

  it('issues ONE atomic || merge touching only the given keys, and closes the connection', async () => {
    const client = fakeClient({ rowCount: 1 });
    const createClientFn = vi.fn(async () => client);

    const result = await mergeMetadataKeys('SD-TEST-001', { model_tier_decisions: [{ tier: 'fable' }] }, { createClientFn });

    expect(result).toEqual({ merged: true, sdKey: 'SD-TEST-001' });
    expect(client.queries).toHaveLength(1);
    expect(client.queries[0].sql).toMatch(/\|\|/);
    expect(client.queries[0].sql).toMatch(/^\s*UPDATE strategic_directives_v2/i);
    expect(client.queries[0].sql).toMatch(/COALESCE\(metadata/i);
    expect(client.queries[0].params[0]).toBe('SD-TEST-001');
    expect(JSON.parse(client.queries[0].params[1])).toEqual({ model_tier_decisions: [{ tier: 'fable' }] });
    expect(client.end).toHaveBeenCalledOnce();
  });

  it('never sends a full-metadata-blob spread — the patch param carries ONLY the caller-given keys', async () => {
    const client = fakeClient({ rowCount: 1 });
    const createClientFn = vi.fn(async () => client);
    // A caller reading a stale snapshot with hold flags must never re-transmit them —
    // the whole point is that this function's SQL param is the patch object as-given,
    // never a spread of some larger metadata blob the caller may have read.
    await mergeMetadataKeys('SD-TEST-001', { some_key: 'value' }, { createClientFn });
    const sentPatch = JSON.parse(client.queries[0].params[1]);
    expect(Object.keys(sentPatch)).toEqual(['some_key']);
  });

  it('reports merged:false (no throw) when no row matched', async () => {
    const client = fakeClient({ rowCount: 0 });
    const createClientFn = vi.fn(async () => client);
    const result = await mergeMetadataKeys('SD-NOPE-001', { x: 1 }, { createClientFn });
    expect(result).toEqual({ merged: false, sdKey: 'SD-NOPE-001' });
  });

  it('fail-soft on connection failure — never throws, closes nothing (no client to close)', async () => {
    const createClientFn = vi.fn(async () => { throw new Error('connect refused'); });
    const result = await mergeMetadataKeys('SD-TEST-001', { x: 1 }, { createClientFn });
    expect(result.merged).toBe(false);
    expect(result.error).toMatch(/db_connect_failed/);
  });

  it('fail-soft on query failure — still closes the connection', async () => {
    const client = fakeClient({ queryError: new Error('constraint violation') });
    const createClientFn = vi.fn(async () => client);
    const result = await mergeMetadataKeys('SD-TEST-001', { x: 1 }, { createClientFn });
    expect(result.merged).toBe(false);
    expect(result.error).toMatch(/constraint violation/);
    expect(client.end).toHaveBeenCalledOnce();
  });
});
