/**
 * FR-4: a boundary crossing leaves exactly one record that says WHICH boundary.
 * SD-LEO-INFRA-ROLE-SESSION-SELF-001.
 *
 * THE DISCRIMINATION ARM IS THE POINT. "Exactly one row" passes trivially on its own — a degenerate
 * constant key would collapse every override in history into a single row and satisfy it. So the
 * same event twice must yield ONE row AND two different events must yield TWO. Only the pair
 * distinguishes idempotency from erasure.
 *
 * No database is touched: supabase is injected, and buildOverrideRecord is pure.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  buildOverrideRecord, recordChairmanOverride, overrideKey,
  OVERRIDE_SCOPE, OVERRIDE_CATEGORY, DIRECTED_BY_UNATTRIBUTED,
} from './chairman-override-record.js';

const EVENT = {
  boundary: 'CONST-002 separation of proposer/executor/verifier',
  rationale: 'Chairman directed the deploy; Solomon named the boundary before complying.',
  directedAt: '2026-07-26T22:00:00.000Z',
  sessionId: 'sess-solomon-1',
  scope: OVERRIDE_SCOPE.INSTANCE,
  namedBeforeComplying: true,
  disclosedInBand: true,
};

/**
 * A feedback table that honours the dedup filters it is actually given — including source_type.
 * A double that ignored source_type could not express the forgery-suppression attack below, which
 * is precisely how that hole survived the first round.
 */
function fakeDb(seed = []) {
  const rows = [...seed];
  const client = {
    rows,
    from: () => ({
      select: () => {
        const filters = {};
        const q = {
          eq: (col, val) => { filters[col] = val; return q; },
          limit: async () => ({
            data: rows.filter((r) => Object.entries(filters).every(([col, val]) => (
              col === 'metadata->>override_key' ? r.metadata?.override_key === val : r[col] === val
            ))),
          }),
        };
        return q;
      },
      insert: (row) => ({
        select: () => ({
          single: async () => {
            const id = `id-${rows.length + 1}`;
            rows.push({ ...row, id });
            return { data: { id }, error: null };
          },
        }),
      }),
    }),
  };
  return client;
}

describe('the record names the boundary, or there is no record', () => {
  it('THROWS when the boundary is missing', () => {
    // A boundary-crossing record that cannot say which boundary was crossed is not a record.
    for (const bad of [undefined, null, '', '   ']) {
      expect(() => buildOverrideRecord({ ...EVENT, boundary: bad })).toThrow(/BOUNDARY/);
    }
  });

  it('THROWS on an unscoped or unrecognised scope', () => {
    // The most consequential thing to get wrong: an instance-only override later read as precedent.
    for (const bad of [undefined, null, '', 'permanent', 'INSTANCE']) {
      expect(() => buildOverrideRecord({ ...EVENT, scope: bad })).toThrow(/scope/);
    }
  });

  it('carries boundary, scope and the two behaviours that were improvised correctly', () => {
    const r = buildOverrideRecord(EVENT);
    // Literal, not OVERRIDE_CATEGORY: comparing the module's constant to itself is a check that
    // cannot fail — the exact shape FR-1's A3 test exists to forbid, and I wrote it here anyway.
    expect(r.category).toBe('chairman_override');
    expect(r.metadata.boundary_crossed).toBe(EVENT.boundary);
    expect(r.metadata.scope).toBe('instance');
    expect(r.metadata.named_before_complying).toBe(true);
    expect(r.metadata.disclosed_in_band).toBe(true);
    expect(r.description).toContain('named the boundary before complying');
  });

  it('THE FLATTERING ANSWER IS NOT THE DEFAULT — both governance booleans track their input', () => {
    // These two fields are the entire auditable content of "did the agent behave correctly during
    // the override". Hardcoding them true would make every record permanently attest the
    // flattering answer while every test stayed green — a governance trail that cannot report
    // misbehaviour. Asserting only the true case left exactly that mutation alive.
    const bad = buildOverrideRecord({ ...EVENT, namedBeforeComplying: false, disclosedInBand: false });
    expect(bad.metadata.named_before_complying).toBe(false);
    expect(bad.metadata.disclosed_in_band).toBe(false);

    // Absent is also NOT true: an unstated behaviour must not be recorded as compliance.
    const absent = buildOverrideRecord({ ...EVENT, namedBeforeComplying: undefined, disclosedInBand: undefined });
    expect(absent.metadata.named_before_complying).toBe(false);
    expect(absent.metadata.disclosed_in_band).toBe(false);
  });

  it('the rationale reaches the record', () => {
    expect(buildOverrideRecord(EVENT).description).toBe(EVENT.rationale);
    expect(buildOverrideRecord({ ...EVENT, rationale: undefined }).description).toBe('');
  });

  it('is an AUDIT record, not an open decision awaiting the chairman', () => {
    // severity:'high' + status:'new' + resolved_at:null is exactly the predicate the
    // chairman_all_decision_signals view matches — and that view has NO category filter. A
    // historical override therefore surfaced as a decision still awaiting the chairman, and
    // relayed the operator-supplied rationale into a queue it was never written for. The chairman
    // already made this call; re-asking is noise plus a small disclosure.
    const r = buildOverrideRecord(EVENT);
    expect(r.status).toBe('resolved');
    expect(r.resolved_at).toBeTruthy();
    expect(r.severity).not.toBe('high');
    expect(r.severity).not.toBe('critical');
    expect(r.resolution_notes).toBeTruthy();   // status='resolved' requires it per the feedback CHECK
  });

  it('carries the NOT NULL columns feedback requires', () => {
    // Omitting these fails 23502 on every live call. role-self-score.cjs already documents finding
    // this exact bug "live-testing this SD" and centralised a builder to prevent it — and this
    // module hand-rolled the insert one commit later and re-introduced it. Pinned so it cannot
    // regress a third time.
    const r = buildOverrideRecord(EVENT);
    expect(r.source_application).toBeTruthy();
    expect(r.source_type).toBeTruthy();
    expect(r.severity).toBeTruthy();
  });
});

