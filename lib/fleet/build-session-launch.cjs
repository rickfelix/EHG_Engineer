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
  // A spawned fleet session is an INDEPENDENT session, not a child of whoever spawned it.
  // spawn-control merges `{...process.env, ...childEnv}`, so without this the spawner's own
  // CLAUDE_CODE_CHILD_SESSION marker is inherited, Claude Code disables session persistence
  // ("Transcript saving is off — inherited CLAUDE_CODE_CHILD_SESSION marker"), and the session
  // NEVER REGISTERS — which is why provisioning polled 10 times and found nothing.
  // childEnv wins the merge, so setting the documented override here is the durable fix.
  childEnv.CLAUDE_CODE_FORCE_SESSION_PERSISTENCE = '1';
  if (profileDir) childEnv.CLAUDE_CONFIG_DIR = profileDir; // isolation, child env only
  if (sdToResume) childEnv.FLEET_AUTORESUME_SD = String(sdToResume); // SessionStart hook -> sd-start --force-reclaim
  if (startupPrompt) childEnv.FLEET_WORKER_STARTUP_PROMPT = String(startupPrompt); // persistent replacement for headless -p

  // PERSISTENT visible wt.exe window; -d sets the start dir; NEVER headless -p/--print.
  //
  // SD-LEO-INFRA-LAUNCHER-CAN-HOST-001 FR-5 — `-w new` IS A CORRECTNESS REQUIREMENT, NOT COSMETIC.
  // Bare `wt new-tab` adds a TAB TO AN EXISTING WINDOW. A new tab creates NO new top-level window, so
  // FR-4's before/after enumeration diff would see zero windows appear and every capture would return
  // no_new_window -- the enumerator would be correct and still never fire. `-w new` forces a NEW
  // WINDOW, which is the thing being counted. It also gives each session its own focusable window,
  // which is what `attach`/Open needs; tabs of one window cannot be raised independently.
  //
  // `-w` is a GLOBAL wt option and MUST precede the `new-tab` subcommand -- `wt new-tab -w new` would
  // be parsed as an argument to new-tab, not as the window selector. Hence the position here.
  const args = ['-w', 'new', 'new-tab', '-d', startDir, '--', claudeCmd];

  // SD-LEO-INFRA-LAUNCHER-CAN-HOST-001 FR-3 — MINT THE SESSION ID SPAWNER-SIDE.
  //
  // This removes the spawn->session correlation problem instead of solving it. Every previous
  // approach tried to RECOGNISE the child afterwards and each one is dead:
  //   - .eq('pid', pid) at spawn-control.js:202, canary-guard.js:167 and in the respawn runner
  //     matches the wt.exe LAUNCHER pid against claude_sessions.pid, which holds the CLAUDE CODE
  //     pid. wt.exe hands the tab to the running WindowsTerminal.exe host and exits, so the pid it
  //     reports is gone before the child ever registers. It can never match.
  //   - an env carrier (FLEET_SPAWN_TOKEN) cannot reach the hook: only six CLAUDE_-prefixed vars
  //     propagate to hook subprocesses (lib/hooks/session-id.cjs:36-42). FLEET_AUTORESUME_SD has
  //     zero readers repo-wide for exactly this reason.
  // `claude --session-id <uuid>` (CLI 2.1.220: "Use a specific session ID for the conversation
  // (must be a valid UUID)") lets the SPAWNER choose the id. The SessionStart hook then registers
  // under that same id, so claude_sessions.session_id IS the value we already hold. No side
  // channel, no polling, no recognition step.
  //
  // Mutually exclusive with --resume: resuming adopts an EXISTING conversation id, so passing both
  // is contradictory (and --resume already gives the caller a known id).
  let sessionId = null;
  if (resumeUuid) {
    args.push('--resume', String(resumeUuid));
    sessionId = String(resumeUuid);
  } else {
    // Injectable so tests are deterministic; never Math.random-derived.
    const mint = opts.uuidFn || (() => require('node:crypto').randomUUID());
    const minted = spec.sessionId || mint();
    if (isUuid(minted)) {
      sessionId = String(minted);
      args.push('--session-id', sessionId);
    }
    // A non-UUID is DROPPED rather than passed through: the CLI rejects a malformed --session-id and
    // would fail the whole launch. Losing correlation is recoverable; losing the session is not.
  }

  return { program: 'wt.exe', args, env: childEnv, cwd: startDir, persistent: true, sessionId };
}

