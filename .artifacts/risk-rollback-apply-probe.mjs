// LEAD-phase RISK evidence: rolled-back live apply + probe-row behavioural test.
// Everything happens inside a transaction that is ALWAYS rolled back. No persistent write.
import dotenv from 'dotenv';
dotenv.config({ path: ['.env.local', '.env'] });
import pg from 'pg';
import fs from 'node:fs';

const UP = fs.readFileSync('database/chairman-gated/20260912_chairman_all_decision_signals_snoozed_exclusion.sql', 'utf8');
const DOWN = fs.readFileSync('database/chairman-gated/20260912_chairman_all_decision_signals_snoozed_exclusion_DOWN.sql', 'utf8');
const strip = (s) => s.replace(/^\s*BEGIN;\s*$/m, '').replace(/^\s*COMMIT;\s*$/m, '');

const c = new pg.Client({ connectionString: process.env.SUPABASE_POOLER_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const FLAG = `SELECT count(*)::int AS n FROM chairman_all_decision_signals WHERE decision_type='flag_review'`;
const pre = (await c.query(FLAG)).rows[0].n;
console.log(`PRE-APPLY flag_review row count (live view): ${pre}`);

const out = {};
try {
  await c.query('BEGIN');

  // 1. probe row: critical, non-terminal status, resolved_at NULL, snoozed_until in the FUTURE
  const probe = await c.query(`
    INSERT INTO feedback (title, description, severity, status, type, feedback_type, source_type, source_application, snoozed_until)
    VALUES ('RISK-PROBE do-not-keep', 'rolled back', 'critical', 'new', 'issue', 'user_bug', 'manual_capture', 'EHG_Engineer', now() + interval '7 days')
    RETURNING id`);
  const probeId = probe.rows[0].id;
  console.log(`probe row inserted (future snoozed_until): ${probeId}`);

  out.probeVisiblePreApply = (await c.query(
    `SELECT count(*)::int AS n FROM chairman_all_decision_signals WHERE decision_type='flag_review' AND id=$1`, [probeId])).rows[0].n;
  out.countPreApplyInTx = (await c.query(FLAG)).rows[0].n;

  // 2. apply UP
  await c.query(strip(UP));
  out.reloptionsAfterUp = (await c.query(
    `SELECT reloptions FROM pg_class WHERE oid='public.chairman_all_decision_signals'::regclass`)).rows[0].reloptions;
  out.probeVisiblePostApply = (await c.query(
    `SELECT count(*)::int AS n FROM chairman_all_decision_signals WHERE decision_type='flag_review' AND id=$1`, [probeId])).rows[0].n;
  out.countPostApplyInTx = (await c.query(FLAG)).rows[0].n;

  // 3. expire the probe's snooze -> must RE-SURFACE (no over-exclusion / sweep independence)
  await c.query(`UPDATE feedback SET snoozed_until = now() - interval '1 day' WHERE id=$1`, [probeId]);
  out.probeVisibleAfterSnoozeExpired = (await c.query(
    `SELECT count(*)::int AS n FROM chairman_all_decision_signals WHERE decision_type='flag_review' AND id=$1`, [probeId])).rows[0].n;

  // 4. NULL snoozed_until -> must be visible (never-snoozed rows unaffected)
  await c.query(`UPDATE feedback SET snoozed_until = NULL WHERE id=$1`, [probeId]);
  out.probeVisibleWhenNull = (await c.query(
    `SELECT count(*)::int AS n FROM chairman_all_decision_signals WHERE decision_type='flag_review' AND id=$1`, [probeId])).rows[0].n;

  // 5. other branches unaffected by the UP
  out.branchCounts = (await c.query(
    `SELECT decision_type, count(*)::int AS n FROM chairman_all_decision_signals GROUP BY 1 ORDER BY 1`)).rows;

  // 6. DOWN applies cleanly and restores exact live text
  await c.query(strip(DOWN));
  const downDef = (await c.query(`SELECT pg_get_viewdef('public.chairman_all_decision_signals', true) AS d`)).rows[0].d;
  out.downRemovesClause = !downDef.includes('snoozed_until');
  out.reloptionsAfterDown = (await c.query(
    `SELECT reloptions FROM pg_class WHERE oid='public.chairman_all_decision_signals'::regclass`)).rows[0].reloptions;

  out.status = 'OK';
} catch (e) {
  out.status = 'ERROR';
  out.error = e.message;
} finally {
  await c.query('ROLLBACK');
}

console.log(JSON.stringify(out, null, 2));

// prove rollback restored everything
const post = (await c.query(FLAG)).rows[0].n;
const stillClean = (await c.query(`SELECT pg_get_viewdef('public.chairman_all_decision_signals', true) AS d`)).rows[0].d;
const probesLeft = (await c.query(`SELECT count(*)::int AS n FROM feedback WHERE title='RISK-PROBE do-not-keep'`)).rows[0].n;
console.log(`POST-ROLLBACK flag_review count: ${post} (pre was ${pre}) | view still lacks clause: ${!stillClean.includes('snoozed_until')} | probe rows left behind: ${probesLeft}`);

await c.end();
