#!/usr/bin/env node
/**
 * RCA evidence + feedback witness writeback for handoff.js silent-exit at
 * PRE-HANDOFF MIGRATION CHECK on SD-FDBK-INFRA-EVA-VISION-DOCUMENTS-001.
 *
 * Root cause already shipped via PR #3662 (QF-20260509-358) on origin/main
 * but not yet pulled to worktree feat/SD-FDBK-INFRA-EVA-VISION-DOCUMENTS-001
 * (HEAD=cdf98d04af, origin/main=c2efbfe81a). Worktree's
 * scripts/session-check-concurrency.js:186 still has unguarded top-level
 * main().catch().
 *
 * Run from main tree (worktree has empty node_modules):
 *   cd C:/Users/rickf/Projects/_EHG/EHG_Engineer
 *   node .worktrees/SD-FDBK-INFRA-EVA-VISION-DOCUMENTS-001/scripts/one-off/_rca-handoff-silent-exit-eva-vision-documents-001.mjs
 *
 * Does NOT mutate any source files. Corrective-only.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const SD_ID = 'be5d6fbf-571a-47a6-86e6-acc3dba9e044';
const SD_KEY = 'SD-FDBK-INFRA-EVA-VISION-DOCUMENTS-001';
const SESSION_ID = '2f6fc904-7ef4-4260-b4e2-2f5017b223a9';

// 1) RCA evidence payload (stored in raw_output / metadata)
const rcaPayload = {
  trigger_type: 'script_crash',
  summary:
    'handoff.js LEAD-TO-PLAN silent-exit at PRE-HANDOFF MIGRATION CHECK — already-shipped fix QF-20260509-358 (PR #3662, commit 2064b1571d) not yet pulled to worktree feat/SD-FDBK-INFRA-EVA-VISION-DOCUMENTS-001',
  five_whys: [
    {
      level: 1,
      question: 'Why does handoff.js exit code 0 before writing handoff?',
      answer:
        'Some downstream code calls process.exit(0) on the no-contention path before handoff write logic runs.',
      evidence:
        'Heartbeat reports "[Heartbeat] Process exiting (code 0)"; last visible output is "[ISOLATED] No contention detected" from session-check-concurrency.js:178.',
    },
    {
      level: 2,
      question: 'Why does session-check-concurrency.js main() run during handoff?',
      answer:
        'scripts/session-check-concurrency.js:186 has unguarded top-level main().catch(); ESM evaluation runs main() whenever the script is imported.',
      evidence:
        'Direct read of worktree file lines 186-189: main().catch(e => { ... process.exit(2); }) at module top-level, no entrypoint guard.',
    },
    {
      level: 3,
      question: 'Why does handoff.js import session-check-concurrency.js?',
      answer:
        'handoff.js -> BaseExecutor.js:140 dynamic-imports lib/claim-validity-gate.js -> line 26 static-imports lib/claim-lifecycle-release.mjs -> line 38 static-re-exports detectSdKeyDrift from session-check-concurrency.js.',
      evidence:
        'grep confirmed import chain: scripts/modules/handoff/executors/BaseExecutor.js:140, lib/claim-validity-gate.js:26, lib/claim-lifecycle-release.mjs:38.',
    },
    {
      level: 4,
      question: 'Why was a CLI script promoted to a module without an entrypoint guard?',
      answer:
        'SD-LEO-INFRA-CROSS-HOST-CONCURRENT-001 (PR #3629) added named export detectSdKeyDrift to session-check-concurrency.js, but did not add the import.meta.url === pathToFileURL(process.argv[1]).href guard around main(). Writer/consumer asymmetry: the writer added the export, the consumer (handoff.js chain) inherits the CLI side-effects.',
      evidence:
        'git log scripts/session-check-concurrency.js: PR #3629 commit d03c9dd714 promoted the script to a module on 2026-05-09 14:43:04. Fix landed 9 hours later in PR #3662 commit 2064b1571d on 2026-05-09 23:48:47.',
    },
    {
      level: 5,
      question: 'Why does the worktree still hit the silent-exit if the fix is on origin/main?',
      answer:
        'Worktree feat/SD-FDBK-INFRA-EVA-VISION-DOCUMENTS-001 HEAD is cdf98d04af, BEHIND origin/main (c2efbfe81a). The fix at 2064b1571d has not been merged into the worktree branch.',
      evidence:
        'git log HEAD..origin/main shows 5 commits missing including ff32f682f7 (PR #3662 merge) and 2064b1571d (the fix). stat scripts/session-check-concurrency.js shows Modify=2026-05-09 23:43:59 — exactly 4m54s BEFORE the fix landed at 23:48:47.',
    },
  ],
  root_cause:
    'Worktree feat branch is behind origin/main by 5 commits, including PR #3662 (QF-20260509-358) which fixed the unguarded top-level main().catch() in scripts/session-check-concurrency.js. The fix wraps main() in an `import.meta.url === pathToFileURL(process.argv[1]).href` entrypoint guard so static re-export from lib/claim-lifecycle-release.mjs no longer triggers the script\'s CLI side-effects (process.exit(0) on no-contention).',
  classification: 'process_issue',
  category: 'protocol_process',
  capa_corrective: [
    {
      action:
        'Pull origin/main into worktree feat branch: `git pull --rebase origin main`. This brings in commit 2064b1571d (entrypoint guard) and unblocks all downstream handoffs for this SD.',
      file: '(worktree branch update — no source file modification by RCA agent)',
      urgency: 'immediate',
    },
  ],
  capa_preventive: [
    {
      control:
        'Static guard test scripts/__tests__/session-check-concurrency-no-side-effect.test.js (already shipped in PR #3662) spawns process.exit / console.log spies BEFORE importing the script and asserts no [ISOLATED]/[CONCURRENT] output and no process.exit call within 200ms. Forms regression pin against re-introduction of the unguarded main().',
      location:
        'scripts/__tests__/session-check-concurrency-no-side-effect.test.js (already on origin/main)',
      type: 'validation_gate',
    },
    {
      control:
        'Open follow-up SD: AST-level pre-merge gate that flags any scripts/*.js or scripts/**/*.mjs with named exports AND a top-level main()/run()/start() call NOT wrapped in import.meta.url entrypoint guard. Closes the writer/consumer-asymmetry class (PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 ~16th witness).',
      location:
        'NEW SD: SD-LEO-INFRA-MODULE-ENTRYPOINT-GUARD-AST-001 (P2, Tier-3, AST gate ~150 src LOC + tests)',
      type: 'validation_gate',
    },
    {
      control:
        'Add to LEO Session Prologue / CLAUDE.md: when handoff.js silently exits at PRE-HANDOFF MIGRATION CHECK with code 0, FIRST `git fetch origin main && git log HEAD..origin/main --oneline -- scripts/session-check-concurrency.js lib/claim-lifecycle-release.mjs lib/claim-validity-gate.js` before any --bypass-validation attempt.',
      location: 'CLAUDE_CORE.md "Issue Resolution" section',
      type: 'documentation',
    },
  ],
  confidence: 0.99,
  experts_consulted: [
    {
      expert: 'prior-rca-run-a1e202f580088dcf0 (canonical, confidence 0.97)',
      findings:
        'Identical root cause already established and shipped: unguarded `main().catch(...)` in session-check-concurrency.js:186 + static re-export in lib/claim-lifecycle-release.mjs:38. --bypass-validation does NOT help because process.exit(0) happens BEFORE bypass-aware code runs.',
      capa_items: [
        'Wrap main() in import.meta.url === pathToFileURL(process.argv[1]).href guard (shipped commit 2064b1571d)',
        'Regression pin via tests/unit/session-check-concurrency-no-side-effect.test.js (shipped commit 2064b1571d)',
      ],
    },
  ],
};

