/**
 * Golden-reference application-guide rubric
 * SD-LEO-INFRA-GOLDEN-REFERENCES-CANONICAL-001-A (scaffold child)
 *
 * A guide is consumable by a delegate-tier session only if it carries every
 * required section. The rubric checks section PRESENCE (heading match), not
 * prose style — rigid enough to be machine-checkable, loose enough that domain
 * children never need format renegotiation. Consumed by domain children's
 * tests and, later, by the tiered orchestrator before pointing a delegate at
 * a reference.
 */

export const REQUIRED_GUIDE_SECTIONS = Object.freeze([
  'Inputs',
  'Adaptation points',
  'Invariants',
  'Acceptance (both directions)',
]);

/**
 * Validate a guide document against the rubric.
 * @param {string} content - application-guide.md content
 * @returns {{ ok: boolean, missing: string[], found: string[] }}
 */
export function checkGuide(content) {
  const text = String(content || '');
  const missing = [];
  const found = [];
  for (const section of REQUIRED_GUIDE_SECTIONS) {
    // Heading form: one or more #, optional whitespace, the section title
    // (case-insensitive, allows trailing text after the title on the line).
    const re = new RegExp('^#{1,6}\\s+' + section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'im');
    (re.test(text) ? found : missing).push(section);
  }
  return { ok: missing.length === 0, missing, found };
}
