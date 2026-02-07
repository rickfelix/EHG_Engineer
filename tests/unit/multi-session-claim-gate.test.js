/**
 * Tests for Multi-Session Claim Conflict Gate
 * PAT-MSESS-BYP-001 corrective action
 * PAT-SESSION-IDENTITY-001: Updated to test hostname-based comparison
 */

import { describe, it, expect, vi } from 'vitest';
import {
  validateMultiSessionClaim,
  createMultiSessionClaimGate
} from '../../scripts/modules/handoff/gates/multi-session-claim-gate.js';

// Helper: mock Supabase that returns active session data
function createMockSupabase(sessions = []) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: sessions, error: null })
        })
      })
    })
  };
}

// Helper: mock Supabase that returns a DB error
function createErrorSupabase(message = 'Connection refused') {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: null, error: { message } })
        })
      })
    })
  };
}

describe('Multi-Session Claim Conflict Gate', () => {
  describe('validateMultiSessionClaim', () => {
    it('should PASS when no sessions claim the SD', async () => {
      const supabase = createMockSupabase([]);

      const result = await validateMultiSessionClaim(supabase, 'SD-TEST-001');

      expect(result.pass).toBe(true);
      expect(result.score).toBe(100);
      expect(result.issues).toHaveLength(0);
    });

    it('should BLOCK when session on DIFFERENT hostname claims the SD', async () => {
      const sessions = [{
        session_id: 'other-session-123',
        sd_id: 'SD-TEST-001',
        sd_title: 'Test SD',
        hostname: 'REMOTE-SERVER',
        tty: '/dev/pts/1',
        heartbeat_age_human: '30s ago',
        heartbeat_age_seconds: 30,
        computed_status: 'active',
        codebase: 'EHG_Engineer'
      }];

      const supabase = createMockSupabase(sessions);

      const result = await validateMultiSessionClaim(supabase, 'SD-TEST-001', {
        currentSessionId: 'my-session-456',
        currentHostname: 'MY-LAPTOP'
      });

      expect(result.pass).toBe(false);
      expect(result.score).toBe(0);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]).toContain('claimed by another active session');
      expect(result.claimDetails.sessionId).toBe('other-session-123');
      expect(result.claimDetails.hostname).toBe('REMOTE-SERVER');
    });

    it('should PASS when the only claim is from the current session (exact match)', async () => {
      const sessions = [{
        session_id: 'my-session-456',
        sd_id: 'SD-TEST-001',
        sd_title: 'Test SD',
        hostname: 'MY-LAPTOP',
        tty: '/dev/pts/0',
        heartbeat_age_human: '10s ago',
        heartbeat_age_seconds: 10,
        computed_status: 'active',
        codebase: 'EHG_Engineer'
      }];

      const supabase = createMockSupabase(sessions);

      const result = await validateMultiSessionClaim(supabase, 'SD-TEST-001', {
        currentSessionId: 'my-session-456',
        currentHostname: 'MY-LAPTOP'
      });

      expect(result.pass).toBe(true);
      expect(result.score).toBe(100);
      expect(result.issues).toHaveLength(0);
    });

    it('should PASS when claim is from different session on SAME hostname (same-machine)', async () => {
      // PAT-SESSION-IDENTITY-001: sd:start creates session A, handoff.js creates session B,
      // but both are on the same machine (same developer) → allow
      const sessions = [{
        session_id: 'sd-start-session-111',
        sd_id: 'SD-TEST-001',
        sd_title: 'Test SD',
        hostname: 'MY-LAPTOP',
        tty: 'win-12345',
        heartbeat_age_human: '20s ago',
        heartbeat_age_seconds: 20,
        computed_status: 'active',
        codebase: 'EHG_Engineer'
      }];

      const supabase = createMockSupabase(sessions);

      const result = await validateMultiSessionClaim(supabase, 'SD-TEST-001', {
        currentSessionId: 'handoff-session-222',
        currentHostname: 'MY-LAPTOP'
      });

      expect(result.pass).toBe(true);
      expect(result.score).toBe(100);
      expect(result.issues).toHaveLength(0);
    });

    it('should fail-open on DB error (score 80)', async () => {
      const supabase = createErrorSupabase('Connection refused');

      const result = await validateMultiSessionClaim(supabase, 'SD-TEST-001');

      expect(result.pass).toBe(true);
      expect(result.score).toBe(80);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Connection refused');
    });

    it('should fail-open on unexpected exception', async () => {
      const supabase = {
        from: vi.fn().mockImplementation(() => {
          throw new Error('Unexpected crash');
        })
      };

      const result = await validateMultiSessionClaim(supabase, 'SD-TEST-001');

      expect(result.pass).toBe(true);
      expect(result.score).toBe(80);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Unexpected crash');
    });

    it('should PASS when no currentSessionId provided and no claims exist', async () => {
      const supabase = createMockSupabase([]);

      const result = await validateMultiSessionClaim(supabase, 'SD-TEST-001');

      expect(result.pass).toBe(true);
    });

    it('should BLOCK when no currentSessionId and claim from different hostname', async () => {
      const sessions = [{
        session_id: 'other-session-123',
        sd_id: 'SD-TEST-001',
        sd_title: 'Test SD',
        hostname: 'REMOTE-SERVER',
        tty: '/dev/pts/1',
        heartbeat_age_human: '1m ago',
        heartbeat_age_seconds: 60,
        computed_status: 'active',
        codebase: 'EHG_Engineer'
      }];

      const supabase = createMockSupabase(sessions);

      // No currentSessionId but different hostname → blocks
      const result = await validateMultiSessionClaim(supabase, 'SD-TEST-001', {
        currentHostname: 'MY-LAPTOP'
      });

      expect(result.pass).toBe(false);
      expect(result.issues).toHaveLength(1);
    });

    it('should PASS when no currentSessionId but claim from same hostname', async () => {
      const sessions = [{
        session_id: 'other-session-123',
        sd_id: 'SD-TEST-001',
        sd_title: 'Test SD',
        hostname: 'MY-LAPTOP',
        tty: '/dev/pts/1',
        heartbeat_age_human: '1m ago',
        heartbeat_age_seconds: 60,
        computed_status: 'active',
        codebase: 'EHG_Engineer'
      }];

      const supabase = createMockSupabase(sessions);

      // No currentSessionId but same hostname → same machine → pass
      const result = await validateMultiSessionClaim(supabase, 'SD-TEST-001', {
        currentHostname: 'MY-LAPTOP'
      });

      expect(result.pass).toBe(true);
    });
  });

  describe('createMultiSessionClaimGate', () => {
    it('should create a gate with correct name and properties', () => {
      const supabase = createMockSupabase([]);
      const gate = createMultiSessionClaimGate(supabase, 'SD-TEST-001');

      expect(gate.name).toBe('GATE_MULTI_SESSION_CLAIM_CONFLICT');
      expect(gate.required).toBe(true);
      expect(gate.blocking).toBe(true);
      expect(typeof gate.validator).toBe('function');
      expect(gate.remediation).toContain('SD-TEST-001');
    });

    it('should execute validator and return results', async () => {
      const supabase = createMockSupabase([]);
      const gate = createMultiSessionClaimGate(supabase, 'SD-TEST-001');

      const result = await gate.validator();

      expect(result.pass).toBe(true);
      expect(result.score).toBe(100);
    });
  });
});
