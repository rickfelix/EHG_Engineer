#!/usr/bin/env node
// Coordinator-directed re-run of the AltifyAI stage-23 walk (task, not an SD claim), 2026-09-06,
// now that QF-20260905-241's TOCTOU fix (PR #8309) is on main. Acceptance predicate (c741130b):
// all 14 journeys PASS, quality_gate green, launch_uat_report row with provenance.
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
    sdId: CARRIER_SD_ID,
    ventureId: ALTIFYAI_VENTURE_ID,
    ventureKey: 'ALTIFYAI',
    baseUrl: BASE_URL,
    journeySteps,
    persona: { type: 'existing' },
  });

  console.log('=== WALK RESULT ===');
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => { console.error('FATAL', e); process.exitCode = 1; });
