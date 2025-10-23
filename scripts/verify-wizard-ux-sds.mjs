import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('VENTURE WIZARD UX COMPLETION SDs - VERIFICATION');
  console.log('═══════════════════════════════════════════════════════════\n');

  const { data: sds, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, status, priority, current_phase, metadata')
    .or('id.eq.SD-VWC-PARENT-001,id.eq.SD-VWC-PHASE1-001,id.eq.SD-VWC-PHASE2-001,id.eq.SD-VWC-PHASE3-001,id.eq.SD-VWC-PHASE4-001')
    .order('id', { ascending: true });

  if (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }

  console.log('Found', sds.length, 'SDs\n');

  let totalLOC = 0;
  let totalHoursMin = 0;
  let totalHoursMax = 0;

  sds.forEach((sd) => {
    const isParent = sd.metadata && sd.metadata.is_parent === true;
    const prefix = isParent ? 'PARENT:' : 'Phase ' + (sd.metadata ? sd.metadata.sequence_order : '?') + ':';
    
    console.log(prefix);
    console.log('  ID:', sd.id);
    console.log('  Title:', sd.title);
    console.log('  Status:', sd.status);
    console.log('  Priority:', sd.priority);
    
    if (!isParent && sd.metadata) {
      const loc = sd.metadata.estimated_loc || 0;
      const effort = sd.metadata.estimated_effort_hours || '0';
      console.log('  Estimated LOC:', loc);
      console.log('  Estimated effort:', effort, 'hours');
      
      totalLOC += loc;
      
      if (typeof effort === 'string' && effort.includes('-')) {
        const parts = effort.split('-');
        totalHoursMin += parseInt(parts[0]);
        totalHoursMax += parseInt(parts[1]);
      }
    }
    
    console.log('');
  });

  console.log('═══════════════════════════════════════════════════════════');
  console.log('SUMMARY:');
  console.log('  Total SDs:', sds.length, '(1 parent + 4 phases)');
  console.log('  Total LOC:', totalLOC);
  console.log('  Total effort:', totalHoursMin + '-' + totalHoursMax, 'hours');
  console.log('═══════════════════════════════════════════════════════════');
}

main();
