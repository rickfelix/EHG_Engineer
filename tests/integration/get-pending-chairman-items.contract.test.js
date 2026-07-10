/**
 * SD-EHG-CONSOLE-PENDING-ITEMS-RPC-001 — get_pending_chairman_items contract test.
 *
 * Pins the RPC's envelope shape and the SHARED chairman-actionable predicate so consumer/DB
 * drift fails CI (reader/writer contract pattern). Two halves, per the established recipe
 * (initiative-backbone-a1a-migration.test.js):
 *   1. STATIC assertions over the migration SQL — run everywhere, no DB needed.
 *   2. LIVE BEGIN..ROLLBACK against the real DB (skipIf no SUPABASE_POOLER_URL): executes the
 *      CREATE OR REPLACE inside a transaction (works identically BEFORE the chairman-gated
 *      production apply and AFTER it — CREATE OR REPLACE is idempotent), seeds predicate
 *      specimens, asserts, rolls back. No persistent DDL, no persistent rows.
 *
 * Consumer contract pinned here = what src/hooks/useDecisionGateQueue.ts:61 (rickfelix/ehg)
 * actually parses: jsonb envelope with `items` (GateDecision-shaped, incl. `deadline` and
 * `summary` aliases) and `total`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../');
const MIGRATION_PATH = resolve(REPO_ROOT, 'database/migrations/20260710_create_get_pending_chairman_items.sql');
const SQL = readFileSync(MIGRATION_PATH, 'utf8');

describe('get_pending_chairman_items — static migration contract', () => {
  it('creates the exact consumer-called signature (text, integer, integer)', () => {
    expect(SQL).toMatch(/CREATE OR REPLACE FUNCTION public\.get_pending_chairman_items\(/);
    expect(SQL).toMatch(/p_decision_type text DEFAULT NULL/);
    expect(SQL).toMatch(/p_page integer DEFAULT 1/);
    expect(SQL).toMatch(/p_page_size integer DEFAULT 50/);
  });

  it('is read-only, STABLE, SECURITY INVOKER, with pinned search_path', () => {
    expect(SQL).toMatch(/\bSTABLE\b/);
    expect(SQL).toMatch(/SECURITY INVOKER/);
    expect(SQL).toMatch(/SET search_path = public/);
    expect(SQL).not.toMatch(/SECURITY DEFINER/);
    // no writer surface (rollback DROP lives only in the comment header)
    expect(SQL).not.toMatch(/INSERT INTO/i);
    expect(SQL).not.toMatch(/UPDATE\s+\w+\s+SET/i);
    expect(SQL).not.toMatch(/DELETE FROM/i);
  });

  it('predicate is an ALLOWLIST (unknown types excluded by default; telemetry never admitted)', () => {
    expect(SQL).toMatch(/decision_type IN \('chairman_approval', 'gate_decision'\)/);
    expect(SQL).toMatch(/decision_type IN \('escalation', 'okr_acceptance'\) AND d\.blocking IS TRUE/);
    // telemetry classes must never appear as admitted values
    expect(SQL).not.toMatch(/IN \([^)]*'flag_review'/);
    expect(SQL).not.toMatch(/IN \([^)]*'flag_enablement'/);
  });

  it('fixture exclusion + grants + rollback are declared (positive-identification form, NULL-safe)', () => {
    expect(SQL).toMatch(/NOT COALESCE\(/);
    expect(SQL).toMatch(/is_demo IS TRUE/);
    expect(SQL).toMatch(/LIKE '\\_\\_%'/);
    expect(SQL).toMatch(/, false\)/); // NULL/dangling/RLS-invisible venture resolves to INCLUDE
    expect(SQL).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_pending_chairman_items\(text, integer, integer\) TO authenticated/);
    expect(SQL).toMatch(/DROP FUNCTION IF EXISTS public\.get_pending_chairman_items\(text, integer, integer\)/);
  });
});

const POOLER = process.env.SUPABASE_POOLER_URL;

describe.skipIf(!POOLER)('get_pending_chairman_items — live BEGIN..ROLLBACK contract', () => {
  let client;

  beforeAll(async () => {
    const { Client } = await import('pg');
    client = new Client({ connectionString: POOLER });
    await client.connect();
  });

  afterAll(async () => {
    if (client) await client.end();
  });

  const call = async (args = {}) => {
    const { p_decision_type = null, p_page = 1, p_page_size = 50 } = args;
    const { rows } = await client.query(
      'SELECT public.get_pending_chairman_items($1, $2, $3) AS env',
      [p_decision_type, p_page, p_page_size]
    );
    return rows[0].env;
  };

  it('envelope + predicate + aliases + pagination hold on live data plus seeded specimens (TS-1..TS-4)', async () => {
    await client.query('BEGIN');
    try {
      await client.query(SQL); // transactional self-apply (idempotent post-apply too)

      // Seed specimens (rolled back): one real holding-level approval, one fixture-venture approval.
      const seeded = await client.query(`
        INSERT INTO public.chairman_decisions (lifecycle_stage, decision, decision_type, status, summary)
        VALUES (0, 'pending', 'stage_gate', 'pending', 'contract-test real approval (rollback)')
        RETURNING id`);
      const realId = seeded.rows[0].id;

      const fixtureVenture = await client.query(
        'SELECT id FROM public.ventures WHERE name LIKE \'\\_\\_%\' LIMIT 1');
      let fixtureDecisionId = null;
      if (fixtureVenture.rows.length) {
        const fx = await client.query(`
          INSERT INTO public.chairman_decisions (lifecycle_stage, decision, decision_type, status, summary, venture_id)
          VALUES (0, 'pending', 'stage_gate', 'pending', 'contract-test fixture approval (rollback)', $1)
          RETURNING id`, [fixtureVenture.rows[0].id]);
        fixtureDecisionId = fx.rows[0].id;
      }

      // TS-1: envelope shape
      const env = await call({ p_page_size: 200 });
      expect(Object.keys(env).sort()).toEqual(['items', 'page', 'page_size', 'total']);
      expect(Array.isArray(env.items)).toBe(true);
      expect(typeof env.total).toBe('number');
      expect(env.total).toBeGreaterThanOrEqual(1); // the seeded real approval guarantees >=1
      expect(env.page_size).toBe(200); // requested size within the LEAST(...,200) cap is honored

      // TS-2: telemetry classes NEVER appear; fixture-venture specimen excluded
      for (const item of env.items) {
        expect(['flag_review', 'flag_enablement']).not.toContain(item.decision_type);
        // consumer aliases present on every item
        expect('deadline' in item).toBe(true);
        expect('summary' in item).toBe(true);
      }
      if (fixtureDecisionId) {
        expect(env.items.some((i) => i.id === fixtureDecisionId)).toBe(false);
      }

      // TS-3: seeded real approval included; type filter works
      expect(env.items.some((i) => i.id === realId)).toBe(true);
      const onlyApprovals = await call({ p_decision_type: 'chairman_approval', p_page_size: 200 });
      expect(onlyApprovals.items.every((i) => i.decision_type === 'chairman_approval')).toBe(true);
      expect(onlyApprovals.items.some((i) => i.id === realId)).toBe(true); // view stamps chairman_decisions rows as chairman_approval

      // Predicate consistency: total never exceeds the raw pending view count (pollution removed, never added)
      const raw = await client.query(
        'SELECT count(*)::int AS n FROM public.chairman_pending_decisions WHERE status = \'pending\'');
      expect(env.total).toBeLessThanOrEqual(raw.rows[0].n);

      // TS-4: pagination — page_size 1 yields disjoint items with constant total
      const p1 = await call({ p_page: 1, p_page_size: 1 });
      const p2 = await call({ p_page: 2, p_page_size: 1 });
      expect(p1.items.length).toBe(1);
      expect(p1.total).toBe(p2.total);
      if (p2.items.length === 1) expect(p1.items[0].id).not.toBe(p2.items[0].id);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('TS-5: shape drift fails loudly — a scratch copy with a renamed envelope key breaks the pinned keys', async () => {
    await client.query('BEGIN');
    try {
      const drifted = SQL
        .replace(/get_pending_chairman_items/g, '__drift_probe_gpci')
        .replace("'items',", "'rows',");
      await client.query(drifted);
      const { rows } = await client.query('SELECT public.__drift_probe_gpci(NULL, 1, 5) AS env');
      expect(Object.keys(rows[0].env).sort()).not.toEqual(['items', 'page', 'page_size', 'total']);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});
