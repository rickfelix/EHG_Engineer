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

// SD-LEO-INFRA-FLEET-CANNOT-SELF-001 FR-1 — the literal value meaning "deliberately use the
// host machine's default login, no CLAUDE_CONFIG_DIR override." Checked BEFORE the
// baseDir/regex resolution below so it can never fall through to a bogus, non-existent
// "<baseDir>/host-default" directory (it happens to match PROFILE_NAME_RE, so without this
// early check it would resolve silently to a path that does not exist).
const HOST_DEFAULT_PROFILE = 'host-default';

/**
 * Resolve a profile NAME to its CLAUDE_CONFIG_DIR. FAIL-LOUD: throws if no account intent was
 * recorded at all, the base dir is unconfigured, or the name is invalid — the caller must NOT
 * degrade to a no-isolation launch. Returns null (not a path) for the HOST_DEFAULT_PROFILE
 * sentinel — a DELIBERATE no-isolation choice, distinct from an omitted/missing one.
 */
function resolveProfileDir(profileName, opts = {}) {
  const env = opts.env || process.env;
  // SD-LEO-INFRA-FLEET-CANNOT-SELF-001 FR-1 — no account intent recorded at all (undefined/null/
  // empty) is a caller bug, not a request for no isolation. Callers that deliberately want no
  // isolation must pass HOST_DEFAULT_PROFILE explicitly.
  if (!profileName) {
    throw new LaunchResolveError('resolveProfileDir: no account/profile intent provided (pass a profile name or the "host-default" sentinel)');
  }
  if (profileName === HOST_DEFAULT_PROFILE) return null;
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
/**
 * QF-20260726-757 — resolve the CLI permission mode for a spawned session.
 *
 * Values are the ones `claude --help` actually accepts on this host (CLI 2.1.220):
 * acceptEdits, auto, bypassPermissions, manual, dontAsk, plan. Verified against --help rather than
 * assumed, because an invalid --permission-mode makes the CLI reject the whole invocation — a typo
 * here costs the entire launch, not just the flag.
 *
 * NOTE: the QF row enumerated only the first FOUR. Running --help on this host (same 2.1.220) shows
 * six — 'dontAsk' and 'plan' are also accepted. Copying the row's list would have made those two
 * silently fall back to 'auto' instead of being honoured, so the list here comes from the CLI.
 *
 * Defaults to 'auto' (the chairman's instruction). An unrecognised override falls back to the
 * default instead of being forwarded, for the same reason: passing a bad value through would turn
 * a config typo into a dead spawn, and a spawn that comes up in auto is a far better failure than
 * one that does not come up at all.
 *
 * @param {object} [env=process.env]
 * @returns {string} a permission mode safe to pass to the CLI
 */
const VALID_PERMISSION_MODES = Object.freeze([
  'acceptEdits', 'auto', 'bypassPermissions', 'manual', 'dontAsk', 'plan',
]);
const DEFAULT_PERMISSION_MODE = 'auto';

function resolvePermissionMode(env = process.env) {
  const raw = String((env && env.FLEET_SPAWN_PERMISSION_MODE) || '').trim();
  if (!raw) return DEFAULT_PERMISSION_MODE;
  // Case-insensitive match, but emit the CLI's exact spelling — 'acceptedits' would be rejected.
  const match = VALID_PERMISSION_MODES.find((m) => m.toLowerCase() === raw.toLowerCase());
  return match || DEFAULT_PERMISSION_MODE;
}

/**
 * QF-20260727-794 — the Windows Terminal tab title for a spawned session.
 *
 * Contract (chairman's amendment): "<n> · <callsign-at-spawn>", e.g. "3 · Alpha".
 * The NUMBER LEADS because it is the anchor and can never be wrong; the name may age if the
 * callsign is later reassigned. Degrades in the order number+name -> name -> role -> constant,
 * so a spec with no identity still produces something better than a conversation summary.
 *
 * @param {{windowNumber?: number|string, callsign?: string, role?: string}} spec
 * @returns {string} a non-empty title
 */
function formatTabTitle(spec = {}) {
  const name = String(spec.callsign || spec.role || '').trim();
  // null/undefined must read as ABSENT, not as zero: Number(null) === 0 is finite, which would
  // have rendered an unallocated session as "0 · Alpha". Allocation is 1..N (lowest free slot
  // among live sessions), so anything below 1 is a sentinel or a bug, never a real window.
  const nRaw = spec.windowNumber;
  const nNum = (nRaw === null || nRaw === undefined || String(nRaw).trim() === '') ? NaN : Number(nRaw);
  const n = (Number.isFinite(nNum) && nNum >= 1) ? String(Math.trunc(nNum)) : null;
  if (n && name) return `${n} · ${name}`;
  if (n) return `${n} · session`;
  return name || 'LEO session';
}

function buildSessionLaunch(spec = {}, opts = {}) {
  const env = opts.env || process.env;
  // QF-20260727-794: windowNumber is read via formatTabTitle(spec) below. Named here so the
  // accepted-input surface stays visible in one place.
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
  // SD-...-PROMPT-LIBRARY-001-D FR-2 — THE `FLEET_WORKER_STARTUP_PROMPT` ENV CARRIER IS DELETED.
  //
  // It was documented as "the persistent replacement for headless -p", seeded into the session by
  // a SessionStart hook. THAT MECHANISM DOES NOT EXIST AND NEVER DID. Verified repo-wide: every
  // occurrence of the name is this constant's definition, a WRITE like the one removed here, a
  // comment describing the imagined hook, or a test asserting the write. There is not one
  // `process.env.FLEET_WORKER_STARTUP_PROMPT` READ anywhere, and no SessionStart hook references
  // it. Claude Code has no env var that seeds a first message, so nothing could have consumed it.
  //
  // Why removing it matters rather than being tidy-up: the write made the invocation LOOK like it
  // delivered a prompt, so three call sites resolved a prompt, handed it over, and reported
  // success while it was dropped on the floor. That appearance is what let the real defect
  // (spawned sessions coming up with nothing to do, then ghosting) survive being "fixed" twice.
  //
  // `startupPrompt` is therefore ACCEPTED AND CURRENTLY UNUSED, deliberately and visibly, until
  // FR-1 lands the real single-line pointer transport. Callers keep passing it; the resolution
  // logic they run is still exercised. Do NOT re-add an env carrier to make it "used".

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
  // QF-20260727-794 — NAME THE TAB. Chairman-reported: with nine worker windows plus three role
  // sessions open, the tab strip is the only way to find a seat, and it identified none of them
  // (a coordinator tab read "Load and Execute Startup" — Claude Code's conversation summary).
  //
  // THE TITLE MUST BE SET HERE, AT SPAWN. A running session CANNOT retitle its own tab; both
  // runtime routes were measured dead by the coordinator before this row was filed:
  // $Host.UI.RawUI.WindowTitle reports success but retitles the tool call's own detached console,
  // and a bash OSC escape never reaches the emulator (Claude Code pipes stdout; /dev/tty is absent).
  //
  // --suppressApplicationTitle IS LOAD-BEARING, NOT DECORATION. Without it Claude Code's own title
  // updates overwrite --title within seconds and the fix looks like it did not work.
  //
  // VERIFIED ON THIS HOST rather than from docs (the row required it; `wt --help` renders to a GUI
  // dialog here so the flags could not be confirmed by inspection). Windows Terminal 1.24.11911.0:
  // a throwaway tab spawned with these flags, running a command that otherwise self-titles
  // "Start-Sleep", showed the --title value instead — proving BOTH that --title lands and that
  // --suppressApplicationTitle beats the application's own title.
  //
  // NUMBER FIRST, per the chairman's design amendment. The tab title is IMMUTABLE after spawn
  // (see above), while a callsign is MUTABLE — assign-fleet-identities.cjs can turn 'Alpha' into
  // 'Alpha-3'. Putting a mutable value in an immutable slot is what would have made the title age
  // into a lie. The NUMBER is immutable by construction, so it is the anchor and can never be
  // wrong; the name trailing it is a convenience that was true at spawn. The Sessions page — which
  // CAN update live — carries the number->current-callsign mapping, so the volatile half lives
  // where volatility is free. If the two ever disagree, the number wins.
  const tabTitle = formatTabTitle(spec);
  const args = ['-w', 'new', 'new-tab', '--title', tabTitle, '--suppressApplicationTitle', '-d', startDir, '--', claudeCmd];

  // QF-20260726-757 — PERMISSION MODE. Chairman-directed: "We need to run these claude sessions
  // with auto mode on by default."
  //
  // WHY THIS IS A CORRECTNESS REQUIREMENT AND NOT A PREFERENCE: a LEO-spawned session has NO
  // OPERATOR AT THE KEYBOARD. Without a permission mode the CLI comes up in its prompting default,
  // and the first tool call needing approval blocks forever waiting for an answer nobody will give.
  // From outside, that seat is INDISTINGUISHABLE FROM A DEAD ONE — loop_state stays active, the tick
  // daemon keeps the heartbeat fresh, and last_tool_at freezes. That is the exact phantom-seat
  // signature diagnosed on Alpha-5, so the fleet's own liveness instruments cannot tell a
  // permission-blocked worker from a crashed one.
  //
  // Placed BEFORE the --resume / --session-id branch below deliberately: those two paths diverge,
  // and a flag pushed inside either branch would apply to only one of them. Both spawn paths need
  // this, so it goes on the shared array.
  //
  // 'auto' NOT '--dangerously-skip-permissions'. The CLI (2.1.220) offers both, and the bypass flag
  // is a strictly WIDER grant that disables more than prompting. The chairman asked for auto; auto
  // is sufficient for the unattended-spawn problem and is the narrower of the two. Do not substitute
  // the bypass flag because it looks equivalent — it is not.
  //
  // CONFIGURABLE, NOT HARD-CODED: FLEET_SPAWN_PERMISSION_MODE overrides the default so a canary or a
  // debugging spawn can be launched in 'manual' (a seat that DOES pause is occasionally exactly what
  // you want). Unrecognised values fall back to the default rather than being passed through, since
  // the CLI rejects an invalid --permission-mode and would fail the entire launch.
  const permissionMode = resolvePermissionMode(env);
  if (permissionMode) args.push('--permission-mode', permissionMode);

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
  //
  // SD-LEO-FEAT-FLEET-SESSION-LIFECYCLE-001 / FR-3 — FORK IS THE THIRD CASE, and it is the one
  // the mutual-exclusion note above does NOT cover. A fork deliberately carries BOTH: --resume
  // names the conversation to copy, --session-id names the NEW identity that copy runs under.
  // That is not contradictory, it is the whole point — re-registering under the OLD id would let
  // a health check pass against the dead row's still-warm heartbeat, so a dead seat reads alive.
  //
  // Found by the EXEC TESTING pass: FR-3 threaded resumeUuid+sessionId through spawn() and
  // spawnReplacement, but this builder silently DROPPED the sessionId on the resume branch, so
  // every "fork" emitted a plain --resume and reused the old id. The source-text test asserting
  // the threading passed while the behaviour did not hold — the accepted-but-unread class this SD
  // documents four times elsewhere. Opt-in via spec.forkSession so plain resume is unchanged.
  let sessionId = null;
  if (resumeUuid && spec.forkSession) {
    const minted = spec.sessionId;
    if (!isUuid(minted)) {
      throw new Error('buildSessionLaunch: forkSession requires a valid UUID sessionId for the NEW identity');
    }
    sessionId = String(minted);
    args.push('--fork-session', '--resume', String(resumeUuid), '--session-id', sessionId);
  } else if (resumeUuid) {
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

  // FR-1 — POINTER-FILE STARTUP TRANSPORT. Must come AFTER the session id is minted: the pointer
  // file is named for that id, which is how a spawned session's directive is correlated to it.
  //
  // The prompt is written to its own file and only a SINGLE-LINE pointer becomes the trailing
  // positional. See startup-prompt-pointer.cjs for why a pointer rather than the prompt itself
  // (cmd.exe truncates at the first LF — measured; wt.exe re-parses and was never verified).
  //
  // THE WRITE GOES THROUGH AN INJECTABLE SEAM (opts.writePromptFileFn). Two reasons, both learned
  // the hard way here:
  //   1. Building an invocation should not silently touch the filesystem. The first version wrote
  //      unconditionally, and every unit test that merely BUILT a launch littered the repo — it
  //      created a directory named `tests/fixtures/__no_such_tree__` containing 10+ prompt files.
  //   2. Per the 2026-07-26 fleet-safety rule: probe through a seam you control, never by editing
  //      the live path. A seam here means tests can assert the wiring without going near disk.
  //
  // The file is written under startDir — the directory the session actually starts in — and the
  // pointer carries an ABSOLUTE path, so it resolves regardless of what cwd the session ends up
  // with. A relative pointer silently depends on a cwd nobody is asserting.
  let promptFilePath = null;

  // F2 — DO NOT DISCARD A RESOLVED PROMPT SILENTLY. This is THIS SD'S OWN DEFECT CLASS, found by
  // PLAN verification. A non-UUID sessionId is dropped above (correctly — the CLI would reject it
  // and fail the launch), but the transport below is gated on `startupPrompt && sessionId`, so the
  // caller's prompt was then thrown away with no throw and no log: the session comes up idle and
  // nothing anywhere says why. That is precisely the failure this SD exists to eliminate, so it
  // must not be reintroduced by the fix for it.
  //
  // Warn rather than throw: losing the directive is recoverable (the session ghosts, which is safe),
  // while failing the launch outright is not. What matters is that it stops being SILENT.
  if (startupPrompt && !sessionId) {
    const warn = opts.logFn || console.warn;
    warn('[build-session-launch] a startup prompt was resolved but NO usable session id exists '
      + '(a non-UUID id is dropped), so the pointer transport is skipped and the spawned session will '
      + 'come up with NO directive and idle. Pass a valid UUID sessionId/resumeUuid to deliver it.');
  }

  if (startupPrompt && sessionId) {
    const { sweepStartupPromptFiles } = require('./startup-prompt-pointer.cjs');
    const { assertSingleLinePrompt } = requireStartupPromptSelection();
    const writeFn = opts.writePromptFileFn
      || require('./startup-prompt-pointer.cjs').writeStartupPromptFile;

    const promptRoot = path.resolve(startDir);

    // NEVER FABRICATE A START DIRECTORY THAT DOES NOT EXIST. mkdir -p on the prompt dir would
    // happily create the whole tree, so a launch pointed at a missing cwd would silently sprout
    // one. That is wrong twice over: the spawn is already doomed (wt.exe -d needs a real dir), and
    // creating it HIDES the misconfiguration. It also meant unit tests that merely built an
    // invocation against a fixture path materialised `tests/fixtures/__no_such_tree__` in the repo.
    // The pointer is still emitted — it carries its own missing-file instruction, which idles.
    // F1 — STRUCTURAL BACKSTOP: A CANARY MUST NEVER RECEIVE THE WORKER DIRECTIVE, ENFORCED HERE.
    //
    // Every spawner funnels through this function, and it receives BOTH the callsign and the
    // prompt — yet the invariant was enforced only by convention at the three call sites. A PLAN
    // verification probe called this directly with a Canary- callsign and the worker directive and
    // got 1406 bytes written: byte-identical to the f060c6fb42b hazard. The three-site test
    // hardcodes three sites, so a FOURTH spawner would not have caught it.
    //
    // That is the same defect class as f060c6fb42b (a fix applied at N-1 of N sites), one level up.
    // The durable answer is not another per-site test — it is enforcing the invariant at the point
    // they all pass through, so a new spawner inherits the guarantee instead of having to remember.
    //
    // Deliberately NARROW: it refuses only the specific hazard (canary namespace + the actual worker
    // directive), so the documented explicit-prompt opt-out keeps working for every other payload.
    if (callsign && /^canary-/i.test(String(callsign).trim())) {
      const { FLEET_WORKER_STARTUP_PROMPT } = require('../coordinator/coordination-events.cjs');
      if (String(startupPrompt) === FLEET_WORKER_STARTUP_PROMPT) {
        throw new LaunchResolveError(
          `refusing to launch canary-namespace callsign ${JSON.stringify(String(callsign))} with the WORKER `
          + 'directive. A canary that receives the claiming directive starts claiming DRAFT SDs unattended '
          + '(see f060c6fb42b). Select the prompt via resolveStartupPromptForCallsign.',
        );
      }
    }

    // F2 — STRUCTURAL BACKSTOP, BESIDE F1: A NON-WORKER ROLE MUST NEVER RECEIVE THE WORKER
    // DIRECTIVE, ENFORCED HERE (QF-20260727-488).
    //
    // role-startup-prompt.js's mapping was consumed at exactly ONE call site (the add-session
    // route's resolveRoleSpawnOpts spread) -- every other spawner (spawn-control.js
    // spawnReplacement, behind restart()/relaunchUnderProfile(); reboot-respawn-runner.js) fell
    // through to callsign-namespace selection, which classifies any non-canary callsign as
    // 'worker' and hands back the 1406-byte claiming directive regardless of the ROLE the caller
    // declared. A privileged session that receives it does not idle -- it starts claiming DRAFT
    // SDs unattended, the same hazard class F1 exists to prevent, one field over (role instead of
    // callsign).
    //
    // defaultStartupPrompt (spawn-control.js, reboot-respawn-runner.js) is now role-aware and
    // resolves the role's own directive BEFORE falling through to callsign-namespace selection, so
    // this combination should NEVER occur on any current path -- that is what makes this a safe
    // tripwire rather than a behaviour change. It exists so a FOURTH spawner inherits the
    // guarantee instead of having to remember it, same lesson F1 already documents above.
    //
    // Deliberately keyed on ROLE, never on callsign alone -- the inverse of F1, and just as
    // deliberately NOT keyed on role alone for the DECISION upstream in defaultStartupPrompt (see
    // that function's header): canaries ARE role='worker', so this check only ever fires for a
    // role that is NOT 'worker', which a canary spawn never declares.
    if (role && role !== 'worker') {
      const { FLEET_WORKER_STARTUP_PROMPT } = require('../coordinator/coordination-events.cjs');
      const { isSpawnableRole } = requireRoleStartupPrompt();
      if (isSpawnableRole(role) && String(startupPrompt) === FLEET_WORKER_STARTUP_PROMPT) {
        throw new LaunchResolveError(
          `refusing to launch role ${JSON.stringify(String(role))} with the WORKER directive. A privileged `
          + 'role that receives the claiming directive starts claiming DRAFT SDs unattended '
          + '(QF-20260727-488). Select the prompt via resolveRoleSpawnOpts / defaultStartupPrompt(callsign, role).',
        );
      }
    }

    // SEC-2 — VALIDATE ON BOTH BRANCHES. writeStartupPromptFile enforces a filename charset on
    // sessionId, but the missing-root branch below built the path INLINE with no check at all, and
    // sessionId can be a DB-sourced resumeUuid (which, unlike the minted id, is not isUuid-tested).
    // A guard that only covers one of two path-construction routes is not a guard. Not exploitable
    // as found — path.join normalised the traversal away — but the hole sat beside a load-bearing
    // check on a value that comes from the database.
    if (!/^[A-Za-z0-9._-]+$/.test(String(sessionId))) {
      throw new LaunchResolveError(
        `refusing to build a startup-prompt path from unsafe sessionId ${JSON.stringify(String(sessionId))}`,
      );
    }
    const rootExists = require('node:fs').existsSync(promptRoot);
    const written = rootExists
      ? writeFn({ repoRoot: promptRoot, sessionId, prompt: String(startupPrompt) })
      : { promptFilePath: path.join(promptRoot, '.claude', 'fleet-prompts', `${sessionId}.txt`) };
    promptFilePath = written.promptFilePath;

    // THE NEWLINE TRIPWIRE, ON THE ONLY PATH THAT CAN CARRY THE DEFECT (FR-4 wired per
    // metadata.fr1_exit_criterion_tripwire_must_be_wired). Asserted on the POINTER — the value
    // that actually becomes argv — not on the prompt, which is now legitimately multi-line inside
    // the file. A guard placed on the prompt here would fire on every correct spawn.
    // Derived from the PATH, not from the writer's return value, so the pointer is identical
    // whether or not the file was materialised — one code path, no divergence between them.
    // opts.buildPointerLineFn is a SEAM FOR PROVING THE TRIPWIRE IS REACHABLE. A guard that only
    // passes its own unit tests is not evidence it is wired to anything (2026-07-26 fleet-safety
    // rule). Injecting a deliberately multi-line builder here must make THIS function throw — that
    // is an in-suite reachability proof rather than a one-off in-place mutation, so it keeps
    // holding for every future reader instead of being a claim in a commit message.
    const buildPointerLine = opts.buildPointerLineFn || require('./startup-prompt-pointer.cjs').buildPointerLine;
    args.push(assertSingleLinePrompt(buildPointerLine(promptFilePath), { where: 'buildSessionLaunch positional' }));

    // Best-effort housekeeping; never allowed to fail a spawn. Skipped when the write was stubbed,
    // since there is then no real directory to sweep.
    if (!opts.writePromptFileFn) {
      try { sweepStartupPromptFiles({ repoRoot: promptRoot }); } catch { /* non-fatal */ }
    }
  }

  return { program: 'wt.exe', args, env: childEnv, cwd: startDir, persistent: true, sessionId, promptFilePath };
}

/** Seam: kept as a function so tests can stub the ESM import without editing this call site. */
function requireStartupPromptSelection() {
  // startup-prompt-selection.js is ESM; require() of an ESM file works here because the module has
  // no top-level await and Node's require(esm) support is enabled on this runtime.
  return require('./startup-prompt-selection.js');
}

/** Seam: kept as a function so tests can stub the ESM import without editing this call site. */
function requireRoleStartupPrompt() {
  // role-startup-prompt.js is ESM; require() of an ESM file works here for the same reason
  // requireStartupPromptSelection's target does (no top-level await, Node's require(esm) enabled).
  return require('./role-startup-prompt.js');
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
  formatTabTitle, // QF-20260727-794 — exported so the title contract is unit-testable directly
  resolveClaudeCmd,
  resolveRepoRoot,
  resolveProfileDir,
  LaunchResolveError,
  PROFILE_NAME_RE,
  HOST_DEFAULT_PROFILE,
  // QF-20260726-757: exported so the mode resolution is testable directly, rather than only
  // observable through a full built invocation.
  resolvePermissionMode,
  VALID_PERMISSION_MODES,
  DEFAULT_PERMISSION_MODE,
};
