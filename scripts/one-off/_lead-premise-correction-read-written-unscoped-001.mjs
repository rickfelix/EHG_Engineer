#!/usr/bin/env node
/**
 * LEAD premise correction for SD-LEO-INFRA-READ-WRITTEN-UNSCOPED-001, per Explore evidence
 * row 82488e1f-8a4d-474e-a41d-abef0f04b921 (confidence 90, phase=LEAD).
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-READ-WRITTEN-UNSCOPED-001';

const CORRECTED_SUCCESS_CRITERIA = [
  {
    criterion: 'fleet-dashboard.cjs\'s printInbox() stamps read_at idempotently (once per row, on first delivery), not unconditionally on every render.',
    measure: 'A test drives printInbox\'s write over a fixture row already carrying a read_at value and asserts the UPDATE gates on read_at IS NULL, leaving the existing timestamp unchanged. Baseline measured 2026-09-07: fleet-dashboard.cjs:1911-1916 has no such gate -- every render overwrites read_at to now(), unlike every other write site cataloged in coordinator-adam-comms.md\'s consumption-semantics census.',
  },
  {
    criterion: 'The new write-site classification is registered in docs/protocol/coordinator-adam-comms.md\'s consumption-semantics census (and its regression-guard test\'s allowlist), matching this session\'s own established pattern for this exact class of change.',
    measure: 'session-coordination-consumption-census.test.js passes with printInbox\'s (already-existing, now-scoped) write site explicitly classified -- verified locally before push, not discovered as a CI failure.',
  },
  {
    criterion: 'docs/protocol/fleet-worker-loop-directive.md:55\'s "READ-ONLY VIEW... stamps NOTHING" claim is scoped precisely to the printWorkerInbox/worker-audience path, not generalized to the inbox command as a whole.',
    measure: 'A diff review confirms the directive\'s wording no longer invites a reader to conclude the whole `inbox` command is side-effect-free; the coordinator-audience write path is named explicitly as the exception.',
  },
];

const LEAD_CORRECTION_NOTE = `

---
LEAD PREMISE CORRECTION (2026-09-07, Alpha-5 worker session bc70bff7, per Explore evidence
row 82488e1f-8a4d-474e-a41d-abef0f04b921 confidence=90, phase=LEAD):

Both filed claims verified TRUE against live source. fleet-dashboard.cjs's printInbox()
(coordinator-audience inbox render) stamps read_at at lines 1911-1916 with NO read_at IS NULL
gate -- every render overwrites the timestamp, unlike every other write site cataloged in
docs/protocol/coordinator-adam-comms.md's census (solomon-advisory.cjs, adam-advisory.cjs, and
this session's own fix to michael-inbox.cjs, all of which stamp once, idempotently).
fleet-worker-loop-directive.md:55's "READ-ONLY VIEW... stamps NOTHING" framing, while textually
naming printWorkerInbox specifically, invites a reader to generalize to the whole inbox
command -- false for the coordinator-audience path (fleet-dashboard.cjs:3317-3344's dispatcher
routes there whenever resolveInboxAudience() does not resolve to worker mode).

SAFETY VERIFIED: the unconditional write is NOT load-bearing for the bug its own header
comment cites (RCA 2026-06-24, SD-LEO-INFRA-SIGNAL-INBOX-DRAIN-ON-DISPLAY-001) -- that bug was
fixed by changing the SELECT's gating column from read_at to acknowledged_at
(fleet-dashboard.cjs:1814), so the read path no longer depends on read_at at all. Adding
.is('read_at', null) to the UPDATE is safe and does not reopen it.

NO MEASURED PRODUCTION INCIDENT: the one age/staleness gauge this command renders
(lib/fleet/outstanding-signals.cjs's fetchAllOutstandingSignals) keys age on created_at, not
read_at, and treats read_at as a bare presence check -- unaffected by the timestamp being
refreshed. This SD is a consistency fix + documentation-precision correction, not an incident
response.

PLAN should build the PRD around exactly two functional requirements: (FR-1) add the
read_at IS NULL gate to printInbox's UPDATE, and register the site in
docs/protocol/coordinator-adam-comms.md's census (proactively, learning from this session's
own CI-caught miss on SD-LEO-INFRA-MICHAEL-ADAM-COMMS-001, where the equivalent step was
skipped and caught by session-coordination-consumption-census.test.js only after a push);
(FR-2) correct fleet-worker-loop-directive.md:55's wording to scope the "stamps nothing" claim
precisely.`;

async function main() {
  const { data: current, error: readError } = await supabase
    .from('strategic_directives_v2')
    .select('description')
    .eq('sd_key', SD_KEY)
    .single();
  if (readError) { console.error('READ FAILED:', readError.message); process.exit(1); }

  if (current.description.includes('LEAD PREMISE CORRECTION')) {
    console.log('Already applied. No-op.');
    process.exit(0);
  }

  const { error: updateError } = await supabase
    .from('strategic_directives_v2')
    .update({
      success_criteria: CORRECTED_SUCCESS_CRITERIA,
      description: current.description + LEAD_CORRECTION_NOTE,
    })
    .eq('sd_key', SD_KEY);

  if (updateError) { console.error('UPDATE FAILED:', updateError.message); process.exit(1); }

  const { data: verify } = await supabase
    .from('strategic_directives_v2')
    .select('description, success_criteria')
    .eq('sd_key', SD_KEY)
    .single();

  console.log('Updated. Description contains correction note:', verify.description.includes('LEAD PREMISE CORRECTION'));
  console.log('success_criteria count:', verify.success_criteria.length);
}

if (isMainModule(import.meta.url)) {
  main();
}
