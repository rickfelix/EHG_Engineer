/**
 * LINT-ANCHOR-001 — Anchor-topic uniqueness.
 *
 * Each `anchor_topic` on `leo_protocol_sections` should be claimed by AT MOST
 * one section. Duplicates indicate two sections competing for authoritative
 * status on the same topic (e.g., two copies of the pause-point list in
 * different phrasing, a class surfaced repeatedly in the 2026-04-22 audit).
 *
 * SD-PROTOCOL-LINTER-001, slice 2/n.
 */

export default {
  id: 'LINT-ANCHOR-001',
  severity: 'warn',
  description: 'An anchor_topic may be claimed by at most one section (authoritative-list uniqueness).',
  enabled: true,

  check(ctx) {
    const tagged = (ctx.sections || []).filter(s => s.anchor_topic);
    if (tagged.length < 2) return [];

    const byTopic = new Map();
    for (const s of tagged) {
      const list = byTopic.get(s.anchor_topic) || [];
      list.push(s);
      byTopic.set(s.anchor_topic, list);
    }

    const violations = [];
    for (const [topic, list] of byTopic) {
      if (list.length < 2) continue;
      for (const s of list) {
        const competitors = list
          .filter(x => x.id !== s.id)
          .map(x => x.section_name || x.id);
        violations.push({
          section_id: s.id,
          message: `anchor_topic "${topic}" is also claimed by ${list.length - 1} other section(s): ${competitors.join(', ')}.`,
          context: {
            anchor_topic: topic,
            competing_section_ids: list.map(x => x.id)
          }
        });
      }
    }
    return violations;
  }
};
