/**
 * SD-LEO-INFRA-PARKED-CHAIRMAN-SMS-001 — TS-4: the audit runner (scripts/audit-parked-chairman-sms.mjs),
 * exercised against fully injected fake deps. No live DB.
 */
import { describe, it, expect } from 'vitest';
import { runAudit } from '../../scripts/audit-parked-chairman-sms.mjs';

function makeDeps({ rows, logRows = [], dryRun = false } = {}) {
  const inserted = [];
  const resolved = [];
  return {
    dryRun,
    onLog: () => {},
    fetchParkedRows: async () => rows,
    fetchInboundLogRows: async () => logRows,
    insertFeedback: async (row, disposition, evidence) => { inserted.push({ row, disposition, evidence }); },
    resolveRow: async (id) => { resolved.push(id); return { resolved: true }; },
    _inserted: inserted,
    _resolved: resolved,
  };
}

const ROWS = [
  { id: 'r1', from_phone: '+15551234567', body_raw: 'YES', parked_at: '2026-08-15T12:00:00.000Z' },
  { id: 'r2', from_phone: '+15559876543', body_raw: 'status?', parked_at: '2026-08-16T09:00:00.000Z' },
];

describe('runAudit — TS-4', () => {
  it('processes every fetched row exactly once: one feedback insert + one resolve each', async () => {
    const deps = makeDeps({ rows: ROWS, logRows: [] });
    const summary = await runAudit(deps);
    expect(summary.total).toBe(2);
    expect(deps._inserted).toHaveLength(2);
    expect(deps._resolved).toEqual(['r1', 'r2']);
  });

  it('classifies via evidence and reports accurate counts', async () => {
    const logRows = [{ id: 'log1', from_phone: '+15551234567', outcome: 'answered', created_at: '2026-08-15T13:00:00.000Z' }];
    const deps = makeDeps({ rows: ROWS, logRows });
    const summary = await runAudit(deps);
    expect(summary.evidenceHandled).toBe(1);
    expect(summary.needsReview).toBe(1);
    expect(deps._inserted.find((i) => i.row.id === 'r1').disposition).toBe('EVIDENCE_HANDLED');
    expect(deps._inserted.find((i) => i.row.id === 'r2').disposition).toBe('NEEDS_ADAM_REVIEW');
  });

  it('dry-run writes nothing but still returns accurate counts', async () => {
    const deps = makeDeps({ rows: ROWS, dryRun: true });
    const summary = await runAudit(deps);
    expect(summary.total).toBe(2);
    expect(deps._inserted).toHaveLength(0);
    expect(deps._resolved).toHaveLength(0);
  });

  it('an empty backlog is a no-op', async () => {
    const deps = makeDeps({ rows: [] });
    const summary = await runAudit(deps);
    expect(summary).toEqual({ total: 0, evidenceHandled: 0, needsReview: 0 });
    expect(deps._inserted).toHaveLength(0);
  });
});
