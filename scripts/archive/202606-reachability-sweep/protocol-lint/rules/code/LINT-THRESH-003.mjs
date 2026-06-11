/**
 * LINT-THRESH-003 — Gate pass threshold consistency.
 *
 * Protocol has two valid regimes:
 *   - Flat: 85% across all SD types (older sections)
 *   - SD-type-specific: 60-90% depending on type (canonical)
 *
 * This rule flags any section that declares ONE universal threshold (e.g.,
 * "all handoffs require 85%") if another section declares type-specific
 * ranges. Mirrors class #3 of the 2026-04-22 drift audit.
 *
 * SD-PROTOCOL-LINTER-001, slice 5/n.
 */

// Match universal threshold claims: "all handoffs 85%", "every gate requires 85%"
const UNIVERSAL_RE = /(?:all|every|each|flat)[^.\n]*?(?:handoffs?|gates?|thresholds?)[^.\n]*?(\d{2,3})\s*%/gi;
// Match type-specific range claims: "60-90%", "60%-90%", "between 60 and 90"
const RANGE_RE = /(\d{2,3})\s*[-–]\s*(\d{2,3})\s*%/g;
// Heuristic: type-specific declaration mentions `sd_type` or specific types
const TYPE_HINT = /sd_type|infrastructure|feature|bugfix|documentation|security|refactor/i;

export default {
  id: 'LINT-THRESH-003',
  severity: 'warn',
  description: 'Gate pass threshold is SD-type specific (60-90%), not a flat 85%. Universal-threshold claims conflict with canonical type-specific rules. Detects class #3 of the 2026-04-22 audit.',
  enabled: true,

  check(ctx) {
    const sections = ctx.sections || [];
    const universalClaims = [];
    const rangeClaims = [];

    for (const s of sections) {
      const content = s.content || '';
      UNIVERSAL_RE.lastIndex = 0;
      let m;
      while ((m = UNIVERSAL_RE.exec(content)) !== null) {
        universalClaims.push({
          section_id: s.id,
          section_name: s.section_name,
          value: Number.parseInt(m[1], 10),
          matched_text: m[0].trim()
        });
      }
      if (TYPE_HINT.test(content)) {
        RANGE_RE.lastIndex = 0;
        while ((m = RANGE_RE.exec(content)) !== null) {
          const lo = Number.parseInt(m[1], 10);
          const hi = Number.parseInt(m[2], 10);
          if (lo >= 50 && hi <= 100 && hi > lo) {
            rangeClaims.push({ section_id: s.id, section_name: s.section_name, lo, hi });
          }
        }
      }
    }

    // Only flag when BOTH a universal and a range claim coexist in the dataset
    if (universalClaims.length === 0 || rangeClaims.length === 0) return [];

    return universalClaims.map(u => ({
      section_id: u.section_id,
      message: `Universal gate threshold ${u.value}% claimed here; other sections declare an SD-type-specific range (e.g., ${rangeClaims[0].lo}-${rangeClaims[0].hi}%).`,
      context: { universal_value: u.value, matched_text: u.matched_text, section_name: u.section_name }
    }));
  }
};
