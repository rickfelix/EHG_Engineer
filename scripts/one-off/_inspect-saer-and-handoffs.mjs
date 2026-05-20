#!/usr/bin/env node
/**
 * One-off: inspect sub_agent_execution_results column set (most recent RETRO row if any,
 * else any recent row) + list this SD's handoffs to confirm LEAD-TO-PLAN time,
 * + existing retros for this SD. For SD-ACTIVATE-SURFACEAWARE-WIREFRAME-PIPELINE-ORCH-001.
 */
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

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);
const SD_UUID = '00d9049a-a0f8-42d8-b222-22979d56f2e0';

// 1. sub_agent_execution_results: prefer a recent RETRO row to copy shape; fall back to newest row
let { data: retroRows } = await supabase
  .from('sub_agent_execution_results')
  .select('*')
  .eq('sub_agent_code', 'RETRO')
  .order('created_at', { ascending: false })
  .limit(1);

let sampleSaer = retroRows && retroRows.length ? retroRows[0] : null;
if (!sampleSaer) {
  const { data: anyRows } = await supabase
    .from('sub_agent_execution_results')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1);
  sampleSaer = anyRows && anyRows.length ? anyRows[0] : null;
}

console.log('=== sub_agent_execution_results SAMPLE (' + (retroRows && retroRows.length ? 'RETRO' : 'newest-any') + ') ===');
if (sampleSaer) {
  for (const [k, v] of Object.entries(sampleSaer)) {
    let typ = v === null ? 'null' : Array.isArray(v) ? `array[${v.length}]` : typeof v;
    let preview = v === null ? '' : (typeof v === 'object' ? JSON.stringify(v).slice(0, 120) : String(v).slice(0, 120));
    console.log(`${k.padEnd(30)} | ${typ.padEnd(11)} | ${preview}`);
  }
} else {
  console.log('NO_SAER_ROWS');
}

// 2. handoffs for this SD
console.log('\n=== sd_phase_handoffs for this SD ===');
const { data: handoffs, error: hErr } = await supabase
  .from('sd_phase_handoffs')
  .select('id, from_phase, to_phase, handoff_type, status, created_at')
  .eq('sd_id', SD_UUID)
  .order('created_at', { ascending: true });
if (hErr) console.log('handoff query error (maybe different col names):', hErr.message);
console.log(JSON.stringify(handoffs, null, 2));

// 3. existing retros for this SD
console.log('\n=== existing retrospectives for this SD ===');
const { data: existRetro } = await supabase
  .from('retrospectives')
  .select('id, retro_type, retrospective_type, status, quality_score, created_at, title')
  .eq('sd_id', SD_UUID)
  .order('created_at', { ascending: true });
console.log(JSON.stringify(existRetro, null, 2));

// 4. SD row snapshot (status/phase + a few cols)
console.log('\n=== SD row snapshot ===');
const { data: sdRow } = await supabase
  .from('strategic_directives_v2')
  .select('id, sd_key, status, current_phase, target_application, title')
  .eq('id', SD_UUID)
  .limit(1);
console.log(JSON.stringify(sdRow, null, 2));

// 5. existing RETRO evidence rows for this SD (any phase)
console.log('\n=== existing RETRO evidence rows for this SD ===');
const { data: existEvidence } = await supabase
  .from('sub_agent_execution_results')
  .select('id, sub_agent_code, verdict, phase, created_at')
  .eq('sd_id', SD_UUID)
  .eq('sub_agent_code', 'RETRO')
  .order('created_at', { ascending: true });
console.log(JSON.stringify(existEvidence, null, 2));
