#!/usr/bin/env node
/**
 * validate-command-schema-sync.mjs
 * PA-1: Detects drift between embedded SQL templates in .claude/commands/*.md
 * and live DB schema (column types, CHECK constraints, enum values).
 */
import 'dotenv/config';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const JSONB_COLUMNS = new Set(['metadata', 'content', 'progress', 'key_changes', 'key_principles', 'success_criteria', 'success_metrics', 'delivers_capabilities']);
const SUPABASE_METHODS = new Set(['onConflict', 'select', 'single', 'eq', 'is', 'order', 'limit', 'gte', 'lte', 'then', 'catch']);

// ── Step 1: Parse command files for embedded DB operations ──────────────
function extractDbOperations(dir) {
  const ops = [];
  const files = readdirSync(dir).filter(f => f.endsWith('.md'));
  for (const file of files) {
    const content = readFileSync(join(dir, file), 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      // Supabase JS: .from('table').insert({ or .update({ or .upsert({
      const fromMatch = lines[i].match(/\.from\(['"](\w+)['"]\)/);
      if (fromMatch) {
        const table = fromMatch[1];
        for (let j = i; j < Math.min(i + 5, lines.length); j++) {
          const opMatch = lines[j].match(/\.(insert|update|upsert)\(\{/);
          if (opMatch) {
            let body = '';
            let depth = 0;
            for (let k = j; k < Math.min(j + 40, lines.length); k++) {
              body += lines[k] + '\n';
              depth += (lines[k].match(/\{/g) || []).length - (lines[k].match(/\}/g) || []).length;
              if (depth <= 0) break;
            }
            const entries = extractTopLevelKeyValues(body);
            if (entries.length > 0) {
              ops.push({ file, line: j + 1, table, operation: opMatch[1], entries });
            }
            break;
          }
        }
      }
      // Raw SQL: INSERT INTO table (cols) VALUES (vals)
      const sqlMatch = lines[i].match(/INSERT\s+INTO\s+(\w+)\s*\(/i);
      if (sqlMatch) {
        const table = sqlMatch[1];
        let body = '';
        for (let k = i; k < Math.min(i + 10, lines.length); k++) {
          body += lines[k] + '\n';
          if (lines[k].includes(';')) break;
        }
        const colMatch = body.match(/INSERT\s+INTO\s+\w+\s*\(([^)]+)\)/i);
        if (colMatch) {
          const cols = colMatch[1].split(',').map(c => c.trim());
          ops.push({ file, line: i + 1, table, operation: 'INSERT', entries: cols.map(c => ({ key: c })) });
        }
      }
    }
  }
  return ops;
}

/** Extract only top-level key:value pairs, skipping nested objects */
function extractTopLevelKeyValues(body) {
  const entries = [];
  const lines = body.split('\n');
  let depth = 0;
  let inOp = false;
  for (const line of lines) {
    if (!inOp && line.match(/\.(insert|update|upsert)\(\{/)) {
      inOp = true;
      // Handle single-line ops: .update({ status: 'closed', ... })
      // Only extract top-level keys (stop at nested { )
      const afterBrace = line.split(/\.(insert|update|upsert)\(\{/)[2] || '';
      const singleLineKVs = afterBrace.matchAll(/(\w+)\s*:\s*(?:'([^']*)'|"([^"]*)")/g);
      for (const m of singleLineKVs) {
        const key = m[1];
        // Skip if this key's value is a nested object (key: { ... })
        const prefix = afterBrace.slice(0, m.index);
        const nestedBraces = (prefix.match(/\{/g) || []).length - (prefix.match(/\}/g) || []).length;
        if (nestedBraces > 0) continue;
        if (!JSONB_COLUMNS.has(key) && !SUPABASE_METHODS.has(key)) {
          entries.push({ key, strVal: m[2] ?? m[3] ?? null, rangeHint: null });
        }
      }
      depth = 1;
      // Check if single-line (closes on same line)
      const opens = (line.match(/\{/g) || []).length;
      const closes = (line.match(/\}/g) || []).length;
      depth = opens - closes;
      if (depth <= 0) break;
      continue;
    }
    if (!inOp) continue;

    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;

    if (depth === 1) {
      const m = line.match(/^\s*(\w+)\s*:\s*(?:'([^']*)'|"([^"]*)"|<([^>]+)>)/);
      if (m) {
        const key = m[1];
        if (!JSONB_COLUMNS.has(key) && !SUPABASE_METHODS.has(key)) {
          entries.push({ key, strVal: m[2] ?? m[3] ?? null, rangeHint: m[4] ?? null });
        }
      }
    }
    depth += opens - closes;
    if (depth <= 0) break;
  }
  return entries;
}

// ── Step 2: Validate operations against schema ──────────────────────────
function validate(ops, schema) {
  const findings = [];
  const colMap = {};
  for (const c of schema.cols) colMap[`${c.table_name}.${c.column_name}`] = c;

  const enumMap = {};
  const rangeMap = {};
  for (const chk of schema.checks) {
    const enumMatch = chk.def.match(/\(?\((\w+)\)?(?:::text)?.*?ANY.*?ARRAY\[([^\]]+)\]/);
    if (enumMatch) {
      const col = enumMatch[1].replace(/^\(+/, '');
      const vals = [...enumMatch[2].matchAll(/'([^']+)'/g)].map(m => m[1]);
      if (vals.length > 0) enumMap[`${chk.table_name}.${col}`] = new Set(vals);
    }
    const rangeMatch = chk.def.match(/\((\w+)\s*>=\s*\(?(\d+(?:\.\d+)?)\)?\)\s*AND\s*\(\1\s*<=\s*\(?(\d+(?:\.\d+)?)\)?\)/);
    if (rangeMatch) {
      rangeMap[`${chk.table_name}.${rangeMatch[1]}`] = { min: parseFloat(rangeMatch[2]), max: parseFloat(rangeMatch[3]) };
    }
  }

  for (const op of ops) {
    const hasTable = schema.cols.some(c => c.table_name === op.table);
    if (!hasTable) continue;

    for (const entry of op.entries) {
      const fqcol = `${op.table}.${entry.key}`;
      const col = colMap[fqcol];

      // Check 1: Column exists
      if (!col) {
        findings.push({ ...op, column: entry.key, issue: `Column '${entry.key}' not found on '${op.table}'` });
        continue;
      }

      // Check 2: Enum values (skip placeholders: ALL_CAPS, contains |, starts with <)
      if (entry.strVal && enumMap[fqcol]) {
        const v = entry.strVal;
        const isPlaceholder = /^[A-Z_]+$/.test(v) || v.includes('|') || v.startsWith('<');
        if (!isPlaceholder && !enumMap[fqcol].has(v)) {
          findings.push({
            ...op, column: entry.key,
            issue: `Value '${v}' not in CHECK enum for ${fqcol}. Allowed: [${[...enumMap[fqcol]].join(', ')}]`
          });
        }
      }

      // Check 3: Range hints vs actual range
      if (entry.rangeHint && rangeMap[fqcol]) {
        const actual = rangeMap[fqcol];
        const hintMatch = entry.rangeHint.match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/);
        if (hintMatch) {
          const hMin = parseFloat(hintMatch[1]), hMax = parseFloat(hintMatch[2]);
          if (hMin !== actual.min || hMax !== actual.max) {
            findings.push({
              ...op, column: entry.key,
              issue: `Range hint <${entry.rangeHint}> doesn't match CHECK (${actual.min}-${actual.max}) for ${fqcol}`
            });
          }
        }
      }

      // Check 4: Integer-scale hint on decimal column
      if (col?.data_type === 'numeric' && col.numeric_scale > 0 && entry.rangeHint) {
        const hintMatch = entry.rangeHint.match(/^(\d+)-(\d+)$/);
        if (hintMatch && parseInt(hintMatch[2]) > 1) {
          findings.push({
            ...op, column: entry.key,
            issue: `Hint <${entry.rangeHint}> looks integer-scale but column is numeric(${col.numeric_precision},${col.numeric_scale})`
          });
        }
      }
    }
  }
  return findings;
}

// ── Main ────────────────────────────────────────────────────────────────
async function main() {
  const cmdDir = join(process.cwd(), '.claude', 'commands');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  COMMAND <-> SCHEMA SYNC VALIDATION (PA-1)');
  console.log('═══════════════════════════════════════════════════════════\n');

  const ops = extractDbOperations(cmdDir);
  const fileCount = readdirSync(cmdDir).filter(f => f.endsWith('.md')).length;
  console.log(`Scanned: ${fileCount} command files`);
  console.log(`Found:   ${ops.length} embedded DB operations across ${new Set(ops.map(o => o.file)).size} files\n`);

  if (ops.length === 0) {
    console.log('No embedded DB operations found.');
    return;
  }

  const tables = [...new Set(ops.map(o => o.table))];
  console.log(`Tables:  ${tables.join(', ')}\n`);

  const schema = await loadLiveSchema(tables);
  const findings = validate(ops, schema);

  if (findings.length === 0) {
    console.log('PASS: All embedded SQL templates match live schema.\n');
    console.log(`  ${ops.length} operations validated against ${schema.checks.length} CHECK constraints.`);
  } else {
    console.log(`FAIL: ${findings.length} mismatch(es):\n`);
    for (const f of findings) {
      console.log(`  ${f.file}:${f.line} [${f.table}.${f.column}]`);
      console.log(`    ${f.issue}\n`);
    }
    process.exitCode = 1;
  }

  console.log('═══════════════════════════════════════════════════════════');
}

async function loadLiveSchema(tables) {
  const tList = tables.map(t => `'${t}'`).join(',');
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: process.env.SUPABASE_POOLER_URL || process.env.DATABASE_URL });
  await client.connect();
  const [colRes, checkRes] = await Promise.all([
    client.query(`SELECT table_name, column_name, data_type, numeric_precision, numeric_scale, is_nullable
      FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN (${tList})`),
    client.query(`SELECT conrelid::regclass::text AS table_name, conname, pg_get_constraintdef(oid) AS def
      FROM pg_constraint WHERE contype = 'c' AND conrelid::regclass::text IN (${tList})`)
  ]);
  await client.end();
  return { cols: colRes.rows, checks: checkRes.rows };
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exitCode = 1;
});
