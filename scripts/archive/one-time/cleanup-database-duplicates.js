#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load environment variables
config();

async function cleanupDatabaseDuplicates() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('❌ Missing Supabase environment variables');
      process.exit(1);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    console.log('🔗 Connected to Supabase');

    // Check both possible tables
    const tables = ['directive_submissions', 'sdip_submissions'];
    
    for (const tableName of tables) {
      console.log(`\n🔍 Checking table: ${tableName}`);
      
      try {
        const { data: submissions, error: fetchError } = await supabase
          .from(tableName)
          .select('id, chairman_input, created_at')
          .order('created_at', { ascending: true });

        if (fetchError) {
          console.log(`⚠️  Table ${tableName} error:`, fetchError.message);
          continue;
        }

        if (!submissions || submissions.length === 0) {
          console.log(`📋 Table ${tableName}: No submissions found`);
          continue;
        }

        console.log(`📋 Table ${tableName}: Found ${submissions.length} submissions`);

        // Group by chairman_input to find duplicates
        const submissionGroups = new Map();
        
        submissions.forEach(submission => {
          const key = submission.chairman_input?.trim().toLowerCase() || '';
          if (!submissionGroups.has(key)) {
            submissionGroups.set(key, []);
          }
          submissionGroups.get(key).push(submission);
        });

        // Find groups with duplicates
        const duplicateGroups = Array.from(submissionGroups.entries())
          .filter(([key, subs]) => subs.length > 1 && key.length > 0);

        console.log(`🔄 Found ${duplicateGroups.length} duplicate groups in ${tableName}`);

        let deletedCount = 0;

        for (const [chairmanInput, duplicates] of duplicateGroups) {
          console.log(`\n📝 Processing ${duplicates.length} duplicates:`);
          console.log(`   Content: "${chairmanInput.substring(0, 80)}..."`);
          
          // Keep the oldest (first created), delete the rest
          const toKeep = duplicates[0];
          const toDelete = duplicates.slice(1);
          
          console.log(`   ✅ Keeping: ${toKeep.id} (${toKeep.created_at})`);
          
          for (const duplicate of toDelete) {
            console.log(`   🗑️  Deleting: ${duplicate.id} (${duplicate.created_at})`);
            
            const { error: deleteError } = await supabase
              .from(tableName)
              .delete()
              .eq('id', duplicate.id);
            
            if (deleteError) {
              console.error(`   ❌ Error deleting ${duplicate.id}:`, deleteError);
            } else {
              deletedCount++;
            }
          }
        }

        console.log(`✅ Table ${tableName} cleanup complete! Deleted ${deletedCount} duplicates.`);

      } catch (tableError) {
        console.log(`❌ Error processing table ${tableName}:`, tableError.message);
      }
    }

    console.log('\n🎉 Database cleanup complete!');

  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    process.exit(1);
  }
}

// Run cleanup
cleanupDatabaseDuplicates();