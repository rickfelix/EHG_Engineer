/**
 * QF-20260727-031 — SD-SIDE HALF-RELEASED CLAIM.
 *
 * THE DEFECT. A claim is a two-sided fact. When the SESSION half of a release completes
 * (status=released, sd_key=null) but the SD half does not, the SD row points at a corpse. Every
 * pre-existing detector in the sweep iterates SESSIONS holding stale claims — and this session
 * holds nothing — so there is no row to iterate and the scan never visits the population. It is
 * not a threshold being too slow. The founding instance survived FIVE consecutive sweeps under
 * direct observation.
 *
 * WHY THE RESCUE PATH CANNOT REACH IT EITHER: adoptOrphanInProgress requires
 * claiming_session_id IS NULL to treat a row as an orphan, and this row's pointer is NON-null.
 * The mechanism built for abandoned work is gated on the exact field that is wrong. So the row
 * reads CLAIMED to every dispatch surface, is worked by nobody, and is adoptable by nothing.
 *
 * BEHAVIOURAL, not source-pinned: this drives the REAL exported detector against a fake client.
 * The sibling guard tests in this directory use static source assertions because their target was
 * unexported; that convention decays (a fixed slice() window silently stops covering the guard it
 * asserts once the function grows past it), so where a behavioural test is possible it is used.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const { clearHalfReleasedSdClaims } = require_('../../scripts/stale-session-sweep.cjs');

const DEAD = 'a695dfe8-dead-4000-8000-000000000001'; // the released session's id
const LIVE = 'b7c1f0a2-live-4000-8000-000000000002';

/**
 * Minimal chainable fake. Every filter returns `this`; the object is awaitable AND supports
 * .range() so fapPaginate's pagination terminates (full page first, empty page second).
 */
function makeClient({ liveSessions, sds, onUpdate = () => ({ error: null }) }) {
  const updates = [];
  const client = {
    updates,
    from(table) {
      const state = { table, isUpdate: false, payload: null, eqs: [], page: 0 };
      const builder = {
        select() { return builder; },
        or() { return builder; },
        not() { return builder; },
        in() { return builder; },
        gte() { return builder; },
        order() { return builder; },
        limit() { return builder; },
        update(payload) { state.isUpdate = true; state.payload = payload; return builder; },
        eq(col, val) { state.eqs.push([col, val]); return builder; },
        range() {
          // fapPaginate: serve the whole set once, then an empty page to stop.
          const rows = state.page++ === 0 ? builder._rows() : [];
          return Promise.resolve({ data: rows, error: null });
        },
        _rows() {
          if (state.table === 'v_active_sessions') return liveSessions.map((id) => ({ session_id: id, computed_status: 'active' }));
          if (state.table === 'strategic_directives_v2') return sds;
          return [];
        },
        then(resolve, reject) {
          if (state.isUpdate) {
            updates.push({ payload: state.payload, eqs: state.eqs });
            return Promise.resolve(onUpdate(state)).then(resolve, reject);
          }
          return Promise.resolve({ data: builder._rows(), error: null }).then(resolve, reject);
        }
      };
      return builder;
    }
  };
  return client;
}

const strandedSd = () => ({
  sd_key: 'SD-LEO-FEAT-FLEET-SESSION-LIFECYCLE-001',
  status: 'in_progress',
  claiming_session_id: DEAD,
  metadata: { existing: 'preserved' }
});

describe('QF-20260727-031: the sweep detects an SD pointing at a dead session', () => {
  it('CLEARS the exact founding state — released session, SD still pointing at it', async () => {
    // The whole defect in one assertion. Pre-fix this function does not exist, and no other
    // detector visits this row, so nothing clears it.
    const actions = [], warnings = [];
    const client = makeClient({ liveSessions: [LIVE], sds: [strandedSd()] });

    const found = await clearHalfReleasedSdClaims(client, actions, warnings);

    expect(found).toHaveLength(1);
    expect(client.updates).toHaveLength(1);
    const { payload } = client.updates[0];
    expect(payload.claiming_session_id).toBeNull();
    expect(payload.is_working_on).toBe(false);
    expect(payload.active_session_id).toBeNull(); // co-cleared, or it dangles
    expect(actions[0]).toMatch(/half-released claim/);
  });

  it('PRESERVES the prior claim for reversibility, without dropping existing metadata', async () => {
    const client = makeClient({ liveSessions: [LIVE], sds: [strandedSd()] });
    await clearHalfReleasedSdClaims(client, [], []);
    const { payload } = client.updates[0];
    expect(payload.metadata.half_released_prior_claim).toBe(DEAD);
    expect(payload.metadata.existing).toBe('preserved'); // read-modify-write, not clobber
  });

  it('CAS-guards the write against a re-claim landing between read and write', async () => {
    // Without this, a session that legitimately re-claimed the row mid-sweep would have its
    // claim cleared — recreating the same stranding from the opposite direction.
    const client = makeClient({ liveSessions: [LIVE], sds: [strandedSd()] });
    await clearHalfReleasedSdClaims(client, [], []);
    expect(client.updates[0].eqs).toContainEqual(['claiming_session_id', DEAD]);
  });

  it('LEAVES a live claimant alone — the arm an always-clear implementation fails', async () => {
    const sd = strandedSd();
    sd.claiming_session_id = LIVE;
    const client = makeClient({ liveSessions: [LIVE], sds: [sd] });

    const found = await clearHalfReleasedSdClaims(client, [], []);

    expect(found).toHaveLength(0);
    expect(client.updates).toHaveLength(0);
  });
});

describe('QF-20260727-031: the guard fails CLOSED, never all-dead', () => {
  it('clears NOTHING when the live-session set is empty', async () => {
    // The catastrophic direction. An unmeasurable live set makes every claim in the fleet look
    // dead; proceeding would strip them all in one pass. Empty means "cannot measure".
    const actions = [], warnings = [];
    const client = makeClient({ liveSessions: [], sds: [strandedSd()] });

    const found = await clearHalfReleasedSdClaims(client, actions, warnings);

    expect(found).toHaveLength(0);
    expect(client.updates).toHaveLength(0);
    expect(warnings.join(' ')).toMatch(/GUARD_UNAVAILABLE/);
  });

  it('DISTINGUISHES an unreadable live set from a measured-empty one', async () => {
    // Both fail closed, but they are different facts. loadLiveSessionIds swallows its own cause
    // and returns null, so the cause string is unrecoverable here — what IS recoverable, and what
    // an operator needs, is whether the read failed or genuinely measured nobody. Collapsing them
    // would hide a broken liveness read behind a plausible-looking quiet-fleet report.
    const unreadable = [];
    await clearHalfReleasedSdClaims({ from() { throw new Error('connection reset'); } }, [], unreadable);
    expect(unreadable.join(' ')).toMatch(/UNREADABLE/);

    const empty = [];
    await clearHalfReleasedSdClaims(makeClient({ liveSessions: [], sds: [strandedSd()] }), [], empty);
    expect(empty.join(' ')).toMatch(/measured EMPTY/);

    expect(unreadable.join(' ')).not.toEqual(empty.join(' ')); // the two states are not interchangeable
  });

  it('does not throw out of the sweep — one bad tick must not kill the pass', async () => {
    const client = { from() { throw new Error('boom'); } };
    await expect(clearHalfReleasedSdClaims(client, [], [])).resolves.toBeDefined();
  });
});
