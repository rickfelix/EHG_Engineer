#!/usr/bin/env node

/**
 * Database Health Dashboard
 *
 * Quick overview of database health metrics
 * Lightweight alternative to comprehensive validation
 *
 * Usage: node scripts/database-health-dashboard.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function getMetrics() {
  // Strategic Directives - use only columns that exist
  const { data: sds, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, status, priority, current_phase, created_at, updated_at');

  // PRDs - use only columns that exist
  const { data: prds, error: prdError } = await supabase
    .from('product_requirements_v2')
    .select('id, status, directive_id');

  // User Stories - use only columns that exist
  const { data: stories, error: storyError } = await supabase
    .from('user_stories')
    .select('id, status, prd_id');

  // Handoffs - use only columns that exist
  const { data: handoffs, error: handoffError } = await supabase
    .from('sd_phase_handoffs')
    .select('id, sd_id, handoff_type');

  if (sdError) {
    console.error('❌ Error fetching strategic directives:', sdError.message);
  }
  if (prdError) {
    console.error('❌ Error fetching PRDs:', prdError.message);
  }
  if (storyError) {
    console.error('❌ Error fetching user stories:', storyError.message);
  }
  if (handoffError) {
    console.error('❌ Error fetching handoffs:', handoffError.message);
  }

  if (sdError || prdError || storyError || handoffError) {
    return null;
  }

  return { sds, prds, stories, handoffs };
}

function displayDashboard(metrics) {
  const { sds, prds, stories, handoffs } = metrics;

  console.log('\n' + '═'.repeat(80));
  console.log('                    DATABASE HEALTH DASHBOARD');
  console.log('═'.repeat(80));
  console.log(`Generated: ${new Date().toLocaleString()}`);
  console.log('═'.repeat(80));

  // Strategic Directives Summary
  console.log('\n📋 STRATEGIC DIRECTIVES');
  console.log('─'.repeat(80));
  console.log(`   Total: ${sds.length}`);

  const sdsByStatus = {};
  sds.forEach(sd => {
    sdsByStatus[sd.status || 'unknown'] = (sdsByStatus[sd.status || 'unknown'] || 0) + 1;
  });
  console.log('   By Status:');
  Object.entries(sdsByStatus).forEach(([status, count]) => {
    console.log(`     ${status.padEnd(15)}: ${count}`);
  });

  const sdsByPhase = {};
  sds.forEach(sd => {
    const phase = sd.current_phase || 'none';
    sdsByPhase[phase] = (sdsByPhase[phase] || 0) + 1;
  });
  console.log('   By Phase:');
  Object.entries(sdsByPhase).forEach(([phase, count]) => {
    console.log(`     ${phase.padEnd(15)}: ${count}`);
  });

  // PRDs Summary
  console.log('\n📄 PRODUCT REQUIREMENTS');
  console.log('─'.repeat(80));
  console.log(`   Total: ${prds.length}`);

  const prdsByStatus = {};
  prds.forEach(prd => {
    prdsByStatus[prd.status || 'unknown'] = (prdsByStatus[prd.status || 'unknown'] || 0) + 1;
  });
  console.log('   By Status:');
  Object.entries(prdsByStatus).forEach(([status, count]) => {
    console.log(`     ${status.padEnd(15)}: ${count}`);
  });

  const orphanedPrds = prds.filter(prd => !prd.directive_id);
  if (orphanedPrds.length > 0) {
    console.log(`   ⚠️  Orphaned (no SD): ${orphanedPrds.length}`);
  }

  // User Stories Summary
  console.log('\n📝 USER STORIES');
  console.log('─'.repeat(80));
  console.log(`   Total: ${stories.length}`);

  const storiesByStatus = {};
  stories.forEach(story => {
    storiesByStatus[story.status || 'unknown'] = (storiesByStatus[story.status || 'unknown'] || 0) + 1;
  });
  console.log('   By Status:');
  Object.entries(storiesByStatus).forEach(([status, count]) => {
    console.log(`     ${status.padEnd(15)}: ${count}`);
  });

  // Note: test_coverage_data column does not exist in user_stories table
  // This check is disabled until the column is added to the schema
  // const implementedWithoutTests = stories.filter(s =>
  //   s.status === 'implemented' &&
  //   (!s.test_coverage_data || (typeof s.test_coverage_data === 'object' && Object.keys(s.test_coverage_data).length === 0))
  // );
  // if (implementedWithoutTests.length > 0) {
  //   console.log(`   ⚠️  Implemented w/o tests: ${implementedWithoutTests.length}`);
  // }

  // Handoffs Summary
  console.log('\n🔄 PHASE HANDOFFS');
  console.log('─'.repeat(80));
  console.log(`   Total: ${handoffs.length}`);

  const handoffsByType = {};
  handoffs.forEach(h => {
    handoffsByType[h.handoff_type || 'unknown'] = (handoffsByType[h.handoff_type || 'unknown'] || 0) + 1;
  });
  console.log('   By Type:');
  Object.entries(handoffsByType).forEach(([type, count]) => {
    console.log(`     ${type.padEnd(20)}: ${count}`);
  });

  // Health Indicators
  console.log('\n🏥 HEALTH INDICATORS');
  console.log('─'.repeat(80));

  const warnings = [];
  const errors = [];

  // Check for orphaned PRDs
  if (orphanedPrds.length > 0) {
    warnings.push(`${orphanedPrds.length} orphaned PRDs`);
  }

  // Check for stale active SDs (>30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const staleSds = sds.filter(sd =>
    (sd.status === 'active' || sd.status === 'in_progress') &&
    new Date(sd.updated_at) < thirtyDaysAgo
  );
  if (staleSds.length > 0) {
    warnings.push(`${staleSds.length} active SDs stale for >30 days`);
  }

  // Check for SDs without PRDs (when in PLAN/EXEC)
  const sdIds = new Set(sds.map(sd => sd.id));
  const sdIdsWithPrds = new Set(prds.map(prd => prd.directive_id));
  const sdsInPlanExecWithoutPrds = sds.filter(sd =>
    (sd.current_phase === 'PLAN' || sd.current_phase === 'EXEC') &&
    !sdIdsWithPrds.has(sd.id)
  );
  if (sdsInPlanExecWithoutPrds.length > 0) {
    warnings.push(`${sdsInPlanExecWithoutPrds.length} SDs in PLAN/EXEC without PRDs`);
  }

  if (errors.length === 0 && warnings.length === 0) {
    console.log('   ✅ All checks passed - database is healthy!');
  } else {
    if (errors.length > 0) {
      console.log('   ❌ ERRORS:');
      errors.forEach(err => console.log(`      • ${err}`));
    }
    if (warnings.length > 0) {
      console.log('   ⚠️  WARNINGS:');
      warnings.forEach(warn => console.log(`      • ${warn}`));
    }
  }

  // Calculate health score
  const errorPenalty = errors.length * 15;
  const warningPenalty = warnings.length * 5;
  const healthScore = Math.max(0, 100 - errorPenalty - warningPenalty);

  console.log(`\n   📊 Health Score: ${healthScore}/100`);

  // Quick Actions
  console.log('\n💡 QUICK ACTIONS');
  console.log('─'.repeat(80));
  console.log('   Comprehensive Scan:');
  console.log('     npm run db:validate');
  console.log('');
  console.log('   Generate Fix Scripts:');
  console.log('     node scripts/generate-database-fixes.js all');
  console.log('');
  console.log('   View SDs:');
  console.log('     http://localhost:3000/strategic-directives');

  console.log('\n' + '═'.repeat(80) + '\n');
}

async function main() {
  console.log('🔍 Fetching database metrics...');

  const metrics = await getMetrics();
  if (!metrics) {
    console.error('\n❌ Failed to fetch metrics');
    process.exit(1);
  }

  displayDashboard(metrics);
  process.exit(0);
}

main();
