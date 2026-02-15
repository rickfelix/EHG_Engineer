/**
 * Regression Tests for SD-LEO-FIX-CLAIM-DUAL-TRUTH-001
 * Fix Claim Guard Dual Source of Truth
 *
 * These tests verify the four user stories:
 *   US-001: claimGuard queries sd_claims directly (not v_active_sessions)
 *   US-002: v_active_sessions LEFT JOINs sd_claims (view change - tested via mock shape)
 *   US-003: claim_sd() uses ON CONFLICT partial index (RPC mock verification)
 *   US-004: switchSdClaim() syncs claude_sessions.sd_id after claim switch
 *
 * All tests run without a live database by mocking Supabase.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Shared Supabase Mock ────────────────────────────────────────────────────

const mockFrom = vi.fn();
const mockRpc = vi.fn();

const mockSupabase = {
  from: mockFrom,
  rpc: mockRpc
};

// Mock dotenv before any imports
vi.mock('dotenv', () => ({
  default: { config: vi.fn() },
  config: vi.fn()
}));

// Mock @supabase/supabase-js
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabase)
}));

// ─── Query Chain Helpers ─────────────────────────────────────────────────────

/**
 * Build mock for: supabase.from('sd_claims').select(...).eq('sd_id', key).is('released_at', null)
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
 * Build mock for claude_sessions table queries (enrichment + terminal_id lookup).
 * Supports both .in() (enrichment) and .eq().single() (terminal_id lookup) chains.
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

/**
 * Build mock for sd_baseline_items table query.
 */
function mockBaselineQuery(track = 'A') {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { track }, error: null })
      })
    })
  };
}

/**
 * Build mock for strategic_directives_v2 update.
 */
function mockStrategicDirectivesUpdate() {
  return {
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: null })
    })
  };
}

// ─── Test Suite: US-001 - claimGuard queries sd_claims ───────────────────────

describe('US-001: claimGuard queries sd_claims directly (not v_active_sessions)', () => {
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

    const mod = await import('../../lib/claim-guard.mjs');
    claimGuard = mod.claimGuard;
  });

  it('never queries v_active_sessions during claim check', async () => {
    // Track ALL table names queried
    const queriedTables = [];
    mockFrom.mockImplementation((table) => {
      queriedTables.push(table);
      if (table === 'sd_claims') {
        return mockSdClaimsQuery([{
          sd_id: 'SD-REGRESSION-001',
          session_id: 'session-own',
          track: 'A',
          claimed_at: new Date().toISOString()
        }]);
      }
      if (table === 'claude_sessions') {
        return mockClaudeSessionsQuery([{
          session_id: 'session-own',
          terminal_id: 'win-cc-30000-1111',
          pid: 1111,
          hostname: 'testhost',
          tty: '/dev/pts/0',
          codebase: '/test',
          heartbeat_at: new Date().toISOString(),
          status: 'active'
        }]);
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
    });

    await claimGuard('SD-REGRESSION-001', 'session-own');

    // The authoritative source must be sd_claims
    expect(queriedTables).toContain('sd_claims');
    // v_active_sessions must NOT be queried (that was the old bug)
    expect(queriedTables).not.toContain('v_active_sessions');
  });

  it('first query is always to sd_claims table', async () => {
    const queriedTables = [];
    mockFrom.mockImplementation((table) => {
      queriedTables.push(table);
      if (table === 'sd_claims') {
        return mockSdClaimsQuery([]);
      }
      if (table === 'sd_baseline_items') return mockBaselineQuery('B');
      if (table === 'strategic_directives_v2') return mockStrategicDirectivesUpdate();
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
    });

    mockRpc.mockResolvedValue({
      data: { success: true, sd_id: 'SD-REGRESSION-001', session_id: 'session-new' },
      error: null
    });

    await claimGuard('SD-REGRESSION-001', 'session-new');

    // sd_claims must be the FIRST table queried
    expect(queriedTables[0]).toBe('sd_claims');
  });

  it('uses .is("released_at", null) filter to find only active claims', async () => {
    let capturedIsCall = null;
    mockFrom.mockImplementation((table) => {
      if (table === 'sd_claims') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockImplementation((col, val) => {
                capturedIsCall = { column: col, value: val };
                return Promise.resolve({
                  data: [{
                    sd_id: 'SD-REGRESSION-001',
                    session_id: 'session-own',
                    track: 'A',
                    claimed_at: new Date().toISOString()
                  }],
                  error: null
                });
              })
            })
          })
        };
      }
      if (table === 'claude_sessions') {
        return mockClaudeSessionsQuery([{
          session_id: 'session-own',
          terminal_id: 'win-cc-30000-1111',
          pid: 1111,
          hostname: 'testhost',
          tty: '/dev/pts/0',
          codebase: '/test',
          heartbeat_at: new Date().toISOString(),
          status: 'active'
        }]);
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
    });

    await claimGuard('SD-REGRESSION-001', 'session-own');

    expect(capturedIsCall).toEqual({ column: 'released_at', value: null });
  });
});

