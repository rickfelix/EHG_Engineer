// SD-LEO-INFRA-COMPLETION-FAIL-OWN-001 — the head-count trap, pinned live.
//
// A gate probing existence with select(id,{count:'exact',head:true}) reads a MISSING table as a
// healthy zero: PostgREST returns NO error and count=null on an absent relation, while a real
// select errors PGRST205. This test runs BOTH shapes against a guaranteed-absent table and
// asserts the divergence, so nobody later swaps the classifier's real probe (to_regclass /
// real select) for the cheap shape as a "simplification". Measured live twice on 2026-08-09
// (worker + coordinator independently) before being pinned here.
//
// Live test in the DB tier (.db.test.js → DB_INCLUDE): the unit tier deliberately replaces
// credentials with the test.invalid.local sentinel (tests/setup.unit.js FR-1), so a live probe
// there hangs against a fake host until timeout — measured on this file's first run. The db
// project loads real credentials via tests/setup.db.js and is gated on a designated target;
// skipIf below is the residual guard for a credential-less shell.

import { describe, it, expect } from 'vitest';
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Name chosen to be absurd enough that no migration will ever create it.
const ABSENT_TABLE = 'zz_absent_negative_control_completion_fail_own_001';

describe.skipIf(!url || !key)('negative control: head-count cannot distinguish absent from empty', () => {
  it('real select errors PGRST205 on the absent table; head-count silently returns null', async () => {
    const sb = createClient(url, key);

    const real = await sb.from(ABSENT_TABLE).select('*').limit(1);
    expect(real.error).toBeTruthy();
    expect(real.error.code).toBe('PGRST205');

    const head = await sb.from(ABSENT_TABLE).select('id', { count: 'exact', head: true });
    // BOTH halves matter: no error AND a null count — the shape that reads absent as empty.
    expect(head.error).toBeNull();
    expect(head.count).toBeNull();
  }, 30_000);
});
