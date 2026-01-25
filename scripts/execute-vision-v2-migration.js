#!/usr/bin/env node

/**
 * Execute Vision V2 Reset and Seed Migration
 *
 * This script executes the Vision V2 migration which:
 * 1. Creates governance_archive schema with restore functions
 * 2. Archives all existing SDs and PRDs
 * 3. Clears main strategic_directives and product_requirements_v2 tables
 * 4. Seeds 9 new Vision V2 SDs (1 parent + 8 children)
 * 5. Adds LEO protocol sections for Vision V2 enforcement
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createDatabaseClient } from '../lib/supabase-connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log('========================================');
  console.log('VISION V2 RESET AND SEED MIGRATION');
  console.log('========================================\n');

  // Read migration file
  const migrationPath = path.join(__dirname, '../database/migrations/20251213_vision_v2_reset_and_seed.sql');
  console.log(`Reading migration file: ${migrationPath}\n`);

  if (!fs.existsSync(migrationPath)) {
    console.error(`❌ Migration file not found: ${migrationPath}`);
    process.exit(1);
  }

  const sqlContent = fs.readFileSync(migrationPath, 'utf8');
  console.log(`✅ Migration file loaded (${sqlContent.length} bytes)\n`);

  // Connect to database
  console.log('Connecting to EHG_Engineer database...');
  const client = await createDatabaseClient('engineer', { verify: true });
  console.log('✅ Connected to database\n');

  try {
    console.log('Executing migration as single transaction...\n');

    // The migration file contains BEGIN/COMMIT, so we execute it as-is
    // We need to handle RAISE NOTICE statements which are inside DO blocks
    await client.query(sqlContent);

    console.log('\n========================================');
    console.log('MIGRATION EXECUTION COMPLETE');
    console.log('========================================\n');

    // Query verification counts
    console.log('Querying verification counts...\n');

    const visionSDs = await client.query(`
      SELECT COUNT(*) as count
      FROM strategic_directives
      WHERE id LIKE 'SD-VISION-V2-%'
    `);
    console.log(`✅ Vision V2 SDs created: ${visionSDs.rows[0].count}`);

    const parentSDs = await client.query(`
      SELECT COUNT(*) as count
      FROM strategic_directives
      WHERE id LIKE 'SD-VISION-V2-%' AND relationship_type = 'parent'
    `);
    console.log(`   - Parent orchestrator: ${parentSDs.rows[0].count}`);

    const childSDs = await client.query(`
      SELECT COUNT(*) as count
      FROM strategic_directives
      WHERE id LIKE 'SD-VISION-V2-%' AND relationship_type = 'child'
    `);
    console.log(`   - Child SDs: ${childSDs.rows[0].count}`);

    const archivedSDs = await client.query(`
      SELECT COUNT(*) as count
      FROM governance_archive.strategic_directives
    `);
    console.log(`\n✅ Archived SDs: ${archivedSDs.rows[0].count}`);

    const archivedPRDs = await client.query(`
      SELECT COUNT(*) as count
      FROM governance_archive.product_requirements
    `);
    console.log(`✅ Archived PRDs: ${archivedPRDs.rows[0].count}`);

    // Display created SDs
    console.log('\n========================================');
    console.log('CREATED VISION V2 STRATEGIC DIRECTIVES');
    console.log('========================================\n');

    const createdSDs = await client.query(`
      SELECT id, title, relationship_type, priority, sequence_rank, status
      FROM strategic_directives
      WHERE id LIKE 'SD-VISION-V2-%'
      ORDER BY sequence_rank
    `);

    createdSDs.rows.forEach(sd => {
      console.log(`${sd.id} (${sd.relationship_type})`);
      console.log(`  Title: ${sd.title}`);
      console.log(`  Priority: ${sd.priority} | Sequence: ${sd.sequence_rank} | Status: ${sd.status}\n`);
    });

    console.log('========================================');
    console.log('ROLLBACK INSTRUCTIONS');
    console.log('========================================\n');
    console.log('To restore all archived data:');
    console.log('  SELECT * FROM governance_archive.restore_all_from_archive();\n');
    console.log('To restore a single SD:');
    console.log('  SELECT governance_archive.restore_sd_from_archive(\'SD-XXX-YYY\');\n');

    console.log('========================================');
    console.log('NEXT STEPS');
    console.log('========================================\n');
    console.log('1. Regenerate CLAUDE files with Vision V2 sections:');
    console.log('   node scripts/generate-claude-md-from-db.js\n');
    console.log('2. Run SD queue to see Vision V2 SDs:');
    console.log('   npm run sd:next\n');
    console.log('3. Start with parent orchestrator:');
    console.log('   SD-VISION-V2-000: Vision V2 Chairman\'s Operating System Foundation\n');

    console.log('✅ Migration completed successfully!\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('\nError code:', error.code);
    console.error('\nError position:', error.position);

    if (error.position) {
      const position = parseInt(error.position);
      const errorContext = sqlContent.substring(Math.max(0, position - 200), position + 200);
      console.error('\nError context:');
      console.error('...' + errorContext + '...');
    }

    process.exit(1);
  } finally {
    await client.end();
    console.log('Database connection closed.');
  }
}

main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
