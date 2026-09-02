#!/usr/bin/env node
/**
 * SD-FDBK-INFRA-WORKTREES-CARRY-SNAPSHOT-001 (FR-3)
 *
 * Regenerates tools/eslint-rules/dotenv-legacy-allowlist.json -- the ratchet
 * allowlist that lets eslint.config.js's dotenv no-restricted-imports rule
 * ban NEW direct `dotenv`/`dotenv/config` imports under lib/ without
 * retroactively flagging the ~175 files that already import it directly
 * (deferred bulk migration, TR-1). Run this after migrating a file off
 * direct dotenv so the file drops out of the grandfather list and the rule
 * starts protecting it going forward.
 *
 * Usage: node scripts/generate-dotenv-legacy-allowlist.mjs
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The sanctioned shared-loader files are excluded here on purpose -- they are not
// "legacy", they are the blessed dotenv call sites the rule is scoped to protect
// everything else FROM. They get their own explicit exclusion in eslint.config.js,
// never lumped into this grandfather list.
const SANCTIONED_LOADER_FILES = new Set([
  'lib/supabase-client.js',
  'lib/supabase-client.cjs',
]);

const grepPattern = String.raw`require\('dotenv'\)|require\("dotenv"\)|from 'dotenv'|from "dotenv"|import 'dotenv/config'|require\('dotenv/config'\)`;
const out = execFileSync('git', ['grep', '-l', '-E', grepPattern, '--', 'lib/'], {
  cwd: repoRoot,
  encoding: 'utf8',
});

const files = out
  .split(/\r?\n/)
  .filter(Boolean)
  .filter((f) => !SANCTIONED_LOADER_FILES.has(f))
  .sort();

const outPath = path.join(repoRoot, 'tools/eslint-rules/dotenv-legacy-allowlist.json');
writeFileSync(outPath, JSON.stringify(files, null, 2) + '\n');
console.log(`Wrote ${files.length} entries to ${path.relative(repoRoot, outPath)}`);
