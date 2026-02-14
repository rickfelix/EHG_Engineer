/**
 * Tests for Centralized Claim Guard
 * SD-LEO-INFRA-CLAIM-GUARD-001
 *
 * Tests the claimGuard decision tree:
 *   - Own claim → PROCEED
 *   - No claim → Acquire → PROCEED
 *   - Active session → HARD STOP
 *   - Stale session → Release → Acquire → PROCEED
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Supabase
const mockFrom = vi.fn();
const mockRpc = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockUpdate = vi.fn();
const mockSingle = vi.fn();

const mockSupabase = {
  from: mockFrom,
  rpc: mockRpc
};

// Mock dotenv
vi.mock('dotenv', () => ({
  default: { config: vi.fn() },
  config: vi.fn()
}));

// Mock @supabase/supabase-js
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabase)
}));

// Helper to set up chain: supabase.from(table).select(cols).eq(col, val)
function setupQueryChain(returnData, returnError = null) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: returnData, error: returnError }),
    update: vi.fn().mockReturnThis()
  };
  // For update chains, eq returns promise
  const updateChain = {
    update: vi.fn(() => ({
      eq: vi.fn().mockResolvedValue({ data: null, error: null })
    }))
  };
  return chain;
}

describe('claimGuard', () => {
  let claimGuard, formatClaimFailure;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset module cache to get fresh supabase instance
    vi.resetModules();

    // Set env vars before importing
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

    // Re-mock after reset
    vi.doMock('@supabase/supabase-js', () => ({
      createClient: vi.fn(() => mockSupabase)
    }));
    vi.doMock('dotenv', () => ({
      default: { config: vi.fn() },
      config: vi.fn()
    }));

    const mod = await import('./claim-guard.mjs');
    claimGuard = mod.claimGuard;
    formatClaimFailure = mod.formatClaimFailure;
  });

  it('throws if sdKey is missing', async () => {
    await expect(claimGuard(null, 'session-1')).rejects.toThrow('claimGuard requires both sdKey and sessionId');
  });

  it('throws if sessionId is missing', async () => {
    await expect(claimGuard('SD-TEST-001', null)).rejects.toThrow('claimGuard requires both sdKey and sessionId');
  });

  it('returns success when session already owns claim (Case 1)', async () => {
    // Setup: v_active_sessions returns our own session
    mockFrom.mockImplementation((table) => {
      if (table === 'v_active_sessions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [{ session_id: 'session-1', sd_id: 'SD-TEST-001', heartbeat_age_seconds: 10 }],
              error: null
            })
          })
        };
      }
      if (table === 'claude_sessions') {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null })
          })
        };
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
    });

    const result = await claimGuard('SD-TEST-001', 'session-1');

    expect(result.success).toBe(true);
    expect(result.claim.status).toBe('already_owned');
  });

  it('returns hard stop when active session owns claim (Case 2)', async () => {
    // Setup: v_active_sessions returns another active session
    mockFrom.mockImplementation((table) => {
      if (table === 'v_active_sessions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [{
                session_id: 'other-session',
                sd_id: 'SD-TEST-001',
                heartbeat_age_seconds: 30, // Active (< 300s)
                heartbeat_age_human: '30s ago',
                hostname: 'testhost',
                tty: '/dev/pts/0',
                codebase: '/test'
              }],
              error: null
            })
          })
        };
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
    });

    const result = await claimGuard('SD-TEST-001', 'session-1');

    expect(result.success).toBe(false);
    expect(result.error).toBe('claimed_by_active_session');
    expect(result.owner.session_id).toBe('other-session');
    expect(result.owner.hostname).toBe('testhost');
  });

  it('releases stale session and acquires claim (Case 3)', async () => {
    // Setup: v_active_sessions returns stale session
    mockFrom.mockImplementation((table) => {
      if (table === 'v_active_sessions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [{
                session_id: 'stale-session',
                sd_id: 'SD-TEST-001',
                heartbeat_age_seconds: 600, // Stale (> 300s)
                heartbeat_age_human: '10m ago'
              }],
              error: null
            })
          })
        };
      }
      if (table === 'sd_baseline_items') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { track: 'A' }, error: null })
            })
          })
        };
      }
      if (table === 'strategic_directives_v2') {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null })
          })
        };
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
    });

    // release_sd succeeds, claim_sd succeeds
    mockRpc.mockImplementation((funcName) => {
      if (funcName === 'release_sd') {
        return Promise.resolve({ data: null, error: null });
      }
      if (funcName === 'claim_sd') {
        return Promise.resolve({
          data: { success: true, sd_id: 'SD-TEST-001', session_id: 'session-1' },
          error: null
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const result = await claimGuard('SD-TEST-001', 'session-1');

    expect(result.success).toBe(true);
    expect(result.claim.status).toBe('newly_acquired');
    expect(result.claim.track).toBe('A');
    // Verify release was called for stale session
    expect(mockRpc).toHaveBeenCalledWith('release_sd', { p_session_id: 'stale-session' });
  });

  it('acquires claim when no existing claims (Case 4)', async () => {
    // Setup: v_active_sessions returns empty
    mockFrom.mockImplementation((table) => {
      if (table === 'v_active_sessions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null })
          })
        };
      }
      if (table === 'sd_baseline_items') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: null })
            })
          })
        };
      }
      if (table === 'strategic_directives_v2') {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null })
          })
        };
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
    });

    mockRpc.mockResolvedValue({
      data: { success: true, sd_id: 'SD-TEST-001', session_id: 'session-1' },
      error: null
    });

    const result = await claimGuard('SD-TEST-001', 'session-1');

    expect(result.success).toBe(true);
    expect(result.claim.status).toBe('newly_acquired');
    expect(result.claim.track).toBe('STANDALONE'); // No baseline found → fallback
  });
});

describe('formatClaimFailure', () => {
  let formatClaimFailure;

  beforeEach(async () => {
    vi.resetModules();
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
    vi.doMock('@supabase/supabase-js', () => ({
      createClient: vi.fn(() => mockSupabase)
    }));
    vi.doMock('dotenv', () => ({
      default: { config: vi.fn() },
      config: vi.fn()
    }));
    const mod = await import('./claim-guard.mjs');
    formatClaimFailure = mod.formatClaimFailure;
  });

  it('returns empty string for successful result', () => {
    expect(formatClaimFailure({ success: true })).toBe('');
  });

  it('includes owner details in failure message', () => {
    const result = {
      success: false,
      error: 'claimed_by_active_session',
      owner: {
        session_id: 'other-session',
        heartbeat_age_human: '30s ago',
        hostname: 'testhost',
        tty: '/dev/pts/0',
        codebase: '/test/path'
      }
    };

    const formatted = formatClaimFailure(result);
    expect(formatted).toContain('CLAIM GUARD');
    expect(formatted).toContain('other-session');
    expect(formatted).toContain('30s ago');
    expect(formatted).toContain('testhost');
  });
});
