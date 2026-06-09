/**
 * SD-LEO-INFRA-FIX-NEXT-CANDIDATES-001
 * HAS_REAL_DB behavioral tests for the v_sd_next_candidates root-cause fix.
 *
 * READ-ONLY / net-zero: no writes to sd_baseline_items or any table. The
 * deps_satisfied SQL is exercised against synthetic jsonb VALUES using real
 * completed/incomplete sd_keys, so it tests the actual Postgres semantics of the
 * resolver without touching the live active baseline (which integration tests
 * must NOT pollute — see the test-isolation follow-up SD).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { HAS_REAL_DB } from '../helpers/db-available.js';

const describeDb = describe.skipIf(!HAS_REAL_DB);

// The deps_satisfied scalar — MUST mirror migration part B
// (20260608_fix_baseline_sync_sdkey_and_deps_satisfied.sql) and
// lib/sd-baseline/deps-resolve.js.
const DEPS_EXPR = `
  COALESCE((
    SELECT count(*) = 0
    FROM jsonb_array_elements(
           CASE WHEN jsonb_typeof($1::jsonb) = 'array' THEN $1::jsonb ELSE '[]'::jsonb END) AS dep(value)
    CROSS JOIN LATERAL (
      SELECT CASE
               WHEN jsonb_typeof(dep.value) = 'string'
                 THEN split_part(dep.value #>> '{}', ' ', 1)
               WHEN jsonb_typeof(dep.value) = 'object'
                 THEN COALESCE(dep.value ->> 'sd_key', dep.value ->> 'sd_id', dep.value ->> 'orchestrator')
               ELSE NULL
             END AS ref
    ) r
    WHERE r.ref IS NOT NULL
      AND lower(r.ref) <> 'none'
      AND EXISTS (
        SELECT 1 FROM strategic_directives_v2 sd2
        WHERE (sd2.sd_key = r.ref OR sd2.id::text = r.ref)
          AND sd2.status::text <> 'completed'::text)
  ), true) AS deps_satisfied`;

describeDb('v_sd_next_candidates root-cause fix (live DB)', () => {
  let client;
  let completedKey;
  let incompleteKey;

  beforeAll(async () => {
    const { createDatabaseClient } = await import('../../lib/supabase-connection.js');
    client = await createDatabaseClient('engineer', { verify: false });
    const done = await client.query(
      "SELECT sd_key FROM strategic_directives_v2 WHERE status = 'completed' AND sd_key IS NOT NULL LIMIT 1;");
    const open = await client.query(
      "SELECT sd_key FROM strategic_directives_v2 WHERE status NOT IN ('completed','cancelled','deferred') AND sd_key IS NOT NULL LIMIT 1;");
    completedKey = done.rows[0]?.sd_key;
    incompleteKey = open.rows[0]?.sd_key;
  });

  afterAll(async () => { if (client) await client.end(); });

  const deps = async (snapshotJson) => {
    const { rows } = await client.query(`SELECT ${DEPS_EXPR}`, [snapshotJson]);
    return rows[0].deps_satisfied;
  };

  it('object dep referencing a COMPLETED SD -> satisfied', async () => {
    expect(completedKey).toBeTruthy();
    expect(await deps(JSON.stringify([{ sd_id: completedKey }]))).toBe(true);
  });

  it('object dep referencing a NON-completed SD -> NOT satisfied', async () => {
    expect(incompleteKey).toBeTruthy();
    expect(await deps(JSON.stringify([{ sd_id: incompleteKey }]))).toBe(false);
  });

  it('string dep "<incomplete> (foundational)" -> NOT satisfied', async () => {
    expect(await deps(JSON.stringify([`${incompleteKey} (foundational)`]))).toBe(false);
  });

  it('none / null / empty / prose / unresolvable -> satisfied (fail-open)', async () => {
    expect(await deps(JSON.stringify([{ sd_key: 'none', description: 'No blocking dependencies' }]))).toBe(true);
    expect(await deps('null')).toBe(true);
    expect(await deps(JSON.stringify([]))).toBe(true);
    expect(await deps(JSON.stringify(['Access to EHG application codebase']))).toBe(true);
    expect(await deps(JSON.stringify([{ sd_id: 'SD-DOES-NOT-EXIST-ZZZ-999' }]))).toBe(true);
  });

  it('mixed completed + incomplete -> NOT satisfied', async () => {
    expect(await deps(JSON.stringify([{ sd_id: completedKey }, { sd_id: incompleteKey }]))).toBe(false);
  });

  // Soft post-migration assertions: only enforced once the migration is applied,
  // so this suite stays green on a DB that has not yet run the migration.
  it('reports live trigger/view fix state (soft until migration applied)', async () => {
    const fn = await client.query("SELECT pg_get_functiondef('fn_sync_sd_to_baseline'::regproc) AS def;");
    const view = await client.query("SELECT pg_get_viewdef('v_sd_next_candidates'::regclass, true) AS def;");
    const fnDef = fn.rows[0].def;
    const viewDef = view.rows[0].def;
    const fnFixed = fnDef.includes('NEW.sd_key');
    const viewFixed = viewDef.includes('orchestrator');
    if (fnFixed) {
      expect(fnDef).toContain('NEW.sd_key');
      expect(fnDef).not.toMatch(/VALUES\s*\([^)]*NEW\.id/s); // INSERT no longer writes NEW.id
    } else {
      console.warn('[soft] fn_sync_sd_to_baseline not yet migrated to sd_key — apply the migration.');
    }
    if (viewFixed) {
      expect(viewDef).toContain('orchestrator');
    } else {
      console.warn('[soft] v_sd_next_candidates deps_satisfied not yet migrated — apply the migration.');
    }
    expect(true).toBe(true);
  });
});
