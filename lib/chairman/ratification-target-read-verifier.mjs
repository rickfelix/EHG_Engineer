/**
 * lib/chairman/ratification-target-read-verifier.mjs — SD-LEO-INFRA-SOLOMON-RATIFICATION-CAPTURE-001-B
 * FR-4 (Q4 target-read verification).
 *
 * A chairman_ratifications row reading encoded_at !== null is not proof the ratification is
 * actually captured somewhere real — encoded_ref could be fabricated or stale (the target it
 * points to was since deleted, renamed, or never contained the recorded marker_text). This module
 * fetches the ACTUAL target content for each of the 4 pinned encoded_ref shapes
 * (lib/chairman/ratification-writer.mjs's ENCODED_REF_SHAPES) and greps for marker_text — a
 * fabricated or stale ref fails this check rather than silently reading as encoded.
 *
 * Pure orchestration + injectable per-shape fetchers (no direct DB/fs access here), mirroring the
 * checkRatificationCaptureMiss(supabase, {detector}) injectable-seam pattern in
 * scripts/solomon-advisory.cjs — testable without a live DB or filesystem.
 */
import { readFileSync } from 'node:fs';

/**
 * Default fetcher for type:'section_id' — reads leo_protocol_sections.content by id.
 * @param {object} supabase
 * @param {{section_id:string}} ref
 * @returns {Promise<string|null>}
 */
async function fetchSectionIdTarget(supabase, ref) {
  const { data, error } = await supabase
    .from('leo_protocol_sections')
    .select('content')
    .eq('id', ref.section_id)
    .maybeSingle();
  if (error || !data) return null;
  return data.content;
}

/**
 * Default fetcher for type:'sd_row' — reads strategic_directives_v2 description+scope by sd_key.
 * @param {object} supabase
 * @param {{sd_key:string}} ref
 * @returns {Promise<string|null>}
 */
async function fetchSdRowTarget(supabase, ref) {
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('description, scope')
    .eq('sd_key', ref.sd_key)
    .maybeSingle();
  if (error || !data) return null;
  return `${data.description || ''}\n${data.scope || ''}`;
}

/**
 * Default fetcher for type:'venture_metadata' — reads ventures.metadata, walks a dot-path.
 * @param {object} supabase
 * @param {{venture_id:string, path:string}} ref
 * @returns {Promise<string|null>}
 */
async function fetchVentureMetadataTarget(supabase, ref) {
  const { data, error } = await supabase
    .from('ventures')
    .select('metadata')
    .eq('id', ref.venture_id)
    .maybeSingle();
  if (error || !data) return null;
  const value = ref.path.split('.').reduce((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), data.metadata);
  return value === undefined || value === null ? null : String(value);
}

/**
 * Default fetcher for type:'memory_marker' — reads a memory file on disk (memory_id is a file path)
 * and returns its raw text; the anchor field is the substring expected within it.
 * @param {object} _supabase - unused for this shape (filesystem-backed, not DB-backed)
 * @param {{memory_id:string}} ref
 * @returns {Promise<string|null>}
 */
async function fetchMemoryMarkerTarget(_supabase, ref) {
  try {
    return readFileSync(ref.memory_id, 'utf8');
  } catch {
    return null; // file missing/unreadable — a stale ref, correctly fails verification
  }
}

const DEFAULT_FETCHERS = Object.freeze({
  section_id: fetchSectionIdTarget,
  sd_row: fetchSdRowTarget,
  venture_metadata: fetchVentureMetadataTarget,
  memory_marker: fetchMemoryMarkerTarget,
});

/**
 * Fetches the target for encoded_ref and greps for marker_text. Fails closed: a fabricated ref
 * (unknown type, unreachable target, or target missing marker_text) verifies as false.
 * @param {object} supabase
 * @param {{encoded_ref:object, marker_text:string}} row
 * @param {{fetchers?:object}} [opts] - injectable per-type fetchers for testing
 * @returns {Promise<{verified:boolean, reason?:string}>}
 */
export async function verifyRatificationTargetRead(supabase, row, { fetchers = DEFAULT_FETCHERS } = {}) {
  const ref = row && row.encoded_ref;
  const markerText = row && typeof row.marker_text === 'string' ? row.marker_text.trim() : '';
  if (!ref || typeof ref !== 'object') return { verified: false, reason: 'encoded_ref is missing or not an object' };
  if (!markerText) return { verified: false, reason: 'marker_text is missing or empty' };

  const fetcher = fetchers[ref.type];
  if (!fetcher) return { verified: false, reason: `no target-read fetcher for encoded_ref.type ${JSON.stringify(ref.type)}` };

  let targetContent;
  try {
    targetContent = await fetcher(supabase, ref);
  } catch (e) {
    return { verified: false, reason: `target fetch threw: ${(e && e.message) || e}` };
  }
  if (typeof targetContent !== 'string') return { verified: false, reason: 'target unreachable (fetch returned no content) — a stale or fabricated ref' };
  if (!targetContent.includes(markerText)) return { verified: false, reason: 'target content does not contain marker_text' };
  return { verified: true };
}

export { DEFAULT_FETCHERS };
