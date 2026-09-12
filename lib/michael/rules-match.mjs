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

// QF-20260908-964: a plain substring needle claims any haystack that CONTAINS it, so a longer
// address (digital-no-reply@amazon.com) was silently captured by a shorter needle
// (no-reply@amazon.com) meant for a different address. A needle prefixed with `=` opts into
// WHOLE-ADDRESS matching instead: the haystack is reduced to its address (the <...> payload of a
// "Display Name <addr>" header, or the whole trimmed string when there is no bracket) and compared
// for exact equality. Plain (unprefixed) needles are entirely unaffected — this is additive, never
// a behavior change for any existing rule.
function extractAddress(haystack) {
  const m = /<([^<>]+)>/.exec(haystack);
  return (m ? m[1] : haystack).trim();
}

/** Pure: does `haystack` contain any of `needles` (case-insensitive substring, or `=`-anchored whole-address)? Empty needles = no predicate. */
function anySubstring(needles, haystack) {
  if (!needles.length || typeof haystack !== 'string') return false;
  const h = lower(haystack);
  const address = lower(extractAddress(haystack));
  return needles.some((n) => {
    if (n.startsWith('=')) return address === lower(n.slice(1));
    return h.includes(lower(n));
  });
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

/**
 * Pure: read the predicate lists a match object declares. A key that is PRESENT but empties out after
 * filtering (e.g. from: ' ' or from: [null]) is a corrupted predicate: the rule must fail CLOSED, never
 * widen to its remaining predicates (adversarial review of PR 8365, round 2). Returns null then.
 */
function predicateLists(m, keys) {
  if (!m || typeof m !== 'object') return null;
  const out = {};
  for (const k of keys) {
    if (m[k] === undefined) continue;
    const list = asList(m[k]);
    if (!list.length) return null;
    out[k] = list;
  }
  return Object.keys(out).length ? out : null;
}

function ruleParts(rule) {
  if (!rule || typeof rule !== 'object') return null;
  const json = Object.prototype.hasOwnProperty.call(rule, 'rule_json') ? rule.rule_json : rule;
  if (!json || typeof json !== 'object') return null;
  return { json, rule_key: rule.rule_key ?? json.rule_key ?? null };
}

/**
 * Pure, stable sort: QF-20260908-964 — firstMatch's precedence was previously a write-time
 * accident of created_at order alone (rule-encode supersedes by INSERTING a new row, so every
 * rewrite silently moved a rule to the end of the order). A rule may now declare
 * rule_json.priority (a number; lower sorts first). Rules without a declared priority (the
 * default, current behavior for every existing rule) sort AFTER any prioritized rule and keep
 * their RELATIVE order among themselves unchanged (a stable sort over the array as given —
 * created_at ascending, as every caller already provides it). Declaring priority on only one of
 * two colliding rules is enough to fix that pair without touching any other rule's position.
 */
export function sortByPriority(rules) {
  if (!Array.isArray(rules)) return rules;
  return rules
    .map((rule, index) => ({ rule, index, priority: ruleParts(rule)?.json?.priority }))
    .sort((a, b) => {
      const pa = typeof a.priority === 'number' ? a.priority : Infinity;
      const pb = typeof b.priority === 'number' ? b.priority : Infinity;
      if (pa !== pb) return pa - pb;
      return a.index - b.index;
    })
    .map((entry) => entry.rule);
}

/**
 * Pure: does a gmail rule match a thread { from, subject, listId, labelIds }? All given predicates
 * must hold (from/subject/list_id substring, label = a labelIds member). Returns
 * { matched:true, rule_key, class, action } or null.
 */
export function matchGmailRule(rule, thread) {
  const p = ruleParts(rule);
  if (!p || !thread || typeof thread !== 'object') return null;
  const q = predicateLists(p.json.match, ['from', 'subject', 'list_id', 'label']);
  if (!q) return null;
  const preds = [];
  if (q.from) preds.push(() => anySubstring(q.from, thread.from));
  if (q.subject) preds.push(() => anySubstring(q.subject, thread.subject));
  if (q.list_id) preds.push(() => anySubstring(q.list_id, thread.listId));
  if (q.label) {
    const have = new Set(asList(thread.labelIds).map(lower));
    preds.push(() => q.label.some((l) => have.has(lower(l))));
  }
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
    const q = predicateLists(p.json.match, ['project', 'label', 'keyword']);
    if (!q) continue;
    const preds = [];
    if (q.project) preds.push(() => anySubstring(q.project, task.project_name));
    if (q.label) {
      const have = new Set(asList(task.labels).map(lower));
      preds.push(() => q.label.some((l) => have.has(lower(l))));
    }
    if (q.keyword) preds.push(() => matchKeyword(q.keyword, task.content) !== null);
    if (!preds.every((f) => f())) continue;
    return { matched: true, rule_key: p.rule_key, role_tag: String(p.json.role_tag) };
  }
  return null;
}
