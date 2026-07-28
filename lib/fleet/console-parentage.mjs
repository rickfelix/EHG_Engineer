/**
 * SD-LEO-FEAT-FLEET-SESSION-LIFECYCLE-001 / FR-5c — creation-time parentage capture,
 * and the principal guard for the reaper's scheduled task.
 *
 * WHY THIS IS NOT OPTIONAL, AND WHY IT MUST HAPPEN AT CREATION TIME.
 *   The console creator is STILL UNIDENTIFIED. A reaper without attribution is a treadmill: it
 *   will run forever against something nobody has named. And retroactive inspection cannot find
 *   it — by the time anyone looks, the parent has usually exited, which is precisely why this has
 *   survived this long. The parent must be recorded WHEN THE CONSOLE APPEARS or not at all.
 *
 * WHAT THE MEASUREMENTS ALREADY RULE OUT:
 *   - The accumulation is BURSTY, NOT CONTINUOUS. A 60-second observation immediately after the
 *     reap saw ZERO new consoles. So a short sample cannot find the creator, and — stated plainly
 *     because it is the tempting wrong conclusion — 0-IN-60s IS NOT EVIDENCE THE LEAK IS FIXED.
 *     The ~30/hour figure is an average over bursts, not a rate.
 *   - It is NOT the governed spawn path: the consoles accumulated with ZERO fleet_verb_spawn
 *     events. Attribution therefore cannot be derived from fleet telemetry; it has to come from
 *     the OS at the moment of creation.
 *
 * THE RECORD MUST SURVIVE THE PARENT. Storing a live pid alone is useless minutes later, when
 *   that pid is gone or — worse — recycled onto an unrelated process. Capture identifying detail
 *   (image name, command line, parent-of-parent) alongside the pid, so the record still means
 *   something after the process it describes has exited.
 */

/** Fields that make a parentage record still meaningful after the parent exits. */
export const REQUIRED_PARENTAGE_FIELDS = Object.freeze([
  'console_pid', 'observed_at', 'parent_pid', 'parent_image', 'parent_command_line',
]);

/**
 * Build a durable parentage record for a newly-observed console. Pure.
 * Returns { ok, record, missing } — a record that would not survive the parent's exit is
 * reported as incomplete rather than silently stored as an answer.
 */
export function buildParentageRecord(observation) {
  const o = observation || {};
  const record = {
    console_pid: o.consolePid ?? null,
    observed_at: o.observedAt ?? null,
    parent_pid: o.parentPid ?? null,
    parent_image: o.parentImage ?? null,
    parent_command_line: o.parentCommandLine ?? null,
    // Grandparent is what usually names the culprit: the 15 live claude.exe on this host are
    // grandchildren of Cursor.exe via powershell, so the immediate parent is often just a shell.
    grandparent_pid: o.grandparentPid ?? null,
    grandparent_image: o.grandparentImage ?? null,
    // Recorded so a later reader can tell an attributed console from an unattributed one
    // WITHOUT re-deriving it from a process table that has since moved on.
    attribution: null,
  };

  const missing = REQUIRED_PARENTAGE_FIELDS.filter((f) => record[f] === null || record[f] === undefined);
  record.attribution = missing.length === 0
    ? `${record.parent_image}${record.grandparent_image ? ` (via ${record.grandparent_image})` : ''}`
    : 'unattributed';

  return { ok: missing.length === 0, record, missing };
}

/**
 * Is a burst-attribution claim supportable from what was sampled? Pure.
 *
 * Guards the specific wrong conclusion the SD calls out: reading a quiet window as a fixed leak.
 * A window that observed ZERO creations tells you nothing about a BURSTY source — absence over
 * 60 seconds is not absence, it is a window that happened to miss the burst.
 */
