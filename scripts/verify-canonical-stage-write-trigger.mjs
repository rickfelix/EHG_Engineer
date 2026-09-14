#!/usr/bin/env node
// SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-H (FR-7, C5.2): live proof that the canonical-writer
// choke point on public.ventures.current_lifecycle_stage — shipped by
// SD-LEO-INFRA-STAGE-WRITER-CHOKE-001 as the `aaa_enforce_canonical_stage_write` /
// `zzz_enforce_canonical_stage_write_final` triggers (function enforce_canonical_stage_write) —
// is LIVE, ENABLED, and behaves as a genuine 3-way discriminator, not merely present in
// pg_trigger. TR-1 forbids building any NEW stage-advancement machinery here; this only
// verifies and documents what SD-LEO-INFRA-STAGE-WRITER-CHOKE-001 already shipped.
//
// Why a standalone script and not a vitest test: tests/setup.unit.js's unitTierNetworkFence
// structurally refuses every non-loopback network call in the 'unit' vitest project (so a raw
// pg.Client connection racing that fence would either be silently neutered or need an
// unmaintainable fetch-shim workaround), and the 'db' vitest project is currently measured DEAD
// in CI (SKIPPED at runtime, exit 0, asserting nothing — see docs note below) until that gap is
// separately closed. This mirrors the established scripts/rdap-live-network-smoke.mjs precedent
// for a genuine live-network/DB check vitest cannot run today. Like that script, this one is
// NOT currently wired into any CI workflow — it is a committed, safely-idempotent verification
// tool for manual/on-demand re-proof (e.g. after touching the trigger or the writer registry),
// and its non-CI status is itself the FR-7 finding (see the final printed line).
//
// Safety: every case runs inside SAVEPOINTs under one outer transaction that is ALWAYS rolled
// back (never COMMIT) — zero persistent writes, per TR-3. Requires SUPABASE_POOLER_URL.
//
// Usage: node scripts/verify-canonical-stage-write-trigger.mjs
import { Client } from 'pg';
import { config } from 'dotenv';
import { isMainModule } from '../lib/utils/is-main-module.js';

config();

const REGISTERED_IDENTITY = 'stage-execution-worker.js';
const UNREGISTERED_IDENTITY = 'not-a-real-canonical-writer-identity';

async function runCase(client, label, { stampSql }) {
  await client.query('SAVEPOINT case_sp');
  try {
    const { rows: sample } = await client.query(
      'SELECT id, current_lifecycle_stage FROM ventures LIMIT 1'
    );
    if (sample.length === 0) {
      return { label, status: 'SKIPPED', reason: 'no ventures row to test against' };
    }
    const { id, current_lifecycle_stage: current } = sample[0];
    // Must be a genuinely DIFFERENT value -- enforce_canonical_stage_write only fires its
    // stamp check when NEW.current_lifecycle_stage IS DISTINCT FROM OLD (verified via
    // pg_get_functiondef). A same-value write would silently skip the check entirely.
    const target = current === 1 ? 2 : 1;
    try {
      // Adversarial PROBE of the canonical-writer choke-point trigger itself (never a real
      // advancement), always inside a SAVEPOINT the caller rolls back -- see the module header's
      // Safety note.
      await client.query(
        `UPDATE ventures SET current_lifecycle_stage = $1 ${stampSql} WHERE id = $2`, // stage-advancement-lint-disable-line
        [target, id]
      );
      return { label, status: 'NO_ERROR', ventureId: id };
    } catch (err) {
      return { label, status: 'ERROR', code: err.code, message: err.message };
    }
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT case_sp');
  }
}

export async function verifyCanonicalStageWriteTrigger() {
  // EXEC-phase SECURITY review (M1): node-postgres does not default to TLS -- measured this
  // connected in cleartext against the real production pooler until this fix. Matches the
  // repo's own established pattern (lib/connection-router.js's pooler_url strategy).
  // L1: fail loudly on a missing env var rather than letting pg silently fall back to libpq
  // defaults, which could attribute this verdict to the wrong database entirely.
  if (!process.env.SUPABASE_POOLER_URL) {
    throw new Error('SUPABASE_POOLER_URL is required (set it in .env) -- refusing to fall back to libpq defaults.');
  }
  const client = new Client({
    connectionString: process.env.SUPABASE_POOLER_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  const results = [];
  try {
    await client.query('BEGIN');

    // Case 1: unstamped write of a genuinely-changing value -> must raise SVCW1
    // ("missing canonical-writer stamp").
    results.push(await runCase(client, 'unstamped', { stampSql: '' }));

    // Case 2: stamped with a value NOT present in ventures_canonical_writer_policy() ->
    // must ALSO raise SVCW1, but with the distinct "not present in canonical-writer
    // registry" message (proves the registry lookup runs, not just a NULL check).
    results.push(
      await runCase(client, 'unregistered_stamp', {
        stampSql: `, stage_write_token = '${UNREGISTERED_IDENTITY}'`,
      })
    );

    // Case 3: stamped with a REGISTERED identity -> must NOT raise SVCW1. It may still be
    // intercepted by the separate, unrelated enforce_stage_advancement_artifact_gate trigger
    // (error code 23514) -- that is a DIFFERENT invariant and an acceptable outcome here.
    results.push(
      await runCase(client, 'registered_stamp', {
        stampSql: `, stage_write_token = '${REGISTERED_IDENTITY}'`,
      })
    );
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }

  const unstamped = results.find((r) => r.label === 'unstamped');
  const unregistered = results.find((r) => r.label === 'unregistered_stamp');
  const registered = results.find((r) => r.label === 'registered_stamp');

  const verdict = {
    unstamped_correctly_rejected:
      unstamped?.status === 'ERROR' &&
      unstamped.code === 'SVCW1' &&
      /missing canonical-writer stamp/i.test(unstamped.message),
    unregistered_correctly_rejected_with_distinct_message:
      unregistered?.status === 'ERROR' &&
      unregistered.code === 'SVCW1' &&
      /not present in canonical-writer registry/i.test(unregistered.message),
    registered_not_rejected_by_this_trigger:
      registered?.status === 'NO_ERROR' ||
      (registered?.status === 'ERROR' && registered.code !== 'SVCW1'),
  };
  verdict.all_pass = Object.values(verdict).every(Boolean);

  return { results, verdict };
}

async function main() {
  const { results, verdict } = await verifyCanonicalStageWriteTrigger();
  console.log(JSON.stringify({ results, verdict }, null, 2));
  console.log(
    'FR-7 status: this script is NOT wired into any CI workflow (same class as ' +
    'scripts/rdap-live-network-smoke.mjs) — re-run manually after touching the canonical-writer ' +
    'trigger, function, or registry. The db vitest tier that would otherwise carry this ' +
    'assertion in CI is currently measured dead (SKIPPED at runtime, exit 0) pending a separate fix.'
  );
  process.exitCode = verdict.all_pass ? 0 : 1;
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
