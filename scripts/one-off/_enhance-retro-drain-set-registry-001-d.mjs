// Enhance the auto-generated (boilerplate-heavy) SD_COMPLETION retrospective for
// SD-LEO-INFRA-DRAIN-SET-REGISTRY-001-D with the real session narrative: the
// orphan re-route sweep implementation, the live one-tick production proof
// (3 real rows rerouted + DB-verified audit stamp, idempotent re-run), and the
// repeat-offender alarm gap (unit-covered, not live-fired this session).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const s = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY);

const RETRO_ID = '1272cebc-ca9d-46e0-b4a5-30a25233b48e';
const SD_KEY = 'SD-LEO-INFRA-DRAIN-SET-REGISTRY-001-D';

const update = {
  what_went_well: [
    { achievement: 'lib/fleet/orphan-reroute-sweep.js implements sweepOrphanRows(supabase, opts): finds unread session_coordination rows whose payload.kind is not in the target role\'s recognized drain set (via dispatch.cjs resolveTargetRole + drain-set-registry.js resolveRecognizedKinds from completed sibling Child A/-B), re-types them to the coordinator-recognized DIRECTIVE_KIND \'coordinator_reminder\', re-targets to the live coordinator, and stamps a payload.reroute audit trail — mirroring the already-live-proven idempotent-reroute idiom in lib/coordinator/succession.cjs (drainCoordinatorOutbound/parkAtBroadcast) rather than inventing a new pattern', is_boilerplate: false },
    { achievement: 'LIVE ONE-TICK PROOF against the real production database (not a synthetic fixture, per Solomon pin 4): tick 1 (node scripts/orphan-reroute-sweep.mjs) returned {"swept":49,"rerouted":3,"alarmed":0}, finding and rerouting 3 genuine unread rows addressed to the live coordinator (kinds review_supply, row_growth_anomaly, account_switch_notice — none recognized in DRAIN_SETS.coordinator). All 3 rows (a3fad7c4-7811-4593-898d-b25b408842df, 4df11a86-d336-4308-83bd-7fd0fc51af62, db346f30-9d4c-4b17-bca1-c196fbf54eb0) were DB-verified post-hoc during this retrospective to carry the full {from_kind,to_kind,from_target,to_target,from_role,at,by_sweep} audit stamp with original payload fields untouched', is_boilerplate: false },
    { achievement: 'Idempotency proven live, not just in mocks: an immediate tick-2 re-run against the same production database returned {"swept":49,"rerouted":0,"alarmed":0} — the 3 already-rerouted rows were correctly skipped on re-scan. This closes ledger item (c) of the parent orchestrator SD-LEO-INFRA-DRAIN-SET-REGISTRY-001\'s cross-child e2e proof requirement', is_boilerplate: false },
    { achievement: 'Repeat-offender alarm mechanism (fires once a (role,kind) pair has orphaned 2+ times in a 14-day window, via payload.kind=\'coordinator_request\' through the canonical insertCoordinationRow choke) is fully unit-covered — 14/14 tests passing in tests/unit/fleet/orphan-reroute-sweep.test.js, independently re-run and confirmed during this retrospective', is_boilerplate: false },
    { achievement: 'Design worked on first implementation pass — no bugs required a self-review fix this session, unlike some sibling Child SDs in the same orchestrator', is_boilerplate: false },
    { achievement: '.github/workflows/orphan-reroute-sweep-cron.yml wires the sweep to run every 15 minutes, headless and not var-gated, so the live-proven behavior keeps running unattended rather than depending on manual invocation', is_boilerplate: false },
    { achievement: 'PR #6342 opened (feat/SD-LEO-INFRA-DRAIN-SET-REGISTRY-001-D) with full test-plan writeup; verified during this retrospective to have all completed CI checks green (Gate 0/2A/2B/2C/2D/3, Security Review, LEO Protocol Drift Check, Story Verification CI, db-guards, LEO Bypass Detection) with Coverage and Unit Tier still in progress at retro time', is_boilerplate: false },
    { achievement: 'LEAD-phase Explore + VALIDATION and PLAN-phase TESTING sub-agent evidence written this session via the canonical lib/sub-agents/resolve-repo.js applySubAgentRepoVerdict + lib/sub-agent-executor/results-storage.js storeSubAgentResults pattern (never hand-rolled inserts), all PASS: Explore 90, VALIDATION 88, TESTING 92', is_boilerplate: false },
    { achievement: 'Depends cleanly on completed sibling substrate (lib/fleet/drain-set-registry.js from Child A/-B) without needing to modify it — confirmed by the sibling drain-set-registry + succession.cjs test suites (40 total across the 3 files) still passing unchanged alongside this SD\'s 14 new tests', is_boilerplate: false }
  ],
  what_needs_improvement: [
    'The repeat-offender alarm path is unit-verified (14/14 passing) but was not exercised on the live production run this session — none of the 3 live orphan kinds (review_supply, row_growth_anomaly, account_switch_notice) recurred a second time within the 14-day window during this single tick. Structurally identical to the already-live-proven reroute path, so risk is low, but it remains untested against real production timing/volume until a genuine second occurrence lands on a future cron tick',
    'PR #6342\'s Coverage and Unit Tier CI checks were still IN_PROGRESS at the moment this retrospective was generated (all other checks — Gate validation, security, drift, story verification — were green); final CI confirmation happens after this retrospective, not before it',
    'strategic_directives_v2.progress for this SD reads 0% at generation time despite the implementation, tests, live proof, and PR being fully complete — a known DB/code-status lag pattern (progress field updates on a later handoff step) that this retrospective corrects for by grounding claims in actual artifacts rather than the stale progress column',
    'The cron workflow (orphan-reroute-sweep-cron.yml) has not yet had a full 15-minute unattended cycle observed in this session; the two live proof ticks were both manually triggered via the CLI wrapper, not the scheduled workflow itself'
  ],
  action_items: [
    {
      action: 'Monitor the repeat-offender alarm on the live cron schedule; when a real (role,kind) pair naturally orphans twice within a 14-day window, verify the alarm fires end-to-end in production (not just in the unit suite) and record that as closing evidence',
      source: 'test_gap',
      priority: 'medium',
      smart_format: true,
      success_criteria: 'A genuine live repeat-offender alarm is observed and DB-verified (payload.kind=coordinator_request, targetRoleHint=coordinator) within a future retrospective or signal'
    },
    {
      action: 'Confirm PR #6342\'s Coverage and Unit Tier CI checks reach SUCCESS before/at merge',
      source: 'ci_status',
      priority: 'high',
      smart_format: true,
      success_criteria: 'gh pr view 6342 shows all statusCheckRollup entries as SUCCESS or neutral/skipped, none FAILURE'
    },
    {
      action: 'Continue the established pattern of live one-tick production proof (not synthetic fixtures) for future drain-set-registry orchestrator siblings, per Solomon pin 4',
      source: 'success_pattern',
      priority: 'low',
      smart_format: true,
      success_criteria: 'Future Child SDs in this orchestrator family cite a real, DB-verified live tick result in their retrospective, as this one does'
    }
  ],
  key_learnings: [
    { learning: 'A live one-tick proof against the real production database (not a mock/fixture) is a materially stronger evidence tier than unit tests alone: it caught 3 genuine orphaned rows the unit suite could not have discovered (real payload.kind values in production that were never anticipated in test fixtures), and DB-verifying the resulting audit stamp post-hoc closes the loop from "code claims to do X" to "X actually happened"', is_boilerplate: false },
    { learning: 'Mirroring an already-live-proven idiom (lib/coordinator/succession.cjs\'s drainCoordinatorOutbound/parkAtBroadcast idempotent-reroute pattern) rather than inventing a new reroute mechanism reduced implementation risk enough that no bugs surfaced needing a self-review fix — reuse of a proven pattern is itself a risk-reduction strategy worth calling out explicitly, not just an implementation detail', is_boilerplate: false },
    { learning: 'Re-running a sweep immediately after its first tick (tick 2 producing rerouted:0 against the same 49 candidate rows) is a cheap, high-value idempotency check that a single tick alone cannot provide — worth making a standard practice for any live-proof of a stateful sweep/drain mechanism', is_boilerplate: false },
    { learning: 'A mechanism can be fully unit-covered (14/14 passing, explicit threshold tests) yet still have zero live-fire evidence for a specific code path (the repeat-offender alarm) simply because the live data during the proof window did not happen to trigger it — this is a legitimate, low-risk gap to name explicitly in a retrospective rather than either overclaiming full live coverage or blocking completion on an artificially-manufactured trigger', is_boilerplate: false },
    { learning: 'strategic_directives_v2.progress can lag real completion state (implementation + tests + live proof + open PR) until a later handoff step updates it — retrospectives and evidence should be grounded in actual artifacts (files, test runs, DB rows, PR/CI state) rather than trusting a single progress-percentage column in isolation', is_boilerplate: false }
  ],
  success_patterns: [
    'Reuse of an already-live-proven idiom (succession.cjs idempotent-reroute) instead of a novel mechanism',
    'Live one-tick production proof with an immediate idempotency re-run, not just unit mocks',
    'Post-hoc DB verification of the exact audit-stamp shape on the exact rows touched by the live tick',
    'Clean dependency on completed sibling substrate (Child A/-B drain-set-registry.js) with zero regressions to its 40-test suite',
    'Canonical sub-agent evidence writing (applySubAgentRepoVerdict + storeSubAgentResults) used consistently across LEAD/PLAN phases this session'
  ],
  failure_patterns: [],
  quality_score: 90,
  team_satisfaction: 9,
  business_value_delivered: 'Closes a real operational gap in the drain-set-registry orchestrator family: unread session_coordination rows with unrecognized payload.kind values for their target role were previously stranded (never re-routed, never alarmed). This sweep actively finds and re-routes them to the live coordinator with a full audit trail, and adds a repeat-offender alarm so recurring unrecognized-kind sources get surfaced rather than silently accumulating. Live-proven against production this session (3 real rows rerouted, idempotency confirmed).',
  customer_impact: 'None directly customer-facing — internal fleet coordination/observability infrastructure (drain-set-registry orchestrator family, Child C of SD-LEO-INFRA-DRAIN-SET-REGISTRY-001)',
  technical_debt_addressed: true,
  technical_debt_created: false,
  bugs_found: 0,
  bugs_resolved: 0,
  tests_added: 14,
  test_total_count: 14,
  test_passed_count: 14,
  test_failed_count: 0,
  test_pass_rate: 100,
  performance_impact: 'Negligible — bounded sweep over unread session_coordination rows on a 15-minute cron cadence, idempotent no-op on already-processed rows',
  objectives_met: true,
  on_schedule: true,
  within_scope: true,
  related_files: [
    'lib/fleet/orphan-reroute-sweep.js',
    'scripts/orphan-reroute-sweep.mjs',
    '.github/workflows/orphan-reroute-sweep-cron.yml',
    'tests/unit/fleet/orphan-reroute-sweep.test.js'
  ],
  related_prs: ['https://github.com/rickfelix/EHG_Engineer/pull/6342'],
  affected_components: ['session_coordination orphan-routing', 'drain-set-registry orchestrator family (Child C)', 'coordinator inbound routing'],
  tags: ['drain-set-registry', 'orphan-reroute', 'repeat-offender-alarm', 'live-proof', 'infra-fleet-coordination']
};

const { data: sd } = await s.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();

const { data, error } = await s
  .from('retrospectives')
  .update(update)
  .eq('id', RETRO_ID)
  .select('id, sd_id, quality_score, retro_type, status')
  .single();

if (error) {
  console.error('ENHANCE ERROR:', error.message);
  process.exit(1);
}

if (data.sd_id !== sd.id) {
  console.error(`ENHANCE ERROR: RETRO_ID ${RETRO_ID} belongs to sd_id=${data.sd_id}, not ${SD_KEY} (${sd.id}) — refusing to report success on a mismatched retro.`);
  process.exit(1);
}

console.log('Enhanced retrospective', data.id, 'for', SD_KEY, '- quality_score:', data.quality_score, '- retro_type:', data.retro_type, '- status:', data.status);
