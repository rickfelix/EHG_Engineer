/**
 * Fleet spawn-control -- the SIX governed verbs (spawn/attach/stop/restart/relaunch-under-profile/
 * drain-and-restart), SD-LEO-INFRA-FLEET-SPAWN-CONTROL-001.
 *
 * Composes existing primitives rather than rebuilding them: scripts/fleet/worker-spawn-executor.cjs's
 * spawn-detached pattern, lib/coordinator/singleton-refresh-sequencer.cjs's register-then-retire mutex,
 * lib/fleet/claim-boundary-probe.cjs's idle-boundary probe, and lib/fleet/session-registry-adapter.js's
 * DB adapter over SD-A's pure registry/manifest libs. Adds the three genuinely-new pieces: window-handle
 * capture (window-handle.js), CLAUDE_CONFIG_DIR profile injection, and this six-verb composition layer.
 *
 * SAFETY -- THE DEFAULT IS INERT. THIS HOST MAY NOT BE. *** DO NOT READ THIS COMMENT AS THE ANSWER
 * TO "IS SPAWNING ARMED RIGHT NOW". *** The live OS spawn (a visible Windows Terminal process) is
 * default-OFF behind FLEET_SPAWN_CONTROL_LIVE. With the flag unset every verb that would
 * spawn/relaunch a process instead logs the invocation it WOULD run and returns
 * { live:false, invocation }. Flipping the flag on requires the same operator host-validation gate
 * worker-spawn-executor.cjs already documents (the exact wt.exe invocation is host-specific).
 *
 * HOW TO CHECK THE ACTUAL STATE (QF-20260726-575). A static comment cannot track an env var, and
 * this one previously opened "STAGED / INERT BY DEFAULT" on a host where the flag WAS set -- so a
 * reader answering "is this safe to touch" from the header got the wrong answer in the PERMISSIVE
 * direction. In order of reliability:
 *   1. GET /api/fleet-panel -> spawnControl.live
 *   2. isLiveEnabled() from this module, IN THE PROCESS YOU CARE ABOUT
 *
 * WHY (1) IS AUTHORITATIVE, and it is not "because the server loads .env": it reports the state of
 * THE PROCESS THAT WOULD ACTUALLY PERFORM THE SPAWN. This flag is per-process, not per-host, so the
 * only honest answer is the one measured inside the spawning process.
 *
 * *** DO NOT infer it from process.env in some OTHER process. *** FLEET_SPAWN_CONTROL_LIVE lives in
 * .env, so a bare `node -e "process.env.FLEET_SPAWN_CONTROL_LIVE"` prints undefined on a host where
 * the flag is set -- and ABSENT READS AS INERT, the same permissive-direction error by a second
 * route that never touches this comment. Measured while writing this fix: a probe run from a git
 * WORKTREE resolved a .env that does not exist there, injected 0 vars, and reported live:false on
 * this armed host. Nothing was wrong with the code -- that process really was inert. Which is the
 * whole point: ask the process that spawns, not a comment and not a different process.
 *
 * (The original text claimed parity with WORKER_SPAWN_EXECUTOR_LIVE. That is a DESIGN-INTENT note
 * about a different variable, not a statement about this gate: isLiveEnabled() reads
 * FLEET_SPAWN_CONTROL_LIVE and nothing else. Kept here as history so the parenthetical is not
 * re-added as if it described the mechanism.)
 */
import { spawn as spawnProcess } from 'node:child_process';
import path from 'node:path';
import { buildSessionLaunch, assertLaunchContract } from './build-session-launch.cjs';
import { enforceTreeCurrency } from './tree-currency.cjs';
import {
  resolveLiveSession,
  loadLiveSessionIdentity,
} from './session-registry-adapter.js';
import { resolveSpawnDecisions } from './spawn-executor-core.cjs';
import { captureNewWindowHandle, enumerateWindows, focusWindow, setWindowVisibility } from './window-handle.js';
import { classifyHideRefusal, readWindowOwner, setWindowVisible } from './window-visibility-writer.js';
import { evaluateClaimBoundary } from './claim-boundary-probe.cjs';


const SINGLETON_ROLES = new Set(['coordinator', 'adam', 'solomon']);

/**
 * Session-bind budget, exported so it can be asserted directly rather than by wall-clock.
 * 20 x 500ms = 10s. Sized from a MEASURED live spawn where registration completed ~3s after launch and
 * the previous 1.5s budget missed it by 1.3s. Headroom is deliberate: a loaded host registers slower,
 * and the cost of overshooting is a few seconds on a spawn that was already failing, whereas the cost
 * of undershooting is a silently unstamped, undiscoverable session.
 */
export const SESSION_BIND_MAX_ATTEMPTS = 20;
export const SESSION_BIND_DELAY_MS = 500;

/**
 * CANARY_PROFILE stays duplicated from canary-guard.js ON PURPOSE: canary-guard.js imports
 * stop/restart/relaunchUnderProfile from THIS module, so importing it back would be a cycle. A test
 * asserts the two agree, so the drift is caught rather than merely hoped against.
 *
 * FR-4: the CALLSIGN prefix and its predicate no longer need that treatment. Both now come from
 * startup-prompt-selection.js, which imports nothing and therefore cannot close the cycle — one
 * real source instead of a copy plus a drift test. Re-exported here so existing importers of
 * spawn-control's CANARY_CALLSIGN_PREFIX keep working unchanged.
 */
export const CANARY_PROFILE = 'canary';
export { CANARY_CALLSIGN_PREFIX } from './startup-prompt-selection.js';
import { isCanaryCallsign as isCanaryNamespaceCallsign } from './startup-prompt-selection.js';
// SD-LEO-FEAT-FLEET-SESSION-LIFECYCLE-001 / FR-1b slice 1 — see releaseHeldWorkItem below.
import { bestEffortReleaseSd } from './best-effort-release.mjs';
import { releaseWorkItemOnSessionEnd, isReleaseWorkItemResetEnabled } from './release-work-item.mjs';
// FR-4 trigger key: imported, not duplicated. canary-session.js now imports only the pure
// startup-prompt-selection.js, so spawn-control -> canary-session closes no cycle.
import { CANARY_TRIGGER_KEY } from './canary-session.js';
const PROFILE_NAME_RE = /^[A-Za-z0-9_-]+$/;

/** Derive a session's role from its metadata (mirrors coordination-events.cjs's own convention). */
export function roleOf(session) {
  const md = (session && session.metadata) || {};
  if (String(md.is_coordinator) === 'true') return 'coordinator';
  if (md.role) return md.role;
  return 'worker';
}

export function isSingletonRole(role) {
  return SINGLETON_ROLES.has(role);
}

/**
 * Resolve an account-profile NAME to a directory under an operator-configured base dir. Rejects
 * anything but a bare alnum/dash/underscore name -- never a raw/absolute/traversal path from card
 * input (TR-5, FR-7 SECURITY acceptance criteria).
 */
export function resolveProfileDir(profileName, opts = {}) {
  const baseDir = opts.baseDir ?? process.env.FLEET_ACCOUNT_PROFILES_DIR ?? null;
  if (!baseDir) throw new Error('resolveProfileDir: FLEET_ACCOUNT_PROFILES_DIR is not configured');
  if (typeof profileName !== 'string' || !PROFILE_NAME_RE.test(profileName)) {
    throw new Error(`resolveProfileDir: invalid profile name: ${JSON.stringify(profileName)}`);
  }
  // TR-1: this SD is Windows-only infra (baseDir is always a Windows path on the fleet host). Use
  // path.win32 explicitly so the join is correct even when this module runs under CI/tests on a
  // non-Windows runner (path.join maps to path.posix there and would silently forward-slash-join).
  return path.win32.join(baseDir, profileName);
}

/** True only when the operator has explicitly enabled the live OS spawn/relaunch surface. */
/**
 * True when a path sits under `.worktrees/` and is therefore EXEMPT from the spawn-source
 * tree-currency check. SD-FDBK-INFRA-SPAWN-SOURCE-CURRENCY-001 FR-1.
 *
 * Extracted from an inline expression so there is ONE representation of the exemption. The
 * exemption itself is correct and deliberate: a per-SD worktree is legitimately off-main and
 * behind by construction (that is what a feature branch IS), so asserting currency there would
 * refuse every worktree spawn while proving nothing.
 *
 * The hazard it creates is narrower, and is why this is exported: a DEDICATED spawn-source
 * worktree — the fix this SD is building — would be caught by the same path test and silently
 * exempted from the very invariant it exists to uphold. It would appear to work while asserting
 * nothing. Pairing the exemption with assertSpawnSourceNotExempt() below keeps the guard and the
 * exemption reading the same predicate, so they cannot drift.
 */
export function isWorktreeExemptPath(cwd) {
  return String(cwd || '').replace(/\\/g, '/').includes('/.worktrees/');
}

/**
 * Guard for the FR-1 siting constraint: a spawn-source tree MUST NOT be placed where the
 * worktree exemption would skip its currency check. Throws rather than returning a boolean so a
 * misconfigured location fails loudly at setup instead of degrading into a silently-unguarded
 * spawn path — the failure mode here is invisible by construction, so it must not be optional
 * to check for.
 */
export function assertSpawnSourceNotExempt(cwd) {
  if (isWorktreeExemptPath(cwd)) {
    throw new Error(
      `spawn-source tree may not sit under .worktrees/ (got: ${cwd}). Paths there are EXEMPT from ` +
      'the tree-currency check, so siting the spawn source inside one would disable the invariant ' +
      'it exists to uphold — the spawn would appear guarded while asserting nothing. ' +
      'Site it outside .worktrees/, or narrow the exemption. (SD-FDBK-INFRA-SPAWN-SOURCE-CURRENCY-001 FR-1)',
    );
  }
  return cwd;
}

