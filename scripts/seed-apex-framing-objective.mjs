#!/usr/bin/env node
/**
 * seed-apex-framing-objective.mjs — SD-LEO-INFRA-FW3-FRAMING-PLUMBING-001-H (FR-1).
 *
 * Thin entrypoint: seeds the apex-framing decision-quality objective + its two
 * anti-Goodhart guards as spine §3.3 rows. Idempotent, safe to re-run — the
 * NULL-venture objective row is SELECT-first (see lib/org/apex-framing-objective.mjs
 * for the NULLs-distinct constraint caveat); guards upsert on guard_key.
 * Precedent: scripts/seed-periodic-process-registry.mjs.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { seedApexFramingObjective, APEX_OBJECTIVE_STATEMENT, APEX_OBJECTIVE_METRIC } from '../lib/org/apex-framing-objective.mjs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const result = await seedApexFramingObjective(supabase);
if (result.objectiveSeeded) {
  console.log(`✓ Registered objective '${result.objectiveKey}' (venture_id NULL, mode advisory)`);
  console.log(`  statement: ${APEX_OBJECTIVE_STATEMENT}`);
  console.log(`  metric: ${APEX_OBJECTIVE_METRIC}`);
} else {
  console.log(`✓ Objective '${result.objectiveKey}' already seeded — unchanged (SELECT-first idempotency)`);
}
console.log(`✓ Guards upserted (idempotent on guard_key): ${result.guardKeys.join(', ')}`);
