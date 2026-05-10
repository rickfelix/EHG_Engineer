import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

console.log('--- A. Introducer SD by sd_key only ---');
const { data: intro } = await sb.from('strategic_directives_v2')
  .select('id, sd_key, title, status, current_phase, completed_at, created_at')
  .eq('sd_key', 'SD-FDBK-INFRA-EXEC-CONTEXT-GUARD-001');
console.log(JSON.stringify(intro || [], null, 2));

console.log('\n--- B. Witness SD by sd_key only ---');
const { data: wit } = await sb.from('strategic_directives_v2')
  .select('id, sd_key, title, status, current_phase, progress, completed_at, updated_at')
  .eq('sd_key', 'SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-001');
console.log(JSON.stringify(wit || [], null, 2));

console.log('\n--- C. Direct repro: assertSweepHandoffGate("SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-001", "LEAD") ---');
import('../../lib/exec-context-guard.mjs').then(async ({ assertSweepHandoffGate }) => {
  try {
    const result = await assertSweepHandoffGate(sb, 'SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-001', 'LEAD');
    console.log('Returned:', JSON.stringify(result));
  } catch (e) {
    console.log(`Threw: name=${e.name} code=${e.code} message=${e.message}`);
  }
}).catch(e => console.log('Import error:', e.message));

await new Promise(r => setTimeout(r, 1000));

console.log('\n--- D. Direct repro by UUID ---');
import('../../lib/exec-context-guard.mjs').then(async ({ assertSweepHandoffGate }) => {
  try {
    const result = await assertSweepHandoffGate(sb, '2a017ba5-ad88-4746-b2a8-0a8016c13835', 'LEAD');
    console.log('Returned:', JSON.stringify(result));
  } catch (e) {
    console.log(`Threw: name=${e.name} code=${e.code} message=${e.message}`);
  }
}).catch(e => console.log('Import error:', e.message));

await new Promise(r => setTimeout(r, 1000));

console.log('\n--- E. Quick_fixes table column probe ---');
const { data: qf1, error: qf1Err } = await sb.from('quick_fixes').select('id, title, status, created_at').limit(3).order('created_at', { ascending: false });
if (qf1Err) console.log('QF err:', qf1Err.message);
else for (const q of (qf1||[])) console.log(`  ${q.id?.slice(0,8)} [${q.status}] ${q.title}`);

console.log('\n--- F. QF search by title (no qf_key) ---');
const { data: qf2 } = await sb.from('quick_fixes')
  .select('id, title, status, created_at')
  .or('title.ilike.%exec-context-guard%,title.ilike.%assertSweepHandoffGate%,title.ilike.%sd_phase_handoffs%,title.ilike.%sd_key%')
  .order('created_at', { ascending: false });
console.log(`QF body-matches: ${(qf2||[]).length}`);
for (const q of (qf2||[])) console.log(`  ${q.id?.slice(0,8)} [${q.status}] ${q.title}`);
