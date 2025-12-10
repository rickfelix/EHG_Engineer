#!/usr/bin/env node
/**
 * Update Vision Transition D1-D6 Grandchildren - Add Reference Documents
 *
 * CONTEXT: Add explicit document references to all 6 grandchildren SDs
 * to support PLAN phase PRD creation with clear source documents.
 *
 * CHANGE:
 * - Add reference_documents section to metadata
 * - Include vision_document (ADR-002), golden_nuggets_plan, stages_config
 * - Preserve all existing metadata fields
 *
 * SAFETY:
 * - Uses jsonb_set() to merge new content into existing metadata
 * - Verifies update before committing
 * - Shows before/after comparison
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

const SD_IDS = [
  'SD-VISION-TRANSITION-001D1',
  'SD-VISION-TRANSITION-001D2',
  'SD-VISION-TRANSITION-001D3',
  'SD-VISION-TRANSITION-001D4',
  'SD-VISION-TRANSITION-001D5',
  'SD-VISION-TRANSITION-001D6'
];

const REFERENCE_DOCUMENTS = {
  vision_document: {
    path: 'docs/architecture/ADR-002-VENTURE-FACTORY-ARCHITECTURE.md',
    description: 'Authoritative architecture document for Venture Factory 25-stage model',
    key_sections: [
      '2.2 Complete Stage Definitions',
      '3.3 lifecycle_stage_config table',
      '3.4 venture_stage_work table',
      '3.5 venture_artifacts table',
      '3.6 Kill Protocol',
      '4.1 Venture Lifecycle Engine'
    ]
  },
  golden_nuggets_plan: {
    path: 'docs/vision/VENTURE_ENGINE_GOLDEN_NUGGETS_PLAN.md',
    description: 'Golden Nuggets implementation plan - Assumptions vs Reality tracking, Four Buckets epistemic classification',
    features: [
      'Assumptions vs Reality tracking',
      'Four Buckets epistemic classification (Facts/Assumptions/Simulations/Unknowns)',
      'Token Budget Profiles',
      'Crew Tournament Pilot'
    ]
  },
  stages_config: {
    path: 'docs/workflow/stages_v2.yaml',
    description: 'Complete 25-stage lifecycle configuration with phase definitions, gate conditions, and artifact requirements'
  }
};

async function updateReferenceDocuments() {
  let client;

  try {
    console.log('🔧 Connecting to EHG_Engineer database...\n');
    client = await createDatabaseClient('engineer', {
      verbose: false,
      verify: false
    });

    console.log('📊 Processing ' + SD_IDS.length + ' grandchildren SDs...\n');

    for (const sdId of SD_IDS) {
      console.log('=' .repeat(70));
      console.log('📋 Processing: ' + sdId);
      console.log('=' .repeat(70));

      // Step 1: Read current metadata
      const currentResult = await client.query(
        'SELECT id, title, metadata FROM strategic_directives_v2 WHERE id = $1',
        [sdId]
      );

      if (currentResult.rows.length === 0) {
        console.error(`❌ SD ${sdId} not found in database`);
        continue;
      }

      const currentMetadata = currentResult.rows[0].metadata || {};
      console.log('\n📖 Current metadata keys:', Object.keys(currentMetadata).join(', '));

      // Check if reference_documents already exists
      if (currentMetadata.reference_documents) {
        console.log('⚠️  reference_documents already exists, will merge...');
        console.log('   Existing:', JSON.stringify(currentMetadata.reference_documents, null, 2));
      }

      // Step 2: Update metadata using jsonb_set to merge reference_documents
      console.log('\n🔄 Merging reference_documents into metadata...');
      const updateResult = await client.query(
        `UPDATE strategic_directives_v2
         SET metadata = jsonb_set(
           COALESCE(metadata, '{}'::jsonb),
           '{reference_documents}',
           $1::jsonb
         )
         WHERE id = $2
         RETURNING id, title, metadata`,
        [JSON.stringify(REFERENCE_DOCUMENTS), sdId]
      );

      if (updateResult.rows.length === 0) {
        console.error('❌ Update failed - no rows returned');
        continue;
      }

      const updatedMetadata = updateResult.rows[0].metadata;

      // Step 3: Verify update
      console.log('\n✅ Update successful!');
      console.log('\n📋 Updated reference_documents section:');
      console.log(JSON.stringify(updatedMetadata.reference_documents, null, 2));

      // Step 4: Verify all other fields preserved
      console.log('\n🔍 Verifying other metadata fields preserved...');
      const otherFields = Object.keys(currentMetadata).filter(key => key !== 'reference_documents');
      let allFieldsPreserved = true;

      for (const field of otherFields) {
        const currentValue = JSON.stringify(currentMetadata[field]);
        const updatedValue = JSON.stringify(updatedMetadata[field]);

        if (currentValue === updatedValue) {
          // Only show first 3 fields to avoid clutter
          if (otherFields.indexOf(field) < 3) {
            console.log(`   ✅ ${field}: PRESERVED`);
          }
        } else {
          console.log(`   ❌ ${field}: CHANGED`);
          console.log(`      Before: ${currentValue.substring(0, 50)}...`);
          console.log(`      After: ${updatedValue.substring(0, 50)}...`);
          allFieldsPreserved = false;
        }
      }

      if (allFieldsPreserved) {
        console.log(`   ... and ${otherFields.length - 3} more fields preserved`);
        console.log('   ✅ All other metadata fields preserved correctly');
      } else {
        console.log('\n⚠️  WARNING: Some metadata fields were unexpectedly modified!');
      }

      console.log('\n');
    }

    // Final Summary
    console.log('=' .repeat(70));
    console.log('📊 SUMMARY');
    console.log('=' .repeat(70));
    console.log(`✅ Updated ${SD_IDS.length} grandchildren SDs`);
    console.log('\nReference documents added:');
    console.log('  - vision_document: ADR-002-VENTURE-FACTORY-ARCHITECTURE.md');
    console.log('  - golden_nuggets_plan: VENTURE_ENGINE_GOLDEN_NUGGETS_PLAN.md');
    console.log('  - stages_config: stages_v2.yaml');
    console.log('=' .repeat(70) + '\n');

    return true;

  } catch (error) {
    console.error('\n❌ Error updating reference documents:', error.message);
    console.error(error);
    return false;
  } finally {
    if (client) {
      await client.end();
      console.log('🔌 Database connection closed\n');
    }
  }
}

// Execute
updateReferenceDocuments()
  .then(success => {
    if (success) {
      console.log('✅ Script completed successfully\n');
      process.exit(0);
    } else {
      console.error('❌ Script failed\n');
      process.exit(1);
    }
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
