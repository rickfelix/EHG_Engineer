/**
 * Integration test: delete_venture full teardown WITH TRIGGERS ON.
 * SD-LEO-FEAT-CHAIRMAN-VENTURE-DELETE-001 / hotfix 2 (feedback 881cf53f)
 *
 * Regression guard for the replica-mode blindspot: the original cascade test ran under
 * session_replication_role='replica', which disables triggers AND FK enforcement, so it
 * never caught that delete_venture was blocked for real ventures by (1) the append-only
 * security_audit_events FK, (2) 20 ON DELETE NO ACTION child tables, (3) the vision-doc
 * RESTRICT children. This test runs with triggers + FKs ON (NO replica mode) and seeds one
 * row of each blocker class, so a future regression of delete_venture fails loudly here.
 *
 * LIVE-gated: runs only when SUPABASE_POOLER_URL is set; always rolls back (no data kept).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';

const LIVE = !!process.env.SUPABASE_POOLER_URL;

describe.skipIf(!LIVE)('delete_venture full teardown (triggers ON, no replica)', () => {
  let pg, client;
  beforeAll(async () => {
    pg = (await import('pg')).default;
    client = new pg.Client({ connectionString: process.env.SUPABASE_POOLER_URL, ssl: { rejectUnauthorized: false } });
    await client.connect();
  });
  afterAll(async () => { if (client) await client.end(); });

  it('deletes a venture that has audit events, NO-ACTION children, and a vision doc with a score', async () => {
    const vid = randomUUID();
    const visionId = randomUUID();
    const vkey = 'VISION-TEST-TEARDOWN-' + Date.now();
    try {
      await client.query('BEGIN');
      // Seed under replica mode ONLY to get past the company-access INSERT trigger for
      // throwaway rows; the delete_venture call below runs with triggers + FKs ON.
      await client.query("SET LOCAL session_replication_role = 'replica'");

      await client.query(
        "INSERT INTO ventures (id, name, problem_statement, status) VALUES ($1,$2,$3,'active')",
        [vid, 'TEST Teardown Venture ' + Date.now(), 'teardown regression problem statement']
      );
      // Blocker 3: vision doc (CASCADE) + score (RESTRICT child)
      await client.query(
        "INSERT INTO eva_vision_documents (id, vision_key, level, venture_id, content) VALUES ($1,$2,'L2',$3,$4)",
        [visionId, vkey, vid, 'test vision content']
      );
      await client.query(
        `INSERT INTO eva_vision_scores (vision_id, total_score, dimension_scores, threshold_action, rubric_snapshot)
         VALUES ($1, 80, '{}'::jsonb, 'accept', '{}'::jsonb)`, [visionId]
      );
      // Blocker 2: a NO ACTION child
      await client.query('INSERT INTO factory_guardrail_state (venture_id) VALUES ($1)', [vid]);
      // Blocker 1: an append-only audit row referencing the venture
      await client.query(
        `INSERT INTO security_audit_events (event_type, severity, source_agent, occurred_at, integrity_hash, venture_id)
         VALUES ('nfkd_collision','info','test', now(), $1, $2)`, ['a'.repeat(64), vid]
      );

      // back to triggers + FK enforcement ON — this is the real test of delete_venture
      await client.query("SET LOCAL session_replication_role = 'origin'");
      const res = (await client.query('SELECT delete_venture($1) AS r', [vid])).rows[0].r;
      expect(res.success).toBe(true);

      // teardown removed the blocking children
      const gs = await client.query('SELECT count(*)::int n FROM factory_guardrail_state WHERE venture_id=$1', [vid]);
      expect(gs.rows[0].n).toBe(0);
      const sc = await client.query('SELECT count(*)::int n FROM eva_vision_scores WHERE vision_id=$1', [visionId]);
      expect(sc.rows[0].n).toBe(0);
      const vd = await client.query('SELECT count(*)::int n FROM eva_vision_documents WHERE id=$1', [visionId]);
      expect(vd.rows[0].n).toBe(0);
      const ven = await client.query('SELECT count(*)::int n FROM ventures WHERE id=$1', [vid]);
      expect(ven.rows[0].n).toBe(0);

      // audit history SURVIVES with venture_id intact (FK dropped, not SET NULL)
      const ae = await client.query('SELECT venture_id FROM security_audit_events WHERE venture_id=$1', [vid]);
      expect(ae.rows.length).toBe(1);
      expect(ae.rows[0].venture_id).toBe(vid);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});
