// SD-LEO-INFRA-FR-DELIVERY-SECOND-SIGNAL-001 -- PLAN-VERIFY phase addendum.
// Appends (does not rewrite) two findings from the PLAN-VERIFY sub-agents so LEAD sees them at
// LEAD-FINAL rather than discovering them cold: REGRESSION's premise correction on "no writer
// exists" (already fixed in pin-fr-delivery-baseline.mjs and the FR-2 PRD addendum -- this is a
// pointer, not a re-litigation), and VALIDATION's dogfood finding (this SD's own FRs classify
// undelivered).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-FR-DELIVERY-SECOND-SIGNAL-001';

const ADDENDUM = `

PLAN-VERIFY ADDENDUM (2026-08-18, REGRESSION + VALIDATION sub-agents): two findings for LEAD.

(1) REGRESSION correction: "no production writer of metadata.fr_coverage exists yet" (stated \
earlier in this description and in pin-fr-delivery-baseline.mjs's original report) was \
inaccurate -- writers DO exist (73 TESTING-code rows currently carry the key). What actually \
keeps this a zero-blast-radius reader-only change is that none produce the strict \
{fr_id,status,test_ref} array shape the schema check requires (independently reconfirmed twice: \
0 of 98 rows globally, 0 of 73 TESTING-code rows). Fixed at the source: \
pin-fr-delivery-baseline.mjs's report now states this precisely and prints all three FR-5 AC-3 \
claims explicitly (commits bcd7b62f111, 5e74baa4239).

(2) VALIDATION dogfood finding: this SD's own 5 FRs classify 5/5 UNDELIVERED under its own \
classifier (gate score 0, warn-only pass since LEO_FR_TRACEABILITY_ENFORCE defaults OFF) -- it \
has no validated stories and its own TESTING rows carry no fr_coverage (the writer is the \
deferred follow-up SD this SD does not build). Correct and expected, not a regression -- \
confirmed in VALIDATION's 0-classification-diff check against main. Recorded here so LEAD \
knows this SD completes reporting its own FR delivery as unverified by the very mechanism it \
ships, and that flag is by design, not an oversight.`;

const { data: current, error: fetchErr } = await supabase.from('strategic_directives_v2')
  .select('description').eq('sd_key', SD_KEY).maybeSingle();
if (fetchErr) throw fetchErr;
if (!current) throw new Error(`No SD found for sd_key=${SD_KEY}`);
if (current.description.includes('PLAN-VERIFY ADDENDUM')) {
  console.log('PLAN-VERIFY addendum already present -- no-op.');
  process.exit(0);
}

const description = current.description + ADDENDUM;
const { error: updateErr } = await supabase.from('strategic_directives_v2')
  .update({ description })
  .eq('sd_key', SD_KEY);
if (updateErr) throw updateErr;
console.log('PLAN-VERIFY addendum appended. New description length:', description.length);
