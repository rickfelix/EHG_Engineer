/**
 * SD-FDBK-INFRA-SHARED-FLEET-WORKER-001 — shared session classification predicate.
 * Pins isFixtureSession against the witnessed offenders + the legit-session-shape false-positive
 * boundary, and confirms the genuine-worker SoT is re-exported (single source of truth).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isFixtureSession,
  isFleetWorker,
  liveFleetWorkers,
  everClaimed,
  isGenuineCountableWorker,
  isDispatchableFleetMember,
} from '../../lib/fleet/session-predicates.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DASHBOARD = resolve(__dirname, '../../scripts/fleet-dashboard.cjs');

describe('isFixtureSession — fixture/probe/test id detection', () => {
  it('flags the witnessed fixture ids (the four cited bugs)', () => {
    expect(isFixtureSession('test-switch-claim-guards-session')).toBe(true); // sweep CLAIM_FIX victim (fd018627)
    expect(isFixtureSession('qf-route-probe-A')).toBe(true);                 // callsign-stealing probe (7b59dac8)
    expect(isFixtureSession('qf-route-probe-B')).toBe(true);
    expect(isFixtureSession('QF-TEST-001')).toBe(true);
    expect(isFixtureSession('drain_test_abc')).toBe(true);                   // legacy ghost prefixes
    expect(isFixtureSession('test_execute_x')).toBe(true);
    expect(isFixtureSession('test-session-1')).toBe(true);
    expect(isFixtureSession('test_session_2')).toBe(true);
  });

  it('accepts a session row object (reads .session_id)', () => {
    expect(isFixtureSession({ session_id: 'qf-route-probe-A' })).toBe(true);
    expect(isFixtureSession({ session_id: '65d08634-9ded-4c8f-96e8-2f4cfd991a2a' })).toBe(false);
  });

  it('does NOT flag a real UUID session', () => {
    expect(isFixtureSession('65d08634-9ded-4c8f-96e8-2f4cfd991a2a')).toBe(false);
    expect(isFixtureSession('b887c648-e65a-447f-a46c-bb672f42b089')).toBe(false);
  });

  it('does NOT flag the legitimate session_<hex>_<tty>_<pid> shape (false-positive boundary)', () => {
    // lib/session-manager.mjs produces these for real sessions without a birth-cert UUID.
    expect(isFixtureSession('session_a1b2c3d4_tty1_12345')).toBe(false);
  });

  it('flags a bare non-UUID synthetic id', () => {
    expect(isFixtureSession('some-random-synthetic-id')).toBe(true);
  });

  it('does not flag a real UUID, and the probe/test markers are delimiter-anchored (no mid-word match)', () => {
    // A valid hex UUID is never a fixture even if a hex run coincidentally reads like a word.
    expect(isFixtureSession('deadbeef-0000-4000-8000-cabfaceb00de')).toBe(false);
    // 'probe' only matches at a (^|[-_]) boundary: a session id embedding 'probe' mid-token,
    // when it is otherwise the legit session_<hex> shape, is not a fixture.
    expect(isFixtureSession('session_deadbeef_probeless_99')).toBe(false);
  });

  it('fails toward "not a fixture" on empty/garbage input (never false-excludes a real worker)', () => {
    expect(isFixtureSession(null)).toBe(false);
    expect(isFixtureSession(undefined)).toBe(false);
    expect(isFixtureSession('')).toBe(false);
    expect(isFixtureSession(12345)).toBe(false);
    expect(isFixtureSession({})).toBe(false);
  });
});

describe('genuine-worker SoT re-export (single source of truth)', () => {
  it('re-exports isFleetWorker / liveFleetWorkers / everClaimed', () => {
    expect(typeof isFleetWorker).toBe('function');
    expect(typeof liveFleetWorkers).toBe('function');
    expect(typeof everClaimed).toBe('function');
  });

  it('isGenuineCountableWorker = fleet worker AND not a fixture', () => {
    const coordId = 'coord-uuid';
    const realWorker = { session_id: '65d08634-9ded-4c8f-96e8-2f4cfd991a2a', status: 'active', metadata: {}, sd_key: 'SD-X' };
    expect(isGenuineCountableWorker(realWorker, coordId)).toBe(true);
    // a fixture-id session that otherwise looks like a worker is excluded
    const fixtureWorker = { session_id: 'qf-route-probe-A', status: 'active', metadata: {}, sd_key: 'SD-Y' };
    expect(isGenuineCountableWorker(fixtureWorker, coordId)).toBe(false);
    // adam/non_fleet excluded by isFleetWorker even with a real id
    const adam = { session_id: 'aaaaaaaa-0000-4000-8000-000000000000', status: 'active', metadata: { role: 'adam' }, sd_key: 'SD-Z' };
    expect(isGenuineCountableWorker(adam, coordId)).toBe(false);
  });
});

describe('isDispatchableFleetMember — idle/capacity panel role guard (no everClaimed)', () => {
  const coordId = 'cccccccc-0000-4000-8000-000000000000';

  it('counts a JUST-FINISHED worker (released: sd_key+claimed_at nulled) as a member', () => {
    // This is the regression isGenuineCountableWorker would cause: everClaimed=false here.
    const justFinished = { session_id: '65d08634-9ded-4c8f-96e8-2f4cfd991a2a', status: 'idle', metadata: {}, sd_key: null, claimed_at: null };
    expect(isDispatchableFleetMember(justFinished, coordId)).toBe(true);
    // contrast: the everClaimed-based predicate drops it
    expect(isGenuineCountableWorker(justFinished, coordId)).toBe(false);
  });

  it('counts a freshly-spawned not-yet-claimed worker as a member', () => {
    const fresh = { session_id: 'b887c648-e65a-447f-a46c-bb672f42b089', status: 'active', metadata: {}, sd_key: null };
    expect(isDispatchableFleetMember(fresh, coordId)).toBe(true);
  });

  it('EXCLUDES the witnessed polluters: coordinator, adam, non_fleet, fixture', () => {
    expect(isDispatchableFleetMember({ session_id: coordId, metadata: {} }, coordId)).toBe(false);
    expect(isDispatchableFleetMember({ session_id: 'aaaaaaaa-0000-4000-8000-000000000000', metadata: { role: 'adam' } }, coordId)).toBe(false);
    expect(isDispatchableFleetMember({ session_id: 'dddddddd-0000-4000-8000-000000000000', metadata: { non_fleet: true } }, coordId)).toBe(false);
    expect(isDispatchableFleetMember({ session_id: 'qf-route-probe-A', metadata: {} }, coordId)).toBe(false);
  });

  it('fails toward "member" on garbage but excludes a null session', () => {
    expect(isDispatchableFleetMember(null, coordId)).toBe(false);
    expect(isDispatchableFleetMember(undefined, coordId)).toBe(false);
    expect(isDispatchableFleetMember({}, coordId)).toBe(true);   // unknown role → counted (same as legacy)
  });
});

describe('production wiring guard (catch idle-filter call-site deletion)', () => {
  const dashSrc = readFileSync(DASHBOARD, 'utf8');

  it('the dashboard imports + applies isDispatchableFleetMember on the idle filter', () => {
    expect(dashSrc).toMatch(/from '\.\.\/lib\/fleet\/session-predicates\.mjs'|session-predicates\.mjs/);
    expect(dashSrc).toContain('isDispatchableFleetMember(s, _dashCoordinatorId)');
  });

  it('the dashboard SELECTs metadata so the role guard can read it', () => {
    // the allSessions query (idle source) must include metadata for the role/non_fleet checks
    expect(dashSrc).toMatch(/select\([^)]*metadata/s);
  });
});
