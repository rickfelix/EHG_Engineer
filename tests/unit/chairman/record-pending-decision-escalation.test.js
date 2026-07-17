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

/** Resolve a filter column that may be a `brief_data->>key` JSONB path (SD-LEO-INFRA-CHAIRMAN-DECISION-EMAIL-001
 *  FR-1 send-time rate cap + FR-2 CAS) or a plain top-level column. */
function getCell(row, col) {
  const m = /^brief_data->>(.+)$/.exec(col);
  if (m) return row.brief_data ? row.brief_data[m[1]] : undefined;
  return row[col];
}
function rowMatches(row, filters) {
  return filters.every(([col, op, val]) => {
    const cell = getCell(row, col);
    if (op === '>=') return cell != null && cell >= val;            // .gte (ISO-Zulu lexicographic)
    if (op === 'is') return val === null ? (cell == null) : (cell === val); // .is(path, null) — CAS predicate
    return cell === val;                                            // .eq
  });
}

/** In-memory chairman_decisions table. Supports the query shapes record-pending-decision.mjs uses:
 *  insert / select / eq / gte(brief_data->>marker) / is(brief_data->>marker, null) [CAS] /
 *  update(...).select('id') [conditional-UPDATE RETURNING] / maybeSingle. */
function makeFakeTable({ updateError = null } = {}) {
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
          const row = rows.find(r => rowMatches(r, ctx.filters));
          return { data: row ? { brief_data: row.brief_data } : null, error: null };
        },
        then(resolve) {
          if (ctx.op === 'insert') {
            rows.push(ctx.row);
            resolve({ data: [{ id: ctx.row.id }], error: null });
          } else if (ctx.op === 'update') {
            if (updateError) { resolve({ data: null, error: { message: updateError } }); return; }
            // CAS: only rows matching ALL filters (id + marker-is-null) are updated + returned.
            const matched = rows.filter(r => rowMatches(r, ctx.filters));
            matched.forEach(r => Object.assign(r, ctx.vals));
            resolve({ data: ctx.selected ? matched.map(r => ({ id: r.id })) : null, error: null });
          } else {
            resolve({ data: rows.filter(r => rowMatches(r, ctx.filters)).map(r => ({ id: r.id, brief_data: r.brief_data })), error: null });
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

describe('shouldAutoEscalate (FR-1, widened by SD-LEO-INFRA-CHAIRMAN-DECISION-SURFACING-001)', () => {
  it('adam + session_question => true', () => {
    expect(shouldAutoEscalate({ decisionType: 'session_question', raisedBy: 'adam' })).toBe(true);
  });
  it('adam + blocking => true', () => {
    expect(shouldAutoEscalate({ decisionType: 'stage_gate', blocking: true, raisedBy: 'adam' })).toBe(true);
  });
  it('blocking => true for ANY raiser — no raiser bypass', () => {
    expect(shouldAutoEscalate({ decisionType: 'stage_gate', blocking: true, raisedBy: 'stage_gate' })).toBe(true);
    expect(shouldAutoEscalate({ decisionType: 'gate_decision', blocking: true, raisedBy: 'coordinator' })).toBe(true);
    expect(shouldAutoEscalate({ blocking: true, raisedBy: null })).toBe(true);
    expect(shouldAutoEscalate({ blocking: true })).toBe(true); // raisedBy omitted entirely
  });
  it('non-adam non-blocking => false (non-blocking rows escalate only via the adam session_question path)', () => {
    expect(shouldAutoEscalate({ decisionType: 'session_question', raisedBy: 'coordinator' })).toBe(false);
    expect(shouldAutoEscalate({ decisionType: 'stage_gate', blocking: false, raisedBy: 'stage_gate' })).toBe(false);
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
    const r = await escalateChairmanDecision(sb, 'dec-1', { spawn, quietWindow: () => false });
    expect(r.escalated).toBe(true);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(sb.rows[0].brief_data.escalation_email_sent_at).toBeTruthy();
  });

  it('dedup: a row already stamped does NOT spawn again', async () => {
    const sb = makeSupabase({ briefData: { title: 'q', escalation_email_sent_at: '2026-06-28T00:00:00Z' } });
    const spawn = vi.fn();
    const r = await escalateChairmanDecision(sb, 'dec-1', { spawn, quietWindow: () => false });
    expect(r.deduped).toBe(true);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('fail-soft: a spawn throw is swallowed (escalated:false, no throw)', async () => {
    const sb = makeSupabase({ briefData: { title: 'q' } });
    const spawn = vi.fn(() => { throw new Error('spawn boom'); });
    const r = await escalateChairmanDecision(sb, 'dec-1', { spawn, quietWindow: () => false });
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

    const r = await escalateChairmanDecision(sb, 'dec-4', { spawn, quietWindow: () => false });
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
    await escalateChairmanDecision(sb, 'dec-4', { spawn, quietWindow: () => false }); // sends the ONE digest

    sb.rows.push({ id: 'dec-5', created_at: new Date().toISOString(), brief_data: { title: 'q5' } });
    const r = await escalateChairmanDecision(sb, 'dec-5', { spawn, quietWindow: () => false });
    expect(r.escalated).toBe(false);
    expect(r.suppressed).toBe('rate_cap');
    expect(spawn).toHaveBeenCalledTimes(1); // still just the one digest — never a 2nd
  });

  it('under the cap (< 3 emails this hour) still sends a normal standout email', async () => {
    const sb = makeFakeTable();
    const spawn = vi.fn();
    sb.rows.push({ id: 'seed-0', created_at: new Date().toISOString(), brief_data: { escalation_email_sent_at: new Date().toISOString() } });
    sb.rows.push({ id: 'dec-2', created_at: new Date().toISOString(), brief_data: { title: 'q2' } });
    const r = await escalateChairmanDecision(sb, 'dec-2', { spawn, quietWindow: () => false });
    expect(r.escalated).toBe(true);
    expect(r.digest).toBeUndefined();
    expect(sb.rows.find(row => row.id === 'dec-2').brief_data.escalation_email_sent_at).toBeTruthy();
  });
});

describe('escalateChairmanDecision — quiet-window race fix (SD-LEO-INFRA-CHAIRMAN-DECISION-SURFACING-001 FR-3)', () => {
  it('inside the quiet window: neither stamps escalation_email_sent_at nor spawns', async () => {
    const sb = makeSupabase({ briefData: { title: 'q' } });
    const spawn = vi.fn();
    const r = await escalateChairmanDecision(sb, 'dec-1', { spawn, quietWindow: () => true });
    expect(r.escalated).toBe(false);
    expect(r.suppressed).toBe('quiet_window');
    expect(spawn).not.toHaveBeenCalled();
    expect(sb.rows[0].brief_data.escalation_email_sent_at).toBeUndefined(); // row stays eligible for the sweep retry
  });

  it('outside the quiet window: stamps + spawns exactly once; a second call is deduped', async () => {
    const sb = makeSupabase({ briefData: { title: 'q' } });
    const spawn = vi.fn();
    const r1 = await escalateChairmanDecision(sb, 'dec-1', { spawn, quietWindow: () => false });
    expect(r1.escalated).toBe(true);
    expect(sb.rows[0].brief_data.escalation_email_sent_at).toBeTruthy();
    const r2 = await escalateChairmanDecision(sb, 'dec-1', { spawn, quietWindow: () => false });
    expect(r2.deduped).toBe(true);
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it('quiet-window suppression happens BEFORE the rate-cap read, so it never counts against the cap', async () => {
    const sb = makeSupabase({ briefData: { title: 'q' } });
    const spawn = vi.fn();
    await escalateChairmanDecision(sb, 'dec-1', { spawn, quietWindow: () => true });
    // Marker absent => a later out-of-window escalation still sends the standout email.
    const r = await escalateChairmanDecision(sb, 'dec-1', { spawn, quietWindow: () => false });
    expect(r.escalated).toBe(true);
    expect(spawn).toHaveBeenCalledTimes(1);
  });
});

describe('recordPendingDecision — deterministic escalation wiring (FR-2/FR-5)', () => {
  it('an adam session_question record fires exactly one email spawn, no in-session gate', async () => {
    const sb = makeFakeTable();
    const spawn = vi.fn();
    const r = await recordPendingDecision(sb, { title: 'Adam needs a call', raisedBy: 'adam', decisionType: 'session_question', _spawnEscalation: spawn, _quietWindow: () => false });
    expect(r.recorded).toBe(true);
    expect(r.escalated).toBe(true);
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it('a non-adam NON-BLOCKING record does NOT fire the email', async () => {
    const sb = makeFakeTable();
    const spawn = vi.fn();
    const r = await recordPendingDecision(sb, { title: 'routine', raisedBy: 'coordinator', decisionType: 'session_question', _spawnEscalation: spawn, _quietWindow: () => false });
    expect(r.recorded).toBe(true);
    expect(r.escalated).toBe(false);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('a BLOCKING record fires the email regardless of raiser — no raiser bypass (SD-LEO-INFRA-CHAIRMAN-DECISION-SURFACING-001 FR-1)', async () => {
    for (const raisedBy of ['stage_gate', 'coordinator', undefined]) {
      const sb = makeFakeTable();
      const spawn = vi.fn();
      const r = await recordPendingDecision(sb, { title: 'venture paused behind gate', raisedBy, decisionType: 'stage_gate', blocking: true, _spawnEscalation: spawn, _quietWindow: () => false });
      expect(r.recorded).toBe(true);
      expect(r.escalated).toBe(true);
      expect(spawn).toHaveBeenCalledTimes(1);
    }
  });

  it('persists raised_by in brief_data for escalation provenance', async () => {
    const sb = makeFakeTable();
    const r = await recordPendingDecision(sb, { title: 'q', raisedBy: 'adam', decisionType: 'session_question', _spawnEscalation: vi.fn(), _quietWindow: () => false });
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
        _quietWindow: () => false,
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

describe('SD-LEO-INFRA-CHAIRMAN-DECISION-EMAIL-001 FR-1 — rate cap counts by ACTUAL send time (defect 1)', () => {
  it('OLD-BACKLOG repro: 3 decisions created >1h ago but EMAILED just now DO count toward the cap → the 4th folds to a digest (not another standout)', async () => {
    const sb = makeFakeTable();
    const spawn = vi.fn();
    const twoDaysAgo = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    const justNow = new Date().toISOString();
    // The exact flood shape: old created_at (invisible to the buggy created_at cap) + a RECENT send marker.
    for (let i = 0; i < 3; i++) {
      sb.rows.push({ id: `old-${i}`, created_at: twoDaysAgo, brief_data: { escalation_email_sent_at: justNow } });
    }
    sb.rows.push({ id: 'dec-4', created_at: twoDaysAgo, brief_data: { title: 'old q' } });

    const r = await escalateChairmanDecision(sb, 'dec-4', { spawn, quietWindow: () => false });
    // Under the OLD created_at filter these would read emails=0 → a 4th standout (the flood). Send-time
    // counting sees emails=3 → the cap trips → ONE digest.
    expect(r.digest).toBe(true);
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it('a send marker OLDER than the window is EXCLUDED from the cap (still folds correctly on the boundary)', async () => {
    const sb = makeFakeTable();
    const spawn = vi.fn();
    const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    // 3 rows whose ONLY marker is >1h old → not counted → under cap → a normal standout, not a digest.
    for (let i = 0; i < 3; i++) {
      sb.rows.push({ id: `stale-${i}`, created_at: new Date().toISOString(), brief_data: { escalation_email_sent_at: twoHoursAgo } });
    }
    sb.rows.push({ id: 'dec-x', created_at: new Date().toISOString(), brief_data: { title: 'q' } });
    const r = await escalateChairmanDecision(sb, 'dec-x', { spawn, quietWindow: () => false });
    expect(r.escalated).toBe(true);
    expect(r.digest).toBeUndefined(); // stale markers didn't count → under cap → standout
  });
});

describe('SD-LEO-INFRA-CHAIRMAN-DECISION-EMAIL-001 FR-2 — atomic stamp-before-spawn CAS (defect 2)', () => {
  it('two concurrent escalations of the SAME decision spawn EXACTLY once (CAS mutual exclusion)', async () => {
    const sb = makeFakeTable();
    const spawn = vi.fn();
    sb.rows.push({ id: 'race-1', created_at: new Date().toISOString(), brief_data: { title: 'q' } });
    const [a, b] = await Promise.all([
      escalateChairmanDecision(sb, 'race-1', { spawn, quietWindow: () => false }),
      escalateChairmanDecision(sb, 'race-1', { spawn, quietWindow: () => false }),
    ]);
    expect(spawn).toHaveBeenCalledTimes(1);                 // exactly one winner
    const winners = [a, b].filter(r => r.escalated === true).length;
    const losers = [a, b].filter(r => r.deduped === true).length;
    expect(winners).toBe(1);
    expect(losers).toBe(1);
    expect(sb.rows[0].brief_data.escalation_email_sent_at).toBeTruthy();
  });

  it('FAIL-CLOSED: a CAS UPDATE error does NOT spawn (never emit an email we could not durably record)', async () => {
    const sb = makeFakeTable({ updateError: 'db unavailable' });
    const spawn = vi.fn();
    sb.rows.push({ id: 'dec-1', created_at: new Date().toISOString(), brief_data: { title: 'q' } });
    const r = await escalateChairmanDecision(sb, 'dec-1', { spawn, quietWindow: () => false });
    expect(r.escalated).toBe(false);
    expect(r.error).toMatch(/db unavailable/);
    expect(spawn).not.toHaveBeenCalled();                  // fail-closed
  });
});
