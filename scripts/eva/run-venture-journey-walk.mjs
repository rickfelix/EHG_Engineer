#!/usr/bin/env node
/**
 * WORK_ASSIGNMENT 46b45e59-4b7a-48bc-a7ca-d12aa720134e: run the FULL AltifyAI S23 journey
 * walk (with the email leg). Thin CLI wrapper around runVentureJourneyWalk
 * (lib/apa/journey-walk-orchestrator.js) — wires the exact params named in the assignment
 * payload and prints the resulting run ids for /signal reporting. Never improvises the walk.
 */
import 'dotenv/config';
import { runVentureJourneyWalk } from '../../lib/apa/journey-walk-orchestrator.js';
import { fetchCurrentJourneyArtifact } from '../../lib/eva/lifecycle-sd-bridge.js';
import { deriveJourneySteps } from '../../lib/eva/bridge/orchestrator-journey-steps.js';
import { createSupabaseServiceClient } from '../lib/supabase-connection.js';

const params = {
  sdId: 'SD-ALTIFYAI-LEO-ORCH-SPRINT-2026-002',
  ventureId: '50763b6a-1fad-4e1e-b2fc-296a1d66ebf9',
  stageNumber: 23,
  ventureKey: 'ALTIFYAI',
  baseUrl: 'https://altifyai.rickfelix2000.workers.dev',
};

const supabase = await createSupabaseServiceClient('engineer', { verbose: false });
const journeyArtifactContent = await fetchCurrentJourneyArtifact(supabase, params.ventureId);
const journeySteps = deriveJourneySteps(journeyArtifactContent);

if (!journeySteps) {
  console.error('JOURNEY_WALK_ABORT: no journey_steps derivable from the current blueprint_user_journey artifact for this venture.');
  process.exit(1);
}

const result = await runVentureJourneyWalk({ ...params, journeySteps, persona: {} });
console.log(JSON.stringify(result, null, 2));
