#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load environment variables
config();

async function cleanupDuplicateSubmissions() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('❌ Missing Supabase environment variables');
      process.exit(1);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    console.log('🔗 Connected to Supabase');

    // Get all submissions to analyze duplicates
    console.log('🔍 Fetching all submissions...');
    const { data: allSubmissions, error: fetchError } = await supabase
      .from('sdip_submissions')
      .select('id, chairman_input, created_at')
      .order('created_at', { ascending: true });

    if (fetchError) {
      console.error('❌ Error fetching submissions:', fetchError);
      process.exit(1);
    }

    console.log(`📋 Found ${allSubmissions.length} total submissions`);

    // Group by chairman_input to find duplicates
    const submissionGroups = new Map();
    
    allSubmissions.forEach(submission => {
      const key = submission.chairman_input?.trim().toLowerCase() || '';
      if (!submissionGroups.has(key)) {
        submissionGroups.set(key, []);
      }
      submissionGroups.get(key).push(submission);
    });

    // Find groups with duplicates
    const duplicateGroups = Array.from(submissionGroups.entries())
      .filter(([key, submissions]) => submissions.length > 1 && key.length > 0);

    console.log(`🔄 Found ${duplicateGroups.length} groups with duplicates`);

    let totalDeleted = 0;

    for (const [chairmanInput, submissions] of duplicateGroups) {
      console.log(`\n📝 Processing duplicate group (${submissions.length} submissions):`);
      console.log(`   Content: "${chairmanInput.substring(0, 80)}..."`);
      
      // Keep the oldest submission (first created), delete the rest
      const toKeep = submissions[0];
      const toDelete = submissions.slice(1);
      
      console.log(`   ✅ Keeping: ${toKeep.id} (${toKeep.created_at})`);
      
      for (const duplicate of toDelete) {
        console.log(`   🗑️  Deleting: ${duplicate.id} (${duplicate.created_at})`);
        
        const { error: deleteError } = await supabase
          .from('sdip_submissions')
          .delete()
          .eq('id', duplicate.id);
        
        if (deleteError) {
          console.error(`   ❌ Error deleting ${duplicate.id}:`, deleteError);
        } else {
          totalDeleted++;
        }
      }
    }

    console.log('\n✅ Cleanup complete!');
    console.log('📊 Summary:');
    console.log(`   - Total submissions before: ${allSubmissions.length}`);
    console.log(`   - Duplicates deleted: ${totalDeleted}`);
    console.log(`   - Submissions remaining: ${allSubmissions.length - totalDeleted}`);

  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    process.exit(1);
  }
}

// Run cleanup
cleanupDuplicateSubmissions();