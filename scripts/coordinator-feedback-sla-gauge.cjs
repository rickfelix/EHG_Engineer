#!/usr/bin/env node
'use strict';
// Daily coordinator-tick reminder for feedback-consumption SLA breaches — QF-20260704-493.
// Fail-open: any error is logged and exits 0 (never blocks the coordinator's cron cadence).
require('dotenv').config();
const { createSupabaseServiceClient } = require('../lib/supabase-client.cjs');
const { remindSlaBreaches } = require('../lib/coordinator/feedback-sla-gauge.cjs');

(async () => {
  const supabase = createSupabaseServiceClient();
  const { breaches, sent } = await remindSlaBreaches(supabase, {});
  if (breaches.length === 0) {
    console.log('[feedback-sla-gauge] no SLA breaches — all actionable categories consumed within SLA.');
    return;
  }
  console.log(`[feedback-sla-gauge] ${breaches.length} categor${breaches.length === 1 ? 'y' : 'ies'} breaching, ${sent.length} new reminder(s) sent.`);
})().catch((e) => {
  console.error('[feedback-sla-gauge] FATAL (fail-open)', e && e.message ? e.message : e);
  process.exit(0);
});
