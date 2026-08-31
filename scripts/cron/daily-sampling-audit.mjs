#!/usr/bin/env node
/**
 * Daily post-hoc sampling audit cron entry — SD-LEO-INFRA-TIERED-SOURCING-CLAIM-001 (FR-8).
 * Usage: node scripts/cron/daily-sampling-audit.mjs
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { runDailySamplingAudit } from '../../lib/fleet/daily-sampling-audit.js';

async function main() {
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const result = await runDailySamplingAudit(supabase);
  if (!result.recorded) {
    console.error(`[daily-sampling-audit] FAILED to record: ${result.error}`);
    process.exit(1);
  }
  console.log(`[daily-sampling-audit] recorded verdict=${result.verdict} count=${result.count}`);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('[daily-sampling-audit] FATAL:', e.message);
    process.exit(1);
  });
}
