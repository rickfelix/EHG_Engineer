/**
 * @wire-check-exempt: deliberately NOT wired to a live caller -- the canary precondition (see
 * below) does not exist yet, so there is no real invocation site to wire this into today. Mirrors
 * session-detail-view.js's own exemption reasoning (built-ahead-of-its-consumer), except here the
 * blocking precondition is an external chairman action, not a missing UI shell. Wire this in once
 * the canary account is provisioned -- Solomon guard G3 requires that to be a one-command change,
 * not a new integration.
 *
 * U4 (agent-browser cookie-non-leak) live-drill runner -- SD-LEO-INFRA-LEO-COMPLETION-001-E (FR-3).
 *
 * Implements the 4 PASS/FAIL observable checks from docs/protocol/u4-cookie-non-leak-spec.md
 * (secs 3-4) against a real canaryRelaunchUnderProfile() call (lib/fleet/canary-guard.js) --
 * "one command, zero code changes" once the canary precondition exists (Solomon guard G3).
 *
 * MECHANISM-READY, NOT LIVE-EXECUTED: this module has never been run against a real canary
 * account. That precondition (a genuinely provisioned second Claude Code account/profile,
 * FLEET_ACCOUNT_PROFILES_DIR + FLEET_SPAWN_CONTROL_LIVE + FLEET_CANARY_KILL_ENABLED, a real
 * claude_sessions row with metadata.account_profile='canary') does not exist in this environment
 * and requires chairman/operator action (SD-LEO-INFRA-LEO-COMPLETION-001-E LEAD phase finding,
 * Solomon consult be988d3e / ruling 6922c7c9). Do NOT remove this notice or claim a live pass
 * anywhere until runU4Drill() has actually been invoked against a real canary session (Solomon
 * guard G4: delivered-mechanism + proof-pending is the honest state).
 */
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolveProfileDir } from './spawn-control.js';
import { canaryRelaunchUnderProfile } from './canary-guard.js';

/**
 * PASS/FAIL check 1: supervisor's own CLAUDE_CONFIG_DIR must be byte-identical before/after the
 * call. relaunchUnderProfile() already throws on violation (spawn-control.js:306-313) -- this
 * check captures that throw as an explicit, reportable observable rather than letting it escape
 * uncaught (spec section 4: "the throw itself is the failure signal ... must capture and assert
 * on, not silently swallow").
 * @param {Function} relaunchFn - injectable seam for tests; defaults to canaryRelaunchUnderProfile
 * @returns {Promise<{name:string, pass:boolean, detail:string, result?:object}>}
 */
export async function checkSupervisorEnvInvariant(target, accountProfile, opts, relaunchFn = canaryRelaunchUnderProfile) {
  const before = process.env.CLAUDE_CONFIG_DIR;
  try {
    const result = await relaunchFn(target, accountProfile, opts);
    const after = process.env.CLAUDE_CONFIG_DIR;
    if (before !== after) {
      return { name: 'supervisor_env_invariant', pass: false, detail: 'CLAUDE_CONFIG_DIR changed on the supervisor process', result };
    }
    return { name: 'supervisor_env_invariant', pass: true, detail: 'CLAUDE_CONFIG_DIR unchanged before/after', result };
  } catch (err) {
    return { name: 'supervisor_env_invariant', pass: false, detail: `relaunch threw: ${err.message}` };
  }
}

/**
 * PASS/FAIL check 2: resolveProfileDir(B) must be distinct from resolveProfileDir(A), and neither
 * a parent nor a child path of the other (directory-collision/traversal escape).
 * @param {Function} resolveFn - injectable seam; defaults to spawn-control.js's resolveProfileDir
 */
export function checkProfileDirNonCollision(profileA, profileB, opts = {}, resolveFn = resolveProfileDir) {
  const dirA = resolveFn(profileA, opts);
  const dirB = resolveFn(profileB, opts);
  const normA = dirA.toLowerCase().replace(/\\+$/, '');
  const normB = dirB.toLowerCase().replace(/\\+$/, '');
  const collides = normA === normB || normA.startsWith(normB + '\\') || normB.startsWith(normA + '\\');
  return {
    name: 'profile_dir_non_collision',
    pass: !collides,
    detail: collides ? `profile dirs collide or nest: ${dirA} vs ${dirB}` : `distinct, non-nested dirs: ${dirA} vs ${dirB}`,
  };
}

/**
 * PASS/FAIL check 3: no file under profile A's directory is reachable via profile B's directory
 * (copy/symlink/path-traversal). Injectable filesystem seam so this is fixture-testable without
 * touching a real disk.
 * @param {{listFiles: (dir:string) => string[], realpath: (p:string) => string}} fs - injectable
 */
