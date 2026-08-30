// QF-20260830-100 — update the coordinator_role_contract charter section for
// STANDARD_LOOPS governance to reflect the retirement of `singleton-relaunch`
// (chairman ruling A, 2026-08-30), mirroring the QF-20260830-988 addition precedent.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SECTION_ID = 635;

const NEW_CONTENT = `**The coordinator's operational heartbeat is governed, not ad hoc.** All 34 of the coordinator's session-cron loops are registered in \`scripts/coordinator-startup-check.mjs\`'s \`STANDARD_LOOPS\` array — the ONLY place a loop's cadence, GHA-backing, or session-arming status is defined. **Loop changes land in the registry, never ad hoc** — a loop added, removed, or rescheduled outside this array is invisible to the coordinator's own startup check and to \`.claude/commands/coordinator.md\`'s "arm exactly the set this script emits" instruction.

**2026-08-22 cron ruling (operator commission 60153bf2, encoded QF-20260822-510):** 7 of the 34 loops (\`sweep\`, \`unranked-gauge\`, \`relay-drop-gauge\`, \`fleet-retro\`, \`row-growth\`, \`gauge-runner\`, \`feedback-sla\`) carry \`session_arm: false\` — GHA-backed only, dropped from the session-armed set. Three GHA-backed loops (\`relay-drain\`, \`sms-relay-drain\`, \`sms-status-relay-drain\`) are a deliberate carve-out and remain session-armed. **Reversal condition** (through 2026-08-25T22:00:00Z): if any dropped loop's artifact goes stale beyond 2x its GHA cadence, re-arm it as session-owned pending re-review.

**2026-08-30 addition (QF-20260830-988):** \`sms-status-relay-drain\` was registered (\`currently_expected_active=true\` in \`periodic_process_registry\`) but had no session-armed backup, so its own GHA-deprioritised cadence produced intermittent/perpetual OVERDUE alarms — the same class already fixed for \`sms-relay-drain\`. Armed with the identical carve-out posture; the drain runner remains a fail-soft no-op until \`SMS_STATUS_RELAY_DRAIN_ENABLED\` is set at go-live cutover.

**2026-08-30 retirement (QF-20260830-100, chairman ruling A):** \`singleton-relaunch\` was RETIRED ENTIRELY (removed from STANDARD_LOOPS, not merely dropped to \`session_arm:false\`) — its trigger+scheduler logic armed real scheduling but the relaunch CONSUMER half was never built (feedback 2026-08-03 "SINGLETON RELAUNCH NET DISCONNECTED IN THE MIDDLE"); it fired 4x (08-11 x2, 08-22 x2) with ZERO relaunches and fed false periodic-liveness escalations to the chairman. \`.github/workflows/singleton-relaunch-cron.yml\`'s schedule was dropped (\`workflow_dispatch\` kept); the \`periodic_process_registry\` rows (\`gha_cron:singleton-relaunch-cron.yml\`, \`standard_loop:singleton-relaunch\`) were retired (\`currently_expected_active=false\`) so a process that will never fire again accrues no misses. The scheduler script and its lib are deliberately NOT deleted — reversible if the consumer half is ever built.

*This table is DRIFT-CHECKED (never regenerated) against the live array by \`tests/unit/coordinator/coordinator-loop-governance-drift.test.js\`, via the checked-in snapshot \`scripts/coordinator-loop-governance-snapshot.json\`. When STANDARD_LOOPS changes, update the snapshot file AND this section together.*`;

async function main() {
  const { data: pre, error: preErr } = await sb.from('leo_protocol_sections').select('id, title').eq('id', SECTION_ID);
  if (preErr) throw preErr;
  console.log(`[qf-100] pre-write target row count=${pre.length}: ${JSON.stringify(pre)}`);
  if (pre.length !== 1) throw new Error('expected exactly 1 target row, refusing to write');

  const { error: upErr } = await sb.from('leo_protocol_sections').update({ content: NEW_CONTENT }).eq('id', SECTION_ID);
  if (upErr) throw upErr;

  const { data: post, error: postErr } = await sb.from('leo_protocol_sections').select('content').eq('id', SECTION_ID).maybeSingle();
  if (postErr) throw postErr;
  if (post.content !== NEW_CONTENT) throw new Error('readback mismatch — write did not persist as expected');
  console.log('[qf-100] DONE — charter section updated and readback-verified.');
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error('[qf-100] FAILED:', e.message); process.exit(1); });
}
