#!/usr/bin/env node
/**
 * read-adam-advisories.cjs — read-only peek at unactioned Adam advisories.
 * SD-LEO-INFRA-RESILIENT-SYMMETRIC-ADAM-001 (FR-5).
 *
 * Displays advisories targeting the active coordinator (or the broadcast-coordinator
 * sentinel) whose payload.actioned_at IS NULL. Stamps NOTHING (neither read_at nor
 * actioned_at) — re-running shows the same rows until coordinator-ack-adam.cjs retires
 * them. The non-mutating counterpart to fleet-dashboard.cjs printAdamInbox (which stamps
 * read_at=DELIVERED on render).
 *
 * Usage: node scripts/read-adam-advisories.cjs
 */
require('dotenv').config();
const { createSupabaseServiceClient } = require('../lib/supabase-client.cjs');
const { getActiveCoordinatorId } = require('../lib/coordinator/resolve.cjs');
const { selectUnactionedAdvisories } = require('../lib/coordinator/adam-advisory-store.cjs');
// SD-LEO-FIX-SOLOMON-MULTI-PART-001: collapse a split Solomon reply (subject "N/M" marker)
// into ONE peeked entry, matching printAdamInbox's render. Stamps nothing either way.
const { groupMultiPartAdvisories } = require('../lib/coordinator/multi-part-reply.cjs');

async function main() {
  let supabase;
  try { supabase = createSupabaseServiceClient(); }
  catch (e) { console.error('ERROR: supabase client unavailable:', e.message); process.exit(1); }

  const coordinatorId = await getActiveCoordinatorId(supabase);
  const { rows, error } = await selectUnactionedAdvisories(supabase, coordinatorId, { limit: 20 });
  if (error) { console.error('ERROR: advisory query failed:', error.message); process.exit(1); }

  console.log('ADAM ADVISORY PEEK (read-only — stamps nothing)');
  console.log('─'.repeat(60));
  if (!rows.length) { console.log('  (no unactioned Adam advisories)'); return; }

  const groups = groupMultiPartAdvisories(rows);
  console.log(`  ${groups.length} unactioned advisory(ies):`);
  for (const g of groups) {
    const last = g.rows[g.rows.length - 1];
    const callsign = (last.payload && last.payload.sender_callsign) || '(none)';
    const intent = g.rows.some((a) => a.payload && a.payload.expects_reply) ? 'awaiting-reply' : 'fire-and-forget';
    const delivered = last.read_at ? 'delivered' : 'new';
    const ageMin = Math.floor((Date.now() - new Date(last.created_at).getTime()) / 60_000);
    const ageStr = ageMin < 60 ? ageMin + 'm' : Math.floor(ageMin / 60) + 'h';
    const partsSuffix = g.isMultiPart ? ` (${g.rows.length}${g.isComplete ? '' : '/' + g.total} parts)` : '';
    const body = g.body.replace(/\n/g, ' ');
    console.log(`  • ${g.id}${partsSuffix}`);
    console.log(`      ${callsign} | ${intent} | ${delivered} | ${ageStr} ago`);
    console.log(`      ${body}`);
  }
  console.log('');
  console.log('  Ack with: node scripts/coordinator-ack-adam.cjs --advisory <id> [--reply "<body>"]');
}

if (require.main === module) {
  main().catch(err => { console.error('UNHANDLED:', err.message || err); process.exit(1); });
}
