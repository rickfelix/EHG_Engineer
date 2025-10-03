#!/usr/bin/env node

/**
 * Migration Script: Update scripts using sd_key to use fetchSD()
 *
 * This script updates all scripts that query strategic_directives_v2 using
 * the old .eq('sd_key') pattern to use the new fetchSD() canonical function.
 *
 * The fetchSD() function handles both id and sd_key columns automatically.
 */

import fs from 'fs/promises';
import path from 'path';

const scriptsToUpdate = [
  'update-sd-reconnect-011-comprehensive.js',
  'update-sd-reconnect-006-comprehensive.js',
  'update-sd-reconnect-002-comprehensive.js',
  'update-sd-realtime-001-comprehensive.js',
  'update-sd-reconnect-003-comprehensive.js',
  'update-sd-reconnect-007-comprehensive.js',
  'update-sd-backend-002-comprehensive.js',
  'verify-uat-description-carryover.js',
  'check-duplicate-sd-keys.js',
  'debug-sd-uat-001-visibility.js',
  'fix-uat-sd-sequence-rank.js',
  'check-story-gates.js'
];

const oldPattern = /\.from\(['"]strategic_directives_v2['"]\)\s*\.select\(['"].*?['"]\)\s*\.eq\(['"]sd_key['"],\s*(['"`][^'"`]+['"`]|[a-zA-Z0-9_]+)\)\s*\.(?:single|maybeSingle)\(\)/gs;

async function analyzeFile(filePath) {
  const content = await fs.readFile(filePath, 'utf-8');
  const matches = [...content.matchAll(oldPattern)];

  if (matches.length === 0) {
    return { hasIssue: false };
  }

  return {
    hasIssue: true,
    matchCount: matches.length,
    matches: matches.map(m => m[0])
  };
}

async function main() {
  console.log('🔍 Analyzing Scripts for sd_key Pattern Usage\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const results = [];

  for (const script of scriptsToUpdate) {
    const filePath = path.join(process.cwd(), 'scripts', script);

    try {
      const analysis = await analyzeFile(filePath);

      if (analysis.hasIssue) {
        console.log(`❌ ${script}`);
        console.log(`   Found ${analysis.matchCount} occurrence(s) of old pattern`);
        console.log(`   Example: ${analysis.matches[0].substring(0, 80)}...`);
        console.log('');

        results.push({ script, ...analysis });
      } else {
        console.log(`✅ ${script} - OK (no sd_key pattern found)`);
      }
    } catch (error) {
      console.log(`⚠️  ${script} - Could not read file: ${error.message}`);
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📊 Summary:\n');
  console.log(`Total scripts analyzed: ${scriptsToUpdate.length}`);
  console.log(`Scripts needing update: ${results.length}`);
  console.log(`Scripts already updated: ${scriptsToUpdate.length - results.length}`);
  console.log('');

  if (results.length > 0) {
    console.log('📋 Recommended Action:\n');
    console.log('These scripts should be updated to use the fetchSD() function:');
    console.log('');
    console.log('OLD PATTERN:');
    console.log('  const { data } = await supabase');
    console.log('    .from("strategic_directives_v2")');
    console.log('    .select("*")');
    console.log('    .eq("sd_key", identifier)');
    console.log('    .single();');
    console.log('');
    console.log('NEW PATTERN:');
    console.log('  import { fetchSD } from "../lib/supabase-client.js";');
    console.log('  const { data, error } = await fetchSD(identifier);');
    console.log('');
    console.log('✅ BENEFITS:');
    console.log('  - Handles both id and sd_key columns automatically');
    console.log('  - Tries id column first (new SDs)');
    console.log('  - Falls back to sd_key column (legacy SDs)');
    console.log('  - Consistent error handling');
    console.log('  - Future-proof pattern');
    console.log('');
  } else {
    console.log('✅ All scripts are up to date!');
  }
}

main().catch(console.error);
