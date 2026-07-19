/**
 * QF-20260709-053 — insertCoordinationRow (the choke point) must refuse an Adam-directed
 * send whose payload.kind is neither a typed ADAM_INBOX_KINDS/EXCLUDED_KINDS entry nor a
 * reply. Untyped/unknown kinds targeting Adam fell into scripts/adam-advisory.cjs's
 * reader-side "orphan" class (flagged, never drained) — a silent-drop risk under 30-min
 * throttled ticks. This guard kills the orphan class mechanically at send time.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { insertCoordinationRow } = require('../../lib/coordinator/dispatch.cjs');

const ADAM_TARGET = '0f8d45d8-9531-4ab8-a1b9-6961c405e1ec';
const OTHER_TARGET = '11111111-2222-3333-4444-555555555555';
const silentLog = { warn() {}, error() {}, log() {} };

function stubSupabase({ adamSessionId } = {}) {
  return {
    from(table) {
      const chain = {
        _mode: null,
        select() { return chain; },
        eq(_col, val) { chain._eq = val; return chain; },
        gte() { chain._mode = 'adam-lookup'; return chain; },
        filter() { return chain; },
        limit() { return chain; },
        // FR-6 (count-truncation discipline): fetchFreshAdams paginates via fetchAllPaginated,
        // whose pages end in .order(...).range(from, to) — resolve the same adam-lookup rows.
        order() { return chain; },
        range(from, to) {
          if (table === 'claude_sessions' && chain._mode === 'adam-lookup') {
            const rows = adamSessionId
              ? [{ session_id: adamSessionId, heartbeat_at: new Date().toISOString(), metadata: { role: 'adam', adam_since: '2026-01-01T00:00:00Z' } }]
              : [];
            return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
          }
          return Promise.resolve({ data: [], error: null });
        },
        maybeSingle() {
          if (table === 'claude_sessions') {
            const known = new Set([ADAM_TARGET, OTHER_TARGET]);
            return Promise.resolve({ data: known.has(chain._eq) ? { session_id: chain._eq, status: 'active' } : null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        insert(r) { chain._inserted = r; return chain; },
        then(res, rej) {
          if (table === 'claude_sessions' && chain._mode === 'adam-lookup') {
            const rows = adamSessionId
              ? [{ session_id: adamSessionId, heartbeat_at: new Date().toISOString(), metadata: { role: 'adam', adam_since: '2026-01-01T00:00:00Z' } }]
              : [];
            return Promise.resolve({ data: rows, error: null }).then(res, rej);
          }
          return Promise.resolve({ data: chain._inserted || null, error: null }).then(res, rej);
        },
      };
      return chain;
    },
  };
}

describe('insertCoordinationRow: Adam-directed untyped-kind guard (QF-20260709-053)', () => {
  it('refuses an Adam-directed row with an unknown/untyped payload.kind (the orphan class)', async () => {
    const sb = stubSupabase({ adamSessionId: ADAM_TARGET });
    const row = { message_type: 'INFO', target_session: ADAM_TARGET, payload: { kind: 'coordinator_notice', body: 'fyi' } };
    await expect(insertCoordinationRow(sb, row, { logger: silentLog })).rejects.toMatchObject({
      code: 'DISPATCH_UNTYPED_ADAM_KIND',
    });
  });

  it('allows an Adam-directed row with a typed ADAM_INBOX_KINDS kind', async () => {
    const sb = stubSupabase({ adamSessionId: ADAM_TARGET });
    const row = { message_type: 'INFO', target_session: ADAM_TARGET, payload: { kind: 'chairman_heads_up', body: 'fyi' } };
    const res = await insertCoordinationRow(sb, row, { logger: silentLog });
    expect(res.data.payload.kind).toBe('chairman_heads_up');
  });

  it('allows an Adam-directed row with a handler-owned EXCLUDED_KINDS kind', async () => {
    const sb = stubSupabase({ adamSessionId: ADAM_TARGET });
    const row = { message_type: 'INFO', target_session: ADAM_TARGET, payload: { kind: 'comms_check' } };
    const res = await insertCoordinationRow(sb, row, { logger: silentLog });
    expect(res.data.payload.kind).toBe('comms_check');
  });

  it('allows an Adam-directed reply row even with an untyped kind (reply_to echo)', async () => {
    const sb = stubSupabase({ adamSessionId: ADAM_TARGET });
    const row = { message_type: 'INFO', target_session: ADAM_TARGET, payload: { reply_to: 'corr-1', body: 'answer' } };
    const res = await insertCoordinationRow(sb, row, { logger: silentLog });
    expect(res.data.payload.reply_to).toBe('corr-1');
  });

  it('does not touch a non-Adam-targeted row with an untyped kind', async () => {
    const sb = stubSupabase({ adamSessionId: ADAM_TARGET });
    const row = { message_type: 'INFO', target_session: OTHER_TARGET, payload: { kind: 'coordinator_notice', body: 'fyi' } };
    const res = await insertCoordinationRow(sb, row, { logger: silentLog });
    expect(res.data.payload.kind).toBe('coordinator_notice');
  });

  it('fails open (allows the send) when no live Adam resolves', async () => {
    const sb = stubSupabase({ adamSessionId: null });
    const row = { message_type: 'INFO', target_session: ADAM_TARGET, payload: { kind: 'coordinator_notice', body: 'fyi' } };
    const res = await insertCoordinationRow(sb, row, { logger: silentLog });
    expect(res.data.payload.kind).toBe('coordinator_notice');
  });
});
