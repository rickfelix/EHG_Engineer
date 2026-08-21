#!/usr/bin/env node
/**
 * Enrich SD-LEO-INFRA-CONSOLE-REAPER-CREATION-001 -- discovered mid-EXEC while implementing FR-2
 * of SD-LEO-INFRA-FLEET-SESSION-LIFECYCLE-001. The auto-generated description was 9 words; this
 * fills in the actual finding and rationale for why this needs its own LEAD->PLAN->EXEC cycle
 * rather than being a sub-bullet of FR-2.
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

const SD_KEY = 'SD-LEO-INFRA-CONSOLE-REAPER-CREATION-001';

const description = 'The console reaper (lib/fleet/console-reaper.mjs, scripts/run-console-reaper.mjs, activated via SD-LEO-INFRA-FLEET-SESSION-LIFECYCLE-001 FR-2) currently resolves parentage of a leaked OpenConsole.exe process from whatever process snapshot its PERIODIC scan happens to hold -- scan interval defaults to 30 minutes. lib/fleet/console-parentage.mjs\'s own header states the true creator is "STILL UNIDENTIFIED" and that "by the time anyone looks, the parent has usually exited" -- confirmed by chairman-directed measurement (149 consoles observed). CRITICALLY: the SAME header states the leaked consoles accumulate "with ZERO fleet_verb_spawn events" -- i.e. the leak source is UNGOVERNED, not spawn-control.js\'s own wt.exe-launching spawn() calls. That rules out a spawner-side hook as a fix (it would only ever see governed spawns, which the evidence says are not the ones leaking) -- the ONLY mechanism that can attribute an ungoverned console creation is a system-level, always-watching observer: a WMI Win32_ProcessStartTrace event subscription (or equivalent OS process-creation event API), capturing {consolePid, parentPid, parentImage, parentCommandLine, grandparentPid, grandparentImage} the INSTANT each OpenConsole.exe process is created, before its true parent has any chance to exit. This is genuinely new infrastructure: a persistent, always-on listener process (not a periodic scan), its own resilience/restart story (a registered scheduled task analogous to LEO-LivenessWatcher/LEO-EvaWatcher so a crashed listener self-heals), and testing that does not rely on live WMI events (an injectable event-source seam so the subscription-vs-decision logic is unit-testable, with a SEPARATE live-drill verification once built, mirroring reboot-respawn-drill-runner.js\'s pattern for its own hard-to-unit-test mechanism). Existing, REUSABLE primitives: lib/fleet/console-parentage.mjs\'s buildParentageRecord/persistParentageRecords are already timing-agnostic pure functions -- this SD feeds them from a new event source, it does not replace them.';

const successCriteria = [
  { criterion: 'A newly-created OpenConsole.exe process has a parentage record written to .claude/console-parentage.jsonl within seconds of creation, not only on the next periodic reaper scan', measure: 'measured against a real or simulated process-start event, end to end' },
  { criterion: 'Parentage is captured correctly even for an UNGOVERNED console creation (not originating from spawn-control.js\'s spawn())', measure: 'a fixture/drill proves attribution without any fleet_verb_spawn event present' },
  { criterion: 'The listener mechanism has its own crash-recovery story (a scheduled task or equivalent that relaunches it if it dies), matching the LEO-LivenessWatcher/LEO-EvaWatcher precedent', measure: 'a kill-and-confirm-respawn drill, or documented equivalent for the chosen mechanism' },
];

const keyChanges = [
  { change: 'A new WMI Win32_ProcessStartTrace subscription (or equivalent) listener, independent of the periodic reaper scan', impact: 'closes the actual measured gap: parentage lost because the parent exits before the next scan' },
  { change: 'Reuses lib/fleet/console-parentage.mjs\'s buildParentageRecord/persistParentageRecords unchanged', impact: 'no duplicate record-shaping/persistence logic; the periodic reaper\'s own parentageFor stays as a fallback/secondary observation' },
  { change: 'A registered resilience mechanism (scheduled task or service) for the listener itself', impact: 'a dead listener silently re-creates today\'s gap; this SD is incomplete without it' },
];

const { error } = await supabase
  .from('strategic_directives_v2')
  .update({
    description,
    success_criteria: successCriteria,
    key_changes: keyChanges,
    metadata: {
      discovered_during: 'SD-LEO-INFRA-FLEET-SESSION-LIFECYCLE-001 FR-2 EXEC phase, 2026-08-21',
      escalation_reason: 'vision-readiness rubric scored 7/20 (Quick Fix recommended) based on a shallow LOC estimate; the actual scope is a new always-on daemon with lifecycle/resilience concerns, overridden to full SD per the same judgment pattern used for QF-20260729-621 earlier in the originating session',
      related_sd: 'SD-LEO-INFRA-FLEET-SESSION-LIFECYCLE-001',
    },
  })
  .eq('sd_key', SD_KEY);
if (error) { console.error('SD enrichment failed', error); process.exit(1); }
console.log(`${SD_KEY} enriched with the full finding and rationale.`);
