import { afterAll, beforeAll, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { describeDb, itDb, HAS_REAL_DB } from '../helpers/db-available.js';
import { renderColdRecovery } from '../../scripts/coordinator-startup-check.mjs';

// QF-20260704-432: coordinator-cold-recovery.cjs was delivered + npm-wired but never invoked
// from the startup ritual — the survivor-agnostic cold-recovery path was unreachable in
// practice. coldRecover()'s own logic is already unit-tested with injected mocks
// (tests/unit/coordinator-cold-recovery.test.js); this test instead proves REACHABILITY:
// calling the actual startup-path function (renderColdRecovery, now wired into main())
// against the LIVE database surfaces a real orphaned claim -- no mocking the gate.

let svc;
let fixtureSdKey;

beforeAll(async () => {
  if (!HAS_REAL_DB) return;
  svc = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  fixtureSdKey = `QF432-FIX-${randomUUID().slice(0, 8)}`; // must fit id varchar(50)
  const orphanSessionId = `session_orphan_${randomUUID()}`; // no matching claude_sessions row -> orphaned
  const { error } = await svc.from('strategic_directives_v2').insert({
    id: fixtureSdKey,
    sd_key: fixtureSdKey,
    sd_code_user_facing: fixtureSdKey,
    uuid_internal_pk: randomUUID(),
    title: 'QF-20260704-432 cold-recovery reachability fixture',
    status: 'in_progress',
    category: 'Infrastructure',
    priority: 'low',
    description: 'disposable fixture for coordinator-startup-check reachability test',
    rationale: 'disposable fixture',
    scope: 'disposable fixture',
    sequence_rank: 999999,
    claiming_session_id: orphanSessionId,
    is_working_on: true,
  });
  if (error) throw error;
});

afterAll(async () => {
  if (!HAS_REAL_DB || !fixtureSdKey) return;
  await svc.from('strategic_directives_v2').delete().eq('sd_key', fixtureSdKey);
});

describeDb('renderColdRecovery — real startup-path reachability (no mocking the gate)', () => {
  itDb('a real orphaned claim is REACHED and reported via the actual startup-check entrypoint (dry-run, no mutation)', async () => {
    const out = await renderColdRecovery([], {});
    expect(out).toMatch(/COLD-RECOVERY SWEEP \(dry-run\)/);
    expect(out).toContain(fixtureSdKey);

    // Dry-run must not have mutated the fixture's claim.
    const { data } = await svc.from('strategic_directives_v2').select('claiming_session_id').eq('sd_key', fixtureSdKey).single();
    expect(data.claiming_session_id).not.toBeNull();
  }, 30000);
});
