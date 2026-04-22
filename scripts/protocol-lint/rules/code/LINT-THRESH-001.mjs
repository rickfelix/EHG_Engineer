/**
 * LINT-THRESH-001 — Quick-Fix LOC threshold consistency.
 *
 * Scans section content for "Quick-Fix ... N LOC" declarations. If two
 * sections declare different N, flag every occurrence. Mirrors contradiction
 * class #1 from the 2026-04-22 audit (50 LOC vs 75 LOC disagreement).
 *
 * SD-PROTOCOL-LINTER-001, slice 2/n.
 */

const QF_LOC_PATTERN = /Quick-?Fix[^.\n]*?(\d{1,3})\s*LOC/gi;

export default {
  id: 'LINT-THRESH-001',
  severity: 'warn',
  description: 'Quick-Fix LOC threshold must be declared identically across all sections that mention it.',
  enabled: true,

  check(ctx) {
    const sections = ctx.sections || [];
    const mentions = [];

    for (const section of sections) {
      const content = section.content || '';
      // Reset lastIndex each iteration — JS regex state is shared per /g instance.
      QF_LOC_PATTERN.lastIndex = 0;
      let match;
      while ((match = QF_LOC_PATTERN.exec(content)) !== null) {
        mentions.push({
          section_id: section.id,
          section_name: section.section_name,
          value: Number.parseInt(match[1], 10),
          matched_text: match[0]
        });
      }
    }

    if (mentions.length < 2) return [];

    const distinctValues = [...new Set(mentions.map(m => m.value))];
    if (distinctValues.length === 1) return [];

    // Disagreement found: every mention is a violation so dashboards can jump
    // to any involved section.
    return mentions.map(m => ({
      section_id: m.section_id,
      message: `Quick-Fix LOC threshold declared as ${m.value} here; other sections declare ${distinctValues.filter(v => v !== m.value).join(', ')}.`,
      context: {
        found_values: distinctValues,
        section_name: m.section_name,
        matched_text: m.matched_text
      }
    }));
  }
};
