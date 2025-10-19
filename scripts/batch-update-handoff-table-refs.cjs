require('dotenv').config();
const fs = require('fs');
const path = require('path');

/**
 * Batch update all files to use sd_phase_handoffs instead of leo_handoff_executions
 * SD: SD-DATA-INTEGRITY-001
 * User Story: SD-DATA-INTEGRITY-001:US-003
 */

// Files to update (from audit)
const filesToUpdate = [
  './database/migrations/20251015_fix_progress_trigger_table_consolidation.sql',
  './database/migrations/20251016_fix_user_story_validation_check.sql',
  './database/migrations/test_function_update.sql',
  './scripts/apply-progress-fix-direct.js',
  './scripts/check-handoff-executions.js',
  './scripts/check-handoff-schema.js',
  './scripts/check-sd-completion-status.mjs',
  './scripts/complete-handoffs-knowledge-001.js',
  './scripts/create-exec-plan-handoff-eva-pulse.mjs',
  './scripts/create-missing-handoffs-knowledge-001.js',
  './scripts/create-retrospective-sd-reconnect-002.mjs',
  './scripts/execute-sd-leo-002.js',
  './scripts/get-sd-details.js',
  './scripts/hook-subagent-activator.js',
  './scripts/leo-cleanup.js',
  './scripts/leo-protocol-orchestrator.js',
  './scripts/modules/safe-insert.js',
  './scripts/sd-leo-002-retrospective.js',
  './scripts/test-migration-012.js',
  './scripts/test-schema-validation.js',
  './scripts/validate-system-consistency.js',
  './scripts/verify-handoff-lead-to-plan.js',
  './scripts/verify-handoff-plan-to-exec.js',
  './scripts/verify-sd-test-mock-001-completion.js',
  './scripts/verify-tier-artifacts.js',
];

// Field name mappings
const fieldMappings = {
  'initiated_at': 'created_at',
  'from_agent': 'from_phase',
  'to_agent': 'to_phase',
  'validation_score': 'metadata',
};

let updatedFiles = 0;
let skippedFiles = 0;
let errors = [];

console.log('=== Batch Update: leo_handoff_executions → sd_phase_handoffs ===\n');

filesToUpdate.forEach((filePath) => {
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  SKIP: ${filePath} (not found)`);
      skippedFiles++;
      return;
    }

    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;

    // Replace table name
    if (content.includes('leo_handoff_executions')) {
      content = content.replace(/leo_handoff_executions/g, 'sd_phase_handoffs');
      modified = true;
    }

    // Replace field names (context-aware)
    Object.entries(fieldMappings).forEach(([oldField, newField]) => {
      // Only replace in SQL/JS contexts (not in comments or strings about legacy data)
      const pattern = new RegExp(`\\b${oldField}\\b`, 'g');
      if (content.match(pattern)) {
        // Check if it's in a meaningful context (not just documentation)
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
          if (line.includes(oldField) && !line.trim().startsWith('//') && !line.trim().startsWith('*')) {
            // This is actual code, consider replacing
            // For now, we'll just report it for manual review
            console.log(`   ⚠️  Manual review needed for field '${oldField}' in ${path.basename(filePath)}:${idx + 1}`);
          }
        });
      }
    });

    if (modified) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`✅ UPDATED: ${filePath}`);
      updatedFiles++;
    } else {
      console.log(`   SKIP: ${filePath} (no changes needed)`);
      skippedFiles++;
    }

  } catch (error) {
    console.error(`❌ ERROR: ${filePath} - ${error.message}`);
    errors.push({ file: filePath, error: error.message });
  }
});

console.log('\n=== Update Summary ===');
console.log(`✅ Updated: ${updatedFiles} files`);
console.log(`⚠️  Skipped: ${skippedFiles} files`);
console.log(`❌ Errors: ${errors.length} files`);

if (errors.length > 0) {
  console.log('\n=== Errors ===');
  errors.forEach(({ file, error }) => {
    console.log(`  ${file}: ${error}`);
  });
}

console.log('\n✅ Batch update complete!');
console.log('Next steps:');
console.log('1. Review updated files for correctness');
console.log('2. Test handoff creation with unified-handoff-system.js');
console.log('3. Commit changes');
