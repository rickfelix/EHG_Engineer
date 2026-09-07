/**
 * QF-20260905-594 — lib/fleet/sweep-consecutive-escalation.cjs.
 *
 * ACCEPTANCE (from the ticket): a unit test replays 12 synthetic runs with the same SKIP_RESET
 * SD and asserts exactly one decision row, and that run 13 prints no finding; a run with a
 * different subject still prints. Writes to the REAL jsonl sink (mirrors
 * tests/unit/fleet/sweep-findings-sink.test.js's own convention) with a unique-per-test subject
 * so runs never collide with unrelated entries already in the file.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const { guardedRecordFinding, tailStreak, ESCALATE_AFTER } = require_('../../../lib/fleet/sweep-consecutive-escalation.cjs');

/** Generic session_coordination stub: records inserts, mints sequential ids, and serves the
 *  acknowledged_at lookup guardedRecordFinding uses to decide whether a prior decision row is
 *  still open (default: exists and unacknowledged, matching a freshly-inserted real row). */
function stubSupabase({ ackState = {} } = {}) {
  const inserted = [];
  let nextId = 0;
  const sb = {
    from(table) {
      const eqs = {};
      const chain = {
        _isSelect: false,
        select() { chain._isSelect = true; return chain; },
        eq(col, val) { eqs[col] = val; return chain; },
        gte() { return chain; },
        gt() { return chain; },
        is() { return chain; },
        in() { return chain; },
        order() { return chain; },
        limit() { return chain; },
        maybeSingle() {
          if (table === 'session_coordination' && 'id' in eqs) {
            const ack = Object.prototype.hasOwnProperty.call(ackState, eqs.id) ? ackState[eqs.id] : null;
            return Promise.resolve({ data: { acknowledged_at: ack }, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        single() {
          return Promise.resolve({ data: { id: chain._newId }, error: null });
        },
        insert(r) {
          nextId += 1;
          chain._newId = 'decision-row-' + nextId;
          inserted.push({ ...r, id: chain._newId });
          chain._isSelect = false;
          return chain;
        },
        then(res, rej) {
          if (chain._isSelect) return Promise.resolve({ data: [], error: null }).then(res, rej);
          return Promise.resolve({ data: { id: chain._newId }, error: null }).then(res, rej);
        },
      };
      return chain;
    },
  };
  return { sb, inserted };
}

const uniqueSubject = (label) => 'SD-TEST-QF594-' + label + '-' + Date.now() + '-' + Math.random().toString(36).slice(2);

// recordFinding() (the QF-20260905-230 sibling) also inserts its own 'sweep_finding_alert' row
// on every call in this stub (its dedup select is unmocked here, so it always misses) -- that is
// a SEPARATE mechanism from this QF's escalation decision row. Scope every assertion below to
// just the decision rows this module writes.
const decisionRows = (inserted) => inserted.filter((r) => r.payload && r.payload.kind === 'sweep_escalation_decision');

describe('guardedRecordFinding: consecutive-run escalation', () => {
  it(`ACCEPTANCE: ${ESCALATE_AFTER} consecutive runs write exactly ONE decision row; run ${ESCALATE_AFTER + 1} prints no finding`, async () => {
    const subject = uniqueSubject('accept');
    const { sb, inserted } = stubSupabase();
    const finding = { findingClass: 'skip_reset', subject, summary: subject + ' — accepted handoff exists' };

    for (let run = 1; run <= ESCALATE_AFTER; run += 1) {
      const g = await guardedRecordFinding(sb, finding);
      expect(g.printed).toBe(true);
    }
    const rows = decisionRows(inserted);
    expect(rows).toHaveLength(1);
    expect(rows[0].payload.finding_class).toBe('skip_reset');
    expect(rows[0].payload.subject).toBe(subject);

    const g13 = await guardedRecordFinding(sb, finding);
    expect(g13.printed).toBe(false);
    expect(decisionRows(inserted)).toHaveLength(1); // still exactly one — no re-insert while open
  });

  it('a different subject is unaffected by another subject\'s active escalation', async () => {
    const escalated = uniqueSubject('busy');
    const other = uniqueSubject('other');
    const { sb, inserted } = stubSupabase();

    for (let run = 1; run <= ESCALATE_AFTER + 1; run += 1) {
      await guardedRecordFinding(sb, { findingClass: 'conflict', subject: escalated, summary: 'x' });
    }
    expect(decisionRows(inserted)).toHaveLength(1);

    const g = await guardedRecordFinding(sb, { findingClass: 'conflict', subject: other, summary: 'y' });
    expect(g.printed).toBe(true);
    expect(decisionRows(inserted)).toHaveLength(1); // the other subject's own streak is nowhere near threshold
  });

  it('once the decision row is acknowledged, the streak resets and normal recording resumes', async () => {
    const subject = uniqueSubject('resume');
    const { sb: escalating, inserted } = stubSupabase();
    const finding = { findingClass: 'skip_reset', subject, summary: 'x' };

    for (let run = 1; run <= ESCALATE_AFTER; run += 1) await guardedRecordFinding(escalating, finding);
    const rows = decisionRows(inserted);
    expect(rows).toHaveLength(1);
    const decisionRowId = rows[0].id;

    // Suppressed while open (same as the ACCEPTANCE test).
    const gSuppressed = await guardedRecordFinding(escalating, finding);
    expect(gSuppressed.printed).toBe(false);

    // A later run reads the row as acknowledged (closed) — recording resumes.
    const { sb: closed } = stubSupabase({ ackState: { [decisionRowId]: new Date().toISOString() } });
    const gResumed = await guardedRecordFinding(closed, finding);
    expect(gResumed.printed).toBe(true);

    const streak = tailStreak('skip_reset', subject);
    expect(streak.count).toBe(1); // reset by the marker, then this one fresh occurrence
  });
});
