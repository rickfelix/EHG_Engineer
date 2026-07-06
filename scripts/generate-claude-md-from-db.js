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
import { readdirSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';

import { CLAUDEMDGeneratorV3, KNOWN_GENERATED_FILES } from './modules/claude-md-generator/index.js';
import { getActiveProtocol } from './modules/claude-md-generator/db-queries.js';
import { runRegenLintHook } from './protocol-lint/regen-hook.mjs';

// QF-20260705-104 (seam 2): refuse to regenerate OVER a conflicted working tree instead
// of silently overwriting it — a prior stash-pop corruption left conflict markers in 16
// generated CLAUDE*.md files undetected for ~75min (Solomon feedback cycle 11). Checks
// both the marker itself and git's own unmerged-file signal (UU), so a conflict without
// markers already burned into a CLAUDE*.md file still blocks. Fail-open on git errors —
// this is a defense-in-depth guard, not the primary gate (that's the pre-commit hook).
export function detectConflictedState(baseDir) {
  const markered = readdirSync(baseDir)
    .filter((f) => /^CLAUDE.*\.md$/.test(f))
    .filter((f) => {
      try {
        return /^<<<<<<< /m.test(readFileSync(path.join(baseDir, f), 'utf8'));
      } catch {
        return false;
      }
    });
  let unmerged = [];
  try {
    const porcelain = execSync('git status --porcelain', { cwd: baseDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    unmerged = porcelain.split('\n').filter((l) => l.startsWith('UU ')).map((l) => l.slice(3).trim());
  } catch {
    // fail-open
  }
  return (markered.length || unmerged.length) ? { markered, unmerged } : null;
}

// SD-LEO-INFRA-PROTOCOL-PUBLICATION-PIPELINE-001 (FR-4): parse --only <FILE[,FILE...]>
// into a validated file list. Unknown names fail loud listing valid targets. Exported
// (pure) for unit tests. Returns null when no --only flag is present (full regen).
export function parseOnlyFlag(argv, known = KNOWN_GENERATED_FILES) {
  const idx = argv.indexOf('--only');
  if (idx === -1) return null;
  const value = argv[idx + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`--only requires a value. Valid targets: ${known.join(', ')}`);
  }
  const files = value.split(',').map((f) => f.trim()).filter(Boolean);
  const unknown = files.filter((f) => !known.includes(f));
  if (unknown.length) {
    throw new Error(`--only: unknown file(s) ${unknown.join(', ')}. Valid targets: ${known.join(', ')}`);
  }
  return files;
}

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

    // QF-20260705-104 (seam 2): refuse to regenerate over a conflicted working tree.
    const conflict = detectConflictedState(baseDir);
    if (conflict) {
      console.error('Refusing to regenerate: working tree is in a conflicted state.');
      if (conflict.markered.length) console.error('  Conflict markers in: ' + conflict.markered.join(', '));
      if (conflict.unmerged.length) console.error('  Unmerged (UU) files: ' + conflict.unmerged.join(', '));
      console.error('Resolve the conflict before regenerating.');
      process.exit(1);
    }

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

    // FR-4: scoped regeneration — validate the target list before any work.
    let only = null;
    try {
      only = parseOnlyFlag(process.argv);
    } catch (e) {
      console.error(e.message);
      process.exit(1);
    }
    if (only) console.log(`Scoped regeneration (--only): ${only.join(', ')}\n`);

    const generator = new CLAUDEMDGeneratorV3(supabase, baseDir, mappingPath, only ? { only } : {});
    await generator.generate();
  }

  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
