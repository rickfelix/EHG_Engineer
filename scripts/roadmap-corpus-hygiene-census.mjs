#!/usr/bin/env node
/**
 * SD-LEO-INFRA-ROADMAP-CORPUS-HYGIENE-001 — FR-1
 *
 * Read-only, paginated (never capped) census of roadmap_wave_items rows carrying
 * remainder_state='promotable_now' with promoted_to_sd_key IS NULL. Classifies each
 * target row against the FULL table (all remainder_states) into:
 *   - family-cure:  a same-key sibling (source_type + normalized title) already carries
 *                    promoted_to_sd_key set OR remainder_state='void' — this row is a
 *                    duplicate of an already-resolved item.
 *   - standalone:    no such sibling exists — requires individual review (see
 *                    STANDALONE_NON_BUILDABLE_IDS below, populated from manual review
 *                    at PRD authoring time).
 *
 * Normalization mirrors lib/integrations/refine-dedup.js's keywordDedup (lowercase,
 * strip non-alphanumerics, collapse whitespace), extended with a source_type partition
 * per this SD's scope ("group by normalized title + source_type").
 *
 * Safe to run repeatedly — issues no writes.
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { lazyServiceClient } from '../lib/supabase-client.js';

const PAGE_SIZE = 1000;

async function fetchAllPaginated(supabase, table, selectCols, filterFn) {
  const rows = [];
  let from = 0;
  for (;;) {
    let q = supabase.from(table).select(selectCols).range(from, from + PAGE_SIZE - 1);
    if (filterFn) q = filterFn(q);
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

export function normalizeTitle(title) {
  return (title || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

export function familyKey(row) {
  return `${row.source_type}::${normalizeTitle(row.title)}`;
}

/**
 * Rows verified by manual review at PRD authoring time (2026-08-29) to be
 * standalone raw-capture fragments (todoist voice-transcription musings, bare
 * youtube video titles) with no actionable spec content — class (a)/(b) per the
 * SD's scope. No class (c) genuinely-promotable standalone row was found in the
 * verified population; if a future census run surfaces a NEW standalone id not in
 * this list, it is left untouched (not auto-cured) pending the same manual review.
 */
export const STANDALONE_NON_BUILDABLE_IDS = new Set([
  '07e67a71-81af-4188-b262-bfa736e677f9',
  'e1c62f00-b2b8-42ae-a57a-8e95985cb366',
  'c0d2c7d5-bab9-49b7-924f-865b8967c9a1',
  'edff84c6-32b7-4547-879e-d07a55a50f01',
  '7429acb9-5b0d-44c7-85c0-ebc724765567',
  '7eaa7b6c-e1e0-45c2-8647-2b475e38b4c8',
  'ef4f03dd-f102-4af0-bfcb-c62fc93764f0',
  'a816095c-4338-499c-bb3d-8a0333a985fb',
  '9ca3c17a-1043-4bf3-9a3b-eff4f1726ff9',
  '774250c1-4bab-4e4b-93f4-77d9a043fd5a',
  '9e80ef4f-3b3c-47b2-824b-2c8cd0e4fa51',
  '6e3f1967-1bdd-4455-a6bb-f26799230450',
  '7df58f23-f5a9-4e27-84d1-67a1cec89445',
]);

export async function runCensus(supabase) {
  const target = await fetchAllPaginated(
    supabase,
    'roadmap_wave_items',
    'id, source_type, title, promoted_to_sd_key, item_disposition, lane, remainder_state, created_at',
    (q) => q.eq('remainder_state', 'promotable_now').is('promoted_to_sd_key', null)
  );
  const allRows = await fetchAllPaginated(
    supabase,
    'roadmap_wave_items',
    'id, source_type, title, promoted_to_sd_key, item_disposition, lane, remainder_state'
  );

  const familyMap = new Map();
  for (const r of allRows) {
    const key = familyKey(r);
    if (!familyMap.has(key)) familyMap.set(key, []);
    familyMap.get(key).push(r);
  }

  const familyCure = [];
  const standaloneCurable = [];
  const standaloneUnclassified = [];

  for (const row of target) {
    const siblings = familyMap.get(familyKey(row)) || [];
    const canonical = siblings.find((s) => s.id !== row.id && (s.promoted_to_sd_key || s.remainder_state === 'void'));
    if (canonical) {
      familyCure.push({ id: row.id, title: row.title, source_type: row.source_type, canonical_member_id: canonical.id });
    } else if (STANDALONE_NON_BUILDABLE_IDS.has(row.id)) {
      standaloneCurable.push({ id: row.id, title: row.title, source_type: row.source_type });
    } else {
      standaloneUnclassified.push({ id: row.id, title: row.title, source_type: row.source_type });
    }
  }

  return {
    total: target.length,
    family_cure_count: familyCure.length,
    standalone_curable_count: standaloneCurable.length,
    standalone_unclassified_count: standaloneUnclassified.length,
    family_cure: familyCure,
    standalone_curable: standaloneCurable,
    standalone_unclassified: standaloneUnclassified,
  };
}

async function main() {
  const supabase = lazyServiceClient();
  const report = await runCensus(supabase);
  console.log(`TOTAL promotable_now + unpromoted: ${report.total}`);
  console.log(`  family-cure:               ${report.family_cure_count}`);
  console.log(`  standalone (curable):       ${report.standalone_curable_count}`);
  console.log(`  standalone (unclassified):  ${report.standalone_unclassified_count}`);
  if (report.standalone_unclassified_count > 0) {
    console.log('\n⚠️  New standalone rows found that were not part of the PRD-authoring manual review:');
    console.log(JSON.stringify(report.standalone_unclassified, null, 2));
  }
  const outPath = new URL('../scripts/temp/roadmap-corpus-hygiene-census-report.json', import.meta.url);
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nReport written to ${outPath.pathname}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
