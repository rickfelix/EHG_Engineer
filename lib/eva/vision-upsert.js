// lib/eva/vision-upsert.js
/**
 * Reusable Vision document upsert for EVA.
 * Extracted from scripts/eva/vision-command.mjs to enable programmatic use
 * without CLI side effects (process.exit, console.error).
 *
 * @module lib/eva/vision-upsert
 */

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
 * @param {boolean} [params.approved=true] - FR-2: controls chairman_approved AND status
 * @returns {Promise<{data: Object|null, error: Object|null}>}
 */
export async function upsertVision({ supabase, visionKey, level = 'L2', content, sections, dimensions, ventureId, brainstormId, createdBy = 'eva-vision-upsert', approved = true }) {
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

  // Fetch existing version + addendums
  const { data: existing } = await supabase
    .from('eva_vision_documents')
    .select('id, version, addendums')
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
  const isApproved = approved !== false;

  const record = {
    vision_key: visionKey,
    level,
    content,
    extracted_dimensions: dimensions || null,
    version,
    status: isApproved ? 'active' : 'draft',
    chairman_approved: isApproved,
    source_file_path: null,
    created_by: createdBy,
    addendums,
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
