/**
 * SD-LEO-INFRA-ADAM-INBOUND-BACKLOG-WATCHDOG-001 — Phase 1 (shared SSOT selector + classifier).
 *
 * Scenario ids match the approved PRD v1.1 (PRD-SD-LEO-INFRA-ADAM-INBOUND-BACKLOG-WATCHDOG-001).
 * Several of these exist BECAUSE the PLAN-phase testing-agent review (evidence fe57db81) found
 * the first-draft test set had 4 of 13 scenarios unfalsifiable or trivially-passing:
 *   - TS-1  had to state the Adam-SENT thread-mate is in the classifier input, else a literal
 *           mirror passes the one test called "the regression a literal mirror fails".
 *   - TS-1b covers the read_at-NULL branch, which was entirely untested despite being the
 *           MAJORITY branch on live data (30 of 54 rows at 2026-07-25).
 *   - TS-8  had to assert the REPORTED oldest age, not just fire/no-fire: an implementation that
 *           filters the breach predicate but computes age over the unfiltered set would pass the
 *           original then-clause while reporting a permanently-wrong age.
 */
import { describe, it, expect } from 'vitest';
import {
  UNREAD_BREACH_MS, UNACKED_BREACH_MS, EVIDENCE_FLOOR_MS,
  isExcludedKind, partitionUndrained, isBreaching, classifyBacklog, fetchInboundBacklog
} from '../../../lib/adam/inbound-backlog.js';

const NOW = Date.parse('2026-07-25T12:00:00.000Z');
const ago = (ms) => new Date(NOW - ms).toISOString();
const MIN = 60 * 1000;

function row(over = {}) {
  return {
    id: over.id || 'row-1',
    target_session: over.target_session || 'adam-live',
    sender_type: over.sender_type || 'coordinator',
    payload: over.payload !== undefined ? over.payload : { kind: 'adam_advisory' },
    created_at: over.created_at || ago(90 * MIN),
    read_at: over.read_at !== undefined ? over.read_at : null,
    acknowledged_at: over.acknowledged_at !== undefined ? over.acknowledged_at : null
  };
}

describe('TS-1 — correlation participation does NOT suppress (the regression a literal mirror fails)', () => {
  it('breaches even when the row points at an Adam-SENT message AND that thread-mate is in the input', () => {
    // The Adam-sent thread-mate IS present in the collection handed to the classifier — this is
    // the condition under which hasCorrelatedReply would suppress (measured 22/43 live).
    const inbound = row({ id: 'inbound-1', payload: { kind: 'adam_advisory', reply_to: 'adam-sent-1', correlation_id: 'corr-1' } });
    const adamSentThreadMate = row({ id: 'adam-sent-1', sender_type: 'adam', payload: { kind: 'adam_advisory', correlation_id: 'corr-1' } });
    const verdict = classifyBacklog([inbound, adamSentThreadMate], NOW);
    expect(isBreaching(inbound, NOW)).toBe(true);
    expect(verdict.breaching).toBe(true);
  });

  it('all three witnessed replay SHAPES surface (seeded, never live ids — live ids rot at read_at+7d)', () => {
    const shapes = ['b5422a6b', 'cdc50767', 'c78100a8'].map((corr, i) => row({
      id: 'replay-' + i,
      read_at: ago(70 * MIN),
      payload: { kind: i === 0 ? 'coordinator_reply' : 'adam_advisory', reply_to: 'adam-sent-' + i, correlation_id: corr }
    }));
    for (const s of shapes) expect(isBreaching(s, NOW)).toBe(true);
    expect(classifyBacklog(shapes, NOW).breachingCount).toBe(3);
  });
});

describe('TS-1b — the read_at-NULL branch (MAJORITY of live rows, previously untested)', () => {
  it('does NOT breach just below UNREAD_BREACH_MS', () => {
    expect(isBreaching(row({ read_at: null, created_at: ago(UNREAD_BREACH_MS - MIN) }), NOW)).toBe(false);
  });
  it('DOES breach at/above UNREAD_BREACH_MS', () => {
    expect(isBreaching(row({ read_at: null, created_at: ago(UNREAD_BREACH_MS + MIN) }), NOW)).toBe(true);
  });
});

describe('TS-12 — the read_at-SET branch boundary, deterministic under an injected clock', () => {
  it('does NOT breach just below UNACKED_BREACH_MS', () => {
    expect(isBreaching(row({ read_at: ago(UNACKED_BREACH_MS - MIN) }), NOW)).toBe(false);
  });
  it('DOES breach at/above UNACKED_BREACH_MS', () => {
    expect(isBreaching(row({ read_at: ago(UNACKED_BREACH_MS + MIN) }), NOW)).toBe(true);
  });
  it('is pure — same inputs give the same answer regardless of wall clock', () => {
    const r = row({ read_at: ago(UNACKED_BREACH_MS + MIN) });
    expect(isBreaching(r, NOW)).toBe(isBreaching(r, NOW));
  });
});

describe('TS-8 — exclusion binds the AGE COMPUTATION, not merely fire/no-fire', () => {
  it('reports the genuine 90m age, NOT the 8.8h excluded-kind age', () => {
    const rows = [
      row({ id: 'excluded-terminal', payload: { kind: 'cross_party_ping' }, created_at: ago(528 * MIN) }), // in ADAM_EXCLUDED_KINDS
      row({ id: 'undrained', payload: { kind: 'solomon_ledger_pending_resurface' }, created_at: ago(528 * MIN) }), // absent from DRAIN_SETS.adam
      row({ id: 'genuine', payload: { kind: 'adam_advisory' }, created_at: ago(90 * MIN) })
    ];
    const v = classifyBacklog(rows, NOW);
    expect(v.breaching).toBe(true);
    expect(v.oldestRowId).toBe('genuine');
    // The assertion the first draft omitted — a naive impl reporting 8.8h passes fire/no-fire
    // but reports a permanently-wrong age, which then also defeats emitFeedback dedup.
    expect(Math.round(v.oldestAgeMs / MIN)).toBe(90);
  });
});

