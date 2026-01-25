import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  process.env.SUPABASE_ANON_KEY
);

const { data: sd, error } = await supabase
  .from('strategic_directives_v2')
  .select('id, title, status, progress, current_phase, completion_date, approved_by')
  .eq('id', 'SD-BACKEND-001')
  .single();

if (error) throw error;

console.log('🔍 DEFINITIVE STATUS CHECK FOR SD-BACKEND-001\n');
console.log('Database Record:');
console.log('  ID:', sd.id);
console.log('  Title:', sd.title);
console.log('  Status:', sd.status);
console.log('  Progress:', sd.progress + '%');
console.log('  Current Phase:', sd.current_phase);
console.log('  Completion Date:', sd.completion_date);
console.log('  Approved By:', sd.approved_by);
console.log('');

const checks = {
  status: sd.status === 'completed',
  progress: sd.progress === 100,
  phase: sd.current_phase === 'COMPLETED',
  date: sd.completion_date != null,
  approved: sd.approved_by === 'LEAD'
};

console.log('✅ DONE DONE CHECKLIST:');
console.log('  [' + (checks.status ? '✓' : '✗') + '] Status = completed');
console.log('  [' + (checks.progress ? '✓' : '✗') + '] Progress = 100%');
console.log('  [' + (checks.phase ? '✓' : '✗') + '] Phase = COMPLETED');
console.log('  [' + (checks.date ? '✓' : '✗') + '] Completion date set');
console.log('  [' + (checks.approved ? '✓' : '✗') + '] Approved by LEAD');
console.log('');

const isDoneDone = Object.values(checks).every(v => v === true);
console.log('🎯 VERDICT:', isDoneDone ? '✅ YES - ABSOLUTELY DONE DONE' : '❌ NO - NOT COMPLETE');
console.log('');

if (!isDoneDone) {
  console.log('⚠️ MISSING:');
  if (!checks.status) console.log('  - Status needs to be "completed"');
  if (!checks.progress) console.log('  - Progress needs to be 100');
  if (!checks.phase) console.log('  - Phase needs to be "COMPLETED"');
  if (!checks.date) console.log('  - Completion date needs to be set');
  if (!checks.approved) console.log('  - Needs LEAD approval');
}