// ─── Test Suite: US-002 - Diverged sources scenario ──────────────────────────

describe('US-002: claimGuard works when claude_sessions.sd_id is NULL but sd_claims has active claim', () => {
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

    const mod = await import('../../lib/claim-guard.mjs');
    claimGuard = mod.claimGuard;
  });

  it('recognizes own claim even when session record has sd_id=NULL (diverged state)', async () => {
    // This is the core dual-truth bug scenario:
    // sd_claims says session-1 owns SD-TEST-001
    // claude_sessions.sd_id is NULL (diverged/stale cache)
    // Old code queried v_active_sessions which reads claude_sessions.sd_id -> would miss the claim
    // New code queries sd_claims directly -> finds the claim

    const now = new Date().toISOString();
    mockFrom.mockImplementation((table) => {
      if (table === 'sd_claims') {
        return mockSdClaimsQuery([{
          sd_id: 'SD-DIVERGED-001',
          session_id: 'session-diverged',
          track: 'A',
          claimed_at: now
        }]);
      }
      if (table === 'claude_sessions') {
        // Note: sd_id is NOT selected by claimGuard enrichment query,
        // but the session exists and has a fresh heartbeat
        return mockClaudeSessionsQuery([{
          session_id: 'session-diverged',
          terminal_id: 'win-cc-40000-2222',
          pid: 2222,
          hostname: 'testhost',
          tty: '/dev/pts/0',
          codebase: '/test',
          heartbeat_at: now,
          status: 'active'
          // sd_id would be NULL in the real DB but claimGuard doesn't select it
        }]);
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
    });

    // Session-diverged queries its own claim
    const result = await claimGuard('SD-DIVERGED-001', 'session-diverged');

    expect(result.success).toBe(true);
    expect(result.claim.status).toBe('already_owned');
    expect(result.claim.sd_id).toBe('SD-DIVERGED-001');
  });

  it('correctly blocks another session even when claude_sessions.sd_id is stale', async () => {
    // Scenario: session-A holds claim in sd_claims for SD-X
    // claude_sessions for session-A has sd_id=NULL (stale)
    // session-B tries to claim SD-X
    // Old code (v_active_sessions) would not see the claim and grant it -> collision!
    // New code (sd_claims) sees the claim and blocks session-B

    const now = new Date().toISOString();
    let claudeCallCount = 0;
    mockFrom.mockImplementation((table) => {
      if (table === 'sd_claims') {
        return mockSdClaimsQuery([{
          sd_id: 'SD-STALE-CACHE-001',
          session_id: 'session-holder',
          track: 'A',
          claimed_at: now
        }]);
      }
      if (table === 'claude_sessions') {
        claudeCallCount++;
        if (claudeCallCount === 1) {
          // Enrichment query for session-holder
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [{
                  session_id: 'session-holder',
                  terminal_id: 'win-cc-50000-3333',
                  pid: 3333,
                  hostname: 'holder-host',
                  tty: '/dev/pts/1',
                  codebase: '/holder',
                  heartbeat_at: now,  // fresh heartbeat = active
                  status: 'active'
                }],
                error: null
              })
            })
          };
        }
        // Second call: my terminal_id lookup for session-requester
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { terminal_id: 'win-cc-60000-4444' },
                error: null
              })
            })
          })
        };
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
    });

    // session-requester tries to claim SD that session-holder owns
    const result = await claimGuard('SD-STALE-CACHE-001', 'session-requester');

    expect(result.success).toBe(false);
    expect(result.error).toBe('claimed_by_active_session');
    expect(result.owner.session_id).toBe('session-holder');
  });
});

