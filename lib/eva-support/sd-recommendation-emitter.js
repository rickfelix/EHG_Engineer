/**
 * SD recommendation emitter — emit-only chairman-approved SD creation flow.
 *
 * SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-C FR-5 / TS-3 / TS-4 / TS-10 / TS-11.
 *
 * CONTRACT (the entire reason this module exists):
 *   - EVA NEVER calls /leo create. It emits a copy-pasteable command STRING that
 *     the chairman runs manually.
 *   - EVA NEVER imports child_process / execa / spawn. T1 invariant enforces this.
 *   - EVA NEVER writes to strategic_directives_v2. T2 invariant enforces this.
 *   - Every emit() invocation writes exactly one eva_support_decision_log row
 *     (kind=sd_recommendation) BEFORE rendering output. On render crash, the row
 *     metadata.outcome is UPDATED to 'render_crashed' before rethrow.
 *
 * COUNTERFACTUAL SEMANTICS (FR-5):
 *   When the supplied findDupCandidates() returns a candidate with confidence
 *   ≥ COUNTERFACTUAL_THRESHOLD (80%), the emitter skips command emission and
 *   surfaces the existing sd_key. Decision-log row has outcome='skipped_duplicate'.
 *
 * APPROVAL GATE:
 *   Chairman must provide override_reason ≥ MIN_OVERRIDE_REASON_LENGTH (12 chars).
 *   Without it, outcome='declined' and command is emitted as a PREVIEW (chairman
 *   can re-invoke with the override token to approve).
 *
 * @module lib/eva-support/sd-recommendation-emitter
 */

import { writeAuditRow, updateAuditRowMetadata } from './sd-decision-log-writer.js';
import { randomUUID } from 'crypto';

const COUNTERFACTUAL_THRESHOLD = 80; // dup-candidate confidence ≥80 → skip emission
const MIN_OVERRIDE_REASON_LENGTH = 12;

export class SDRecommendationEmitError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'SDRecommendationEmitError';
    this.code = code;
  }
}

/**
 * Default dup-finder: returns []. Real implementations should query
 * strategic_directives_v2 / vector search / LLM semantic match and return
 * `[{ sd_key, confidence }]`. Injectable so the unit tests can mock without
 * pulling in the dup-detection infrastructure.
 *
 * @param {string} intent
 * @returns {Promise<Array<{ sd_key: string, confidence: number }>>}
 */
async function defaultFindDupCandidates(_intent) {
  return [];
}

/**
 * Build the /leo create command preview string.
 *
 * @param {Object} args
 * @returns {string}
 */
export function buildCommandPreview({ sd_type, target_application, priority, title } = {}) {
  const parts = ['/leo create'];
  if (sd_type) parts.push(`--type ${sd_type}`);
  if (target_application) parts.push(`--target ${target_application}`);
  if (priority) parts.push(`--priority ${priority}`);
  if (title) parts.push(`--title "${String(title).replace(/"/g, '\\"')}"`);
  return parts.join(' ');
}

/**
 * Compose the chairman-facing output text. Decline path is rendered at least
 * as prominently as Approve (per R2 mitigation — counterfactual + decline-prominence).
 *
 * @param {Object} ctx
 * @returns {string}
 */
function renderRecommendationOutput(ctx) {
  const { outcome, command_preview, confidence, counterfactual, dup_candidates, intent_text, dup_sd_key } = ctx;

  if (outcome === 'skipped_duplicate') {
    return [
      'SD recommendation SKIPPED — existing SD covers this intent.',
      `  Existing: ${dup_sd_key}`,
      `  Intent: ${intent_text}`,
      `  Counterfactual: ${counterfactual}`,
      '  Review the existing SD before creating a new one.',
    ].join('\n');
  }

  const lines = [
    `SD recommendation (confidence ${confidence}/100):`,
    '',
    `  Intent: ${intent_text}`,
    '',
    '  Proposed command (copy-paste to approve — DO NOT auto-run):',
    `    ${command_preview}`,
    '',
  ];

  if (counterfactual) {
    lines.push(`  Why NOT to create this:`);
    lines.push(`    ${counterfactual}`);
    lines.push('');
  }

  if (dup_candidates && dup_candidates.length > 0) {
    lines.push('  Top dup-candidates (review before approving):');
    for (const dc of dup_candidates.slice(0, 3)) {
      lines.push(`    - ${dc.sd_key} (confidence ${dc.confidence}/100)`);
    }
    lines.push('');
  }

  lines.push('  To approve: respond with `Override: <reason ≥12 chars>` then copy the command.');
  lines.push('  To decline: respond `decline` or take no action.');
  lines.push('');
  lines.push(`  Outcome (this invocation): ${outcome}`);
  return lines.join('\n');
}

/**
 * Emit an SD recommendation. Single entrypoint.
 *
 * @param {Object} args
 * @param {string} args.intent_text - chairman's stated intent
 * @param {string} [args.sd_type='feature']
 * @param {string} [args.target_application='EHG_Engineer']
 * @param {string} [args.priority='medium']
 * @param {string} args.title - proposed SD title
 * @param {string} [args.override_reason] - chairman approval token (≥12 chars to approve)
 * @param {Function} [args.findDupCandidates] - injectable dup-finder
 * @param {string} [args.eva_invocation_id] - audit correlation id
 * @param {Object} [args.client] - Supabase client override
 * @returns {Promise<{ command_text: string, output_text: string, audit_row_id: string | null,
 *                     outcome: string, counterfactual_applied: boolean, dup_sd_key?: string }>}
 */
