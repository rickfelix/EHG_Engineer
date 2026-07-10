/**
 * Integration tests (live DB) for SD-LEO-INFRA-STAGE0-ENVELOPE-REGISTRATION-001.
 * Self-skips without a real DB.
 *
 * Proves against the LIVE corrected envelope (not a mock):
 * - TS-1: the 4 registered capabilities exist with non-empty evidence, idempotent re-run.
 * - TS-2: a synthetic candidate requiring "Web Hosting" (or any of the other 3) now passes
 *   checkTraversability -- the SD's central claim, proven independent of any confounding
 *   from the live nursery_reeval run (whose 16 parked candidates turned out to have lost
 *   their required_capabilities entirely at park-time -- a separate, pre-existing defect
 *   routed as a completion-flag, not fixed by this SD).
 * - TS-7: getCapabilityContextBlock()'s query excludes the internal-tooling seeder's rows.
 */
import { afterAll, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { describeDb, itDb } from '../helpers/db-available.js';
import { loadCapabilityEnvelope, checkTraversability } from '../../lib/eva/stage-zero/traversability-gate.js';
import { getCapabilityContextBlock } from '../../lib/capabilities/scanner-context.js';

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const REGISTERED_NAMES = ['Web Hosting', 'Payment Gateway', 'LLM API', 'Transactional Email'];

describeDb('Stage-0 envelope registration (live DB)', () => {
  itDb('the 4 registered capabilities exist in venture_capabilities with non-empty evidence (TS-1)', async () => {
    const { data, error } = await db
      .from('venture_capabilities')
      .select('name, evidence, maturity_level')
      .in('name', REGISTERED_NAMES);

    expect(error).toBeNull();
    expect(data).toHaveLength(4);
    for (const row of data) {
      expect(row.maturity_level).toBe('production');
      expect(row.evidence).toBeTruthy();
      expect(row.evidence.type).toBeTruthy();
      expect(row.evidence.value).toBeTruthy();
      expect(row.evidence.verified_at).toBeTruthy();
    }
  });

  itDb('a candidate requiring "Web Hosting" now passes checkTraversability against the live envelope (TS-2)', async () => {
    const envelope = await loadCapabilityEnvelope({ supabase: db });
    expect(envelope.count).toBeGreaterThan(0);

    const candidates = [
      { name: 'Test Venture', required_capabilities: [{ name: 'Web Hosting', kind: 'form_factor' }] },
    ];
    const { passed, failed } = checkTraversability(candidates, envelope);
    expect(passed).toHaveLength(1);
    expect(failed).toHaveLength(0);
    expect(passed[0].traversability).toBe('passed');
  });

  itDb('a candidate requiring each of the other 3 registered capabilities also passes (TS-2)', async () => {
    const envelope = await loadCapabilityEnvelope({ supabase: db });
    const candidates = ['Payment Gateway', 'LLM API', 'Transactional Email'].map((name) => ({
      name: `Test Venture (${name})`,
      required_capabilities: [{ name, kind: 'integration' }],
    }));
    const { passed, failed } = checkTraversability(candidates, envelope);
    expect(passed).toHaveLength(3);
    expect(failed).toHaveLength(0);
  });

  itDb('a candidate requiring a genuinely undelivered capability still fails (no over-matching)', async () => {
    const envelope = await loadCapabilityEnvelope({ supabase: db });
    const candidates = [
      { name: 'Test Venture', required_capabilities: [{ name: 'Quantum Teleportation Network', kind: 'ops' }] },
    ];
    const { passed, failed } = checkTraversability(candidates, envelope);
    expect(passed).toHaveLength(0);
    expect(failed).toHaveLength(1);
  });

  itDb('getCapabilityContextBlock excludes the internal-tooling seeder rows (TS-7)', async () => {
    const block = await getCapabilityContextBlock(db, 'trend_scanner', 1);
    // These are the exact bare internal slugs the SD's rationale cites as having leaked.
    expect(block).not.toMatch(/\bdb-prd-system\b/);
    expect(block).not.toMatch(/\bauto-proceed\b/);
    expect(block).not.toMatch(/\bcmd-leo\b/);
  });
});
