/**
 * PARK-PATH CANARY — SD-LEO-INFRA-STAGE0-NURSERY-PARK-PATH-001 (FR-3, SD acceptance).
 *
 * Parks one non-'ready' brief through the REAL venture_nursery schema and asserts the row
 * EXISTS with the CHECK-mapped maturity_level and the rich brief in source_ref — the
 * exact write that previously threw on 9 phantom columns and hard-failed every
 * seed/sprout/blocked Stage-0 request (Charlie ledger CH-1). This canary is the Discovery
 * RUN-ORDER gate's green signal for this SD. Cleans up after itself; guarded like the
 * sibling *-realdb tests (skips without real DB env).
 */
import { describe, it, expect, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve } from 'path';

import { parkVenture, reactivateVenture } from '../../../lib/eva/stage-zero/venture-nursery.js';

dotenv.config({ path: resolve(process.cwd(), '.env') });

const HAS_REAL_DB = process.env.SUPABASE_URL
  && !process.env.SUPABASE_URL.includes('test.invalid.local')
  && process.env.SUPABASE_SERVICE_ROLE_KEY
  && !process.env.SUPABASE_SERVICE_ROLE_KEY.includes('test-service-role-key-not-real');

const supabase = HAS_REAL_DB ? createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
) : null;

const ts = Date.now();
const NAME = `__e2e_nursery_park_canary_${ts}__`;
const createdIds = [];

const seedBrief = {
  name: NAME,
  problem_statement: 'Canary problem statement',
  solution: 'Canary solution',
  target_market: 'canary market',
  origin_type: 'discovery',
  raw_chairman_intent: 'canary intent',
  maturity: 'seed', // the non-'ready' outcome that previously hard-failed the request
  composite_score: 55,
  metadata: { synthesis: { weighted_score: { total_score: 61 } } },
};

