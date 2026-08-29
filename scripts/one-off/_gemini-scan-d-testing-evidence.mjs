import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-ORCH-GEMINI-MODEL-SCAN-001-D';

async function main() {
  const supabase = await getSupabaseClient();
  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'TESTING',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence_score: 90,
    findings: [
      {
        id: 'TEST-D-001',
        severity: 'info',
        summary:
          'Diff verified: lib/testing/vision-qa-agent.js autoSelectModel() replaced 7x return \'gemini-2.5-flash\' with getGoogleModel(\'vision\') and 2x return \'gemini-2.5-pro\' with getGoogleModel(\'reasoning\'). grep counts confirm 7 vision + 2 reasoning call sites in code (8/3 raw grep hits include one doc-comment mention each). Import added: getGoogleModel from ../config/model-config.js.',
      },
      {
        id: 'TEST-D-002',
        severity: 'info',
        summary:
          'No gemini-<digit> literal remains anywhere in code in lib/testing/vision-qa-agent.js. The only two remaining "gemini" occurrences are lines 5 and 7 inside the SD provenance comment block. Pre-existing unrelated accessibility branch at line 471 still returns the Anthropic literal \'claude-sonnet-4-6\' (out of scope for the Gemini SSOT rule and intentionally untouched).',
      },
      {
        id: 'TEST-D-003',
        severity: 'info',
        summary:
          'gemini-pin-lint (--all): 15 unallowlisted violations across 4136 files, ZERO of them in lib/testing/vision-qa-agent.js. Remaining violations are in lib/ai/multimodal-client.js (13), lib/brainstorm/provider-rotation.js (1), lib/creative/providers/gemini.js (1) -- other children of the orchestrator, not this SD scope. Confirmed the pass is genuine and not an allowlist suppression: grep of scripts/lint/gemini-pin-allowlist.json for "vision-qa" returns no entry.',
      },
      {
        id: 'TEST-D-004',
        severity: 'info',
        summary:
          'Branch parity PROVEN behavior-identical. git show HEAD:lib/testing/vision-qa-agent.js (pre-fix, committed) contains exactly 9 gemini-2.5 literals; working tree (post-fix, uncommitted) contains 0 in code. MODEL_DEFAULTS.google.vision = \'gemini-2.5-flash\' (model-config.js:85) and .reasoning = \'gemini-2.5-pro\' (:86) -- an exact 1:1 map onto the 7 flash + 2 pro branches rewritten. Runtime resolution executed under the repo .env: getGoogleModel(\'vision\') -> gemini-2.5-flash, getGoogleModel(\'reasoning\') -> gemini-2.5-pro. Parity also holds under the live env, which sets GEMINI_MODEL=gemini-2.5-flash (default fallback, same value) and GEMINI_MODEL_REASONING=gemini-2.5-pro (purpose override, same value), so neither env var perturbs the pre/post equivalence.',
      },
      {
        id: 'TEST-D-005',
        severity: 'info',
        summary:
          'No regression suite is applicable: repo-wide grep for VisionQAAgent / vision-qa-agent / autoSelectModel finds zero test files. The only non-source references are throwaway .artifacts/val-d-*.mjs probes and the sibling explore-evidence one-off. Static + lint + runtime-accessor verification is therefore the complete applicable verification set for this SD.',
      },
    ],
    warnings: [
      'PRE-EXISTING (NOT a regression from this SD): lib/testing/vision-qa-agent.js is an ESM module (top-level `import` statements) but line 21 uses CommonJS `const MultimodalClient = require(\'../ai/multimodal-client\');`. The module therefore fails to load: `import(\'./lib/testing/vision-qa-agent.js\')` throws "Cannot find module \'../ai/multimodal-client\'". I verified this is identical at HEAD by extracting git show HEAD:... to a probe file in-place and importing it -- HEAD fails with the byte-identical error (the require sits at line 14 pre-fix, line 21 post-fix, shifted only by the 7-line comment block). CONSEQUENCE: autoSelectModel() is currently dead-by-construction at runtime -- no caller can import this module, so the 9 rewritten branches have zero runtime yield until the require/ESM mismatch is fixed. The consolidation is still correct and lint-clean, but its benefit is latent. Recommend a follow-up QF to convert the require to an ESM import (out of scope here; this SD must not expand into an unrelated module-system fix).',
    ],
    recommendations: [
      'File a follow-up QF to convert lib/testing/vision-qa-agent.js line 21 from CommonJS require() to an ESM import so the module becomes loadable and autoSelectModel() gains runtime effect.',
      'Do NOT add a unit test for autoSelectModel() until the ESM/CJS defect above is fixed -- any such test would be unable to import the subject and would either fail or be written against a shim, proving nothing.',
      'Sibling children of SD-LEO-ORCH-GEMINI-MODEL-SCAN-001 must still clear the 15 remaining lint violations in lib/ai/multimodal-client.js, lib/brainstorm/provider-rotation.js and lib/creative/providers/gemini.js before the orchestrator can close.',
    ],
    summary:
      'PASS. Child SD-D\'s scope (lib/testing/vision-qa-agent.js autoSelectModel) is fully and correctly consolidated onto the getGoogleModel(purpose) SSOT: 7 flash + 2 pro literals replaced, 0 gemini literals left in code, gemini-pin-lint reports zero violations for this file without any allowlist entry, and pre/post behavior parity is proven both by the MODEL_DEFAULTS mapping and by live runtime resolution under the repo .env. No test suite exists for this module so static/lint verification is the complete applicable set. One pre-existing, out-of-scope defect surfaced and is recorded as a warning: the file mixes require() into an ESM module and cannot be imported at all -- verified identical at HEAD, so it is not a regression from this change, but it does mean the consolidated branches have no runtime effect yet.',
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'PLAN_TO_EXEC',
      lint_result:
        'node scripts/lint/gemini-pin-lint.mjs --all => "15 unallowlisted violation(s) in 4136 file(s) checked". Violation file breakdown: lib/ai/multimodal-client.js lines 36,69,70,71,283,284,492,493,554,555,556,558,559 (13); lib/brainstorm/provider-rotation.js:61 (1); lib/creative/providers/gemini.js:11 (1). lib/testing/vision-qa-agent.js: 0 violations => SD-D scope CLEAN. Allowlist check: grep "vision-qa" scripts/lint/gemini-pin-allowlist.json => no match, so the clean result is a real fix, not a suppression.',
      branch_parity:
        'PROVEN IDENTICAL. Pre-fix (git show HEAD:lib/testing/vision-qa-agent.js): 9 gemini-2.5 literals (7x gemini-2.5-flash, 2x gemini-2.5-pro). Post-fix (working tree, uncommitted): 0 code literals, 7x getGoogleModel(\'vision\') + 2x getGoogleModel(\'reasoning\'). Mapping evidence: model-config.js MODEL_DEFAULTS.google.vision=\'gemini-2.5-flash\' (line 85), .reasoning=\'gemini-2.5-pro\' (line 86). Runtime evidence (node, repo .env loaded): getGoogleModel(\'vision\')===\'gemini-2.5-flash\', getGoogleModel(\'reasoning\')===\'gemini-2.5-pro\'. Env-perturbation check: .env sets GEMINI_MODEL=gemini-2.5-flash (line 66) and GEMINI_MODEL_REASONING=gemini-2.5-pro (line 69); getGoogleModel resolves purpose-env -> default-env -> hardcoded default, and all three tiers agree on the same two values, so no override path can break parity in this environment. The branch-to-branch mapping is 1:1 by inspection of git diff (each replaced return sits on the same conditional as before; no condition, ordering, or fallthrough was altered).',
      out_of_scope_untouched:
        'Line 471 return \'claude-sonnet-4-6\' (accessibility branch) intentionally untouched -- Anthropic model, not covered by the Gemini SSOT rule.',
      test_coverage:
        'Zero test files reference VisionQAAgent, vision-qa-agent, or autoSelectModel (repo-wide grep excluding node_modules). No regression suite to run; static + lint + runtime-accessor verification is the complete applicable set.',
      preexisting_defect:
        'lib/testing/vision-qa-agent.js:21 `const MultimodalClient = require(\'../ai/multimodal-client\');` inside an ESM module. dynamic import() of the file throws "Cannot find module \'../ai/multimodal-client\'". Verified identical at HEAD via an in-place probe extraction (HEAD IMPORT FAIL, same message). NOT a regression from SD-D. Means autoSelectModel() is unreachable at runtime today.',
      verification_commands: [
        'git diff -- lib/testing/vision-qa-agent.js',
        'grep -n "gemini" lib/testing/vision-qa-agent.js',
        'node scripts/lint/gemini-pin-lint.mjs --all',
        'grep -n "vision-qa" scripts/lint/gemini-pin-allowlist.json',
        'git show HEAD:lib/testing/vision-qa-agent.js | grep -c "gemini-2.5"',
        "node -e \"import('./lib/config/model-config.js').then(m=>console.log(m.getGoogleModel('vision'), m.getGoogleModel('reasoning')))\"",
      ],
    },
    phase: 'PLAN_TO_EXEC',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'TESTING',
    SD_KEY,
    { name: 'TESTING' },
    results,
    { sdKey: SD_KEY, phase: 'PLAN_TO_EXEC', source: 'manual' },
  );

  console.log('TESTING EVIDENCE WRITTEN:', stored.id, stored.verdict, stored.confidence);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error('FAILED:', e.message, e.stack); process.exit(1); });
}
