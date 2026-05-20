#!/usr/bin/env node
/** One-off: verify the SD_COMPLETION retro + RETRO evidence rows are persisted & gate-recognizable. */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

(function loadEnvFromAncestors() {
  let dir = process.cwd();
  while (dir !== path.dirname(dir)) {
    const envFile = path.join(dir, '.env');
    if (fs.existsSync(envFile)) { dotenv.config({ path: envFile }); return; }
    dir = path.dirname(dir);
  }
})();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const SD_UUID = '00d9049a-a0f8-42d8-b222-22979d56f2e0';
const LEAD_TO_PLAN_TS = '2026-05-20T18:10:01.29165+00:00';

// Gate-style filter: SD_COMPLETION retro with retrospective_type IS NULL, after LEAD-TO-PLAN
const { data: gateRetro } = await supabase
  .from('retrospectives')
  .select('id, retro_type, retrospective_type, status, quality_score, created_at')
  .eq('sd_id', SD_UUID)
  .eq('retro_type', 'SD_COMPLETION')
  .is('retrospective_type', null)
  .gt('created_at', LEAD_TO_PLAN_TS)
  .order('created_at', { ascending: false });

console.log('=== GATE-FILTER MATCH (retro_type=SD_COMPLETION AND retrospective_type IS NULL AND created_at>LEAD-TO-PLAN) ===');
console.log(JSON.stringify(gateRetro, null, 2));
console.log('GATE_RECOGNIZABLE_ROWS=' + (gateRetro ? gateRetro.length : 0));

// RETRO evidence freshness for PLAN_VERIFICATION
const { data: evid } = await supabase
  .from('sub_agent_execution_results')
  .select('id, sub_agent_code, verdict, confidence, phase, validation_mode, source, created_at, metadata')
  .eq('sd_id', SD_UUID)
  .eq('sub_agent_code', 'RETRO')
  .order('created_at', { ascending: false });

console.log('\n=== RETRO EVIDENCE ROWS for this SD ===');
console.log(JSON.stringify(evid, null, 2));

const linked = evid && evid.length && gateRetro && gateRetro.length &&
  evid[0].metadata && evid[0].metadata.retrospective_id === gateRetro[0].id;
console.log('\nLINK_OK=' + !!linked +
  ' (evidence.metadata.retrospective_id ' + (evid && evid[0] && evid[0].metadata ? evid[0].metadata.retrospective_id : 'n/a') +
  ' == retro.id ' + (gateRetro && gateRetro[0] ? gateRetro[0].id : 'n/a') + ')');
