#!/usr/bin/env node
/**
 * Query Untested Strategic Directives
 * SD-TEST-001: Work-down plan for SD testing
 *
 * Usage:
 *   node scripts/query-untested-sds.js [options]
 *
 * Options:
 *   --all          Show all SDs (both tested and untested)
 *   --tested-only  Show only tested SDs
 *   --limit N      Limit results to N rows (default: 20)
 *   --priority P   Filter by priority (critical, high, medium, low)
 *   --app NAME     Filter by target_application
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

async function queryUntestedSDs(options = {}) {
  const {
    showAll = false,
    testedOnly = false,
    limit = 20,
    priority = null,
    targetApp = null
  } = options;

  console.log('🔍 Querying Strategic Directives Testing Status...\n');

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  try {
    // Query the v_untested_sds view
    let query = supabase
      .from('v_untested_sds')
      .select('*')
      .limit(limit);

    // Apply filters
    if (!showAll) {
      if (testedOnly) {
        query = query.eq('tested', true);
      } else {
        query = query.eq('tested', false);
      }
    }

    if (priority) {
      query = query.eq('priority', priority);
    }

    if (targetApp) {
      query = query.eq('target_application', targetApp);
    }

    // Execute query
    const { data, error } = await query;

    if (error) {
      if (error.message.includes('does not exist')) {
        console.log('❌ View v_untested_sds does not exist\n');
        console.log('Migration required! Run:');
        console.log('  node scripts/verify-sd-testing-status-migration.js\n');
        console.log('See: scripts/MIGRATION-INSTRUCTIONS-sd-testing-status.md\n');
        process.exit(1);
      } else {
        throw error;
      }
    }

    // Display results
    if (!data || data.length === 0) {
      console.log('✅ No SDs found matching criteria\n');
      return;
    }

    console.log(`📊 Found ${data.length} Strategic Directives:\n`);
    console.log('═'.repeat(100));
    console.log('Rank | Tested | SD-ID            | Priority | Phase | Progress | Title');
    console.log('═'.repeat(100));

    data.forEach((sd) => {
      const rank = String(sd.work_down_rank || '-').padEnd(4);
      const tested = sd.tested ? '✅' : '❌';
      const id = sd.id.padEnd(16);
      const priority = sd.priority.toUpperCase().padEnd(8);
      const phase = (sd.current_phase || 'N/A').padEnd(5);
      const progress = String(sd.progress || 0).padStart(3) + '%';
      const title = sd.title.length > 40 ? sd.title.substring(0, 37) + '...' : sd.title;

      console.log(`${rank} | ${tested}    | ${id} | ${priority} | ${phase} | ${progress} | ${title}`);
    });

    console.log('═'.repeat(100));
    console.log();

    // Summary statistics
    const testedCount = data.filter(sd => sd.tested).length;
    const untestedCount = data.filter(sd => !sd.tested).length;
    const avgPassRate = data
      .filter(sd => sd.tested && sd.test_pass_rate > 0)
      .reduce((sum, sd) => sum + sd.test_pass_rate, 0) / (testedCount || 1);

    console.log('📈 Summary:');
    console.log(`   Total SDs: ${data.length}`);
    console.log(`   Tested: ${testedCount} (${((testedCount / data.length) * 100).toFixed(1)}%)`);
    console.log(`   Untested: ${untestedCount} (${((untestedCount / data.length) * 100).toFixed(1)}%)`);
    if (testedCount > 0) {
      console.log(`   Avg Pass Rate: ${avgPassRate.toFixed(1)}%`);
    }
    console.log();

    // Next in queue
    if (!testedOnly && !showAll) {
      const nextSD = data.find(sd => !sd.tested && sd.work_down_rank === 1);
      if (nextSD) {
        console.log('🎯 Next SD to Test:');
        console.log(`   ID: ${nextSD.id}`);
        console.log(`   Title: ${nextSD.title}`);
        console.log(`   Priority: ${nextSD.priority} (score: ${nextSD.testing_priority})`);
        console.log(`   Status: ${nextSD.status}`);
        console.log(`   Phase: ${nextSD.current_phase}`);
        console.log();
        console.log('💡 To test this SD, run:');
        console.log(`   node scripts/qa-engineering-director-enhanced.js ${nextSD.id}`);
        console.log();
      }
    }

  } catch (err) {
    console.error('❌ Query failed:', err.message);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  showAll: args.includes('--all'),
  testedOnly: args.includes('--tested-only'),
  limit: parseInt(args.find(arg => arg.startsWith('--limit'))?.split('=')[1] || '20'),
  priority: args.find(arg => arg.startsWith('--priority'))?.split('=')[1] || null,
  targetApp: args.find(arg => arg.startsWith('--app'))?.split('=')[1] || null
};

queryUntestedSDs(options);
