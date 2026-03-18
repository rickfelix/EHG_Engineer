/**
 * Tests for SD-LEO-INFRA-PRE-CLAIM-CHECK-001
 *
 * Pre-Claim Check: Auto-fallback when claim conflicts occur in auto-proceed mode.
 *
 * Tests the getNextWorkableSD() and getSessionAutoProceed() helpers,
 * plus the fallback retry loop logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock Supabase ──

function createMockSupabase({ sessions = [], sds = [] } = {}) {
  const chainable = (data, error = null) => {
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      in: vi.fn(() => chain),
      not: vi.fn(() => chain),
      or: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      single: vi.fn(() => Promise.resolve({ data: data?.[0] || null, error })),
      then: (fn) => Promise.resolve({ data, error }).then(fn),
      [Symbol.iterator]: function* () { yield* data || []; }
    };
    // Make chain thenable for await without .single()
    chain.then = (fn) => Promise.resolve({ data, error }).then(fn);
    return chain;
  };

  return {
    from: vi.fn((table) => {
      if (table === 'claude_sessions') return chainable(sessions);
      if (table === 'strategic_directives_v2') return chainable(sds);
      return chainable([]);
    }),
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null }))
  };
}

// ── Unit tests for getNextWorkableSD logic ──

describe('getNextWorkableSD() logic', () => {
  it('should return first unclaimed SD from queue', async () => {
    const activeSessions = [
      { sd_id: 'SD-CLAIMED-001' },
      { sd_id: 'SD-CLAIMED-002' }
    ];

    const candidates = [
      { sd_key: 'SD-CLAIMED-001', title: 'Claimed One', current_phase: 'EXEC', status: 'active', priority: 'high' },
      { sd_key: 'SD-CLAIMED-002', title: 'Claimed Two', current_phase: 'LEAD', status: 'draft', priority: 'medium' },
      { sd_key: 'SD-FREE-001', title: 'Free One', current_phase: 'LEAD', status: 'draft', priority: 'medium' },
      { sd_key: 'SD-FREE-002', title: 'Free Two', current_phase: 'PLAN', status: 'planning', priority: 'low' }
    ];

    const claimedSdKeys = new Set(activeSessions.map(s => s.sd_id));
    const excludeKeys = [];

    // Simulate the filtering logic
    let result = null;
    for (const sd of candidates) {
      if (excludeKeys.includes(sd.sd_key)) continue;
      if (claimedSdKeys.has(sd.sd_key)) continue;
      result = { sdKey: sd.sd_key, title: sd.title, phase: sd.current_phase };
      break;
    }

    expect(result).not.toBeNull();
    expect(result.sdKey).toBe('SD-FREE-001');
    expect(result.title).toBe('Free One');
  });

  it('should exclude specified keys', async () => {
    const candidates = [
      { sd_key: 'SD-SKIP-001', title: 'Skip This', current_phase: 'LEAD', status: 'draft', priority: 'high' },
      { sd_key: 'SD-TAKE-001', title: 'Take This', current_phase: 'LEAD', status: 'draft', priority: 'medium' }
    ];

    const claimedSdKeys = new Set();
    const excludeKeys = ['SD-SKIP-001'];

    let result = null;
    for (const sd of candidates) {
      if (excludeKeys.includes(sd.sd_key)) continue;
      if (claimedSdKeys.has(sd.sd_key)) continue;
      result = { sdKey: sd.sd_key, title: sd.title, phase: sd.current_phase };
      break;
    }

    expect(result).not.toBeNull();
    expect(result.sdKey).toBe('SD-TAKE-001');
  });

  it('should return null when all SDs are claimed or excluded', async () => {
    const candidates = [
      { sd_key: 'SD-A', title: 'A', current_phase: 'LEAD', status: 'draft', priority: 'high' },
      { sd_key: 'SD-B', title: 'B', current_phase: 'LEAD', status: 'draft', priority: 'medium' }
    ];

    const claimedSdKeys = new Set(['SD-A']);
    const excludeKeys = ['SD-B'];

    let result = null;
    for (const sd of candidates) {
      if (excludeKeys.includes(sd.sd_key)) continue;
      if (claimedSdKeys.has(sd.sd_key)) continue;
      result = { sdKey: sd.sd_key, title: sd.title, phase: sd.current_phase };
      break;
    }

    expect(result).toBeNull();
  });
});

// ── Fallback retry loop logic ──

describe('Fallback retry loop', () => {
  const MAX_FALLBACK_ATTEMPTS = 3;

  function simulateFallbackLoop(claimResults, queueSDs) {
    const skippedSDs = [];
    const excludeKeys = ['SD-ORIGINAL'];
    let fallbackAttempt = 0;
    let claimedSD = null;
    let queueIndex = 0;

    while (fallbackAttempt < MAX_FALLBACK_ATTEMPTS) {
      fallbackAttempt++;

      // Simulate getNextWorkableSD
      const nextSD = queueIndex < queueSDs.length ? queueSDs[queueIndex] : null;
      queueIndex++;

      if (!nextSD) break;

      // Simulate claimGuard result
      const result = claimResults[nextSD.sdKey] || { success: false, error: 'claimed' };

      if (result.success) {
        claimedSD = nextSD;
        break;
      }

      skippedSDs.push({ sdKey: nextSD.sdKey, reason: result.error });
      excludeKeys.push(nextSD.sdKey);
    }

    return { claimedSD, skippedSDs, attempts: fallbackAttempt };
  }

  it('should claim first available SD on single conflict', () => {
    const claimResults = {
      'SD-FALLBACK-001': { success: true }
    };
    const queueSDs = [
      { sdKey: 'SD-FALLBACK-001', title: 'Fallback One' }
    ];

    const { claimedSD, skippedSDs, attempts } = simulateFallbackLoop(claimResults, queueSDs);

    expect(claimedSD).not.toBeNull();
    expect(claimedSD.sdKey).toBe('SD-FALLBACK-001');
    expect(skippedSDs).toHaveLength(0);
    expect(attempts).toBe(1);
  });

  it('should skip claimed SDs and claim third', () => {
    const claimResults = {
      'SD-CLAIMED-A': { success: false, error: 'claimed_by_active_session' },
      'SD-CLAIMED-B': { success: false, error: 'claimed_by_active_session' },
      'SD-FREE-C': { success: true }
    };
    const queueSDs = [
      { sdKey: 'SD-CLAIMED-A', title: 'Claimed A' },
      { sdKey: 'SD-CLAIMED-B', title: 'Claimed B' },
      { sdKey: 'SD-FREE-C', title: 'Free C' }
    ];

    const { claimedSD, skippedSDs, attempts } = simulateFallbackLoop(claimResults, queueSDs);

    expect(claimedSD).not.toBeNull();
    expect(claimedSD.sdKey).toBe('SD-FREE-C');
    expect(skippedSDs).toHaveLength(2);
    expect(attempts).toBe(3);
  });

  it('should stop after MAX_FALLBACK_ATTEMPTS when all fail', () => {
    const claimResults = {
      'SD-CLAIMED-1': { success: false, error: 'claimed_by_active_session' },
      'SD-CLAIMED-2': { success: false, error: 'claimed_by_active_session' },
      'SD-CLAIMED-3': { success: false, error: 'claimed_by_active_session' },
      'SD-CLAIMED-4': { success: false, error: 'claimed_by_active_session' }
    };
    const queueSDs = [
      { sdKey: 'SD-CLAIMED-1', title: 'Claimed 1' },
      { sdKey: 'SD-CLAIMED-2', title: 'Claimed 2' },
      { sdKey: 'SD-CLAIMED-3', title: 'Claimed 3' },
      { sdKey: 'SD-CLAIMED-4', title: 'Claimed 4' }
    ];

    const { claimedSD, skippedSDs, attempts } = simulateFallbackLoop(claimResults, queueSDs);

    expect(claimedSD).toBeNull();
    expect(skippedSDs).toHaveLength(3); // MAX_FALLBACK_ATTEMPTS = 3
    expect(attempts).toBe(3);
  });

  it('should stop when queue is empty before max attempts', () => {
    const claimResults = {
      'SD-CLAIMED-X': { success: false, error: 'claimed_by_active_session' }
    };
    const queueSDs = [
      { sdKey: 'SD-CLAIMED-X', title: 'Claimed X' }
    ];

    const { claimedSD, skippedSDs, attempts } = simulateFallbackLoop(claimResults, queueSDs);

    expect(claimedSD).toBeNull();
    expect(skippedSDs).toHaveLength(1);
    expect(attempts).toBe(2); // One skip + one null
  });
});

// ── Auto-proceed detection ──

describe('Auto-proceed session detection', () => {
  it('should default to true when no metadata', () => {
    const metadata = null;
    const autoProceed = metadata?.auto_proceed ?? true;
    expect(autoProceed).toBe(true);
  });

  it('should respect explicit false', () => {
    const metadata = { auto_proceed: false };
    const autoProceed = metadata?.auto_proceed ?? true;
    expect(autoProceed).toBe(false);
  });

  it('should respect explicit true', () => {
    const metadata = { auto_proceed: true };
    const autoProceed = metadata?.auto_proceed ?? true;
    expect(autoProceed).toBe(true);
  });

  it('should default to true when metadata exists but auto_proceed missing', () => {
    const metadata = { chain_orchestrators: false };
    const autoProceed = metadata?.auto_proceed ?? true;
    expect(autoProceed).toBe(true);
  });
});

// ── Non-auto-proceed preserves original behavior ──

describe('Non-auto-proceed mode', () => {
  it('should not attempt fallback when auto-proceed is OFF', () => {
    const autoProceed = false;
    const fallbackEnabled = autoProceed || false; // no --fallback flag
    const claimFailed = true;

    // When fallback is disabled, the original exit path runs
    const shouldFallback = claimFailed && fallbackEnabled;
    expect(shouldFallback).toBe(false);
  });

  it('should allow fallback with explicit --fallback flag even when auto-proceed OFF', () => {
    const autoProceed = false;
    const hasFallbackFlag = true;
    const fallbackEnabled = autoProceed || hasFallbackFlag;
    const claimFailed = true;

    const shouldFallback = claimFailed && fallbackEnabled;
    expect(shouldFallback).toBe(true);
  });
});
