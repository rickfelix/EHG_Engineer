/**
 * Layer 2 — Writer hooks tests (12 tests)
 *
 *   1. validateAuditEvent rejects invalid event_type
 *   2. validateAuditEvent rejects invalid severity
 *   3. validateAuditEvent rejects fail_closed_error without taxonomy_class
 *   4. validateAuditEvent rejects missing source_agent
 *   5. validateAuditEvent rejects nfkd_collision missing required payload fields
 *   6. validateAuditEvent passes valid nfkd_collision
 *   7. computeIntegrityHash produces stable 64-char hex
 *   8. computeIntegrityHash differs when payload changes
 *   9. writeAuditEvent inserts row with correct fields (service-role)
 *  10. writeAuditEvent generates correlation_id when not supplied
 *  11. writeAuditEvent throws on insert error (mock supabase to fail)
 *  12. writeAuditEvent computes integrity_hash matching independent SHA-256
 *
 * SD-LEO-INFRA-DEDICATED-SECURITY-AUDIT-001
 */
import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'node:crypto';
import {
  validateAuditEvent,
  writeAuditEvent,
  computeIntegrityHash
} from '../../../lib/security/audit-events-emitter.js';
import {
  createServiceClient,
  HAS_REAL_DB,
  uniqueSourceAgent,
  validPayloadFor
} from './_helpers.js';

