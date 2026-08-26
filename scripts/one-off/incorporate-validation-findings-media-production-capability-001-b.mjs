#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-B';

const success_criteria = [
  {
    measure: 'A test asserts a venture below the conjunctive S23+S24 condition (FR-7) cannot resolve any creative-assets-private handle via checkAssetViewAuthorized/mintAssetViewUrl -- including when the underlying stage-gate predicate returns OUT_OF_SCOPE (e.g. is_demo=true, or a caller-bug requiredStage), which this fence must treat as BLOCK, not pass-through',
    criterion: 'No creative-assets-private asset (URL, storage path, or provenance handle) is externally reachable via this fence\'s primitive before its venture clears S23+S24 -- scoped to the new creative-media seam (Kling/Runway/Gemini via lib/creative/asset-storage.js), not a universal claim across every venture-media producer',
  },
  {
    measure: 'The underlying stage-gate predicate is explicitly armed (armed:true) for this call site, verified by a test that a venture with missing/unresolvable venture_id is blocked, AND a separate test that an is_demo=true venture below S24 is ALSO blocked (VALIDATION finding: checkStageGate rule (c) returns OUT_OF_SCOPE/blocked:false for is_demo ventures even when armed:true is passed -- this fence must treat verdict!==PASS as not-allowed, never rely on shouldEnforceBlock() alone)',
    criterion: 'The fence is fail-closed by construction on every non-PASS verdict from the underlying predicate (BLOCK and OUT_OF_SCOPE alike), not merely present-but-unarmed',
  },
  {
    measure: 'Any signed URL issued by the fence is minted per-view at the internal review surface and has an enforced maximum expiry, verified by a test/config assertion; the override_key passed to the predicate is scoped so it can never collide with an unrelated actor\'s override_key (e.g. a campaign_id) in chairman_decisions',
    criterion: 'Signed URLs are never persisted, carry a capped TTL, and the fence\'s override lookup key is namespaced to this call site only',
  },
  {
    measure: 'The PRD/deliverable includes a documented census (FR-10) classifying every current public-bucket/getPublicUrl() call site touching venture-generated media, INCLUDING venture-logos (lib/eva/logo-image-generator.js, lib/eva/stage-handlers/s11.js) -- VALIDATION finding: venture-logos is genuine venture-generated media in scope of the SD\'s own wording, not an unrelated pipeline; its remediation is explicitly DEFERRED (documented rationale: distinct S11-gated identity-asset pipeline, remediation is a separately-scoped follow-up, not silently dropped) while vision-briefs is confirmed genuinely unrelated (no active lib/ producer)',
    criterion: 'A reachability census exists covering venture-media producers beyond the new unified seam, with in-scope-but-deferred items explicitly labeled as such rather than mislabeled unrelated',
  },
  {
    measure: 'A test/db-check confirms creative_assets.storage_path exists live before any end-to-end smoke test is claimed passing (VALIDATION finding: the column was merged as code-that-assumes-it but the additive migration database/migrations/20260826_creative_assets_storage_path.sql had NOT been applied live as of LEAD phase -- confirmed via a live 42703 undefined_column error)',
    criterion: 'The dependency on Child A\'s storage_path column is verified against live DB state, not assumed from merged code',
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
  {
    risk: 'VALIDATION finding: checkStageGate rule (c) (is_demo=true) returns verdict=OUT_OF_SCOPE/blocked=false unconditionally, even with armed:true passed -- a real (non-fixture) demo venture below S24 would sail through this fence if the fence naively used shouldEnforceBlock() as its sole allow/deny signal.',
    impact: 'high',
    likelihood: 'low',
    mitigation: 'checkAssetViewAuthorized() treats ONLY verdict===VERDICT.PASS from checkStageGate as authorized for the S24 leg -- any other verdict (BLOCK or OUT_OF_SCOPE) is treated as not-allowed. Covered by a dedicated unit test using a mocked is_demo=true venture.',
  },
  {
    risk: 'VALIDATION finding: creative_assets.storage_path does not exist live (42703) despite Child A\'s merged code assuming it does -- the additive migration exists but requires a --prod-deploy DDL apply that this worker session\'s permissions do not allow (classifier-denied). Signaled to the coordinator (harness-bug, severity high, signal_id 8714aa90-b4aa-41ed-8050-9cde5a7cfc76).',
    impact: 'high',
    likelihood: 'high',
    mitigation: 'This SD\'s own code/tests are built with dependency-injected/mocked Supabase clients so they are not blocked by the live schema gap; full end-to-end verification (a real INSERT against creative_assets.storage_path) is documented as pending the migration apply, tracked via the open signal rather than silently assumed complete.',
  },
];

const dependencies = [
  { sd_id: 'SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-A', status: 'partially_resolved', note: 'Code merged (PR #7571) and persistAssetPrivately()/storage_path logic ships, but the additive migration adding creative_assets.storage_path has NOT been applied live (confirmed 42703). Migration apply requires DDL permission this worker session does not have -- signaled to coordinator, signal_id 8714aa90-b4aa-41ed-8050-9cde5a7cfc76.' },
];

async function main() {
  const { error } = await supabase
    .from('strategic_directives_v2')
    .update({ success_criteria, risks, dependencies })
    .eq('sd_key', SD_KEY);
  if (error) throw error;
  console.log('Incorporated VALIDATION findings into SD fields for', SD_KEY);
}

main().catch((e) => { console.error(e); process.exit(1); });
