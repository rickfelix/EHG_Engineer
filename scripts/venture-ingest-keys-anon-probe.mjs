#!/usr/bin/env node
/**
 * Tier C probe for SD-LEO-INFRA-FEEDBACK-ANON-RLS-GAPS-001 FR-1 — proves venture_ingest_keys is
 * unreadable/unwritable by anon by any path, direct or inherited, on the REAL live instance.
 *
 * WHY THIS IS A SEPARATE FILE, NOT AN ADDITION TO scripts/anon-write-contract-probe.mjs. That
 * probe's discovery (discoverAsymmetricTables) and ROW_BUILDERS target a DIFFERENT defect class:
 * tables where anon CAN insert but SELECT coverage is asymmetric. venture_ingest_keys has ZERO
 * policies for anon at all — canInsert never becomes true, so that probe's own discovery would
 * never even surface it as a candidate. The defect shape here is simpler (deny-all, full stop)
 * and the question is different: not "what can anon read back after writing", but "can anon
 * reach this table by ANY of the four DML forms at all". Reusing that file's PROVEN safety
 * primitives (assertRlsInForce, assertNotCommitFamily, classifyError, attributeRefusal) rather
 * than re-deriving them is the point of the import below — those functions exist specifically
 * because getting them wrong silently makes every verdict a lie (see that file's own header).
 *
 * WHY THE "NOT YET APPLIED" CASE MUST NOT LOOK LIKE A PASS. This migration is chairman-gated and
 * staged, not applied (database/chairman-gated/20260812_venture_ingest_key_binding.sql). Running
 * this probe today against production finds no such table. That is DISTINCT from "the table
 * exists and correctly denies anon" — a probe that can't tell "not deployed" from "deployed and
 * safe" would read as coverage before there is anything to cover. This file exits
 * PROBE_INCONCLUSIVE (not OK) when the table is absent, with an unmistakable message, and is
 * meant to be re-run for real once the migration is chairman-ratified and applied.
 *
 * SAFE AGAINST PRODUCTION for the same reason as its sibling: COMMIT-NEVER-ISSUED, not merely
 * ROLLBACK-in-finally. No COMMIT-family statement appears in this file, and every query is
 * wrapped through assertNotCommitFamily.
 *
 * Usage:
 *   node scripts/venture-ingest-keys-anon-probe.mjs
 */

import { createDatabaseClient } from './lib/supabase-connection.js';
import {
  assertNotCommitFamily,
  assertRlsInForce,
  classifyError,
} from './anon-write-contract-probe.mjs';

export const EXIT = { OK: 0, ERROR: 1, CONTRACT_CHANGED: 2, PROBE_INCONCLUSIVE: 4, RLS_NOT_IN_FORCE: 5 };

const TABLE = 'public.venture_ingest_keys';

/**
 * Mirrors anon-write-contract-probe.mjs's attributeRefusal, narrowed to this table's four forms.
 * GRANT_DENIED means no table-level privilege exists at all (has_table_privilege returns false) —
 * the strongest possible signal, since it means RLS was never even consulted. POLICY_DENIED means
 * a grant exists but RLS's zero-policy default refused the row — still functionally safe, but a
 * WEAKER signal (this migration's explicit REVOKE, added after a live dry-run caught this
 * instance's ALTER DEFAULT PRIVILEGES auto-granting every new public-schema table to anon, exists
 * specifically so this probe should observe GRANT_DENIED, not POLICY_DENIED).
 */
async function attribute(q, priv, err) {
  if (err?.code !== '42501') return null;
  const { rows: [p] } = await q('select has_table_privilege(current_user, $1::regclass, $2) as ok', [TABLE, priv]);
  return p?.ok === false ? `GRANT_DENIED(${priv})` : `POLICY_DENIED(${priv})`;
}

