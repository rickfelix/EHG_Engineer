/**
 * Windows window-handle capture + focus for fleet spawn-control.
 * SD-LEO-INFRA-FLEET-SPAWN-CONTROL-001, reworked by SD-LEO-INFRA-LAUNCHER-CAN-HOST-001 (FR-4/FR-7).
 *
 * Capture is a before/after enumeration of TOP-LEVEL windows and a SET DIFFERENCE, bounded by a poll
 * because a window renders slightly after its process launches. The enumeration command is a CONSTANT
 * with zero interpolation, so it has no injection surface at all.
 *
 * (This header previously described the retired pid-based capture -- "interpolates ONLY a
 * coerced-numeric PID" -- which FR-7 deleted. Corrected after a PLAN_VERIFICATION review found several
 * comments in this SD still describing code that no longer exists. A stale comment at the top of a file
 * is the one most likely to be believed.)
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * SD-LEO-INFRA-LAUNCHER-CAN-HOST-001 FR-7 — THE PID-BASED CAPTURE FAMILY IS GONE.
 *
 * Retired here: assertValidPid, buildHandleCaptureCommand, parseHandleOutput and captureWindowHandle.
 * They implemented `(Get-Process -Id <pid>).MainWindowHandle` against the wt.exe LAUNCHER pid --
 * a process that has already exited by the time it is queried (wt.exe hands the tab to the running
 * WindowsTerminal.exe host and returns). The 10-attempt / 500ms loop therefore burned ~5 SECONDS on
 * every single spawn and could not succeed on any of them: a futile poll, not a slow one.
 *
 * Deleted rather than left in place. After FR-4 it had ZERO production callers (verified repo-wide:
 * only its own definition and its own tests referenced it), and the whole family was reachable only
 * through it. Leaving a known-broken exported capture path next to the working one is an invitation
 * to wire the wrong one back up -- which is how it survived this long.
 *
 * WHAT REPLACED IT: enumerate top-level windows before/after the spawn and take the set difference
 * (see below). QF-20260724-113's invariant -- capture must NEVER throw out of spawn(), because a
 * throw there aborted bookkeeping AFTER the real OS spawn and left orphaned unstamped sessions --
 * is preserved structurally on the new path: enumerateWindows swallows exec failures and returns [],
 * and selectNewWindowHandle is pure and total. That invariant is re-asserted directly against
 * captureNewWindowHandle in the tests, so retiring the old tests retires no protection.
 */

/**
 * SD-LEO-FEAT-FLEET-SESSION-LIFECYCLE-001 / FR-5a.
 * Was 5000. The enumeration was MEASURED at ~4.9s on this host — a ~2% margin — so it
 * timed out roughly two runs in three. Every one of those failures returned [] (see
 * enumerateWindows below), which is indistinguishable from an empty desktop. Raising the
 * ceiling fixes the FREQUENCY; enumerateWindowsStrict fixes the SILENCE. Both are needed:
 * a bigger timeout still fails eventually, and a failure that reports [] is a wrong answer,
 * not a slow one.
 */
export const WINDOW_ENUM_TIMEOUT_MS = 20000;

async function defaultExec(program, args) {
  return execFileAsync(program, args, { windowsHide: false, timeout: WINDOW_ENUM_TIMEOUT_MS });
}
function defaultSleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }


/**
 * SD-LEO-INFRA-LAUNCHER-CAN-HOST-001 FR-4 — TOP-LEVEL WINDOW ENUMERATION.
 *
 * WHY THE RETIRED pid-BASED CAPTURE COULD NOT WORK FOR A FLEET SPAWN (FR-7 deleted it above; this
 * records WHY, because the reasoning is the whole justification for the replacement). It ran
 * `(Get-Process -Id <pid>).MainWindowHandle` against the pid spawn-control holds, which is the
 * wt.exe LAUNCHER pid. `wt.exe new-tab` hands the tab to the already-running WindowsTerminal.exe
 * host and EXITS IMMEDIATELY, so that query runs against a dead process, retries 10x, and always
 * fails. Worse, MainWindowHandle is per-PROCESS: many terminal windows share ONE host process, so
 * even against the live host it cannot name the window belonging to a particular session.
 *
 * THE FIX IS A SET DIFFERENCE, NOT A LOOKUP. Enumerate top-level windows immediately BEFORE and
 * AFTER the spawn and take (after MINUS before). Deliberately NOT a symmetric difference: a window
 * CLOSING between the two snapshots is a normal event and must not be mistaken for an opening.
 *
 * NEVER MATCH ON TITLE. Verified against a real enumeration on this host (see the fixture header in
 * tests/unit/fleet/window-enum.test.js): two DIFFERENT processes both presented a window titled
 * exactly "Settings", and 11 of 17 visible windows had an EMPTY title. Titles are neither unique nor
 * reliably present. The SD's own field note says both observed session windows were titled simply
 * "Claude Code".
 *
 * The command is a CONSTANT — zero interpolation, so there is no injection surface at all. (The
 * retired buildHandleCaptureCommand had to coerce a pid into its string; this takes NO input.)
 */
