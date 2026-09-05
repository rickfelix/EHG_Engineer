// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-A / FR-1, TS-7, TS-13.
//
// No scratch-DB harness exists for a migration's DO $verify$ block (TESTING evidence 629fc7e3:
// scripts/apply-migration.js is dry-run or chairman-gated prod-deploy only), so the migration's
// SHAPE is pinned here and the DO $verify$ ASSERTs run at chairman apply time. What this test
// protects against is the exact defect SECURITY evidence 2ca8b0ee measured on the copy source: a
// SECURITY DEFINER function created without REVOKE/GRANT text lands anon-EXECUTE under the public
// schema's default ACL, an RLS-bypass write on claude_sessions.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const MIG_DIR = path.resolve(here, '../../../database/migrations');
const UP = path.join(MIG_DIR, '20260906_role_handoff_atomic_michael_flag.sql');
const DOWN = path.join(MIG_DIR, '20260906_role_handoff_atomic_michael_flag_DOWN.sql');

const up = fs.readFileSync(UP, 'utf8');
const down = fs.readFileSync(DOWN, 'utf8');
const FNS = ['set_michael_flag', 'clear_michael_flag'];

describe('michael flag migration shape (FR-1)', () => {
  it('defines exactly the two SECURITY DEFINER RPCs with search_path pinned', () => {
    for (const fn of FNS) {
      const re = new RegExp(`CREATE OR REPLACE FUNCTION ${fn}\\(p_session_id TEXT\\)[\\s\\S]*?SECURITY DEFINER\\s+SET search_path = public`);
      expect(up).toMatch(re);
    }
    expect((up.match(/CREATE OR REPLACE FUNCTION/g) || []).length).toBe(2);
  });

  it('REVOKEs EXECUTE from PUBLIC, anon and authenticated and GRANTs it to service_role for both (TS-13)', () => {
    for (const fn of FNS) {
      expect(up).toMatch(new RegExp(`REVOKE ALL ON FUNCTION ${fn}\\(TEXT\\) FROM PUBLIC, anon, authenticated;`));
      expect(up).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION ${fn}\\(TEXT\\) TO service_role;`));
    }
  });

  it('asserts the privilege posture inside DO $verify$ with has_function_privilege', () => {
    for (const fn of FNS) {
      for (const role of ['anon', 'authenticated']) {
        expect(up).toContain(`ASSERT NOT has_function_privilege('${role}', '${fn}(text)', 'EXECUTE')`);
      }
    }
    expect(up).toContain("ASSERT has_function_privilege('service_role', 'set_michael_flag(text)', 'EXECUTE')");
  });

  it('carries the Solomon-precedent self-check ASSERTs renamed to michael, plus the non-michael-row guard', () => {
    const asserts = up.match(/^\s*ASSERT /gm) || [];
    expect(asserts.length).toBeGreaterThanOrEqual(15);
    expect(up).toContain("v_meta->>'role' = 'michael'");
    expect(up).toContain("v_meta ? 'michael_since'");
    expect(up).toContain('clear_michael_flag stripped a non-michael role');
    expect(up).toContain("clear_michael_flag stripped another role''s non_fleet");
    expect(up).toContain('DELETE FROM claude_sessions WHERE session_id = v_sid');
  });

  it('clear_michael_flag drops non_fleet only inside the role-equality CASE branch', () => {
    const body = up.slice(up.indexOf('FUNCTION clear_michael_flag'), up.indexOf('FUNCTION set_michael_flag'));
    const thenBranch = body.slice(body.indexOf('THEN'), body.indexOf('ELSE'));
    const elseBranch = body.slice(body.indexOf('ELSE'), body.indexOf('END'));
    expect(thenBranch).toContain("- 'non_fleet'");
    expect(elseBranch).not.toContain("- 'non_fleet'");
    expect(elseBranch).not.toContain("- 'role'");
  });

  it('is dormant-but-safe: no @approved-by line until chairman sign-off, and the DOWN drops exactly the two functions', () => {
    expect(up).not.toMatch(/^--\s*@approved-by/m);
    expect(down).toContain('DROP FUNCTION IF EXISTS clear_michael_flag(TEXT);');
    expect(down).toContain('DROP FUNCTION IF EXISTS set_michael_flag(TEXT);');
    expect((down.match(/DROP FUNCTION/g) || []).length).toBe(2);
  });
});
