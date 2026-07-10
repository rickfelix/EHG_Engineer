// SD-LEO-INFRA-HARNESS-BACKLOG-DRAIN-POLICY-001 / FR-4
//
// Shared fingerprint + occurrence-grouping primitives, extracted from
// lib/coordinator/signal-router.cjs so fingerprinting is implemented once instead of
// per-caller (signal-router.cjs's own worker-signal aggregation, and the new
// harness_backlog fingerprint promoter both need "hash(type::normalized-body)" +
// "bucket by fingerprint, count distinct contributors, track severity/first/last-seen").
//
// TR-2: signal-router.cjs's own use of normalize/fingerprint/severityRank is a
// byte-for-byte copy of what lived inline here before extraction — behavior-preserving
// refactor only. signal-router.cjs's groupByFingerprint()/shouldPromote() keep their own
// field names (`.callsigns`) as a thin wrapper around groupByFingerprint() below.

const crypto = require('crypto');

const SEVERITY_RANK = { low: 0, medium: 1, high: 2, critical: 3 };

// Security M3: normalize() must NFKC + lowercase + strip control chars + strip
// zero-width unicode + collapse whitespace + trim punctuation + truncate 200c.
// Without this, an attacker can defeat aggregation via synthetic-variant bodies.
function normalize(body) {
  if (typeof body !== 'string') return '';
  let s = body.normalize('NFKC').toLowerCase();
  // strip ASCII control + DEL
  s = s.replace(/[\x00-\x1F\x7F]/g, ' ');
  // strip zero-width + format characters
  s = s.replace(/[​-‏﻿]/g, '');
  // collapse all whitespace runs to single space
  s = s.replace(/\s+/g, ' ');
  // strip leading/trailing punctuation + whitespace
  s = s.replace(/^[\s\W]+|[\s\W]+$/g, '');
  return s.slice(0, 200);
}

function fingerprint(type, body) {
  return crypto
    .createHash('sha256')
    .update(`${type}::${normalize(body)}`)
    .digest('hex');
}

function severityRank(level) {
  return SEVERITY_RANK[level] ?? 1;
}

/**
 * Generic occurrence grouping: buckets `rows` by fingerprint(type, body), where
 * `extract(row)` pulls `{ type, body, groupKey, severity, timestamp }` out of the
 * caller's own row shape. groupKey is whatever distinguishes one occurrence from
 * another for threshold purposes (e.g. a callsign, or a feedback row id) — accumulated
 * into `group.groupKeys` (a Set), so `group.groupKeys.size` is the distinct-occurrence
 * count a caller thresholds against.
 *
 * @param {Array<Object>} rows
 * @param {(row: Object) => { type: string, body: string, groupKey?: string, severity?: string, timestamp: string }} extract
 * @returns {Map<string, Object>} fingerprint -> group
 */
function groupByFingerprint(rows, extract) {
  const groups = new Map();
  for (const r of rows) {
    const { type, body, groupKey, severity, timestamp } = extract(r);
    const fp = fingerprint(type, body);
    if (!groups.has(fp)) {
      groups.set(fp, {
        fingerprint: fp,
        type,
        rows: [],
        groupKeys: new Set(),
        max_severity: 'low',
        first_seen: timestamp,
        last_seen: timestamp,
        sample_body: body
      });
    }
    const g = groups.get(fp);
    g.rows.push(r);
    if (groupKey) g.groupKeys.add(groupKey);
    g.last_seen = timestamp > g.last_seen ? timestamp : g.last_seen;
    g.first_seen = timestamp < g.first_seen ? timestamp : g.first_seen;
    g.max_severity = severityRank(severity) > severityRank(g.max_severity)
      ? (severity || 'medium')
      : g.max_severity;
  }
  return groups;
}

/**
 * A group is promotable when it carries a single critical-severity occurrence
 * (bypasses the count threshold) OR has reached `threshold` distinct groupKeys.
 */
function shouldPromote(group, threshold) {
  if (severityRank(group.max_severity) >= severityRank('critical')) return true;
  return group.groupKeys.size >= threshold;
}

module.exports = {
  normalize,
  fingerprint,
  severityRank,
  groupByFingerprint,
  shouldPromote
};