/**
 * Directory name of the dedicated spawn-source worktree, relative to the repo root.
 * SD-FDBK-INFRA-SPAWN-SOURCE-CURRENCY-001 FR-1.
 */
export const SPAWN_SOURCE_DIRNAME = '.spawn-source';

/**
 * Resolve where the dedicated spawn-source worktree lives, and REFUSE a location that would be
 * silently unguarded. FR-1.
 *
 * WHY A DEDICATED TREE AT ALL: the shared root is chronically dirty (measured 2026-08-01: 12
 * behind origin/main, 311 porcelain paths — 25 tracked, 286 untracked), and selfHealable at
 * tree-currency.cjs:150 requires a FULLY clean tree, so the self-heal never fires there and every
 * fleet merge strands operator spawns until a human intervenes. A tree that is always clean and
 * always on main makes that existing self-heal reachable without relaxing it.
 *
 * TWO SITING CONSTRAINTS, both load-bearing, the second one counter-intuitive:
 *
 *   1. NOT under `.worktrees/`. That path is EXEMPT from the currency check
 *      (isWorktreeExemptPath), so a spawn source sited there would appear to work while
 *      asserting nothing. assertSpawnSourceNotExempt enforces this and throws.
 *
 *   2. MUST BE GITIGNORED. The intuitive reading — that the tree must be a SIBLING of the repo,
 *      because a worktree inside the root would show up as untracked dirt and worsen the very
 *      problem — is FALSE, and was checked rather than assumed: `.worktrees/` is gitignored
 *      (.gitignore:11) and contributes ZERO entries to `git status --porcelain`. So an in-repo
 *      location adds no dirt PROVIDED it is ignored. The constraint is the ignore entry, not the
 *      placement. `.spawn-source/` is added to .gitignore in the same commit as this function —
 *      an unignored location would dirty the root this SD exists to make dirt-tolerant.
 *
 * Overridable via FLEET_SPAWN_SOURCE_DIR for operators whose layout differs; the override is
 * guarded identically, because the exemption hazard does not care who chose the path.
 */
export function resolveSpawnSourceDir(repoRoot, env = process.env) {
  const override = env.FLEET_SPAWN_SOURCE_DIR && String(env.FLEET_SPAWN_SOURCE_DIR).trim();
  const dir = override || path.join(String(repoRoot || ''), SPAWN_SOURCE_DIRNAME);
  return assertSpawnSourceNotExempt(dir);
}

/**
 * Build the `git worktree add` argv for the spawn-source tree. Pure — no side effects, no I/O —
 * so the command shape is assertable without touching a real repo.
 * SD-FDBK-INFRA-SPAWN-SOURCE-CURRENCY-001 FR-1.
 *
 * WHY THIS IS HAND-ROLLED RATHER THAN A worktree-manager CALL, since the PRD originally said
 * otherwise and that was wrong: createWorktree cannot produce this tree. WORKTREES_DIR is a module
 * const '.worktrees' (worktree-manager.js:41), getWorktreesDir takes no override (:742-745), and
 * createWorktree computes path.join(worktreesDir, resolvedKey) with no path parameter (:765+) while
 * also requiring a validated sdKey. It can only ever produce `.worktrees/<sdKey>` — the exact
 * exempt path assertSpawnSourceNotExempt forbids — and the spawn source is not an SD.
 *
 * `--detach` is deliberate: the spawn source is a READ-ONLY snapshot of the base ref, never a
 * branch anyone commits to. Checking out a branch here would let two worktrees hold the same
 * branch (git refuses) and would invite commits into a tree whose whole value is being pristine.
 */
export function buildSpawnSourceWorktreeArgs(dir, baseRef) {
  return ['worktree', 'add', '--detach', String(dir), String(baseRef)];
}

/**
 * Ensure the spawn-source worktree exists at the resolved location, creating it once and reusing
 * it thereafter. FR-1.
 *
 * Idempotent by design: the fleet spawns constantly, so a create-every-time implementation would
 * fail on the second spawn. `exists` is injected rather than probed here so the decision is
 * testable without a filesystem.
 *
 * Both siting constraints are enforced before anything is created — resolveSpawnSourceDir throws
 * on a `.worktrees/` location, and the caller must have the `.spawn-source/` ignore entry in place
 * (asserted by test) or the new tree becomes untracked dirt in the root it exists to protect.
 *
 * @param {object} deps
 * @param {string} deps.repoRoot
 * @param {(dir:string)=>boolean} deps.exists      - existence probe (fs.existsSync in production)
 * @param {(args:string[])=>unknown} deps.runner   - git runner; receives argv, never a shell string
 * @param {string} [deps.baseRef]
 * @param {object} [deps.env]
 * @returns {{dir:string, created:boolean}}
 */
export function ensureSpawnSourceWorktree({ repoRoot, exists, runner, baseRef = 'origin/main', env = process.env }) {
  const dir = resolveSpawnSourceDir(repoRoot, env);
  if (exists(dir)) return { dir, created: false };
  runner(buildSpawnSourceWorktreeArgs(dir, baseRef));
  return { dir, created: true };
}

export function isLiveEnabled(env = process.env) {
  return String(env.FLEET_SPAWN_CONTROL_LIVE || '').toLowerCase() === 'true';
}

/**
 * Build the host command that WOULD launch a visible Windows Terminal session for a role/callsign,
 * optionally under a switched account profile. Returns a structured command; NEVER executes it here.
 * ⚠️ Host-specific, like worker-spawn-executor.cjs's buildSpawnInvocation -- operator-validate before
 * flipping FLEET_SPAWN_CONTROL_LIVE.
 *
 * SD-LEO-INFRA-LEO-APP-LAUNCHER-001 (FR-2): this now DELEGATES to the canonical buildSessionLaunch —
 * the single source of the launch contract (full claude.cmd path + explicit -d <cwd> repo-root start
 * dir + CLAUDE_CONFIG_DIR + PERSISTENT wt.exe tab + auto-resume, fail-loud). No per-path launch logic
 * lives here anymore. `resumeUuid` still reattaches a captured session; `profileDir` is pre-resolved
 * by spawn() and passed through; the returned invocation additionally carries `cwd`+`persistent`.
 *
 * QF-20260724-290: `startupPrompt` is forwarded too, because this hop used not to destructure it at
 * all and silently DISCARDED a caller-supplied keepalive.
 *
 * FR-2 CORRECTION — that QF did not actually fix the ghosting it describes. It made this hop pass
 * the prompt down to buildSessionLaunch, which wrote it to a `FLEET_WORKER_STARTUP_PROMPT` child
 * env var said to be seeded by a SessionStart hook. No such hook exists and nothing ever read that
 * variable (verified repo-wide), so the prompt was still discarded — one hop further along, and now
 * invisibly. The env carrier is deleted; the prompt has NO delivery path until FR-1 lands the
 * single-line pointer transport. Forwarding it here is still correct: FR-1 consumes it.
 */
export function buildLiveSpawnInvocation({ role, callsign, profileDir, resumeUuid, cwd, sdToResume, startupPrompt, sessionId, forkSession } = {}, opts = {}) {
  // FR-3: sessionId/uuidFn forwarded so the minted id is injectable (deterministic tests) rather
  // than only reachable through crypto.randomUUID inside the builder.
  return buildSessionLaunch({ role, callsign, profileDir, resumeUuid, cwd, sdToResume, startupPrompt, sessionId, forkSession }, opts);
}

/**
 * QF-20260725-757: the canonical keepalive prompt, mirroring reboot-respawn-runner.js's private
 * helper of the same name. Lazy dynamic import keeps this ESM module free of a load-time dependency
 * on the .cjs coordination-events surface (same idiom as the respawn runner).
 *
 * QF-20260727-488 — NOW ROLE-AWARE, in this order (do not reorder, do not key on role alone):
 *   (a) couldBeCanaryCallsign(callsign) -> ALWAYS FIRST, UNCONDITIONALLY WINS. Canaries ARE
 *       role='worker', so keying selection on role alone would hand every canary the claiming
 *       directive — startup-prompt-selection.js's own header forbids exactly that.
 *   (b) role is a known non-worker spawnable role (coordinator/solomon/adam) -> that role's
 *       directive, via resolveRoleSpawnOpts so the role->prompt map has one owner.
 *   (c) otherwise -> today's callsign-namespace selection, UNCHANGED.
 * Before this, only server/routes/fleet-actions.js addSession applied the role mapping (via
 * resolveRoleSpawnOpts spread into spawn()'s opts). spawnReplacement() (behind restart() and
 * relaunchUnderProfile()) calls spawn() with the EXISTING session's role but no startupPrompt key,
 * so this function is the only thing standing between a relaunched coordinator/solomon/adam and the
 * self-claiming worker /loop.
 */
