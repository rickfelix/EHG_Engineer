/**
 * LINT-THRESH-002 — PR size threshold consistency.
 *
 * Scans sections for "PR size" / "max PR" / "LOC max" declarations and flags
 * disagreement on the numeric ceiling. Mirrors class #2 of the 2026-04-22
 * drift audit (200 vs 400).
 *
 * SD-PROTOCOL-LINTER-001, slice 5/n.
 */

// Match any of: "max 400 LOC", "PR max 200 LOC", "max 400 lines", "400-line max"
const PATTERNS = [
  /(?:max|maximum|cap|ceiling)[^.\n]*?(\d{2,4})\s*(?:LOC|lines?)/gi,
  /(\d{2,4})\s*(?:LOC|lines?)[^.\n]*?(?:max|maximum|cap|ceiling)/gi
];

export default {
  id: 'LINT-THRESH-002',
  severity: 'warn',
  description: 'PR size ceiling must be declared identically across sections. Detects class #2 of the 2026-04-22 audit.',
  enabled: true,

  check(ctx) {
    const sections = ctx.sections || [];
    const mentions = [];

    for (const section of sections) {
      const content = section.content || '';
      // Only consider sections that explicitly talk about PR size
      if (!/PR\s+size|pull request size|max\s+PR/i.test(content)) continue;

      for (const re of PATTERNS) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(content)) !== null) {
          const value = Number.parseInt(m[1], 10);
          // Ignore obviously-non-PR numbers (tiny, huge, or percent-adjacent)
          if (value < 30 || value > 2000) continue;
          mentions.push({
            section_id: section.id,
            section_name: section.section_name,
            value,
            matched_text: m[0].trim()
          });
        }
      }
    }

    if (mentions.length < 2) return [];
    const distinct = [...new Set(mentions.map(m => m.value))];
    if (distinct.length === 1) return [];

    return mentions.map(m => ({
      section_id: m.section_id,
      message: `PR size ceiling declared as ${m.value} here; other sections declare ${distinct.filter(v => v !== m.value).join(', ')}.`,
      context: { found_values: distinct, matched_text: m.matched_text, section_name: m.section_name }
    }));
  }
};
