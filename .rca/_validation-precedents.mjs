import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import fs from 'node:fs';

const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY);

const keys = [
  'SD-LEO-INFRA-UNIFY-VENTURE-NON-001',
  'SD-CRONGENIUS-LEO-INFRA-MAKE-HEAL-VISION-001',
  'SD-LEO-INFRA-ORCH-PARENT-LIFECYCLE-001'
];

console.log('=== PRECEDENT SDs ===');
for (const k of keys) {
  const { data, error } = await sb.from('strategic_directives_v2').select('sd_key, status, sd_type, lead_score').eq('sd_key', k).maybeSingle();
  if (data) {
    console.log(`${k} -> status=${data.status} type=${data.sd_type} lead_score=${data.lead_score}`);
  } else {
    console.log(`${k} -> ${error ? error.message : 'NOT FOUND'}`);
  }
}

console.log('\n=== eva_cascade_errors TABLE ===');
const { error: terr } = await sb.from('eva_cascade_errors').select('*').limit(1);
console.log(terr ? `MISSING (expected): ${terr.message}` : 'EXISTS (already provisioned)');

console.log('\n=== Search scripts/eva for watcher/cascade files ===');
const files = fs.readdirSync('scripts/eva').filter(f => /watch|cascade/i.test(f));
console.log('Matches:', files.length ? files : 'none (greenfield)');

console.log('\n=== F3 hardcode check at scripts/create-orchestrator-from-plan.js ===');
const c = fs.readFileSync('scripts/create-orchestrator-from-plan.js', 'utf8');
const lines = c.split('\n');
console.log('Total lines:', lines.length);
console.log('Line 316:', JSON.stringify(lines[315]?.trim()));
console.log('Line 427:', JSON.stringify(lines[426]?.trim()));
const matches = [];
lines.forEach((l, i) => { if (l.includes("'EHG_Engineer'") || l.includes('"EHG_Engineer"')) matches.push({ line: i + 1, text: l.trim() }); });
console.log('EHG_Engineer string-literal hardcodes:', JSON.stringify(matches, null, 2));

console.log('\n=== Refusal-gate precedent ===');
const lifeBridge = fs.readFileSync('lib/eva/lifecycle-sd-bridge.js', 'utf8');
const lifeLines = lifeBridge.split('\n');
const assertIdx = lifeLines.findIndex(l => l.includes('assertVentureVisionReady'));
console.log('assertVentureVisionReady defined at line:', assertIdx + 1);

console.log('\n=== VISION-CRONGENIUS-API-L2-001 live signal ===');
const { data: v } = await sb.from('eva_vision_documents').select('level, status, chairman_approved, venture_id, created_by').eq('vision_key', 'VISION-CRONGENIUS-API-L2-001').maybeSingle();
console.log(v ? JSON.stringify(v, null, 2) : 'NOT FOUND');

console.log('\n=== ARCH-CRONGENIUS-001 downstream check ===');
const { data: arch } = await sb.from('eva_arch_plans').select('plan_key, status, chairman_approved, vision_key').eq('plan_key', 'ARCH-CRONGENIUS-001').maybeSingle();
console.log(arch ? JSON.stringify(arch, null, 2) : 'NOT FOUND or table missing');

console.log('\n=== SD-CRONGENIUS orchestrator (manual artifact) ===');
const { data: orchSD } = await sb.from('strategic_directives_v2').select('sd_key, sd_type, status, target_application').eq('sd_key', 'SD-CRONGENIUS-M1-LAUNCH-ORCHESTRATOR-ORCH-001').maybeSingle();
console.log(orchSD ? JSON.stringify(orchSD, null, 2) : 'NOT FOUND');
