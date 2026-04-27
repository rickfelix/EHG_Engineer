/**
 * tests/unit/heartbeat-manager-ownership-mode.test.js
 *
 * SD-LEO-INFRA-LEO-PROTOCOL-POLICY-001 (FR-007 acceptance criteria)
 *
 * Verifies that heartbeat-manager.mjs correctly threads the ownership mode
 * from startHeartbeat() options through to getCurrentOwnershipMode() and
 * resets to the safe default on stopHeartbeat().
 *
 * Does NOT test exit-handler behavior directly (that would require spawning
 * a subprocess). The contract this test establishes — that the mode is
 * recorded correctly — is what the exit handlers read at release time.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the network / DB side effects so tests don't hit Supabase. We only
// care about the ownership-mode state machine here.
vi.mock('../../lib/supabase-client.js', () => {
  const stubClient = {
    from: () => ({
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
  };
  return {
    createSupabaseServiceClient: () => stubClient,
    lazyServiceClient: () => stubClient,
  };
});

vi.mock('../../lib/session-manager.mjs', () => ({
  updateHeartbeat: vi.fn(() => Promise.resolve({ success: true })),
  endSession: vi.fn(() => Promise.resolve({ success: true })),
}));

vi.mock('../../scripts/modules/claim-health/self-heal.js', () => ({
  selfHeal: vi.fn(() => Promise.resolve({ healed: false })),
}));

// Import after mocks are registered
const {
  startHeartbeat,
  stopHeartbeat,
  getCurrentOwnershipMode,
  isHeartbeatActive,
} = await import('../../lib/heartbeat-manager.mjs');

describe('heartbeat-manager ownership mode (FR-007)', () => {
  afterEach(() => {
    // Clean up so each test starts with no active heartbeat
    if (isHeartbeatActive().active) {
      stopHeartbeat();
    }
  });

  describe('default behavior (backward-compat)', () => {
    it('defaults to exclusive when no options passed', () => {
      startHeartbeat('sess-default');
      expect(getCurrentOwnershipMode()).toBe('exclusive');
    });

    it('defaults to exclusive when options is an empty object', () => {
      startHeartbeat('sess-empty-opts', {});
      expect(getCurrentOwnershipMode()).toBe('exclusive');
    });

    it('defaults to exclusive when ownershipMode is an invalid string', () => {
      startHeartbeat('sess-invalid', { ownershipMode: 'garbage' });
      expect(getCurrentOwnershipMode()).toBe('exclusive');
    });
  });

  describe('cooperative mode', () => {
    it('records cooperative when explicitly requested', () => {
      startHeartbeat('sess-coop', { ownershipMode: 'cooperative' });
      expect(getCurrentOwnershipMode()).toBe('cooperative');
    });
  });

  describe('exclusive mode', () => {
    it('records exclusive when explicitly requested', () => {
      startHeartbeat('sess-excl', { ownershipMode: 'exclusive' });
      expect(getCurrentOwnershipMode()).toBe('exclusive');
    });
  });

  describe('mode escalation on same-session re-invocation', () => {
    it('updates mode when called again for the same session', () => {
      startHeartbeat('sess-same', { ownershipMode: 'exclusive' });
      expect(getCurrentOwnershipMode()).toBe('exclusive');

      // Same session, escalate to cooperative
      const result = startHeartbeat('sess-same', { ownershipMode: 'cooperative' });
      expect(result.message).toMatch(/already active/i);
      expect(getCurrentOwnershipMode()).toBe('cooperative');
    });

    it('returns the current ownershipMode in the result on duplicate start', () => {
      startHeartbeat('sess-dup', { ownershipMode: 'cooperative' });
      const result = startHeartbeat('sess-dup', { ownershipMode: 'cooperative' });
      expect(result.ownershipMode).toBe('cooperative');
    });
  });

  describe('stopHeartbeat resets mode to safe default', () => {
    it('resets to exclusive after stop', () => {
      startHeartbeat('sess-reset', { ownershipMode: 'cooperative' });
      expect(getCurrentOwnershipMode()).toBe('cooperative');

      stopHeartbeat();
      expect(getCurrentOwnershipMode()).toBe('exclusive');
    });

    it('next startHeartbeat without options gets exclusive default after stop', () => {
      startHeartbeat('sess-A', { ownershipMode: 'cooperative' });
      stopHeartbeat();

      startHeartbeat('sess-B'); // no options
      expect(getCurrentOwnershipMode()).toBe('exclusive');
    });
  });

  describe('different-session swap', () => {
    it('stopping old session and starting new one uses the new options', () => {
      startHeartbeat('sess-old', { ownershipMode: 'exclusive' });
      startHeartbeat('sess-new', { ownershipMode: 'cooperative' });
      expect(getCurrentOwnershipMode()).toBe('cooperative');
    });
  });
});
