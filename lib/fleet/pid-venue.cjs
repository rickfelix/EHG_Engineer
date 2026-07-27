// SD-LEO-INFRA-PID-LIVENESS-DURABLE-VENUE-001 (C3 / FR-3a) — can THIS venue see PIDs at all?
//
// THE PROBLEM THIS EXISTS FOR. scripts/stale-session-sweep.cjs runs every 5 minutes on
// ubuntu-latest via .github/workflows/sweep-cron.yml. Its PID rung resolves through
// lib/fleet/resolve-cc-pid.cjs, which scans .claude/session-identity/pid-*.json — a HOST-LOCAL,
// gitignored directory that does not exist on a CI runner after actions/checkout. So on every
// scheduled run the resolver returns null for every row, hasPidAlive comes back false for every
// row, and the sweep proceeds to render verdicts whose stated meaning is "...AND no living PID".
//
// It never had a living-PID answer. It had NO answer, and spent it as if it were a "no".
//
// That is the exact failure this SD's own guard-rail test names: COULD-NOT-DETERMINE MUST NEVER
// BECOME DEATH. A GitHub Actions runner cannot in principle observe a process on the developer
// host — the periodic-liveness-watcher workflow header already documents this correctly and
// excludes role_session rows for that reason. The sweep never got the same treatment.
//
// WHAT THIS MODULE DOES, AND WHAT IT DELIBERATELY DOES NOT. It answers one question — is the
// marker directory present here — and nothing else. It does NOT sniff for CI (process.env.CI,
// GITHUB_ACTIONS): the capability question is about whether the evidence is reachable, not about
// which brand of machine is asking. A dev host with the directory removed is just as blind as a
// runner, and a self-hosted runner ON the dev host would be genuinely capable. Sniffing the venue
// would get both of those backwards.
//
// PRESENT-BUT-EMPTY IS CAPABLE, and the distinction is the whole point. If the directory exists,
// "no marker for this session" is a real, negative answer the sweep is entitled to act on. If the
// directory is absent, the same silence means only that we looked somewhere the answer was never
// written. Same observation, opposite epistemic status.

const fs = require('fs');
const { MARKER_DIR } = require('./cc-pid-liveness.cjs');

/**
 * @param {{markerDir?: string}} [opts]
 * @returns {{capable: boolean, reason: string, markerDir: string}}
 *   capable=false means every PID-dependent verdict in this process MUST abstain — not default
 *   to alive, and not default to dead.
 */
function pidVenueCapability({ markerDir = MARKER_DIR } = {}) {
  let present = false;
  try {
    present = fs.existsSync(markerDir) && fs.statSync(markerDir).isDirectory();
  } catch {
    present = false; // unreadable is indistinguishable from absent — fail to ABSTAIN, not to dead
  }
  return present
    ? { capable: true, reason: 'marker_dir_present', markerDir }
    : { capable: false, reason: 'marker_dir_absent', markerDir };
}

/**
 * The line a PID-blind venue must print. The AC requires the sweep to SAY SO explicitly rather
 * than silently defaulting, so this is a shared string and not each caller's improvisation.
 */
function pidBlindNotice(venue, { examined, tool = 'sweep' } = {}) {
  return (
    `[${tool}] PID-BLIND VENUE — abstaining from all PID-dependent verdicts. ` +
    `Marker dir ${venue.markerDir} is absent (${venue.reason}), so "no live PID" here means ` +
    `NOT-ASKED, not NO. Examined ${examined} row(s); rendered 0 PID-dependent death verdicts. ` +
    `A host-local invoker is the venue that can answer this (SD-LEO-INFRA-PID-LIVENESS-DURABLE-VENUE-001 FR-3).`
  );
}

module.exports = { pidVenueCapability, pidBlindNotice, MARKER_DIR };
