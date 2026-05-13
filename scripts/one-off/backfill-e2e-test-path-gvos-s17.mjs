/**
 * Backfill user_stories.e2e_test_path for SD-GVOS-S17-PROMPT-QUALITY-ORCH-001
 *
 * SD-GVOS-S17-E2E-PLAYWRIGHT-ORCH-001 / FR-3 / US-006
 *
 * One-off idempotent UPDATE: maps each of the 7 parent SD user stories to its
 * matching Playwright spec file. Skips stories that already have a non-null
 * e2e_test_path (safe to re-run).
 *
 * Mapping rationale:
 *   - US-001 (FR-1 scorer)              → composer-preview spec (scorer is exercised via preview)
 *   - US-002 (FR-2 rubric table)        → composer-preview spec (rubric loaded by preview)
 *   - US-003 (FR-3 per-wireframe artifact) → wireframe-artifact-capture spec
 *   - US-004 (FR-4 history JSONB)        → composer-preview spec (history appended via preview)
 *   - US-005 (FR-5 S17 UI)               → s17-integration spec
 *   - US-006 (FR-6 hooks)                → s17-integration spec (hooks are integration glue)
 *   - US-007 (FR-2/3/4 EVA audit)        → s17-integration spec (audit cross-table)
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PARENT_SD = 'SD-GVOS-S17-PROMPT-QUALITY-ORCH-001';

const MAPPING = {
  [`${PARENT_SD}:US-001`]: 'tests/e2e/stage17/gvos-composer-preview.spec.ts',
  [`${PARENT_SD}:US-002`]: 'tests/e2e/stage17/gvos-composer-preview.spec.ts',
  [`${PARENT_SD}:US-003`]: 'tests/e2e/stage17/gvos-wireframe-artifact-capture.spec.ts',
  [`${PARENT_SD}:US-004`]: 'tests/e2e/stage17/gvos-composer-preview.spec.ts',
  [`${PARENT_SD}:US-005`]: 'tests/e2e/stage17/gvos-s17-integration.spec.ts',
  [`${PARENT_SD}:US-006`]: 'tests/e2e/stage17/gvos-s17-integration.spec.ts',
  [`${PARENT_SD}:US-007`]: 'tests/e2e/stage17/gvos-s17-integration.spec.ts',
};

let updated = 0;
let skipped = 0;

for (const [storyKey, e2ePath] of Object.entries(MAPPING)) {
  const { data: existing } = await supabase
    .from('user_stories')
    .select('e2e_test_path')
    .eq('story_key', storyKey)
    .maybeSingle();
  if (!existing) {
    console.warn(`[skip] ${storyKey} — story not found`);
    continue;
  }
  if (existing.e2e_test_path) {
    console.log(`[skip] ${storyKey} — already has e2e_test_path=${existing.e2e_test_path}`);
    skipped++;
    continue;
  }
  const { error } = await supabase
    .from('user_stories')
    .update({ e2e_test_path: e2ePath })
    .eq('story_key', storyKey);
  if (error) {
    console.error(`[fail] ${storyKey} — ${error.message}`);
    continue;
  }
  console.log(`[ok]   ${storyKey} → ${e2ePath}`);
  updated++;
}

console.log(`\nBackfill complete: ${updated} updated, ${skipped} already-set, ${Object.keys(MAPPING).length - updated - skipped} unaccounted-for.`);
