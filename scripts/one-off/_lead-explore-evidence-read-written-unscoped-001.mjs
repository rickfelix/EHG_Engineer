#!/usr/bin/env node
/**
 * LEAD-phase Explore evidence for SD-LEO-INFRA-READ-WRITTEN-UNSCOPED-001.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_ID = 'SD-LEO-INFRA-READ-WRITTEN-UNSCOPED-001';

const findings = [
  {
    id: 'E1-printInbox-write-lacks-the-idempotency-gate-every-other-census-site-uses-CONFIRMED',
    severity: 'MEDIUM',
    summary:
      "scripts/fleet-dashboard.cjs's printInbox() (coordinator-audience inbox render) stamps read_at at lines 1911-1916 via `.update({ read_at: now }).in('id', ids)` -- with NO `.is('read_at', null)` idempotency gate. Every other write site cataloged in docs/protocol/coordinator-adam-comms.md's consumption-semantics census (solomon-advisory.cjs's stampSurfaced, adam-advisory.cjs's stampSurfaced, and this session's own fix to michael-inbox.cjs's drainInbox) gates on read_at IS NULL, so read_at answers 'when was this FIRST delivered'. printInbox's unconditional stamp instead overwrites read_at to now() on EVERY render, drifting the column's meaning to 'when was this MOST RECENTLY rendered' for this one site only -- a semantic inconsistency with the receipt-contract table's own definition (line 126: read_at = SURFACED FOR ACTION, implying a single surfacing event, not a rolling one).",
  },
  {
    id: 'E2-fleet-worker-loop-directive-stamps-nothing-claim-is-imprecise-CONFIRMED',
    severity: 'MEDIUM',
    summary:
      "docs/protocol/fleet-worker-loop-directive.md:55 states: 'node scripts/fleet-dashboard.cjs inbox is a READ-ONLY VIEW and is NOT a substitute... printWorkerInbox (scripts/fleet-dashboard.cjs) is a pure select+render that stamps NOTHING.' The sentence textually names printWorkerInbox specifically (accurate -- verified fleet-dashboard.cjs:1921-1937 contains no .update() call), but the surrounding 'READ-ONLY VIEW' framing describes the inbox COMMAND as a whole. The command's own dispatcher (fleet-dashboard.cjs:3317-3344) routes to printWorkerInbox ONLY when resolveInboxAudience() resolves to worker mode; any other resolution (coordinator, or unresolved-then-defaulted) reaches printInbox(), which DOES write (E1). A reader who generalizes the directive's own 'READ-ONLY VIEW' framing to the whole command -- exactly the generalization the sentence's own phrasing invites -- would be wrong for the coordinator-audience path.",
  },
  {
    id: 'E3-the-unconditional-write-is-not-required-by-the-bug-its-own-header-comment-cites-VERIFIED-SAFE-TO-FIX',
    severity: 'INFO',
    summary:
      "printInbox's header comment (fleet-dashboard.cjs:1783-1788) justifies the unconditional stamp by citing RCA 2026-06-24 (SD-LEO-INFRA-SIGNAL-INBOX-DRAIN-ON-DISPLAY-001): 'the prior code marked read_at on render AND queried read_at IS NULL -- so one filtered/parked render silently lost the signal.' Verified the ACTUAL fix for that bug was changing the SELECT's gating column from read_at to acknowledged_at (line 1814: `.is('acknowledged_at', null)`), not anything about the UPDATE being unconditional. The read path no longer depends on read_at AT ALL, so adding `.is('read_at', null)` to the UPDATE now would not reopen the cited bug -- it is safe, and would make printInbox consistent with every other census site.",
  },
  {
    id: 'E4-the-unscoped-write-does-not-currently-corrupt-a-measured-downstream-metric',
    severity: 'INFO',
    summary:
      "Checked the one age/staleness computation this same command renders alongside the inbox table: lib/fleet/outstanding-signals.cjs's fetchAllOutstandingSignals (called at fleet-dashboard.cjs:1880) computes age via ageMinutes(createdAt, nowMs) -- keyed on created_at, not read_at -- and its `delivered` field is a bare `!!r.read_at` presence check, unaffected by the TIMESTAMP being refreshed. No live, measured production incident traced to this specific unscoped write; the defect is a semantic-drift / documentation-precision issue, not a currently-active data-corruption bug. Scoped accordingly: this SD is a consistency fix + doc correction, not an incident response.",
  },
];

const summary =
  'LEAD-phase Explore investigation of SD-LEO-INFRA-READ-WRITTEN-UNSCOPED-001. Both filed claims verified TRUE against live source: (1) fleet-dashboard.cjs printInbox() writes read_at unconditionally (no read_at IS NULL gate), unlike every other census-cataloged write site; (2) fleet-worker-loop-directive.md:55\'s "READ-ONLY VIEW... stamps NOTHING" framing, while textually scoped to printWorkerInbox, invites the reader to generalize to the whole inbox command, which is false for the coordinator-audience path. Verified the unconditional write is NOT load-bearing for the bug its own header comment cites (that bug was fixed via the SELECT\'s acknowledged_at gate, not the UPDATE\'s unconditionality) -- adding the idempotency gate is safe. No measured downstream corruption found (the one age gauge this command renders keys on created_at, not read_at) -- this is a consistency + documentation-precision fix, not an incident response.';

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_ID,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'EXPLORE',
    supabase,
  });

  let results = {
    verdict: 'CONDITIONAL_PASS',
    confidence: 90,
    findings,
    warnings: [],
    recommendations: [
      'PLAN should scope FR-1 to adding `.is(\'read_at\', null)` to printInbox\'s UPDATE (fleet-dashboard.cjs:1911-1916), and register the site in docs/protocol/coordinator-adam-comms.md\'s consumption-semantics census (learn from this session\'s own miss on the Michael SD: session-coordination-consumption-census.test.js will fail CI if this is not classified there first).',
      'FR-2: correct fleet-worker-loop-directive.md:55 to scope the "stamps NOTHING" claim precisely to the printWorkerInbox/worker-audience path, not the inbox command as a whole.',
    ],
    metadata: {
      review_type: 'LEAD_EXPLORE_PREMISE_VERIFICATION',
      files_reviewed: [
        'scripts/fleet-dashboard.cjs',
        'docs/protocol/fleet-worker-loop-directive.md',
        'docs/protocol/coordinator-adam-comms.md',
        'lib/fleet/outstanding-signals.cjs',
      ],
      model: 'Sonnet 5',
      invoked_at: new Date().toISOString(),
    },
    summary,
    phase: 'LEAD',
    validation_mode: 'prospective',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'EXPLORE',
    SD_ID,
    { name: 'Explore (LEAD-phase premise verification)' },
    results,
    { sdKey: SD_ID, phase: 'LEAD' }
  );

  console.log('VERDICT WRITTEN:', stored.id, stored.verdict, stored.confidence);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
}
