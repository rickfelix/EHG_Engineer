/**
 * QF-20260703-314: resolveCheckin's --model/--effort merge-write (step 2c) must not clobber
 * a concurrent writer (e.g. scripts/assign-fleet-identities.cjs setting metadata.fleet_identity)
 * that lands between step 2's initial read and the merge-write. Root cause: the write persisted
 * a metadata object built from the step-2 snapshot instead of re-reading fresh immediately
 * before writing -- backlog cfea31a7 (worker 3c40949b lost its Charlie/red identity within 9min
 * of assignment).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { resolveCheckin } = require('../../scripts/worker-checkin.cjs');

function fakeSbWithConcurrentIdentityWrite() {
  let claudeSessionsReads = 0;
  const updates = [];
  return {
    updates,
    rpc: () => Promise.resolve({ data: { success: true }, error: null }),
    from(table) {
      return {
        select() { return this; }, eq() { return this; }, gte() { return this; },
        order() { return this; }, limit() { return this; },
        maybeSingle() {
          if (table === 'claude_sessions') {
            claudeSessionsReads++;
            if (claudeSessionsReads === 1) {
              // step-2 read: no model/effort, no fleet_identity yet
              return Promise.resolve({ data: { metadata: { role: 'worker' }, sd_key: null }, error: null });
            }
            // step-2c fresh re-read: a concurrent writer set fleet_identity since step 2
            return Promise.resolve({
              data: { metadata: { role: 'worker', fleet_identity: { callsign: 'Charlie', color: 'red' } }, sd_key: null },
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        },
        insert() { return Promise.resolve({ error: null }); },
        update(payload) {
          return { eq() { updates.push({ table, payload }); return Promise.resolve({ error: null }); } };
        },
      };
    },
  };
}

describe('resolveCheckin — model/effort merge-write re-reads fresh before writing (QF-20260703-314)', () => {
  it('preserves a fleet_identity set concurrently between the step-2 read and the merge-write', async () => {
    const sb = fakeSbWithConcurrentIdentityWrite();
    const ws = require('../../lib/fleet/worker-status.cjs');
    const orig = ws.getMessagesForSession;
    ws.getMessagesForSession = async () => [];
    try {
      await resolveCheckin(sb, 'sess-race', { getCoordinator: async () => null, model: 'sonnet', effort: 'high' });
      const metaUpdate = sb.updates.find(
        (u) => u.table === 'claude_sessions' && u.payload.metadata && u.payload.metadata.model === 'sonnet'
      );
      expect(metaUpdate).toBeTruthy();
      // The bug: this would be undefined (clobbered) because the write used the step-2
      // snapshot, which predates the concurrent fleet_identity assignment.
      expect(metaUpdate.payload.metadata.fleet_identity).toEqual({ callsign: 'Charlie', color: 'red' });
    } finally {
      ws.getMessagesForSession = orig;
    }
  });
});
