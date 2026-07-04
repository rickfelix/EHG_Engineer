#!/usr/bin/env node
/**
 * Monthly referent-audit rotation CLI -- SD-LEO-INFRA-COVERAGE-MATRIX-SURFACE-001.
 * Usage: node scripts/coverage-matrix-referent-audit.mjs
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { runRotation } from '../lib/governance/coverage-matrix-referent-audit.js';

async function main() {
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  console.log('=== Coverage Matrix Referent-Audit Rotation ===');
  const result = await runRotation(supabase);

  if (result.skipped) {
    console.log(`Skipped: ${result.reason} (prior run at ${result.priorRun.ran_at})`);
    return;
  }

  console.log(`Delta: ${result.delta.new_unchecked.length} new unchecked, ${result.delta.newly_stale.length} newly stale, ${result.delta.newly_dormant.length} newly dormant`);
  console.log(`Sample-verification candidates: ${result.sampleCandidates.map((c) => `${c.surface_class}/${c.surface_key}`).join(', ') || '(none -- no covered rows yet)'}`);
  console.log(`Coverage questions emitted: ${result.feedbackIds.length}`);
}

main().catch((err) => { console.error('UNHANDLED:', err.message || err); process.exit(1); });