describe.skipIf(!HAS_REAL_DB)('park-path canary (REAL venture_nursery schema)', () => {
  afterAll(async () => {
    if (!supabase) return;
    // Idempotent cleanup by canary name; verify zero residue.
    await supabase.from('venture_nursery').delete().eq('name', NAME).then(() => {}, () => {});
    await supabase.from('venture_nursery').delete().ilike('name', `${NAME}%`).then(() => {}, () => {});
    const { count } = await supabase
      .from('venture_nursery')
      .select('id', { count: 'exact', head: true })
      .ilike('name', `${NAME}%`);
    if (count > 0) throw new Error(`canary residue: ${count} venture_nursery row(s) left for ${NAME}*`);
  });

  it('parks a seed brief: insert SUCCEEDS against the live schema and the row EXISTS', async () => {
    const entry = await parkVenture(
      seedBrief,
      { reason: 'canary: not ready for Stage 1', triggerConditions: [{ type: 'canary' }], reviewSchedule: '30d' },
      { supabase, logger: { log: () => {} } }
    );
    expect(entry.id).toBeTruthy();
    createdIds.push(entry.id);

    // Row exists with the mapped live shape (not just no-error — supabase can be silent).
    const { data: row, error } = await supabase
      .from('venture_nursery')
      .select('id, name, maturity_level, trigger_conditions, current_score, next_evaluation_at, evaluation_interval_days, source_type, source_ref')
      .eq('id', entry.id)
      .single();
    expect(error).toBeNull();
    expect(row.name).toBe(NAME);
    expect(['seed', 'sprout', 'ready']).toContain(row.maturity_level);
    expect(row.maturity_level).toBe('seed');
    expect(row.source_type).toBe('discovery_mode');
    expect(row.current_score).toBe(61);
    expect(row.evaluation_interval_days).toBe(30);
    expect(row.next_evaluation_at).toBeTruthy();
    expect(row.source_ref.park.parked_reason).toContain('canary');
    expect(row.source_ref.brief.problem_statement).toBe('Canary problem statement');
  }, 30_000);

  it('round-trips: the parked row reactivates and yields a synthesis-ready pathOutput', async () => {
    expect(createdIds.length).toBeGreaterThan(0);
    const { pathOutput, entry } = await reactivateVenture(
      createdIds[0],
      { reason: 'canary reactivation' },
      { supabase, logger: { log: () => {} } }
    );
    expect(entry.source_ref.reactivation.reason).toBe('canary reactivation');
    expect(pathOutput.suggested_problem).toBe('Canary problem statement');
    expect(pathOutput.origin_type).toBe('nursery_reeval');
    // SD-FDBK-FIX-STAGE-PROMOTION-NEVER-001: confirm the carry-forward source exists on the
    // real pathOutput this SD's synthesis/index.js change reads from.
    expect(pathOutput.raw_material.nursery_id).toBe(createdIds[0]);
  }, 30_000);

  // SD-FDBK-FIX-STAGE-PROMOTION-NEVER-001: the double-promotion guard (venture-nursery.js:170)
  // is reachable ONLY via a nursery row that has promoted_to_venture_id set WITHOUT ever going
  // through reactivateVenture first — reactivateVenture's OWN "already reactivated" guard (the
  // line immediately above it) would otherwise always fire first on a row this test's own
  // reactivateVenture already touched. That is exactly the real nursery_reeval promotion shape
  // (never calls reactivateVenture), so a fresh, never-reactivated canary row is used here.
  //
  // The stamp itself is set via a direct UPDATE rather than the real persistVentureBrief path:
  // persistVentureBrief's 'ready' branch is gated by the live eva_config wip_limit (currently
  // 2, with 2 real live ventures already in this shared dev DB) — creating a real venture here
  // would either fail against that genuine chairman-governed limit or, worse, require mutating
  // shared eva_config / other live ventures to make room, which a test must never do. The stamp
  // mechanism itself (FR-3) is covered by a mocked-supabase unit test in chairman-review.test.js
  // instead; this test targets the pre-existing (now genuinely reachable) guard against a real
  // venture_nursery row, using any already-existing venture id purely as the FK target.
  it('the double-promotion guard fires on a row stamped promoted without ever being reactivated', async () => {
    const guardBrief = {
      name: `${NAME}_guard_seed`,
      problem_statement: 'Guard canary problem statement',
      solution: 'Guard canary solution',
      target_market: 'guard canary market',
      origin_type: 'discovery',
      raw_chairman_intent: 'guard canary intent',
      maturity: 'seed',
      composite_score: 55,
      metadata: { synthesis: { weighted_score: { total_score: 61 } } },
    };
    const guardEntry = await parkVenture(
      guardBrief,
      { reason: 'canary: guard test seed', triggerConditions: [{ type: 'canary' }], reviewSchedule: '30d' },
      { supabase, logger: { log: () => {} } }
    );
    createdIds.push(guardEntry.id);

    // Any pre-existing venture id works as the FK target (ON DELETE SET NULL protects it —
    // this test never writes to the ventures table, only references an existing row's id).
    const { data: anyVenture, error: anyVentureErr } = await supabase
      .from('ventures')
      .select('id')
      .limit(1)
      .single();
    expect(anyVentureErr).toBeNull();
    expect(anyVenture?.id).toBeTruthy();

    const { error: stampErr } = await supabase
      .from('venture_nursery')
      .update({ promoted_to_venture_id: anyVenture.id, promoted_at: new Date().toISOString() })
      .eq('id', guardEntry.id);
    expect(stampErr).toBeNull();

    const { data: guardRow } = await supabase
      .from('venture_nursery')
      .select('promoted_to_venture_id, source_ref')
      .eq('id', guardEntry.id)
      .single();
    expect(guardRow.promoted_to_venture_id).toBe(anyVenture.id);
    expect(guardRow.source_ref?.reactivation).toBeFalsy();

    // A stray/duplicate reactivation attempt against an already-promoted row must now be
    // rejected — this is the guard that was dead code before this SD (nothing ever set
    // promoted_to_venture_id in production, so this branch could never be reached).
    await expect(
      reactivateVenture(guardEntry.id, { reason: 'canary double-promotion attempt' }, { supabase, logger: { log: () => {} } })
    ).rejects.toThrow('Venture already promoted');
  }, 30_000);
});
