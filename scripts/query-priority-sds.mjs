import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Query CRITICAL priority SDs
const { data: criticalSDs } = await supabase
  .from('strategic_directives_v2')
  .select('id, title, status, current_phase, progress, priority, created_at')
  .eq('priority', 'critical')
  .order('created_at', { ascending: false });

console.log('🔴 CRITICAL PRIORITY STRATEGIC DIRECTIVES\n');
console.log('Total:', criticalSDs?.length || 0);
console.log('='.repeat(80) + '\n');

if (criticalSDs && criticalSDs.length > 0) {
  const byStatus = {};
  criticalSDs.forEach(sd => {
    if (!byStatus[sd.status]) byStatus[sd.status] = [];
    byStatus[sd.status].push(sd);
  });

  Object.keys(byStatus).sort().forEach(status => {
    console.log(`\n[${status.toUpperCase()}] - ${byStatus[status].length} SDs:`);
    byStatus[status].forEach(sd => {
      console.log(`  • ${sd.id}`);
      console.log(`    Title: ${sd.title}`);
      console.log(`    Phase: ${sd.current_phase} | Progress: ${sd.progress}%`);
      console.log(`    Created: ${new Date(sd.created_at).toLocaleDateString()}`);
    });
  });
}

// Query HIGH priority SDs
const { data: highSDs } = await supabase
  .from('strategic_directives_v2')
  .select('id, title, status, current_phase, progress, priority, created_at')
  .eq('priority', 'high')
  .order('created_at', { ascending: false });

console.log('\n\n🟠 HIGH PRIORITY STRATEGIC DIRECTIVES\n');
console.log('Total:', highSDs?.length || 0);
console.log('='.repeat(80) + '\n');

if (highSDs && highSDs.length > 0) {
  const byStatus = {};
  highSDs.forEach(sd => {
    if (!byStatus[sd.status]) byStatus[sd.status] = [];
    byStatus[sd.status].push(sd);
  });

  Object.keys(byStatus).sort().forEach(status => {
    console.log('\n[' + status.toUpperCase() + '] - ' + byStatus[status].length + ' SDs:');
    byStatus[status].forEach(sd => {
      console.log('  • ' + sd.id);
      console.log('    Title: ' + sd.title);
      console.log('    Phase: ' + sd.current_phase + ' | Progress: ' + sd.progress + '%');
      console.log('    Created: ' + new Date(sd.created_at).toLocaleDateString());
    });
  });
}
