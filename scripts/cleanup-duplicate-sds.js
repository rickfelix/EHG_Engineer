#!/usr/bin/env node

/**
 * Clean up duplicate Strategic Directives created from the same submission
 */

import DatabaseLoader from '../src/services/database-loader.js';

async function cleanupDuplicateSDs() {
  console.log('🧹 Cleaning up duplicate Strategic Directives');
  console.log('=' .repeat(50));
  
  const dbLoader = new DatabaseLoader();
  
  try {
    // Get all Strategic Directives
    const allSDs = await dbLoader.loadStrategicDirectives();
    console.log(`\n📋 Found ${allSDs.length} Strategic Directives in total`);
    
    // Group by submission_id in metadata
    const sdsBySubmission = new Map();
    
    allSDs.forEach(sd => {
      const submissionId = sd.metadata?.submission_id;
      if (submissionId) {
        if (!sdsBySubmission.has(submissionId)) {
          sdsBySubmission.set(submissionId, []);
        }
        sdsBySubmission.get(submissionId).push(sd);
      }
    });
    
    // Find duplicates
    const duplicateGroups = Array.from(sdsBySubmission.entries())
      .filter(([_submissionId, sds]) => sds.length > 1);
    
    if (duplicateGroups.length === 0) {
      console.log('✅ No duplicate Strategic Directives found!');
      return;
    }
    
    console.log(`\n⚠️  Found ${duplicateGroups.length} submission(s) with duplicate SDs:`);
    
    for (const [submissionId, sds] of duplicateGroups) {
      console.log(`\n📝 Submission ${submissionId} has ${sds.length} Strategic Directives:`);
      
      // Sort by creation date to keep the oldest
      sds.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      
      const toKeep = sds[0];
      const toRemove = sds.slice(1);
      
      console.log(`  ✅ Keeping:  ${toKeep.id} (created: ${toKeep.created_at})`);
      toRemove.forEach(sd => {
        console.log(`  🗑️  Removing: ${sd.id} (created: ${sd.created_at})`);
      });
      
      // Remove duplicates from in-memory storage and database
      for (const sd of toRemove) {
        // Remove from in-memory
        if (global.strategicDirectives) {
          const index = global.strategicDirectives.findIndex(s => s.id === sd.id);
          if (index !== -1) {
            global.strategicDirectives.splice(index, 1);
            console.log(`    ✓ Removed ${sd.id} from in-memory storage`);
          }
        }
        
        // Remove from database if connected
        if (dbLoader.supabase) {
          try {
            const { error } = await dbLoader.supabase
              .from('strategic_directives_v2')
              .delete()
              .eq('id', sd.id);
              
            if (error) {
              console.log(`    ⚠️  Could not delete ${sd.id} from database:`, error.message);
            } else {
              console.log(`    ✓ Deleted ${sd.id} from database`);
            }
          } catch (err) {
            console.log(`    ❌ Error deleting ${sd.id}:`, err.message);
          }
        }
      }
      
      // Update the submission to reference the kept SD
      console.log(`\n  📝 Updating submission to reference ${toKeep.id}...`);
      await dbLoader.updateSubmissionStep(submissionId, 7, {
        status: 'submitted',
        resulting_sd_id: toKeep.id,
        completed_at: toKeep.created_at
      });
    }
    
    console.log('\n' + '=' .repeat(50));
    console.log('🎉 Cleanup complete!');
    console.log(`   Kept ${duplicateGroups.length} Strategic Directives`);
    console.log(`   Removed ${duplicateGroups.reduce((sum, [_, sds]) => sum + sds.length - 1, 0)} duplicates`);
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error.message);
    process.exit(1);
  }
}

// Run cleanup
cleanupDuplicateSDs();