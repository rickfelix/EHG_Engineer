#!/usr/bin/env node
// venture-honesty-audit.js — print the chairman-facing marketing honesty audit for a venture
// (SD-LEO-FEAT-VENTURE-DEMAND-VALIDATION-001 FR-8). Read-only: buildHonestyAudit only SELECTs, so
// running this can never change what it reports.
//
//   node scripts/venture-honesty-audit.js <venture-id> [--json]
//
// Mirrors scripts/chairman-product-review-packet.js — the existing per-venture chairman surface.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { buildHonestyAudit, renderHonestyAudit, registerHonestyAuditOwner } from '../lib/marketing/venture-honesty-audit.js';
import { armCliTeardown } from '../lib/cli-graceful-exit.js';

const [ventureId, ...rest] = process.argv.slice(2);
const asJson = rest.includes('--json');

if (!ventureId) {
  console.error('Usage: node scripts/venture-honesty-audit.js <venture-id> [--json]');
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// Fail-soft bookkeeping: records the ARMED operator contract for this machinery so an
// audit that never fires is visible to the periodic-liveness watcher. Never blocks the run.
await registerHonestyAuditOwner(supabase);

const audit = await buildHonestyAudit({ supabase, ventureId });

if (asJson) {
  console.log(JSON.stringify(audit, null, 2));
} else {
  console.log('');
  console.log(renderHonestyAudit(audit));
  console.log('');
}
await armCliTeardown(0);