export function canConcludeLeakStopped({ observationWindowMs, consolesObserved, burstIntervalEstimateMs = 3_600_000 }) {
  if (!Number.isFinite(observationWindowMs) || observationWindowMs <= 0) {
    return { concluded: false, why: 'no observation window' };
  }
  if (consolesObserved > 0) {
    return { concluded: false, why: `${consolesObserved} console(s) still appearing — the leak is live` };
  }
  // Zero observed. Only meaningful if the window comfortably exceeds the burst spacing.
  if (observationWindowMs < burstIntervalEstimateMs * 2) {
    return {
      concluded: false,
      why: `zero consoles in ${Math.round(observationWindowMs / 1000)}s does NOT show the leak stopped — ` +
           'accumulation is bursty, so a window shorter than the burst spacing simply missed it',
    };
  }
  return { concluded: true, why: `no consoles across ${Math.round(observationWindowMs / 60000)} minutes, well past the estimated burst spacing` };
}

/**
 * PERSIST the record. Capturing without persisting achieves NOTHING — the whole requirement is
 * that the record OUTLIVES the parent, and a value returned in a result object dies with the
 * process that computed it. (Raised by the EXEC TESTING pass: parentage was captured at scan time
 * and returned, so TS-16's "attributable after the parent exits" did not hold.)
 *
 * Append-only JSONL rather than a table: a new table is a chairman-gated DDL, and the requirement
 * is durability + attributability, which a local append satisfies without one. Each console is
 * written ONCE per pid+parent pair, so repeated scans of a long-lived console do not spam the log
 * while a RECYCLED pid under a different parent still records as a new observation.
 *
 * Fail-open: a persistence failure must never stop a reap. Returns {written, skipped, error}.
 */
export function persistParentageRecords(records, opts = {}) {
  const {
    filePath,
    appendFileSync = null,
    readFileSync = null,
    existsSync = null,
  } = opts;
  const result = { written: 0, skipped: 0, error: null };
  if (!filePath || !appendFileSync) {
    result.error = 'no filePath/appendFileSync provided';
    return result;
  }
  try {
    // Dedup key is pid+parent, NOT pid alone: Windows recycles pids, and a recycled pid under a
    // different parent is a genuinely new console that must not be silently swallowed.
    const seen = new Set();
    if (existsSync && readFileSync && existsSync(filePath)) {
      for (const line of String(readFileSync(filePath, 'utf8')).split(/\r?\n/)) {
        if (!line.trim()) continue;
        try {
          const prev = JSON.parse(line);
          seen.add(`${prev.console_pid}:${prev.parent_pid}`);
        } catch { /* a corrupt line must not block new writes */ }
      }
    }
    const lines = [];
    for (const r of records || []) {
      const rec = r && r.record ? r.record : r;
      if (!rec || rec.console_pid == null) { result.skipped += 1; continue; }
      const key = `${rec.console_pid}:${rec.parent_pid}`;
      if (seen.has(key)) { result.skipped += 1; continue; }
      seen.add(key);
      lines.push(JSON.stringify(rec));
    }
    if (lines.length) appendFileSync(filePath, lines.join('\n') + '\n', 'utf8');
    result.written = lines.length;
  } catch (err) {
    result.error = (err && err.message) || String(err);
  }
  return result;
}

/**
 * THE REAPER MUST NOT RUN UNDER AN INTERACTIVE PRINCIPAL.
 *
 * This is not a style preference. The leak this FR exists to stop is CAUSED BY a local scheduled
 * task with an interactive principal — such a task materialises a console every run. Registering
 * the reaper the same way would make it leak one console per run: a reaper that feeds the thing
 * it reaps.
 */
export function validateScheduledTaskPrincipal(spec) {
  const s = spec || {};
  const logon = String(s.logonType || '').toLowerCase();
  const runLevel = String(s.userId || '').toLowerCase();

  if (logon === 'interactive' || logon === 'interactivetoken') {
    return { ok: false, reason: 'INTERACTIVE principal requested — this is the exact mechanism that leaks a console per run, and it is what the reaper exists to clean up' };
  }
  if (!logon) {
    return { ok: false, reason: 'no logonType specified — an unspecified principal may default to interactive' };
  }
  const session0 = logon === 'serviceaccount' || logon === 's4u' ||
    runLevel.includes('system') || runLevel.includes('service');
  return session0
    ? { ok: true, reason: `session-0 principal (${s.logonType}) — runs without materialising a console` }
    : { ok: false, reason: `principal '${s.logonType}' is not a recognised session-0 logon type` };
}
