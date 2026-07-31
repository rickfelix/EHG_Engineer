/**
 * migration-object-parser — extract declared FUNCTION / TRIGGER / VIEW / INDEX
 * names from a PostgreSQL migration SQL string.
 *
 * MVP scope (PRD FR-5): FUNCTION, TRIGGER, VIEW, INDEX only. Dollar-quote-aware
 * (skips bodies between $$ / $tag$ / $function$ etc.). Returns one entry per
 * declared object — caller (migration-verification.js) uses these to capture
 * pg_get_functiondef / pg_get_triggerdef / pg_views.definition / pg_indexes.indexdef
 * before+after the apply.
 *
 * SD: SD-LEO-INFRA-CANONICAL-SCRIPTS-APPLY-001
 */

const DEFAULT_SCHEMA = 'public';

function stripDollarQuotedBodies(sql) {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const tagStart = sql.indexOf('$', i);
    if (tagStart === -1) {
      out += sql.slice(i);
      break;
    }
    out += sql.slice(i, tagStart);
    const tagEnd = sql.indexOf('$', tagStart + 1);
    if (tagEnd === -1) {
      out += sql.slice(tagStart);
      break;
    }
    const tag = sql.slice(tagStart, tagEnd + 1);
    if (!/^\$[A-Za-z_][A-Za-z0-9_]*\$$|^\$\$$/.test(tag)) {
      out += sql.slice(tagStart, tagEnd);
      i = tagEnd;
      continue;
    }
    const close = sql.indexOf(tag, tagEnd + 1);
    if (close === -1) {
      out += tag;
      break;
    }
    out += ' ';
    i = close + tag.length;
  }
  return out;
}

function stripLineAndBlockComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ');
}

function parseQualifiedName(raw) {
  const trimmed = raw.replace(/"/g, '').trim();
  const parts = trimmed.split('.');
  if (parts.length >= 2) return { schema: parts[0], name: parts.slice(1).join('.') };
  return { schema: DEFAULT_SCHEMA, name: trimmed };
}

/**
 * SD-FDBK-INFRA-LIVE-PROBE-DDL-001 FR-5a — the key now includes `table` when the object has one.
 *
 * WHY THIS CHANGED, because it is a behaviour change and not a rename: POLICY, CONSTRAINT,
 * TRIGGER and INDEX names are unique per TABLE, not per schema. Keying on kind::schema::name
 * silently COLLAPSED two genuinely different objects into one and dropped the second — and for
 * policies that is the common case, not an edge case (a schema where many tables each carry a
 * policy named "select_own" declared exactly one). A dropped declared object is a silent miss,
 * which is the failure class this SD exists to end; it would have meant probing one table and
 * reporting the other as verified.
 *
 * The change only makes dedupe LESS aggressive — objects that differ solely by table are now
 * both retained. FUNCTION and VIEW carry no table and are unaffected.
 */
function uniqByKindSchemaName(objs) {
  const seen = new Set();
  const out = [];
  for (const o of objs) {
    const k = o.table
      ? `${o.kind}::${o.schema}::${o.table}::${o.name}`
      : `${o.kind}::${o.schema}::${o.name}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(o);
  }
  return out;
}

export function parseDeclaredObjects(sql) {
  if (typeof sql !== 'string' || sql.length === 0) return [];
  const cleaned = stripLineAndBlockComments(stripDollarQuotedBodies(sql));
  const objs = [];

  const funcRe = /\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+("?[\w]+"?(?:\.[\w"]+)?)\s*\(/gi;
  let m;
  while ((m = funcRe.exec(cleaned)) !== null) {
    objs.push({ kind: 'FUNCTION', ...parseQualifiedName(m[1]) });
  }

  const trigRe = /\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:CONSTRAINT\s+)?TRIGGER\s+("?[\w]+"?)\b[\s\S]*?\bON\s+("?[\w]+"?(?:\.[\w"]+)?)/gi;
  while ((m = trigRe.exec(cleaned)) !== null) {
    const trig = parseQualifiedName(m[1]);
    const table = parseQualifiedName(m[2]);
    objs.push({ kind: 'TRIGGER', schema: table.schema, name: trig.name, table: table.name });
  }

  const viewRe = /\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?("?[\w]+"?(?:\.[\w"]+)?)/gi;
  while ((m = viewRe.exec(cleaned)) !== null) {
    objs.push({ kind: 'VIEW', ...parseQualifiedName(m[1]) });
  }

  const idxRe = /\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?("?[\w]+"?)\s+ON\s+(?:ONLY\s+)?("?[\w]+"?(?:\.[\w"]+)?)/gi;
  while ((m = idxRe.exec(cleaned)) !== null) {
    const idx = parseQualifiedName(m[1]);
    const table = parseQualifiedName(m[2]);
    objs.push({ kind: 'INDEX', schema: table.schema, name: idx.name, table: table.name });
  }

  // SD-FDBK-INFRA-LIVE-PROBE-DDL-001 FR-5a: POLICY and CONSTRAINT. Without these the live
  // probes added in FR-2/FR-3 have nothing to probe — a migration that changes access-control
  // DDL declares ZERO objects today, so the sweep cannot even know an object was touched.
  const policyRe = /\b(?:CREATE|ALTER)\s+POLICY\s+("?[\w]+"?)\s+ON\s+(?:TABLE\s+)?("?[\w]+"?(?:\.[\w"]+)?)/gi;
  while ((m = policyRe.exec(cleaned)) !== null) {
    const pol = parseQualifiedName(m[1]);
    const table = parseQualifiedName(m[2]);
    objs.push({ kind: 'POLICY', schema: table.schema, name: pol.name, table: table.name });
  }

  const conRe = /\bALTER\s+TABLE\s+(?:(?:IF\s+EXISTS|ONLY)\s+)*("?[\w]+"?(?:\.[\w"]+)?)[\s\S]*?\bADD\s+CONSTRAINT\s+("?[\w]+"?)/gi;
  while ((m = conRe.exec(cleaned)) !== null) {
    const table = parseQualifiedName(m[1]);
    const con = parseQualifiedName(m[2]);
    objs.push({ kind: 'CONSTRAINT', schema: table.schema, name: con.name, table: table.name });
  }

  return uniqByKindSchemaName(objs);
}

const DESTRUCTIVE_KEYWORDS = ['DROP TABLE', 'DROP SCHEMA', 'TRUNCATE', 'DROP DATABASE', 'DROP COLUMN'];

export function detectDestructiveDDL(sql) {
  if (typeof sql !== 'string' || sql.length === 0) return [];
  const cleaned = stripLineAndBlockComments(stripDollarQuotedBodies(sql));
  const upper = cleaned.toUpperCase();
  const hits = [];
  for (const kw of DESTRUCTIVE_KEYWORDS) {
    const re = new RegExp(`\\b${kw.replace(' ', '\\s+')}\\b(?!\\s+IF\\s+EXISTS)`, 'i');
    if (re.test(upper)) hits.push(kw);
  }
  return hits;
}
