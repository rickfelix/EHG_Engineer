// SD-LEO-INFRA-COORDINATOR-CRON-TEARDOWN-001
// Unified, DEFAULT-OFF coordinator teardown contract.
//
// PROBLEM: the coordinator has TWO divergent teardown paths (.claude/commands/coordinator.md):
//   - `/coordinator stop` clears the pointer but historically leaves crons running.
//   - queue-empty auto-teardown CronDeletes only sweep+dashboard and never clears the pointer.
// Either way, the inbox loop (cadence */2) calls setActiveCoordinator(...) every ~2min and
// RE-ASSERTS the pointer on the next tick — so any teardown that does not remove the inbox
// cron BEFORE clearing the pointer silently self-reverses.
//
// CONTRACT (both paths must follow, gated by COORD_TEARDOWN_SAFETY_V2):
//   1. CronList()                              <- harness tool (NOT Node-callable)
//   2. selectCoordinatorCronJobs(list)         <- this module: pick coordinator-owned jobs
//   3. CronDelete(each.id)  for ALL of them    <- harness tool, BEFORE step 4
//   4. clearCoordinatorPointer(...)            <- this module: session-scoped, fail-open
//
// Cron deletion MUST precede the pointer clear (coordinator guidance 2186782f). This module
// CANNOT delete crons (CronList/CronDelete are Claude Code harness tools, not Node APIs); it
// supplies the canonical inventory + matcher + the pointer clear, and the .md wiring sequences
// the harness cron deletion before calling clearCoordinatorPointer.
//
// When COORD_TEARDOWN_SAFETY_V2 is unset/off, clearCoordinatorPointer is a no-op and both
// teardown paths keep their current (legacy) behavior byte-for-byte.

'use strict';

const resolve = require('./resolve.cjs');

const FLAG = 'COORD_TEARDOWN_SAFETY_V2';

// Single source of truth for the coordinator's recurring crons.
// committed coordinator.md Step 4 documents only sweep/dashboard/identity; inbox + email are
// coordinator-confirmed live (creation-vs-reality DRIFT, signalled prd-ambiguous). Listed here
// so creation and teardown can be reconciled to one inventory. `command` is informational; the
// runtime matcher (selectCoordinatorCronJobs) keys on `markers` so it is robust to exact-command
// drift. The inbox loop is the critical one (re_asserts_pointer:true).
const COORDINATOR_CRONS = [
  { key: 'sweep',     cadence: '*/5 * * * *',                                command: 'node scripts/stale-session-sweep.cjs',     re_asserts_pointer: false },
  // SD-LEO-INFRA-TOKEN-BURN-AUTOPILOT-001: the quiet-tick consolidation cron (folds inbox/audit/
  // charter-audit/capacity-forecast/backlog-rank) — teardown must remove it like any other loop.
  { key: 'quiet-tick', cadence: '0,15,30,45 * * * *',                        command: 'node scripts/coordinator-quiet-tick.mjs',  re_asserts_pointer: false },
  { key: 'dashboard', cadence: '2,7,12,17,22,27,32,37,42,47,52,57 * * * *',  command: 'node scripts/fleet-dashboard.cjs all',     re_asserts_pointer: false },
  { key: 'identity',  cadence: '4,9,14,19,24,29,34,39,44,49,54,59 * * * *',  command: 'node scripts/assign-fleet-identities.cjs', re_asserts_pointer: false },
  { key: 'inbox',     cadence: '*/2 * * * *',                                command: 'node scripts/fleet-dashboard.cjs inbox',  re_asserts_pointer: true },
  // email: coordinator-confirmed command (coordinator signal 2026-06-06 01:42). Non-critical for
  // the re-assert bug (does not touch the pointer) but still a coordinator cron teardown must remove.
  { key: 'email',     cadence: '7,22,37,52 * * * *',                         command: 'node scripts/coordinator-email-summary.mjs', re_asserts_pointer: false },
  // SD-LEO-INFRA-STANDING-ROW-GROWTH-001: daily governance row-growth gauge (internally due-gated).
  { key: 'row-growth', cadence: '30 8 * * *',                                command: 'node scripts/row-growth-snapshot.cjs',      re_asserts_pointer: false },
  // SD-LEO-INFRA-CODIFY-SUBSYSTEM-REVIEW-001: weekly subsystem-review rotation (due-gated internally).
  { key: 'review-rotation', cadence: '0 9 * * 1',                            command: 'node scripts/subsystem-review-rotation.cjs', re_asserts_pointer: false },
  // SD-LEO-INFRA-SCRIPTS-ESTATE-RECONCILIATION-001: weekly scripts-estate reachability gauge (due-gated internally).
  { key: 'scripts-reachability', cadence: '40 9 * * 1',                       command: 'node scripts/scripts-reachability-gauge.mjs', re_asserts_pointer: false },
  // SD-MAN-INFRA-RETENTION-OPS-FINISHER-001: weekly archive-not-delete retention enforcement.
  { key: 'retention', cadence: '0 3 * * 0',                                   command: 'npm run retention:apply',                    re_asserts_pointer: false }
];

