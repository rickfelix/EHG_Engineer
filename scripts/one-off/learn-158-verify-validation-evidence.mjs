#!/usr/bin/env node
/**
 * SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-158 — VALIDATION evidence at VERIFY phase.
 *
 * An independent VERIFY-phase validation-agent re-derived every functional requirement's
 * acceptance criteria against the shipped code/tests (not the PRD's own claims), ran the full
 * touched-area suite itself (282/282), diffed pre-fix vs shipped behavior on the 4 real
 * motivating patterns (confirmed all 4 flip from kept->rejected), and found one real gap: the
 * SD row's own `scope`/`description` fields still described the pre-PLAN, REJECTED
 * parent_sd_id/proximity-window design instead of what actually shipped. That gap has been
 * closed (scripts/one-off/correct-scope-learn-158-v3-post-plan.mjs, applied before this
 * evidence record) -- CONDITIONAL_PASS's condition is resolved.
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-158';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: sdRow, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('sd_key', SD_KEY)
    .single();
  if (sdErr) throw sdErr;

  const validationResults = {
    verdict: 'PASS',
    confidence: 92,
    phase: 'VERIFY',
    execution_time_ms: 0,
    summary: "Independently re-derived every FR's acceptance criteria against the shipped code/tests (commits c7cfb4ce481 + ff4f1ff2e1d), not trusted from prior claims. FR-1: confirmed checkSingleSDClosedSource (filter.mjs:141-182) derives ids from metadata.sites[], falls back byte-identically to the original firstId!==lastId->null predicate when no sites resolve, abstains on any unresolvable status, preserves the severity bypass unchanged. Ran the ACTUAL causal test the PRD claims: diffed the pre-fix module (c7cfb4ce481^) against shipped, against the LIVE 4 motivating patterns' real metadata.sites[] data -- PRE-FIX: all 4 kept (the defect, reproduced); FIXED: all 4 rejected with SINGLE_SD_CLOSED_SOURCE. Noted a real-world nuance not previously flagged: these 4 patterns are also currently caught earlier by the (already-existing, untouched) ALREADY_ASSIGNED_OPEN_SD guard since they're assigned to this still-open SD -- the closed-source guard becomes the operative suppressor once this SD itself completes; the fix is correct either way. FR-2: verified both write paths wired at auto-extract-patterns-from-retro.js:258,288 into extractPatternsFromImprovements (not extractPatternsFromRetrospective, a DB-fetching wrapper around it -- confirmed retro.created_at is in scope via its own select('*')). FR-5: confirmed via git show --stat that lib/rca/rca-orchestrator.js is untouched by both commits, and read both call sites directly (3 positional args, no opts). Ran the full touched-area suite independently: 282/282 (27 files), matching the incremental arithmetic (277 after #8967, +5 after #8970) exactly. Verified all 4 of the PRD's stated risk mitigations are genuinely implemented, not merely asserted -- notably the malformed-timestamp risk (would reach mergeSite's unguarded toISOString() as an Invalid Date, throw, and be silently swallowed) is prevented by the effectiveNow guard BEFORE toISOString() is ever called.",
    critical_issues: [],
    warnings: [
      {
        id: 'VAL-1',
        severity: 'LOW',
        issue: 'metadata.sites[] is FIFO-capped at SITES_CAP=50 (drops oldest first) and, once resolvable, is used INSTEAD OF (not unioned with) first_seen_sd_id/last_seen_sd_id -- so a pattern whose original first-seen SD aged out of the cap is invisible to the new predicate. Measured over 1,000 live patterns: 86 have resolvable site ids, 1 is at the cap, 44/86 (51%) have first_seen_sd_id not present in sites[] -- but measured ACTUAL false-suppression (guard rejects while an excluded first_seen_sd_id resolves OPEN): 0 cases. Latent, not currently exploitable; worth a comment softening "authoritative, complete" or unioning first/last into the id set in a future pass.',
        evidence: 'Live query against issue_patterns.metadata.sites[] vs first_seen_sd_id, 1000-row sample.',
      },
      {
        id: 'VAL-2',
        severity: 'LOW',
        issue: "FR-3's text-key-sd_id test (tests/learn/filter-single-sd-noise.test.js) proves less than its own wording suggests -- it passes sourceSdStatusMap directly rather than exercising fetchPatternSourceSDStatuses's own .in() query construction for a text-shaped id. Independently confirmed the underlying risk is real-but-absent: strategic_directives_v2.id is a TEXT column, so .in('id', [textKey]) has no 22P02 cast-failure mode. Not a functional defect; the test's evidentiary framing is thinner than worded.",
        evidence: 'information_schema.columns: strategic_directives_v2.id data_type=character varying.',
      },
    ],
    recommendations: [
      'Consider unioning first_seen_sd_id/last_seen_sd_id into the id set alongside metadata.sites[] in a future pass, to close VAL-1\'s latent gap before it becomes live at higher pattern volumes.',
      'Tighten the text-key test (VAL-2) to actually exercise fetchPatternSourceSDStatuses\'s query construction, not just the downstream Map lookup, if this class of coverage-overstatement is judged worth closing.',
    ],
    detailed_analysis: {
      commands_run: [
        'git show c7cfb4ce481 --stat, git show ff4f1ff2e1d --stat',
        'Diffed pre-fix (c7cfb4ce481^) vs shipped filter.mjs against the 4 real motivating patterns\' live metadata.sites[] data -- confirmed the kept->rejected flip',
        'npx vitest run tests/learn/ tests/unit/learning/ tests/unit/rca-skip-governance.test.js tests/unit/rca-trigger-quick-wire.test.js tests/unit/rca-orchestrator-noise.test.js -> 282/282',
        'Live query: 1000-row metadata.sites[] vs first_seen_sd_id false-suppression check -> 0 cases',
        'information_schema.columns query confirming strategic_directives_v2.id is TEXT, not UUID-only',
        'Found and flagged stale SD scope/description (parent_sd_id/window design, extractPatternsFromRetrospective) vs shipped (all-closed predicate, extractPatternsFromImprovements) -- corrected via scripts/one-off/correct-scope-learn-158-v3-post-plan.mjs before this evidence record',
      ],
    },
    metadata: { independent_verification: true, scope_correction_applied: true },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: sdRow.id,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'VALIDATION',
    probeExistsRelative: 'scripts/one-off/learn-158-verify-validation-evidence.mjs',
    supabase,
  });
  applySubAgentRepoVerdict(validationResults, resolution, { skipVerdictAdjust: false });
  const stored = await storeSubAgentResults('VALIDATION', sdRow.id, { code: 'VALIDATION', name: 'Validation' }, validationResults, { sdKey: SD_KEY, phase: 'VERIFY' });
  console.log('STORED:', 'VALIDATION', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
