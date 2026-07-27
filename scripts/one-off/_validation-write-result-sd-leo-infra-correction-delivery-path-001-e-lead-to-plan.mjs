#!/usr/bin/env node
/**
 * One-off: Write VALIDATION sub-agent LEAD-TO-PLAN evidence for
 * SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001-E ("Measurements carry no
 * provenance - pin perishability to the existing premise-liveness path").
 *
 * Uses the canonical repo-evidence pattern (lib/sub-agents/resolve-repo.js
 * applySubAgentRepoVerdict) + the canonical storage path
 * (lib/sub-agent-executor/results-storage.js storeSubAgentResults) rather than
 * a hand-rolled INSERT, per CLAUDE.md prologue rule 11.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = 'e74cd20f-02b7-4142-aee7-e443421efb7d';
const SD_KEY = 'SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001-E';

const findings = [
  {
    id: 'F1-extension-point-confirmed',
    severity: 'INFO',
    summary: 'lib/eva/feedback-premise-adapter.js:83-85 exports checkFeedbackPremiseLiveness(feedbackRow, deps) which calls checkPremiseLiveness (lib/eva/premise-liveness.js:221) after shaping the row via feedbackToPremiseDescriptor (adapter.js:31-61). Confirmed consumed at scripts/create-quick-fix.js:236-257 (the --feedback-id promotion path): line 246 calls checkFeedbackPremiseLiveness, lines 247-252 print [STALE_PREMISE] and process.exit(1) on STALE, with a --force-liveness audited override (adapter.js:95-105 logForceLivenessOverride). Extension point exists exactly as described; do not re-litigate.'
  },
  {
    id: 'F2-liveness-checker-does-not-currently-consume-any-timestamp-field',
    severity: 'WARNING',
    summary: 'checkPremiseLiveness (premise-liveness.js:221-308) never reads a timestamp/ref field OFF the descriptor at all -- its STALE/LIVE verdict is derived purely from two live re-queries at CALL time: recentRecount() against sd_phase_handoffs rejections within the last recentDays (default 7, relative to deps.nowMs or a hardcoded 2026-06-23 default) and findShippedFix() against completed strategic_directives_v2 rows / git log within completedDays (default 14). STALE = recentCount===0 && fix.found (line 274-281); everything else resolves LIVE, fail-open on any error. This means AC-1 is satisfiable WITHOUT the STALE determination itself ever consuming measured_at/ref -- provenance-stamping and staleness-detection are orthogonal under the current mechanism. The SD text already anticipates this ("surface perishability through the EXISTING liveness adapter" rather than "derive staleness FROM the stamp"), so this is not a scope violation, but PLAN should state explicitly in the PRD that measured_at/ref are carried for provenance/evidence display, not as new liveness-computation inputs, so EXEC does not attempt to rewire the checker itself.'
  },
  {
    id: 'F3-AC-2-is-already-true-pre-implementation-needs-tightening',
    severity: 'WARNING',
    summary: 'tests/unit/feedback/create-quick-fix-liveness-gate.test.js (46 lines, pre-existing, from SD-FDBK-ENH-UAT-AGENT-FEEDBACK-001) already statically asserts the [STALE_PREMISE] marker precedes the quick_fixes INSERT and that checkFeedbackPremiseLiveness is imported/reused. AC-2 as literally written ("Assert create-quick-fix.js surfaces that STALE verdict at its existing consumption point") is therefore ALREADY SATISFIED by existing code/tests and validates no NEW work from this SD. Recommend PLAN tighten AC-2 in the PRD to require the surfaced STALE_PREMISE output (evidence[] / console.error lines) to additionally reflect the new measured_at/ref provenance fields, otherwise EXEC could mark AC-2 "done" trivially without touching AC-2-relevant code at all.'
  },
  {
    id: 'F4-no-dedicated-provenance-columns-exist-feedback-table-has-metadata-jsonb',
    severity: 'INFO',
    summary: 'Queried the live `feedback` table column list directly: no measured_at, git_ref/git_sha, or timezone-explicit provenance columns exist. The table DOES already have a `metadata` jsonb column (used elsewhere, e.g. create-quick-fix.js:419-421 reads/writes feedback.metadata for quick_fix_id/session_id linkage). Stamping provenance (measured_at ISO-8601-with-explicit-offset, git ref/sha, tz) into feedback.metadata satisfies the binding out-of-scope constraint "no new tables" WITHOUT requiring a new column either -- metadata jsonb is sufficient and is the established convention on this table. No new column is required, though PLAN could choose one; if PLAN elects a dedicated column instead of metadata jsonb, that must be named explicitly in the PRD (it would still respect "no new tables" but is a discretionary, not forced, choice).'
  },
  {
    id: 'F5-CRITICAL-record-time-writer-fan-out-is-a-real-scope-creep-risk',
    severity: 'WARNING',
    summary: 'grep for `.from(\'feedback\')` followed by `.insert(` across scripts/ and lib/ returns 40+ distinct call sites (e.g. scripts/create-quick-fix.js, scripts/sd-from-feedback.js, lib/eva/corrective-finding-recorder.js, lib/governance/emit-feedback.js, lib/agents/uat-sub-agent.js, lib/data-plane/workers/feedback-to-proposal.js, and many more). lib/governance/emit-feedback.js self-documents "@canonical-writer-for: feedback" but by its own doc comment currently has only 2 real callers (scripts/log-harness-bug.js, lib/eva/lifecycle-sd-bridge.js) -- it is aspirationally canonical, not universally enforced; most of the 40+ sites bypass it with direct .insert() calls. The obvious "complete" implementation path -- retrofitting measured_at/ref/tz into every feedback-insert call site -- is a large, unbounded surface that the SD text explicitly warns against ("the least specified of the five and the likeliest to become unbounded"). AC-1 only requires demonstrating ONE claim recorded with provenance and re-verified STALE; it does not require universal adoption. Recommend PLAN scope EXEC to ONE canonical entry point (either a small new helper function, e.g. stampClaimProvenance(), added to lib/eva/feedback-premise-adapter.js or a sibling module, wired into ONE writer as the reference implementation -- lib/governance/emit-feedback.js is the natural choice given its existing canonical-writer intent) rather than a sweep across all feedback-insert call sites. A PR that touches more than a small handful of the 40+ sites should be treated as scope creep per the SD\'s own framing.'
  },
  {
    id: 'F6-AC-3-and-AC-4-are-cleanly-deterministic',
    severity: 'INFO',
    summary: 'AC-3 (explicit UTC offset -> timezone-independent age) is fully unit-testable: store an ISO-8601 string with explicit offset (e.g. ending in Z or +00:00), parse with Date.parse/new Date(), compute age via Date.now()-parsed under differing process.env.TZ, assert identical results. AC-4 (fresh measurement still LIVE) is already the default path through checkPremiseLiveness for any descriptor where recentCount>0 or fix.found is false (lines 283-299) and is already covered in spirit by tests/unit/premise-liveness.test.js (271 lines) and tests/unit/eva/feedback-premise-adapter.test.js (91 lines) -- extending those suites with a provenance-carrying fresh-measurement case is a small, deterministic addition, not new infrastructure.'
  }
];

const warnings = [
  'AC-2 is trivially already true pre-implementation (existing STALE_PREMISE gate + existing static test at tests/unit/feedback/create-quick-fix-liveness-gate.test.js) -- PLAN should tighten it in the PRD to require the surfaced output to reflect the NEW provenance fields, or EXEC can satisfy the letter of AC-2 without doing any AC-2-relevant work.',
  '40+ call sites insert into the feedback table directly; the "canonical writer" (lib/governance/emit-feedback.js) is not universally used. Do not let EXEC interpret "stamp provenance at RECORD time" as "retrofit every writer" -- that is the scope-creep failure mode the SD text itself flags as most likely for this specific child.',
  'checkPremiseLiveness does not currently read any field off the descriptor for its STALE/LIVE computation -- measured_at/ref are additive provenance carried alongside the verdict, not new inputs to it. PLAN should state this explicitly so EXEC does not attempt to rewire recentRecount/findShippedFix (would risk touching retraction-delivery territory reserved for siblings -A..-D).'
];

const recommendations = [
  'PLAN: in the PRD, name the ONE canonical writer EXEC will modify for the reference implementation (recommend lib/governance/emit-feedback.js, given its existing @canonical-writer-for: feedback self-declaration) rather than leaving "which writer" open-ended.',
  'PLAN: store measured_at/git_ref/timezone under feedback.metadata (existing jsonb column) -- no new column and no new table required; explicitly rule out a new dedicated column unless a concrete reason emerges.',
  'PLAN: tighten AC-2\'s wording so it validates that the surfaced STALE output includes the new provenance fields, since the bare "surfaces STALE at existing consumption point" behavior already exists and would pass without any new code.',
  'PLAN: explicitly instruct EXEC that checkPremiseLiveness\'s recentRecount/findShippedFix logic is NOT to be modified -- only the descriptor-building/evidence-formatting layer around it should change, keeping this child\'s blast radius disjoint from siblings -A through -D (retraction delivery).',
  'EXEC: add the git-ref capture via a small helper mirroring premise-liveness.js\'s defaultGit() pattern (execSync git rev-parse HEAD, injectable dep, best-effort/non-fatal on failure) rather than inventing a new git-shelling convention.'
];

const summary = 'LEAD-TO-PLAN VALIDATION PASS (confidence 82) for SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001-E. Extension point (lib/eva/feedback-premise-adapter.js:83-85 checkFeedbackPremiseLiveness) and consumption point (scripts/create-quick-fix.js:236-257) both confirmed exactly as the SD describes. All four ACs are deterministically testable as written (no agent interview, no unfalsifiable negative) -- AC-1 and AC-3/AC-4 cleanly so; AC-2 is technically testable but is ALREADY TRUE pre-implementation via existing code + an existing static test, so it validates no new work unless PLAN tightens its wording to require the surfaced output to reflect the new provenance fields. Provenance can be stamped inside feedback.metadata (existing jsonb column) with NO new table and NO new column required, satisfying the binding out-of-scope constraint. The one real scope-creep risk is fan-out: 40+ call sites insert into the feedback table directly and the declared "canonical writer" (lib/governance/emit-feedback.js) currently has only 2 real callers, so an EXEC attempt to retrofit provenance into every writer would blow the pinned scope -- PLAN should scope EXEC to ONE canonical entry point as the reference implementation. checkPremiseLiveness itself does not currently consume any timestamp/ref field for its STALE/LIVE computation (verdict is derived from live re-queries at call time, not from stored age) -- this is consistent with the SD\'s own "surface perishability through the EXISTING liveness adapter" framing (provenance is carried evidence, not a new liveness input), but PLAN must state this explicitly so EXEC does not attempt to rewire the checker, which would risk crossing into retraction-delivery territory reserved for sibling children -A through -D. GO for LEAD-TO-PLAN with the above findings carried into PRD authoring.';

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'VALIDATION',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence: 82,
    findings,
    warnings,
    recommendations,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      parent_sd_key: 'SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001',
      sibling_children: ['-A', '-B', '-C', '-D'],
      extension_point: 'lib/eva/feedback-premise-adapter.js:83-85 checkFeedbackPremiseLiveness',
      consumption_point: 'scripts/create-quick-fix.js:236-257',
      go_no_go: 'GO',
      ac_testability: {
        'AC-1': 'DETERMINISTIC -- inject supabase/git deps so recentCount=0 && fix.found=true, assert STALE.',
        'AC-2': 'DETERMINISTIC but ALREADY TRUE pre-implementation (existing gate + existing static test); recommend PLAN tighten wording to require provenance fields in the surfaced output.',
        'AC-3': 'DETERMINISTIC -- ISO-8601 explicit-offset string, parse under differing TZ, assert identical age.',
        'AC-4': 'DETERMINISTIC -- default LIVE path already exercised by existing test suites.'
      },
      storage_plan: {
        table: 'feedback',
        column: 'metadata (existing jsonb, no new column/table required)',
        new_columns_required: false,
        new_tables_required: false
      },
      scope_creep_risk: 'HIGH if EXEC retrofits provenance into more than one writer; 40+ direct .insert() call sites exist against a nominally-canonical-but-underused lib/governance/emit-feedback.js.'
    },
    phase: 'LEAD-TO-PLAN',
    validation_mode: 'prospective',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'VALIDATION',
    SD_ID,
    { name: 'Principal Systems Analyst (validation-agent)' },
    results,
    { sdKey: SD_KEY, phase: 'LEAD-TO-PLAN' }
  );

  console.log('VERDICT WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  repo_resolved:', stored.metadata?.repo_resolved);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  process.exit(0);
}

main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
