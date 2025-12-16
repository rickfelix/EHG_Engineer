#!/usr/bin/env node
/**
 * Governance Preflight Check
 *
 * READ-ONLY verification that all governance systems are operational.
 * Run before creating SDs or generating vision briefs/visualizations.
 *
 * Checks:
 * - Required environment variables
 * - Supabase connectivity
 * - Storage bucket status (existence check only)
 * - Visualization provider availability
 *
 * Usage:
 *   node scripts/governance-preflight.js
 *   node scripts/governance-preflight.js --verbose
 *
 * @module governance-preflight
 * @version 1.0.0
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { getProviderInfo, ProviderMode } from './lib/visualization-provider.js';

dotenv.config();

// ============================================================================
// CONFIGURATION
// ============================================================================

const VERBOSE = process.argv.includes('--verbose');

// Required environment variables
const REQUIRED_VARS = [
  { name: 'OPENAI_API_KEY', purpose: 'Vision brief generation + visualization fallback' },
  { name: 'SUPABASE_SERVICE_ROLE_KEY', purpose: 'Write SD metadata, storage access' },
];

// Recommended (warn if missing)
const RECOMMENDED_VARS = [
  { name: 'GEMINI_API_KEY', purpose: 'Visualization primary provider (Gemini 2.5 Flash)' },
];

// Supabase connection vars (at least one set required)
const SUPABASE_VAR_SETS = [
  { url: 'EHG_SUPABASE_URL', key: 'EHG_SUPABASE_SERVICE_ROLE_KEY', label: 'EHG Database' },
  { url: 'NEXT_PUBLIC_SUPABASE_URL', key: 'SUPABASE_SERVICE_ROLE_KEY', label: 'Default Database' },
];

const STORAGE_BUCKET = 'vision-briefs';

// ============================================================================
// CHECK FUNCTIONS
// ============================================================================

const results = {
  passed: [],
  warnings: [],
  failed: [],
};

function pass(check, detail = '') {
  results.passed.push({ check, detail });
  console.log(`  ✅ ${check}${detail ? `: ${detail}` : ''}`);
}

function warn(check, detail, remediation = '') {
  results.warnings.push({ check, detail, remediation });
  console.log(`  ⚠️  ${check}: ${detail}`);
  if (remediation && VERBOSE) {
    console.log(`      → ${remediation}`);
  }
}

function fail(check, detail, remediation = '') {
  results.failed.push({ check, detail, remediation });
  console.log(`  ❌ ${check}: ${detail}`);
  if (remediation) {
    console.log(`      → ${remediation}`);
  }
}

// ============================================================================
// CHECK 1: Environment Variables
// ============================================================================

function checkEnvironmentVariables() {
  console.log('\n📋 CHECK 1: Environment Variables');
  console.log('─'.repeat(50));

  // Required vars
  for (const { name, purpose } of REQUIRED_VARS) {
    if (process.env[name]) {
      const masked = process.env[name].substring(0, 8) + '...';
      pass(name, VERBOSE ? `Set (${masked})` : 'Set');
    } else {
      fail(name, 'Missing', `Set ${name} in .env (${purpose})`);
    }
  }

  // Recommended vars
  for (const { name, purpose } of RECOMMENDED_VARS) {
    if (process.env[name]) {
      const masked = process.env[name].substring(0, 8) + '...';
      pass(name, VERBOSE ? `Set (${masked})` : 'Set');
    } else {
      warn(name, 'Not configured', `Optional: ${purpose}`);
    }
  }

  // Supabase connection (need at least one valid set)
  let hasSupabaseConfig = false;
  for (const { url, key, label } of SUPABASE_VAR_SETS) {
    if (process.env[url] && process.env[key]) {
      pass(`Supabase Config (${label})`, `${url} + ${key}`);
      hasSupabaseConfig = true;
      break;
    }
  }

  if (!hasSupabaseConfig) {
    fail('Supabase Config', 'No valid Supabase URL + Service Key pair found',
      'Set EHG_SUPABASE_URL + EHG_SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)');
  }
}

// ============================================================================
// CHECK 2: Supabase Connectivity
// ============================================================================

async function checkSupabaseConnectivity() {
  console.log('\n📋 CHECK 2: Supabase Connectivity');
  console.log('─'.repeat(50));

  // Find valid config
  let supabaseUrl = null;
  let supabaseKey = null;
  let configLabel = null;

  for (const { url, key, label } of SUPABASE_VAR_SETS) {
    if (process.env[url] && process.env[key]) {
      supabaseUrl = process.env[url];
      supabaseKey = process.env[key];
      configLabel = label;
      break;
    }
  }

  if (!supabaseUrl || !supabaseKey) {
    fail('Supabase Connection', 'No credentials available', 'Fix environment variables first');
    return null;
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Test query (READ-ONLY)
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .select('id')
      .limit(1);

    if (error) {
      fail('Database Query', error.message, 'Check credentials and RLS policies');
      return null;
    }

    pass('Database Connection', `${configLabel} - strategic_directives_v2 accessible`);
    return supabase;

  } catch (error) {
    fail('Database Connection', error.message, 'Verify Supabase URL and service key');
    return null;
  }
}

// ============================================================================
// CHECK 3: Storage Bucket Status
// ============================================================================

async function checkStorageBucket(supabase) {
  console.log('\n📋 CHECK 3: Storage Bucket Status');
  console.log('─'.repeat(50));

  if (!supabase) {
    fail('Storage Check', 'Skipped - no database connection', 'Fix database connection first');
    return;
  }

  try {
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();

    if (listError) {
      warn('Storage Access', `Cannot list buckets: ${listError.message}`,
        'May need storage admin permissions');
      return;
    }

    const bucketExists = buckets?.some(b => b.name === STORAGE_BUCKET);

    if (bucketExists) {
      pass(`Bucket "${STORAGE_BUCKET}"`, 'Exists and accessible');
    } else {
      warn(`Bucket "${STORAGE_BUCKET}"`, 'Does not exist',
        'Will be created on first visualization (requires storage permissions)');
    }

  } catch (error) {
    warn('Storage Check', error.message, 'Visualization may fail on first run');
  }
}

// ============================================================================
// CHECK 4: Visualization Provider
// ============================================================================

function checkVisualizationProvider() {
  console.log('\n📋 CHECK 4: Visualization Provider');
  console.log('─'.repeat(50));

  try {
    const providerInfo = getProviderInfo(ProviderMode.AUTO);

    if (!providerInfo.available) {
      fail('Visualization Provider', 'No provider available',
        'Set GEMINI_API_KEY or OPENAI_API_KEY');
      return;
    }

    pass('Provider Selected', providerInfo.name);
    pass('Model', providerInfo.model);

    if (VERBOSE) {
      console.log(`      Reason: ${providerInfo.reason}`);
    }

    // Warn if using fallback
    if (!process.env.GEMINI_API_KEY && process.env.OPENAI_API_KEY) {
      warn('Provider Fallback', 'Using OpenAI (GEMINI_API_KEY not set)',
        'Gemini is preferred primary; OpenAI costs more');
    }

  } catch (error) {
    fail('Visualization Provider', error.message, 'Check API key configuration');
  }
}

// ============================================================================
// SUMMARY
// ============================================================================

function printSummary() {
  console.log('\n');
  console.log('═'.repeat(60));

  const totalChecks = results.passed.length + results.warnings.length + results.failed.length;
  const passRate = Math.round((results.passed.length / totalChecks) * 100);

  if (results.failed.length === 0) {
    console.log('  🎉 GOVERNANCE PREFLIGHT: PASS');
    console.log('═'.repeat(60));
    console.log(`\n  ✅ ${results.passed.length} checks passed`);
    if (results.warnings.length > 0) {
      console.log(`  ⚠️  ${results.warnings.length} warnings (non-blocking)`);
    }
    console.log('\n  Ready to generate vision briefs and visualizations.\n');
    console.log('  Quick start:');
    console.log('    node scripts/generate-vision-brief.js <SD-ID> --confirm');
    console.log('    node scripts/approve-vision-brief.js <SD-ID>');
    console.log('    node scripts/generate-vision-visualization.js <SD-ID> --confirm\n');
    return 0;
  } else {
    console.log('  ❌ GOVERNANCE PREFLIGHT: FAIL');
    console.log('═'.repeat(60));
    console.log(`\n  ✅ ${results.passed.length} passed | ⚠️  ${results.warnings.length} warnings | ❌ ${results.failed.length} failed\n`);

    console.log('  REMEDIATION REQUIRED:');
    console.log('  ' + '─'.repeat(40));
    results.failed.forEach(({ check, remediation }, i) => {
      console.log(`  ${i + 1}. ${check}`);
      if (remediation) {
        console.log(`     → ${remediation}`);
      }
    });
    console.log('');
    return 1;
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('');
  console.log('═'.repeat(60));
  console.log('  GOVERNANCE PREFLIGHT CHECK');
  console.log('  Mode: READ-ONLY (no modifications)');
  console.log('═'.repeat(60));

  // Run all checks
  checkEnvironmentVariables();
  const supabase = await checkSupabaseConnectivity();
  await checkStorageBucket(supabase);
  checkVisualizationProvider();

  // Print summary and exit with appropriate code
  const exitCode = printSummary();
  process.exit(exitCode);
}

main().catch(error => {
  console.error('\n❌ Preflight failed with error:', error.message);
  process.exit(1);
});
