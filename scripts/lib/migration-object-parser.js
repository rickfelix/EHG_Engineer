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

function uniqByKindSchemaName(objs) {
  const seen = new Set();
  const out = [];
  for (const o of objs) {
    const k = `${o.kind}::${o.schema}::${o.name}`;
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
