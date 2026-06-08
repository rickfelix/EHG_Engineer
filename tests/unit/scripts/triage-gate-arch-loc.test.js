/**
 * SD-LEO-FIX-FIX-TRIAGE-GATE-001 — regression test for lookupArchPlanLOC().
 *
 * The bug: lookupArchPlanLOC queried a NON-EXISTENT column `plan_content` on
 * eva_architecture_plans (the real column is `content`), so the query silently
 * returned nothing and the arch-plan LOC-based Tier-3 auto-escalation was a
 * permanent no-op. These tests assert it now reads `content` and extracts LOC.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('dotenv', () => ({ config: vi.fn(), default: { config: vi.fn() } }));
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));

import { createClient } from '@supabase/supabase-js';
import { lookupArchPlanLOC } from '../../../scripts/modules/triage-gate.js';

// Chainable builder whose .single() resolves to the given {data,error}.
function makeClient(single, error = null) {
  const chain = {
    select() { return chain; },
    eq() { return chain; },
    order() { return chain; },
    limit() { return chain; },
    single() { return Promise.resolve({ data: single, error }); },
  };
  return { from: () => chain };
}

const ORIG = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };

beforeEach(() => {
  vi.clearAllMocks();
  // The function guards on these env vars before querying.
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
});

afterEach(() => {
  process.env.SUPABASE_URL = ORIG.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = ORIG.key;
});

describe('lookupArchPlanLOC (SD-LEO-FIX-FIX-TRIAGE-GATE-001)', () => {
  it('returns the LOC estimate from the real `content` column (was the no-op bug)', async () => {
    createClient.mockReturnValue(makeClient({ content: '# Plan\n\nEstimated LOC: 240\n' }));
    const loc = await lookupArchPlanLOC('ARCH-X-001');
    expect(loc).toBe(240);
  });

  it('matches the "<n> lines of code" phrasing as well', async () => {
    createClient.mockReturnValue(makeClient({ content: 'This change is roughly 130 lines of code total.' }));
    expect(await lookupArchPlanLOC('ARCH-X-001')).toBe(130);
  });

  it('selects the `content` column — a row exposing only the old `plan_content` yields null', async () => {
    // Proves the fix: had we still selected/read `plan_content`, this would parse it.
    createClient.mockReturnValue(makeClient({ plan_content: 'Estimated LOC: 999' }));
    expect(await lookupArchPlanLOC('ARCH-X-001')).toBeNull();
  });

  it('returns null when content has no LOC estimate', async () => {
    createClient.mockReturnValue(makeClient({ content: '# Plan\n\nNo size hint here.' }));
    expect(await lookupArchPlanLOC('ARCH-X-001')).toBeNull();
  });

  it('returns null (no throw) when the env/archKey guard is not satisfied', async () => {
    delete process.env.SUPABASE_URL;
    expect(await lookupArchPlanLOC('ARCH-X-001')).toBeNull();
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    expect(await lookupArchPlanLOC('')).toBeNull();
  });
});
