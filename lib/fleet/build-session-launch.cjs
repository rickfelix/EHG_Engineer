/**
 * build-session-launch.cjs — SD-LEO-INFRA-LEO-APP-LAUNCHER-001 (FR-1).
 *
 * THE canonical, single-source session-launch builder used by EVERY fleet spawn path
 * (spawn-control.js, worker-spawn-executor.cjs, reboot-respawn.cjs, the checkpoint-3 drill
 * launcher). CommonJS on purpose so BOTH the ESM paths (import) and the CJS paths (require)
 * share ONE builder — no divergent per-path launch logic. Base-state DECIDED (Adam 7b548e6c):
 * this replaces the old divergent builders; the CP3 pilot-fix behaviors are folded in here.
 *
 * Launch contract (every path MUST satisfy it):
 *   - FULL claude.cmd path — bare 'claude' fails inside wt.exe with 0x80070002;
 *   - EXPLICIT cwd = repo/worktree root via `wt new-tab -d <cwd>` so the spawned session
 *     registers in claude_sessions (starts at the repo root, NOT System32);
 *   - CLAUDE_CONFIG_DIR = resolved profile dir (isolation) injected into the CHILD env only;
 *   - PERSISTENT visible wt.exe tab — NEVER headless -p/--print;
 *   - AUTO-RESUME — FLEET_AUTORESUME_SD (+ optional --resume <uuid>) so the session comes up
 *     ON its SD, not a bare welcome screen;
 *   - FAIL-LOUD — throws if a REQUESTED profile or cwd cannot resolve; never a silent default
 *     (the silent-degrade that produced the identity-less ghost session).
 */
const path = require('node:path');
const fs = require('node:fs');

const PROFILE_NAME_RE = /^[A-Za-z0-9_-]+$/;
// This module lives at lib/fleet/ -> repo root is two up. Resolved once.
const MODULE_REPO_ROOT = path.resolve(__dirname, '..', '..');

class LaunchResolveError extends Error {
  constructor(msg) { super(msg); this.name = 'LaunchResolveError'; this.failClosed = true; }
}

/** Resolve the FULL claude launcher path (bare 'claude' fails in wt.exe). Override -> npm bin -> 'claude'. */
function resolveClaudeCmd(env = process.env) {
  const override = env.FLEET_CLAUDE_CMD || env.CLAUDE_CLI_PATH;
  if (override && String(override).trim()) return String(override).trim();
  const appData = env.APPDATA;
  if (appData) {
    const candidate = path.win32.join(appData, 'npm', 'claude.cmd');
    try { if (fs.existsSync(candidate)) return candidate; } catch { /* fall through to bare */ }
  }
  return 'claude';
}

/** Resolve the repo root the spawned session should start in (FLEET_REPO_ROOT override, else module root). */
function resolveRepoRoot(env = process.env) {
  const override = env.FLEET_REPO_ROOT;
  if (override && String(override).trim()) return String(override).trim();
  return MODULE_REPO_ROOT;
}

/**
 * Resolve a profile NAME to its CLAUDE_CONFIG_DIR. FAIL-LOUD: throws if the base dir is
 * unconfigured or the name is invalid — the caller must NOT degrade to a no-isolation launch.
 */
function resolveProfileDir(profileName, opts = {}) {
  const env = opts.env || process.env;
  const baseDir = opts.baseDir != null ? opts.baseDir : (env.FLEET_ACCOUNT_PROFILES_DIR || null);
  if (!baseDir) throw new LaunchResolveError('buildSessionLaunch: FLEET_ACCOUNT_PROFILES_DIR not configured (refusing to launch un-isolated)');
  if (typeof profileName !== 'string' || !PROFILE_NAME_RE.test(profileName)) {
    throw new LaunchResolveError(`buildSessionLaunch: invalid profile name ${JSON.stringify(profileName)}`);
  }
  return path.win32.join(baseDir, profileName);
}

/**
 * Build THE canonical session-launch invocation.
 * @param {{role?:string, callsign?:string, profile?:string, profileDir?:string, cwd?:string,
 *          sdToResume?:string, resumeUuid?:string, startupPrompt?:string}} spec
 *   profile = a profile NAME (resolved here, fail-loud); profileDir = a pre-resolved dir (back-compat).
 * @param {{env?:object}} [opts]
 * @returns {{program:string, args:string[], env:object, cwd:string, persistent:boolean}}
 */
function buildSessionLaunch(spec = {}, opts = {}) {
  const env = opts.env || process.env;
  const { role, callsign, profile, profileDir: preResolved, cwd, sdToResume, resumeUuid, startupPrompt } = spec;

  // Profile -> CLAUDE_CONFIG_DIR. Fail LOUD on a REQUESTED-but-unresolvable profile.
  let profileDir = null;
  if (preResolved) profileDir = preResolved;
  else if (profile) profileDir = resolveProfileDir(profile, { env });

  const claudeCmd = resolveClaudeCmd(env);
  const startDir = (cwd && String(cwd).trim()) ? String(cwd) : resolveRepoRoot(env);

  const childEnv = { FLEET_WORKER_CALLSIGN: callsign || '', FLEET_WORKER_ROLE: role || 'worker' };
  if (profileDir) childEnv.CLAUDE_CONFIG_DIR = profileDir; // isolation, child env only
  if (sdToResume) childEnv.FLEET_AUTORESUME_SD = String(sdToResume); // SessionStart hook -> sd-start --force-reclaim
  if (startupPrompt) childEnv.FLEET_WORKER_STARTUP_PROMPT = String(startupPrompt); // persistent replacement for headless -p

  // PERSISTENT visible wt.exe tab; -d sets the tab's start dir; NEVER headless -p/--print.
  const args = ['new-tab', '-d', startDir, '--', claudeCmd];
  if (resumeUuid) args.push('--resume', String(resumeUuid));

  return { program: 'wt.exe', args, env: childEnv, cwd: startDir, persistent: true };
}

/**
 * Assert a launch invocation satisfies the contract (used by the conformance test + callers).
 * @returns {{ok:boolean, violations:string[]}}
 */
function assertLaunchContract(inv, { expectProfile = false, expectResume = false } = {}) {
  const v = [];
  if (!inv || inv.program !== 'wt.exe') v.push('program must be wt.exe (persistent), not a bare/headless claude');
  const args = (inv && inv.args) || [];
  const dIdx = args.indexOf('-d');
  if (dIdx < 0 || !args[dIdx + 1]) v.push('missing -d <cwd> explicit start directory');
  if (args.includes('-p') || args.includes('--print')) v.push('headless -p/--print is forbidden (must be persistent)');
  const claudeTok = args[args.indexOf('--') + 1];
  if (!claudeTok || !/claude(\.cmd|\.exe)?$/i.test(claudeTok)) v.push('missing resolved claude launcher token after --');
  if (inv && inv.persistent !== true) v.push('persistent flag must be true');
  if (expectProfile && !(inv && inv.env && inv.env.CLAUDE_CONFIG_DIR)) v.push('expected CLAUDE_CONFIG_DIR (profile isolation)');
  if (expectResume && !(inv && inv.env && inv.env.FLEET_AUTORESUME_SD) && !args.includes('--resume')) v.push('expected auto-resume (FLEET_AUTORESUME_SD or --resume)');
  return { ok: v.length === 0, violations: v };
}

module.exports = {
  buildSessionLaunch,
  assertLaunchContract,
  resolveClaudeCmd,
  resolveRepoRoot,
  resolveProfileDir,
  LaunchResolveError,
  PROFILE_NAME_RE,
};
