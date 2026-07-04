/**
 * Chairman Product-Review Gate — packet generation + verdict plumbing.
 * SD-LEO-INFRA-CHAIRMAN-PRODUCT-REVIEW-001.
 *
 * Reuses existing chairman-gate machinery (createOrReusePendingDecision,
 * escalateChairmanDecision) rather than introducing a new gate framework. The
 * actual BLOCKING mechanism lives in lib/eva/stage-execution-worker.js's
 * _advanceStage() and the fn_advance_venture_stage DB function (FR-1) — this
 * module is responsible for the packet content and the verdict lifecycle only.
 */

import { createOrReusePendingDecision, isFixtureVenture, fetchVentureForFixtureCheck } from './chairman-decision-watcher.js';
import { escalateChairmanDecision } from '../chairman/record-pending-decision.mjs';
import { resolveSdInputOrNull } from '../../scripts/lib/sd-id-resolver.js';

export const PRODUCT_REVIEW_STAGE = 23;
export const PRODUCT_REVIEW_DECISION_TYPE = 'product_review';

// venture_artifacts.artifact_type values that make up the outward-facing surfaces
// inventory (confirmed live CHECK-constraint values, LEAD-phase VALIDATION evidence).
const SURFACE_ARTIFACT_TYPES = [
  'launch_production_app',
  'distribution_channel_config',
  'identity_brand_name',
  'identity_brand_guidelines',
  'identity_logo_image',
  'identity_naming_visual',
  'marketing_email_welcome',
  'marketing_email_onboarding',
  'marketing_email_reengagement',
  'marketing_landing_hero',
  'marketing_app_store_desc',
];

// The 5-8 stop guided tour, in plain taste-language — no venture IDs, stage
// numbers, or technical jargon. Each stop maps to an artifact_type when one is
// available; stops without a matching artifact still appear with a fallback note.
const GUIDED_TOUR_STOPS = [
  { key: 'landing', label: 'Landing page — first impression', artifactType: 'marketing_landing_hero' },
  { key: 'signup', label: 'Sign up', artifactType: null },
  { key: 'core_action', label: 'The core thing this product does', artifactType: null },
  { key: 'product_email', label: 'A product email a customer would receive', artifactType: 'marketing_email_welcome' },
  { key: 'pricing_terms', label: 'Pricing / terms', artifactType: null },
  { key: 'brand_surface', label: 'Brand surface — name, logo, tone', artifactType: 'identity_brand_name' },
];

const STAGE_REFERENCE_RE = /\s*\(?\bstage\s*\d+\)?/gi;
// A bare snake_case/kebab-case identifier with no spaces or punctuation (e.g. the artifact_type
// itself, 'marketing_landing_hero') is a strong signal of a leaked internal referent, not prose.
const OPAQUE_TOKEN_RE = /^[a-z][a-z0-9]*([_-][a-z0-9]+)+$/i;
// Common human-authored text fields across this venture's artifact content shapes (each
// artifact_type's JSON payload differs — this is a best-effort generic set, not a per-type map).
const CONTENT_TEXT_FIELDS = ['headline', 'subject', 'text', 'description', 'summary', 'name'];

/**
 * Pure: strip stage references and reject bare internal-identifier-shaped strings. The one place
 * that enforces the PRD's "no venture IDs, stage numbers, or technical jargon" contract on data
 * pulled from venture_artifacts — real rows have been observed with titles like
 * "Naming Candidates (Stage 11)" or a title that is literally the raw artifact_type string, and
 * content that is JSON, none of which is safe to surface to the chairman verbatim.
 * @param {*} text
 * @returns {string|null} sanitized text, or null if nothing safe survived
 */
export function sanitizeForChairman(text) {
  if (!text || typeof text !== 'string') return null;
  const stripped = text.replace(STAGE_REFERENCE_RE, '').trim();
  if (!stripped) return null;
  if (OPAQUE_TOKEN_RE.test(stripped)) return null;
  return stripped;
}

/**
 * Pure: best-effort extraction of chairman-safe human text from an artifact row. Tries the title,
 * then a handful of common text fields inside content if content is JSON, then raw content as a
 * last resort — sanitizing every candidate and returning the first one that survives.
 * @param {{title?: string, content?: string}|null|undefined} artifact
 * @returns {string|null}
 */
