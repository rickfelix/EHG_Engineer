/**
 * Layer 3 — Reader queries tests (5 tests)
 *
 *   1. getEventsByCorrelationId returns chronological order
 *   2. getEventsByVenture filters by venture_id
 *   3. getRecentBySeverity rejects invalid severity
 *   4. getRecentBySeverity returns recent rows for valid severity
 *   5. formatForensicChain produces readable text representation
 *
 * SD-LEO-INFRA-DEDICATED-SECURITY-AUDIT-001
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  getEventsByCorrelationId,
  getEventsByVenture,
  getRecentBySeverity,
  formatForensicChain
} from '../../../lib/security/audit-events-reader.js';
import { writeAuditEvent } from '../../../lib/security/audit-events-emitter.js';
import {
  createServiceClient,
  HAS_REAL_DB,
  uniqueSourceAgent,
  validPayloadFor
} from './_helpers.js';

describe('Layer 3: reader queries', () => {
  // -------- formatForensicChain (pure) --------

  it('3.5 — formatForensicChain produces readable text representation', () => {
    const events = [
      {
        occurred_at: '2026-05-08T00:00:00Z',
        severity: 'tier3',
        event_type: 'port_isol_violation',
        taxonomy_class: null,
        source_agent: 'agent-a',
        pat_pattern_id: 'PAT-PORT-ISOL-001',
        integrity_hash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
      },
      {
        occurred_at: '2026-05-08T00:01:00Z',
        severity: 'critical',
        event_type: 'fail_closed_error',
        taxonomy_class: 'permanent',
        source_agent: 'agent-b',
        pat_pattern_id: null,
        integrity_hash: '1111111111111111111111111111111111111111111111111111111111111111'
      }
    ];

    const out = formatForensicChain(events);
    expect(typeof out).toBe('string');
    expect(out).toContain('TIER3');
    expect(out).toContain('port_isol_violation');
    expect(out).toContain('PAT-PORT-ISOL-001');
    expect(out).toContain('CRITICAL');
    expect(out).toContain('(permanent)');
    expect(out).toContain('integrity=abcdef123456...');
    // Empty case
    expect(formatForensicChain([])).toBe('No events.');
    expect(formatForensicChain(null)).toBe('No events.');
  });

  // -------- live DB tests --------

  describe.skipIf(!HAS_REAL_DB)('reader (live DB)', () => {
    let supabase;
    let testCorrelationId;
    let testVentureId;

    beforeAll(async () => {
      supabase = createServiceClient();
      testCorrelationId = randomUUID();

      // Find a real venture to associate with venture-scoped read test
      const { data: venture } = await supabase
        .from('ventures')
        .select('id')
        .limit(1)
        .single();
      testVentureId = venture?.id || null;

      // Seed 3 events for the same correlation_id at distinct timestamps
      const baseTime = Date.now();
      for (let i = 0; i < 3; i++) {
        await writeAuditEvent({
          supabase,
          event_type: 'capability_suppression',
          severity: 'warning',
          source_agent: uniqueSourceAgent('layer3-corr'),
          correlation_id: testCorrelationId,
          venture_id: testVentureId,
          occurred_at: new Date(baseTime + i * 1000).toISOString(),
          event_payload: validPayloadFor('capability_suppression')
        });
      }
    });

    it('3.1 — getEventsByCorrelationId returns chronological order (asc)', async () => {
      const events = await getEventsByCorrelationId(supabase, testCorrelationId);
      expect(events.length).toBeGreaterThanOrEqual(3);
      // Confirm ascending order on occurred_at
      for (let i = 1; i < events.length; i++) {
        expect(new Date(events[i].occurred_at).getTime()).toBeGreaterThanOrEqual(
          new Date(events[i - 1].occurred_at).getTime()
        );
      }
    });

    it('3.2 — getEventsByVenture filters by venture_id', async () => {
      if (!testVentureId) {
        // No venture available — skip via assertion that exercises the validation path
        await expect(getEventsByVenture(supabase, null)).rejects.toThrow(/ventureId required/);
        return;
      }
      const events = await getEventsByVenture(supabase, testVentureId, { limit: 50 });
      expect(Array.isArray(events)).toBe(true);
      // All returned rows must be the requested venture
      for (const ev of events) {
        expect(ev.venture_id).toBe(testVentureId);
      }
    });

    it('3.3 — getRecentBySeverity rejects invalid severity', async () => {
      await expect(getRecentBySeverity(supabase, 'NOT_REAL')).rejects.toThrow(/Invalid severity/);
    });

    it('3.4 — getRecentBySeverity returns recent rows for valid severity', async () => {
      // Seed one warning event so the result is non-empty
      await writeAuditEvent({
        supabase,
        event_type: 'capability_suppression',
        severity: 'warning',
        source_agent: uniqueSourceAgent('layer3-sev'),
        event_payload: validPayloadFor('capability_suppression')
      });

      const events = await getRecentBySeverity(supabase, 'warning', { limit: 10 });
      expect(Array.isArray(events)).toBe(true);
      // Every returned row must have severity 'warning'
      for (const ev of events) {
        expect(ev.severity).toBe('warning');
      }
    });
  });
});
