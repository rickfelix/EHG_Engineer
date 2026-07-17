// lib/eva/vision-upsert.js
/**
 * Reusable Vision document upsert for EVA.
 * Extracted from scripts/eva/vision-command.mjs to enable programmatic use
 * without CLI side effects (process.exit, console.error).
 *
 * @module lib/eva/vision-upsert
 */

// SD-LEO-INFRA-PORTFOLIO-STRATEGY-FIRST-001-A: vision_key(s) requiring GOVERNED-TIER
// approval — a revision can activate ONLY via an explicit chairmanRatified:true, never
// via the `approved` default. Scoped deliberately to these keys only: VALIDATION/RISK
// sub-agent passes confirmed all 3 existing L2 callers (stage-17-doc-generation.js,
// vision-repair-loop.js, CLI vision-command.mjs) already pass `approved` explicitly, so
// flipping the GLOBAL default would be unnecessary and untested — this guard closes the
// FORCE-APPROVE trap for the portfolio-strategy artifact without touching that default.
//
// Exported as the single canonical source: any other write path to eva_vision_documents
// touching one of these keys (e.g. scripts/eva/vision-command.mjs's addendum subcommand)
// MUST import and check against this same set — a second, independently-hardcoded copy of
// the key string was found (adversarial review, PR #6138) to risk silently desyncing.
export const GOVERNED_VISION_KEYS = new Set(['VISION-PORTFOLIO-STRATEGY-001']);
export const PORTFOLIO_STRATEGY_VISION_KEY = 'VISION-PORTFOLIO-STRATEGY-001';

/**
 * Upsert an EVA vision document.
 *
 * SD-LEO-FEAT-DELIBERATE-VISION-APPROVAL-001:
 *  - FR-1: resolve venture_id at WRITE TIME from a single-venture brainstorm
 *    session when ventureId is not supplied directly.
 *  - FR-2: approval is now an EXPLICIT option (`approved`). When true the doc is
 *    written active + chairman_approved; when false it is written draft +
 *    not-approved. Default remains `true` for backward-compat with the existing
 *    programmatic callers (vision-repair-loop, stage-17-doc-generation); the CLI
 *    wrapper (scripts/eva/vision-command.mjs) makes the choice mandatory so the
 *    chairman-facing path is deliberate, not silent.
 *
 * SD-LEO-INFRA-PORTFOLIO-STRATEGY-FIRST-001-A:
 *  - GOVERNED_VISION_KEYS entries ignore `approved` entirely and require an
 *    explicit `chairmanRatified: true` to activate — a revision proposal for
 *    one of these keys defaults to draft (never auto-activates), closing the
 *    upsertVision FORCE-APPROVE trap for the portfolio-strategy artifact.
 *
 * @param {Object}  params
 * @param {Object}  params.supabase   - Supabase client (required)
 * @param {string}  params.visionKey  - vision_key (required)
 * @param {string}  [params.level='L2']
 * @param {string}  params.content    - rendered content (required)
 * @param {Object}  [params.sections]
 * @param {Array}   [params.dimensions]
 * @param {string}  [params.ventureId] - explicit venture linkage (wins over brainstorm resolution)
 * @param {string}  [params.brainstormId] - source brainstorm session id (used for FR-1 venture resolution)
 * @param {string}  [params.createdBy='eva-vision-upsert']
 * @param {boolean} [params.approved=true] - FR-2: controls chairman_approved AND status (ignored for GOVERNED_VISION_KEYS)
 * @param {boolean} [params.chairmanRatified=false] - required true to activate a GOVERNED_VISION_KEYS revision
 * @returns {Promise<{data: Object|null, error: Object|null}>}
 */
