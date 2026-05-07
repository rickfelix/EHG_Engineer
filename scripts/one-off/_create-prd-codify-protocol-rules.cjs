#!/usr/bin/env node
/**
 * One-off: insert PRD for SD-LEO-INFRA-CODIFY-PROTOCOL-RULES-001.
 * Incorporates testing-agent prospective findings (sub_agent_execution_results.id =
 * 0e13a90f-7b02-41b2-8a1e-06a97178953a) with the locked section identifiers,
 * dormant target_file finding, atomic operational order, and regression test
 * placement.
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SD_KEY = 'SD-LEO-INFRA-CODIFY-PROTOCOL-RULES-001';
const SD_UUID = '631b09f0-5dbc-47b7-8635-919024bdb29e';
const ACTIVE_PROTOCOL_ID = 'leo-v4-3-3-ui-parity';
const SOURCE_RETRO_ID = '8bb9fe0a-2202-4bd1-b395-7d672c3794aa';
const TESTING_AGENT_LEAD_EVIDENCE_ID = '0e13a90f-7b02-41b2-8a1e-06a97178953a';

const PRD = {
  id: SD_KEY,
  directive_id: SD_KEY,
  sd_id: SD_UUID,
  title: 'Codify 3 protocol rules from harness campaign retro into leo_protocol_sections',
  version: '1.0.0',
  status: 'approved',
  category: 'technical',
  priority: 'medium',
  phase: 'PLAN',
  document_type: 'prd',

  executive_summary:
    'Three lessons from the 4-SD harness-fix campaign (retro 8bb9fe0a-2202-4bd1-b395-7d672c3794aa) currently live only in operator-local MEMORY.md and the read-only retrospective row. Lift them into the binding protocol layer by inserting 3 new rows into leo_protocol_sections (one per phase), updating scripts/section-file-mapping.json (the SOLE routing source — target_file column is read-cosmetically by the generator, not for routing), regenerating the 5 CLAUDE_*.md files, and pinning the rules with static-source-code regression tests. Eat-our-own-dogfood: this SD applies rule #1 (testing-agent prospective at LEAD before PRD authoring) to its own LEAD phase — testing-agent caught the dormant-target_file structural blind spot during prospective review, which is now FR-2 of this PRD.',

  business_context:
    'Memory entries are operator-local — they only constrain the session that wrote them. Retrospective rows are not consulted by gates. Binding rules live in CLAUDE_*.md sections regenerated from leo_protocol_sections; that is where every LEAD/PLAN/EXEC phase reads guidance. Without codification, the 3 rules — testing-agent prospective LEAD cadence, substring-redundancy keyword audit, atomic INSERT pattern — remain tribal knowledge dependent on memory carry-over. Codifying them makes the patterns binding for every operator and every session, closing the harness-hardening campaign\'s knowledge-transfer loop.',

  technical_context:
    'leo_protocol_sections is the source of truth (cols: id, protocol_id, section_type, title, content, order_index, metadata, context_tier, target_file, priority, anchor_topic, etc.). Generator entry is scripts/generate-claude-md-from-db.js → modules at scripts/modules/claude-md-generator/{db-queries.js,file-generators.js,section-formatters.js,index.js}. Critical dormant-column finding (testing-agent LEAD): the generator filters by section_type membership in scripts/section-file-mapping.json — the target_file DB column is NEVER read for routing (153 rows with NULL target_file render correctly via the JSON). This means a row INSERTed with the right target_file but missing from the JSON is SILENTLY DROPPED — the same writer/consumer asymmetry pattern (PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001) that this very SD codifies. Active protocol_id is leo-v4-3-3-ui-parity (version 4.4.1).',

  functional_requirements: [
    {
      id: 'FR-1',
      requirement: 'Insert 3 new rows into leo_protocol_sections (one per phase) with locked section_type identifiers from testing-agent: (a) lead_testing_agent_harness_fix_cadence (CLAUDE_LEAD.md, order_index 51), (b) plan_keyword_list_substring_audit (CLAUDE_PLAN.md, order_index 140), (c) exec_atomic_insert_writer_consumer_pattern (CLAUDE_EXEC.md, order_index 165). Each row: protocol_id=leo-v4-3-3-ui-parity, target_file set for parity (free upside even though dormant for routing), title set, content >=50 chars, anchor_topic set for cross-reference clarity, metadata { source_retro_id, witness_count } for provenance.',
      acceptance_criteria: [
        'Three new rows exist in leo_protocol_sections with section_type values lead_testing_agent_harness_fix_cadence / plan_keyword_list_substring_audit / exec_atomic_insert_writer_consumer_pattern',
        'All 3 rows have protocol_id = leo-v4-3-3-ui-parity',
        'All 3 rows have content.trim().length >= 50',
        'order_index values 51 / 140 / 165 do not collide with any existing row in the same target_file cluster',
        'metadata JSONB contains source_retro_id = ' + SOURCE_RETRO_ID + ' for provenance',
      ],
    },
    {
      id: 'FR-2',
      requirement: 'Update scripts/section-file-mapping.json to register the 3 new section keys under their respective CLAUDE_*.md files. CRITICAL — this is mandatory, not optional: section-file-mapping.json is the SOLE routing source per testing-agent LEAD finding. INSERT + JSON update + regen + tests MUST land in ONE atomic PR; partial application produces silent drop class.',
      acceptance_criteria: [
        'scripts/section-file-mapping.json: CLAUDE_LEAD.md.sections array contains lead_testing_agent_harness_fix_cadence',
        'scripts/section-file-mapping.json: CLAUDE_PLAN.md.sections array contains plan_keyword_list_substring_audit',
        'scripts/section-file-mapping.json: CLAUDE_EXEC.md.sections array contains exec_atomic_insert_writer_consumer_pattern',
        'JSON file remains valid (parses without error)',
        'No section_key collisions with existing entries in the JSON',
      ],
    },
    {
      id: 'FR-3',
      requirement: 'Regenerate all 5 CLAUDE_*.md files (CLAUDE.md / CLAUDE_CORE.md / CLAUDE_LEAD.md / CLAUDE_PLAN.md / CLAUDE_EXEC.md) plus DIGEST variants by running scripts/generate-claude-md-from-db.js. Generator is idempotent (writeFileAtomic for same DB snapshot) — re-running is safe.',
      acceptance_criteria: [
        'scripts/generate-claude-md-from-db.js exits 0',
        'All 5 full files + DIGEST variants are written without error',
        'CLAUDE_LEAD.md contains the testing-agent prospective LEAD cadence rule (heading + key phrase)',
        'CLAUDE_PLAN.md contains the substring-redundancy audit rule (heading + key phrase)',
        'CLAUDE_EXEC.md contains the atomic INSERT pattern rule (heading + key phrase)',
        'DIGEST files do NOT contain the new rules (digest size budget — full-file only)',
      ],
    },
    {
      id: 'FR-4',
      requirement: 'Add static-source-code regression tests at tests/unit/protocol-codification.test.js asserting the 3 rule headings and key phrases appear in their respective CLAUDE_*.md files. Pattern: read full-file via fs.readFileSync, regex-match against expected heading + phrase. Test file should NOT assert against DIGEST files. (Action item #3 from source retro — adopting static source-code assertion pattern.)',
      acceptance_criteria: [
        'tests/unit/protocol-codification.test.js exists with >=3 vitest test cases',
        'Test 1: CLAUDE_LEAD.md contains "## " heading mentioning testing-agent prospective + phrase "before PRD authoring"',
        'Test 2: CLAUDE_PLAN.md contains "## " heading + phrase matching /keyword.*substring/i',
        'Test 3: CLAUDE_EXEC.md contains "## " heading + phrase matching /writer.consumer/',
        'All 3 tests pass: npx vitest run tests/unit/protocol-codification.test.js',
        'Mutation test: temporarily delete one of the 3 CLAUDE_*.md sections → corresponding test fails (≥1 of 3 assertions FAIL); restore → tests pass again',
        'Tests do NOT regenerate the markdown — they assume regen has already run (cheap, deterministic, no DB calls)',
      ],
    },
    {
      id: 'FR-5',
      requirement: 'Pre-INSERT validations (per testing-agent LEAD recommendation #6): the EXEC implementation script must validate before INSERT — content.trim().length >= 50, section_type collision check (does a row with the same section_type already exist for this protocol?), order_index collision check (does a row with the same target_file + order_index pair already exist?). Fail fast with clear error if any validation fails; do NOT proceed to JSON update or regen.',
      acceptance_criteria: [
        'INSERT script aborts with non-zero exit if any of the 3 rows has content.length < 50',
        'INSERT script aborts if any section_type collides with existing leo_protocol_sections row in same protocol',
        'INSERT script aborts if any (target_file, order_index) pair collides with existing row',
        'On any abort, NO partial INSERT (transactional or pre-flight all-or-nothing)',
        'Validation messages name the specific failing row/field',
      ],
    },
  ],

  test_scenarios: [
    { id: 'TS-1', scenario: 'Apply 3 INSERTs + JSON update + regen on clean main', expected: 'All 5 CLAUDE_*.md files regenerate; LEAD/PLAN/EXEC files contain the new rule headings + phrases; vitest 3/3 pass; git diff shows additive-only changes (no deletions)' },
    { id: 'TS-2', scenario: 'Skip JSON update — only INSERT + regen', expected: 'Generator still emits files but new sections silently dropped (testing-agent dormant-target_file finding); vitest 3/3 FAIL (rule headings absent from regenerated markdown). Validates that the JSON update is mandatory.' },
    { id: 'TS-3', scenario: 'Pre-INSERT collision check — attempt to INSERT a section_type that already exists', expected: 'Pre-flight validator aborts with clear "section_type collision" message; no row INSERTed; no JSON modification; no regen' },
    { id: 'TS-4', scenario: 'Pre-INSERT empty-content check — content < 50 chars', expected: 'Pre-flight validator aborts with "content too short" message naming the specific row; no INSERT' },
    { id: 'TS-5', scenario: 'Mutation test — manually remove the testing-agent prospective rule paragraph from CLAUDE_LEAD.md after regen', expected: 'tests/unit/protocol-codification.test.js Test 1 FAILS; Tests 2 + 3 still PASS; restore via re-running regen → all 3 PASS' },
    { id: 'TS-6', scenario: 'Re-run regen idempotency — generate-claude-md-from-db.js twice in a row', expected: 'Second run produces identical files (md5 match); writeFileAtomic semantics; no churn' },
    { id: 'TS-7', scenario: 'DIGEST-file negative test — verify new rules DO NOT appear in DIGEST variants', expected: 'CLAUDE_LEAD_DIGEST.md / PLAN_DIGEST / EXEC_DIGEST do NOT contain the 3 new headings (digest size budget; full-file only by default)' },
  ],

  risks: [
    { risk: 'Silent rule drop if FR-2 (JSON mapping update) is skipped — same writer/consumer asymmetry the SD codifies', likelihood: 'medium', impact: 'high', mitigation: 'TS-2 explicitly tests this; FR-1+2+3+4 must land in ONE atomic PR; pre-INSERT validator (FR-5) does not catch this on its own — only TS-2 does.' },
    { risk: 'order_index collision dropped or reordered downstream', likelihood: 'low', impact: 'medium', mitigation: 'FR-5 pre-INSERT collision check on (target_file, order_index) tuples; testing-agent reserved 51/140/165 against current cluster ranges (CLAUDE_LEAD 1..2375, CLAUDE_PLAN 1..2521, CLAUDE_EXEC 1..2406).' },
    { risk: 'Active protocol_id changes between PRD authoring and EXEC apply', likelihood: 'very low', impact: 'medium', mitigation: 'EXEC script reads active protocol_id at apply-time via getActiveProtocol() helper rather than hardcoding; INSERTs use that fresh value.' },
    { risk: 'CLAUDE_*.md regen overwrites someone\'s in-flight manual edits', likelihood: 'low', impact: 'low', mitigation: 'CLAUDE_*.md is gitignored from manual edits per CLAUDE.md NC-001; regeneration is the canonical source. git diff after regen confirms no unexpected non-section changes.' },
    { risk: 'Generator filter pattern not understood — sections may need additional fields beyond section_type+target_file+content', likelihood: 'low', impact: 'medium', mitigation: 'EXEC reads file-generators.js + section-formatters.js to confirm the filter signature before INSERTing; copies the field shape of an existing similar-tier row (e.g., sub_agent_phase_guidance_lead) as template.' },
  ],

  system_architecture: {
    components: [
      'leo_protocol_sections (DB) — source of truth for section content',
      'scripts/section-file-mapping.json — sole routing source (which sections appear in which CLAUDE_*.md file)',
      'scripts/generate-claude-md-from-db.js — entry point; delegates to scripts/modules/claude-md-generator/*',
      'CLAUDE_*.md (5 files) + DIGEST variants — regenerated, gitignored from manual edits',
      'tests/unit/protocol-codification.test.js — static-source-code regression tests',
    ],
    data_flow:
      'EXEC apply: validate 3 rows pre-INSERT → INSERT 3 rows into leo_protocol_sections → update section-file-mapping.json (CLAUDE_LEAD.md/PLAN/EXEC sections arrays) → run scripts/generate-claude-md-from-db.js → generator queries leo_protocol_sections (filtered by section_type via mapping JSON) → emits 5 markdown files + DIGEST variants → vitest reads regenerated files via fs.readFileSync and asserts heading+phrase presence → commit all changes (DB migration SQL or one-off cjs + JSON update + regenerated markdown + test file) atomically.',
  },

  acceptance_criteria: [
    'All FRs have at least one TS demonstrating happy path',
    'Eat-our-own-dogfood: this SD\'s LEAD phase used testing-agent prospectively, evidence row ' + TESTING_AGENT_LEAD_EVIDENCE_ID + ' demonstrates the rule in action',
    'No regression in pre-existing leo_protocol_sections rows or CLAUDE_*.md content (only additive changes)',
    'Continue today\'s 0-bypass streak — no handoff.js --bypass-validation invocations',
    'leo_protocol_sections has 3 new rows with locked section_type identifiers (lead_testing_agent_harness_fix_cadence / plan_keyword_list_substring_audit / exec_atomic_insert_writer_consumer_pattern)',
    'scripts/section-file-mapping.json has 3 new entries in CLAUDE_LEAD/PLAN/EXEC.md sections arrays',
    'Regenerated CLAUDE_LEAD.md, CLAUDE_PLAN.md, CLAUDE_EXEC.md each contain the new rule heading + key phrase',
    'tests/unit/protocol-codification.test.js has 3 vitest cases that pass against regenerated markdown and fail under mutation',
  ],

  metadata: {
    source_retrospective_id: SOURCE_RETRO_ID,
    testing_agent_lead_evidence_id: TESTING_AGENT_LEAD_EVIDENCE_ID,
    testing_agent_findings_addressed: [
      'Locked section_type identifiers (lead_testing_agent_harness_fix_cadence, plan_keyword_list_substring_audit, exec_atomic_insert_writer_consumer_pattern)',
      'target_file column is dormant — section-file-mapping.json is the SOLE routing source — addressed in FR-2 + TS-2',
      'NEW sections (not amendments) — adjacency audit confirms no semantic overlap with existing sections',
      'Regression tests at tests/unit/protocol-codification.test.js — full-file only, NOT digest — addressed in FR-4',
      'Pre-INSERT validations (content >= 50, section_type collision, order_index collision) — addressed in FR-5',
      'Atomic operational order: validate → INSERT → JSON update → regen → vitest → commit',
      'sub_agent_execution_results.verdict enum is UPPERCASE (PASS/FAIL/BLOCKED/VALID/NOT_REQUIRED) — schema-gotcha witnessed',
    ],
    eat_own_dogfood: true,
  },
};

const USER_STORIES = [
  {
    sd_id: SD_UUID,
    story_key: SD_KEY + ':US-001',
    title: 'Operator: 3 lessons from the harness-fix campaign become binding for every future LEAD/PLAN/EXEC phase',
    user_role: 'LEO operator running any future LEAD/PLAN/EXEC phase',
    user_want: 'the 3 protocol rules (testing-agent prospective at LEAD, substring-redundancy keyword audit, atomic INSERT pattern) to be visible in CLAUDE_LEAD.md / CLAUDE_PLAN.md / CLAUDE_EXEC.md so I read them as binding guidance, not tribal knowledge',
    user_benefit: 'the patterns persist beyond this operator\'s memory — they constrain every session, every operator, after this SD ships',
    priority: 'medium',
    status: 'ready',
    technical_notes: 'DB-first codification. INSERT 3 rows into leo_protocol_sections + update section-file-mapping.json + regen + static regression tests. Atomic application.',
    implementation_context: {
      files_to_modify: [
        'scripts/section-file-mapping.json (3 array updates: CLAUDE_LEAD.md.sections, CLAUDE_PLAN.md.sections, CLAUDE_EXEC.md.sections)',
        'CLAUDE.md, CLAUDE_CORE.md, CLAUDE_LEAD.md, CLAUDE_PLAN.md, CLAUDE_EXEC.md (regenerated, not directly edited)',
        'CLAUDE_DIGEST.md, CLAUDE_CORE_DIGEST.md, CLAUDE_LEAD_DIGEST.md, CLAUDE_PLAN_DIGEST.md, CLAUDE_EXEC_DIGEST.md (regenerated, no new content per FR-3)',
      ],
      files_to_create: [
        'tests/unit/protocol-codification.test.js (static-source-code regression tests)',
        'database/migrations/<ts>_codify_protocol_rules.sql (3 INSERTs into leo_protocol_sections) — OR one-off cjs depending on EXEC-time decision',
        'scripts/one-off/_apply-codify-protocol-rules.cjs (if SQL migration not preferred)',
      ],
      apis_to_use: [
        'supabase-js (INSERTs into leo_protocol_sections)',
        'fs.readFileSync (static assertions in tests)',
        'vitest (test runner)',
        'scripts/generate-claude-md-from-db.js (regenerator)',
      ],
      test_strategy: 'tests/unit/protocol-codification.test.js: 3 static-source-code assertions reading regenerated CLAUDE_LEAD/PLAN/EXEC.md. Mutation test: remove one rule, confirm 1/3 fails. Manual smoke: run regen + grep for 3 headings.',
      technical_notes: 'Pure DB + JSON + regen + tests. ~200 LOC. Eat-our-own-dogfood: applies rule 1 to itself.',
    },
  },
];

(async () => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: prdData, error: prdErr } = await supabase
    .from('product_requirements_v2')
    .insert(PRD)
    .select()
    .single();
  if (prdErr) { console.error('PRD INSERT ERROR:', prdErr); process.exit(1); }
  console.log('✅ PRD inserted:', prdData.id);
  console.log('   sd_id:', prdData.sd_id);
  console.log('   status:', prdData.status);
  console.log('   FR count:', PRD.functional_requirements.length);
  console.log('   TS count:', PRD.test_scenarios.length);
  console.log('   Risks:', PRD.risks.length);

  const { data: usData, error: usErr } = await supabase
    .from('user_stories')
    .insert(USER_STORIES)
    .select();
  if (usErr) { console.error('USER_STORIES INSERT ERROR:', usErr); process.exit(1); }
  console.log('✅ User stories inserted:', usData.length);
  for (const u of usData) console.log('   -', u.story_key, '|', u.title);
})();
