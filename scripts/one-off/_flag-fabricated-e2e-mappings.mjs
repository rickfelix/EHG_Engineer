#!/usr/bin/env node
/**
 * SD-LEO-INFRA-STORY-E2E-AUTO-001 FR-3 — FLAG fabricated e2e mappings. Never rewrite them.
 *
 * Each row is a historical claim that a specific SD passed TESTING. Nulling it would clean the
 * data and destroy the evidence of what cleared on fiction, so this writes ONLY to
 * user_stories.metadata and leaves e2e_test_path / e2e_test_status exactly as found.
 *
 * CLASSIFIES rather than lumps — a missing file is not automatically a lie:
 *   fiction_passing     claims 'passing' for a spec that does not exist. Clears TESTING
 *                       clause 2 (path present) AND clause 3 (status passing) on fiction.
 *   fiction_created     claims 'created' for a spec that does not exist.
 *   honest_not_created  points at an absent file and SAYS SO ('not_created'). NOT fiction —
 *                       this is the shape auto-trigger-stories emits, and it is the behaviour
 *                       the other rows should have had. Flagged for visibility, not blame.
 *   unclear_skipped     'skipped' on an absent file. Ambiguous; recorded, not judged.
 *
 * DRY-RUN BY DEFAULT. Pass --apply to write. Idempotent: a row already carrying this marker
 * with the same classification is skipped, so a second run makes no further change.
 */
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { specFileExists } from '../../lib/stories/e2e-path-guard.js';

const MARKER = 'fabricated_e2e_mapping_20260809';
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const APPLY = process.argv.includes('--apply');
const supabase = await getSupabaseClient();

function classify(status) {
  if (status === 'passing') return 'fiction_passing';
  if (status === 'created') return 'fiction_created';
  if (status === 'not_created') return 'honest_not_created';
  return 'unclear_skipped';
}

// --- Measure the POPULATION, not the cap -----------------------------------
const { count: total, error: cErr } = await supabase
  .from('user_stories').select('id', { count: 'exact', head: true }).not('e2e_test_path', 'is', null);
if (cErr) { console.error('COUNT FAILED:', cErr.message); process.exit(1); }

const rows = [];
for (let from = 0; from < total; from += 1000) {
  const { data, error } = await supabase
    .from('user_stories')
    .select('id, story_key, e2e_test_path, e2e_test_status, metadata')
    .not('e2e_test_path', 'is', null)
    .order('story_key')
    .range(from, from + 999);
  if (error) { console.error(`PAGE ${from} FAILED:`, error.message); process.exit(1); }
  rows.push(...data);
}
if (rows.length !== total) {
  console.error(`PAGINATION INCOMPLETE: ${rows.length} of ${total} — refusing to act on a partial population.`);
  process.exit(1);
}

const targets = rows.filter((r) => !specFileExists(REPO_ROOT, r.e2e_test_path, { existsSync }));
const byClass = {};
for (const r of targets) { const c = classify(r.e2e_test_status); byClass[c] = (byClass[c] ?? 0) + 1; }
console.log(`population: ${total} non-null paths | missing-file rows: ${targets.length}`);
console.log('classification:', JSON.stringify(byClass));
console.log(APPLY ? '\nAPPLYING (metadata only; path/status untouched)…' : '\nDRY RUN — pass --apply to write.');

if (!APPLY) process.exit(0);

// --- Flag, one row at a time, asserting rowcount ----------------------------
let written = 0, skipped = 0;
for (const r of targets) {
  const classification = classify(r.e2e_test_status);
  const prior = r.metadata && typeof r.metadata === 'object' ? r.metadata : {};
  if (prior[MARKER] && prior[MARKER].classification === classification) { skipped += 1; continue; }

  const merged = {
    ...prior,
    [MARKER]: {
      classification,
      observed_e2e_test_path: r.e2e_test_path,
      observed_e2e_test_status: r.e2e_test_status,
      finding: 'The referenced spec file does not exist in the repository. This row is FLAGGED, not rewritten: it is a historical record of what this story claimed, and erasing it would destroy the audit trail of what cleared TESTING on fiction.',
      remediation: 'Set e2e_test_path to NULL (which the TESTING filter accepts), or point it at a spec that exists and exercises the story.',
      sd: 'SD-LEO-INFRA-STORY-E2E-AUTO-001',
      flagged_by: 'Alpha-3 cff8013c',
    },
  };

  const { data: updated, error } = await supabase
    .from('user_stories').update({ metadata: merged }).eq('id', r.id).select('id');
  if (error) { console.error(`UPDATE FAILED ${r.story_key}: ${error.message}`); process.exit(1); }
  // An UPDATE matching zero rows is indistinguishable from success unless asserted.
  if (!updated || updated.length !== 1) {
    console.error(`UPDATE MATCHED ${updated ? updated.length : 0} ROWS for ${r.story_key} — expected exactly 1. Aborting.`);
    process.exit(1);
  }
  written += 1;
}
console.log(`flagged: ${written} | already-flagged (idempotent skip): ${skipped}`);

// --- Read back the FIELD, not just the row ----------------------------------
const { count: flaggedCount, error: rbErr } = await supabase
  .from('user_stories').select('id', { count: 'exact', head: true }).not(`metadata->${MARKER}`, 'is', null);
if (rbErr) { console.error('READBACK FAILED:', rbErr.message); process.exit(1); }
console.log(`readback — rows carrying ${MARKER}: ${flaggedCount} (expected ${targets.length})`);
if (flaggedCount !== targets.length) { console.error('READBACK MISMATCH — not all targets carry the marker.'); process.exit(1); }

// Prove path/status were NOT touched.
const { count: stillMissing, error: pErr } = await supabase
  .from('user_stories').select('id', { count: 'exact', head: true })
  .not('e2e_test_path', 'is', null).eq('e2e_test_status', 'passing');
if (pErr) { console.error('PRESERVATION CHECK FAILED:', pErr.message); process.exit(1); }
console.log(`preservation check — rows still non-null path + status=passing: ${stillMissing} (unchanged by design)`);
