/**
 * QF-20260727-205 — a once-stamped coordinator must not be classed as a worker.
 *
 * LIVE INCIDENT 2026-07-27 (chairman-observed, screenshot-confirmed): the Sessions page rendered
 * ROLES 0 and "No coordinator is live" while session 1449a046 WAS the registered active
 * coordinator. Cause: sessionIdentityKind tested fleet_identity.callsign FIRST and returned
 * unconditionally, so any row carrying BOTH a callsign and is_coordinator resolved to 'worker' and
 * the coordinator branch was unreachable.
 *
 * The contradictory pair is reachable by RACE: assign-fleet-identities.cjs stamps a callsign onto
 * any live worker-cohort session, and filterOutCoordinators() can only exclude rows ALREADY flagged
 * is_coordinator. Register → stamped 44s later → /coordinator start ~19min later leaves the worker
 * stamp permanently. So this is not merely operator error and cannot be fixed by hygiene alone.
 *
 * These tests pin BRANCH ORDER, which is the whole defect.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(path.resolve(__dirname, '../../server/routes/fleet-panel.js'), 'utf8');

/** Mirror of the shipped function, extracted so the ordering contract is executable. */
function sessionIdentityKind(meta = {}) {
  if (meta.is_coordinator) return 'coordinator';
  if (meta.role) return String(meta.role);
  if (meta.fleet_identity?.callsign) return 'worker';
  if (meta.model) return 'unstamped';
  return null;
}

describe('QF-20260727-205: a role stamp outranks a worker callsign', () => {
  it('classes a coordinator that ALSO carries a stale callsign as coordinator', () => {
    // The exact live shape: stamped 'Alpha' at 10:01Z, became coordinator ~10:20Z.
    const meta = { fleet_identity: { callsign: 'Alpha' }, is_coordinator: true, model: 'opus' };
    expect(sessionIdentityKind(meta)).toBe('coordinator');
  });

  it('classes a role session that ALSO carries a stale callsign by its role', () => {
    for (const role of ['adam', 'solomon']) {
      const meta = { fleet_identity: { callsign: 'Golf-2' }, role, model: 'opus' };
      expect(sessionIdentityKind(meta)).toBe(role);
    }
  });

  it('still classes a genuine worker as worker', () => {
    expect(sessionIdentityKind({ fleet_identity: { callsign: 'Alpha-2' }, model: 'opus' })).toBe('worker');
  });

  it('preserves the unstamped and ghost verdicts unchanged', () => {
    expect(sessionIdentityKind({ model: 'opus' })).toBe('unstamped');
    expect(sessionIdentityKind({})).toBeNull();
    expect(sessionIdentityKind()).toBeNull();
  });
});

describe('the shipped source carries the fixed order, not just this mirror', () => {
  it('tests is_coordinator BEFORE fleet_identity.callsign', () => {
    const fn = SRC.slice(SRC.indexOf('function sessionIdentityKind'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    const coordIdx = body.indexOf('meta.is_coordinator');
    const callsignIdx = body.indexOf('meta.fleet_identity?.callsign');
    expect(coordIdx).toBeGreaterThan(-1);
    expect(callsignIdx).toBeGreaterThan(-1);
    expect(coordIdx).toBeLessThan(callsignIdx); // the entire defect, in one assertion
  });

  it('tests meta.role BEFORE the callsign branch too', () => {
    const fn = SRC.slice(SRC.indexOf('function sessionIdentityKind'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    expect(body.indexOf('meta.role')).toBeLessThan(body.indexOf('meta.fleet_identity?.callsign'));
  });

  it('does NOT touch identity_kind casing — the QF names that as the wrong fix', () => {
    // identity_kind is the machine key ehg groups on (exact lowercase === 'coordinator').
    // capitalizeRoleLabel must remain display-only.
    const fn = SRC.slice(SRC.indexOf('function sessionIdentityKind'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    expect(body).not.toMatch(/toUpperCase|capitalizeRoleLabel/);
    expect(body).toMatch(/return 'coordinator'/);
  });
});
