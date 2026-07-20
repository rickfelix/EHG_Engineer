/**
 * Windows window-handle capture + focus for fleet spawn-control (FR-1, FR-3).
 * SD-LEO-INFRA-FLEET-SPAWN-CONTROL-001.
 *
 * MainWindowHandle capture races window creation (the process exists before its window does),
 * so capture is a bounded poll/retry, not a single read. The PowerShell command interpolates
 * ONLY a coerced-numeric PID -- never a raw identifier -- closing the injection surface SECURITY
 * flagged in PLAN review (TR-5).
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Coerce to a strictly-positive integer PID or throw. Never interpolate an unvalidated value. */
export function assertValidPid(pid) {
  const n = Number(pid);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`assertValidPid: not a valid PID: ${JSON.stringify(pid)}`);
  return n;
}

/** Build the PowerShell command for a single, coerced-numeric PID. Pure -- no execution. */
export function buildHandleCaptureCommand(pid) {
  const safePid = assertValidPid(pid);
  return {
    program: 'powershell',
    args: ['-NoProfile', '-NonInteractive', '-Command',
      `(Get-Process -Id ${safePid} -ErrorAction SilentlyContinue).MainWindowHandle.ToInt64()`],
  };
}

/** Parse the PowerShell handle-capture stdout. Returns a non-zero handle or null (window not yet created). */
export function parseHandleOutput(stdout) {
  const trimmed = String(stdout || '').trim();
  const n = Number(trimmed);
  return Number.isFinite(n) && n !== 0 ? n : null;
}

async function defaultExec(program, args) {
  return execFileAsync(program, args, { windowsHide: false, timeout: 5000 });
}
function defaultSleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

/**
 * Bounded poll/retry to capture MainWindowHandle for a just-spawned PID. Injectable execFn/sleepFn
 * for tests (never invokes PowerShell in unit tests).
 * @param {number} pid
 * @param {{execFn?:Function, maxAttempts?:number, delayMs?:number, sleepFn?:Function}} [opts]
 * @returns {Promise<{handle:number|null, handleCaptureFailed:boolean, attempts:number}>}
 */
export async function captureWindowHandle(pid, opts = {}) {
  const { execFn = defaultExec, maxAttempts = 10, delayMs = 500, sleepFn = defaultSleep } = opts;
  const cmd = buildHandleCaptureCommand(pid);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { stdout } = await execFn(cmd.program, cmd.args);
    const handle = parseHandleOutput(stdout);
    if (handle !== null) return { handle, handleCaptureFailed: false, attempts: attempt };
    if (attempt < maxAttempts) await sleepFn(delayMs);
  }
  return { handle: null, handleCaptureFailed: true, attempts: maxAttempts };
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
