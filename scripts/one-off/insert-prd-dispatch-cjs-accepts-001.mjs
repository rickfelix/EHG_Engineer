#!/usr/bin/env node
/**
 * One-off: insert the inline PRD for SD-LEO-FIX-DISPATCH-CJS-ACCEPTS-001.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-FIX-DISPATCH-CJS-ACCEPTS-001';

async function main() {
  const { data: sd, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title')
    .eq('sd_key', SD_KEY)
    .single();
  if (sdErr || !sd) {
    console.error('SD_FETCH_FAILED', sdErr);
    process.exit(1);
  }

  const prd = {
    id: `PRD-${SD_KEY}`,
    directive_id: sd.id,
    title: sd.title,
    status: 'draft',
    category: 'technical',
    priority: 'medium',
    version: '1.0',
    phase: 'planning',
    created_by: 'PLAN',
    executive_summary: "Retire dispatch.cjs's bare 'broadcast' sentinel (0 of 91 rows ever acknowledged, all-time) and redirect the writers that depended on it, so a silently-dead directive sink is replaced with a loud, correctly-drained target.",
    business_context: "Solomon's Friday Foundation Audit #2 (feedback 89b3be6a) flagged a class of defect (matching the prior ADAM-INBOX-SWEEP and NOT-IN-ON-NULLABLE-KIND incidents): a coordination sentinel every writer can address, that no reader ever drains. Adam's disposition: this is a silent sink for directives and must either gain a reader or be retired.",
    technical_context: "dispatch.cjs's insertCoordinationRow/assertValidTarget choke point accepted target_session='broadcast' as a documented sentinel alongside broadcast-coordinator/-solomon/-adam/-michael. Live measurement: 91-106 session_coordination rows on target_session='broadcast', 0 ever acknowledged across all history. Escalated from QF-20260911-753 after the actual fix (removing the sentinel + retargeting every affected writer + correcting one misleading reader comment + a data-remediation script) measured 134 net source LOC, over the 75-LOC quick-fix cap.",
    system_architecture: "dispatch.cjs exports SENTINEL_TARGETS (a frozen array of accepted non-UUID target_session values) and assertValidTarget(), which insertCoordinationRow calls before every session_coordination insert. Every legitimate writer routes through insertCoordinationRow; one writer (lib/npm-install-lock.cjs) does a raw insert bypassing this choke point entirely. One diagnostic reader (scripts/inbox-readonly.cjs) unions bare 'broadcast' into its own query but never acknowledges rows (explicitly acks-nothing by design). Role-specific readers (adam-advisory.cjs's inbox drain, worker-checkin.cjs) union only their own role's broadcast-<role> sentinel, never bare 'broadcast'.",
    implementation_approach: "1) Remove bare 'broadcast' from SENTINEL_TARGETS + update its doc comment. 2) Retarget lib/npm-install-lock.cjs's raw insert to target_session:null (its own find/acquire/release logic never used target_session at all). 3) Retarget the two choke-point writers whose fallback path used bare 'broadcast' (coordinator-revive.cjs's unknown-requester case, dispatch-suggestion-override.mjs's override notice) to broadcast-coordinator, matching the sibling pattern in lib/fleet/dispatch-suggestions.cjs. 4) Leave already-fault-tolerant/dormant writers (issue-chairman-directive.cjs/ack-chairman-directive.cjs -- 0 chairman_directive rows ever created; the remaining .catch()-wrapped best-effort broadcasts) untouched. 5) Correct scripts/inbox-readonly.cjs's header comment. 6) Update every downstream test asserting the old sentinel set (6 test files). 7) Ship a one-off remediation script that enumerates and non-destructively dispositions the 91 pre-existing rows.",
    content: "# PRD: Retire the bare 'broadcast' dispatch sentinel\n\nSee executive_summary/technical_context/implementation_approach fields for full detail. Escalated from QF-20260911-753; code changes already implemented, tested (76 targeted + 50,626 full-suite tests green, 3 pre-existing unrelated flaky files excluded), and pushed to branch feat/SD-LEO-FIX-DISPATCH-CJS-ACCEPTS-001 / PR #8721 before this PRD was authored, per the QF-to-SD escalation workflow (LOC-cap escalation, not a scope change).",
    functional_requirements: [
      {
        id: 'FR-1',
        requirement: "Remove bare 'broadcast' from dispatch.cjs's SENTINEL_TARGETS",
        description: "SENTINEL_TARGETS no longer includes the literal string 'broadcast'; assertValidTarget now throws DISPATCH_TARGET_INVALID for it, matching any other unrecognized non-UUID target.",
        priority: 'required',
        acceptance_criteria: [
          "SENTINEL_TARGETS.includes('broadcast') === false",
          "insertCoordinationRow({target_session:'broadcast', ...}) rejects with code DISPATCH_TARGET_INVALID",
        ],
      },
      {
        id: 'FR-2',
        requirement: 'Redirect the dominant raw-insert writer away from the retired sentinel',
        description: "lib/npm-install-lock.cjs's acquireLock() no longer writes target_session:'broadcast' (which bypassed the choke point entirely and was the source of all 91 live rows); it writes target_session:null, matching this repo's established addressee-less-informational-row convention.",
        priority: 'required',
        acceptance_criteria: [
          "grep for target_session: 'broadcast' in lib/npm-install-lock.cjs returns no matches",
          'findActiveLock()/acquireLock()/releaseLock() behavior is unchanged (still keyed on payload.lock_type/payload.status)',
        ],
      },
      {
        id: 'FR-3',
        requirement: 'Retarget the fallback paths that would otherwise silently start failing',
        description: "scripts/coordinator-revive.cjs's unknown-requester expiry signal and scripts/dispatch-suggestion-override.mjs's override notice both previously fell back to bare 'broadcast'; both now target broadcast-coordinator, matching the sibling advisory pattern in lib/fleet/dispatch-suggestions.cjs.",
        priority: 'required',
        acceptance_criteria: [
          'coordinator-revive.cjs unknown-requester fallback targets broadcast-coordinator, not broadcast',
          'dispatch-suggestion-override.mjs recordOverride() targets broadcast-coordinator, not broadcast',
        ],
      },
      {
        id: 'FR-4',
        requirement: "Correct scripts/inbox-readonly.cjs's misleading documentation",
        description: "The header comment previously grouped bare 'broadcast' with the genuinely-drained broadcast-coordinator/-adam sentinels as \"live and heavily used.\" It now documents the measured 0-of-91-ever-acknowledged finding and that new writes are refused.",
        priority: 'required',
        acceptance_criteria: [
          'inbox-readonly.cjs header no longer calls bare broadcast "live and heavily used"',
          'inbox-readonly.cjs header cites the 0/91-acknowledged measurement',
        ],
      },
      {
        id: 'FR-5',
        requirement: 'Non-destructively disposition the pre-existing dead-lettered rows',
        description: 'A one-off script enumerates every existing target_session=\'broadcast\' row and, on --execute, merge-patches payload with a dead_lettered_by/at/reason marker -- never deletes a row, never fabricates an acknowledgment.',
        priority: 'required',
        acceptance_criteria: [
          'Dry-run mode (default) makes zero writes and prints an enumeration',
          '--execute merge-patches payload without discarding existing keys or setting acknowledged_at',
        ],
      },
    ],
    technical_requirements: [
      {
        id: 'TR-1',
        requirement: 'insertCoordinationRow/assertValidTarget is the single enforcement point',
        rationale: "Removing the sentinel from SENTINEL_TARGETS is sufficient because every non-bypassing writer already routes through this one function (dispatch.cjs:1563) -- no parallel validation path exists to also update.",
      },
      {
        id: 'TR-2',
        requirement: 'Full regression coverage across every touched file',
        rationale: '6 test files updated to match the corrected sentinel set (dispatch.test.js, solomon-correctness-fixes.test.js, adam-solomon-direct-channel.test.js, expired-unread-missed-gauge.test.js, dispatch-enum-violation-loud.test.js, coordinator-revive.test.js) plus a full unit-suite run to catch any untargeted regression.',
      },
      {
        id: 'TR-3',
        requirement: 'Mechanism claims verified against live code, not endorsed from memory',
        rationale: 'Every file:line citation in this SD (SENTINEL_TARGETS location, assertValidTarget behavior, each writer\'s call site) was independently re-read by both a VALIDATION and an Explore sub-agent pass during LEAD phase, recorded in metadata.mechanism_verifications, per GATE_MECHANISM_CLAIM_VERIFIER.',
      },
    ],
    test_scenarios: [
      {
        id: 'TS-1',
        scenario: "insertCoordinationRow refuses target_session='broadcast'",
        test_type: 'unit',
        given: "a call to insertCoordinationRow with target_session:'broadcast'",
        when: 'assertValidTarget evaluates the target',
        then: 'the call rejects with an Error whose code is DISPATCH_TARGET_INVALID, and no row is inserted',
      },
      {
        id: 'TS-2',
        scenario: 'insertCoordinationRow still accepts the remaining sentinels (no regression)',
        test_type: 'unit',
        given: "a call to insertCoordinationRow with target_session:'broadcast-coordinator'",
        when: 'assertValidTarget evaluates the target',
        then: 'the call succeeds without a live-session lookup, exactly as before this fix',
      },
      {
        id: 'TS-3',
        scenario: 'npm-install-lock.cjs lock lifecycle is unaffected by the target_session change',
        test_type: 'unit',
        given: 'the existing tests/lib/npm-install-lock.test.js suite',
        when: 'run against the retargeted (target_session:null) acquireLock/findActiveLock/releaseLock',
        then: 'every test passes unchanged, since none of them ever asserted on target_session',
      },
      {
        id: 'TS-4',
        scenario: 'coordinator-revive.cjs emits a working fallback signal for an unknown requester',
        test_type: 'unit',
        given: 'a reaped expired spawn request row with no requested_by_session_id',
        when: 'reapExpiredPendingRequests() builds its fail-loud signal',
        then: "the inserted row's target_session is 'broadcast-coordinator', and the insert succeeds (previously it would now throw and be silently caught)",
      },
      {
        id: 'TS-5',
        scenario: 'Full unit suite shows zero new regressions',
        test_type: 'regression',
        given: 'the complete unit test project (4,111 files, 50,843 tests)',
        when: 'run via `npx vitest run --project unit` after all fix files are in place',
        then: 'only 3 pre-existing, unrelated, environment/subprocess-dependent flaky files fail -- confirmed failing in isolation with zero reference to any file touched by this SD',
      },
    ],
    acceptance_criteria: [
      "A send to target_session='broadcast' via insertCoordinationRow is refused (DISPATCH_TARGET_INVALID), never silently accepted into a dead-end.",
      'Every existing writer of the retired sentinel either now targets a genuinely-drained sentinel/session, or was independently confirmed already fault-tolerant (.catch()-wrapped best-effort) or dormant (zero historical rows) -- no production write path silently breaks.',
      'The 91 pre-existing dead-lettered rows are enumerable via scripts/one-off/dead-letter-bare-broadcast-rows-qf-20260911-753.mjs and can be non-destructively dispositioned without fabricating an acknowledgment.',
    ],
    risks: [
      {
        risk: "Retargeting coordinator-revive.cjs/dispatch-suggestion-override.mjs to broadcast-coordinator could add previously-invisible traffic to the coordinator's inbox.",
        probability: 'low',
        impact: 'low',
        mitigation: 'These rows previously went nowhere (0 ever acknowledged) -- this only adds volume to an already-high-traffic sentinel (333 historical broadcast-coordinator rows), no new coupling or dependency.',
        rollback_plan: "Revert the specific target_session literal back to a to-be-determined value; the coordinator's own inbox tooling is unaffected either way.",
      },
      {
        risk: "A writer or reader pair not discovered during this investigation depends on bare 'broadcast' in a way this fix breaks.",
        probability: 'low',
        impact: 'medium',
        mitigation: 'Repo-wide grep for every literal occurrence of target_session referencing broadcast, cross-checked against live DB row counts/kinds, plus a full 50,843-test suite run surfaced every affected test file. dispatch.cjs\'s rejection error is descriptive and loud, so any missed dependency fails immediately and visibly in production logs rather than misbehaving silently.',
        rollback_plan: "Re-add 'broadcast' to SENTINEL_TARGETS (a one-line revert in dispatch.cjs).",
      },
      {
        risk: 'The one-off dead-letter disposition script, run with --execute, mutates the payload field of 91 live rows.',
        probability: 'low',
        impact: 'low',
        mitigation: 'Dry-run by default; --execute merge-patches payload (preserves every existing key) and never deletes a row or sets acknowledged_at, so no data is destroyed and no false delivery is fabricated.',
        rollback_plan: 'A follow-up merge-patch can strip the added dead_lettered_by/at/reason keys if ever needed; the original payload content is untouched underneath them.',
      },
    ],
    integration_operationalization: {
      consumers: [
        'lib/fleet/dispatch-suggestions.cjs (unaffected -- already targets broadcast-coordinator)',
        'scripts/ack-chairman-directive.cjs (unaffected -- 0 historical chairman_directive rows, already fault-tolerant)',
        'scripts/coordinator-cold-recovery.cjs (unaffected -- already fault-tolerant, best-effort)',
        'scripts/coordinator-revive.cjs (retargeted -- fallback now broadcast-coordinator)',
        'scripts/issue-chairman-directive.cjs (unaffected -- 0 historical chairman_directive rows)',
        'scripts/dispatch-suggestion-override.mjs (retargeted -- now broadcast-coordinator)',
        'lib/npm-install-lock.cjs (retargeted -- now target_session:null)',
        'scripts/inbox-readonly.cjs (reader -- comment corrected, query clause unchanged, harmless on legacy rows)',
      ],
      dependencies: ['None new -- pure removal + retarget within existing dispatch.cjs infrastructure.'],
      data_contracts: [
        'SENTINEL_TARGETS remains a frozen array of strings; only its membership shrank by one.',
        'session_coordination.payload gains an optional dead_lettered_by/dead_lettered_at/dead_lettered_reason key on the 91 legacy rows only, via the one-off remediation script -- no schema change.',
      ],
      runtime_config: ['None -- no new environment variables or feature flags introduced.'],
      observability_rollout: [
        "DISPATCH_TARGET_INVALID's existing error message (already logged via the logger param) is the only observability surface needed -- the removed sentinel's defining property was that nothing observed it, so no new monitoring is required to detect its absence.",
      ],
    },
    exploration_summary: {
      files_read: [
        'lib/coordinator/dispatch.cjs', 'lib/coordinator/dispatch.test.js', 'lib/npm-install-lock.cjs',
        'scripts/inbox-readonly.cjs', 'scripts/coordinator-revive.cjs', 'scripts/dispatch-suggestion-override.mjs',
        'scripts/coordinator-cold-recovery.cjs', 'scripts/ack-chairman-directive.cjs', 'scripts/issue-chairman-directive.cjs',
        'lib/fleet/dispatch-suggestions.cjs', 'lib/coordinator/expired-unread-missed-gauge.cjs',
        'scripts/adam-advisory.cjs', 'lib/coordinator/chairman-directive-gauge.cjs', 'scripts/worker-checkin.cjs',
        'lib/coordinator/insert-coordination-row-callers.cjs',
      ],
      patterns_identified: [
        'Choke-point-vs-raw-insert-bypass: most writers route through insertCoordinationRow; one (npm-install-lock.cjs) does a raw insert.',
        'Fault-tolerant .catch()-wrapped best-effort broadcast pattern used by most sentinel writers.',
        "Role-specific broadcast-<role> sentinels are unioned only by that role's own inbox tool, never generically.",
        'NULL target_session is this repo\'s established convention for an addressee-less informational row (e.g. coordinator_reservation bookkeeping markers).',
      ],
      key_decisions: [
        'Retarget only writers proven to matter (fault-intolerant, or the dominant live contributor) rather than defensively touching every writer.',
        "Leave already-fault-tolerant/dormant writers (chairman-directive issuance, 0 historical rows) untouched.",
        "Correct, rather than delete, the one reader's misleading doc comment.",
        'Disposition legacy rows via a reversible, non-destructive one-off script rather than deleting them.',
      ],
      exploration_date: new Date().toISOString().slice(0, 10),
    },
    metadata: {
      generated_by: 'PLAN',
      generation_method: 'inline-direct',
      grounding_confidence: 'high',
      escalated_from_qf: 'QF-20260911-753',
      pr_url: 'https://github.com/rickfelix/EHG_Engineer/pull/8721',
    },
  };

  const { error: insertErr } = await supabase.from('product_requirements_v2').insert(prd);
  if (insertErr) {
    console.error('PRD_INSERT_FAILED', insertErr);
    process.exit(1);
  }
  console.log('OK: PRD inserted for', SD_KEY, '-> id', prd.id);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
