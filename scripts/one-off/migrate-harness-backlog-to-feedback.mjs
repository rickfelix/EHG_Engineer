#!/usr/bin/env node
/**
 * One-shot migration: docs/harness-backlog.md → feedback table.
 *
 * - category='harness_backlog'
 * - status='new'
 * - type='enhancement', source_application='EHG_Engineer', source_type='manual_feedback'
 *   (NOT NULL columns; this is harness-defect intake, treated as an enhancement signal
 *    until campaign mode triages it)
 * - title = first ~120 chars of symptom prose (required NOT NULL)
 * - description = full symptom prose
 * - created_at = parsed YYYY-MM-DD at 00:00 UTC
 * - metadata = {
 *     imported_from: 'docs/harness-backlog.md',
 *     imported_at: <now>,
 *     original_date: <YYYY-MM-DD>,
 *     source_location: <file/command between 2nd and 3rd `|` if present>,
 *     deferred_from_sd_key: <SD-XXX-... if present>,
 *     line_format: 'pipe' | 'dash',
 *     raw_line: <verbatim source line>,
 *     dedup_hash: <sha256 of date+raw_line, used for idempotency lookup>,
 *   }
 *
 * Idempotency: skip if a row already exists with
 *   category='harness_backlog' AND metadata->>'imported_from'='docs/harness-backlog.md'
 *   AND metadata->>'dedup_hash' matches this entry's hash.
 *
 * NOTE: We use a sha256 hash for the equality lookup (not raw_line directly)
 * because some raw lines contain SQL-like tokens (e.g. `select('github_repo')`)
 * that trigger Cloudflare WAF rejection on the long-string `eq()` filter.
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const FILE = path.resolve('docs/harness-backlog.md');
const IMPORT_TAG = 'docs/harness-backlog.md';

const sb = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ---- parse ----------------------------------------------------------------

function parseLine(rawLine) {
  const line = rawLine.trim();
  if (!line) return null;
  if (line.startsWith('#')) return null;
  if (line.startsWith('<!--')) return null;
  if (line.startsWith('```')) return null;

  // Dash format: "- YYYY-MM-DD: <body>"
  const dashMatch = line.match(/^-\s+(\d{4}-\d{2}-\d{2})\s*:\s*(.+)$/);
  if (dashMatch) {
    const [, date, body] = dashMatch;
    return parseBody(date, body, 'dash', rawLine);
  }

  // Pipe format: "YYYY-MM-DD | symptom | source | deferred from ..."
  const pipeMatch = line.match(/^(\d{4}-\d{2}-\d{2})\s*\|\s*(.+)$/);
  if (pipeMatch) {
    const [, date, rest] = pipeMatch;
    return parseBody(date, rest, 'pipe', rawLine);
  }

  return null;
}

function parseBody(date, body, format, rawLine) {
  const parts = body.split(/\s*\|\s*/);
  let symptom, sourceLoc = null, deferredSd = null;

  if (parts.length >= 3) {
    symptom = parts[0].trim();
    sourceLoc = parts[1].trim() || null;
    const deferredField = parts.slice(2).join(' | ');
    deferredSd = extractSdKey(deferredField);
  } else if (parts.length === 2) {
    symptom = parts[0].trim();
    const tail = parts[1].trim();
    if (/deferred from|discovered|observed|recurring|RCA|meta-defect/i.test(tail) || /^SD-/.test(tail)) {
      deferredSd = extractSdKey(tail);
    } else {
      sourceLoc = tail;
    }
  } else {
    symptom = body.trim();
    deferredSd = extractSdKey(body);
  }

  // Some dash entries have embedded ` | <source> | deferred from <SD>` AT THE END
  const trailingPipeMatch = symptom.match(/^(.*?)\s*\|\s*([^|]+?)\s*\|\s*(.+)$/);
  if (trailingPipeMatch && format === 'dash' && !sourceLoc) {
    symptom = trailingPipeMatch[1].trim();
    sourceLoc = trailingPipeMatch[2].trim();
    if (!deferredSd) deferredSd = extractSdKey(trailingPipeMatch[3]);
  }

  return {
    date,
    symptom,
    source_location: sourceLoc,
    deferred_from_sd_key: deferredSd,
    line_format: format,
    raw_line: rawLine.trim(),
    dedup_hash: crypto.createHash('sha256').update(`${date}::${rawLine.trim()}`).digest('hex'),
  };
}

