#!/usr/bin/env node
/**
 * Dormant Table Audit Tool
 * SD: SD-MAN-ORCH-EVA-CODEBASE-PLUS-001-H
 *
 * Identifies tables with no recent writes by querying pg_stat_user_tables
 * and cross-referencing with codebase references.
 */

import { createClient } from '@supabase/supabase-js';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

function findCodeReferences(tableName, rootDir) {
  const refs = [];
  const searchDirs = ['lib', 'scripts', 'server'];

  for (const dir of searchDirs) {
    const fullPath = join(rootDir, dir);
    try {
      walkDir(fullPath, (filePath) => {
        if (!filePath.endsWith('.js') && !filePath.endsWith('.ts') && !filePath.endsWith('.mjs')) return;
        try {
          const content = readFileSync(filePath, 'utf8');
          if (content.includes(tableName)) {
            refs.push(filePath.replace(rootDir, '.'));
          }
        } catch { /* skip unreadable */ }
      });
    } catch { /* dir doesn't exist */ }
  }
  return refs;
}

function walkDir(dir, callback) {
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory() && !entry.startsWith('.') && entry !== 'node_modules') {
          walkDir(fullPath, callback);
        } else if (stat.isFile()) {
          callback(fullPath);
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
}

async function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose') || args.includes('-v');
  const rootDir = join(__dirname, '..');

  console.log('\n=== Dormant Table Audit ===\n');

  // Get table stats
  const { data: stats, error } = await supabase.rpc('exec_sql', {
    query: `
      SELECT schemaname, relname AS table_name,
             n_tup_ins AS inserts,
             n_tup_upd AS updates,
             n_tup_del AS deletes,
             (n_tup_ins + n_tup_upd + n_tup_del) AS total_writes,
             last_vacuum,
             last_analyze
      FROM pg_stat_user_tables
      WHERE schemaname = 'public'
      ORDER BY total_writes ASC
    `,
  });

  if (error) {
    // Fallback: list tables from information_schema
    console.log('Cannot access pg_stat_user_tables via RPC. Using table listing instead.');
    const { data: tables } = await supabase.rpc('exec_sql', {
      query: `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
    });

    if (!tables) {
      console.log('Cannot query table information. Check database permissions.');
      return;
    }

    console.log(`Total tables: ${tables.length}\n`);
    console.log('Checking codebase references...\n');

    let dormantCount = 0;
    for (const t of tables) {
      const refs = findCodeReferences(t.table_name, rootDir);
      if (refs.length === 0) {
        dormantCount++;
        console.log(`  DORMANT  ${t.table_name} (0 code references)`);
      } else if (verbose) {
        console.log(`  ACTIVE   ${t.table_name} (${refs.length} references)`);
      }
    }

    console.log(`\nSummary: ${dormantCount} potentially dormant table(s) out of ${tables.length}`);
    return;
  }

  // Full analysis with stats
  const zeroWriteTables = stats.filter(t => t.total_writes === 0);
  const lowWriteTables = stats.filter(t => t.total_writes > 0 && t.total_writes < 10);

  console.log(`Total tables: ${stats.length}`);
  console.log(`Zero-write tables: ${zeroWriteTables.length}`);
  console.log(`Low-write tables (<10): ${lowWriteTables.length}\n`);

  if (zeroWriteTables.length > 0) {
    console.log('--- Zero-Write Tables (candidates for removal) ---\n');
    for (const t of zeroWriteTables) {
      const refs = findCodeReferences(t.table_name, rootDir);
      const status = refs.length === 0 ? 'DORMANT' : 'REFERENCED';
      console.log(`  ${status}  ${t.table_name}`);
      if (refs.length > 0 && verbose) {
        refs.forEach(r => console.log(`           ref: ${r}`));
      }
    }
  }

  if (verbose && lowWriteTables.length > 0) {
    console.log('\n--- Low-Write Tables ---\n');
    for (const t of lowWriteTables) {
      console.log(`  ${t.table_name}: ${t.total_writes} writes (I:${t.inserts} U:${t.updates} D:${t.deletes})`);
    }
  }

  console.log('');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
