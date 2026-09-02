import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEARN-FIX-LEARNING-IMPROVEMENT-005';

const { data: sd, error: sdErr } = await sb
  .from('strategic_directives_v2')
  .select('id')
  .eq('sd_key', SD_KEY)
  .single();
if (sdErr) throw sdErr;

const { data: prd, error: fetchErr } = await sb
  .from('product_requirements_v2')
  .select('id, functional_requirements, technical_requirements, test_scenarios, metadata')
  .eq('directive_id', sd.id)
  .single();
if (fetchErr) throw fetchErr;

const fr = [...prd.functional_requirements];
const tr = [...prd.technical_requirements];
const ts = [...prd.test_scenarios];

// PLAN-phase TESTING review (evidence 6788e310) found 5 concrete corrections.

// FR-1 correction: pin the discriminator (evidence_reused / phase3.artifact_sha already on
// the object, no signature change needed), fix the hash-target wording, and decide the
// builder-extension design (extend buildTestExecution's params -- one canonical shape --
// rather than spreading ad-hoc extra keys at the call site, which would recreate the
// ad-hoc-key-sprawl problem SD-FDBK-INFRA-TESTING-VERDICT-ROWS-001 fixed).
const fr1Idx = fr.findIndex((f) => f.id === 'FR-1');
fr[fr1Idx] = {
  ...fr[fr1Idx],
  description: fr[fr1Idx].description.replace(
    '(or its call site at :191)',
    '-- NO signature change needed: phase3.evidence_reused (set unconditionally by buildPhase3FromEvidence, index.js:820, absent on every fresh path) and phase3.artifact_sha (already on the object at index.js:682/770/827) are both already in scope; buildMainlinePhase3TestExecution(phase3) stays single-arg and pure'
  ) + ' DESIGN DECISION (PLAN): extend buildTestExecution()\'s own params (test-execution-record.js:20) with new optional artifactPath/source params defaulting to null -- one canonical builder emits the whole shape, matching TR-1\'s spirit; do NOT spread ad-hoc extra keys at the call site.',
  acceptance_criteria: fr[fr1Idx].acceptance_criteria.map((ac) =>
    ac.includes('sha256(that file\'s current bytes)')
      ? ac.replace(
          'artifact_sha exactly equal to sha256(that file\'s current bytes), with source:\'fresh\'',
          'artifact_sha exactly equal to computeArtifactSha()\'s own definition (sha256 of the re-serialized JSON.parse(raw), NOT raw file bytes -- artifact-verification.js:86-101), with source:\'fresh\''
        )
      : ac
  ),
};
fr[fr1Idx].acceptance_criteria.push(
  'tests/unit/testing-subagent/mainline-test-execution.test.js\'s existing exact-shape toEqual assertions (lines ~19-26) are updated to include the new keys -- they currently assert the exact 6-key shape and WILL break on any added key'
);

// FR-2 correction: isReportHashMismatch cannot express "unreadable" (returns false on any
// falsy arg) -- add an explicit readability check with its own warning message.
const fr2Idx = fr.findIndex((f) => f.id === 'FR-2');
fr[fr2Idx] = {
  ...fr[fr2Idx],
  description: fr[fr2Idx].description + ' CORRECTION (PLAN review): isReportHashMismatch() returns false on any falsy argument -- it CANNOT distinguish "artifact unreadable" from "no mismatch". The check must read the artifact first (try/catch); an unreadable/missing artifact emits its OWN distinct warning ("artifact_path could not be read") separate from a genuine hash-mismatch warning, both fail-soft.',
  acceptance_criteria: [
    ...fr[fr2Idx].acceptance_criteria,
    'An unreadable/missing artifact_path (file deleted, permissions, worktree cleaned up) produces a distinct "could not read artifact" warning, not silently treated as a pass and not conflated with a hash-mismatch warning',
  ],
};

// FR-3 correction: Array.isArray, not truthiness (report_url can be a truthy empty array).
const fr3Idx = fr.findIndex((f) => f.id === 'FR-3');
fr[fr3Idx] = {
  ...fr[fr3Idx],
  description: fr[fr3Idx].description + ' CORRECTION (PLAN review): detect the multi-repo case with Array.isArray(phase3.report_url), never truthiness -- per_repo.map(...).filter(Boolean) (phase3-execution.js:295) can produce a truthy EMPTY array or a length-1 array, either of which must be handled by the same explicit branch, not fall through to single-repo logic by accident.',
};

tr.push({
  id: 'TR-5',
  title: 'Double-read of the report file is an accepted, low-severity limitation for this SD',
  description: 'The fresh-path count extraction (phase3-execution.js:203) and the new sha computation (buildTestExecution\'s artifactSha param, computed via readArtifactWithSha at the FR-1 call site) read the same file twice within the same process execution. readArtifactWithSha exists specifically to avoid a split read/hash TOCTOU (artifact-verification.js:127-138), but threading a single pre-read buffer across those two call sites would require a broader refactor of phase3-execution.js\'s count-extraction path. Accepted as a low-risk limitation (not a security boundary, same process, sub-second window) rather than expanding this SD\'s scope; a future SD may consolidate if it becomes a real issue.',
});

ts.push({
  id: 'TS-8',
  scenario: 'The unreadable-artifact case produces its own distinct warning, not silently a pass',
  type: 'unit',
  expected: 'A missing/deleted artifact_path file produces a "could not read artifact" warning, distinguishable from a genuine hash-mismatch warning',
});
ts.push({
  id: 'TS-9',
  scenario: 'Multi-repo detection uses Array.isArray, correctly handles a truthy empty array',
  type: 'unit',
  expected: 'report_url = [] (empty array, truthy) is detected as the multi-repo branch, not mistaken for single-repo absence',
});

const newMetadata = {
  ...prd.metadata,
  plan_phase_corrections: {
    evidence_id: '6788e310-afc5-4d3e-8d53-85f085037c91',
    applied_at: new Date().toISOString(),
    corrections: [
      'FR-1: no signature change needed (evidence_reused/artifact_sha already in scope); hash-target wording corrected to match computeArtifactSha\'s real definition; design decision to extend buildTestExecution\'s own params rather than spread ad-hoc keys',
      'FR-1: existing mainline-test-execution.test.js exact-shape assertion must be updated (will break on new keys)',
      'FR-2: isReportHashMismatch cannot express "unreadable" -- added explicit readability check with its own distinct warning',
      'FR-3: Array.isArray() not truthiness (report_url can be a truthy empty array)',
      'TR-5 added: accepted double-read limitation, not expanded to a refactor',
      'TS-8/TS-9 added for the unreadable-artifact and empty-array cases',
    ],
  },
};

const { error } = await sb
  .from('product_requirements_v2')
  .update({ functional_requirements: fr, technical_requirements: tr, test_scenarios: ts, metadata: newMetadata })
  .eq('id', prd.id);
if (error) throw error;

console.log('PRD corrected: FR-1/FR-2/FR-3 refined, TR-5 added, TS-8/TS-9 added.');
