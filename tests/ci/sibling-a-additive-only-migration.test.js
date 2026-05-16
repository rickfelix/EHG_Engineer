import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..');
const MIGRATIONS_DIR = join(REPO_ROOT, 'database', 'migrations');

const SIBLING_A_FILE_FRAGMENTS = [
  'add_scope_completion_chain',
  'add_bypass_ledger',
  'add_witnesses_view',
];

function isAdditiveOnly(sql) {
  const violations = [];
  const norm = sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

  if (/\bDROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX|VIEW|TYPE)\b/i.test(norm)) {
    violations.push('DROP statement found (must not drop existing objects)');
  }

  const notNullWithoutDefault = /\bADD\s+COLUMN(?:\s+IF\s+NOT\s+EXISTS)?\s+\w+\s+[\w()]+(?:\s+(?!.*DEFAULT)[A-Z]+)*\s+NOT\s+NULL\b/gi;
  const addColRegex = /\bADD\s+COLUMN(?:\s+IF\s+NOT\s+EXISTS)?\s+(\w+)\s+([^,;)]+)/gi;
  let m;
  while ((m = addColRegex.exec(norm)) !== null) {
    const spec = m[2];
    if (/\bNOT\s+NULL\b/i.test(spec) && !/\bDEFAULT\b/i.test(spec)) {
      violations.push(`ADD COLUMN ${m[1]} NOT NULL without DEFAULT (column added to existing table requires DEFAULT)`);
    }
  }

  if (/\bADD\s+CONSTRAINT\s+\w+\s+UNIQUE\b/i.test(norm)) {
    violations.push('ADD CONSTRAINT UNIQUE found (additive-only forbids new UNIQUE on existing tables)');
  }

  return violations;
}

function isInsideCreateTable(sql) {
  return /\bCREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+\w+\s*\(/i.test(sql);
}

describe('Sibling A migrations are ADDITIVE-ONLY (weeks 1-3 freeze)', () => {
  it('no DROP statements, no ADD COLUMN ... NOT NULL without DEFAULT (on existing tables), no ADD CONSTRAINT UNIQUE', () => {
    const files = readdirSync(MIGRATIONS_DIR);
    const allViolations = [];
    for (const f of files) {
      if (!SIBLING_A_FILE_FRAGMENTS.some(frag => f.includes(frag))) continue;
      const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8');
      // Inside CREATE TABLE, NOT NULL without DEFAULT is fine (new table).
      // Sibling A migrations create NEW tables; flag only ALTER TABLE ADD COLUMN cases.
      const alterAdditiveOnly = sql.replace(/CREATE\s+TABLE[\s\S]*?\);/gi, '');
      const v = isAdditiveOnly(alterAdditiveOnly);
      if (v.length > 0) {
        allViolations.push({ file: f, violations: v });
      }
    }
    if (allViolations.length > 0) {
      const msg = allViolations.map(o => `  ${o.file}:\n${o.violations.map(v => `    - ${v}`).join('\n')}`).join('\n');
      throw new Error(`Sibling A migrations violate ADDITIVE-ONLY discipline:\n${msg}`);
    }
    expect(allViolations).toEqual([]);
  });
});
