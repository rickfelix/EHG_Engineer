/**
 * Integration tests for lib/sd-park.js park() / unpark() against the LIVE
 * consolidated database — SD-LEO-INFRA-PARKED-STATUS-REPLACE-001 (TS-1..TS-6).
 *
 * ZERO-LEAK contract: every test runs inside ONE outer real transaction that is
 * ROLLED BACK in afterAll. The real lib issues its own BEGIN/COMMIT/ROLLBACK, so
 * we hand it a SAVEPOINT-translating wrapper (savepointClient): the lib's
 * BEGIN -> SAVEPOINT, COMMIT -> RELEASE SAVEPOINT, ROLLBACK -> ROLLBACK TO
 * SAVEPOINT. Nothing the lib "commits" actually commits — the outer ROLLBACK
 * discards every seeded row (and its governance_audit row) together. We do NOT
 * use INSERT-then-afterEach-DELETE (a prior SD leaked 2327 rows that way).
 *
 * The REAL lib/sd-park.js is imported and exercised verbatim; it is never
 * reimplemented here. Throwaway rows use a unique RUN_ID and are seeded inside
 * the rolled-back txn; the real SD-LEO-INFRA-PARKED-STATUS-REPLACE-001 and any
 * SD-TEST-* fixture are never touched.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { HAS_REAL_DB } from '../helpers/db-available.js';
import { park, unpark, PARK_STATUS } from '../../lib/sd-park.js';

const describeDb = describe.skipIf(!HAS_REAL_DB);

const RUN_ID = `PARKTEST-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const sdKeyFor = (suffix) => `SD-${RUN_ID}-${suffix}`;

let rawClient;          // the real pg Client (one outer txn)
let savepointClient;    // wrapper handed to park()/unpark()
let spCounter = 0;

/**
 * Wrap a connected pg client so that the lib's transaction control nests inside
 * the outer transaction via SAVEPOINTs instead of committing for real.
 */
function makeSavepointClient(client) {
  let activeSp = null;
  return {
    _raw: client,
    async query(sql, params) {
      if (typeof sql === 'string') {
        const t = sql.trim().toUpperCase();
        if (t === 'BEGIN') {
          activeSp = `sp_park_${++spCounter}`;
          return client.query(`SAVEPOINT ${activeSp}`);
        }
        if (t === 'COMMIT') {
          const sp = activeSp; activeSp = null;
          return client.query(`RELEASE SAVEPOINT ${sp}`);
        }
        if (t === 'ROLLBACK') {
          const sp = activeSp; activeSp = null;
          // Roll back to and release the savepoint so the outer txn stays usable.
          await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
          return client.query(`RELEASE SAVEPOINT ${sp}`);
        }
      }
      return client.query(sql, params);
    },
  };
}

/** Seed a throwaway SD inside the outer txn. Non-EXEC actor (doctrine guard). */
async function seedSd(suffix, { status = 'in_progress', current_phase = 'EXEC', progress = 0, metadata = {} } = {}) {
  const sdKey = sdKeyFor(suffix);
  const id = sdKey; // strategic_directives_v2.id is varchar; use the key as id
  await rawClient.query(
    `INSERT INTO strategic_directives_v2
       (id, sd_key, title, status, category, priority, description, rationale, scope,
        current_phase, progress, metadata, created_by, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14)`,
    [
      id, sdKey, `Throwaway park test ${suffix}`, status, 'infrastructure', 'low',
      `Throwaway row for ${RUN_ID} ${suffix}. Safe to roll back.`,
      `Regression fixture for SD-LEO-INFRA-PARKED-STATUS-REPLACE-001 (${suffix}).`,
      `Seeded inside a rolled-back transaction; never committed.`,
      current_phase, progress, JSON.stringify(metadata), 'TEST', 'TEST',
    ],
  );
  return sdKey;
}

async function readSd(sdKey) {
  const { rows } = await rawClient.query(
    `SELECT sd_key, status, current_phase, progress, is_working_on,
            claiming_session_id, active_session_id, metadata
       FROM strategic_directives_v2 WHERE sd_key=$1`,
    [sdKey],
  );
  return rows[0];
}

