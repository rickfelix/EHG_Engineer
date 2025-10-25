#!/usr/bin/env node
/**
 * PRD Diagnostic Toolkit
 * Comprehensive troubleshooting and health checking for PRD system
 */

import { createClient } from '@supabase/supabase-js';
import { program } from 'commander';
import dotenv from 'dotenv';
import chalk from 'chalk';
import { validatePRDContent } from './prd-format-validator.js';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

program
  .command('health-check')
  .description('Run comprehensive PRD system health check')
  .action(runHealthCheck);

program
  .command('sd-check <sd-id>')
  .description('Check PRD readiness for specific Strategic Directive')
  .action(checkSDReadiness);

program
  .command('table-status')
  .description('Check status of all PRD-related tables')
  .action(checkTableStatus);

program
  .command('orphaned-prds')
  .description('Find PRDs without corresponding Strategic Directives')
  .action(findOrphanedPRDs);

program
  .command('format-report')
  .description('Generate detailed format compliance report')
  .action(generateFormatReport);

program
  .command('fix-suggestions <sd-id>')
  .description('Get specific fix suggestions for SD PRD issues')
  .action(getFixSuggestions);

program.parse();

/**
 * Run comprehensive health check
 */
async function runHealthCheck() {
  console.log(chalk.blue('🔍 PRD System Health Check'));
  console.log(chalk.gray('=' .repeat(50)));

  const checks = [
    { name: 'Database Connection', fn: checkDatabaseConnection },
    { name: 'PRD Tables Existence', fn: checkTablesExist },
    { name: 'PRD Format Compliance', fn: checkFormatCompliance },
    { name: 'SD-PRD Mapping', fn: checkSDPRDMapping },
    { name: 'Orphaned Records', fn: checkOrphanedRecords },
    { name: 'Content Quality', fn: checkContentQuality }
  ];

  const results = [];

  for (const check of checks) {
    try {
      console.log(chalk.yellow(`\\n🔄 ${check.name}...`));
      const result = await check.fn();
      results.push({ name: check.name, ...result });

      if (result.status === 'pass') {
        console.log(chalk.green(`✅ ${check.name}: PASS`));
      } else if (result.status === 'warn') {
        console.log(chalk.yellow(`⚠️  ${check.name}: WARNING`));
      } else {
        console.log(chalk.red(`❌ ${check.name}: FAIL`));
      }

      if (result.details) {
        console.log(chalk.gray(`   ${result.details}`));
      }
    } catch (error) {
      console.log(chalk.red(`❌ ${check.name}: ERROR - ${error.message}`));
      results.push({ name: check.name, status: 'error', error: error.message });
    }
  }

  // Summary
  console.log(chalk.cyan('\\n📊 Health Check Summary:'));
  const passed = results.filter(r => r.status === 'pass').length;
  const warned = results.filter(r => r.status === 'warn').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const errors = results.filter(r => r.status === 'error').length;

  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ⚠️  Warnings: ${warned}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   🚫 Errors: ${errors}`);

  if (failed + errors > 0) {
    console.log(chalk.red('\\n🔧 System requires attention'));
    console.log(chalk.cyan('Run specific diagnostic commands for detailed fixes'));
  } else {
    console.log(chalk.green('\\n✅ PRD system is healthy'));
  }
}

/**
 * Check SD readiness for orchestrator execution
 */
async function checkSDReadiness(sdId) {
  console.log(chalk.blue(`🔍 PRD Readiness Check for ${sdId}`));
  console.log(chalk.gray('=' .repeat(50)));

  try {
    // Check if SD exists
    const { data: sd, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', sdId)
      .single();

    if (sdError || !sd) {
      console.log(chalk.red(`❌ Strategic Directive ${sdId} not found`));
      return;
    }

    console.log(chalk.green(`✅ Strategic Directive found: ${sd.title}`));
    console.log(`   Status: ${sd.status}`);
    console.log(`   Priority: ${sd.priority}`);

    // Check if PRD exists
    const { data: prd, error: prdError } = await supabase
      .from('product_requirements_v2')
      .select('*')
      .eq('directive_id', sdId)
      .single();

    if (prdError || !prd) {
      console.log(chalk.red(`❌ No PRD found for ${sdId}`));
      console.log(chalk.yellow('\\n🔧 Fix suggestions:'));
      console.log(chalk.cyan(`   1. node scripts/unified-consolidated-prd.js ${sdId}`));
      console.log(chalk.cyan(`   2. node scripts/generate-prd-from-sd.js --sd-id ${sdId}`));
      return;
    }

    console.log(chalk.green(`✅ PRD found: ${prd.id}`));

    // Validate PRD content
    const validation = validatePRDContent(prd.content, prd.id);

    if (validation.success) {
      console.log(chalk.green('✅ PRD format is valid'));
      console.log(`   User stories: ${validation.data.user_stories?.length || 0}`);
      console.log(`   Is consolidated: ${validation.data.is_consolidated || false}`);
    } else {
      console.log(chalk.red('❌ PRD format is invalid'));
      validation.errors.forEach(error => {
        console.log(chalk.red(`   • ${error}`));
      });

      console.log(chalk.yellow('\\n🔧 Fix suggestions:'));
      console.log(chalk.cyan('   1. node scripts/prd-format-validator.js --fix'));
      console.log(chalk.cyan(`   2. node scripts/unified-consolidated-prd.js ${sdId} --force`));
    }

    // Check orchestrator readiness
    console.log(chalk.cyan('\\n🚀 Orchestrator Readiness:'));
    if (validation.success) {
      console.log(chalk.green('✅ Ready for orchestrator execution'));
      console.log(chalk.cyan(`   Run: NODE_OPTIONS='--trace-warnings' node scripts/leo-orchestrator-enforced.js ${sdId}`));
    } else {
      console.log(chalk.red('❌ Not ready - fix PRD format first'));
    }

  } catch (error) {
    console.error(chalk.red('Error checking SD readiness:'), error.message);
  }
}

/**
 * Database connection check
 */
async function checkDatabaseConnection() {
  try {
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .select('count')
      .limit(1);

    if (error) throw error;
    return { status: 'pass', details: 'Database connection successful' };
  } catch (error) {
    return { status: 'fail', details: `Database connection failed: ${error.message}` };
  }
}

/**
 * Check if required tables exist
 */
async function checkTablesExist() {
  const requiredTables = [
    'product_requirements_v2',
    'strategic_directives_v2',
    'consolidated_backlog_v3'
  ];

  const results = [];
  for (const table of requiredTables) {
    try {
      const { error } = await supabase.from(table).select('count').limit(1);
      if (error && error.code === 'PGRST106') {
        results.push(`❌ ${table} - Not found`);
      } else {
        results.push(`✅ ${table} - OK`);
      }
    } catch (error) {
      results.push(`❌ ${table} - Error: ${error.message}`);
    }
  }

  const failed = results.filter(r => r.includes('❌')).length;
  const status = failed === 0 ? 'pass' : 'fail';
  return { status, details: results.join(', ') };
}

/**
 * Check PRD format compliance
 */
async function checkFormatCompliance() {
  const { data: prds, error } = await supabase
    .from('product_requirements_v2')
    .select('id, directive_id, content');

  if (error) throw error;

  let validCount = 0;
  let invalidCount = 0;

  for (const prd of prds) {
    const validation = validatePRDContent(prd.content, prd.id);
    if (validation.success) {
      validCount++;
    } else {
      invalidCount++;
    }
  }

  const total = prds.length;
  const complianceRate = total > 0 ? Math.round((validCount / total) * 100) : 100;

  if (complianceRate === 100) {
    return { status: 'pass', details: `All ${total} PRDs are format compliant` };
  } else if (complianceRate >= 80) {
    return { status: 'warn', details: `${complianceRate}% compliant (${validCount}/${total})` };
  } else {
    return { status: 'fail', details: `Only ${complianceRate}% compliant (${validCount}/${total})` };
  }
}

/**
 * Check SD-PRD mapping completeness
 */
async function checkSDPRDMapping() {
  // Get active SDs
  const { data: sds, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, status')
    .in('status', ['active', 'in_progress']);

  if (sdError) throw sdError;

  // Get PRDs
  const { data: prds, error: prdError } = await supabase
    .from('product_requirements_v2')
    .select('directive_id');

  if (prdError) throw prdError;

  const prdSDs = new Set(prds.map(p => p.directive_id));
  const missingSDs = sds.filter(sd => !prdSDs.has(sd.id));

  if (missingSDs.length === 0) {
    return { status: 'pass', details: `All ${sds.length} active SDs have PRDs` };
  } else {
    const missing = missingSDs.map(sd => sd.id).join(', ');
    return { status: 'warn', details: `${missingSDs.length} SDs missing PRDs: ${missing}` };
  }
}

/**
 * Check for orphaned records
 */
async function checkOrphanedRecords() {
  // PRDs without SDs
  const { data: prds, error: prdError } = await supabase
    .from('product_requirements_v2')
    .select('id, directive_id');

  if (prdError) throw prdError;

  const { data: sds, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id');

  if (sdError) throw sdError;

  const validSDIds = new Set(sds.map(sd => sd.id));
  const orphanedPRDs = prds.filter(prd => !validSDIds.has(prd.directive_id));

  if (orphanedPRDs.length === 0) {
    return { status: 'pass', details: 'No orphaned PRDs found' };
  } else {
    const orphaned = orphanedPRDs.map(p => p.id).slice(0, 3).join(', ');
    return {
      status: 'warn',
      details: `${orphanedPRDs.length} orphaned PRDs (e.g., ${orphaned})`
    };
  }
}

/**
 * Check content quality
 */
async function checkContentQuality() {
  const { data: prds, error } = await supabase
    .from('product_requirements_v2')
    .select('id, content');

  if (error) throw error;

  let qualityIssues = 0;
  let emptyContent = 0;

  for (const prd of prds) {
    if (!prd.content) {
      emptyContent++;
      continue;
    }

    try {
      const content = JSON.parse(prd.content);

      // Check for quality indicators
      if (!content.user_stories || content.user_stories.length === 0) {
        qualityIssues++;
      } else {
        // Check user story quality
        const hasQualityStories = content.user_stories.some(story =>
          story.acceptance_criteria && story.acceptance_criteria.length > 0
        );
        if (!hasQualityStories) {
          qualityIssues++;
        }
      }
    } catch (e) {
      qualityIssues++;
    }
  }

  const total = prds.length;
  const qualityRate = total > 0 ? Math.round(((total - qualityIssues - emptyContent) / total) * 100) : 100;

  if (qualityRate >= 90) {
    return { status: 'pass', details: `${qualityRate}% high-quality PRDs` };
  } else if (qualityRate >= 70) {
    return { status: 'warn', details: `${qualityRate}% quality, ${qualityIssues} issues, ${emptyContent} empty` };
  } else {
    return { status: 'fail', details: `Only ${qualityRate}% quality, ${qualityIssues} issues, ${emptyContent} empty` };
  }
}

/**
 * Generate detailed format compliance report
 */
async function generateFormatReport() {
  console.log(chalk.blue('📋 PRD Format Compliance Report'));
  console.log(chalk.gray('=' .repeat(50)));

  const { data: prds, error } = await supabase
    .from('product_requirements_v2')
    .select('id, directive_id, title, content, created_at');

  if (error) {
    console.error(chalk.red('Error fetching PRDs:'), error);
    return;
  }

  const categories = {
    valid: [],
    invalid: [],
    empty: [],
    warnings: []
  };

  for (const prd of prds) {
    if (!prd.content) {
      categories.empty.push(prd);
      continue;
    }

    const validation = validatePRDContent(prd.content, prd.id);

    if (validation.success) {
      if (validation.warnings.length > 0) {
        categories.warnings.push({ prd, validation });
      } else {
        categories.valid.push(prd);
      }
    } else {
      categories.invalid.push({ prd, validation });
    }
  }

  // Display results
  console.log(chalk.green(`\\n✅ Valid PRDs (${categories.valid.length}):`));
  categories.valid.forEach(prd => {
    console.log(`   ${prd.id} - ${prd.directive_id}`);
  });

  if (categories.warnings.length > 0) {
    console.log(chalk.yellow(`\\n⚠️  Valid with Warnings (${categories.warnings.length}):`));
    categories.warnings.forEach(({ prd, validation }) => {
      console.log(`   ${prd.id} - ${prd.directive_id}`);
      validation.warnings.forEach(warning => {
        console.log(chalk.yellow(`     • ${warning}`));
      });
    });
  }

  if (categories.invalid.length > 0) {
    console.log(chalk.red(`\\n❌ Invalid PRDs (${categories.invalid.length}):`));
    categories.invalid.forEach(({ prd, validation }) => {
      console.log(`   ${prd.id} - ${prd.directive_id}`);
      validation.errors.forEach(error => {
        console.log(chalk.red(`     • ${error}`));
      });
    });
  }

  if (categories.empty.length > 0) {
    console.log(chalk.gray(`\\n📝 Empty Content (${categories.empty.length}):`));
    categories.empty.forEach(prd => {
      console.log(`   ${prd.id} - ${prd.directive_id}`);
    });
  }
}

/**
 * Get fix suggestions for specific SD
 */
async function getFixSuggestions(sdId) {
  console.log(chalk.blue(`🔧 Fix Suggestions for ${sdId}`));
  console.log(chalk.gray('=' .repeat(50)));

  await checkSDReadiness(sdId);

  console.log(chalk.cyan('\\n📚 Available Tools:'));
  console.log('1. PRD Format Validator:');
  console.log(chalk.gray('   node scripts/prd-format-validator.js --fix'));

  console.log('2. Unified Consolidated PRD Generator:');
  console.log(chalk.gray(`   node scripts/unified-consolidated-prd.js ${sdId} --force`));

  console.log('3. Health Check:');
  console.log(chalk.gray('   node scripts/prd-diagnostic-toolkit.js health-check'));

  console.log('4. Full System Validation:');
  console.log(chalk.gray('   node scripts/prd-diagnostic-toolkit.js format-report'));
}

async function checkTableStatus() {
  console.log(chalk.blue('📊 PRD Table Status'));
  console.log(chalk.gray('=' .repeat(50)));

  const tables = [
    'product_requirements_v2',
    'prds', // deprecated but check anyway
    'strategic_directives_v2',
    'consolidated_backlog_v3'
  ];

  for (const table of tables) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select('count', { count: 'exact' });

      if (error) {
        console.log(chalk.red(`❌ ${table}: ${error.message}`));
      } else {
        const count = data?.length || 0;
        const status = table === 'prds' ? '(DEPRECATED)' : '';
        console.log(chalk.green(`✅ ${table}: ${count} records ${status}`));
      }
    } catch (error) {
      console.log(chalk.red(`❌ ${table}: ${error.message}`));
    }
  }
}

async function findOrphanedPRDs() {
  console.log(chalk.blue('🔍 Finding Orphaned PRDs'));
  console.log(chalk.gray('=' .repeat(50)));

  const result = await checkOrphanedRecords();
  console.log(result.details);

  if (result.status !== 'pass') {
    console.log(chalk.yellow('\\n🔧 To clean up orphaned PRDs:'));
    console.log(chalk.cyan('1. Review each orphaned PRD manually'));
    console.log(chalk.cyan('2. Either create missing SD or delete PRD'));
    console.log(chalk.cyan('3. Use Supabase dashboard for manual cleanup'));
  }
}