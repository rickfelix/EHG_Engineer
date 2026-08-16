import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PRD_ID = 'PRD-SD-LEO-INFRA-LEAD-FINAL-CASCADE-ISOLATION-001';

const { data: prd, error: fetchErr } = await supabase
  .from('product_requirements_v2')
  .select('functional_requirements, test_scenarios')
  .eq('id', PRD_ID)
  .single();
if (fetchErr) throw new Error(`fetch failed: ${fetchErr.message}`);

const fr = prd.functional_requirements;
const ts = prd.test_scenarios;

// VALIDATION follow-up #2 (evidence 5348003b): classifyDispatchIneligibility is first-match-wins
// over an ORDERED axis table (claim-eligibility.cjs:190-426), and orchestratorParent (L192, checks
// row.sd_type==='orchestrator') fires BEFORE humanActionRequired (L202). A fenced fixture given
// sd_type:'orchestrator' (plausible -- this IS the orchestrator-chaining path) would be refused
// with reason 'orchestrator_parent', not 'human_action_required' -- a strict reason-check then
// fails confusingly, or a loose "was refused" check passes for the WRONG reason and proves nothing
// about the human-action fence. Fixed deliberately (not left ambiguous, per VALIDATION's own
// framing): use classifyAllDispatchIneligibility (L440, the all-match variant) + .includes('human_
// action_required') -- the SAME pattern sd-start's own human-action gate already uses (L428-438),
// so the assertion is robust to axis ordering regardless of what else the fixture matches. The
// fixture's sd_type is ALSO set to 'infrastructure' (matching the real specimen, BIND-OBSERVE-
// ONLY-001, live-verified) rather than an invented shape, so the test exercises the real axis
// combination rather than a synthetic one that happens to dodge the trap.
const fr1 = fr.find((f) => f.id === 'FR-1');
fr1.acceptance_criteria.push(
  "The fenced fixture uses sd_type:'infrastructure' (matching the real specimen, BIND-OBSERVE-ONLY-001) with metadata.requires_human_action=true, and the test asserts via classifyAllDispatchIneligibility(row).includes('human_action_required') -- NOT the first-match classifyDispatchIneligibility's single reason, since orchestratorParent (an earlier axis in the ordered table) would mask the human-action-fence assertion if the fixture's sd_type were ever 'orchestrator'."
);

const fr2 = fr.find((f) => f.id === 'FR-2');
fr2.acceptance_criteria.push(
  "Same fixture-shape and assertion-form requirement as FR-1: sd_type:'infrastructure', metadata.requires_human_action=true, asserted via classifyAllDispatchIneligibility(row).includes('human_action_required')."
);

const ts1 = ts.find((t) => t.id === 'TS-1');
ts1.expected =
  "Fixture: sd_type:'infrastructure', metadata.requires_human_action=true (mirrors the real BIND-OBSERVE-ONLY-001 specimen). Using the REAL classifyAllDispatchIneligibility (ctx-free -- the humanActionRequired axis reads only row.metadata, no fleet scaffolding needed): the fenced candidate is never returned by selectNextSD, and its refusal is confirmed via classifyAllDispatchIneligibility(row).includes('human_action_required') -- not the first-match single-reason form, which would report 'orchestrator_parent' instead if sd_type were ever 'orchestrator' (an earlier axis in the ordered table, claim-eligibility.cjs:190-426). If a lower-priority non-fenced candidate exists, it is returned instead; if none exists, the function returns its documented no-candidate result.";

const ts2 = ts.find((t) => t.id === 'TS-2');
ts2.expected =
  "Same fixture shape and assertion form as TS-1 (sd_type:'infrastructure', classifyAllDispatchIneligibility().includes('human_action_required')), for the fallback picker -- existing claimed-SD filter still composes correctly alongside it.";

const { error: updateErr } = await supabase
  .from('product_requirements_v2')
  .update({ functional_requirements: fr, test_scenarios: ts })
  .eq('id', PRD_ID);
if (updateErr) throw new Error(`update failed: ${updateErr.message}`);

console.log('PRD corrected: deliberate classifyAllDispatchIneligibility + sd_type:infrastructure fixture shape (FR-1/FR-2/TS-1/TS-2), avoiding the orchestratorParent axis-precedence trap.');
