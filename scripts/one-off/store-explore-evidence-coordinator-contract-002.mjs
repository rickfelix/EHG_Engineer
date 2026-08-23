// SD-LEO-INFRA-COORDINATOR-ROLE-CONTRACT-002 -- EXPLORE evidence writer (LEAD phase).
// Read-only discovery mapping the Adam 3-file precedent onto the Coordinator restructure.
// Canonical path: resolveSubAgentRepo -> applySubAgentRepoVerdict -> storeSubAgentResults.
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = 'SD-LEO-INFRA-COORDINATOR-ROLE-CONTRACT-002';
const PHASE = 'LEAD';

const results = {
  verdict: 'PASS',
  confidence: 90,
  summary:
    'Read-only discovery confirms the Adam 3-file precedent (generateAdamCompanion in ' +
    'scripts/modules/claude-md-generator/file-generators.js:548-574) is a genuinely role-agnostic ' +
    'primitive already reused unchanged for LEAD, PLAN, and Solomon manuals -- a Coordinator variant ' +
    '(generateCoordinatorManual/generateCoordinatorProvenance) is a ~10-line addition each, following ' +
    'the exact same pattern. Coordinator today has NO dedicated generator quirks: generateCoordinator() ' +
    '(file-generators.js:687-714) and generateCoordinatorDigest() (digest-generators.js:562-587) are thin ' +
    'wrappers over the same generic getSectionsByMapping/formatSection machinery Adam uses. The mapping ' +
    'layer (scripts/section-file-mapping.json) is purely declarative JSON -- adding the split is data, not ' +
    'logic. check-claude-md-drift.cjs is mapping/section-agnostic and needs NO changes for this split. ' +
    'One asymmetry confirmed: generateCoordinatorDigest uses the default 3000-char budget while ' +
    'generateAdamDigest explicitly overrides to 16000 (digest-generators.js:532) after Adam\'s own contract ' +
    'consolidation broke its digest -- if Coordinator\'s split changes section volume materially, the same ' +
    'override may be needed.',
  recommendations: [
    'Add generateCoordinatorManual/generateCoordinatorProvenance to file-generators.js mirroring ' +
      'generateAdamManual (:577) / generateAdamProvenance (:587) exactly -- do not invent a new pattern.',
    'Wire both into index.js getFileSpecs() (189-227) and KNOWN_GENERATED_FILES (662-665), bump the ' +
      'protocol-publication-pipeline.test.js count 21->23 in the same commit.',
    'Add coordinator_manual/coordinator_provenance rows to leo_protocol_sections and the corresponding ' +
      '2 entries to scripts/section-file-mapping.json -- purely additive JSON, no restructuring of ' +
      'existing coordinator_role_contract/role_partnership_contract mapping entries.',
    'Update tests/unit/decompose-weakest-classify-rule.test.js and tests/unit/claude-coordinator-generation.test.js ' +
      'in the same PR as whatever content-move triggers their breakage -- do not defer to a follow-up.',
    'Add both new filenames to .docmon/rules.json root_allowlist.',
    'Do NOT justify the split on Read-tool cap grounds in the PRD -- CLAUDE_COORDINATOR.md (26,580B/~6.6k ' +
      'tokens) is well under the 25k-token cap, unlike Adam\'s 103,790B file. Justify on governance grounds only.',
  ],
  metadata: {
    exploration_mode: 'read_only_discovery',
    issues_detail: [
      {
        severity: 'high',
        title: 'KNOWN_GENERATED_FILES count assertion will break without an update',
        detail: 'tests/unit/protocol-publication-pipeline.test.js:158 asserts toHaveLength(21) on ' +
          'scripts/modules/claude-md-generator/index.js:662-665 KNOWN_GENERATED_FILES. Comment history at ' +
          'lines 147-157 shows this counter bumped for every prior companion addition (12->14->16->18->19->21). ' +
          'Adding 2 coordinator companions requires bumping to 23 in the SAME PR.',
      },
      {
        severity: 'medium',
        title: 'Two existing tests read CLAUDE_COORDINATOR.md content/line-numbers directly',
        detail: 'tests/unit/decompose-weakest-classify-rule.test.js:37-40 regex-asserts a specific clause at ' +
          'CLAUDE_COORDINATOR.md line ~40 ("stale/manual KR needs a governed KR re-measure"). ' +
          'tests/unit/claude-coordinator-generation.test.js:26 asserts MAPPING[\'CLAUDE_COORDINATOR.md\'].sections ' +
          'equals exactly [\'coordinator_role_contract\', \'role_partnership_contract\']. Either test breaks if ' +
          'FR-1/FR-4 relocate their target content to a new manual/provenance file -- both must be updated in ' +
          'the same PR as the content move, not left to fail in CI.',
      },
      {
        severity: 'low',
        title: '.docmon/rules.json root_allowlist missing the 2 new filenames',
        detail: '.docmon/rules.json:61-88 root_allowlist has CLAUDE_COORDINATOR.md and CLAUDE_COORDINATOR_DIGEST.md ' +
          'but not CLAUDE_COORDINATOR_MANUAL.md/CLAUDE_COORDINATOR_PROVENANCE.md, mirroring the existing ' +
          'CLAUDE_ADAM_MANUAL.md/CLAUDE_ADAM_PROVENANCE.md entries (lines 76-77) that must be added for Coordinator ' +
          'too. max_root_files:21 (line 89) is already stale/unenforced (26 entries already present; ' +
          'validate-doc-location.js only warns, never blocks) -- informational only, not a blocker.',
      },
    ],
    adam_precedent_primitive: 'generateAdamCompanion (file-generators.js:548-574), reused unchanged for LEAD/PLAN/Solomon manuals',
    adam_landing_script_reusability: 'NOT a reusable callable tool -- hard-wired to Adam row IDs/paths (see VALIDATION row 86ad1bd6 for the corrected finding)',
    coordinator_charter_size_bytes: 26580,
    coordinator_charter_size_tokens_approx: 6600,
    adam_charter_size_bytes_pre_split: 103790,
    read_cap_tokens: 25000,
    coordinator_digest_char_budget: 3000,
    adam_digest_char_budget_override: 16000,
    section_file_mapping_current: {
      'CLAUDE_COORDINATOR.md': ['coordinator_role_contract', 'role_partnership_contract'],
    },
    known_generated_files_current_count: 21,
    known_generated_files_target_count: 23,
    tests_requiring_update: [
      'tests/unit/protocol-publication-pipeline.test.js:158',
      'tests/unit/decompose-weakest-classify-rule.test.js:37-40',
      'tests/unit/claude-coordinator-generation.test.js:26',
    ],
    docmon_root_allowlist_missing: ['CLAUDE_COORDINATOR_MANUAL.md', 'CLAUDE_COORDINATOR_PROVENANCE.md'],
  },
  execution_time_ms: 957715,
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  subAgentCode: 'EXPLORE',
  targetApplication: 'EHG_Engineer',
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('EXPLORE', SD_ID, { name: 'Explore (Claude Code built-in)' }, results, { phase: PHASE, source: 'manual' });
console.log('STORED_VERDICT=' + results.verdict);
console.log('STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
console.log('STORED_PHASE=' + (stored?.phase || PHASE));
console.log('REPO_PATH=' + results.metadata.repo_path);
console.log('EXECUTED_FROM_CWD=' + results.metadata.executed_from_cwd);
