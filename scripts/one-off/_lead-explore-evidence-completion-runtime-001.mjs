#!/usr/bin/env node
/**
 * One-off: record Explore LEAD-phase evidence for SD-LEO-INFRA-COMPLETION-EVIDENCE-RUNTIME-001.
 * Explore runs read-only and cannot write to the DB, so its survey is recorded here through the
 * canonical writer (CLAUDE.md prologue rule 11).
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = '4c45e3e7-e642-4972-a9ef-f9ed35190104';
const SD_KEY = 'SD-LEO-INFRA-COMPLETION-EVIDENCE-RUNTIME-001';

async function main() {
  const supabase = await getSupabaseClient();
  const resolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: 'EHG_Engineer', subAgentCode: 'Explore', supabase });

  let results = {
    verdict: 'PASS',
    confidence: 86,
    findings: [
      {
        id: 'F1-FR1-HAS-NO-MECHANICAL-TRIGGER',
        severity: 'HIGH',
        summary: "FR-1 says a runtime observation is required 'when a row's acceptance depends on RUNTIME behaviour'. NOTHING on the quick_fixes row can decide that mechanically. The full column list was read: type is only bug|polish|typo|documentation (a bug can be pure CSS or a server route); there is NO category or sd_type on quick_fixes; smoke_test_steps does not exist there (smoke_test_cmd is product_requirements_v2, and QFs have no PRD); found_during is orthogonal. The ONLY usable discriminator is files_changed (JSONB, populated by completion time). A precedent exists for exactly that shape -- isFrontendPath()/touchesFrontend() at scripts/modules/complete-quick-fix/git-operations.js:762-781 classifies changed paths to decide whether to run E2E -- but there is NO backend/runtime equivalent anywhere (no touchesRuntimeSurface for server/, routes/, middleware/, api/). It would be 100% new code, not an extension. CONSEQUENCE: absent that, FR-1 must be WORKER-DECLARED, and a worker-declared flag is skipped precisely when it matters -- the worker who does not realise their fix is runtime-dependent will not set it. That is the SD's own failure mode reproduced inside its own remedy.",
      },
      {
        id: 'F2-AN-AUTOMATED-PATH-BYPASSES-EVERY-GATE-EVERY-15-MINUTES',
        severity: 'HIGH',
        summary: "scripts/orphan-qf-reaper.mjs:187-207 and :280-303 writes status='completed', force_completed=true, verified_by='ORPHAN_REAPER' and NEVER sets uat_verified (it stays false). It is not human-invoked: a scheduled GitHub Action runs it EVERY 15 MINUTES (.github/workflows/orphan-qf-reaper.yml). It checks only that a GitHub PR merged, bypassing every gate in orchestrator.js -- tests, UAT prompt, self-verification, compliance rubric. This is a live 'enforced in one path, bypassed by another' instance TODAY, independent of anything this SD adds, and it is the single highest-volume producer of exactly the thin stamps FR-2 targets. Any FR-1/FR-2 enforcement placed only in complete-quick-fix.js is bypassed by a cron.",
      },
      {
        id: 'F3-THE-RUNTIME-EVIDENCE-MECHANISM-EXISTS-AND-IS-DEAD',
        severity: 'HIGH',
        summary: "scope_completion_chain carries runtime_observed_at, smoke_test_passed_at and evidence_kind -- it looks like FR-1 could simply extend it. It cannot. The table has ZERO rows and ZERO INSERT writers anywhere in the codebase; its entity_type CHECK allows only ('sd','handoff','phase','child_sd') so 'quick_fix' is structurally excluded without an ALTER. Worse, scripts/.../runtime-probe-coverage-gate.js reads runtime_observed_at coverage but is NEVER imported or called by getRequiredGates() or anything else -- it is dead code, and its only test (tests/integration/runtime-probe-coverage-gate.test.js:14-16) merely asserts the SOURCE TEXT contains the function definition rather than executing it. A test that greps its own source cannot fail for the reason it exists. bypass_ledger has the same two columns and its one writer (cli-main.js:672-684) never populates them.",
      },
      {
        id: 'F4-ONLY-LIVE-RUNTIME-PRECEDENT-IS-SD-SCOPED-AND-ADVISORY',
        severity: 'MEDIUM',
        summary: "The one FUNCTIONING runtime probe is SMOKE_TEST_GATE (gates.js:1382): it reads product_requirements_v2.smoke_test_cmd, execSyncs it and checks the exit code -- a genuine live observation. But it is SD/PRD-scoped (no QF equivalent), required:false, and an ABSENT command yields an advisory PASS at score 80 (smoke-test-gate.js:57-67). So the repo's only working runtime gate silently passes when unconfigured, which is the same silence-as-success shape this SD is about.",
      },
      {
        id: 'F5-verification_notes-IS-SHAPE-UNSTABLE-AND-UNPARSED',
        severity: 'HIGH',
        summary: "verification_notes is TEXT and its shape alternates by writer: pipe-appended prose (orchestrator.js:81,88 join(' | ')), newline-appended stamp (release-chairman-gated-qf.js:60-61), and WHOLE-FIELD JSON.stringify overwrites (orchestrator.js:655-667, verification.js:110-115, orphan-qf-reaper.mjs:196-201). Every reader (read-quick-fix.js, qf-link-resolution.mjs, release-chairman-gated-qf.js) displays it verbatim; NOTHING JSON.parses it back for a decision. So a prose append running after a JSON write silently corrupts the JSON. Persisting a machine-readable runtime observation into this field would be a Class-B field-absent defect by construction -- a value written in a shape its future reader cannot parse.",
      },
      {
        id: 'F6-FR3-THREE-WRITERS-ONE-OPTIONAL-MANUAL-LINKER-BUT-A-PRECEDENT-EXISTS',
        severity: 'MEDIUM',
        summary: "status='escalated' is written WITHOUT escalated_to_sd_id in three places: scripts/create-quick-fix.js:350,366-367 (every Tier-3 QF is BORN escalated at creation, before any SD exists -- the highest-volume path), scripts/classify-quick-fix.js:303-311, and scripts/modules/complete-quick-fix/verification.js:96-104 and :116-123 (LOC-cap escalation, two sites). escalated_to_sd_id is written in exactly ONE place, lib/sd-creation/source-adapters/qf.js:102,110,115, and only when a human runs leo-create-sd.js --from-qf. No trigger, no sweep, no default step. THE FIX SHAPE ALREADY EXISTS IN THIS SCHEMA: the sibling column resolution_sd_id has an automated DB trigger (database/migrations/20260525_auto_close_quick_fixes_on_sd_completion.sql, covered by tests/integration/auto-close-quick-fixes-trigger.integration.mjs). Applying that idiom to escalated_to_sd_id is the cleanest FR-3 route.",
      },
      {
        id: 'F7-TWO-TERMINAL-STATES-ESCAPE-THE-VERIFICATION-CHECK',
        severity: 'MEDIUM',
        summary: "The quick_fixes status CHECK now allows ('open','in_progress','completed','escalated','cancelled','closed') -- two more terminal states than the original DDL. The completed_requires_verification CHECK covers only 'completed'. So a row routed to 'cancelled' or 'closed' satisfies no verification constraint at all. If PLAN scopes FR-1/FR-2 to status='completed', those two states are an open sidestep that should be either covered or explicitly excluded with a reason.",
      },
      {
        id: 'F8-SD-SIDE-HAS-ITS-OWN-UNGATED-SIDE-DOOR',
        severity: 'MEDIUM',
        summary: "strategic_directives_v2 has NO force_completed/uat_verified/verified_by columns, so FR-1/FR-2 as literally worded can only bind to quick_fixes. On the SD side the same shape exists anyway: lead-final-approval/index.js:526-534 is the gated writer, while scripts/sd-verify.js:341-350 writes status='completed' directly with only an uncommitted-changes check and NONE of the LEAD-FINAL gates -- self-described in its header as a 'Control Gap Fix', i.e. a deliberate side door. scripts/complete-orchestrator.js:342-350 is a third, hardcoded to one legacy SD.",
      },
    ],
    metadata: {
      fr1_trigger_verdict: 'NO mechanical discriminator exists. Worker-declared flag is the fallback and carries the SD own failure mode. A files_changed backend-path heuristic is the only mechanical option and is entirely new code.',
      completion_writers: { quick_fixes: 3, strategic_directives: 3, automated_bypass: 'orphan-qf-reaper.mjs on a 15-minute GitHub Action' },
      runtime_evidence_precedent: 'scope_completion_chain.runtime_observed_at is aspirational scaffolding — 0 rows, 0 writers, entity_type CHECK excludes quick_fix, and its reader gate is dead code with a source-grep test. NOT free reuse.',
      recommended_plan_decisions: [
        'Decide FR-1 trigger: worker-declared (skipped when it matters) vs new files_changed backend heuristic (mechanical, all new code).',
        'Enforce at ALL completion writers or state explicitly which are out of scope — the 15-minute reaper is the highest-volume thin-stamp producer.',
        'Do NOT persist a machine-readable observation into verification_notes; its shape is writer-dependent and nothing parses it.',
        'FR-3: follow the resolution_sd_id trigger precedent rather than tightening the single manual linker.',
      ],
    },
    phase: 'LEAD',
    summary: "PASS for LEAD-TO-PLAN, with three findings that change what is buildable. (1) FR-1 HAS NO MECHANICAL TRIGGER: nothing on quick_fixes can decide 'acceptance depends on runtime behaviour'; the only candidate is files_changed, and the isFrontendPath precedent has no backend twin, so FR-1 falls back to worker-declared — which is skipped exactly when it matters, reproducing the SD's own failure mode inside its remedy. (2) AN AUTOMATED PATH BYPASSES EVERY GATE EVERY 15 MINUTES: orphan-qf-reaper.mjs writes completed + force_completed with uat_verified untouched from a scheduled Action, so enforcement placed only in complete-quick-fix.js is bypassed by a cron. (3) THE RUNTIME-EVIDENCE MECHANISM EXISTS AND IS DEAD: scope_completion_chain.runtime_observed_at has 0 rows, 0 writers, an entity_type CHECK excluding quick_fix, and a reader gate that is never called whose only test greps its own source. Also: verification_notes is shape-unstable and unparsed, so it must not carry a machine-readable observation; FR-3 has 3 escalation writers against 1 optional manual linker, but the resolution_sd_id DB-trigger precedent gives it a clean shape; and 'cancelled'/'closed' escape the verification CHECK entirely.",
  };

  results = applySubAgentRepoVerdict(results, resolution);
  const stored = await storeSubAgentResults('Explore', SD_ID, { name: 'Explore (read-only survey sub-agent)' }, results, { sdKey: SD_KEY, phase: 'LEAD' });
  console.log('Explore result stored:', stored.id, stored.verdict, stored.confidence);
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
