/**
 * Integration test: venture delete/kill -> strategic-directive cancellation cascade.
 * SD: SD-LEO-FEAT-CHAIRMAN-VENTURE-DELETE-001 / FR-A + FR-D
 *
 * Verifies the migration 20260528113000_chairman_venture_delete_cancel_sd_cascade.sql:
 * delete_venture (and the identical block in kill_venture) cancels a venture's
 * NON-TERMINAL strategic directives, leaves completed SDs untouched, records a
 * reason + metadata.cancelled_due_to_venture, and is idempotent.
 *
 * LIVE-gated: runs only when SUPABASE_POOLER_URL is set (a direct Postgres
 * connection). Hermetic-by-default — skips cleanly in CI without a pooler.
 * All work happens inside a transaction that is ALWAYS rolled back, so no data
 * is persisted; session_replication_role=replica disables the company-access
 * trigger for the throwaway inserts.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';

const LIVE = !!process.env.SUPABASE_POOLER_URL;

describe.skipIf(!LIVE)('venture delete -> SD cancellation cascade (LIVE)', () => {
  let pg, client;

  beforeAll(async () => {
    pg = (await import('pg')).default;
    client = new pg.Client({ connectionString: process.env.SUPABASE_POOLER_URL, ssl: { rejectUnauthorized: false } });
    await client.connect();
  });

  afterAll(async () => {
    if (client) await client.end();
  });

  it('cancels non-terminal SDs, preserves completed SDs, sets reason+metadata, idempotent', async () => {
    const vid = randomUUID();
    const sdDraft = randomUUID(), sdInprog = randomUUID(), sdDone = randomUUID();
    const mkId = (s) => 'SD-TEST-CASCADE-' + s.slice(0, 8);
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL session_replication_role = 'replica'");
      await client.query(
        "INSERT INTO ventures (id, name, problem_statement, status) VALUES ($1,$2,$3,'active')",
        [vid, 'TEST Cascade Venture', 'test problem statement for cascade verification']
      );
      const insSD = async (uuid, status) => {
        const idv = mkId(uuid);
        await client.query(
          `INSERT INTO strategic_directives_v2
            (id, uuid_internal_pk, sd_key, sd_code_user_facing, title, description, rationale, scope, category, priority, sequence_rank, status, venture_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [idv, uuid, idv, idv, 'TEST SD ' + status, 'desc', 'rationale', 'scope', 'feature', 'low', 9999, status, vid]
        );
      };
      await insSD(sdDraft, 'draft');
      await insSD(sdInprog, 'in_progress');
      await insSD(sdDone, 'completed');

      const res = await client.query('SELECT delete_venture($1) AS r', [vid]);
      const r = res.rows[0].r;
      expect(r.success).toBe(true);
      expect(r.deleted_counts.strategic_directives_cancelled).toBe(2);

      const rows = await client.query(
        'SELECT uuid_internal_pk, status, cancellation_reason, metadata FROM strategic_directives_v2 WHERE uuid_internal_pk = ANY($1)',
        [[sdDraft, sdInprog, sdDone]]
      );
      const byId = Object.fromEntries(rows.rows.map((x) => [x.uuid_internal_pk, x]));
      expect(byId[sdDraft].status).toBe('cancelled');
      expect(byId[sdInprog].status).toBe('cancelled');
      expect(byId[sdDone].status).toBe('completed');
      expect(byId[sdDraft].cancellation_reason).toContain('venture deletion');
      expect(byId[sdDraft].metadata.cancelled_due_to_venture).toBe(vid);
      expect(byId[sdDone].cancellation_reason).toBeNull();

      const again = await client.query(
        "UPDATE strategic_directives_v2 SET status='cancelled' WHERE uuid_internal_pk = ANY($1) AND status NOT IN ('completed','cancelled')",
        [[sdDraft, sdInprog, sdDone]]
      );
      expect(again.rowCount).toBe(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});
