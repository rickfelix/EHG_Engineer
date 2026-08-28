/**
 * SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-C (FR-1, TS-4 leg A4) — LIVE, behavioral,
 * authenticated-role cross-tenant write rejection for creative_asset_variant_scores.
 *
 * This is the leg the sibling file (creative-asset-variant-scores-rls.db.test.js) explicitly
 * disclaims: "Neither leg is a live authenticated-session behavioral test (this repo has no
 * auth.uid()-simulating harness) -- that would be a separate, explicitly estimated follow-up,
 * not assumed free here." It is that follow-up. The harness turns out to be cheap: auth.uid()
 * resolves `request.jwt.claims`->>'sub', so `set_config` + `SET LOCAL ROLE authenticated`
 * exercises the real predicate as the real role. Everything runs inside ONE transaction that
 * is always rolled back, so no fixture ever commits.
 *
 * WHY THIS FILE EXISTS (SECURITY evidence 9c3ebaf6-e37b-432c-9dc0-b0af0eaa5827): the original
 * `cavs_venture_access` policy constrained only creative_asset_id and declared no WITH CHECK,
 * so Postgres reused that incomplete USING expression on the write path. Measured live: a
 * tenant of venture A could INSERT (own_asset_id, venture_B_variant_id) -- FK integrity checks
 * run as table owner and bypass RLS, so the cross-tenant foreign key did not stop it. Because
 * both FKs here are NO ACTION by deliberate FR-9 design, the planted row then permanently
 * blocked venture B from deleting its own variant (23503), and venture B could neither see nor
 * remove it because RLS correctly hid it. Catalog-shape assertions could not catch this: the
 * vulnerable qual matched /creative_asset_id/ and /user_company_access/ just as the fixed one
 * does. Only a live write attempt distinguishes them, which is what this file does.
 *
 * DB-TIER, opt-in only (vitest.config.js DB_INCLUDE): self-skips under an undesignated
 * DB_TARGET via tests/setup.db.js's runtime gate. HAS_REAL_DB guards the connection attempt
 * itself (not just the it()s) -- the gate patches the socket layer, so an unconditional
 * connect in beforeAll throws DB_TIER_BLOCKED instead of skipping cleanly (TESTING finding D1).
 *
 * EXPECTED TO FAIL UNTIL THE CHAIRMAN CEREMONY RUNS. The corrected policy depends on a
 * SECURITY DEFINER resolver, which is TIER-2, so it is staged at
 * database/chairman-gated/20260826_creative_asset_variant_scores_rls_fix.sql and applies only
 * via the two-invocation --issue-token / --prod-deploy --allow-any-path ceremony. The
 * preflight below reports that explicitly rather than letting the suite fail with a confusing
 * 42501-vs-success mismatch.
 */
import { it, expect, beforeAll, afterAll } from 'vitest';
import { createDatabaseClient } from '../../scripts/lib/supabase-connection.js';
import { describeDb, HAS_REAL_DB } from '../helpers/db-available.js';

let client;
let fx = null;
let setupError = null;

beforeAll(async () => {
  if (!HAS_REAL_DB) return;
  client = await createDatabaseClient('engineer', { verify: false });
  try {
    // Everything from here is inside a transaction that afterAll always rolls back.
    await client.query('BEGIN');

    // Two ventures in DIFFERENT companies. Reused, never created: ventures carries 16 triggers
    // (stage-origin gates, live-born rejection, EVA sync) that make synthesising one both
    // fragile and beside the point -- the tenant boundary under test is company_id, which
    // existing rows already express.
    const { rows: vents } = await client.query(
      `SELECT DISTINCT ON (company_id) id, company_id
         FROM ventures WHERE company_id IS NOT NULL ORDER BY company_id, id LIMIT 2`
    );
    if (vents.length < 2) throw new Error('needs 2 ventures in distinct companies');
    const [A, B] = vents;

    // auth.users FK is enforced (and FK checks bypass RLS), so the actor must be a real row.
    const { rows: users } = await client.query('SELECT id FROM auth.users LIMIT 1');
    if (users.length < 1) throw new Error('needs at least one auth.users row');
    const actor = users[0].id;

    // The actor gets company access to venture A ONLY. That is the entire tenant boundary.
    await client.query(
      `INSERT INTO user_company_access (user_id, company_id, access_level)
       VALUES ($1, $2, 'admin') ON CONFLICT (user_id, company_id) DO NOTHING`,
      [actor, A.company_id]
    );

    const assetA = (await client.query(
      `INSERT INTO creative_assets (venture_id, capability, generator)
       VALUES ($1, 'image', 'rls-regression-fixture') RETURNING id`, [A.id])).rows[0].id;

    // variant_id's venture is reachable only via marketing_content_variants.content_id ->
    // marketing_content.venture_id. Both parents are needed on each side.
    const mkVariant = async (ventureId, key) => {
      const contentId = (await client.query(
        `INSERT INTO marketing_content (venture_id, content_type, channel_family, lifecycle_state)
         VALUES ($1, 'ad', 'paid', 'draft') RETURNING id`, [ventureId])).rows[0].id;
      return (await client.query(
        `INSERT INTO marketing_content_variants (content_id, variant_key)
         VALUES ($1, $2) RETURNING id`, [contentId, key])).rows[0].id;
    };
    const variantA = await mkVariant(A.id, 'regression-own');
    const variantB = await mkVariant(B.id, 'regression-foreign');

    fx = { actor, assetA, variantA, variantB, ventureA: A.id, ventureB: B.id };
  } catch (err) {
    setupError = err;
  }
}, 60000);

