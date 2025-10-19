#!/usr/bin/env node

/**
 * Validates application configurations in the multi-app registry
 *
 * Checks:
 * - local_path points to existing directory
 * - local_path is a valid git repository
 * - codebase/ directories are empty or contain only placeholder
 * - config.json files are valid JSON
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APPS_DIR = path.join(__dirname, '../applications');
const REGISTRY_FILE = path.join(APPS_DIR, 'registry.json');

console.log('🔍 Validating application configurations...\n');

// Read registry
let registry;
try {
  registry = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf-8'));
} catch (error) {
  console.error('❌ Failed to read registry.json:', error.message);
  process.exit(1);
}

let errors = 0;
let warnings = 0;

// Validate each application
for (const [appId, appConfig] of Object.entries(registry.applications)) {
  console.log(`\n📦 Validating ${appId} (${appConfig.name})...`);

  // 1. Check config.json exists
  const configPath = path.join(APPS_DIR, appId, 'config.json');
  if (!fs.existsSync(configPath)) {
    console.error(`  ❌ config.json not found at ${configPath}`);
    errors++;
    continue;
  }

  // 2. Validate config.json is valid JSON
  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    console.log('  ✅ config.json is valid JSON');
  } catch (error) {
    console.error(`  ❌ config.json is invalid: ${error.message}`);
    errors++;
    continue;
  }

  // 3. Check local_path exists
  if (!config.local_path) {
    console.error('  ❌ local_path not specified in config.json');
    errors++;
    continue;
  }

  if (!fs.existsSync(config.local_path)) {
    console.error(`  ❌ local_path does not exist: ${config.local_path}`);
    errors++;
    continue;
  }
  console.log(`  ✅ local_path exists: ${config.local_path}`);

  // 4. Verify local_path is a git repository
  try {
    execSync('git status', { cwd: config.local_path, stdio: 'ignore' });
    console.log('  ✅ local_path is a valid git repository');
  } catch (error) {
    console.error(`  ❌ local_path is NOT a git repository: ${config.local_path}`);
    errors++;
  }

  // 5. Check codebase/ directory
  const codebasePath = path.join(APPS_DIR, appId, 'codebase');
  if (fs.existsSync(codebasePath)) {
    const contents = fs.readdirSync(codebasePath);

    if (contents.length === 0) {
      console.log('  ✅ codebase/ directory is empty (correct)');
    } else if (contents.length === 1 && contents[0].startsWith('DO_NOT_USE')) {
      console.log('  ✅ codebase/ contains only placeholder (correct)');
    } else if (contents.includes('.git')) {
      console.warn(`  ⚠️  codebase/ contains a git repository (should be empty!)`);
      console.warn(`     Code should be in: ${config.local_path}`);
      warnings++;
    } else {
      console.warn(`  ⚠️  codebase/ contains files (should be empty!):`);
      console.warn(`     ${contents.join(', ')}`);
      warnings++;
    }
  } else {
    console.log('  ✅ codebase/ directory does not exist (correct, will be gitignored)');
  }

  // 6. Verify git remote matches config
  try {
    const remote = execSync('git remote get-url origin', {
      cwd: config.local_path,
      encoding: 'utf-8'
    }).trim();

    const expectedRepo = config.github?.full_repo || config.github_repo;
    if (remote.includes(expectedRepo || config.github?.repo)) {
      console.log('  ✅ Git remote matches configuration');
    } else {
      console.warn(`  ⚠️  Git remote mismatch:`);
      console.warn(`     Expected: ${expectedRepo}`);
      console.warn(`     Actual: ${remote}`);
      warnings++;
    }
  } catch (error) {
    console.warn(`  ⚠️  Could not verify git remote: ${error.message}`);
    warnings++;
  }
}

// Summary
console.log('\n' + '='.repeat(60));
console.log('📊 Validation Summary:');
console.log('='.repeat(60));

if (errors === 0 && warnings === 0) {
  console.log('✅ All configurations are valid!');
  console.log('\n🎉 No issues found.');
  process.exit(0);
} else {
  if (errors > 0) {
    console.error(`❌ Found ${errors} error(s)`);
  }
  if (warnings > 0) {
    console.warn(`⚠️  Found ${warnings} warning(s)`);
  }

  console.log('\n📖 See DEVELOPMENT_WORKFLOW.md for guidance.');
  process.exit(errors > 0 ? 1 : 0);
}
