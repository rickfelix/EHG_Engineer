// SD-LEO-INFRA-FR-DELIVERY-SECOND-SIGNAL-001 -- PLAN-VERIFY C1 (VALIDATION sub-agent, MEDIUM).
//
// FR-2's AC-1/AC-2 use illustrative test_ref values ("tests/foo.test.js:42", "x") that only
// promote to delivered because the classifier's OWN unit-test suite mocks specFileExists()
// permissively. Neither the PRD's requirement text nor its ACs mention the EXEC-phase disk
// existence check (a SECURITY-driven hardening added after FR-2 was written) -- so a reader
// taking the AC text literally would expect test_ref:"x" to promote in production, when it
// would not (specFileExists rejects any path without a "/"; the real behavior is proven,
// unmocked, in fr-delivery-classifier-testref-realfs.test.js). Appending a dated clarification
// to the requirement text rather than editing AC-1/AC-2 in place, preserving the historical
// record of what was actually reviewed.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const DIRECTIVE_ID = 'SD-LEO-INFRA-FR-DELIVERY-SECOND-SIGNAL-001';

const ADDENDUM = `

PLAN-VERIFY ADDENDUM (2026-08-18, VALIDATION sub-agent finding C1): AC-1's "tests/foo.test.js:42" \
and AC-2's "x" are illustrative test_ref values that promote to delivered ONLY under this \
classifier's own unit-test suite, which mocks specFileExists() permissively \
(fr-delivery-classifier.test.js). They do NOT describe production behavior. In production, \
test_ref additionally must resolve to a real, existing file under the trusted repo root \
(fr-delivery-classifier.js:230-242 -- a fabrication guard, not an anti-forgery control; EXEC-phase \
SECURITY hardening, not present when this FR was authored). A bare non-path string like "x" would \
NOT promote outside the mocked test environment -- proven, unmocked, in \
fr-delivery-classifier-testref-realfs.test.js. This narrows what AC-1/AC-2 actually guarantee \
(schema + fr_id match are necessary but not sufficient; disk existence is also required) without \
changing their pass/fail outcome inside this repo's own test suite.`;

const { data: current, error: fetchErr } = await supabase.from('product_requirements_v2')
  .select('functional_requirements').eq('directive_id', DIRECTIVE_ID).maybeSingle();
if (fetchErr) throw fetchErr;
if (!current) throw new Error(`No PRD found for directive_id=${DIRECTIVE_ID}`);

const frs = current.functional_requirements;
const fr2 = frs.find((f) => f.id === 'FR-2');
if (!fr2) throw new Error('FR-2 not found');
if (fr2.requirement.includes('PLAN-VERIFY ADDENDUM')) {
  console.log('Addendum already present on FR-2 -- no-op.');
  process.exit(0);
}
fr2.requirement = fr2.requirement + ADDENDUM;

const { error: updateErr } = await supabase.from('product_requirements_v2')
  .update({ functional_requirements: frs })
  .eq('directive_id', DIRECTIVE_ID);
if (updateErr) throw updateErr;
console.log('FR-2 addendum appended. New requirement length:', fr2.requirement.length);
