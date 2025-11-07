import { createSupabaseServiceClient } from './lib/supabase-connection.js';

const client = await createSupabaseServiceClient('engineer', { verbose: false });

console.log('\n=== Deliverables for SD-CREWAI-ARCHITECTURE-001 ===\n');

const { data: deliverables, error } = await client
  .from('sd_deliverables')
  .select('*')
  .eq('sd_id', 'SD-CREWAI-ARCHITECTURE-001')
  .order('created_at');

if (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}

if (!deliverables || deliverables.length === 0) {
  console.log('⚠️  No deliverables found for SD-CREWAI-ARCHITECTURE-001');
  console.log('\nThis is expected for phased implementations.');
  console.log('Deliverables may have been tracked at the phase level rather than SD level.');
  process.exit(0);
}

console.log(`Found ${deliverables.length} deliverables:\n`);

const byStatus = {
  completed: [],
  in_progress: [],
  pending: [],
  other: []
};

deliverables.forEach(d => {
  if (d.status === 'completed') byStatus.completed.push(d);
  else if (d.status === 'in_progress') byStatus.in_progress.push(d);
  else if (d.status === 'pending') byStatus.pending.push(d);
  else byStatus.other.push(d);
});

console.log(`✅ Completed: ${byStatus.completed.length}`);
byStatus.completed.forEach(d => console.log(`   ${d.deliverable_type}: ${d.title || 'Untitled'}`));

console.log(`\n⏳ In Progress: ${byStatus.in_progress.length}`);
byStatus.in_progress.forEach(d => console.log(`   ${d.deliverable_type}: ${d.title || 'Untitled'}`));

console.log(`\n🔴 Pending: ${byStatus.pending.length}`);
byStatus.pending.forEach(d => console.log(`   ${d.deliverable_type}: ${d.title || 'Untitled'}`));

if (byStatus.other.length > 0) {
  console.log(`\n⚠️  Other: ${byStatus.other.length}`);
  byStatus.other.forEach(d => console.log(`   ${d.deliverable_type}: ${d.status}`));
}