async function probe(client, q) {
  await q('BEGIN');
  try {
    await q("set local statement_timeout = '10s'");
    await q("set local lock_timeout = '1s'");

    const { rows: [t] } = await q(`select to_regclass($1) as t`, [TABLE]);
    if (!t.t) {
      return {
        code: EXIT.PROBE_INCONCLUSIVE,
        reason: 'venture_ingest_keys does not exist yet — the chairman-gated migration is staged, '
          + 'not applied. This is NOT a pass; re-run this probe after ratification and apply.',
      };
    }

    const { rows: [existing] } = await q(`select venture_id from ${TABLE} limit 1`);
    // A live secret row would be exposed by a failed SELECT probe below only if the probe LANDS —
    // this pre-check just confirms whether the table has any rows at all, for the report.
    const hasRows = !!existing;

    await q('set local role anon');
    const { rows: [p] } = await q('select pg_backend_pid() as pid');

    const rls = await assertRlsInForce(q, TABLE, p.pid);
    if (!rls.ok) {
      return { code: EXIT.RLS_NOT_IN_FORCE, reason: `RLS not in force before probing: ${rls.problems.join(', ')}` };
    }

    const forms = [
      ['SELECT', `select 1 from ${TABLE} limit 1`],
      ['INSERT', `insert into ${TABLE} (venture_id, ingest_secret) values (gen_random_uuid(), 'probe-value-never-lands')`],
      ['UPDATE', `update ${TABLE} set ingest_secret = 'probe-value-never-lands' where true`],
      ['DELETE', `delete from ${TABLE} where true`],
    ];

    const observed = {};
    const attributions = {};
    for (const [priv, sql] of forms) {
      const sp = `sp_${priv.toLowerCase()}`;
      await q(`SAVEPOINT ${sp}`);
      try {
        const r = await q(assertNotCommitFamily(sql));
        // SELECT can "succeed" while returning zero rows — that is STILL a pass for this probe
        // (GAP-1 cares about whether a secret is ever readable, not about statement success).
        if (priv === 'SELECT') {
          observed.SELECT = r.rows.length === 0 ? 'REFUSED_OR_EMPTY' : 'LANDS_WITH_ROWS';
        } else {
          observed[priv] = 'LANDS';
        }
        await q(`ROLLBACK TO SAVEPOINT ${sp}`);
      } catch (err) {
        await q(`ROLLBACK TO SAVEPOINT ${sp}`);
        observed[priv] = classifyError(err);
        attributions[priv] = (await attribute(q, priv, err)) ?? `${observed[priv]}(${err.code})`;
      }
    }

    const bad = Object.entries(observed).filter(([k, v]) =>
      (k === 'SELECT' && v === 'LANDS_WITH_ROWS') || (k !== 'SELECT' && v !== 'REFUSED'));
    if (bad.length) {
      return {
        code: EXIT.CONTRACT_CHANGED,
        reason: `anon can reach venture_ingest_keys: ${bad.map(([k, v]) => `${k}=${v}`).join(', ')}`,
        observed, attributions, hasRows,
      };
    }

    const notGrantDenied = Object.entries(attributions).filter(([, v]) => !v.startsWith('GRANT_DENIED'));
    return {
      code: EXIT.OK,
      reason: notGrantDenied.length
        ? `all four forms refused, but NOT all attributed to GRANT_DENIED (weaker signal): ${notGrantDenied.map(([k, v]) => `${k}=${v}`).join(', ')} — the explicit REVOKE this migration ships may be missing or was reverted`
        : 'all four forms REFUSED and attributed to GRANT_DENIED — no table-level privilege exists for anon at all',
      observed, attributions, hasRows,
    };
  } finally {
    await q('ROLLBACK');
  }
}

export async function main() {
  let client = null;
  try {
    client = await createDatabaseClient('ehg',
      process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {});
    const q = (sql, params) => client.query(assertNotCommitFamily(sql), params);
    const r = await probe(client, q);
    console.log(`\n=== ${TABLE} (FR-1 / GAP-1 anon-probe) ===`);
    for (const [form, verdict] of Object.entries(r.observed || {})) {
      console.log(`  ${form.padEnd(8)} ${String(verdict).padEnd(20)} ${r.attributions?.[form] ?? ''}`);
    }
    console.log(`  -> [${Object.keys(EXIT).find((k) => EXIT[k] === r.code)}] ${r.reason}`);
    return r.code;
  } catch (err) {
    console.error(`probe error: ${err.message}`);
    return EXIT.ERROR;
  } finally {
    if (client) await client.end().catch(() => {});
  }
}

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (invokedDirectly) main().then((code) => process.exit(code));
