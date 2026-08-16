// Fixes two accuracy defects found by the VALIDATION sub-agent at VERIFY (evidence row
// 457a403c-0517-4bc6-8805-42ee438f5df0) before PLAN-TO-LEAD:
//
// V1 (medium): PRD FR-4 description + metadata.fr4_descope.production_measurement stated
// "84% of public-schema SECURITY DEFINER functions are PUBLIC-executable". Measured live:
// 636/759 = 84% is over ALL public functions, not just SECURITY DEFINER ones. On the SECDEF
// axis specifically it's 19/139 (13.7%) public-executable, 27/139 (19.4%) anon-or-public
// executable. The migration header (database/chairman-gated/20260816_..._exposure.sql:19) was
// already correctly worded ("public functions", no SECDEF qualifier) -- only this PRD text,
// authored during the same EXEC-TO-PLAN pass, had the error. The descope decision itself is
// unaffected (the decisive argument is mechanistic: the ADP row is already PUBLIC-free yet
// functions still arrive PUBLIC-executable), but LEAD should see the correct number.
//
// V2 (medium): metadata.real_callee_attestation claimed the DDL suite "applies the forward
// migration and rollback SQL verbatim" -- it does not. Zero references to the rollback file
// anywhere in the test suite or its execution path; only the forward migration is ever applied
// in CI. FR-7's authoring-only ACs are still met, but the rollback's own verify block has never
// actually executed. Corrected to state this precisely.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001';
const PRD_ID = 'PRD-SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001';

// --- V1: fix the PRD ---
const { data: prd, error: prdFetchErr } = await supabase.from('product_requirements_v2')
  .select('functional_requirements, metadata').eq('id', PRD_ID).maybeSingle();
if (prdFetchErr) throw prdFetchErr;
if (!prd) throw new Error(`No PRD found for id=${PRD_ID}`);

const WRONG_STAT = '84% of public-schema SECURITY DEFINER functions are currently PUBLIC-executable';
const RIGHT_STAT = '84% of ALL public-schema functions (636/759) are currently PUBLIC-executable -- on the SECURITY DEFINER axis specifically it is 19/139 (13.7%) public-executable, 27/139 (19.4%) anon-or-public-executable';

const fr = prd.functional_requirements.map((item) => {
  if (item.id !== 'FR-4') return item;
  return { ...item, description: item.description.replace(WRONG_STAT, RIGHT_STAT) };
});

const fr4 = prd.metadata?.fr4_descope || {};
const metadata = {
  ...prd.metadata,
  fr4_descope: {
    ...fr4,
    production_measurement:
      "636/759 (84%) of ALL public-schema functions carry public_exec=true (independently re-measured by both SECURITY and TESTING sub-agents). On the SECURITY DEFINER axis specifically (the axis this SD is about): 19/139 (13.7%) public-executable, 27/139 (19.4%) anon-or-public-executable. The original PRD text overstated this ~6x by conflating the two populations -- corrected at VALIDATION (SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001 VERIFY, evidence row 457a403c-0517-4bc6-8805-42ee438f5df0, finding V1). The descope decision is unaffected: the decisive argument is mechanistic (the ADP row is already PUBLIC-free yet functions still arrive PUBLIC-executable), not the raw percentage.",
  },
};

const { error: prdUpdateErr } = await supabase.from('product_requirements_v2')
  .update({ functional_requirements: fr, metadata })
  .eq('id', PRD_ID);
if (prdUpdateErr) throw prdUpdateErr;
console.log('V1 fixed: PRD FR-4 description + fr4_descope.production_measurement corrected.');

// --- V2: fix the SD's real_callee_attestation ---
const { data: sd, error: sdFetchErr } = await supabase.from('strategic_directives_v2')
  .select('metadata').eq('sd_key', SD_KEY).maybeSingle();
if (sdFetchErr) throw sdFetchErr;
if (!sd) throw new Error(`No SD found for sd_key=${SD_KEY}`);

const attestation = { ...(sd.metadata?.real_callee_attestation || {}) };
const oldKey = 'tests/ddl/close-remaining-secdef-execute-exposure-ddl.db.test.js -> pg.Client (real Postgres, GitHub Actions test-container)';
if (attestation[oldKey]) delete attestation[oldKey];
attestation['tests/ddl/close-remaining-secdef-execute-exposure-ddl.db.test.js -> pg.Client (real Postgres, GitHub Actions test-container)'] =
  'The DDL suite connects with node-postgres and applies the FORWARD migration SQL verbatim against a live Postgres instance, asserting on has_function_privilege() read back from that same server -- nothing in that path is mocked. CORRECTED (VALIDATION finding V2, evidence row 457a403c-0517-4bc6-8805-42ee438f5df0): the suite does NOT apply or execute the paired rollback migration -- zero references to the rollback file exist anywhere in the test suite. The rollback\'s own $verify_rollback$ block has never actually run against a live database; only its SQL text and the exception-pair data (check_feedback_duplicate, get_gate_decision_status) were independently corroborated by static/query cross-check, not by executing the rollback itself. FR-7\'s authoring-only acceptance criteria are still met.';

const metadataSd = { ...sd.metadata, real_callee_attestation: attestation };
const { error: sdUpdateErr } = await supabase.from('strategic_directives_v2')
  .update({ metadata: metadataSd })
  .eq('sd_key', SD_KEY);
if (sdUpdateErr) throw sdUpdateErr;
console.log('V2 fixed: real_callee_attestation corrected to not overclaim rollback execution.');
