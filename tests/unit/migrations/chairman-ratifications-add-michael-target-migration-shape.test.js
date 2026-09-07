// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-F / FR-7, TS-8 — shape of the additive migration
// widening chairman_ratifications' target_contracts CHECK to include 'michael'. Static text
// assertions (no DB), mirroring tests/unit/migrations/michael-tables-migration-shape.test.js's
// pending-approval marker convention.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const MIG_DIR = path.resolve(here, '../../../database/chairman-gated');
const sql = fs.readFileSync(path.join(MIG_DIR, '20260907_chairman_ratifications_add_michael_target.sql'), 'utf8');

const APPROVED_BY_RE = /^\s*--\s*@approved-by:\s*([^\s<>"]+@[^\s<>"]+)\s*$/m;

describe('chairman_ratifications add-michael-target migration shape (FR-7)', () => {
  it('is staged pending chairman approval, not applied by this session', () => {
    expect(sql).toMatch(/@approved-by:\s*<PENDING/);
    expect(APPROVED_BY_RE.test(sql)).toBe(false);
  });

  it('widens cr_target_contracts_valid to include every prior value plus michael, additive only', () => {
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS cr_target_contracts_valid');
    expect(sql).toMatch(/ADD CONSTRAINT cr_target_contracts_valid CHECK \(/);
    expect(sql).toContain("target_contracts <@ ARRAY['adam','coordinator','solomon','michael','protocol']::text[]");
  });

  it('carries no other schema change — no new table, no new column, no other constraint touched', () => {
    expect(sql).not.toMatch(/CREATE TABLE/i);
    expect(sql).not.toMatch(/ADD COLUMN/i);
    const constraintMentions = [...sql.matchAll(/\bCONSTRAINT\s+(?!IF\b)(\w+)/g)].map((m) => m[1]);
    expect(new Set(constraintMentions)).toEqual(new Set(['cr_target_contracts_valid']));
  });

  it('is wrapped in a transaction with a DO $verify$ block confirming the widened constraint', () => {
    expect(sql).toMatch(/^BEGIN;/m);
    expect(sql).toMatch(/^COMMIT;/m);
    expect(sql).toMatch(/DO \$verify\$/);
    expect(sql).toMatch(/pg_get_constraintdef\(oid\) LIKE '%michael%'/);
    expect(sql).toMatch(/RAISE EXCEPTION/);
  });
});
