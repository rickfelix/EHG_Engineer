// lib/michael/cowork-parse.mjs — pure markdown parsers for the Cowork Dropbox import.
// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-F (FR-2, FR-4, TR-4).
// REWRITTEN by SD-LEO-FIX-COWORK-IMPORTER-CANNOT-001: the format below was originally invented
// (no real Cowork file existed anywhere in this repo or its git history at the time), and a
// first contact with the real Dropbox _Cowork corpus (2026-09-07) proved every assumption wrong
// -- these parsers now match what the corpus's own "## Format"/"## Entry format" sections
// document, verified line-for-line against the real files rather than reverse-engineered from a
// sample.
//
// Rule files: gmail.md is the ONLY rule file with a genuine heading-per-rule structure -- one
// "## Triage rules" parent section, "### <human label> (parenthetical)" children. Domain is fixed
// per file (not derived from the heading text, which carries no domain marker at all), rule_key is
// a slug of the heading text. todoist.md/body-section.md/morning-brief-distillation.md/CLAUDE.md
// do NOT share this structure -- their real content is embedded in prose bullets/sub-bullets
// nested inside topic sections (confirmed: the hand-encoded rule ca0c2329 traces to a sub-bullet
// three levels deep inside todoist.md, and CLAUDE.md's own "## Quick facts" section has zero "###"
// children at all). Extracting THEIR rules needs a different, likely LLM-assisted mechanism and is
// an explicit follow-up, not this file's job -- passing no sectionHeadingRe for those files reports
// their content as unparsed, honestly, rather than inventing a convention the corpus doesn't use.
//
// Closures: heading "### YYYY-MM-DD — <topic>" (topic lives in the heading, no separate topic:
// line), body fields as bold markdown list items: "- **Keywords:**", "- **Closure:**",
// "- **Expires:**", "- **Scope:**".
// Feedback ledger: heading "### YYYY-MM-DD (Day)", body fields "- **Landed:**", "- **Friction:**",
// "- **Dispositions (proposed -> chosen):**", "- **Outcome vs 3 jobs:**", "- **Acted:**" (free
// text, e.g. a list of files changed, or an em-dash for "nothing" -- never a boolean).
// Doctrine: personal-half sections only, per the chairman's 2026-09-07 ruling (B/C/E-in, A-out,
// D1-out/D2-in) -- see parseDoctrine's own doc comment for why these are PROPOSED principles, not
// directly-writable rules.

export const RULE_DOMAINS = Object.freeze(['gmail', 'todoist', 'calendar', 'tasks', 'body', 'brief', 'capture', 'youtube']);

/** Deterministic, human-legible slug: lowercase, non-alphanumerics collapsed to single hyphens. */
export function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

function isL2Heading(line) {
  return /^##(?!#)\s+/.test(line);
}

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

/**
 * Bound text to the body of the "## " section whose heading line matches sectionHeadingRe --
 * from just after that heading to just before the next level-2 "## " heading (or EOF).
 * Returns null if no line matches sectionHeadingRe at level 2.
 */
export function extractSection(text, sectionHeadingRe) {
  const lines = String(text || '').split('\n');
  let start = -1;
  let end = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (start === -1 && isL2Heading(lines[i]) && sectionHeadingRe.test(lines[i])) { start = i + 1; continue; }
    if (start !== -1 && isL2Heading(lines[i])) { end = i; break; }
  }
  if (start === -1) return null;
  return lines.slice(start, end).join('\n');
}

/**
 * Pure: parse a rule file into { rules: [{domain, rule_key, rule_text, rule_json,
 * auto_apply_source}], unparsed: [line,...] }.
 *
 * @param {string} text
 * @param {{domain?: string, sectionHeadingRe?: RegExp}} opts - when either is omitted, this file
 *   has no known heading-per-rule convention (confirmed live for every rule file except gmail.md)
 *   -- the whole text is reported as unparsed rather than guessing a structure the corpus doesn't
 *   use.
 */
