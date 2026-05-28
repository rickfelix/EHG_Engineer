/**
 * lib/eva/extract-archplan-section.js
 *
 * SD: SD-LEO-INFRA-AUTOMATE-STAGE-CASCADE-001 / FR-B
 *
 * Pure parser: extracts the "Architectural Plan" section out of an L2 vision
 * document's content so the cascade watcher can hand it to upsertArchPlan().
 *
 * Returns { found, content, heading_line_number, heading_text }.
 *   - found=true  : section located; `content` is the section body text.
 *   - found=false : no canonical heading; cascade should refuse with
 *                   ARCH_SECTION_NOT_FOUND + remediation_command pointing at
 *                   manual archplan-command.mjs upsert.
 */

// Canonical heading variants accepted at H2 OR H3 level (case-insensitive).
// Order matters: more specific match wins.
const HEADING_PATTERNS = [
  /^##\s+Architectural Plan\b/i,
  /^###\s+Architectural Plan\b/i,
  /^##\s+Architecture Plan\b/i,
  /^###\s+Architecture Plan\b/i,
];

/**
 * @param {string|null|undefined} content   Raw L2 vision content (markdown).
 * @param {Object} [opts]
 * @param {number} [opts.minBodyChars=50]   Minimum non-blank chars to consider section non-empty.
 * @returns {{ found: boolean, content: string|null, heading_line_number: number|null, heading_text: string|null }}
 */
export function extractArchPlanSection(content, opts = {}) {
  const minBodyChars = opts.minBodyChars ?? 50;

  if (content == null || typeof content !== 'string' || content.length === 0) {
    return { found: false, content: null, heading_line_number: null, heading_text: null };
  }

  const lines = content.split('\n');
  let headingIdx = -1;
  let headingText = null;
  let headingDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const re of HEADING_PATTERNS) {
      if (re.test(line)) {
        headingIdx = i;
        headingText = line.trim();
        const m = /^(#+)\s/.exec(line);
        headingDepth = m ? m[1].length : 2;
        break;
      }
    }
    if (headingIdx !== -1) break;
  }

  if (headingIdx === -1) {
    return { found: false, content: null, heading_line_number: null, heading_text: null };
  }

  // Section body runs from line after heading until next heading at same-or-lower depth (i.e. fewer #).
  let endIdx = lines.length;
  for (let i = headingIdx + 1; i < lines.length; i++) {
    const m = /^(#{1,6})\s/.exec(lines[i]);
    if (m && m[1].length <= headingDepth) {
      endIdx = i;
      break;
    }
  }

  const bodyLines = lines.slice(headingIdx + 1, endIdx);
  // Drop leading and trailing blank lines from body
  while (bodyLines.length && bodyLines[0].trim() === '') bodyLines.shift();
  while (bodyLines.length && bodyLines[bodyLines.length - 1].trim() === '') bodyLines.pop();

  const body = bodyLines.join('\n');
  if (body.length < minBodyChars) {
    return { found: false, content: null, heading_line_number: headingIdx + 1, heading_text: headingText };
  }

  return {
    found: true,
    content: body,
    heading_line_number: headingIdx + 1, // 1-indexed
    heading_text: headingText,
  };
}
