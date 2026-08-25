/**
 * QF-20260824-154 — CLAIM=2-SURF stale-claim-on-switch, DETECTION HALF.
 *
 * THE DEFECT MEASURED: a worker switches claude_sessions.sd_key to a new claim; the prior
 * strategic_directives_v2.claiming_session_id is not released; dispatch keys on
 * claiming_session_id alone, so the abandoned SD reads CLAIMED indefinitely, invisible.
 *
 * THE MODEL TENSION THIS FIX DELIBERATELY DOES NOT RESOLVE: workers legitimately hold MULTIPLE
 * simultaneous claims (checkin's own claim_multiplicity tracking treats this as normal), so a
 * live session with a mismatched sd_key is NOT unambiguously abandoned — it may be a deliberate
 * paused multi-hold. clearHalfReleasedSdClaims (sibling function, QF-20260727-031) already
 * releases the unambiguous case (claiming session is DEAD); this function stamps-and-reports the
 * AMBIGUOUS case (session LIVE, focus elsewhere) for review, and never auto-releases it.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const { detectClaimFocusMismatch } = require_('../../scripts/stale-session-sweep.cjs');

const HOLDER = 'c1a1f0a2-live-4000-8000-000000000003';

/** Minimal chainable fake covering both tables this function reads. */
function makeClient({ sds, sessions, onUpdate = () => ({ error: null }) }) {
  const updates = [];
  const client = {
    updates,
    from(table) {
      const state = { table, isUpdate: false, payload: null, eqs: [], page: 0 };
      const builder = {
        select() { return builder; },
        not() { return builder; },
        in() { return builder; },
        order() { return builder; },
        limit() { return builder; },
        update(payload) { state.isUpdate = true; state.payload = payload; return builder; },
        eq(col, val) { state.eqs.push([col, val]); return builder; },
        range() {
          // fapPaginate (strategic_directives_v2 query): full page, then empty page to stop.
          const rows = state.page++ === 0 ? (table === 'strategic_directives_v2' ? sds : []) : [];
          return Promise.resolve({ data: rows, error: null });
        },
        then(resolve, reject) {
          if (state.isUpdate) {
            updates.push({ payload: state.payload, eqs: state.eqs });
            return Promise.resolve(onUpdate(state)).then(resolve, reject);
          }
          // claude_sessions query (direct .in(), no pagination in the real code).
          if (table === 'claude_sessions') return Promise.resolve({ data: sessions, error: null }).then(resolve, reject);
          return Promise.resolve({ data: [], error: null }).then(resolve, reject);
        }
      };
      return builder;
    }
  };
  return client;
}

const heldSd = (overrides = {}) => ({
  sd_key: 'SD-LEO-GEN-ALTIFYAI-FIRST-CUSTOMER-001',
  claiming_session_id: HOLDER,
  metadata: {},
  ...overrides,
});

describe('QF-20260824-154: claim-focus mismatch is stamped, never auto-released', () => {
  it('stamps a row whose LIVE claimant is currently focused on a DIFFERENT sd_key', async () => {
    const actions = [], warnings = [];
    const client = makeClient({
      sds: [heldSd()],
      sessions: [{ id: HOLDER, sd_key: 'QF-20260817-982', status: 'active' }],
    });

    const stamped = await detectClaimFocusMismatch(client, actions, warnings);

    expect(stamped).toHaveLength(1);
    expect(client.updates).toHaveLength(1);
    const { payload } = client.updates[0];
    expect(payload.metadata.claim_focus_mismatch.claiming_session_id).toBe(HOLDER);
    expect(payload.metadata.claim_focus_mismatch.live_sd_key).toBe('QF-20260817-982');
    expect(actions[0]).toMatch(/claim-focus mismatch stamped/);
    expect(actions[0]).toMatch(/not auto-released/);
  });

  it('does NOT touch claiming_session_id or is_working_on -- this is detection, not release', async () => {
    const client = makeClient({
      sds: [heldSd()],
      sessions: [{ id: HOLDER, sd_key: 'QF-20260817-982', status: 'active' }],
    });
    await detectClaimFocusMismatch(client, [], []);
    const { payload } = client.updates[0];
    expect(payload.claiming_session_id).toBeUndefined();
    expect(payload.is_working_on).toBeUndefined();
  });

  it('LEAVES a legitimate multi-hold alone when sd_key matches (in focus, no mismatch)', async () => {
    const client = makeClient({
      sds: [heldSd()],
      sessions: [{ id: HOLDER, sd_key: 'SD-LEO-GEN-ALTIFYAI-FIRST-CUSTOMER-001', status: 'active' }],
    });
    const stamped = await detectClaimFocusMismatch(client, [], []);
    expect(stamped).toHaveLength(0);
    expect(client.updates).toHaveLength(0);
  });

  it('SKIPS a dead/missing session -- that is clearHalfReleasedSdClaims\'s job, not this one\'s', async () => {
    const client = makeClient({
      sds: [heldSd()],
      sessions: [{ id: HOLDER, sd_key: 'QF-something-else', status: 'stale' }],
    });
    const stamped = await detectClaimFocusMismatch(client, [], []);
    expect(stamped).toHaveLength(0);
    expect(client.updates).toHaveLength(0);
  });

  it('is idempotent -- a row already stamped is skipped on the next tick', async () => {
    const alreadyStamped = heldSd({ metadata: { claim_focus_mismatch: { detected_at: '2026-08-24T00:00:00Z' } } });
    const client = makeClient({
      sds: [alreadyStamped],
      sessions: [{ id: HOLDER, sd_key: 'QF-20260817-982', status: 'active' }],
    });
    const stamped = await detectClaimFocusMismatch(client, [], []);
    expect(stamped).toHaveLength(0);
    expect(client.updates).toHaveLength(0);
  });

  it('does not throw out of the sweep -- one bad tick must not kill the pass', async () => {
    const client = { from() { throw new Error('boom'); } };
    await expect(detectClaimFocusMismatch(client, [], [])).resolves.toBeDefined();
  });
});
