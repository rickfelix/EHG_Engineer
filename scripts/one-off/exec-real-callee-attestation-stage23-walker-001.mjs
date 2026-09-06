#!/usr/bin/env node
// EXEC-TO-PLAN REAL_CALLEE_ATTESTATION (advisory, required:false) for
// SD-LEO-INFRA-STAGE23-WALKER-ELEVEN-OVERRIDES-001. Names, for each changed call into a foreign
// module (the deployed rickfelix/altifyai app), what actually exercises it.
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

  const real_callee_attestation = [
    'FR-1/2/3/8/9/11 (list, multi-upload, batch-generate, CSV/JSON export, keywords): the REAL rendered surface of the deployed altifyai app (https://altifyai.rickfelix2000.workers.dev) via buildStepExecutor -- exercised live in scripts/one-off/verify-eleven-overrides-live-stage23-001.mjs, evidence a78817a8-c446-4efe-8769-d48ebb7abd97; no mock/stub of the app or of getVentureRegistration anywhere in these paths.',
    'FR-6 (delete): the REAL 2-step confirm-before-destroy UI on /images, verified against the source of truth (rickfelix/altifyai ImageListPage.jsx) and exercised live -- opens the real confirm dialog, clicks the real Cancel, never a fabricated/mocked click target.',
    'FR-4/5/7/10 (edit/copy/approve/suggestions): the REAL altifyaiGenerateAltText helper (already production code, shared with stp-e3e6/stp-6219) driving the REAL /generate upload+poll flow against the REAL backend; the REAL callee (navigator.clipboard.writeText via handleCopy) is what FR-5 exercises after the EXEC-TO-PLAN SECURITY-driven grantPermissions fix -- confirmed via source read of rickfelix/altifyai AltTextDisplay.jsx, not assumed.',
    'FR-12 (completeness check): the REAL lib/eva/lifecycle-sd-bridge.js fetchCurrentJourneyArtifact + lib/eva/bridge/orchestrator-journey-steps.js deriveJourneySteps (already-shipped production functions, reused not reimplemented) reading the REAL live venture_artifacts row, and the REAL getVentureRegistration(\'ALTIFYAI\') registry -- run live, npm run altifyai:registry-completeness-check, exit 0, 14/14.',
    'FR-13 (walk re-run): the REAL runVentureJourneyWalk library function (lib/apa/journey-walk-orchestrator.js), invoked directly against the REAL deployed app -- executed live twice (runs e5714c33, 8fd20429), both producing a real, measured, non-fabricated 14.3% pass rate broken at the real stp-e3e6 defect.',
    'None of the 11 new overrides, the completeness-check script, or the walk-rerun script mock, stub, or dependency-inject a fake for buildStepExecutor, getVentureRegistration, the Playwright browser, or the deployed app -- every claim above is a live, network-reaching execution, not a unit-test double.',
  ];

  const metadata = { ...current.metadata, real_callee_attestation };

  const { error: updErr } = await supabase
    .from('strategic_directives_v2')
    .update({ metadata })
    .eq('sd_key', SD_KEY);
  if (updErr) { console.error('❌ Update failed:', updErr.message); process.exit(1); }

  console.log('✅ real_callee_attestation set.');
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
