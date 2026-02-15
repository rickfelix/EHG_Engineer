/**
 * Tests for Centralized Claim Guard
 * SD-LEO-INFRA-CLAIM-GUARD-001 + SD-LEO-FIX-CLAIM-DUAL-TRUTH-001
 *
 * Tests the claimGuard decision tree:
 *   - Own claim → PROCEED
 *   - No claim → Acquire → PROCEED
 *   - Active session → HARD STOP
 *   - Stale session → Release → Acquire → PROCEED
 *
 * SD-LEO-FIX-CLAIM-DUAL-TRUTH-001: claimGuard now queries sd_claims (authoritative)
 * instead of v_active_sessions (which reads from claude_sessions.sd_id cache).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Supabase
const mockFrom = vi.fn();
const mockRpc = vi.fn();

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

/**
 * Helper: Build a Supabase query chain mock for sd_claims.
 * sd_claims queries use: .from('sd_claims').select(...).eq('sd_id', key).is('released_at', null)
 */
function mockSdClaimsQuery(data, error = null) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        is: vi.fn().mockResolvedValue({ data, error })
      })
    })
  };
}

/**
 * Helper: Build a Supabase query chain mock for claude_sessions (enrichment).
 * claude_sessions enrichment: .from('claude_sessions').select(...).in('session_id', ids)
 */
function mockClaudeSessionsQuery(data, error = null) {
  return {
    select: vi.fn().mockReturnValue({
      in: vi.fn().mockResolvedValue({ data, error }),
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: data?.[0] || null, error })
      })
    }),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: null })
    })
  };
}

describe('claimGuard', () => {
  let claimGuard, formatClaimFailure;

  beforeEach(async () => {
    vi.clearAllMocks();
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
    claimGuard = mod.claimGuard;
    formatClaimFailure = mod.formatClaimFailure;
  });

  it('throws if sdKey is missing', async () => {
    await expect(claimGuard(null, 'session-1')).rejects.toThrow('claimGuard requires both sdKey and sessionId');
  });

  it('throws if sessionId is missing', async () => {
    await expect(claimGuard('SD-TEST-001', null)).rejects.toThrow('claimGuard requires both sdKey and sessionId');
  });

  it('queries sd_claims directly, not v_active_sessions (US-001)', async () => {
    // Setup: sd_claims returns our own session
    mockFrom.mockImplementation((table) => {
      if (table === 'sd_claims') {
        return mockSdClaimsQuery([{
          sd_id: 'SD-TEST-001', session_id: 'session-1', track: 'A', claimed_at: new Date().toISOString()
        }]);
      }
      if (table === 'claude_sessions') {
        return mockClaudeSessionsQuery([{
          session_id: 'session-1', terminal_id: 'win-cc-30738-1234', pid: 1234,
          hostname: 'testhost', tty: '/dev/pts/0', codebase: '/test',
          heartbeat_at: new Date().toISOString(), status: 'active'
        }]);
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
    });

    await claimGuard('SD-TEST-001', 'session-1');

    // Verify sd_claims was queried (not v_active_sessions)
    expect(mockFrom).toHaveBeenCalledWith('sd_claims');
    expect(mockFrom).not.toHaveBeenCalledWith('v_active_sessions');
  });

  it('returns success when session already owns claim (Case 1)', async () => {
    const now = new Date().toISOString();
    mockFrom.mockImplementation((table) => {
      if (table === 'sd_claims') {
        return mockSdClaimsQuery([{
          sd_id: 'SD-TEST-001', session_id: 'session-1', track: 'A', claimed_at: now
        }]);
      }
      if (table === 'claude_sessions') {
        return mockClaudeSessionsQuery([{
          session_id: 'session-1', terminal_id: 'win-cc-30738-1234', pid: 1234,
          hostname: 'testhost', tty: '/dev/pts/0', codebase: '/test',
          heartbeat_at: now, status: 'active'
        }]);
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
    });

    const result = await claimGuard('SD-TEST-001', 'session-1');

    expect(result.success).toBe(true);
    expect(result.claim.status).toBe('already_owned');
  });

  it('returns hard stop when active session owns claim (Case 2)', async () => {
    const now = new Date().toISOString();
    // Track call count to differentiate enrichment (.in) vs my-terminal-id (.eq.single) queries
    let claudeSessionsCallCount = 0;
    mockFrom.mockImplementation((table) => {
      if (table === 'sd_claims') {
        return mockSdClaimsQuery([{
          sd_id: 'SD-TEST-001', session_id: 'other-session', track: 'A', claimed_at: now
        }]);
      }
      if (table === 'claude_sessions') {
        claudeSessionsCallCount++;
        if (claudeSessionsCallCount === 1) {
          // First call: enrichment query with .in()
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [{
                  session_id: 'other-session', terminal_id: 'win-cc-99999-5678', pid: 5678,
                  hostname: 'otherhost', tty: '/dev/pts/1', codebase: '/other',
                  heartbeat_at: now, status: 'active'
                }],
                error: null
              })
            })
          };
        }
        // Second call: my terminal_id query with .eq().single()
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { terminal_id: 'win-cc-11111-1234' },
                error: null
              })
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
    expect(result.owner.hostname).toBe('otherhost');
  });

  it('releases stale session and acquires claim (Case 3)', async () => {
    const staleTime = new Date(Date.now() - 1000 * 1000).toISOString(); // 1000s ago (> 900s threshold)
    mockFrom.mockImplementation((table) => {
      if (table === 'sd_claims') {
        return mockSdClaimsQuery([{
          sd_id: 'SD-TEST-001', session_id: 'stale-session', track: 'A', claimed_at: staleTime
        }]);
      }
      if (table === 'claude_sessions') {
        return mockClaudeSessionsQuery([{
          session_id: 'stale-session', terminal_id: 'win-cc-11111-9999', pid: 9999,
          hostname: 'stalehost', tty: '/dev/pts/2', codebase: '/stale',
          heartbeat_at: staleTime, status: 'active'
        }]);
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
    expect(mockRpc).toHaveBeenCalledWith('release_sd', { p_session_id: 'stale-session', p_reason: 'manual' });
  });

  it('acquires claim when no existing claims (Case 4)', async () => {
    mockFrom.mockImplementation((table) => {
      if (table === 'sd_claims') {
        return mockSdClaimsQuery([]);
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
    expect(result.claim.track).toBe('STANDALONE');
  });

  it('handles sd_claims query error gracefully', async () => {
    mockFrom.mockImplementation((table) => {
      if (table === 'sd_claims') {
        return mockSdClaimsQuery(null, { message: 'Connection refused' });
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
    });

    await expect(claimGuard('SD-TEST-001', 'session-1'))
      .rejects.toThrow('claimGuard: Failed to query sd_claims: Connection refused');
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
