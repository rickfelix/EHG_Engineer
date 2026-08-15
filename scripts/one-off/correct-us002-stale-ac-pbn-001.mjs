// Corrects SD-LEO-FEAT-PROVEN-BETTER-NEW-001:US-002's acceptance_criteria, written by the
// STORIES sub-agent before TR-6 was corrected (TESTING sub-agent found the original
// "DROP+CREATE the view" plan would silently lose a LEFT JOIN + a prior security_invoker
// fix). AC #2 required a view rebuild that TR-6 now explicitly says NOT to do. AC #3 assumed
// an UPDATE path to pbn_verdict that does not exist in the real design (TR-8: pbn_verdict is
// only ever written via a fresh venture_nursery INSERT — parkVenture always creates a new
// row; reactivateVenture never touches pbn_verdict) — updated_at gets the column DEFAULT on
// INSERT same as created_at, so there is nothing to explicitly advance.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const acceptance_criteria = [
  "GIVEN the migration is applied WHEN venture_nursery is described THEN exactly ONE new column exists — pbn_verdict jsonb, nullable, no default — and zero new tables were created (FR-4 reuse mandate)",
  "CORRECTED (TR-6, after TESTING sub-agent found the original view-rebuild plan would silently drop a LEFT JOIN + a prior security_invoker=on fix): this SD does NOT modify v_nursery_pending_evaluation. GIVEN a pbn_verdict has been written WHEN a consumer needs it THEN it reads venture_nursery.pbn_verdict directly (the base table), never through the pending-evaluation view — a test confirms parkVenture's insert payload includes pbn_verdict on the base table write",
  "CORRECTED (TR-8: pbn_verdict is only ever written via a fresh venture_nursery INSERT — parkVenture always creates a new row per park attempt; reactivateVenture never touches pbn_verdict): updated_at receives the column DEFAULT on INSERT (same mechanism as created_at) — there is no UPDATE code path to pbn_verdict that would need an explicit updated_at advance. A test confirms parkVenture's insert never omits the column shape venture_nursery's DEFAULT NOW() covers.",
  "GIVEN venture_nursery carries an existing public/anon SELECT policy so pbn_verdict inherits anon-readability automatically, while the nursery_evaluation_log audit trail is service-role-only WHEN the migration is finalized THEN a SECURITY sub-agent execution row exists ruling on that asymmetry (TR-7), and the migration file records the ruling in a header comment — the migration is not applied before that ruling exists",
  "GIVEN the migration file WHEN it is read THEN it carries a commented rollback section (DROP COLUMN) following the repo migration convention, and is idempotent under re-run (ADD COLUMN IF NOT EXISTS)",
];

const { data, error } = await supabase.from('user_stories')
  .update({ acceptance_criteria })
  .eq('story_key', 'SD-LEO-FEAT-PROVEN-BETTER-NEW-001:US-002')
  .select('story_key, acceptance_criteria')
  .maybeSingle();
if (error) throw error;
console.log('US-002 acceptance_criteria corrected:', data.story_key, '-', data.acceptance_criteria.length, 'criteria');
