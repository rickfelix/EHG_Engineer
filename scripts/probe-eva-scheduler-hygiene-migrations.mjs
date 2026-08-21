#!/usr/bin/env node
/**
 * Prospective validation for SD-LEO-INFRA-EVA-SCHEDULER-HYGIENE-001 (FR-2 + FR-4).
 *
 * Runs all four chairman-gated migrations inside a self-managed BEGIN ... ROLLBACK so they touch NO
 * committed data, but prove end-to-end that: the asserts pass, the purge empties the killed-venture
 * backlog, the DOWN restores value-identically, the widened CHECK accepts 'cancelled', and the
 * kill-time teardown fires for a venture killed by a DIRECT `UPDATE ventures SET status='cancelled'`
 * (the signature that bypasses kill_venture() and accounts for the majority of the live backlog).
 *
 * WHY A PROBE AND NOT A TEST: `apply-migration.js --dry-run` does NOT execute SQL (the
 * BULK-PURGE-LIVE-001 lesson), and the vitest db tier is fail-closed with DESIGNATED_NON_PROD_REFS
 * deliberately EMPTY (QF-20260726-459), so no vitest suite can reach a database today. This is the
 * only way to actually execute the SQL without applying it. Mirrors scripts/probe-purge-migration.mjs.
 *
 * SAFETY: single transaction, ROLLBACK in `finally`, never COMMIT. Holds ACCESS EXCLUSIVE on
 * eva_scheduler_queue and eva_ventures for the (sub-second) probe, exactly as the real apply would.
 * The finally block re-reads live state and FAILS the probe if anything leaked.
 *
 * Usage: node scripts/probe-eva-scheduler-hygiene-migrations.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabaseClient } from './lib/supabase-connection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const M = (f) => path.resolve(__dirname, '..', 'database', 'migrations', f);
const read = (f) => fs.readFileSync(M(f), 'utf8');

const PURGE_UP    = read('20260821_purge_killed_venture_scheduler_queue.sql');
const PURGE_DOWN  = read('20260821_purge_killed_venture_scheduler_queue_DOWN.sql');
const WIDEN_UP    = read('20260821_eva_scheduler_queue_status_add_cancelled.sql');
const WIDEN_DOWN  = read('20260821_eva_scheduler_queue_status_add_cancelled_DOWN.sql');
const TEARDOWN_UP   = read('20260821_eva_scheduler_queue_kill_time_teardown.sql');
const TEARDOWN_DOWN = read('20260821_eva_scheduler_queue_kill_time_teardown_DOWN.sql');

const RUN = `ESQHYG-${Date.now()}`;
const results = [];
const firstLine = (msg) => String(msg).split(/\r?\n/)[0];
const record = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? '  ✅' : '  ❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const client = await createDatabaseClient('ehg');
const one = async (sql, params) => (await client.query(sql, params)).rows[0];
const n = async (sql, params) => Number((await one(sql, params)).n);

let sp = 0;

/** Run `fn` inside a savepoint so one failing arm cannot abort the whole probe. */
async function arm(name, fn) {
  const s = `sp_esqhyg_${++sp}`;
  await client.query(`SAVEPOINT ${s}`);
  try {
    await fn();
    await client.query(`RELEASE SAVEPOINT ${s}`);
  } catch (e) {
    await client.query(`ROLLBACK TO SAVEPOINT ${s}`);
    await client.query(`RELEASE SAVEPOINT ${s}`);
    record(name, false, `threw: ${firstLine(e.message)}`);
  }
}

/**
 * Run SQL that is EXPECTED to fail, inside its own nested savepoint.
 *
 * A swallowed SQL error leaves the transaction in the ABORTED state, so the very next statement —
 * including the enclosing RELEASE SAVEPOINT — dies with 25P02 "current transaction is aborted".
 * Rolling back to a dedicated savepoint is the only thing that clears it. Authoring this probe
 * without this helper produced four spurious 25P02 "failures" that looked like migration bugs.
 *
 * @returns {Promise<string|null>} the error message, or null if the statement unexpectedly succeeded
 */
