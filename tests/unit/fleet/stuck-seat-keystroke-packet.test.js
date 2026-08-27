// SD-LEO-INFRA-PERMISSION-FREEZE-STUCK-001 FR-4 — keystroke-packet renderer.
//
// Field-name discipline (US-004 correction): the originally-scoped fields terminal_identity and
// callsign are present on 0/9 real claude_sessions rows measured at PLAN phase. The real fields
// are window_handle (6/9) and fleet_identity (6/9). Every fixture below uses ONLY those real
// names -- a fixture using terminal_identity/callsign would render the fallback for every real
// seat while passing green, which is exactly the defect class this SD exists to prevent.
//
// D1 fix (EXEC-phase non-prospective TESTING review): field NAME was right but the ASSUMED TYPE
// was wrong. A 40-row live census found fleet_identity is an OBJECT on 28/28 non-null rows --
// {role, color, callsign, assigned_at, accountUuid8, display_name} -- never a bare string, and
// window_handle is a NUMBER (20/20 rows), not a string. Fixtures below use the real shape; a
// fixture using bare strings would stay green while shipping "[object Object]" in production,
// exactly like the field-name defect this file's original version was written to prevent.
import { describe, it, expect } from 'vitest';
import { renderKeystrokePacket, NO_WINDOW_HANDLE_FALLBACK } from '../../../lib/fleet/stuck-seat-keystroke-packet.cjs';

const realFleetIdentity = (callsign) => ({
  role: 'worker', color: 'blue', callsign, assigned_at: '2026-08-01T00:00:00.000Z',
  accountUuid8: 'abcd1234', display_name: `${callsign} Worker`
});

describe('renderKeystrokePacket — FR-4', () => {
  it('a seat with window_handle and fleet_identity populated renders both real values (callsign, not the raw object)', () => {
    const seat = { session_id: 'aaaaaaaa-1111-2222-3333-444444444444', silent: 249, window_handle: 3, fleet_identity: realFleetIdentity('Charlie') };
    const line = renderKeystrokePacket(seat);
    expect(line).toMatch(/Charlie/);
    expect(line).toMatch(/window: 3/);
    expect(line).toMatch(/aaaaaaaa/);
    expect(line).toMatch(/249m/);
    expect(line).not.toMatch(new RegExp(NO_WINDOW_HANDLE_FALLBACK));
    expect(line).not.toMatch(/\[object Object\]/);
  });

  // Shaped like a REAL queried claude_sessions row (columns per stuck-seat-population.cjs's
  // POPULATION_COLUMNS: session_id, status, loop_state, last_tool_at, heartbeat_at, metadata) --
  // not a hand-built fixture using the previously-assumed wrong field names OR the previously-
  // assumed wrong field TYPES.
  it('a realistically-shaped queried row (metadata.window_handle: number, metadata.fleet_identity: object) renders correctly', () => {
    const realRowShape = {
      session_id: 'bbbbbbbb-5555-6666-7777-888888888888',
      status: 'active',
      loop_state: 'active',
      last_tool_at: '2026-08-20T09:25:44.000Z',
      heartbeat_at: '2026-08-20T09:25:44.000Z',
      metadata: { window_handle: 2, fleet_identity: realFleetIdentity('Golf-2') }
    };
    const seat = {
      session_id: realRowShape.session_id,
      silent: 694,
      window_handle: realRowShape.metadata.window_handle,
      fleet_identity: realRowShape.metadata.fleet_identity
    };
    const line = renderKeystrokePacket(seat);
    expect(line).toMatch(/window: 2/);
    expect(line).toMatch(/Golf-2/);
    expect(line).not.toMatch(/\[object Object\]/);
  });

  it('a seat with window_handle=0 is NOT treated as absent (falsy-zero guard)', () => {
    const seat = { session_id: 'e0000000-0000-0000-0000-000000000000', silent: 42, window_handle: 0, fleet_identity: null };
    const line = renderKeystrokePacket(seat);
    expect(line).toMatch(/window: 0/);
    expect(line).not.toMatch(new RegExp(NO_WINDOW_HANDLE_FALLBACK));
  });

  it('a seat WITHOUT window_handle/fleet_identity (the observed ~3/9 rate) renders the documented fallback', () => {
    const seat = { session_id: 'cccccccc-9999-0000-1111-222222222222', silent: 888, window_handle: null, fleet_identity: null };
    const line = renderKeystrokePacket(seat);
    expect(line).toMatch(new RegExp(NO_WINDOW_HANDLE_FALLBACK));
    // Falls back to the short session id as the displayed identity, never a placeholder like "null".
    expect(line).toMatch(/cccccccc/);
    expect(line).not.toMatch(/null/);
  });

  it('the packet is NUMBERED steps, not a single prose line', () => {
    const line = renderKeystrokePacket({ session_id: 'dddddddd', silent: 10, window_handle: 5, fleet_identity: realFleetIdentity('Delta') });
    expect(line).toMatch(/1\./);
    expect(line).toMatch(/2\./);
    expect(line).toMatch(/3\./);
    expect(line).toMatch(/4\./);
  });

  // TS-5 (PRD): "The output string contains the callsign, an expected-prompt-shape description,
  // and a literal approve keystroke." The keystroke is grounded in documentation, not guessed --
  // code.claude.com/docs/en/permissions ("Add a comment when you answer a permission prompt")
  // states Enter is the documented confirm keystroke.
  it('names a literal approve keystroke (Enter), grounded in documented Claude Code prompt behavior', () => {
    const line = renderKeystrokePacket({ session_id: 'ffffffff', silent: 77, window_handle: 1, fleet_identity: realFleetIdentity('Foxtrot') });
    expect(line).toMatch(/Enter/);
    expect(line.toLowerCase()).toMatch(/prompt/);
  });
});