export function extractHumanText(artifact) {
  if (!artifact) return null;
  const candidates = [artifact.title];
  if (typeof artifact.content === 'string') {
    let parsed = null;
    try { parsed = JSON.parse(artifact.content); } catch { /* not JSON — fall through to raw content */ }
    if (parsed && typeof parsed === 'object') {
      for (const field of CONTENT_TEXT_FIELDS) candidates.push(parsed[field]);
      if (Array.isArray(parsed.candidates) && parsed.candidates[0]?.name) candidates.push(parsed.candidates[0].name);
    } else {
      candidates.push(artifact.content);
    }
  }
  for (const candidate of candidates) {
    const safe = sanitizeForChairman(candidate);
    if (safe) return safe;
  }
  return null;
}

/**
 * Pure: build the plain-language guided tour from a lookup of artifact_type -> row.
 * No opaque IDs, stage numbers, or venture IDs ever appear in the output text.
 * @param {Object<string, {title?: string, content?: string}>} artifactsByType
 * @returns {Array<{stop: string, note: string}>}
 */
export function buildGuidedTour(artifactsByType) {
  return GUIDED_TOUR_STOPS.map(({ label, artifactType }) => {
    const artifact = artifactType ? artifactsByType[artifactType] : null;
    const note = extractHumanText(artifact) || 'Not yet documented — check the running product directly for this stop.';
    return { stop: label, note };
  });
}

/**
 * Pure: build the outward-facing surfaces inventory from a lookup of artifact_type -> row.
 * @param {Object<string, {title?: string, content?: string, file_url?: string}>} artifactsByType
 * @returns {Array<{surface: string, present: boolean, detail: string|null}>}
 */
export function buildSurfacesInventory(artifactsByType) {
  return SURFACE_ARTIFACT_TYPES.map((type) => {
    const artifact = artifactsByType[type];
    return {
      surface: type.replace(/_/g, ' '),
      present: !!artifact,
      detail: artifact ? (extractHumanText(artifact) || artifact.file_url || null) : null,
    };
  });
}

/**
 * Pure: resolve the running-app URL, or documented one-command local-run instructions
 * if no deployed URL exists.
 * @param {{content?: string, file_url?: string}|null} launchArtifact
 * @returns {{mode: 'url'|'local_run', instructions: string}}
 */
export function resolveAccessInstructions(launchArtifact) {
  if (launchArtifact?.file_url) {
    return { mode: 'url', instructions: launchArtifact.file_url };
  }
  const safeContent = sanitizeForChairman(launchArtifact?.content);
  if (safeContent) {
    return { mode: 'local_run', instructions: safeContent };
  }
  return { mode: 'local_run', instructions: 'No deployed URL or local-run instructions found for this venture yet.' };
}

/**
 * Assemble the chairman-facing review packet for a venture. Fixture-venture-guarded:
 * a test/demo venture never produces a packet destined for the real chairman inbox.
 * @param {Object} supabase
 * @param {string} ventureId
 * @param {Object} [logger]
 * @returns {Promise<{skipped: true, reason: string}|{skipped: false, ventureName: string, access: object, guidedTour: array, surfacesInventory: array}>}
 */
export async function generateReviewPacket(supabase, ventureId, logger = console) {
  const venture = await fetchVentureForFixtureCheck(supabase, ventureId, logger);
  if (isFixtureVenture(venture)) {
    logger.log(`[ProductReviewPacket] Skipping packet generation for fixture venture ${ventureId}`);
    return { skipped: true, reason: 'fixture_venture' };
  }

  const { data: artifacts } = await supabase
    .from('venture_artifacts')
    .select('artifact_type, title, content, file_url')
    .eq('venture_id', ventureId)
    .eq('is_current', true)
    .in('artifact_type', [...SURFACE_ARTIFACT_TYPES]);

  const artifactsByType = {};
  for (const a of (artifacts || [])) {
    if (a?.artifact_type) artifactsByType[a.artifact_type] = a;
  }

  return {
    skipped: false,
    ventureName: venture?.name || 'this venture',
    access: resolveAccessInstructions(artifactsByType.launch_production_app),
    guidedTour: buildGuidedTour(artifactsByType),
    surfacesInventory: buildSurfacesInventory(artifactsByType),
  };
}