async function defaultStartupPrompt(callsign, role, logFn) {
  const { FLEET_WORKER_STARTUP_PROMPT } = await import('../coordinator/coordination-events.cjs');
  const { couldBeCanaryCallsign, resolveStartupPromptForCallsign } = await import('./startup-prompt-selection.js');

  if (!couldBeCanaryCallsign(callsign)) {
    const { resolveRoleSpawnOpts } = await import('./role-startup-prompt.js');
    const roleOpts = resolveRoleSpawnOpts(role);
    if (Object.hasOwn(roleOpts, 'startupPrompt')) return roleOpts.startupPrompt;
  }

  // SD-...-PROMPT-LIBRARY-001-D FR-3 — SELECTION IS KEYED ON THE CALLSIGN NAMESPACE.
  //
  // THIS IS THE SECOND OF THE TWO COPIES, AND MISSING IT ARMED THE EXACT HAZARD THIS SD EXISTS TO
  // PREVENT. It took no callsign and returned the worker directive UNCONDITIONALLY, so every canary
  // spawned through spawn() was handed the claiming-worker prompt. That was harmless only while
  // nothing was delivered; the moment FR-1's pointer transport worked, it began delivering cleanly
  // — measured at the consumer: 1406 bytes, first line "/loop You are an autonomous LEO fleet
  // worker...". Fixing the runner alone was not fixing FR-3.
  //
  // Canary and unidentifiable resolve to null (no prompt, so the session ghosts) until a canary
  // prompt exists. Never fall through to the worker directive — see the resolver's header.
  const { prompt } = resolveStartupPromptForCallsign(callsign, {
    workerPrompt: FLEET_WORKER_STARTUP_PROMPT,
    canaryPrompt: null, // outstanding: no canary constant exists yet (chairman-authored content)
    logFn: logFn || (() => {}),
  });
  return prompt;
}

/**
 * Restricted event payload -- HARD-LOCKED to exactly {verb, outcome, at}, never
 * CLAUDE_CONFIG_DIR/profile paths/argv (FR-9, TR-6). No extension point: a future verb needing a
 * new field must widen this allowlist explicitly here, never spread arbitrary caller data through.
 */
function verbEventPayload({ verb, outcome }) {
  return { verb, outcome, at: new Date().toISOString() };
}

async function emitVerbEvent(supabase, { verb, session_id, outcome, sdKey }) {
  try {
    const { logCoordinationEvent } = await import('../coordinator/coordination-events.cjs');
    await logCoordinationEvent(supabase, {
      event_type: `fleet_verb_${verb}`,
      session_id: session_id ?? null,
      // QF-20260724-335: an explicit, intentional run-correlator (opt-in via opts.sdKey, e.g.
      // 'CHECKPOINT-3') so a set of drill-run events can be attributed to one invocation --
      // timing/session-proximity alone is insufficient (a stray dry-run batch can collide with a
      // real run). Defaults to null (unchanged behavior for every existing non-drill caller).
      sd_key: sdKey ?? null,
      payload: verbEventPayload({ verb, outcome }),
    });
  } catch { /* fail-open: event emission never blocks a verb outcome */ }
}

/**
 * FR-1: spawn a detached, visible session + capture its window handle. FR-5: dedup-by-callsign via
 * the SAME decision logic worker-spawn-executor.cjs already uses (resolveSpawnDecisions) -- never
 * spawn a callsign that's already live, whether this call came from restart()'s worker path or a
 * direct spawn() invocation.
 */
