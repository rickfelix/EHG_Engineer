/**
 * REAL, DB-backed integration test for SD-LEO-INFRA-PERIODIC-PROCESS-LIVENESS-001.
 *
 * Drives the real evaluateRow (scripts/periodic-liveness-watcher.mjs), stampLastFired
 * (lib/periodic-liveness/stamp-last-fired.js), and the real session_coordination
 * OVERDUE-emission/dedup path against disposable fixture rows in periodic_process_registry.
 * Non-mocked, against the live Postgres schema. All fixture rows and any emitted
 * session_coordination flags are cleaned up in afterAll -- zero residue.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve } from 'path';

import { stampLastFired } from '../../lib/periodic-liveness/stamp-last-fired.js';
import { evaluateRow, runWatcher, STATE } from '../../scripts/periodic-liveness-watcher.mjs';

dotenv.config({ path: resolve(process.cwd(), '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const HAS_REAL_DB = process.env.SUPABASE_URL
  && !process.env.SUPABASE_URL.includes('test.invalid.local')
  && process.env.SUPABASE_SERVICE_ROLE_KEY
  && !process.env.SUPABASE_SERVICE_ROLE_KEY.includes('test-service-role-key-not-real');

const ts = Date.now();
const fixtureKeys = [];

async function insertFixture({ suffix = 'fixture', ...overrides } = {}) {
  const processKey = `__e2e_periodic_liveness_${suffix}_${ts}__`;
  fixtureKeys.push(processKey);
  const { error } = await supabase.from('periodic_process_registry').insert({
    process_key: processKey,
    display_name: `E2E fixture ${processKey}`,
    owner: 'test-fixture',
    process_type: 'standalone_cron',
    expected_interval_seconds: 5,
    grace_multiplier: 3,
    liveness_source: 'self_stamped',
    session_bound: false,
    currently_expected_active: true,
    ...overrides,
  });
  if (error) throw new Error(`Failed to insert fixture ${processKey}: ${error.message}`);
  return processKey;
}

describe.skipIf(!HAS_REAL_DB)('Periodic-process liveness registry -- REAL DB', () => {
  afterAll(async () => {
    for (const key of fixtureKeys) {
      await supabase.from('session_coordination').delete().eq('payload->>process_key', key);
      await supabase.from('periodic_process_registry').delete().eq('process_key', key);
    }
  });

  it('TS-1: a self-stamped fixture fired twice then silenced 3x its interval is flagged OVERDUE with exactly one session_coordination row', async () => {
    const processKey = await insertFixture({ suffix: 'silenced' });
    await stampLastFired(supabase, processKey);
    // Backdate last_fired_at to simulate "silenced for 3x interval" (5s interval * 3 grace = 15s).
    await supabase.from('periodic_process_registry')
      .update({ last_fired_at: new Date(Date.now() - 60_000).toISOString() })
      .eq('process_key', processKey);

    const { data: row } = await supabase.from('periodic_process_registry').select('*').eq('process_key', processKey).single();
    const evaluation = await evaluateRow(row);
    expect(evaluation.state).toBe(STATE.OVERDUE);

    // Run the full watcher (not just evaluateRow) to exercise the real emission+dedup path.
    await runWatcher();
    await runWatcher(); // second run -- must NOT double-emit

    const { data: flags } = await supabase
      .from('session_coordination')
      .select('id')
      .eq('payload->>process_key', processKey)
      .eq('payload->>state', 'OVERDUE');
    expect(flags.length).toBe(1);
  });

  it('TS-2: a fixture stamped fresh (within interval*grace) produces zero flags', async () => {
    const processKey = await insertFixture({ suffix: 'healthy' });
    await stampLastFired(supabase, processKey);

    const { data: row } = await supabase.from('periodic_process_registry').select('*').eq('process_key', processKey).single();
    const evaluation = await evaluateRow(row);
    expect(evaluation.state).toBe(STATE.OK);

    await runWatcher();
    const { data: flags } = await supabase.from('session_coordination').select('id').eq('payload->>process_key', processKey);
    expect(flags.length).toBe(0);
  });

  it('TS-4: currently_expected_active=false with a genuinely stale last_fired_at produces zero flags (INTENTIONALLY_DOWN)', async () => {
    const processKey = await insertFixture({ suffix: 'stood_down', currently_expected_active: false });
    await supabase.from('periodic_process_registry')
      .update({ last_fired_at: new Date(Date.now() - 999_999_999).toISOString() })
      .eq('process_key', processKey);

    const { data: row } = await supabase.from('periodic_process_registry').select('*').eq('process_key', processKey).single();
    const evaluation = await evaluateRow(row);
    expect(evaluation.state).toBe(STATE.INTENTIONALLY_DOWN);

    await runWatcher();
    const { data: flags } = await supabase.from('session_coordination').select('id').eq('payload->>process_key', processKey);
    expect(flags.length).toBe(0);
  });

  it('FR-2: stampLastFired is a no-op (does not throw, does not create a row) for an unregistered process_key', async () => {
    const result = await stampLastFired(supabase, `__e2e_unregistered_${ts}__`);
    expect(result.stamped).toBe(false);
    expect(result.reason).toBe('not_registered_as_self_stamped');
  });
});
