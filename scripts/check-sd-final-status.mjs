import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const { data: sd } = await supabase
  .from('strategic_directives_v2')
  .select('id, title, status, progress_percentage, current_phase, updated_at')
  .eq('id', 'SD-PROOF-DRIVEN-1758340937844')
  .single();

console.log('\n📊 SD Final Status');
console.log('═'.repeat(70));
console.log('ID:', sd.id);
console.log('Title:', sd.title);
console.log('Status:', sd.status);
console.log('Progress:', sd.progress_percentage + '%');
console.log('Current Phase:', sd.current_phase || 'Not set');
console.log('Updated:', sd.updated_at);
console.log('═'.repeat(70));

if (sd.status === 'completed' && sd.progress_percentage === 100) {
  console.log('\n🎉 SD SUCCESSFULLY COMPLETED!\n');
} else if (sd.progress_percentage === 100) {
  console.log('\n✅ Progress is 100% but status is:', sd.status);
  console.log('   (May need manual status update to "completed")\n');
} else {
  console.log('\n⚠️  Not complete. Progress:', sd.progress_percentage + '%\n');
}
