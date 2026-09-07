// lib/michael/cowork-parse.mjs — pure markdown parsers for the Cowork Dropbox import.
// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-F (FR-2, FR-4, TR-4).
//
// No real Cowork file example exists anywhere in this repo or its git history (confirmed by an
// Explore pass at LEAD) — the format below is DEFINED by this child, not reverse-engineered. It
// favors a small number of predictable markers over free-text guessing so the dry-run preview
// (FR-6) can name exactly what it recognized and what it didn't, rather than silently doing its
// best. The chairman validates the assumed format against the real files via that preview before
// any --apply ever writes a row.
//
// Rule files (gmail.md, todoist.md, body-section.md, morning-brief-distillation.md, CLAUDE.md quick
// facts) share one format: one rule per "### <domain>: <rule_key>" heading, followed by free-text
// rule_text lines, with two optional recognized directive lines (in any order, each starting the
// line): "json: <json>" (parsed as rule_json) and "auto_apply_source: true|false" (the SOURCE
// system's own flag — never trusted directly; see cowork-import.mjs for why every imported row
// still lands auto_apply=false). domain must be one of michael_rules' CHECK-constrained values.
//
// Label table: a markdown table with a header row containing "label_id" (any column order).
// Closures: one closure per "### closure: <closure_key>" heading, with recognized directive lines
// "keywords: a, b, c", "scope: <text>", "expires_at: <ISO date>", and free-text closure_text.
// Feedback ledger: one day per "### <YYYY-MM-DD>" heading, with recognized directive lines
// "landed: <text>", "friction: <text>", "outcome_vs_jobs: <text>", "acted: true|false".

export const RULE_DOMAINS = Object.freeze(['gmail', 'todoist', 'calendar', 'tasks', 'body', 'brief', 'capture', 'youtube']);

