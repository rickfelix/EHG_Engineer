#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-B';
const PRD_ID = 'PRD-SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-B';
const SD_ID = '76debabb-47c2-4d37-b600-048f0b12fe59';

const stories = [
  {
    story_key: `${SD_KEY}:US-001`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Gate a generated media asset behind a fail-closed S23+S24 authorization check before it can be viewed',
    user_role: 'Future consumer of a produced creative asset (e.g. the Child C taste-gate review UI)',
    user_want: 'To call a single primitive (checkAssetViewAuthorized) that tells me whether a given venture\'s generated media assets may be viewed right now, without me having to re-implement the S23 chairman product_review check and the S24 stage-gate check myself, and without silently trusting the underlying predicate\'s permissive defaults (missing venture_id / is_demo both default to OUT_OF_SCOPE/never-blocked in the reused predicate).',
    user_benefit: 'Every future consumer gets the same fail-closed behavior for free, so a hard security requirement is enforced once, correctly, rather than re-implemented (and potentially mis-implemented) at each new call site.',
    priority: 'critical',
    status: 'ready',
    acceptance_criteria: [
      'checkAssetViewAuthorized({supabase, ventureId:null}) returns {allowed:false, reason:"missing_venture_id"}',
      'checkAssetViewAuthorized returns {allowed:false, reason:"product_review_not_approved"} when the venture\'s latest S23 chairman_decisions attempt is not status=approved',
      'checkAssetViewAuthorized returns {allowed:false, reason:"lifecycle_stage_gate_blocked"} both for an ordinary understage venture AND for an is_demo=true venture below S24 (the underlying predicate\'s OUT_OF_SCOPE default for demo ventures must not leak through as authorized)',
      'checkAssetViewAuthorized returns {allowed:true} only when the venture has an approved latest S23 attempt AND checkStageGate returns verdict===PASS for requiredStage:24 with armed:true',
    ],
    definition_of_done: [],
    depends_on: [],
    blocks: [],
    technical_notes: 'Implemented in lib/creative/asset-view-gate.js, composing lib/eva/chairman-product-review.js (S23) and lib/governance/stage-gate-predicate.js (S24, armed:true).',
    implementation_approach: null,
    implementation_context: JSON.stringify({
      technical_approach: 'checkAssetViewAuthorized() short-circuits on missing ventureId, queries chairman_decisions for the latest S23 product_review attempt, then calls checkStageGate(requiredStage:24, armed:true) and treats only verdict===PASS as authorized.',
      files_to_create: ['lib/creative/asset-view-gate.js', 'lib/creative/asset-view-gate.test.js'],
      files_to_modify: [],
      dependencies: ['lib/eva/chairman-product-review.js', 'lib/governance/stage-gate-predicate.js'],
      estimated_effort: 'small',
    }),
    test_scenarios: ['TS-1','TS-2','TS-3','TS-4','TS-5','TS-11','TS-12'],
    e2e_test_status: 'not_created',
    validation_status: 'pending',
    architecture_references: ['lib/creative/asset-view-gate.js'],
    example_code_patterns: [],
    testing_scenarios: [],
    given_when_then: [],
    implementation_status: 'pending',
    metadata: {},
  },
  {
    story_key: `${SD_KEY}:US-002`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Mint a short-lived, per-view signed URL for an authorized asset without ever persisting it',
    user_role: 'Future consumer of a produced creative asset (e.g. the Child C taste-gate review UI)',
    user_want: 'To call mintAssetViewUrl(supabase, {ventureId, storagePath, ttlSeconds}) and get back a working signed URL I can render in a review UI, scoped to a short, capped expiry, without needing to know the storage bucket name or handle the private-bucket signing mechanics myself.',
    user_benefit: 'No consumer needs to build its own signed-URL minting logic or risk accidentally persisting a long-lived/public URL; the fence is enforced at the one place URLs are ever created for these assets.',
    priority: 'critical',
    status: 'ready',
    acceptance_criteria: [
      'mintAssetViewUrl throws before calling storage.createSignedUrl when checkAssetViewAuthorized would return allowed:false',
      'mintAssetViewUrl caps expiresInSeconds at MAX_VIEW_URL_TTL_SECONDS regardless of the ttlSeconds requested by the caller',
      'mintAssetViewUrl falls back to DEFAULT_VIEW_URL_TTL_SECONDS when ttlSeconds is non-finite, NaN, zero, or negative (never propagates an invalid TTL into createSignedUrl)',
      'No code path in asset-view-gate.js writes the minted signedUrl to any table',
    ],
    definition_of_done: [],
    depends_on: [],
    blocks: [],
    technical_notes: 'Depends conceptually on US-001 (checkAssetViewAuthorized) being implemented first, since mintAssetViewUrl calls it. Wraps lib/storage/private-signed-upload.js\'s createSignedUrl usage pattern against the creative-assets-private bucket.',
    implementation_approach: null,
    implementation_context: JSON.stringify({
      technical_approach: 'mintAssetViewUrl() calls checkAssetViewAuthorized() first, clamps ttlSeconds to a safe positive value, then calls supabase.storage.from(BUCKET).createSignedUrl(storagePath, cappedTtl) and returns the result without persisting it.',
      files_to_create: ['lib/creative/asset-view-gate.js', 'lib/creative/asset-view-gate.test.js'],
      files_to_modify: [],
      dependencies: ['lib/storage/private-signed-upload.js'],
      estimated_effort: 'small',
    }),
    test_scenarios: ['TS-7','TS-8','TS-13'],
    e2e_test_status: 'not_created',
    validation_status: 'pending',
    architecture_references: ['lib/creative/asset-view-gate.js'],
    example_code_patterns: [],
    testing_scenarios: [],
    given_when_then: [],
    implementation_status: 'pending',
    metadata: {},
  },
];

async function main() {
  const { data, error } = await supabase.from('user_stories').insert(stories).select('id, story_key');
  if (error) throw error;
  console.log('Inserted user stories:', JSON.stringify(data, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
