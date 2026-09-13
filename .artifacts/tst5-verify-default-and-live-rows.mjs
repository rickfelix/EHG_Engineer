#!/usr/bin/env node
// TESTING pass 5 - part 2.
// (a) TEMP table mirroring the REAL uat_test_runs.metadata default ('{}'::jsonb, nullable)
//     to test the "column omitted, relying on its default" premise in TS-2h / FR-3.description.
// (b) Re-verify the load-bearing "no backfill needed" claim against all live uat_test_runs rows.
// Always-ROLLBACK for (a); (b) is read-only.
import 'dotenv/config';
import { createDatabaseClient } from '../lib/supabase-connection.js';

const REQ = ['fence_two_sidedness', 'canary_mutation_control', 'live_deployment_binding', 'minimum_assertion_manifest'];

async function main() {
  const client = await createDatabaseClient('ehg');
  try {
    await client.query('BEGIN');

    // Mirror the REAL column definition exactly: jsonb NULL-able, DEFAULT '{}'::jsonb
    await client.query("CREATE TEMP TABLE t_def (id serial PRIMARY KEY, metadata jsonb DEFAULT '{}'::jsonb) ON COMMIT DROP");
    await client.query('CREATE TEMP TABLE t_def_runs (n int) ON COMMIT DROP');
    await client.query('INSERT INTO t_def_runs VALUES (0)');

    const mk = (name, guard) => [
      'CREATE OR REPLACE FUNCTION pg_temp.' + name + '() RETURNS trigger AS $fn$',
      'BEGIN',
      '  IF ' + guard + ' THEN',
      '    UPDATE t_def_runs SET n = n + 1;',
      "    NEW.metadata := jsonb_set(COALESCE(NEW.metadata,'{}'::jsonb), '{control_pack_evaluated}', 'false');",
      '  END IF;',
      '  RETURN NEW;',
      'END; $fn$ LANGUAGE plpgsql;'
    ].join('\n');

    const scenarios = [
      ['BARE whole-blob (no TG_OP)', 'OLD.metadata IS DISTINCT FROM NEW.metadata'],
      ['SUB-KEY only (no TG_OP)', "OLD.metadata->'control_pack_status' IS DISTINCT FROM NEW.metadata->'control_pack_status'"],
      ['ADOPTED: TG_OP + SUB-KEY', "TG_OP = 'INSERT' OR OLD.metadata->'control_pack_status' IS DISTINCT FROM NEW.metadata->'control_pack_status'"]
    ];

    console.log('Real uat_test_runs.metadata is: jsonb, NULLABLE, DEFAULT \'{}\'::jsonb');
    console.log('Testing both INSERT sub-cases against each candidate guard:\n');
    console.log('guard'.padEnd(30) + '| omitted-col (=> default {})'.padEnd(32) + '| explicit NULL');
    console.log('-'.repeat(88));

    for (const [label, guard] of scenarios) {
      await client.query(mk('f_def', guard));
      await client.query('DROP TRIGGER IF EXISTS trg_def ON t_def');
      await client.query('CREATE TRIGGER trg_def BEFORE INSERT OR UPDATE ON t_def FOR EACH ROW EXECUTE FUNCTION pg_temp.f_def()');

      const runs = async () => (await client.query('SELECT n FROM t_def_runs')).rows[0].n;

      let a;
      const n0 = await runs();
      try {
        const row = (await client.query('INSERT INTO t_def DEFAULT VALUES RETURNING metadata')).rows[0];
        a = (await runs()) - n0 > 0 ? 'BODY RAN -> ' + JSON.stringify(row.metadata) : 'SKIPPED -> ' + JSON.stringify(row.metadata);
      } catch (e) { a = 'ERROR: ' + e.message.slice(0, 45); }

      let b;
      const n1 = await runs();
      try {
        const row = (await client.query('INSERT INTO t_def (metadata) VALUES (NULL) RETURNING metadata')).rows[0];
        b = (await runs()) - n1 > 0 ? 'BODY RAN -> ' + JSON.stringify(row.metadata) : 'SKIPPED -> ' + JSON.stringify(row.metadata);
      } catch (e) { b = 'ERROR: ' + e.message.slice(0, 45); }

      console.log(label.padEnd(30) + '| ' + a.padEnd(30) + '| ' + b);
    }

    await client.query('ROLLBACK');
    console.log('\nROLLBACK issued.\n');

    // (b) read-only: re-verify "no backfill needed" against ALL live rows
    const live = await client.query(
      "SELECT id, metadata->'control_pack_status' AS st, metadata->'control_pack_evaluated' AS cpe FROM uat_test_runs"
    );
    let disagree = 0;
    let missingStatus = 0;
    const shapes = new Set();
    for (const row of live.rows) {
      const st = row.st;
      const stored = row.cpe;
      let derived;
      if (st === null || typeof st !== 'object' || Array.isArray(st)) { derived = false; missingStatus++; }
      else {
        derived = REQ.every((k) => Object.prototype.hasOwnProperty.call(st, k) && st[k] !== 'not_attempted');
        for (const k of Object.keys(st)) shapes.add(String(st[k]).split(':')[0]);
      }
      if (stored !== derived) {
        disagree++;
        console.log('  DISAGREE row', row.id, 'stored=', JSON.stringify(stored), 'derived=', derived);
      }
    }
    console.log('LIVE uat_test_runs rows:', live.rows.length);
    console.log('  rows with no usable control_pack_status object:', missingStatus);
    console.log('  distinct status value prefixes observed:', JSON.stringify([...shapes]));
    console.log('  DISAGREEMENTS (stored vs corrected predicate):', disagree, disagree === 0 ? '=> no backfill needed, AC-5 holds' : '=> AC-5 BROKEN');
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    console.error('FATAL:', e.message);
    process.exitCode = 2;
  } finally {
    await client.end();
  }
}
main();