export async function emit({
  intent_text,
  sd_type = 'feature',
  target_application = 'EHG_Engineer',
  priority = 'medium',
  title,
  override_reason,
  findDupCandidates = defaultFindDupCandidates,
  eva_invocation_id,
  client,
  // Test-only injectable renderer. Production callers SHOULD NOT pass this.
  // Tests use it to verify the render-crash → audit-row-update path (TS-11)
  // without contorting inputs to trigger crashes via type coercion tricks.
  _render = renderRecommendationOutput,
} = {}) {
  if (typeof intent_text !== 'string' || !intent_text.trim()) {
    throw new SDRecommendationEmitError('intent_text is required (non-empty string)', 'BAD_INPUT');
  }
  if (typeof title !== 'string' || !title.trim()) {
    throw new SDRecommendationEmitError('title is required (non-empty string)', 'BAD_INPUT');
  }
  const invocationId = eva_invocation_id ?? randomUUID();

  // (1) Dup-candidate detection.
  let dupCandidates = [];
  try {
    dupCandidates = (await findDupCandidates(intent_text)) ?? [];
  } catch {
    dupCandidates = []; // fail-soft on dup-finder errors
  }
  const topDup = dupCandidates.find((c) => c.confidence >= COUNTERFACTUAL_THRESHOLD) ?? null;

  // (2) Outcome determination — BEFORE any DB write or render.
  let outcome;
  let counterfactual = null;
  let dup_sd_key = null;
  if (topDup) {
    outcome = 'skipped_duplicate';
    counterfactual = `An existing SD (${topDup.sd_key}, ${topDup.confidence}% intent match) already covers this scope.`;
    dup_sd_key = topDup.sd_key;
  } else if (typeof override_reason === 'string' && override_reason.trim().length >= MIN_OVERRIDE_REASON_LENGTH) {
    outcome = 'approved';
  } else {
    outcome = 'declined';
  }

  // (3) Build command preview (always — even if declined/skipped, chairman may want to see what was proposed).
  const command_preview = buildCommandPreview({ sd_type, target_application, priority, title });

  // (4) Write audit row FIRST (TS-10 mandate). On render crash later, we update
  // this row's metadata.outcome to 'render_crashed' (TS-11 mandate).
  const auditMetadata = {
    eva_invocation_id: invocationId,
    intent_text,
    recommended_sd_key: null, // EVA never authors the SD; chairman runs the command manually
    sd_type,
    target_application,
    priority,
    title,
    confidence: topDup ? 100 - topDup.confidence : 50, // proxy confidence — dup-candidates lower it
    counterfactual,
    outcome,
    dup_candidates: dupCandidates.slice(0, 3),
    invoked_at: new Date().toISOString(),
  };
  if (outcome === 'approved' && override_reason) {
    auditMetadata.override_reason = override_reason.trim();
  }
  if (outcome === 'skipped_duplicate') {
    auditMetadata.dup_sd_key = dup_sd_key;
  }

  const audit = await writeAuditRow({
    decision_kind: 'sd_recommendation',
    metadata: auditMetadata,
    eva_invocation_id: invocationId,
    summary: `SD recommendation outcome=${outcome}: ${String(title).slice(0, 100)}`,
    client,
  }).catch((err) => ({ inserted: false, row: null, error: err }));

  const auditRowKey = audit?.row ? { task_id: audit.row.task_id, sequence: audit.row.sequence } : null;
  const audit_row_id = auditRowKey ? `${auditRowKey.task_id}#${auditRowKey.sequence}` : null;

  // (5) Render output. If this throws, update the audit row metadata.outcome → render_crashed.
  let output_text;
  try {
    output_text = _render({
      outcome,
      command_preview,
      confidence: auditMetadata.confidence,
      counterfactual,
      dup_candidates: dupCandidates,
      intent_text,
      dup_sd_key,
    });
  } catch (renderErr) {
    if (auditRowKey) {
      await updateAuditRowMetadata({
        task_id: auditRowKey.task_id,
        sequence: auditRowKey.sequence,
        metadataPatch: {
          outcome: 'render_crashed',
          error_message: String(renderErr?.message ?? renderErr).slice(0, 500),
          rendered_at_attempted: new Date().toISOString(),
        },
        client,
      }).catch(() => { /* audit-of-audit failure is silent — don't recurse */ });
    }
    throw renderErr;
  }

  return {
    command_text: command_preview,
    output_text,
    audit_row_id,
    outcome,
    counterfactual_applied: outcome === 'skipped_duplicate',
    ...(dup_sd_key ? { dup_sd_key } : {}),
  };
}

export const __testHooks = Object.freeze({
  COUNTERFACTUAL_THRESHOLD,
  MIN_OVERRIDE_REASON_LENGTH,
  buildCommandPreview,
  renderRecommendationOutput,
  defaultFindDupCandidates,
});
