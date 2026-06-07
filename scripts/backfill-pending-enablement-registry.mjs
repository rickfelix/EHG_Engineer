#!/usr/bin/env node
/**
 * Backfill the Pending-Enablement Registry with existing default-OFF rollouts
 * so the operator gets the full inert-flag inventory, not just future rollouts.
 * SD-LEO-INFRA-POLICY-GATED-AUTO-001A.
 *
 * Idempotent: re-running only fills NULL registry columns; it never flips
 * is_enabled / lifecycle_state on an existing row and never overwrites a human
 * edit (see registerPendingFlag). Safe to run repeatedly.
 *
 * Usage:  node --env-file=.env scripts/backfill-pending-enablement-registry.mjs [--dry-run]
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { registerPendingFlag } from '../lib/pending-enablement-registry.js';

const DRY_RUN = process.argv.includes('--dry-run');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Known shipped-but-default-OFF flags across the fleet. rolled_out_at is the
// best-known ship date; items surface in the exec email once aged past the
// review threshold (>7d).
const INERT_FLAGS = [
  {
    flag_key: 'COORD_TEARDOWN_SAFETY_V2',
    display_name: 'Coordinator Cron-Teardown Safety V2',
    gates_what: 'Unified coordinator teardown helper that fixes the self-reversing /coordinator stop (inbox cron re-asserts the pointer).',
    enablement_criteria: 'Operator confirms coordinator teardown is reliable across inbox-cron re-assertion.',
    target: 'EHG_Engineer',
    rolled_out_at: '2026-06-06T00:00:00Z',
    risk_tier: 'medium',
  },
  {
    flag_key: 'COORDINATOR_TWOWAY_V2',
    display_name: 'Two-Way Coordinator (DB-canonical election)',
    gates_what: 'resolve.cjs DB-canonical coordinator election + two-way worker/coordinator signaling.',
    enablement_criteria: 'Operator confirms DB-canonical election is stable under multi-session load.',
    target: 'EHG_Engineer',
    rolled_out_at: '2026-06-05T00:00:00Z',
    risk_tier: 'high',
  },
  {
    flag_key: 'COORD_DETECTORS_V2',
    display_name: 'Coordination Observability Detectors',
    gates_what: 'Read-only SPLIT_BRAIN/THUNDERING_HERD/REPLY_STARVATION/STUCK_WORKER/CLAIM_HALF_WRITE detectors.',
    enablement_criteria: 'Operator confirms detector signal-to-noise is acceptable on real coordination data.',
    target: 'EHG_Engineer',
    rolled_out_at: '2026-06-05T00:00:00Z',
    risk_tier: 'low',
  },
  {
    flag_key: 'SURFACE_INERT_WORKER_V1',
    display_name: 'Surface Inert Worker Revival',
    gates_what: 'Read-only detector that surfaces INERT worker-revival (worker_spawn_requests with 0 consumers).',
    enablement_criteria: 'Operator confirms inert-worker alerts are actionable and de-duped.',
    target: 'EHG_Engineer',
    rolled_out_at: '2026-06-06T00:00:00Z',
    risk_tier: 'low',
  },
];

let created = 0, filled = 0, unchanged = 0;
for (const entry of INERT_FLAGS) {
  if (DRY_RUN) {
    console.log(`[dry-run] would register ${entry.flag_key}`);
    continue;
  }
  try {
    const { row, created: isNew } = await registerPendingFlag(db, entry);
    if (isNew) { created++; console.log(`  + created ${entry.flag_key}`); }
    else if (row && (row.gates_what === entry.gates_what || row.target === entry.target)) { filled++; console.log(`  ~ filled  ${entry.flag_key}`); }
    else { unchanged++; console.log(`  = unchanged ${entry.flag_key}`); }
  } catch (e) {
    console.error(`  ! failed ${entry.flag_key}: ${e.message}`);
  }
}
console.log(`\nBackfill done: created=${created} filled=${filled} unchanged=${unchanged} (dry_run=${DRY_RUN})`);
