/**
 * SD-LEO-INFRA-CHAIRMAN-GATED-SD-DECISION-ROW-GUARD-001 — TS-5.
 * Real recordPendingDecision (not mocked) against a fake chairman_decisions table, proving the
 * EXISTING QF-20260703-905 rate cap degrades a 5-hit tick into 3 standout + 1 digest + 1
 * suppressed-and-self-healing, NOT "remainder folds into one digest" (traced against
 * record-pending-decision.mjs:186-221 during PLAN-phase review, evidence 98da9ade).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../lib/comms/adam-outbound/quiet-hours-extension.js', () => ({
  resolveChairmanZone: vi.fn(async () => ({ zone: 'America/New_York', source: 'default' })),
}));
vi.mock('../../../lib/comms/adam-outbound/chairman-sms-gate/index.js', () => ({
  sendChairmanSMS: vi.fn(async () => ({ sent: true })),
}));

import { recordPendingDecision } from '../../../lib/chairman/record-pending-decision.mjs';
import { buildDecisionEnvelope } from '../../../lib/chairman/chairman-gated-decision-row-guard.mjs';

function getCell(row, col) {
  const m = /^brief_data->>(.+)$/.exec(col);
  if (m) return row.brief_data ? row.brief_data[m[1]] : undefined;
  return row[col];
}
function rowMatches(row, filters) {
  return filters.every(([col, op, val]) => {
    const cell = getCell(row, col);
    if (op === '>=') return cell != null && cell >= val;
    if (op === 'is') return val === null ? (cell == null) : (cell === val);
    return cell === val;
  });
}

function makeFakeChairmanDecisionsTable() {
  let seq = 0;
  const rows = [];
  return {
    rows,
    from() {
      const ctx = { filters: [], selected: false };
      const api = {
        insert(row) {
          ctx.op = 'insert';
          ctx.row = { id: `dec-${++seq}`, created_at: new Date().toISOString(), ...row };
          return api;
        },
        select() { if (!ctx.op) ctx.op = 'select'; ctx.selected = true; return api; },
        eq(col, val) { ctx.filters.push([col, '=', val]); return api; },
        gte(col, val) { ctx.filters.push([col, '>=', val]); return api; },
        is(col, val) { ctx.filters.push([col, 'is', val]); return api; },
        update(vals) { ctx.op = 'update'; ctx.vals = vals; return api; },
        async maybeSingle() {
          const row = rows.find((r) => rowMatches(r, ctx.filters));
          return { data: row ? { brief_data: row.brief_data } : null, error: null };
        },
        then(resolve) {
          if (ctx.op === 'insert') {
            rows.push(ctx.row);
            resolve({ data: [{ id: ctx.row.id }], error: null });
          } else if (ctx.op === 'update') {
            const matched = rows.filter((r) => rowMatches(r, ctx.filters));
            matched.forEach((r) => Object.assign(r, ctx.vals));
            resolve({ data: ctx.selected ? matched.map((r) => ({ id: r.id })) : null, error: null });
          } else {
            resolve({ data: rows.filter((r) => rowMatches(r, ctx.filters)).map((r) => ({ id: r.id, brief_data: r.brief_data })), error: null });
          }
        },
      };
      return api;
    },
  };
}

describe('TS-5: five eligible hits in one tick exercise the existing rate cap and its self-healing degradation', () => {
  it('rows 1-3 get standout emails, row 4 becomes the digest, row 5 is rate-capped with NO stamp (self-healing hook for the SLA sweep)', async () => {
    const sb = makeFakeChairmanDecisionsTable();
    const results = [];
    for (let i = 0; i < 5; i++) {
      const sd = { sd_key: `SD-BURST-00${i + 1}`, created_at: new Date(Date.now() - 30 * 3600000).toISOString(), metadata: {} };
      const envelope = buildDecisionEnvelope(sd);
      // _quietWindow pinned false: the real isWithinChairmanQuietWindow reads the actual wall
      // clock, which would make this test flaky ~6h/day (the exact TS-1 residual testing-agent
      // flagged). _spawnEscalation stubbed to avoid a real child_process.spawn in tests.
      // eslint-disable-next-line no-await-in-loop -- sequential inserts are the point: the rate
      // cap's rolling-hour count must observe each PRIOR insert before the next one runs.
      const result = await recordPendingDecision(sb, { ...envelope, _quietWindow: () => false, _spawnEscalation: () => {} });
      results.push(result);
    }

    expect(results.every((r) => r.recorded)).toBe(true); // decision rows are ALWAYS recorded (QF-20260703-905 invariant)
    expect(results.every((r, i) => sb.rows[i].decision_type === 'session_question' && sb.rows[i].blocking === true)).toBe(true);

    // The digest row ALSO carries escalation_email_sent_at (it IS an email, just the one
    // window-digest instead of a standout) — "standout" means the marker WITHOUT digest_sent_at.
    const withStandoutEmail = sb.rows.filter((r) => r.brief_data?.escalation_email_sent_at && !r.brief_data?.digest_sent_at).length;
    const withDigest = sb.rows.filter((r) => r.brief_data?.digest_sent_at).length;
    const withNeither = sb.rows.filter((r) => !r.brief_data?.escalation_email_sent_at && !r.brief_data?.digest_sent_at).length;

    expect(withStandoutEmail).toBe(3);
    expect(withDigest).toBe(1);
    expect(withNeither).toBe(1); // row 5: suppressed, unstamped — selectBlockingSweepRows will pick it up next sweep (TS-10 proves this compatibility directly)
  });
});
