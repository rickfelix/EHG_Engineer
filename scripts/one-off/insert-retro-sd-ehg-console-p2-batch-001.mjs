#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SD_UUID = 'b8ed8441-fac3-459d-be0a-8f3b2ad1b576';
const SD_KEY = 'SD-EHG-CONSOLE-P2-BATCH-001';

const retro = {
  sd_id: SD_UUID,
  retro_type: 'SD_COMPLETION',
  retrospective_type: null,
  learning_category: 'PROCESS_IMPROVEMENT',
  target_application: 'EHG',
  generated_by: 'MANUAL',
  status: 'PUBLISHED',
  quality_score: 90,
  title: `Retrospective: ${SD_KEY} — Closing the Console P2 Tier`,
  description:
    'Enumeration-scoped batch closing the 8 P2-severity findings (#11-#18) from the chairman-commissioned console assessment ledger (docs/audit/ehg-console-assessment-ledger.md, PR #5828 in EHG_Engineer, an open-but-treated-as-ratified living audit document — the same pattern already established by the 6 shipped P1-tier SDs in the same fix_cohort). Each finding closed with an inline code citation back to its ledger row. Two findings turned out to be partially superseded by prior work in the same cohort, discovered only by live-verifying against current code rather than trusting the ledger text: finding #11\'s "fabricated Minimal/Score:0" half was already fixed by SD-EHG-CONSOLE-BLOCKING-SIGNALS-HONEST-001 (only the shell-exit navigate() target needed fixing), and finding #15\'s "unreachable routes" gained an interim Cmd+K-only access path from SD-EHG-CONSOLE-CMDK-INDEX-001 whose own code comment explicitly named this SD as the follow-up for permanent nav placement. Finding #16\'s fix built directly on SD-EHG-CONSOLE-QUEUE-POLLUTION-001\'s DB-side migration, extending its name-pattern exclusion regex to the client-side ventures.applyVentureVisibility() SSOT that the DB migration never touched. The implementation surfaced and fixed three genuine pre-existing test-infrastructure gaps as a byproduct (a global react-router-dom test mock missing a Link export, a fake Supabase query builder mock missing .not(), and a drift-tripwire test whose own comment already anticipated needing an update once finding #15 shipped) while leaving one confirmed-pre-existing, unrelated test failure untouched (a /chairman/decisions/excluded palette gap predating this branch). VALIDATION and REGRESSION sub-agents both independently re-verified every claim against live code rather than trusting the handoff summary, including re-running the pre-existing-failure git-stash comparison themselves.',
  affected_components: [
    'src/components/chairman-v3/AttentionQueueSidebar.tsx',
    'src/components/chairman-v3/batch-review/BatchReviewDashboard.tsx',
    'src/components/chairman-v3/BriefingDashboard.tsx',
    'src/components/chairman-v3/TokenBudgetBar.tsx',
    'src/components/chairman-v3/shell/chairman-nav-config.ts',
    'src/components/eva-chat/EVAChatPanel.tsx',
    'src/components/friday-meeting/FridayWaitingRoom.tsx',
    'src/components/ventures/unified/VentureNavControls.tsx',
    'src/data/chairmanPaletteIndex.ts',
    'src/hooks/useChairmanDashboardData.ts',
    'src/lib/fixtures/ventureVisibility.ts',
    'src/pages/chairman-v3/StagePage.tsx',
    'src/pages/chairman-v3/EVAChatPage.tsx',
    'src/pages/chairman-v3/FridayMeetingPage.tsx',
    'supabase/functions/friday-meeting-data/index.ts',
    'tests/setup.ts',
  ],
  what_went_well: [
    'Read the full ledger before writing the PRD, then live-verified every one of the 8 P2 findings against current code via a dedicated Explore investigation rather than trusting the ledger text — this caught that finding #16 was only partially superseded (DB-side fixed by QUEUE-POLLUTION-001, client-side gap remained) and that finding #15 already had an interim access path from CMDK-INDEX-001 whose own comment named this SD as the intended follow-up, letting the PRD cite the exact prior-work relationship instead of re-deriving it blind.',
    'Reused existing infrastructure aggressively instead of inventing new patterns: FR-4\'s "real stage content" requirement was fully satisfiable via the pre-existing useStageDisplayData hook + StageContentFallback component (built for the inline venture-detail drilldown, previously unused by the standalone StagePage route) — zero new backend plumbing needed. FR-3/FR-8\'s degraded-state indicators reused DataSourceBadge and the existing model_used="fallback" marker that was already being persisted to the DB but never rendered.',
    'When the full test suite showed 57 failed files, did not assume that meant 57 regressions — ran a git-stash-based baseline comparison FIRST, which revealed 58 failed files already existed on origin/main before this SD touched anything. This let effort focus on the handful of failures actually caused by this SD\'s additive changes (a shared SSOT helper gaining a new chained filter, a nav-config array gaining new entries) rather than either ignoring real regressions or wasting the session trying to fix unrelated pre-existing breakage.',
    'Fixed the 3 test-infrastructure gaps this diff surfaced (missing Link mock, missing .not() in a fake query builder, a stale drift-tripwire assertion) as part of the same PR rather than working around them or leaving them broken — including one test (chairman-palette-index.test.tsx) whose own inline comment had explicitly pre-written the exact update needed ("if one gains nav placement in the P2 batch, move it out of NON_NAV_PALETTE_ENTRIES").',
    'Both VALIDATION and REGRESSION sub-agents independently re-ran the git-stash pre-existing-failure comparison themselves rather than accepting the EXEC-phase claim at face value, and both arrived at the same conclusion via independent methodology — strong convergent evidence rather than a single unverified assertion carried through the pipeline.',
  ],
  what_needs_improvement: [
    'The chairman console assessment ledger lives on an open-but-never-merged PR (#5828, opened 2026-07-10, still zero reviews at time of this SD) rather than a merged, citable commit on main. This works in practice because the fleet treats "chairman-ratified" as established by the coordinator\'s dispatch_rank mechanism and the P1 cohort precedent rather than the PR\'s merge state, but a genuinely new session without that context could reasonably read "PR still open, zero reviews" as a blocker rather than the intended pattern — the ledger\'s own header ("Status: Chairman review pending") reads more cautiously than how the fleet is actually treating it 6+ SDs deep into the cohort.',
    'Finding #16\'s fix (client-side ventures.applyVentureVisibility()) and the DB migration it mirrors (20260710190000) keep their exclusion regex in sync only by code comment citation, not shared code — a future change to one without updating the other would silently drift. A shared constant (even just the regex string, exported from one side and imported by the other, or a small shared config file) would make this a compile-time-enforced invariant instead of a documentation promise.',
  ],
  action_items: [
    {
      title: 'Add /chairman/decisions/excluded to the Cmd+K palette index',
      description: 'Pre-existing, unrelated gap confirmed via git-stash comparison at both PLAN_VERIFICATION and EXEC: the route is declared in chairmanRoutesV3.tsx but missing from chairmanPaletteIndex.ts, failing the drift-tripwire test. Predates this SD (introduced by SD-EHG-CONSOLE-QUEUE-POLLUTION-001\'s commit 77d3b8e5) — small, isolated fix for a future QF.',
      priority: 'low',
      owner_role: 'operator',
    },
    {
      title: 'Nav-consistency follow-up: BriefingDashboard\'s Active Ventures card navigates to legacy /ventures',
      description: 'VALIDATION sub-agent found src/components/chairman-v3/BriefingDashboard.tsx:262 still navigates to standalone /ventures (exits ChairmanShell), same defect class as findings #11/#14 but not itself one of the 8 P2 rows and therefore out of this enumeration-scoped SD\'s boundary. Worth a small follow-up QF given the pattern is now well-established (fix -> /chairman/ventures/...).',
      priority: 'low',
      owner_role: 'operator',
    },
    {
      title: 'Share the fixture-name exclusion regex between the DB migration and the client-side SSOT',
      description: 'ventureVisibility.ts\'s VENTURE_FIXTURE_NAME_PATTERN and migration 20260710190000\'s inline regex must currently be kept in sync by comment citation only. Consider extracting to one shared source (e.g. a small config/constants module both a build script and the migration template could read) so drift is caught at build/lint time rather than relying on developers noticing the comment.',
      priority: 'low',
      owner_role: 'PLAN',
    },
  ],
  key_learnings: [
    'Before treating a large "N test files failed" number as a regression signal, run the same suite against the pre-change baseline (git stash + rerun) — a codebase can carry substantial pre-existing test-infrastructure breakage unrelated to the current diff, and without a baseline comparison, an enumeration-scoped SD could either falsely block on unrelated failures or (worse) silently ship real regressions hidden inside a sea of pre-existing noise.',
    'When a shared SSOT helper function (used by 5+ call sites) gains a new chained method call, the call sites don\'t need individual verification if the helper\'s TypeScript signature is generic over an interface that requires the new method (`Q extends VentureVisibilityFilterable<Q>` requiring `.not()`) — the type system itself proves every caller\'s builder supports the new call, turning a runtime risk into a compile-time guarantee.',
    'An in-code comment left by a prior SD that explicitly anticipates a future change ("palette reachability is their interim access path until the P2 nav batch places them properly") is a reliable, load-bearing signal for scoping the next SD correctly — treat such comments as part of the spec, not just documentation, and update the tests that encode the OLD state (which may have equally explicit comments anticipating their own update) as part of delivering the anticipated change.',
    'A living audit document that sits on an open, unmerged, zero-review PR can still function as the de facto ratified spec for a multi-SD fix cohort, once enough of the cohort has shipped against it under the same coordinator dispatch mechanism — the PR\'s formal merge/review state and its actual operational authority can diverge, and recognizing an established pattern (6 shipped P1 siblings) is stronger evidence than the PR\'s literal git state.',
  ],
  metadata: {
    sd_key: SD_KEY,
    source: 'manual_insert',
    pr_reference: 'PR #754 (rickfelix/ehg)',
    ledger_reference: 'EHG_Engineer PR #5828, docs/audit/ehg-console-assessment-ledger.md, findings #11-#18',
    fix_cohort: 'console-fixset-20260710',
  },
};

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data: existing } = await supabase
  .from('retrospectives')
  .select('id')
  .eq('sd_id', SD_UUID)
  .eq('title', retro.title)
  .maybeSingle();

if (existing) {
  console.log(`[insert-retro] Already exists: ${existing.id} — skipping (idempotent no-op).`);
  process.exit(0);
}

const { data: inserted, error: insertErr } = await supabase
  .from('retrospectives')
  .insert(retro)
  .select('id, quality_score')
  .single();

if (insertErr) {
  console.error('[insert-retro] Insert failed:', insertErr.message);
  process.exit(1);
}

console.log(`[insert-retro] Inserted retrospective ${inserted.id} (initial quality_score=${inserted.quality_score})`);

if (inserted.quality_score !== retro.quality_score) {
  console.log(`[insert-retro] DB trigger computed quality_score=${inserted.quality_score} (target was ${retro.quality_score}) — keeping trigger's value, no correction needed.`);
}
