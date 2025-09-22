#!/usr/bin/env node

/**
 * Monitor for OpenAI Codex Artifacts
 * Watches /tmp/codex-artifacts/ for new files from Codex
 */

import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { execSync } from 'child_process';

const ARTIFACT_DIR = '/tmp/codex-artifacts';
const CHECK_INTERVAL = 5000; // Check every 5 seconds
const PRD_ID = 'PRD-CODEX-TEST-1758341001565'; // Our test PRD

console.log(chalk.cyan('👁️  Monitoring for Codex Artifacts'));
console.log(chalk.gray('─'.repeat(60)));
console.log(chalk.yellow('Watching:'), ARTIFACT_DIR);
console.log(chalk.yellow('PRD ID:'), PRD_ID);
console.log(chalk.gray('\nPress Ctrl+C to stop monitoring\n'));

let knownFiles = new Set();

// Get initial files
try {
  const files = fs.readdirSync(ARTIFACT_DIR);
  files.forEach(f => knownFiles.add(f));
  console.log(chalk.gray(`Found ${knownFiles.size} existing artifacts`));
} catch (error) {
  console.log(chalk.yellow('Creating artifact directory...'));
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

// Monitor function
function checkForNewArtifacts() {
  try {
    const currentFiles = fs.readdirSync(ARTIFACT_DIR);
    const newFiles = currentFiles.filter(f => !knownFiles.has(f));

    if (newFiles.length > 0) {
      console.log(chalk.green(`\n✨ New artifacts detected! (${newFiles.length} files)`));

      // Look for manifest
      const manifest = newFiles.find(f => f.startsWith('manifest-') && f.endsWith('.json'));

      if (manifest) {
        const manifestPath = path.join(ARTIFACT_DIR, manifest);
        const content = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

        console.log(chalk.cyan('\n📋 Manifest Details:'));
        console.log(`  Handoff ID: ${chalk.white(content.handoff_id || 'N/A')}`);
        console.log(`  PRD ID: ${chalk.white(content.prd_id || 'N/A')}`);
        console.log(`  Timestamp: ${chalk.white(content.timestamp)}`);
        console.log(`  Files Modified: ${chalk.white(JSON.stringify(content.files_modified || []))}`);

        // Check if this is for our PRD
        if (content.prd_id === PRD_ID) {
          console.log(chalk.green('\n🎯 This is our PRD! Ready to process.'));
          console.log(chalk.cyan('\n📦 Run this command to process:'));
          console.log(chalk.white(`  node scripts/process-codex-artifacts.js ${PRD_ID}`));

          // Auto-run validation
          console.log(chalk.yellow('\n🔍 Running validation...'));
          try {
            execSync(`node scripts/validate-codex-output.js ${manifest}`, { stdio: 'inherit' });
            console.log(chalk.green('✅ Validation passed!'));
          } catch (error) {
            console.log(chalk.red('❌ Validation failed. Check the artifacts.'));
          }

          // Exit monitor
          console.log(chalk.gray('\nMonitor stopping. Artifacts are ready for processing.'));
          process.exit(0);
        } else {
          console.log(chalk.yellow(`\n⚠️  Different PRD (${content.prd_id}), continuing to monitor...`));
        }
      }

      // Update known files
      newFiles.forEach(f => knownFiles.add(f));
    }
  } catch (error) {
    console.error(chalk.red('Monitor error:'), error.message);
  }
}

// Start monitoring
const interval = setInterval(checkForNewArtifacts, CHECK_INTERVAL);

// Show status periodically
let dots = 0;
setInterval(() => {
  process.stdout.write(`\rMonitoring${'.'.repeat(dots % 4)}${' '.repeat(3 - dots % 4)}`);
  dots++;
}, 1000);

// Clean exit
process.on('SIGINT', () => {
  console.log(chalk.gray('\n\nMonitor stopped.'));
  clearInterval(interval);
  process.exit(0);
});