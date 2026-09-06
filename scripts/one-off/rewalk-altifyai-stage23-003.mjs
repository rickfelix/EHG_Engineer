#!/usr/bin/env node
// Re-walk after QF-20260906-325 (altifyai PR #89, bounded env.AI.run() timeout, merged
// c68b6e3 and deployed) to empirically verify whether stp-e3e6 now passes with real
// generated alt text, or still fails (now fast/classified instead of ~121s uncontrolled).
import 'dotenv/config';
import { runVentureJourneyWalk } from '../../lib/apa/journey-walk-orchestrator.js';
import { fetchCurrentJourneyArtifact } from '../../lib/eva/lifecycle-sd-bridge.js';
import { deriveJourneySteps } from '../../lib/eva/bridge/orchestrator-journey-steps.js';
import { createClient } from '@supabase/supabase-js';

const ALTIFYAI_VENTURE_ID = '50763b6a-1fad-4e1e-b2fc-296a1d66ebf9';
const CARRIER_SD_ID = 'SD-LEO-INFRA-STAGE23-WALKER-ELEVEN-OVERRIDES-001';
const BASE_URL = 'https://altifyai.rickfelix2000.workers.dev';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const journeyArtifactContent = await fetchCurrentJourneyArtifact(supabase, ALTIFYAI_VENTURE_ID);
  const journeySteps = deriveJourneySteps(journeyArtifactContent);
  console.log(`Derived ${journeySteps.length} journey steps from the live artifact.`);
  const result = await runVentureJourneyWalk({
    sdId: CARRIER_SD_ID, ventureId: ALTIFYAI_VENTURE_ID, ventureKey: 'ALTIFYAI', baseUrl: BASE_URL,
    journeySteps, persona: { type: 'existing' },
  });
  console.log('=== WALK RESULT ===');
  console.log(JSON.stringify(result, null, 2));
}
main().catch((e) => { console.error('FATAL', e); process.exitCode = 1; });
