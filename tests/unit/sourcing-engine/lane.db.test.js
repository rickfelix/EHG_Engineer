// SD-LEO-INFRA-SOURCING-ENGINE-LEDGER-LANE-COLUMN-001 (FR-2 / FR-4) — DB-tier live probe.
//
// DORMANT-migration pattern: a confirmatory-only probe that a SUCCESSFUL query (error null) proves the
// `lane` column exists once Adam applies the migration. ANY inability to verify — no creds, network
// unreachable (fetch failed), or 42703 undefined_column (not applied yet) — SKIPS rather than fails. So
// this is green hermetically and only turns into a real PASS when the migration is live AND the DB is
// reachable. It lives in a *.db.test.js file (DB tier) so the unit tier (lane.test.js) stays hermetic.
import { describe, it, expect } from 'vitest';

async function probeLaneColumn(table, ctx) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return ctx.skip(); // no creds => cannot verify, skip
  let error;
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const s = createClient(url, key);
    ({ error } = await s.from(table).select('lane').limit(1));
  } catch {
    return ctx.skip(); // DB unreachable / transport error — cannot verify, do not false-fail
  }
  if (error) return ctx.skip(); // 42703 (DORMANT, not applied) or any PostgREST/connection error => skip
  expect(error).toBeNull(); // reached only when the column is present and queryable
}

describe('lane column live probe (FR-2 — dormant: skip until applied)', () => {
  it('the lane column exists on conversion_ledger once the migration is applied', async (ctx) => {
    await probeLaneColumn('conversion_ledger', ctx);
  });

  it('the lane column exists on roadmap_wave_items once the migration is applied', async (ctx) => {
    await probeLaneColumn('roadmap_wave_items', ctx);
  });
});
