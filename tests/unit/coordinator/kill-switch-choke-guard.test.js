/**
 * SD-LEO-INFRA-COORDINATION-BUS-ACCESS-001 FR-2 / SECURITY C1 — the CHOKE refuses unauthorized
 * kill-switch rows regardless of caller.
 *
 * THIS IS WHAT MAKES FR-2 ENFORCED RATHER THAN ADVISORY. The governed writer refuses unauthorized
 * callers who choose to use it, which is worth nothing against someone who doesn't. The SECURITY
 * review found exactly that: kill-switch-writer.cjs existed, and a lint-legal raw call to
 * insertCoordinationRow with a kill payload still wrote an unauthorized, unattributed kill row.
 *
 * So the subject here is the RAW PATH: every case calls the choke DIRECTLY, bypassing the writer,
 * which is what an attacker — or an ordinary caller who did not know better — does.
 *
 * THESE ARE BEHAVIOURAL ON PURPOSE. My first version asserted against the source text of
 * dispatch.cjs. That proves the guard is WIRED; it cannot prove it FIRES. And it would have passed
 * while the guard was ordered behind assertValidTarget, where every kill row died on
 * DISPATCH_TARGET_INVALID first and the guard could never run — a guard sitting behind a check that
 * rejects everything it guards. Only calling the real choke exposed that.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require_ = createRequire(import.meta.url);
const { insertCoordinationRow } = require_('../../../lib/coordinator/dispatch.cjs');
const { KILL_SWITCH_KIND, FLEET_BROADCAST_SD } = require_('../../../lib/coordinator/kill-switch-writer.cjs');

const SILENT = { warn() {}, log() {}, error() {} };
const LIVE_UUID = '0f8d45d8-9531-4ab8-a1b9-6961c405e1ec';

/** Minimal double: no session ever resolves, so no actor can be corroborated. */
function supabaseWithNoSessions() {
  const chain = {
    eq: () => ({ maybeSingle: async () => ({ data: null }) }),
    filter: () => ({ order: () => ({ limit: async () => ({ data: [] }) }) }),
    order: () => ({ limit: async () => ({ data: [] }) }),
    limit: async () => ({ data: [] }),
  };
  return { from: () => ({ select: () => chain }) };
}

const killRow = (payloadOver = {}, rowOver = {}) => ({
  target_sd: FLEET_BROADCAST_SD,
  sender_session: 'sess-rogue',
  message_type: 'INFO',
  payload: { kind: KILL_SWITCH_KIND, actor: 'sess-rogue', reason: 'turn enforcement off', ...payloadOver },
  ...rowOver,
});

async function codeOf(promise) {
  try { await promise; return 'ALLOWED'; } catch (e) { return (e && e.code) || 'ERROR_NO_CODE'; }
}

describe('FR-2/C1: the choke refuses unauthorized kill-switch rows on the RAW path', () => {
  it('REFUSES a kill row whose actor corroborates to nothing', async () => {
    const code = await codeOf(insertCoordinationRow(supabaseWithNoSessions(), killRow(), { logger: SILENT }));
    expect(code).toBe('DISPATCH_KILL_SWITCH_ACTOR_NOT_FOUND');
  });

  it('REFUSES a kill row with no reason — before any lookup, so a malformed row costs no round-trip', async () => {
    const code = await codeOf(insertCoordinationRow(supabaseWithNoSessions(), killRow({ reason: undefined }), { logger: SILENT }));
    expect(code).toBe('DISPATCH_KILL_SWITCH_NO_REASON');
  });

  it('REFUSES a kill row with no actor', async () => {
    const code = await codeOf(insertCoordinationRow(supabaseWithNoSessions(), killRow({ actor: undefined }), { logger: SILENT }));
    expect(code).toBe('DISPATCH_KILL_SWITCH_NO_ACTOR');
  });

  it('REFUSES whitespace-only actor and reason — truthy but carrying no information', async () => {
    expect(await codeOf(insertCoordinationRow(supabaseWithNoSessions(), killRow({ actor: '   ' }), { logger: SILENT })))
      .toBe('DISPATCH_KILL_SWITCH_NO_ACTOR');
    expect(await codeOf(insertCoordinationRow(supabaseWithNoSessions(), killRow({ reason: '  ' }), { logger: SILENT })))
      .toBe('DISPATCH_KILL_SWITCH_NO_REASON');
  });

  it('the kill-switch guard runs BEFORE the target-shape check, so authorization is not masked by a shape error', async () => {
    // ORDERING IS LOAD-BEARING AND WAS WRONG FIRST TIME. A kill row carries target_sd and no
    // target_session, so assertValidTarget rejects it with DISPATCH_TARGET_INVALID. With the guard
    // ordered after that, it could NEVER fire. The assertion here is that an unauthorized kill row
    // reports the AUTHORIZATION failure, not the shape failure.
    const code = await codeOf(insertCoordinationRow(supabaseWithNoSessions(), killRow(), { logger: SILENT }));
    expect(code).not.toBe('DISPATCH_TARGET_INVALID');
    expect(code).toMatch(/^DISPATCH_KILL_SWITCH_/);
  });

  it('does NOT tax ordinary rows — a non-kill payload never sees a kill-switch refusal', async () => {
    // The guard must be invisible to normal dispatch. This row fails later for unrelated reasons in
    // this minimal double; what matters is that it is never a DISPATCH_KILL_SWITCH_* code.
    const ordinary = { target_session: LIVE_UUID, message_type: 'INFO', payload: { kind: 'roll_call' } };
    const code = await codeOf(insertCoordinationRow(supabaseWithNoSessions(), ordinary, { logger: SILENT }));
    expect(code).not.toMatch(/^DISPATCH_KILL_SWITCH_/);
  });
});
