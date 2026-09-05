/**
 * SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-B (FR-B4): the census classifier is a pure function,
 * importable and unit-testable without touching Supabase or process.env -- unlike the
 * scripts/ci/audit-log-parity-check.mjs model it was based on, which builds its client at
 * module top level and is therefore only regex-testable.
 */
import { describe, it, expect } from 'vitest';
import { classifyBypassLedgerRows } from '../../../scripts/ci/bypass-ledger-handoff-join-check.mjs';

const NOW = '2026-09-05T12:00:00.000Z';
function minutesBefore(iso, m) {
  return new Date(new Date(iso).getTime() - m * 60000).toISOString();
}

describe('classifyBypassLedgerRows', () => {
  it('a row with handoff_id set is bucketed as joined', () => {
    const rows = [{ id: 'r1', created_at: NOW, handoff_id: 'h1', sd_id: 'sd-1', sd_key: 'SD-1' }];
    const buckets = classifyBypassLedgerRows(rows, {});
    expect(buckets.joined).toHaveLength(1);
    expect(buckets.refused_before_handoff).toHaveLength(0);
    expect(buckets.unjoined_defect).toHaveLength(0);
  });

  it('a row with no handoff_id and NO nearby sd_phase_handoffs row is refused_before_handoff (legitimate, not a violation)', () => {
    const rows = [{ id: 'r2', created_at: NOW, handoff_id: null, sd_id: 'sd-1', sd_key: 'SD-1' }];
    const buckets = classifyBypassLedgerRows(rows, {});
    expect(buckets.refused_before_handoff).toHaveLength(1);
    expect(buckets.unjoined_defect).toHaveLength(0);
  });

  it('a row with no handoff_id but a sd_phase_handoffs row DID exist nearby is unjoined_defect (a real bug)', () => {
    const rows = [{ id: 'r3', created_at: NOW, handoff_id: null, sd_id: 'sd-1', sd_key: 'SD-1' }];
    const handoffRowsBySdKey = { 'sd-1': [{ created_at: minutesBefore(NOW, 1) }] };
    const buckets = classifyBypassLedgerRows(rows, handoffRowsBySdKey);
    expect(buckets.unjoined_defect).toHaveLength(1);
    expect(buckets.refused_before_handoff).toHaveLength(0);
  });

  it('a sd_phase_handoffs row far outside the window does NOT count as nearby (still refused_before_handoff)', () => {
    const rows = [{ id: 'r4', created_at: NOW, handoff_id: null, sd_id: 'sd-1', sd_key: 'SD-1' }];
    const handoffRowsBySdKey = { 'sd-1': [{ created_at: minutesBefore(NOW, 30) }] };
    const buckets = classifyBypassLedgerRows(rows, handoffRowsBySdKey, { windowMs: 5 * 60000 });
    expect(buckets.refused_before_handoff).toHaveLength(1);
    expect(buckets.unjoined_defect).toHaveLength(0);
  });

  it('falls back to sd_key when sd_id has no entry', () => {
    const rows = [{ id: 'r5', created_at: NOW, handoff_id: null, sd_id: null, sd_key: 'SD-KEY-1' }];
    const handoffRowsBySdKey = { 'SD-KEY-1': [{ created_at: minutesBefore(NOW, 1) }] };
    const buckets = classifyBypassLedgerRows(rows, handoffRowsBySdKey);
    expect(buckets.unjoined_defect).toHaveLength(1);
  });

  it('a mixed batch classifies each row independently', () => {
    const rows = [
      { id: 'joined-1', created_at: NOW, handoff_id: 'h1', sd_id: 'sd-a', sd_key: 'SD-A' },
      { id: 'refused-1', created_at: NOW, handoff_id: null, sd_id: 'sd-b', sd_key: 'SD-B' },
      { id: 'defect-1', created_at: NOW, handoff_id: null, sd_id: 'sd-c', sd_key: 'SD-C' },
    ];
    const handoffRowsBySdKey = { 'sd-c': [{ created_at: minutesBefore(NOW, 2) }] };
    const buckets = classifyBypassLedgerRows(rows, handoffRowsBySdKey);
    expect(buckets.joined.map((r) => r.id)).toEqual(['joined-1']);
    expect(buckets.refused_before_handoff.map((r) => r.id)).toEqual(['refused-1']);
    expect(buckets.unjoined_defect.map((r) => r.id)).toEqual(['defect-1']);
  });
});
