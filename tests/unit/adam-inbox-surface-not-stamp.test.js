/**
 * SD-LEO-INFRA-ADAM-INBOX-SURFACE-NOT-STAMP-001 — the read-stamped-not-processed permanent fix.
 *
 * FR-1: background drains stamp delivered_at only (read_at reserved for operator-visible turns)
 * FR-2: acknowledged_at IS NULL recovery tier is universal across sender lanes
 * FR-3: quiet tick emits unacked directed rows as first-class QUIET_TICK_INBOX_ITEM= /
 *        QUIET_TICK_INBOX_DIRECTIVE= lines with payload.tick_surfaced_at print-once dedup
 * FR-4: interactive drain filters acknowledged_at IS NULL; ack subcommand is the only
 *        action-time acknowledged_at stamp
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { drainInbox, drainReplies, stampSurfaced, ackRows, EXCLUDED_KINDS, DEFAULT_DRAIN_WINDOW_MS } = require('../../scripts/adam-advisory.cjs');
const { isRecoverableTierRow } = require('../../scripts/read-adam-directives.cjs');
const { ADAM_EXCLUDED_KINDS, DIRECTIVE_KINDS } = require('../../lib/fleet/worker-status.cjs');
const { COMPOSED_CORES, surfaceInboxItems } = await import('../../scripts/adam-quiet-tick.mjs');

const ADAM = 'adam-session-uuid';

/**
 * Recording supabase mock: query-filter capture + FIFO responses per table, plus a log of
 * every update payload/filters so stamp semantics are assertable.
 */
function makeMock(selectRows = []) {
  const updates = [];
  const selects = [];
  function chain(table) {
    const state = { table, op: 'select', filters: [], updatePayload: null, head: false };
    const c = {
      select: (cols, opts) => { if (opts && opts.head) { state.head = true; } return c; },
      update: (payload) => { state.op = 'update'; state.updatePayload = payload; return c; },
      eq: (col, v) => { state.filters.push(['eq', col, v]); return c; },
      in: (col, v) => { state.filters.push(['in', col, v]); return c; },
      is: (col, v) => { state.filters.push(['is', col, v]); return c; },
      gte: (col, v) => { state.filters.push(['gte', col, v]); return c; },
      lt: (col, v) => { state.filters.push(['lt', col, v]); return c; },
      order: () => c,
      limit: () => c,
      single: () => finish(),
      maybeSingle: () => finish(),
      then: (res, rej) => finish().then(res, rej),
    };
    async function finish() {
      if (state.op === 'update') { updates.push(state); return { data: [], error: null }; }
      selects.push(state);
      if (state.head) return { count: 0, error: null };
      return { data: selectRows, error: null };
    }
    return c;
  }
  return { supabase: { from: chain }, updates, selects };
}

function row(overrides = {}) {
  return {
    id: 'row-' + Math.abs(JSON.stringify(overrides).split('').reduce((a, ch) => a + ch.charCodeAt(0), 0)),
    sender_session: 's1', sender_type: 'agent', message_type: 'INFO',
    subject: 'subj', body: 'body', payload: { kind: 'adam_advisory' },
    created_at: new Date(Date.now() - 5 * 60_000).toISOString(),
    read_at: null,
    ...overrides,
  };
}

describe('FR-1/FR-4: stamp routing (stampSurfaced)', () => {
  it('background=true stamps delivered_at only-where-NULL and never touches read_at', async () => {
    const { supabase, updates } = makeMock();
    await stampSurfaced(supabase, ['a', 'b'], { background: true });
    expect(updates).toHaveLength(1);
    expect(Object.keys(updates[0].updatePayload)).toEqual(['delivered_at']);
    expect(updates[0].filters).toContainEqual(['is', 'delivered_at', null]);
    expect(JSON.stringify(updates[0])).not.toContain('read_at');
  });

  it('interactive (default) stamps read_at only-where-NULL and never delivered_at/acknowledged_at', async () => {
    const { supabase, updates } = makeMock();
    await stampSurfaced(supabase, ['a']);
    expect(updates).toHaveLength(1);
    expect(Object.keys(updates[0].updatePayload)).toEqual(['read_at']);
    expect(updates[0].filters).toContainEqual(['is', 'read_at', null]);
    expect(JSON.stringify(updates[0])).not.toContain('acknowledged_at');
  });

  it('empty id list is a no-op', async () => {
    const { supabase, updates } = makeMock();
    await stampSurfaced(supabase, [], { background: true });
    expect(updates).toHaveLength(0);
  });
});

