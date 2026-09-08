#!/usr/bin/env node
// Records the PLAN-TO-EXEC TESTING evidence for child -J, transcribing testing-agent
// aa363409899c1c035's strategy-only review (38 tool uses), and folds the corrections into
// metadata.lead_design_notes.exec_time_conditions_from_testing_review for EXEC to follow.
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { getSupabaseClient } from '../lib/sub-agent-executor/supabase-client.js';

const SD_KEY = 'SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-J';

async function main() {
  const db = await getSupabaseClient();
  const resolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: null, subAgentCode: 'TESTING', supabase: db });

  const results = {
    verdict: 'WARNING',
    confidence: 78,
    summary: "Strategy-only pre-EXEC review (testing-agent:aa363409899c1c035, 38 tool uses) of the 10 PRD test_scenarios, nothing built yet. Found the two highest-severity issues before EXEC: (1) FR-4 (youtube-digest) is DEAD-BY-CONSTRUCTION as scoped -- FR-5's import path only populates a rule's rule_json from an explicit 'json: {...}' directive line, and no youtube-domain vocabulary was defined, so real youtube.md rules would import with rule_json=null, the feeder would scan zero channels, report 'ok', and lock the whole ET day via feeder.mjs's already_ok inert-reason logic; (2) FR-1's 4 new table shapes are internally contradictory and match child B's real precedent (surrogate UUID PK + natural-key UNIQUE INDEX) in NEITHER direction, making the natural key non-unique and the shape untestable against the existing migration-shape test's regex. Also found the PRD named the WRONG eva_* tables for the cross-role boundary (eva_youtube_config/scans are archived; the live ones are eva_youtube_intake/eva_youtube_scores), a load-bearing seat-rung-ordering test gap in FR-7 that mirrors a documented historical near-miss in the Adam precedent, 4 existing exact-census tests that go red by construction and must be updated (never weakened), and missing retention/DDL-tier-registration/staging-dedupe coverage. All corrections folded into EXEC guidance below.",
    findings: [
      "CRITICAL (G1-G3): FR-4/FR-5 define no youtube-domain rule_json vocabulary; parseRuleFile only sets rule_json from an explicit json: directive, so real rules import with rule_json=null -- youtube-digest would scan zero channels, report ok, and feeder.mjs's already_ok inert-reason locks the entire ET day on the first empty run. FR-5 must define the vocabulary explicitly; a null-rule_json case must yield a named refusal or degraded, never ok.",
      "CRITICAL (B1-B5): FR-1's table shapes (natural-key-as-PRIMARY-KEY) match neither of child B's two real precedent shapes (single-date tables use id UUID PK + UNIQUE(et_date); composite-key tables use id UUID PK + UNIQUE(et_date, natural_col)) -- both existing shapes must be surrogate-keyed, never natural-key-as-PK, or reruns duplicate rows with no conflict target",
      "D1: the PRD named the wrong eva_* tables -- eva_youtube_config/eva_youtube_scans are archived code; the live tables are eva_youtube_intake and eva_youtube_scores. A grep for the two named literals passes trivially while a real cross-role read of eva_youtube_intake sails through. Boundary check must be a broad /\\beva_[a-z_]+/ pattern with zero matches, plus a behavioral allow-list-equality test (recorded table set exactly {michael_rules, michael_feeder_runs, michael_staged_items}), plus a positive control proving the michael_rules row actually drives the channel list (not just that eva tables weren't touched)",
      "E1-E5: lib/michael/constants.mjs constants are registry entries {required, default, parse, max} resolved at call time via resolveConstants(names, env), not simple module constants -- both new Drive folder constants must be required:true with no default; CONSTANT_MISSING refusal (exit 2, no run entered) needs its own test; assertHostVenue must run FIRST (before runFeeder is ever entered), exactly like tasks-classifier.mjs -- calling it inside run() instead converts a GHA misfire into a 'failed' run row that inflates the chairman-facing quiet-tick gauge",
      "F1-F5: lib/michael/feeder.test.js's FEEDER_IDS census is EXACT-ORDER equality (7 ids today) -- adding 3 entries makes it red by construction; the census must be UPDATED (new ids in declared position, corrected it()-title) never weakened to toContain/arrayContaining. Each new feeder needs an explicit window/intervalMinutes respecting the documented 'every feeder window ends on a fire minute' invariant (feeder.mjs:13-15,36-37), which is asserted nowhere today -- add one registry-invariant property test over all FEEDER_IDS. Neither new feeder goes into READINESS_REQUIREMENTS.",
      "C1-C8 (FR-7/michaelLines): TS-7 as originally scoped is satisfiable by a decide()-only test, which is exactly the gap this hook's own Adam precedent documents having missed twice historically (once by a drop-the-call mutation, once specified and never implemented). Must split into TS-7a (seat-rung PLACEMENT via decide(), with a guard-the-guard assertion that verdictFromMetadata still resolves ROLE for a Michael seat) and TS-7b (orient() WIRING, with an injected fetchBrief fake proving it IS called for a Michael seat and is NOT called for any other seat, including a coordinator-flagged Michael seat which must resolve to COORDINATOR lines, not Michael lines). Additional required coverage: a negative arm (michael_retired/solomon/adam/worker/SOLO/coordinator all show no Michael line even when a lede is supplied), a phantom-column test parsing the real migration DDL (michael_brief_runs.data_json exists; no headline column does), scoping the brief read to et_date=today not just latest-row (the seat's 04:30-07:30 window overlaps brief-assemble's 05:15-06:00 window, so a naive latest-row read serves yesterday's lede for the first 45+ minutes), respecting the verified flag, sanitizing both \\r and \\n plus preventing a literal '[ROLE] ' prefix from forging a doctrine line, and naming the ~6 files that already regression-pin this hook so a second read doesn't disturb them.",
      "G5: the 2 more personal tables (michael_health_daily, michael_check_in_journal) need an explicit retention posture -- neither RETENTION_TARGETS nor NEVER_TOUCHED in scripts/michael/retention.mjs would include them by default, and no existing census would go red to catch the omission; retention.test.js's own census must be extended.",
      "G6: the DDL tier (.github/workflows/drive-reports-ddl.yml) lists migration paths LITERALLY -- the new migration/DOWN/ddl-test files must be added to that literal list and to michael-retention-wiring.test.js's census, or the tier silently never runs against them.",
      "G-staging: michael_staged_items has no natural-key unique index -- youtube_pick staging needs its own dedupe_key/sha payload shape and an open-row pre-read (mirroring tasks-classifier.mjs's own staged-item dedup pattern), plus adding youtube_pick to retention.mjs's payload-emptying kinds list, plus a title-length bound (untrusted third-party RSS content).",
      "G9: TS-6's diff-scoped grep only guards this one PR -- add a durable exact-array assertion on chairman-oauth.js's SCOPES (toEqual, not just absence-of-diff), and widen the write-surface pattern beyond playlists.insert/playlistItems.insert to catch a raw non-GET fetch to googleapis.com/youtube/v3 or a google.youtube( client construction, while confirming it doesn't false-positive on subscription-scanner.js's legitimate GET to youtube.com/feeds/videos.xml.",
      "G10: per import-cowork-memory.mjs's own stated convention (never hardcode the _Cowork literal), FR-8 should default to introducing NO new _Cowork string at all (name any test fixture without the literal word) rather than pre-adding an allow-list entry speculatively."
    ],
    metadata: {
      recorded_by: 'scripts one-off transcription (michael-j-plan-testing-record.mjs), family pattern established at children E/F/G/H/I',
      producer_note: 'Transcribes the independent findings of Task-tool testing-agent aa363409899c1c035, a 38-tool-use strategy review that traced every PRD claim against the actual shipped code (lib/michael/feeder.mjs, lib/michael/constants.mjs, scripts/hooks/session-role-orient.cjs, the real migration precedent, and the actual live eva_* table names) rather than the PRD text at face value.'
    }
  };
  applySubAgentRepoVerdict(results, resolution);
  const stored = await storeSubAgentResults('TESTING', SD_KEY, null, results, { phase: 'PLAN' });
  console.log('TESTING evidence stored:', stored.id);

  const { data: sd } = await db.from('strategic_directives_v2').select('metadata').eq('sd_key', SD_KEY).single();
  const metadata = {
    ...(sd.metadata || {}),
    lead_design_notes: {
      ...(sd.metadata?.lead_design_notes || {}),
      exec_time_conditions_from_testing_review: {
        source: 'testing-agent:aa363409899c1c035 PLAN-TO-EXEC review',
        must_do: [
          "FR-1: ALL 4 new tables use surrogate id UUID PK DEFAULT gen_random_uuid() + a natural-key UNIQUE INDEX (never natural-key-as-PRIMARY-KEY), matching child B's real precedent exactly for both the single-ET-date shape (michael_feedback_ledger/michael_brief_runs pattern) and the composite-key shape (michael_calendar_day/michael_feeder_runs pattern)",
          "FR-5: define the youtube-domain rule_json vocabulary explicitly (e.g. {channel_id, channel_name} per rule) in the youtube.md import; FR-4 must treat a youtube rule with rule_json=null as a named refusal or degraded outcome, NEVER a silent ok -- this is the single highest-risk item in the whole child",
          "FR-4: the cross-role boundary check is a broad /\\beva_[a-z_]+/ grep with zero matches (not the two specific, actually-archived table names the PRD cited), PLUS a behavioral test asserting the exact recorded table-access set {michael_rules, michael_feeder_runs, michael_staged_items}, PLUS a positive control proving a real michael_rules youtube row actually drives the scanned channel list",
          "FR-2/FR-3: register both Drive folder IDs in lib/michael/constants.mjs's MICHAEL_CONSTANTS registry as required:true with no default (never a bare module constant); test the CONSTANT_MISSING refusal (exit 2, zero Drive/DB calls made); assertHostVenue(env) must run FIRST, before runFeeder is ever entered, exactly like tasks-classifier.mjs -- never inside run() itself",
          "feeder.mjs's FEEDER_IDS census test must be UPDATED (exact-order equality preserved, corrected count/title), never weakened to a loose containment check; each new feeder needs explicit window/intervalMinutes satisfying the documented window-ends-on-a-fire-minute invariant; add one new registry-invariant property test over all entries; neither new feeder joins READINESS_REQUIREMENTS",
          "FR-7 (michaelLines): split into a placement test (decide()) and a SEPARATE wiring test (orient() with an injected fetchBrief fake proving it's actually called for a Michael seat and NOT for any other seat, including a coordinator-flagged Michael seat which must show COORDINATOR lines) -- a decide()-only test is insufficient, this exact gap has bitten the Adam precedent twice before",
          "FR-7: scope the brief read to et_date=today (not a bare latest-row read) since the seat's window overlaps brief-assemble's own window; respect michael_brief_runs.verified; sanitize both \\r and \\n and strip/neutralize a literal '[ROLE] ' prefix in the lede before injection; add a phantom-column test parsing the real migration DDL",
          "Add michael_health_daily and michael_check_in_journal to scripts/michael/retention.mjs's RETENTION_TARGETS or NEVER_TOUCHED explicitly, and extend retention.test.js's own census accordingly",
          "Add the new migration/_DOWN/ddl-test file paths to .github/workflows/drive-reports-ddl.yml's literal path list and to tests/unit/cron/michael-retention-wiring.test.js's census, or the DDL tier never runs against them",
          "youtube_pick staged items need their own dedupe_key/sha payload shape with an open-row pre-read (mirror tasks-classifier.mjs's own staged-item dedup pattern) plus a title-length bound; add youtube_pick to retention.mjs's payload-emptying kinds list",
          "TS-6 needs a durable toEqual assertion on chairman-oauth.js's SCOPES array (not just a diff-scoped grep) plus a widened write-surface pattern (raw non-GET fetch to googleapis.com/youtube/v3, or google.youtube( construction) that doesn't false-positive on subscription-scanner.js's legitimate GET",
          "Default to introducing NO new _Cowork literal string anywhere in this SD (name fixtures without the literal word) rather than pre-adding a cowork-retirement-grep.mjs allow-list entry"
        ]
      }
    }
  };
  const { error } = await db.from('strategic_directives_v2').update({ metadata }).eq('sd_key', SD_KEY);
  if (error) throw error;
  console.log('EXEC-time conditions folded into metadata.lead_design_notes.');
}

main();
