import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

// SD-LEO-INFRA-AUTONOMY-DEFAULT-L1-001 (chairman-decided): new-venture autonomy
// default is L1. This guards the migration so a silent revert to L2 fails CI.
const REPO_ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..');
const MIGRATION = join(
  REPO_ROOT,
  'database',
  'migrations',
  '20260626_venture_autonomy_default_l1.sql'
);

function strip(sql) {
  return sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('Venture autonomy default is L1 (SD-LEO-INFRA-AUTONOMY-DEFAULT-L1-001)', () => {
  const sql = strip(readFileSync(MIGRATION, 'utf8'));

  it('sets ventures.autonomy_level DEFAULT to L1 (write/source table)', () => {
    expect(sql).toMatch(
      /ALTER\s+TABLE\s+public\.ventures\s+ALTER\s+COLUMN\s+autonomy_level\s+SET\s+DEFAULT\s+'L1'/i
    );
  });

  it('sets eva_ventures.autonomy_level DEFAULT to L1 (gate-read table)', () => {
    expect(sql).toMatch(
      /ALTER\s+TABLE\s+public\.eva_ventures\s+ALTER\s+COLUMN\s+autonomy_level\s+SET\s+DEFAULT\s+'L1'::eva_autonomy_level/i
    );
  });

  it('does not re-default either table to L2 (no silent revert)', () => {
    expect(sql).not.toMatch(/SET\s+DEFAULT\s+'L2'/i);
  });

  it('is non-retroactive: no UPDATE backfill of existing rows', () => {
    expect(sql).not.toMatch(/\bUPDATE\s+public\.(ventures|eva_ventures)\b/i);
  });
});
