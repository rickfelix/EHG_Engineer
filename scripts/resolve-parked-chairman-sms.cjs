#!/usr/bin/env node
/**
 * SD-LEO-INFRA-CHAIRMAN-INBOUND-VISIBILITY-001 FR-4c: explicit disposition CLI for a parked
 * chairman SMS row (lib/chairman/sms-bridge.js resolveParkedChairmanSmsRow). Run this after
 * a parked message has actually been addressed (reply sent / disposition otherwise decided).
 *
 * Usage: node scripts/resolve-parked-chairman-sms.cjs <sms_relay_staging-row-id>
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function main() {
  const id = process.argv[2];
  if (!id) {
    console.error('Usage: node scripts/resolve-parked-chairman-sms.cjs <row-id>');
    process.exit(1);
  }

  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const { resolveParkedChairmanSmsRow } = await import('../lib/chairman/sms-bridge.js');
  const { resolved } = await resolveParkedChairmanSmsRow(supabase, id);

  if (resolved) {
    console.log(`[RESOLVED] ${id} — parked_at cleared for the quiet-tick, resolved_at stamped.`);
  } else {
    console.log(`[NO_OP] ${id} — already resolved, or was never parked. No change made.`);
  }
}

main().catch((err) => {
  console.error(`[ERROR] ${err.message}`);
  process.exit(1);
});