export async function spawn({ role, callsign, accountProfile } = {}, opts = {}) {
  const supabase = opts.supabaseClient;
  const live = opts.live ?? isLiveEnabled();
  const log = opts.log || (() => {});
  // QF-20260725-757: spawn() is the THIRD hop of the QF-20260724-290 keepalive drop. That QF fixed
  // buildLiveSpawnInvocation (L82) and reboot-respawn-runner, but spawn() still built its invocation
  // with no startupPrompt at all, so every session created through the generic spawn verb came up
  // with nothing to do, heartbeat once, and ghosted. Same opt-out semantics as the respawn runner
  // (reboot-respawn-runner.js:137): absent => canonical prompt, explicit null => deliberately none.
  const startupPrompt = ('startupPrompt' in opts) ? opts.startupPrompt : await defaultStartupPrompt(callsign, role, log);

  // ADVERSARIAL-REVIEW NOTE (known, accepted limitation): this dedup check reads liveCallsigns at a
  // point in time with no reservation/lock written before the OS spawn -- two near-simultaneous calls
  // for the same callsign can both observe "not live yet" and both proceed. This is the SAME inherent
  // TOCTOU shape worker-spawn-executor.cjs's own resolveSpawnDecisions() already has (this surface
  // reuses it rather than adding a new one); acceptable for a default-OFF, low-concurrency control
  // surface, not a regression introduced here.
  if (supabase && callsign && opts.skipDedup !== true) {
    const { callsignBySession } = await loadLiveSessionIdentity(supabase);
    const liveCallsigns = new Set(Object.values(callsignBySession));
    const decision = resolveSpawnDecisions({
      pendingRequests: [{ id: 'spawn-verb', requested_callsign: callsign, status: 'pending', requested_at: new Date().toISOString() }],
      liveCallsigns,
      nowMs: opts.nowMs ?? Date.now(),
      perTickCap: 1,
    });
    if (decision.toSpawn.length === 0) {
      const reason = (decision.skipped[0] && decision.skipped[0].reason) || 'already_live';
      log(`[spawn-control] skip spawn for ${callsign}: ${reason}`);
      await emitVerbEvent(supabase, { verb: 'spawn', outcome: `skipped:${reason}` });
      return { live: false, skipped: true, reason };
    }
  }

  let profileDir = null;
  if (accountProfile) profileDir = resolveProfileDir(accountProfile, opts);
  // `cwd` is forwarded so a caller can spawn into an explicit tree instead of always
  // defaulting to the module root. buildSessionLaunch has always accepted it; spawn() just
  // never passed it through. Undefined keeps the existing default-to-repo-root behaviour
  // byte-for-byte, and it makes the FR-2 currency seam addressable by a test.
  //
  // MERGE NOTE (origin/main): the second `opts` argument arrived independently on main while
  // this branch was open. The two changes are orthogonal — `cwd` is read off the FIRST
  // argument (the spec) by buildSessionLaunch:75, `opts` is the SECOND — so both are kept.
  // Dropping either one silently disables a shipped feature: without `opts` the peer's
  // change is inert, without `cwd` the FR-2 seam below becomes untestable.
  // SD-LEO-FEAT-FLEET-SESSION-LIFECYCLE-001 / FR-3: resumeUuid and sessionId are now THREADED.
  // buildLiveSpawnInvocation has always ACCEPTED them (:144) but spawn() never forwarded them, so
  // a caller could set opts.resumeUuid and have it SILENTLY IGNORED — the launch came up cold
  // while every signature looked correct. This is the choke point behind restart,
  // relaunchUnderProfile, canaryRestart and drainAndRestart, so forwarding here repairs all four.
  const invocation = buildLiveSpawnInvocation({
    role, callsign, profileDir, startupPrompt,
    cwd: opts.cwd,
    resumeUuid: opts.resumeUuid,
    sessionId: opts.sessionId,
    forkSession: opts.forkSession,
  }, opts);

  if (!live) {
    log(`[spawn-control] DRY-RUN would spawn ${role}/${callsign}: ${invocation.program} ${invocation.args.join(' ')}`);
    await emitVerbEvent(supabase, { verb: 'spawn', outcome: 'dry_run' });
    return { live: false, invocation };
  }

  // SD-LEO-INFRA-SPAWN-ROOT-CURRENCY-INVARIANT-001 FR-2 — THE INVARIANT.
  //
  // invocation.cwd is the tree this session will EXECUTE from, and nothing keeps it
  // current: gh pr merge merges remotely, so the root's HEAD does not move at merge
  // time at all. Every merge therefore re-stales the tree that spawns the next worker,
  // and a fix stays inert until somebody happens to pull. Two subsystems were provably
  // running already-replaced code because of exactly this.
  //
  // So this is asserted HERE, at the execution seam, and NOT inside buildSessionLaunch:
  // that builder is synchronous, reboot-respawn-runner does not await it, and four
  // existing tests call it with no cwd — a precondition in the builder would hand a
  // Promise to production and run real git inside the unit tier.
  //
  // Self-heal when a fast-forward is safe, REFUSE otherwise. Refusing is the point: the
  // alternative is silently spawning a session that runs code the fleet already replaced.
  // Deliberately placed AFTER the dry-run return, so a dry run never touches git.
  // SD-FDBK-INFRA-SPAWN-SOURCE-CURRENCY-001 FR-1: the exemption test is now ONE exported
  // predicate (isWorktreeExemptPath) rather than an inline expression, so the guard that keeps a
  // dedicated spawn-source tree OUT of this exemption cannot drift from the exemption itself.
  //
  // SCOPE, stated explicitly because it is a real limit and not an accident: this asserts
  // currency of the ROOT that spawns. A per-SD worktree under .worktrees/ is deliberately
  // exempt — such a tree is legitimately off-main and behind by construction (that is what
  // a feature branch IS), so asserting currency there would refuse every spawn from a
  // worktree while proving nothing about the defect this SD fixes. The measured incidents
  // (an inert canary fix, an inert reap-protected marker) were both the shared ROOT.
  // Consequence to be honest about: a spawn issued from inside a worktree is NOT guarded.
  const spawnsFromWorktree = isWorktreeExemptPath(invocation.cwd);
  if (!spawnsFromWorktree) {
    const currency = enforceTreeCurrency({
      dir: invocation.cwd,
      // RCA (post-CI): this deliberately does NOT read opts.env. Callers such as
      // canaryRestart/relaunchUnderProfile pass a NARROW opts.env carrying one unrelated
      // feature flag (e.g. {FLEET_CANARY_KILL_ENABLED:'true'}), and because that value
      // REPLACES process.env wholesale rather than extending it, keying the currency check
      // off it made FLEET_TREE_CURRENCY_BYPASS_REASON silently unreachable on every canary
      // path — the documented escape hatch, dead, with no error. Currency gets its OWN
      // channel, matching worktree-reaper-tick.cjs:263-264 (opts.currencyEnv).
      env: opts.currencyEnv || process.env,
      logger: { warn: (m) => log(m) },
      label: `spawn source tree for ${role}/${callsign}`,
      ...(opts.currencyRunner ? { runner: opts.currencyRunner } : {}),
    });
    if (currency.healed) log(`[spawn-control] spawn source tree was behind and has been fast-forwarded before spawning ${callsign}`);
    if (currency.currencyBypassed) invocation.currencyBypassed = true;
  }

  // SD-LEO-INFRA-SESSION-SPAWN-AND-PROMPT-LIBRARY-001-E FR-4 — PRE-REGISTER THE CANARY BEFORE IT RUNS.
  //
  // Placed HERE for one reason: the child can check in within milliseconds of starting, and the claim
  // fence can only see a marker that already exists. Writing it after spawn would recreate the exact
  // window this SD closes. It is also AFTER the dry-run return above, so a dry run writes nothing.
  //
  // FAIL CLOSED — REFUSE THE SPAWN. A canary that cannot be marked is a canary that passes the claim
  // fence and takes real work off the shared queue, which is the defect this SD exists to prevent. A
  // refused canary provision costs one retry; an unmarked one corrupts a peer's queue. Note the
  // metadata stamp further down is NOT a fallback for this: it lives inside the session-bind loop that
  // was measured missing its window by 1.3s, discarding all three of its writes at once.
  //
  // SCOPED TO CANARY SPAWNS, and I am stating why explicitly: a near-miss on 2026-07-26 left a
  // hardcoded ok:false at this call site that would have refused EVERY spawn, restart, relaunch and
  // canary-provision — a fleet-wide outage from one line. So this refusal is gated on
  // accountProfile === CANARY_PROFILE and cannot reach an ordinary worker. A negative control in
  // tests/unit/fleet/canary-pre-registration.test.js drives an ordinary spawn with a client that
  // throws on every call and asserts it STILL spawns; if that test ever passes vacuously, this comment
  // is the record of what it was protecting.
  if (accountProfile === CANARY_PROFILE) {
    const { writeCanaryPreRegistration } = await import('./canary-session.js');
    const preReg = await writeCanaryPreRegistration(supabase, invocation && invocation.sessionId, {
      callsign,
      reason: `spawn:${role || 'unknown'}`,
    });
    if (!preReg.ok) {
      log(`[spawn-control] REFUSING canary spawn ${callsign}: pre-registration failed (${preReg.error}) — an unmarked canary can claim real work`);
      await emitVerbEvent(supabase, { verb: 'spawn', outcome: 'canary_pre_registration_failed' });
      return { live: false, skipped: true, reason: `canary_pre_registration_failed:${preReg.error}` };
    }
  }

  const spawner = opts.spawnFn || ((program, args, env) => {
    // FR-2: carry the invocation's repo-root cwd (paired with new-tab -d) so the session registers in claude_sessions.
    // Strip the spawner's OWN Claude Code session markers before inheriting. These identify the
    // PARENT session; carrying them into an independent fleet session makes Claude Code treat it
    // as a child, which switches off session persistence so it never registers. Setting the
    // override in childEnv is not sufficient on its own — the stale marker must actually be gone.
    const inherited = { ...process.env };
    for (const k of ['CLAUDE_CODE_CHILD_SESSION', 'CLAUDE_SESSION_ID', 'CLAUDE_CODE_SESSION_ID']) {
      delete inherited[k];
    }
    // SEC-3 (adversarial security review): a currency bypass must NOT propagate. Without
    // this, an operator who sets the reason once has silently disabled the invariant for
    // every session this spawns AND for everything those sessions spawn in turn — the
    // hatch escapes the operator who opened it. Scope it to the process that set it.
    delete inherited.FLEET_TREE_CURRENCY_BYPASS_REASON;
    const child = spawnProcess(program, args, { detached: true, stdio: 'ignore', cwd: invocation.cwd, env: { ...inherited, ...env } });
    child.unref();
    return child;
  });

  // FR-4: the BEFORE snapshot must be taken BEFORE the process launches. Ordering this after the
  // spawn would make the set difference always empty while every pure unit test still passed --
  // green-and-dead, the failure mode this SD exists to close. Enumeration is read-only and
  // fail-soft: on error it yields [], which degrades to no_new_window rather than a wrong handle.
  const enumerate = opts.enumerateWindowsFn || enumerateWindows;
  const beforeWindows = await enumerate(opts);

  // SD-LEO-INFRA-SESSION-SPAWN-AND-PROMPT-LIBRARY-001-F (FR-1): enforce the launch contract at the
  // EXECUTION seam. assertLaunchContract had ZERO non-test callers, so every guarantee it makes was
  // verified only in the unit tier. Placed here, not inside buildSessionLaunch, for exactly the
  // reason the tree-currency invariant above is: the builder is synchronous, reboot-respawn-runner
  // does not await it, and existing tests call it with no cwd.
  //
  // FR-2: STRUCTURAL clauses only — expectProfile/expectResume stay FALSE. reboot-respawn-runner
  // documents an intentional fail-SOFT profile degrade (a launch with an unresolvable profile still
  // spawns, without CLAUDE_CONFIG_DIR), and spawn-control legitimately builds without a profile when
  // accountProfile is absent. Demanding a profile here would silently convert that documented policy
  // into fail-closed — a behaviour change nobody asked for.
  //
  // SCOPE OF THE CHECK: it inspects the DECLARED invocation.env, not the merged child environment
  // (the spawner below spreads process.env under invocation.env). It proves declared intent.
  const contract = assertLaunchContract(invocation);
  if (!contract.ok) {
    throw new Error(`[spawn-control] LAUNCH CONTRACT VIOLATION — refusing to spawn ${callsign || '<unknown>'}: ${contract.violations.join('; ')}`);
  }

  const child = spawner(invocation.program, invocation.args, invocation.env);
  const pid = child && child.pid;

  // FR-4: capture by set difference, not by (Get-Process -Id <launcher pid>).MainWindowHandle.
  // wt.exe hands the tab to the running WindowsTerminal.exe host and exits, so that query ran
  // against a dead process and could only ever fail; and MainWindowHandle is per-PROCESS, so it
  // cannot name one session's window among the many sharing a host.
  const captureFn = opts.captureNewWindowHandleFn || captureNewWindowHandle;
  const handleResult = await captureFn(beforeWindows, opts);

  // QF-20260724-739: bind session_id via the spawned process's OWN SessionStart-registered
  // claude_sessions row (matched by pid), independent of window-handle capture success -- a captured
  // handle and a bound session are separate concerns, and S7 acceptance only needs the latter. The
  // prior code resolved this same row but discarded session_id before the event/return below, so
  // every spawn/respawn/relaunch chain reported session_id:null even on a genuine successful bind.
  // A small bounded retry (mirrors window-handle.js's own injectable poll idiom) absorbs the residual
  // race where SessionStart registration lands just after captureWindowHandle's own poll exhausted.
  //
  // SD-LEO-INFRA-LAUNCHER-CAN-HOST-001 FR-3: the pid match above could never succeed. `pid` is the
  // wt.exe LAUNCHER pid, and wt.exe hands the tab to the running WindowsTerminal.exe host and exits
  // immediately, while claude_sessions.pid holds the CLAUDE CODE pid. The freshness window and the
  // 3-attempt retry were both compensating for a join that has no matching rows to find. Now that
  // the spawner MINTS the session id and passes it as --session-id, the child registers under that
  // exact id and correlation is a direct lookup -- no pid, no freshness heuristic (a minted UUID is
  // unique per spawn, so there is no recycling to defend against), no recognition step.
  // The pid path is retained only as a fallback for a caller that supplied no minted id.
  let boundSessionId = null;
  const mintedId = invocation && invocation.sessionId;
  if (supabase && (mintedId || pid)) {
    const sleepFn = opts.sleepFn || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    const nowMs2 = opts.nowMs ?? Date.now();
    const freshMs = opts.pidMatchFreshMs ?? 2 * 60 * 1000;
    // MEASURED ON A REAL SPAWN (2026-07-25), not guessed. The previous default was 3 attempts x 500ms
    // ~= 1.5s, and the live provisioning run missed by 1.3 SECONDS: the bind loop closed at
    // 20:29:42.6 (fleet_verb_spawn emitted immediately after it, outcome "ok") while Claude Code
    // finished registering at 20:29:43.9. A real session needs roughly 3s from spawn to registration.
    //
    // WHY THAT ONE MISS COST EVERYTHING: the window_handle write, the account_profile stamp and the
    // session_id bind ALL live inside this block, so a missed bind silently discards all three even
    // though the spawn, the window capture and the registration each SUCCEEDED independently. The
    // observable was a perfect-looking spawn with a completely empty metadata blob.
    //
    // NO UNIT TEST COULD HAVE CAUGHT THIS: every test injects a fake whose row is already present, so
    // the row is never LATE. Registration latency is exactly what a mocked seam cannot show you.
    //
    // The budget is only fully spent when a session NEVER registers; a healthy spawn still binds on
    // the first or second attempt, so this costs nothing on the happy path.
    const maxAttempts = opts.sessionBindMaxAttempts ?? SESSION_BIND_MAX_ATTEMPTS;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // ADVERSARIAL-REVIEW FIX (data integrity, retained): a bare `.update({ metadata:{...} })`
        // REPLACES the whole metadata JSONB blob -- read the current row first, merge client-side,
        // and only write back to the SAME session_id just read.
        const { data: current } = mintedId
          ? await supabase.from('claude_sessions')
            .select('session_id, metadata, created_at').eq('session_id', mintedId).maybeSingle()
          : await supabase.from('claude_sessions')
            .select('session_id, metadata, created_at').eq('pid', pid).maybeSingle();
        // Freshness guards pid recycling only; a minted id is unique per spawn and needs no window.
        const isFresh = mintedId
          ? true
          : current && current.created_at && (nowMs2 - Date.parse(current.created_at)) <= freshMs;
        if (current && isFresh) {
          boundSessionId = current.session_id;
          // FR-1/FR-3: STAMP account_profile HERE, on the fresh-spawn path. Previously accountProfile
          // was used only to resolve a profile DIRECTORY (L162) and never written, while the sole
          // writer of account_profile (canary-guard.js:173 stampRespawnedCanary) sits on the RESPAWN
          // path and is itself pid-dead. That is why zero sessions in 24h carried the stamp and
          // resolveCanaryTarget(by account_profile) fail-closed even with canaries alive and
          // heartbeating -- survival was sufficient, discoverability was not.
          await supabase.from('claude_sessions').update({
            metadata: {
              ...(current.metadata || {}),
              window_handle: handleResult.handle,
              handle_capture_failed: handleResult.handleCaptureFailed,
              // SD-LEO-INFRA-SESSIONS-PAGE-TRUE-001-A FR-2 — PERSIST OWNER IDENTITY AT CAPTURE.
              //
              // WITHOUT THIS THE WHOLE HIDE FEATURE IS INERT, and inert in a way unit tests cannot
              // see: classifyHideRefusal refuses with window_owner_identity_incomplete whenever the
              // owner is missing, so every hide against every real session would have been refused
              // while 60/60 tests passed. Caught by TESTING and SECURITY independently at EXEC —
              // setWindowOwner had zero production callers. A mechanism with no producer is the
              // same defect class as one with no consumer, and a test IS a consumer, which is
              // exactly why the suite stayed green.
              //
              // window_owner_pid IS NEVER A KILL TARGET — it is the SHARED WindowsTerminal host
              // (measured: 9 seats, ONE owning pid), so taskkill on it is a nine-seat outage. The
              // per-seat process is claude_sessions.pid. See lib/fleet/window-visibility-writer.js.
              ...(handleResult.owner ? {
                window_owner_pid: handleResult.owner.pid,
                window_owner_proc: handleResult.owner.procName,
                window_owner_start_ticks: handleResult.owner.startTicks,
                window_owner_captured_at: new Date().toISOString(),
              } : {}),
              // FR-4: persist the DIAGNOSIS on failure so the one permitted live run yields an answer
              // (nothing opened / filtered everything out / too many opened) instead of a bare retry.
              ...(handleResult.handleCaptureFailed && handleResult.diagnostics
                ? { window_handle_diagnostics: handleResult.diagnostics }
                : {}),
              ...(accountProfile ? { account_profile: accountProfile } : {}),
              // SD-LEO-FEAT-FLEET-SESSION-LIFECYCLE-001 / FR-3: WHERE THIS SEAT WAS LAUNCHED.
              // There was no launch_cwd anywhere, and restart worked only by coincidence — every
              // seat happens to sit in the main tree today. The moment one is launched from a
              // worktree, a restart without this resumes into the wrong directory and finds
              // nothing, with no error to say so. spawnReplacement reads it back (FR-3).
              // Stamped from the INVOCATION's resolved cwd, not process.cwd(): the invocation is
              // what the process was actually given.
              ...(invocation && invocation.cwd ? { launch_cwd: invocation.cwd } : {}),
              // FR-4 (PRD implementation_approach step 5): STAMP THE TRIGGER KEY.
              //
              // A VALIDATION review caught that CANARY_TRIGGER_KEY was READ by isCanaryMetadata and
              // mirrored into the marker payload but written to claude_sessions.metadata NOWHERE — an
              // unreachable disjunct, which is precisely what canary-session.js's own header forbids
              // ("worse than a stated gap because it reads as coverage"). I wrote that sentence and
              // then created an instance of it.
              //
              // Stamped here and in canary-guard.js stampRespawnedCanary, the two places that write
              // canary metadata at all. reboot-respawn-runner deliberately gets NO metadata stamp: it
              // writes none today and adding one would mean inventing a metadata write on the boot
              // path; that path is covered by the spawn-time marker instead, which is the whole reason
              // the marker exists. Stated rather than left as an apparent omission.
              ...(accountProfile === CANARY_PROFILE ? { [CANARY_TRIGGER_KEY]: true } : {}),
              // SD-LEO-INFRA-LAUNCHER-CAN-HOST-001 — MINT THE CANARY CALLSIGN.
              //
              // assertCanaryTarget is a TWO-CONJUNCT guard: account_profile==='canary' AND a
              // 'Canary-' callsign. FR-3 stamped only the first, so the provisioned canary was
              // DISCOVERABLE (resolveCanaryTarget resolved:true) but NOT TARGETABLE -- every CP3
              // target-scoped leg still rejected it with not_canary_callsign. Half a predicate.
              //
              // stampRespawnedCanary CANNOT supply this. It is a CARRY-FORWARD, not a mint: its
              // `callsign` comes from preResolveCanaryCallsign, which reads the target's CURRENT
              // canary callsign and returns null when there is none, so its setCallsign is false for
              // a first provisioning and it writes account_profile alone. The identity has to come
              // from the SLOT NAME, which provisionCanary already passes here as `callsign`
              // (canary-provision.js: callsign: slot.name -> 'Canary-pilot').
              //
              // DELIBERATELY CANARY-ONLY. Ordinary workers get their callsign from the coordinator's
              // SET_IDENTITY plus the tier-band scheme; stamping one here would pre-empt that
              // authority and collide with assign-fleet-identities. Gated on BOTH the canary profile
              // and the canary namespace so a mis-named slot cannot mint a NATO name.
              //
              // MERGE, never replace: keeps color and any other fleet_identity keys. Idempotent --
              // an existing canary callsign is left alone (same carry-forward semantics as the
              // respawn stamper, which is the reusable part of it).
              ...(accountProfile === CANARY_PROFILE && isCanaryNamespaceCallsign(callsign)
                && !isCanaryNamespaceCallsign(((current.metadata || {}).fleet_identity || {}).callsign)
                ? { fleet_identity: { ...((current.metadata || {}).fleet_identity || {}), callsign } }
                : {}),
            },
          }).eq('session_id', current.session_id);
          break;
        }
      } catch { /* fail-soft: try again below, or give up -- a later attach() re-resolves */ }
      if (attempt < maxAttempts) await sleepFn(opts.sessionBindDelayMs ?? SESSION_BIND_DELAY_MS);
    }
  }

  await emitVerbEvent(supabase, { verb: 'spawn', session_id: boundSessionId, outcome: handleResult.handleCaptureFailed ? 'handle_capture_failed' : 'ok' });
  return { live: true, invocation, pid, session_id: boundSessionId, ...handleResult };
}

