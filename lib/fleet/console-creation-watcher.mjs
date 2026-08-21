/**
 * SD-LEO-INFRA-CONSOLE-REAPER-CREATION-001 / FR-1 — the injectable, WMI-agnostic decision core
 * for creation-time console parentage capture.
 *
 * WHY THIS IS A SEPARATE MODULE FROM THE LIVE ADAPTER (scripts/run-console-creation-watcher.mjs).
 * lib/fleet/console-parentage.mjs's own header states the true creator of a leaked OpenConsole.exe
 * is STILL UNIDENTIFIED, and that by the time the periodic reaper's 30-minute scan runs, the true
 * parent has usually already exited. A live WMI event subscription fixes the TIMING, but nothing
 * about "decide whether this is an OpenConsole.exe creation, resolve its ancestry, persist the
 * record" needs a live WMI dependency to be correct or testable — so that logic lives here, with
 * every I/O boundary (the event source, process-ancestry lookup, and persistence) injected. The
 * live adapter's only job is to wire a real WMI event stream into handleProcessCreationEvent().
 *
 * Reuses lib/fleet/console-parentage.mjs's buildParentageRecord/persistParentageRecords UNMODIFIED
 * (TR-2) — this module is a new event SOURCE feeding the existing sink, not a sink replacement.
 */

import { appendFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { buildParentageRecord, persistParentageRecords } from './console-parentage.mjs';
import { getRepoRoot } from '../repo-paths.js';

export const CONSOLE_IMAGE = 'OpenConsole.exe';
/** SAME sink the periodic reaper writes to (scripts/run-console-reaper.mjs's PARENTAGE_LOG) — one
 *  append-only log, two event sources feeding it. Kept as a relative-path convention rather than a
 *  cross-import (lib/ must not depend on scripts/) so both stay independently correct. */
export const PARENTAGE_LOG = path.join(getRepoRoot(), '.claude', 'console-parentage.jsonl');

/**
 * Is this a console-creation event worth attributing? Pure.
 * @param {{image?: string}} event
 * @returns {boolean}
 */
export function isConsoleCreationEvent(event) {
  const image = event && event.image;
  return typeof image === 'string' && image.toLowerCase() === CONSOLE_IMAGE.toLowerCase();
}

/**
 * Resolve a console-creation event into a parentage observation, walking the parent chain via
 * the injected lookup. Async because a real lookup (WMI/CIM query for a single pid) is I/O, but
 * the lookup itself — not this function — owns that I/O; a fake lookupFn makes this unit-testable
 * with zero live dependency.
 *
 * @param {{pid: number, parentPid?: number|null, parentImage?: string|null, parentCommandLine?: string|null, observedAt?: string}} event
 * @param {(pid: number) => Promise<{pid: number, parentPid: number|null, image: string|null, commandLine?: string|null}|null>} lookupFn
 *   Resolves a single pid to its own process record (used here to find the grandparent), or null
 *   if the pid can no longer be found (already exited — expected and handled, not an error).
 * @returns {Promise<{ok: boolean, record: object, missing: string[]}>}
 */
export async function resolveParentage(event, lookupFn) {
  const nowIso = event.observedAt ?? new Date().toISOString();
  let grandparentPid = null;
  let grandparentImage = null;
  if (typeof lookupFn === 'function' && event.parentPid != null) {
    try {
      const parent = await lookupFn(event.parentPid);
      if (parent && parent.parentPid != null) {
        grandparentPid = parent.parentPid;
        const grand = await lookupFn(grandparentPid);
        grandparentImage = grand ? grand.image ?? null : null;
      }
    } catch {
      // A lookup failure must not block the record this SD exists to capture — the console-pid
      // and immediate-parent fields (already on `event`) are still worth persisting.
    }
  }
  return buildParentageRecord({
    consolePid: event.pid,
    observedAt: nowIso,
    parentPid: event.parentPid ?? null,
    parentImage: event.parentImage ?? null,
    parentCommandLine: event.parentCommandLine ?? null,
    grandparentPid,
    grandparentImage,
  });
}

/**
 * Handle one raw process-creation event end-to-end: filter, resolve ancestry, persist. This is
 * the function the live adapter (FR-2) calls per WMI event, and the function the unit tests
 * exercise with an entirely fake eventSource/lookupFn/persistFn. Non-console events are filtered
 * BEFORE any lookup or persistence I/O runs (TR-2's "no new sink" pairs with "no wasted work").
 *
 * @param {{pid: number, parentPid?: number|null, parentImage?: string|null, parentCommandLine?: string|null, image?: string, observedAt?: string}} event
 *   A pre-shaped creation event: {pid, image, parentPid, parentImage, parentCommandLine}. The live
 *   adapter is responsible for shaping the raw WMI payload into this form.
 * @param {object} deps
 * @param {(pid: number) => Promise<object|null>} [deps.lookupFn] - resolves a pid to its process record (for the grandparent walk)
 * @param {(records: object[]) => {written: number, skipped: number, error: string|null}} [deps.persistFn]
 * @returns {Promise<{handled: boolean, reason?: string, persisted?: object}>}
 */
export async function handleProcessCreationEvent(event, deps = {}) {
  const { lookupFn, persistFn = defaultPersist } = deps;
  if (!isConsoleCreationEvent(event)) {
    return { handled: false, reason: 'not-console-creation' };
  }
  const { record } = await resolveParentage(event, lookupFn);
  const persisted = persistFn([{ record }]);
  return { handled: true, persisted };
}

/** Default persist target: the SAME .claude/console-parentage.jsonl sink the periodic reaper uses. */
function defaultPersist(records) {
  return persistParentageRecords(records, {
    filePath: PARENTAGE_LOG, appendFileSync, readFileSync, existsSync,
  });
}

/**
 * FR-4 — no-false-live-claim guardrail, mirrors lib/fleet/reboot-respawn-drill-runner.js's
 * printLiveExecutionPrecondition(). States plainly that FR-1/FR-2's decision logic is
 * unit-tested via an injected event source (TS-1/TS-2), NOT yet verified against a real WMI
 * Win32_ProcessStartTrace subscription — see docs/protocol/console-creation-watcher-drill.md
 * for the manual live-verification steps. Do not treat a green unit suite as a live pass.
 */
export function printLiveExecutionPrecondition() {
  return [
    'Console-creation watcher is MECHANISM-READY, NOT live-executed against a real WMI subscription.',
    'handleProcessCreationEvent() and resolveParentage() are unit-tested via an injected fake event',
    'source and a fake lookupFn — that proves the decision logic, not the live WMI subscription itself.',
    'A live pass requires (see docs/protocol/console-creation-watcher-drill.md):',
    '  1. Running scripts/run-console-creation-watcher.mjs on an elevated-or-S4U Windows host.',
    '  2. Launching a real OpenConsole.exe and confirming a parentage record lands in',
    '     .claude/console-parentage.jsonl within the same process lifetime as the creation event.',
    '  3. Killing the PowerShell subscription subprocess and confirming this script restarts it',
    '     without a full Node-process restart.',
    'Do NOT claim a live pass until this has run for real on a Windows host.',
  ].join('\n');
}
