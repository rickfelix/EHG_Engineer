#!/usr/bin/env node
// Memory DB-reference linter — closes feedback cb0c1edb.
// Greps ~/.claude/projects/.../memory/*.md for tr_/fn_/chk_ identifiers
// and asserts each exists in pg_trigger / pg_proc / pg_constraint.
//
// Exit codes: 0=clean, 1=drift, 2=execution error.
import { createDatabaseClient } from '../lib/supabase-connection.js';
import { readdirSync, readFileSync, existsSync } from 'fs';
import path from 'path';
import os from 'os';

const MEMORY_DIR = process.env.MEMORY_DIR || path.join(
  os.homedir(),
  '.claude/projects/C--Users-rickf-Projects--EHG-EHG-Engineer/memory'
);

const PATTERNS = [
  { prefix: 'tr_',  table: 'pg_trigger',    col: 'tgname',  label: 'trigger' },
  { prefix: 'fn_',  table: 'pg_proc',       col: 'proname', label: 'function' },
  { prefix: 'chk_', table: 'pg_constraint', col: 'conname', label: 'check constraint' },
];

function scanMemory() {
  if (!existsSync(MEMORY_DIR)) {
    throw new Error(`MEMORY_DIR not found: ${MEMORY_DIR}`);
  }
  const refs = new Map();
  const files = readdirSync(MEMORY_DIR).filter(f => f.endsWith('.md'));
  for (const f of files) {
    const content = readFileSync(path.join(MEMORY_DIR, f), 'utf8');
    const matches = content.match(/\b(?:tr_|fn_|chk_)[a-z][a-z0-9_]+/g) || [];
    for (const m of matches) {
      if (!refs.has(m)) refs.set(m, new Set());
      refs.get(m).add(f);
    }
  }
  return { files: files.length, refs };
}

async function checkExistence(refs) {
  const client = await createDatabaseClient('engineer', { verify: false });
  const drift = [];
  try {
    for (const [name, files] of refs) {
      const pat = PATTERNS.find(p => name.startsWith(p.prefix));
      if (!pat) continue;
      const r = await client.query(
        `SELECT 1 FROM ${pat.table} WHERE ${pat.col} = $1 LIMIT 1`,
        [name]
      );
      if (r.rows.length === 0) {
        drift.push({ name, type: pat.label, files: [...files] });
      }
    }
  } finally {
    await client.end?.();
  }
  return drift;
}

async function main() {
  console.log(`🔍 Scanning ${MEMORY_DIR} for DB references...`);
  const { files, refs } = scanMemory();
  console.log(`   ${files} memory files, ${refs.size} unique tr_/fn_/chk_ references`);
  const drift = await checkExistence(refs);
  if (drift.length === 0) {
    console.log('✅ All DB references exist.');
    process.exit(0);
  }
  console.log(`❌ ${drift.length} drift reference(s) — memory cites identifiers absent from DB:\n`);
  for (const d of drift) {
    console.log(`   ${d.type.padEnd(18)} ${d.name}`);
    for (const f of d.files) console.log(`      ↳ ${f}`);
  }
  console.log('\n   Fix: rename in memory file, or restore the DB object, or remove the stale reference.');
  process.exit(1);
}

main().catch(err => {
  console.error(`❌ Linter error: ${err.message}`);
  process.exit(2);
});
