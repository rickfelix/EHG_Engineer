/**
 * Tests for Multi-Session Claim Conflict Gate
 * PAT-MSESS-BYP-001 corrective action
 * PAT-SESSION-IDENTITY-002: Updated to test hostname + terminal_id comparison
 * SD-LEO-FIX-FIX-MULTI-SESSION-001: Added terminal_id discriminator tests
 * SD-LEO-INFRA-MULTI-SESSION-CLAIM-001: rewritten for the Surface-A-first contract —
 * the gate now reads strategic_directives_v2.claiming_session_id (Surface A) as the
 * authoritative owner, and only consults claude_sessions (Surface B) as advisory
 * context for a genuine foreign claim's liveness/same-conversation determination.
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  validateMultiSessionClaim,
  createMultiSessionClaimGate
} from '../../scripts/modules/handoff/gates/multi-session-claim-gate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Mock supabase for the Surface-A-first contract.
 * @param {object} opts
 * @param {string|null} [opts.ownerSessionId] - strategic_directives_v2.claiming_session_id (Surface A)
 * @param {object|null} [opts.ownerSessionRow] - claude_sessions row for ownerSessionId (Surface B, advisory)
 * @param {object|null} [opts.sdError] - simulate an error reading Surface A
 */
function createMockSupabase({ ownerSessionId = null, ownerSessionRow = null, sdError = null } = {}) {
  return {
    // validateMultiSessionClaim first calls rpc('release_same_conversation_claims'). It must
    // resolve so the SUT skips the claude_sessions fallback (whose 3-deep .eq() chain this
    // mock doesn't provide) — otherwise it would collide with the Surface-A-owner mock below.
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    from: vi.fn((table) => {
      if (table === 'strategic_directives_v2') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue(
                sdError
                  ? { data: null, error: sdError }
                  : { data: { claiming_session_id: ownerSessionId }, error: null }
              )
            })
          })
        };
      }
      if (table === 'claude_sessions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: ownerSessionRow, error: null })
            })
          })
        };
      }
      throw new Error(`createMockSupabase: unexpected table "${table}"`);
    })
  };
}

const FRESH_HEARTBEAT = () => new Date().toISOString();

