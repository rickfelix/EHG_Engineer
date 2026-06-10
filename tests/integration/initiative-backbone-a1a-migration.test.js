/**
 * SD-LEO-INFRA-INITIATIVE-BACKBONE-CANONICAL-001 — A1a migration round-trip proof.
 *
 * Runs the FULL UP migration inside a self-managed BEGIN..ROLLBACK against the live DB
 * (apply-migration.js dry-run does NOT execute SQL, so this probe is the real validation —
 * established recipe from SD-LEO-INFRA-BULK-PURGE-LIVE-001 / REVIVE-EVA-PURGE-MGMT-REVIEWS-001):
 *   - schema fingerprint (information_schema.columns over the 5 touched tables) before == after
 *   - in-transaction asserts: backfill exactness, legacy columns untouched, naming fix scoped
 *
 * IDEMPOTENT BY DESIGN: the UP uses ADD COLUMN IF NOT EXISTS + IS NULL-guarded backfills +
 * name-guarded UPDATE, so this test passes identically BEFORE and AFTER the live apply.
 *
 * Static UP/DOWN parity tests run regardless of DB availability.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../');
const UP_PATH = resolve(REPO_ROOT, 'database/migrations/20260610_initiative_backbone_a1a.sql');
const DOWN_PATH = resolve(REPO_ROOT, 'database/migrations/20260610_initiative_backbone_a1a_DOWN.sql');
const UP_SQL = readFileSync(UP_PATH, 'utf8');
const DOWN_SQL = readFileSync(DOWN_PATH, 'utf8');

const A1A_COLUMNS = [
  ['objectives', 'eva_vision_id'],
  ['okr_generation_log', 'eva_vision_id'],
  ['eva_vision_documents', 'mission_id'],
  ['strategic_directives_v2', 'initiative_id'],
  ['roadmap_waves', 'initiative_id'],
];

describe('A1a migration — static UP/DOWN parity', () => {
  it('UP adds exactly the 5 contract columns (ADD COLUMN IF NOT EXISTS)', () => {
    for (const [table, col] of A1A_COLUMNS) {
      const re = new RegExp(`ALTER TABLE ${table}\\s+ADD COLUMN IF NOT EXISTS ${col}\\b`);
      expect(UP_SQL, `UP missing ${table}.${col}`).toMatch(re);
    }
    // count STATEMENTS (the safety comment block also mentions the phrase, so anchor on ALTER TABLE)
    expect((UP_SQL.match(/ALTER TABLE \w+\s+ADD COLUMN IF NOT EXISTS/g) || []).length).toBe(5);
  });

  it('DOWN drops exactly the same 5 columns (column-explicit) and restores the companies name', () => {
    for (const [table, col] of A1A_COLUMNS) {
      const re = new RegExp(`ALTER TABLE ${table}\\s+DROP COLUMN IF EXISTS ${col}\\b`);
      expect(DOWN_SQL, `DOWN missing ${table}.${col}`).toMatch(re);
    }
    expect((DOWN_SQL.match(/DROP COLUMN IF EXISTS/g) || []).length).toBe(5);
    expect(DOWN_SQL).toMatch(/SET name = 'Executive Holdings Global'/);
    expect(DOWN_SQL).toMatch(/AND name = 'ExecHoldings Global'/);
  });

  it('UP never touches the legacy vision_id columns or strategic_vision data', () => {
    // The ONLY strategic_vision references must be read-side (IN (SELECT id FROM strategic_vision))
    // and the pre-flight count assert — never UPDATE/ALTER/DROP against it.
    expect(UP_SQL).not.toMatch(/UPDATE\s+strategic_vision/i);
    expect(UP_SQL).not.toMatch(/ALTER\s+TABLE\s+strategic_vision/i);
    expect(UP_SQL).not.toMatch(/DROP\s+/i);
    // legacy columns: never assigned
    expect(UP_SQL).not.toMatch(/SET\s+vision_id\s*=/i);
  });

  it('UP backfills are idempotent (IS NULL-guarded) and key-resolved (no hardcoded vision/mission ids)', () => {
    // 2 backfill guards (WHERE x.eva_vision_id IS NULL) + 2 post-assert checks reuse the phrase
    expect((UP_SQL.match(/\.eva_vision_id IS NULL/g) || []).length).toBe(2);
    expect((UP_SQL.match(/eva_vision_id IS NULL/g) || []).length).toBe(4);
    expect(UP_SQL).toMatch(/mission_id IS NULL/);
    expect(UP_SQL).toMatch(/vision_key = 'VISION-EHG-L1-001'/);
    expect(UP_SQL).toMatch(/venture_id IS NULL/);
    // the only hardcoded UUID allowed is the id-anchored companies row
    const uuids = UP_SQL.match(/'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'/g) || [];
    expect(uuids.every(u => u === "'b933ecb0-a9d4-47b0-a4cb-ec21a6031475'"), 'unexpected hardcoded UUID in UP').toBe(true);
  });
});

const POOLER = process.env.SUPABASE_POOLER_URL;

describe.skipIf(!POOLER)('A1a migration — live BEGIN..ROLLBACK round-trip', () => {
  let client;
  const FINGERPRINT_SQL = `
    SELECT md5(string_agg(table_name || '.' || column_name || ':' || data_type || ':' || is_nullable, ',' ORDER BY table_name, ordinal_position)) AS fp
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name IN ('objectives','okr_generation_log','eva_vision_documents','strategic_directives_v2','roadmap_waves','companies','strategic_vision')`;

  beforeAll(async () => {
    const { Client } = await import('pg');
    client = new Client({ connectionString: POOLER });
    await client.connect();
  });

  afterAll(async () => {
    if (client) await client.end();
  });

  it('full UP executes in a transaction, asserts pass in-txn, and rollback restores the schema byte-identically', async () => {
    const before = (await client.query(FINGERPRINT_SQL)).rows[0].fp;
    const legacyBefore = (await client.query('SELECT count(*)::int AS n, count(vision_id)::int AS v FROM objectives')).rows[0];

    await client.query('BEGIN');
    try {
      await client.query(UP_SQL); // multi-statement simple-query — runs the whole UP incl. asserts

      // In-txn backfill exactness (TS-2)
      const obj = (await client.query(
        `SELECT count(*)::int AS n FROM objectives
          WHERE vision_id IN (SELECT id FROM strategic_vision) AND eva_vision_id IS NOT NULL`)).rows[0].n;
      const objPending = (await client.query(
        `SELECT count(*)::int AS n FROM objectives
          WHERE vision_id IN (SELECT id FROM strategic_vision) AND eva_vision_id IS NULL`)).rows[0].n;
      expect(objPending).toBe(0);
      expect(obj).toBeGreaterThanOrEqual(8); // 8 at authoring; >= guards against new legacy-rooted objectives

      const log = (await client.query(
        `SELECT count(*)::int AS n FROM okr_generation_log
          WHERE vision_id IN (SELECT id FROM strategic_vision) AND eva_vision_id IS NULL`)).rows[0].n;
      expect(log).toBe(0);

      const l1Mission = (await client.query(
        'SELECT count(*)::int AS n FROM eva_vision_documents WHERE mission_id IS NOT NULL')).rows[0].n;
      expect(l1Mission).toBe(1);

      const initiativeRows = (await client.query(
        `SELECT (SELECT count(initiative_id)::int FROM strategic_directives_v2) +
                (SELECT count(initiative_id)::int FROM roadmap_waves) AS n`)).rows[0].n;
      expect(initiativeRows).toBe(0); // forward-looking: nothing populated (TS-2)

      // Naming fix scoped (TS-4): old name gone, EHG record untouched
      const oldName = (await client.query(
        'SELECT count(*)::int AS n FROM companies WHERE name = \'Executive Holdings Global\'')).rows[0].n;
      expect(oldName).toBe(0);
      const ehgRec = (await client.query(
        'SELECT name FROM companies WHERE id = \'d73aac88-9dd1-402d-9f9f-ca21c2f8f89b\'')).rows[0];
      expect(ehgRec.name).toBe('EHG');

      // Legacy untouched in-txn (TS-3): same row/vision_id counts, strategic_vision row intact
      const legacyIn = (await client.query('SELECT count(*)::int AS n, count(vision_id)::int AS v FROM objectives')).rows[0];
      expect(legacyIn).toEqual(legacyBefore);
      const sv = (await client.query('SELECT count(*)::int AS n FROM strategic_vision')).rows[0].n;
      expect(sv).toBe(1);
    } finally {
      await client.query('ROLLBACK');
    }

    const after = (await client.query(FINGERPRINT_SQL)).rows[0].fp;
    expect(after, 'schema fingerprint changed across BEGIN..ROLLBACK').toBe(before); // TS-1
  }, 60_000);
});
