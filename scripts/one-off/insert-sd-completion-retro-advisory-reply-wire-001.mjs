#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const SD_UUID = 'b0d54b9f-8848-4cab-a7d8-fba9ad3e31fb';
const SD_KEY = 'SD-LEO-INFRA-ADVISORY-REPLY-WIRE-001';
const SD_TITLE = 'Advisory reply-CC wire defect: replies on adam_advisory-kind correlations resolve to coordinator with no originator-CC (consult-kind CCs correctly)';

const now = new Date().toISOString();

const row = {
  sd_id: SD_UUID,
  retro_type: 'SD_COMPLETION',
  retrospective_type: null,
  project_name: SD_TITLE,
  title: `${SD_KEY}: Advisory Reply-CC Resolver Fix — Completion Retrospective`,
  description:
    "Bug fix in scripts/solomon-advisory.cjs: a reply sent on an adam_advisory-kind session_coordination " +
    "correlation resolved its CC target to coordinator-only, silently dropping the originating Adam session, " +
    "while the same reply path on a solomon_consult-kind correlation CC'd correctly. LEAD's Explore sub-agent " +
    "confirmed the root cause as a hard kind=='solomon_consult' gate on both resolveConsultOriginator branches " +
    "(scripts/solomon-advisory.cjs:567-596 pre-fix). What looked like a one-line kind-widen at LEAD turned into a " +
    "5-FR fix (REPLY_ELIGIBLE_KINDS widening, by-id-branch reply fall-through, cap-then-filter correction, a new " +
    "Solomon-role live remap) after VALIDATION (LEAD) and a prospective TESTING pass (PLAN, before any code was " +
    "written) both measured that a naive kind-widen alone would resolve the REPLIER as 'originator' on 42/42 " +
    "sampled already-answered correlations, because a Solomon reply is itself stored with the same kind and " +
    "correlation_id as the ask it answers. Three further rounds of adversarial EXEC-TO-PLAN TESTING/SECURITY " +
    "review, plus a PLAN_VERIFICATION differential against all 47 live answered correlations and a REGRESSION " +
    "pass, each found and closed additional real defects before this reached LEAD-FINAL-APPROVAL.",
  period_start: '2026-08-25T01:13:56.140463+00:00',
  period_end: now,
  conducted_date: now,
  agents_involved: ['LEAD', 'PLAN', 'EXEC'],
  sub_agents_involved: ['Explore', 'VALIDATION', 'DATABASE', 'RISK', 'STORIES', 'TESTING', 'SECURITY', 'REGRESSION', 'VISION_FIDELITY'],
  human_participants: ['LEO-Session'],

  what_went_well: [
    "LEAD's Explore sub-agent pinpointed the exact defect location on the first pass (resolveConsultOriginator's " +
      "by-id branch at line 580 and the correlation-fallback query's kind filter at line 589, both hard-gated on " +
      "kind==='solomon_consult'), and separately confirmed the SD's own dedup candidate (harness_backlog 51cc3077 " +
      "/ specimen d661996e) was NOT the same defect class -- keeping this SD's scope from ballooning to include an " +
      "unrelated, already-refuted drain/paging anomaly.",
    "LEAD VALIDATION measured live data (not just read the code) and found that a naive kind-widen would resolve " +
      "the REPLIER as 'originator' on 42/42 sampled already-answered correlations, because a Solomon reply on an " +
      "adam_advisory correlation is stored with the SAME kind and correlation_id as the ask it answers -- this " +
      "corrected the SD scope from a 1-line kind-widen to kind-widen-plus-reply-exclusion before PLAN began.",
    "PLAN's prospective TESTING review (TST-C1, TST-C2) found two more CRITICAL structural defects in the " +
      "corrected fix shape BEFORE any implementation code existed: the by-id branch was still unguarded against " +
      "resolving a reply row's own sender when --reply-to naturally resolves to the newest (reply) row id, and " +
      "applying reply-exclusion AFTER a .limit(1) DESC query would silently reintroduce the exact bug on every " +
      "already-answered correlation. Both were closed in the PRD (FR-2 correction, new FR-4) before EXEC started.",
    "Three full rounds of adversarial EXEC-TO-PLAN review (TESTING then SECURITY then TESTING again) each found " +
      "real, independent defects in a fix that was already functionally correct: round 1 TESTING found 4 " +
      "individually mutation-surviving test gaps; round 2 SECURITY found the correlation-branch kind allowlist " +
      "was unpinned (S3) and the resolved CC target was written with zero validation, accepting a 'broadcast-'- " +
      "prefixed fan-out sentinel, the nil UUID, or a non-UUID cron identity as a silent 'success' (S4); round 3 " +
      "TESTING found a swallowed non-throwing query error (T1) and two unpinned guard-ordering invariants (T2, " +
      "T3). Every fix was independently re-verified by mutation (revert -> confirm the new test fails for the " +
      "right reason -> restore -> confirm green), not merely trusted on the first pass.",
    "PLAN_VERIFICATION's VALIDATION sub-agent ran an OLD-vs-NEW differential against ALL 47 live answered " +
      "correlations (not a sample): 9 real adam_advisory-kind specimens the old code silently failed to CC, all 9 " +
      "fixed by the new code, 0 regressions across the 38 solomon_consult correlations that were already working.",
    "The REGRESSION sub-agent at PLAN_VERIFICATION caught one more real gap after SECURITY had already approved " +
      "the CC-target guard: the guard checked only the 'broadcast-'-PREFIXED fan-out sentinel, but bare " +
      "'broadcast' (no trailing dash) is also a live sentinel in lib/coordinator/dispatch.cjs's SENTINEL_TARGETS " +
      "-- fixed and mutation-verified in the same pass, closing the SD."
  ],

  what_needs_improvement: [
    "The original PRD's FR-2 scoped reply-row exclusion to the correlation-fallback branch only; PLAN's own " +
      "prospective TESTING (TST-C1) had to catch, before EXEC, that the by-id branch needed the identical guard " +
      "-- the by-id branch is the one actually exercised when Solomon answers a thread using the id of its own " +
      "prior reply (a normal, common shape), so the initial FR-2 draft would have left the bug reachable through " +
      "a second door.",
    "The first EXEC implementation shipped functionally-correct code with 4 individually mutation-surviving test " +
      "gaps on its FIRST EXEC-TO-PLAN pass (cap size, sort direction, JS filter, and by-id kind guard were each " +
      "unpinned) -- the fix worked, but nothing in the test suite would have caught a regression on any of those " +
      "four axes had one been introduced later.",
    "The CC-target write path (target_session in ensureOriginatorCc) had zero validation until SECURITY's round-2 " +
      "review (S4) -- a resolved originator could reach the DB write as a 'broadcast-'-prefixed live fan-out " +
      "sentinel, the nil UUID, or a non-UUID cron identity, each silently reported as success; and even the fix " +
      "for S4 initially covered only the prefixed sentinel form, missing the bare 'broadcast' variant caught by " +
      "REGRESSION (R1) a full phase later.",
    "A non-throwing Supabase/PostgREST query-level error (bad column, missing table -- the {data:null, error} " +
      "shape rather than a thrown exception) was silently swallowed in resolveOriginatorFromCorrelation until " +
      "round-3 TESTING (T1) found it: the function's own inline comment claimed 'loud, still fail-open' behavior " +
      "that only the catch block actually delivered, and a query-level error never reaches that catch block.",
    "This SD's own edit (adding an isUsableSessionId import near the top of scripts/solomon-advisory.cjs) shifted " +
      "enforceSweepBudget's definition line by one, staling a hand-maintained static line-number pointer in " +
      "lib/governance/guard-wiring-registry.js -- a self-inflicted CI break requiring a follow-up commit, caught " +
      "only because a dedicated guard-wiring registry test exists."
  ],

  key_learnings: [
    {
      lesson: 'A reply is stored in session_coordination with the SAME payload.kind and payload.correlation_id as ' +
        'the ask it answers. Any fix that widens a kind-based CC-eligibility gate without also excluding reply ' +
        'rows will resolve the REPLIER as "originator" on every already-answered thread of the newly-admitted ' +
        'kind -- LEAD VALIDATION measured this at 42/42 sampled multi-row correlations before any code was ' +
        'written, correcting the SD scope from a 1-line kind-widen to kind-widen-plus-reply-exclusion.',
      category: 'defect-class',
      applicability: 'Any future widening of a kind/type eligibility filter over session_coordination (or any ' +
        'append-only thread table where replies share their parent\'s discriminator fields) must be checked for ' +
        'whether the widened set now includes rows that are themselves replies, and must exclude them explicitly ' +
        '-- kind-widening and reply-row-exclusion are not separable changes.'
    },
    {
      lesson: 'Applying a row-exclusion filter (isReplyRow()) AFTER a `.order(desc).limit(1)` query is a silent, ' +
        'total regression on this table shape: the single fetched row IS the reply, gets filtered to zero ' +
        'candidates, and resolves null -- reproducing the exact "no CC" bug this SD exists to fix. The fix (FR-4) ' +
        'had to fetch a bounded ASCENDING candidate set (.order(asc).limit(20)) and filter in JS before taking the ' +
        'first row, both for correctness and because ascending order is idempotent regardless of reply count, ' +
        'which the dedup key in ensureOriginatorCc depends on.',
      category: 'defect-class',
      applicability: 'Cap-then-filter and filter-then-cap are not interchangeable when the filter can remove the ' +
        'row(s) the cap already selected -- any `.limit(N)` query paired with a downstream in-memory filter must ' +
        'be checked for whether N is generous enough that the filter cannot zero out the candidate set, and DESC ' +
        '(newest-first) ordering combined with post-cap filtering is a specific instance of this trap worth' +
        ' naming when reviewing similar resolver code.'
    },
    {
      lesson: 'Widening a kind-based eligibility gate has a second-order effect beyond the reply path: it also ' +
        'makes the SENDER\'s own outbound messages under that kind newly eligible as "originator" (every Solomon ' +
        'advisory send is stamped kind=adam_advisory regardless of sender). This required FR-5, a Solomon-role ' +
        'live-session remap mirroring the pre-existing Adam-side W3 remap, that was not part of the original ' +
        '2-sentence bug description and only surfaced via PLAN\'s prospective TESTING review.',
      category: 'verification',
      applicability: 'When widening a kind/type filter that gates a resolver reading FROM a shared table, check ' +
        'whether the newly-admitted rows include ones the CURRENT process itself writes -- the resolver may now ' +
        'be able to resolve "self" as a valid target, which typically needs the same identity-remap/self-skip ' +
        'logic already applied to the pre-existing eligible kinds.'
    },
    {
      lesson: 'A resolved CC/send target written to the DB with zero validation is a distinct, security-relevant ' +
        'defect class from resolver correctness: SECURITY (S4) proved the pre-fix code would accept a ' +
        '\'broadcast-\'-prefixed live fan-out sentinel, the nil UUID, or a non-UUID cron identity as target_session ' +
        'and report success -- and even the S4 fix initially covered only the PREFIXED sentinel form, missing the ' +
        'bare \'broadcast\' (no dash) variant that REGRESSION (R1) caught a full phase later, from ' +
        'lib/coordinator/dispatch.cjs\'s own SENTINEL_TARGETS list.',
      category: 'defect-class',
      applicability: 'Any code that resolves an identifier and then writes it as a target/recipient field must ' +
        'validate against isUsableSessionId (lib/coordinator/session-id-guard.cjs) AND the full, current sentinel ' +
        'list from lib/coordinator/dispatch.cjs -- reading a "known sentinel" list from memory or an old comment ' +
        'rather than the live source risks missing variant forms of the same sentinel.'
    },
    {
      lesson: 'A "loud, still fail-open" inline comment describing catch-block error logging is only true for ' +
        'thrown exceptions -- Supabase/PostgREST query-level failures (bad column, missing table) resolve as ' +
        '{data:null, error} WITHOUT throwing, so resolveOriginatorFromCorrelation\'s catch block never saw them, ' +
        'and the function degraded silently to the exact "no CC" symptom the SD exists to fix. This was only ' +
        'found by round-3 TESTING (T1) tracing the actual error shape supabase-js returns for this table, not by ' +
        'reading the comment.',
      category: 'verification',
      applicability: 'Treat inline "fails loudly" / "logs on error" comments as a testable claim, not ' +
        'documentation -- verify which error SHAPE the guarded call can actually produce (thrown vs returned ' +
        '{error}) matches the shape the logging code is positioned to observe, especially for Supabase-js query ' +
        'calls, which resolve rather than throw on query-level failures.'
    },
    {
      lesson: 'Mutation testing (revert the fix, confirm the specific new test fails for the right reason, ' +
        'restore, confirm green) caught real gaps that a green test suite alone did not: round-1 EXEC-TO-PLAN ' +
        'TESTING found 4 mutation survivors in code that was already functionally correct and passing 1858/1858 ' +
        'tests, and round-3 TESTING similarly found that the S4 guard and self/target skip were correctly ' +
        'positioned in the shipped code but nothing pinned that ordering against a future refactor moving them.',
      category: 'process',
      applicability: 'For resolver/guard code with more than one correctness-critical ordering or boundary ' +
        'condition (cap size, sort direction, filter application, guard placement relative to a remap step), a ' +
        'passing test suite is necessary but not sufficient evidence -- run a mutation pass on the specific ' +
        'primitives (constants, comparison operators, call ordering) before treating the implementation as done.'
    },
    {
      lesson: 'A same-file edit unrelated to a registered function (adding an import near the top of ' +
        'scripts/solomon-advisory.cjs) shifted enforceSweepBudget\'s definition by one line, staling the ' +
        'hand-maintained static line-number pointer in lib/governance/guard-wiring-registry.js -- caught only ' +
        'because a dedicated guard-wiring CI test exists to catch exactly this drift.',
      category: 'process',
      applicability: 'Static line-number pointers in a registry (GUARD_REGISTRY definedAt entries) are fragile to ' +
        'any edit anywhere earlier in the same file, not just edits to the registered function itself -- keep the ' +
        'guard-wiring registry test (tests/unit/governance/guard-wiring.test.js) as a required check on any PR ' +
        'touching a file with a registered entry, and prefer deriving definedAt from source over hand-maintaining ' +
        'it where feasible.'
    }
  ],

  action_items: [
    {
      action: 'Audit other resolver/target-write call sites in scripts/solomon-advisory.cjs and ' +
        'scripts/coordinator-reply.cjs for the same "write a resolved session id as a CC/send target with zero ' +
        'validation" pattern that S4/R1 found in ensureOriginatorCc -- apply isUsableSessionId ' +
        '(lib/coordinator/session-id-guard.cjs) plus an explicit, dispatch.cjs-sourced sentinel check (both ' +
        'broadcast and broadcast- forms) wherever a resolved identifier is about to be persisted as a target.',
      owner: 'LEO-Session',
      deadline: 'Next coordinator lane touch',
      verification: 'A grep for insertCoordinationRow / target_session writes in scripts/solomon-advisory.cjs and ' +
        'scripts/coordinator-reply.cjs, cross-referenced against whether each is preceded by an ' +
        'isUsableSessionId + sentinel-list check',
      category: 'follow-up',
      is_boilerplate: false
    },
    {
      action: 'Any future kind/type eligibility-widening change on a session_coordination resolver should ' +
        'explicitly re-derive, before implementation: (a) whether reply rows share the widened kind and need ' +
        'exclusion in EVERY branch that reads by id, not just the primary fallback query; (b) whether ' +
        'cap-then-filter vs filter-then-cap ordering matters for that query; (c) whether the sender\'s own ' +
        'outbound messages under the widened kind newly become eligible as "originator" and need a role-based ' +
        'remap, mirroring the FR-5 pattern in ensureOriginatorCc.',
      owner: 'LEO-Session',
      deadline: 'Next resolver-widening SD in this subsystem',
      verification: 'PRD for any such future SD explicitly addresses all three checks in its FR list, per this ' +
        'SD\'s FR-2/FR-4/FR-5',
      category: 'process',
      is_boilerplate: false
    },
    {
      action: 'Verify resolveOriginatorFromCorrelation\'s T1 error-signalling fix (console.error on the ' +
        'non-throwing {error} shape) actually surfaces in production logs the next time a live query-level ' +
        'failure occurs against session_coordination, rather than trusting the unit-test coverage alone.',
      owner: 'LEO-Session',
      deadline: '30d post-merge',
      verification: 'Search production logs for "[solomon-advisory] resolveOriginatorFromCorrelation query ' +
        'error" and confirm at least the absence of a silent no-CC incident matching this failure mode',
      category: 'verification',
      is_boilerplate: false
    }
  ],

  improvement_areas: [
    {
      area: 'Reply-row exclusion scoped to only one of two read branches in the original PRD draft',
      analysis: 'FR-2\'s first draft excluded reply rows from the correlation-fallback query only. The by-id ' +
        'branch (reached whenever --reply-to is a row id, which is the natural id to paste when answering an ' +
        'already-answered thread) had no equivalent guard, so a widened kind gate there would resolve a reply ' +
        'row\'s own sender as "originator" -- byte-identical to the bug this SD exists to fix, reached through a ' +
        'second door PLAN\'s prospective TESTING found before EXEC began.',
      prevention: 'PRD amended (FR-2 correction) to require the by-id branch fall through via the hit row\'s own ' +
        'payload.correlation_id into the (corrected) fallback resolution on an isReplyRow() hit, rather than ' +
        'returning that row\'s own sender.'
    },
    {
      area: 'CC/send target written with zero validation',
      analysis: 'ensureOriginatorCc wrote the resolved originator directly into target_session with no check that ' +
        'it was a usable session id -- SECURITY (S4) proved this would silently accept a fan-out sentinel, the ' +
        'nil UUID, or a non-UUID cron identity, and the first fix for it (prefix-only \'broadcast-\' check) still ' +
        'missed the bare \'broadcast\' sentinel form, caught a phase later by REGRESSION (R1).',
      prevention: 'Added an isUsableSessionId(originator) check plus explicit broadcast/broadcast-* rejection, ' +
        'positioned AFTER the FR-5 live-role remap so it validates the value actually written, not the pre-remap ' +
        'candidate.'
    }
  ],

  success_patterns: [
    'LEAD-phase VALIDATION measuring live data (42/42 sampled correlations) rather than trusting the surface-level ' +
      'bug description corrected the SD scope from a 1-line fix to a 5-FR fix before PLAN began.',
    'PLAN-phase prospective TESTING review of the PLANNED fix shape (not yet implemented) caught 2 CRITICAL ' +
      'structural defects (TST-C1, TST-C2) before any code was written, avoiding a wasted EXEC pass.',
    'Three full rounds of adversarial EXEC-TO-PLAN review (TESTING, SECURITY, TESTING) each independently found ' +
      'real, distinct defects in an implementation that was already functionally correct and test-passing, ' +
      'closing every one before LEAD-FINAL-APPROVAL.',
    'PLAN_VERIFICATION differential testing against ALL 47 live answered correlations (not a sample) gave direct, ' +
      'measured evidence of 9 real fixes and 0 regressions, rather than relying on unit-test coverage alone.',
    'Every fix across all three EXEC-TO-PLAN rounds was independently mutation-verified (revert, confirm the new ' +
      'test fails for the right reason, restore, confirm green) instead of trusted on the first pass.'
  ],

  failure_patterns: [
    'The original FR-2 draft scoped reply-row exclusion to only the correlation-fallback branch, missing the ' +
      'by-id branch reachable via the common "reply to an already-answered thread" UX path.',
    'The first EXEC implementation shipped functionally correct but under-pinned: 4 individually mutation-viable ' +
      'test gaps (cap size, sort direction, JS filter, by-id kind guard) survived its own first EXEC-TO-PLAN pass.',
    'The CC-target write path had zero input validation until a round-2 SECURITY review, and even that fix\'s ' +
      'first version missed a bare-string variant of the sentinel it was built to reject, caught only in a later ' +
      'phase by REGRESSION.',
    'A non-throwing Supabase query error was silently swallowed by resolveOriginatorFromCorrelation despite an ' +
      'inline comment claiming loud failure -- the comment described catch-block behavior a query-level error ' +
      'never reaches.',
    'This SD\'s own unrelated import addition shifted a downstream function\'s line number, staling a ' +
      'hand-maintained static pointer in lib/governance/guard-wiring-registry.js and requiring a dedicated ' +
      'follow-up commit to fix.'
  ],

  velocity_achieved: null,
  quality_score: 92,
  team_satisfaction: 9,
  business_value_delivered:
    'Fixes a real, live coordination visibility bug: Adam sessions were silently missing Solomon\'s replies to ' +
    'their own advisories. Verified by a differential against all 47 live answered correlations (9 real fixes, 0 ' +
    'regressions to the already-working solomon_consult path), so the fix is measured to close the reported gap ' +
    'without breaking the working control path.',
  customer_impact:
    'Internal fleet coordination only: Adam sessions now reliably receive a CC when Solomon replies to an ' +
    'adam_advisory-kind thread, matching the behavior that already worked correctly for solomon_consult-kind ' +
    'threads, including on already-answered threads with multiple prior replies.',
  technical_debt_addressed: true,
  technical_debt_created: false,
  bugs_found: 9,
  bugs_resolved: 9,
  tests_added: 24,
  code_coverage_delta: null,
  performance_impact:
    'Negligible: the corrected correlation-fallback query fetches up to 20 rows (bounded) instead of 1, still a ' +
    'single indexed lookup by correlation_id per reply.',
  objectives_met: true,
  on_schedule: true,
  within_scope: true,

  generated_by: 'MANUAL',
  trigger_event: 'PLAN-TO-LEAD RETROSPECTIVE_QUALITY_GATE',
  status: 'PUBLISHED',

  target_application: 'EHG_Engineer',
  learning_category: 'APPLICATION_ISSUE',
  applies_to_all_apps: false,
  related_files: [
    'scripts/solomon-advisory.cjs',
    'tests/unit/solomon-consult-originator-cc.test.js',
    'lib/governance/guard-wiring-registry.js',
    'lib/coordinator/session-id-guard.cjs',
    'lib/coordinator/solomon-identity.cjs',
    'lib/coordinator/dispatch.cjs'
  ],
  related_commits: [
    '23f808143cd',
    '481ffbc8ccd',
    '98d493f3d9d',
    '13bc00c1349',
    '19a6b3d8985',
    '86d594055c9',
    '0a7bf86ea20',
    '6f5ea9d9d49'
  ],
  related_prs: ['7536'],
  affected_components: ['solomon-advisory', 'session_coordination reply resolver', 'coordinator CC path'],
  tags: ['bugfix', 'coordinator', 'solomon-advisory', 'reply-cc', 'mutation-testing', 'adversarial-review'],

  unnecessary_work_identified: [],
  protocol_improvements: null
};

(async () => {
  const { data: existing, error: existingErr } = await supabase
    .from('retrospectives')
    .select('id, created_at')
    .eq('sd_id', SD_UUID)
    .eq('retro_type', 'SD_COMPLETION')
    .limit(5);

  if (existingErr) {
    console.error('Error checking existing retrospectives:', existingErr.message);
    process.exit(1);
  }

  if (existing && existing.length > 0) {
    console.log(`Found ${existing.length} existing SD_COMPLETION retrospective(s) for ${SD_KEY}:`);
    existing.forEach(r => console.log(`  - ${r.id} (created_at: ${r.created_at})`));
    console.log('Proceeding to insert a new one anyway -- the existing row predates the LEAD-TO-PLAN acceptance ' +
      'timestamp (a handoff-time retro) and does not satisfy the PLAN-TO-LEAD RETROSPECTIVE_QUALITY_GATE cutoff.');
  }

  const { data, error } = await supabase
    .from('retrospectives')
    .insert(row)
    .select('id, sd_id, retro_type, title, created_at, quality_score, status')
    .single();

  if (error) {
    console.error('Insert failed:', error);
    process.exit(1);
  }

  console.log('Inserted retrospective:');
  console.log(JSON.stringify(data, null, 2));
})();
