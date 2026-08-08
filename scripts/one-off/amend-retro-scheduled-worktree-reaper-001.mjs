/**
 * Amendment to retrospective ba1be19a-5bc8-42d7-acb7-7ddebcd50c58
 * (SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001).
 *
 * WHY: the insert supplied quality_score=92, and the row read back 100. The
 * retrospectives quality trigger (database/migrations/20260808_qf251_retro_quality_vacuous_predicate.sql,
 * NEW.quality_score := score) recomputes the score from array completeness and OVERWRITES whatever the
 * writer supplied. Supplied value is not stored value. The description therefore said "QUALITY SCORE
 * RATIONALE: 92" on a row storing 100 — a retrospective about instruments that lie must not ship one.
 *
 * This amends description only; metadata gains both numbers. The trigger re-fires on UPDATE and
 * recomputes 100 again (verified in the readback below).
 */
import { createSupabaseServiceClient } from '../lib/supabase-connection.js';

const RETRO_ID = 'ba1be19a-5bc8-42d7-acb7-7ddebcd50c58';

const supabase = await createSupabaseServiceClient();

const { data: current, error: readErr } = await supabase
  .from('retrospectives')
  .select('description, metadata, quality_score')
  .eq('id', RETRO_ID)
  .single();
if (readErr) {
  console.error('READ FAILED:', readErr.message);
  process.exit(1);
}

const OLD = 'QUALITY SCORE RATIONALE: 92 = strong evidence density';
if (!current.description.includes(OLD)) {
  console.error('ABORT: description does not contain the sentence this amendment replaces (already amended?).');
  process.exit(1);
}

const description = current.description.slice(0, current.description.indexOf(OLD))
  + 'QUALITY SCORE: the stored 100/100 (quality_issues []) is the DB trigger number — the retrospectives '
  + 'quality trigger recomputes quality_score from array completeness and overwrites whatever the writer '
  + 'supplies. The AUTHORED self-assessment was 92: strong evidence density '
  + '(27 sub-agent executions, 3 accepted handoffs at 94/95/87, PRD present, 12 new test files / 91 new '
  + 'test cases including a 17-case real-git suite), discounted for a live-repo escape during testing and '
  + 'for the nineteen self-committed instances of the defect class under review. The trigger scores how '
  + 'complete the arrays are, not what it cost to fill them.';

const metadata = {
  ...(current.metadata || {}),
  quality_score_authored: 92,
  quality_score_stored_by_trigger: 100,
  quality_score_note: 'retrospectives quality trigger (NEW.quality_score := score) overwrites the supplied value on every INSERT and UPDATE',
};

const { data: updated, error } = await supabase
  .from('retrospectives')
  .update({ description, metadata, updated_at: new Date().toISOString() })
  .eq('id', RETRO_ID)
  .select('id, quality_score, description')
  .single();
if (error) {
  console.error('UPDATE FAILED:', error.message);
  process.exit(1);
}
console.log('AMENDED', updated.id, '| quality_score after update:', updated.quality_score);
console.log('description length:', updated.description.length);
