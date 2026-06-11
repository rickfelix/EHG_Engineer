/**
 * SD-LEO-INFRA-FACTORY-COST-UNIT-001 (FR-3 / TS-3) — usage-logger sd_id fallback.
 * Mocks @supabase/supabase-js; asserts the fallback chain
 * (explicit sdId > LEO_SD_KEY env > cached active-claim lookup > null)
 * and that the fire-and-forget path never throws.
 *
 * TEST_REQUIRES_DB: false — @supabase/supabase-js is vi.mock'd below and the
 * SUPABASE_* env values set in beforeEach are fakes that only satisfy the
 * logger's `if (url && key)` construction gate; no network/DB access occurs.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const inserted = [];
let claimResult = { data: { sd_key: 'SD-CLAIMED-001' }, error: null };
let claimLookups = 0;

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table) => {
      if (table === 'claude_sessions') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => {
                claimLookups++;
                return Promise.resolve(claimResult);
              },
            }),
          }),
        };
      }
      return {
        insert: (row) => {
          inserted.push(row);
          return Promise.resolve({ error: null });
        },
      };
    },
  }),
}));

const ENV_KEYS = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'CLAUDE_SESSION_ID', 'LEO_SD_KEY'];
const saved = {};

async function freshLogger() {
  vi.resetModules();
  const mod = await import('../../../lib/llm/usage-logger.js');
  mod._resetClaimCacheForTest();
  return mod;
}

const flush = () => new Promise((r) => setTimeout(r, 10));

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  process.env.SUPABASE_URL = 'http://fake.local';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-key';
  process.env.CLAUDE_SESSION_ID = 'sess-test-1';
  delete process.env.LEO_SD_KEY;
  inserted.length = 0;
  claimLookups = 0;
  claimResult = { data: { sd_key: 'SD-CLAIMED-001' }, error: null };
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('usage-logger sd_id fallback (FR-3)', () => {
  it('explicit sdId short-circuits (no claim lookup)', async () => {
    const { logUsage } = await freshLogger();
    logUsage({ model: 'gemini-2.5-flash', sdId: 'SD-EXPLICIT-001' });
    await flush();
    expect(inserted).toHaveLength(1);
    expect(inserted[0].sd_id).toBe('SD-EXPLICIT-001');
    expect(claimLookups).toBe(0);
  });

  it('falls back to LEO_SD_KEY env before the claim lookup', async () => {
    process.env.LEO_SD_KEY = 'SD-FROM-ENV-001';
    const { logUsage } = await freshLogger();
    logUsage({ model: 'gemini-2.5-flash' });
    await flush();
    expect(inserted[0].sd_id).toBe('SD-FROM-ENV-001');
    expect(claimLookups).toBe(0);
  });

  it('falls back to the active claim and caches the lookup', async () => {
    const { logUsage } = await freshLogger();
    logUsage({ model: 'gemini-2.5-flash' });
    logUsage({ model: 'gemini-2.5-flash' });
    await flush();
    expect(inserted).toHaveLength(2);
    expect(inserted[0].sd_id).toBe('SD-CLAIMED-001');
    expect(inserted[1].sd_id).toBe('SD-CLAIMED-001');
    expect(claimLookups).toBe(1); // cached after first resolution
  });

  it('lookup failure → logs with sd_id null and never throws', async () => {
    // Rejecting thenable: adopted on resolution, so the logger's .catch absorbs it.
    claimResult = { then: (_, rej) => rej(new Error('db down')) };
    const { logUsage } = await freshLogger();
    expect(() => logUsage({ model: 'gemini-2.5-flash' })).not.toThrow();
    await flush();
    expect(inserted).toHaveLength(1);
    expect(inserted[0].sd_id).toBeNull();
  });

  it('no session row → sd_id null', async () => {
    claimResult = { data: null, error: null };
    const { logUsage } = await freshLogger();
    logUsage({ model: 'gemini-2.5-flash' });
    await flush();
    expect(inserted[0].sd_id).toBeNull();
  });

  it('no CLAUDE_SESSION_ID → sd_id null without lookup', async () => {
    delete process.env.CLAUDE_SESSION_ID;
    const { logUsage } = await freshLogger();
    logUsage({ model: 'gemini-2.5-flash' });
    await flush();
    expect(inserted[0].sd_id).toBeNull();
    expect(claimLookups).toBe(0);
  });
});
