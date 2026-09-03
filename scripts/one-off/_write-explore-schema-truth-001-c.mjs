// Persists the LEAD-phase Explore evidence row for SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-C.
// THE DESIGNED PATH, not a workaround: scripts/modules/handoff/required-subagents.js:34 documents
// 'Explore' (mixed case) as "the designed path — worker invokes the Task-tool agent and persists
// the row", measured n=157 / PASS 136 over 90 days. The Task-tool Explore agent is read-only by
// construction and cannot write this itself; the CLI path (execute-subagent.js --code EXPLORE)
// throws because Explore is a Claude Code built-in absent from leo_sub_agents.
// Findings below were produced by two independent Explore passes; the second verified the first
// at source and corrected two facts (noted inline as CORRECTED).
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

// Resolve by sd_key, never from a parent's metadata.children[].uuid_id (26/26 wrong, 2026-09-03).
const { data: sd, error: sdErr } = await supabase
  .from('strategic_directives_v2')
  .select('id, sd_key')
  .eq('sd_key', 'SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-C')
  .maybeSingle();
if (sdErr || !sd) { console.error('SD resolve failed:', sdErr?.message || 'not found'); process.exit(1); }
const SD_ID = sd.id;
console.log('resolved sd_key -> id:', SD_ID);

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'Explore',
  supabase,
});

