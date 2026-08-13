#!/usr/bin/env node
/**
 * Tier C probe for SD-FDBK-INFRA-MIGRATE-ANON-INGEST-001 FR-3/US-003 — proves telegram_bot_insert_
 * feedback's bare, unbounded anon-INSERT path is unreachable on the REAL live instance once
 * database/chairman-gated/20260813_revoke_telegram_bot_insert_feedback.sql is applied, WITHOUT
 * false-passing before it is applied and WITHOUT mistaking the deliberate residual path for a
 * fix failure.
 *
 * WHY A NEW FILE, MODELLED ON scripts/venture-ingest-keys-anon-probe.mjs. Same reasoning as that
 * file's own header: the defect shape and expected verdict here are specific to public.feedback's
 * TWO permissive anon INSERT policies (not a deny-all table), so this is its own probe — but it
 * reuses (never re-derives) assertNotCommitFamily, assertRlsInForce and classifyError from
 * scripts/anon-write-contract-probe.mjs, per this SD's TR-3.
 *
 * CORRECTED verdict mapping (testing-agent T-1, confirmed live before authoring this file):
 * public.feedback's telegram_bot_insert_feedback and venture_user_insert_feedback share ONE
 * table-level anon-INSERT grant. This migration DROPs the policy, not the grant — so the correct
 * post-apply attribution for a bare telegram-sourced anon INSERT is POLICY_DENIED (grant present,
 * no permissive policy authorizes this exact row), NOT GRANT_DENIED. A has_table_privilege=FALSE
 * reading post-apply would mean an over-broad REVOKE happened and is flagged as a REGRESSION here,
 * not accepted as "stronger than expected".
 *
 * PRE-APPLY DISCRIMINATOR (T-5): reads pg_policies for telegram_bot_insert_feedback's presence
 * BEFORE `set local role anon`, not to_regclass(table) — the table always exists (it is not
 * additive like venture_ingest_keys), so a to_regclass check would never distinguish pre/post.
 *
 * THE DELIBERATE RESIDUAL PATH (TS-2/TS-8): an anon INSERT satisfying venture_user_insert_
 * feedback's own conditions (feedback_type LIKE 'user_%', a real active venture_id) MUST still
 * LAND even when source_type='telegram' — a legitimate, venture-owned, telegram-tagged submission
 * is not the abuse case this migration closes (the abuse was ANYONE, with no venture ownership
 * check at all). This probe asserts that path explicitly LANDS, not merely that the bare path is
 * refused — a probe that only checked the refusal could not tell "surgical fix" from "the whole
 * table went deny-all", which would itself be a silent regression against venture_user_insert_
 * feedback's live callers.
 *
 * SAFE AGAINST PRODUCTION, same invariant as its siblings: COMMIT-NEVER-ISSUED. No COMMIT-family
 * statement appears in this file; every query is wrapped through assertNotCommitFamily, and every
 * write attempt runs inside a SAVEPOINT that is always rolled back, win or lose.
 *
 * Usage:
 *   node scripts/telegram-feedback-anon-probe.mjs
 */

import { createDatabaseClient } from './lib/supabase-connection.js';
import {
  assertNotCommitFamily,
  assertRlsInForce,
  classifyError,
} from './anon-write-contract-probe.mjs';

export const EXIT = { OK: 0, ERROR: 1, CONTRACT_CHANGED: 2, PROBE_INCONCLUSIVE: 4, RLS_NOT_IN_FORCE: 5 };

const TABLE = 'public.feedback';

/**
 * Narrowed to this table's single relevant privilege (INSERT) — mirrors venture-ingest-keys-anon-
 * probe.mjs's own local `attribute` helper rather than reusing attributeRefusal, whose form-name
 * switch is specific to that OTHER probe's different set of write forms (TR-3 names only
 * assertNotCommitFamily/assertRlsInForce/classifyError as required reuse, not attributeRefusal).
 */
async function attribute(q, err) {
  if (err?.code !== '42501') return null;
  const { rows: [p] } = await q(
    "select has_table_privilege(current_user, $1::regclass, 'INSERT') as ok",
    [TABLE],
  );
  return p?.ok === false ? 'GRANT_DENIED(INSERT)' : 'POLICY_DENIED(INSERT)';
}

