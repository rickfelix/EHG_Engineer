/**
 * SD-MAN-FIX-SECURITY-GUARD-PACK-001 — static shape tests for the guard-pack
 * migrations. No DB access: reads the migration SQL files and asserts the
 * security-relevant statements are present (RLS + revokes on the 4 tables,
 * per-venture guards on the 8 SECURITY DEFINER fns, reversible DOWN files,
 * and the bare @approved-by header the 3-factor apply guard requires).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIG_DIR = path.join(__dirname, '..', '..', 'database', 'migrations');
const read = (f) => fs.readFileSync(path.join(MIG_DIR, f), 'utf8');

const UP_A = '20260611_guard_pack_rls_tables.sql';
const DOWN_A = '20260611_guard_pack_rls_tables_DOWN.sql';
const UP_B = '20260611_guard_pack_secdef_fns.sql';
const DOWN_B = '20260611_guard_pack_secdef_fns_DOWN.sql';

const TABLES = [
  'retention_archive',
  'retention_runs',
  'coordination_events',
  'app_config_kill_switch_changes',
];

const FNS = [
  'advance_venture_stage',
  'advance_venture_to_stage',
  'bootstrap_venture_workflow',
  'create_eva_conversation',
  'eva_circuit_allows_request',
  'record_eva_failure',
  'record_eva_success',
  'rescan_stage_20',
];

// The bare-line header format required by scripts/lib/migration-guards.js
// (APPROVED_BY_RE is ^-anchored multiline: the line must contain ONLY the tag).
const APPROVED_BY_RE = /^\s*--\s*@approved-by:\s*codestreetlabs@gmail\.com\s*$/m;

describe('guard-pack RLS table migration (UP A)', () => {
  const sql = read(UP_A);

  it('has the bare @approved-by header line', () => {
    expect(sql).toMatch(APPROVED_BY_RE);
  });

  it.each(TABLES)('%s: ENABLE ROW LEVEL SECURITY', (t) => {
    expect(sql).toMatch(new RegExp(
      `ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY;`));
  });

  it.each(TABLES)('%s: service_role_all policy (FOR ALL, USING/WITH CHECK true)', (t) => {
    expect(sql).toMatch(new RegExp(
      `CREATE POLICY service_role_all ON public\\.${t}\\s*\\n\\s*FOR ALL TO service_role USING \\(true\\) WITH CHECK \\(true\\);`));
  });

  it.each(TABLES)('%s: REVOKE ALL from anon and authenticated', (t) => {
    expect(sql).toMatch(new RegExp(
      `REVOKE ALL ON public\\.${t} FROM anon, authenticated;`));
  });

  it('documents that it supersedes the orphan 20260608 coordination_events migration', () => {
    expect(sql).toContain('20260608_coordination_events_rls.sql');
  });
});

describe('guard-pack RLS table migration (DOWN A)', () => {
  const sql = read(DOWN_A);

  it('has the bare @approved-by header line', () => {
    expect(sql).toMatch(APPROVED_BY_RE);
  });

  it.each(TABLES)('%s: DISABLE ROW LEVEL SECURITY + policy drop + grant restore', (t) => {
    expect(sql).toMatch(new RegExp(
      `ALTER TABLE public\\.${t} DISABLE ROW LEVEL SECURITY;`));
    expect(sql).toMatch(new RegExp(
      `DROP POLICY IF EXISTS service_role_all ON public\\.${t};`));
    // restores the captured full grant set verbatim
    expect(sql).toMatch(new RegExp(
      `GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER\\s*\\n\\s*ON public\\.${t} TO anon, authenticated, service_role;`));
  });
});

describe('guard-pack SECURITY DEFINER fn migration (UP B)', () => {
  const sql = read(UP_B);

  it('has the bare @approved-by header line', () => {
    expect(sql).toMatch(APPROVED_BY_RE);
  });

  it.each(FNS)('%s: CREATE OR REPLACE present with SECURITY DEFINER + search_path', (f) => {
    const m = sql.match(new RegExp(
      `CREATE OR REPLACE FUNCTION public\\.${f}\\([^)]*\\)[\\s\\S]*?AS \\$function\\$`));
    expect(m, `${f} definition not found`).toBeTruthy();
    expect(m[0]).toContain('SECURITY DEFINER');
    expect(m[0]).toMatch(/SET search_path TO/);
  });

  it.each(FNS)('%s: body contains the access-denied guard exception', (f) => {
    // slice this fn's body out (up to the next CREATE OR REPLACE or EOF)
    const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${f}(`);
    expect(start, `${f} not found`).toBeGreaterThan(-1);
    const nextIdx = sql.indexOf('CREATE OR REPLACE FUNCTION', start + 1);
    const body = sql.slice(start, nextIdx === -1 ? undefined : nextIdx);
    expect(body).toMatch(/RAISE EXCEPTION 'access denied: .*\(SD-MAN-FIX-SECURITY-GUARD-PACK-001\)'/);
  });

  it('uuid-venture fns use the full three-way per-venture guard', () => {
    for (const f of ['advance_venture_stage', 'advance_venture_to_stage', 'bootstrap_venture_workflow', 'rescan_stage_20']) {
      const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${f}(`);
      const nextIdx = sql.indexOf('CREATE OR REPLACE FUNCTION', start + 1);
      const body = sql.slice(start, nextIdx === -1 ? undefined : nextIdx);
      expect(body, f).toMatch(/fn_is_service_role\(\) OR public\.fn_is_chairman\(\)\s*\n\s*OR public\.fn_user_has_venture_access\(p_venture_id\)/);
    }
  });

  it('eva TEXT-id fns guard via guarded uuid cast for non-privileged callers', () => {
    for (const f of ['eva_circuit_allows_request', 'record_eva_failure', 'record_eva_success']) {
      const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${f}(`);
      const nextIdx = sql.indexOf('CREATE OR REPLACE FUNCTION', start + 1);
      const body = sql.slice(start, nextIdx === -1 ? undefined : nextIdx);
      expect(body, f).toMatch(/v_guard_vid := p_venture_id::uuid;/);
      expect(body, f).toMatch(/access denied: invalid venture id/);
      expect(body, f).toMatch(/fn_user_has_venture_access\(v_guard_vid\)/);
    }
  });

  it('create_eva_conversation guards on caller identity (p_user_id = auth.uid())', () => {
    expect(sql).toMatch(/fn_is_service_role\(\) OR public\.fn_is_chairman\(\) OR p_user_id = auth\.uid\(\)/);
  });

  it('does NOT redefine the helper functions', () => {
    for (const helper of ['fn_is_service_role', 'fn_is_chairman', 'fn_user_has_venture_access']) {
      expect(sql).not.toMatch(new RegExp(`CREATE (OR REPLACE )?FUNCTION public\\.${helper}\\b`));
    }
  });

  it('re-grants EXECUTE to service_role and authenticated for all 8 fns', () => {
    for (const f of FNS) {
      expect(sql).toMatch(new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${f}\\([^)]*\\) TO service_role, authenticated;`));
    }
  });
});

describe('guard-pack SECURITY DEFINER fn migration (DOWN B)', () => {
  const sql = read(DOWN_B);

  it('has the bare @approved-by header line', () => {
    expect(sql).toMatch(APPROVED_BY_RE);
  });

  it.each(FNS)('%s: restores a definition WITHOUT the guard', (f) => {
    const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${f}(`);
    expect(start, `${f} not found`).toBeGreaterThan(-1);
    const nextIdx = sql.indexOf('CREATE OR REPLACE FUNCTION', start + 1);
    const body = sql.slice(start, nextIdx === -1 ? undefined : nextIdx);
    expect(body).not.toContain('access denied');
    expect(body).toContain('SECURITY DEFINER');
  });

  it('restates the captured EXECUTE grants', () => {
    for (const f of FNS) {
      expect(sql).toMatch(new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${f}\\([^)]*\\) TO service_role, authenticated;`));
    }
  });
});
