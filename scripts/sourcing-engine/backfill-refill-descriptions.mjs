#!/usr/bin/env node
/**
 * SD-LEO-INFRA-BELT-001-PART-001 (FR-3c) — one-shot, VISIBLE + LOGGED, reversible backfill.
 *
 * Part-1 (PR #5012) added a substance_thin REJECT to evaluateRefillCandidate keyed on a 120-char
 * truncated title. The populator historically copied ONLY feedback.title and DROPPED
 * feedback.description, so ~173 staged roadmap_wave_items are truncation shells and get rejected —
 * drying the belt (promotable=0). The forward fix (FR-3a) makes the populator carry
 * feedback.description into metadata.description; this one-shot recovers that substance for the
 * EXISTING truncated rows so the belt can refill from existing feedstock.
 *
 * SAFE: dry-run by DEFAULT (pass --apply to write). Additive only — writes metadata.description
 * (preserving every existing metadata key); never deletes, never changes disposition/title/lane.
 * Idempotent: a row that already carries metadata.description is skipped. Reversible: clearing the
 * added metadata.description restores the prior state. Every row is reported (recovered / skipped /
 * no-source-description) — never a silent change.
 *
 * Usage:
 *   node scripts/sourcing-engine/backfill-refill-descriptions.mjs            # dry-run (default)
 *   node scripts/sourcing-engine/backfill-refill-descriptions.mjs --apply    # write
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { isSubstanceThinTitle, MIN_RECOVERED_SUBSTANCE_LEN } from '../../lib/sourcing-engine/refill-candidate-validity.js';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9 — every pending row is scanned
// for the substance_thin recovery; a capped read would silently leave belt-blocking rows
// unrecovered with no error.
import { fetchAllPaginated } from '../../lib/db/fetch-all-paginated.mjs';

dotenv.config();

const APPLY = process.argv.includes('--apply');
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function log(...a) { console.log('[backfill-refill-descriptions]', ...a); }

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('Missing Supabase service-role credentials');
    process.exit(1);
  }
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  log(APPLY ? 'APPLY mode — will WRITE metadata.description' : 'DRY-RUN (default) — no writes; pass --apply to write');

  // Candidate rows: staged (pending), truncated title shell, missing a recovered metadata.description.
  let rows;
  try {
    rows = await fetchAllPaginated(() => sb
      .from('roadmap_wave_items')
      .select('id, source_type, source_id, title, metadata, item_disposition')
      .eq('item_disposition', 'pending')
      .order('id', { ascending: true }));
  } catch (e) {
    console.error('query failed:', e.message);
    process.exit(1);
  }

  const candidates = rows.filter((r) => {
    const md = r.metadata && typeof r.metadata === 'object' ? r.metadata : {};
    const alreadyHas = typeof md.description === 'string' && md.description.trim().length >= MIN_RECOVERED_SUBSTANCE_LEN;
    return isSubstanceThinTitle(r.title) && !alreadyHas;
  });
  log(`pending=${rows.length} truncated-without-description=${candidates.length}`);
  if (!candidates.length) { log('nothing to recover — done'); return; }

  // Bounded batch lookup of source feedback descriptions (source_id = feedback row id).
  const ids = [...new Set(candidates.map((c) => c.source_id).filter(Boolean))];
  const descById = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const slice = ids.slice(i, i + 100);
    // feedback carries the full substance in `description` (title is the 120-char truncated shell —
    // never fall back to it). The feedback table has no detail/summary column.
    const { data: fb, error: fbErr } = await sb.from('feedback').select('id, description').in('id', slice);
    if (fbErr) { console.error('feedback lookup failed:', fbErr.message); process.exit(1); }
    for (const f of (fb || [])) {
      if (typeof f.description === 'string' && f.description.trim()) descById.set(f.id, f.description);
    }
  }

  let recovered = 0, noSource = 0;
  for (const c of candidates) {
    const desc = descById.get(c.source_id);
    if (!desc || desc.trim().length < MIN_RECOVERED_SUBSTANCE_LEN) {
      noSource++;
      log(`SKIP no-usable-source-description: ${c.id} (source ${c.source_id}) "${(c.title || '').slice(0, 50)}…"`);
      continue;
    }
    recovered++;
    log(`RECOVER: ${c.id} <- feedback ${c.source_id} (${desc.trim().length} chars)`);
    if (APPLY) {
      const md = { ...(c.metadata && typeof c.metadata === 'object' ? c.metadata : {}), description: desc };
      const { error: upErr } = await sb.from('roadmap_wave_items').update({ metadata: md }).eq('id', c.id);
      if (upErr) log(`  WRITE FAILED ${c.id}: ${upErr.message}`);
    }
  }
  log(`SUMMARY: ${APPLY ? 'wrote' : 'would-write'}=${recovered} skipped-no-source=${noSource} total-candidates=${candidates.length}`);
  if (!APPLY) log('re-run with --apply to perform the writes');
}

main().catch((e) => { console.error('fatal:', e?.message || e); process.exit(1); });
