import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function markDesignCleanupComplete() {
  try {
    console.log('\n=== MARKING SD-DESIGN-CLEANUP-001 AS COMPLETE ===\n');

    // Get current data
    const { data: currentSD, error: fetchError } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', 'SD-DESIGN-CLEANUP-001')
      .single();

    if (fetchError) {
      console.error('Error fetching SD:', fetchError.message);
      return;
    }

    if (!currentSD) {
      console.error('SD-DESIGN-CLEANUP-001 not found in database');
      return;
    }

    console.log('Current status:');
    console.log(`  Title: ${currentSD.title}`);
    console.log(`  Status: ${currentSD.status}`);
    console.log(`  Progress: ${currentSD.progress}%`);
    console.log(`  Phase: ${currentSD.phase}`);

    // Update to complete
    const updatedMetadata = {
      ...(currentSD.metadata || {}),
      completion_status: 'complete',
      completion_date: new Date().toISOString(),
      completed_work: 'Design sub-agent assessment completed and UI/UX issues resolved',
      approved_by: 'LEAD'
    };

    const { data: _updated, error: updateError } = await supabase
      .from('strategic_directives_v2')
      .update({
        progress: 100,
        metadata: updatedMetadata,
        updated_at: new Date().toISOString()
      })
      .eq('id', 'SD-DESIGN-CLEANUP-001')
      .select();

    if (updateError) {
      console.error('Error updating SD:', updateError.message);
      return;
    }

    console.log('\n✅ Successfully updated SD-DESIGN-CLEANUP-001:');
    console.log('  Progress: 100%');
    console.log('  Completion status: complete');
    console.log('  Completion date:', updatedMetadata.completion_date);

  } catch (_err) {
    console.error('Failed to update SD:', err.message);
  }
}

markDesignCleanupComplete();