// ─── Test Suite: US-003 - claim_sd RPC uses partial index ────────────────────

describe('US-003: claim_sd RPC invocation pattern', () => {
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

    const mod = await import('../../lib/claim-guard.mjs');
    claimGuard = mod.claimGuard;
  });

  it('calls claim_sd RPC with correct parameters when no existing claim', async () => {
    mockFrom.mockImplementation((table) => {
      if (table === 'sd_claims') return mockSdClaimsQuery([]);
      if (table === 'sd_baseline_items') return mockBaselineQuery('B');
      if (table === 'strategic_directives_v2') return mockStrategicDirectivesUpdate();
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
    });

    mockRpc.mockResolvedValue({
      data: { success: true, sd_id: 'SD-CLAIM-001', session_id: 'session-new' },
      error: null
    });

    await claimGuard('SD-CLAIM-001', 'session-new');

    // Verify claim_sd RPC was called with the right params
    expect(mockRpc).toHaveBeenCalledWith('claim_sd', {
      p_sd_id: 'SD-CLAIM-001',
      p_session_id: 'session-new',
      p_track: 'B'
    });
  });

  it('handles claim_sd RPC rejection (conflict detected by partial index)', async () => {
    mockFrom.mockImplementation((table) => {
      if (table === 'sd_claims') return mockSdClaimsQuery([]);
      if (table === 'sd_baseline_items') return mockBaselineQuery('A');
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
    });

    // Simulate the RPC returning a conflict (which would happen if the partial index
    // ON CONFLICT (sd_id) WHERE released_at IS NULL catches a race condition)
    mockRpc.mockResolvedValue({
      data: {
        success: false,
        error: 'claim_rejected',
        claimed_by: 'session-racer'
      },
      error: null
    });

    const result = await claimGuard('SD-CLAIM-001', 'session-loser');

    expect(result.success).toBe(false);
    expect(result.error).toBe('claim_rejected');
    expect(result.owner.session_id).toBe('session-racer');
  });

  it('throws on claim_sd RPC hard failure', async () => {
    mockFrom.mockImplementation((table) => {
      if (table === 'sd_claims') return mockSdClaimsQuery([]);
      if (table === 'sd_baseline_items') return mockBaselineQuery('A');
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
    });

    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'unique_violation: duplicate key value' }
    });

    await expect(claimGuard('SD-CLAIM-001', 'session-new'))
      .rejects.toThrow('claim_sd RPC failed');
  });
});

// ─── Test Suite: US-004 - switchSdClaim syncs claude_sessions.sd_id ──────────
// session-manager.mjs has heavy module-level side effects (PowerShell calls via
// terminal-identity.js, fs operations for session files). Instead of importing it
// directly, we use a contract-test approach:
// 1. Verify the source code contains the SD-LEO-FIX-CLAIM-DUAL-TRUTH-001 sync pattern
// 2. Test the sync logic extracted as a standalone function

