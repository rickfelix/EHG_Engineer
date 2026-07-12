#!/usr/bin/env node
/**
 * SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-G (FR-1/FR-2/FR-3) -- repeatable reachability
 * audit for the CEO-agent org layer (venture-ceo-factory.js + the CEO-authority stage-
 * advancement gate). Read-only: greps the repo, never writes to agent_registry,
 * venture_state, or any spine/satellite table (TR-1). Persists a BUILD-ON/RETIRE verdict
 * to docs/audits/venture-ceo-factory-reachability-verdict.json (TR-2/FR-3).
 *
 * Usage: node scripts/audits/venture-ceo-factory-reachability.mjs
 */
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

/** git grep -n, extended regex. Returns [] on no-match (git grep exits 1), throws on real errors. */
function gitGrep(pattern, repoRoot) {
  try {
    const out = execSync(`git grep -n -E "${pattern}"`, { cwd: repoRoot, maxBuffer: 10 * 1024 * 1024 }).toString();
    return out.split('\n').filter(Boolean).map((line) => {
      const idx = line.indexOf(':');
      const idx2 = line.indexOf(':', idx + 1);
      return { file: line.slice(0, idx).replace(/\\/g, '/'), line: Number(line.slice(idx + 1, idx2)), text: line.slice(idx2 + 1).trim() };
    });
  } catch (e) {
    if (e.status === 1) return [];
    throw e;
  }
}

