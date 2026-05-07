#!/usr/bin/env node
/**
 * Refine PRD-SD-LEO-INFRA-CODIFY-PROTOCOL-RULES-001 per validation-agent PLAN
 * findings (sub_agent_execution_results.id = f1a7b7b7-8cbd-499c-b7f3-2bae3645b6f5).
 *
 * 4 BLOCKING refinements:
 *  1. Order_index move: 51/140/165 → 2410/2510/2530 (165 collides with /batch ref)
 *  2. Bind canonical rule TEXT in FR-1 from testing-agent finding #11
 *  3. Add FR-1 AC: content body must NOT start with `## ` (formatSection prepends)
 *  4. Promote atomic operational order to AC (FR-6 added)
 *
 * 7 WARNINGS folded into FRs/ACs/risks/test_scenarios.
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const PRD_ID = 'SD-LEO-INFRA-CODIFY-PROTOCOL-RULES-001';
const SD_UUID = '631b09f0-5dbc-47b7-8635-919024bdb29e';
const VAL_AGENT_ID = 'f1a7b7b7-8cbd-499c-b7f3-2bae3645b6f5';

// Canonical rule texts (verbatim from testing-agent finding #11)
const RULE_LEAD_TEXT =
  'MANDATORY: Before invoking add-prd-to-database.js for harness-fix SDs whose scope touches call-site signature changes, narrow-keyword detectors, or shared-scope writer/consumer pairs, LEAD MUST invoke testing-agent prospectively (validation_mode=prospective) and route findings into PRD draft before LEAD-TO-PLAN handoff.\n\n**Why**: Two consecutive witnesses (SD-LEO-INFRA-LEO-CREATE-CROSS-001 caught a skip-list miscount; SD-LEO-INFRA-BUILDDEFAULTSMOKETESTSTEPS-KEYWORD-DETECTOR-001 caught the /leo create blind spot at line 2164 storing scope in metadata.scope, not options.scope) confirm prospective LEAD-phase testing-agent catches structural defects PRD authoring would miss.\n\n**ROI**: One prevented half-fix per SD; cost: single sub-agent call (~3 min). Eat-our-own-dogfood: this very rule was applied to its own LEAD phase (SD-LEO-INFRA-CODIFY-PROTOCOL-RULES-001 evidence row 0e13a90f-7b02-41b2-8a1e-06a97178953a). The testing-agent caught the dormant target_file column blind spot at LEAD before PRD authoring.\n\n**How to apply**: At LEAD-phase scope-lock, before running `add-prd-to-database.js`, invoke `testing-agent` via the Task tool with the SD\'s scope/key_changes/risks. Route findings into PRD `metadata.testing_agent_lead_evidence_id` and FR/TS/risk fields. Trigger keywords: harness, gate, detector, keyword list, validator, hook, sub-agent, signature, writer/consumer.';

const RULE_PLAN_TEXT =
  'MANDATORY during PRD authoring for any FR that expands a keyword/phrase list backed by `Array.prototype.some(kw => str.includes(kw))` or equivalent substring matchers: (1) list new keywords, (2) check each against existing entries for case-insensitive substring overlap, (3) drop entries fully subsumed by broader existing entries, (4) document the audit in the FR\'s acceptance_criteria.\n\n**Why**: validation-agent caught this on the "gates" entry during SD-LEO-INFRA-BUILDDEFAULTSMOKETESTSTEPS-KEYWORD-DETECTOR-001 PLAN: `gate` already substring-matches `gates`, `gateway`, `upgrade`. Adding `gates` was structural noise. Generic to any keyword-list expansion (codeKeywords, riskKeywords, schemaKeywords).\n\n**Anti-pattern example**: Adding `protocol gates` alongside existing `protocol`. Either drop the longer entry, or replace `protocol` with the more specific term and explicitly accept the broadening.\n\n**How to apply**: For every keyword-list FR expansion, include in acceptance_criteria: "Substring-redundancy audit applied: each new entry checked against all existing + sibling new entries for substring containment; redundant entries dropped with rationale."';

const RULE_EXEC_TEXT =
  'MANDATORY during EXEC for changes that add/remove DB columns or JSONB fields consumed by gates, change shared function signatures, or modify shared metadata schemas: (1) identify ALL writers AND consumers of the affected state, (2) modify writer + consumer + sibling-writers in the SAME atomic INSERT (or migration / PR), (3) add a regression test exercising both paths.\n\n**Why**: PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 has been witnessed 5 times (SD-LEO-INFRA-CLAIM-DUAL-COLUMN-001 sibling release functions, SD-LEO-INFRA-CROSS-REPO-MERGE-001 PR_MERGE_VERIFICATION scope, SD-LEO-INFRA-LEO-CREATE-CROSS-001 --target-repos, SD-LEO-INFRA-BUILDDEFAULTSMOKETESTSTEPS-KEYWORD-DETECTOR-001 plan-file path, SD-LEO-FEAT-STAGE-REJECT-KILL-001 heal-87 floor). When a writer evolves and a sibling consumer is missed, gate behavior diverges silently — usually surfacing only when a downstream SD trips the asymmetry.\n\n**Anti-pattern example**: Adding `metadata.target_repos[]` at SD creation but only updating one of two gate consumers. Surface: gate passes for the new SD but fails for an older one with the same metadata shape, or vice versa.\n\n**Atomic INSERT specific application**: When you see `UPDATE-immediately-after-INSERT` in the same script (especially for fields downstream helpers read at INSERT time), default to threading the field through the INSERT call. The plan-file path of leo-create-sd.js was a textbook case until PR #3578.\n\n**Cross-references**: migration_script_pattern, PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001.\n\n**How to apply**: Before EXEC apply, grep for the field/function name across all callers. List every writer + consumer in PR description. Add a regression test that mutates the writer and asserts every consumer behaves correctly.';

// New FR set with all refinements applied
const REFINED_FUNCTIONAL_REQUIREMENTS = [
  {
    id: 'FR-1',
    requirement:
      'Insert 3 new rows into leo_protocol_sections (one per phase) with locked section_type identifiers and CANONICAL RULE TEXT (see metadata.rule_text_lead/plan/exec for verbatim content). protocol_id resolved at apply-time via getActiveProtocol() (NOT hardcoded). Rows: (a) lead_testing_agent_harness_fix_cadence (CLAUDE_LEAD.md, order_index 2410), (b) plan_keyword_list_substring_audit (CLAUDE_PLAN.md, order_index 2510), (c) exec_atomic_insert_writer_consumer_pattern (CLAUDE_EXEC.md, order_index 2530). title field drives the H2 heading; content body MUST NOT begin with a "## " line (formatSection at section-formatters.js:26-31 strips leading same-title H2 and ALWAYS prepends `## ${title}`). Sub-headings within content use `###` or deeper.',
    acceptance_criteria: [
      'Three new rows exist in leo_protocol_sections with section_type values lead_testing_agent_harness_fix_cadence / plan_keyword_list_substring_audit / exec_atomic_insert_writer_consumer_pattern',
      'protocol_id resolved at apply-time via getActiveProtocol() — NOT hardcoded as a string literal in the migration/script',
      'order_index values 2410 / 2510 / 2530 verified collision-free via SELECT before INSERT (existing CLAUDE_LEAD top=2375, CLAUDE_PLAN top=2521, CLAUDE_EXEC top=2406)',
      'content body MUST NOT begin with `## ` heading (formatSection prepends `## ${title}` — leading `##` would double-render); use `###` or deeper for sub-headings within content',
      'content.trim().length >= 50 for all 3 rows',
      'metadata JSONB contains source_retro_id = 8bb9fe0a-2202-4bd1-b395-7d672c3794aa and witness_count fields for provenance',
      'Substring-redundancy audit applied to the 3 section_type identifiers themselves: each verified non-overlapping with existing section_type values in same target_file (per Rule #2 we are codifying)',
    ],
  },
  {
    id: 'FR-2',
    requirement:
      'Update scripts/section-file-mapping.json to register the 3 new section keys under their respective CLAUDE_*.md files. CRITICAL — this is mandatory, not optional: section-file-mapping.json is the SOLE routing source per testing-agent LEAD finding. The target_file DB column is dormant — read for diagnostics only, NOT used by file-generators.js:48-51 for routing. INSERT + JSON update + regen + tests MUST land in ONE atomic PR; partial application produces silent drop class (TS-2 explicitly tests this).',
    acceptance_criteria: [
      'scripts/section-file-mapping.json: CLAUDE_LEAD.md.sections array contains lead_testing_agent_harness_fix_cadence',
      'scripts/section-file-mapping.json: CLAUDE_PLAN.md.sections array contains plan_keyword_list_substring_audit',
      'scripts/section-file-mapping.json: CLAUDE_EXEC.md.sections array contains exec_atomic_insert_writer_consumer_pattern',
      'Each new key appears EXACTLY ONCE in its target file\'s sections array (no duplicates after re-runs)',
      'JSON file remains valid (parses without error)',
      'scripts/section-file-mapping-digest.json is NOT modified (digest size budget; full-file only by default)',
    ],
  },
  {
    id: 'FR-3',
    requirement:
      'Regenerate all 5 CLAUDE_*.md files (CLAUDE.md / CLAUDE_CORE.md / CLAUDE_LEAD.md / CLAUDE_PLAN.md / CLAUDE_EXEC.md) plus DIGEST variants by running `node scripts/generate-claude-md-from-db.js`. Generator is idempotent (writeFileAtomic for same DB snapshot) — re-running produces md5-identical files.',
    acceptance_criteria: [
      'scripts/generate-claude-md-from-db.js exits 0',
      'All 5 full files + DIGEST variants are written without error',
      'CLAUDE_LEAD.md contains "## Default Sub-Agent Invocation Cadence for Harness-Fix SDs" heading + key phrase "before PRD authoring"',
      'CLAUDE_PLAN.md contains "## Substring-Redundancy Audit for Keyword-List Expansions" heading + key phrase matching /keyword.*substring/i',
      'CLAUDE_EXEC.md contains "## Atomic INSERT Pattern for Writer/Consumer Asymmetry Fixes" heading + key phrase matching /writer.consumer/',
      'DIGEST files do NOT contain the new rule headings (digest-mapping unchanged per FR-2)',
      'Re-running regen twice produces md5-identical files (idempotency)',
    ],
  },
  {
    id: 'FR-4',
    requirement:
      'Add static-source-code regression tests at tests/unit/protocol-codification.test.js asserting the 3 rule headings and key phrases appear in their respective FULL CLAUDE_*.md files. Pattern: read full-file via fs.readFileSync, regex-match against expected H2 heading + phrase. Tests MUST NOT regenerate markdown — they assume regen has already run. Tests MUST NOT assert against DIGEST files (TS-7 negative-tests this).',
    acceptance_criteria: [
      'tests/unit/protocol-codification.test.js exists with exactly 3 vitest test cases',
      'Test 1: CLAUDE_LEAD.md contains H2 heading "## Default Sub-Agent Invocation Cadence for Harness-Fix SDs" AND phrase "before PRD authoring"',
      'Test 2: CLAUDE_PLAN.md contains H2 heading "## Substring-Redundancy Audit for Keyword-List Expansions" AND phrase matching /keyword.*substring/i',
      'Test 3: CLAUDE_EXEC.md contains H2 heading "## Atomic INSERT Pattern for Writer/Consumer Asymmetry Fixes" AND phrase matching /writer.consumer/',
      'All 3 tests pass: npx vitest run tests/unit/protocol-codification.test.js → 3/3 PASS',
      'Mutation test: temporarily remove one of the 3 sections (delete heading + body block from regenerated CLAUDE_*.md) → corresponding test FAILS; restore via re-running regen → all 3 PASS',
      'Tests do NOT spawn DB queries, regen scripts, or external processes — pure fs.readFileSync + regex (cheap, deterministic)',
    ],
  },
  {
    id: 'FR-5',
    requirement:
      'EXEC apply script must perform pre-INSERT validations and abort fail-fast on any violation, with NO partial state. Validations: (a) content.trim().length >= 50 per row, (b) section_type collision check scoped to (protocol_id, target_file) tuple — NOT globally, since section_type values like "reference" / "workflow" legitimately repeat across files, (c) order_index collision check scoped to (target_file, order_index) tuple, (d) protocol_id resolved at apply-time via getActiveProtocol() and verified non-null.',
    acceptance_criteria: [
      'INSERT script aborts with non-zero exit if any of the 3 rows has content.length < 50',
      'INSERT script aborts if any (protocol_id, target_file, section_type) tuple already exists',
      'INSERT script aborts if any (target_file, order_index) tuple already exists',
      'On any abort, NO partial INSERT (transactional or pre-flight all-or-nothing) AND NO JSON modification AND NO regen invocation',
      'Validation messages name the specific failing row + field (e.g., "FR-1 row 2 content too short: 12 chars (min 50)" not "validation failed")',
      'Re-running the apply script after a successful first run produces a clean abort on (protocol_id, target_file, section_type) collision — confirming idempotency-via-collision-check',
    ],
  },
  {
    id: 'FR-6',
    requirement:
      'EXEC apply script enforces atomic operational order: validate → INSERT → JSON update → regen → vitest → commit. Order is sequential, not parallel; deviation (especially regen-before-INSERT or vitest-before-regen) MUST fail the apply with a clear sequencing error.',
    acceptance_criteria: [
      'Apply script runs steps in this exact sequence: pre-INSERT validation, INSERT 3 rows, update section-file-mapping.json, run generate-claude-md-from-db.js, run vitest, then commit',
      'If pre-INSERT validation fails: no INSERT, no JSON change, no regen, no vitest, no commit',
      'If INSERT fails (DB error): no JSON change, no regen, no vitest, no commit; provide rollback/recovery doc reference',
      'If JSON update fails: rollback the 3 INSERTs (DELETE on (protocol_id, target_file, section_type) for the 3 rows) before exiting',
      'If regen fails: vitest skipped, exit non-zero with "regen failed — apply incomplete; manual recovery required" + 3 INSERT row IDs + JSON diff snippet for rollback',
      'If vitest fails: do NOT auto-commit; surface the failing assertion(s) and the recovery path',
      'Sequence is documented in PRD system_architecture.data_flow AND in this FR-6 AC list (eat-our-own-dogfood for Rule #3 atomic-INSERT pattern: order is part of the contract, not just data flow prose)',
    ],
  },
];

// New TS set
const REFINED_TEST_SCENARIOS = [
  { id: 'TS-1', scenario: 'Apply 3 INSERTs + JSON update + regen + tests on clean main', expected: 'All 5 CLAUDE_*.md files regenerate; LEAD/PLAN/EXEC files contain the new H2 headings + key phrases; vitest 3/3 pass; git diff shows additive-only changes (no deletions to existing sections); commit succeeds.' },
  { id: 'TS-2', scenario: 'Skip JSON update — only INSERT + regen', expected: 'Generator emits files but new sections silently dropped (testing-agent dormant-target_file finding); vitest 3/3 FAIL (rule headings absent from regenerated markdown). Validates the JSON update is mandatory and FR-2 is the routing source.' },
  { id: 'TS-3', scenario: 'Pre-INSERT collision check — attempt to INSERT a (protocol_id, target_file, section_type) tuple that already exists', expected: 'Pre-flight validator aborts with clear collision-naming message; no row INSERTed; no JSON modification; no regen; no commit.' },
  { id: 'TS-4', scenario: 'Pre-INSERT empty-content check — content < 50 chars on one of 3 rows', expected: 'Pre-flight validator aborts with "FR-1 row N content too short: M chars (min 50)" naming the specific row; no INSERT; no JSON; no regen.' },
  { id: 'TS-5', scenario: 'Mutation test — manually remove one rule section block from CLAUDE_LEAD.md after regen', expected: 'tests/unit/protocol-codification.test.js Test 1 FAILS; Tests 2 + 3 still PASS; restore via re-running regen → all 3 PASS.' },
  { id: 'TS-6', scenario: 'Re-run regen idempotency — generate-claude-md-from-db.js twice in a row', expected: 'Second run produces md5-identical files; writeFileAtomic semantics; no churn.' },
  { id: 'TS-7', scenario: 'DIGEST-file negative test — verify new rules DO NOT appear in DIGEST variants', expected: 'CLAUDE_LEAD_DIGEST.md / PLAN_DIGEST / EXEC_DIGEST do NOT contain the 3 new H2 headings (digest size budget; full-file only by default per FR-2 and section-file-mapping-digest.json unchanged).' },
  { id: 'TS-8', scenario: 'Regen partial failure — generate-claude-md-from-db.js fails midway (simulate by chmod-locking a target file pre-run)', expected: 'Apply script catches the failure, vitest is skipped, exit non-zero with rollback guidance referencing the 3 INSERT row IDs + JSON diff snippet for manual recovery. No commit.' },
  { id: 'TS-9', scenario: 'Re-run apply script idempotency — run twice in succession', expected: 'Second run aborts cleanly on (protocol_id, target_file, section_type) collision per FR-5; no DB modification; no JSON modification (or if checked, JSON sections array contains each new key EXACTLY ONCE); no regen; clear "already applied" message.' },
  { id: 'TS-10', scenario: 'Vitest-before-regen ordering — operator manually invokes vitest BEFORE regen has been run', expected: 'Tests FAIL (because CLAUDE_*.md files do not yet contain new headings) — confirms FR-6 sequence enforcement is necessary. Apply script does not invoke vitest in wrong order.' },
];

// Refined risk register
const REFINED_RISKS = [
  { risk: 'Silent rule drop if FR-2 (JSON mapping update) is skipped — same writer/consumer asymmetry the SD codifies', likelihood: 'medium', impact: 'high', mitigation: 'TS-2 explicitly tests this; FR-1+2+3+4+6 must land in ONE atomic PR; FR-6 sequencing prevents JSON update from being optional in the apply flow.' },
  { risk: 'order_index collision dropped or reordered downstream', likelihood: 'low', impact: 'medium', mitigation: 'FR-5 pre-INSERT collision check on (target_file, order_index) tuples; slots 2410/2510/2530 verified non-colliding (existing tops: LEAD 2375, PLAN 2521, EXEC 2406).' },
  { risk: 'Active protocol_id changes between PRD authoring and EXEC apply', likelihood: 'very low', impact: 'medium', mitigation: 'EXEC script reads active protocol_id at apply-time via getActiveProtocol() helper rather than hardcoding; INSERTs use that fresh value (FR-1 AC-2, FR-5 AC-d).' },
  { risk: 'CLAUDE_*.md regen overwrites someone\'s in-flight manual edits', likelihood: 'low', impact: 'low', mitigation: 'CLAUDE_*.md is gitignored from manual edits per CLAUDE.md NC-001; regeneration is the canonical source. git diff after regen confirms no unexpected non-section changes.' },
  { risk: 'Generator filter pattern not understood — sections may need additional fields beyond section_type+target_file+content', likelihood: 'low', impact: 'medium', mitigation: 'EXEC reads file-generators.js + section-formatters.js (lines 26-31 confirmed: title drives H2, content body excludes leading ##) before INSERTing; copies field shape of an existing similar-tier row (e.g., sub_agent_phase_guidance_lead) as template.' },
  { risk: 'Concurrent modification of section-file-mapping.json by another parallel session', likelihood: 'low', impact: 'medium', mitigation: 'Run `npm run session:check-concurrency` before apply per CLAUDE.md session prologue rule #8; if contention detected, isolate via `npm run session:worktree`. Apply script is a single-shot operation; conflict surfaces at git stage.' },
  { risk: 'EXEC crash between INSERT and JSON update — DB-only state class', likelihood: 'low', impact: 'high', mitigation: 'FR-6 specifies rollback path: on JSON update failure, DELETE the 3 INSERTed rows scoped to (protocol_id, target_file, section_type) before exiting. On regen failure, surface row IDs + JSON snippet for manual recovery. Apply script must wrap INSERTs in try/catch with explicit cleanup.' },
];

// Add technical_requirements (was empty — eat-our-own-dogfood)
const REFINED_TECHNICAL_REQUIREMENTS = [
  { id: 'TR-1', requirement: 'Apply script (DB-first cjs or SQL migration) uses scripts/modules/claude-md-generator/db-queries.js getActiveProtocol() to resolve protocol_id at apply-time. NEVER hardcoded.' },
  { id: 'TR-2', requirement: 'INSERTs use service-role Supabase client (process.env.SUPABASE_SERVICE_ROLE_KEY) — public/anon will fail RLS on leo_protocol_sections writes.' },
  { id: 'TR-3', requirement: 'Test file uses vitest (project default), reads CLAUDE_*.md via fs.readFileSync from path.join(__dirname, \'../../CLAUDE_LEAD.md\') etc., no DB calls.' },
  { id: 'TR-4', requirement: 'JSON update uses JSON.parse + JSON.stringify with 2-space indent to match existing section-file-mapping.json formatting; preserves key order via spread; no library required.' },
  { id: 'TR-5', requirement: 'Regen invocation is `node scripts/generate-claude-md-from-db.js` (no args) — script auto-detects active protocol from leo_protocols.status=active.' },
  { id: 'TR-6', requirement: 'Apply script emits structured progress logs at each step boundary (validate, insert, json, regen, vitest, commit) for trace-back if rollback needed.' },
];

// User stories — refined US-001 + add US-002
const REFINED_USER_STORIES = [
  {
    sd_id: SD_UUID,
    story_key: PRD_ID + ':US-001',
    title: 'Operator: 3 lessons from the harness-fix campaign become binding for every future LEAD/PLAN/EXEC phase',
    user_role: 'LEO operator running any future LEAD/PLAN/EXEC phase',
    user_want: 'the 3 protocol rules (testing-agent prospective at LEAD, substring-redundancy keyword audit, atomic INSERT pattern) to be visible in CLAUDE_LEAD.md / CLAUDE_PLAN.md / CLAUDE_EXEC.md so I read them as binding guidance, not tribal knowledge',
    user_benefit: 'the patterns persist beyond this operator\'s memory — they constrain every session, every operator, after this SD ships',
    priority: 'medium',
    status: 'ready',
    technical_notes: 'DB-first codification. INSERT 3 rows into leo_protocol_sections + update section-file-mapping.json + regen + static regression tests. Atomic application per FR-6.',
    acceptance_criteria: [
      'CLAUDE_LEAD.md contains the testing-agent prospective rule heading + body after regen',
      'CLAUDE_PLAN.md contains the substring-redundancy audit rule heading + body after regen',
      'CLAUDE_EXEC.md contains the atomic INSERT pattern rule heading + body after regen',
      'Static regression tests pass (3/3)',
      'No regression in existing CLAUDE_*.md sections',
    ],
    implementation_context: {
      files_to_modify: [
        'scripts/section-file-mapping.json (3 array updates: CLAUDE_LEAD.md.sections, CLAUDE_PLAN.md.sections, CLAUDE_EXEC.md.sections)',
        'CLAUDE.md, CLAUDE_CORE.md, CLAUDE_LEAD.md, CLAUDE_PLAN.md, CLAUDE_EXEC.md (regenerated)',
        'CLAUDE_DIGEST.md, CLAUDE_CORE_DIGEST.md, CLAUDE_LEAD_DIGEST.md, CLAUDE_PLAN_DIGEST.md, CLAUDE_EXEC_DIGEST.md (regenerated, no new content per FR-2)',
      ],
      files_to_create: [
        'tests/unit/protocol-codification.test.js (static-source-code regression tests)',
        'scripts/one-off/_apply-codify-protocol-rules.cjs (orchestrates validate → INSERT → JSON → regen → vitest)',
      ],
      apis_to_use: [
        'supabase-js with service-role key (INSERTs into leo_protocol_sections)',
        'fs.readFileSync (static assertions in tests)',
        'vitest (test runner)',
        'scripts/generate-claude-md-from-db.js (regenerator)',
        'scripts/modules/claude-md-generator/db-queries.js getActiveProtocol() (protocol_id resolution)',
      ],
      test_strategy: 'tests/unit/protocol-codification.test.js: 3 static-source-code assertions. Mutation test: remove one rule, confirm 1/3 fails. Manual smoke: run regen + grep for 3 H2 headings. Apply-script self-test: run twice → second run aborts cleanly per FR-5/TS-9.',
      technical_notes: 'Pure DB + JSON + regen + tests. ~250 LOC apply script + ~80 LOC test. Eat-our-own-dogfood: applies all 3 rules to itself.',
    },
  },
  {
    sd_id: SD_UUID,
    story_key: PRD_ID + ':US-002',
    title: 'EXEC operator: pre-INSERT validation fails fast on collisions and short content',
    user_role: 'EXEC operator running scripts/one-off/_apply-codify-protocol-rules.cjs',
    user_want: 'the apply script to validate all 3 rows BEFORE attempting any DB write, and to abort with a specific named-row-and-field error if anything fails',
    user_benefit: 'I never end up with partial state (DB rows inserted but JSON mapping stale, or vice versa) and I know exactly which row needs a fix',
    priority: 'medium',
    status: 'ready',
    technical_notes: 'Implements FR-5 + FR-6. All-or-nothing pre-flight validation; sequenced operational order with rollback paths.',
    acceptance_criteria: [
      'Apply script aborts with non-zero exit on any pre-INSERT validation failure',
      'Error message names the specific failing row and field (e.g., "FR-1 row 2: content is 12 chars, min 50")',
      'On INSERT failure: no JSON change, no regen, no commit; rollback path documented',
      'On JSON update failure: 3 INSERTed rows are DELETEd before exit',
      'On regen failure: surface row IDs + JSON snippet for manual recovery; vitest skipped; exit non-zero',
      'Re-running apply script after success aborts cleanly on collision (idempotency-via-collision-check per TS-9)',
    ],
    implementation_context: {
      files_to_modify: [],
      files_to_create: [
        'scripts/one-off/_apply-codify-protocol-rules.cjs (orchestrator with validate → INSERT → JSON → regen → vitest sequence + rollback paths)',
      ],
      apis_to_use: [
        'supabase-js (DELETE for rollback)',
        'child_process.execSync (regen + vitest invocation)',
      ],
      test_strategy: 'TS-3, TS-4, TS-8, TS-9, TS-10 collectively cover this US.',
      technical_notes: 'All branches of the FR-6 sequence diagram must have explicit code paths.',
    },
  },
];

// Refined acceptance_criteria (replaces existing array)
const REFINED_ACCEPTANCE_CRITERIA = [
  'All FRs (FR-1 through FR-6) have at least one TS demonstrating happy path',
  'Eat-our-own-dogfood applied across all 3 rules: testing-agent invoked at LEAD prospectively (evidence 0e13a90f), substring-redundancy audit applied to PRD\'s own section_type identifiers (FR-1 AC-7), atomic INSERT pattern applied to apply-script flow (FR-6)',
  'No regression in pre-existing leo_protocol_sections rows or CLAUDE_*.md content (only additive changes verifiable via git diff)',
  'Continue today\'s 0-bypass streak — no handoff.js --bypass-validation invocations across LEAD-TO-PLAN, PLAN-TO-EXEC, EXEC-TO-PLAN, PLAN-TO-LEAD, LEAD-FINAL-APPROVAL',
  'leo_protocol_sections has 3 new rows with locked section_type identifiers AND verbatim canonical rule text from testing-agent finding #11',
  'scripts/section-file-mapping.json has 3 new entries (one each in CLAUDE_LEAD/PLAN/EXEC.md sections arrays); each appearing EXACTLY ONCE',
  'Regenerated CLAUDE_LEAD.md, CLAUDE_PLAN.md, CLAUDE_EXEC.md each contain the new H2 heading + canonical rule body',
  'tests/unit/protocol-codification.test.js has 3 vitest cases that pass against regenerated markdown and fail under mutation (per TS-5)',
  'Apply script enforces FR-6 atomic operational order with rollback paths for INSERT/JSON/regen failures',
];

(async () => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: before, error: getErr } = await supabase
    .from('product_requirements_v2')
    .select('id, functional_requirements, test_scenarios, risks, technical_requirements, acceptance_criteria, metadata')
    .eq('id', PRD_ID)
    .single();

  if (getErr) { console.error('Failed to load PRD:', getErr); process.exit(1); }
  console.log('Before — FRs:', (before.functional_requirements || []).length);
  console.log('Before — TSs:', (before.test_scenarios || []).length);
  console.log('Before — Risks:', (before.risks || []).length);
  console.log('Before — TRs:', (before.technical_requirements || []).length);
  console.log('Before — ACs:', (before.acceptance_criteria || []).length);

  const newMetadata = {
    ...(before.metadata || {}),
    validation_agent_plan_evidence_id: VAL_AGENT_ID,
    rule_text_lead: RULE_LEAD_TEXT,
    rule_text_plan: RULE_PLAN_TEXT,
    rule_text_exec: RULE_EXEC_TEXT,
    refinements_applied: [
      'BLOCKING-1: order_index 51/140/165 → 2410/2510/2530 (avoid /batch ref collision at 165)',
      'BLOCKING-2: canonical rule text bound in metadata.rule_text_{lead,plan,exec}',
      'BLOCKING-3: FR-1 AC added — content body must NOT start with ## (formatSection prepends)',
      'BLOCKING-4: FR-6 promoted atomic operational order to AC',
      'WARNING: FR-5 collision scope tightened to (protocol_id, target_file, section_type) tuple',
      'WARNING: FR-1 AC-2 — protocol_id resolved via getActiveProtocol() at apply-time',
      'WARNING: 2 risks added (concurrent JSON modification, EXEC crash between INSERT and JSON)',
      'WARNING: 3 test scenarios added (TS-8 regen partial failure, TS-9 idempotency, TS-10 vitest-before-regen)',
      'WARNING: US-001 acceptance_criteria populated',
      'WARNING: technical_requirements populated (TR-1 through TR-6)',
      'WARNING: US-002 added (EXEC operator perspective)',
    ],
  };

  const { error: updErr } = await supabase
    .from('product_requirements_v2')
    .update({
      functional_requirements: REFINED_FUNCTIONAL_REQUIREMENTS,
      test_scenarios: REFINED_TEST_SCENARIOS,
      risks: REFINED_RISKS,
      technical_requirements: REFINED_TECHNICAL_REQUIREMENTS,
      acceptance_criteria: REFINED_ACCEPTANCE_CRITERIA,
      metadata: newMetadata,
    })
    .eq('id', PRD_ID);

  if (updErr) { console.error('PRD UPDATE failed:', updErr); process.exit(1); }

  // Update US-001 + insert US-002
  const { error: usDelErr } = await supabase
    .from('user_stories')
    .delete()
    .eq('story_key', PRD_ID + ':US-001');
  if (usDelErr) { console.error('US delete failed:', usDelErr); process.exit(1); }

  const { data: usData, error: usErr } = await supabase
    .from('user_stories')
    .insert(REFINED_USER_STORIES)
    .select();
  if (usErr) { console.error('US INSERT failed:', usErr); process.exit(1); }

  const { data: after } = await supabase
    .from('product_requirements_v2')
    .select('functional_requirements, test_scenarios, risks, technical_requirements, acceptance_criteria, metadata')
    .eq('id', PRD_ID)
    .single();

  console.log('---');
  console.log('After — FRs:', after.functional_requirements.length);
  console.log('After — TSs:', after.test_scenarios.length);
  console.log('After — Risks:', after.risks.length);
  console.log('After — TRs:', after.technical_requirements.length);
  console.log('After — ACs:', after.acceptance_criteria.length);
  console.log('After — User stories:', usData.length);
  console.log('After — refinements_applied count:', after.metadata.refinements_applied.length);
  console.log('OK');
})();
