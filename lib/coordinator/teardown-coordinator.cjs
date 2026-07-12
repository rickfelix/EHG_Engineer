// SD-LEO-INFRA-COORDINATOR-CRON-TEARDOWN-001
// Coordinator cron inventory + matcher (QF-20260712-716: the COORD_TEARDOWN_SAFETY_V2-gated
// clearCoordinatorPointer() safety mechanism was killed as a disabled-aging flag that was
// never turned on in practice — every caller's flag-off no-op WAS the only live behavior, so
// removing it changes nothing observable. This module now supplies only the canonical cron
// inventory + matcher that both teardown paths (.claude/commands/coordinator.md) still use to
// identify coordinator-owned jobs for CronDelete.
//
// PROBLEM (still real, not fixed by this module): the coordinator has TWO divergent teardown
// paths — `/coordinator stop` clears the pointer but historically leaves crons running; the
// queue-empty auto-teardown CronDeletes only sweep+dashboard and never clears the pointer.
// Either way, the inbox loop (cadence */2) calls setActiveCoordinator(...) every ~2min and
// RE-ASSERTS the pointer on the next tick — so any teardown that does not remove the inbox
// cron BEFORE clearing the pointer silently self-reverses. No current fix; documented in
// coordinator.md as a known footgun.

'use strict';

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

module.exports = {
  COORDINATOR_CRONS,
  COORD_SCRIPT_MARKERS,
  listCoordinatorCrons,
  selectCoordinatorCronJobs
};
