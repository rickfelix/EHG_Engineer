#!/usr/bin/env node

/**
 * eva venture new - CLI Entry Point for Stage 0
 *
 * Creates a new venture through one of three paths:
 *   1. Competitor Teardown - Analyze competitor URLs
 *   2. Blueprint Browse - Select from venture templates
 *   3. Discovery Mode - AI-driven opportunity discovery
 *
 * Usage:
 *   node scripts/eva-venture-new.js                           # Interactive mode
 *   node scripts/eva-venture-new.js --path competitor --urls https://competitor.com
 *   node scripts/eva-venture-new.js --path blueprint --blueprint-id <uuid>
 *   node scripts/eva-venture-new.js --path discovery --strategy trend_scanner
 *   node scripts/eva-venture-new.js --dry-run                 # Preview without persisting
 *   node scripts/eva-venture-new.js --non-interactive --path competitor --urls https://example.com
 *
 * Part of SD-LEO-ORCH-STAGE-INTELLIGENT-VENTURE-001-B
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import {
  executeStageZero,
  ENTRY_PATHS,
  PATH_OPTIONS,
} from '../lib/eva/stage-zero/index.js';

// ── Argument Parsing ──────────────────────────────────────────

function getArg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function getArrayArg(name) {
  const value = getArg(name);
  if (!value) return [];
  return value.split(',').map(v => v.trim()).filter(Boolean);
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const dryRun = hasFlag('dry-run');
  const nonInteractive = hasFlag('non-interactive');
  const pathArg = getArg('path');

  // Map shorthand path names to keys
  const pathMap = {
    competitor: ENTRY_PATHS.COMPETITOR_TEARDOWN,
    blueprint: ENTRY_PATHS.BLUEPRINT_BROWSE,
    discovery: ENTRY_PATHS.DISCOVERY_MODE,
    '1': ENTRY_PATHS.COMPETITOR_TEARDOWN,
    '2': ENTRY_PATHS.BLUEPRINT_BROWSE,
    '3': ENTRY_PATHS.DISCOVERY_MODE,
  };

  let selectedPath = pathMap[pathArg];

  if (!selectedPath && !pathArg) {
    // Interactive path selection
    if (nonInteractive) {
      console.error('Error: --path is required in non-interactive mode');
      console.error('Options: competitor, blueprint, discovery');
      process.exit(1);
    }

    console.log('\n══════════════════════════════════════════════════');
    console.log('   EVA VENTURE NEW - Stage 0 Entry');
    console.log('══════════════════════════════════════════════════\n');
    console.log('   How would you like to start?\n');

    for (const option of PATH_OPTIONS) {
      console.log(`   ${option.shortcut}. ${option.label}`);
      console.log(`      ${option.description}\n`);
    }

    // In non-interactive context (e.g., called from Claude), default to showing options
    // Full interactive input will be added with readline in the interactive CLI enhancement
    console.log('   Usage: node scripts/eva-venture-new.js --path <competitor|blueprint|discovery>');
    console.log('   Or:    node scripts/eva-venture-new.js --path 1|2|3\n');
    process.exit(0);
  }

  if (!selectedPath) {
    console.error(`Error: Unknown path "${pathArg}". Options: competitor, blueprint, discovery`);
    process.exit(1);
  }

  // Build path-specific parameters
  const pathParams = buildPathParams(selectedPath);

  // Execute Stage 0
  const result = await executeStageZero(
    {
      path: selectedPath,
      pathParams,
      options: { dryRun, nonInteractive },
    },
    { supabase, logger: console }
  );

  if (!result.success) {
    console.error(`\n   Stage 0 failed: ${result.reason}`);
    process.exit(1);
  }

  if (dryRun) {
    console.log('\n   [DRY RUN] Brief preview:');
    console.log(JSON.stringify(result.brief, null, 2));
  }

  process.exit(0);
}

function buildPathParams(path) {
  switch (path) {
    case ENTRY_PATHS.COMPETITOR_TEARDOWN:
      return {
        urls: getArrayArg('urls'),
      };

    case ENTRY_PATHS.BLUEPRINT_BROWSE:
      return {
        blueprintId: getArg('blueprint-id'),
        customizations: {},
      };

    case ENTRY_PATHS.DISCOVERY_MODE:
      return {
        strategy: getArg('strategy') || 'trend_scanner',
        constraints: {},
      };

    default:
      return {};
  }
}

main().catch(err => {
  console.error('Stage 0 error:', err.message);
  process.exit(1);
});
