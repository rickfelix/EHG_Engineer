// lib/michael/rules.mjs — rows-first access to michael_rules and michael_closures, plus the pure
// markdown renderers used ONLY for the chairman's review copies (docs/michael/generated/*.md).
// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-B (FR-2). The seat reads rows; it never reads the
// rendered prose (spec §2 "Prose for review only").
import { readRows } from './db.mjs';

export const RULE_DOMAINS = Object.freeze(['gmail', 'todoist', 'calendar', 'tasks', 'body', 'brief', 'capture', 'youtube']);
export const AUTO_APPLY_VERBS = Object.freeze(['label', 'archive', 'reschedule']);

/**
 * Load active rules (or all with includeSuperseded) and unexpired closures.
 * @returns {Promise<{tables_absent:boolean, rules:object[], closures:object[], errors:string[]}>}
 */
export async function loadRulesAndClosures(sb, { domain = null, includeSuperseded = false, now = new Date() } = {}) {
  const errors = [];
  const rules = await readRows(sb, 'michael_rules', (q) => {
    let x = q.order('domain', { ascending: true }).order('rule_key', { ascending: true }).order('created_at', { ascending: true });
    if (!includeSuperseded) x = x.eq('status', 'active');
    if (domain) x = x.eq('domain', domain);
    return x;
  });
  if (rules.error) errors.push(rules.error);
  const closures = await readRows(sb, 'michael_closures', (q) => q.order('topic', { ascending: true }));
  if (closures.error) errors.push(closures.error);
  const nowIso = now.toISOString();
  const liveClosures = closures.rows.filter((c) => !c.expires_at || String(c.expires_at) > nowIso);
  return {
    tables_absent: Boolean(rules.tables_absent || closures.tables_absent),
    rules: rules.rows,
    closures: liveClosures,
    errors,
  };
}

/** Frontmatter the documentation standard requires (Category, Status, Version, Author, Last Updated, Tags). */
function frontmatter(title, { now, tags }) {
  const day = now.toISOString().slice(0, 10);
  return [
    '---',
    `title: ${title}`,
    'Category: Reference',
    'Status: Generated',
    'Version: 1.0.0',
    'Author: scripts/michael-rules-render.mjs (SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-B)',
    `Last Updated: ${day}`,
    `Tags: [${tags.join(', ')}]`,
    '---',
    '',
    `<!-- GENERATED for the chairman's review only. Source of truth: the michael_rules / michael_closures rows. Regenerate: node scripts/michael-rules-render.mjs. The seat never reads this file. -->`,
    '',
  ].join('\n');
}

const cell = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

/** Pure: rules -> RULES.md text, grouped by domain. */
export function renderRulesMarkdown(rules, { now = new Date(), tablesAbsent = false } = {}) {
  const lines = [frontmatter('Michael rules', { now, tags: ['michael', 'rules', 'generated'] }), '# Michael rules', ''];
  if (tablesAbsent) {
    lines.push('_The michael_* tables are not applied yet; there are no rules to render._', '');
    return lines.join('\n');
  }
  lines.push(`${rules.length} active rule(s) as of ${now.toISOString()}.`, '');
  const byDomain = new Map();
  for (const r of rules) {
    if (!byDomain.has(r.domain)) byDomain.set(r.domain, []);
    byDomain.get(r.domain).push(r);
  }
  for (const domain of [...RULE_DOMAINS, ...[...byDomain.keys()].filter((d) => !RULE_DOMAINS.includes(d))]) {
    const rows = byDomain.get(domain);
    if (!rows || !rows.length) continue;
    lines.push(`## ${domain}`, '', '| rule_key | status | auto_apply | verb | rule | ratification | source |', '|---|---|---|---|---|---|---|');
    for (const r of rows) {
      const p = r.provenance || {};
      lines.push(`| ${cell(r.rule_key)} | ${cell(r.status)} | ${r.auto_apply ? 'yes' : 'no'} | ${cell(r.auto_apply_verb)} | ${cell(r.rule_text)} | ${cell(p.ratification_id)} | ${cell(p.source)} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

/** Pure: closures -> CLOSURES.md text. */
export function renderClosuresMarkdown(closures, { now = new Date(), tablesAbsent = false } = {}) {
  const lines = [frontmatter('Michael closures', { now, tags: ['michael', 'closures', 'generated'] }), '# Michael closures', ''];
  if (tablesAbsent) {
    lines.push('_The michael_* tables are not applied yet; there are no closures to render._', '');
    return lines.join('\n');
  }
  lines.push(`${closures.length} live closure(s) as of ${now.toISOString()}.`, '', '| closure_key | topic | keywords | closure | scope | expires |', '|---|---|---|---|---|---|');
  for (const c of closures) {
    lines.push(`| ${cell(c.closure_key)} | ${cell(c.topic)} | ${cell((c.keywords || []).join(', '))} | ${cell(c.closure_text)} | ${cell(c.scope)} | ${cell(c.expires_at)} |`);
  }
  lines.push('');
  return lines.join('\n');
}
