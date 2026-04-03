#!/usr/bin/env node
/**
 * Lint Check for Generated Skill Files
 *
 * Ensures skill files in .claude/commands/ do not contain prohibited patterns
 * that bypass canonical scripts (e.g., direct supabase.from() calls).
 *
 * SD: SD-LEO-INFRA-CUSTOM-SKILLS-PROTOCOL-001
 *
 * Usage:
 *   node scripts/lint-skill-files.js          # Check all generated skill files
 *   node scripts/lint-skill-files.js --fix    # Remove prohibited patterns (future)
 *
 * Exit codes:
 *   0 — All checks passed
 *   1 — Prohibited patterns found
 */

import { readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const COMMANDS_DIR = join(__dirname, '..', '.claude', 'commands');

// Only check generated files (those with GENERATED header)
const GENERATED_MARKER = '<!-- GENERATED:';

// Prohibited patterns — skills must never bypass canonical scripts
const PROHIBITED_PATTERNS = [
  { pattern: /supabase\.from\s*\(/g, description: 'Direct Supabase query (use canonical scripts instead)' },
  { pattern: /createClient\s*\(/g, description: 'Direct Supabase client creation (use canonical scripts instead)' },
  { pattern: /require\s*\(\s*['"]@supabase/g, description: 'Direct Supabase import (use canonical scripts instead)' },
  { pattern: /import\s+.*from\s+['"]@supabase/g, description: 'Direct Supabase import (use canonical scripts instead)' },
];

function main() {
  let files;
  try {
    files = readdirSync(COMMANDS_DIR).filter(f => f.endsWith('.md'));
  } catch {
    console.error(`Commands directory not found: ${COMMANDS_DIR}`);
    process.exit(1);
  }

  let violations = 0;
  let checkedCount = 0;

  for (const file of files) {
    const filePath = join(COMMANDS_DIR, file);
    const content = readFileSync(filePath, 'utf-8');

    // Only lint generated files
    if (!content.includes(GENERATED_MARKER)) continue;

    checkedCount++;
    let fileViolations = 0;

    for (const { pattern, description } of PROHIBITED_PATTERNS) {
      // Reset regex state
      pattern.lastIndex = 0;
      const matches = content.match(pattern);
      if (matches) {
        if (fileViolations === 0) {
          console.error(`\n❌ ${file}:`);
        }
        fileViolations += matches.length;
        console.error(`   ${description} (${matches.length} occurrence(s))`);
      }
    }

    violations += fileViolations;

    if (fileViolations === 0) {
      console.log(`  ✅ ${file} — clean`);
    }
  }

  console.log('');
  console.log(`Checked ${checkedCount} generated skill file(s)`);

  if (violations > 0) {
    console.error(`\n❌ ${violations} violation(s) found. Skills must not bypass canonical scripts.`);
    process.exit(1);
  }

  console.log('✅ All skill files pass lint checks');
}

main();
