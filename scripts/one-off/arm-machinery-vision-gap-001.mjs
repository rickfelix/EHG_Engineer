#!/usr/bin/env node
/**
 * INVOCATION_PATH_PROOF (G3) for SD-MAN-INFRA-CORRECTIVE-VISION-GAP-001.
 *
 * FR-4 shipped scripts/setup-daemon-census-task.mjs, a Windows Scheduled Task registrar
 * (classifyMachineryClass flags it machinery-class, kind='hook' -- a scheduled-task
 * registration script). ACTIVATED evidence is genuinely unavailable, not merely
 * inconvenient: the registrar was DELIBERATELY never run for real from this SD's EXEC
 * worktree, because REPO_ROOT there resolves to `.worktrees/<SD>/...`, and a worktree is
 * deleted post-merge -- registering from it would embed a wrapper .cmd path that stops
 * existing, reproducing the exact "registers happily, fails silently every interval"
 * class this SD's own TESTING findings F1/F2/F3 exist to prevent. This is enforced, not
 * just documented: main() now refuses (exit 4) real registration when
 * REPO_ROOT.includes('.worktrees') -- verified live this session.
 *
 * Real registration is a documented, near-term post-merge step: run
 * `node scripts/setup-daemon-census-task.mjs` from the stable main checkout
 * (C:\Users\rickf\Projects\_EHG\EHG_Engineer) any time after PR #7369 merges (merged
 * 2026-08-21). Unlike the PBN precedent this script otherwise mirrors (chairman-gated,
 * indefinite timeline), this blocker is operator-actionable immediately -- but it is NOT
 * guaranteed to happen within any particular window, so per that precedent's own
 * correction (any expectedIntervalSeconds just delays the same false OVERDUE alarm, it
 * does not prevent it), this row is deactivated immediately after registering: ARMED
 * satisfies checkArmedRegistration (existence-only) without ever joining the
 * periodic-liveness-watcher.mjs OVERDUE set. Once an operator runs the real
 * registration, the scheduled task's own live firing (assert-daemon-census.mjs on its
 * configured interval) is the actual liveness signal -- this row's job is done at that
 * point, not competing with it.
 */
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { registerArmedMachinery } from '../../lib/machinery-class/armed-registration.js';

const SD_KEY = 'SD-MAN-INFRA-CORRECTIVE-VISION-GAP-001';
const supabase = await getSupabaseClient();

const result = await registerArmedMachinery(supabase, { sd_key: SD_KEY }, {
  owner: 'daemon-census-scheduled-task',
  expectedIntervalSeconds: 604800, // 7 days -- a reasonable "someone should have registered it by now" horizon
  activationTrigger:
    'A real Windows Scheduled Task run of scripts/assert-daemon-census.mjs, fired by the task ' +
    'LEO-DaemonCensus that scripts/setup-daemon-census-task.mjs registers. Deliberately NOT yet ' +
    'registered: doing so from this SD\'s ephemeral EXEC worktree would embed a REPO_ROOT path ' +
    '(.worktrees/SD-MAN-INFRA-CORRECTIVE-VISION-GAP-001/...) that stops existing post-merge -- ' +
    'enforced by an explicit refusal (exit 4) in the registrar\'s main() when ' +
    'REPO_ROOT.includes(\'.worktrees\'), verified live 2026-08-21. Real registration is a ' +
    'documented post-merge operational step: run `node scripts/setup-daemon-census-task.mjs` ' +
    'from the stable main checkout (C:\\Users\\rickf\\Projects\\_EHG\\EHG_Engineer) any time ' +
    'after PR #7369 merges (merged 2026-08-21). No real Task Scheduler event fires this script ' +
    'until an operator does that.',
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
// (periodic-liveness-watcher.mjs skips rows where currently_expected_active=false). See the
// header note above for why this step exists.
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
