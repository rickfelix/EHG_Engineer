/**
 * Derive a structured functional-requirements array from an SD's prose.
 * SD-LEO-INFRA-STRUCTURED-SD-FR-FIELD-001 (FR-1).
 *
 * Produces strategic_directives_v2.metadata.functional_requirements — a JSONB array mirroring
 * product_requirements_v2.functional_requirements ({id, title, description, ...}). This is the
 * canonical structured FR source the PRD-writer (FR-3) and the SD<->PRD drift gate
 * (scripts/modules/handoff/executors/plan-to-exec/gates/sd-prd-drift.js extractSdFrs) prefer.
 *
 * The prose-extraction MUST stay aligned with that gate's `extractSdFrs` prose fallback
 * (same FR-N regex + dedup-longest), so structured<->structured diffing is exact: the gate's
 * structured branch reads {id, title, description} and joins [title, description] back into the
 * text it would otherwise have parsed from prose. We split each FR's prose into title +
 * description so the joined text reconstructs the original (round-trip parity) while giving the
 * PRD a usable title/description pair.
 */

// FR-N marker: same pattern the drift gate uses. Keep in sync.
const FR_MARKER = /\bFR-(\d+)\b[:.\s-]*/gi;
// Title is the FR's first sentence (or a bounded lead when there is no sentence terminator).
const TITLE_MAX = 120;

/** Split FR prose into {title, description} whose join reconstructs the original text. */
function splitTitleDescription(raw) {
  const t = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!t) return { title: '', description: '' };
  const sentence = t.match(/^(.{0,120}?[.!?])\s+([\s\S]+)$/);
  if (sentence) return { title: sentence[1].trim(), description: sentence[2].trim() };
  if (t.length > TITLE_MAX) return { title: t.slice(0, TITLE_MAX).trimEnd(), description: t.slice(TITLE_MAX).trim() };
  return { title: t, description: '' };
}

/**
 * Parse FR-N markers from `prose`, keeping the text from each marker until the next one.
 * Dedups repeated FR-N (description + scope often duplicate) keeping the longest text —
 * identical contract to the drift gate's prose fallback.
 * @returns {Array<{id:string, text:string}>}
 */
function parseFrProse(prose) {
  const text = String(prose || '');
  const marks = [];
  let m;
  FR_MARKER.lastIndex = 0;
  while ((m = FR_MARKER.exec(text)) !== null) {
    marks.push({ id: `FR-${m[1]}`.toUpperCase(), start: m.index, textStart: FR_MARKER.lastIndex });
  }
  const frs = [];
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? marks[i + 1].start : text.length;
    const body = text.slice(marks[i].textStart, end).trim();
    const existing = frs.find((f) => f.id === marks[i].id);
    if (existing) { if (body.length > existing.text.length) existing.text = body; }
    else frs.push({ id: marks[i].id, text: body });
  }
  return frs;
}

/**
 * Derive the structured functional_requirements array for an SD from its description + scope
 * prose. Returns [] when no FR-N markers are present (graceful fallback — FR-4: callers omit
 * the field rather than writing an empty array).
 *
 * @param {{description?:string, scope?:string}} sd
 * @returns {Array<{id:string, title:string, description:string}>}
 */
export function deriveSdFunctionalRequirements(sd) {
  if (!sd) return [];
  const prose = [sd.description, sd.scope].filter(Boolean).join('\n');
  return parseFrProse(prose)
    .filter((f) => f.text && f.text.length > 0)
    .map((f) => {
      const { title, description } = splitTitleDescription(f.text);
      return description ? { id: f.id, title, description } : { id: f.id, title };
    });
}

export default { deriveSdFunctionalRequirements };
