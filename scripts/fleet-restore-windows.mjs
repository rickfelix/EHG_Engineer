#!/usr/bin/env node
/**
 * scripts/fleet-restore-windows.mjs — SD-LEO-INFRA-SESSIONS-PAGE-TRUE-001-A FR-7.
 *
 * THE PANIC BUTTON. Un-hides every fleet terminal window, reading NOTHING from the database and
 * needing no stored handle, no server, and no session row.
 *
 *   node scripts/fleet-restore-windows.mjs          # restore every hidden terminal window
 *   node scripts/fleet-restore-windows.mjs --dry-run  # list what WOULD be restored
 *
 * WHY IT EXISTS, and why it cannot depend on anything this feature writes. A bad mass-hide is the
 * worst failure mode of the hide verb, and the DB rows recording what was hidden are exactly what a
 * bad hide may have gotten wrong. Without this script the only recovery is killing
 * WindowsTerminal.exe — which destroys ALL NINE SEATS AT ONCE, because they share one host process
 * (measured on this host: 9 visible terminal windows, ONE owning pid). A feature whose worst case is
 * a nine-seat outage must ship its own recovery, and that recovery must not read the rows it may
 * have corrupted. Hence: no supabase import, no metadata read, no route.
 *
 * IT IS BUILDABLE ONLY BECAUSE HIDDEN WINDOWS ARE ENUMERABLE. The SD originally asserted the
 * opposite — "a hidden window cannot be re-enumerated" — and that claim was measured false: 348
 * top-level windows on this host, 36 visible, 312 HIDDEN AND ENUMERABLE. They are excluded from
 * this repo's normal enumeration by ONE predicate, `if (IsWindowVisible(h))` inside
 * WINDOW_ENUM_COMMAND (lib/fleet/window-handle.js). This script is that same enumeration MINUS the
 * predicate. Had the false claim survived, this recovery path would have been ruled out on paper.
 *
 * DELIBERATELY NOT SELECTIVE. It restores every window owned by the terminal process rather than
 * only those a DB says should be visible, because in the panic case the DB is the thing you do not
 * trust. Showing a window that was already visible is a no-op; leaving one hidden is the outage.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** The host process that owns fleet session windows. Must match lib/fleet/window-handle.js. */
export const TERMINAL_PROCESS_NAME = 'WindowsTerminal';

/**
 * Enumerate ALL top-level windows — WITHOUT the IsWindowVisible filter — and SW_SHOW the ones owned
 * by the terminal process, in ONE PowerShell invocation.
 *
 * One invocation is not an optimisation here: enumerate-then-restore across two calls would let the
 * window set change in between, and in a panic the operator is watching a screen with nothing on it.
 */
export function buildRestoreCommand({ dryRun = false, processName = TERMINAL_PROCESS_NAME } = {}) {
  if (!/^[\w.-]+$/.test(String(processName))) {
    throw new Error(`buildRestoreCommand: invalid processName: ${JSON.stringify(processName)}`);
  }
  const typeDef = 'using System;using System.Text;using System.Collections.Generic;using System.Runtime.InteropServices;'
    + 'public class FleetRestore{'
    + 'public delegate bool EnumProc(IntPtr h,IntPtr l);'
    + '[DllImport("user32.dll")]public static extern bool EnumWindows(EnumProc cb,IntPtr l);'
    + '[DllImport("user32.dll")]public static extern bool IsWindowVisible(IntPtr h);'
    + '[DllImport("user32.dll")]public static extern bool ShowWindow(IntPtr h,int c);'
    + '[DllImport("user32.dll")]public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);'
    // NOTE THE ABSENCE: no `if(IsWindowVisible(h))` gate around the Add. That one missing predicate
    // is the whole reason a hidden window can be found again.
    + 'public static List<string> All(){var r=new List<string>();EnumWindows((h,l)=>{uint p;GetWindowThreadProcessId(h,out p);r.Add(h.ToInt64()+"|"+p+"|"+(IsWindowVisible(h)?"1":"0"));return true;},IntPtr.Zero);return r;}'
    + 'public static void Show(IntPtr h){ShowWindow(h,5);}}';

  const action = dryRun ? '' : '; [FleetRestore]::Show([IntPtr]$hh)';
  const script = [
    `Add-Type -TypeDefinition '${typeDef}'`,
    '$n=0; $s=0',
    '[FleetRestore]::All() | ForEach-Object {',
    '  $f=$_.Split([char]124); $hh=[int64]$f[0]; $pp=[int]$f[1]; $vis=$f[2]',
    `  $pn=(Get-Process -Id $pp -ErrorAction SilentlyContinue).ProcessName`,
    `  if($pn -eq '${processName}'){ $n++; if($vis -eq '0'){ $s++${action} } }`,
    '}',
    "Write-Output ('RESTORE|' + $n + '|' + $s)",
  ].join('; ');

  return { program: 'powershell', args: ['-NoProfile', '-NonInteractive', '-Command', script] };
}

/** Parse the single RESTORE line. Pure, so the contract is testable without PowerShell. */
export function parseRestoreResult(stdout) {
  const line = String(stdout || '').split(/\r?\n/).find((l) => l.startsWith('RESTORE|'));
  if (!line) return { ok: false, terminalWindows: null, restored: null, reason: 'unparseable_output' };
  const [, total, restored] = line.split('|');
  if (!/^\d+$/.test(String(total || '').trim()) || !/^\d+$/.test(String(restored || '').trim())) {
    return { ok: false, terminalWindows: null, restored: null, reason: 'unparseable_output' };
  }
  return { ok: true, terminalWindows: Number(total), restored: Number(restored), reason: null };
}

/** Restore every hidden terminal window. Returns counts; never throws at the caller. */
export async function restoreAllTerminalWindows(opts = {}) {
  const { dryRun = false, processName = TERMINAL_PROCESS_NAME, execFn } = opts;
  const run = execFn || (async (program, args) => (await execFileAsync(program, args, { windowsHide: true })).stdout);
  try {
    const cmd = buildRestoreCommand({ dryRun, processName });
    return parseRestoreResult(await run(cmd.program, cmd.args));
  } catch (e) {
    return { ok: false, terminalWindows: null, restored: null, reason: `invocation_failed: ${e?.message || e}` };
  }
}

const isDirectRun = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isDirectRun) {
  const dryRun = process.argv.includes('--dry-run');
  const r = await restoreAllTerminalWindows({ dryRun });
  if (!r.ok) {
    console.error(`fleet-restore-windows: FAILED (${r.reason})`);
    process.exit(1);
  }
  console.log(
    dryRun
      ? `fleet-restore-windows: ${r.terminalWindows} terminal window(s), ${r.restored} hidden and WOULD be restored (dry run)`
      : `fleet-restore-windows: ${r.terminalWindows} terminal window(s), ${r.restored} restored`
  );
}
