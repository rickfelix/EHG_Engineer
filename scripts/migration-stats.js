#!/usr/bin/env node
/**
 * Migration Statistics Tool
 * SD: SD-MAN-ORCH-EVA-CODEBASE-PLUS-001-H
 *
 * Analyzes migration files: count, size, types, consolidation opportunities.
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'supabase', 'migrations');

function analyzeMigrations() {
  let files;
  try {
    files = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();
  } catch {
    return { error: 'Migrations directory not found at: ' + MIGRATIONS_DIR };
  }

  const stats = {
    totalFiles: files.length,
    totalSizeBytes: 0,
    byType: { create: 0, alter: 0, drop: 0, insert: 0, other: 0 },
    rollbackFiles: 0,
    emptyFiles: 0,
    largestFile: { name: '', size: 0 },
    dateRange: { earliest: null, latest: null },
  };

  for (const file of files) {
    const fullPath = join(MIGRATIONS_DIR, file);
    const fileStat = statSync(fullPath);
    stats.totalSizeBytes += fileStat.size;

    if (fileStat.size > stats.largestFile.size) {
      stats.largestFile = { name: file, size: fileStat.size };
    }

    const content = readFileSync(fullPath, 'utf8').trim();
    if (content.length === 0) {
      stats.emptyFiles++;
      continue;
    }

    const upper = content.toUpperCase();
    if (upper.includes('CREATE TABLE') || upper.includes('CREATE TYPE') || upper.includes('CREATE FUNCTION')) {
      stats.byType.create++;
    } else if (upper.includes('ALTER TABLE') || upper.includes('ALTER TYPE')) {
      stats.byType.alter++;
    } else if (upper.includes('DROP TABLE') || upper.includes('DROP FUNCTION') || upper.includes('DROP TYPE')) {
      stats.byType.drop++;
    } else if (upper.includes('INSERT INTO') || upper.includes('UPDATE ') || upper.includes('DELETE FROM')) {
      stats.byType.insert++;
    } else {
      stats.byType.other++;
    }

    // Check for rollback patterns
    if (file.includes('rollback') || file.includes('revert') || content.includes('-- rollback')) {
      stats.rollbackFiles++;
    }

    // Extract date from filename (YYYYMMDDHHMMSS format)
    const dateMatch = file.match(/^(\d{14})/);
    if (dateMatch) {
      const ts = dateMatch[1];
      if (!stats.dateRange.earliest || ts < stats.dateRange.earliest) {
        stats.dateRange.earliest = ts;
      }
      if (!stats.dateRange.latest || ts > stats.dateRange.latest) {
        stats.dateRange.latest = ts;
      }
    }
  }

  return stats;
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatTimestamp(ts) {
  if (!ts) return 'unknown';
  return `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;
}

function main() {
  console.log('\n=== Migration Statistics ===\n');

  const stats = analyzeMigrations();

  if (stats.error) {
    console.log(stats.error);
    process.exit(1);
  }

  console.log(`Total migration files: ${stats.totalFiles}`);
  console.log(`Total size: ${formatBytes(stats.totalSizeBytes)}`);
  console.log(`Date range: ${formatTimestamp(stats.dateRange.earliest)} → ${formatTimestamp(stats.dateRange.latest)}`);
  console.log(`Empty files: ${stats.emptyFiles}`);
  console.log(`Rollback files: ${stats.rollbackFiles}`);
  console.log(`Largest: ${stats.largestFile.name} (${formatBytes(stats.largestFile.size)})`);

  console.log('\nBy type:');
  console.log(`  CREATE (table/type/function): ${stats.byType.create}`);
  console.log(`  ALTER (table/type):           ${stats.byType.alter}`);
  console.log(`  DROP (table/function/type):   ${stats.byType.drop}`);
  console.log(`  DML (insert/update/delete):   ${stats.byType.insert}`);
  console.log(`  Other:                        ${stats.byType.other}`);

  // Consolidation recommendation
  console.log('\n--- Consolidation Analysis ---\n');
  if (stats.totalFiles > 100) {
    console.log(`High migration count (${stats.totalFiles}). Consolidation recommended.`);
    console.log('Steps:');
    console.log('  1. Run: node scripts/schema-snapshot.js save');
    console.log('  2. Archive migrations to supabase/migrations_archive/');
    console.log('  3. Create baseline from schema-snapshot.json');
    console.log('  4. Verify: node scripts/schema-snapshot.js compare');
  } else {
    console.log(`Migration count (${stats.totalFiles}) is manageable.`);
  }

  console.log('');
}

main();