describe('Multi-Session Claim Conflict Gate', () => {
  describe('validateMultiSessionClaim', () => {
    it('should PASS when no session claims the SD (Surface A unclaimed)', async () => {
      const supabase = createMockSupabase({ ownerSessionId: null });

      const result = await validateMultiSessionClaim(supabase, 'SD-TEST-001');

      expect(result.pass).toBe(true);
      expect(result.score).toBe(100);
      expect(result.issues).toHaveLength(0);
    });

    it('should BLOCK when Surface A owner is on a DIFFERENT hostname and genuinely alive', async () => {
      const supabase = createMockSupabase({
        ownerSessionId: 'other-session-123',
        ownerSessionRow: {
          status: 'active',
          is_alive: true,
          heartbeat_at: FRESH_HEARTBEAT(),
          expected_silence_until: null,
          hostname: 'REMOTE-SERVER',
          terminal_id: null,
          tty: '/dev/pts/1',
          sd_key: 'SD-TEST-001',
          codebase: 'EHG_Engineer'
        }
      });

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

    it('should PASS when Surface A owner IS the current session (exact match)', async () => {
      // Surface A alone is dispositive — the gate must not even need to consult
      // claude_sessions (Surface B) when the caller already owns the claim.
      const supabase = createMockSupabase({ ownerSessionId: 'my-session-456' });

      const result = await validateMultiSessionClaim(supabase, 'SD-TEST-001', {
        currentSessionId: 'my-session-456',
        currentHostname: 'MY-LAPTOP'
      });

      expect(result.pass).toBe(true);
      expect(result.score).toBe(100);
      expect(result.issues).toHaveLength(0);
    });

    it('should PASS when Surface A owner is a DIFFERENT session but same hostname + same terminal_id (same conversation)', async () => {
      // PAT-SESSION-IDENTITY-002: sd:start creates session A, handoff.js creates session B,
      // both share hostname AND terminal_id (same parent Claude Code process) → allow
      const supabase = createMockSupabase({
        ownerSessionId: 'sd-start-session-111',
        ownerSessionRow: {
          status: 'active',
          is_alive: true,
          heartbeat_at: FRESH_HEARTBEAT(),
          expected_silence_until: null,
          hostname: 'MY-LAPTOP',
          terminal_id: 'win-ppid-43456',
          tty: 'win-12345',
          sd_key: 'SD-TEST-001',
          codebase: 'EHG_Engineer'
        }
      });

      const result = await validateMultiSessionClaim(supabase, 'SD-TEST-001', {
        currentSessionId: 'handoff-session-222',
        currentHostname: 'MY-LAPTOP',
        currentTerminalId: 'win-ppid-43456'
      });

      expect(result.pass).toBe(true);
      expect(result.score).toBe(100);
      expect(result.issues).toHaveLength(0);
    });

    it('should BLOCK when Surface A owner is alive on same hostname but DIFFERENT terminal_id (different conversation)', async () => {
      // SD-LEO-FIX-FIX-MULTI-SESSION-001: Two Claude Code conversations on same machine
      // have same hostname but different terminal_ids → must block
      const supabase = createMockSupabase({
        ownerSessionId: 'other-conversation-session',
        ownerSessionRow: {
          status: 'active',
          is_alive: true,
          heartbeat_at: FRESH_HEARTBEAT(),
          expected_silence_until: null,
          hostname: 'MY-LAPTOP',
          terminal_id: 'win-ppid-99999', // Different terminal_id
          tty: 'win-99999',
          sd_key: 'SD-TEST-001',
          codebase: 'EHG_Engineer'
        }
      });

      const result = await validateMultiSessionClaim(supabase, 'SD-TEST-001', {
        currentSessionId: 'my-session-456',
        currentHostname: 'MY-LAPTOP',
        currentTerminalId: 'win-ppid-43456'
      });

      expect(result.pass).toBe(false);
      expect(result.score).toBe(0);
      expect(result.issues).toHaveLength(1);
      expect(result.claimDetails.isSameMachine).toBe(true);
      expect(result.claimDetails.terminalId).toBe('win-ppid-99999');
    });

    it('should BLOCK when Surface A owner is alive with null terminal_id on same hostname (safe default)', async () => {
      // Legacy sessions without terminal_id should be treated as conflicts
      const supabase = createMockSupabase({
        ownerSessionId: 'legacy-session-333',
        ownerSessionRow: {
          status: 'active',
          is_alive: true,
          heartbeat_at: FRESH_HEARTBEAT(),
          expected_silence_until: null,
          hostname: 'MY-LAPTOP',
          terminal_id: null, // Legacy session, no terminal_id
          tty: 'win-33333',
          sd_key: 'SD-TEST-001',
          codebase: 'EHG_Engineer'
        }
      });

      const result = await validateMultiSessionClaim(supabase, 'SD-TEST-001', {
        currentSessionId: 'handoff-session-222',
        currentHostname: 'MY-LAPTOP',
        currentTerminalId: 'win-ppid-43456'
      });

      // Cannot confirm same conversation → treat as conflict
      expect(result.pass).toBe(false);
      expect(result.score).toBe(0);
    });

    it('should fail-open on DB error reading Surface A (score 80)', async () => {
      const supabase = createMockSupabase({ sdError: { message: 'Connection refused' } });

      const result = await validateMultiSessionClaim(supabase, 'SD-TEST-001');

      expect(result.pass).toBe(true);
      expect(result.score).toBe(80);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Connection refused');
    });

    it('should fail-open on unexpected exception', async () => {
      const supabase = {
        rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
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

    it('should PASS when no currentSessionId provided and Surface A is unclaimed', async () => {
      const supabase = createMockSupabase({ ownerSessionId: null });

      const result = await validateMultiSessionClaim(supabase, 'SD-TEST-001');

      expect(result.pass).toBe(true);
    });

    it('should BLOCK when no currentSessionId and Surface A owner is alive on a different hostname', async () => {
      const supabase = createMockSupabase({
        ownerSessionId: 'other-session-123',
        ownerSessionRow: {
          status: 'active',
          is_alive: true,
          heartbeat_at: FRESH_HEARTBEAT(),
          expected_silence_until: null,
          hostname: 'REMOTE-SERVER',
          terminal_id: null,
          tty: '/dev/pts/1',
          sd_key: 'SD-TEST-001',
          codebase: 'EHG_Engineer'
        }
      });

      // No currentSessionId but different hostname → blocks
      const result = await validateMultiSessionClaim(supabase, 'SD-TEST-001', {
        currentHostname: 'MY-LAPTOP'
      });

      expect(result.pass).toBe(false);
      expect(result.issues).toHaveLength(1);
    });

    it('should PASS when no currentSessionId but Surface A owner is on same hostname + same terminal_id', async () => {
      const supabase = createMockSupabase({
        ownerSessionId: 'other-session-123',
        ownerSessionRow: {
          status: 'active',
          is_alive: true,
          heartbeat_at: FRESH_HEARTBEAT(),
          expected_silence_until: null,
          hostname: 'MY-LAPTOP',
          terminal_id: 'win-ppid-43456',
          tty: '/dev/pts/1',
          sd_key: 'SD-TEST-001',
          codebase: 'EHG_Engineer'
        }
      });

      // No currentSessionId but same hostname + terminal_id → same conversation → pass
      const result = await validateMultiSessionClaim(supabase, 'SD-TEST-001', {
        currentHostname: 'MY-LAPTOP',
        currentTerminalId: 'win-ppid-43456'
      });

      expect(result.pass).toBe(true);
    });

    // SD-LEO-INFRA-MULTI-SESSION-CLAIM-001: the exact recurred-family witnessed scenario at the
    // unit-mock level (the mandatory live-DB e2e equivalent lives in
    // tests/integration/multi-session-claim-gate-surface-a.integration.test.js). The rightful
    // owner (Surface A === currentSessionId) must pass EVEN THOUGH an unrelated dead peer session
    // independently has a phantom sd_key stamp on itself with a fresh-looking heartbeat — because
    // the gate no longer queries Surface B (v_active_sessions/claude_sessions by sd_key) at all
    // once Surface A confirms self-ownership.
    it('should PASS the rightful Surface-A owner even when an unrelated dead peer holds a stale sd_key stamp with a fresh heartbeat', async () => {
      const supabase = createMockSupabase({ ownerSessionId: 'me-the-rightful-owner' });

      const result = await validateMultiSessionClaim(supabase, 'SD-TEST-001', {
        currentSessionId: 'me-the-rightful-owner',
        currentHostname: 'MY-LAPTOP',
        currentTerminalId: 'win-ppid-43456'
      });

      expect(result.pass).toBe(true);
      expect(result.score).toBe(100);
      // Surface B (claude_sessions) is never even queried in this path — asserting the mock's
      // claude_sessions branch was not called would over-specify implementation, so the
      // observable contract (pass:true, no Surface-B-derived issues) is what's asserted.
      expect(result.issues).toHaveLength(0);
    });

    it('should PASS when Surface A owner is dead (stale heartbeat, is_alive=false) — delegated liveness auto-heals', async () => {
      const supabase = createMockSupabase({
        ownerSessionId: 'dead-owner-session',
        ownerSessionRow: {
          status: 'idle',
          is_alive: false,
          heartbeat_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(), // 20 min old, beyond CLAIM_TTL_MS
          expected_silence_until: null,
          hostname: 'REMOTE-SERVER',
          terminal_id: null,
          tty: null,
          sd_key: 'SD-TEST-001',
          codebase: 'EHG_Engineer'
        }
      });

      const result = await validateMultiSessionClaim(supabase, 'SD-TEST-001', {
        currentSessionId: 'my-session-456',
        currentHostname: 'MY-LAPTOP'
      });

      expect(result.pass).toBe(true);
      expect(result.score).toBe(100);
    });
  });

  /**
   * SD-LEO-INFRA-PARKED-WORKER-CLAIM-LAPSE-001 FR-3, second consumer.
   *
   * FR-3 taught shouldReleaseStaleOwner to distinguish an owner that MOVED to another sd_key
   * (a genuine "they left" signal) from one whose sd_key is merely NULL (ambiguous — the
   * observed lapse, where a parked-but-live worker looks abandoned). The fix landed at
   * lib/claim-validity-gate.js but NOT here, even though this gate computes
   * `ownerHasSdKeyDrifted = !!ownerRow && ownerRow.sd_key !== sdId`, which is TRUE for NULL.
   * With ownerSdKeyMissing left undefined, the predicate short-circuited on
   * `if (!ownerSdKeyMissing) return true` and this gate reported "no real conflict — passing",
   * letting a handoff proceed against a LIVE worker's SD.
   *
   * Behavioural, through the real gate. Verified RED before the fix.
   */
  describe('FR-3 propagation: a NULL owner sd_key must not read as "they moved on"', () => {
    const ARMED_SILENCE = () => new Date(Date.now() + 5 * 60 * 1000).toISOString();

    it('BLOCKS when the owner is silence-armed and its sd_key is NULL (ambiguous, not drift)', async () => {
      const supabase = createMockSupabase({
        ownerSessionId: 'parked-live-owner-123',
        ownerSessionRow: {
          status: 'active',
          is_alive: true,
          heartbeat_at: FRESH_HEARTBEAT(),
          expected_silence_until: ARMED_SILENCE(), // parked worker: alive but deliberately silent
          hostname: 'REMOTE-SERVER',
          terminal_id: null,
          tty: '/dev/pts/1',
          sd_key: null,                            // ← the ambiguous signal, NOT a move
          codebase: 'EHG_Engineer'
        }
      });

      const result = await validateMultiSessionClaim(supabase, 'SD-TEST-001', {
        currentSessionId: 'my-session-456'
      });

      // Before the fix this returned pass:true ("dead/drifted — no real conflict").
      expect(result.pass).toBe(false);
    });

    it('still PASSES when the owner verifiably MOVED to another sd_key (no claim leak)', async () => {
      // The other direction matters just as much: over-guarding drift would strand claims and
      // starve the belt. A genuine move is still a release signal even for a live, silenced owner.
      const supabase = createMockSupabase({
        ownerSessionId: 'moved-on-owner-789',
        ownerSessionRow: {
          status: 'active',
          is_alive: true,
          heartbeat_at: FRESH_HEARTBEAT(),
          expected_silence_until: ARMED_SILENCE(),
          hostname: 'REMOTE-SERVER',
          terminal_id: null,
          tty: '/dev/pts/1',
          sd_key: 'SD-SOME-OTHER-SD-002',          // ← verifiably elsewhere
          codebase: 'EHG_Engineer'
        }
      });

      const result = await validateMultiSessionClaim(supabase, 'SD-TEST-001', {
        currentSessionId: 'my-session-456'
      });

      expect(result.pass).toBe(true);
    });

    it('passes ownerSdKeyMissing through to the shared predicate (both consumers agree)', () => {
      const src = readFileSync(
        resolve(__dirname, '../..', 'scripts/modules/handoff/gates/multi-session-claim-gate.js'),
        'utf8'
      );
      expect(src).toMatch(/const ownerSdKeyMissing = !!ownerRow && !ownerRow\.sd_key/);
      expect(src).toMatch(/shouldReleaseStaleOwner\([^)]*ownerSdKeyMissing/);
    });
  });

  describe('createMultiSessionClaimGate', () => {
    it('should create a gate with correct name and properties', () => {
      const supabase = createMockSupabase({ ownerSessionId: null });
      const gate = createMultiSessionClaimGate(supabase, 'SD-TEST-001');

      expect(gate.name).toBe('GATE_MULTI_SESSION_CLAIM_CONFLICT');
      expect(gate.required).toBe(true);
      expect(gate.blocking).toBe(true);
      expect(typeof gate.validator).toBe('function');
      expect(gate.remediation).toContain('SD-TEST-001');
    });

    it('should execute validator and return results', async () => {
      const supabase = createMockSupabase({ ownerSessionId: null });
      const gate = createMultiSessionClaimGate(supabase, 'SD-TEST-001');

      const result = await gate.validator();

      expect(result.pass).toBe(true);
      expect(result.score).toBe(100);
    });
  });
});
