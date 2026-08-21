#!/usr/bin/env node
/**
 * FR-2 EXEC-phase disposition for SD-LEO-INFRA-FLEET-SESSION-LIFECYCLE-001.
 *
 * Two sub-scopes could not be completed AS FULL LIVE ACTIVATION within this EXEC pass, both for
 * concrete, investigated reasons rather than being silently dropped:
 *
 * 1) CREATION-TIME PARENTAGE CAPTURE: investigation confirmed the leaked consoles accumulate with
 *    ZERO fleet_verb_spawn events (console-parentage.mjs's own header) -- i.e. the leak source is
 *    UNGOVERNED, so a spawner-side hook (which only ever sees GOVERNED spawn-control.js spawns)
 *    would provide zero coverage of the actual problem. The correct mechanism is a WMI
 *    Win32_ProcessStartTrace event subscription -- genuinely new, always-on daemon infrastructure
 *    with its own lifecycle/resilience story, not a small edit. Escalated to its own SD:
 *    SD-LEO-INFRA-CONSOLE-REAPER-CREATION-001 (full LEAD->PLAN->EXEC cycle, same escalation
 *    pattern used for QF-20260729-621 earlier in the originating session).
 *
 * 2) SCHEDULED TASK REGISTRATION: `node scripts/setup-console-reaper-task.mjs` (run from the
 *    shared root, C:\Users\rickf\Projects\_EHG\EHG_Engineer, so the registered /TR path is the
 *    persistent checkout, not a temporary worktree) fails with "Access is denied" -- confirmed
 *    this session's execution context is NOT an Administrator (IsInRole(Administrator)=False), and
 *    creating a task under a session-0 principal (SYSTEM/LocalService/NetworkService) requires
 *    admin rights by Windows design. Control check: none of the 3 sibling watcher tasks
 *    (LEO-RebootRespawn, LEO-LivenessWatcher, LEO-EvaWatcher) are registered on this host either,
 *    confirming this is a privilege gap in this execution context, not a console-reaper-specific
 *    regression. validateScheduledTaskPrincipal correctly refuses a lower-privilege/interactive
 *    principal as a workaround (that IS the leak mechanism this reaper exists to fix), so this was
 *    not routed around. Signaled to the coordinator (signal 6a127ed4) for a privileged actor to
 *    complete: `node scripts/setup-console-reaper-task.mjs` from an elevated prompt at the shared
 *    root.
 *
 * WHAT WAS ACTUALLY COMPLETED: FLEET_CONSOLE_REAPER_ENABLED=on is SET in the shared root's .env
 * (verified safe/inert without the task -- both runReaperOnce's isConsoleReaperEnabled gate and
 * reapEmptyConsoles' own independent gate are already tested and correctly refuse when unset).
 * buildQueryArgs/buildRemoveArgs (the rollback argv, the part of TS-9 that does not require live
 * elevation) are now directly unit-tested. The chairman's authorization for the reaper to go live
 * is already on record (console-reaper.mjs header, 2026-07-27 override) -- this SD is the
 * activation vehicle, not a request for NEW authorization.
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(path.resolve(__dirname, '..', '..'), '.env') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_ID = '1eadc0ce-2dd4-4841-b09c-cbd5f08c52b0';

const { data: prd, error: prdErr } = await supabase.from('product_requirements_v2').select('functional_requirements').eq('sd_id', SD_ID).maybeSingle();
if (prdErr || !prd) { console.error('PRD lookup failed', prdErr); process.exit(1); }

const frs = prd.functional_requirements;
const fr2 = frs.find((f) => f.id === 'FR-2');

fr2.description += ' EXEC-PHASE DISPOSITION (2026-08-21): creation-time capture escalated to SD-LEO-INFRA-CONSOLE-REAPER-CREATION-001 -- investigation confirmed the leaked consoles accumulate with ZERO fleet_verb_spawn events (console-parentage.mjs\'s own header), so the leak source is UNGOVERNED and a spawner-side hook would cover nothing; only a WMI Win32_ProcessStartTrace subscription (genuinely new always-on daemon infrastructure) can attribute it, which is out of scope for a single FR sub-bullet. Scheduled-task registration is BLOCKED on Administrator privilege this EXEC session\'s execution context does not hold (schtasks /Create .../RU SYSTEM refused with "Access is denied"; confirmed structural via a control check -- none of the 3 sibling watcher tasks are registered on this host either); signaled to the coordinator for a privileged actor to complete via `node scripts/setup-console-reaper-task.mjs` from an elevated prompt at the shared root. FLEET_CONSOLE_REAPER_ENABLED=on IS set in the shared root .env (verified safe/inert without the task, both gates independently tested).';

fr2.acceptance_criteria = fr2.acceptance_criteria.map((c) => {
  if (c.startsWith('node scripts/setup-console-reaper-task.mjs successfully registers')) {
    return c + ' -- BLOCKED on Administrator privilege this EXEC session does not hold (confirmed structural: no sibling watcher task is registered on this host either); argv construction (register/query/remove) is fully unit-tested in console-reaper-task-registration.test.js, and the dry-run output was verified correct (points at the persistent shared-root path). Remaining: a privileged actor must run the registration once elevated access is available (signaled to coordinator, signal 6a127ed4).';
  }
  if (c.startsWith('FLEET_CONSOLE_REAPER_ENABLED=on is set in the correct fleet host environment configuration')) {
    return c + ' -- DONE: set in C:\\Users\\rickf\\Projects\\_EHG\\EHG_Engineer\\.env with a dated comment recording the chairman-authorization provenance (2026-07-27 override, already on record in console-reaper.mjs), matching the existing FLEET_SPAWN_CONTROL_LIVE/FLEET_CANARY_KILL_ENABLED documentation convention in that file.';
  }
  if (c.startsWith('Parentage capture happens at process-creation time')) {
    return c + ' -- DEFERRED to SD-LEO-INFRA-CONSOLE-REAPER-CREATION-001: investigation confirmed the leak source is UNGOVERNED (zero fleet_verb_spawn events on the leaked consoles), which rules out a spawner-side hook and requires a genuinely new always-on WMI event-subscription daemon -- out of scope for a code-level sub-bullet of this FR.';
  }
  if (c.startsWith('A fixture test proves parentageFor()')) {
    return c + ' -- DEFERRED alongside the mechanism itself to SD-LEO-INFRA-CONSOLE-REAPER-CREATION-001; the existing scan-time parentageFor() is unchanged and its current behavior (and the current gap) is accurately described by this SD\'s own investigation, which is now that follow-up SD\'s starting evidence.';
  }
  if (c.startsWith('Rollback is proven, not just forward activation')) {
    return c + ' -- PARTIALLY DONE: buildQueryArgs/buildRemoveArgs (the argv-construction half) are now directly unit-tested (console-reaper-task-registration.test.js). The LIVE round-trip (register, confirm FOUND, unregister, confirm NOT FOUND) requires the same elevated access as initial registration -- to be performed together by whoever completes the registration.';
  }
  if (c.startsWith('Mutation-verified like the other FRs: removing the creation-time capture hook')) {
    return c + ' -- the creation-time-capture half is deferred (see above), so this mutation-verification moves with it to SD-LEO-INFRA-CONSOLE-REAPER-CREATION-001. The enable-flag/unregister-inertness half is already covered: both runReaperOnce and reapEmptyConsoles independently gate on FLEET_CONSOLE_REAPER_ENABLED and are tested refusing when unset (console-reaper.test.js, run-console-reaper.test.js).';
  }
  return c;
});

const { error: updErr } = await supabase
  .from('product_requirements_v2')
  .update({ functional_requirements: frs })
  .eq('sd_id', SD_ID);
if (updErr) { console.error('PRD update failed', updErr); process.exit(1); }
console.log('FR-2 EXEC-phase disposition recorded: creation-time capture escalated to SD-LEO-INFRA-CONSOLE-REAPER-CREATION-001; task registration blocked on admin privilege (signaled); flag activation + rollback-argv testing done.');
