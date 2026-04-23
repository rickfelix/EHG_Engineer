#!/usr/bin/env node
/**
 * Generate Modular CLAUDE Files from Database (V3 - Router Architecture)
 * Creates 5 files: CLAUDE.md (router), CLAUDE_CORE.md, CLAUDE_LEAD.md, CLAUDE_PLAN.md, CLAUDE_EXEC.md
 *
 * This is a thin wrapper that delegates to modular components in:
 * scripts/modules/claude-md-generator/
 */

import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';

import { CLAUDEMDGeneratorV3 } from './modules/claude-md-generator/index.js';
import { getActiveProtocol } from './modules/claude-md-generator/db-queries.js';
import { runRegenLintHook } from './protocol-lint/regen-hook.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  console.log('CLAUDE files will not be updated');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Re-export the class for use in other scripts
export { CLAUDEMDGeneratorV3 };

// Run if called directly (normalize Windows backslashes for comparison)
const normalizedArgv = process.argv[1]?.replace(/\\/g, '/');
if (import.meta.url === `file:///${normalizedArgv}`) {
  async function main() {
    const baseDir = path.join(__dirname, '..');
    const mappingPath = path.join(__dirname, 'section-file-mapping.json');

    // Pre-regen lint hook (SD-PROTOCOL-LINTER-001). Aborts before file
    // writes when a severity=block violation is detected. All current seed
    // rules ship as warn-only so this is currently advisory.
    const lintDecision = await runRegenLintHook({
      supabase,
      argv: process.argv,
      getActiveProtocol
    });
    if (lintDecision.abort) {
      process.exit(1);
    }

    const generator = new CLAUDEMDGeneratorV3(supabase, baseDir, mappingPath);
    await generator.generate();
  }

  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