/**
 * Pure: compare two packets (as produced by generateReviewPacket) and report what changed,
 * in the same plain taste-language as the packet itself — no opaque IDs or internal field names.
 * @param {Object|null} previousPacket
 * @param {Object} currentPacket
 * @returns {{hasChanges: boolean, changes: Array<{about: string, before: string, after: string}>}}
 */
export function buildReviewDiff(previousPacket, currentPacket) {
  if (!previousPacket) return { hasChanges: false, changes: [] };

  const changes = [];

  if (previousPacket.access?.instructions !== currentPacket.access?.instructions) {
    changes.push({
      about: 'How to see it',
      before: previousPacket.access?.instructions || 'not available',
      after: currentPacket.access?.instructions || 'not available',
    });
  }

  const prevTourByStop = new Map((previousPacket.guidedTour || []).map(s => [s.stop, s.note]));
  for (const stop of (currentPacket.guidedTour || [])) {
    const prevNote = prevTourByStop.get(stop.stop);
    if (prevNote !== undefined && prevNote !== stop.note) {
      changes.push({ about: stop.stop, before: prevNote, after: stop.note });
    }
  }

  const prevSurfaceByName = new Map((previousPacket.surfacesInventory || []).map(s => [s.surface, s]));
  for (const surface of (currentPacket.surfacesInventory || [])) {
    const prev = prevSurfaceByName.get(surface.surface);
    if (prev && (prev.present !== surface.present || prev.detail !== surface.detail)) {
      changes.push({
        about: surface.surface,
        before: prev.present ? (prev.detail || 'present') : 'not yet there',
        after: surface.present ? (surface.detail || 'present') : 'not yet there',
      });
    }
  }

  return { hasChanges: changes.length > 0, changes };
}

/**
 * Create (or reuse) the pending product-review decision for a venture and deliver it —
 * ONE email per review (no reminders), reusing escalateChairmanDecision's own
 * dedup-on-brief_data.escalation_email_sent_at contract. An in-session chairman sees the
 * same chairman_decisions row through the normal decision-review surface — no separate
 * code path is needed for "present" vs "away".
 *
 * Multi-attempt / re-review (FR-3): if a PRIOR (resolved) product_review decision exists for
 * this venture+stage, this mints the NEXT attempt_number explicitly (createOrReusePendingDecision
 * otherwise always defaults to attempt_number=1, which would 23505-collide with that prior row
 * now that decision_type is part of the uniqueness key) and attaches a "what changed since your
 * review" diff against the prior attempt's packet snapshot (stored in its brief_data).
 * @param {Object} supabase
 * @param {string} ventureId
 * @param {Object} [logger]
 * @returns {Promise<{id: string|null, isNew: boolean, skipped?: boolean, escalated?: boolean}>}
 */
