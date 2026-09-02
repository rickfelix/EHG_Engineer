// SD-FDBK-INFRA-TESTING-SUB-AGENT-001 -- record the coordinator's ruling (directive
// f52a4e6a, 2026-09-02 00:15:22Z) on the SD row itself: correct SC#3's wording and strike the
// mechanism's false detectCodeProduction-consumption claim, per "record each amendment on the
// SD row (success_criteria + mechanism) with your measurement cited".
import { createSupabaseServiceClient } from '../../lib/supabase-client.cjs';

const SD_KEY = 'SD-FDBK-INFRA-TESTING-SUB-AGENT-001';

const sb = createSupabaseServiceClient();
const { data: existing, error: readErr } = await sb
  .from('strategic_directives_v2')
  .select('id, description, scope, success_criteria, metadata')
  .eq('sd_key', SD_KEY)
  .maybeSingle();
if (readErr) { console.error('READ_ERROR', readErr); process.exit(1); }
if (!existing) { console.error('SD_NOT_FOUND', SD_KEY); process.exit(1); }

const STRIKE_CLAIM = 'mandatory-testing-validation.js:162-235 consumes';
const CORRECTED_MECHANISM_NOTE =
  '\n\nAMENDMENT (coordinator ruling, directive f52a4e6a, 2026-09-02 00:18:31Z, accepted by Adam ' +
  '673db833): the mechanism claim above that mandatory-testing-validation.js consumes the ' +
  'produces-code override (detectCodeProduction) is STRUCK -- MEASURED FALSE by the VALIDATION ' +
  'sub-agent at LEAD (evidence row 8cc7aff7-a39c-4582-9ce3-099f2d891830): detectCodeProduction is ' +
  'consumed only by scripts/modules/handoff/validation/sd-type-applicability-policy.js\'s callers ' +
  'smoke-test-specification.js and prerequisite-preflight.js, never by mandatory-testing-validation.js. ' +
  'The rest of the mechanism section (skipE2ESdTypes, E2E_EXEMPT_SD_TYPES, getValidatorRequirement, ' +
  'the gate reading only verdict membership + staleness) is confirmed accurate.';

const correctedDescription = existing.description.includes(STRIKE_CLAIM)
  ? existing.description + CORRECTED_MECHANISM_NOTE
  : existing.description;
const correctedScope = existing.scope && existing.scope.includes(STRIKE_CLAIM)
  ? existing.scope + CORRECTED_MECHANISM_NOTE
  : existing.scope;

const SC3_CORRECTED_CRITERION =
  'mandatory-testing-validation.js\'s EXISTING advisory/required tiering is UNCHANGED (no new gate, ' +
  'per NON-GOALS): a skipped/unmeasured sd_type must never read as a measured PASS -- ADVISORY tier ' +
  '(policyAllowsAdvisory, mandatory-testing-validation.js:163,199-214) stays ADVISORY (score 70) but is ' +
  'now measured-honest (metadata.measured=false surfaced, not silently trusted); REQUIRED tier treats an ' +
  'unmeasured row the same as a MISSING row (the existing ERR_TESTING_REQUIRED-class path, not a new ' +
  'error code). AMENDMENT (coordinator ruling, directive f52a4e6a, accepted by Adam 673db833 00:18:31Z): ' +
  'corrects the original wording, which implied mandatory-testing-validation.js currently BLOCKS a ' +
  'NOT_APPLICABLE code-changing SD -- measured false by the VALIDATION sub-agent at LEAD (evidence row ' +
  '8cc7aff7-a39c-4582-9ce3-099f2d891830): it currently returns ADVISORY (passed:true, score:70).';

const correctedSuccessCriteria = (existing.success_criteria || []).map((sc) => {
  if (sc.criterion && sc.criterion.startsWith('mandatory-testing-validation treats NOT_APPLICABLE as absence')) {
    return { ...sc, criterion: SC3_CORRECTED_CRITERION };
  }
  return sc;
});

const newMetadata = {
  ...(existing.metadata || {}),
  golf4_amendments: [
    ...((existing.metadata || {}).golf4_amendments || []),
    {
      at: new Date().toISOString(),
      by: 'Golf-4 (worker)',
      change: 'Recorded coordinator ruling (directive f52a4e6a, accepted by Adam 673db833 00:18:31Z) on the SD row: SC#3 criterion text corrected (advisory stays advisory, measured-honest, no new blocking tier); mechanism\'s false detectCodeProduction-consumption claim struck and replaced with the measured correction (real callers: smoke-test-specification.js, prerequisite-preflight.js). Implementation (PR #7955) already reflects the corrected interpretation; this amendment brings the SD row\'s own text into agreement with what shipped and with the ruling.',
    },
  ],
};

const { error: writeErr } = await sb
  .from('strategic_directives_v2')
  .update({
    description: correctedDescription,
    scope: correctedScope,
    success_criteria: correctedSuccessCriteria,
    metadata: newMetadata,
  })
  .eq('id', existing.id);
if (writeErr) { console.error('WRITE_ERROR', writeErr); process.exit(1); }

console.log('UPDATED_SD_ID=' + existing.id);
console.log('DESCRIPTION_AMENDED=' + (correctedDescription !== existing.description));
console.log('SCOPE_AMENDED=' + (correctedScope !== existing.scope));
console.log('SC3_AMENDED=' + JSON.stringify(correctedSuccessCriteria.some((sc, i) => sc.criterion !== (existing.success_criteria || [])[i]?.criterion)));