function splitBlocks(text, headingRe) {
  const lines = String(text || '').split('\n');
  const blocks = [];
  let current = null;
  for (const line of lines) {
    const m = headingRe.exec(line);
    if (m) {
      if (current) blocks.push(current);
      current = { heading: m, bodyLines: [] };
    } else if (current) {
      current.bodyLines.push(line);
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

/** Pure: parse one rule-file's text into { rules: [{domain, rule_key, rule_text, rule_json, auto_apply_source}], unparsed: [line,...] }. */
export function parseRuleFile(text) {
  const headingRe = /^###\s+([a-z]+)\s*:\s*(\S.*)$/;
  const blocks = splitBlocks(text, headingRe);
  const rules = [];
  const unparsed = [];
  for (const block of blocks) {
    const domain = block.heading[1].trim().toLowerCase();
    const rule_key = block.heading[2].trim();
    if (!RULE_DOMAINS.includes(domain)) { unparsed.push(`### ${block.heading[1]}: ${block.heading[2]} (unrecognized domain "${domain}")`); continue; }
    const textLines = [];
    let rule_json = null;
    let auto_apply_source = false;
    for (const raw of block.bodyLines) {
      const line = raw.trim();
      if (!line) continue;
      const jsonM = /^json:\s*(\{.*\})\s*$/.exec(line);
      const autoM = /^auto_apply_source:\s*(true|false)\s*$/i.exec(line);
      if (jsonM) {
        try { rule_json = JSON.parse(jsonM[1]); } catch { unparsed.push(`${rule_key}: malformed json directive: ${line}`); }
      } else if (autoM) {
        auto_apply_source = autoM[1].toLowerCase() === 'true';
      } else {
        textLines.push(raw.replace(/\s+$/, ''));
      }
    }
    const rule_text = textLines.join('\n').trim();
    if (!rule_text) { unparsed.push(`### ${domain}: ${rule_key} (no rule_text found)`); continue; }
    rules.push({ domain, rule_key, rule_text, rule_json, auto_apply_source });
  }
  // Lines before the first heading that are non-blank, non-comment are unparsed content.
  const preHeading = text.split('\n');
  const firstHeadingIdx = preHeading.findIndex((l) => headingRe.test(l));
  const preamble = firstHeadingIdx === -1 ? preHeading : preHeading.slice(0, firstHeadingIdx);
  for (const l of preamble) {
    const t = l.trim();
    if (t && !t.startsWith('#')) unparsed.push(`(preamble) ${t}`);
  }
  return { rules, unparsed };
}

/** Pure: parse a markdown table (header row containing "label_id") into gmail label rows. */
export function parseLabelTable(text) {
  const lines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const headerIdx = lines.findIndex((l) => l.startsWith('|') && /label_id/i.test(l));
  const labels = [];
  const unparsed = [];
  if (headerIdx === -1) {
    for (const l of lines) if (l) unparsed.push(l);
    return { labels, unparsed };
  }
  const headers = lines[headerIdx].split('|').map((s) => s.trim().toLowerCase()).filter(Boolean);
  let i = headerIdx + 1;
  if (lines[i] && /^\|?\s*-+\s*\|/.test(lines[i])) i += 1; // skip the markdown separator row
  for (; i < lines.length; i++) {
    const row = lines[i];
    if (!row.startsWith('|')) { unparsed.push(row); continue; }
    const cells = row.split('|').map((s) => s.trim()).filter((_, idx, arr) => !(idx === 0 && arr[0] === '') && !(idx === arr.length - 1 && arr[arr.length - 1] === ''));
    const rec = {};
    headers.forEach((h, idx) => { rec[h] = cells[idx] !== undefined ? cells[idx] : null; });
    if (!rec.label_id) { unparsed.push(row); continue; }
    labels.push({
      label_id: rec.label_id,
      name: rec.name || rec.label_id,
      class: rec.class || null,
      keep_in_inbox: /^true$/i.test(rec.keep_in_inbox || ''),
      summarize: /^true$/i.test(rec.summarize || ''),
    });
  }
  return { labels, unparsed };
}

/** Pure: parse closures.md into { closures: [{closure_key, topic, keywords, closure_text, scope, expires_at}], unparsed }. */
export function parseClosures(text) {
  const headingRe = /^###\s+closure\s*:\s*(\S.*)$/i;
  const blocks = splitBlocks(text, headingRe);
  const closures = [];
  const unparsed = [];
  for (const block of blocks) {
    const closure_key = block.heading[1].trim();
    let topic = null, scope = null, expires_at = null;
    let keywords = [];
    const textLines = [];
    for (const raw of block.bodyLines) {
      const line = raw.trim();
      if (!line) continue;
      const topicM = /^topic:\s*(.+)$/i.exec(line);
      const kwM = /^keywords:\s*(.+)$/i.exec(line);
      const scopeM = /^scope:\s*(.+)$/i.exec(line);
      const expM = /^expires_at:\s*(.+)$/i.exec(line);
      if (topicM) topic = topicM[1].trim();
      else if (kwM) keywords = kwM[1].split(',').map((s) => s.trim()).filter(Boolean);
      else if (scopeM) scope = scopeM[1].trim();
      else if (expM) expires_at = expM[1].trim();
      else textLines.push(raw.replace(/\s+$/, ''));
    }
    const closure_text = textLines.join('\n').trim();
    if (!topic || !closure_text) { unparsed.push(`### closure: ${closure_key} (missing topic or body text)`); continue; }
    closures.push({ closure_key, topic, keywords, closure_text, scope, expires_at });
  }
  return { closures, unparsed };
}

/** Pure: parse brief-feedback.md into { entries: [{et_date, landed, friction, outcome_vs_jobs, acted}], unparsed }. */
export function parseFeedbackLedger(text) {
  const headingRe = /^###\s+(\d{4}-\d{2}-\d{2})\s*$/;
  const blocks = splitBlocks(text, headingRe);
  const entries = [];
  const unparsed = [];
  for (const block of blocks) {
    const et_date = block.heading[1];
    let landed = null, friction = null, outcome_vs_jobs = null, acted = false;
    let sawDirective = false;
    for (const raw of block.bodyLines) {
      const line = raw.trim();
      if (!line) continue;
      const landedM = /^landed:\s*(.+)$/i.exec(line);
      const frictionM = /^friction:\s*(.+)$/i.exec(line);
      const outcomeM = /^outcome_vs_jobs:\s*(.+)$/i.exec(line);
      const actedM = /^acted:\s*(true|false)\s*$/i.exec(line);
      if (landedM) { landed = landedM[1].trim(); sawDirective = true; }
      else if (frictionM) { friction = frictionM[1].trim(); sawDirective = true; }
      else if (outcomeM) { outcome_vs_jobs = outcomeM[1].trim(); sawDirective = true; }
      else if (actedM) { acted = actedM[1].toLowerCase() === 'true'; sawDirective = true; }
      else unparsed.push(`${et_date}: unrecognized line: ${line}`);
    }
    if (!sawDirective) { unparsed.push(`### ${et_date} (no recognized directive lines)`); continue; }
    entries.push({ et_date, landed, friction, outcome_vs_jobs, acted });
  }
  return { entries, unparsed };
}