const results = {
  sd_id: SD_ID,
  sub_agent_code: 'Explore',
  sub_agent_name: 'Explore (codebase reconnaissance)',
  verdict: 'PASS',
  confidence: 90,
  phase: 'LEAD',
  validation_mode: 'prospective',
  source: 'manual',
  critical_issues: [],
  warnings: [
    'THE LINT DOES NOT STRIP COMMENTS OR STRING/TEMPLATE LITERALS. extractReferences (scripts/lint/schema-reference-extract.mjs:108-162) runs FROM_RE and the select/insert/update/upsert regexes directly against raw file text read at scripts/lint/schema-reference-lint.mjs:270-271. Neither lint file imports any comment- or string-stripping helper. Proof reproduced live: scripts/hooks/lib/supabase-operative.cjs:17-18 are regex literals whose TRAILING // comments contain .from(\'table_name\'), and both are reported as missing table_name (from). This is the mechanism behind the measured 10-of-358 false-positive class.',
    'A REUSABLE, ALREADY-EXPORTED HELPER EXISTS AND IS UNUSED: lib/lint/added-line-text.mjs exports stripComments (:91-96) and stripStringLiterals (:119-148). The lint ALREADY imports isFixturePath/isFixtureEntry from that same module at scripts/lint/schema-reference-lint.mjs:40, so the module is on its import path — only the strip functions were left out. No comment in either lint file explains the omission, so whether it was deliberate scope or oversight is UNDETERMINED. IMPORTANT LIMIT: stripStringLiterals deliberately keeps TEMPLATE literal content intact (documented at :107-111), so adopting it alone closes the comment half of the false-positive class but NOT the template-literal half.',
    'scripts/lib/migration-object-parser.js stripLineAndBlockComments/stripDollarQuotedBodies are NOT a candidate for reuse here: both are module-private (unexported) AND are SQL-grammar strippers (-- comments, $$ dollar-quoting), which is the wrong grammar for a .js/.mjs/.ts scanner.',
    'NO TEST PINS THE CI SCAN MODE. tests/unit/schema-reference-lint-workflow-blocking.test.js asserts only continue-on-error: false; nothing asserts --diff vs --all. The --diff-only constraint exists solely as the literal run: command in the workflow yml, so a change to --all (or back) would pass the suite silently.',
    'NO EXISTING TEST COVERS THE COMMENT/STRING FALSE-POSITIVE CLASS. tests/unit/lint/schema-reference-extract.test.js covers from/select/insert/update/upsert extraction, the pragma skip, raw-SQL non-blocking and the findViolations comparator, but contains zero cases mentioning comments, string literals or template literals.',
  ],
  recommendations: [
    'Adopt stripComments from lib/lint/added-line-text.mjs in the extractor (it is already an import-path neighbour) and add the missing regression tests; handle the template-literal half explicitly since stripStringLiterals will not cover it.',
    'Correct the SD spine before PLAN pins any literal: the allowlist path is scripts/lint/schema-reference-allowlist.json (ALLOWLIST_PATH, schema-reference-lint.mjs:51), NOT database/schema-reference-allowlist.json, which does not exist anywhere in the repo.',
    'Add a test pinning the CI scan mode when --all is wired in, so the mode cannot silently regress to --diff.',
  ],
  detailed_analysis: null,
  execution_time: 0,
  metadata: {
    findings: {
      mode_default: "scripts/lint/schema-reference-lint.mjs:96 — args.includes('--all') ? 'all' : 'diff'; diff is the default",
      strips_comments_or_strings: false,
      strip_evidence: 'scripts/lint/schema-reference-extract.mjs:108-162 operates on raw text from schema-reference-lint.mjs:270-271',
      allowlist_path_real: 'scripts/lint/schema-reference-allowlist.json (ALLOWLIST_PATH at scripts/lint/schema-reference-lint.mjs:51)',
      allowlist_path_in_sd_text_does_not_exist: 'database/schema-reference-allowlist.json — zero matches anywhere in the repo',
      allowlist_counts: { files: 12, tables: 27 },
      pragma: {
        name: 'schema-lint-disable-line',
        parsed_at: 'scripts/lint/schema-reference-extract.mjs:42-47 (pragmaAt, line granularity only)',
        occurrences: 233,
        files: 129,
        note: 'CORRECTED from a first-pass 232/128. The +1/+1 is scripts/one-off/_write-validation-schema-truth-001-c.mjs, an untracked sibling-agent script written this session that quotes the pragma string in evidence prose. ~4 of the 233 are the lint\'s own definition/docstring (schema-reference-lint.mjs 2, schema-reference-extract.mjs 2), not suppressions.',
      },
      ci: {
        workflow: '.github/workflows/schema-reference-lint.yml',
        invocation_line: 69,
        flags: '--diff only; --all never passed',
        continue_on_error_false_at_line: 48,
        note: 'CORRECTED from a first-pass line 41, which is cancel-in-progress under the concurrency block.',
        other_workflows_invoking_lint: 0,
      },
      snapshot: {
        path: 'database/schema-reference-snapshot.json',
        writer: 'scripts/lint/schema-reference-snapshot.mjs (OUT at :28, writeFileSync at :78)',
        staleness_check: 'scripts/lint/schema-reference-lint.mjs:129-133 — console.warn only',
        stale_days_const: 'STALE_DAYS = 7 at scripts/lint/schema-reference-lint.mjs:55',
        warning_only: true,
        exit_wiring: 'ageDays is never passed to computeExitCode (scripts/lint/schema-lint-exit.mjs:18-21), which reads only violations + degradedFallback',
      },
      all_run: { files_checked: 4316, violations: 358, pre_existing: 0, exit_code: 1 },
      prior_art: 'No SD/QF previously attempted a whole-tree zero baseline or --all in CI. Related: SD-LEO-INFRA-SCHEMA-REFERENCE-LINT-001 (created the lint), QF-20260704-026 (advisory->blocking), QF-20260802-742 (per-violation new-vs-pre-existing split), SD-LEO-INFRA-SCHEMA-LINT-DEGRADED-FAILOPEN-001 (degraded fallback).',
      undetermined: [
        'Why stripComments/stripStringLiterals were never imported by the lint despite the module already being an import-path neighbour — no rationale recorded in either file.',
        'A line-by-line classification of all 358 against source was not performed by Explore; the 10-in-comment/template-literal figure comes from the worker\'s own classifier pass.',
      ],
    },
    produced_by: 'Task-tool Explore agent (two passes; second verified the first at source and corrected 2 facts)',
    persisted_by: 'worker Alpha-4 session 9cc20227-3f92-4009-8d90-75bbde54c5b0 — the designed path per scripts/modules/handoff/required-subagents.js:34',
  },
};

applySubAgentRepoVerdict(results, resolution);

const { data, error } = await supabase.from('sub_agent_execution_results').insert(results).select('id').single();
if (error) { console.error('INSERT FAILED:', error.code || '', error.message); process.exit(1); }
console.log('Explore evidence row written:', data.id);
