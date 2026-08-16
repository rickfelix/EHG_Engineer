import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PRD_ID = 'PRD-SD-LEO-INFRA-LEAD-FINAL-CASCADE-ISOLATION-001';

const { data: prd, error: fetchErr } = await supabase
  .from('product_requirements_v2')
  .select('functional_requirements, test_scenarios, metadata')
  .eq('id', PRD_ID)
  .single();
if (fetchErr) throw new Error(`fetch failed: ${fetchErr.message}`);

const fr = prd.functional_requirements;
const ts = prd.test_scenarios;

// VALIDATION follow-up (evidence 5348003b): the highest-value assertion in the eligibility tests
// is that the classifier could OBSERVE metadata.requires_human_action on the candidate row -- not
// merely that classifyDispatchIneligibility was invoked. A fixture that stubs the classifier and
// asserts "it was called" would pass identically against the BLIND version with the un-widened
// select -- the exact class of guard-that-runs-but-cannot-observe-its-subject this session's own
// established discipline exists to catch. Both FR-1 and FR-2 get an explicit new AC naming this;
// TS-1/TS-2 get their expected field sharpened to match.
const fr1 = fr.find((f) => f.id === 'FR-1');
fr1.acceptance_criteria.push(
  "The test uses the REAL classifyDispatchIneligibility (never a stub/mock of it) so the widened select's row shape must genuinely reach and be correctly read by the classifier for the test to pass -- a fixture that only asserts 'the classifier was called' would pass identically against the un-widened, blind select and is NOT sufficient."
);

const fr2 = fr.find((f) => f.id === 'FR-2');
fr2.acceptance_criteria.push(
  "Same real-classifier requirement as FR-1: the test must exercise the ACTUAL classifyDispatchIneligibility against the picker's actual query result, not a stub that would pass regardless of whether metadata was ever selected."
);

const ts1 = ts.find((t) => t.id === 'TS-1');
ts1.expected =
  "Using the REAL classifyDispatchIneligibility (not a stub): the fenced candidate is never returned, and the assertion is on the FUNCTION'S OUTPUT (fenced candidate absent, or refused with reason human_action_required) -- not merely that the classifier was invoked. If a lower-priority non-fenced candidate exists, it is returned instead; if none exists, the function returns its documented no-candidate result.";

const ts2 = ts.find((t) => t.id === 'TS-2');
ts2.expected =
  "Same real-classifier requirement as TS-1, for the fallback picker -- fenced candidate excluded (asserted on output/refusal reason, not call-count), existing claimed-SD filter still composes correctly alongside it.";

// Bookkeeping note per VALIDATION: evidence row 5348003b-106b-4271-b94d-2ca3dcf5a358's 4 recorded
// conditions are phrased as "PLAN must ..." (the natural remediation point when VALIDATION wrote
// them), but all 4 were actually resolved at LEAD (round-2 scope/key_changes correction) and are
// now directly encoded in this PRD's FR-1/FR-2/FR-3. Recorded here so PLAN/EXEC readers of that
// evidence row's condition text do not mistake it for an outstanding obligation -- the row itself
// is deliberately left unmutated (point-in-time record of what LEAD's review found).
const metadata = {
  ...(prd.metadata || {}),
  lead_conditions_resolved_at_lead: {
    evidence_row: '5348003b-106b-4271-b94d-2ca3dcf5a358',
    note: "That row's 4 conditions read as 'PLAN must ...' but were resolved during LEAD (round-2 correction) and are encoded in this PRD's FR-1 (both pickers, not one), FR-2, and FR-3 (try/finally reprint + HANDOFF_POST_ACTION ordering). Not an outstanding PLAN/EXEC obligation.",
    recorded_at: new Date().toISOString(),
  },
};

const { error: updateErr } = await supabase
  .from('product_requirements_v2')
  .update({ functional_requirements: fr, test_scenarios: ts, metadata })
  .eq('id', PRD_ID);
if (updateErr) throw new Error(`update failed: ${updateErr.message}`);

console.log('PRD corrected: real-classifier test discipline (FR-1/FR-2/TS-1/TS-2) + LEAD-conditions bookkeeping note.');
