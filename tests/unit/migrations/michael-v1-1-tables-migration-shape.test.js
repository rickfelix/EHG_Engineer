// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-J — shape of the v1.1 four-table migration.
// Static text assertions (no DB). The behavioural proof is tests/ddl/michael-v1-1-tables-ddl.db.test.js.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const MIG_DIR = path.resolve(here, '../../../database/migrations');
const up = fs.readFileSync(path.join(MIG_DIR, '20260907_michael_v1_1_tables.sql'), 'utf8');
const down = fs.readFileSync(path.join(MIG_DIR, '20260907_michael_v1_1_tables_DOWN.sql'), 'utf8');
const upCode = up.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');

export const MICHAEL_V1_1_TABLES = [
  'michael_oracle_history', 'michael_oracle_alignment', 'michael_health_daily', 'michael_check_in_journal',
];

const NATURAL_KEYS = {
  michael_oracle_history: '(et_date, seq)',
  michael_oracle_alignment: '(et_date)',
  michael_health_daily: '(et_date)',
  michael_check_in_journal: '(et_date, seq)',
};

const CHAIRMAN_GATED_RE = /^\s*--\s*(@chairman-gated|requires[-_]chairman[-_]apply)\b\s*[:=]?.*$/im;
const APPROVED_BY_RE = /^\s*--\s*@approved-by:\s*([^\s<>"]+@[^\s<>"]+)\s*$/m;

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('michael v1.1 migration shape (FR-1)', () => {
  it('names exactly four tables and creates each with IF NOT EXISTS', () => {
    expect(MICHAEL_V1_1_TABLES).toHaveLength(4);
    const creates = up.match(/CREATE TABLE IF NOT EXISTS public\.michael_\w+/g) || [];
    expect(creates).toHaveLength(4);
    for (const t of MICHAEL_V1_1_TABLES) expect(up).toContain(`CREATE TABLE IF NOT EXISTS public.${t} (`);
  });

  it.each(MICHAEL_V1_1_TABLES)('%s carries the full service-role-only posture, surrogate id PK, and its natural-key unique index', (t) => {
    expect(up).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${t} \\(\\s*id UUID PRIMARY KEY DEFAULT gen_random_uuid\\(\\),`));
    expect(up).toMatch(new RegExp(`COMMENT ON TABLE public\\.${t} IS '`));
    expect(up).toContain(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`);
    expect(up).toContain(`DROP POLICY IF EXISTS ${t}_service_role ON public.${t};`);
    expect(up).toContain(`CREATE POLICY ${t}_service_role ON public.${t} FOR ALL TO service_role USING (true) WITH CHECK (true);`);
    expect(up).toContain(`REVOKE ALL ON public.${t} FROM anon, authenticated, PUBLIC;`);
    expect(up).toContain(`GRANT ALL ON public.${t} TO service_role;`);
    expect(up).toContain(`CREATE TRIGGER ${t}_set_updated_at BEFORE UPDATE ON public.${t} FOR EACH ROW EXECUTE FUNCTION public.michael_set_updated_at();`);
    expect(up).toMatch(new RegExp(`CREATE UNIQUE INDEX IF NOT EXISTS ${t}_\\w+_uniq ON public\\.${t} ${esc(NATURAL_KEYS[t])};`));
  });

  it('never a natural-key-as-PRIMARY-KEY (PLAN-TO-EXEC TESTING finding B1-B5) — every PK is the surrogate id', () => {
    // Every actual PK declaration is inline on the surrogate id column, exactly once per table.
    const idPkMatches = upCode.match(/id UUID PRIMARY KEY DEFAULT gen_random_uuid\(\)/g) || [];
    expect(idPkMatches).toHaveLength(4);
    expect(upCode).not.toMatch(/et_date DATE( NOT NULL)? PRIMARY KEY/);
    expect(upCode).not.toMatch(/PRIMARY KEY \(et_date/);
  });

  it('never CREATEs or REPLACEs the shared trigger function (child B owns it)', () => {
    expect(up).not.toMatch(/CREATE (OR REPLACE )?FUNCTION public\.michael_set_updated_at/);
    expect(up).toContain('public.michael_set_updated_at()');
  });

  it('every CHECK is inline in CREATE TABLE (the DDL tier applies the file twice)', () => {
    expect(up).not.toMatch(/ALTER TABLE[^;]*ADD CONSTRAINT/i);
  });

  it('carries @chairman-gated and NO @approved-by marker', () => {
    expect(up).toMatch(CHAIRMAN_GATED_RE);
    expect(up).not.toMatch(APPROVED_BY_RE);
    expect(down).toMatch(CHAIRMAN_GATED_RE);
    expect(down).not.toMatch(APPROVED_BY_RE);
  });

  it('has no BEGIN/COMMIT wrapper', () => {
    expect(up).not.toMatch(/^\s*BEGIN;\s*$/m);
    expect(up).not.toMatch(/^\s*COMMIT;\s*$/m);
  });

  it('DOWN drops exactly the four v1.1 tables in reverse order, no CASCADE, and never drops the shared function', () => {
    const downCode = down.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    const drops = downCode.match(/DROP TABLE IF EXISTS public\.\w+;/g) || [];
    expect(drops).toHaveLength(4);
    expect(downCode).not.toMatch(/CASCADE/i);
    expect(downCode).not.toMatch(/DROP FUNCTION/i);
    const order = [...MICHAEL_V1_1_TABLES].reverse();
    let lastIdx = -1;
    for (const t of order) {
      const idx = down.indexOf(`DROP TABLE IF EXISTS public.${t};`);
      expect(idx, `${t} not found in DOWN or out of order`).toBeGreaterThan(lastIdx);
      lastIdx = idx;
    }
  });

  it('the DO $verify$ block pins all four tables, their indexes, and asserts the shared function is untouched', () => {
    expect(up).toContain('DO $verify$');
    for (const t of MICHAEL_V1_1_TABLES) expect(up).toContain(`'${t}'`);
    expect(up).toContain('michael_set_updated_at');
    expect(up).toContain('plpgsql.check_asserts');
  });
});
