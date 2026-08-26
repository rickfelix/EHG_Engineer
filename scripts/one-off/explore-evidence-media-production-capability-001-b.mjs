#!/usr/bin/env node
/**
 * Explore sub-agent evidence writer — SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-B, LEAD_TO_PLAN gate.
 *
 * LEAD-phase due-diligence pass: read lib/creative/creative-brief.js, lib/creative/asset-storage.js,
 * lib/storage/private-signed-upload.js, lib/governance/stage-gate-predicate.js,
 * lib/eva/chairman-product-review.js in full; queried leo_feature_flags for
 * STAGE_GATE_PREDICATE_ARMED; grepped lib/ for getPublicUrl/createBucket(...true) call sites.
 */
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-B';

const FINDINGS = [
  'STALE PREMISE CORRECTED — the SD\'s own description claims "creative-brief.js:72 currently '
    + 'discards generationResult.asset.url and creative_assets has no url/storage_path column, so '
    + 'this fence has nothing to fence" as a VALIDATION-pass (2026-08-26) finding. Child A '
    + '(SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-A) has since merged (PR #7571, commit '
    + 'ad650615ad2) and lib/creative/creative-brief.js now calls persistAssetPrivately() and '
    + 'persists a storage_path column on the creative_assets row. The premise was true when written, '
    + 'is false now, and this SD\'s actual scope is therefore NOT "make Child A persist a handle" but '
    + '"gate read/view access to the handle Child A already persists."',
  'CONFIRMED — lib/creative/asset-storage.js#persistAssetPrivately() uploads via '
    + 'lib/storage/private-signed-upload.js#uploadPrivateAndSign() (which DOES mint a signedUrl at '
    + 'upload time) but discards the returned signedUrl and returns/persists ONLY the storage path. '
    + 'No existing code path anywhere mints a viewable URL for an already-persisted creative_assets '
    + 'row — grepped for createSignedUrl across lib/: the only call site is inside '
    + 'private-signed-upload.js itself (upload-time, discarded by its only caller). The '
    + '"externally reachable" concern this SD must fence is therefore about a NOT-YET-BUILT read/view '
    + 'surface (most likely Child C\'s taste-gate review UI), not something currently exposed.',
  'CONFIRMED UNARMED — queried leo_feature_flags for STAGE_GATE_PREDICATE_ARMED: zero rows. '
    + 'lib/governance/stage-gate-predicate.js#checkStageGate\'s own isEnabled() lookup fails safe to '
    + 'false on a missing flag, so ANY caller that omits the `armed` param gets unarmed/shadow-mode '
    + 'behavior (blocked=false is never enforced; shouldEnforceBlock() always returns false). This '
    + 'independently confirms the SD scope\'s own warning that the predicate "must be explicitly '
    + 'armed... rather than inheriting the predicate\'s default" — the flag genuinely is not set, this '
    + 'is not a stale claim.',
  'CONFIRMED — checkStageGate\'s rule (a): a null/absent ventureId returns '
    + '{inScope:false, blocked:false, verdict:OUT_OF_SCOPE} — i.e. never blocked. The SD scope\'s '
    + 'requirement that this fence "fail closed on missing/null venture_id rather than inheriting the '
    + 'predicate\'s default OUT_OF_SCOPE behavior" is a correct, necessary override: the call site '
    + 'this SD builds must check for missing ventureId itself and block BEFORE ever delegating to '
    + 'checkStageGate.',
  'CONFIRMED — checkStageGate only compares a single requiredStage integer against '
    + 'ventures.current_lifecycle_stage; it has no native support for a conjunctive S23+S24 check, and '
    + 'S23 ("a recorded chairman product_review verdict") is not a lifecycle-stage-number condition at '
    + 'all. lib/eva/chairman-product-review.js exports PRODUCT_REVIEW_STAGE=23 and '
    + 'PRODUCT_REVIEW_DECISION_TYPE=\'product_review\'; recordProductReviewVerdict() writes '
    + 'chairman_decisions.status=\'approved\' on an approve/approve_with_notes verdict. The S23 leg of '
    + 'this fence must therefore be a direct query against chairman_decisions '
    + '(venture_id, lifecycle_stage=23, decision_type=\'product_review\', status=\'approved\'), '
    + 'composed IN ADDITION to a checkStageGate(requiredStage:24, armed:true) call for the S24 leg — '
    + 'not a single call to the existing predicate.',
  'FR-10 RECONNAISSANCE CENSUS — grepped lib/ for getPublicUrl/createBucket(...public:true): 5 hits. '
    + 'lib/storage/private-signed-upload.js and lib/creative/asset-storage.js(.test.js) are the '
    + 'PRIVATE primitives this fence builds on (never call getPublicUrl). The two remaining producers '
    + 'are lib/eva/logo-image-generator.js and lib/eva/stage-handlers/s11.js, BOTH writing to the '
    + 'public "venture-logos" bucket via createBucket(BUCKET_NAME) [no public:false override, so '
    + 'Supabase\'s public default applies] + getPublicUrl(), gated only at current_lifecycle_stage>=7 '
    + '(post-S11, a deliberately early/permissive gate for brand identity assets, not a bug). A third '
    + 'bucket, "vision-briefs" (grepped separately, 8 hits, all in scripts/archive/one-time, docs/, and '
    + 'this same asset-storage.js cautionary comment — no lib/ production producer found), is an '
    + 'unrelated early-discovery-stage document pipeline. Neither venture-logos nor vision-briefs is '
    + 'part of the Kling/Runway/Gemini creative-media seam this parent orchestrator governs; both are '
    + 'triaged OUT OF SCOPE for this fence (different pipeline, different intentional stage design) '
    + 'and documented here per the SD\'s FR-10 census requirement rather than silently omitted.',
];