async function probe(client, q) {
  await q('BEGIN');
  try {
    await q("set local statement_timeout = '10s'");
    await q("set local lock_timeout = '1s'");

    // T-5 discriminator: read BEFORE role-switch, via pg_policies presence — public.feedback
    // always exists, unlike an additive table, so to_regclass cannot distinguish pre/post-apply.
    const { rows: [pol] } = await q(
      `select count(*)::int as n from pg_policies
       where schemaname = 'public' and tablename = 'feedback' and policyname = 'telegram_bot_insert_feedback'`,
    );
    if (pol.n > 0) {
      return {
        code: EXIT.PROBE_INCONCLUSIVE,
        reason: 'telegram_bot_insert_feedback is still present in pg_policies — the chairman-gated '
          + 'migration is staged, not applied. This is NOT a pass; re-run this probe after ratification and apply.',
      };
    }

    // Real, active venture for the positive-path (TS-2/TS-8) attempt — read while still on the
    // connecting role, before the role-switch below; a plain read, not part of the anon proof.
    const { rows: [venture] } = await q(
      `select id from public.ventures
       where deleted_at is null and coalesce(metadata->>'telemetry_ingestion_enabled', 'true') <> 'false'
         and not public.check_feedback_rate_limit(id)
       limit 1`,
    );
    if (!venture) {
      return { code: EXIT.PROBE_INCONCLUSIVE, reason: 'no active venture found to exercise the TS-8 residual-path assertion' };
    }

    await q('set local role anon');
    const { rows: [p] } = await q('select pg_backend_pid() as pid');

    const rls = await assertRlsInForce(q, TABLE, p.pid);
    if (!rls.ok) {
      return { code: EXIT.RLS_NOT_IN_FORCE, reason: `RLS not in force before probing: ${rls.problems.join(', ')}` };
    }

    const observed = {};
    const attributions = {};

    // --- Bare telegram-sourced attempt (no venture_id, feedback_type NOT matching user_%) ---
    // Every column public.feedback requires NOT NULL with no default (type, source_application,
    // title) is populated — a probe verdict must reflect a real, insertable row shape, not an
    // incomplete one that would fail on an unrelated constraint regardless of RLS.
    await q('SAVEPOINT sp_bare');
    try {
      await q(
        assertNotCommitFamily(
          `insert into ${TABLE} (source_type, feedback_type, venture_id, type, source_application, title)
           values ('telegram', 'sentry_error', NULL, 'issue', 'telegram-feedback-anon-probe', 'probe row')`,
        ),
      );
      observed.bare_telegram = 'LANDS';
      await q('ROLLBACK TO SAVEPOINT sp_bare');
    } catch (err) {
      await q('ROLLBACK TO SAVEPOINT sp_bare');
      observed.bare_telegram = classifyError(err);
      attributions.bare_telegram = (await attribute(q, err)) ?? `${observed.bare_telegram}(${err.code})`;
    }

    // --- TS-2/TS-8: venture_user_insert_feedback-satisfying attempt, source_type='telegram' ---
    await q('SAVEPOINT sp_residual');
    try {
      await q(
        assertNotCommitFamily(
          `insert into ${TABLE} (source_type, feedback_type, venture_id, type, source_application, title)
           values ('telegram', 'user_bug', $1, 'issue', 'telegram-feedback-anon-probe', 'probe row')`,
        ),
        [venture.id],
      );
      observed.residual_telegram_tagged_venture_owned = 'LANDS';
      await q('ROLLBACK TO SAVEPOINT sp_residual');
    } catch (err) {
      await q('ROLLBACK TO SAVEPOINT sp_residual');
      observed.residual_telegram_tagged_venture_owned = classifyError(err);
    }

    // --- Verdict ---
    if (observed.bare_telegram === 'LANDS') {
      return {
        code: EXIT.CONTRACT_CHANGED,
        reason: 'OPEN: the bare telegram-sourced anon INSERT unexpectedly LANDED — the fix is not in effect',
        observed, attributions,
      };
    }
    if (observed.residual_telegram_tagged_venture_owned !== 'LANDS') {
      return {
        code: EXIT.CONTRACT_CHANGED,
        reason: 'REGRESSION: the venture_user_insert_feedback residual path (TS-8) no longer lands — '
          + 'this looks like an over-broad drop, not the surgical fix this migration ships',
        observed, attributions,
      };
    }
    if (observed.bare_telegram !== 'REFUSED' || attributions.bare_telegram !== 'POLICY_DENIED(INSERT)') {
      return {
        code: EXIT.CONTRACT_CHANGED,
        reason: `bare attempt refused but NOT attributed to the expected POLICY_DENIED(INSERT): ${attributions.bare_telegram} — `
          + 'a GRANT_DENIED reading here would mean an over-broad REVOKE happened instead of the surgical DROP POLICY',
        observed, attributions,
      };
    }

    return {
      code: EXIT.OK,
      reason: 'bare telegram-sourced INSERT refused (POLICY_DENIED, grant present) AND the venture_user_insert_feedback '
        + 'residual path still LANDS — the surgical fix is in effect',
      observed, attributions,
    };
  } finally {
    await q('ROLLBACK');
  }
}

export async function main() {
  let client = null;
  try {
    client = await createDatabaseClient('engineer',
      process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {});
    const q = (sql, params) => client.query(assertNotCommitFamily(sql), params);
    const r = await probe(client, q);
    console.log(`\n=== ${TABLE} telegram_bot_insert_feedback (FR-3/US-003 anon-probe) ===`);
    for (const [form, verdict] of Object.entries(r.observed || {})) {
      console.log(`  ${form.padEnd(38)} ${String(verdict).padEnd(20)} ${r.attributions?.[form] ?? ''}`);
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
