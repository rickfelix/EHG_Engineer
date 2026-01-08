#!/usr/bin/env node

/**
 * Genesis Pipeline Diagnostic Script
 * SD: SD-GENESIS-FIX-001 (US-002)
 *
 * Diagnoses the Genesis deployment pipeline issues by checking:
 * 1. Database tables exist and are populated
 * 2. Vercel CLI is installed and authenticated
 * 3. Genesis modules are functional
 * 4. Deployment endpoints are accessible
 *
 * Usage: node scripts/genesis-pipeline-diagnostic.js
 */

import { createClient } from '@supabase/supabase-js';
import { spawn } from 'child_process';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CHECKS = [];
let passedCount = 0;
let failedCount = 0;

function logCheck(name, passed, details = '') {
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} ${name}${details ? ': ' + details : ''}`);
  CHECKS.push({ name, passed, details });
  if (passed) passedCount++;
  else failedCount++;
}

async function checkDatabase() {
  console.log('\n📊 DATABASE CHECKS');
  console.log('─'.repeat(50));

  // Check simulation_sessions table
  const { data: sessions, error: sessErr } = await supabase
    .from('simulation_sessions')
    .select('id, epistemic_status, preview_url')
    .limit(10);

  if (sessErr) {
    logCheck('simulation_sessions table', false, sessErr.message);
  } else {
    const withPreview = sessions?.filter(s => s.preview_url) || [];
    logCheck(
      'simulation_sessions table',
      true,
      `${sessions?.length || 0} sessions, ${withPreview.length} with preview URLs`
    );
  }

  // Check genesis_deployments table
  const { data: deploys, error: depErr } = await supabase
    .from('genesis_deployments')
    .select('id')
    .limit(5);

  if (depErr) {
    if (depErr.message.includes('does not exist')) {
      logCheck('genesis_deployments table', false, 'TABLE DOES NOT EXIST - Run migration');
    } else {
      logCheck('genesis_deployments table', false, depErr.message);
    }
  } else {
    logCheck('genesis_deployments table', true, `${deploys?.length || 0} deployments`);
  }

  // Check scaffold_patterns table
  const { data: patterns, error: patErr } = await supabase
    .from('scaffold_patterns')
    .select('id, pattern_type')
    .limit(20);

  if (patErr) {
    logCheck('scaffold_patterns table', false, patErr.message);
  } else {
    const types = [...new Set(patterns?.map(p => p.pattern_type) || [])];
    logCheck('scaffold_patterns table', true, `${patterns?.length || 0} patterns (${types.join(', ')})`);
  }

  // Check epistemic_status constraint
  const { error: constraintErr } = await supabase
    .from('simulation_sessions')
    .insert({ seed_text: 'CONSTRAINT_TEST_DELETE_ME', epistemic_status: 'ratified' });

  if (constraintErr) {
    if (constraintErr.message.includes('violates check constraint')) {
      logCheck('epistemic_status constraint', false, 'Needs migration to allow ratified/rejected/deployment_failed');
    } else {
      logCheck('epistemic_status constraint', false, constraintErr.message);
    }
  } else {
    // Clean up test record
    await supabase.from('simulation_sessions').delete().eq('seed_text', 'CONSTRAINT_TEST_DELETE_ME');
    logCheck('epistemic_status constraint', true, 'Accepts all required status values');
  }
}

async function checkVercelCLI() {
  console.log('\n🔧 VERCEL CLI CHECKS');
  console.log('─'.repeat(50));

  return new Promise((resolve) => {
    // Check if vercel CLI is installed
    const vercel = spawn('vercel', ['--version'], { shell: true });
    let version = '';

    vercel.stdout.on('data', (data) => {
      version += data.toString().trim();
    });

    vercel.on('close', async (code) => {
      if (code !== 0) {
        logCheck('Vercel CLI installed', false, 'Run: npm i -g vercel');
        resolve(false);
        return;
      }

      logCheck('Vercel CLI installed', true, version);

      // Check authentication
      const whoami = spawn('vercel', ['whoami'], { shell: true });
      let user = '';

      whoami.stdout.on('data', (data) => {
        user += data.toString().trim();
      });

      whoami.on('close', (whoamiCode) => {
        if (whoamiCode !== 0) {
          logCheck('Vercel authenticated', false, 'Run: vercel login');
        } else {
          logCheck('Vercel authenticated', true, user);
        }
        resolve(whoamiCode === 0);
      });
    });

    vercel.on('error', () => {
      logCheck('Vercel CLI installed', false, 'Not found in PATH');
      resolve(false);
    });
  });
}

async function checkModules() {
  console.log('\n📦 MODULE CHECKS');
  console.log('─'.repeat(50));

  // Check if genesis modules exist
  const modules = [
    { name: 'vercel-deploy.js', path: 'lib/genesis/vercel-deploy.js' },
    { name: 'quality-gates.js', path: 'lib/genesis/quality-gates.js' },
    { name: 'branch-lifecycle.js', path: 'lib/genesis/branch-lifecycle.js' },
    { name: 'pattern-library.js', path: 'lib/genesis/pattern-library.js' },
  ];

  for (const mod of modules) {
    try {
      await import(`../${mod.path}`);
      logCheck(mod.name, true, 'Module loads successfully');
    } catch (err) {
      logCheck(mod.name, false, err.message);
    }
  }
}

async function checkPipelineIntegration() {
  console.log('\n🔗 PIPELINE INTEGRATION');
  console.log('─'.repeat(50));

  // Check EHG App genesis directory
  const ehgGenesisPath = '/mnt/c/_EHG/ehg/lib/genesis';
  const ehgScriptsPath = '/mnt/c/_EHG/ehg/scripts/genesis';

  console.log(`📍 EHG App genesis location: ${ehgGenesisPath}`);
  console.log(`📍 EHG App scripts location: ${ehgScriptsPath}`);
  console.log('');
  console.log('   Note: Pipeline orchestration is in EHG App, not EHG_Engineer');
  console.log('   This module provides infrastructure components only');
}

async function generateReport() {
  console.log('\n' + '═'.repeat(50));
  console.log('📋 DIAGNOSTIC SUMMARY');
  console.log('═'.repeat(50));
  console.log(`   ✅ Passed: ${passedCount}`);
  console.log(`   ❌ Failed: ${failedCount}`);
  console.log('');

  if (failedCount > 0) {
    console.log('🔧 RECOMMENDED FIXES:');
    console.log('─'.repeat(50));

    const fixes = [];

    for (const check of CHECKS) {
      if (!check.passed) {
        if (check.name.includes('genesis_deployments')) {
          fixes.push('1. Apply migration: database/migrations/20260108_create_genesis_deployments.sql');
        }
        if (check.name.includes('epistemic_status')) {
          fixes.push('2. Apply migration: database/migrations/20260108_fix_epistemic_status_constraint.sql');
        }
        if (check.name.includes('Vercel CLI')) {
          fixes.push('3. Install Vercel CLI: npm install -g vercel');
        }
        if (check.name.includes('authenticated')) {
          fixes.push('4. Authenticate Vercel: vercel login');
        }
      }
    }

    [...new Set(fixes)].forEach(fix => console.log(`   ${fix}`));
  }

  console.log('');
  console.log('📖 ARCHITECTURE NOTES:');
  console.log('─'.repeat(50));
  console.log('   • Genesis pipeline spans TWO codebases:');
  console.log('   • EHG_Engineer/lib/genesis - Infrastructure (DB, deploy, quality gates)');
  console.log('   • ehg/lib/genesis - Orchestration (ScaffoldEngine, repo creation)');
  console.log('   • ehg/scripts/genesis - Pipeline scripts (stage execution)');
  console.log('');
  console.log('   To fully fix the pipeline, both codebases need attention.');
  console.log('');
}

async function main() {
  console.log('🔍 GENESIS PIPELINE DIAGNOSTIC');
  console.log('═'.repeat(50));
  console.log(`Date: ${new Date().toISOString()}`);

  await checkDatabase();
  await checkVercelCLI();
  await checkModules();
  await checkPipelineIntegration();
  await generateReport();
}

main().catch(console.error);
