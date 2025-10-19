import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkSDStatus() {
  try {
    console.log('\n=== CHECKING SD STATUS ===\n');

    const sdIds = [
      'SD-2025-1013-P5Z',
      'SD-LEO-VALIDATION-FIX-001',
      'SD-DESIGN-CLEANUP-001'
    ];

    for (const id of sdIds) {
      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .select('id, title, status, progress, metadata')
        .eq('id', id)
        .single();

      if (error) {
        console.error(`Error fetching ${id}:`, error.message);
        continue;
      }

      console.log(`\n${id}:`);
      console.log(`  Title: ${data.title}`);
      console.log(`  Status: ${data.status}`);
      console.log(`  Progress: ${data.progress}%`);
      console.log(`  Completion Status: ${data.metadata?.completion_status || 'not set'}`);
      console.log(`  Completion Date: ${data.metadata?.completion_date || 'not set'}`);
    }

  } catch (err) {
    console.error('Failed to check SD status:', err.message);
  }
}

checkSDStatus();