describe('an unattributable direction is TYPED, never null', () => {
  it('verbal direction records a marker rather than an empty value', () => {
    // decided_by_user_id is ~97% NULL and its population is an open question, so this is the
    // COMMON case, not the edge. A null here would be indistinguishable from "nobody filled it in".
    const r = buildOverrideRecord({ ...EVENT, directedBy: undefined });
    expect(r.metadata.directed_by).toBe(DIRECTED_BY_UNATTRIBUTED);
    expect(r.metadata.directed_by).not.toBeNull();
    expect(r.metadata.directed_by).not.toBe('');
  });

  it('NEGATIVE CONTROL — a known director is recorded verbatim', () => {
    // Without this, always-marker would pass and the field would never carry a real attribution.
    const r = buildOverrideRecord({ ...EVENT, directedBy: 'chairman' });
    expect(r.metadata.directed_by).toBe('chairman');
  });
});

describe('THE DISCRIMINATION ARM — idempotent, but not amnesiac', () => {
  it('the SAME event twice yields exactly ONE row', async () => {
    const db = fakeDb();
    const a = await recordChairmanOverride(db, EVENT);
    const b = await recordChairmanOverride(db, EVENT);
    expect(a.written).toBe(true);
    expect(b.written).toBe(false);
    expect(b.deduped).toBe(true);
    expect(db.rows).toHaveLength(1);
  });

  it('TWO DIFFERENT events yield TWO rows', async () => {
    // Without this, a constant key would satisfy the test above while erasing every override
    // after the first — idempotency and erasure look identical from a single-row assertion.
    const db = fakeDb();
    await recordChairmanOverride(db, EVENT);
    await recordChairmanOverride(db, { ...EVENT, boundary: 'a different hard boundary', directedAt: '2026-07-27T09:00:00.000Z' });
    expect(db.rows).toHaveLength(2);
    expect(new Set(db.rows.map((r) => r.metadata.override_key)).size).toBe(2);
  });

  it('A FORGED ROW CANNOT SUPPRESS THE GENUINE ONE', async () => {
    // The telegram insert policy constrains ONLY source_type, so an anon actor can write
    // category='chairman_override' with any metadata. Deduping on (category, override_key) alone
    // meant a PRE-SEEDED forgery collided with a real crossing: the writer returned deduped:true
    // carrying the FORGERY'S id, so the authentic record was never written and the caller was told
    // it already existed. A forged governance record is worse than a missing one — this makes it
    // merely noise beside the real record rather than a replacement for it.
    const forged = {
      id: 'forged-1', category: 'chairman_override', source_type: 'telegram',
      metadata: { override_key: overrideKey(EVENT), directed_by: 'chairman', scope: 'precedent' },
    };
    const db = fakeDb([forged]);
    const r = await recordChairmanOverride(db, EVENT);
    expect(r.written).toBe(true);           // the genuine record IS written
    expect(r.deduped).toBe(false);
    expect(r.id).not.toBe('forged-1');      // and we never report the forgery as ours
  });

  it('the key varies with boundary, time and session — not one of them alone', () => {
    const base = overrideKey(EVENT);
    expect(overrideKey({ ...EVENT, boundary: 'other' })).not.toBe(base);
    expect(overrideKey({ ...EVENT, directedAt: '2026-07-27T09:00:00.000Z' })).not.toBe(base);
    expect(overrideKey({ ...EVENT, sessionId: 'sess-other' })).not.toBe(base);
  });
});

describe('recording never takes down its caller', () => {
  it('a transport failure is reported, not thrown', async () => {
    const warn = vi.fn();
    const broken = { from: () => { throw new Error('socket hang up'); } };
    const r = await recordChairmanOverride(broken, EVENT, { logger: { warn } });
    expect(r.written).toBe(false);
    expect(r.error).toMatch(/socket hang up/);
    expect(warn).toHaveBeenCalled();
  });

  it('but an UNUSABLE RECORD still throws — that is a caller bug, not a transport blip', async () => {
    // The distinction matters: a missing boundary means the caller does not know what it is
    // recording, and swallowing that would produce a governance trail full of anonymous crossings.
    await expect(recordChairmanOverride(fakeDb(), { ...EVENT, boundary: '' })).rejects.toThrow(/BOUNDARY/);
  });
});
