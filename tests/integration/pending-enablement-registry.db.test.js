/**
 * Integration tests (live DB) for the Pending-Enablement Registry.
 * SD-LEO-INFRA-POLICY-GATED-AUTO-001A. Self-skips without a real DB.
 *
 * Proves: the 5 registry columns exist; registerPendingFlag is idempotent and
 * non-destructive; and WRITER/CONSUMER PARITY — a registered aged default-OFF
 * row is actually returned by fetchAgedPendingFlags and rendered in the email body.
 */
import { afterAll, beforeAll, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { describeDb, itDb } from '../helpers/db-available.js';
import {
  registerPendingFlag,
  fetchAgedPendingFlags,
  renderAgedPendingHtml,
} from '../../lib/pending-enablement-registry.js';

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const AGED_KEY = 'TEST_PENDING_REGISTRY_AGED_001A';
const FRESH_KEY = 'TEST_PENDING_REGISTRY_FRESH_001A';
const daysAgoIso = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

async function cleanup() {
  await db.from('leo_feature_flags').delete().in('flag_key', [AGED_KEY, FRESH_KEY]);
}

describeDb('Pending-Enablement Registry (live DB)', () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  itDb('the 5 registry columns exist on leo_feature_flags', async () => {
    const { error } = await db
      .from('leo_feature_flags')
      .select('gates_what, enablement_criteria, rolled_out_at, last_reviewed_at, target')
      .limit(1);
    expect(error).toBeNull();
  });

  itDb('registerPendingFlag inserts a new default-OFF row', async () => {
    const { row, created } = await registerPendingFlag(db, {
      flag_key: AGED_KEY,
      display_name: 'Test Aged Pending 001A',
      gates_what: 'test guard',
      enablement_criteria: 'never (test only)',
      target: 'EHG_Engineer',
      rolled_out_at: daysAgoIso(30),
    });
    expect(created).toBe(true);
    expect(row.is_enabled).toBe(false);
    expect(row.lifecycle_state).toBe('disabled');
    expect(row.gates_what).toBe('test guard');
  });

  itDb('registerPendingFlag is idempotent and non-destructive on re-run', async () => {
    const { created } = await registerPendingFlag(db, {
      flag_key: AGED_KEY,
      gates_what: 'DIFFERENT — must NOT overwrite the human-set value',
      rolled_out_at: daysAgoIso(1),
    });
    expect(created).toBe(false);
    const { data } = await db.from('leo_feature_flags').select('gates_what, rolled_out_at').eq('flag_key', AGED_KEY).maybeSingle();
    expect(data.gates_what).toBe('test guard'); // unchanged — never clobbered
  });

  itDb('WRITER/CONSUMER PARITY: an aged registered row is fetched AND rendered in the email', async () => {
    const aged = await fetchAgedPendingFlags(db, { now: Date.now() });
    const keys = aged.map((f) => f.flag_key);
    expect(keys).toContain(AGED_KEY); // consumer (surfacer query) sees the writer's row

    const html = renderAgedPendingHtml(aged, { now: Date.now() });
    expect(html).toContain(AGED_KEY); // and it actually renders into the email body
  });

  itDb('a fresh (<7d) pending row is registered but NOT surfaced', async () => {
    await registerPendingFlag(db, {
      flag_key: FRESH_KEY,
      display_name: 'Test Fresh Pending 001A',
      gates_what: 'fresh test guard',
      target: 'EHG_Engineer',
      rolled_out_at: daysAgoIso(2),
    });
    const aged = await fetchAgedPendingFlags(db, { now: Date.now() });
    expect(aged.map((f) => f.flag_key)).not.toContain(FRESH_KEY);
  });
});
