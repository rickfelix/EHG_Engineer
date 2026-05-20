/**
 * Regression test for SD-FDBK-GEN-FIX-TRG-ENFORCE-001 (closes harness_backlog 954df6ff).
 *
 * Locks in the corrected-parent guard added to enforce_parent_orchestrator_type(). The
 * AFTER-UPDATE-OF-parent_sd_id trigger force-promotes a child's parent to sd_type='orchestrator';
 * when the parent was deliberately corrected away from 'orchestrator' (recorded in
 * governance_metadata.type_change_history), that re-promotion re-enters the parent's
 * BEFORE-UPDATE governance chain and is hard-blocked by detect_type_change_gaming(). The fix
 * adds a NOT EXISTS guard so a corrected parent is skipped.
 *
 * This test validates the EXACT guard predicate (the migration's WHERE clause) against
 * representative governance_metadata values via read-only SELECTs, plus that
 * detect_type_change_gaming() is unchanged. The full trigger before/after was independently
 * reproduced (rollback-only) by the database-agent at LEAD (sub_agent_execution_results 502c4491)
 * and is re-verified at apply-time.
 *
 * Runs against the live linked DB (read-only); skips when no service-role key is available
 * (e.g. CI without secrets). On Windows the project's .env injection handles DISABLE_SSL_VERIFY.
 */
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { createDatabaseClient } from '../../lib/supabase-connection.js';

const HAS_DB = Boolean(
  (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) && process.env.SUPABASE_SERVICE_ROLE_KEY
);
const skipIfNoDb = HAS_DB ? test : test.skip;

// Mirrors the migration guard exactly. $1 = full governance_metadata jsonb (or null).
// is_exempt=true means "a from='orchestrator' entry exists" => the parent UPDATE is suppressed
// (parent NOT re-promoted). is_exempt=false means the parent auto-promotes as before.
const GUARD_SQL = `SELECT EXISTS (
  SELECT 1 FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(COALESCE($1::jsonb, '{}'::jsonb) -> 'type_change_history') = 'array'
         THEN COALESCE($1::jsonb, '{}'::jsonb) -> 'type_change_history' ELSE '[]'::jsonb END
  ) AS h WHERE h ->> 'from' = 'orchestrator'
) AS is_exempt`;

let client;
beforeAll(async () => {
  if (HAS_DB) client = await createDatabaseClient('engineer', { verify: false });
});
afterAll(async () => {
  if (client) await client.end();
});

async function isExempt(gm) {
  const arg = gm === null ? null : JSON.stringify(gm);
  const r = await client.query(GUARD_SQL, [arg]);
  return r.rows[0].is_exempt;
}

describe('enforce_parent_orchestrator_type corrected-parent guard (954df6ff)', () => {
  skipIfNoDb('class a: corrected parent (single from=orchestrator) is exempt from re-promotion', async () => {
    expect(await isExempt({ type_change_history: [{ from: 'orchestrator', to: 'feature' }] })).toBe(true);
  });

  skipIfNoDb("class a': from='orchestrator' anywhere in a multi-element history matches", async () => {
    expect(await isExempt({ type_change_history: [{ from: 'feature', to: 'feature' }, { from: 'orchestrator', to: 'feature' }] })).toBe(true);
  });

  skipIfNoDb('class b: uncorrected parent (feature->orchestrator only) is NOT exempt (still auto-promotes)', async () => {
    expect(await isExempt({ type_change_history: [{ from: 'feature', to: 'orchestrator' }] })).toBe(false);
  });

  skipIfNoDb('class d: empty / absent / null history is treated as uncorrected', async () => {
    expect(await isExempt({ type_change_history: [] })).toBe(false);
    expect(await isExempt({})).toBe(false);
    expect(await isExempt(null)).toBe(false);
  });

  skipIfNoDb('class d: a non-array type_change_history is handled without error (no SQLSTATE 22023)', async () => {
    expect(await isExempt({ type_change_history: { from: 'orchestrator' } })).toBe(false);
  });

  skipIfNoDb('class c: detect_type_change_gaming() verdict is unchanged for a genuine gaming reason', async () => {
    const r = await client.query("SELECT detect_type_change_gaming('feature'::text,'infrastructure'::text,'reduce threshold to bypass the gate') AS g");
    expect(r.rows[0].g).toBe(true);
  });
});
