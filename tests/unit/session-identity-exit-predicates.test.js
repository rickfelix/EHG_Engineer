/**
 * SD-LEO-INFRA-SESSION-IDENTITY-MARKER-CALLERS-001 (FR-5) — CI preventive exit-predicate
 * fixtures, exercised end-to-end across the corrected call sites together (not just the SSOT in
 * isolation, already covered by tests/unit/cc-pid-liveness.test.js and
 * tests/unit/fleet/pid-venue.test.js).
 *
 * Both scenarios inject EXPLICIT marker directories via markerDirsFn — never the no-arg
 * default, which is host-dependent post-FR-1 (markerDirs() walks this machine's real
 * .worktrees/, so asserting on it would make the test's outcome depend on what happens to be
 * checked out on whatever host runs CI).
 *
 * (1) a marker present ONLY in a simulated "main worktree" directory (not the local one) must
 *     read as alive through every corrected caller — proving the union fix, not just the
 *     directory-merge primitive underneath it.
 * (2) no marker directory anywhere must produce NO destructive action: pidVenueCapability must
 *     report capable:false (never capable:true with 0 markers, and never silently capable:true
 *     defaulting to "dead"). filterDormantByPidLiveness is a PURE join with no capability
 *     awareness of its own — given empty markers it correctly leaves every candidate in the
 *     dormant list unprotected (nothing to protect them with), which is why the actual guard
 *     against a false-death verdict downstream is a SEPARATE mechanism: the caller
 *     (scripts/stale-session-sweep.cjs's classify loop) threads `pidUnverifiable = !pidVenue
 *     .capable` and never treats hasPidAlive===false as confirmed death when that flag is set.
 *     This scenario proves that capability flag is correctly false, which is the actual
 *     preventive signal a destructive-action caller must consult.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { getMarkerSessionIds } = require('../../lib/fleet/cc-pid-liveness.cjs');
const { pidVenueCapability } = require('../../lib/fleet/pid-venue.cjs');
const { filterDormantByPidLiveness } = require('../../scripts/stale-session-sweep.cjs');

describe('SD-LEO-INFRA-SESSION-IDENTITY-MARKER-CALLERS-001 (FR-5): exit-predicate fixtures', () => {
  const dirs = [];
  function makeDir() {
    const d = mkdtempSync(path.join(tmpdir(), 'exit-predicate-'));
    dirs.push(d);
    return d;
  }
  afterEach(() => {
    while (dirs.length) { try { rmSync(dirs.pop(), { recursive: true, force: true }); } catch { /* best effort */ } }
  });

  it('scenario 1: a marker only in the simulated main-worktree dir reads alive through every corrected caller', () => {
    const localWorktreeDir = makeDir(); // simulates this checkout's own .claude/session-identity -- empty
    const mainWorktreeDir = makeDir();  // simulates the OTHER checkout where the live marker actually lives
    const sessionId = 'main-worktree-only-session';
    writeFileSync(
      path.join(mainWorktreeDir, `pid-${process.pid}.json`),
      JSON.stringify({ session_id: sessionId, cc_pid: process.pid }),
    );
    const markerDirsFn = () => [localWorktreeDir, mainWorktreeDir];

    const markers = getMarkerSessionIds(undefined, markerDirsFn);
    expect(markers[sessionId]).toMatchObject({ pid: process.pid, alive: true });

    const venue = pidVenueCapability({ markerDirsFn });
    expect(venue.capable).toBe(true);
    expect(venue.reason).toBe('marker_dir_present');

    // filterDormantByPidLiveness takes candidate OBJECTS (each with .session_id) already
    // identified as heartbeat-dormant, and returns those NOT protected by a live PID marker.
    const stillDormant = filterDormantByPidLiveness(
      [{ session_id: sessionId }, { session_id: 'some-other-dormant-session' }],
      markers,
    );
    expect(stillDormant.map((d) => d.session_id)).toEqual(['some-other-dormant-session']); // sessionId protected, the other one is not
  });

  it('scenario 2: no marker directory anywhere abstains -- never manufactures a false-alive OR false-dead verdict', () => {
    const missingA = path.join(tmpdir(), 'exit-predicate-missing-a-' + Date.now());
    const missingB = path.join(tmpdir(), 'exit-predicate-missing-b-' + Date.now());
    const markerDirsFn = () => [missingA, missingB]; // deliberately never created

    const markers = getMarkerSessionIds(undefined, markerDirsFn);
    expect(markers).toEqual({});

    const venue = pidVenueCapability({ markerDirsFn });
    expect(venue.capable).toBe(false);
    expect(venue.reason).toBe('marker_dir_absent');

    // The guard a real destructive-action caller must consult before treating "no PID found" as
    // "confirmed dead" -- pidUnverifiable in stale-session-sweep.cjs's classify loop is exactly
    // `!pidVenue.capable`. Asserting it here proves that guard is available and correctly true
    // (this venue must abstain), which is the actual preventive mechanism -- NOT
    // filterDormantByPidLiveness, which is a pure join with no capability awareness of its own:
    // with empty markers it correctly leaves the candidate dormant (nothing protects it), and it
    // is the caller's job to consult pidUnverifiable before spending that as a death verdict.
    const pidUnverifiable = !venue.capable;
    expect(pidUnverifiable).toBe(true);
    expect(filterDormantByPidLiveness([{ session_id: 'some-candidate' }], markers).map((d) => d.session_id))
      .toEqual(['some-candidate']);
  });

  it('scenario 2b: an EXISTING but EMPTY marker directory is the more dangerous case -- still abstains, never reads as a real negative', () => {
    const emptyDir = makeDir(); // exists, zero markers written into it
    const markerDirsFn = () => [emptyDir];

    const venue = pidVenueCapability({ markerDirsFn });
    expect(venue.capable).toBe(false);
    expect(venue.reason).toBe('marker_dir_empty'); // distinct from marker_dir_absent -- looks like a real negative, is not
  });
});
