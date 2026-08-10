/**
 * SD-LEO-INFRA-CHECKIN-DISPATCH-READ-001 (FR-3) — a dispatch instruction carrying a factual
 * premise must stamp the MEASUREMENT time and default to re-verify.
 *
 * THE INCIDENT: an 08-05 dispatch closed with an apply-instruction ("drive_reports returns
 * PGRST205, prepend-commit-apply") that was FALSE by read-time — the table had been applied —
 * and a worker following it literally would have re-applied a live permission-class table.
 * Every 'freshness' check on the dispatch path measures the RECIPIENT (heartbeats, rank TTLs);
 * none measured the premise inside the instruction, and directed-assignment carried ZERO
 * handling of an instruction body.
 *
 * NOT A PROSE RE-VALIDATOR — the contract is content-blind by construction (key presence, never
 * prose), and the content-blindness is asserted below as a control: claiming otherwise would be
 * a guard asserting what it never measured.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  assessInstructionPremise, hasInstructionBody, PREMISE_FRESHNESS_BOUND_MS,
} = require('../../../lib/coordination/premise-freshness.cjs');
const { stampPremiseMeasurement } = require('../../../lib/coordinator/dispatch.cjs');
const { resolveCheckin } = require('../../../scripts/worker-checkin.cjs');

const NOW = Date.now();
const minutesAgo = (m) => new Date(NOW - m * 60_000).toISOString();
const silent = { warn: () => {}, error: () => {}, log: () => {} };

describe('assessInstructionPremise — the claim-time verdict', () => {
  it('no instruction body → no verdict, no directive (routine dispatches stay noise-free)', () => {
    const r = assessInstructionPremise({ sd_key: 'SD-X', kind: 'resume', reason: 'cold-recovery' }, NOW);
    expect(r).toMatchObject({ verdict: 'no_instruction', directive: null });
  });

  it('fresh premise (within the bound) → presented normally, no re-verify noise', () => {
    const r = assessInstructionPremise({ instruction: 'apply migration X', premise_measured_at: minutesAgo(10) }, NOW);
    expect(r.verdict).toBe('fresh');
    expect(r.directive).toBeNull();
  });

  it('stale premise (older than the bound) → explicit RE-VERIFY directive, not current fact', () => {
    const r = assessInstructionPremise({ instruction: 'apply migration X', premise_measured_at: minutesAgo(180) }, NOW);
    expect(r.verdict).toBe('stale');
    expect(r.directive).toMatch(/RE-VERIFY BEFORE EXECUTING/);
    expect(r.directive).toMatch(/lead, not a fact/);
  });

  it('ABSENT stamp with an instruction body → UNVERIFIED and surfaced, never fresh', () => {
    const r = assessInstructionPremise({ instruction: 'apply migration X' }, NOW);
    expect(r.verdict).toBe('unstamped');
    expect(r.directive).toMatch(/RE-VERIFY BEFORE EXECUTING/);
    expect(r.directive).toMatch(/UNVERIFIED/);
  });

  it('an UNPARSEABLE stamp is treated as absent — garbage must not read as a passing stamp', () => {
    const r = assessInstructionPremise({ instruction: 'apply migration X', premise_measured_at: 'three days ago' }, NOW);
    expect(r.verdict).toBe('unstamped');
    expect(r.directive).not.toBeNull();
  });

  it('a FUTURE-DATED stamp is surfaced, never fresh — one wrong stamp must not silence the guard forever (SECURITY probe)', () => {
    // Without the future bound, ageMs goes negative and passes every staleness test — a
    // tz-naive local timestamp on a US-Eastern seat is enough to reach this state honestly.
    const r = assessInstructionPremise({ instruction: 'apply migration X', premise_measured_at: new Date(NOW + 24 * 3600_000).toISOString() }, NOW);
    expect(r.verdict).toBe('future');
    expect(r.directive).toMatch(/RE-VERIFY BEFORE EXECUTING/);
    expect(r.directive).toMatch(/UNVERIFIED/);
  });

  it('NEGATIVE: slight clock skew (within tolerance) still reads fresh — the future bound must not refuse honest stamps', () => {
    const r = assessInstructionPremise({ instruction: 'apply migration X', premise_measured_at: new Date(NOW + 2 * 60_000).toISOString() }, NOW);
    expect(r.verdict).toBe('fresh');
    expect(r.directive).toBeNull();
  });

  it('every instruction-body key the FR names is detected: instruction, apply, body, steps', () => {
    for (const key of ['instruction', 'apply', 'body', 'steps']) {
      expect(hasInstructionBody({ [key]: 'do the thing' }), key).toBe(true);
    }
    expect(hasInstructionBody({ steps: ['a', 'b'] })).toBe(true);
    expect(hasInstructionBody({ instruction: '   ' }), 'blank strings are not a body').toBe(false);
    expect(hasInstructionBody({ sd_key: 'SD-X' })).toBe(false);
    expect(hasInstructionBody(null)).toBe(false);
  });

  it('CONTENT-BLIND CONTROL: the verdict is identical for arbitrary instruction prose — no re-validation is attempted or claimed', () => {
    const stamps = { premise_measured_at: minutesAgo(180) };
    const a = assessInstructionPremise({ instruction: 'drive_reports returns PGRST205, prepend-commit-apply', ...stamps }, NOW);
    const b = assessInstructionPremise({ instruction: 'entirely different claim about different state', ...stamps }, NOW);
    expect(a.verdict).toBe(b.verdict);
    expect(a.directive).toBe(b.directive);
  });
});

describe('measurement time vs send time — the stamp the defect is made of', () => {
  it('a FRESHLY-SENT row with a STALE measurement is stale: the verdict follows measurement time', () => {
    // Send time (row.created_at) plays no part in the verdict — pass a payload whose stamp is
    // old while "now" is the moment of a brand-new send.
    const r = assessInstructionPremise({ instruction: 'x', premise_measured_at: minutesAgo(3 * 24 * 60) }, NOW);
    expect(r.verdict).toBe('stale');
  });

  it('an OLD send with a FRESH measurement is fresh: recency of the message proves nothing either way', () => {
    const r = assessInstructionPremise({ instruction: 'x', premise_measured_at: minutesAgo(5) }, NOW);
    expect(r.verdict).toBe('fresh');
  });
});

describe('stampPremiseMeasurement — the dispatch choke-point write side', () => {
  it('preserves a caller-supplied measurement stamp byte-for-byte (never overwrites with now)', () => {
    const measured = minutesAgo(30);
    const row = { message_type: 'WORK_ASSIGNMENT', payload: { instruction: 'x', premise_measured_at: measured } };
    stampPremiseMeasurement(row, silent);
    expect(row.payload.premise_measured_at).toBe(measured);
  });

  it('NEVER fabricates a stamp for an unstamped instruction — a send-time default is the false comfort this defect is made of', () => {
    const row = { message_type: 'WORK_ASSIGNMENT', payload: { instruction: 'x' } };
    stampPremiseMeasurement(row, silent);
    expect(row.payload).not.toHaveProperty('premise_measured_at');
  });

  it('strips an unparseable stamp so it reads as UNVERIFIED downstream, and says so', () => {
    const warns = [];
    const row = { message_type: 'WORK_ASSIGNMENT', payload: { instruction: 'x', premise_measured_at: 'yesterday-ish' } };
    stampPremiseMeasurement(row, { warn: (m) => warns.push(m) });
    expect(row.payload).not.toHaveProperty('premise_measured_at');
    expect(warns.join(' ')).toMatch(/unparseable/);
  });

  it('leaves non-WORK_ASSIGNMENT rows and instruction-less payloads untouched', () => {
    const info = { message_type: 'INFO', payload: { body: 'status prose', premise_measured_at: 'garbage' } };
    stampPremiseMeasurement(info, silent);
    expect(info.payload.premise_measured_at).toBe('garbage');
    const plain = { message_type: 'WORK_ASSIGNMENT', payload: { sd_key: 'SD-X' } };
    stampPremiseMeasurement(plain, silent);
    expect(plain.payload).toEqual({ sd_key: 'SD-X' });
  });
});

/**
 * Claim-time surfacing through the REAL pipeline (same harness as
 * work-assignment-receipt-lane.test.js) — the directive must reach the worker on the
 * claimed_assignment result, leading the message, or the whole contract is inert.
 */
