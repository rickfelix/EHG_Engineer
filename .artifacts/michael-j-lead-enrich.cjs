#!/usr/bin/env node
// LEAD-phase enrichment for SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-J, citing validation-agent
// ae76f23ee981fae64's investigation (54 tool uses, extensive file:line citations).
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_KEY = 'SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-J';

async function main() {
  const { data: sd, error: fetchErr } = await supabase.from('strategic_directives_v2')
    .select('metadata').eq('sd_key', SD_KEY).single();
  if (fetchErr) throw fetchErr;

  const key_changes = [
    {
      change: "v1.1 migration database/migrations/<date>_michael_v1_1_tables.sql adds michael_oracle_history, michael_oracle_alignment, michael_health_daily, michael_check_in_journal, following child B's ACTUAL shipped pattern (database/migrations/20260906_michael_tables.sql) -- not the spec's own mis-cited template (docs/michael/02-SPEC.md:47 names 20260830_commitments_table.sql, which validation confirmed has no DO $verify$ block; the real precedent is child B's own migration). Same DO $verify$ block, service_role-only RLS policy named <table>_service_role, REVOKE ALL from anon/authenticated/PUBLIC, updated_at trigger reusing the existing public.michael_set_updated_at() function (never re-created), @chairman-gated header with no @approved-by until chairman sign-off. Natural keys and columns are invented by this PRD since the spec (docs/michael/02-SPEC.md:64) gives zero column detail for any of the four tables -- documented explicitly as a first-cut schema, minimal and extensible.",
      impact: "Matches the real, live-verified migration convention every other Michael table follows rather than a spec citation that validation confirmed is factually wrong about its own named file, avoiding a migration that would fail the DDL tier's idempotence/verify-block expectations."
    },
    {
      change: "oracle-extract and health-sync feeders are added to lib/michael/feeder.mjs's frozen FEEDERS registry (:26-39) as host-venue Drive-read feeders, modeled directly on scripts/michael/tasks-classifier.mjs's shipped shape (exported runX({sb, argv, now, auth, drive, env}), assertHostVenue() first, dry-run by default via runFeeder's dryRun:!apply, each with its own MICHAEL_*_DRIVE_FOLDER_ID constant passed as folderId to the existing read-only listDriveFiles/readDriveFileText). Neither is added to feeder.mjs's READINESS_REQUIREMENTS (enrichment feeders, not brief-blocking) and neither declares an upstream requirement (no v1 feeder dependency).",
      impact: "Reuses the exact shipped feeder contract (not the spec's stale main(argv,deps) description) and the existing read-only Drive scope with zero new credential surface, while keeping brief-assembly independent of two new, unproven feeders."
    },
    {
      change: "youtube-digest reuses lib/integrations/youtube/subscription-scanner.js's scanSubscriptions() directly (confirmed credential-free: pure public RSS/Atom feed reads, zero API quota, zero OAuth) with a Michael-OWNED channel list sourced from a new youtube.md rules import (domain='youtube', a channel row per rule) -- never reading EVA's eva_youtube_config/eva_youtube_scans tables, which would be a cross-role DB read this program's own posture doc (CLAUDE_MICHAEL.md:72, 'EVA is not touched') forbids. Resolves a real ambiguity in the spec's own wording (docs/michael/02-SPEC.md:121 conflates 'reuse the module' with 'read EVA's output' as if they were the same thing).",
      impact: "Delivers the v1.1 feeder's real function (finding new subscription videos) using the safe, already-credential-free half of the precedent, without inventing a new cross-role coupling the spec's Q6 disposition (EVA owns the scanner registry row) never actually authorized for data access, only for registry ownership."
    },
    {
      change: "youtube.md rules import: adds 'youtube.md': 'rules' to scripts/michael/import-cowork-memory.mjs's SOURCE_FILES map (:45-54) -- a near-zero-diff addition, since lib/michael/cowork-parse.mjs's shared parseRuleFile already recognizes the 'youtube' domain (RULE_DOMAINS already includes it) and michael_rules.domain's CHECK constraint (child B's migration) already admits 'youtube'. Fixes a real sequencing hazard validation found: child I's (already-shipped) retire-cowork.mjs will eventually delete the _Cowork folder this import reads from -- since child I's own fourteen-morning window has NOT elapsed (confirmed: zero michael_feeder_runs/michael_brief_runs rows exist), no live deletion is imminent, but this PRD's smoke tests and documentation explicitly flag that this import must run (or be run from I's archived zip) before any future --apply-deletion.",
      impact: "Closes the deferred-from-child-F gap with the smallest possible change, reusing 100% of the existing parse/write machinery, and surfaces (rather than silently risks) the ordering hazard with sibling child I for whoever eventually runs the live retirement."
    },
    {
      change: "'[Michael] Picks' playlist: youtube-digest STAGES picks to michael_staged_items (kind='youtube_pick') rather than writing to a live YouTube playlist. Validation confirmed a live playlist write requires OAuth scope 'https://www.googleapis.com/auth/youtube' (lib/integrations/youtube/oauth-manager.js:28), which is NOT in Michael's chairman OAuth grant (lib/integrations/google/chairman-oauth.js:23-27 -- gmail.modify, calendar.readonly, drive.readonly only) and widening it would invalidate the current stored grant and force a full host re-consent (hasRequiredScopes requires every SCOPES entry present). This SD does not widen that scope or add a new live write capability -- matching sibling child I's own explicit precedent of never widening OAuth scope inside a retirement/enrichment child.",
      impact: "Delivers a real, usable mechanism (staged picks the chairman/seat can review and place manually, or a future SD can wire to a live write with a deliberate, reviewed scope change) without silently taking on new, out-of-scope security surface inside what the spec itself scoped as an enrichment feeder child."
    },
    {
      change: "michaelLines() variant added to scripts/hooks/session-role-orient.cjs, modeled on the existing adamLines() (:153-163) and its exact SEAT/resolveSeat precedence pattern (:307-355, :356-363). A new SEAT.MICHAEL member and isMichaelSeat(meta) predicate (exact role-string equality, mirroring isAdamSeat's own documented exact-equality requirement at :117-129) are placed in resolveSeat BEFORE the generic ROLE-verdict fallthrough (:381-382) -- validation found this ordering is load-bearing: lib/fleet/role-status-identity.cjs already registers a 'michael' callsign, so a Michael seat already satisfies the broad ROLE rung today, meaning a naively-appended Michael-specific rung placed AFTER it would be unreachable dead code that tests green without ever firing. The injected 'day's brief headline' is michael_brief_runs.data_json.lede (lib/michael/brief-model.mjs), read via real, existing columns only (never a phantom column, echoing the documented fetchDriveReport lesson at session-role-orient.cjs:187-195 about a 400 on a nonexistent column silently killing the entire read forever), newline-stripped and length-bounded before injection since it lands in a seat's SessionStart context.",
      impact: "Ships the spec-named v1.1 hook variant using the exact structural precedent already proven safe for Adam, and specifically avoids the two concrete failure modes validation found in that precedent (a shadowed/unreachable seat rung, and a phantom-column read that silently and permanently returns null)."
    }
  ];

  const success_criteria = [
    { criterion: "v1.1 migration ships @chairman-gated (no @approved-by), matches child B's real verify-block/RLS/trigger pattern exactly", measure: "the DDL tier's own idempotence check (apply-twice) and a source-pinned unit test on the migration file's structure both pass" },
    { criterion: "oracle-extract and health-sync are registered in feeder.mjs's FEEDERS map, dry-run by default, never added to READINESS_REQUIREMENTS", measure: "unit tests assert both feeders are dry-run-safe (zero real Drive calls without --apply) and that READINESS_REQUIREMENTS is unchanged" },
    { criterion: "youtube-digest never reads any eva_* table; channel list comes only from michael_rules domain='youtube' rows", measure: "grep confirms zero eva_youtube_config/eva_youtube_scans references anywhere in the new code; a unit test mocks a michael_rules youtube row and asserts it drives the channel list" },
    { criterion: "youtube.md imports via the existing import-cowork-memory.mjs machinery with zero new parse logic", measure: "a unit test adds a fixture youtube.md and confirms it round-trips through the existing parseRuleFile/writeRule path" },
    { criterion: "No new file in this SD introduces a live YouTube playlist write or widens the chairman OAuth SCOPES array", measure: "grep confirms zero playlists.insert/playlistItems.insert calls and zero SCOPES array edits anywhere in the diff" },
    { criterion: "michaelLines() only fires for an exact-equality Michael seat, placed correctly ahead of the generic ROLE fallthrough, and the injected headline is escaped/length-bounded", measure: "a unit test drives decide()/orient() end-to-end (not michaelLines() in isolation) with a Michael seat and asserts the Michael-specific line actually renders, distinct from generic roleLines('michael')" }
  ];

  const success_metrics = [
    { metric: "No live host/OAuth/playlist-write action taken during this SD's build", target: "the migration ships unapplied (chairman-gated), host tasks are not registered, no OAuth re-consent occurs, and no live playlist write is attempted anywhere in the new code or tests" },
    { metric: "Cross-role boundary respected", target: "zero reads or writes to any eva_* table anywhere in the new code, verified by grep" },
    { metric: "michaelLines() reachability", target: "the new Michael-specific seat rung is proven to actually fire (not shadowed by the pre-existing generic ROLE rung) via an end-to-end decide()/orient() test, not a unit test of michaelLines() called directly" }
  ];

  const smoke_test_steps = [
    { step_number: 1, instruction: "node scripts/apply-migration.js --dry-run database/migrations/<date>_michael_v1_1_tables.sql (or the repo's equivalent DDL-tier dry-run check)", expected_outcome: "Migration is well-formed and chairman-gated; no live apply" },
    { step_number: 2, instruction: "npm run test:unit -- lib/michael/feeder.test.js", expected_outcome: "Still 100% green after the FEEDERS registry additions -- proves the shared v1 file wasn't broken" },
    { step_number: 3, instruction: "npm run test:unit -- scripts/michael/oracle-extract.test.js scripts/michael/health-sync.test.js scripts/michael/youtube-digest.test.js", expected_outcome: "All new feeder tests pass, all mocked, zero real host/Drive/YouTube calls" },
    { step_number: 4, instruction: "grep -rn 'eva_youtube' scripts/michael lib/michael", expected_outcome: "Zero hits -- confirms the cross-role boundary was never crossed" },
    { step_number: 5, instruction: "npm run test:unit -- tests/unit/michael-cowork-retirement-grep.test.js", expected_outcome: "Still passes after any new files reference _Cowork (via the youtube.md import path) -- proves child I's allow-list was updated correctly" }
  ];

  const mechanism_verifications = [
    { verified_by: 'validation-agent:ae76f23ee981fae64', verified_at: 'database/migrations/20260906_michael_tables.sql:49', note: 'confirmed the real, shipped migration table pattern (not the spec\'s mis-cited 20260830 template)' },
    { verified_by: 'validation-agent:ae76f23ee981fae64', verified_at: 'scripts/michael/tasks-classifier.mjs:141', note: 'confirmed the real shipped feeder export shape runX({sb, argv, now, auth, drive, env}), not the spec\'s stale main(argv, deps) description' },
    { verified_by: 'validation-agent:ae76f23ee981fae64', verified_at: 'lib/michael/feeder.mjs:26', note: 'confirmed FEEDERS is a frozen registry requiring edits for any new feeder id, and READINESS_REQUIREMENTS at :42 must not include enrichment feeders' },
    { verified_by: 'validation-agent:ae76f23ee981fae64', verified_at: 'lib/integrations/youtube/subscription-scanner.js:18', note: 'confirmed scanSubscriptions is pure public RSS, zero credential, but sources its channel list from the caller -- not from itself' },
    { verified_by: 'validation-agent:ae76f23ee981fae64', verified_at: 'lib/integrations/google/chairman-oauth.js:23', note: 'confirmed the chairman OAuth SCOPES array does not include youtube -- a live playlist write is out of reach without a re-consent-triggering scope change' },
    { verified_by: 'validation-agent:ae76f23ee981fae64', verified_at: 'scripts/michael/import-cowork-memory.mjs:45', note: 'confirmed youtube.md is absent from SOURCE_FILES and RULE_DOMAINS/the domain CHECK already admit youtube -- a near-zero-diff addition' },
    { verified_by: 'validation-agent:ae76f23ee981fae64', verified_at: 'scripts/hooks/session-role-orient.cjs:381', note: 'confirmed the resolveSeat rung ordering hazard -- a naive Michael rung placed after the existing ROLE fallthrough would be unreachable dead code' },
    { verified_by: 'validation-agent:ae76f23ee981fae64', verified_at: 'lib/michael/brief-model.mjs:20', note: 'confirmed the brief headline is data_json.lede, no separate headline column exists' }
  ];

  const metadata = {
    ...(sd.metadata || {}),
    mechanism_verifications,
    lead_design_notes: {
      ...(sd.metadata?.lead_design_notes || {}),
      exec_time_conditions: [
        'v1.1 table columns/natural keys are a first-cut invention (spec gives none) -- document this explicitly in the migration comments, keep minimal and extensible',
        'youtube-digest must NEVER read any eva_* table -- channel list comes only from michael_rules domain=youtube rows sourced by the new youtube.md import',
        'picks are staged (michael_staged_items, kind=youtube_pick), never a live playlist write -- do not add youtube to chairman-oauth.js SCOPES',
        'any new file referencing _Cowork must be added to lib/michael/cowork-retirement-grep.mjs\'s ALLOW_LIST or child I\'s step-5 test goes red',
        'michaelLines() must be tested by driving decide()/orient() end-to-end, never by calling michaelLines() in isolation, to prove the seat rung is actually reachable',
        'oracle-extract/health-sync/youtube-digest must never be added to lib/michael/feeder.mjs READINESS_REQUIREMENTS'
      ]
    }
  };

  const { error } = await supabase.from('strategic_directives_v2').update({
    key_changes, success_criteria, success_metrics, smoke_test_steps, metadata
  }).eq('sd_key', SD_KEY);
  if (error) throw error;
  console.log('SD-J enriched successfully.');
}

main().catch(e => { console.error(e); process.exit(1); });
