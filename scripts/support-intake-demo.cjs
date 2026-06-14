#!/usr/bin/env node
/**
 * Seeded end-to-end demo for the support intake->triage->route pipeline.
 * SD-LEO-INFRA-SUPPORT-INTAKE-TRIAGE-001 (FR-4/FR-5).
 *
 * Sends a happy-path ticket through the pipeline (auto-resolved, zero-touch) and flips
 * KR-2026-07-01 (0->1), then sends an edge-case ticket (escalated to the surfaced queue).
 *
 *   node scripts/support-intake-demo.cjs            # real run (writes feedback + flips the KR)
 *   node scripts/support-intake-demo.cjs --dry-run  # classify + route in-memory, no DB writes
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const DRY_RUN = process.argv.includes('--dry-run');

const HAPPY = { channel: 'web', subject: 'How do I reset my account password?', body: 'I forgot my password and cannot log in to my account. Please send the reset link.', email: 'happy@example.com' };
const EDGE = { channel: 'email', subject: 'URGENT: service is down and I was charged twice', body: 'Everything is down, I was double-charged on my invoice and am losing money. This is a possible security breach.', email: 'edge@example.com' };

(async () => {
  const { normalizeSupportTicket, triageSupportTicket, runSupportPipeline, getSupportEscalationQueue, markPipelineLive } =
    await import('../lib/support/intake-pipeline.js');

  if (DRY_RUN) {
    for (const [label, raw] of [['HAPPY', HAPPY], ['EDGE', EDGE]]) {
      const t = normalizeSupportTicket(raw);
      console.log(`[dry-run] ${label}:`, JSON.stringify(triageSupportTicket(t)));
    }
    console.log('[dry-run] no DB writes; KR not flipped');
    return;
  }

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const happy = await runSupportPipeline(sb, HAPPY);
  console.log('HAPPY disposition:', happy.disposition.status, '| triage:', happy.triage.category, happy.triage.severity);
  const kr = await markPipelineLive(sb, happy);
  console.log('KR-2026-07-01 flip:', JSON.stringify(kr));

  const edge = await runSupportPipeline(sb, EDGE);
  console.log('EDGE disposition:', edge.disposition.status, '| reason:', edge.disposition.reason);

  const queue = await getSupportEscalationQueue(sb, { limit: 5 });
  if (queue === null) {
    console.log('escalation queue: READ FAILED (errored — not necessarily empty)');
  } else {
    console.log(`escalation queue: ${queue.length} open item(s)`);
    for (const q of queue) console.log('  -', q.title, `(${q.priority || 'n/a'})`);
  }
})().catch((e) => { console.error('demo failed:', e.message); process.exit(1); });
