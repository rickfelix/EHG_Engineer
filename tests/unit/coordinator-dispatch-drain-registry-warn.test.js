/**
 * SD-LEO-INFRA-DRAIN-SET-REGISTRY-001-B (Child A) FR-3 / TS-5.
 *
 * tests/unit/fleet/drain-sets-send-warn.test.js pins warnIfUndrainedKind and
 * resolveTargetRole in ISOLATION — it never calls insertCoordinationRow, so it
 * cannot prove the repoint (a completely broken repoint would still pass it).
 * THIS file drives insertCoordinationRow (the actual choke point) directly,
 * with a mocked supabase, proving the registry-backed warn check fires
 * correctly both when role_drain_sets returns real rows and when it errors
 * (the unapplied/STAGED state) — mirrors the stub pattern in
 * coordinator-dispatch-addressee-warn.test.js.
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { insertCoordinationRow } = require('../../lib/coordinator/dispatch.cjs');

const LIVE_TARGET = '0f8d45d8-9531-4ab8-a1b9-6961c405e1ec';

function stubSupabase({ drainSetsError = null, drainSetsRows = null } = {}) {
  return {
    from(table) {
      const chain = {
        select() { return chain; },
        eq(_col, val) { chain._eq = val; return chain; },
        limit() { return chain; },
        maybeSingle() {
          if (table === 'claude_sessions') {
            return Promise.resolve({ data: chain._eq === LIVE_TARGET ? { session_id: LIVE_TARGET, status: 'active' } : null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        insert(r) { chain._inserted = r; return chain; },
        then(res, rej) {
          if (table === 'role_drain_sets') {
            if (drainSetsError) return Promise.resolve({ data: null, error: drainSetsError }).then(res, rej);
            return Promise.resolve({ data: drainSetsRows || [], error: null }).then(res, rej);
          }
          return Promise.resolve({ data: chain._inserted || null, error: null }).then(res, rej);
        },
      };
      return chain;
    },
  };
}

describe('insertCoordinationRow: drain-set-registry-backed WARN (SD-LEO-INFRA-DRAIN-SET-REGISTRY-001-B FR-3)', () => {
  it('WARNs on an undrained kind when role_drain_sets is UNAPPLIED (PGRST205-style error) -- fail-open to hard-coded DRAIN_SETS, matching current behavior', async () => {
    const warn = vi.fn();
    const row = {
      message_type: 'INFO', target_session: LIVE_TARGET,
      payload: { kind: 'adam_advisory' },
    };
    await insertCoordinationRow(
      stubSupabase({ drainSetsError: { code: 'PGRST205', message: 'relation "role_drain_sets" does not exist' } }),
      row,
      { logger: { warn, error() {}, log() {} }, targetRoleHint: 'solomon' }
    );
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toContain('adam_advisory');
    expect(warn.mock.calls[0][0]).toContain('solomon');
  });

  it('WARNs on an undrained kind when role_drain_sets returns real rows not containing it', async () => {
    const warn = vi.fn();
    const row = {
      message_type: 'INFO', target_session: LIVE_TARGET,
      payload: { kind: 'solomon_systemic_finding' },
    };
    await insertCoordinationRow(
      stubSupabase({ drainSetsRows: [{ kind: 'coordinator_request' }, { kind: 'solomon_consult' }] }),
      row,
      { logger: { warn, error() {}, log() {} }, targetRoleHint: 'solomon' }
    );
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toContain('solomon_systemic_finding');
  });

  it('does NOT warn when role_drain_sets returns rows that DO contain the kind', async () => {
    const warn = vi.fn();
    const row = {
      message_type: 'INFO', target_session: LIVE_TARGET,
      payload: { kind: 'solomon_consult' },
    };
    await insertCoordinationRow(
      stubSupabase({ drainSetsRows: [{ kind: 'solomon_consult' }] }),
      row,
      { logger: { warn, error() {}, log() {} }, targetRoleHint: 'solomon' }
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('never blocks the insert on a registry-backed WARN -- the row still lands', async () => {
    const row = {
      message_type: 'INFO', target_session: LIVE_TARGET,
      payload: { kind: 'adam_advisory' },
    };
    const res = await insertCoordinationRow(
      stubSupabase({ drainSetsError: { code: 'PGRST205', message: 'not found' } }),
      row,
      { logger: { warn() {}, error() {}, log() {} }, targetRoleHint: 'solomon' }
    );
    expect(res.data.payload.kind).toBe('adam_advisory');
  });

  it('is silent on terminal reply kinds regardless of registry state', async () => {
    const warn = vi.fn();
    const row = {
      message_type: 'INFO', target_session: LIVE_TARGET,
      payload: { kind: 'ack' },
    };
    await insertCoordinationRow(
      stubSupabase({ drainSetsError: { code: 'PGRST205', message: 'not found' } }),
      row,
      { logger: { warn, error() {}, log() {} }, targetRoleHint: 'solomon' }
    );
    expect(warn).not.toHaveBeenCalled();
  });
});
