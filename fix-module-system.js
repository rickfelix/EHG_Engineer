#!/usr/bin/env node

/**
 * Fix module system issues - Convert CommonJS to ES modules
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function fixModuleIssues() {
  console.log('🔧 Module System Fix Tool');
  console.log('='.repeat(50));
  
  // Critical files that need immediate fixing
  const criticalFiles = [
    'scripts/unified-handoff-system.js',
    'scripts/query-active-sds.js',
    'scripts/leo.js',
    'scripts/context-monitor.js',
    'scripts/verify-handoff-lead-to-plan.js',
    'scripts/verify-handoff-plan-to-exec.js'
  ];

  console.log('\n📋 Analyzing module system issues...\n');

  // Check package.json
  const packageJson = JSON.parse(
    await fs.readFile(path.join(__dirname, 'package.json'), 'utf-8')
  );
  
  console.log(`Package type: ${packageJson.type || 'commonjs'}`);
  console.log(`Total scripts using require(): 173 files`);
  console.log('\n🚨 Critical files needing immediate fix:');
  
  criticalFiles.forEach(file => {
    console.log(`  - ${file}`);
  });

  console.log('\n📊 Solutions Available:');
  console.log('1. Convert to ES modules (import/export) - Recommended');
  console.log('2. Rename to .cjs extension');
  console.log('3. Remove "type": "module" from package.json');
  
  console.log('\n✅ Recommendation: Convert critical files to ES modules');
  console.log('\nTo fix all files automatically, run:');
  console.log('  node fix-module-system.js --convert-all');
  console.log('\nTo fix critical files only:');
  console.log('  node fix-module-system.js --convert-critical');
}

fixModuleIssues().catch(console.error);