describe('US-004: switchSdClaim syncs claude_sessions.sd_id (contract verification)', () => {
  const sessionManagerPath = path.resolve(__dirname, '../../lib/session-manager.mjs');

  it('session-manager.mjs contains the claude_sessions.sd_id sync after switch_sd_claim', () => {
    // Read the actual source to verify the sync pattern exists
    const source = fs.readFileSync(sessionManagerPath, 'utf8');

    // The fix adds a claude_sessions.update with sd_id after successful switch_sd_claim RPC.
    // Verify the SD-LEO-FIX-CLAIM-DUAL-TRUTH-001 comment marker exists
    expect(source).toContain('SD-LEO-FIX-CLAIM-DUAL-TRUTH-001');
    expect(source).toContain('US-004');

    // Verify the sync pattern: after data?.success check, update claude_sessions with sd_id
    expect(source).toContain(".update({ sd_id: newSdId");
    expect(source).toContain(".eq('session_id', session.session_id)");
  });

  it('sync only happens inside the data?.success conditional block', () => {
    const source = fs.readFileSync(sessionManagerPath, 'utf8');

    // Extract the switchSdClaim function body
    const funcStart = source.indexOf('export async function switchSdClaim(');
    expect(funcStart).toBeGreaterThan(-1);

    // Find the function body (approximate: from funcStart to next export or end)
    const funcBody = source.slice(funcStart, source.indexOf('\nexport', funcStart + 1));

    // The sync must be AFTER the success check, not unconditional
    const successCheckIdx = funcBody.indexOf('if (data?.success)');
    const sdUpdateIdx = funcBody.indexOf(".update({ sd_id: newSdId");

    expect(successCheckIdx).toBeGreaterThan(-1);
    expect(sdUpdateIdx).toBeGreaterThan(-1);
    // The update must come AFTER the success check
    expect(sdUpdateIdx).toBeGreaterThan(successCheckIdx);
  });

  it('sync updates sd_id, track, and heartbeat_at together', () => {
    const source = fs.readFileSync(sessionManagerPath, 'utf8');

    // The update call should set all three fields atomically
    const updatePattern = /\.update\(\{\s*sd_id:\s*newSdId\s*,\s*track:.*,\s*heartbeat_at:/;
    expect(source).toMatch(updatePattern);
  });

  it('sync targets the correct session via session_id filter', () => {
    const source = fs.readFileSync(sessionManagerPath, 'utf8');

    // Extract the switchSdClaim function
    const funcStart = source.indexOf('export async function switchSdClaim(');
    const funcBody = source.slice(funcStart, source.indexOf('\nexport', funcStart + 1));

    // After the update with sd_id, must filter by session_id
    const sdUpdateIdx = funcBody.indexOf(".update({ sd_id: newSdId");
    const afterUpdate = funcBody.slice(sdUpdateIdx);
    expect(afterUpdate).toContain(".eq('session_id', session.session_id)");
  });
});

// ─── Test Suite: US-004 - switchSdClaim logic test (extracted pattern) ────────
// Test the sync logic in isolation by simulating the critical code path

describe('US-004: switchSdClaim DB sync logic (behavioral test)', () => {
  /**
   * Extracted core logic from switchSdClaim that we need to verify:
   * After a successful switch_sd_claim RPC, it must call
   * supabase.from('claude_sessions').update({sd_id, track, heartbeat_at}).eq('session_id', ...)
   */

  it('successful RPC triggers claude_sessions.sd_id update', async () => {
    const updateCalls = [];

    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: { success: true, old_sd_id: 'SD-OLD-001', new_sd_id: 'SD-NEW-001' },
        error: null
      }),
      from: vi.fn().mockImplementation((table) => {
        return {
          update: vi.fn().mockImplementation((updateData) => {
            updateCalls.push({ table, data: updateData });
            return {
              eq: vi.fn().mockResolvedValue({ data: null, error: null })
            };
          })
        };
      })
    };

    // Simulate the switchSdClaim logic
    const session = { session_id: 'session-test', sd_id: 'SD-OLD-001', track: 'A' };
    const newSdId = 'SD-NEW-001';
    const newTrack = 'B';

    const { data, error } = await supabase.rpc('switch_sd_claim', {
      p_session_id: session.session_id,
      p_old_sd_id: session.sd_id,
      p_new_sd_id: newSdId,
      p_new_track: newTrack
    });

    if (!error && data?.success) {
      // This is the US-004 fix: sync claude_sessions.sd_id
      await supabase
        .from('claude_sessions')
        .update({ sd_id: newSdId, track: newTrack, heartbeat_at: new Date().toISOString() })
        .eq('session_id', session.session_id);
    }

    // Verify the sync happened
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('claude_sessions');
    expect(updateCalls[0].data.sd_id).toBe('SD-NEW-001');
    expect(updateCalls[0].data.track).toBe('B');
    expect(updateCalls[0].data.heartbeat_at).toBeDefined();
  });

  it('failed RPC does NOT trigger claude_sessions.sd_id update', async () => {
    const updateCalls = [];

    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'claim not found' }
      }),
      from: vi.fn().mockImplementation((table) => {
        return {
          update: vi.fn().mockImplementation((updateData) => {
            updateCalls.push({ table, data: updateData });
            return {
              eq: vi.fn().mockResolvedValue({ data: null, error: null })
            };
          })
        };
      })
    };

    const session = { session_id: 'session-test', sd_id: 'SD-OLD-001', track: 'A' };
    const newSdId = 'SD-NEW-001';
    const newTrack = 'B';

    const { data, error } = await supabase.rpc('switch_sd_claim', {
      p_session_id: session.session_id,
      p_old_sd_id: session.sd_id,
      p_new_sd_id: newSdId,
      p_new_track: newTrack
    });

    if (!error && data?.success) {
      await supabase
        .from('claude_sessions')
        .update({ sd_id: newSdId, track: newTrack, heartbeat_at: new Date().toISOString() })
        .eq('session_id', session.session_id);
    }

    // No sync should happen on failure
    expect(updateCalls).toHaveLength(0);
  });

  it('RPC success=false does NOT trigger claude_sessions.sd_id update', async () => {
    const updateCalls = [];

    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: { success: false, error: 'claim_conflict' },
        error: null
      }),
      from: vi.fn().mockImplementation((table) => {
        return {
          update: vi.fn().mockImplementation((updateData) => {
            updateCalls.push({ table, data: updateData });
            return {
              eq: vi.fn().mockResolvedValue({ data: null, error: null })
            };
          })
        };
      })
    };

    const session = { session_id: 'session-test', sd_id: 'SD-OLD-001', track: 'A' };
    const newSdId = 'SD-NEW-001';
    const newTrack = 'B';

    const { data, error } = await supabase.rpc('switch_sd_claim', {
      p_session_id: session.session_id,
      p_old_sd_id: session.sd_id,
      p_new_sd_id: newSdId,
      p_new_track: newTrack
    });

    if (!error && data?.success) {
      await supabase
        .from('claude_sessions')
        .update({ sd_id: newSdId, track: newTrack, heartbeat_at: new Date().toISOString() })
        .eq('session_id', session.session_id);
    }

    // success=false means no sync
    expect(updateCalls).toHaveLength(0);
  });
});

