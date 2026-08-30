#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PRD_ID = 'PRD-SD-LEO-INFRA-STATIC-PREFIX-DIET-001';

async function main() {
  const { data: prd, error: e0 } = await supabase.from('product_requirements_v2').select('functional_requirements,test_scenarios,acceptance_criteria').eq('id', PRD_ID).single();
  if (e0) throw e0;

  // FR-1: reuse resolveMemoryDir, don't author a 4th resolver.
  const functional_requirements = prd.functional_requirements.map((fr) => {
    if (fr.id === 'FR-1') {
      return {
        ...fr,
        requirement: fr.requirement + ' MUST reuse the existing resolveMemoryDir() from scripts/modules/memory/reindex.mjs for the MEMORY.md path — never author a new resolver (TESTING sub-agent found 3 rival resolvers already in-repo that diverge on non-trivial cwds; scripts/pocock/auto-promote-glossary-term.mjs:218 even hardcodes a literal path).',
        acceptance_criteria: [...fr.acceptance_criteria, 'Audit imports resolveMemoryDir from scripts/modules/memory/reindex.mjs rather than re-deriving the path'],
      };
    }
    if (fr.id === 'FR-2') {
      return {
        ...fr,
        acceptance_criteria: [...fr.acceptance_criteria, 'Byte-count aggregation never substitutes 0 for an unmeasurable component: harnessTokensFromBytes returns null (not 0) on unmeasurable input, and any total that does `|| 0` on it is rejected'],
      };
    }
    if (fr.id === 'FR-3') {
      return {
        ...fr,
        acceptance_criteria: [...fr.acceptance_criteria, 'The named safety-content checklist (Canonical Pause Points, MODE declarations, gate names) is verified PRESENT INSIDE post-regeneration file content, not merely that its containing section appears on the intended-move list'],
      };
    }
    if (fr.id === 'FR-5') {
      return {
        ...fr,
        requirement: fr.requirement + ' Any destination file receiving moved content must itself satisfy harnessTokensFromBytes(bytes) <= SINGLE_READ_TOKEN_CAP (25000) — moving content into an already-over-cap file (e.g. CLAUDE_CORE.md, currently ~39,051 harness-tokens, 56% over cap) silently truncates it on read and must not happen.',
        acceptance_criteria: [...fr.acceptance_criteria, 'Every destination file for moved content passes the single-read token cap after the move, verified via harnessTokensFromBytes on its real post-diet bytes', 'The pre-declared move-list diff (per FR-5 above) is computed over changed UNION added UNION removed sections (not changed alone), so a silently dropped section cannot escape by landing in "removed" only'],
      };
    }
    return fr;
  });

  const test_scenarios = [
    { id: 'TS-1', scenario: 'MEMORY.md path resolution uses the canonical resolver and distinguishes it from rival implementations', test_type: 'unit', given: 'an injected cwd for which resolveMemoryDir (reindex.mjs), the lead-final-approval helpers.js resolver, and a hardcoded literal would diverge (e.g. a worktree path like /home/bob/repos/ehg.worktrees/wt-1)', when: 'the audit resolves the MEMORY.md path for that seat', then: 'it matches resolveMemoryDir\'s output exactly, not the divergent helpers.js or hardcoded-literal result' },
    { id: 'TS-2', scenario: 'Audit fails loud (never silently 0) when MEMORY.md path cannot be resolved, including in aggregation', test_type: 'unit', given: 'a seat/environment where the per-seat memory path is unresolvable, exercised both at direct resolution AND inside the total-bytes aggregation step', when: 'the audit runs', then: 'an explicit error is raised naming the seat; the aggregation step never substitutes 0 via `harnessTokensFromBytes(x) || 0` for a null (unmeasurable) result' },
    { id: 'TS-3', scenario: 'Real reduction computed via harnessTokensFromBytes with a materially divergent fixture, not by inequality with the printed line', test_type: 'integration', given: 'a fixture where the /4 char-based estimate and the bytes/2.4177 calibrated model diverge materially (not merely "differs from")', when: 'computing the reduction percentage', then: 'the calculation provably uses harnessTokensFromBytes(bytes), with the divergent fixture proving it is not silently falling back to the char-based estimate' },
    { id: 'TS-4', scenario: 'MUST_FIT_SINGLE_READ and the 2.4177 constant are untouched', test_type: 'regression', given: 'the diet\'s full diff', when: 'tests/unit/claude-md-single-read-cap.test.js is run', then: 'it passes unmodified, proving neither the file list nor the constant was relaxed' },
    { id: 'TS-5', scenario: 'Drift-check changed-section set (union of changed/added/removed) matches the pre-declared move list exactly, keyed by stable section id', test_type: 'integration', given: 'a pre-declared list of intended section moves (by section id, not title, since a title may itself be edited by this diet)', when: 'the exported computeDrift() (not just the CLI\'s printed report) is called post-regeneration and its changed UNION added UNION removed sets are diffed against the pre-declared list', then: 'the sets match exactly, orphanFiles is empty, and a section that was silently DROPPED (landing only in `removed` with no corresponding intended-move entry) is caught rather than escaping because only `changed` was checked' },
    { id: 'TS-6', scenario: 'Every destination file receiving moved content still fits the single-read token cap after the move', test_type: 'regression', given: 'the real post-diet byte counts of every file that received moved content', when: 'harnessTokensFromBytes(bytes) is computed for each', then: 'every value is <= SINGLE_READ_TOKEN_CAP (25000) — moving content into an already-over-cap file (CLAUDE_CORE.md, CLAUDE_EXEC.md) without addressing its own over-cap state is rejected' },
    { id: 'TS-7', scenario: 'The named safety-content checklist survives inside regenerated file content, not just at the section level', test_type: 'integration', given: 'the pre-diet enumerated checklist (CLAUDE.md\'s 5 Canonical Pause Points, MODE declarations, all gate names referenced in scope)', when: 'the regenerated files are searched post-diet', then: 'every checklist item is found present in the actual file text — a section landing correctly on the intended-move list does not, by itself, prove the safety text inside it survived the move' },
  ];

  const acceptance_criteria = [
    ...prd.acceptance_criteria,
    'MEMORY.md resolution reuses resolveMemoryDir() from scripts/modules/memory/reindex.mjs — no new resolver authored',
    'Every destination file receiving moved content independently satisfies the single-read token cap post-move',
  ];

  const { error } = await supabase.from('product_requirements_v2').update({ functional_requirements, test_scenarios, acceptance_criteria }).eq('id', PRD_ID);
  if (error) throw error;
  console.log('PRD updated with TESTING sub-agent findings (TS-6, TS-7, revised TS-1/TS-2/TS-3/TS-5, FR-1/FR-2/FR-3/FR-5 hardened)');
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
