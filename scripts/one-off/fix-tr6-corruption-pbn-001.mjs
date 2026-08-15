// Fixes TR-6's rationale text on PRD-SD-LEO-FEAT-PROVEN-BETTER-NEW-001, which got silently
// truncated by an earlier inline `node -e "..."` bash call: backticks inside the double-quoted
// bash string triggered command substitution and blanked the SQL-snippet portions of the text.
// Written as a real .mjs FILE (not inline -e) specifically to avoid that trap again.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PRD_ID = 'PRD-SD-LEO-FEAT-PROVEN-BETTER-NEW-001';

const { data: current, error: fetchErr } = await supabase.from('product_requirements_v2')
  .select('technical_requirements').eq('id', PRD_ID).maybeSingle();
if (fetchErr) throw fetchErr;

const technical_requirements = current.technical_requirements.map((tr) => {
  if (tr.id !== 'TR-6') return tr;
  return {
    id: 'TR-6',
    requirement: "DECISION (revised after independent TESTING sub-agent verification found the DATABASE sub-agent's original view-refresh premise incomplete): this SD does NOT modify v_nursery_pending_evaluation. All PBN consumers read pbn_verdict directly from the base venture_nursery table, never through that view.",
    rationale: "Directly verified (this session, database/migrations/20260209_stage0_venture_entry_schema.sql:543-553): the view is `SELECT vn.*, vb.name AS brief_name, vb.problem_statement, vb.archetype, vb.origin_type FROM venture_nursery vn LEFT JOIN venture_briefs vb ON vb.id = vn.brief_id WHERE vn.promoted_to_venture_id IS NULL AND (vn.next_evaluation_at IS NULL OR vn.next_evaluation_at <= NOW()) ORDER BY vn.current_score DESC NULLS LAST` -- not a bare vn.*, so a naive DROP+CREATE refresh risks silently dropping the join/extra columns/WHERE/ORDER BY. Separately verified (20260211_fix_security_definer_views_and_rls.sql:88,109) that a prior security remediation ran `ALTER VIEW public.v_nursery_pending_evaluation SET (security_invoker = on)` on this exact view -- a DROP+CREATE loses that setting unless explicitly reapplied in the same migration. Given Postgres column-list freezing means pbn_verdict will never appear in this view without a refresh regardless, and a correct refresh is nontrivial (CREATE OR REPLACE VIEW cannot reorder/insert columns before existing ones -- vn.* expanding mid-list would shift brief_name/problem_statement/archetype/origin_type's ordinal positions, which Postgres rejects), the lower-risk PLAN decision is: skip the view for this SD entirely. FR-2(iv) only requires the verdict persist ON the nursery row, not that it appear in this specific view. A future SD can ship a careful, security-invoker-preserving view refresh if a real consumer needs pbn_verdict through v_nursery_pending_evaluation.",
  };
});

const { data: updated, error: updateErr } = await supabase.from('product_requirements_v2')
  .update({ technical_requirements })
  .eq('id', PRD_ID)
  .select('technical_requirements').maybeSingle();
if (updateErr) throw updateErr;
const tr6 = updated.technical_requirements.find((t) => t.id === 'TR-6');
console.log('TR-6 rationale length:', tr6.rationale.length);
console.log('Contains SELECT vn.*:', tr6.rationale.includes('SELECT vn.*'));
console.log('Contains ALTER VIEW:', tr6.rationale.includes('ALTER VIEW'));