describe('FR-4: interactive drainInbox filters acknowledged_at IS NULL (recoverable until actioned)', () => {
  it('queries ack-IS-NULL (not read_at) with a created_at window — read-stamped rows resurface', async () => {
    const r = row({ read_at: new Date().toISOString() }); // the incident class: read=Y ack=N
    const { supabase, selects, updates } = makeMock([r]);
    await drainInbox(supabase, ADAM, { quiet: true });
    const mainSelect = selects.find(s => !s.head);
    expect(mainSelect.filters).toContainEqual(['is', 'acknowledged_at', null]);
    expect(mainSelect.filters.some(f => f[0] === 'is' && f[1] === 'read_at')).toBe(false);
    expect(mainSelect.filters.some(f => f[0] === 'gte' && f[1] === 'created_at')).toBe(true);
    // surfaced interactively -> read_at stamp attempted (idempotent only-where-NULL)
    const stamp = updates.find(u => u.updatePayload && 'read_at' in u.updatePayload);
    expect(stamp).toBeTruthy();
  });

  it('background drainInbox stamps delivered_at instead of read_at', async () => {
    const { supabase, updates } = makeMock([row()]);
    await drainInbox(supabase, ADAM, { quiet: true, background: true });
    const stamp = updates.find(u => u.updatePayload && 'delivered_at' in u.updatePayload);
    expect(stamp).toBeTruthy();
    expect(updates.some(u => u.updatePayload && 'read_at' in u.updatePayload)).toBe(false);
  });

  it('drainReplies uses the same ack-IS-NULL filter and stamp routing', async () => {
    const r = row({ payload: { kind: 'coordinator_reply', reply_to: 'corr-1', body: 'answer' } });
    const { supabase, selects, updates } = makeMock([r]);
    await drainReplies(supabase, ADAM, { background: true });
    expect(selects[0].filters).toContainEqual(['is', 'acknowledged_at', null]);
    expect(updates.find(u => 'delivered_at' in (u.updatePayload || {}))).toBeTruthy();
    expect(updates.some(u => 'read_at' in (u.updatePayload || {}))).toBe(false);
  });
});

describe('FR-4: ack subcommand is the action-time stamp', () => {
  function ackMock() {
    const updates = [];
    const supabase = { from: () => {
      const state = { payload: null, guards: [] };
      const c = {
        update: (payload) => { state.payload = payload; return c; },
        eq: (col, v) => { state.guards.push([col, v]); return c; },
        is: (col, v) => { state.guards.push([col, v]); return c; },
        in: () => c,
        select: async () => {
          updates.push(state);
          return { data: [{ id: 'id-1', read_at: '2026-07-10T00:00:00Z' }], error: null };
        },
        then: (res) => Promise.resolve({ data: [], error: null }).then(res),
      };
      return c;
    } };
    return { supabase, updates };
  }

  it('stamps acknowledged_at only-where-NULL (idempotent)', async () => {
    const { supabase, updates } = ackMock();
    await ackRows(supabase, ['id-1']);
    expect(updates).toHaveLength(1);
    expect(Object.keys(updates[0].payload)).toEqual(['acknowledged_at']);
    expect(updates[0].guards).toContainEqual(['acknowledged_at', null]);
  });

  it('ownership guard: with expectedTarget the update is scoped to target_session', async () => {
    const { supabase, updates } = ackMock();
    await ackRows(supabase, ['id-1'], { expectedTarget: ADAM });
    expect(updates).toHaveLength(1);
    expect(updates[0].guards).toContainEqual(['target_session', ADAM]);
  });
});

