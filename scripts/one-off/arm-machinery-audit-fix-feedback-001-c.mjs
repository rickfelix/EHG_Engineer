#!/usr/bin/env node
/**
 * INVOCATION_PATH_PROOF (G3) for SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-C.
 *
 * classifyMachineryClass() flags this SD machinery-class because
 * lib/quality/snooze-manager.js's wakeExpiredSnoozes() carries an explicit "cron job or
 * scheduler" docstring. This SD FIXED wakeExpiredSnoozes() (it previously threw on every call
 * -- 3 nonexistent columns + invalid status enum values) but did NOT wire it to any periodic
 * trigger, because none existed before this SD either.
 *
 * Measured live 2026-09-12 (this SD's own EXEC-phase TESTING evidence, row
 * 7e94571a-f8dd-48b4-859c-9c94cf1eb6db): wakeExpiredSnoozes has ZERO callers repo-wide --
 * confirmed via an exhaustive grep across scripts/, lib/, api/, server/, src/, pages/
 * (excluding node_modules/.git/.worktrees). No .github/workflows cron, no package.json script,
 * no loop-contract registry entry, no in-code setInterval/cron invokes it. The ONLY live caller
 * of this file at all is .claude/skills/inbox.md's snooze/unsnooze/snoozed subcommands, which
 * call snoozeFeedback/unsnoozeFeedback/getSnoozedItems directly -- never wakeExpiredSnoozes.
 *
 * ACTIVATED evidence is genuinely unavailable: no real event can occur without a scheduler
 * that this SD did not create (and manufacturing one now would be an unreviewed, undersized
 * design decision about WHERE/HOW OFTEN to run it -- out of scope for a bugfix SD whose job was
 * to make the function CORRECT, not to newly operationalize a feature that was never scheduled
 * even before this SD, or after it).
 *
 * ARMED is the honest state: fixed, unit-tested (8/8 passing, tests/unit/quality/
 * snooze-manager.test.js), inert until a future SD/QF decides where to schedule it (a
 * GitHub Actions cron workflow is the obvious candidate, mirroring other periodic sweeps in
 * this repo, e.g. .github/workflows/nursery-reeval-cron.yml). Registered then immediately
 * deactivated (currently_expected_active=false) so periodic-liveness-watcher.mjs never treats
 * an intentionally-unscheduled function as an overdue cron -- mirrors the corrected precedent
 * in scripts/one-off/arm-machinery-pbn-001.mjs.
 */
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { registerArmedMachinery } from '../../lib/machinery-class/armed-registration.js';

const SD_KEY = 'SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-C';
const supabase = await getSupabaseClient();

const result = await registerArmedMachinery(supabase, { sd_key: SD_KEY }, {
  owner: 'feedback-snooze-lifecycle',
  expectedIntervalSeconds: 86400, // documented intent only -- deactivated below, so never checked
  activationTrigger:
    'A future scheduler (most likely a new .github/workflows/*.yml cron entry, mirroring the ' +
    'repo\'s other periodic sweeps) invokes lib/quality/snooze-manager.js\'s wakeExpiredSnoozes() ' +
    'for the first time. Measured live 2026-09-12: this function has ZERO callers repo-wide ' +
    '(scripts/, lib/, api/, server/, src/, pages/ all checked) -- no cron workflow, no npm ' +
    'script, no loop-contract entry, no in-code interval. This SD fixed the function\'s ' +
    'correctness (it previously threw unconditionally due to 3 nonexistent columns and 2 ' +
    'invalid CHECK-constraint status values); it did not create or claim to create scheduling ' +
    'for it, since none existed before this SD either and deciding where/how-often to run it ' +
    'is a separate, unreviewed design decision out of scope for this bugfix.',
});

console.log('registerArmedMachinery ->', JSON.stringify(result));
if (!result?.ok) { console.error('ARMED REGISTRATION FAILED'); process.exit(1); }

// Readback -- persistence is not the return value.
const { data, error } = await supabase
  .from('periodic_process_registry')
  .select('process_key, display_name, owner, liveness_source, liveness_source_ref, currently_expected_active, expected_interval_seconds, grace_multiplier')
  .eq('process_key', result.processKey)
  .maybeSingle();
if (error) { console.error('READBACK FAILED:', error.message); process.exit(1); }
if (!data) { console.error('READBACK FOUND NO ROW — registration did not persist.'); process.exit(1); }
console.log(`process_key=${data.process_key} owner=${data.owner} active=${data.currently_expected_active}`);
console.log(`expected_interval_seconds=${data.expected_interval_seconds} grace_multiplier=${data.grace_multiplier}`);
console.log(`sd_key=${data.liveness_source_ref?.sd_key} armed_at=${data.liveness_source_ref?.armed_at}`);
console.log(`activation_trigger=${(data.liveness_source_ref?.activation_trigger ?? 'ABSENT').slice(0, 160)}…`);

// Deactivate: satisfies INVOCATION_PATH_PROOF (row exists) without ever joining the OVERDUE set
// (periodic-liveness-watcher.mjs skips rows where currently_expected_active=false).
const { data: deactivated, error: deactivateError } = await supabase
  .from('periodic_process_registry')
  .update({ currently_expected_active: false, updated_at: new Date().toISOString() })
  .eq('process_key', result.processKey)
  .select('process_key, currently_expected_active')
  .maybeSingle();
if (deactivateError) { console.error('DEACTIVATE FAILED:', deactivateError.message); process.exit(1); }
if (!deactivated || deactivated.currently_expected_active !== false) {
  console.error('DEACTIVATE READBACK MISMATCH — row still shows active');
  process.exit(1);
}
console.log(`deactivated: process_key=${deactivated.process_key} currently_expected_active=${deactivated.currently_expected_active}`);
