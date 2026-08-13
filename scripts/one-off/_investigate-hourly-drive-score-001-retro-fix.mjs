#!/usr/bin/env node
/**
 * Read-only investigation for the PLAN-TO-LEAD precheck remediation on
 * SD-LEO-INFRA-HOURLY-DRIVE-SCORE-001: gathers SD row, existing retrospective(s),
 * existing sub_agent_execution_results rows (to find the actual repo_path/phase
 * convention used by TESTING/SECURITY/VALIDATION/REGRESSION in THIS SD), handoff
 * history (for the freshness anchor), and live retro_type / RETRO-phase
 * distributions (ground truth for the constraint + phasing convention).
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

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-HOURLY-DRIVE-SCORE-001';

async function main() {
  const { data: sd, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, status, current_phase, target_application, created_at')
    .eq('sd_key', SD_KEY)
    .single();
  if (sdErr) { console.error('SD_ERROR', sdErr); process.exit(1); }
  console.log('=== SD ===');
  console.log(JSON.stringify(sd, null, 2));

  const SD_ID = sd.id;

  if (sd.target_application) {
    const { data: app } = await supabase
      .from('applications')
      .select('name, local_path')
      .eq('name', sd.target_application)
      .maybeSingle();
    console.log('=== APPLICATION ===');
    console.log(JSON.stringify(app, null, 2));
  }

  const { data: retros, error: retroErr } = await supabase
    .from('retrospectives')
    .select('*')
    .eq('sd_id', SD_ID)
    .order('created_at', { ascending: true });
  if (retroErr) console.error('RETRO_ERROR', retroErr);
  console.log('=== RETROSPECTIVES (count=' + (retros?.length || 0) + ') ===');
  for (const r of (retros || [])) {
    console.log(`--- id=${r.id} retro_type=${r.retro_type} retrospective_type=${r.retrospective_type} status=${r.status} quality_score=${r.quality_score} created_at=${r.created_at} ---`);
  }
  fs.writeFileSync(path.join(process.cwd(), '.artifacts', 'hourly-drive-score-retros-full.json'), JSON.stringify(retros, null, 2));

  const { data: subRows, error: subErr } = await supabase
    .from('sub_agent_execution_results')
    .select('id, sub_agent_code, verdict, confidence, phase, created_at, metadata, source, validation_mode')
    .eq('sd_id', SD_ID)
    .order('created_at', { ascending: true });
  if (subErr) console.error('SUB_ERROR', subErr);
  console.log('=== SUB_AGENT_EXECUTION_RESULTS (count=' + (subRows?.length || 0) + ') ===');
  for (const r of (subRows || [])) {
    console.log(`--- id=${r.id} code=${r.sub_agent_code} verdict=${r.verdict} phase=${r.phase} created_at=${r.created_at} repo_path=${r.metadata?.repo_path} executed_from_cwd=${r.metadata?.executed_from_cwd} source=${r.source} validation_mode=${r.validation_mode} ---`);
  }

  const { data: handoffs, error: hoErr } = await supabase
    .from('sd_phase_handoffs')
    .select('id, handoff_type, from_phase, to_phase, status, created_at, accepted_at')
    .eq('sd_id', SD_ID)
    .order('created_at', { ascending: true });
  if (hoErr) console.error('HANDOFF_ERROR', hoErr);
  console.log('=== SD_PHASE_HANDOFFS (count=' + (handoffs?.length || 0) + ') ===');
  for (const h of (handoffs || [])) {
    console.log(`--- id=${h.id} type=${h.handoff_type} ${h.from_phase}->${h.to_phase} status=${h.status} created_at=${h.created_at} accepted_at=${h.accepted_at} ---`);
  }

  const { data: retroTypeSample, error: rtErr } = await supabase
    .from('retrospectives')
    .select('retro_type')
    .not('retro_type', 'is', null)
    .limit(10000);
  if (!rtErr) {
    const counts = {};
    for (const r of retroTypeSample) counts[r.retro_type] = (counts[r.retro_type] || 0) + 1;
    console.log('=== retro_type distribution (sample up to 10000) ===');
    console.log(JSON.stringify(counts, null, 2));
  } else {
    console.error('RETRO_TYPE_SAMPLE_ERROR', rtErr);
  }

  const { count: sdCompletionNullCount, error: cErr } = await supabase
    .from('retrospectives')
    .select('id', { count: 'exact', head: true })
    .eq('retro_type', 'SD_COMPLETION')
    .is('retrospective_type', null);
  console.log('=== SD_COMPLETION + retrospective_type IS NULL count ===', sdCompletionNullCount, cErr || '');

  const { data: retroSubRows, error: retroSubErr } = await supabase
    .from('sub_agent_execution_results')
    .select('phase, created_at')
    .eq('sub_agent_code', 'RETRO')
    .order('created_at', { ascending: false })
    .limit(300);
  if (!retroSubErr) {
    const counts = {};
    for (const r of retroSubRows) counts[r.phase] = (counts[r.phase] || 0) + 1;
    console.log('=== RETRO sub_agent_code phase distribution (most recent 300 rows) ===');
    console.log(JSON.stringify(counts, null, 2));
  } else {
    console.error('RETRO_SUB_ROWS_ERROR', retroSubErr);
  }

  console.log('DONE');
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
