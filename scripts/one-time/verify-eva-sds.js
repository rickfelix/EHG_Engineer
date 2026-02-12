import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data: all } = await sb
    .from('strategic_directives_v2')
    .select('sd_key, sd_type, priority, parent_sd_id')
    .like('sd_key', 'SD-EVA-%')
    .order('sd_key');

  // Filter to only the 33 new SDs (ORCH or FEAT pattern)
  const newSDs = all.filter(s => /SD-EVA-(ORCH|FEAT)/.test(s.sd_key));
  console.log(`Total new EVA SDs: ${newSDs.length}`);

  const orchs = newSDs.filter(s => s.sd_type === 'orchestrator');
  console.log(`Orchestrators (${orchs.length}):`, orchs.map(o => o.sd_key).join(', '));

  const leaves = newSDs.filter(s => s.sd_type !== 'orchestrator');
  console.log(`Leaf SDs: ${leaves.length}`);

  const withParent = newSDs.filter(s => s.parent_sd_id !== null);
  console.log(`SDs with parent: ${withParent.length}`);

  const topLevel = newSDs.filter(s => s.parent_sd_id === null);
  console.log(`Top-level (no parent): ${topLevel.length}`, topLevel.map(o => o.sd_key).join(', '));

  const byPrio = {};
  newSDs.forEach(s => { byPrio[s.priority] = (byPrio[s.priority] || 0) + 1; });
  console.log('By priority:', JSON.stringify(byPrio));

  // Verify counts per phase
  const phaseA = newSDs.filter(s => s.sd_key.includes('PHASE-A') || s.sd_key.includes('TEMPLATE') || s.sd_key.includes('CHAIRMAN-API') || s.sd_key.includes('EVENT-BUS') || s.sd_key.includes('RETURN-PATH') || s.sd_key.includes('CLI-DISPATCHER') || s.sd_key.includes('GAPFILL'));
  console.log(`\nPhase A SDs: ${phaseA.length}`);

  console.log('\nAll SD keys:');
  newSDs.forEach(s => console.log(`  ${s.sd_key} [${s.sd_type}] priority=${s.priority} parent=${s.parent_sd_id ? 'yes' : 'none'}`));
}

const isMain = import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`;
if (isMain) main().catch(console.error);
