#!/usr/bin/env node
/**
 * drain-capture-backlog — retroactively drain the venture-capture-completeness
 * backlog across ALL active ventures, through the exact shipped per-stage
 * capture path (captureVentureStage). QF-20260704-609.
 *
 * Usage:
 *   node scripts/drain-capture-backlog.mjs
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { drainCaptureBacklog } from '../lib/eva/venture-capture-forward.js';

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { attempted, captured, errors } = await drainCaptureBacklog(supabase);
  console.log(`\nDrained ${captured}/${attempted} missing capture(s).`);
  if (errors.length > 0) {
    console.log(`${errors.length} error(s):`);
    for (const e of errors) console.log(`  ${e.ventureId} stage ${e.stage}: ${e.error}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('drain-capture-backlog failed:', err.message);
  process.exit(1);
});
