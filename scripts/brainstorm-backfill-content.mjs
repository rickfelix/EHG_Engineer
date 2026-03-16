#!/usr/bin/env node
/**
 * Brainstorm Content Backfill Script
 *
 * Migrates brainstorm content from filesystem markdown files to the
 * brainstorm_sessions.content database column.
 *
 * Finds all sessions with document_path set but content NULL,
 * reads the file, and updates the content column.
 *
 * Usage:
 *   node scripts/brainstorm-backfill-content.mjs              # Execute backfill
 *   node scripts/brainstorm-backfill-content.mjs --dry-run    # Preview without changes
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  console.log('\n═══════════════════════════════════════════════════════');
  console.log(' BRAINSTORM CONTENT BACKFILL');
  if (DRY_RUN) console.log(' MODE: DRY RUN (no DB changes)');
  console.log('═══════════════════════════════════════════════════════\n');

  // Find sessions with document_path but no content
  const { data: sessions, error } = await supabase
    .from('brainstorm_sessions')
    .select('id, topic, document_path, created_at')
    .not('document_path', 'is', null)
    .is('content', null)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Query failed:', error.message);
    process.exit(1);
  }

  console.log(`Found ${sessions?.length || 0} sessions with document_path but no content\n`);

  if (!sessions?.length) {
    console.log('Nothing to backfill.');
    return;
  }

  let migrated = 0;
  let failed = 0;
  let fileNotFound = 0;

  for (const session of sessions) {
    const label = session.topic?.slice(0, 60) || session.id;
    const filePath = resolve(process.cwd(), session.document_path);

    let content;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch {
      console.log(`  SKIP  ${label}`);
      console.log(`        File not found: ${session.document_path}`);
      fileNotFound++;
      continue;
    }

    if (content.length < 10) {
      console.log(`  SKIP  ${label} (empty file: ${content.length} chars)`);
      fileNotFound++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`  [DRY] ${label} (${content.length} chars)`);
      migrated++;
      continue;
    }

    const { error: updErr } = await supabase
      .from('brainstorm_sessions')
      .update({ content })
      .eq('id', session.id);

    if (updErr) {
      console.log(`  FAIL  ${label}: ${updErr.message}`);
      failed++;
    } else {
      console.log(`  OK    ${label} (${content.length} chars)`);
      migrated++;
    }
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log(` BACKFILL COMPLETE`);
  console.log(`   Migrated:       ${migrated}`);
  console.log(`   File not found: ${fileNotFound}`);
  console.log(`   Failed:         ${failed}`);
  console.log(`   Total:          ${sessions.length}`);
  console.log('═══════════════════════════════════════════════════════\n');
}

// Windows-compatible ESM entry point
if (process.argv[1] && (
  import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`
)) {
  main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
}

export { main };