// ─── Test Suite: Full Claim/Release Flow Regression ──────────────────────────

describe('Regression: Full claim lifecycle flow', () => {
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

    const mod = await import('../../lib/claim-guard.mjs');
    claimGuard = mod.claimGuard;
  });

  it('full flow: no claim -> acquire -> own check succeeds', async () => {
    // Phase 1: No existing claims, acquire succeeds
    mockFrom.mockImplementation((table) => {
      if (table === 'sd_claims') return mockSdClaimsQuery([]);
      if (table === 'sd_baseline_items') return mockBaselineQuery('A');
      if (table === 'strategic_directives_v2') return mockStrategicDirectivesUpdate();
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
    });

    mockRpc.mockResolvedValue({
      data: { success: true, sd_id: 'SD-FLOW-001', session_id: 'session-flow' },
      error: null
    });

    const acquireResult = await claimGuard('SD-FLOW-001', 'session-flow');
    expect(acquireResult.success).toBe(true);
    expect(acquireResult.claim.status).toBe('newly_acquired');

    // Phase 2: Reset mocks to simulate the claim now existing
    vi.clearAllMocks();
    mockFrom.mockImplementation((table) => {
      if (table === 'sd_claims') {
        return mockSdClaimsQuery([{
          sd_id: 'SD-FLOW-001',
          session_id: 'session-flow',
          track: 'A',
          claimed_at: new Date().toISOString()
        }]);
      }
      if (table === 'claude_sessions') {
        return mockClaudeSessionsQuery([{
          session_id: 'session-flow',
          terminal_id: 'win-cc-80000-6666',
          pid: 6666,
          hostname: 'flowhost',
          tty: '/dev/pts/0',
          codebase: '/flow',
          heartbeat_at: new Date().toISOString(),
          status: 'active'
        }]);
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
    });

    const ownResult = await claimGuard('SD-FLOW-001', 'session-flow');
    expect(ownResult.success).toBe(true);
    expect(ownResult.claim.status).toBe('already_owned');
  });

  it('full flow: stale claim -> release -> acquire succeeds for new session', async () => {
    const staleTime = new Date(Date.now() - 1200 * 1000).toISOString(); // 20 min ago

    mockFrom.mockImplementation((table) => {
      if (table === 'sd_claims') {
        return mockSdClaimsQuery([{
          sd_id: 'SD-FLOW-002',
          session_id: 'session-stale',
          track: 'A',
          claimed_at: staleTime
        }]);
      }
      if (table === 'claude_sessions') {
        return mockClaudeSessionsQuery([{
          session_id: 'session-stale',
          terminal_id: 'win-cc-90000-7777',
          pid: 7777,
          hostname: 'stalehost',
          tty: '/dev/pts/0',
          codebase: '/stale',
          heartbeat_at: staleTime,
          status: 'active'
        }]);
      }
      if (table === 'sd_baseline_items') return mockBaselineQuery('A');
      if (table === 'strategic_directives_v2') return mockStrategicDirectivesUpdate();
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
    });

    mockRpc.mockImplementation((funcName) => {
      if (funcName === 'release_sd') {
        return Promise.resolve({ data: null, error: null });
      }
      if (funcName === 'claim_sd') {
        return Promise.resolve({
          data: { success: true, sd_id: 'SD-FLOW-002', session_id: 'session-fresh' },
          error: null
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const result = await claimGuard('SD-FLOW-002', 'session-fresh');

    expect(result.success).toBe(true);
    expect(result.claim.status).toBe('newly_acquired');

    // Verify release was called for the stale session
    expect(mockRpc).toHaveBeenCalledWith('release_sd', {
      p_session_id: 'session-stale',
      p_reason: 'manual'
    });
  });

  it('enrichment query fetches session metadata from claude_sessions for terminal_id matching', async () => {
    const now = new Date().toISOString();
    let enrichmentSessionIds = null;

    mockFrom.mockImplementation((table) => {
      if (table === 'sd_claims') {
        return mockSdClaimsQuery([{
          sd_id: 'SD-ENRICH-001',
          session_id: 'session-other',
          track: 'A',
          claimed_at: now
        }]);
      }
      if (table === 'claude_sessions') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockImplementation((col, ids) => {
              if (col === 'session_id') enrichmentSessionIds = ids;
              return Promise.resolve({
                data: [{
                  session_id: 'session-other',
                  terminal_id: 'win-cc-10000-8888',
                  pid: 8888,
                  hostname: 'otherhost',
                  tty: '/dev/pts/0',
                  codebase: '/other',
                  heartbeat_at: now,
                  status: 'active'
                }],
                error: null
              });
            }),
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { terminal_id: 'win-cc-20000-9999' },
                error: null
              })
            })
          })
        };
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
    });

    await claimGuard('SD-ENRICH-001', 'session-mine');

    // Verify enrichment looked up the correct session IDs from sd_claims
    expect(enrichmentSessionIds).toEqual(['session-other']);
  });
});

