#!/usr/bin/env node
/**
 * 🔍 Strategic Directives Query Utility
 *
 * Quick access to SD data with various filters
 *
 * Usage:
 *   node scripts/query-strategic-directives.js                    # Summary
 *   node scripts/query-strategic-directives.js --status active    # By status
 *   node scripts/query-strategic-directives.js --phase EXEC       # By phase
 *   node scripts/query-strategic-directives.js --id SD-XXX-001    # By ID
 *   node scripts/query-strategic-directives.js --recent 20        # Recent N SDs
 *   node scripts/query-strategic-directives.js --count            # Just count
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

async function main() {
  const args = process.argv.slice(2);
  const client = await createDatabaseClient('engineer', { verify: false });

  try {
    // Parse arguments
    const options = {
      status: args.includes('--status') ? args[args.indexOf('--status') + 1] : null,
      phase: args.includes('--phase') ? args[args.indexOf('--phase') + 1] : null,
      id: args.includes('--id') ? args[args.indexOf('--id') + 1] : null,
      recent: args.includes('--recent') ? parseInt(args[args.indexOf('--recent') + 1]) : null,
      count: args.includes('--count'),
      category: args.includes('--category') ? args[args.indexOf('--category') + 1] : null,
    };

    // Count only
    if (options.count) {
      const result = await client.query('SELECT COUNT(*) as total FROM strategic_directives_v2;');
      console.log(`\n📊 Total Strategic Directives: ${result.rows[0].total}\n`);
      return;
    }

    // Get by ID
    if (options.id) {
      const result = await client.query(
        'SELECT * FROM strategic_directives_v2 WHERE id = $1;',
        [options.id]
      );
      if (result.rows.length === 0) {
        console.log(`\n❌ No SD found with ID: ${options.id}\n`);
      } else {
        const sd = result.rows[0];
        console.log(`\n📋 Strategic Directive: ${sd.id}`);
        console.log('='.repeat(80));
        console.log(`Title: ${sd.title}`);
        console.log(`Status: ${sd.status}`);
        console.log(`Phase: ${sd.current_phase}`);
        console.log(`Category: ${sd.category}`);
        console.log(`Priority: ${sd.priority || 'N/A'}`);
        console.log(`Progress: ${sd.progress_percentage || 0}%`);
        console.log(`Created: ${sd.created_at}`);
        console.log(`Updated: ${sd.updated_at}`);
        console.log(`\nDescription:\n${sd.description}`);
        console.log(`\nScope:\n${sd.scope}`);
        console.log('='.repeat(80) + '\n');
      }
      return;
    }

    // Get by status
    if (options.status) {
      const result = await client.query(
        `SELECT id, title, current_phase, created_at::date as created
         FROM strategic_directives_v2
         WHERE status = $1
         ORDER BY created_at DESC;`,
        [options.status]
      );
      console.log(`\n📋 Strategic Directives with status: ${options.status}`);
      console.log('='.repeat(80));
      if (result.rows.length === 0) {
        console.log('⚠️ No SDs found');
      } else {
        result.rows.forEach((row, i) => {
          console.log(`${(i+1).toString().padStart(3)}. ${row.id}`);
          console.log(`     ${row.title.substring(0, 65)}`);
          console.log(`     Phase: ${row.current_phase} | Created: ${row.created}`);
        });
      }
      console.log('='.repeat(80));
      console.log(`Total: ${result.rows.length} SDs\n`);
      return;
    }

    // Get by phase
    if (options.phase) {
      const result = await client.query(
        `SELECT id, title, status, created_at::date as created
         FROM strategic_directives_v2
         WHERE current_phase = $1
         ORDER BY created_at DESC;`,
        [options.phase]
      );
      console.log(`\n📋 Strategic Directives in phase: ${options.phase}`);
      console.log('='.repeat(80));
      if (result.rows.length === 0) {
        console.log('⚠️ No SDs found');
      } else {
        result.rows.forEach((row, i) => {
          console.log(`${(i+1).toString().padStart(3)}. ${row.id}`);
          console.log(`     ${row.title.substring(0, 65)}`);
          console.log(`     Status: ${row.status} | Created: ${row.created}`);
        });
      }
      console.log('='.repeat(80));
      console.log(`Total: ${result.rows.length} SDs\n`);
      return;
    }

    // Get by category
    if (options.category) {
      const result = await client.query(
        `SELECT id, title, status, current_phase, created_at::date as created
         FROM strategic_directives_v2
         WHERE category = $1
         ORDER BY created_at DESC;`,
        [options.category]
      );
      console.log(`\n📋 Strategic Directives in category: ${options.category}`);
      console.log('='.repeat(80));
      if (result.rows.length === 0) {
        console.log('⚠️ No SDs found');
      } else {
        result.rows.forEach((row, i) => {
          console.log(`${(i+1).toString().padStart(3)}. ${row.id}`);
          console.log(`     ${row.title.substring(0, 65)}`);
          console.log(`     Status: ${row.status} | Phase: ${row.current_phase} | Created: ${row.created}`);
        });
      }
      console.log('='.repeat(80));
      console.log(`Total: ${result.rows.length} SDs\n`);
      return;
    }

    // Get recent N
    if (options.recent) {
      const result = await client.query(
        `SELECT id, title, status, current_phase, created_at::date as created
         FROM strategic_directives_v2
         ORDER BY created_at DESC
         LIMIT $1;`,
        [options.recent]
      );
      console.log(`\n📋 ${options.recent} Most Recent Strategic Directives`);
      console.log('='.repeat(80));
      result.rows.forEach((row, i) => {
        console.log(`${(i+1).toString().padStart(3)}. ${row.id}`);
        console.log(`     ${row.title.substring(0, 65)}`);
        console.log(`     Status: ${row.status} | Phase: ${row.current_phase} | Created: ${row.created}`);
      });
      console.log('='.repeat(80) + '\n');
      return;
    }

    // Default: Show summary
    console.log('\n📊 STRATEGIC DIRECTIVES SUMMARY');
    console.log('='.repeat(80));

    // Total count
    const totalResult = await client.query('SELECT COUNT(*) as total FROM strategic_directives_v2;');
    console.log(`\n📈 Total: ${totalResult.rows[0].total} Strategic Directives`);

    // Status breakdown
    const statusResult = await client.query(`
      SELECT status, COUNT(*) as count
      FROM strategic_directives_v2
      GROUP BY status
      ORDER BY count DESC;
    `);
    console.log('\n📊 By Status:');
    statusResult.rows.forEach(row => {
      console.log(`   ${row.status.padEnd(20)}: ${row.count.toString().padStart(3)} SDs`);
    });

    // Phase breakdown
    const phaseResult = await client.query(`
      SELECT current_phase, COUNT(*) as count
      FROM strategic_directives_v2
      GROUP BY current_phase
      ORDER BY count DESC
      LIMIT 10;
    `);
    console.log('\n🔄 By Phase (Top 10):');
    phaseResult.rows.forEach(row => {
      console.log(`   ${row.current_phase.padEnd(25)}: ${row.count.toString().padStart(3)} SDs`);
    });

    // Category breakdown
    const categoryResult = await client.query(`
      SELECT category, COUNT(*) as count
      FROM strategic_directives_v2
      GROUP BY category
      ORDER BY count DESC
      LIMIT 10;
    `);
    console.log('\n📁 By Category (Top 10):');
    categoryResult.rows.forEach(row => {
      console.log(`   ${row.category.padEnd(25)}: ${row.count.toString().padStart(3)} SDs`);
    });

    // Recent 5
    const recentResult = await client.query(`
      SELECT id, title, status, current_phase, created_at::date as created
      FROM strategic_directives_v2
      ORDER BY created_at DESC
      LIMIT 5;
    `);
    console.log('\n📋 5 Most Recent:');
    recentResult.rows.forEach((row, i) => {
      console.log(`   ${(i+1)}. ${row.id}`);
      console.log(`      ${row.title.substring(0, 60)}`);
      console.log(`      Status: ${row.status} | Phase: ${row.current_phase}`);
    });

    console.log('\n' + '='.repeat(80));
    console.log('\n💡 Usage Examples:');
    console.log('   node scripts/query-strategic-directives.js --status active');
    console.log('   node scripts/query-strategic-directives.js --phase EXEC_IMPLEMENTATION');
    console.log('   node scripts/query-strategic-directives.js --id SD-XXX-001');
    console.log('   node scripts/query-strategic-directives.js --recent 20');
    console.log('   node scripts/query-strategic-directives.js --category infrastructure');
    console.log('   node scripts/query-strategic-directives.js --count\n');

  } catch (error) {
    console.error('❌ Query failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