// Canonical schema columns (verified via existing row keys for SD_ID):
// conditions, confidence, created_at, critical_issues, detailed_analysis,
// execution_time, id, invocation_id, justification, metadata, phase,
// raw_output, recommendations, retro_contribution, risk_assessment_id,
// sd_id, source, sub_agent_code, sub_agent_name, summary, updated_at,
// validation_mode, verdict, warnings.
// NB: NO sd_key, NO sub_agent_type, NO sub_agent_id columns.
const rcaInsert = {
  sd_id: SD_ID,
  sub_agent_code: 'RCA',
  sub_agent_name: 'Forensic Investigator',
  phase: 'LEAD',
  verdict: 'PASS',
  confidence: 99,
  source: 'lead_rca',
  validation_mode: 'prospective',
  summary:
    'handoff.js LEAD-TO-PLAN silent-exit root-caused to worktree branch lag: fix QF-20260509-358 (PR #3662, commit 2064b1571d, 2026-05-09 23:48:47) lands the import.meta.url entrypoint guard on scripts/session-check-concurrency.js:186 but worktree HEAD cdf98d04af is BEHIND origin/main c2efbfe81a by 5 commits. Pull main and re-run handoff.',
  detailed_analysis: rcaPayload.five_whys
    .map((w) => `WHY ${w.level}: ${w.question} -> ${w.answer}\n  evidence: ${w.evidence}`)
    .join('\n\n'),
  recommendations: [
    'Run `git pull --rebase origin main` on worktree feat branch (immediate).',
    'Verify `grep -n "isDirectInvoke" scripts/session-check-concurrency.js` shows the entrypoint guard.',
    'Re-run `node scripts/handoff.js execute LEAD-TO-PLAN SD-FDBK-INFRA-EVA-VISION-DOCUMENTS-001` (no bypass needed).',
    'DO NOT use --bypass-validation: process.exit(0) fires BEFORE bypass-aware code runs.',
    'Open follow-up SD-LEO-INFRA-MODULE-ENTRYPOINT-GUARD-AST-001 (P2 Tier-3) for AST-level pre-merge gate that catches re-occurrence of unguarded main()/run()/start() in module-promoted CLI scripts.',
  ],
  warnings: [
    'Worktree branch must be rebased onto origin/main BEFORE retrying handoff.js — fix is at commit 2064b1571d.',
    'Pattern witness: 4th in 7d (would have been if fix had not landed). Same-class as PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001.',
    'Prior RCA run a1e202f580088dcf0 (confidence 0.97) reached identical conclusion and produced the canonical fix.',
  ],
  critical_issues: [],
  conditions: {
    pause_pause: false,
    fix_already_shipped: true,
    fix_pr: 3662,
    fix_commit: '2064b1571d4fba1e7a0d548e13b9515d587c6097',
    requires_branch_update: true,
    bypass_path_recommended: false,
  },
  metadata: {
    rca_payload: rcaPayload,
    session_id: SESSION_ID,
    sd_key: SD_KEY,
    rca_run_referenced: 'a1e202f580088dcf0',
    fix_commit: '2064b1571d4fba1e7a0d548e13b9515d587c6097',
    fix_pr: 3662,
    worktree_head: 'cdf98d04af',
    origin_main_head: 'c2efbfe81a',
    file_evidence_path: 'scripts/session-check-concurrency.js',
    file_modify_time: '2026-05-09 23:43:59 -0400',
    fix_commit_time: '2026-05-09 23:48:47 -0400',
    delta_minutes_before_fix: 4.8,
    pattern_class: 'PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001',
  },
  raw_output: JSON.stringify(rcaPayload, null, 2),
  retro_contribution:
    'Closes 4th-in-7d witness of handoff.js silent-exit at PRE-HANDOFF MIGRATION CHECK. Validates QF-20260509-358 fix as the canonical resolution. Recommends new SD-LEO-INFRA-MODULE-ENTRYPOINT-GUARD-AST-001 for the AST pre-merge gate to systematically prevent the writer/consumer-asymmetry class.',
};

