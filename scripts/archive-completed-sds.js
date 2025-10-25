import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function archiveCompletedSDs() {
  try {
    console.log('\n=== ARCHIVING COMPLETED SDs ===\n');

    const sdIds = [
      'SD-2025-1013-P5Z',
      'SD-LEO-VALIDATION-FIX-001',
      'SD-DESIGN-CLEANUP-001'
    ];

    for (const id of sdIds) {
      console.log(`\nProcessing ${id}...`);

      // Get current data
      const { data: currentSD, error: fetchError } = await supabase
        .from('strategic_directives_v2')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError) {
        console.error(`  Error fetching ${id}:`, fetchError.message);
        continue;
      }

      if (!currentSD) {
        console.error(`  ${id} not found`);
        continue;
      }

      console.log(`  Current status: ${currentSD.status}, Progress: ${currentSD.progress}%`);

      // Update status to completed
      const { data: updated, error: updateError } = await supabase
        .from('strategic_directives_v2')
        .update({
          status: 'completed',
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select();

      if (updateError) {
        console.error(`  Error updating ${id}:`, updateError.message);
      } else {
        console.log(`  ✅ Successfully marked ${id} as completed`);
        console.log('     New status: completed');
      }
    }

    console.log('\n=== VERIFICATION ===\n');

    // Verify all updates
    for (const id of sdIds) {
      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .select('id, title, status, progress, metadata')
        .eq('id', id)
        .single();

      if (data) {
        console.log(`${id}:`);
        console.log(`  Status: ${data.status}`);
        console.log(`  Progress: ${data.progress}%`);
        console.log(`  Completion Status: ${data.metadata?.completion_status || 'not set'}`);
      }
    }

    console.log('\n✅ All SDs have been marked as completed and will no longer appear in the "Active & Draft" view');
    console.log('💡 Note: The dashboard status filter treats "completed" as "Archived/Completed"');

  } catch (err) {
    console.error('Failed to archive SDs:', err.message);
  }
}

archiveCompletedSDs();
