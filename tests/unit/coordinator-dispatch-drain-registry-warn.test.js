/**
 * SD-LEO-INFRA-DRAIN-SET-REGISTRY-001-B (Child A) FR-3 / TS-5.
 *
 * tests/unit/fleet/drain-sets-send-warn.test.js pins warnIfUndrainedKind and
 * resolveTargetRole in ISOLATION — it never calls insertCoordinationRow, so it
 * cannot prove the repoint (a completely broken repoint would still pass it).
 * THIS file drives insertCoordinationRow (the actual choke point) directly,
 * with a mocked supabase, proving the registry-backed check fires correctly
 * both when role_drain_sets returns real rows and when it errors (the
 * unapplied/STAGED state) — mirrors the stub pattern in
 * coordinator-dispatch-addressee-warn.test.js.
 *
 * QF-20260913-426: WARN -> REFUSE tightening for a CONFIDENT mismatch (resolvable
 * role + non-terminal kind absent from that role's recognized set). Two of the
 * original tests below pinned the pre-fix "warn but still land" behavior for
 * exactly this confident-mismatch case — updated to assert the insert now throws
 * DISPATCH_UNDRAINED_KIND instead, per this ticket's explicit fix shape. The
 * AMBIGUOUS-only paths (unresolvable role, matched kind, terminal kind) are
 * unchanged: fail-open, no throw.
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
        is() { return chain; }, // QF-20260831-560: assertSendBackpressure's null check
        gt() { return chain; }, // QF-20260831-560: assertSendBackpressure's expiry check
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
          if (table === 'session_coordination') return Promise.resolve({ count: 0, data: chain._inserted || null, error: null }).then(res, rej);
          return Promise.resolve({ data: chain._inserted || null, error: null }).then(res, rej);
        },
      };
      return chain;
    },
  };
}

describe('insertCoordinationRow: drain-set-registry-backed check (SD-LEO-INFRA-DRAIN-SET-REGISTRY-001-B FR-3 / QF-20260913-426)', () => {
  it('REFUSES (throws DISPATCH_UNDRAINED_KIND) on an undrained kind when role_drain_sets is UNAPPLIED (PGRST205-style error) -- fail-open to hard-coded DRAIN_SETS, which is still a confident mismatch', async () => {
    const row = {
      message_type: 'INFO', target_session: LIVE_TARGET,
      payload: { kind: 'adam_advisory' },
    };
    const error = vi.fn();
    await expect(insertCoordinationRow(
      stubSupabase({ drainSetsError: { code: 'PGRST205', message: 'relation "role_drain_sets" does not exist' } }),
      row,
      { logger: { warn() {}, error, log() {} }, targetRoleHint: 'solomon' }
    )).rejects.toMatchObject({ code: 'DISPATCH_UNDRAINED_KIND' });
    expect(error).toHaveBeenCalledOnce();
    expect(error.mock.calls[0][0]).toContain('adam_advisory');
    expect(error.mock.calls[0][0]).toContain('solomon');
  });

  it('REFUSES (throws DISPATCH_UNDRAINED_KIND) on an undrained kind when role_drain_sets returns real rows not containing it, and names an alternative recognized kind', async () => {
    const row = {
      message_type: 'INFO', target_session: LIVE_TARGET,
      payload: { kind: 'solomon_systemic_finding' },
    };
    const error = vi.fn();
    await expect(insertCoordinationRow(
      stubSupabase({ drainSetsRows: [{ kind: 'coordinator_request' }, { kind: 'solomon_consult' }] }),
      row,
      { logger: { warn() {}, error, log() {} }, targetRoleHint: 'solomon' }
    )).rejects.toMatchObject({ code: 'DISPATCH_UNDRAINED_KIND' });
    expect(error.mock.calls[0][0]).toContain('solomon_systemic_finding');
    // Names one recognized kind that would work (fix-shape item (b)).
    expect(error.mock.calls[0][0]).toContain('coordinator_request');
  });

  it('does NOT warn or refuse when role_drain_sets returns rows that DO contain the kind -- the row still lands', async () => {
    const warn = vi.fn();
    const row = {
      message_type: 'INFO', target_session: LIVE_TARGET,
      payload: { kind: 'solomon_consult' },
    };
    const res = await insertCoordinationRow(
      stubSupabase({ drainSetsRows: [{ kind: 'solomon_consult' }] }),
      row,
      { logger: { warn, error() {}, log() {} }, targetRoleHint: 'solomon' }
    );
    expect(warn).not.toHaveBeenCalled();
    expect(res.data.payload.kind).toBe('solomon_consult');
  });

  it('stays fail-open (no throw, warns instead) when the target role cannot be resolved -- ambiguity is not a confident mismatch', async () => {
    const warn = vi.fn();
    const row = {
      message_type: 'INFO', target_session: LIVE_TARGET,
      payload: { kind: 'adam_advisory' },
    };
    const res = await insertCoordinationRow(
      stubSupabase({ drainSetsError: { code: 'PGRST205', message: 'not found' } }),
      row,
      { logger: { warn, error() {}, log() {} } } // no targetRoleHint, no resolvable role
    );
    expect(res.data.payload.kind).toBe('adam_advisory');
  });

  it('is silent (no warn, no throw) on terminal reply kinds regardless of registry state', async () => {
    const warn = vi.fn();
    const error = vi.fn();
    const row = {
      message_type: 'INFO', target_session: LIVE_TARGET,
      payload: { kind: 'ack' },
    };
    const res = await insertCoordinationRow(
      stubSupabase({ drainSetsError: { code: 'PGRST205', message: 'not found' } }),
      row,
      { logger: { warn, error, log() {} }, targetRoleHint: 'solomon' }
    );
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(res.data.payload.kind).toBe('ack');
  });
});
