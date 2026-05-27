#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_ID = '6696db72-d1b1-4a07-8281-3bd7eb922251';
const VALIDATION_EV = 'fa9db31f-aba3-4467-afe4-819a5e2fef3c';
const RISK_EV = 'ca719680-ca0f-47af-929f-f31f52b728d7';

const failing_tests = {
  T1: { name: 'eva-support — static-import ban on process-spawning modules', file: 'tests/ci/eva-support-no-process-spawn-imports.test.js', impl: 'Pure-Node vitest. Walk scripts/eva-support/** + lib/eva-support/** (exclude __tests__/__fixtures__). Regex /^\\s*import .* from [\\\'\"](?:node:)?(child_process|execa|cross-spawn|shelljs)[\\\'\"];?$/m + require() variant. NO exceptions.', recommendation: 'Pure-Node test ONLY; reuse dashboard-quarantine-lint.test.js walker.' },
  T2: { name: 'eva-support — supabase writes restricted to allowlist', file: 'tests/ci/eva-support-supabase-write-allowlist.test.js', impl: 'Regex /\\.from\\(\\s*[\\\'\"`]([^\\\'\"`]+)[\\\'\"`]\\s*\\)\\s*\\.\\s*(insert|update|upsert|delete)\\b/g. ALLOW = {eva_support_decision_log, eva_todoist_intake, eva_support_research_cache}. Flag non-literal .from(var).', edge_case: 'Conservative — any non-string-literal .from() arg = violation.' },
  T3: { name: 'eva-support — eslint no-restricted-imports', file: 'eslint.config.js override block + tests/ci/eva-support-eslint-restricted-imports-config.test.js', impl: 'Flat-config files=[\"scripts/eva-support/**\",\"lib/eva-support/**\"], rules.no-restricted-imports=[\"error\",{paths:[\"child_process\",\"node:child_process\",\"execa\",\"cross-spawn\",\"shelljs\"]}]. Verify via npm run lint + content-grep test.', overlap: 'Keep BOTH T1+T3. T1=vitest-time, T3=lint-time+IDE-time. Different friction points.' },
  T4: { name: 'active-sd-predicate — parity between EVA reader and retrofit consumer', file: 'tests/ci/active-sd-predicate-parity.test.js', impl: 'Fixture-seeded strategic_directives_v2 [draft, in_progress, active, completed, cancelled, archived]. Both lib/eva-support/sd-reader.js + retrofit consumer must (a) import lib/sd/active-sd-predicate.js (grep), (b) return identical row-sets (set-equality).', retrofit_pick: 'lib/governance/resolve-feedback.js (lower blast radius than generate-retrospective.js — read-mostly, fewer writer paths).' },
  T5: { name: 'sd-reader — EVA_SD_READER_ENABLED=false killswitch', file: 'lib/eva-support/__tests__/sd-reader-feature-flag.test.js', impl: 'vi.stubEnv. Mock decision-log-store.write. Assert: return [], log written 1x with kind=reader_disabled, ZERO supabase .from(strategic_directives_v2) call (spy).' },
  T6: { name: 'sd-recommendation-emitter — decision-log written BEFORE render', file: 'lib/eva-support/__tests__/sd-recommendation-emitter-log-ordering.test.js', impl: 'Call-order spy. Mock log.write(timestamp T1) + render(T2). Assert T1<T2. Crash test: throw inside render mock; assert log row still landed (write awaited before render try-block).' },
};

const structural_defects = [
  { severity: 'MEDIUM', area: 'Reply-envelope prefix injection point', finding: 'dispatcher.js:31 is pass-through w/ no post-handler hook. SD claims \"no new sub-flow\" but prefix at dispatcher level requires explicit middleware step OR all 6 sub-flows touched. Recommend dispatcher-level post-handler middleware (1 change point, 6 untouched sub-flows). PRD MUST specify this.' },
  { severity: 'MEDIUM', area: 'Shared predicate retrofit + R4 (drift to write-path)', finding: 'R4 score 9. Add boundary invariant test: lib/eva-support/sd-reader.js MUST NOT import decision-log-store.write — only sd-recommendation-emitter does. Encode as 4th invariant.' },
  { severity: 'LOW', area: 'target_aspects.sd_refs[] JSONB merge semantics', finding: 'Column exists + JSONB confirmed (validation-agent). PRD must specify insert-merge semantics: jsonb_set with create_missing=true. Avoid full-replace.' },
  { severity: 'LOW', area: 'Counterfactual semantics in emitter', finding: 'SD says emitter outputs \"counterfactual\" but never defines it. Recommend: counterfactual = \"if SD already exists for this intent, surface its sd_key + skip emission\". PRD must lock definition.' },
];

const conditions = [
  'PRD acceptance criteria MUST include 6 failing-test names verbatim (T1-T6)',
  'PRD MUST specify dispatcher-level middleware (not per-sub-flow) for reply-envelope prefix',
  'PRD MUST name lib/governance/resolve-feedback.js as the retrofit consumer',
  'PRD MUST add 4th invariant: sd-reader.js cannot import decision-log-store.write',
  'PRD MUST define counterfactual semantics + sd_refs[] jsonb merge semantics',
];

const detailed = {
  framework: { runner: 'vitest project=unit', invariant_pattern: 'tests/ci/*.test.js fs.walkFiles + regex + violations[]', eslint: 'eslint.config.js flat + .eslintrc.json — supports no-restricted-imports per-directory' },
  similar_lints: ['dashboard-quarantine-lint.test.js', 'no-multiline-in-json-string.test.js', 'audit-log-parity-check.test.js'],
  failing_tests,
  structural_defects,
  retrofit_recommendation: 'resolve-feedback.js (lower blast radius)',
  cross_references: { validation_evidence_id: VALIDATION_EV, risk_evidence_id: RISK_EV },
};

const { data, error } = await supabase
  .from('sub_agent_execution_results')
  .insert({
    sd_id: SD_ID,
    phase: 'LEAD',
    sub_agent_code: 'TESTING',
    sub_agent_name: 'testing-agent',
    verdict: 'CONDITIONAL_PASS',
    confidence: 90,
    validation_mode: 'prospective',
    summary: 'CONDITIONAL_PASS. 6 failing-test names (T1-T6) ready for PRD acceptance criteria. 4 structural defects (2 MEDIUM, 2 LOW). 5 PRD conditions required.',
    critical_issues: [],
    warnings: structural_defects.map(d => `[${d.severity}] ${d.area}: ${d.finding.slice(0, 200)}`),
    recommendations: conditions,
    conditions,
    detailed_analysis: detailed,
    justification: 'Prospective LEAD-phase analysis before PRD authoring. SD encodes CI-enforced invariants (writer/consumer + shared-scope risk shape per CLAUDE_LEAD.md cadence). Repo has strong tests/ci/* precedent; T1-T6 names are framework-realistic. 4 structural defects surfaced: dispatcher hook point underspecified, sd-reader/recommendation-emitter boundary unstated, sd_refs[] merge semantics undefined, counterfactual undefined.',
    metadata: { validation_evidence_id: VALIDATION_EV, risk_evidence_id: RISK_EV },
  })
  .select('id')
  .single();

if (error) { console.error('INSERT FAIL', error); process.exit(1); }
console.log('PERSISTED:', data.id);