/** Strict RFC-4122 shape check — the CLI requires a valid UUID and rejects anything else. */
function isUuid(v) {
  return typeof v === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

/**
 * Assert a launch invocation satisfies the contract.
 *
 * ENFORCED AS OF SD-LEO-INFRA-SESSION-SPAWN-AND-PROMPT-LIBRARY-001-F at three EXECUTION seams:
 * spawn-control.js (before the spawner), worker-spawn-executor.cjs (in runExecutor), and
 * reboot-respawn-runner.js (inside the live guard). Before that it had ZERO non-test callers.
 *
 * ⚠️ WHAT THIS CONTRACT DOES **NOT** COVER — do not over-trust it (FR-5):
 *  1. It is checked only on invocations that flow through buildSessionLaunch. These production
 *     surfaces spawn Claude WITHOUT ever reaching this builder, and violate every clause:
 *       - scripts/execute-team.mjs      (headless `claude --print`, via cmd.exe)
 *       - lib/drain-orchestrator.mjs    (headless `claude --print`)
 *       - scripts/leo-continuous-loop.ps1 (PowerShell Start-Process — beyond any JS assertion)
 *     Wiring this contract did NOT bring them under it; they need their own work item.
 *  2. It inspects the DECLARED invocation.env, never the MERGED child environment — every spawner
 *     spreads process.env underneath. It proves declared intent about launch shape, not what the
 *     child actually receives.
 *  3. The launcher-token clause is a SHAPE check, not launcher authenticity (see its comment below).
 *
 * @returns {{ok:boolean, violations:string[]}}
 */
function assertLaunchContract(inv, { expectProfile = false, expectResume = false } = {}) {
  const v = [];
  if (!inv || inv.program !== 'wt.exe') v.push('program must be wt.exe (persistent), not a bare/headless claude');
  const args = (inv && inv.args) || [];
  const dIdx = args.indexOf('-d');
  if (dIdx < 0 || !args[dIdx + 1]) v.push('missing -d <cwd> explicit start directory');
  // FR-5: a NEW WINDOW, not a tab on an existing one. Without this the FR-4 enumeration diff can
  // never see a window appear (a tab adds none) and Open cannot raise the session independently.
  // `-w` is GLOBAL, so it must come BEFORE the new-tab subcommand or wt parses it as new-tab's arg.
  const wIdx = args.indexOf('-w');
  const ntIdx = args.indexOf('new-tab');
  if (wIdx < 0 || args[wIdx + 1] !== 'new') v.push('missing -w new (a tab on an existing window creates no new top-level window)');
  else if (ntIdx >= 0 && wIdx > ntIdx) v.push('-w new must PRECEDE new-tab (-w is a global wt option)');
  if (args.includes('-p') || args.includes('--print')) v.push('headless -p/--print is forbidden (must be persistent)');
  const claudeTok = args[args.indexOf('--') + 1];
  // SD-LEO-INFRA-SESSION-SPAWN-AND-PROMPT-LIBRARY-001-F (FR-4): name the operator lever in the
  // violation itself. Now that this contract is ENFORCED at three spawn seams, this clause is the one
  // an operator can actually trip — resolveClaudeCmd above returns FLEET_CLAUDE_CMD / CLAUDE_CLI_PATH
  // VERBATIM, so a wrapper .cmd, a quoted path or an interpreter form ("node cli.js") refuses every
  // spawn fleet-wide. Neither variable is documented anywhere, so a bare "missing token" message left
  // the operator with no way to connect the refusal to the knob they set. Stated at the DEFINITION so
  // all three seams inherit it rather than each re-deriving the hint.
  // NOTE the regex is deliberately a SHAPE check, not launcher authenticity — it is unanchored at the
  // start, so a path ending in "notclaude" passes. Do not read this clause as anti-hijack.
  if (!claudeTok || !/claude(\.cmd|\.exe)?$/i.test(claudeTok)) {
    // The offending VALUE is deliberately NOT echoed. Refusals reach logs and, via the fleet-actions
    // route, an HTTP 500 body; a launcher override can embed a username or private directory layout.
    // Every other violation string here is a static literal for the same reason — naming the KNOB is
    // what the operator needs, not a reflection of what they typed.
    v.push('missing resolved claude launcher token after -- (if FLEET_CLAUDE_CMD or CLAUDE_CLI_PATH is set it is used verbatim and must end in claude, claude.cmd or claude.exe — unquoted, no wrapper script, no interpreter prefix)');
  }
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
