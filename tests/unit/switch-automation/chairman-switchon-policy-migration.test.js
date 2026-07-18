import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NEVER_AUTO_CLASSES } from '../../../lib/switch-automation/reversibility-classifier.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = path.resolve(__dirname, '../../../database/migrations/20260718_chairman_switchon_policy_STAGED.sql');
const sql = readFileSync(MIGRATION_PATH, 'utf8');

describe('chairman_switchon_policy STAGED migration (static file-lint, TS-2a)', () => {
  it('enables RLS in the same file as CREATE TABLE', () => {
    expect(sql).toMatch(/ALTER TABLE chairman_switchon_policy ENABLE ROW LEVEL SECURITY/);
  });

  it('has a chairman-only SELECT policy', () => {
    expect(sql).toMatch(/FOR SELECT USING \(fn_is_chairman\(\)\)/);
  });

  it('has NO insert/update/delete policy defined', () => {
    expect(sql).not.toMatch(/FOR (INSERT|UPDATE|DELETE)/i);
  });

  it('REVOKEs INSERT, UPDATE, DELETE from anon, authenticated, AND service_role in the same file', () => {
    expect(sql).toMatch(/REVOKE INSERT, UPDATE, DELETE ON chairman_switchon_policy FROM anon, authenticated, service_role/);
  });

  it('is marked STAGED / requires-chairman-apply, not auto-applied', () => {
    expect(sql).toMatch(/STAGED/);
    expect(sql).toMatch(/requires-chairman-apply/);
    expect(sql).toMatch(/NOT YET APPLIED/);
  });

  it('every NEVER_AUTO_CLASSES entry from the classifier is listed in the migration seed comment', () => {
    for (const cls of NEVER_AUTO_CLASSES) {
      expect(sql).toContain(cls);
    }
  });

  it('does not contain a live INSERT statement seeding rows (seed happens at chairman-apply time, not in this file)', () => {
    expect(sql).not.toMatch(/^\s*INSERT INTO chairman_switchon_policy/im);
  });
});
