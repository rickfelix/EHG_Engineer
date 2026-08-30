#!/usr/bin/env node
/**
 * Explore sub-agent evidence writer — SD-LEO-INFRA-STATIC-PREFIX-DIET-001, LEAD_TO_PLAN gate.
 *
 * LEAD-phase discovery for burn-lever A4: located the generator's token/byte budget logic,
 * the drift checker's comparison semantics, the calibrated harness-token constant, the
 * generation manifest's per-file bytes tracking, actual generated-file sizes, and the
 * MUST_FIT_SINGLE_READ hard cap this SD must never touch.
 */
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-STATIC-PREFIX-DIET-001';

const FINDINGS = [
  'REUSABLE INSTRUMENT CONFIRMED — lib/protocol/harness-token-scale.cjs is the calibrated '
    + 'bytes-to-token SSOT (HARNESS_BYTES_PER_TOKEN=2.4177 :36, harnessTokensFromBytes() :60-64, '
    + 'SINGLE_READ_TOKEN_CAP=25000 :39). scripts/modules/claude-md-generator/index.js:625 '
    + 're-exports it. This is the conversion the audit must use for its accuracy claims.',
  'WRONG-NUMBER TRAP IDENTIFIED — the generator prints "Token budget OK" / "Token Savings" '
    + '(index.js:405-436) from estimated_tokens, a content.length/4 estimate (index.js:158-165) '
    + 'documented as running ~40% low for this file family (SD-FDBK-INFRA-CLAUDE-LEAD-EXCEEDS-001 '
    + 'postmortem, index.js:606-624). Only assertSingleReadFit (index.js:648-670) uses the '
    + 'calibrated bytes/2.4177 model. A 15% reduction measured on the printed line is not a real '
    + '15% reduction — acceptance evidence must recompute via harnessTokensFromBytes(bytes).',
  'DRIFT CHECKER SEMANTICS CONFIRMED — scripts/check-claude-md-drift.cjs compares content '
    + 'IDENTITY via section digests (computeSectionDigests/diffSectionDigests), takes no CLI '
    + 'flags, exits 0=clean/1=DRIFT/2=internal-error. It cannot see a section shrinking and WILL '
    + 'report DRIFT for any intended A4 move until the manifest is regenerated — "clean" for A4 '
    + 'purposes means "changed-section-set == intended-move-set", not "zero drift".',
  'MANIFEST STRUCTURE CONFIRMED — claude-generation-manifest.json already tracks per-file '
    + '{type, chars, bytes, estimated_tokens, content_hash, path} for all KNOWN_GENERATED_FILES '
    + '(e.g. CLAUDE.md 19704 bytes, CLAUDE_CORE.md 94415 bytes, CLAUDE_LEAD.md 58622 bytes) but '
    + 'has NO per-SECTION byte/token attribution — that is net-new work for the audit script.',
  'HARD BOUNDARY IDENTIFIED — scripts/modules/claude-md-generator/index.js:635 pins '
    + "MUST_FIT_SINGLE_READ = ['CLAUDE_LEAD.md', 'CLAUDE_PLAN.md', 'CLAUDE_SOLOMON.md'] "
    + '(CLAUDE_CORE.md/CLAUDE_EXEC.md are already known over-cap and deliberately excluded — '
    + '"their fixes are separate SDs"). tests/unit/claude-md-single-read-cap.test.js pins this '
    + 'list and the 2.4177 constant exactly. The diet must reduce real bytes on MUST_FIT files, '
    + 'never relax this guarantee to manufacture a pass.',
  'MEASUREMENT GAP IDENTIFIED — .claude/settings.json (9,717 bytes) chains 8+ SessionStart hook '
    + 'scripts whose combined stdout byte cost at session start is measured by nothing in the '
    + 'repo today; likewise the settings.json env-block (10 flags). Both are genuine per-seat '
    + 'prefix components the audit must instrument, not assume-away.',
  'PATH TRAP IDENTIFIED — the user-level MEMORY.md (the largest hand-maintained component, '
    + '~17.6KB) lives OUTSIDE this repo at a per-seat path under %USERPROFILE%\\.claude\\projects\\ '
    + 'and is invisible to git ls-files. An audit script resolving it repo-relative will silently '
    + 'report 0 bytes for it rather than failing loud — this must be an explicit, named risk in '
    + 'the audit\'s own error handling, not a silent zero.',
  'MERGE-ORDER RISK IDENTIFIED (NOT VISIBLE TO A DB-SCOPED DUPLICATE-SD QUERY) — PR #7430 is '
    + 'OPEN and stale since 2026-08-24 (confirmed live via gh pr view 7430: state=OPEN, '
    + 'isDraft=false), modifying scripts/modules/claude-md-generator/digest-generators.js, '
    + 'claude-generation-manifest.json, CLAUDE_CORE.md, CLAUDE_SOLOMON.md and 7 *_DIGEST.md files '
    + '— the exact artifact family A4 regenerates. Its source SD '
    + '(SD-LEO-INFRA-COORDINATOR-ROLE-CONTRACT-002) is already status=completed, so it does not '
    + 'surface in an open-SD overlap query. If #7430 lands after A4 regenerates, its own '
    + 'regeneration could silently overwrite the diet. PLAN must record an explicit ordering '
    + 'decision (land #7430 first, or re-verify the diet survives its merge) before EXEC.',
];