export function parseRuleFile(text, { domain, sectionHeadingRe } = {}) {
  if (!domain || !sectionHeadingRe) {
    const unparsed = String(text || '').split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
    return { rules: [], unparsed };
  }
  if (!RULE_DOMAINS.includes(domain)) {
    return { rules: [], unparsed: [`unrecognized domain "${domain}" passed to parseRuleFile`] };
  }
  const section = extractSection(text, sectionHeadingRe);
  if (section === null) {
    return { rules: [], unparsed: [`section not found: ${sectionHeadingRe}`] };
  }
  const headingRe = /^###\s+(\S.*)$/;
  const blocks = splitBlocks(section, headingRe);
  const rules = [];
  const unparsed = [];
  for (const block of blocks) {
    const headingText = block.heading[1].trim();
    const rule_key = slugify(headingText);
    if (!rule_key) { unparsed.push(`### ${headingText} (empty slug)`); continue; }
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
    if (!rule_text) { unparsed.push(`### ${headingText} (no rule_text found)`); continue; }
    rules.push({ domain, rule_key, rule_text, rule_json, auto_apply_source });
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
  const headingRe = /^###\s+(\d{4}-\d{2}-\d{2})\s*[—-]\s*(\S.*)$/;
  const blocks = splitBlocks(text, headingRe);
  const closures = [];
  const unparsed = [];
  for (const block of blocks) {
    const date = block.heading[1];
    const topic = block.heading[2].trim();
    const closure_key = `${date}-${slugify(topic)}`;
    let closure_text = null;
    let scope = null;
    let expires_at = null;
    let keywords = [];
    const textLines = [];
    for (const raw of block.bodyLines) {
      const line = raw.trim();
      if (!line) continue;
      const kwM = /^-\s*\*\*Keywords:\*\*\s*(.+)$/i.exec(line);
      const closM = /^-\s*\*\*Closure:\*\*\s*(.+)$/i.exec(line);
      const expM = /^-\s*\*\*Expires:\*\*\s*(.+)$/i.exec(line);
      const scopeM = /^-\s*\*\*Scope:\*\*\s*(.+)$/i.exec(line);
      if (kwM) keywords = kwM[1].split(',').map((s) => s.trim()).filter(Boolean);
      else if (closM) closure_text = closM[1].trim();
      else if (expM) {
        const val = expM[1].trim();
        if (/^permanent\b/i.test(val)) expires_at = null;
        else {
          const dateM = /^(\d{4}-\d{2}-\d{2})/.exec(val);
          expires_at = dateM ? dateM[1] : null;
        }
      } else if (scopeM) scope = scopeM[1].trim();
      else textLines.push(raw.replace(/\s+$/, ''));
    }
    if (!closure_text) { unparsed.push(`### ${date} — ${topic} (missing **Closure:** field)`); continue; }
    closures.push({ closure_key, topic, keywords, closure_text, scope, expires_at });
  }
  return { closures, unparsed };
}

/** Pure: parse brief-feedback.md into { entries: [{et_date, landed, friction, outcome_vs_jobs, acted, dispositions}], unparsed }. */
export function parseFeedbackLedger(text) {
  const headingRe = /^###\s+(\d{4}-\d{2}-\d{2})\s*\([^)]*\)\s*$/;
  const blocks = splitBlocks(text, headingRe);
  const entries = [];
  const unparsed = [];
  for (const block of blocks) {
    const et_date = block.heading[1];
    let landed = null;
    let friction = null;
    let outcome_vs_jobs = null;
    let actedText = null;
    let dispositionsText = null;
    let sawDirective = false;
    for (const raw of block.bodyLines) {
      const line = raw.trim();
      if (!line) continue;
      const landedM = /^-\s*\*\*Landed:\*\*\s*(.+)$/i.exec(line);
      const frictionM = /^-\s*\*\*Friction:\*\*\s*(.+)$/i.exec(line);
      const dispM = /^-\s*\*\*Dispositions[^*]*:\*\*\s*(.+)$/i.exec(line);
      const outcomeM = /^-\s*\*\*Outcome vs 3 jobs:\*\*\s*(.+)$/i.exec(line);
      const actedM = /^-\s*\*\*Acted:\*\*\s*(.+)$/i.exec(line);
      if (landedM) { landed = landedM[1].trim(); sawDirective = true; }
      else if (frictionM) { friction = frictionM[1].trim(); sawDirective = true; }
      else if (dispM) { dispositionsText = dispM[1].trim(); sawDirective = true; }
      else if (outcomeM) { outcome_vs_jobs = outcomeM[1].trim(); sawDirective = true; }
      else if (actedM) { actedText = actedM[1].trim(); sawDirective = true; }
      else unparsed.push(`${et_date}: unrecognized line: ${line}`);
    }
    if (!sawDirective) { unparsed.push(`### ${et_date} (no recognized directive lines)`); continue; }
    const acted = actedText !== null && !/^(—|-|none|no|n\/a)$/i.test(actedText);
    const dispositions = dispositionsText ? [{ note: dispositionsText }] : null;
    entries.push({ et_date, landed, friction, outcome_vs_jobs, acted, dispositions });
  }
  return { entries, unparsed };
}

// The chairman's 2026-09-07 ruling (relayed by Michael, made actionable by Adam) scopes
// doctrine.md's import to exactly these personal-half sections. "## Architecture & system
// preferences" (A-block) is excluded; "## Strategic instincts" is handled separately below since
// it splits at the individual-heading level (D1 out, D2 in), not the section level.
const DOCTRINE_SECTIONS = Object.freeze([
  /^##\s+Operating principles/i,
  /^##\s+Distinctions Rick draws/i,
  /^##\s+Behavioral loops Cowork has noticed/i,
]);

/**
 * Pure: parse doctrine.md's personal-half sections into { principles: [{key, heading, body_text}],
 * unparsed }.
 *
 * These are PROPOSED principles, not directly-writable michael_rules rows: RULE_DOMAINS (the
 * michael_rules CHECK constraint) has no cross-cutting/personal bucket, and doctrine principles
 * don't map 1:1 onto gmail/todoist/calendar/tasks/body/brief/capture/youtube (e.g. "Foundation
 * first when systems fail silently" isn't about any one of those domains). Assigning a domain per
 * principle is a real editorial judgment call (see the hand-encoded rebaseline-not-micro-rescues
 * rule, filed under domain=todoist despite coming from doctrine.md) that this parser does not
 * attempt to automate. The import script surfaces these in its dry-run preview but does not write
 * them until a chairman ruling assigns real domains (or a schema change adds one).
 */
export function parseDoctrine(text) {
  const headingRe = /^###\s+(\S.*)$/;
  const principles = [];
  const unparsed = [];

  for (const sectionHeadingRe of DOCTRINE_SECTIONS) {
    const section = extractSection(text, sectionHeadingRe);
    if (section === null) { unparsed.push(`section not found: ${sectionHeadingRe}`); continue; }
    for (const block of splitBlocks(section, headingRe)) {
      const heading = block.heading[1].trim();
      const key = slugify(heading);
      const body_text = block.bodyLines.map((l) => l.replace(/\s+$/, '')).join('\n').trim();
      if (!key || !body_text) { unparsed.push(`### ${heading} (empty)`); continue; }
      principles.push({ key, heading, body_text });
    }
  }

  const strategic = extractSection(text, /^##\s+Strategic instincts/i);
  if (strategic === null) {
    unparsed.push('section not found: Strategic instincts');
  } else {
    for (const block of splitBlocks(strategic, headingRe)) {
      const heading = block.heading[1].trim();
      if (!/\(D2\)/.test(heading)) continue; // D1 (and anything else here) excluded per the chairman ruling
      const key = slugify(heading);
      const body_text = block.bodyLines.map((l) => l.replace(/\s+$/, '')).join('\n').trim();
      if (key && body_text) principles.push({ key, heading, body_text });
      else unparsed.push(`### ${heading} (empty)`);
    }
  }

  return { principles, unparsed };
}