export function checkCrossProfileFilesystemReachability(dirA, dirB, fs) {
  let filesA;
  try {
    filesA = fs.listFiles(dirA);
  } catch (err) {
    return { name: 'cross_profile_filesystem_reachability', pass: true, detail: `profile A dir unreadable (nothing to leak): ${err.message}` };
  }
  const leaked = [];
  for (const relPath of filesA) {
    let realA;
    let realB;
    try {
      realA = fs.realpath(`${dirA}\\${relPath}`);
    } catch { continue; }
    try {
      realB = fs.realpath(`${dirB}\\${relPath}`);
    } catch { continue; }
    if (realA === realB) leaked.push(relPath);
  }
  return {
    name: 'cross_profile_filesystem_reachability',
    pass: leaked.length === 0,
    detail: leaked.length === 0 ? 'no file under profile A reachable via profile B' : `reachable across profiles: ${leaked.join(', ')}`,
  };
}

/**
 * PASS/FAIL check 4: a fleet_verb_relaunch_under_profile event must exist for the drill's own
 * invocation (log-before-action, spec section 2.5 / 4). Injectable query seam.
 * @param {(sessionId:string) => Promise<Array<object>>} queryEventsFn
 */
export async function checkEventLogPresence(sessionId, queryEventsFn) {
  const events = await queryEventsFn(sessionId);
  const found = (events || []).some((e) => e && e.event_type === 'fleet_verb_relaunch_under_profile');
  return {
    name: 'event_log_presence',
    pass: found,
    detail: found ? 'fleet_verb_relaunch_under_profile event found' : 'no fleet_verb_relaunch_under_profile event recorded for this call',
  };
}

/**
 * Run all 4 checks against a canary-targeted relaunch-under-profile call. NOT executed live in
 * this repo -- see module header. When the canary precondition exists, this is the "one command"
 * Solomon's guard G3 requires: no code change needed, only a real target/profile/fs/query wiring.
 * @param {{target:string, fromProfile:string, toProfile:string, sessionId:string, opts?:object,
 *   relaunchFn?:Function, resolveFn?:Function, fs?:object, queryEventsFn?:Function}} args
 * @returns {Promise<{pass:boolean, checks:Array<object>}>}
 */
export async function runU4Drill({ target, fromProfile, toProfile, sessionId, opts = {}, relaunchFn, resolveFn, fs, queryEventsFn }) {
  const checks = [];
  checks.push(await checkSupervisorEnvInvariant(target, toProfile, opts, relaunchFn));
  checks.push(checkProfileDirNonCollision(fromProfile, toProfile, opts, resolveFn));
  if (fs) {
    const dirA = (resolveFn || resolveProfileDir)(fromProfile, opts);
    const dirB = (resolveFn || resolveProfileDir)(toProfile, opts);
    checks.push(checkCrossProfileFilesystemReachability(dirA, dirB, fs));
  }
  if (queryEventsFn) {
    checks.push(await checkEventLogPresence(sessionId, queryEventsFn));
  }
  return { pass: checks.every((c) => c.pass), checks };
}

/**
 * CLI entry -- explicitly states this has NOT run live and names the exact precondition.
 * `node lib/fleet/u4-drill-runner.js --help` (or any invocation without a real canary session)
 * prints this notice rather than attempting a mutation.
 */
export function printLiveExecutionPrecondition() {
  return [
    'U4 drill runner is MECHANISM-READY, not live-executed.',
    'Live execution requires (all of):',
    '  1. A canary CLAUDE_CONFIG_DIR profile logged into one of the chairman\'s existing accounts',
    '     (not the fleet\'s current active account) -- Solomon: does NOT require a new Anthropic account.',
    '  2. FLEET_ACCOUNT_PROFILES_DIR set to the profiles base directory.',
    '  3. FLEET_SPAWN_CONTROL_LIVE=true and FLEET_CANARY_KILL_ENABLED=true, after host-validating',
    '     the wt.exe live-spawn invocation on this host (docs/protocol/fleet-spawn-control.md).',
    '  4. A real claude_sessions row with metadata.account_profile=\'canary\' and a Canary- callsign.',
    'Owner: chairman. Once provisioned, run this module\'s runU4Drill() against the real canary',
    'session -- zero code changes needed (Solomon guard G3).',
  ].join('\n');
}

const invokedDirectly = (() => {
  try {
    return process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  // eslint-disable-next-line no-console
  console.log(printLiveExecutionPrecondition());
}
