#!/usr/bin/env node
/**
 * Migration: Opus 4.8 prose alignment — model-name bump in protocol sections
 * Date: 2026-05-28
 *
 * Companion to 20260528_add_claude_opus_4_8.sql. The CLAUDE.md family is
 * regenerated from leo_protocol_sections, so any section content that names the
 * operating model ("Opus 4.7" / "claude-opus-4-7") must be bumped in the DB or
 * the next `generate-claude-md-from-db.js` run will re-introduce "Opus 4.7".
 *
 * This is a MECHANICAL rename only (model identifier). It does NOT re-evaluate
 * the behavioral claims attached to that name (e.g. "interprets instructions
 * literally", "defaults to fewer sub-agent spawns") — that is the deferred
 * Tier-3 harness-alignment question.
 *
 * Mirrors the surgical, hash-logged style of 20260424_opus47_harness_alignment.mjs
 * but uses substring replacement (robust to surrounding-text drift) scoped to rows
 * that actually contain the tokens.
 *
 * Run:
 *   node database/migrations/20260528_opus48_prose_alignment.mjs          (DRY — preview only)
 *   node database/migrations/20260528_opus48_prose_alignment.mjs --apply  (write)
 *
 * Idempotent: re-running after apply is a no-op (the old tokens no longer match).
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const APPLY = process.argv.includes('--apply');

const REPLACEMENTS = [
  { find: /Opus 4\.7/g,       replace: 'Opus 4.8' },
  { find: /claude-opus-4-7/g, replace: 'claude-opus-4-8' },
];

const sha8 = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 8);

function applyAll(text) {
  let out = text;
  for (const r of REPLACEMENTS) out = out.replace(r.find, r.replace);
  return out;
}

// Pull the lines that changed so the operator can eyeball the diff in --dry.
function changedLines(before, after) {
  const b = before.split('\n');
  const a = after.split('\n');
  const out = [];
  for (let i = 0; i < Math.max(b.length, a.length); i++) {
    if (b[i] !== a[i]) out.push({ before: b[i], after: a[i] });
  }
  return out;
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.error('[opus48-prose] MISSING CREDS — need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env.');
    process.exit(1);
  }
  const s = createClient(url, key);
  console.log(`[opus48-prose] mode=${APPLY ? 'APPLY' : 'DRY'} date=2026-05-28`);

  const { data: rows, error } = await s
    .from('leo_protocol_sections')
    .select('id, title, content');
  if (error) {
    console.error('[opus48-prose] FETCH FAILED:', error.message);
    process.exit(1);
  }

  let touched = 0, updated = 0, failed = 0;

  for (const row of rows) {
    const before = row.content || '';
    if (!/Opus 4\.7|claude-opus-4-7/.test(before)) continue;

    const after = applyAll(before);
    if (after === before) continue;

    touched++;
    console.log(`\n[id=${row.id}] ${row.title}  ${sha8(before)} -> ${sha8(after)}`);
    for (const { before: b, after: a } of changedLines(before, after)) {
      console.log(`  - ${b.trim().slice(0, 140)}`);
      console.log(`  + ${a.trim().slice(0, 140)}`);
    }

    if (!APPLY) continue;

    const { error: uerr } = await s
      .from('leo_protocol_sections')
      .update({ content: after })
      .eq('id', row.id);
    if (uerr) {
      console.error(`  UPDATE FAILED:`, uerr.message);
      failed++;
    } else {
      console.log('  UPDATE OK');
      updated++;
    }
  }

  console.log(`\n[opus48-prose] summary — rows_with_token=${touched} updated=${updated} failed=${failed}`);
  if (!APPLY && touched > 0) {
    console.log('[opus48-prose] DRY run only. Re-run with --apply to write, then regenerate:');
    console.log('  node scripts/generate-claude-md-from-db.js');
  }
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