/** FR-3: card -> registry -> real terminal window. */
export async function attach(target, opts = {}) {
  const supabase = opts.supabaseClient;
  const by = opts.by || 'callsign';
  const resolution = await resolveLiveSession(supabase, { by, value: target });
  if (!resolution.resolved) {
    await emitVerbEvent(supabase, { verb: 'attach', outcome: `not_resolved:${resolution.reason}` });
    return { ok: false, reason: resolution.reason };
  }

  const { session_id } = resolution.identity;
  const { data: row } = await supabase.from('claude_sessions').select('metadata').eq('session_id', session_id).maybeSingle();
  const handle = row && row.metadata && row.metadata.window_handle;
  if (!handle) {
    await emitVerbEvent(supabase, { verb: 'attach', session_id, outcome: 'no_captured_handle' });
    return { ok: false, reason: 'no_captured_handle', session_id };
  }

  const focused = await focusWindow(handle, opts);
  await emitVerbEvent(supabase, { verb: 'attach', session_id, outcome: focused ? 'ok' : 'stale_handle' });
  return { ok: focused, reason: focused ? null : 'stale_handle', session_id };
}

/**
 * SD-LEO-INFRA-SESSIONS-PAGE-TRUE-001-A FR-4 — hide/show a session's window.
 *
 * NOT MODELLED ON attach() ABOVE, deliberately. attach reports ok from focusWindow, which returns
 * true whenever the PowerShell process resolves — it never inspects SetForegroundWindow's return.
 * That is tolerable for focus (a no-op if it fails) and NOT tolerable for hide: a wrongly-reported
 * hide leaves an invisible window with no affordance to recover it except the FR-7 sweep. So this
 * verb believes only `achieved`, which setWindowVisibility derives from an IsWindowVisible reading
 * taken AFTER the act.
 *
 * REFUSE BEFORE ACTING. classifyHideRefusal enumerates the three handle-less shapes plus an
 * incomplete owner identity; any of them refuses with a named reason and writes NOTHING. Hiding what
 * cannot be proven restorable is the one outcome with no cheap undo.
 *
 * PERSIST ONLY WHAT HAPPENED. window_visible is written after a verified flip, never before it, so
 * the row cannot claim a hide that did not occur — which is the operator-truth defect this SD exists
 * to close, in its most embarrassing form.
 */
