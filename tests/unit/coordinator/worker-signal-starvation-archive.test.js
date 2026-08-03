// SD-LEO-INFRA-RETENTION-DESTROYS-REPLY-001 — the gauge could not see its own evidence.
//
// cleanup_expired_coordination does ARCHIVE-before-delete: an acknowledged, expired coordination row
// is copied whole into retention_archive and removed from the live table, typically within an hour of
// being acked. The starvation fetch read the live table only, so for the remaining ~23 hours of its
// 24h lookback an ANSWERED signal had no visible proof and reported as starved.
//
// Measured 2026-08-03 over one 24h window: 779 live rows vs 1,486 archived — about two thirds of the
// window this gauge claims to measure was outside what it could see. And MAX_SIGNALS was 500 against
// 779 live rows, ordered created_at DESC, so the OLDEST 279 were discarded before the detector saw
// them — starvation IS age, so the cap removed exactly the population the gauge exists to find.
//
// WHY EVERY ASSERTION HERE IS TWO-SIDED: every false result this detector has produced made it
// QUIETER — four mechanisms now (uncountable roll-calls, uncorrelatable replies, archived replies,
// and the cap). Shipping this fix SHOULD make the starved count fall, because answered-but-archived
// signals stop being counted. But blinding the detector entirely produces the same fall. So the count
// can never be the evidence, and TS-2 — a genuinely unanswered signal still reporting starved — is
// the only assertion that separates a fix from a mute.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const mod = require_('../../../lib/coordinator/worker-signal-starvation.cjs');
const { reportWorkerSignalStarvation, reviveArchivedSignal, assertNonBinding, MAX_SIGNALS } = mod;

const NOW = Date.parse('2026-08-03T12:00:00Z');
const ago = (min) => new Date(NOW - min * 60000).toISOString();

/** A worker signal old enough to be starved unless something proves it was answered. */
const signal = (id, minAgo = 120) => ({
  id, sender_session: 'sess-worker', sender_type: 'worker', message_type: 'INFO',
  acknowledged_at: null, read_at: null,
  payload: { signal_type: 'stuck', body: 'blocked on x' },
  created_at: ago(minAgo),
});

/** A coordinator reply correlated to `toId` — the proof of answer that retention relocates. */
const reply = (id, toId, minAgo = 100) => ({
  id, sender_session: 'sess-coord', sender_type: 'coordinator', message_type: 'INFO',
  acknowledged_at: ago(minAgo), read_at: ago(minAgo),
  payload: { kind: 'coordinator_reply', reply_to: toId },
  created_at: ago(minAgo),
});

/** Minimal supabase double: applies the filters these queries actually use. */
function makeDb({ live = [], archived = [], archiveThrows = false } = {}) {
  return {
    from(table) {
      const chain = {
        _t: table,
        select() { return chain; },
        eq() { return chain; },
        gte() { return chain; },
        order() { return chain; },
        limit(n) {
          if (chain._t === 'retention_archive') {
            if (archiveThrows) return Promise.resolve({ data: null, error: { message: 'archive boom' } });
            return Promise.resolve({ data: archived.slice(0, n).map((r) => ({ row_data: r })), error: null });
          }
          return Promise.resolve({ data: live.slice(0, n), error: null });
        },
      };
      return chain;
    },
  };
}

const run = (db, log = () => {}) =>
  reportWorkerSignalStarvation(db, { now: NOW, log, env: {} });

describe('FR-1: a reply that retention moved to the archive still proves the signal was answered', () => {
  // THE DECIDING SCENARIO. Today this reports starved: the signal is live, its only reply is archived.
  it('reports ANSWERED when the correlated reply exists only in the archive', async () => {
    const sig = signal('sig-1');
    const res = await run(makeDb({ live: [sig], archived: [reply('rep-1', 'sig-1')] }));
    expect(res.measured).toBe(true);
    expect(res.starved).toBe(0);
  });

  // CONTROL — NOT optional. A detector that reports nothing passes the test above and destroys the
  // gauge. This is the assertion that distinguishes a fix from a mute.
  it('CONTROL: a genuinely unanswered signal still reports STARVED', async () => {
    const res = await run(makeDb({ live: [signal('sig-2')], archived: [] }));
    expect(res.measured).toBe(true);
    expect(res.starved).toBe(1);
  });

  // An archived reply for a DIFFERENT signal must not launder this one — otherwise the fix would
  // mark everything answered as soon as any archived reply existed.
  it('does not treat an unrelated archived reply as proof', async () => {
    const res = await run(makeDb({ live: [signal('sig-3')], archived: [reply('rep-x', 'someone-else')] }));
    expect(res.starved).toBe(1);
  });

  // FR-4: the archive is bounded by the same lookback. row_timestamp (=expires_at) is only a coarse
  // indexed bound, so the precise cut must be applied to the revived row's own created_at.
  it('ignores archived rows created outside the lookback window', async () => {
    const stale = reply('rep-old', 'sig-4', 60 * 48); // 48h ago, outside the 24h lookback
    const res = await run(makeDb({ live: [signal('sig-4')], archived: [stale] }));
    expect(res.starved).toBe(1);
  });
});

describe('TR-2: an unreadable archive degrades LOUDLY, never into live-only measurement', () => {
  it('still measures, and says the archive could not be read', async () => {
    const lines = [];
    const res = await run(makeDb({ live: [signal('sig-5')], archiveThrows: true }), (m) => lines.push(m));
    expect(res.measured).toBe(true);
    // A silent fallback to live-only rows is byte-identical to the defect being fixed.
    expect(lines.join('\n')).toMatch(/archive unreadable/i);
  });
});

describe('FR-2: the cap must not silently discard the oldest signals', () => {
  it('is raised far above a realistic window', () => {
    // 779 live + 1,486 archived was one observed 24h window; 500 bound hard against that.
    expect(MAX_SIGNALS).toBeGreaterThan(779 + 1486);
  });

  it('SAYS SO when the cap binds — a truncated window looks identical to a quiet one', () => {
    expect(assertNonBinding(10, 10, 5000)).toBeNull();
    const note = assertNonBinding(4000, 1000, 5000);
    expect(note).toMatch(/TRUNCATED/);
    expect(note).toMatch(/OLDEST/);
    expect(note).toMatch(/FLOOR, not a measurement/);
  });
});

describe('TR-1: revived archive rows match the live row shape', () => {
  // This failure throws NOTHING — a missing field just fails to correlate, reproducing the blindness
  // while every "it didn't crash" test stays green. So it needs its own assertion.
  it('carries every field the live select provides', () => {
    const src = reply('rep-9', 'sig-9');
    const revived = reviveArchivedSignal({ row_data: src });
    for (const f of ['id', 'sender_session', 'sender_type', 'message_type', 'acknowledged_at', 'read_at', 'payload', 'created_at']) {
      expect(revived, `missing ${f}`).toHaveProperty(f);
    }
    expect(revived.payload.reply_to).toBe('sig-9');
    expect(revived.created_at).toBe(src.created_at);
  });

  it('returns null for unusable row_data rather than a half-built row', () => {
    for (const bad of [null, undefined, {}, { row_data: null }, { row_data: 'nope' }, { row_data: {} }]) {
      expect(reviveArchivedSignal(bad)).toBeNull();
    }
  });
});
