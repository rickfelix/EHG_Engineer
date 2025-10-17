#!/usr/bin/env node
/**
 * Move Reviewed Migrations
 * Moves manually reviewed migrations to their correct database directories
 *
 * Usage: node scripts/move-reviewed-migrations.cjs [--dry-run|--execute]
 */

const fs = require('fs');
const path = require('path');

const MANUAL_REVIEW_DIR = path.join(__dirname, '../archive/migrations/manual_review');
const EHG_ENGINEER_DIR = path.join(__dirname, '../supabase/ehg_engineer/migrations');
const EHG_APP_DIR = path.join(__dirname, '../supabase/ehg_app/migrations');

// Manual categorization based on content review
const CATEGORIZATION = {
  EHG_ENGINEER: [
    // Confirmed LEO Protocol / EHG_Engineer
    '20250830084714_schema_vision_qa_schema.sql',
    '20250922112147_schema_context_learning_schema.sql',
    '20250922112147_schema_plan_supervisor_schema.sql',
    '20250922112148_schema_create_learning_tables.sql',
    '20250922112148_schema_ui_validation_schema.sql',
    '20250922112152_schema_supervisor-migration-clipboard.sql',
    '20250922112153_schema_ui_validation_schema.sql',
    '20250926140217_schema_leo_commit_rules.sql',
    '20250927084714_schema_sub_agent_tracking.sql',
    '20250927204832_schema_uat-structured-reports.sql',
    '20250929104248_rls_fix-uat-rls-policies.sql',
    '20250929111909_alter_uat-active-test-tracking.sql',
    '20250929123745_insert-manual-test-cases.sql',
    '20250929132950_create-set-active-test-function.sql',
    '20250929140035_delete-manual-uat-tests.sql',
    '20250929140701_rls_allow-uat-cases-insert.sql',
    '20250929141045_safe-delete-uat-case-function.sql',
    '20250930175249_create-gate-integrity-view.sql',
    '20251001083855_alter_add-uat-sort-order.sql',
    '20251004113408_schema_create-test-coverage-policies.sql',
    '20251004155303_create-rls-auditor-role.sql',
    '20251004231128_alter_enhance_sd_testing_status.sql',
    // Rollback/verification scripts (EHG_Engineer)
    '20250922112148_alter_rollback-2025-01-17-user-stories.sql',
    '20250922112148_verify-2025-01-17-user-stories.sql',
    '20250929104139_verify-uat-data.sql',
    '20250922112148_ingest_governance_views.sql',
  ],

  EHG_APP: [
    // APP001 remnants
    '20250903080304_.sql',
    '20250903080304_alter_.sql',
    '20250903080304_schema_.sql',
  ],

  MIXED: [
    // Mixed database references - need manual decision
    '20250922112148_schema_2025-09-emb-message-bus.sql',
    '20250922185519_schema_compatibility_check.sql',
    '20250922185722_schema_vh-bridge-tables.sql',
    '20250927175653_schema_uat-tracking-schema.sql',
  ]
};

/**
 * Move file to target directory
 */
function moveFile(filename, targetDir, dryRun = true) {
  const sourcePath = path.join(MANUAL_REVIEW_DIR, filename);
  const targetPath = path.join(targetDir, filename);

  if (!fs.existsSync(sourcePath)) {
    console.log(`⚠ File not found: ${filename}`);
    return { success: false, reason: 'not_found' };
  }

  if (dryRun) {
    console.log(`[DRY RUN] Would move:`);
    console.log(`  FROM: archive/migrations/manual_review/${filename}`);
    console.log(`  TO:   ${path.relative(path.join(__dirname, '..'), targetPath)}`);
    return { success: true, dryRun: true };
  }

  try {
    fs.renameSync(sourcePath, targetPath);
    console.log(`✓ Moved ${filename}`);
    return { success: true };
  } catch (error) {
    console.error(`✗ Failed to move ${filename}: ${error.message}`);
    return { success: false, reason: error.message };
  }
}

/**
 * Main execution
 */
function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--execute');

  console.log('=== Move Reviewed Migrations ===\n');

  if (dryRun) {
    console.log('⚠️  DRY RUN MODE - No files will be moved\n');
  } else {
    console.log('⚠️  EXECUTE MODE - Files will be moved\n');
  }

  const results = {
    EHG_ENGINEER: { success: 0, failed: 0 },
    EHG_APP: { success: 0, failed: 0 },
    MIXED: { success: 0, failed: 0 }
  };

  // Move EHG_Engineer files
  console.log('=== Moving to EHG_Engineer ===');
  for (const filename of CATEGORIZATION.EHG_ENGINEER) {
    const result = moveFile(filename, EHG_ENGINEER_DIR, dryRun);
    if (result.success && !result.dryRun) {
      results.EHG_ENGINEER.success++;
    } else if (!result.success) {
      results.EHG_ENGINEER.failed++;
    }
  }
  console.log(`Total: ${CATEGORIZATION.EHG_ENGINEER.length} files\n`);

  // Move EHG_App files
  console.log('=== Moving to EHG App ===');
  for (const filename of CATEGORIZATION.EHG_APP) {
    const result = moveFile(filename, EHG_APP_DIR, dryRun);
    if (result.success && !result.dryRun) {
      results.EHG_APP.success++;
    } else if (!result.success) {
      results.EHG_APP.failed++;
    }
  }
  console.log(`Total: ${CATEGORIZATION.EHG_APP.length} files\n`);

  // Report MIXED files (keep in manual_review for now)
  console.log('=== MIXED Files (Keeping in manual_review) ===');
  for (const filename of CATEGORIZATION.MIXED) {
    console.log(`  ⚠ ${filename} - Requires manual decision`);
  }
  console.log(`Total: ${CATEGORIZATION.MIXED.length} files\n`);

  // Summary
  console.log('=== Summary ===');
  console.log(`EHG_Engineer: ${CATEGORIZATION.EHG_ENGINEER.length} files to move`);
  console.log(`EHG App: ${CATEGORIZATION.EHG_APP.length} files to move`);
  console.log(`Mixed (manual review): ${CATEGORIZATION.MIXED.length} files`);

  if (!dryRun) {
    console.log(`\nMoved: ${results.EHG_ENGINEER.success + results.EHG_APP.success} files`);
    console.log(`Failed: ${results.EHG_ENGINEER.failed + results.EHG_APP.failed} files`);
  }

  if (dryRun) {
    console.log('\n💡 To execute these moves, run:');
    console.log('   node scripts/move-reviewed-migrations.cjs --execute');
  } else {
    console.log('\n✅ Migration moves complete!');
    console.log('\nNext steps:');
    console.log('1. Review remaining MIXED files');
    console.log('2. Update manifests');
    console.log('3. Verify migration counts');
  }

  // Show files remaining in manual_review
  if (!dryRun) {
    const remainingFiles = fs.readdirSync(MANUAL_REVIEW_DIR)
      .filter(f => f.endsWith('.sql'));
    console.log(`\nRemaining in manual_review: ${remainingFiles.length} files`);
  }
}

if (require.main === module) {
  main();
}

module.exports = { CATEGORIZATION };