export async function requestProductReview(supabase, ventureId, logger = console) {
  const packet = await generateReviewPacket(supabase, ventureId, logger);
  if (packet.skipped) {
    return { id: null, isNew: false, skipped: true, reason: packet.reason };
  }

  const { data: priorAttempt } = await supabase
    .from('chairman_decisions')
    .select('attempt_number, brief_data')
    .eq('venture_id', ventureId)
    .eq('lifecycle_stage', PRODUCT_REVIEW_STAGE)
    .eq('decision_type', PRODUCT_REVIEW_DECISION_TYPE)
    .neq('status', 'pending')
    .order('attempt_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  const attemptNumber = priorAttempt ? (priorAttempt.attempt_number || 1) + 1 : null;
  const diff = buildReviewDiff(priorAttempt?.brief_data || null, packet);
  const briefData = diff.hasChanges || priorAttempt ? { ...packet, diffSinceLastReview: diff } : packet;

  const decision = await createOrReusePendingDecision({
    ventureId,
    stageNumber: PRODUCT_REVIEW_STAGE,
    decisionType: PRODUCT_REVIEW_DECISION_TYPE,
    briefData,
    summary: `Chairman product review: ${packet.ventureName}`,
    attemptNumber,
    supabase,
    logger,
  });
  if (decision.skipped || !decision.id) return decision;

  const escalation = await escalateChairmanDecision(supabase, decision.id);
  return { ...decision, escalated: escalation.escalated === true };
}

/**
 * Record the chairman's verdict for a pending product-review decision. On a send-back
 * verdict, each note becomes a tracked work item (a feedback row, linked via
 * feedback_sd_map) so the fleet can act on it, and re-review is armed by simply leaving
 * no APPROVED product_review decision behind — the next requestProductReview() call
 * naturally re-arms via createOrReusePendingDecision's decision_type-scoped reuse lookup.
 * @param {Object} supabase
 * @param {Object} params
 * @param {string} params.decisionId
 * @param {string} params.ventureId
 * @param {'approve'|'send_back'|'approve_with_notes'} params.verdict
 * @param {string[]} [params.notes]
 * @param {Object} [logger]
 * @returns {Promise<{recorded: boolean, workItemIds: string[]}>}
 */
export async function recordProductReviewVerdict(supabase, { decisionId, ventureId, verdict, notes = [] }, logger = console) {
  const statusByVerdict = {
    approve: { status: 'approved', decision: 'approve' },
    approve_with_notes: { status: 'approved', decision: 'conditional_pass' },
    send_back: { status: 'rejected', decision: 'revise' },
  };
  const mapped = statusByVerdict[verdict];
  if (!mapped) throw new Error(`Unknown product-review verdict: ${verdict}`);

  await supabase
    .from('chairman_decisions')
    .update({ status: mapped.status, decision: mapped.decision })
    .eq('id', decisionId);

  const workItemIds = [];
  if (verdict === 'send_back') {
    // feedback_sd_map.sd_id FKs to strategic_directives_v2(id) -- NOT sd_key. Confirmed live: this
    // SD's own `id` column holds a UUID string (not its human-readable sd_key), so the literal
    // sd_key would 23503 (foreign_key_violation). resolveSdInputOrNull resolves either form to the
    // correct `id` value; resolved once per call, fail-soft (a linking miss must never break verdict
    // recording, the primary side effect above).
    const resolvedSd = await resolveSdInputOrNull('SD-LEO-INFRA-CHAIRMAN-PRODUCT-REVIEW-001', supabase);
    if (!resolvedSd?.sdId) {
      logger.warn('[ProductReviewVerdict] Could not resolve this SD\'s id for feedback_sd_map linkage (non-fatal, feedback rows still created)');
    }

    for (const note of notes) {
      // Column values verified against the LIVE schema (feedback_type_check, feedback_status_check,
      // feedback_source_type_check CHECK constraints) -- 'chairman_product_review'/'open' are not
      // members of any of those enums and would 23514 on insert.
      const { data: feedbackRow, error } = await supabase
        .from('feedback')
        .insert({
          type: 'issue',
          feedback_type: 'user_other',
          source_application: 'EHG_Engineer',
          source_type: 'user_feedback',
          source_id: decisionId,
          title: `Product-review send-back: ${note.slice(0, 80)}`,
          description: note,
          status: 'new',
          venture_id: ventureId,
        })
        .select('id')
        .single();
      if (error) {
        logger.warn(`[ProductReviewVerdict] Failed to create feedback row for note (non-fatal): ${error.message}`);
        continue;
      }
      workItemIds.push(feedbackRow.id);
      if (!resolvedSd?.sdId) continue;
      // feedback_sd_map_relationship_type_check only allows addresses|partially_addresses|related --
      // 'related' is correct here: this SD is the ORIGIN mechanism, not (yet) the resolver.
      await supabase
        .from('feedback_sd_map')
        .insert({ feedback_id: feedbackRow.id, sd_id: resolvedSd.sdId, relationship_type: 'related' })
        .then(({ error: mapError }) => {
          if (mapError) logger.warn(`[ProductReviewVerdict] feedback_sd_map insert failed (non-fatal): ${mapError.message}`);
        });
    }
  }

  return { recorded: true, workItemIds };
}
