#!/usr/bin/env node
/**
 * Rescan Stage 20 — Refresh SD completion status for a venture
 *
 * Thin CLI wrapper around the rescan_stage_20 RPC function.
 * The RPC queries current SD statuses, updates venture_stage_work
 * stage 20 advisory_data, and advances to Stage 21 if all SDs are terminal.
 *
 * Usage:
 *   node scripts/rescan-stage20.js --venture <venture-id>
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { isMainModule } from '../lib/utils/is-main-module.js';

/**
 * Rescan SD completion for a venture via RPC.
 *
 * @param {string} ventureId - Venture UUID
 * @param {Object} [options]
 * @param {Object} [options.supabase] - Supabase client (created if not provided)
 * @returns {Promise<Object>} Rescan result from RPC
 */
export async function rescanStage20(ventureId, options = {}) {
  const supabase = options.supabase || createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data, error } = await supabase.rpc('rescan_stage_20', {
    p_venture_id: ventureId,
  });

  if (error) throw new Error(`RPC failed: ${error.message}`);
  return data;
}

if (isMainModule(import.meta.url)) {
  const ventureIdx = process.argv.indexOf('--venture');
  const ventureId = ventureIdx >= 0 ? process.argv[ventureIdx + 1] : null;

  if (!ventureId) {
    console.error('Usage: node scripts/rescan-stage20.js --venture <venture-id>');
    process.exit(1);
  }

  rescanStage20(ventureId)
    .then(result => {
      console.log('\nStage 20 Rescan Result:');
      console.log(`  SDs: ${result.terminal}/${result.total} terminal`);
      console.log(`  Build pending: ${result.build_pending}`);
      console.log(`  Stage status: ${result.stage_status}`);
      if (result.pending_count > 0) {
        console.log(`  Pending SDs: ${result.pending_count}`);
      }
      if (result.advanced_to) {
        console.log(`  Venture advanced to stage ${result.advanced_to}`);
      }
      process.exit(0);
    })
    .catch(err => {
      console.error('Rescan failed:', err.message);
      process.exit(1);
    });
}