export async function upsertVision({ supabase, visionKey, level = 'L2', content, sections, dimensions, ventureId, brainstormId, createdBy = 'eva-vision-upsert', approved = true, chairmanRatified = false }) {
  if (!supabase) throw new Error('supabase client is required');
  if (!visionKey) throw new Error('visionKey is required');
  if (!content) throw new Error('content is required');

  // FR-1: vision→venture linkage at WRITE TIME.
  // When no explicit ventureId is given but the upsert is sourced from a
  // brainstorm session, resolve the venture from that session — but ONLY when it
  // maps to exactly one, unambiguous venture (single venture_id AND not a
  // cross_venture session). Anything ambiguous (multi/zero venture or
  // cross_venture) leaves venture_id null, preserving the 200 internal-SD vision
  // rows that must stay NULL.
  let resolvedVentureId = ventureId || null;
  if (!resolvedVentureId && brainstormId) {
    resolvedVentureId = await resolveVentureFromBrainstorm(supabase, brainstormId);
  }

  // Fetch existing version + addendums + dims (dims drive the carry-forward preserve below)
  const { data: existing } = await supabase
    .from('eva_vision_documents')
    .select('id, version, addendums, extracted_dimensions')
    .eq('vision_key', visionKey)
    .maybeSingle();

  const version = existing ? existing.version + 1 : 1;

  // Build addendums array — append entry on each enrichment (append-only)
  const prevAddendums = existing?.addendums || [];
  const addendums = version > 1
    ? [...prevAddendums, {
        version,
        timestamp: new Date().toISOString(),
        created_by: createdBy,
        changed_sections: sections ? Object.keys(sections).filter(k => k !== 'extracted_at' && k !== 'extraction_source') : [],
      }]
    : prevAddendums;

  // FR-2: deliberate approval — `approved` controls BOTH chairman_approved and status.
  // Governed keys ignore `approved` entirely — only an explicit chairmanRatified:true activates.
  const isApproved = GOVERNED_VISION_KEYS.has(visionKey)
    ? chairmanRatified === true
    : approved !== false;

  const record = {
    vision_key: visionKey,
    level,
    content,
    version,
    status: isApproved ? 'active' : 'draft',
    chairman_approved: isApproved,
    source_file_path: null,
    created_by: createdBy,
    addendums,
    // SD-LEO-INFRA-CLONE-VISION-AUTOPROMOTE-QUALITY-REPAIR-001 (A1 root fix — EXPLICIT carry-forward):
    // when the caller does not supply dims, carry forward the EXISTING row's extracted_dimensions
    // instead of NULL-clobbering them. The "just omit the key and let ON CONFLICT preserve it" variant
    // was empirically falsified: PostgREST/Postgres evaluates the eva_vision_documents_active_rich_check
    // CHECK against the INSERT tuple (where an omitted column reads NULL), so an active-status write that
    // omits dims fails the check EVEN when the existing row already has dims (verified live). Writing the
    // existing dims explicitly keeps the payload non-null, so an enriched clone vision survives a repair's
    // active promote. An explicit clear still works: `dimensions: null` writes null (null !== undefined).
    extracted_dimensions: dimensions !== undefined ? dimensions : (existing?.extracted_dimensions ?? null),
    ...(sections && Object.keys(sections).length > 0 ? { sections } : {}),
    ...(resolvedVentureId ? { venture_id: resolvedVentureId } : {}),
    ...(brainstormId ? { source_brainstorm_id: brainstormId } : {}),
  };

  const { data, error } = await supabase
    .from('eva_vision_documents')
    .upsert(record, { onConflict: 'vision_key' })
    .select('id, vision_key, level, version, status, quality_checked, quality_issues, created_by')
    .single();

  return { data, error };
}

/**
 * Build the UPDATE payload for an addendum to an existing vision document.
 * Extracted from scripts/eva/vision-command.mjs's cmdAddendum for testability
 * (SD-LEO-INFRA-PORTFOLIO-STRATEGY-FIRST-001-A) — pure, no I/O.
 *
 * SD-LEO-INFRA-PORTFOLIO-STRATEGY-FIRST-001-A: a direct addendum UPDATE is a
 * second write path to eva_vision_documents that would otherwise bypass
 * upsertVision()'s GOVERNED_VISION_KEYS ratification gate entirely — an
 * adversarial review (PR #6138) found this let an already-ACTIVE governed
 * document's content change while status/chairman_approved stayed untouched.
 * Mirrors upsertVision's "each revision needs its own ratification" rule: any
 * addendum to a governed key demotes the row back to draft.
 *
 * @param {Object} params
 * @param {string} params.visionKey
 * @param {Object} params.existing - existing row: { content, addendums }
 * @param {string} params.section - addendum text
 * @param {Array|null} [params.dimensions] - freshly re-extracted dimensions
 * @param {string} [params.brainstormId]
 * @param {string} [params.addedBy='eva-vision-command']
 * @returns {{updatePayload: Object, updatedAddendums: Array, combinedContent: string}}
 */
export function buildAddendumUpdatePayload({ visionKey, existing, section, dimensions, brainstormId, addedBy = 'eva-vision-command' }) {
  const addendum = {
    section,
    added_at: new Date().toISOString(),
    added_by: addedBy,
    ...(brainstormId ? { source_brainstorm_id: brainstormId } : {}),
  };

  const currentAddendums = existing.addendums || [];
  const updatedAddendums = [...currentAddendums, addendum];

  const combinedContent = `${existing.content}\n\n---\n\n## Addendum ${updatedAddendums.length}\n\n${section}`;

  const updatePayload = {
    addendums: updatedAddendums,
    extracted_dimensions: dimensions,
    content: combinedContent,
    updated_at: new Date().toISOString(),
  };
  if (brainstormId) updatePayload.source_brainstorm_id = brainstormId;

  if (GOVERNED_VISION_KEYS.has(visionKey)) {
    updatePayload.status = 'draft';
    updatePayload.chairman_approved = false;
  }

  return { updatePayload, updatedAddendums, combinedContent };
}

/**
 * FR-1: Resolve a single, unambiguous venture_id from a brainstorm session.
 *
 * A brainstorm session carries `venture_ids` (array) and a `cross_venture`
 * boolean. We only link a vision to a venture when the session names EXACTLY ONE
 * venture and is NOT cross_venture — i.e. the brainstorm is unambiguously about
 * one venture. Any other shape (zero/multiple venture_ids, or cross_venture=true)
 * returns null so the vision stays venture-unlinked.
 *
 * Fails soft: a lookup error or missing row returns null (never throws) so an
 * upsert is never blocked by venture-resolution issues.
 *
 * @param {Object} supabase
 * @param {string} brainstormId
 * @returns {Promise<string|null>}
 */
async function resolveVentureFromBrainstorm(supabase, brainstormId) {
  try {
    const { data: session, error } = await supabase
      .from('brainstorm_sessions')
      .select('venture_ids, cross_venture')
      .eq('id', brainstormId)
      .maybeSingle();

    if (error || !session) return null;
    if (session.cross_venture === true) return null;

    const ventureIds = Array.isArray(session.venture_ids) ? session.venture_ids.filter(Boolean) : [];
    if (ventureIds.length !== 1) return null;

    return ventureIds[0];
  } catch {
    return null;
  }
}