describe('FR-2: universal recovery tier membership', () => {
  it('admits every sender lane: adam_advisory, coordinator_reply, untyped', () => {
    expect(isRecoverableTierRow(row({ payload: { kind: 'adam_advisory' } }))).toBe(true);
    expect(isRecoverableTierRow(row({ payload: { kind: 'coordinator_reply' } }))).toBe(true);
    expect(isRecoverableTierRow(row({ payload: {} }))).toBe(true);
    expect(isRecoverableTierRow(row({ payload: null }))).toBe(true);
  });

  it('excludes exactly the handler-owned/terminal kinds (single canonical list)', () => {
    for (const k of ADAM_EXCLUDED_KINDS) {
      expect(isRecoverableTierRow(row({ payload: { kind: k } }))).toBe(false);
    }
    expect(EXCLUDED_KINDS).toBe(ADAM_EXCLUDED_KINDS); // one list, no drift
  });
});

describe('FR-1/FR-3: quiet tick', () => {
  it('COMPOSED_CORES inbox-monitor runs the drain with --background (cron may never consume)', () => {
    const core = COMPOSED_CORES.find(c => c.key === 'inbox-monitor');
    expect(core.args).toContain('--background');
    expect(core.args).toContain('--quiet');
  });

  it('surfaceInboxItems: ITEMs dedup via tick_surfaced_at; DIRECTIVEs re-print every tick until acked', async () => {
    const fresh = row({ payload: { kind: 'adam_advisory' } });
    const directive = row({ payload: { kind: DIRECTIVE_KINDS[0] } });
    // an already-tick-surfaced DIRECTIVE must STILL surface (hard interrupt — dedup never applies)
    const surfacedDirective = row({ payload: { kind: DIRECTIVE_KINDS[0], tick_surfaced_at: '2026-07-10T00:00:00Z', reply_needed: true } });
    const alreadySurfaced = row({ payload: { kind: 'adam_advisory', tick_surfaced_at: '2026-07-10T00:00:00Z' } });
    const excluded = row({ payload: { kind: 'canary_request' } });
    const updates = [];
    const sb = { from: (table) => {
      const state = { table, filters: [], payload: null, op: 'select' };
      const c = {
        select: () => c,
        update: (p) => { state.op = 'update'; state.payload = p; return c; },
        eq: (col, v) => { state.filters.push([col, v]); return c; },
        is: () => c, gte: () => c, order: () => c, limit: () => c, or: () => c,
        single: async () => ({ data: { session_id: ADAM, metadata: { role: 'adam' } }, error: null }),
        then: (res) => {
          if (state.op === 'update') { updates.push(state); return Promise.resolve({ data: [], error: null }).then(res); }
          if (state.table === 'claude_sessions') return Promise.resolve({ data: [{ session_id: ADAM }], error: null }).then(res);
          return Promise.resolve({ data: [fresh, directive, surfacedDirective, alreadySurfaced, excluded], error: null }).then(res);
        },
      };
      return c;
    } };
    const out = await surfaceInboxItems(sb);
    expect(out.items.map(i => i.id).sort()).toEqual([directive.id, fresh.id, surfacedDirective.id].sort());
    expect(out.directives).toBe(2);
    expect(out.items.find(i => i.id === directive.id).isDirective).toBe(true);
    // dedup marker stamped ONLY on the fresh ITEM-class row (directives never marked —
    // they must re-print every tick until acknowledged); only payload written
    expect(updates).toHaveLength(1);
    for (const u of updates) {
      expect(Object.keys(u.payload)).toEqual(['payload']);
      expect(u.payload.payload.tick_surfaced_at).toBeTruthy();
      expect(u.payload.payload.kind).toBe('adam_advisory');
      expect(JSON.stringify(u.payload)).not.toContain('read_at');
      expect(JSON.stringify(u.payload)).not.toContain('acknowledged_at');
    }
  });

  it('the cron prompt allowlist includes both INBOX tokens (no-op gate cannot swallow a directive)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../../scripts/adam-startup-check.mjs', import.meta.url), 'utf8');
    const quietTickPrompt = src.slice(src.indexOf("key: 'quiet-tick'"), src.indexOf("key: 'governance-scan'"));
    expect(quietTickPrompt).toContain('QUIET_TICK_INBOX_DIRECTIVE');
    expect(quietTickPrompt).toContain('QUIET_TICK_INBOX_ITEM');
  });

  it('surfaceInboxItems is fail-soft on query error', async () => {
    const sb = { from: () => { throw new Error('db down'); } };
    const out = await surfaceInboxItems(sb);
    expect(out.items).toEqual([]);
  });

  it('SD-LEO-INFRA-ACKSTAMP-FALSE-METRICS-C6-001: a directive with a correlated reply stops re-printing', async () => {
    const directive = row({ payload: { kind: DIRECTIVE_KINDS[0] } });
    const correlatedReply = { id: 'reply-1', payload: { reply_to: directive.id }, sender_session: ADAM, target_session: 'someone-else' };
    const sb = { from: (table) => {
      const state = { table, filters: [], payload: null, op: 'select', usedOr: false };
      const c = {
        select: () => c,
        update: (p) => { state.op = 'update'; state.payload = p; return c; },
        eq: (col, v) => { state.filters.push([col, v]); return c; },
        is: () => c, gte: () => c, order: () => c, limit: () => c,
        or: () => { state.usedOr = true; return c; },
        single: async () => ({ data: { session_id: ADAM, metadata: { role: 'adam' } }, error: null }),
        then: (res) => {
          if (state.op === 'update') return Promise.resolve({ data: [], error: null }).then(res);
          if (state.table === 'claude_sessions') return Promise.resolve({ data: [{ session_id: ADAM }], error: null }).then(res);
          // The correlation-window query (identified by .or()) sees the reply; the
          // primary ack-null query does not (the reply targets someone-else, not Adam).
          if (state.usedOr) return Promise.resolve({ data: [directive, correlatedReply], error: null }).then(res);
          return Promise.resolve({ data: [directive], error: null }).then(res);
        },
      };
      return c;
    } };
    const out = await surfaceInboxItems(sb);
    expect(out.items.map((i) => i.id)).not.toContain(directive.id);
    expect(out.directives).toBe(0);
  });

  it('SD-LEO-INFRA-ACKSTAMP-FALSE-METRICS-C6-001: a directive with no correlated reply still hard-interrupts', async () => {
    const directive = row({ payload: { kind: DIRECTIVE_KINDS[0] } });
    const sb = { from: (table) => {
      const state = { table, filters: [], payload: null, op: 'select', usedOr: false };
      const c = {
        select: () => c,
        update: (p) => { state.op = 'update'; state.payload = p; return c; },
        eq: (col, v) => { state.filters.push([col, v]); return c; },
        is: () => c, gte: () => c, order: () => c, limit: () => c,
        or: () => { state.usedOr = true; return c; },
        single: async () => ({ data: { session_id: ADAM, metadata: { role: 'adam' } }, error: null }),
        then: (res) => {
          if (state.op === 'update') return Promise.resolve({ data: [], error: null }).then(res);
          if (state.table === 'claude_sessions') return Promise.resolve({ data: [{ session_id: ADAM }], error: null }).then(res);
          if (state.usedOr) return Promise.resolve({ data: [directive], error: null }).then(res);
          return Promise.resolve({ data: [directive], error: null }).then(res);
        },
      };
      return c;
    } };
    const out = await surfaceInboxItems(sb);
    expect(out.items.map((i) => i.id)).toContain(directive.id);
    expect(out.directives).toBe(1);
  });
});

describe('constants', () => {
  it('interactive drain window defaults to 7 days', () => {
    expect(DEFAULT_DRAIN_WINDOW_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