describe('TS-14 — the derived two-part exclusion prevents a permanently-pinned alarm', () => {
  it('live-shaped mix with only excluded/undrained kinds old => NO breach, oldest age from the 20m row', () => {
    const rows = [
      row({ id: 'x1', payload: { kind: 'cross_party_ping' }, created_at: ago(600 * MIN) }),
      row({ id: 'x2', payload: { kind: 'solomon_ledger_pending_resurface' }, created_at: ago(600 * MIN) }),
      row({ id: 'ordinary', payload: { kind: 'adam_advisory' }, created_at: ago(20 * MIN) })
    ];
    const v = classifyBacklog(rows, NOW);
    expect(v.breaching).toBe(false);
    expect(v.oldestAgeMs).toBe(0);
  });
});

describe('TS-15 — excluding undrained kinds must NOT hide a real drain-set gap', () => {
  it('surfaces undrained kinds separately from the terminal-by-design ones', () => {
    const rows = [
      row({ payload: { kind: 'cross_party_ping' } }),
      row({ payload: { kind: 'solomon_ledger_pending_resurface' } })
    ];
    const { undrainedKinds } = partitionUndrained(rows);
    expect(undrainedKinds).toContain('solomon_ledger_pending_resurface');
    // cross_party_ping is terminal-by-design, NOT a drain-set gap — must not be reported as one.
    expect(undrainedKinds).not.toContain('cross_party_ping');
  });
});

describe('TS-13 — convergeAckTTL auto-ack must NOT read as actioned', () => {
  it('a payload.auto_acked row still breaches (retention retired the evidence, nobody actioned it)', () => {
    const r = row({ acknowledged_at: ago(1 * MIN), payload: { kind: 'adam_advisory', auto_acked: true }, read_at: ago(UNACKED_BREACH_MS + MIN) });
    expect(isBreaching(r, NOW)).toBe(true);
  });
  it('a genuinely human-acked row does NOT breach', () => {
    const r = row({ acknowledged_at: ago(1 * MIN), read_at: ago(UNACKED_BREACH_MS + MIN) });
    expect(isBreaching(r, NOW)).toBe(false);
  });
});

describe('exclusion-set discipline', () => {
  it('untyped rows are REAL backlog, never excluded', () => {
    expect(isExcludedKind(null)).toBe(false);
    expect(isExcludedKind('')).toBe(false);
    expect(isBreaching(row({ payload: {} }), NOW)).toBe(true);
  });
  it('a kind present in DRAIN_SETS.adam is not excluded', () => {
    expect(isExcludedKind('adam_advisory')).toBe(false);
  });
});

describe('TS-17 — EVIDENCE_FLOOR_MS is asserted, not merely documented', () => {
  it('breach thresholds sit far below the retention floor so a later relaxation TRIPS', () => {
    expect(UNACKED_BREACH_MS).toBeLessThan(EVIDENCE_FLOOR_MS);
    expect(UNREAD_BREACH_MS).toBeLessThan(EVIDENCE_FLOOR_MS);
    // >= 100x headroom: a relaxation that erodes it fails here rather than silently losing evidence.
    expect(EVIDENCE_FLOOR_MS / UNACKED_BREACH_MS).toBeGreaterThanOrEqual(100);
  });
});

describe('TS-10 / TS-11 — pagination and all-historical-adam-id scoping (IO seam)', () => {
  function fakeSupabase(totalRows) {
    const calls = [];
    return {
      calls,
      from() {
        const b = {
          select() { return b; },
          in(col, ids) { calls.push({ col, ids }); return b; },
          is() { return b; },
          order() { return b; },
          range(from, to) {
            const page = [];
            for (let i = from; i <= Math.min(to, totalRows - 1); i++) page.push(row({ id: 'r' + i }));
            return Promise.resolve({ data: page, error: null });
          }
        };
        return b;
      }
    };
  }

  it('TS-10: returns all 1200 rows, defeating the PostgREST 1000-row cap', async () => {
    const sb = fakeSupabase(1200);
    const { rows, error } = await fetchInboundBacklog(sb, ['adam-live']);
    expect(error).toBeNull();
    expect(rows.length).toBe(1200);
  });

  it('TS-11: queries ALL historical role=adam ids, not just the live one', async () => {
    const sb = fakeSupabase(3);
    await fetchInboundBacklog(sb, ['adam-live', 'adam-retired-1', 'adam-retired-2']);
    expect(sb.calls[0].col).toBe('target_session');
    expect(sb.calls[0].ids).toEqual(['adam-live', 'adam-retired-1', 'adam-retired-2']);
  });

  it('returns empty without querying when there are no adam ids', async () => {
    const sb = fakeSupabase(5);
    const { rows } = await fetchInboundBacklog(sb, []);
    expect(rows).toEqual([]);
    expect(sb.calls.length).toBe(0);
  });

  it('TS-16 (selector half): FAILS OPEN on a read error — returns an error, never a false breach', async () => {
    const sb = { from() { throw new Error('transient DB failure'); } };
    const { rows, error } = await fetchInboundBacklog(sb, ['adam-live']);
    expect(rows).toEqual([]);
    expect(error).toMatch(/transient DB failure/);
    // A caller seeing error!=null must exit with the INFRA code (1), never the BREACH code (2).
    expect(classifyBacklog(rows, NOW).breaching).toBe(false);
  });
});