const SUMMARY = 'Explore LEAD_TO_PLAN verdict: PASS. The SD\'s stated dependency-blocking premise is '
  + 'stale (Child A shipped and already persists storage_path) — re-scoped the SD around what is '
  + 'actually still missing: a gated read/view primitive (no code path currently mints a viewable URL '
  + 'for a persisted creative_assets row at all). Independently confirmed the reused predicate '
  + '(stage-gate-predicate.js) is genuinely unarmed (0 rows in leo_feature_flags) and its null-ventureId '
  + 'default (OUT_OF_SCOPE, never blocked) is the wrong default for this fence, both matching the SD '
  + 'scope\'s own warnings rather than being stale assumptions. Confirmed S23 (chairman product_review) '
  + 'is a chairman_decisions row check, not a lifecycle-stage comparison, and must be composed alongside '
  + 'the S24 stage-gate call rather than expressed as a single requiredStage. Completed the FR-10 '
  + 'reachability census: venture-logos and vision-briefs are pre-existing public-bucket producers, '
  + 'confirmed out of scope (different pipeline, intentionally earlier/looser gating), no other producer '
  + 'touches the creative-assets-private bucket or its rows.';

async function main() {
  const supabase = await getSupabaseClient();

  const { data: flagRows } = await supabase
    .from('leo_feature_flags')
    .select('flag_key')
    .eq('flag_key', 'STAGE_GATE_PREDICATE_ARMED');

  const results = {
    verdict: 'PASS',
    confidence: 87,
    summary: SUMMARY,
    findings: FINDINGS,
    warnings: [
      'This SD builds the gate PRIMITIVE (checkAssetViewAuthorized / mintAssetViewUrl) and verifies '
        + 'no existing surface leaks a viewable handle. It does NOT build a consumer UI/API endpoint — '
        + 'Child C (taste-gate review UI, still draft) is the first planned consumer. Success criteria '
        + 'must be testable against the primitive directly (unit tests), not an end-to-end UI flow that '
        + 'does not exist yet.',
    ],
    recommendations: [
      'PLAN phase: design checkAssetViewAuthorized({supabase, ventureId}) to (1) block on missing '
        + 'ventureId before touching checkStageGate, (2) query chairman_decisions for an approved S23 '
        + 'product_review row, (3) call checkStageGate({requiredStage:24, armed:true, ...}) for S24, '
        + 'explicitly passing armed:true rather than relying on the (currently zero-row) '
        + 'STAGE_GATE_PREDICATE_ARMED flag.',
    ],
    validation_mode: 'prospective',
    metadata: {
      recorded_by: 'scripts/one-off/explore-evidence-media-production-capability-001-b.mjs',
      assessment_type: 'lead_phase_due_diligence',
      stage_gate_armed_flag_rows: flagRows?.length || 0,
      files_read: [
        'lib/creative/creative-brief.js',
        'lib/creative/asset-storage.js',
        'lib/storage/private-signed-upload.js',
        'lib/governance/stage-gate-predicate.js',
        'lib/eva/chairman-product-review.js',
        'lib/eva/logo-image-generator.js',
        'lib/eva/stage-handlers/s11.js',
      ],
      stale_premise_corrected: 'SD description claimed creative_assets had no storage_path column; Child A (PR #7571) already ships one via persistAssetPrivately()',
      fr10_census: {
        in_scope_private_primitives: ['lib/storage/private-signed-upload.js', 'lib/creative/asset-storage.js'],
        out_of_scope_public_producers: [
          { bucket: 'venture-logos', producers: ['lib/eva/logo-image-generator.js', 'lib/eva/stage-handlers/s11.js'], gate: 'current_lifecycle_stage >= 7 (deliberate, unrelated pipeline)' },
          { bucket: 'vision-briefs', producers: 'none found in lib/ (docs/scripts/archive references only)', gate: 'n/a — no active production producer' },
        ],
      },
    },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'EXPLORE',
    supabase,
  });
  applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults('EXPLORE', SD_KEY, null, results, {
    phase: 'LEAD_TO_PLAN',
  });

  const { data, error } = await supabase
    .from('sub_agent_execution_results')
    .select('id,sub_agent_code,phase,verdict,confidence,validation_mode,created_at')
    .eq('id', stored.id)
    .maybeSingle();

  if (error || !data) {
    console.error(`WROTE but could not read back id=${stored?.id}: ${error?.message || 'no row'}`);
    process.exit(1);
  }

  console.log('\nEXPLORE evidence recorded and read back:');
  console.log(JSON.stringify(data, null, 2));
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
