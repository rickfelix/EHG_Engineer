#!/usr/bin/env node
// Second correction pass on SD-LEO-INFRA-FLEET-DOWN-ALERT-001, after the LEAD-phase VALIDATION
// sub-agent (sub_agent_execution_results 826bb1f9-c25b-4931-a94f-804ff34ea45f, CONDITIONAL_PASS/90)
// found 6 residual issues in the first correction pass:
//   F1 (blocking): implementation_guidelines still carried the debunked false premise verbatim.
//   F2: FREEZE_CUT_MINUTES is a 3-site shared constant (pager, drive-state fleet-health axis,
//       fleet-dashboard) -- FR-1 must recalibrate the shared constant, not one call site alone.
//   F3: Solomon's GROUP-BY-HOST constraint literally names "the dead-man predicate" --
//       checkFleetDeadMan -- not the separate freeze chain. FR-2 must target checkFleetDeadMan.
//   F4: checkFleetDeadMan's real semantics are heartbeat-writer/host death (rows persist, 13,110 of
//       them) -- not "total row absence" as FR-4 wrongly said.
//   F5: scope_reduction_percentage=45 is fair as "% of original ask withdrawn", not as "less net
//       effort" (4 FRs now vs 3, FR-2 grew) -- annotate, don't just leave unexplained.
//   F6: predecessor_sd_key should also cite SD-LEO-INFRA-FLEET-DOWN-PAGER-001 (the SD that actually
//       wired last_tool_at into active_count; SD-FDBK-INFRA-STUCK-SEAT-DETECTION-001 only shipped the
//       underlying classifySeat primitive -- both are real predecessors, for different reasons).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_ID = 'c7b9020f-d7ee-4b27-b395-272c69f0a1a1';

const implementation_guidelines = [
  `FR-1: recalibrate the SHARED FREEZE_CUT_MINUTES constant (lib/fleet/genuine-worker.mjs) -- it is read at 3 sites (scripts/fleet-worker-pulse.mjs / pager, lib/governance/drive-state/axes/fleet-health.cjs, scripts/fleet-dashboard.cjs) and changing only one would let the same seat read STUCK to the pager but HEALTHY to the drive-axis/dashboard. Do NOT re-key signal selection -- last_tool_at is already the correct discriminator (SD-FDBK-INFRA-STUCK-SEAT-DETECTION-001 shipped classifySeat; SD-LEO-INFRA-FLEET-DOWN-PAGER-001 wired it into active_count). Corroborate the LEAD-phase false-positive sample (n=33) with a larger one before locking a specific number.`,
  `FR-2: add hostname GROUP BY specifically to checkFleetDeadMan (scripts/fleet-down-alert.mjs) -- the Solomon BINDING constraint literally names "the dead-man predicate", not the separate freeze/pager chain. Exclude ephemeral runnervm* Actions hosts, test-fixture hosts, and NULL hostnames (12 distinct hostnames measured, only Legion-Laptop live). Fix recordFleetDeadManVerdict's global .limit(1) read to scope by host, matching a host-scoped write. Also verify fetchPulseSessions's separate .limit(60) (fleet-worker-pulse.mjs) is not silently truncating a quiet-dead host out of the pager chain's own result set once any per-host reasoning touches it.`,
  `FR-3: a regression-latency test replaying the real 19:20-19:29Z 5-seat freeze shape against the actual liveFleetWorkers -> active_count -> evaluateFleetDownAlert chain, asserting the OLD ~166-181min page latency and the NEW recalibrated latency -- extending tests/unit/fleet/fleet-down-pager-freeze-reachability.test.js's existing projecting-fake pattern (its 25 tests are all reachability-shaped; zero currently assert elapsed-time-to-page).`,
  `FR-4: document checkFleetDeadMan's actual complementary role correctly -- it is a heartbeat-writer/host-death signal (rows persist; 13,110 of them), not a "total row absence" detector. A frozen-but-heartbeating seat keeps checkFleetDeadMan reading alive regardless of last_tool_at, which is exactly why it is a distinct, still-useful arm alongside the freeze chain -- not because rows vanish.`,
];

const predecessor_note = `Predecessors: SD-FDBK-INFRA-STUCK-SEAT-DETECTION-001 (shipped the classifySeat last_tool_at primitive) AND SD-LEO-INFRA-FLEET-DOWN-PAGER-001 (actually wired it into fleet_worker_pulse.active_count -- its own title was verbatim this SD's original, since-corrected false premise; its acceptance criterion was reachability ["an all-frozen fleet eventually pages"], never a latency target, which is the residual gap this SD closes) AND SD-LEO-INFRA-FLEET-DEAD-MAN-001 (shipped checkFleetDeadMan with the still-unaddressed GROUP-BY-HOST constraint this SD's FR-2 ships).`;

async function main() {
  const { data: before, error: beforeErr } = await supabase
    .from('strategic_directives_v2')
    .select('metadata, scope')
    .eq('id', SD_ID)
    .single();
  if (beforeErr) { console.error('Pre-read failed:', beforeErr.message); process.exit(1); }

  const metadata = {
    ...(before.metadata || {}),
    predecessor_sd_key: 'SD-LEO-INFRA-FLEET-DEAD-MAN-001, SD-LEO-INFRA-FLEET-DOWN-PAGER-001, SD-FDBK-INFRA-STUCK-SEAT-DETECTION-001',
    lead_scope_correction_v2: {
      corrected_at: new Date().toISOString(),
      validation_agent_evidence_id: '826bb1f9-c25b-4931-a94f-804ff34ea45f',
      findings_addressed: ['F1-implementation_guidelines-rewritten', 'F2-3-site-constant-noted-in-FR1', 'F3-FR2-retargeted-to-checkFleetDeadMan', 'F4-FR4-wording-corrected', 'F5-scope_reduction-annotated-below', 'F6-predecessor_sd_key-corrected'],
      f5_note: 'scope_reduction_percentage=45 measures % of the ORIGINAL incident-driven ask withdrawn (re-implementing signal selection, a full off-host reachability system), not net implementation effort -- the corrected scope actually has 4 FRs vs the original 3, and FR-2 grew after the host-cardinality/dedup findings. Both things are true at once: a smaller, more correct ask that is not smaller in total line-count.',
    },
  };

  // metadata.plan_content is the original --from-plan archive; leave it as a historical artifact
  // (it IS what the human/coordinator actually wrote), but flag it so a future reader does not
  // mistake it for current guidance.
  metadata.plan_content_superseded_note = 'This plan_content reflects the ORIGINAL incident-driven premise, since corrected (see lead_scope_correction / lead_scope_correction_v2 in this same metadata object, and the current title/description/scope/implementation_guidelines fields). Do not treat plan_content as current FR guidance.';

  const scope = before.scope + '\n\n' + predecessor_note + ' FR-2 targets checkFleetDeadMan specifically (not the separate freeze/pager chain) per the Solomon constraint\'s literal text.';

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .update({ implementation_guidelines, metadata, scope })
    .eq('id', SD_ID)
    .select('id, sd_key')
    .single();
  if (error) { console.error('UPDATE FAILED:', error.message); process.exit(1); }
  console.log('Second correction applied:', JSON.stringify(data, null, 2));
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