async function expectFail(sql) {
  const s = `sp_esqhyg_ef_${++sp}`;
  await client.query(`SAVEPOINT ${s}`);
  try {
    await client.query(sql);
    await client.query(`RELEASE SAVEPOINT ${s}`);
    return null;
  } catch (e) {
    await client.query(`ROLLBACK TO SAVEPOINT ${s}`);
    await client.query(`RELEASE SAVEPOINT ${s}`);
    return e.message;
  }
}

let ok = false;
try {
  await client.query('BEGIN');
  console.log(`\nprobe ${RUN} — all work inside ONE transaction, rolled back at the end\n`);

  // ── Baseline ──────────────────────────────────────────────────────────────────────────────
  const totalBefore  = await n('SELECT count(*)::bigint AS n FROM eva_scheduler_queue');
  const killedBefore = await n(`SELECT count(*)::bigint AS n FROM eva_scheduler_queue q
                                JOIN eva_ventures v ON v.id = q.venture_id WHERE v.status = 'killed'`);
  const keepBefore   = totalBefore - killedBefore;
  // Order-independent full-content fingerprint, to prove the DOWN restores the table exactly.
  const fpQ = `SELECT md5(coalesce(string_agg(t.h, '' ORDER BY t.h), '')) AS fp
               FROM (SELECT md5(eva_scheduler_queue::text) AS h FROM eva_scheduler_queue) t`;
  const fpBefore = (await one(fpQ)).fp;
  console.log(`baseline: ${totalBefore} queue rows (${killedBefore} killed-venture, ${keepBefore} keep)\n`);

  // ── FR-2 UP ───────────────────────────────────────────────────────────────────────────────
  console.log('FR-2 purge UP');
  await arm('FR-2 UP executes and its own asserts pass', async () => {
    await client.query(PURGE_UP);
    const live = await n('SELECT count(*)::bigint AS n FROM eva_scheduler_queue');
    const quar = await n('SELECT count(*)::bigint AS n FROM eva_scheduler_queue_qkilled20260821');
    const left = await n(`SELECT count(*)::bigint AS n FROM eva_scheduler_queue q
                          JOIN eva_ventures v ON v.id = q.venture_id WHERE v.status='killed'`);
    record('FR-2 UP archived exactly the killed-venture rows', quar === killedBefore, `quarantine=${quar}, expected=${killedBefore}`);
    record('FR-2 UP left the keep-set untouched', live === keepBefore, `live=${live}, expected=${keepBefore}`);
    record('FR-2 UP cleared the hazard (0 queue rows for killed ventures)', left === 0, `remaining=${left}`);

    const sched = await n(`SELECT count(*)::bigint AS n FROM select_schedulable_ventures(1000) s
                           JOIN eva_ventures v ON v.id = s.venture_id WHERE v.status='killed'`);
    record('FR-2 UP: select_schedulable_ventures offers 0 killed ventures', sched === 0, `offered=${sched}`);
  });

  await arm('FR-2 UP is one-shot (re-run aborts on the existing quarantine)', async () => {
    const threw = await expectFail(PURGE_UP);
    record('FR-2 UP re-run aborts rather than clobbering the archive',
      !!threw && /already exists/i.test(threw), threw ? firstLine(threw) : 'did NOT throw');
  });

  // ── FR-2 DOWN ─────────────────────────────────────────────────────────────────────────────
  console.log('\nFR-2 purge DOWN');
  await arm('FR-2 DOWN executes and its own asserts pass', async () => {
    await client.query(PURGE_DOWN);
    const live = await n('SELECT count(*)::bigint AS n FROM eva_scheduler_queue');
    const fpAfter = (await one(fpQ)).fp;
    record('FR-2 DOWN restored every row', live === totalBefore, `live=${live}, expected=${totalBefore}`);
    record('FR-2 DOWN restored BYTE-IDENTICAL content (full-table fingerprint match)',
      fpAfter === fpBefore, fpAfter === fpBefore ? 'fingerprints equal' : `${fpBefore} != ${fpAfter}`);
    // THE POINT OF THE CATALOG-DRIVEN COLUMN LIST: a restore that dropped a writable column would
    // still pass a row-count assert. These three columns would silently revert to defaults.
    const diff = await n(
      `SELECT count(*)::bigint AS n FROM eva_scheduler_queue_qkilled20260821 q
       JOIN eva_scheduler_queue t ON t.id = q.id
       WHERE t.blocking_decision_age_seconds IS DISTINCT FROM q.blocking_decision_age_seconds
          OR t.updated_at IS DISTINCT FROM q.updated_at
          OR t.dispatch_count IS DISTINCT FROM q.dispatch_count`);
    record('FR-2 DOWN restored blocking_decision_age_seconds/updated_at/dispatch_count verbatim',
      diff === 0, `differing rows=${diff}`);
  });

  // ── FR-4 step 1: widen the CHECK ──────────────────────────────────────────────────────────
  console.log('\nFR-4 step 1: widen eva_scheduler_queue.status CHECK');
  await arm('FR-4.1 executes and its own asserts pass', async () => {
    await client.query(WIDEN_UP);
    const def = (await one(`SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint
                            WHERE conrelid='public.eva_scheduler_queue'::regclass
                              AND conname='eva_scheduler_queue_status_check'`)).d;
    const all6 = ['pending', 'dispatching', 'blocked', 'paused', 'completed', 'cancelled'].every((v) => def.includes(v));
    record('FR-4.1 constraint contains all 5 originals + cancelled', all6, def);
  });

  await arm('FR-4.1 is one-shot (re-run aborts as already-applied)', async () => {
    const threw = await expectFail(WIDEN_UP);
    record('FR-4.1 re-run aborts with already-permits-cancelled',
      !!threw && /already permits cancelled/i.test(threw), threw ? firstLine(threw) : 'did NOT throw');
  });

  // ── FR-4 step 2: the teardown function ────────────────────────────────────────────────────
  console.log('\nFR-4 step 2: kill-time teardown function');
  await arm('FR-4.2 executes and its own asserts pass', async () => {
    await client.query(TEARDOWN_UP);
    const src = (await one(`SELECT p.prosrc AS s FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
                            WHERE ns.nspname='public' AND p.proname='sync_ventures_to_eva_ventures_update'`)).s;
    record('FR-4.2 teardown block is live', src.includes('eva_scheduler_queue'));
    record('FR-4.2 preserved the SD-LEO-ORCH-ADAM-PLAN-KEEPER-001-F is_demo guard', src.includes('NEW.is_demo'));
    record('FR-4.2 preserved the stage / status-map / name sync',
      src.includes('current_lifecycle_stage') && src.includes('graduated') && src.includes('OLD.name IS DISTINCT FROM NEW.name'));
  });

  // ORDERING PROOF: the teardown must refuse to install without the widened constraint, and the
  // constraint must refuse to narrow while the writer is live. Both directions, or the documented
  // apply-order is just prose somebody can overrule.
  await arm('apply-order guards are real in BOTH directions', async () => {
    // ROLLBACK ORDER IS THE REVERSE OF APPLY ORDER: function first, then constraint. Authoring this
    // arm backwards is what proved the widen-DOWN pre-assert works — it refused to narrow the CHECK
    // while a live writer could still emit 'cancelled'.
    const wrongWay = await expectFail(WIDEN_DOWN);
    record('FR-4.1 DOWN refuses to narrow the CHECK while the teardown writer is live',
      !!wrongWay && /still writes eva_scheduler_queue/i.test(wrongWay), wrongWay ? firstLine(wrongWay) : 'did NOT throw');

    await client.query(TEARDOWN_DOWN);   // remove the writer
    await client.query(WIDEN_DOWN);      // then narrow the CHECK — now legal

    const tooEarly = await expectFail(TEARDOWN_UP);
    record('FR-4.2 refuses to install before FR-4.1, with an actionable message',
      !!tooEarly && /does not permit cancelled/i.test(tooEarly), tooEarly ? firstLine(tooEarly) : 'did NOT throw');

    // Put the correct apply order back for the behavioural arms below.
    await client.query(WIDEN_UP);
    await client.query(TEARDOWN_UP);
  });

  // ── TS-9: kill signatures ─────────────────────────────────────────────────────────────────
  console.log('\nTS-9: kill signatures (teardown behaviour end-to-end)');

  const company = await one('SELECT id FROM companies LIMIT 1');

  /** Seed a real, non-demo venture; the sync + auto-enqueue triggers give it a pending queue row. */
  async function seedVenture(label) {
    await client.query("SET LOCAL leo.stage0_bypass = 'true'");
    const v = await one(
      `INSERT INTO ventures (name, problem_statement, current_lifecycle_stage, company_id, tier, status)
       VALUES ($1, $2, 1, $3, 1, 'active') RETURNING id`,
      [`${RUN} ${label}`, `eva scheduler hygiene probe fixture ${RUN}`, company.id]);
    return v.id;
  }
  const queueStatusOf = async (ventureId) => {
    const r = await client.query(
      `SELECT q.status FROM eva_scheduler_queue q JOIN eva_ventures v ON v.id = q.venture_id
        WHERE v.venture_id = $1`, [ventureId]);
    return r.rows.map((x) => x.status);
  };

  // Signature 2 — DIRECT UPDATE bypassing kill_venture(). This is the majority signature in the live
  // backlog (16 of 45 rows have killed_at IS NULL), so it is the one that matters most.
  await arm('TS-9 signature 2: direct UPDATE ventures SET status=cancelled', async () => {
    const vid = await seedVenture('direct-update');
    const before = await queueStatusOf(vid);
    record('TS-9.2 fixture starts with a pending queue row',
      before.length === 1 && before[0] === 'pending', JSON.stringify(before));

    await client.query("UPDATE ventures SET status = 'cancelled' WHERE id = $1", [vid]);

    const after = await queueStatusOf(vid);
    record('TS-9.2 teardown moved the pending row to cancelled',
      after.length === 1 && after[0] === 'cancelled', JSON.stringify(after));

    const offered = await n(
      `SELECT count(*)::bigint AS n FROM select_schedulable_ventures(1000) s
       JOIN eva_ventures v ON v.id = s.venture_id WHERE v.venture_id = $1`, [vid]);
    record('TS-9.2 select_schedulable_ventures no longer offers the killed venture', offered === 0, `offered=${offered}`);
  });

  // The narrowness of the WHERE clause IS the safety story, so it is asserted, not trusted.
  await arm('TS-9 signature 2b: non-pending rows are NOT touched', async () => {
    for (const keep of ['dispatching', 'blocked', 'paused', 'completed']) {
      const vid = await seedVenture(`keep-${keep}`);
      await client.query(
        `UPDATE eva_scheduler_queue SET status = $2
          WHERE venture_id IN (SELECT id FROM eva_ventures WHERE venture_id = $1)`, [vid, keep]);
      await client.query("UPDATE ventures SET status = 'cancelled' WHERE id = $1", [vid]);
      const after = await queueStatusOf(vid);
      record(`TS-9.2b a '${keep}' row survives the kill untouched`,
        after.length === 1 && after[0] === keep, JSON.stringify(after));
    }
  });

  // Signature 1 — the kill_venture() RPC. Documented-skip if the chairman gate rejects the probe
  // role, matching the skip in tests/integration/kill-venture-rpc.test.js.
  await arm('TS-9 signature 1: kill_venture() RPC', async () => {
    const exists = await n(`SELECT count(*)::bigint AS n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
                            WHERE ns.nspname='public' AND p.proname='kill_venture'`);
    if (exists === 0) { record('TS-9.1 kill_venture() RPC', true, 'SKIPPED — no such function in this schema'); return; }

    const vid = await seedVenture('kill-rpc');
    const s = `sp_esqhyg_kv_${++sp}`;
    await client.query(`SAVEPOINT ${s}`);
    let out = null, threw = null;
    try {
      out = await one('SELECT kill_venture($1, $2) AS r', [vid, `probe ${RUN}`]);
      await client.query(`RELEASE SAVEPOINT ${s}`);
    } catch (e) {
      await client.query(`ROLLBACK TO SAVEPOINT ${s}`);
      await client.query(`RELEASE SAVEPOINT ${s}`);
      threw = firstLine(e.message);
    }

    if (threw && /chairman|lead|permission|denied|not authoriz/i.test(threw)) {
      record('TS-9.1 kill_venture() RPC', true, `SKIPPED — chairman gate rejected the probe role: ${threw}`);
      return;
    }
    if (threw) { record('TS-9.1 kill_venture() RPC', false, `unexpected error: ${threw}`); return; }
    const after = await queueStatusOf(vid);
    record('TS-9.1 kill_venture() leaves no pending queue row',
      !after.includes('pending'), `${JSON.stringify(after)} (rpc returned ${JSON.stringify(out?.r)})`);
  });

  // Signature 3 — the steady-state invariant across BOTH paths.
  await arm('TS-9 signature 3: steady-state invariant', async () => {
    const bad = await n(`SELECT count(*)::bigint AS n FROM eva_scheduler_queue q
                         JOIN eva_ventures v ON v.id = q.venture_id
                         WHERE v.status='killed' AND q.status='pending'
                           AND v.venture_id IN (SELECT id FROM ventures WHERE name LIKE $1)`, [`${RUN}%`]);
    record('TS-9.3 no probe-killed venture retains a pending queue row', bad === 0, `violations=${bad}`);
  });

  ok = results.length > 0 && results.every((r) => r.pass);
  console.log(`\n${ok ? '✅ PROBE PASS' : '❌ PROBE FAIL'} — ${results.filter((r) => r.pass).length}/${results.length} assertions passed`);
  if (!ok) for (const r of results.filter((x) => !x.pass)) console.log(`   FAILED: ${r.name} — ${r.detail}`);
} catch (e) {
  console.error('\n❌ PROBE ERROR:', e.message);
  ok = false;
} finally {
  try {
    await client.query('ROLLBACK');
    console.log('rolled back — NO committed change');
    const c = await client.query('SELECT count(*)::bigint AS n FROM eva_scheduler_queue');
    const q = await client.query("SELECT to_regclass('public.eva_scheduler_queue_qkilled20260821') AS t");
    const f = await client.query(`SELECT (p.prosrc LIKE '%eva_scheduler_queue%') AS teardown FROM pg_proc p
                                  JOIN pg_namespace ns ON ns.oid=p.pronamespace
                                  WHERE ns.nspname='public' AND p.proname='sync_ventures_to_eva_ventures_update'`);
    const con = await client.query(`SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint
                                    WHERE conrelid='public.eva_scheduler_queue'::regclass
                                      AND conname='eva_scheduler_queue_status_check'`);
    const leaked = await client.query('SELECT count(*)::bigint AS n FROM ventures WHERE name LIKE $1', [`${RUN}%`]);
    const cancelledLegal = con.rows[0] && con.rows[0].d.includes('cancelled');
    console.log(`post-rollback: queue rows=${c.rows[0].n}, quarantine table=${q.rows[0].t}, teardown live=${f.rows[0].teardown}, cancelled legal=${cancelledLegal}, leaked fixtures=${leaked.rows[0].n}`);
    if (q.rows[0].t !== null || f.rows[0].teardown || cancelledLegal || Number(leaked.rows[0].n) !== 0) {
      console.error('❌ LEAK: the rollback did not fully undo the probe');
      ok = false;
    }
  } catch (e) { console.error('rollback/verify failed:', e.message); ok = false; }
  await client.end();
  process.exitCode = ok ? 0 : 1;
}