console.log('[rca-agent] Inserting RCA evidence row...');
const { data: rcaRow, error: rcaErr } = await supabase
  .from('sub_agent_execution_results')
  .insert(rcaInsert)
  .select('id')
  .single();
if (rcaErr) {
  console.error('[rca-agent] sub_agent_execution_results insert failed:', rcaErr);
  process.exit(1);
}
console.log('[rca-agent] RCA row id:', rcaRow.id);

// 2) Feedback witness — confirm or upsert. Don't double-log if existing
// b1e9d6c1 already covers it; just check.
console.log('[rca-agent] Checking existing feedback witness b1e9d6c1...');
const { data: existing, error: lookupErr } = await supabase
  .from('feedback')
  .select('id, status, occurrence_count, metadata')
  .like('id', 'b1e9d6c1%')
  .maybeSingle();

if (lookupErr) {
  console.warn('[rca-agent] feedback lookup error (non-blocking):', lookupErr.message);
} else if (existing) {
  console.log(
    `[rca-agent] Existing feedback ${existing.id} status=${existing.status} occurrence_count=${
      existing.occurrence_count ?? 'n/a'
    } — fix already shipped via PR #3662, no new feedback row needed.`,
  );
} else {
  console.log(
    '[rca-agent] No existing b1e9d6c1 row; this session does not need a new one — fix already on origin/main.',
  );
}

console.log('\n[rca-agent] === RECOMMENDATION ===');
console.log('  1. EXIT THIS WORKTREE SHELL (release any handoff.js process holding the working tree).');
console.log('  2. From the worktree:  git fetch origin main && git pull --rebase origin main');
console.log('  3. Verify guard:       grep -n "isDirectInvoke" scripts/session-check-concurrency.js (must show isDirectInvoke check).');
console.log('  4. Re-run:             node scripts/handoff.js execute LEAD-TO-PLAN SD-FDBK-INFRA-EVA-VISION-DOCUMENTS-001');
console.log('\n  DO NOT use --bypass-validation: per shipped RCA payload, process.exit(0) happens BEFORE bypass-aware code runs.');
console.log('  DO NOT modify scripts/session-check-concurrency.js manually: the canonical fix is on origin/main.');
console.log('\n[rca-agent] done.');