export const WINDOW_ENUM_COMMAND = "Add-Type -TypeDefinition 'using System;using System.Text;using System.Collections.Generic;using System.Runtime.InteropServices;public class FleetEnum{public delegate bool EnumProc(IntPtr h,IntPtr l);[DllImport(\"user32.dll\")] public static extern bool EnumWindows(EnumProc cb,IntPtr l);[DllImport(\"user32.dll\")] public static extern bool IsWindowVisible(IntPtr h);[DllImport(\"user32.dll\")] public static extern int GetWindowTextLength(IntPtr h);[DllImport(\"user32.dll\",CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h,StringBuilder s,int n);[DllImport(\"user32.dll\")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);public static List<string> List(){var r=new List<string>();EnumWindows((h,l)=>{if(IsWindowVisible(h)){uint p;GetWindowThreadProcessId(h,out p);int len=GetWindowTextLength(h);var sb=new StringBuilder(len+1);GetWindowText(h,sb,sb.Capacity);r.Add(h.ToInt64()+\"|\"+p+\"|\"+sb.ToString());}return true;},IntPtr.Zero);return r;}}'; [FleetEnum]::List() | ForEach-Object { $f = $_.Split([char]124); $n = (Get-Process -Id ([int]$f[1]) -ErrorAction SilentlyContinue).ProcessName; $t = $f[2] -replace '[\\r\\n]',' '; \"$($f[0])|$($f[1])|$n|$t\" }";

/** The host process that owns fleet session windows. Windows Terminal, not the launcher. */
export const TERMINAL_PROCESS_NAME = 'WindowsTerminal';

/**
 * FR-7: the capture poll BUDGET, exported so it can be asserted directly instead of by wall-clock.
 * A timing-based test ("capture takes under N seconds") is flaky on a loaded CI box and, worse, still
 * passes when the poll is futile -- the retired pid-based capture burned its full budget on every
 * spawn and no clock assertion would have called that a bug. Asserting the exported budget and the
 * injected-execFn CALL COUNT measures the thing that actually matters: how many attempts are spent.
 *
 * Unlike the retired poll, these attempts are not futile: they cover a real race (the window renders
 * shortly after the process launches). The budget is deliberately unchanged at ~5s so the fix is
 * behavioural, not a timing tweak dressed up as one.
 */
export const CAPTURE_POLL_MAX_ATTEMPTS = 10;
export const CAPTURE_POLL_DELAY_MS = 500;

/** Build the enumeration command. Pure, and CONSTANT — takes no argument by design. */
export function buildWindowEnumCommand() {
  return {
    program: 'powershell',
    args: ['-NoProfile', '-NonInteractive', '-Command', WINDOW_ENUM_COMMAND],
  };
}

/**
 * Parse enumeration stdout into rows. Pure. Shape per line: `handle|pid|processName|title`.
 *
 * OBSERVED in the committed real capture (tests/unit/fleet/window-enum.test.js):
 *   - an EMPTY title (11 of 17 rows) — a row is still valid; titles are not required
 *   - a process name containing a SPACE ("Wispr Flow") — so never tokenize on whitespace
 *
 * DEFENSIVE, not observed in that capture — corrected after a TESTING review caught this comment
 * claiming all four cases were "all present in the committed fixture, none hypothetical". The fixture
 * has exactly 3 pipes per row and no non-numeric handle, so these two are constructed cases:
 *   - a title containing "|" — everything after the 3rd separator is rejoined into the title rather
 *     than truncating the row or dropping it
 *   - a non-numeric or absent handle — the row is DROPPED rather than yielding NaN, which would
 *     otherwise poison the set difference
 *
 * SECURITY (SEC-CANHOST-01): a window title is attacker-controllable by any unprivileged local process
 * and may contain CR/LF. Emitted verbatim it would split one window across two output lines, letting a
 * hostile title FORGE an extra row — demonstrated to yield {handle:99999, reason:'ok'}, defeating the
 * fail-closed contract (bounded: a handle only ever reaches SetForegroundWindow as a coerced IntPtr, so
 * no code execution). The emitter now strips CR/LF from the title before output, so one window is
 * always exactly one line.
 * @returns {Array<{handle:number, pid:number|null, proc:string, title:string}>}
 */
