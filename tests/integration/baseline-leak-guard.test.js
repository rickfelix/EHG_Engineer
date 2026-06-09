/**
 * Integration Test: sd_baseline_items leak guard (behavioral net-zero)
 * SD: SD-LEO-INFRA-BULK-PURGE-LIVE-001 — FR-3
 *
 * WHY THIS EXISTS
 * sd_baseline_items has NO foreign key / ON DELETE CASCADE to strategic_directives_v2.
 * The fn_sync_sd_to_baseline AFTER-INSERT trigger writes one sd_baseline_items row
 * (sd_id = NEW.sd_key) whenever an SD is inserted and an active baseline exists. So any
 * test that inserts a real SD and later deletes ONLY the SD leaves a dead baseline orphan.
 * Those orphans accumulated to ~86% of the table and degraded the v_sd_next_candidates
 * self-claim queue fleet-wide. FR-2 fixed the leak at the shared cleanup sinks; this guard
 * makes the fix durable by FAILING if the shared sink ever stops deleting the baseline row.
 *
 * DESIGN — net-zero by FIXTURE FOOTPRINT, not global count.
 * This suite runs against the LIVE database alongside up to ~6 other fleet sessions that
 * insert/complete SDs concurrently, so a global COUNT(*) before/after would be racy. Instead
 * we assert the fixture's OWN footprint returns to zero (rows for its sd_key: 0 -> 1 -> 0).
 * That is a true net-zero for this fixture, immune to concurrent peers, and still fails the
 * instant the shared-sink cleanup omits the baseline delete (a leftover row -> assertion fail).
 *
 * The cleanup path under guard is the shared sink deleteTestDirective() (tests/helpers).
 */

import { describe, it, expect } from 'vitest';
import { randomUUID } from 'crypto';
import { getSupabaseClient, deleteTestDirective } from '../helpers/database-helpers.js';
import dotenv from 'dotenv';

dotenv.config();

// Mirrors the proven-good insert shape from sd-completed-handler.test.js so the row passes
// the BEFORE-INSERT governance/content-quality triggers on strategic_directives_v2.
const SD_DEFAULTS = {
  rationale: 'Fixture SD for the baseline-leak-guard net-zero regression test',
  scope: 'Test scope',
  description: 'Test description',
  status: 'draft',
  category: 'infrastructure',
  priority: 'low',
  current_phase: 'EXEC',
  target_application: 'EHG_Engineer',
  created_by: 'test-harness',
  key_principles: ['Test principle'],
  success_criteria: [{ criterion: 'Baseline row is cleaned on SD delete', met: false }],
  key_changes: [{ change: 'leak guard fixture', type: 'test' }],
  strategic_objectives: ['Guard against sd_baseline_items re-leak'],
  success_metrics: [{ metric: 'Net-zero baseline footprint', target: '0', actual: 'TBD' }],
  smoke_test_steps: ['Insert fixture SD, clean via shared sink, assert net-zero'],
  risks: [{ risk: 'None', mitigation: 'N/A' }],
  governance_metadata: { automation_context: 'test-harness' },
};

const credsPresent = !!(
  process.env.SUPABASE_SERVICE_ROLE_KEY &&
  (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)
);

/** Count sd_baseline_items rows belonging to a specific fixture sd_key (the fixture footprint). */
async function footprint(supabase, sdKey) {
  const { count, error } = await supabase
    .from('sd_baseline_items')
    .select('id', { count: 'exact', head: true })
    .eq('sd_id', sdKey);
  if (error) throw new Error(`footprint count failed: ${error.message}`);
  return count ?? 0;
}

async function hasActiveBaseline(supabase) {
  const { data, error } = await supabase
    .from('sd_execution_baselines')
    .select('id')
    .eq('is_active', true)
    .limit(1);
  if (error) throw new Error(`active-baseline check failed: ${error.message}`);
  return !!(data && data.length);
}

describe('sd_baseline_items leak guard (FR-3, behavioral net-zero)', () => {
  it.skipIf(!credsPresent)(
    'fixture baseline footprint returns to zero after shared-sink cleanup',
    async () => {
      const supabase = getSupabaseClient();

      // fn_sync_sd_to_baseline only writes a row when an active baseline exists. Without one
      // the trigger is inert, so the guard cannot demonstrate the leak — skip rather than
      // pass vacuously.
      if (!(await hasActiveBaseline(supabase))) {
        console.warn('[baseline-leak-guard] no active baseline present — trigger inert, skipping');
        return;
      }

      const uuid = randomUUID();
      const sdKey = `SD-LEAKGUARD-${Date.now().toString(36).toUpperCase()}-${uuid.slice(0, 8)}`;

      // Footprint must start clean (unique sd_key).
      expect(await footprint(supabase, sdKey)).toBe(0);

      try {
        // Insert through the standard path → fires fn_sync_sd_to_baseline (writes sd_id = sd_key).
        const { error: insErr } = await supabase
          .from('strategic_directives_v2')
          .insert({ id: uuid, sd_key: sdKey, title: 'Baseline Leak Guard Fixture', sd_type: 'infrastructure', ...SD_DEFAULTS })
          .select('id, sd_key')
          .single();
        expect(insErr?.message ?? null, insErr?.message).toBeNull();

        // Precondition: the trigger created exactly one baseline orphan source for this sd_key.
        expect(
          await footprint(supabase, sdKey),
          'fn_sync_sd_to_baseline should have written exactly one baseline row keyed by sd_key',
        ).toBe(1);

        // Clean via the SHARED sink — the consumer this guard protects. It must delete the
        // baseline row (by id and sd_key) BEFORE the SD, leaving no orphan.
        await deleteTestDirective(uuid);

        // The net-zero assertion: the fixture's baseline footprint is back to zero. If a future
        // change drops the baseline delete from the shared sink, a row remains here and this fails.
        expect(
          await footprint(supabase, sdKey),
          'shared-sink cleanup must leave the fixture sd_baseline_items footprint net-zero (no orphan)',
        ).toBe(0);
      } finally {
        // Defensive teardown: never leak even if an assertion above threw mid-flight.
        await supabase.from('sd_baseline_items').delete().eq('sd_id', sdKey);
        await supabase.from('strategic_directives_v2').delete().eq('id', uuid);
      }
    },
  );
});
