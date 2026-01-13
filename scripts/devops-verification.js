#!/usr/bin/env node

/**
 * DEVOPS VERIFICATION
 * DevOps Platform Architect sub-agent
 * Verifies CI/CD status, builds, and deployments
 */

import { createClient } from '@supabase/supabase-js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';

// Cross-platform path resolution (SD-WIN-MIG-005 fix)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EHG_ROOT = path.resolve(__dirname, '../../ehg');

dotenv.config();

const execAsync = promisify(exec);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function verifyDevOps(sdId) {
  console.log('\n🚀 DEVOPS PLATFORM ARCHITECT');
  console.log('═'.repeat(60));
  console.log(`Verifying CI/CD for SD: ${sdId}`);

  // Get SD details
  const { data: sd } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('id', sdId)
    .single();

  if (!sd) {
    throw new Error(`SD not found: ${sdId}`);
  }

  console.log(`SD: ${sd.sd_key} - ${sd.title}`);

  const verification = {
    sd_key: sd.sd_key,
    sd_id: sdId,
    timestamp: new Date().toISOString(),
    checks: {}
  };

  // Check GitHub Actions status (if in EHG repo)
  try {
    console.log('\n📊 Checking GitHub Actions...');
    const { stdout } = await execAsync(`cd "${EHG_ROOT}" && gh run list --limit 5 --json conclusion,status,name,createdAt`);
    const runs = JSON.parse(stdout);

    const latestRun = runs[0];
    verification.checks.github_actions = {
      status: latestRun.conclusion || latestRun.status,
      name: latestRun.name,
      timestamp: latestRun.createdAt
    };

    console.log(`   Status: ${latestRun.conclusion || latestRun.status}`);
    console.log(`   Workflow: ${latestRun.name}`);
  } catch (error) {
    console.log(`   ⚠️  Could not check GitHub Actions: ${error.message}`);
    verification.checks.github_actions = { error: error.message };
  }

  // Check git status
  try {
    console.log('\n📝 Checking Git status...');
    const { stdout: gitLog } = await execAsync(`cd "${EHG_ROOT}" && git log --oneline -1`);
    const { stdout: gitStatus } = await execAsync(`cd "${EHG_ROOT}" && git status --porcelain`);

    verification.checks.git = {
      latest_commit: gitLog.trim(),
      uncommitted_changes: gitStatus.trim().split('\\n').filter(l => l).length
    };

    console.log(`   Latest: ${gitLog.trim()}`);
    console.log(`   Uncommitted: ${verification.checks.git.uncommitted_changes} files`);
  } catch (error) {
    console.log(`   ⚠️  Could not check git: ${error.message}`);
    verification.checks.git = { error: error.message };
  }

  // Overall verdict
  const hasErrors = Object.values(verification.checks).some(check => check.error);
  const githubSuccess = verification.checks.github_actions?.status === 'success';

  verification.verdict = hasErrors ? 'WARNING' : (githubSuccess ? 'PASS' : 'REVIEW_REQUIRED');
  verification.confidence = hasErrors ? 60 : (githubSuccess ? 90 : 75);

  console.log(`\n${verification.verdict === 'PASS' ? '✅' : '⚠️'} Verdict: ${verification.verdict}`);
  console.log(`   Confidence: ${verification.confidence}%`);

  return {
    success: true,
    verdict: verification.verdict,
    confidence: verification.confidence,
    details: verification
  };
}

// CLI usage
async function main() {
  const sdId = process.argv[2];

  if (!sdId) {
    console.error('Usage: node devops-verification.js <SD_UUID>');
    process.exit(1);
  }

  try {
    const result = await verifyDevOps(sdId);
    console.log(JSON.stringify(result));
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
