/**
 * multi-session-claim-gate-surface-a.integration.test.js — SD-LEO-INFRA-MULTI-SESSION-CLAIM-001
 *
 * RECURRED-FAMILY e2e acceptance test (live DB, no mocked seam). A prior fix
 * (SD-LEO-FIX-FIX-MULTI-SESSION-001) for this gate completed, yet the same
 * false-block/false-read defect class recurred: validateMultiSessionClaim()
 * derived ownership from v_active_sessions (heartbeat-view / Surface B)
 * instead of strategic_directives_v2.claiming_session_id (the authoritative
 * Surface A written by claim_sd()). Per the recurred-family rule, a mocked
 * unit test is not sufficient acceptance evidence — this drives the REAL
 * validateMultiSessionClaim() against REAL tables.
 *
 * Reproduces the exact witnessed live scenario (2026-07-17 01:57Z, session
 * be313562, SD-FDBK-INFRA-FIX-GATE-SUBAGENT-001): an unrelated dead/phantom
 * peer session holds a stale sd_key stamp on ITS OWN claude_sessions row with
 * a fresh-looking heartbeat (computed_status='active' per
 * v_active_sessions), while the true owner holds Surface A
 * (claiming_session_id). The true owner's own handoff must PASS. The inverse
 * (a genuinely live foreign claim on a different conversation) must still
 * BLOCK — no fail-open regression introduced while fixing the false-block.
 *
 * LIVE-gated: skips (not fails) without Supabase creds so hermetic CI stays
 * green. Ephemeral fixtures, unique RUN_ID, zero-survivors afterAll cleanup.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const HAS_DB = !!((process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)
  && process.env.SUPABASE_SERVICE_ROLE_KEY);

const RUN_ID = `msess-e2e-${Date.now()}-${process.pid}`;
const SD_KEY_PHANTOM = `SD-TEST-MSESS-E2E-${Date.now()}${process.pid}A`;
const SD_KEY_FOREIGN = `SD-TEST-MSESS-E2E-${Date.now()}${process.pid}B`;
const SESSION_OWNER = `${RUN_ID}-owner`;
const SESSION_PHANTOM_PEER = `${RUN_ID}-phantom-peer`;
const SESSION_FOREIGN_OWNER = `${RUN_ID}-foreign-owner`;

// Distinct from the caller's own identity so the gate's pre-cleanup step
// (release_same_conversation_claims / same-hostname fallback) never touches
// these fixtures — it filters on `hostname = currentHostname`.
const CALLER_HOSTNAME = `${RUN_ID}-caller-host`;
const CALLER_TERMINAL_ID = `win-cc-${RUN_ID}-caller`;
const PHANTOM_HOSTNAME = `${RUN_ID}-phantom-host`;
const FOREIGN_HOSTNAME = `${RUN_ID}-foreign-host`;
const FOREIGN_TERMINAL_ID = `win-cc-${RUN_ID}-foreign`;

function sdFixture(sdKey, ownerSessionId) {
  return {
    id: crypto.randomUUID(),
    sd_key: sdKey,
    title: `[fixture] multi-session-claim-gate e2e ${RUN_ID}`,
    description: 'Ephemeral integration fixture — safe to delete on sight.',
    rationale: 'SD-LEO-INFRA-MULTI-SESSION-CLAIM-001 recurred-family e2e coverage.',
    status: 'in_progress',
    current_phase: 'EXEC',
    sd_type: 'infrastructure',
    category: 'Infrastructure',
    priority: 'low',
    scope: 'ephemeral test fixture',
    target_application: 'EHG_Engineer',
    success_criteria: [{ criterion: 'fixture', measure: 'n/a' }],
    claiming_session_id: ownerSessionId,
    active_session_id: ownerSessionId,
    is_working_on: true,
  };
}

describe.skipIf(!HAS_DB)('multi-session-claim-gate: Surface A e2e (LIVE tables, recurred-family acceptance)', () => {
  let sb;
  let validateMultiSessionClaim;

  beforeAll(async () => {
    const { createSupabaseServiceClient } = require('../../lib/supabase-client.cjs');
    sb = createSupabaseServiceClient();
    ({ validateMultiSessionClaim } = await import('../../scripts/modules/handoff/gates/multi-session-claim-gate.js'));

    const { error: sdErr } = await sb.from('strategic_directives_v2').insert([
      sdFixture(SD_KEY_PHANTOM, SESSION_OWNER),
      sdFixture(SD_KEY_FOREIGN, SESSION_FOREIGN_OWNER),
    ]);
    expect(sdErr, `strategic_directives_v2 fixture insert: ${sdErr?.message}`).toBeNull();

    const nowIso = new Date().toISOString();
    const { error: sessErr } = await sb.from('claude_sessions').insert([
      // The witnessed bug vector: an UNRELATED peer whose OWN claude_sessions row
      // stamps sd_key = SD_KEY_PHANTOM with a FRESH heartbeat (computed_status
      // would read 'active' in v_active_sessions), even though Surface A
      // (claiming_session_id) on the SD names SESSION_OWNER, not this peer.
      {
        session_id: SESSION_PHANTOM_PEER,
        status: 'active',
        sd_key: SD_KEY_PHANTOM,
        claimed_at: nowIso,
        heartbeat_at: nowIso, // fresh — the exact "fresh-looking heartbeat" signature
        last_tool_at: nowIso,
        terminal_id: `win-cc-${RUN_ID}-phantom`,
        tty: 'win-99999',
        hostname: PHANTOM_HOSTNAME,
        is_alive: false, // dead by PID-liveness — computed_status ignores this field entirely
        metadata: {},
      },
      // A genuinely live foreign owner for the inverse (no-regression) case.
      {
        session_id: SESSION_FOREIGN_OWNER,
        status: 'active',
        sd_key: SD_KEY_FOREIGN,
        claimed_at: nowIso,
        heartbeat_at: nowIso,
        last_tool_at: nowIso,
        terminal_id: FOREIGN_TERMINAL_ID,
        tty: 'win-88888',
        hostname: FOREIGN_HOSTNAME,
        is_alive: true,
        metadata: {},
      },
    ]);
    expect(sessErr, `claude_sessions fixture insert: ${sessErr?.message}`).toBeNull();
  }, 30_000);

  afterAll(async () => {
    if (!sb) return;
    await sb.from('claude_sessions').delete().like('session_id', `${RUN_ID}%`);
    await sb.from('strategic_directives_v2').delete().in('sd_key', [SD_KEY_PHANTOM, SD_KEY_FOREIGN]);

    const { count: sessLeft } = await sb.from('claude_sessions')
      .select('session_id', { count: 'exact', head: true }).like('session_id', `${RUN_ID}%`);
    const { count: sdLeft } = await sb.from('strategic_directives_v2')
      .select('sd_key', { count: 'exact', head: true }).in('sd_key', [SD_KEY_PHANTOM, SD_KEY_FOREIGN]);
    expect(sessLeft ?? 0).toBe(0);
    expect(sdLeft ?? 0).toBe(0);
  }, 30_000);

  it('RECURRED-FAMILY: the rightful Surface-A owner PASSES despite an unrelated dead peer holding a stale sd_key stamp with a fresh heartbeat', async () => {
    const result = await validateMultiSessionClaim(sb, SD_KEY_PHANTOM, {
      currentSessionId: SESSION_OWNER,
      currentHostname: CALLER_HOSTNAME,
      currentTerminalId: CALLER_TERMINAL_ID,
    });

    expect(result.pass).toBe(true);
    expect(result.score).toBe(100);
    expect(result.issues).toEqual([]);

    // Prove the phantom peer's row was never mutated/consulted as ownership authority.
    const { data: phantomRow } = await sb.from('claude_sessions')
      .select('sd_key, status').eq('session_id', SESSION_PHANTOM_PEER).maybeSingle();
    expect(phantomRow.sd_key).toBe(SD_KEY_PHANTOM);
  }, 30_000);

  it('NO-REGRESSION: a genuinely live foreign claim on a different conversation still BLOCKS', async () => {
    const result = await validateMultiSessionClaim(sb, SD_KEY_FOREIGN, {
      currentSessionId: SESSION_OWNER, // NOT the SD's claiming_session_id (SESSION_FOREIGN_OWNER)
      currentHostname: CALLER_HOSTNAME,
      currentTerminalId: CALLER_TERMINAL_ID,
    });

    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.claimDetails?.hostname).toBe(FOREIGN_HOSTNAME);
    expect(result.claimDetails?.terminalId).toBe(FOREIGN_TERMINAL_ID);
  }, 30_000);
});