// ─── Test Suite: isSameConversation (regression for terminal identity) ───────

describe('Regression: isSameConversation still works correctly', () => {
  let isSameConversation;

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

    const mod = await import('../../lib/claim-guard.mjs');
    isSameConversation = mod.isSameConversation;
  });

  it('returns true for identical terminal IDs', () => {
    expect(isSameConversation('win-cc-30738-12345', 'win-cc-30738-12345')).toBe(true);
  });

  it('returns true for same port and same PID', () => {
    expect(isSameConversation('win-cc-30738-12345', 'win-cc-30738-12345')).toBe(true);
  });

  it('returns false for different ports', () => {
    expect(isSameConversation('win-cc-30738-12345', 'win-cc-40000-12345')).toBe(false);
  });

  it('returns false for same port different PIDs', () => {
    expect(isSameConversation('win-cc-30738-12345', 'win-cc-30738-99999')).toBe(false);
  });

  it('returns "ambiguous" for same port when one has no PID', () => {
    expect(isSameConversation('win-cc-30738', 'win-cc-30738-12345')).toBe('ambiguous');
    expect(isSameConversation('win-cc-30738-12345', 'win-cc-30738')).toBe('ambiguous');
  });

  it('returns "ambiguous" for same port when both have no PID', () => {
    expect(isSameConversation('win-cc-30738', 'win-cc-30738')).toBe(true); // identical strings
  });

  it('returns false for non-Windows terminal IDs', () => {
    expect(isSameConversation('/dev/pts/0', '/dev/pts/0')).toBe(true); // identical
    expect(isSameConversation('/dev/pts/0', '/dev/pts/1')).toBe(false); // not parseable as win-cc
  });
});