function fakeSb({ sdRow, assignedKey }) {
  return {
    rpc: () => Promise.resolve({ data: { success: true }, error: null }),
    from(table) {
      const filters = {};
      return {
        select() { return this; }, gte() { return this; },
        order() { return this; }, limit() { return this; }, is() { return this; },
        eq(col, val) { filters[col] = val; return this; },
        maybeSingle() {
          if (table === 'claude_sessions') return Promise.resolve({ data: { metadata: { role: 'worker' }, sd_key: null }, error: null });
          if (table === 'strategic_directives_v2') {
            if (filters.sd_key !== assignedKey || !sdRow) return Promise.resolve({ data: null, error: null });
            return Promise.resolve({ data: structuredClone(sdRow), error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        insert() { return Promise.resolve({ error: null }); },
        update() { return { eq() { return Promise.resolve({ error: null }); } }; },
      };
    },
  };
}

async function runDirected(payloadExtra) {
  const assignedKey = 'SD-PREMISE-001';
  const sb = fakeSb({
    assignedKey,
    sdRow: { status: 'in_progress', sd_type: 'feature', sd_key: assignedKey, target_application: null, metadata: {} },
  });
  const ws = require('../../../lib/fleet/worker-status.cjs');
  const orig = ws.getMessagesForSession;
  ws.getMessagesForSession = async () => [{
    id: 'msg-premise-1',
    message_type: 'WORK_ASSIGNMENT',
    payload: { assigned_sd: assignedKey, ...payloadExtra },
    created_at: new Date().toISOString(), // always a FRESH send — the verdict must not care
  }];
  try {
    return await resolveCheckin(sb, 'sess-premise-1', { getCoordinator: async () => null });
  } finally {
    ws.getMessagesForSession = orig;
  }
}

describe('FR-3 at claim-time — the worker is told to re-verify, or nothing is added', () => {
  it('POSITIVE: a freshly-SENT assignment with a stale MEASUREMENT surfaces the re-verify directive', async () => {
    const res = await runDirected({ instruction: 'drive_reports returns PGRST205 — prepend-commit-apply it', premise_measured_at: minutesAgo(3 * 24 * 60) });
    expect(res.action).toBe('claimed_assignment');
    expect(res.premise_reverify).toMatchObject({ verdict: 'stale' });
    expect(res.message).toMatch(/^RE-VERIFY BEFORE EXECUTING/);
  });

  it('ABSENT-STAMP: an instruction with no premise stamp is surfaced as unverified, never fresh', async () => {
    const res = await runDirected({ instruction: 'apply the pending migration' });
    expect(res.action).toBe('claimed_assignment');
    expect(res.premise_reverify).toMatchObject({ verdict: 'unstamped' });
    expect(res.message).toMatch(/^RE-VERIFY BEFORE EXECUTING/);
  });

  it('NEGATIVE: a within-bound measurement dispatches normally with zero re-verify noise', async () => {
    const res = await runDirected({ instruction: 'apply the pending migration', premise_measured_at: minutesAgo(10) });
    expect(res.action).toBe('claimed_assignment');
    expect(res.premise_reverify).toBeUndefined();
    expect(res.message).not.toMatch(/RE-VERIFY/);
  });

  it('NEGATIVE: an ordinary assignment with no instruction body is untouched', async () => {
    const res = await runDirected({});
    expect(res.action).toBe('claimed_assignment');
    expect(res.premise_reverify).toBeUndefined();
    expect(res.message).not.toMatch(/RE-VERIFY/);
  });
});

describe('the bound itself', () => {
  it('mirrors the dispatch-path precedent (1h) and is exported for consumers, not re-derived', () => {
    expect(PREMISE_FRESHNESS_BOUND_MS).toBe(60 * 60 * 1000);
  });
});
