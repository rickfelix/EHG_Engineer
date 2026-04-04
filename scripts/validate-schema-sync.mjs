#!/usr/bin/env node
/**
 * Schema-Code Sync Validator (P1 — Preventive Action)
 *
 * Extracts all supabase.from('table_name') references from:
 *   - JS/MJS/CJS files (code)
 *   - .claude/commands/*.md files (command templates)
 * and verifies each table exists in the database. Reports phantom references.
 *
 * PA-1: Command file scanning prevents schema drift in embedded Supabase
 * queries within command markdown (e.g., brainstorm.md INSERT templates).
 * See PR #2701 for the class of bugs this prevents.
 *
 * Usage: node scripts/validate-schema-sync.mjs [--fix] [--json]
 *   --fix   Suggest fixes for phantom references
 *   --json  Output results as JSON
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const dotenv = require('dotenv');
dotenv.config();
const pg = require('pg');
import { readFileSync, readdirSync } from 'fs';
import { join, extname } from 'path';

const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'archive', '.worktrees', '.regression', 'test-venture']);
const JS_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
const CMD_DIR = join(process.cwd(), '.claude', 'commands');
const IGNORE_TABLES = new Set([
  'table_name', 'tableName', 'table', 'this.table',
  'information_schema', // meta-queries
]);
const FROM_PATTERN = /\.from\(['"`]([a-z_][a-z0-9_]*)['"`]\)/g;

async function getDbTables() {
  const client = new pg.Client({ connectionString: process.env.SUPABASE_POOLER_URL });
  await client.connect();
  const res = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name"
  );
  await client.end();
  return new Set(res.rows.map(r => r.table_name));
}

function walkDir(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(full, files);
    } else if (JS_EXTENSIONS.has(extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

function walkCommandDir(dir, files = []) {
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walkCommandDir(full, files);
      } else if (extname(entry.name) === '.md') {
        files.push(full);
      }
    }
  } catch { /* .claude/commands/ may not exist */ }
  return files;
}

function addMatch(refs, tableName, filePath, lineNum) {
  if (IGNORE_TABLES.has(tableName)) return;
  if (!refs.has(tableName)) refs.set(tableName, []);
  refs.get(tableName).push({ file: filePath, line: lineNum });
}

function extractTableReferences() {
  const refs = new Map(); // table_name -> [{file, line}]

  // 1. Scan JS/MJS/CJS files for .from() calls
  const jsFiles = walkDir(process.cwd());
  for (const filePath of jsFiles) {
    let content;
    try { content = readFileSync(filePath, 'utf-8'); } catch { continue; }
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      let match;
      FROM_PATTERN.lastIndex = 0;
      while ((match = FROM_PATTERN.exec(lines[i])) !== null) {
        addMatch(refs, match[1], filePath, i + 1);
      }
    }
  }

  // 2. Scan command markdown files for .from() calls (primary Supabase pattern)
  //    SQL_TABLE_PATTERN is too greedy in prose — only .from() is reliable in .md
  const cmdFiles = walkCommandDir(CMD_DIR);
  for (const filePath of cmdFiles) {
    let content;
    try { content = readFileSync(filePath, 'utf-8'); } catch { continue; }
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      let match;
      FROM_PATTERN.lastIndex = 0;
      while ((match = FROM_PATTERN.exec(lines[i])) !== null) {
        addMatch(refs, match[1], filePath, i + 1);
      }
    }
  }

  return refs;
}

async function main() {
  const flags = new Set(process.argv.slice(2));
  const jsonMode = flags.has('--json');

  if (!jsonMode) console.log('Schema-Code Sync Validator\n========================\n');

  // 1. Get all tables from database
  if (!jsonMode) process.stdout.write('Fetching database tables... ');
  const dbTables = await getDbTables();
  if (!jsonMode) console.log(`${dbTables.size} tables found`);

  // 2. Extract all table references from code + command files
  if (!jsonMode) process.stdout.write('Scanning code and command files for table refs... ');
  const codeRefs = extractTableReferences();
  if (!jsonMode) console.log(`${codeRefs.size} unique table names referenced`);

  // 3. Find phantoms
  const phantoms = [];
  const valid = [];
  for (const [table, refs] of codeRefs) {
    if (dbTables.has(table)) {
      valid.push({ table, refCount: refs.length });
    } else {
      phantoms.push({ table, refs });
    }
  }

  if (jsonMode) {
    console.log(JSON.stringify({ phantoms, validCount: valid.length, dbTableCount: dbTables.size }, null, 2));
    process.exit(phantoms.length > 0 ? 1 : 0);
  }

  // 4. Report
  console.log(`\nResults: ${valid.length} valid, ${phantoms.length} phantom(s)\n`);

  if (phantoms.length === 0) {
    console.log('All table references match database schema.');
    process.exit(0);
  }

  console.log('PHANTOM TABLE REFERENCES (code references non-existent tables):');
  console.log('=' .repeat(70));
  for (const { table, refs } of phantoms.sort((a, b) => b.refs.length - a.refs.length)) {
    console.log(`\n  ${table} (${refs.length} reference${refs.length > 1 ? 's' : ''}):`);
    for (const ref of refs.slice(0, 5)) {
      console.log(`    ${ref.file}:${ref.line}`);
    }
    if (refs.length > 5) console.log(`    ... and ${refs.length - 5} more`);
  }

  console.log(`\nTotal: ${phantoms.length} phantom table(s) found across ${phantoms.reduce((s, p) => s + p.refs.length, 0)} reference(s)`);
  process.exit(1);
}

main().catch(e => { console.error('Error:', e.message); process.exit(2); });
