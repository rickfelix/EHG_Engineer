import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const FR4 = [
  'OUTCOME: ZERO DDL PRODUCED BY THIS SD, and that is a measured conclusion rather than an omission. Stating it positively, the way FR-5 requires for G2, because a criterion satisfied by simply not producing DDL is indistinguishable from one never considered.',
  'PRE-CHANGE STATE IS CAPTURED regardless, in this PRD metadata.pre_change_state: the function definition with both insert paths and their severities, the EXECUTE grant list, the full anon_feedback_ingress_bounds expression, the complete policy inventory on public.feedback, and the telegram row population. Each FR is therefore independently revertible if anything here is later turned into DDL.',
  'WHY FR-1 DID NOT PRODUCE A REVOKE MIGRATION. FR-1 offered two branches: constrain the path, or amend the closure claim. The obvious constrain is REVOKE EXECUTE ON record_venture_error FROM anon. MEASURED, and it rules that out: lib/eva/config/venture-default-capabilities.js documents the error-capture-middleware capability as calling this RPC with EHG_ENGINEER_SUPABASE_ANON_KEY — the anon key IS the production mechanism, shipped as a default capability to every venture, with marketlens/src/lib/errorCapture.js as the reference implementation. Revoking anon EXECUTE would break venture error capture fleet-wide. Staging that migration would have put a fleet-breaking change in front of the chairman dressed as a security fix.',
  'WHY THE SECOND CONSTRAIN OPTION ALSO DID NOT PRODUCE ONE. FR-1 alternatively allows having the function downgrade what anon can produce — in practice, making the storm-watermark path write something other than severity=high so it stops arming the chairman queue. That is a behaviour change with its own cost: the storm watermark exists to say THIS VENTURE IS STORMING, and demoting it hides a signal that arguably SHOULD reach the chairman. Choosing between a false-closure risk and a suppressed-alarm risk is a chairman decision, not a builder decision, and this SD is not the place to make it silently.',
  'SO THE CLAIM-AMENDMENT BRANCH WAS TAKEN, and made executable rather than prose: lib/policy/anon-chairman-boundary.js declares the boundary as machine-readable state, scripts/probe-anon-chairman-reach.mjs compares it to the live catalog, and drift in EITHER direction fails — including the good direction, because if the grant is ever dropped, every closure claim describing the old boundary becomes wrong and must be updated.',
  'WHAT A FUTURE CHAIRMAN-GATED SD SHOULD CARRY, recorded here so the option is not lost: both constrain branches above, each with the cost measured in this SD. Neither is staged, because staging implies a recommendation to apply, and neither is safe to apply without the tradeoff being decided first.',
  'DISCIPLINE HELD THROUGHOUT: no DDL was executed by the builder at any point, including inside a rolled-back transaction. All catalog work was read-only (pg_proc, pg_policy, pg_views, information_schema.routine_privileges). The --seed-divergence proof in the fence mutates strings IN MEMORY rather than via BEGIN/ROLLBACK, specifically so that no code path in this SD can ever issue DDL.',
].join(' ');

const { data: prd, error } = await sb.from('product_requirements_v2')
  .select('id, functional_requirements').eq('sd_id', 'c716c5de-0f55-4357-8f5d-593818293a8b').maybeSingle();
if (error || !prd) { console.log('lookup failed:', error && error.message); process.exit(1); }
const frs = prd.functional_requirements;
const i = frs.findIndex((f) => f.id === 'FR-4');
if (i === -1) { console.log('FR-4 missing'); process.exit(1); }
frs[i].description = FR4;
const { error: e2 } = await sb.from('product_requirements_v2')
  .update({ functional_requirements: frs }).eq('id', prd.id);
console.log(e2 ? ('ERR: ' + e2.message) : 'PRD FR-4 updated — zero-DDL outcome stated positively with the measured reason');
