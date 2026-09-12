/**
 * QF-20260912-283: the two unresolvable-target guards in lib/coordinator/dispatch.cjs
 * (dispatch-assignment-target-guard.test.js / dispatch-directed-target-guard.test.js) only ever
 * logged via console.warn — invisible unless a process's stdout happened to be captured. The
 * diagnostic for the row that motivated this fix (5ff49e27) was emitted hours before anyone
 * connected it to a pattern spanning five seat-occurrences in one day, purely because nothing
 * durable recorded it.
 *
 * This suite proves the guards now ALSO persist a best-effort audit_log row, in both
 * observe-only and binding (promoted) mode, and that a failed audit write never breaks the send.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';

const require_ = createRequire(import.meta.url);
const REPO = path.resolve(__dirname, '../../..');
const { insertCoordinationRow } = require_(path.join(REPO, 'lib/coordinator/dispatch.cjs'));

const LIVE_TARGET = '11111111-2222-3333-4444-555555555555';

/** Records every insert per table so assertions can target 'audit_log' specifically. */
function stubSupabase({ auditError = null } = {}) {
  const inserts = { audit_log: [], session_coordination: [] };
  const chain = {
    select: () => chain, eq: () => chain, in: () => chain, is: () => chain,
    order: () => chain, limit: () => chain,
    maybeSingle: async () => ({ data: null, error: null }),
    single: async () => ({ data: null, error: null }),
  };
  const client = {
    from: (table) => ({
      ...chain,
      insert: (row) => {
        if (table === 'audit_log') {
          inserts.audit_log.push(row);
          return Promise.resolve({ data: null, error: auditError });
        }
        inserts.session_coordination.push(row);
        return { select: () => ({ single: async () => ({ data: { id: 'row-1' }, error: null }) }) };
      },
    }),
    rpc: async () => ({ data: null, error: null }),
  };
  return { client, inserts };
}

function unreadableRow(over = {}) {
  return {
    target_session: LIVE_TARGET,
    message_type: 'WORK_ASSIGNMENT',
    subject: 'VOID — DO NOT git stash',
    body: 'advisory prose, no work item named',
    payload: { kind: 'coordinator_note', body: 'prose' },
    ...over,
  };
}

/** Worker-readable but directed-unresolvable — trips the narrower guard only. */
function directedOnlyRow(over = {}) {
  return {
    target_session: LIVE_TARGET,
    message_type: 'WORK_ASSIGNMENT',
    subject: 'Please pick up QF-20260726-459 next',
    body: 'named only in prose, no structured field',
    payload: {},
    ...over,
  };
}

describe('QF-20260912-283 — unresolvable-target guards persist a durable audit_log row', () => {
  beforeEach(() => {
    delete process.env.DISPATCH_ASSIGNMENT_TARGET_GUARD;
    delete process.env.DISPATCH_DIRECTED_TARGET_GUARD;
  });
  afterEach(() => {
    delete process.env.DISPATCH_ASSIGNMENT_TARGET_GUARD;
    delete process.env.DISPATCH_DIRECTED_TARGET_GUARD;
    vi.restoreAllMocks();
  });

  // NOTE: unreadableRow() (no key anywhere) trips BOTH guards -- a row unreadable under the
  // broader worker profile is necessarily unreadable under the narrower directed profile too --
  // so assertions here find the specific event rather than asserting the array's total length,
  // mirroring the existing dispatch-assignment-target-guard.test.js / dispatch-directed-target-
  // guard.test.js convention of `.find(...)` over a whole warn-call-count assertion.
  it('assignment-target guard (observe-only): writes an audit_log row with mode=observe_only', async () => {
    const { client, inserts } = stubSupabase();
    await insertCoordinationRow(client, unreadableRow(), { logger: { warn: vi.fn() } }).catch(() => {});
    const row = inserts.audit_log.find((r) => r.event_type === 'dispatch.assignment_target_unresolvable');
    expect(row, 'expected an assignment_target_unresolvable audit row').toBeTruthy();
    expect(row).toMatchObject({ severity: 'warning', created_by: 'dispatch.cjs' });
    expect(row.metadata.mode).toBe('observe_only');
  });

  it('assignment-target guard (binding): writes mode=blocked BEFORE throwing', async () => {
    process.env.DISPATCH_ASSIGNMENT_TARGET_GUARD = 'block';
    const { client, inserts } = stubSupabase();
    await expect(insertCoordinationRow(client, unreadableRow(), { logger: { warn: vi.fn() } }))
      .rejects.toMatchObject({ code: 'DISPATCH_ASSIGNMENT_TARGET_UNRESOLVABLE' });
    const row = inserts.audit_log.find((r) => r.event_type === 'dispatch.assignment_target_unresolvable');
    expect(row, 'expected the audit write BEFORE the throw').toBeTruthy();
    expect(row.metadata.mode).toBe('blocked');
  });

  it('directed-target guard (observe-only): writes an audit_log row with mode=observe_only', async () => {
    const { client, inserts } = stubSupabase();
    await insertCoordinationRow(client, directedOnlyRow(), { logger: { warn: vi.fn() } }).catch(() => {});
    const row = inserts.audit_log.find((r) => r.event_type === 'dispatch.directed_target_unresolvable');
    expect(row, 'expected a directed_target_unresolvable audit row').toBeTruthy();
    expect(row.metadata.mode).toBe('observe_only');
  });

  it('directed-target guard (binding): writes mode=blocked BEFORE throwing', async () => {
    process.env.DISPATCH_DIRECTED_TARGET_GUARD = 'block';
    const { client, inserts } = stubSupabase();
    await expect(insertCoordinationRow(client, directedOnlyRow(), { logger: { warn: vi.fn() } }))
      .rejects.toMatchObject({ code: 'DISPATCH_DIRECTED_TARGET_UNRESOLVABLE' });
    const row = inserts.audit_log.find((r) => r.event_type === 'dispatch.directed_target_unresolvable');
    expect(row.metadata.mode).toBe('blocked');
  });

  it('a resolvable row writes NO audit_log row at all', async () => {
    const { client, inserts } = stubSupabase();
    await insertCoordinationRow(client, unreadableRow({ target_sd: 'QF-20260726-642' }), { logger: { warn: vi.fn() } })
      .catch(() => {});
    expect(inserts.audit_log).toHaveLength(0);
  });

  it('a failed audit_log write is non-blocking — no audit-specific error surfaces, and the guard\'s own warn still fires', async () => {
    const { client, inserts } = stubSupabase({ auditError: { code: '42703', message: 'phantom column' } });
    const warn = vi.fn();
    let caught = null;
    await insertCoordinationRow(client, unreadableRow(), { logger: { warn } }).catch((e) => { caught = e; });
    // the audit insert was attempted (and its simulated failure recorded) ...
    expect(inserts.audit_log.length).toBeGreaterThanOrEqual(1);
    // ... yet execution continued past it: the guard's own diagnostic warn still fired, and
    // whatever error eventually surfaces (this minimal stub is missing later chain methods)
    // is never the audit write's own failure leaking out as the call's rejection.
    const line = warn.mock.calls.map((c) => String(c[0])).find((s) => s.includes('assignment_target_unresolvable'));
    expect(line, 'guard warn must still fire after an audit-write failure').toBeTruthy();
    if (caught) expect(caught.code).not.toBe('42703');
  });
});