const SUMMARY = 'Explore LEAD_TO_PLAN verdict: PASS with conditions. No existing per-seat static-'
  + 'prefix audit script exists (net-new work, confirmed clean of duplicates), but substantial '
  + 'reusable infrastructure exists: the calibrated harness-token-scale.cjs conversion, the '
  + 'generation manifest\'s per-file bytes/hash tracking, and generate-agent-md-from-db.js\'s '
  + 'per-agent size reporting pattern. Five load-bearing traps identified for the PRD to encode: '
  + '(1) the printed token-budget line is the wrong number, use harnessTokensFromBytes(bytes); '
  + '(2) check-claude-md-drift.cjs cannot detect size reduction, only content-identity drift; '
  + '(3) MEMORY.md lives outside the repo at a per-seat path and must fail loud, not report zero; '
  + '(4) MUST_FIT_SINGLE_READ and the 2.4177 constant are a hard boundary this SD must never '
  + 'relax to manufacture a pass; (5) open stale PR #7430 touches the same generated-file family '
  + 'and its merge ordering relative to this SD must be an explicit PRD decision.';

async function main() {
  const supabase = await getSupabaseClient();

  const results = {
    verdict: 'PASS',
    confidence: 90,
    summary: SUMMARY,
    findings: FINDINGS,
    warnings: [
      'PR #7430 (open, stale since 2026-08-24) touches the same generated protocol-file family '
        + 'this SD regenerates — ordering must be decided explicitly, not left implicit.',
    ],
    recommendations: [
      'PRD acceptance criteria for "measured reduction" must specify harnessTokensFromBytes(bytes) '
        + 'as the computation, not the generator\'s printed Token Savings line.',
      'PRD must restate the drift-check success criterion as "changed section set equals the '
        + 'enumerated intended-move set on a re-run", since check-claude-md-drift.cjs cannot see '
        + 'size reduction directly.',
      'PRD must explicitly forbid editing MUST_FIT_SINGLE_READ, HARNESS_BYTES_PER_TOKEN (2.4177), '
        + 'or tests/unit/claude-md-single-read-cap.test.js as a way to pass the diet.',
      'PRD must record a merge-order decision relative to open PR #7430 before EXEC begins.',
    ],
    validation_mode: 'prospective',
    metadata: {
      recorded_by: 'scripts/one-off/explore-evidence-static-prefix-diet-001.mjs',
      assessment_type: 'lead_phase_due_diligence',
      burn_lever_item: 'A4',
      related_pr_ordering_risk: 'https://github.com/rickfelix/EHG_Engineer/pull/7430',
      files_read: [
        'scripts/generate-claude-md-from-db.js',
        'scripts/modules/claude-md-generator/index.js',
        'scripts/check-claude-md-drift.cjs',
        'lib/protocol/harness-token-scale.cjs',
        'lib/protocol/contract-read-coverage.cjs',
        'claude-generation-manifest.json',
        'tests/unit/claude-md-single-read-cap.test.js',
        '.claude/settings.json',
      ],
    },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'EXPLORE',
    supabase,
  });
  applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults('EXPLORE', SD_KEY, null, results, {
    phase: 'LEAD_TO_PLAN',
  });

  const { data, error } = await supabase
    .from('sub_agent_execution_results')
    .select('id,sub_agent_code,phase,verdict,confidence,validation_mode,created_at')
    .eq('id', stored.id)
    .maybeSingle();

  if (error || !data) {
    console.error(`WROTE but could not read back id=${stored?.id}: ${error?.message || 'no row'}`);
    process.exit(1);
  }

  console.log('\nEXPLORE evidence recorded and read back:');
  console.log(JSON.stringify(data, null, 2));
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
