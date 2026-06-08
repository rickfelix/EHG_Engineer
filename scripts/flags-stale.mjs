// flags-stale.mjs — read-only stale-flag report for humans (the /flags stale subcommand).
// SD-LEO-INFRA-ACTIVATE-FEATURE-FLAG-001 (FR-2). Unlike flag-governance-review.mjs (the
// scheduled job that ALSO stamps last_reviewed_at and is gated default-OFF), this is a
// pure read: it never mutates the registry and is always available to an operator.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { computeStaleFlags, formatDigest } from '../lib/feature-flags/governance-review.js';

const db = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export async function staleReportMain() {
  const { data: flags, error } = await db.from('leo_feature_flags').select('*');
  if (error) {
    console.error(`[FLAGS-STALE] failed to list flags: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  const result = computeStaleFlags(flags || [], Date.now());
  console.log(formatDigest(result));
  return result;
}

if (process.argv[1] && /flags-stale\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))) {
  staleReportMain();
}
