#!/usr/bin/env node

/**
 * SD Database Cleanup Script for SD-VISION-TRANSITION-001B
 *
 * Purpose:
 * 1. Archive SD-STAGE-* records (soft delete with metadata)
 * 2. Delete SD-TEST-* records (hard delete after FK cleanup)
 *
 * Usage:
 *   node scripts/cleanup-sd-database-vision-transition-001b.js          # Dry run
 *   node scripts/cleanup-sd-database-vision-transition-001b.js --execute  # Execute
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DRY_RUN = !process.argv.includes('--execute');

async function main() {
  console.log('='.repeat(70));
  console.log('  SD DATABASE CLEANUP - SD-VISION-TRANSITION-001B');
  console.log('='.repeat(70));
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'EXECUTE (changes will be made)'}`);
  console.log('');

  const results = {
    stageArchived: 0,
    testDeleted: 0,
    handoffsDeleted: 0,
    prdsDeleted: 0,
    userStoriesDeleted: 0,
    deliverablesDeleted: 0,
    errors: []
  };

  // =========================================================================
  // PHASE 1: Archive SD-STAGE-* records (soft delete)
  // =========================================================================
  console.log('\n1. ARCHIVING SD-STAGE-* RECORDS');
  console.log('-'.repeat(50));

  const { data: stageRecords, error: stageFetchErr } = await supabase
    .from('strategic_directives_v2')
    .select('id, uuid_id, title, status, metadata')
    .like('id', 'SD-STAGE-%');

  if (stageFetchErr) {
    console.error('Error fetching SD-STAGE-* records:', stageFetchErr.message);
    results.errors.push(`Stage fetch: ${stageFetchErr.message}`);
  } else {
    console.log(`Found ${stageRecords.length} SD-STAGE-* records`);

    for (const sd of stageRecords) {
      const existingMetadata = sd.metadata || {};
      const updatedMetadata = {
        ...existingMetadata,
        archived_reason: 'Stage workflow completed - archived during Venture Vision v2.0 transition',
        archived_at: new Date().toISOString(),
        archived_by: 'SD-VISION-TRANSITION-001B'
      };

      if (DRY_RUN) {
        console.log(`  [DRY] Would archive: ${sd.id}`);
        results.stageArchived++;
      } else {
        const { error: updateErr } = await supabase
          .from('strategic_directives_v2')
          .update({
            status: 'archived',
            is_active: false,
            metadata: updatedMetadata,
            updated_at: new Date().toISOString()
          })
          .eq('id', sd.id);

        if (updateErr) {
          console.error(`  Error archiving ${sd.id}:`, updateErr.message);
          results.errors.push(`Archive ${sd.id}: ${updateErr.message}`);
        } else {
          console.log(`  Archived: ${sd.id}`);
          results.stageArchived++;
        }
      }
    }
  }

  // =========================================================================
  // PHASE 2: Clean up FK references for SD-TEST-* records
  // =========================================================================
  console.log('\n2. CLEANING FK REFERENCES FOR SD-TEST-*');
  console.log('-'.repeat(50));

  // 2a. Get all SD-TEST-* UUIDs
  const { data: testRecords, error: testFetchErr } = await supabase
    .from('strategic_directives_v2')
    .select('id, uuid_id')
    .like('id', 'SD-TEST-%');

  if (testFetchErr) {
    console.error('Error fetching SD-TEST-* records:', testFetchErr.message);
    results.errors.push(`Test fetch: ${testFetchErr.message}`);
  } else {
    console.log(`Found ${testRecords.length} SD-TEST-* records`);
    const testIds = testRecords.map(r => r.id);
    const testUuids = testRecords.map(r => r.uuid_id);

    // 2b. Delete from sd_phase_handoffs (FK on sd_id)
    const { data: handoffRefs, error: handoffFetchErr } = await supabase
      .from('sd_phase_handoffs')
      .select('id, sd_id')
      .in('sd_id', testIds);

    if (handoffRefs && handoffRefs.length > 0) {
      console.log(`  Found ${handoffRefs.length} handoff references to delete`);

      if (DRY_RUN) {
        results.handoffsDeleted = handoffRefs.length;
        console.log(`  [DRY] Would delete ${handoffRefs.length} handoff records`);
      } else {
        const { error: handoffDelErr } = await supabase
          .from('sd_phase_handoffs')
          .delete()
          .in('sd_id', testIds);

        if (handoffDelErr) {
          console.error('  Error deleting handoffs:', handoffDelErr.message);
          results.errors.push(`Handoff delete: ${handoffDelErr.message}`);
        } else {
          results.handoffsDeleted = handoffRefs.length;
          console.log(`  Deleted ${handoffRefs.length} handoff records`);
        }
      }
    }

    // 2c. Delete from product_requirements_v2 (FK on directive_id or sd_uuid)
    const { data: prdRefs, error: prdFetchErr } = await supabase
      .from('product_requirements_v2')
      .select('id, directive_id')
      .in('directive_id', testIds);

    if (prdRefs && prdRefs.length > 0) {
      console.log(`  Found ${prdRefs.length} PRD references to delete`);
      const prdIds = prdRefs.map(p => p.id);

      // Delete user stories linked to these PRDs first
      const { data: storyRefs } = await supabase
        .from('user_stories')
        .select('id')
        .in('prd_id', prdIds);

      if (storyRefs && storyRefs.length > 0) {
        if (DRY_RUN) {
          results.userStoriesDeleted = storyRefs.length;
          console.log(`  [DRY] Would delete ${storyRefs.length} user stories`);
        } else {
          const { error: storyDelErr } = await supabase
            .from('user_stories')
            .delete()
            .in('prd_id', prdIds);

          if (storyDelErr) {
            results.errors.push(`Story delete: ${storyDelErr.message}`);
          } else {
            results.userStoriesDeleted = storyRefs.length;
            console.log(`  Deleted ${storyRefs.length} user stories`);
          }
        }
      }

      // Delete deliverables linked to these PRDs
      const { data: deliverableRefs } = await supabase
        .from('deliverables')
        .select('id')
        .in('prd_id', prdIds);

      if (deliverableRefs && deliverableRefs.length > 0) {
        if (DRY_RUN) {
          results.deliverablesDeleted = deliverableRefs.length;
          console.log(`  [DRY] Would delete ${deliverableRefs.length} deliverables`);
        } else {
          const { error: delDelErr } = await supabase
            .from('deliverables')
            .delete()
            .in('prd_id', prdIds);

          if (delDelErr) {
            results.errors.push(`Deliverable delete: ${delDelErr.message}`);
          } else {
            results.deliverablesDeleted = deliverableRefs.length;
            console.log(`  Deleted ${deliverableRefs.length} deliverables`);
          }
        }
      }

      // Now delete the PRDs
      if (DRY_RUN) {
        results.prdsDeleted = prdRefs.length;
        console.log(`  [DRY] Would delete ${prdRefs.length} PRD records`);
      } else {
        const { error: prdDelErr } = await supabase
          .from('product_requirements_v2')
          .delete()
          .in('directive_id', testIds);

        if (prdDelErr) {
          console.error('  Error deleting PRDs:', prdDelErr.message);
          results.errors.push(`PRD delete: ${prdDelErr.message}`);
        } else {
          results.prdsDeleted = prdRefs.length;
          console.log(`  Deleted ${prdRefs.length} PRD records`);
        }
      }
    }

    // =========================================================================
    // PHASE 3: Delete SD-TEST-* records (hard delete)
    // =========================================================================
    console.log('\n3. DELETING SD-TEST-* RECORDS');
    console.log('-'.repeat(50));

    if (DRY_RUN) {
      results.testDeleted = testRecords.length;
      console.log(`  [DRY] Would delete ${testRecords.length} SD-TEST-* records`);
    } else {
      // Delete in batches of 50
      const batchSize = 50;
      for (let i = 0; i < testIds.length; i += batchSize) {
        const batch = testIds.slice(i, i + batchSize);

        const { error: delErr } = await supabase
          .from('strategic_directives_v2')
          .delete()
          .in('id', batch);

        if (delErr) {
          console.error(`  Error deleting batch ${Math.floor(i/batchSize) + 1}:`, delErr.message);
          results.errors.push(`Test delete batch: ${delErr.message}`);
        } else {
          results.testDeleted += batch.length;
          console.log(`  Deleted batch ${Math.floor(i/batchSize) + 1}: ${batch.length} records`);
        }
      }
    }
  }

  // =========================================================================
  // PHASE 4: Verification
  // =========================================================================
  console.log('\n4. VERIFICATION');
  console.log('-'.repeat(50));

  if (!DRY_RUN) {
    // Verify SD-STAGE-* archived
    const { count: archivedCount } = await supabase
      .from('strategic_directives_v2')
      .select('id', { count: 'exact', head: true })
      .like('id', 'SD-STAGE-%')
      .eq('status', 'archived');

    console.log(`  SD-STAGE-* archived: ${archivedCount}`);

    // Verify SD-TEST-* deleted
    const { count: remainingTest } = await supabase
      .from('strategic_directives_v2')
      .select('id', { count: 'exact', head: true })
      .like('id', 'SD-TEST-%');

    console.log(`  SD-TEST-* remaining: ${remainingTest}`);
  } else {
    console.log('  [DRY RUN] Skipping verification');
  }

  // =========================================================================
  // Summary
  // =========================================================================
  console.log('\n' + '='.repeat(70));
  console.log('  CLEANUP SUMMARY');
  console.log('='.repeat(70));
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN' : 'EXECUTED'}`);
  console.log(`  SD-STAGE-* archived: ${results.stageArchived}`);
  console.log(`  SD-TEST-* deleted: ${results.testDeleted}`);
  console.log(`  Handoff refs deleted: ${results.handoffsDeleted}`);
  console.log(`  PRD refs deleted: ${results.prdsDeleted}`);
  console.log(`  User stories deleted: ${results.userStoriesDeleted}`);
  console.log(`  Deliverables deleted: ${results.deliverablesDeleted}`);
  console.log(`  Errors: ${results.errors.length}`);

  if (results.errors.length > 0) {
    console.log('\n  ERRORS:');
    results.errors.forEach(e => console.log(`    - ${e}`));
  }

  if (DRY_RUN) {
    console.log('\n  To execute these changes, run:');
    console.log('    node scripts/cleanup-sd-database-vision-transition-001b.js --execute');
  }

  console.log('\n' + '='.repeat(70));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
