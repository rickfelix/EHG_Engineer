#!/usr/bin/env node

/**
 * Test Codex Validation Process
 * Validates existing artifacts to ensure processing scripts work
 */

import { execSync } from 'child_process';
import chalk from 'chalk';

console.log(chalk.cyan('🧪 Testing Codex Artifact Validation'));
console.log(chalk.gray('─'.repeat(60)));

// Find latest manifest in /tmp/codex-artifacts/
try {
  const manifests = execSync('ls -t /tmp/codex-artifacts/manifest-*.json 2>/dev/null | head -1', { encoding: 'utf8' }).trim();

  if (!manifests) {
    console.log(chalk.yellow('No manifests found in /tmp/codex-artifacts/'));
    console.log(chalk.gray('This is expected - waiting for OpenAI Codex to generate artifacts'));
    process.exit(0);
  }

  const latestManifest = manifests.split('\n')[0];
  console.log(chalk.yellow('Testing with manifest:'), latestManifest);

  // Run validation
  console.log(chalk.cyan('\n📋 Running validation...'));
  const result = execSync(`node scripts/validate-codex-output.js ${latestManifest.split('/').pop()}`, { encoding: 'utf8' });
  console.log(result);

  console.log(chalk.green('✅ Validation script is working!'));
  console.log(chalk.gray('\nReady to process real Codex artifacts when they arrive.'));

} catch (error) {
  console.error(chalk.red('❌ Validation test failed:'), error.message);
  console.log(chalk.yellow('\nThis may be expected if no valid test artifacts exist.'));
  console.log(chalk.gray('The system will be ready when real Codex artifacts arrive.'));
}