describe('Layer 2: writer hooks (validation + hashing)', () => {
  // -------- validateAuditEvent (pure unit tests; no DB) --------

  it('2.1 — validateAuditEvent rejects invalid event_type', () => {
    expect(() =>
      validateAuditEvent({
        event_type: 'not_a_real_type',
        severity: 'info',
        source_agent: 'agent-x',
        event_payload: {}
      })
    ).toThrow(/Invalid event_type/);
  });

  it('2.2 — validateAuditEvent rejects invalid severity', () => {
    expect(() =>
      validateAuditEvent({
        event_type: 'nfkd_collision',
        severity: 'NOT_A_SEVERITY',
        source_agent: 'agent-x',
        event_payload: validPayloadFor('nfkd_collision')
      })
    ).toThrow(/Invalid severity/);
  });

  it('2.3 — validateAuditEvent rejects fail_closed_error without taxonomy_class', () => {
    expect(() =>
      validateAuditEvent({
        event_type: 'fail_closed_error',
        severity: 'critical',
        source_agent: 'agent-x',
        event_payload: validPayloadFor('fail_closed_error')
        // taxonomy_class missing
      })
    ).toThrow(/fail_closed_error requires taxonomy_class/);
  });

  it('2.4 — validateAuditEvent rejects missing source_agent', () => {
    expect(() =>
      validateAuditEvent({
        event_type: 'nfkd_collision',
        severity: 'info',
        // source_agent missing
        event_payload: validPayloadFor('nfkd_collision')
      })
    ).toThrow(/source_agent is required/);
  });

  it('2.5 — validateAuditEvent rejects nfkd_collision missing required payload fields', () => {
    expect(() =>
      validateAuditEvent({
        event_type: 'nfkd_collision',
        severity: 'info',
        source_agent: 'agent-x',
        event_payload: { attempted_name: 'CafeAI' } // missing normalized_key, candidates
      })
    ).toThrow(/Missing required payload field/);
  });

  it('2.6 — validateAuditEvent passes valid nfkd_collision', () => {
    expect(() =>
      validateAuditEvent({
        event_type: 'nfkd_collision',
        severity: 'info',
        source_agent: 'agent-x',
        event_payload: validPayloadFor('nfkd_collision')
      })
    ).not.toThrow();
  });

  // -------- computeIntegrityHash (pure) --------

  it('2.7 — computeIntegrityHash produces stable 64-char hex', () => {
    const input = {
      event_type: 'nfkd_collision',
      severity: 'info',
      occurred_at: '2026-05-08T00:00:00Z',
      source_agent: 'agent-x',
      venture_id: null,
      sd_id: null,
      event_payload: { attempted_name: 'A', normalized_key: 'a', candidates: ['A'] }
    };
    const hash1 = computeIntegrityHash(input);
    const hash2 = computeIntegrityHash(input);
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('2.8 — computeIntegrityHash differs when payload changes', () => {
    const base = {
      event_type: 'nfkd_collision',
      severity: 'info',
      occurred_at: '2026-05-08T00:00:00Z',
      source_agent: 'agent-x',
      venture_id: null,
      sd_id: null,
      event_payload: { attempted_name: 'A', normalized_key: 'a', candidates: ['A'] }
    };
    const altered = {
      ...base,
      event_payload: { attempted_name: 'B', normalized_key: 'b', candidates: ['B'] }
    };
    expect(computeIntegrityHash(base)).not.toBe(computeIntegrityHash(altered));
  });

  // -------- writeAuditEvent (live DB; service_role) --------

  describe.skipIf(!HAS_REAL_DB)('writeAuditEvent (live DB)', () => {
    let supabase;

    beforeAll(() => {
      supabase = createServiceClient();
    });

    it('2.9 — writeAuditEvent inserts row with correct fields', async () => {
      const sourceAgent = uniqueSourceAgent('layer2-09');
      const result = await writeAuditEvent({
        supabase,
        event_type: 'nfkd_collision',
        severity: 'info',
        source_agent: sourceAgent,
        event_payload: validPayloadFor('nfkd_collision')
      });

      expect(result?.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(result?.occurred_at).toBeTruthy();
      expect(result?.correlation_id).toMatch(/^[0-9a-f-]{36}$/);
      expect(result?.integrity_hash).toMatch(/^[a-f0-9]{64}$/);

      // Verify the row landed by reading it back.
      const { data: rows } = await supabase
        .from('security_audit_events')
        .select('id, event_type, severity, source_agent')
        .eq('source_agent', sourceAgent);

      expect(Array.isArray(rows)).toBe(true);
      expect(rows.length).toBe(1);
      expect(rows[0].event_type).toBe('nfkd_collision');
    });

    it('2.10 — writeAuditEvent generates correlation_id when not supplied', async () => {
      const sourceAgent = uniqueSourceAgent('layer2-10');
      const result = await writeAuditEvent({
        supabase,
        event_type: 'capability_suppression',
        severity: 'warning',
        source_agent: sourceAgent,
        event_payload: validPayloadFor('capability_suppression')
        // correlation_id NOT supplied
      });
      expect(result?.correlation_id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('2.11 — writeAuditEvent throws on insert error (mocked supabase)', async () => {
      // Mock a supabase client whose insert chain returns an error.
      const mockSupabase = {
        from: () => ({
          insert: () => ({
            select: () => ({
              single: async () => ({
                data: null,
                error: { message: 'simulated insert failure', code: '23505' }
              })
            })
          })
        })
      };

      await expect(
        writeAuditEvent({
          supabase: mockSupabase,
          event_type: 'nfkd_collision',
          severity: 'info',
          source_agent: 'mock-agent',
          event_payload: validPayloadFor('nfkd_collision')
        })
      ).rejects.toThrow(/writeAuditEvent failed: simulated insert failure/);
    });

    it('2.12 — writeAuditEvent integrity_hash matches independent SHA-256', async () => {
      const sourceAgent = uniqueSourceAgent('layer2-12');
      const occurredAt = new Date().toISOString();
      const payload = validPayloadFor('port_isol_violation');

      const result = await writeAuditEvent({
        supabase,
        event_type: 'port_isol_violation',
        severity: 'tier3',
        source_agent: sourceAgent,
        occurred_at: occurredAt,
        event_payload: payload
      });

      const expectedHash = crypto
        .createHash('sha256')
        .update(JSON.stringify({
          event_type: 'port_isol_violation',
          severity: 'tier3',
          occurred_at: occurredAt,
          source_agent: sourceAgent,
          venture_id: null,
          sd_id: null,
          event_payload: payload
        }))
        .digest('hex');

      expect(result.integrity_hash).toBe(expectedHash);
    });
  });
});
