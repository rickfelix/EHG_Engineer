/**
 * LINT-BYPASS-001 — "NEVER bypass X" paired with a documented bypass path.
 *
 * If a section declares something is "NEVER" to be bypassed while the same
 * section (or the dataset) documents a bypass flag, emergency override, or
 * rate-limited exception, the absolute claim is inaccurate. Mirrors class #7
 * of the 2026-04-22 drift audit.
 *
 * Strategy: find every section declaring a NEVER-bypass constraint, then
 * check whether the subject of that constraint also appears in a section
 * that documents a bypass mechanism (--skip-*, --bypass-*, EMERGENCY,
 * rate-limited, exception).
 *
 * SD-PROTOCOL-LINTER-001, slice 5/n.
 */

const NEVER_BYPASS_RE = /\bNEVER\s+(?:bypass|skip|override)\s+([A-Za-z0-9_.\-/]+)/g;
const BYPASS_MECHANISM_RE = /(--skip[-_][\w-]+|--bypass[-_][\w-]+|EMERGENCY_(?:PUSH|BYPASS|SKIP)|rate[-\s]?limited|documented bypass|bypass path)/i;

export default {
  id: 'LINT-BYPASS-001',
  severity: 'warn',
  description: '"NEVER bypass X" is inaccurate when the dataset also documents a bypass for X. Say "rarely bypass" or list the exceptions inline. Detects class #7 of the 2026-04-22 audit.',
  enabled: true,

  check(ctx) {
    const sections = ctx.sections || [];
    const violations = [];

    // Pass 1: find NEVER-bypass claims
    const neverClaims = [];
    for (const s of sections) {
      const content = s.content || '';
      NEVER_BYPASS_RE.lastIndex = 0;
      let m;
      while ((m = NEVER_BYPASS_RE.exec(content)) !== null) {
        neverClaims.push({
          section_id: s.id,
          section_name: s.section_name,
          subject: m[1],
          matched_text: m[0]
        });
      }
    }
    if (neverClaims.length === 0) return [];

    // Pass 2: for each never-claim, detect a bypass mechanism anywhere in the dataset
    // referencing the same subject
    for (const claim of neverClaims) {
      const subjectLc = claim.subject.toLowerCase();
      const evidence = sections.some(s => {
        const content = (s.content || '').toLowerCase();
        return content.includes(subjectLc) && BYPASS_MECHANISM_RE.test(s.content || '');
      });
      if (evidence) {
        violations.push({
          section_id: claim.section_id,
          message: `"${claim.matched_text}" but a bypass mechanism is documented elsewhere for "${claim.subject}".`,
          context: { subject: claim.subject, matched_text: claim.matched_text, section_name: claim.section_name }
        });
      }
    }
    return violations;
  }
};
