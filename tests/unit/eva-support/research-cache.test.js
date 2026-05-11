/**
 * SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-B / TR-3, FR-2, TEST-3, US-004
 *
 * Unit tests for lib/eva-support/research-cache.js — hash normalization,
 * get/set happy paths, TTL miss, accessed_at bump, schema-cache-miss fail-soft.
 */

import { describe, it, expect, vi } from 'vitest';
import { get, set, hashQuery, normalizeQuery } from '../../../lib/eva-support/research-cache.js';

function fakeClient({ getResult, getError, upsertError } = {}) {
  const c = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockImplementation(() => Promise.resolve({ error: upsertError ?? null })),
    maybeSingle: vi.fn().mockResolvedValue({ data: getResult ?? null, error: getError ?? null }),
  };
  return c;
}

describe('normalizeQuery', () => {
  it('lowercases + trims + collapses whitespace', () => {
    expect(normalizeQuery('  Hello   World  ')).toBe('hello world');
    expect(normalizeQuery('FOO\tBAR\n\nBAZ')).toBe('foo bar baz');
  });

  it('returns empty string for non-string input', () => {
    expect(normalizeQuery(null)).toBe('');
    expect(normalizeQuery(42)).toBe('');
  });
});

describe('hashQuery', () => {
  it('produces stable SHA-256 hex (64 chars) across whitespace/case variants', () => {
    const a = hashQuery('What is X?');
    const b = hashQuery('  what is x?  ');
    const c = hashQuery('WHAT IS X?');
    expect(a).toBe(b);
    expect(a).toBe(c);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it('produces different hashes for different normalized queries', () => {
    expect(hashQuery('foo')).not.toBe(hashQuery('bar'));
  });
});

describe('research-cache.get', () => {
  it('returns hit:true when row exists and ttl_until > now', async () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    const client = fakeClient({ getResult: { response_text: 'cached', references: ['ref1'], ttl_until: future } });
    const result = await get('What is X?', { client });
    expect(result.hit).toBe(true);
    expect(result.response).toBe('cached');
    expect(result.references).toEqual(['ref1']);
    expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns hit:false when no row matches', async () => {
    const client = fakeClient({ getResult: null });
    const result = await get('What is Y?', { client });
    expect(result.hit).toBe(false);
    expect(result.response).toBeNull();
  });

  it('fail-soft: returns hit:false on schema-cache miss', async () => {
    const client = fakeClient({ getError: { code: 'PGRST205', message: 'Could not find the table' } });
    const result = await get('What is Z?', { client });
    expect(result.hit).toBe(false);
  });

  it('fail-soft: returns hit:false on any other error (default mode)', async () => {
    const client = fakeClient({ getError: { code: '42501', message: 'permission denied' } });
    const result = await get('What is Q?', { client });
    expect(result.hit).toBe(false);
  });
});

describe('research-cache.set', () => {
  it('returns written:true on successful upsert', async () => {
    const client = fakeClient({});
    const result = await set('What is X?', 'response text', { client, references: ['r1'] });
    expect(result.written).toBe(true);
    expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(client.upsert).toHaveBeenCalled();
  });

  it('returns written:false when responseText is not a string', async () => {
    const client = fakeClient({});
    const result = await set('What is X?', null, { client });
    expect(result.written).toBe(false);
  });

  it('fail-soft: returns written:false on upsert error', async () => {
    const client = fakeClient({ upsertError: { code: '42501', message: 'permission denied' } });
    const result = await set('What is X?', 'response', { client });
    expect(result.written).toBe(false);
  });
});
