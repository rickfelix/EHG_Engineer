#!/usr/bin/env node
/**
 * SD-LEO-INFRA-ARCHITECTURE-PLANS-GET-001 — SECURITY evidence at EXEC-TO-PLAN.
 *
 * Independent security review of the chairman-approval-integrity fix across the
 * eva_architecture_plans write surface (FR-1..FR-6). Verdict CONDITIONAL_PASS: no
 * vulnerability, no regression, no merge blocker -- but two record-accuracy conditions
 * about how completely the approval hole is actually closed.
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-ARCHITECTURE-PLANS-GET-001';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: sdRow, error: sdErr } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
  if (sdErr) throw sdErr;

  const results = {
    verdict: 'CONDITIONAL_PASS',
    confidence: 88,
    phase: 'EXEC-TO-PLAN',
    execution_time_ms: 0,
    summary: "Independent SECURITY review of the eva_architecture_plans approval-integrity fix. NO VULNERABILITY AND NO REGRESSION FOUND: the change is a strict, fail-closed narrowing of the false-approval surface, and every explicit check in the review brief passed. Injection: all new/changed filters use the Supabase query builder's own parameterization (.eq('plan_key', planKey), .eq('status','active'), .not('vision_key','is',null)); a grep of every added line for template-literal or string-concatenation interpolation into .eq/.filter/.or/.not/.in/.like returned zero hits. CLI argument handling: archplan-command.mjs's parseArgs (line 64-75) yields `true` for a bare flag and the literal next token otherwise, so every malformed input I could construct FAILS CLOSED -- `--approved false` is caught by rejectStringFlagValue (typeof string) and hard-errors; `--approved=true` parses to the key 'approved=true', leaving approvedFlag undefined and hitting the mandatory-choice error; `--approved 0` / `--draft 0` coerce falsy and hit the same error; `--approved --draft` both resolve true and hit the both-flags error. I found no input that yields approved:true from an OMITTED decision, which is the only direction that would matter. Trigger bypass: promoteArchPlan uses .update() (not .upsert()), with an .eq('plan_key') filter and a payload restricted to exactly status/chairman_approved/chairman_approved_at, so the real BEFORE UPDATE trigger trg_enforce_archplan_quality_advancement (database/migrations/20260314_quality_checked_enforcement_triggers.sql:82-87, unmodified) fires and its exception is surfaced as reason:'update_failed' rather than swallowed; the diff contains no session_replication_role, no ALTER TABLE ... DISABLE TRIGGER, no .rpc()/exec_sql raw-SQL escape, and no self-created service-role client (the client is injected, so the function cannot escalate its own privilege). promotedBy is never attacker-controlled: promoteArchPlan has NO caller anywhere in the repo, so there is currently no path by which unvalidated user input reaches it. Information disclosure: read_failed/update_failed return error.message (PostgREST/trigger RAISE EXCEPTION text) to an operator who already holds a service-role key -- informational only, not a leak in this internal-tooling threat model; the Self-approval refused warn logs planKey/promotedBy/createdBy, which is appropriate audit detail. The B2 cascade-watcher decoupling is correct and REDUCES the automated-approval surface exactly as intended: Stage 1 now writes approved:false so the cron can no longer stamp chairman_approved=true with no chairman touch, and dropping the chairman_approved filter from Stage 2's readiness query removes a filter that was provably a no-op false positive (archplan-upsert.js hardcoded the column true on every row before this SD); it grants automation nothing new, it only stops automation from lying. Verified DDL-free by RUNNING the check, not by reading it: node scripts/one-off/archplan-no-ddl-check.mjs -> clean, 26 files vs origin/main...HEAD. Ran the 4 security-relevant unit suites -> 38/38 passing, with the self-approval refusal, the quality-trigger rejection, and all three CLI flag errors observed in the actual log output. A secrets scan of every added line (JWT/sk-/ghp_/password=/api_key=) returned zero hits. POSITIVE DOWNSTREAM EFFECT worth recording: lib/eva/bridge/trust-elevation.js:57-62 uses chairman_approved on this table as a secondary AND-guard for venture trust-tier elevation -- that limb was a rubber stamp while every row was hardcoded true, and this SD makes it load-bearing for the first time (operators should expect FEWER trust elevations, which is the fail-closed direction). I also audited the two write paths NOT in this SD's scope and cleared both: artifact-persistence-service.js:1461 inserts status:'draft' and never sets chairman_approved, and its sibling .update() at :1432 touches only content/version/addendums; archplan-command.mjs's `addendum` subcommand updates only addendums/content/dimensions/updated_at. Neither can stamp approval. THE TWO CONDITIONS, both record-accuracy rather than merge blockers, are recorded as warnings W1 and W2 below: the claim that promoteArchPlan is the ONLY draft->active path is factually wrong, and the one path that DOES carry the self-approval guard has no entry point.",
    critical_issues: [],
    warnings: [
      "W1 (record accuracy, NOT a regression): promoteArchPlan is NOT the only code path that flips a plan from draft to active/chairman_approved. lib/eva/archplan-upsert.js:140-144 calls .upsert(record, { onConflict: 'plan_key' }), which Postgres executes as INSERT ... ON CONFLICT (plan_key) DO UPDATE -- so `archplan-command.mjs upsert --plan-key <existing-draft-key> --approved` promotes an existing draft row to status:'active', chairman_approved:true while bypassing lib/eva/archplan-promote.js's self-approval guard entirely. This is NOT introduced here (before this SD the same command did it unconditionally and without any flag, so the change is a strict improvement) and it requires a human to type --approved, which is the designed reviewer act. But it means the author/reviewer separation required by ratification a588adba exists ONLY on the promote path, while the dominant path (200/235 = ~85% of live rows per this SD's own LEAD explore evidence) has no such separation. The docblock at archplan-promote.js:3-8 and the SD's completion narrative should be corrected before the approval hole is described as closed; the accurate statement is 'the only path that flips approval WITH an author/reviewer check', not 'the only path that flips approval'. Related second-order effect: the upsert record includes created_by (archplan-upsert.js:130), so a re-upsert OVERWRITES the exact column the self-approval guard reads -- archplan-promote.js:26-29 reasons carefully about never writing created_by for precisely this reason, but an unrelated write path resets it anyway, which is undocumented.",
      "W2 (operational, security-relevant): lib/eva/archplan-promote.js has NO caller anywhere in the repo -- verified by grep across *.js/*.mjs/*.cjs/*.md; the only references are its own tests, two explanatory comments in cascade-watcher.mjs (lines 212, 259), and evidence scripts. scripts/eva/archplan-command.mjs's dispatch (lines 458-462) exposes only extract/upsert/addendum/list, with no `promote` subcommand. Combined with the B2 change, cascade-watcher-originated plans now land as draft while Stage 2 requires status='active', so they are stranded with no shipped way for a reviewer to promote them. The security concern is not the strandedness itself (that is correctly fail-closed) but the shape it creates: the ONLY guarded path is unreachable from the CLI while the UNGUARDED path from W1 is the ergonomic one, which is the standard setup for a control that never gets exercised and gets routed around instead.",
      "W3 (fail-open default for future callers): lib/eva/archplan-upsert.js:15 keeps `approved = true` as the parameter default, so any NEW call site added later that simply forgets the parameter silently writes chairman_approved:true. This SD correctly fixed all 4 known call sites (stage-17 x2, cascade-watcher Stage 1, the CLI), and the default mirrors vision-upsert.js:63 for backward compatibility, which is a defensible consistency argument. But for a field whose entire purpose is attesting to a human decision, the secure default is deny (approved = false, explicit opt-in) -- the backward-compat argument protects callers that no longer exist, since all four were just updated. Note the blast radius is bounded by the quality trigger only on the UPDATE leg: trg_enforce_archplan_quality_advancement is BEFORE UPDATE only (the migration header states 'All enforcement triggers fire on UPDATE only'), so a brand-new plan_key inserted with approved:true is never quality-gated at all.",
    ],
    recommendations: [
      "Correct the 'only code path' language in lib/eva/archplan-promote.js's docblock (lines 3-8) and in this SD's completion record to 'the only path carrying an author/reviewer check', and add a one-line note there that archplan-upsert.js's onConflict upsert also reaches active and also rewrites created_by. This is a documentation fix, not a code change, and does not require reopening EXEC.",
      "File a follow-up (not this SD -- it is out of FR scope) to give promoteArchPlan an entry point, e.g. an `archplan-command.mjs promote --plan-key <k> --promoted-by <seat>` subcommand, so the guarded path is at least as reachable as the unguarded one. Pair it with the deferred approved_by column (FR-6) so promotedBy is recorded on the row rather than only in a log line.",
      "When FR-6's approved_by column lands, flip lib/eva/archplan-upsert.js's `approved` default to false at the same time -- by then every caller passes it explicitly, so the backward-compat rationale for the fail-open default will have fully expired.",
      "Route the CLI's `upsert --approved` leg through the same self-approval check (compare the invoking seat against the existing row's created_by before allowing a conflict-update to set chairman_approved) once a real identity signal exists. Doing it against today's created_by would catch nothing, since ~79% of live rows share the literal 'eva-archplan-command' -- the honest placeholder note already in archplan-promote.js:18-24 applies equally here.",
      "Note for operators in the release record: lib/eva/bridge/trust-elevation.js's chairman_approved AND-guard becomes load-bearing with this change, so newly cascaded ventures will stop auto-elevating to trusted via the arch-plan limb. That is the intended fail-closed direction, but it is a live behavior change outside this SD's stated blast radius.",
    ],
    detailed_analysis: {
      commands_run: [
        'Read in full: lib/eva/archplan-promote.js (103 lines), lib/eva/archplan-upsert.js (147 lines), scripts/eva/archplan-approval-choice.mjs (22 lines)',
        'Read: git diff origin/main...HEAD for scripts/eva/archplan-command.mjs, scripts/cron/cascade-watcher.mjs, lib/eva/stage-templates/analysis-steps/stage-17-doc-generation.js, .claude/commands/brainstorm.md, .claude/skills/eva-archplan.skill.md',
        'Read: database/migrations/20260314_quality_checked_enforcement_triggers.sql in full -- confirmed trg_enforce_archplan_quality_advancement is BEFORE UPDATE FOR EACH ROW, unmodified by this diff, and that the header documents UPDATE-only firing (the INSERT-leg gap noted in W3)',
        'Read: lib/eva/vision-upsert.js rejectStringFlagValue (lines 221-226) -- rejects only typeof string, which I traced against parseArgs to confirm every malformed input still fails closed',
        'Read: scripts/eva/archplan-command.mjs parseArgs (lines 64-75) and the subcommand dispatch (lines 458-462) -- no `promote` subcommand exists',
        'Traced by hand through parseArgs: --approved false / --approved=true / --approved 0 / --draft 0 / --approved --draft / --approved "" -- only the last yields approved:true, and only when the operator explicitly typed --approved (no omission-to-approved path)',
        "grep -rn 'promoteArchPlan|archplan-promote' across *.js/*.mjs/*.cjs/*.md excluding node_modules -> zero production callers (W2 basis)",
        "grep -rn 'upsertArchPlan' excluding tests -> exactly 4 production call sites (CLI, cascade-watcher Stage 1, stage-17 primary + retry), all 4 confirmed passing an explicit approved value in this diff",
        "grep -rn 'eva_architecture_plans' across the repo to find write paths OUTSIDE this SD's scope -> audited lib/eva/artifact-persistence-service.js:1432 (.update, content/version/addendums only) and :1461 (.insert, status:'draft', no chairman_approved) and archplan-command.mjs cmdAddendum (.update, addendums/content/dimensions/updated_at only) -- none can stamp approval, so the SD's write-path coverage is complete for the approval columns",
        'Read lib/eva/bridge/trust-elevation.js:40-80 -- confirmed chairman_approved on this table is a live security AND-guard for venture trust-tier elevation, previously rubber-stamped by the hardcode',
        "git diff origin/main...HEAD | grep '^+' scanned for JWT/sk-/ghp_/password=/api_key=/service_role_key= -> zero hits",
        "git diff origin/main...HEAD | grep '^+' scanned for template-literal or string-concat interpolation into .eq/.filter/.or/.not/.in/.like/.ilike -> zero hits (no injection surface introduced)",
        "git diff origin/main...HEAD scanned for session_replication_role / DISABLE TRIGGER / .rpc( / exec_sql / execute_sql -> zero hits (no trigger-bypass or raw-SQL escape)",
        'RAN node scripts/one-off/archplan-no-ddl-check.mjs -> exit 0, "No DDL/migration files in diff (26 files changed, checked against origin/main...HEAD)"',
        'RAN npx vitest run --project unit lib/eva/__tests__/archplan-promote.test.js lib/eva/__tests__/archplan-upsert.test.js scripts/eva/__tests__/archplan-approval-choice.test.js scripts/eva/__tests__/archplan-command-approval.test.js -> 4 files, 38/38 passed; log output independently confirmed "Self-approval refused", "Cannot set architecture plan status to active: quality_checked is false", and all three CLI flag error strings',
      ],
      threat_model_note: "Internal-tooling threat model: the relevant adversary is a worker/agent seat holding a service-role key and repo CLI access, not an external attacker. Under that model the residual in W1 is meaningful as a GOVERNANCE control gap (a seat can approve its own design via `upsert --approved`), not as an exploitable vulnerability -- there is no privilege boundary being crossed that the seat did not already hold.",
      no_merge_blockers: true,
      regression_check: 'Every residual recorded here (W1/W2/W3) is either pre-existing behavior that this SD strictly narrows, or a deliberate in-scope deferral (FR-6). Nothing in this diff makes the approval surface wider than origin/main.',
    },
    metadata: { independent_verification: true, ratifications_checked: ['6c263823', 'a588adba'], conditions: ['W1: correct the "only code path" claim before describing the hole as closed', 'W2: the guarded path ships with no caller'] },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: sdRow.id,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'SECURITY',
    probeExistsRelative: 'scripts/one-off/archplan-exec-to-plan-security-evidence.mjs',
    supabase,
  });
  applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });
  const stored = await storeSubAgentResults('SECURITY', sdRow.id, { code: 'SECURITY', name: 'Security' }, results, { sdKey: SD_KEY, phase: 'EXEC-TO-PLAN' });
  console.log('STORED:', 'SECURITY', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
