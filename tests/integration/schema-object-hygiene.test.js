/**
 * Regression suite for SD-LEO-INFRA-DATABASE-SCHEMA-OBJECT-001.
 *
 * Three additive, backward-compatible DB schema-object hygiene fixes, each closing one
 * harness-backlog feedback row:
 *   D1 (feedback 6359dc60) — neutralized wireframe_screens surface migration (to_regclass guard)
 *   D3 (feedback 44b3621b) — auto_set_is_parent() corrected-parent guard + marker writer
 *   D2 (feedback 2af121c6) — drop over-strict check_conditional_pass_retrospective
 *
 * STRATEGY: each migration is applied INSIDE a transaction that is ROLLED BACK, so the
 * suite validates the corrected behavior WITHOUT permanently mutating the consolidated
 * DB (apply-to-prod is gated on explicit user go). Postgres DDL is transactional, so the
 * CREATE OR REPLACE / DROP CONSTRAINT / DO-block ALTERs all revert on ROLLBACK.
 *
 * Skips entirely when no direct-pg credentials are present (SUPABASE_DB_PASSWORD /
 * EHG_DB_PASSWORD). Run locally with: DISABLE_SSL_VERIFY=true npx vitest run \
 *   tests/integration/schema-object-hygiene.test.js
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { createDatabaseClient } from '../../scripts/lib/supabase-connection.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIG = (f) => resolve(__dirname, '../../database/migrations', f);

const D1_SQL = readFileSync(MIG('20260520_add_surface_columns_to_wireframe_screens.sql'), 'utf8');
const D2_SQL = readFileSync(MIG('20260521_drop_conditional_pass_retrospective_constraint.sql'), 'utf8');
const D3_SQL = readFileSync(MIG('20260521_guard_auto_set_is_parent_corrected_parent.sql'), 'utf8');

const HAS_DB = Boolean(process.env.SUPABASE_DB_PASSWORD || process.env.EHG_DB_PASSWORD);

let client;
beforeAll(async () => {
  if (!HAS_DB) return;
  client = await createDatabaseClient('engineer', { verify: false });
});
afterAll(async () => {
  if (client) await client.end();
});

// Run `work` inside a BEGIN/ROLLBACK transaction so nothing persists.
async function inRolledBackTx(work) {
  await client.query('BEGIN');
  try {
    return await work();
  } finally {
    await client.query('ROLLBACK');
  }
}

describe.skipIf(!HAS_DB)('D1 — neutralized wireframe_screens surface migration (feedback 6359dc60)', () => {
  it('table does not exist; applying the migration is a clean no-op (no error, no table created)', async () => {
    await inRolledBackTx(async () => {
      const before = await client.query("SELECT to_regclass('public.wireframe_screens') AS reg");
      expect(before.rows[0].reg).toBeNull(); // table never existed

      // Should NOT throw "relation does not exist" — the to_regclass guard takes the ELSE branch.
      await expect(client.query(D1_SQL)).resolves.toBeDefined();

      const after = await client.query("SELECT to_regclass('public.wireframe_screens') AS reg");
      expect(after.rows[0].reg).toBeNull(); // still no table — pure no-op
    });
  });

  it('forward-compatible branch: when the table exists, the guarded ALTERs add surface + page_type', async () => {
    await inRolledBackTx(async () => {
      await client.query('CREATE TABLE public.wireframe_screens (id int PRIMARY KEY)');
      await client.query(D1_SQL);
      const cols = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'wireframe_screens'
          AND column_name IN ('surface', 'page_type')
        ORDER BY column_name
      `);
      expect(cols.rows.map(r => r.column_name)).toEqual(['page_type', 'surface']);
    });
  });
});

describe.skipIf(!HAS_DB)('D2 — drop check_conditional_pass_retrospective (feedback 2af121c6)', () => {
  // sub_agent_execution_results.sd_id FKs to strategic_directives_v2(id) (UUID).
  const SD_UUID = '207b77d3-1691-45d1-bdec-9f5e000ebc54';

  async function insertCp({ mode, justification, conditions }) {
    return client.query(
      `INSERT INTO sub_agent_execution_results
         (sd_id, sub_agent_code, sub_agent_name, verdict, confidence, validation_mode, justification, conditions)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [SD_UUID, 'DATABASE', 'TEST-REGRESSION', 'CONDITIONAL_PASS', 85, mode, justification,
       conditions == null ? null : JSON.stringify(conditions)]
    );
  }

  const GOOD_JUSTIFICATION = 'Prospective PLAN-phase review: CONDITIONAL_PASS carrying EXEC follow-up conditions, justification well over the fifty character minimum.';
  const GOOD_CONDITIONS = ['Apply migration D2 on user go', 'Add regression test'];

  it('BASELINE: before the drop, a prospective CONDITIONAL_PASS is rejected by check_conditional_pass_retrospective', async () => {
    await inRolledBackTx(async () => {
      await expect(
        insertCp({ mode: 'prospective', justification: GOOD_JUSTIFICATION, conditions: GOOD_CONDITIONS })
      ).rejects.toThrow(/check_conditional_pass_retrospective/);
    });
  });

  it('after the drop, a prospective CONDITIONAL_PASS with valid justification + conditions succeeds', async () => {
    await inRolledBackTx(async () => {
      await client.query(D2_SQL);
      const res = await insertCp({ mode: 'prospective', justification: GOOD_JUSTIFICATION, conditions: GOOD_CONDITIONS });
      expect(res.rows[0].id).toBeTruthy();
    });
  });

  it('after the drop, sibling check_justification_required still rejects a short justification', async () => {
    await inRolledBackTx(async () => {
      await client.query(D2_SQL);
      await expect(
        insertCp({ mode: 'prospective', justification: 'too short', conditions: GOOD_CONDITIONS })
      ).rejects.toThrow(/check_justification_required/);
    });
  });

  it('after the drop, sibling check_conditions_required still rejects empty conditions', async () => {
    await inRolledBackTx(async () => {
      await client.query(D2_SQL);
      await expect(
        insertCp({ mode: 'prospective', justification: GOOD_JUSTIFICATION, conditions: [] })
      ).rejects.toThrow(/check_conditions_required/);
    });
  });

  it('existing retrospective CONDITIONAL_PASS rows remain valid after the drop (no destructive change)', async () => {
    await inRolledBackTx(async () => {
      const before = await client.query(
        "SELECT count(*)::int AS n FROM sub_agent_execution_results WHERE verdict='CONDITIONAL_PASS' AND validation_mode='retrospective'"
      );
      await client.query(D2_SQL);
      const after = await client.query(
        "SELECT count(*)::int AS n FROM sub_agent_execution_results WHERE verdict='CONDITIONAL_PASS' AND validation_mode='retrospective'"
      );
      expect(after.rows[0].n).toBe(before.rows[0].n);
      expect(after.rows[0].n).toBeGreaterThan(0);
    });
  });
});

describe.skipIf(!HAS_DB)('D3 — auto_set_is_parent corrected-parent guard (feedback 44b3621b)', () => {
  it('guard predicate: most-recent is_parent_change_history entry decides re-promotion', async () => {
    const wouldPromote = async (historyJson) => {
      const r = await client.query(
        `SELECT COALESCE((
            SELECT (h.elem->>'to')
            FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS h(elem, ord)
            ORDER BY (h.elem->>'changed_at') DESC NULLS LAST, h.ord DESC
            LIMIT 1
          ), 'true') <> 'false' AS would_promote`,
        [JSON.stringify(historyJson)]
      );
      return r.rows[0].would_promote;
    };
    expect(await wouldPromote([])).toBe(true); // no marker -> normal auto-set
    expect(await wouldPromote([{ to: false, changed_at: '2026-01-01T00:00:00Z' }])).toBe(false);
    // demoted then genuinely re-parented -> latest is true -> promote allowed
    expect(await wouldPromote([
      { to: false, changed_at: '2026-01-01T00:00:00Z' },
      { to: true, changed_at: '2026-02-01T00:00:00Z' },
    ])).toBe(true);
    // promoted then deliberately corrected -> latest is false -> suppressed
    expect(await wouldPromote([
      { to: true, changed_at: '2026-01-01T00:00:00Z' },
      { to: false, changed_at: '2026-02-01T00:00:00Z' },
    ])).toBe(false);
  });

  it('normal path preserved: a child write auto-sets an un-marked parent to is_parent=true', async () => {
    await inRolledBackTx(async () => {
      await client.query(D3_SQL);
      const { parentId } = await seedParentChild({ withCorrectionMarker: false });
      const r = await client.query("SELECT metadata->>'is_parent' AS v FROM strategic_directives_v2 WHERE id=$1", [parentId]);
      expect(r.rows[0].v).toBe('true');
    });
  });

  it('guarded path: a child write does NOT re-promote a parent whose latest marker is to=false', async () => {
    await inRolledBackTx(async () => {
      await client.query(D3_SQL);
      const { parentId, childId } = await seedParentChild({ withCorrectionMarker: false });
      // Auto-set fired on insert -> true. Now deliberately correct to false + record marker.
      await client.query(
        `UPDATE strategic_directives_v2
            SET metadata = COALESCE(metadata,'{}'::jsonb) || '{"is_parent": false}'::jsonb,
                governance_metadata = COALESCE(governance_metadata,'{}'::jsonb) || jsonb_build_object(
                  'is_parent_change_history',
                  jsonb_build_array(jsonb_build_object('from', true, 'to', false, 'reason', 'regression test', 'changed_at', now()))
                )
          WHERE id = $1`, [parentId]);
      // Re-fire the trigger by re-writing the child's parent_sd_id (same value).
      await client.query('UPDATE strategic_directives_v2 SET parent_sd_id=$1 WHERE id=$2', [parentId, childId]);
      const r = await client.query("SELECT metadata->>'is_parent' AS v FROM strategic_directives_v2 WHERE id=$1", [parentId]);
      expect(r.rows[0].v).toBe('false'); // guard prevented re-promotion
    });
  });

  // Seed an orchestrator parent (so enforce_parent_orchestrator_type no-ops) + a child.
  async function seedParentChild() {
    const rand = Math.random().toString(36).slice(2, 8);
    const parentId = (await client.query('SELECT gen_random_uuid() AS id')).rows[0].id;
    const childId = (await client.query('SELECT gen_random_uuid() AS id')).rows[0].id;
    const pKey = `SD-TEST-PARENT-${rand}`;
    const cKey = `SD-TEST-CHILD-${rand}`;
    await client.query(
      `INSERT INTO strategic_directives_v2
         (id, sd_key, sd_code_user_facing, title, status, priority, category, description, rationale, scope, sequence_rank, sd_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [parentId, pKey, pKey, `Test SD parent ${rand}`, 'draft', 'low', 'test',
       'Regression fixture for SD-LEO-INFRA-DATABASE-SCHEMA-OBJECT-001 (parent)',
       'Integration test fixture', 'Test scope', 0, 'orchestrator']
    );
    await client.query(
      `INSERT INTO strategic_directives_v2
         (id, sd_key, sd_code_user_facing, title, status, priority, category, description, rationale, scope, sequence_rank, sd_type, parent_sd_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [childId, cKey, cKey, `Test SD child ${rand}`, 'draft', 'low', 'test',
       'Regression fixture for SD-LEO-INFRA-DATABASE-SCHEMA-OBJECT-001 (child)',
       'Integration test fixture', 'Test scope', 0, 'infrastructure', parentId]
    );
    return { parentId, childId };
  }
});
