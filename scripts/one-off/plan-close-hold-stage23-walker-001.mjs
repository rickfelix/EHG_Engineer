#!/usr/bin/env node
// PLAN-phase: SD-ALTIFYAI-LEO-FEAT-STAGE-BUILD-ELEVEN-001-E reached status=completed
// (2026-09-05T21:04:34Z), resolving the LEAD-phase EXEC hold on FR-8..FR-11. Update the
// SD's lead_decision metadata so the record reflects current reality rather than the
// now-stale "hold pending -E" framing.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-STAGE23-WALKER-ELEVEN-OVERRIDES-001';

async function main() {
  const { data: current, error: fetchErr } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('sd_key', SD_KEY)
    .single();
  if (fetchErr) { console.error('❌ Fetch failed:', fetchErr.message); process.exit(1); }

  const metadata = {
    ...current.metadata,
    lead_decision: {
      ...current.metadata.lead_decision,
      hold_resolved_at: '2026-09-05T21:04:34.698+00:00',
      hold_resolution_note: 'SD-ALTIFYAI-LEO-FEAT-STAGE-BUILD-ELEVEN-001-E (and the parent orchestrator) reached status=completed. All 5 sibling venture SDs (A-E) are now completed, confirmed via direct DB query during PLAN-phase testing-agent review. FR-8..FR-11 and FR-13 are no longer externally gated -- all 11 override FRs are buildable now. This was caught as a stale premise by testing-agent (evidence b601e56a-9ce1-4424-9fcd-3eada68d391b, finding D8) and independently verified.',
    },
    plan_prd_correction: {
      corrected_at: new Date().toISOString(),
      driven_by: 'testing-agent PLAN_PRD review, evidence b601e56a-9ce1-4424-9fcd-3eada68d391b (verdict FAIL, 12 findings, 2 CRITICAL)',
      corrections_applied: [
        'FR-12 moved from an unworkable vitest db-project design (empty DESIGNATED_NON_PROD_REFS, informational-only CI invocation) to a hard-gating step in the existing altifyai-uat-drift-check-cron.yml',
        'FR-6 redesigned to a non-destructive, UI-reachability-proving override, resolving a fixture-ordering contradiction (TS-2/TS-3) and a destructive-action risk',
        'FR-13 corrected: no "canonical stage-23 walk runner" CLI exists; EXEC builds a one-off invocation script calling runVentureJourneyWalk directly',
        'TR-3 added: live-verification evidence artifacts must be durable and gate-readable, not a bare console.log (closes the "11 registered stubs would satisfy everything" vacuity hole)',
        'executive_summary/TR-1 arithmetic corrected: 11 new overrides (not 8) plus the 3 already registered = 14, matching the spec',
        'TS-4/TR-4 premise corrected: Playwright 1.59.1 accepts downloads by default; no live-instance-acquisition.mjs change needed',
        'FR-12 scope widened to cover all three exhaustive assertions at venture-step-executors.test.js:814/815/826, not just :815',
        'FR-12 acceptance criteria gained an allowlist-registry-disjointness check (stale allowlist entries now caught)',
      ],
    },
  };

  const { error: updErr } = await supabase
    .from('strategic_directives_v2')
    .update({ metadata })
    .eq('sd_key', SD_KEY);
  if (updErr) { console.error('❌ Update failed:', updErr.message); process.exit(1); }

  console.log('✅ SD metadata updated: hold resolution + PRD correction record.');
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