export async function setSessionWindowVisibility(target, opts = {}) {
  const supabase = opts.supabaseClient;
  const show = Boolean(opts.show);
  const verb = show ? 'window_show' : 'window_hide';
  const by = opts.by || 'callsign';
  const resolution = await resolveLiveSession(supabase, { by, value: target });
  if (!resolution.resolved) {
    await emitVerbEvent(supabase, { verb, outcome: `not_resolved:${resolution.reason}` });
    return { ok: false, reason: resolution.reason };
  }
  const { session_id } = resolution.identity;
  const { data: row } = await supabase.from('claude_sessions').select('metadata').eq('session_id', session_id).maybeSingle();
  const metadata = (row && row.metadata) || {};

  // Hiding needs proof of restorability; showing does not (it can only make things visible), but a
  // show still needs a handle and an owner to target, so both go through the same classifier.
  const refusal = classifyHideRefusal(metadata);
  if (refusal) {
    await emitVerbEvent(supabase, { verb, session_id, outcome: `refused:${refusal}` });
    return { ok: false, refused: true, reason: refusal, session_id };
  }

  const result = await setWindowVisibility(metadata.window_handle, {
    show,
    owner: readWindowOwner(metadata),
    ...(opts.execFn ? { execFn: opts.execFn } : {}),
  });
  if (!result.achieved) {
    await emitVerbEvent(supabase, { verb, session_id, outcome: `not_achieved:${result.reason || 'unverified'}` });
    return { ok: false, refused: Boolean(result.refused), reason: result.reason || 'not_achieved', session_id };
  }

  const written = await setWindowVisible(session_id, { visible: show, by: opts.actor || 'fleet-api' }, opts);
  await emitVerbEvent(supabase, { verb, session_id, outcome: written.written ? 'ok' : 'ok_unpersisted' });
  return { ok: true, session_id, visible: show, persisted: Boolean(written.written) };
}

/**
 * SD-LEO-FEAT-FLEET-SESSION-LIFECYCLE-001 / FR-1b slice 1.
 *
 * Hand the session's work item back to the queue before its row is retired.
 *
 * ORDER IS LOAD-BEARING, and wiring only half of it would be a fix that does not fix:
 * releaseWorkItemOnSessionEnd's quick-fix predicate requires claiming_session_id IS NULL,
 * so calling it while this session still holds the claim matches nothing and returns
 * qf_untouched every time — green, and useless. The claim must be released FIRST.
 * Both steps must also run BEFORE the claude_sessions status update below, because
 * release_sd resolves what to release by reading claude_sessions.sd_key — retire the row
 * first and there is nothing left to tell us which item this session held.
 *
 * Reuses the sequence stale-session-sweep.cjs already proves on its CLAIM_BOUNDARY_PROBE
 * path (release, then reset, branching QF vs SD) rather than growing a second one.
 * Best-effort throughout: stop() must still retire the session even if the handback fails.
 */
async function releaseHeldWorkItem(supabase, sessionId, reason) {
  try {
    const { data: row } = await supabase
      .from('claude_sessions').select('sd_key').eq('session_id', sessionId).maybeSingle();
    const heldKey = row && row.sd_key;
    if (!heldKey) return { attempted: false, reason: 'session_holds_no_work_item' };

    // SD-scoped so a concurrent re-claim cannot make us drop an unrelated item
    // (QF-20260726-593: release_sd takes no SD argument and releases whatever is held).
    const rel = await bestEffortReleaseSd(supabase, sessionId, reason, () => {}, { expectedSdKey: heldKey });
    if (!rel.released) {
      return { attempted: true, key: heldKey, released: false, detail: rel.skipped || rel.error || 'release_failed' };
    }
    const reset = await releaseWorkItemOnSessionEnd(supabase, heldKey, reason);
    return { attempted: true, key: heldKey, released: true, action: reset.action, detail: reset.detail };
  } catch (err) {
    return { attempted: true, released: false, detail: (err && err.message) || String(err) };
  }
}

/** Stop a live session without spawning a replacement. */
export async function stop(target, opts = {}) {
  const supabase = opts.supabaseClient;
  const by = opts.by || 'callsign';
  const resolution = await resolveLiveSession(supabase, { by, value: target });
  if (!resolution.resolved) {
    await emitVerbEvent(supabase, { verb: 'stop', outcome: `not_resolved:${resolution.reason}` });
    return { ok: false, reason: resolution.reason };
  }

  const { session_id } = resolution.identity;

  // Until this landed, stop() flipped the session row to released and left the work item
  // in_progress with no claimant — invisible to every picker while still counted as
  // available supply. stop() was itself a strand manufacturer, which is why a Kill button
  // built on it before FR-1 would have manufactured strands faster than closing a window.
  // Default OFF: unset LEO_RELEASE_WORKITEM_RESET keeps the previous behaviour exactly.
  //
  // holderVerifiedGone (SD-LEO-INFRA-RELEASE-WORK-ITEM-001 / GK-1) — THREE-STATE, AND THE THIRD
  // STATE IS THE POINT. undefined means "the caller has no opinion", which is every pre-existing
  // caller, and MUST behave exactly as before. Only an explicit `false` suppresses the hand-back:
  // that is graceful-kill telling us it tried to kill the holder and COULD NOT PROVE IT DIED.
  // Handing the item back there would publish a claimable row whose worktree still has a live
  // process — the race graceful-kill's own step reorder exists to close, re-opened from a
  // different file. Hence `=== false` rather than a truthy test: absent must not read as unsafe,
  // and unsafe must not read as absent.
  //
  // Until this landed, the only thing preventing that double hand-back was INCIDENTAL, not a
  // guard: release_sd() nulls claude_sessions.sd_key, and releaseHeldWorkItem no-ops on the null.
  // That protection evaporates whenever graceful-kill's own release leg fails transiently and the
  // retry below succeeds — proven by an unmocked integration test during adversarial review.
  const holderMayBeAlive = opts.holderVerifiedGone === false;
  const workItemReset = isReleaseWorkItemResetEnabled() && !holderMayBeAlive
    ? await releaseHeldWorkItem(supabase, session_id, 'manual_stop')
    : null;

  const { error } = await supabase.from('claude_sessions').update({
    status: 'released', released_at: new Date().toISOString(), released_reason: 'manual_stop',
  }).eq('session_id', session_id);

  await emitVerbEvent(supabase, { verb: 'stop', session_id, outcome: error ? 'db_error' : 'ok' });
  return { ok: !error, session_id, ...(workItemReset ? { workItemReset } : {}) };
}

/**
 * Retire the PREDECESSOR OS PROCESS after a restart has been proven to succeed.
 *
 * WHY THIS EXISTS (FR-3 / AC-3-6). Restart retired the old DB *row* — sequenceSingletonRefresh for
 * singletons, a status='released' update for workers — and never touched the old *process*. So a
 * restart left two claude processes holding one seat while only one had a live row: the survivor
 * kept its claim heartbeat, kept its worktree, and was invisible to every gauge that reads the
 * registry rather than the process table. "Exactly one process holds the seat" was asserted by
 * nothing.
 *
 * THE ORDER IS THE SAFETY PROPERTY, exactly as in graceful-kill: this runs only AFTER the
 * replacement is confirmed live and the old row retired. Terminating first would, on a dry run or
 * a failed spawn, kill the incumbent and leave the seat empty — strictly worse than the defect.
 *
 * FAIL-CLOSED ON AN UNCERTAIN PROBE. A pid is only killed when the process table positively says
 * it is still claude. NO_MATCH means it already exited (nothing to do); PROBE_FAILED means the
 * probe told us nothing, and a pid whose identity we cannot confirm is never signalled — pids are
 * recycled, so guessing here kills an unrelated process. Refusing is reported, never silent.
 *
 * This is NOT the FR-2 graceful kill and deliberately does not call it: that entrypoint is
 * operator-initiated by contract (AC-2-8) and default-off. This is a restart completing its own
 * contract on a process it has already replaced.
 *
 * @returns {Promise<{outcome:string, pid:number|null, detail:string}>} never throws
 */
export async function retirePredecessorProcess(oldPid, deps = {}) {
  const {
    probeClaude,                       // (pid) => 'MATCH' | 'NO_MATCH' | 'PROBE_FAILED'
    kill,                              // (pid, signal) => Promise<void>
    verifyGone,                        // async (pid) => boolean | undefined
  } = deps;

  const pid = Number(oldPid);
  if (!Number.isInteger(pid) || pid <= 0) {
    return { outcome: 'skipped', pid: null, detail: 'no usable predecessor pid recorded' };
  }
  try {
    const probe = probeClaude ? probeClaude(pid) : 'PROBE_FAILED';
    if (probe === 'NO_MATCH') {
      return { outcome: 'already_gone', pid, detail: `pid ${pid} is no longer a claude process` };
    }
    if (probe !== 'MATCH') {
      // Refuse loudly rather than kill on a guess.
      return { outcome: 'refused', pid, detail: `cannot confirm pid ${pid} is still claude (${probe}) — not signalling a pid we cannot identify` };
    }

    await kill(pid, 'SIGTERM');
    let gone = verifyGone ? await verifyGone(pid) : undefined;
    if (gone !== true) {
      await kill(pid, 'SIGKILL');
      gone = verifyGone ? await verifyGone(pid) : undefined;
    }
    if (gone === true) return { outcome: 'terminated', pid, detail: `predecessor pid ${pid} terminated and verified absent` };
    return {
      outcome: 'unverified',
      pid,
      detail: `signalled pid ${pid} but could not verify absence — reporting rather than claiming a clean succession`,
    };
  } catch (err) {
    return { outcome: 'error', pid, detail: `predecessor retirement failed: ${(err && err.message) || err}` };
  }
}

