#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_KEY = 'SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-B';

const key_changes = [
  {
    change: 'New lib/creative/asset-view-gate.js: checkAssetViewAuthorized({supabase, ventureId}) fails closed on missing/null ventureId (overriding stage-gate-predicate.js rule (a) OUT_OF_SCOPE default), queries chairman_decisions for an approved S23 product_review verdict, and calls checkStageGate({requiredStage:24, armed:true, ...}) for S24 -- explicit armed:true override since STAGE_GATE_PREDICATE_ARMED has zero rows in leo_feature_flags.',
    impact: 'Establishes the single chokepoint every future consumer (Child C taste-gate UI, or any other read/view surface) must call before a generated media asset becomes viewable.',
  },
  {
    change: 'mintAssetViewUrl(supabase, {ventureId, storagePath, ttlSeconds}) mints a per-view signed URL via supabase.storage.createSignedUrl() against creative-assets-private only after checkAssetViewAuthorized() passes; TTL is capped, never persisted.',
    impact: 'No consumer needs its own gating logic or its own signed-URL minting -- reduces the future taste-gate UI to a thin caller of this primitive.',
  },
  {
    change: 'FR-10 reachability census documented (evidence + PRD): venture-logos and vision-briefs public buckets confirmed as pre-existing, unrelated producers (different pipeline, intentionally earlier stage gating), no other code path touches creative-assets-private.',
    impact: 'Closes the census requirement without scope creep into remediating unrelated, correctly-designed public buckets.',
  },
];

const risks = [
  {
    risk: 'A future consumer (e.g. Child C\'s taste-gate UI) bypasses asset-view-gate.js and mints its own signed URL or reads storage_path directly, silently defeating the fence.',
    impact: 'high',
    likelihood: 'medium',
    mitigation: 'Document asset-view-gate.js as the sole sanctioned read path in its own module header and in this SD\'s retro; Child C\'s own SECURITY review should grep for direct createSignedUrl/getPublicUrl calls against creative-assets-private.',
  },
  {
    risk: 'STAGE_GATE_PREDICATE_ARMED remains a zero-row flag fleet-wide; a future call site elsewhere in the codebase that reuses checkStageGate without this SD\'s explicit armed:true override silently ships unarmed (shadow mode).',
    impact: 'medium',
    likelihood: 'medium',
    mitigation: 'Out of scope for this SD to arm the flag fleet-wide (that is a separate, chairman-commissioned rollout decision per the predicate\'s own header comment); this SD\'s own call site is unaffected because it passes armed:true explicitly rather than depending on the flag.',
  },
];

const dependencies = [
  { sd_id: 'SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-A', status: 'resolved', note: 'Merged PR #7571 -- creative-brief.js/asset-storage.js/private-signed-upload.js already ship the private-storage pipeline this fence gates read access to.' },
];

const smoke_test_steps = [
  { instruction: 'Call checkAssetViewAuthorized({supabase, ventureId: null}) against a real Supabase client.', expected_outcome: 'Returns {allowed:false, reason:"missing_venture_id"} -- blocked, NOT the underlying predicate\'s OUT_OF_SCOPE default.' },
  { instruction: 'Call checkAssetViewAuthorized for a venture with no approved product_review (S23) chairman_decisions row.', expected_outcome: 'Returns {allowed:false, reason:"product_review_not_approved"}.' },
  { instruction: 'Call checkAssetViewAuthorized for a venture with an approved S23 product_review row but current_lifecycle_stage < 24.', expected_outcome: 'Returns {allowed:false, reason:"lifecycle_stage_gate_blocked"} -- confirms the armed:true override enforces the block even though STAGE_GATE_PREDICATE_ARMED has zero rows.' },
  { instruction: 'Call mintAssetViewUrl for a venture that clears both S23 and S24, requesting a TTL above the module cap.', expected_outcome: 'Returns a signed URL scoped to the requested storagePath with expiresInSeconds clamped to the module\'s MAX_VIEW_URL_TTL_SECONDS cap, and the URL is never written back to any table.' },
];

const metadata_patch = {
  mechanism_verifications: [
    {
      mechanism: 'lib/governance/stage-gate-predicate.js#checkStageGate (reused for the S24 leg)',
      verified_by: 'sub_agent_execution_results id=574c8aa5-9a7c-4e24-87a1-b4485ef9405c (EXPLORE, LEAD_TO_PLAN)',
      verified_at: 'lib/governance/stage-gate-predicate.js:237-296 (checkStageGate); leo_feature_flags queried live, 0 rows for STAGE_GATE_PREDICATE_ARMED',
      note: 'Confirmed the predicate defaults to unarmed (isEnabled() fails safe false on missing flag) and its rule (a) never blocks a null/absent ventureId (OUT_OF_SCOPE) -- this SD\'s own checkAssetViewAuthorized() must pass armed:true explicitly and must check for missing ventureId BEFORE delegating to checkStageGate.',
    },
    {
      mechanism: 'lib/eva/chairman-product-review.js (S23 leg: PRODUCT_REVIEW_STAGE=23, PRODUCT_REVIEW_DECISION_TYPE=\'product_review\')',
      verified_by: 'sub_agent_execution_results id=574c8aa5-9a7c-4e24-87a1-b4485ef9405c (EXPLORE, LEAD_TO_PLAN)',
      verified_at: 'lib/eva/chairman-product-review.js:18-19 (constants), :346-358 (recordProductReviewVerdict sets chairman_decisions.status=\'approved\')',
      note: 'S23 is a chairman_decisions row check (venture_id, lifecycle_stage=23, decision_type=\'product_review\', status=\'approved\'), not a lifecycle-stage-number comparison -- cannot be expressed as a single checkStageGate requiredStage. Must be queried directly and composed alongside the S24 stage-gate call.',
    },
    {
      mechanism: 'lib/creative/asset-storage.js#persistAssetPrivately / lib/storage/private-signed-upload.js#uploadPrivateAndSign (the storage this fence gates read access to)',
      verified_by: 'sub_agent_execution_results id=574c8aa5-9a7c-4e24-87a1-b4485ef9405c (EXPLORE, LEAD_TO_PLAN)',
      verified_at: 'lib/creative/asset-storage.js:104-138; lib/storage/private-signed-upload.js:19-37',
      note: 'Confirmed persistAssetPrivately discards the upload-time signedUrl and persists only storage_path -- no existing code path mints a viewable URL for a persisted creative_assets row today, so this SD\'s primitive is the FIRST read/view surface, not a retrofit of an existing leak.',
    },
  ],
};

async function main() {
  const { data: existing, error: fetchErr } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('sd_key', SD_KEY)
    .single();
  if (fetchErr) throw fetchErr;

  const mergedMetadata = {
    ...existing.metadata,
    ...metadata_patch,
    needs_enrichment: false,
  };

  const { error } = await supabase
    .from('strategic_directives_v2')
    .update({ key_changes, risks, dependencies, smoke_test_steps, metadata: mergedMetadata })
    .eq('sd_key', SD_KEY);
  if (error) throw error;
  console.log('Updated SD fields for', SD_KEY);
}

main().catch((e) => { console.error(e); process.exit(1); });