afterAll(async () => {
  if (client) {
    await client.query('ROLLBACK').catch(() => {});
    await client.end();
  }
});

// Each write attempt is savepoint-isolated. Without this, the FIRST rejected INSERT aborts the
// transaction and every later statement returns 25P02 ("current transaction is aborted"), which
// is indistinguishable from a genuine RLS denial -- a later assertion would then "pass" for
// entirely the wrong reason. Measured during authoring: exactly that false pass occurred.
let seq = 0;
async function attemptAsTenantA(sql, params) {
  const sp = `cavs_rls_${++seq}`;
  await client.query(`SAVEPOINT ${sp}`);
  try {
    await client.query('SELECT set_config(\'request.jwt.claims\', $1, true)',
      [JSON.stringify({ sub: fx.actor, role: 'authenticated' })]);
    await client.query('SET LOCAL ROLE authenticated');
    await client.query(sql, params);
    await client.query('RESET ROLE');
    await client.query(`RELEASE SAVEPOINT ${sp}`);
    return { ok: true, code: null };
  } catch (err) {
    await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
    await client.query('RESET ROLE').catch(() => {});
    return { ok: false, code: err.code };
  }
}

describeDb('creative_asset_variant_scores RLS (TS-4 leg A4: live cross-tenant write rejection)', () => {
  it('fixture setup succeeded', () => {
    expect(setupError, setupError && `fixture setup failed: ${setupError.message}`).toBeNull();
    expect(fx).not.toBeNull();
  });

  it('PREFLIGHT: the chairman-gated RLS fix has been applied', async () => {
    const { rows } = await client.query(
      `SELECT prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'cavs_variant_matches_venture'`
    );
    expect(
      rows.length,
      'public.cavs_variant_matches_venture() is absent -- the cross-tenant fix is still STAGED. ' +
      'Apply database/chairman-gated/20260826_creative_asset_variant_scores_rls_fix.sql via the ' +
      'two-invocation ceremony (--issue-token, then --prod-deploy --allow-any-path) before this suite can pass.'
    ).toBe(1);
    expect(rows[0].prosecdef, 'resolver must be SECURITY DEFINER or the predicate denies all legitimate access').toBe(true);
  });

  it('the policy constrains BOTH directions (qual and with_check reference the variant resolver)', async () => {
    const { rows } = await client.query(
      `SELECT qual, with_check FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'creative_asset_variant_scores'
          AND policyname = 'cavs_venture_access'`
    );
    expect(rows).toHaveLength(1);
    // A NULL with_check is precisely how the read-side gap became a write-side hole: Postgres
    // silently reuses USING for INSERT/UPDATE when WITH CHECK is omitted.
    expect(rows[0].with_check, 'with_check must be explicit, never NULL').not.toBeNull();
    expect(rows[0].qual).toMatch(/cavs_variant_matches_venture/);
    expect(rows[0].with_check).toMatch(/cavs_variant_matches_venture/);
  });

  it('REJECTS an authenticated insert of (own venture asset, DIFFERENT venture variant)', async () => {
    const result = await attemptAsTenantA(
      'INSERT INTO creative_asset_variant_scores (creative_asset_id, variant_id) VALUES ($1, $2)',
      [fx.assetA, fx.variantB]
    );
    expect(
      result.ok,
      'CROSS-TENANT WRITE ACCEPTED — a tenant of venture A planted a row referencing venture B\'s ' +
      'variant. Because the FKs are NO ACTION (FR-9), that row permanently blocks venture B from ' +
      'deleting its own variant, and RLS hides it from them so they cannot clear it.'
    ).toBe(false);
    expect(result.code, 'expected an RLS denial (42501), not an incidental failure').toBe('42501');
  });

  it('still ALLOWS the legitimate same-venture insert (the fix must not deny-all)', async () => {
    // The obvious inline-EXISTS correction blocks the attack AND this -- marketing_content* RLS
    // scopes `authenticated` through ventures.created_by, a different ownership model, so the
    // predicate sees zero rows and is false for everyone. A table nobody can write is not secured.
    const result = await attemptAsTenantA(
      'INSERT INTO creative_asset_variant_scores (creative_asset_id, variant_id) VALUES ($1, $2)',
      [fx.assetA, fx.variantA]
    );
    expect(
      result.ok,
      `legitimate same-venture insert was rejected (${result.code}) -- the policy is over-restrictive, ` +
      'which silently kills the FR-3 bridge rather than securing it'
    ).toBe(true);
  });

  it('FR-9: with no cross-tenant row plantable, venture B can still delete its own variant', async () => {
    const sp = 'cavs_rls_del';
    await client.query(`SAVEPOINT ${sp}`);
    let ok = true;
    try {
      await client.query('DELETE FROM marketing_content_variants WHERE id = $1', [fx.variantB]);
    } catch {
      ok = false;
    }
    await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
    expect(ok, 'venture B could not delete its own variant — a foreign row is still blocking it (23503)').toBe(true);
  });
});
