// SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-B — the sole sanctioned read/view surface for a
// generated media asset persisted by lib/creative/asset-storage.js#persistAssetPrivately(). No
// other code path may call storage.createSignedUrl() or storage.getPublicUrl() against the
// creative-assets-private bucket; every future consumer (starting with Child C's taste-gate
// review UI) must go through checkAssetViewAuthorized()/mintAssetViewUrl().
//
// The venture must clear TWO conditions, checked as separate legs because they cannot be
// expressed as a single lifecycle-stage comparison:
//   S23 — a recorded chairman product_review APPROVAL (lib/eva/chairman-product-review.js).
//         This is a verdict, not a stage number, so it is queried directly against
//         chairman_decisions rather than delegated to the stage-gate predicate.
//   S24 — current_lifecycle_stage >= 24, via lib/governance/stage-gate-predicate.js.
//         armed:true is passed as a HARDCODED LITERAL, never delegated to the predicate's own
//         isEnabled(STAGE_GATE_PREDICATE_ARMED) default -- that flag has zero rows in
//         leo_feature_flags (confirmed live at LEAD phase), so relying on it would silently
//         ship this fence in unenforced shadow mode.
//
// Both legs fail closed on a missing ventureId (checked before either leg runs, overriding the
// stage-gate predicate's own rule (a), which treats a null ventureId as OUT_OF_SCOPE/never
// blocked) and on every non-PASS predicate verdict, including OUT_OF_SCOPE (the predicate
// returns OUT_OF_SCOPE/blocked:false for an is_demo=true venture EVEN WHEN armed:true is
// passed -- a naive caller relying on shouldEnforceBlock() alone would let a real demo venture
// below S24 through; this module never uses shouldEnforceBlock() for that reason).
//
// A chairman-minted chairman_decisions override (decision_type='stage_gate_override', matching
// the namespaced override_key below) is an INTENTIONAL one-shot escape hatch inherited from the
// shared predicate, not a leak: it is consumed on first use (armed:true -> shouldConsume:true),
// so it authorizes exactly one view, never standing access.

import { checkStageGate, VERDICT } from '../governance/stage-gate-predicate.js';
import { PRODUCT_REVIEW_STAGE, PRODUCT_REVIEW_DECISION_TYPE } from '../eva/chairman-product-review.js';
import { TaskFailedError } from './errors.js';

const BUCKET = 'creative-assets-private';
const REQUIRED_LIFECYCLE_STAGE = 24;
export const DEFAULT_VIEW_URL_TTL_SECONDS = 300;
export const MAX_VIEW_URL_TTL_SECONDS = 300;

// Namespaced so this call site's override_key can never collide with an unrelated actor's
// (e.g. email-campaigns.js's bare campaign_id, autonomy-gate.js's channelType:contentId).
export function overrideKeyFor(ventureId) {
  return `media-asset-view:${ventureId}`;
}

/**
 * Determines whether a venture's creative-assets-private assets may be viewed right now.
 * Fail-closed by construction: any ambiguity (missing venture, no DB row, lookup error) is
 * treated as not-authorized.
 * @param {{supabase: object, ventureId: string|null|undefined}} params
 * @returns {Promise<{allowed: boolean, reason: string|null}>}
 */
export async function checkAssetViewAuthorized({ supabase, ventureId }) {
  if (!ventureId) {
    return { allowed: false, reason: 'missing_venture_id' };
  }

  // S23 leg: the LATEST attempt must be the approved one -- a later send_back must supersede an
  // earlier approval, not coexist with it as a permanent green light. The created_at DESC
  // secondary sort only breaks ties BETWEEN rows sharing the same attempt_number (e.g. a
  // concurrent duplicate insert) -- it does not compensate for a null attempt_number, which
  // Postgres' default DESC NULLS FIRST would otherwise sort ahead of every real attempt
  // regardless of created_at. Not a live concern today (attempt_number is DB-defaulted to 1 and
  // uniquely constrained per venture+stage+decision_type, so no row is ever null), but the two
  // failure modes are distinct and this comment must not conflate them.
  const { data: latestReview, error: reviewError } = await supabase
    .from('chairman_decisions')
    .select('status')
    .eq('venture_id', ventureId)
    .eq('lifecycle_stage', PRODUCT_REVIEW_STAGE)
    .eq('decision_type', PRODUCT_REVIEW_DECISION_TYPE)
    .order('attempt_number', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (reviewError || !latestReview || latestReview.status !== 'approved') {
    return { allowed: false, reason: 'product_review_not_approved' };
  }

  // S24 leg: explicitly armed, and only a PASS verdict authorizes -- BLOCK and OUT_OF_SCOPE
  // (is_demo, or a caller-bug requiredStage) are both treated as not-allowed.
  const gateResult = await checkStageGate({
    supabase,
    ventureId,
    requiredStage: REQUIRED_LIFECYCLE_STAGE,
    actorType: 'creative_asset_view',
    actorId: overrideKeyFor(ventureId),
    armed: true,
  });

  if (gateResult.verdict !== VERDICT.PASS) {
    return { allowed: false, reason: 'lifecycle_stage_gate_blocked' };
  }

  return { allowed: true, reason: null };
}

function resolveTtlSeconds(requested) {
  if (!Number.isFinite(requested) || requested <= 0) {
    return DEFAULT_VIEW_URL_TTL_SECONDS;
  }
  return Math.min(requested, MAX_VIEW_URL_TTL_SECONDS);
}

/**
 * Mints a short-lived signed URL for an already-persisted creative-assets-private object, after
 * confirming the owning venture is authorized to have it viewed. Never persists the URL.
 * @param {object} supabase
 * @param {{ventureId: string, storagePath: string, ttlSeconds?: number}} params
 * @returns {Promise<{signedUrl: string, expiresInSeconds: number}>}
 */
export async function mintAssetViewUrl(supabase, { ventureId, storagePath, ttlSeconds }) {
  const authz = await checkAssetViewAuthorized({ supabase, ventureId });
  if (!authz.allowed) {
    throw new TaskFailedError(`asset-view-gate: refusing to mint a view URL (${authz.reason})`, {
      code: 'ASSET_VIEW_NOT_AUTHORIZED',
      reason: authz.reason,
    });
  }

  const expiresInSeconds = resolveTtlSeconds(ttlSeconds);
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, expiresInSeconds);
  if (error) {
    throw new TaskFailedError(`asset-view-gate: createSignedUrl failed: ${error.message}`, { code: 'SIGN_FAILED' });
  }

  return { signedUrl: data.signedUrl, expiresInSeconds };
}

export default { checkAssetViewAuthorized, mintAssetViewUrl, MAX_VIEW_URL_TTL_SECONDS };
