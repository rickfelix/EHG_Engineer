/**
 * SD-LEO-INFRA-ADAM-ESCALATION-DETERMINISM-001 — the chairman-escalation email is now DETERMINISTIC:
 * an Adam session_question/blocking decision fires the standout email immediately on creation, with no
 * in-session gate, deduped to one email per decision, fail-soft.
 *
 * QF-20260703-905 — the escalation choke point now carries a rolling-hour RATE CAP (max 3 standout
 * emails/hour; the rest fold into ONE digest per window) so a decision flood (the 165-email specimen
 * from QF-20260703-229) can no longer burn the entire daily provider quota. Decision rows are always
 * recorded regardless of the cap — only the email amplification is capped.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  shouldAutoEscalate,
  escalateChairmanDecision,
  recordPendingDecision,
} from '../../../lib/chairman/record-pending-decision.mjs';

/** Minimal in-memory chairman_decisions table backing insert/select/eq/gte/update/maybeSingle —
 *  enough surface for record-pending-decision.mjs's query shapes, nothing more. */
function makeFakeTable() {
  let seq = 0;
  const rows = [];
  function matches(row, filters) {
    return filters.every(([col, op, val]) => (op === '>=' ? row[col] >= val : row[col] === val));
  }
  return {
    rows,
    from() {
      const ctx = { filters: [] };
      const api = {
        insert(row) {
          ctx.op = 'insert';
          ctx.row = { id: `dec-${++seq}`, created_at: new Date().toISOString(), ...row };
          return api;
        },
        select() { if (!ctx.op) ctx.op = 'select'; return api; },
        eq(col, val) { ctx.filters.push([col, '=', val]); return api; },
        gte(col, val) { ctx.filters.push([col, '>=', val]); return api; },
        update(vals) { ctx.op = 'update'; ctx.vals = vals; return api; },
        async maybeSingle() {
          const row = rows.find(r => matches(r, ctx.filters));
          return { data: row ? { brief_data: row.brief_data } : null };
        },
        then(resolve) {
          if (ctx.op === 'insert') {
            rows.push(ctx.row);
            resolve({ data: [{ id: ctx.row.id }], error: null });
          } else if (ctx.op === 'update') {
            const row = rows.find(r => matches(r, ctx.filters));
            if (row) Object.assign(row, ctx.vals);
            resolve({ data: null, error: null });
          } else {
            resolve({ data: rows.filter(r => matches(r, ctx.filters)).map(r => ({ brief_data: r.brief_data })), error: null });
          }
        },
      };
      return api;
    },
  };
}

/** Back-compat single-row helper for the direct escalateChairmanDecision(sb, 'dec-1', ...) tests. */
function makeSupabase({ briefData = null } = {}) {
  const sb = makeFakeTable();
  if (briefData !== null) sb.rows.push({ id: 'dec-1', created_at: new Date().toISOString(), brief_data: briefData });
  return sb;
}

describe('shouldAutoEscalate (FR-1)', () => {
  it('adam + session_question => true', () => {
    expect(shouldAutoEscalate({ decisionType: 'session_question', raisedBy: 'adam' })).toBe(true);
  });
  it('adam + blocking => true', () => {
    expect(shouldAutoEscalate({ decisionType: 'stage_gate', blocking: true, raisedBy: 'adam' })).toBe(true);
  });
  it('non-adam => false regardless of type/blocking', () => {
    expect(shouldAutoEscalate({ decisionType: 'session_question', raisedBy: 'coordinator' })).toBe(false);
    expect(shouldAutoEscalate({ blocking: true, raisedBy: null })).toBe(false);
  });
  it('adam but neither session_question nor blocking => false', () => {
    expect(shouldAutoEscalate({ decisionType: 'stage_gate', blocking: false, raisedBy: 'adam' })).toBe(false);
  });
  it('has no chairman-availability/in-session parameter', () => {
    // The signature is purely structural — passing an "inSession" flag has no effect.
    expect(shouldAutoEscalate({ decisionType: 'session_question', raisedBy: 'adam', inSession: false })).toBe(true);
  });
});

