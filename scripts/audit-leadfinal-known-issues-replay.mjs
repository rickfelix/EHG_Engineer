/**
 * SD-LEO-INFRA-LEADFINAL-ACCEPTANCE-INTEGRITY-001-D
 *
 * Solomon checkpoint-3 acceptance PIN (S3): the LEADFINAL-ACCEPTANCE-INTEGRITY-001
 * orchestrator's acceptance is a REPLAY, not just a forward-going property. Child A
 * (merged) fixed LEAD-FINAL's write path so NEW completions surface genuine retro
 * caveats, but never retroactively touches existing rows. This standalone, read-only
 * script replays child A's exact extractRetroKnownIssues() logic against 5 named
 * historical SDs whose canonical LEAD-FINAL-APPROVAL row recorded the hardcoded
 * 'None at approval time' placeholder, to prove a genuine caveat existed and was
 * dropped. Never writes to sd_phase_handoffs or retrospectives.
 */
import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import {
  extractRetroKnownIssues,
  isFallbackKnownIssues,
} from './modules/handoff/executors/lead-final-approval/retro-known-issues.js';
import { getFilteredRetrospective, parseAsUTC } from './modules/handoff/retro-filters.js';

export const TARGET_SDS = [
  { sd_key: 'SD-LEO-INFRA-FLEET-REGISTRY-MANIFEST-001', sd_id: '4aabbb45-65ba-4171-b0be-acf75a07eccf' },
  { sd_key: 'SD-LEO-INFRA-FLEET-WATCHDOG-001', sd_id: '5f346c78-7aad-4f15-8eb7-a8072ab79c76' },
  { sd_key: 'SD-LEO-INFRA-FLEET-SPAWN-CONTROL-001', sd_id: '44d87b37-9582-428a-90bb-fa0e3cd32b4c' },
  { sd_key: 'SD-LEO-INFRA-SESSION-VIEW-BROWSER-001-A', sd_id: '9f137714-cd39-4dff-9f9b-84ae9b111151' },
  { sd_key: 'SD-LEO-INFRA-SESSION-VIEW-BROWSER-001-B', sd_id: 'adaa690d-8950-4bd3-9e35-3d8c95bcbfdc' },
];

/**
 * Replay one SD: fetch its accepted LEAD-FINAL-APPROVAL known_issues, recompute what
 * extractRetroKnownIssues() would produce today, and flag when the actual row is the
 * fallback placeholder but a genuine caveat existed. Also annotates whether the
 * qualifying retro predates the LEAD-FINAL approval itself (not just LEAD-TO-PLAN) --
 * a genuine "this was visible at approval time" claim, not just "currently reads as
 * genuine" (PLAN-TO-EXEC TESTING review finding).
 */
export async function replayOne(target, supabase) {
  const { sd_key, sd_id } = target;

  const { data: sd } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, created_at')
    .eq('id', sd_id)
    .maybeSingle();

  const { data: lfa } = await supabase
    .from('sd_phase_handoffs')
    .select('known_issues, accepted_at')
    .eq('sd_id', sd_id)
    .eq('handoff_type', 'LEAD-FINAL-APPROVAL')
    .eq('status', 'accepted')
    .order('accepted_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!lfa) {
    return { sd_key, sd_id, flagged: false, reason: 'no_accepted_lfa_row' };
  }

  const actualKnownIssues = lfa.known_issues;
  const recomputedKnownIssues = await extractRetroKnownIssues(
    sd || { id: sd_id, sd_key, created_at: null },
    supabase
  );

  const actualIsFallback = isFallbackKnownIssuesShape(actualKnownIssues);
  const recomputedIsFallback = isFallbackKnownIssues(recomputedKnownIssues);
  const flagged = actualIsFallback && !recomputedIsFallback;

  let approvalTimeValid = null;
  if (flagged) {
    const { retrospective } = await getFilteredRetrospective(
      sd_id,
      sd && sd.created_at,
      supabase,
      sd_key
    );
    // lfa.accepted_at is a `timestamp without time zone` column (same hazard
    // retro-filters.js documents for sd_phase_handoffs.accepted_at) -- PostgREST
    // returns it as a naive string that bare `new Date()` parses as LOCAL time, not
    // UTC. retrospective.created_at already carries an explicit offset. Normalize
    // both through parseAsUTC (adversarial review finding) so the comparison is
    // timezone-independent, matching retro-filters.js's own freshness comparison.
    approvalTimeValid = Boolean(
      retrospective && parseAsUTC(retrospective.created_at) < parseAsUTC(lfa.accepted_at)
    );
  }

  return {
    sd_key,
    sd_id,
    flagged,
    actualKnownIssues,
    recomputedKnownIssues,
    approvalTimeValid,
  };
}

/** actualKnownIssues comes from the DB as plain JSON, not the frozen NO_ISSUES_FALLBACK
 * reference -- compare by shape, not identity (isFallbackKnownIssues is reference-only
 * by design for the live write path; this replay reads historical DB content instead).
 * sd_phase_handoffs.known_issues is a TEXT column (create-sd-phase-handoffs-table.sql),
 * so PostgREST always returns the raw JSON-encoded string here, never a pre-parsed
 * array -- parse defensively (the array branch below is a cheap safety net, not the
 * expected production shape). */
function isFallbackKnownIssuesShape(knownIssues) {
  let parsed = knownIssues;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return false;
    }
  }
  return (
    Array.isArray(parsed) &&
    parsed.length === 1 &&
    parsed[0] &&
    parsed[0].issue === 'None at approval time'
  );
}

export async function runReplayAudit({ supabase, targets = TARGET_SDS } = {}) {
  const sb =
    supabase ||
    createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

  const results = [];
  for (const target of targets) {
    results.push(await replayOne(target, sb));
  }

  const flaggedCount = results.filter((r) => r.flagged).length;
  return { results, flaggedCount, total: targets.length };
}

function printReport({ results, flaggedCount, total }) {
  for (const r of results) {
    const mark = r.flagged ? 'FLAGGED' : 'ok';
    console.log(`[${mark}] ${r.sd_key}${r.flagged ? ` (approval_time_valid=${r.approvalTimeValid})` : ''}`);
  }
  console.log(`\n${flaggedCount}/${total} flagged`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runReplayAudit()
    .then((report) => {
      printReport(report);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Audit failed:', err);
      process.exit(1);
    });
}
