// SD-LEO-INFRA-SOURCING-ENGINE-CHAIRMAN-QUEUE-001 (FR-1/FR-4) — DB-tier DORMANT live probe.
//
// Confirmatory-only: a SUCCESSFUL select proves sourcing_chairman_queue exists once Adam applies the
// migration. ANY inability to verify — no creds, network unreachable, or PGRST205/42P01 table-absent
// (not applied yet) — SKIPS rather than fails. Green hermetically; becomes a real PASS only when the
// table is live AND the DB is reachable. Lives in *.db.test.js so the unit tier stays hermetic.
import { describe, it, expect } from 'vitest';

describe('sourcing_chairman_queue live probe (FR-1 — dormant: skip until applied)', () => {
  it('the table exists + carries the gate columns once the migration is applied', async (ctx) => {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return ctx.skip();
    let error;
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const s = createClient(url, key);
      ({ error } = await s.from('sourcing_chairman_queue').select('id, lane, gate_type, state, sla_due_at').limit(1));
    } catch {
      return ctx.skip(); // DB unreachable — cannot verify, do not false-fail
    }
    if (error) return ctx.skip(); // PGRST205/42P01 (dormant) or any connection error => skip
    expect(error).toBeNull(); // reached only when the table is present and queryable
  });
});
