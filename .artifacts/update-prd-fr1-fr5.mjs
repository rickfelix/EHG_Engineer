import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const FR1 = [
  'MEASURED LIVE: public.record_venture_error has prosecdef=true, owner postgres with rolbypassrls=true, anon holds EXECUTE. No RLS policy on feedback can constrain it.',
  'SELF-CORRECTION TO AN EARLIER VERSION OF THIS FR. I originally wrote that the SD OVERSTATED the severity by saying the function inserts severity=high, and framed the two-insert-path fact as a correction I was contributing. That is not right. The KNOWN GAPS block at database/migrations/20260802_bound_anon_feedback_ingress.sql:275 already states that its STORM BRANCH inserts severity=high with status=new. The original analysis carried the qualifier; the SD scope text is what compressed it away. My live read independently confirms the two paths (normal = issue/new/MEDIUM, storm-watermark = issue/new/HIGH), but this is a RESTORATION of detail the author already had, not a discovery, and this PRD should not have implied otherwise.',
  'SECOND SELF-CORRECTION, MORE MATERIAL. I wrote that the inherited assessment (severity is hard-coded rather than caller-controlled) was too weak, because p_error_hash is a caller parameter and the ceiling is 20 distinct fingerprints per venture per hour, so a caller can deliberately trip the storm branch. The mechanism is real, but I UNDER-WEIGHTED a gate the original assessment already names: reaching it requires a VALID venture_id, and the migration records that venture UUIDs are NOT anon-enumerable. The path is therefore caller-influenceable only by someone who already holds a venture UUID. That is a genuine narrowing of my claim, and the acceptance language must not overstate it.',
  'WHAT SURVIVES BOTH CORRECTIONS, and is the actual requirement: the stronger claim that anon cannot reach the chairman decision queue is FALSE AS STATED, which the migration itself already concedes. So the gap is NOT that the boundary is undocumented — it is documented honestly, in a SQL comment that nothing executes and no gate reads. DELIVERABLE: ensure no artifact ASSERTS unreachability, and that the honest boundary is stated somewhere an automated reader actually reaches.',
  'UNVERIFIED BY ME, carried from the KNOWN GAPS block and labelled as such: it cites relforcerowsecurity=false on public.feedback as a second bypass layer. I have not independently confirmed that.',
].join(' ');

const FR5 = [
  'G2 STATUS, STATED POSITIVELY AS THIS FR REQUIRES — not an absence of G2 work.',
  'G2 is the availability regression recorded at database/migrations/20260802_bound_anon_feedback_ingress.sql:283: clause 3 carried no source_type qualifier, so a limit keyed on telegram ingress gated EVERY anon INSERT, letting roughly 50 individually-legal telegram rows deny all anon feedback ingress for an hour. That block names the fix explicitly and says a source_type qualifier on clause 3 is the fix, requiring ratification because it changes a ratified predicate.',
  'MEASURED: that fix HAS BEEN APPLIED. The live policy now reads NOT ((f.source_type)::text IS DISTINCT FROM (feedback.source_type)::text), and database/chairman-gated/20260803_bound_anon_ingress_source_type_qualifier.sql is the migration. It landed DURING this SD, between my 19:15Z and 21:55Z reads of the same object. G2 is therefore ADDRESSED — by other work, not by this SD.',
  'THE PART THAT MUST NOT BE LOST: the G2 fix appears to have CAUSED the FR-3 condition. Making the limit per-source_type is more correct in intent, but anon SELECT exposes exactly one source_type, so for every other source_type the counting subquery is starved and the limit no longer binds. G2 closing and FR-3 opening are the same event. Completion evidence must state both together, because reporting G2-fixed on its own would be a closure claim that stops anyone looking — the precise failure mode FR-1 is about.',
].join(' ');

const { data: prd, error } = await sb.from('product_requirements_v2')
  .select('id, functional_requirements').eq('sd_id', 'c716c5de-0f55-4357-8f5d-593818293a8b').maybeSingle();
if (error || !prd) { console.log('lookup failed:', error && error.message); process.exit(1); }

const frs = prd.functional_requirements;
let applied = 0;
for (const [id, text] of [['FR-1', FR1], ['FR-5', FR5]]) {
  const i = frs.findIndex((f) => f.id === id);
  if (i === -1) { console.log('MISSING ' + id); continue; }
  frs[i].description = text;
  applied += 1;
}
const { error: e2 } = await sb.from('product_requirements_v2')
  .update({ functional_requirements: frs }).eq('id', prd.id);
console.log(e2 ? ('ERR: ' + e2.message) : ('PRD updated, ' + applied + ' FR description(s) rewritten (' + prd.id + ')'));