/** Classify a git-grep hit into live / test / archive / doc / migration_literal. */
export function classify(hit) {
  if (/^archive\//.test(hit.file)) return 'archive';
  if (/(^|\/)tests?\//.test(hit.file) || /\.(test|spec)\.[jt]sx?$/.test(hit.file)) return 'test';
  if (/\.md$/.test(hit.file)) return 'doc';
  if (/\.sql$/.test(hit.file)) return 'migration_literal';
  return 'live';
}

export function partition(hits) {
  const byClass = { live: [], test: [], archive: [], doc: [], migration_literal: [] };
  for (const h of hits) byClass[classify(h)].push(h);
  return byClass;
}

/** Run the full audit trace and return the verdict record (does not write to disk). */
export function runAudit(repoRoot) {
  // ---- FR-1: instantiateVenture / onboardVenture reachability ----
  const onboardDefHits = gitGrep('async onboardVenture', repoRoot);
  const onboardCallHits = partition(gitGrep('\\.onboardVenture\\(', repoRoot));
  const instantiateCallHits = partition(gitGrep('\\.instantiateVenture\\(', repoRoot));

  // A caller of instantiateVenture that is itself only a manual, non-triggered harness script
  // (no npm script / cron / CI wiring into it -- confirmed by a separate grep below) is not a
  // production entry point.
  const MANUAL_HARNESS_FILES = ['scripts/harness/spine-verify-first-run.mjs'];
  const harnessWiringHits = gitGrep('spine-verify-first-run', repoRoot).filter(
    (h) => !MANUAL_HARNESS_FILES.includes(h.file) && !/^tests?\//.test(h.file) && h.file !== 'CHANGELOG.md' && h.file !== '.gitignore'
  );
  // eva-coo-integration.js's OWN instantiateVenture call sits inside onboardVenture()'s method
  // body (line 319-~340) -- it is that dead method's internal implementation, not an
  // independent entry point. Once onboardVenture is confirmed to have zero external callers,
  // this internal call is unreachable transitively and must not be double-counted as a live path.
  const ONBOARD_VENTURE_OWN_FILE = 'lib/agents/eva-coo-integration.js';
  const instantiateLiveExternal = instantiateCallHits.live.filter(
    (h) => !MANUAL_HARNESS_FILES.includes(h.file) && h.file !== ONBOARD_VENTURE_OWN_FILE
  );

  const fr1Confirmed = onboardCallHits.live.length === 0 && instantiateLiveExternal.length === 0 && harnessWiringHits.length === 0;
  const fr1 = {
    onboard_venture_definition: onboardDefHits,
    onboard_venture_live_callers: onboardCallHits.live,
    instantiate_venture_all_live_hits: instantiateCallHits.live,
    instantiate_venture_live_external_callers_note:
      'Excludes: (a) onboardVenture\'s own internal call in ' + ONBOARD_VENTURE_OWN_FILE + ' -- dead transitively once onboardVenture has 0 external callers; (b) ' + MANUAL_HARNESS_FILES.join(', ') + ' -- manual harness, not a production trigger.',
    instantiate_venture_live_external_callers_hits: instantiateLiveExternal,
    manual_harness_files_excluded: MANUAL_HARNESS_FILES,
    harness_wiring_into_any_trigger: harnessWiringHits,
    verdict: fr1Confirmed
      ? "CONFIRMED: onboardVenture has zero live callers. Its own instantiateVenture() call is therefore unreachable transitively. The only other instantiateVenture call site is scripts/harness/spine-verify-first-run.mjs, a manually-invoked verification harness with no npm-script/cron/CI wiring into it -- no production entry point reaches the CEO factory."
      : 'REFUTED or PARTIAL: a live external caller was found (or the harness is wired into a real trigger) -- see the accompanying hit lists.',
  };

  // ---- FR-2: CEO-authority gate on the live stage-advancement path ----
  const commitCallHits = partition(gitGrep('\\.commitStageTransition\\(', repoRoot));
  const verifyCeoHits = gitGrep('verifyCeoAuthority', repoRoot);
  const bareAdvanceStageHits = partition(gitGrep('await advanceStage\\(', repoRoot));

  const fr2Confirmed = commitCallHits.live.length === 0;
  const fr2 = {
    commit_stage_transition_live_callers: commitCallHits.live,
    commit_stage_transition_test_callers: commitCallHits.test,
    commit_stage_transition_archive_callers: commitCallHits.archive,
    verify_ceo_authority_references: verifyCeoHits,
    bare_advance_stage_live_callers: bareAdvanceStageHits.live,
    verdict: fr2Confirmed
      ? "CONFIRMED: commitStageTransition() -- the sole call path to verifyCeoAuthority() -- has zero live callers (only unit tests and one archived user-story-generator script). lib/eva/eva-orchestrator.js's live stage-advancement block instantiates a VentureStateMachine but calls the bare advanceStage() function directly, never sm.commitStageTransition(); the CEO-authority gate is never exercised on the live path."
      : 'REFUTED or PARTIAL: a live caller of commitStageTransition was found -- the CEO-authority gate may be exercised on some live path.',
  };

  const verdict = fr1Confirmed && fr2Confirmed ? 'RETIRE' : 'BUILD-ON';

  return {
    sd_key: 'SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-G',
    prd_id: 'PRD-SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-G',
    generated_at: new Date().toISOString(),
    verdict,
    verdict_rationale:
      verdict === 'RETIRE'
        ? "Both FR-1 (CEO-factory instantiation) and FR-2 (CEO-authority stage-advancement gate) are unreachable from any live production path -- the CEO-agent org layer is seed-or-theater, not exercised machinery. Per architecture doc S3.6, a RETIRE verdict shrinks phase (b) substantially; phase (b) scope should be resized (or descoped) in a follow-on SD rather than building full lifecycle machinery against dead code."
        : 'A live call path was found into the CEO-factory or the CEO-authority gate -- phase (b) lifecycle machinery should proceed as originally scoped.',
    s20_26_cross_check:
      'docs/design/spine-system-architecture-review.md:16 -- "the venture state machine IS live -- the EVA orchestrator drives stage transitions through it today... stages run through workers; the org layer is decorative at run level" -- independently corroborates FR-2 (simulated S20-26 run observation).',
    fr1,
    fr2,
  };
}

function main() {
  const repoRoot = execSync('git rev-parse --show-toplevel').toString().trim();
  const record = runAudit(repoRoot);
  const outPath = path.join(repoRoot, 'docs/audits/venture-ceo-factory-reachability-verdict.json');
  writeFileSync(outPath, JSON.stringify(record, null, 2) + '\n');

  console.log(`Verdict: ${record.verdict}`);
  console.log(`FR-1: ${record.fr1.verdict.startsWith('CONFIRMED') ? 'CONFIRMED' : 'NOT CONFIRMED'}`);
  console.log(`FR-2: ${record.fr2.verdict.startsWith('CONFIRMED') ? 'CONFIRMED' : 'NOT CONFIRMED'}`);
  console.log(`Verdict record written to ${outPath}`);
}

const argv1 = process.argv[1] || '';
if (import.meta.url === `file://${argv1}` || import.meta.url === `file:///${argv1.replace(/\\/g, '/')}`) {
  main();
}
