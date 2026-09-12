// GATE_MECHANISM_CLAIM_VERIFIER fix for SD-LEO-FIX-IMPLEMENTATION-FIDELITY-GATE-001: the SD's
// description/metadata names scripts/modules/handoff/gates/fr-delivery-classifier.js's
// projectGateResult() as the mechanism to fix. This was verified by direct file reads during LEAD
// phase (not an endorsement chain) plus three independent sub-agent passes
// (VALIDATION 697cd021-6a2e-4450-ac21-651ebb574b97, RISK 2ae33bb5-309d-4a57-8c04-3022e260e98b,
// prospective TESTING 6abb244c-be82-4f79-96fc-5ec2c9a54143, plus Explore 4fda6104-96a5-41ca-803a-9ea3ad62ce16)
// each of which read the live file/line and reported an exact citation. This records those
// citations in the format the gate reads.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-FIX-IMPLEMENTATION-FIDELITY-GATE-001';

async function main() {
  const { data: sd, error: fetchErr } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('sd_key', SD_KEY)
    .single();
  if (fetchErr || !sd) {
    console.error('SD_FETCH_FAILED', fetchErr);
    process.exit(1);
  }

  const metadata = {
    ...sd.metadata,
    mechanism_verifications: [
      {
        verified_by: 'LEAD phase direct file read + independent VALIDATION sub-agent re-verification (sub_agent_execution_results id 697cd021-6a2e-4450-ac21-651ebb574b97)',
        verified_at: 'scripts/modules/handoff/gates/fr-delivery-classifier.js:681',
        note: 'The undeliveredList aggregate warning/issue line inside projectGateResult(), confirmed as the sole unconditional occurrence of "sibling FRs are referenced" in the repo, unconditional on classification.has_work_product. Authored by commit f5183d850d1 (2026-08-01), never modified since.',
      },
      {
        verified_by: 'LEAD phase direct file read + independent prospective TESTING sub-agent re-verification (sub_agent_execution_results id 6abb244c-be82-4f79-96fc-5ec2c9a54143, empirical probe against live code)',
        verified_at: 'scripts/modules/handoff/gates/fr-delivery-classifier.js:408',
        note: 'classifyFrDelivery() confirmed: has_work_product is computed once SD-wide (line ~548) from validated.length>0 || matchedTestingCoverage.length>0, and the per-FR evidence text (line ~587-589) already branches on it correctly -- only the aggregate at :681 does not.',
      },
      {
        verified_by: 'Independent RISK sub-agent direct grep/read (sub_agent_execution_results id 2ae33bb5-309d-4a57-8c04-3022e260e98b)',
        verified_at: 'scripts/modules/handoff/executors/lead-final-approval/gates.js:1571',
        note: 'Second live caller of projectGateResult() (FR_DELIVERY_VERIFICATION at LEAD-FINAL-APPROVAL) -- confirmed the fix in the shared function lands on this gate too, not only FR_DELIVERY_TRACEABILITY.',
      },
      {
        verified_by: 'LEAD phase direct file read (Explore sub-agent evidence id 4fda6104-96a5-41ca-803a-9ea3ad62ce16)',
        verified_at: 'scripts/modules/implementation-fidelity/preflight/index.js:336',
        note: 'checkAmbiguityResolution() confirmed to scan git-diff ADDED lines via `git show`, never PRD text -- the QF\'s original Defect 1 claim is not reproducible against current code; the real bug it evidenced was already fixed under SD-LEO-FIX-GATE2-IMPLEMENTATION-FIDELITY-001 (merged 2026-09-05). No code change needed for this half.',
      },
    ],
  };

  const { error: updateErr } = await supabase
    .from('strategic_directives_v2')
    .update({ metadata })
    .eq('sd_key', SD_KEY);
  if (updateErr) {
    console.error('SD_UPDATE_FAILED', updateErr);
    process.exit(1);
  }
  console.log('OK: mechanism_verifications recorded for', SD_KEY);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
