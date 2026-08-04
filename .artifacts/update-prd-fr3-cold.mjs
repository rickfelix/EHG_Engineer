import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const FR3 = [
  'SUPERSEDED TWICE — READ ALL THREE STATES BEFORE ACTING. This FR has been rewritten as facts arrived; the sequence is itself the evidence.',
  'STATE 1 (as written at PLAN): the applied policy counted a FIXED population (source_type = telegram), anon SELECT covered it exactly, and the hazard was correctly described as FUTURE — only a later narrowing of anon SELECT would starve the count.',
  'STATE 2 (2026-08-03, mid-SD): 20260803_bound_anon_ingress_source_type_qualifier.sql was APPLIED between my 19:15Z and 21:55Z reads, rewriting the counting subquery to NOT ((f.source_type)::text IS DISTINCT FROM (feedback.source_type)::text) — it now counts rows sharing the INCOMING row source_type. anon SELECT is exactly one policy, telegram_bot_select_feedback USING (source_type=telegram). So for any non-telegram source_type the counted population is invisible to anon, the count starves to 0, count(*) < 50 is unconditionally true, and the RESTRICTIVE limit does not bind. FR-3 predicted this and it arrived via the DUAL of the predicted route: nobody narrowed SELECT, they narrowed the COUNTED SET relative to what SELECT exposes.',
  'STATE 3 (coordinator reply 596e6e1f, RATIFIED, and it lowers the temperature while raising the stakes): THE DISARM IS COLD TODAY. The only non-telegram anon INSERT path, venture_user_insert_feedback, is DEAD END-TO-END — every conjunct true standalone but the WITH CHECK false in context, dead since 2026-07-04, verified during G2 acceptance and filed as SD-LEO-INFRA-DEAD-VENTURE-USER-001 (HIGH). Nothing can currently reach the unbounded counting path, because the door to it is shut.',
  'WHY COLD IS NOT SAFE, AND IS THE MORE DANGEROUS STATE. This is safety by coincidence: the limit is not protected by a working guard, it is protected by a SECOND DEFECT masking it. DEAD-VENTURE-USER-001 exists precisely to revive that path, and as originally scoped it would revive it INTO A DISARMED RATE LIMIT — the fix for one HIGH opening the hazard of another. The coordinator has routed a mandatory FR fold into that SD: whatever revives the path must, in the same change, make the limit BIND for it (an anon-visible counting basis for non-telegram sources, or a per-source restrictive policy not dependent on anon SELECT visibility), with two-sided acceptance — revived-path inserts succeed under the limit AND the 51st insert in the window refuses.',
  'CONSEQUENCE FOR THIS SD, and it VINDICATES the fence design rather than changing it: scripts/severity-pair-divergence-fence.mjs reports FR-3 DIVERGED today even though the hazard is unreachable. That is CORRECT and deliberate. The fence asserts on the COUPLING, not on current reachability — a broken coupling masked by a dead door is still a broken coupling, and it will be discovered by whoever opens the door, not by whoever narrowed the count. A fence keyed on reachability would have reported green here and taught everyone the coupling was fine.',
  'STILL NOT PROVEN BY ME: no anon-role insert has been executed. The starvation remains an inference from the rule that a subquery in a WITH CHECK is evaluated under the caller RLS — which is also this FR founding premise. The coordinator ratified the measured-vs-inferred split rather than the inference itself.',
  'DELIVERABLE FOR THIS SD IS NOW NARROWER: the counting-basis fix belongs to DEAD-VENTURE-USER-001, where the revive and the bind must land together. What remains here is the FENCE (built, 24 tests, catching the live divergence) plus recording the coupling so the next editor of either side is not the one who discovers it.',
].join(' ');

const { data: prd, error } = await sb.from('product_requirements_v2')
  .select('id, functional_requirements').eq('sd_id', 'c716c5de-0f55-4357-8f5d-593818293a8b').maybeSingle();
if (error || !prd) { console.log('lookup failed:', error && error.message); process.exit(1); }
const frs = prd.functional_requirements;
const i = frs.findIndex((f) => f.id === 'FR-3');
if (i === -1) { console.log('FR-3 missing'); process.exit(1); }
frs[i].description = FR3;
const { error: e2 } = await sb.from('product_requirements_v2')
  .update({ functional_requirements: frs }).eq('id', prd.id);
console.log(e2 ? ('ERR: ' + e2.message) : 'PRD FR-3 updated to STATE 3 (cold-but-worse)');