// Basename markers used to recognise coordinator-owned jobs in a CronList() result. The
// fleet-dashboard.cjs marker intentionally covers BOTH the `all` (dashboard) and `inbox`
// invocations, so the critical pointer-re-asserting inbox cron is matched regardless of the
// exact prompt string. The email loop is a separate script (coordinator-confirmed).
const COORD_SCRIPT_MARKERS = [
  'stale-session-sweep.cjs',
  'coordinator-quiet-tick.mjs', // SD-LEO-INFRA-TOKEN-BURN-AUTOPILOT-001
  'fleet-dashboard.cjs',
  'assign-fleet-identities.cjs',
  'coordinator-email-summary.mjs',
  'row-growth-snapshot.cjs',
  'subsystem-review-rotation.cjs',
  // Drive-by (SD-MAN-INFRA-RETENTION-OPS-FINISHER-001): scripts-reachability was added to
  // COORDINATOR_CRONS without a marker — its cron was unmatched at teardown (orphan-cron gap).
  'scripts-reachability-gauge.mjs',
  'retention-enforce.js',
  // retention:apply resolves to retention-enforce.js; the npm alias is also matched directly
  // so a CronList entry created with the alias prompt is still recognised for teardown.
  'retention:apply'
];

function isEnabled() {
  const v = process.env[FLAG];
  return v === 'on' || v === 'true' || v === '1';
}

function listCoordinatorCrons() {
  return COORDINATOR_CRONS.map((c) => ({ ...c }));
}

// Pick coordinator-owned jobs out of a CronList() result. A job matches if its command/prompt
// string contains any canonical coordinator script basename. Robust to the 3-vs-5 inventory
// drift: whatever coordinator crons are actually running get matched for deletion.
function selectCoordinatorCronJobs(cronJobs) {
  if (!Array.isArray(cronJobs)) return [];
  return cronJobs.filter((j) => {
    if (!j) return false;
    const cmd = String(j.prompt || j.command || j.cron_command || j.task || '');
    return COORD_SCRIPT_MARKERS.some((m) => cmd.includes(m));
  });
}

// FR-2 (session-scope) + FR-3 (fail-open): clear the coordinator pointer + is_coordinator
// metadata, but ONLY for this session's own pointer unless force=true. Reuses
// resolve.clearActiveCoordinator (TR-3). Never throws. MUST be called AFTER the harness has
// CronDeleted all coordinator crons (else the inbox loop re-asserts the pointer).
//
// opts: { sessionId, force=false, pointerFile, readPointer, cronsDeleted }
//   - pointerFile : inject an alternate pointer path (tests; FR-7). Default = live pointer.
//   - readPointer : inject a pointer reader (tests). Default = resolve.readPointerFile.
//   - cronsDeleted: caller asserts it already CronDeleted the crons (advisory; recorded in result).
async function clearCoordinatorPointer(supabase, opts = {}) {
  const { sessionId, force = false, pointerFile, readPointer, cronsDeleted } = opts;
  const result = {
    flag: FLAG,
    enabled: isEnabled(),
    crons_to_delete: listCoordinatorCrons(),
    crons_deleted_asserted: Boolean(cronsDeleted),
    pointer_cleared: false,
    refused: false,
    forced: false,
    errors: []
  };

  // FR-5: flag-OFF => no-op passthrough (legacy teardown unchanged, byte-identical).
  if (!isEnabled()) {
    result.action = 'noop';
    result.message = FLAG + ' is off — legacy teardown unchanged (no pointer/cron side effects).';
    return result;
  }

  // FR-2: ownership check. Fail-safe: if the pointer cannot be read and force is not set,
  // REFUSE (do not risk clobbering an unknown/foreign pointer).
  let owner = null;
  let readErr = null;
  try {
    const reader = readPointer || resolve.readPointerFile;
    const pointer = reader(pointerFile);
    owner = pointer && typeof pointer.session_id === 'string' ? pointer.session_id : null;
  } catch (e) {
    readErr = e;
    result.errors.push('pointer-read: ' + (e && e.message ? e.message : String(e)));
  }
  if (readErr && !force) {
    result.refused = true;
    result.message = 'Refused: could not verify pointer ownership (fail-safe). Pass force=true to override.';
    return result;
  }
  if (owner && sessionId && owner !== sessionId && !force) {
    result.refused = true;
    result.owner = owner;
    result.message = 'Refused: active-coordinator pointer owned by ' + String(owner).slice(0, 8) +
      ' != this session ' + String(sessionId).slice(0, 8) + '. Pass force=true to override (protects the LIVE coordinator).';
    return result;
  }
  result.forced = Boolean(force && owner && sessionId && owner !== sessionId);

  // FR-3: fail-open clear via resolve.clearActiveCoordinator (pointer file + is_coordinator metadata).
  try {
    await resolve.clearActiveCoordinator(supabase, sessionId, pointerFile ? { pointerFile } : undefined);
    result.pointer_cleared = true;
  } catch (e) {
    result.errors.push('clear: ' + (e && e.message ? e.message : String(e)));
  }

  const pendingEmail = COORDINATOR_CRONS.some((c) => c.needs_confirmation);
  result.message = (result.pointer_cleared ? 'Pointer cleared. ' : 'Pointer clear attempted (see errors). ') +
    'Caller MUST have CronDeleted all coordinator crons FIRST (' + result.crons_to_delete.length + ' canonical' +
    (pendingEmail ? '; email command pending confirmation' : '') + ').';
  return result;
}

module.exports = {
  FLAG,
  COORDINATOR_CRONS,
  COORD_SCRIPT_MARKERS,
  isEnabled,
  listCoordinatorCrons,
  selectCoordinatorCronJobs,
  clearCoordinatorPointer
};
