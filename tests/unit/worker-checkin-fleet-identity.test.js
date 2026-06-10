// SD-LEO-INFRA-ASSIGN-FLEET-IDENTITY-001: worker check-in self-assigns a fleet identity
// (NATO callsign + color) the moment a worker holds a real claim and lacks one — closing the
// up-to-5-minute lag before the coordinator cron (scripts/assign-fleet-identities.cjs) would name it.
//
// These unit-test assignFleetIdentityAtCheckin (the writer) directly: free-slot selection, the
// read-modify-merge (no clobber), idempotency, coordinator exclusion, pool-exhaustion wrap, and
// the fail-open contract (any error -> null, never throw). Wrapper-level naming gating is covered
// in scripts/worker-checkin.test.js (the proven runCheckin stub).
//
// Sibling pattern: PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 — the cron WRITES identities; the
// reader (check-in) used to only REPORT them. This closes the asymmetry on the read path.

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { assignFleetIdentityAtCheckin } = require('../../scripts/worker-checkin.cjs');
const { NATO } = require('../../scripts/assign-fleet-identities.cjs');

// Focused chainable supabase stub. Distinguishes the helper's calls by terminal method:
//   - self re-read:  claude_sessions .select('metadata').eq().maybeSingle()  -> cfg.selfRow
//   - live used-set: claude_sessions .select('...').gte().neq()  (awaited)   -> cfg.live
//   - metadata write:claude_sessions .update().eq()              (awaited)   -> records rec.update
//   - SET_IDENTITY:  session_coordination .insert()              (awaited)   -> records rec.insert
function stub(cfg = {}) {
  const rec = { update: null, insert: null, updateCount: 0, insertCount: 0 };
  function builder(table) {
    const st = { table, op: 'select', payload: null };
    const chain = {
      select() { return chain; },
      eq() { return chain; },
      gte() { return chain; },
      neq() { return chain; },
      update(p) { st.op = 'update'; st.payload = p; return chain; },
      insert(p) { st.op = 'insert'; st.payload = p; return chain; },
      maybeSingle() {
        if (cfg.selfThrow) return Promise.reject(new Error('self read failed'));
        return Promise.resolve({ data: cfg.selfRow ?? null, error: null });
      },
      then(res, rej) {
        let out;
        if (table === 'claude_sessions' && st.op === 'select') {
          if (cfg.liveThrow) return Promise.reject(new Error('live read failed')).then(res, rej);
          out = { data: cfg.live ?? [], error: null };
        } else if (table === 'claude_sessions' && st.op === 'update') {
          rec.update = st.payload; rec.updateCount++;
          out = { data: null, error: cfg.updateError ?? null };
        } else if (table === 'session_coordination' && st.op === 'insert') {
          rec.insert = st.payload; rec.insertCount++;
          if (cfg.insertThrow) return Promise.reject(new Error('insert failed')).then(res, rej);
          out = { data: { id: 'msg-1' }, error: null };
        } else {
          out = { data: null, error: null };
        }
        return Promise.resolve(out).then(res, rej);
      },
    };
    return chain;
  }
  return { rec, from: (t) => builder(t) };
}

const idRow = (callsigns = [], colors = []) =>
  callsigns.map((c, i) => ({ session_id: `live-${i}`, metadata: { fleet_identity: { callsign: c, color: colors[i] } } }));

describe('assignFleetIdentityAtCheckin — happy path', () => {
  it('assigns the first free NATO callsign + color and reports it', async () => {
    const sb = stub({ selfRow: { metadata: {} }, live: [] });
    const out = await assignFleetIdentityAtCheckin(sb, 'sess-1', 'SD-MINE-001');
    expect(out).toEqual({ callsign: 'Alpha', color: 'blue' });
    // wrote a complete fleet_identity
    expect(sb.rec.update).toBeTruthy();
    const fi = sb.rec.update.metadata.fleet_identity;
    expect(fi.callsign).toBe('Alpha');
    expect(fi.color).toBe('blue');
    expect(fi.display_name).toBe('Alpha | idle'); // cron parity (sd_id label is always 'idle')
    expect(typeof fi.assigned_at).toBe('string');
    // emitted a SET_IDENTITY message (the statusline-visible mechanism)
    expect(sb.rec.insert).toBeTruthy();
    expect(sb.rec.insert.message_type).toBe('SET_IDENTITY');
    expect(sb.rec.insert.payload).toMatchObject({ callsign: 'Alpha', color: 'blue' });
    expect(sb.rec.insert.target_session).toBe('sess-1');
  });

  it('picks the first FREE slot from the live used-set (proves it is not blindly Alpha)', async () => {
    const sb = stub({ selfRow: { metadata: {} }, live: idRow(['Alpha', 'Bravo'], ['blue', 'green']) });
    const out = await assignFleetIdentityAtCheckin(sb, 'sess-1', 'SD-MINE-001');
    expect(out.callsign).toBe('Charlie');
    expect(out.color).toBe('purple');
  });

  it('wraps with a deterministic suffix when the whole NATO pool is used (parity with the cron)', async () => {
    const sb = stub({ selfRow: { metadata: {} }, live: idRow(NATO, NATO.map(() => 'blue')) });
    const out = await assignFleetIdentityAtCheckin(sb, 'sess-1', 'SD-MINE-001');
    // nextAvailable wrap: pool[0] + '-' + (usedSet.size + 1) = 'Alpha-9'
    expect(out.callsign).toBe('Alpha-9');
  });
});

