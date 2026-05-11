#!/usr/bin/env node
/**
 * SD-FDBK-INFRA-PER-FEEDBACK-ROW-001 / FR-4
 *
 * Admin recovery tool: release pre-claimed feedback rows owned by a given QF.
 * Use when a QF was abandoned or its lifecycle hooks failed to release.
 *
 * Usage:
 *   node scripts/release-feedback-preclaim.js --qf-id QF-YYYYMMDD-NNN
 *   node scripts/release-feedback-preclaim.js --qf-id QF-YYYYMMDD-NNN --reason "QF abandoned, manual recovery"
 *
 * Emits audit_log row (category=feedback_qf_release, source=manual).
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { releasePreclaim } from '../lib/feedback/release-preclaim.js';

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`Usage: node scripts/release-feedback-preclaim.js --qf-id <QF-ID> [--reason "<text>"]`);
    process.exit(args.length === 0 ? 1 : 0);
  }
  let qfId, reason;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--qf-id') qfId = args[++i];
    else if (args[i] === '--reason') reason = args[++i];
  }
  if (!qfId) {
    console.error('❌ --qf-id is required');
    process.exit(1);
  }
  return { qfId, reason: reason || 'manual admin recovery' };
}

(async () => {
  const { qfId, reason } = parseArgs();
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { released } = await releasePreclaim({ supabase, quickFixId: qfId });
  console.log(`Released ${released.length} pre-claim(s) for ${qfId}:`);
  for (const id of released) console.log(`  - ${id}`);
  await supabase.from('audit_log').insert({
    category: 'feedback_qf_release',
    session_id: process.env.CLAUDE_SESSION_ID || null,
    severity: 'info',
    message: `Manual release of ${released.length} pre-claim(s) for ${qfId}: ${reason}`,
    metadata: { qf_id: qfId, released_ids: released, source: 'manual', reason },
  });
})();