function extractSdKey(text) {
  if (!text) return null;
  const m = text.match(/SD-[A-Z0-9][A-Z0-9-]*/);
  return m ? m[0] : null;
}

function makeTitle(symptom) {
  if (!symptom) return '(empty harness backlog item)';
  const firstSentence = symptom.split(/(?<=[.;])\s/)[0] || symptom;
  const trimmed = firstSentence.length > 140 ? firstSentence.slice(0, 137) + '...' : firstSentence;
  return trimmed.trim();
}

// ---- main ----------------------------------------------------------------

async function existing(entry) {
  // Use 64-char hex dedup_hash — short, alphanumeric, never WAF-rejected.
  const { data, error } = await sb
    .from('feedback')
    .select('id')
    .eq('category', 'harness_backlog')
    .eq('metadata->>imported_from', IMPORT_TAG)
    .eq('metadata->>dedup_hash', entry.dedup_hash)
    .limit(1);
  if (error) {
    console.error('Idempotency check error:', error.message);
    return null;
  }
  return data && data.length ? data[0].id : null;
}

async function main() {
  const text = fs.readFileSync(FILE, 'utf8');
  const lines = text.split(/\r?\n/);

  const itemsIdx = lines.findIndex((l) => l.trim() === '## Items');
  if (itemsIdx < 0) {
    console.error('No ## Items section found');
    process.exit(1);
  }

  const itemLines = lines.slice(itemsIdx + 1);
  const parsed = [];
  const skippedParse = [];
  for (const ln of itemLines) {
    const entry = parseLine(ln);
    if (entry) parsed.push(entry);
    else if (ln.trim() && !ln.trim().startsWith('<!--') && !ln.trim().startsWith('#') && !ln.trim().startsWith('```')) {
      skippedParse.push(ln);
    }
  }

  console.log(`Parsed ${parsed.length} entries. Skipped ${skippedParse.length} unparseable non-blank lines.`);
  if (skippedParse.length) {
    console.log('--- skipped lines ---');
    skippedParse.forEach((l) => console.log(`  ${l}`));
  }

  let inserted = 0;
  let skippedDup = 0;
  const insertedRows = [];
  const errors = [];

  for (const entry of parsed) {
    const dup = await existing(entry);
    if (dup) {
      skippedDup++;
      continue;
    }

    const payload = {
      type: 'enhancement',
      source_application: 'EHG_Engineer',
      source_type: 'manual_feedback',
      title: makeTitle(entry.symptom),
      description: entry.symptom,
      category: 'harness_backlog',
      status: 'new',
      created_at: `${entry.date}T00:00:00Z`,
      metadata: {
        imported_from: IMPORT_TAG,
        imported_at: new Date().toISOString(),
        original_date: entry.date,
        source_location: entry.source_location,
        deferred_from_sd_key: entry.deferred_from_sd_key,
        line_format: entry.line_format,
        raw_line: entry.raw_line,
        dedup_hash: entry.dedup_hash,
      },
    };

    const { data, error } = await sb.from('feedback').insert(payload).select('id, title, created_at, category, metadata').single();
    if (error) {
      errors.push({ entry, error: error.message });
      console.error(`INSERT FAIL [${entry.date}]: ${error.message}`);
      continue;
    }
    inserted++;
    insertedRows.push(data);
  }

  console.log('\n=== RESULT ===');
  console.log(`Total parsed:  ${parsed.length}`);
  console.log(`Inserted:      ${inserted}`);
  console.log(`Skipped (dup): ${skippedDup}`);
  console.log(`Errored:       ${errors.length}`);
  if (errors.length) {
    console.log('--- errors ---');
    errors.forEach((e) => console.log(`  [${e.entry.date}] ${e.error}: ${e.entry.symptom.slice(0, 80)}`));
  }
  if (insertedRows.length) {
    console.log('\n=== SAMPLE INSERTED ROW ===');
    console.log(JSON.stringify(insertedRows[0], null, 2));
  }
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
