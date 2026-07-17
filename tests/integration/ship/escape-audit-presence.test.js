/**
 * Read-only presence test: ship_escape_audit schema liveness.
 * SD-LEO-FIX-SHIP-ESCAPE-AUDIT-001 (FR-2b).
 *
 * The audit trail for admin-override merges was silently EMPTY for 6 days because the
 * chairman-approved migration (20260711_ship_escape_audit.sql) was never applied — the
 * writer fails soft by design, so nothing failed loudly. This test makes that state
 * loud: if the table (or its dual-key shape) ever goes missing again, CI fails here.
 *
 * STRICTLY READ-ONLY (risk 4b30fab5 R2): ship_escape_audit is an append-only audit
 * substrate — this test never inserts or deletes. The writer's behavior is covered by
 * the stubbed units in tests/unit/ship/escape-auth.test.js.
 */

import { describe, test, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createEscapeAuditChecker } from '../../../lib/ship/escape-auth.mjs';

const HAS_REAL_DB = !!(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!HAS_REAL_DB)('ship_escape_audit — schema presence (read-only)', () => {
  const supabase = HAS_REAL_DB
    ? createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;

  test('the table exists and is selectable (the 6-day silent-absence regression guard)', async () => {
    const { error } = await supabase.from('ship_escape_audit').select('id').limit(1);
    expect(error, 'ship_escape_audit missing again — the approved migration is no longer applied').toBeNull();
  });

  test('dual-key columns are selectable with the exact writer shape', async () => {
    // Selecting the writer's columns by name fails loudly on any rename/drop drift.
    const { error } = await supabase
      .from('ship_escape_audit')
      .select('id, pr_number, repo, session_id, reason, merge_commit_sha, created_at')
      .limit(1);
    expect(error, 'ship_escape_audit column shape drifted from the writer contract').toBeNull();
  });

  test('the reader path works end-to-end against the live table (no rows for a sentinel PR)', async () => {
    const check = createEscapeAuditChecker(supabase);
    // A sentinel PR number that can never exist (checker guards reject falsy 0);
    // a healthy live table answers false (not null=lookup-failed).
    const result = await check(999999999, 'rickfelix', 'EHG_Engineer');
    expect(result).toBe(false);
  });
});
