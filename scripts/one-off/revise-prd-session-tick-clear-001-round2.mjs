#!/usr/bin/env node
// SD-LEO-INFRA-SESSION-TICK-CLEAR-001 -- PLAN-phase PRD correction after the prospective
// TESTING sub-agent review (evidence bfac6789-7887-4e17-8c02-e61b449a2363) found 2 blocking
// design gaps invisible to the round-1 test_scenarios:
//
// AMEND-1: session-register.cjs:344-345 (`if (!candidateIds.length) return;`) sits BEFORE the
// identity guard and the only Supabase call. FR-2's new DB-join query, if simply appended after
// the existing marker-based pass, would be dead code in the exact scenario it exists for (marker
// already deleted -- the file's own comment at :353-355 says marker-absent is the NORMAL case).
//
// AMEND-2: claude_sessions is measured MULTI-HOST live (Legion-Laptop, a CI runner host, others).
// PIDs are only unique PER HOST. FR-2's metadata->>cc_parent_pid join without a hostname filter
// is a cross-host false-death vector -- a different machine's session with a coincidentally
// matching pid value could be released. Must filter on hostname and fail-closed on the 'unknown'
// degenerate bucket (the same class rotation-closure.cjs's own header already measured and
// rejected for tty).
//
// Also fixes a real Supabase-js trap the reviewer probed directly: `.not('status','in',[...])`
// with a JS array is a hard parse error in this client version, silently swallowed by the
// existing `if (error || !data) return;` pattern -- the positive `.in('status', [...])` form
// (matching session-tick.cjs's own PATCH filter) must be used instead.
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const PRD_ID = 'PRD-SD-LEO-INFRA-SESSION-TICK-CLEAR-001';

