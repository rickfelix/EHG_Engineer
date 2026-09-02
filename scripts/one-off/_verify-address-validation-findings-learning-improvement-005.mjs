import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEARN-FIX-LEARNING-IMPROVEMENT-005';
const FOLLOWUP_ID = '242c0a5a-c36a-4013-950f-e661da8f68b4';

// VALIDATION sub-agent VERIFY review (evidence 82c7605b) found:
// 1. deferral_reason said "tracked" while nothing tracked it -- now references a real
//    protocol_improvement_queue row.
// 2. success_criteria[1] (gate wiring) was unmet but never marked as such -- corrected.
// 3. FR-1 said "do not author new hashing logic" but the SEC-1 fix DID add one line of
//    hashing (phase3-execution.js) -- documented as a deliberate, reviewed exception.

const { data: sd, error: sdErr } = await sb.from('strategic_directives_v2').select('id, success_criteria').eq('sd_key', SD_KEY).single();
if (sdErr) throw sdErr;

const success_criteria = sd.success_criteria.map((c, i) =>
  i === 1
    ? { ...c, status: 'DEFERRED', note: 'Gate-side wiring (FR-2) deferred pending PR #7978 merge -- tracked as protocol_improvement_queue ' + FOLLOWUP_ID + '. metadata.test_execution.artifact_path/.artifact_sha/.source have ZERO readers until this lands; do not treat this SD alone as having resolved that condition.' }
    : c
);

const { error: sdUpdateErr } = await sb.from('strategic_directives_v2').update({ success_criteria }).eq('id', sd.id);
if (sdUpdateErr) throw sdUpdateErr;

const { data: prd, error: prdFetchErr } = await sb
  .from('product_requirements_v2')
  .select('id, functional_requirements, metadata')
  .eq('directive_id', sd.id)
  .single();
if (prdFetchErr) throw prdFetchErr;

const fr = [...prd.functional_requirements];
const fr1Idx = fr.findIndex((f) => f.id === 'FR-1');
fr[fr1Idx] = {
  ...fr[fr1Idx],
  description: fr[fr1Idx].description + ' EXEC-PHASE AMENDMENT (SECURITY review, evidence bdbe3d54): one line of hashing WAS added, at phases/phase3-execution.js:222 (sha256(JSON.stringify(report)) on the already-parsed report object) -- a deliberate, reviewed exception to "do not author new hashing logic", made to close a split-read TOCTOU (computing the hash from the SAME parsed object counts were already derived from, rather than re-reading the file at stamp time). This is the identical hashing METHOD as computeArtifactSha() (same sha256(JSON.stringify(JSON.parse(raw))) definition), just invoked at the single-read site instead of a second read. See TS pinning this equivalence.',
  status: 'IMPLEMENTED_WITH_AMENDMENT',
};

const fr2Idx = fr.findIndex((f) => f.id === 'FR-2');
fr[fr2Idx] = {
  ...fr[fr2Idx],
  deferral_reason: fr[fr2Idx].deferral_reason.replace(
    'deferred as a tracked follow-up',
    `deferred as a tracked follow-up (protocol_improvement_queue ${FOLLOWUP_ID})`
  ),
};

const newPrdMetadata = {
  ...prd.metadata,
  verify_phase_validation_review: {
    evidence_id: '82c7605b-36da-4d8b-966a-2dd1476ed4c7',
    applied_at: new Date().toISOString(),
    followup_id: FOLLOWUP_ID,
  },
};

const { error: prdUpdateErr } = await sb
  .from('product_requirements_v2')
  .update({ functional_requirements: fr, metadata: newPrdMetadata })
  .eq('id', prd.id);
if (prdUpdateErr) throw prdUpdateErr;

console.log('Corrected success_criteria[1], FR-1 amendment note, FR-2 deferral_reason (real followup id).');