export function parseWindowListOutput(stdout) {
  const out = [];
  for (const raw of String(stdout || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    // Limit to 4 fields: everything after the 3rd separator belongs to the title.
    const parts = line.split('|');
    if (parts.length < 3) continue;
    const handle = Number(parts[0]);
    if (!Number.isFinite(handle) || handle === 0) continue;
    const pidNum = Number(parts[1]);
    out.push({
      handle,
      pid: Number.isFinite(pidNum) ? pidNum : null,
      proc: (parts[2] || '').trim(),
      title: parts.slice(3).join('|'),
    });
  }
  return out;
}

/** Normalise a row/handle of either numeric or string type to a Number, or null. PowerShell emits text. */
function toHandle(v) {
  const n = Number(v && typeof v === 'object' ? v.handle : v);
  return Number.isFinite(n) && n !== 0 ? n : null;
}

/**
 * Pick the ONE window that appeared between two snapshots. Pure. FAILS CLOSED.
 *
 * Accepts rows (from parseWindowListOutput) or bare handles, in either number or string form —
 * PowerShell output is text and a caller may pass either side through unchanged.
 *
 * @param {Array} before  snapshot taken BEFORE the spawn
 * @param {Array} after   snapshot taken AFTER the spawn
 * @param {{processName?:string|null}} [opts] restrict to one owning process (default: Windows
 *   Terminal). Narrowing to the host process is what keeps an unrelated app opening a window
 *   mid-spawn from turning every capture into `ambiguous`. Pass null to disable filtering.
 * @returns {{handle:number|null, reason:string, diagnostics:object}}
 */
export function selectNewWindowHandle(before = [], after = [], opts = {}) {
  const processName = ('processName' in opts) ? opts.processName : TERMINAL_PROCESS_NAME;
  const keep = (r) => {
    if (!processName) return true;
    // Bare handles carry no process name; they cannot be filtered, so they are kept.
    if (!r || typeof r !== 'object') return true;
    return String(r.proc || '').toLowerCase() === String(processName).toLowerCase();
  };

  const beforeSet = new Set(
    (Array.isArray(before) ? before : []).map(toHandle).filter((h) => h !== null),
  );
  const afterRows = (Array.isArray(after) ? after : []).filter(keep);
  // AFTER MINUS BEFORE -- never a symmetric difference. A window that CLOSED between the snapshots
  // appears only in `before`; treating that as a change would invent a handle that no longer exists.
  const appeared = [...new Set(
    afterRows.map(toHandle).filter((h) => h !== null && !beforeSet.has(h)),
  )];

  const diagnostics = {
    beforeCount: beforeSet.size,
    afterCount: afterRows.length,
    appearedCount: appeared.length,
    appeared: appeared.slice(0, 8), // bounded: a diagnostic, not a dump
    processFilter: processName || null,
  };

  if (appeared.length === 0) {
    return { handle: null, reason: 'no_new_window', diagnostics: { ...diagnostics, reason: 'no_new_window' } };
  }
  if (appeared.length > 1) {
    // Fail CLOSED. Guessing here would bind a session card to someone else's window.
    return { handle: null, reason: 'ambiguous', diagnostics: { ...diagnostics, reason: 'ambiguous' } };
  }
  return { handle: appeared[0], reason: 'ok', diagnostics: { ...diagnostics, reason: 'ok' } };
}

/**
 * SD-LEO-FEAT-FLEET-SESSION-LIFECYCLE-001 / FR-5a — THE ENUMERATION THAT FAILS LOUDLY.
 *
 * A failed enumeration and an empty desktop are NOT the same fact, and until now they
 * produced the same value: []. That is why the SD calls this the prerequisite bug — a
 * fail-soft [] composed with a fail-CLOSED set-difference GUARANTEES capture failure
 * rather than degrading, and back-to-back runs on this host returned 135 rows, then 0,
 * then 0, with nothing in the output to say which zeros were real.
 *
 * Returns { ok, windows, error }. A caller that must not act on a guess — the FR-5 reaper,
 * whose whole safety argument is "this console contains no process" — uses THIS and handles
 * ok:false. Reading "no windows" from a timeout would let it reason about a desktop it
 * never actually saw.
 */
export async function enumerateWindowsStrict(opts = {}) {
  const { execFn = defaultExec } = opts;
  try {
    const cmd = buildWindowEnumCommand();
    const { stdout } = await execFn(cmd.program, cmd.args);
    return { ok: true, windows: parseWindowListOutput(stdout), error: null };
  } catch (err) {
    // execFile signals a timeout by KILLING the child, so it surfaces as killed/SIGTERM
    // rather than a distinct code. Name it explicitly — "timed out" and "PowerShell refused"
    // want different operator responses.
    const timedOut = Boolean(err && (err.killed || err.code === 'ETIMEDOUT' || err.signal === 'SIGTERM'));
    return {
      ok: false,
      windows: null,
      error: {
        code: 'GUARD_UNAVAILABLE',
        timedOut,
        message: timedOut
          ? `window enumeration exceeded ${WINDOW_ENUM_TIMEOUT_MS}ms — the desktop was NOT observed; this is not an empty desktop`
          : `window enumeration failed: ${(err && err.message) || err} — the desktop was NOT observed`,
      },
    };
  }
}

/**
 * Legacy fail-soft wrapper: [] on error.
 * DELIBERATELY UNCHANGED in behaviour. captureNewWindowHandle's contract is built on it
 * ("enumerateWindows swallows exec failures and returns [], and selectNewWindowHandle is
 * pure and total"), and that invariant is asserted in its tests. Flipping this return type
 * would break the capture path to fix the reaper. New callers should prefer the strict form.
 */
export async function enumerateWindows(opts = {}) {
  const r = await enumerateWindowsStrict(opts);
  return r.ok ? r.windows : [];
}

/**
 * Capture the handle of the window that appeared after a spawn, given the BEFORE snapshot.
 *
 * CALL ORDER IS LOAD-BEARING: the caller must take `before` BEFORE launching the process. Taking it
 * afterwards makes the diff always empty while every pure unit test still passes -- the exact
 * green-and-dead shape this SD exists to close. spawn-control's spawn() is ordered accordingly.
 *
 * POLLS ONLY THE RACE IT CAN WIN. `no_new_window` is a genuine race (the window renders slightly
 * after the process launches), so it retries. `ambiguous` is NOT retried: two windows already
 * appeared, and waiting cannot un-appear one -- polling there would just burn the same futile ~5s
 * FR-7 exists to retire. Fails closed either way.
 *
 * @param {Array} before snapshot taken BEFORE the spawn
 * @returns {Promise<{handle:number|null, handleCaptureFailed:boolean, attempts:number, diagnostics:object}>}
 */
export async function captureNewWindowHandle(before, opts = {}) {
  const {
    maxAttempts = CAPTURE_POLL_MAX_ATTEMPTS,
    delayMs = CAPTURE_POLL_DELAY_MS,
    sleepFn = defaultSleep,
  } = opts;
  let selection = { handle: null, reason: 'no_new_window', diagnostics: { reason: 'no_new_window' } };
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const after = await enumerateWindows(opts);
    selection = selectNewWindowHandle(before, after, opts);
    if (selection.handle !== null) {
      return {
        handle: selection.handle,
        handleCaptureFailed: false,
        attempts: attempt,
        diagnostics: { ...selection.diagnostics, attempts: attempt },
      };
    }
    if (selection.reason === 'ambiguous') break; // retrying cannot resolve it
    if (attempt < maxAttempts) await sleepFn(delayMs);
  }
  return {
    handle: null,
    handleCaptureFailed: true,
    attempts: selection.reason === 'ambiguous' ? 1 : maxAttempts,
    diagnostics: { ...selection.diagnostics, reason: selection.reason },
  };
}

/** Build the foreground-focus command for a captured handle. Pure -- no execution. */
export function buildFocusCommand(handle) {
  const n = Number(handle);
  if (!Number.isFinite(n) || n === 0) throw new Error(`buildFocusCommand: invalid handle: ${JSON.stringify(handle)}`);
  // SetForegroundWindow via a minimal inline P/Invoke -- handle passed as a coerced Int64, never a raw string.
  return {
    program: 'powershell',
    args: ['-NoProfile', '-NonInteractive', '-Command',
      `Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class FleetWin{[DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);}'; [FleetWin]::SetForegroundWindow([IntPtr]${n})`],
  };
}

/**
 * Focus a previously-captured window handle (FR-3 attach). Never throws -- a stale/invalid handle
 * (window closed) returns false so the caller reports a clear degraded state instead of guessing.
 */
export async function focusWindow(handle, opts = {}) {
  const { execFn = defaultExec } = opts;
  try {
    const cmd = buildFocusCommand(handle);
    await execFn(cmd.program, cmd.args);
    return true;
  } catch {
    return false;
  }
}