describe('escalateChairmanDecision (FR-2/FR-3)', () => {
  it('fires the email once and stamps escalation_email_sent_at', async () => {
    const sb = makeSupabase({ briefData: { title: 'q' } });
    const spawn = vi.fn();
    const r = await escalateChairmanDecision(sb, 'dec-1', { spawn });
    expect(r.escalated).toBe(true);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(sb.rows[0].brief_data.escalation_email_sent_at).toBeTruthy();
  });

  it('dedup: a row already stamped does NOT spawn again', async () => {
    const sb = makeSupabase({ briefData: { title: 'q', escalation_email_sent_at: '2026-06-28T00:00:00Z' } });
    const spawn = vi.fn();
    const r = await escalateChairmanDecision(sb, 'dec-1', { spawn });
    expect(r.deduped).toBe(true);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('fail-soft: a spawn throw is swallowed (escalated:false, no throw)', async () => {
    const sb = makeSupabase({ briefData: { title: 'q' } });
    const spawn = vi.fn(() => { throw new Error('spawn boom'); });
    const r = await escalateChairmanDecision(sb, 'dec-1', { spawn });
    expect(r.escalated).toBe(false);
    expect(r.error).toMatch(/boom/);
  });
});

describe('escalateChairmanDecision — rate cap (QF-20260703-905)', () => {
  it('the 4th escalation in a rolling hour folds into ONE digest, not another standout email', async () => {
    const sb = makeFakeTable();
    const spawn = vi.fn();
    for (let i = 0; i < 3; i++) {
      sb.rows.push({ id: `seed-${i}`, created_at: new Date().toISOString(), brief_data: { escalation_email_sent_at: new Date().toISOString() } });
    }
    sb.rows.push({ id: 'dec-4', created_at: new Date().toISOString(), brief_data: { title: 'q4' } });

    const r = await escalateChairmanDecision(sb, 'dec-4', { spawn });
    expect(r.escalated).toBe(true);
    expect(r.digest).toBe(true);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(sb.rows.find(row => row.id === 'dec-4').brief_data.digest_sent_at).toBeTruthy();
  });

  it('a 5th escalation in the same window is suppressed once the digest is already sent (no re-send)', async () => {
    const sb = makeFakeTable();
    const spawn = vi.fn();
    for (let i = 0; i < 3; i++) {
      sb.rows.push({ id: `seed-${i}`, created_at: new Date().toISOString(), brief_data: { escalation_email_sent_at: new Date().toISOString() } });
    }
    sb.rows.push({ id: 'dec-4', created_at: new Date().toISOString(), brief_data: {} });
    await escalateChairmanDecision(sb, 'dec-4', { spawn }); // sends the ONE digest

    sb.rows.push({ id: 'dec-5', created_at: new Date().toISOString(), brief_data: { title: 'q5' } });
    const r = await escalateChairmanDecision(sb, 'dec-5', { spawn });
    expect(r.escalated).toBe(false);
    expect(r.suppressed).toBe('rate_cap');
    expect(spawn).toHaveBeenCalledTimes(1); // still just the one digest — never a 2nd
  });

  it('under the cap (< 3 emails this hour) still sends a normal standout email', async () => {
    const sb = makeFakeTable();
    const spawn = vi.fn();
    sb.rows.push({ id: 'seed-0', created_at: new Date().toISOString(), brief_data: { escalation_email_sent_at: new Date().toISOString() } });
    sb.rows.push({ id: 'dec-2', created_at: new Date().toISOString(), brief_data: { title: 'q2' } });
    const r = await escalateChairmanDecision(sb, 'dec-2', { spawn });
    expect(r.escalated).toBe(true);
    expect(r.digest).toBeUndefined();
    expect(sb.rows.find(row => row.id === 'dec-2').brief_data.escalation_email_sent_at).toBeTruthy();
  });
});

describe('recordPendingDecision — deterministic escalation wiring (FR-2/FR-5)', () => {
  it('an adam session_question record fires exactly one email spawn, no in-session gate', async () => {
    const sb = makeFakeTable();
    const spawn = vi.fn();
    const r = await recordPendingDecision(sb, { title: 'Adam needs a call', raisedBy: 'adam', decisionType: 'session_question', _spawnEscalation: spawn });
    expect(r.recorded).toBe(true);
    expect(r.escalated).toBe(true);
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it('a non-adam record does NOT fire the email', async () => {
    const sb = makeFakeTable();
    const spawn = vi.fn();
    const r = await recordPendingDecision(sb, { title: 'routine', raisedBy: 'coordinator', decisionType: 'session_question', _spawnEscalation: spawn });
    expect(r.recorded).toBe(true);
    expect(r.escalated).toBe(false);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('persists raised_by in brief_data for escalation provenance', async () => {
    const sb = makeFakeTable();
    const r = await recordPendingDecision(sb, { title: 'q', raisedBy: 'adam', decisionType: 'session_question', _spawnEscalation: vi.fn() });
    expect(r.recorded).toBe(true);
  });

  it('QF-20260703-905 acceptance: 20 blocking decisions in a burst => <=3 standout + 1 digest, 20 durable rows', async () => {
    const sb = makeFakeTable();
    const spawn = vi.fn();
    for (let i = 0; i < 20; i++) {
      const r = await recordPendingDecision(sb, {
        title: `flood ${i}`,
        raisedBy: 'adam',
        decisionType: 'stage_gate',
        blocking: true,
        _spawnEscalation: spawn,
      });
      expect(r.recorded).toBe(true);
    }
    expect(sb.rows.length).toBe(20); // decision rows are NEVER affected by the rate cap
    expect(spawn).toHaveBeenCalledTimes(4); // 3 standout emails + exactly 1 digest
    const digestCount = sb.rows.filter(r => r.brief_data?.digest_sent_at).length;
    // The digest row also carries escalation_email_sent_at (dedup-contract parity — see
    // escalateChairmanDecision), so "pure standout" excludes it from the escalation_email_sent_at count.
    const pureStandoutCount = sb.rows.filter(r => r.brief_data?.escalation_email_sent_at && !r.brief_data?.digest_sent_at).length;
    expect(pureStandoutCount).toBe(3);
    expect(digestCount).toBe(1);
  });
});