async function run() {
  const supabase = createSupabaseServiceClient();
  const { data: prd, error: fetchErr } = await supabase
    .from('product_requirements_v2')
    .select('functional_requirements, technical_requirements, test_scenarios, metadata')
    .eq('id', PRD_ID)
    .single();
  if (fetchErr) throw new Error(`fetch failed: ${fetchErr.message}`);

  const fr = prd.functional_requirements.map((item) => {
    if (item.id === 'FR-2') {
      return {
        id: 'FR-2',
        title: 'Marker-independent closure fallback via DB join (corrected ordering + host scope)',
        description: 'CORRECTED after prospective TESTING review (evidence bfac6789-7887-4e17-8c02-e61b449a2363). The DB-join query must run BEFORE/independent of the existing `if (!candidateIds.length) return;` early-return at session-register.cjs:344-345 -- placed after it, FR-2 is dead code in exactly the marker-deleted scenario it exists for. Concretely: evaluate the identity guard ONCE (shared with the marker path, see FR-3), then run BOTH the marker-based query (if any markers exist) AND the metadata->>cc_parent_pid DB-join query unconditionally, merging results before releasing. The DB-join query MUST filter on hostname = the current host (claude_sessions is multi-host; PIDs are only unique per host -- a cross-host pid coincidence must never match) and MUST skip entirely (fail-closed) when the current host resolves to the "unknown" degenerate bucket. Status filtering uses the POSITIVE form `.in(\'status\', [\'active\',\'idle\',\'stale\'])` (matching session-tick.cjs\'s own PATCH filter), never `.not(\'status\',\'in\',[...])` with a JS array -- confirmed by the reviewer to be a hard parse error in this Supabase client version that the existing `if (error || !data) return;` pattern silently swallows into a no-op.',
        priority: 'critical',
        acceptance_criteria: [
          'The DB-join query executes and can release a row even when candidateIds (from marker files) is empty -- proven by a test where zero markers exist',
          'The DB-join query never matches a row on a different hostname, even if that row happens to carry the same numeric cc_parent_pid value',
          'When the current host resolves to the unknown/degenerate hostname bucket, the DB-join path closes nothing (fail-closed), matching the existing tty-rejection precedent in rotation-closure.cjs',
          'The status filter uses .in() with a positive status list, not .not()/.in() with a JS array',
          'The existing marker-based path is left functionally unchanged -- FR-2 adds coverage, does not replace working coverage',
        ],
      };
    }
    if (item.id === 'FR-3') {
      return {
        ...item,
        title: 'Single shared identity guard gating BOTH closure paths (position, not just count)',
        description: item.description + ' CORRECTED (round 2): this must be ONE guard check, evaluated once, whose result gates both the marker-based query and the FR-2 DB-join query -- not two independently-implemented checks in two code locations that could drift out of sync. The AMEND-1 reordering (FR-2) requires this guard to run before either query, not just before the marker path.',
      };
    }
    return item;
  });

  const tr = prd.technical_requirements.concat([
    {
      id: 'TR-4',
      title: 'Host-scoped DB join (corrected, from TESTING review)',
      description: 'claude_sessions is multi-host (measured live: multiple distinct hostname values including a CI runner). The FR-2 DB-join query must include .eq(\'hostname\', getHostname()) and must not execute at all if getHostname() returns the unknown/degenerate value -- a bare pid match across hosts is a false-death vector this SD must not introduce while fixing a different one.',
    },
  ]);

  const ts = prd.test_scenarios.map((item) => {
    if (item.id === 'TS-5') {
      return {
        id: 'TS-5',
        scenario: 'Pre-SD row (no metadata.cc_parent_pid) is NOT released by the DB-join path even when other conditions would otherwise match (corrected: mutation-sensitive)',
        type: 'unit',
        expected: 'The DB-join query\'s metadata->>cc_parent_pid filter naturally excludes a row with no such key -- assert specifically that a row missing the field is absent from the DB-join result set even when a decoy row WITH the field and a matching pid IS present in the same fixture (round-1 TS-5 was not mutation-sensitive: it would pass identically whether or not FR-2 existed at all).',
      };
    }
    if (item.id === 'TS-6') {
      return {
        id: 'TS-6',
        scenario: 'Cross-host isolation: a row on a DIFFERENT hostname with a coincidentally-matching cc_parent_pid value (AMEND-2, replaces round-1 TS-6 which was redundant with TS-4)',
        type: 'unit',
        expected: 'The DB-join query does not release the other-host row -- proven by a fixture with two hosts sharing one numeric pid value, asserting only the same-host row is eligible',
      };
    }
    return item;
  }).concat([
    {
      id: 'TS-7',
      scenario: 'Current host resolves to the unknown/degenerate hostname bucket',
      type: 'unit',
      expected: 'The DB-join path closes nothing at all (fail-closed), even if a same-pid row would otherwise match',
    },
    {
      id: 'TS-8',
      scenario: 'cc_parent_pid stored/compared as a number vs. a string (type round-trip)',
      type: 'unit',
      expected: 'The DB-join match is not defeated by a type mismatch between the stamped metadata value and the discovered parentPid at query time',
    },
  ]);

  const metadata = {
    ...prd.metadata,
    plan_round2_correction: {
      corrected_at: new Date().toISOString(),
      trigger: 'Prospective TESTING sub-agent review (sub_agent_execution_results id bfac6789-7887-4e17-8c02-e61b449a2363) at PLAN-TO-EXEC gate.',
      summary: 'FR-2/FR-3 corrected for query-ordering (the DB-join was dead code behind an early-return in the round-1 design) and host-scoping (claude_sessions is multi-host; an un-scoped pid join was a cross-host false-death vector). Also fixed a real Supabase-js .not()/.in()-with-array parse-error trap the reviewer probed directly. TS-5/TS-6 corrected for mutation-sensitivity; TS-7/TS-8 added for host-degeneracy and type round-trip.',
    },
  };

  const { error: updateErr } = await supabase
    .from('product_requirements_v2')
    .update({
      functional_requirements: fr,
      technical_requirements: tr,
      test_scenarios: ts,
      metadata,
    })
    .eq('id', PRD_ID);
  if (updateErr) throw new Error(`update failed: ${updateErr.message}`);
  console.log('PRD revised (round 2) successfully.');
}

if (isMainModule(import.meta.url)) {
  run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
