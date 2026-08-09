/**
 * Amendment 2 to retrospective ba1be19a-5bc8-42d7-acb7-7ddebcd50c58
 * (SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001).
 *
 * WHY: the first run of insert-retro-scheduled-worktree-reaper-001.mjs stored an incomplete row.
 * A blunt `sed -i "/validate-retrospective-schema.js/d"` (intended to drop one import line) also
 * deleted the two CONTENT lines that happened to mention that filename: the text of the 18th
 * what_needs_improvement entry, and the `action:` key of the 9th action item. Result:
 *   - what_needs_improvement.push() with no argument -> pushes NOTHING (17 items, not 18)
 *   - action_items[8] stored with owner/deadline/priority but NO action text, which
 *     scripts/lib/retro-action-item-filter.mjs actionText() renders as '(no text)' and which
 *     promote-retro-action-items.mjs would have promoted into a QF titled '(no text)'
 *     (the QF-20260711-253 class).
 * Both the count-based preflight (which counted 17/9 and called it good) and the gate predicate
 * read GREEN. This is the retrospective's own subject matter committed inside the retrospective's
 * own writer; it is recorded here rather than silently fixed.
 *
 * The writer script now carries a content-integrity preflight (empty/short array entries and
 * action items with no action text) that fails on exactly this mutation - verified two-sided.
 */
import { createSupabaseServiceClient } from '../lib/supabase-connection.js';

const RETRO_ID = 'ba1be19a-5bc8-42d7-acb7-7ddebcd50c58';

const MISSING_IMPROVEMENT =
  'The shared retrospective schema validator (the validateRetrospective exported by scripts/validate-retrospective-schema.js) is unusable and nobody noticed, because scripts/generate-comprehensive-retrospective.js carries its own LOCAL copy. The exported one maps key_learnings to key_learnings and so errors on every valid retro; it also flags protocol_improvements (a real column) as a wrong field name; and its constraint-discovery query runs on ANON_KEY, silently returning zero rows and therefore an EMPTY allowlist that rejects generated_by=MANUAL and yields a team_satisfaction range of Infinity..-Infinity. An instrument nobody invokes is indistinguishable from an absent one.';

const MISSING_ACTION =
  'Fix or delete the validateRetrospective exported by scripts/validate-retrospective-schema.js: repair the key_learnings self-map and the protocol_improvements mis-mapping, run constraint discovery on the service key (or drop the discovery step), and make generate-comprehensive-retrospective.js import it instead of keeping a private copy.';

const supabase = await createSupabaseServiceClient();

const { data: current, error: readErr } = await supabase
  .from('retrospectives')
  .select('what_needs_improvement, action_items, metadata')
  .eq('id', RETRO_ID)
  .single();
if (readErr) {
  console.error('READ FAILED:', readErr.message);
  process.exit(1);
}

const improvements = [...current.what_needs_improvement];
if (!improvements.some((s) => s.includes('shared retrospective schema validator'))) {
  improvements.push(MISSING_IMPROVEMENT);
}

const actions = current.action_items.map((a) => (a && !a.action ? { ...a, action: MISSING_ACTION } : a));

const broken = actions.filter((a) => !a?.action);
if (broken.length > 0) {
  console.error('ABORT: still', broken.length, 'action item(s) with no action text');
  process.exit(1);
}

const metadata = {
  ...(current.metadata || {}),
  content_repair_note:
    'Amendment 2 restored 1 what_needs_improvement entry and 1 action_items[].action that a blunt sed deleted from the writer before the original INSERT. See scripts/one-off/amend2-retro-scheduled-worktree-reaper-001.mjs.',
};

const { data: updated, error } = await supabase
  .from('retrospectives')
  .update({ what_needs_improvement: improvements, action_items: actions, metadata, updated_at: new Date().toISOString() })
  .eq('id', RETRO_ID)
  .select('id, quality_score, what_needs_improvement, action_items')
  .single();
if (error) {
  console.error('UPDATE FAILED:', error.message);
  process.exit(1);
}

console.log('AMENDED', updated.id);
console.log('  what_needs_improvement:', updated.what_needs_improvement.length);
console.log('  action_items:', updated.action_items.length, '| with action text:', updated.action_items.filter((a) => a?.action).length);
console.log('  quality_score after update:', updated.quality_score);