describe('assignFleetIdentityAtCheckin — read-modify-merge (no clobber)', () => {
  it('preserves unrelated metadata keys when writing fleet_identity', async () => {
    const sb = stub({ selfRow: { metadata: { is_coordinator: false, last_action: 'checkin', nested: { a: 1 } } }, live: [] });
    await assignFleetIdentityAtCheckin(sb, 'sess-1', 'SD-MINE-001');
    expect(sb.rec.update.metadata).toMatchObject({
      is_coordinator: false,
      last_action: 'checkin',
      nested: { a: 1 },
    });
    expect(sb.rec.update.metadata.fleet_identity.callsign).toBe('Alpha');
  });
});

describe('assignFleetIdentityAtCheckin — idempotency + exclusions', () => {
  it('returns the existing identity and writes NOTHING when a complete fleet_identity is present', async () => {
    const sb = stub({ selfRow: { metadata: { fleet_identity: { callsign: 'Echo', color: 'cyan' } } } });
    const out = await assignFleetIdentityAtCheckin(sb, 'sess-1', 'SD-MINE-001');
    expect(out).toEqual({ callsign: 'Echo', color: 'cyan' });
    expect(sb.rec.updateCount).toBe(0);
    expect(sb.rec.insertCount).toBe(0);
  });

  it('treats a PARTIAL identity (callsign without color) as un-named and (re)assigns a complete one', async () => {
    const sb = stub({ selfRow: { metadata: { fleet_identity: { callsign: 'Echo' } } }, live: [] });
    const out = await assignFleetIdentityAtCheckin(sb, 'sess-1', 'SD-MINE-001');
    expect(out.callsign).toBe('Alpha');
    expect(out.color).toBe('blue');
    expect(sb.rec.updateCount).toBe(1);
  });

  it('NEVER names a coordinator session (is_coordinator=true) and writes nothing', async () => {
    const sb = stub({ selfRow: { metadata: { is_coordinator: true } }, live: [] });
    const out = await assignFleetIdentityAtCheckin(sb, 'coord-1', 'SD-MINE-001');
    expect(out).toBeNull();
    expect(sb.rec.updateCount).toBe(0);
  });
});

describe('assignFleetIdentityAtCheckin — fail-open (never throws)', () => {
  it('returns null (not throw) when the metadata write errors — worker stays nameless', async () => {
    const sb = stub({ selfRow: { metadata: {} }, live: [], updateError: { message: 'write failed' } });
    const out = await assignFleetIdentityAtCheckin(sb, 'sess-1', 'SD-MINE-001');
    expect(out).toBeNull();
  });

  it('returns null when the self re-read throws', async () => {
    const sb = stub({ selfThrow: true });
    const out = await assignFleetIdentityAtCheckin(sb, 'sess-1', 'SD-MINE-001');
    expect(out).toBeNull();
  });

  it('returns null when the live used-set read throws', async () => {
    const sb = stub({ selfRow: { metadata: {} }, liveThrow: true });
    const out = await assignFleetIdentityAtCheckin(sb, 'sess-1', 'SD-MINE-001');
    expect(out).toBeNull();
  });

  it('still succeeds (identity written) when the SET_IDENTITY insert fails — message is best-effort', async () => {
    const sb = stub({ selfRow: { metadata: {} }, live: [], insertThrow: true });
    const out = await assignFleetIdentityAtCheckin(sb, 'sess-1', 'SD-MINE-001');
    expect(out).toEqual({ callsign: 'Alpha', color: 'blue' });
    expect(sb.rec.updateCount).toBe(1); // the durable write happened
  });
});
