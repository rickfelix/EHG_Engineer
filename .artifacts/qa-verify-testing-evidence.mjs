import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

// Deliberately a FRESH client — do not reuse anything from the write path.
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ROW_ID = 'cdee9771-f8cf-4bc2-99d8-68d486bab808';
const SD_UUID = '7b8be04e-1f2b-431c-b33d-4574013a94e5';
const PHASE_START = '2026-08-19T16:04:55.161739Z'; // EXEC accepted_at

const { data: row, error } = await s
  .from('sub_agent_execution_results')
  .select('id, sd_id, sub_agent_code, phase, verdict, confidence, created_at, source, metadata')
  .eq('id', ROW_ID)
  .single();

if (error) { console.log('READ-BACK FAILED:', error.message); process.exit(1); }

console.log('=== READ-BACK (independent query by id) ===');
console.log('  id           :', row.id);
console.log('  sd_id        :', row.sd_id, row.sd_id === SD_UUID ? '(matches canonical id)' : '(MISMATCH)');
console.log('  sub_agent    :', row.sub_agent_code);
console.log('  phase        :', row.phase);
console.log('  verdict      :', row.verdict);
console.log('  confidence   :', row.confidence);
console.log('  source       :', row.source);
console.log('  created_at   :', row.created_at);
console.log('  repo_path    :', row.metadata?.repo_path);
console.log('  executed_cwd :', row.metadata?.executed_from_cwd);
console.log('  eval_sha     :', row.metadata?.evaluated_commit_sha);
console.log('  payload keys :', Object.keys(row.metadata || {}).join(', '));
console.log('  targeted     :', JSON.stringify(row.metadata?.targeted_suite && {
  files: row.metadata.targeted_suite.files,
  passed: row.metadata.targeted_suite.tests_passed,
  failed: row.metadata.targeted_suite.tests_failed
}));
console.log('  mutations    :', (row.metadata?.mutation_tests || []).length);

const ageHours = (Date.now() - new Date(row.created_at)) / 3600000;
console.log('\n=== GATE SIMULATION ===');
console.log('MANDATORY_TESTING_VALIDATION (no phase filter; newest TESTING row for sd_id):');
console.log('  age_hours    :', ageHours.toFixed(2), '(max 24)');
console.log('  fresh?       :', ageHours <= 24 ? 'YES' : 'NO');
console.log('  verdict ok?  :', ['PASS', 'CONDITIONAL_PASS'].includes(row.verdict) ? 'YES' : 'NO');

// Confirm THIS row is the one the gate would select (order created_at desc, limit 1)
const { data: newest } = await s
  .from('sub_agent_execution_results')
  .select('id, verdict, created_at')
  .eq('sd_id', SD_UUID)
  .eq('sub_agent_code', 'TESTING')
  .order('created_at', { ascending: false })
  .limit(1);
console.log('  gate picks   :', newest?.[0]?.id, newest?.[0]?.id === ROW_ID ? '=> THIS ROW' : '=> DIFFERENT ROW');

// Evidence gate: rows for sd_id with created_at >= phase start, required TESTING + SECURITY
const { data: ev } = await s
  .from('sub_agent_execution_results')
  .select('sub_agent_code, verdict, created_at')
  .eq('sd_id', SD_UUID)
  .gte('created_at', PHASE_START);
console.log('\nGATE_SUBAGENT_EVIDENCE (sd_id + created_at >= EXEC phase start ' + PHASE_START + '):');
const present = {};
for (const r of ev || []) {
  const k = r.sub_agent_code.toUpperCase().replace(/-AGENT$/, '');
  if (!present[k] || r.created_at > present[k].created_at) present[k] = r;
}
for (const need of ['TESTING', 'SECURITY']) {
  const got = present[need];
  console.log('  ' + need.padEnd(9) + ':', got ? `${got.verdict} @ ${got.created_at}` : 'MISSING -> gate still blocks');
}
console.log('  all in-window rows:', (ev || []).map(r => r.sub_agent_code).join(', ') || '(none)');
