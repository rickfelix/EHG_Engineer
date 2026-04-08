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
 * SD-LEO-INFRA-CONSOLIDATE-CLAIMS-INTO-001: sd_claims table dropped.
 * claimGuard queries claude_sessions directly (sd_id column IS the claim).
 * Status filter includes both 'active' and 'idle' to match the partial unique index.
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
 * Helper: Build a Supabase query chain mock for claude_sessions initial claim check.
 * Query pattern: .from('claude_sessions').select(...).eq('sd_key', key).in('status', ['active', 'idle'])
 */
function mockClaudeSessionsClaimQuery(data, error = null) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({ data, error })
      })
    })
  };
}

/**
 * Helper: Build a Supabase query chain mock for claude_sessions enrichment.
 * Query pattern: .from('claude_sessions').select(...).in('session_id', ids)
 */
function mockClaudeSessionsEnrichmentQuery(data, error = null) {
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
  let claimGuard;

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
  });

  it('throws if sdKey is missing', async () => {
    await expect(claimGuard(null, 'session-1')).rejects.toThrow('claimGuard requires both sdKey and sessionId');
  });

  it('throws if sessionId is missing', async () => {
    await expect(claimGuard('SD-TEST-001', null)).rejects.toThrow('claimGuard requires both sdKey and sessionId');
  });

  it('queries claude_sessions directly, not v_active_sessions', async () => {
    const now = new Date().toISOString();
    let claudeSessionsCallCount = 0;
    mockFrom.mockImplementation((table) => {
      if (table === 'claude_sessions') {
        claudeSessionsCallCount++;
        if (claudeSessionsCallCount === 1) {
          // First call: claim check (.select().eq('sd_key').in('status'))
          return mockClaudeSessionsClaimQuery([{
            sd_key: 'SD-TEST-001', session_id: 'session-1', track: 'A', claimed_at: now
          }]);
        }
        if (claudeSessionsCallCount === 2) {
          // Second call: enrichment (.select().in('session_id'))
          return mockClaudeSessionsEnrichmentQuery([{
            session_id: 'session-1', terminal_id: 'win-cc-30738-1234', pid: 1234,
            hostname: 'testhost', tty: '/dev/pts/0', codebase: '/test',
            heartbeat_at: now, status: 'active'
          }]);
        }
        // Third call: heartbeat update
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null })
          })
        };
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
    });

    await claimGuard('SD-TEST-001', 'session-1');

    // Verify claude_sessions was queried (not v_active_sessions)
    expect(mockFrom).toHaveBeenCalledWith('claude_sessions');
    expect(mockFrom).not.toHaveBeenCalledWith('v_active_sessions');
  });

  it('uses status filter including idle (not just active)', async () => {
    // Use a spy to capture the .in() call arguments
    const inSpy = vi.fn().mockResolvedValue({
      data: [{
        sd_key: 'SD-TEST-001', session_id: 'session-1', track: 'A', claimed_at: new Date().toISOString()
      }],
      error: null
    });

    mockFrom.mockImplementation((table) => {
      if (table === 'claude_sessions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: inSpy
            }),
            in: vi.fn().mockResolvedValue({ data: [], error: null })
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null })
          })
        };
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
    });

    await claimGuard('SD-TEST-001', 'session-1');

    // Verify the .in() call includes both 'active' and 'idle'
    expect(inSpy).toHaveBeenCalledWith('status', ['active', 'idle']);
  });

  it('returns success when session already owns claim (Case 1)', async () => {
    const now = new Date().toISOString();
    mockFrom.mockImplementation((table) => {
      if (table === 'claude_sessions') {
        // First call: claim check returns own session; subsequent calls: enrichment + heartbeat
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [{
                  sd_key: 'SD-TEST-001', session_id: 'session-1', track: 'A', claimed_at: now
                }],
                error: null
              })
            }),
            in: vi.fn().mockResolvedValue({
              data: [{
                session_id: 'session-1', terminal_id: 'win-cc-30738-1234', pid: 1234,
                hostname: 'testhost', tty: '/dev/pts/0', codebase: '/test',
                heartbeat_at: now, status: 'active'
              }],
              error: null
            })
          }),
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
    const now = new Date().toISOString();
    let claudeSessionsCallCount = 0;
    mockFrom.mockImplementation((table) => {
      if (table === 'claude_sessions') {
        claudeSessionsCallCount++;
        if (claudeSessionsCallCount === 1) {
          // First call: claim check returns other session
          return mockClaudeSessionsClaimQuery([{
            sd_key: 'SD-TEST-001', session_id: 'other-session', track: 'A', claimed_at: now
          }]);
        }
        if (claudeSessionsCallCount === 2) {
          // Second call: enrichment query with .in()
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
        // Third call: my terminal_id query with .eq().single()
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
    let claudeSessionsCallCount = 0;
    mockFrom.mockImplementation((table) => {
      if (table === 'claude_sessions') {
        claudeSessionsCallCount++;
        if (claudeSessionsCallCount === 1) {
          // First call: claim check returns stale session (.select().eq('sd_key').in('status'))
          return mockClaudeSessionsClaimQuery([{
            sd_key: 'SD-TEST-001', session_id: 'stale-session', track: 'A', claimed_at: staleTime
          }]);
        }
        if (claudeSessionsCallCount === 2) {
          // Second call: enrichment (.select().in('session_id'))
          return mockClaudeSessionsEnrichmentQuery([{
            session_id: 'stale-session', terminal_id: 'win-cc-11111-9999', pid: 9999,
            hostname: 'stalehost', tty: '/dev/pts/2', codebase: '/stale',
            heartbeat_at: staleTime, status: 'active'
          }]);
        }
        if (claudeSessionsCallCount === 3) {
          // Third call: myTerminalId lookup (.select().eq('session_id').single())
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { terminal_id: 'win-cc-22222-1111' },
                  error: null
                })
              })
            })
          };
        }
        // Fourth call: verifyClaimOwnership read-back (.select().eq('sd_key').in('status'))
        return mockClaudeSessionsClaimQuery([{
          session_id: 'session-1', sd_key: 'SD-TEST-001', status: 'active'
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
          data: { success: true, sd_key: 'SD-TEST-001', session_id: 'session-1' },
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
    let claudeSessionsCallCount = 0;
    mockFrom.mockImplementation((table) => {
      if (table === 'claude_sessions') {
        claudeSessionsCallCount++;
        if (claudeSessionsCallCount === 1) {
          // First call: no active claims
          return mockClaudeSessionsClaimQuery([]);
        }
        // Second call: verifyClaimOwnership read-back after RPC success
        return mockClaudeSessionsClaimQuery([{
          session_id: 'session-1', sd_key: 'SD-TEST-001', status: 'active'
        }]);
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
      data: { success: true, sd_key: 'SD-TEST-001', session_id: 'session-1' },
      error: null
    });

    const result = await claimGuard('SD-TEST-001', 'session-1');

    expect(result.success).toBe(true);
    expect(result.claim.status).toBe('newly_acquired');
    expect(result.claim.track).toBe('STANDALONE');
  });

  it('handles claude_sessions query error gracefully', async () => {
    mockFrom.mockImplementation((table) => {
      if (table === 'claude_sessions') {
        return mockClaudeSessionsClaimQuery(null, { message: 'Connection refused' });
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
    });

    await expect(claimGuard('SD-TEST-001', 'session-1'))
      .rejects.toThrow('claimGuard: Failed to query claude_sessions: Connection refused');
  });

  it('fails when post-acquisition verification detects wrong owner', async () => {
    let claudeSessionsCallCount = 0;
    mockFrom.mockImplementation((table) => {
      if (table === 'claude_sessions') {
        claudeSessionsCallCount++;
        if (claudeSessionsCallCount === 1) {
          // First call: no active claims
          return mockClaudeSessionsClaimQuery([]);
        }
        // Second call: verify returns wrong owner (race condition)
        return mockClaudeSessionsClaimQuery([{
          session_id: 'race-winner', sd_key: 'SD-TEST-001', status: 'active'
        }]);
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
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
    });

    mockRpc.mockResolvedValue({
      data: { success: true, sd_key: 'SD-TEST-001', session_id: 'session-1' },
      error: null
    });

    const result = await claimGuard('SD-TEST-001', 'session-1');

    expect(result.success).toBe(false);
    expect(result.error).toContain('claim_verification_failed');
    expect(result.error).toContain('wrong_owner');
  });
});

describe('verifyClaimOwnership', () => {
  let verifyClaimOwnership;

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
    verifyClaimOwnership = mod.verifyClaimOwnership;
  });

  it('returns verified=true when session owns the claim (happy path)', async () => {
    mockFrom.mockImplementation((table) => {
      if (table === 'claude_sessions') {
        return mockClaudeSessionsClaimQuery([{
          session_id: 'session-1', sd_key: 'SD-TEST-001', status: 'active'
        }]);
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
    });

    const result = await verifyClaimOwnership('SD-TEST-001', 'session-1');

    expect(result.verified).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('returns verified=false when wrong session owns the claim', async () => {
    mockFrom.mockImplementation((table) => {
      if (table === 'claude_sessions') {
        return mockClaudeSessionsClaimQuery([{
          session_id: 'other-session', sd_key: 'SD-TEST-001', status: 'active'
        }]);
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
    });

    const result = await verifyClaimOwnership('SD-TEST-001', 'session-1');

    expect(result.verified).toBe(false);
    expect(result.error).toContain('wrong_owner');
    expect(result.error).toContain('other-session');
  });

  it('returns verified=false when no claim exists', async () => {
    mockFrom.mockImplementation((table) => {
      if (table === 'claude_sessions') {
        return mockClaudeSessionsClaimQuery([]);
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
    });

    const result = await verifyClaimOwnership('SD-TEST-001', 'session-1');

    expect(result.verified).toBe(false);
    expect(result.error).toBe('no_claim_after_rpc');
  });

  it('returns verified=false when multiple claims exist', async () => {
    mockFrom.mockImplementation((table) => {
      if (table === 'claude_sessions') {
        return mockClaudeSessionsClaimQuery([
          { session_id: 'session-1', sd_key: 'SD-TEST-001', status: 'active' },
          { session_id: 'session-2', sd_key: 'SD-TEST-001', status: 'idle' }
        ]);
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
    });

    const result = await verifyClaimOwnership('SD-TEST-001', 'session-1');

    expect(result.verified).toBe(false);
    expect(result.error).toContain('multiple_claims');
  });

  it('returns verified=true (fail-open) on query error', async () => {
    mockFrom.mockImplementation((table) => {
      if (table === 'claude_sessions') {
        return mockClaudeSessionsClaimQuery(null, { message: 'timeout' });
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
    });

    const result = await verifyClaimOwnership('SD-TEST-001', 'session-1');

    expect(result.verified).toBe(true);
    expect(result.error).toContain('query_error');
  });
});

describe('claimGuard - stale PID liveness check', () => {
  let claimGuard;
  const mockIsProcessRunning = vi.fn();

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
    vi.doMock('./heartbeat-manager.mjs', () => ({
      isProcessRunning: mockIsProcessRunning
    }));

    const mod = await import('./claim-guard.mjs');
    claimGuard = mod.claimGuard;
  });

  it('returns hard stop when stale session PID is alive on same host', async () => {
    const staleTime = new Date(Date.now() - 1000 * 1000).toISOString(); // 1000s ago
    const currentHostname = (await import('os')).default.hostname();
    mockIsProcessRunning.mockReturnValue(true);

    let claudeSessionsCallCount = 0;
    mockFrom.mockImplementation((table) => {
      if (table === 'claude_sessions') {
        claudeSessionsCallCount++;
        if (claudeSessionsCallCount === 1) {
          return mockClaudeSessionsClaimQuery([{
            sd_key: 'SD-TEST-001', session_id: 'stale-session', track: 'A', claimed_at: staleTime
          }]);
        }
        if (claudeSessionsCallCount === 2) {
          // Enrichment: stale heartbeat, same hostname, has PID
          return mockClaudeSessionsEnrichmentQuery([{
            session_id: 'stale-session', terminal_id: 'win-cc-11111-8900', pid: 8900,
            hostname: currentHostname, tty: '/dev/pts/2', codebase: '/test',
            heartbeat_at: staleTime, status: 'active'
          }]);
        }
        // Third call: myTerminalId lookup
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { terminal_id: 'win-cc-22222-1111' },
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
    expect(result.error).toBe('claimed_by_stale_but_alive_session');
    expect(result.owner.session_id).toBe('stale-session');
    expect(result.owner.pid).toBe(8900);
    expect(result.owner.note).toContain('process alive');
    expect(mockIsProcessRunning).toHaveBeenCalledWith(8900);
  });

  it('releases stale session when PID is dead on same host', async () => {
    const staleTime = new Date(Date.now() - 1000 * 1000).toISOString();
    const currentHostname = (await import('os')).default.hostname();
    mockIsProcessRunning.mockReturnValue(false);

    let claudeSessionsCallCount = 0;
    mockFrom.mockImplementation((table) => {
      if (table === 'claude_sessions') {
        claudeSessionsCallCount++;
        if (claudeSessionsCallCount === 1) {
          return mockClaudeSessionsClaimQuery([{
            sd_key: 'SD-TEST-001', session_id: 'stale-session', track: 'A', claimed_at: staleTime
          }]);
        }
        if (claudeSessionsCallCount === 2) {
          return mockClaudeSessionsEnrichmentQuery([{
            session_id: 'stale-session', terminal_id: 'win-cc-11111-8900', pid: 8900,
            hostname: currentHostname, tty: '/dev/pts/2', codebase: '/test',
            heartbeat_at: staleTime, status: 'active'
          }]);
        }
        if (claudeSessionsCallCount === 3) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { terminal_id: 'win-cc-22222-1111' },
                  error: null
                })
              })
            })
          };
        }
        // Fourth call: verifyClaimOwnership read-back
        return mockClaudeSessionsClaimQuery([{
          session_id: 'session-1', sd_key: 'SD-TEST-001', status: 'active'
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
      if (funcName === 'release_sd') return Promise.resolve({ data: null, error: null });
      if (funcName === 'claim_sd') return Promise.resolve({
        data: { success: true, sd_key: 'SD-TEST-001', session_id: 'session-1' },
        error: null
      });
      return Promise.resolve({ data: null, error: null });
    });

    const result = await claimGuard('SD-TEST-001', 'session-1');

    expect(result.success).toBe(true);
    expect(result.claim.status).toBe('newly_acquired');
    expect(mockIsProcessRunning).toHaveBeenCalledWith(8900);
    expect(mockRpc).toHaveBeenCalledWith('release_sd', { p_session_id: 'stale-session', p_reason: 'manual' });
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

  it('includes PID and note for stale-but-alive failures', () => {
    const result = {
      success: false,
      error: 'claimed_by_stale_but_alive_session',
      owner: {
        session_id: 'stale-session',
        heartbeat_age_human: '8m ago',
        hostname: 'myhost',
        tty: '/dev/pts/2',
        codebase: '/test',
        pid: 8900,
        note: 'Heartbeat stale but process alive — likely busy, not dead'
      }
    };

    const formatted = formatClaimFailure(result);
    expect(formatted).toContain('8900');
    expect(formatted).toContain('process alive');
  });
});

/**
 * SD-LEO-INFRA-SESSION-LIFECYCLE-CLEANUP-001 (FR-4): Tests for win-pid-* format support
 * in isSameConversation(). Previously, win-pid-* terminal_ids fell through parseWinCC()
 * and returned false at line 117, blocking legitimate session transitions.
 */
describe('isSameConversation - win-pid-* format', () => {
  let isSameConversation;

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
    isSameConversation = mod.isSameConversation;
  });

  // Exact match (all formats)
  it('returns true for identical terminal_ids', () => {
    expect(isSameConversation('win-pid-1234', 'win-pid-1234')).toBe(true);
  });

  // win-pid vs win-pid: same PID
  it('returns true for win-pid with same PID', () => {
    expect(isSameConversation('win-pid-5678', 'win-pid-5678')).toBe(true);
  });

  // win-pid vs win-pid: different PIDs → ambiguous (could be different Bash tool calls)
  it('returns ambiguous for win-pid with different PIDs', () => {
    expect(isSameConversation('win-pid-1234', 'win-pid-5678')).toBe('ambiguous');
  });

  // UUID vs win-pid → ambiguous (cross-format, needs evidence gate)
  it('returns ambiguous for UUID vs win-pid', () => {
    expect(isSameConversation(
      '21e2970f-18c4-49bc-a93e-bc78b3a414c5',
      'win-pid-3884'
    )).toBe('ambiguous');
  });

  it('returns ambiguous for win-pid vs UUID (reversed order)', () => {
    expect(isSameConversation(
      'win-pid-3884',
      '21e2970f-18c4-49bc-a93e-bc78b3a414c5'
    )).toBe('ambiguous');
  });

  // win-cc vs win-pid → ambiguous (both Windows fallback formats)
  it('returns ambiguous for win-cc vs win-pid', () => {
    expect(isSameConversation('win-cc-55188', 'win-pid-3884')).toBe('ambiguous');
  });

  it('returns ambiguous for win-pid vs win-cc (reversed order)', () => {
    expect(isSameConversation('win-pid-3884', 'win-cc-55188-4468')).toBe('ambiguous');
  });

  // Existing behavior preserved: UUID vs UUID
  it('returns false for different UUIDs', () => {
    expect(isSameConversation(
      '21e2970f-18c4-49bc-a93e-bc78b3a414c5',
      'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    )).toBe(false);
  });

  // Existing behavior preserved: UUID vs win-cc
  it('returns ambiguous for UUID vs win-cc', () => {
    expect(isSameConversation(
      '21e2970f-18c4-49bc-a93e-bc78b3a414c5',
      'win-cc-55188'
    )).toBe('ambiguous');
  });

  // Existing behavior preserved: win-cc same port same PID
  it('returns true for win-cc same port same PID', () => {
    expect(isSameConversation('win-cc-55188-4468', 'win-cc-55188-4468')).toBe(true);
  });

  // Existing behavior preserved: win-cc same port different PID
  it('returns false for win-cc same port different PID', () => {
    expect(isSameConversation('win-cc-55188-4468', 'win-cc-55188-9999')).toBe(false);
  });

  // Existing behavior preserved: win-cc different port
  it('returns false for win-cc different port', () => {
    expect(isSameConversation('win-cc-55188-4468', 'win-cc-12345-4468')).toBe(false);
  });
});
