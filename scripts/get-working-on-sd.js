#!/usr/bin/env node

/**
 * Get Working On SD Script
 * Retrieves the Strategic Directive marked as "working on" that is not 100% complete
 * Respects user's explicit UI selection over WSJF priority
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function getWorkingOnSD() {
  try {
    // Get SD marked as working_on that is not completed
    const { data: workingOn, error: workingError } = await supabase
      .from('strategic_directives_v2')
      .select('id, title, status, priority, is_working_on, created_at, current_phase, progress, description')
      .eq('is_working_on', true)
      .lt('progress', 100);  // Less than 100% complete

    if (workingError) {
      console.error('Error querying working_on SD:', workingError);
      return null;
    }

    if (workingOn && workingOn.length > 0) {
      const sd = workingOn[0]; // Should only be one
      console.log('\n🎯 Strategic Directive Currently Being Worked On:');
      console.log('═══════════════════════════════════════════════════');
      console.log(`
📌 ${sd.id}
   Title: ${sd.title}
   Status: ${sd.status}
   Priority: ${sd.priority || 'not set'}
   Current Phase: ${sd.current_phase || 'not set'}
   Progress: ${sd.progress || 0}%
   Created: ${new Date(sd.created_at).toLocaleDateString()}

   Description:
   ${sd.description || 'No description available'}
      `);

      console.log('\n✅ This SD has been selected via the UI "Working on" button');
      console.log('   and takes priority over WSJF or other sorting methods.\n');

      return sd;
    } else {
      console.log('\n❌ No Strategic Directive is currently marked as "Working On"');
      console.log('   (or the marked SD is 100% complete and should be ignored)\n');

      // Suggest using WSJF priority instead
      console.log('💡 Suggestion: Use WSJF priority to select next SD:');
      console.log('   Run: npm run prio:top3\n');

      // Also check if there's a completed SD still marked
      const { data: completedWorking } = await supabase
        .from('strategic_directives_v2')
        .select('id, title, progress')
        .eq('is_working_on', true)
        .gte('progress', 100);

      if (completedWorking && completedWorking.length > 0) {
        console.log('⚠️  Note: The following completed SD still has working_on flag:');
        completedWorking.forEach(sd => {
          console.log(`   - ${sd.id}: ${sd.title} (${sd.progress}% complete)`);
        });
        console.log('   This SD is being ignored since it\'s 100% complete.\n');
      }

      return null;
    }
  } catch (error) {
    console.error('Error:', error);
    return null;
  }
}

// Export for use in other scripts
export default getWorkingOnSD;

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  getWorkingOnSD().then(sd => {
    if (sd) {
      // Return just the ID for scripting
      if (process.argv.includes('--id-only')) {
        console.log(sd.id);
      }
    }
    process.exit(sd ? 0 : 1);
  });
}