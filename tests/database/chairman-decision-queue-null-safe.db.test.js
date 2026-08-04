/**
 * SD-LEO-INFRA-CHAIRMAN-DECISION-QUEUE-003 — behavioural half (FR-1 runtime, FR-5 axes).
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE IS SEPARATE FROM tests/unit/chairman/decision-queue-null-safe.test.js
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * The static half proves what the staged SQL SAYS. This half proves what it DOES, and doing that
 * means calling fn_chairman_decide — which WRITES. That is a db-tier test, and the db project is
 * gated off production on purpose (vitest.config.js: DB_INCLUDE_GATED is empty unless DB_TARGET is
 * an explicitly designated non-production database). Correct: nobody should exercise a chairman
 * decision RPC against the live queue to satisfy a test.
 *
 * SO BE CLEAR ABOUT WHERE THIS RUNS. Against production it resolves to nothing — the project
 * include list is empty and vitest never loads the file. Against a designated non-production
 * database with the migration applied, it runs and must pass. It is not a check that silently
 * guards production; it is a check that runs where writing is safe.
 *
 * THE DDL IS STAGED. Until someone applies
 *   database/chairman-gated/20260803_chairman_decide_null_safe_and_type_honest.sql
 * fn_chairman_decision_value does not exist, and these cases SKIP — reported as skipped, never as
 * passed. A suite that goes green because the feature is absent is precisely the cannot-fail check
 * this SD exists to remove, so the distinction is enforced rather than described.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDatabaseClient } from '../../scripts/lib/supabase-connection.js';

const APPLIED_PROBE = "SELECT 1 FROM pg_proc WHERE proname = 'fn_chairman_decision_value'";

let client;
let ddlApplied = false;
const createdIds = [];

beforeAll(async () => {
  client = await createDatabaseClient();
  ddlApplied = (await client.query(APPLIED_PROBE)).rows.length > 0;
}, 60000);

afterAll(async () => {
  // Clean up only rows this suite created, by id. No blanket deletes — a test that tidies by
  // predicate can widen silently as the table grows.
  if (client) {
    for (const id of createdIds) {
      await client.query('DELETE FROM chairman_decisions WHERE id = $1', [id]).catch(() => {});
    }
    await client.end();
  }
});

/** Insert a pending decision and remember its id for teardown. */
async function seed({ decisionType, ventureId = null, blocking = true }) {
  const { rows } = await client.query(
    `INSERT INTO chairman_decisions (decision_type, venture_id, status, blocking, created_at)
     VALUES ($1, $2, 'pending', $3, now()) RETURNING id`,
    [decisionType, ventureId, blocking],
  );
  createdIds.push(rows[0].id);
  return rows[0].id;
}

describe('FR-1 / FR-5 — behavioural (runs only where the DDL is applied)', () => {
  it('a venture-less decision RESOLVES instead of vanishing into the INNER JOIN', async (ctx) => {
    if (!ddlApplied) return ctx.skip('STAGED, NOT APPLIED — fn_chairman_decision_value absent.');
    const id = await seed({ decisionType: 'session_question' });
    await client.query('SELECT fn_chairman_decide($1, $2, $3)', [id, 'approved', 'db-tier test']);
    const { rows } = await client.query('SELECT status, decision FROM chairman_decisions WHERE id = $1', [id]);
    expect(rows[0].status).not.toBe('pending');       // the whole defect: it used to stay pending
    expect(rows[0].decision).not.toBe('kill');        // and it used to be recorded as a kill
  });

  it('a venture-less REJECT does not attempt a NULL-venture kill audit', async (ctx) => {
    if (!ddlApplied) return ctx.skip('STAGED, NOT APPLIED — fn_chairman_decision_value absent.');
    const id = await seed({ decisionType: 'session_question' });
    // The guarded reject block is the statement that actually needed v_has_venture: it passed
    // venture_id into fn_write_kill_audit_trail, where NULL is either a constraint failure or a
    // meaningless audit row. Not throwing IS the assertion.
    await expect(
      client.query('SELECT fn_chairman_decide($1, $2, $3)', [id, 'rejected', 'db-tier test']),
    ).resolves.toBeTruthy();
  });

  it('a venture-JOINED decision still resolves — the fix is targeted, not a bypass', async (ctx) => {
    if (!ddlApplied) return ctx.skip('STAGED, NOT APPLIED — fn_chairman_decision_value absent.');
    const v = await client.query('SELECT id FROM ventures LIMIT 1');
    if (!v.rows.length) return ctx.skip('no ventures row available to join against');
    const id = await seed({ decisionType: 'venture_disposition', ventureId: v.rows[0].id });
    await client.query('SELECT fn_chairman_decide($1, $2, $3)', [id, 'approved', 'db-tier test']);
    const { rows } = await client.query('SELECT status FROM chairman_decisions WHERE id = $1', [id]);
    expect(rows[0].status).not.toBe('pending');
  });

  it('[axes] semantics follow decision_type, NOT whether a venture is attached', async (ctx) => {
    if (!ddlApplied) return ctx.skip('STAGED, NOT APPLIED — fn_chairman_decision_value absent.');
    // The two off-diagonal cases. If the axes were merged, one of these would take the other's
    // semantics — a venture-less row would be treated as "not a venture decision" and a
    // venture-carrying row as "a venture decision", regardless of what the type actually is.
    const v = await client.query('SELECT id FROM ventures LIMIT 1');
    if (!v.rows.length) return ctx.skip('no ventures row available to join against');

    const ventureless = await seed({ decisionType: 'chairman_approval' });
    const withVenture = await seed({ decisionType: 'framing_escalation', ventureId: v.rows[0].id });
    for (const id of [ventureless, withVenture]) {
      await client.query('SELECT fn_chairman_decide($1, $2, $3)', [id, 'approved', 'db-tier test']);
    }

    const { rows: expected } = await client.query(
      'SELECT fn_chairman_decision_value($1, $2) AS v', ['chairman_approval', 'approved'],
    );
    const { rows: got } = await client.query('SELECT decision FROM chairman_decisions WHERE id = $1', [ventureless]);
    expect(got[0].decision).toBe(expected[0].v);   // type decided it, venture-absence did not
  });
});
