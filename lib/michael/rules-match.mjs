// lib/michael/rules-match.mjs — pure matchers over michael_rules.rule_json for the three lanes that
// route by rule before the seat sees anything. SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D (FR-1).
//
// The matchers read ONLY rule_json (JSONB, nullable) and never a client; a rule whose rule_json is
// null, or whose predicate set is empty, matches NOTHING (a null predicate set must never be vacuously
// true — DATABASE 8b2ee61d §6). Every comparison is case-insensitive; string predicates are
// substring matches, keyword predicates are whole-word matches; a predicate given as an array is
// any-of, and the predicates of one rule are all-of.
//
// rule_json vocabulary (child F's Cowork import and scripts/michael/rule-encode.mjs write it):
//   gmail   { match: { from?, subject?, list_id?, label? }, class?: 'newsletter'|'fleet'|..., action?: { verb, label_id? } }
//   tasks   { buckets: { <bucket>: [keyword, ...], ... } }          (declared order is priority order)
//   todoist { role_tag: 'ehg'|'exelon'|..., match: { project?, label?, keyword? } }
// Anything else in rule_json is ignored here. Results carry rule_key so the caller can stamp the row.

// Only non-empty strings are predicates: a stray space or a null in a Cowork-imported rule must never
// become a match-everything needle (adversarial review of PR 8365).
const asList = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]).filter((x) => typeof x === 'string').map((x) => x.trim()).filter((x) => x.length > 0);
const lower = (v) => String(v ?? '').toLowerCase();
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Pure: does `haystack` contain any of `needles` (case-insensitive substring)? Empty needles = no predicate. */
function anySubstring(needles, haystack) {
  if (!needles.length || typeof haystack !== 'string') return false;
  const h = lower(haystack);
  return needles.some((n) => h.includes(lower(n)));
}

/** Pure: does `text` contain any of `keywords` as a whole word (case-insensitive)? Returns the keyword or null. */
export function matchKeyword(keywords, text) {
  const t = lower(text);
  for (const k of asList(keywords)) {
    const kw = lower(k).trim();
    if (!kw) continue;
    if (new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(kw)}([^\\p{L}\\p{N}]|$)`, 'iu').test(t)) return k;
  }
  return null;
}

function ruleParts(rule) {
  if (!rule || typeof rule !== 'object') return null;
  const json = Object.prototype.hasOwnProperty.call(rule, 'rule_json') ? rule.rule_json : rule;
  if (!json || typeof json !== 'object') return null;
  return { json, rule_key: rule.rule_key ?? json.rule_key ?? null };
}

/**
 * Pure: does a gmail rule match a thread { from, subject, listId, labelIds }? All given predicates
 * must hold (from/subject/list_id substring, label = a labelIds member). Returns
 * { matched:true, rule_key, class, action } or null.
 */
export function matchGmailRule(rule, thread) {
  const p = ruleParts(rule);
  if (!p || !thread || typeof thread !== 'object') return null;
  const m = p.json.match;
  if (!m || typeof m !== 'object') return null;
  const preds = [];
  const from = asList(m.from), subject = asList(m.subject), listId = asList(m.list_id), label = asList(m.label);
  if (from.length) preds.push(() => anySubstring(from, thread.from));
  if (subject.length) preds.push(() => anySubstring(subject, thread.subject));
  if (listId.length) preds.push(() => anySubstring(listId, thread.listId));
  if (label.length) {
    const have = new Set(asList(thread.labelIds).map(lower));
    preds.push(() => label.some((l) => have.has(lower(l))));
  }
  if (!preds.length) return null;
  if (!preds.every((f) => f())) return null;
  return { matched: true, rule_key: p.rule_key, class: p.json.class ?? null, action: p.json.action ?? null };
}

/**
 * Pure: route free text into the first bucket (declared order) whose keyword list matches a whole
 * word. Returns { matched:true, rule_key, bucket, keyword } or null.
 */
export function matchKeywordBuckets(rule, text) {
  const p = ruleParts(rule);
  if (!p || typeof text !== 'string') return null;
  const buckets = p.json.buckets;
  if (!buckets || typeof buckets !== 'object' || Array.isArray(buckets)) return null;
  for (const [bucket, keywords] of Object.entries(buckets)) {
    const hit = matchKeyword(keywords, text);
    if (hit !== null) return { matched: true, rule_key: p.rule_key, bucket, keyword: hit };
  }
  return null;
}

/**
 * Pure: the role tag for a Todoist task { project_name, labels, content } from the first todoist rule
 * (row order) whose match predicates all hold. Returns { matched:true, rule_key, role_tag } or null.
 */
export function roleTagFor(rules, task) {
  if (!Array.isArray(rules) || !task || typeof task !== 'object') return null;
  for (const rule of rules) {
    const p = ruleParts(rule);
    if (!p || !p.json.role_tag) continue;
    const m = p.json.match;
    if (!m || typeof m !== 'object') continue;
    const preds = [];
    const project = asList(m.project), label = asList(m.label), keyword = asList(m.keyword);
    if (project.length) preds.push(() => anySubstring(project, task.project_name));
    if (label.length) {
      const have = new Set(asList(task.labels).map(lower));
      preds.push(() => label.some((l) => have.has(lower(l))));
    }
    if (keyword.length) preds.push(() => matchKeyword(keyword, task.content) !== null);
    if (!preds.length || !preds.every((f) => f())) continue;
    return { matched: true, rule_key: p.rule_key, role_tag: String(p.json.role_tag) };
  }
  return null;
}
