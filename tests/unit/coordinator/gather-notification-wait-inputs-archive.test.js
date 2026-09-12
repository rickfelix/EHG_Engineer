// QF-20260911-078: gatherNotificationWaitInputs read the live session_coordination table only.
// cleanup_expired_coordination archives a Notification-wait row well inside the 24h lookback this
// detector uses (measured live: ALL of this category's rows are currently in retention_archive,
// zero live) -- a live-only read false-zeros every stuck seat whose wait already moved there.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { gatherNotificationWaitInputs } = require('../../../lib/coordinator/coordination-events.cjs');

const NOW = new Date('2026-09-12T00:00:00.000Z').getTime();

/** Minimal chainable fake: every chain method but the terminal .range() returns `this`. */
function chain(rows) {
  const obj = {
    select() { return obj; },
    eq() { return obj; },
    gte() { return obj; },
    order() { return obj; },
    range: () => Promise.resolve({ data: rows, error: null }),
  };
  return obj;
}

function fakeSupabase({ liveRows = [], archiveRows = [] } = {}) {
  return {
    from(table) {
      if (table === 'session_coordination') return chain(liveRows);
      if (table === 'retention_archive') return chain(archiveRows);
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

describe('gatherNotificationWaitInputs archive union (QF-20260911-078)', () => {
  it('returns the live wait when only the live table holds it (no regression)', async () => {
    const supabase = fakeSupabase({
      liveRows: [{ sender_session: 'seat-1', created_at: '2026-09-11T23:00:00.000Z' }],
    });
    const { waits } = await gatherNotificationWaitInputs(supabase, { now: NOW });
    expect(waits).toEqual([{ session_id: 'seat-1', created_at: '2026-09-11T23:00:00.000Z' }]);
  });

  it('returns the wait from the archive when the live table has already archived it (the measured live case)', async () => {
    const supabase = fakeSupabase({
      liveRows: [],
      archiveRows: [{
        row_data: {
          sender_session: 'seat-2',
          created_at: '2026-09-11T22:00:00.000Z',
          payload: { kind: 'notification_permission_wait' },
        },
      }],
    });
    const { waits } = await gatherNotificationWaitInputs(supabase, { now: NOW });
    expect(waits).toEqual([{ session_id: 'seat-2', created_at: '2026-09-11T22:00:00.000Z' }]);
  });

  it('ignores an archived row of a DIFFERENT kind (e.g. the split-off notification_idle_prompt)', async () => {
    const supabase = fakeSupabase({
      archiveRows: [{
        row_data: {
          sender_session: 'seat-3',
          created_at: '2026-09-11T22:00:00.000Z',
          payload: { kind: 'notification_idle_prompt' },
        },
      }],
    });
    const { waits } = await gatherNotificationWaitInputs(supabase, { now: NOW });
    expect(waits).toEqual([]);
  });

  it('per session, keeps whichever of the live/archived rows is NEWEST, regardless of source', async () => {
    const supabase = fakeSupabase({
      liveRows: [{ sender_session: 'seat-4', created_at: '2026-09-11T20:00:00.000Z' }],
      archiveRows: [{
        row_data: { sender_session: 'seat-4', created_at: '2026-09-11T23:00:00.000Z', payload: { kind: 'notification_permission_wait' } },
      }],
    });
    const { waits } = await gatherNotificationWaitInputs(supabase, { now: NOW });
    expect(waits).toEqual([{ session_id: 'seat-4', created_at: '2026-09-11T23:00:00.000Z' }]);
  });

  it('fails open (empty waits, never throws) when the archive query itself errors', async () => {
    const supabase = {
      from(table) {
        if (table === 'session_coordination') return chain([{ sender_session: 'seat-5', created_at: '2026-09-11T23:00:00.000Z' }]);
        if (table === 'retention_archive') {
          return { select() { return this; }, eq() { return this; }, gte() { return this; }, order() { return this; }, range: () => Promise.reject(new Error('archive down')) };
        }
        throw new Error(`unexpected table: ${table}`);
      },
    };
    const { waits } = await gatherNotificationWaitInputs(supabase, { now: NOW });
    // The archive failure must not suppress the live-row signal (fail-open, never fail-closed).
    expect(waits).toEqual([{ session_id: 'seat-5', created_at: '2026-09-11T23:00:00.000Z' }]);
  });
});