/**
 * Internal: spawn a replacement session under the same role/callsign (shared by restart + relaunch).
 * skipDedup:true -- restart()/relaunchUnderProfile() already resolved ONE specific old session to
 * replace (not a speculative fresh request), so spawn()'s FR-5 already-live dedup would otherwise
 * always skip this (the old session under the same callsign is still live until it's retired).
 */
async function spawnReplacement({ oldIdentity, oldSession, accountProfile }, opts) {
  const role = roleOf(oldSession);
  const callsign = oldIdentity.callsign;

  // SD-LEO-FEAT-FLEET-SESSION-LIFECYCLE-001 / FR-3: carry the conversation across the restart.
  //
  // The replacement resumes in the OLD SESSION'S launch_cwd, not this process's cwd. Without that
  // a worktree-launched seat comes back up in the wrong directory and finds nothing — SILENTLY,
  // which is why it has looked like it works: every seat currently happens to sit in the main tree.
  //
  // resumeUuid is the OLD session_id (the resume token). metadata.resume_uuid is NOT consulted —
  // it is populated on 1 of 13,025 rows, so reading it would cold-start essentially every seat.
  //
  // The caller decides WHETHER to resume (it owns the transcript-existence check — promising
  // carry-over without verifying it is worse than cold-starting). Passing no resumeUuid yields a
  // cold start, which is the correct default when the conversation could not be verified.
  const launchCwd = (oldSession && oldSession.metadata && oldSession.metadata.launch_cwd) || opts.cwd;

  // FR-3 RESOLUTION LIVES HERE, AT THE CHOKE POINT — moved from restart().
  //
  // The PRD specifies this convergence explicitly: "relaunchUnderProfile, canaryRestart and
  // drainAndRestart, so ONE CHANGE REPAIRS FOUR PATHS". Resolving in restart() repaired only
  // three: relaunchUnderProfile (and canaryRelaunchUnderProfile through it) call spawnReplacement
  // DIRECTLY, so they kept cold-starting silently — the same defect, surviving in the one path the
  // first fix did not route through. Coverage by call-routing is not coverage of the invariant.
  //
  // An explicit caller-supplied plan still wins; this only fills the gap when nobody decided.
  let resumePlan = { resumeUuid: opts.resumeUuid, sessionId: opts.sessionId, forkSession: opts.forkSession };
  if (opts.resumeUuid === undefined && opts.forkSession === undefined) {
    const { resolveResumePlan, transcriptPathFor } = await import('./resume-context.mjs');
    const fs = await import('node:fs');
    const crypto = await import('node:crypto');

    // The transcript slug derives from the MAIN worktree root, never .worktrees/<id> — a worktree
    // path resolves to a directory that never exists, silently cold-starting every worktree seat.
    // git-common-dir returns <main>/.git, so its parent is the main root. Fail soft -> cold start.
    let mainRepoRoot = null;
    try {
      const { execFileSync } = await import('node:child_process');
      const { fileURLToPath } = await import('node:url');
      // ESM: __dirname does NOT exist here. Referencing it would throw ReferenceError and the catch
      // would swallow it into a permanent silent cold start — the very defect this block removes.
      const moduleDir = path.dirname(fileURLToPath(import.meta.url));
      const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'],
        { cwd: path.resolve(moduleDir, '..', '..'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      if (common) mainRepoRoot = path.dirname(common);
    } catch { /* fail soft -> cold start */ }

    const transcriptPath = transcriptPathFor({ sessionId: oldIdentity.session_id, mainRepoRoot });
    let transcriptExists = false;
    try { transcriptExists = Boolean(transcriptPath) && fs.existsSync(transcriptPath); } catch { transcriptExists = false; }

    const plan = resolveResumePlan({
      sessionId: oldIdentity.session_id,
      transcriptExists,
      launchCwd: launchCwd || null,
      newSessionId: opts.newSessionId || crypto.randomUUID(),
      mainRepoRoot,
    });

    // Said out loud on purpose: a silent cold start lets the operator believe context survived.
    console.log(JSON.stringify({
      event: 'fleet.restart.resume_plan', session_id: oldIdentity.session_id,
      mode: plan.mode, carries_context: plan.carriesContext, report: plan.report,
      warnings: plan.warnings, transcript_path: transcriptPath,
    }));

    resumePlan = { resumeUuid: plan.resumeUuid, sessionId: plan.sessionId, forkSession: plan.mode === 'fork' };
  }

  return spawn({ role, callsign, accountProfile }, {
    ...opts,
    skipDedup: true,
    cwd: launchCwd,
    resumeUuid: resumePlan.resumeUuid,
    sessionId: resumePlan.sessionId,
    forkSession: resumePlan.forkSession,
  });
}

/** FR-4/FR-5: restart -- role-serial for singletons (via the existing guard), parallel for workers. */
export async function restart(target, opts = {}) {
  const supabase = opts.supabaseClient;
  const by = opts.by || 'callsign';
  const sdKey = opts.sdKey;
  const resolution = await resolveLiveSession(supabase, { by, value: target });
  if (!resolution.resolved) {
    await emitVerbEvent(supabase, { verb: 'restart', outcome: `not_resolved:${resolution.reason}`, sdKey });
    return { ok: false, reason: resolution.reason };
  }

  const oldIdentity = resolution.identity;
  const { data: oldSession } = await supabase.from('claude_sessions').select('metadata').eq('session_id', oldIdentity.session_id).maybeSingle();
  const role = roleOf(oldSession);

  // SD-LEO-INFRA-SESSION-SPAWN-AND-PROMPT-LIBRARY-001-E (FR-5): thread the OLD session's
  // account_profile into the replacement. It was omitted here while oldSession.metadata was already
  // in hand three lines above, so a restarted canary came back as an ORDINARY, UN-ISOLATED worker:
  // accountProfile drives BOTH the profileDir/CLAUDE_CONFIG_DIR account isolation (spawn():189) AND
  // the metadata stamp that gates the canary-callsign mint (:358, :381). relaunchUnderProfile already
  // passed it correctly, so restart() was the only verb missing it — and canaryRestart,
  // drainAndRestart and fleet-supervisor all converge on THIS call, so one line repairs three paths.
  //
  // FR-6 DECISION — FAIL LOUD, made explicitly rather than discovered. resolveProfileDir THROWS when
  // FLEET_ACCOUNT_PROFILES_DIR is unset (:74). restart() never reached that code before, so this is a
  // real behaviour change: restarting a profile-stamped session on an unconfigured host now throws
  // where it previously succeeded. Accepted, on measurement rather than intuition — of 16 live
  // active/idle sessions exactly ONE carries account_profile, and it is the canary. The alternative
  // (catch and degrade to the un-isolated path) would silently reinstate the very defect this FR
  // fixes: a canary without its profile isolation is not a canary. A loud failure on a misconfigured
  // host is the correct outcome for a session whose whole purpose depends on that isolation.
  //
  // FR-4 FOLLOW-ON: reading account_profile ALONE reproduced FR-5's own blind spot one level down. That
  // stamp is written inside the session-bind loop, which is measured to miss (1.3s on 2026-07-25,
  // discarding all three of its writes), and reboot-respawn-runner never writes it at all. So the
  // sessions most likely to reach a restart UNSTAMPED are exactly the canaries — and an unstamped
  // canary restarted here came back as an ordinary worker with no profile isolation AND no spawn-time
  // marker, i.e. free to claim real work. Falling back to the full predicate (which also recognises the
  // 'Canary-' namespace callsign) means one surviving signal is enough to carry the identity forward.
  //
  // This widens FR-6's fail-loud consequence to callsign-only canaries: resolveProfileDir throws on a
  // host with no FLEET_ACCOUNT_PROFILES_DIR. That is the same trade FR-6 already accepted deliberately
  // — a canary without its account isolation is not a canary, so refusing loudly beats silently
  // restarting it as an ordinary un-isolated worker.
  let accountProfile = (oldSession && oldSession.metadata && oldSession.metadata.account_profile) || undefined;
  if (!accountProfile) {
    const { isCanaryMetadata } = await import('./canary-session.js');
    if (isCanaryMetadata(oldSession && oldSession.metadata)) accountProfile = CANARY_PROFILE;
  }
  // FR-3 resume resolution now lives in spawnReplacement (the choke point), so restart(),
  // relaunchUnderProfile(), canaryRestart() and drainAndRestart() all inherit it — the four paths
  // the PRD names. Resolving here covered only the three that route through restart().
  const spawnResult = await spawnReplacement({ oldIdentity, oldSession, accountProfile }, opts);

  if (isSingletonRole(role)) {
    // FR-4: never a bespoke retire-then-spawn sequence -- the EXISTING register-then-retire mutex owns
    // this ordering. sequenceSingletonRefresh only retires the old session once the new one is verified
    // healthy (a live claude_sessions row must exist for newSessionId -- opts.newSessionId lets a live
    // caller supply it once the spawned process self-registers).
    const { sequenceSingletonRefresh } = await import('../coordinator/singleton-refresh-sequencer.cjs');
    if (!opts.newSessionId) {
      await emitVerbEvent(supabase, { verb: 'restart', session_id: oldIdentity.session_id, outcome: 'awaiting_new_session_registration', sdKey });
      return { ok: false, reason: 'awaiting_new_session_registration', spawnResult, role: 'singleton' };
    }
    const seqResult = await sequenceSingletonRefresh(supabase, { newSessionId: opts.newSessionId, oldSessionId: oldIdentity.session_id });
    // AC-3-6: the row is retired; the PROCESS is not. Only once the mutex actually retired the old
    // session — hold_old means succession did not happen, so the predecessor must keep running.
    const predecessor = seqResult.retired && spawnResult && spawnResult.live === true
      ? await retirePredecessorProcessFor(oldIdentity, opts)
      : { outcome: 'skipped', pid: null, detail: 'succession not completed — predecessor deliberately left running' };
    await emitVerbEvent(supabase, { verb: 'restart', session_id: oldIdentity.session_id, outcome: seqResult.action, sdKey, predecessor: predecessor.outcome });
    return { ok: seqResult.retired || seqResult.action === 'hold_old', role: 'singleton', spawnResult, seqResult, predecessor };
  }

  // FR-5: worker restart is parallel-safe by construction -- no shared mutex, resolveSpawnDecisions
  // (inside spawn -> worker-spawn-executor's decision path) already dedupes by callsign.
  //
  // ADVERSARIAL-REVIEW FIX (correctness): NEVER release the old session unless the replacement
  // genuinely spawned live (spawnResult.live === true). In the default (FLEET_SPAWN_CONTROL_LIVE=off)
  // dry-run mode, spawnReplacement() never launches a process -- releasing the old session anyway
  // would silently drop the tracked worker from the registry with no functioning replacement.
  if (!spawnResult || spawnResult.live !== true) {
    await emitVerbEvent(supabase, { verb: 'restart', session_id: oldIdentity.session_id, outcome: 'replacement_not_live', sdKey });
    return { ok: false, reason: 'replacement_not_live', role: 'worker', spawnResult };
  }
  const { error } = await supabase.from('claude_sessions').update({
    status: 'released', released_at: new Date().toISOString(), released_reason: 'restart',
  }).eq('session_id', oldIdentity.session_id);
  // AC-3-6: released the ROW above; the predecessor PROCESS is still holding the seat until here.
  // Gated on the DB update succeeding — if the row still reads live, two live rows plus one dead
  // process is a worse state than two processes.
  const predecessor = error
    ? { outcome: 'skipped', pid: null, detail: 'old row not released — predecessor deliberately left running' }
    : await retirePredecessorProcessFor(oldIdentity, opts);
  await emitVerbEvent(supabase, { verb: 'restart', session_id: oldIdentity.session_id, outcome: error ? 'db_error' : 'ok', sdKey, predecessor: predecessor.outcome });
  return { ok: !error, role: 'worker', spawnResult, predecessor };
}

/**
 * Resolve the probe/kill/verify deps and retire the predecessor. Injectable for tests; in
 * production it wires the SAME single-process kill and the SAME tri-state claude probe the
 * operator kill path uses, so there is one spelling of "is this still claude" in the codebase.
 */
async function retirePredecessorProcessFor(oldIdentity, opts = {}) {
  if (opts.retirePredecessor === false) {
    return { outcome: 'disabled', pid: null, detail: 'predecessor retirement disabled by caller' };
  }
  if (typeof opts.retirePredecessorImpl === 'function') return opts.retirePredecessorImpl(oldIdentity, opts);
  try {
    const { killProcessOnly } = await import('../utils/process-utils.js');
    const { createRequire } = await import('node:module');
    const require_ = createRequire(import.meta.url);
    const { pidIsClaude } = require_('./claimant-liveness.cjs');
    return await retirePredecessorProcess(oldIdentity && oldIdentity.pid, {
      probeClaude: (pid) => pidIsClaude(pid),
      kill: killProcessOnly,
      // NO_MATCH (definitively not claude any more) is the only "gone"; MATCH means still alive and
      // PROBE_FAILED means we learned nothing — both must read as not-gone. Same fail-closed
      // mapping scripts/fleet-kill.mjs uses.
      verifyGone: async (pid) => pidIsClaude(pid) === 'NO_MATCH',
    });
  } catch (err) {
    return { outcome: 'error', pid: null, detail: `predecessor retirement unavailable: ${(err && err.message) || err}` };
  }
}

/** FR-7: the ratified account-switch verb -- isolated to the target session only. */
export async function relaunchUnderProfile(target, accountProfile, opts = {}) {
  const supabase = opts.supabaseClient;
  const by = opts.by || 'callsign';
  const sdKey = opts.sdKey;

  // Fail loud before touching anything if the profile doesn't resolve to a safe, allowlisted path.
  resolveProfileDir(accountProfile, opts);

  const resolution = await resolveLiveSession(supabase, { by, value: target });
  if (!resolution.resolved) {
    await emitVerbEvent(supabase, { verb: 'relaunch_under_profile', outcome: `not_resolved:${resolution.reason}`, sdKey });
    return { ok: false, reason: resolution.reason };
  }

  const oldIdentity = resolution.identity;
  const { data: oldSession } = await supabase.from('claude_sessions').select('metadata').eq('session_id', oldIdentity.session_id).maybeSingle();
  const role = roleOf(oldSession);

  // SECURITY (FR-7): CLAUDE_CONFIG_DIR must be isolated to the spawned child's env only -- assert the
  // supervisor's own process.env is untouched by this call, before and after.
  const supervisorConfigDirBefore = process.env.CLAUDE_CONFIG_DIR;
  const spawnResult = await spawnReplacement({ oldIdentity, oldSession, accountProfile }, opts);
  const supervisorConfigDirAfter = process.env.CLAUDE_CONFIG_DIR;
  if (supervisorConfigDirBefore !== supervisorConfigDirAfter) {
    throw new Error('relaunchUnderProfile: supervisor process.env.CLAUDE_CONFIG_DIR changed -- isolation invariant violated');
  }

  if (isSingletonRole(role)) {
    const { sequenceSingletonRefresh } = await import('../coordinator/singleton-refresh-sequencer.cjs');
    if (!opts.newSessionId) {
      await emitVerbEvent(supabase, { verb: 'relaunch_under_profile', session_id: oldIdentity.session_id, outcome: 'awaiting_new_session_registration', sdKey });
      return { ok: false, reason: 'awaiting_new_session_registration', spawnResult, role: 'singleton' };
    }
    const seqResult = await sequenceSingletonRefresh(supabase, { newSessionId: opts.newSessionId, oldSessionId: oldIdentity.session_id });
    await emitVerbEvent(supabase, { verb: 'relaunch_under_profile', session_id: oldIdentity.session_id, outcome: seqResult.action, sdKey });
    return { ok: seqResult.retired || seqResult.action === 'hold_old', role: 'singleton', spawnResult, seqResult };
  }

  // ADVERSARIAL-REVIEW FIX: same guard as restart()'s worker path -- never release the old session
  // unless the replacement genuinely spawned live.
  if (!spawnResult || spawnResult.live !== true) {
    await emitVerbEvent(supabase, { verb: 'relaunch_under_profile', session_id: oldIdentity.session_id, outcome: 'replacement_not_live', sdKey });
    return { ok: false, reason: 'replacement_not_live', role: 'worker', spawnResult };
  }
  const { error } = await supabase.from('claude_sessions').update({
    status: 'released', released_at: new Date().toISOString(), released_reason: 'relaunch_under_profile',
  }).eq('session_id', oldIdentity.session_id);
  await emitVerbEvent(supabase, { verb: 'relaunch_under_profile', session_id: oldIdentity.session_id, outcome: error ? 'db_error' : 'ok', sdKey });
  return { ok: !error, role: 'worker', spawnResult };
}

/**
 * FR-6: drain-and-restart waits for the idle boundary. A single call NEVER busy-waits/sleeps inline --
 * it returns a deferred verdict on MISS/UNKNOWN so the caller (a tick-based scheduler, matching this
 * codebase's own convention for every other evaluateClaimBoundary consumer) re-invokes on its own
 * cadence. Restart only ever fires on a genuine PASS.
 */
export async function drainAndRestart(target, opts = {}) {
  const supabase = opts.supabaseClient;
  const by = opts.by || 'callsign';
  const resolution = await resolveLiveSession(supabase, { by, value: target });
  if (!resolution.resolved) {
    return { ok: false, reason: resolution.reason };
  }

  const { session_id } = resolution.identity;
  const { data: row } = await supabase.from('claude_sessions')
    .select('sd_key, claimed_at, last_tool_at, expected_silence_until, current_tool_expected_end_at')
    .eq('session_id', session_id).maybeSingle();

  let outboundSinceAnchor = 0;
  if (row && row.claimed_at) {
    const { count } = await supabase.from('session_coordination')
      .select('id', { count: 'exact', head: true })
      .eq('sender_session', session_id)
      .gte('created_at', row.claimed_at);
    outboundSinceAnchor = Number.isFinite(count) ? count : 0;
  }

  const verdict = evaluateClaimBoundary({
    nowMs: opts.nowMs ?? Date.now(),
    anchorMs: row && row.claimed_at ? Date.parse(row.claimed_at) : null,
    anchorType: 'claim',
    lastToolAtMs: row && row.last_tool_at ? Date.parse(row.last_tool_at) : null,
    outboundSinceAnchor,
    expectedSilenceUntilMs: row && row.expected_silence_until ? Date.parse(row.expected_silence_until) : null,
    currentToolExpectedEndMs: row && row.current_tool_expected_end_at ? Date.parse(row.current_tool_expected_end_at) : null,
  });

  if (verdict.verdict !== 'PASS') {
    await emitVerbEvent(supabase, { verb: 'drain_and_restart', session_id, outcome: `deferred:${verdict.verdict}` });
    return { ok: false, deferred: true, verdict: verdict.verdict, reason: verdict.reason, session_id };
  }

  const result = await restart(target, opts);
  return { ...result, deferred: false, verdict: 'PASS' };
}