describeDb('lib/sd-park.js park()/unpark() — live DB, savepoint-isolated', () => {
  beforeAll(async () => {
    const { createDatabaseClient } = await import('../../lib/supabase-connection.js');
    rawClient = await createDatabaseClient('engineer');
    await rawClient.query('BEGIN'); // outer txn — rolled back in afterAll
    savepointClient = makeSavepointClient(rawClient);
  });

  afterAll(async () => {
    if (rawClient) {
      // Discard EVERYTHING seeded this run — zero rows reach prod.
      await rawClient.query('ROLLBACK');
      // Sanity: confirm none of our throwaway SDs survived the rollback.
      const { rows } = await rawClient.query(
        `SELECT count(*)::int AS n FROM strategic_directives_v2 WHERE sd_key LIKE $1`,
        [`SD-${RUN_ID}-%`],
      );
      expect(rows[0].n).toBe(0);
      await rawClient.end();
    }
  });

  // Each test gets its own savepoint so a seed in one test never bleeds into the
  // next, while the outer txn (and its single final ROLLBACK) still owns cleanup.
  let testSp;
  beforeEach(async () => {
    testSp = `sp_test_${++spCounter}`;
    await rawClient.query(`SAVEPOINT ${testSp}`);
    return async () => {
      await rawClient.query(`ROLLBACK TO SAVEPOINT ${testSp}`);
      await rawClient.query(`RELEASE SAVEPOINT ${testSp}`);
    };
  });

  it('TS: park sets status=deferred, clears claim flags, leaves current_phase UNCHANGED, writes park metadata', async () => {
    const sdKey = await seedSd('basic', { status: 'in_progress', current_phase: 'EXEC', progress: 40 });
    const before = await readSd(sdKey);

    const res = await park(savepointClient, sdKey, { reason: 'parking for TS', actor: 'PLAN' });
    expect(res.status).toBe(PARK_STATUS);
    expect(res.parked_from_status).toBe('in_progress');

    const after = await readSd(sdKey);
    expect(after.status).toBe('deferred');
    expect(after.is_working_on).toBe(false);
    expect(after.claiming_session_id).toBeNull();
    expect(after.active_session_id).toBeNull();
    // current_phase must be untouched by park.
    expect(after.current_phase).toBe(before.current_phase);
    expect(after.current_phase).toBe('EXEC');
    // park metadata recorded.
    expect(after.metadata.park_reason).toBe('parking for TS');
    expect(after.metadata.parked_from_status).toBe('in_progress');
    expect(after.metadata.parked_by).toBe('PLAN');
    expect(after.metadata.parked_at).toBeTruthy();
  });

  it('TS-4: claim release spans BOTH tables; claude_sessions sd_key+worktree_path+worktree_branch cleared together (consistency check holds, txn commits)', async () => {
    const sdKey = await seedSd('claim', { status: 'in_progress', current_phase: 'EXEC', progress: 30 });
    const sessionId = `sess-${RUN_ID}-claim`;
    // Mark the SD as claimed by this session.
    await rawClient.query(
      `UPDATE strategic_directives_v2 SET is_working_on=true, claiming_session_id=$2, active_session_id=$2 WHERE sd_key=$1`,
      [sdKey, sessionId],
    );
    // Seed a claude_sessions row holding the claim WITH worktree fields set.
    await rawClient.query(
      `INSERT INTO claude_sessions (session_id, sd_key, worktree_path, worktree_branch, status)
       VALUES ($1,$2,$3,$4,'active')`,
      [sessionId, sdKey, `C:/wt/${RUN_ID}`, `feat/${RUN_ID}`],
    );

    // park must COMMIT successfully — i.e. the worktree-consistency CHECK is satisfied
    // because sd_key + worktree_path + worktree_branch are cleared in the SAME update.
    await park(savepointClient, sdKey, { reason: 'release claim', actor: 'PLAN' });

    const sd = await readSd(sdKey);
    expect(sd.claiming_session_id).toBeNull();
    expect(sd.active_session_id).toBeNull();
    expect(sd.is_working_on).toBe(false);

    const { rows: sess } = await rawClient.query(
      `SELECT sd_key, worktree_path, worktree_branch, status FROM claude_sessions WHERE session_id=$1`,
      [sessionId],
    );
    expect(sess.length).toBe(1);
    expect(sess[0].sd_key).toBeNull();
    expect(sess[0].worktree_path).toBeNull();
    expect(sess[0].worktree_branch).toBeNull();
    expect(sess[0].status).toBe('idle');
  });

  it('TS-1: a parked SD is ABSENT from v_sd_next_candidates while a non-parked control still appears', async () => {
    // Seed a temporary ACTIVE baseline (partial-unique idx allows exactly one;
    // there are currently zero) + two baseline items: parked + active control.
    const parkedKey = await seedSd('view-parked', { status: 'active', current_phase: 'LEAD', progress: 0 });
    const controlKey = await seedSd('view-control', { status: 'active', current_phase: 'LEAD', progress: 0 });
    const { rows: bl } = await rawClient.query(
      `INSERT INTO sd_execution_baselines (baseline_name, baseline_type, is_active, created_by)
       VALUES ($1,'test',true,'TEST') RETURNING id`,
      [`baseline-${RUN_ID}`],
    );
    const baselineId = bl[0].id;
    await rawClient.query(
      `INSERT INTO sd_baseline_items (baseline_id, sd_id, sequence_rank, dependencies_snapshot)
       VALUES ($1,$2,1,'[]'::jsonb), ($1,$3,2,'[]'::jsonb)`,
      [baselineId, parkedKey, controlKey],
    );

    // Before park: both appear in the candidate view.
    const beforeRows = await rawClient.query(
      `SELECT sd_id FROM v_sd_next_candidates WHERE sd_id IN ($1,$2)`,
      [parkedKey, controlKey],
    );
    const beforeSet = beforeRows.rows.map((r) => r.sd_id).sort();
    expect(beforeSet).toEqual([controlKey, parkedKey].sort());

    // Park one of them.
    await park(savepointClient, parkedKey, { reason: 'hide from queue', actor: 'PLAN' });

    // After park: parked SD returns ZERO rows; control still present.
    const parkedRows = await rawClient.query(
      `SELECT sd_id FROM v_sd_next_candidates WHERE sd_id=$1`,
      [parkedKey],
    );
    expect(parkedRows.rows.length).toBe(0);

    const controlRows = await rawClient.query(
      `SELECT sd_id FROM v_sd_next_candidates WHERE sd_id=$1`,
      [controlKey],
    );
    expect(controlRows.rows.length).toBe(1);

    // And the parked SD's status is not in the positive-allowlist selector set
    // (draft/active/in_progress/planning) that work-selection paths key on.
    const sd = await readSd(parkedKey);
    expect(['draft', 'active', 'in_progress', 'planning']).not.toContain(sd.status);
    expect(sd.status).toBe('deferred');
  });

  it('TS-2: park fires NEITHER trg_reset_patterns_on_sd_cancel NOR trigger_retro_notification', async () => {
    const sdKey = await seedSd('cascades', { status: 'in_progress', current_phase: 'EXEC', progress: 20 });
    // Assign an issue_patterns row to the SD.
    const patternId = `PAT-${RUN_ID}`;
    await rawClient.query(
      `INSERT INTO issue_patterns (pattern_id, category, issue_summary, severity, status, occurrence_count, assigned_sd_id)
       VALUES ($1,'process','throwaway park-cascade fixture','medium','assigned',1,$2)`,
      [patternId, sdKey],
    );
    // Snapshot retro_notifications count for this SD (by sd_id = the SD id/key).
    const retroBefore = await rawClient.query(
      `SELECT count(*)::int AS n FROM retro_notifications WHERE sd_id=$1`,
      [sdKey],
    );

    await park(savepointClient, sdKey, { reason: 'no cascades', actor: 'PLAN' });

    // issue_patterns assignment unchanged — the cancel trigger (status->cancelled) did NOT fire.
    const { rows: pat } = await rawClient.query(
      `SELECT status, assigned_sd_id FROM issue_patterns WHERE pattern_id=$1`,
      [patternId],
    );
    expect(pat[0].assigned_sd_id).toBe(sdKey);
    expect(pat[0].status).toBe('assigned');

    // retro_notifications count unchanged — the completion trigger did NOT fire.
    const retroAfter = await rawClient.query(
      `SELECT count(*)::int AS n FROM retro_notifications WHERE sd_id=$1`,
      [sdKey],
    );
    expect(retroAfter.rows[0].n).toBe(retroBefore.rows[0].n);
  });

  it('TS-3: progress>=100 & current_phase=EXEC edge -> status=deferred, progress=99, metadata.parked_progress_original=100 (NOT pending_approval)', async () => {
    const sdKey = await seedSd('edge', { status: 'in_progress', current_phase: 'EXEC', progress: 100 });

    const res = await park(savepointClient, sdKey, { reason: 'park at 100', actor: 'PLAN' });
    expect(res.edge).toBe(true);

    const after = await readSd(sdKey);
    expect(after.status).toBe('deferred');
    expect(after.status).not.toBe('pending_approval');
    expect(after.progress).toBe(99);
    expect(after.current_phase).toBe('EXEC'); // unchanged
    // metadata stores the original progress (JSON number).
    expect(Number(after.metadata.parked_progress_original)).toBe(100);
  });

  it('TS-5: park -> unpark round-trip restores the workable status and strips park_* metadata', async () => {
    const sdKey = await seedSd('roundtrip', { status: 'active', current_phase: 'LEAD', progress: 0, metadata: { keep_me: 'yes' } });
    const before = await readSd(sdKey);

    await park(savepointClient, sdKey, { reason: 'temporary', actor: 'PLAN' });
    const parked = await readSd(sdKey);
    expect(parked.status).toBe('deferred');
    expect(parked.metadata.park_reason).toBe('temporary');

    const res = await unpark(savepointClient, sdKey, { actor: 'PLAN' });
    expect(res.status).toBe('active'); // restored to the pre-park workable status

    const after = await readSd(sdKey);
    expect(after.status).toBe('active');
    expect(after.current_phase).toBe(before.current_phase); // never touched
    // All park_* keys stripped; unrelated metadata preserved.
    expect(after.metadata.park_reason).toBeUndefined();
    expect(after.metadata.parked_at).toBeUndefined();
    expect(after.metadata.parked_by).toBeUndefined();
    expect(after.metadata.parked_from_status).toBeUndefined();
    expect(after.metadata.parked_progress_original).toBeUndefined();
    expect(after.metadata.keep_me).toBe('yes');
  });

  it('TS-5b: unpark of an SD parked from the 100/EXEC edge -> persisted status=pending_approval, and unpark returns that truthfully', async () => {
    const sdKey = await seedSd('edge-unpark', { status: 'in_progress', current_phase: 'EXEC', progress: 100 });

    await park(savepointClient, sdKey, { reason: 'park at edge', actor: 'PLAN' });
    const parked = await readSd(sdKey);
    expect(parked.status).toBe('deferred');
    expect(parked.progress).toBe(99);

    // unpark restores progress->100 in EXEC, so auto_transition_status flips
    // status to 'pending_approval'. unpark must RETURN the actual persisted status.
    const res = await unpark(savepointClient, sdKey, { actor: 'PLAN' });
    const after = await readSd(sdKey);
    expect(after.progress).toBe(100);
    expect(after.status).toBe('pending_approval');
    expect(res.status).toBe('pending_approval'); // truthful contract: returns the persisted status, not the request
  });

  it('TS-6: park rejects actor=EXEC (throws) and leaves the SD status UNCHANGED (no DB write)', async () => {
    const sdKey = await seedSd('exec-actor', { status: 'in_progress', current_phase: 'EXEC', progress: 50 });

    await expect(
      park(savepointClient, sdKey, { reason: 'should be rejected', actor: 'EXEC' }),
    ).rejects.toThrow(/non-EXEC actor/i);

    // Status untouched — the guard fired before any persistence.
    const after = await readSd(sdKey);
    expect(after.status).toBe('in_progress');
    expect(after.metadata.park_reason).toBeUndefined();
  });
});
