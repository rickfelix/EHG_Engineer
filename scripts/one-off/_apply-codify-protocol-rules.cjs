#!/usr/bin/env node
/**
 * EXEC apply orchestrator for SD-LEO-INFRA-CODIFY-PROTOCOL-RULES-001.
 *
 * Sequence (FR-6, atomic operational order — deviation MUST fail):
 *   validate → INSERT (3 rows) → JSON update → regen → vitest → (commit)
 *
 * Rollback paths:
 *   - validate fails: no DB change, no JSON change, no regen
 *   - INSERT fails:   no JSON change, no regen
 *   - JSON fails:     DELETE 3 INSERTed rows before exit
 *   - regen fails:    surface row IDs + JSON snippet for manual recovery; vitest skipped
 *   - vitest fails:   do NOT auto-commit; surface failing assertions
 *
 * Idempotency: re-running aborts cleanly on (protocol_id, target_file, section_type)
 * collision per FR-5 / TS-9.
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PRD_ID = 'SD-LEO-INFRA-CODIFY-PROTOCOL-RULES-001';
const SOURCE_RETRO_ID = '8bb9fe0a-2202-4bd1-b395-7d672c3794aa';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MAPPING_JSON_PATH = path.join(REPO_ROOT, 'scripts', 'section-file-mapping.json');

// Verbatim from PRD metadata.rule_text_{lead,plan,exec} (no leading ## per FR-1 AC-4)
const RULE_LEAD_TEXT =
  'MANDATORY: Before invoking add-prd-to-database.js for harness-fix SDs whose scope touches call-site signature changes, narrow-keyword detectors, or shared-scope writer/consumer pairs, LEAD MUST invoke testing-agent prospectively (validation_mode=prospective) and route findings into PRD draft before LEAD-TO-PLAN handoff.\n\n' +
  '### Why\n\n' +
  'Two consecutive witnesses (SD-LEO-INFRA-LEO-CREATE-CROSS-001 caught a skip-list miscount; SD-LEO-INFRA-BUILDDEFAULTSMOKETESTSTEPS-KEYWORD-DETECTOR-001 caught the /leo create blind spot at line 2164 storing scope in metadata.scope, not options.scope) confirm prospective LEAD-phase testing-agent catches structural defects PRD authoring would miss.\n\n' +
  '### ROI\n\n' +
  'One prevented half-fix per SD; cost: single sub-agent call (~3 min). Eat-our-own-dogfood: this very rule was applied to its own LEAD phase (SD-LEO-INFRA-CODIFY-PROTOCOL-RULES-001 evidence row 0e13a90f-7b02-41b2-8a1e-06a97178953a). The testing-agent caught the dormant target_file column blind spot at LEAD before PRD authoring.\n\n' +
  '### How to Apply\n\n' +
  'At LEAD-phase scope-lock, before running `add-prd-to-database.js`, invoke `testing-agent` via the Task tool with the SD\'s scope/key_changes/risks. Route findings into PRD `metadata.testing_agent_lead_evidence_id` and FR/TS/risk fields. Trigger keywords: harness, gate, detector, keyword list, validator, hook, sub-agent, signature, writer/consumer.';

const RULE_PLAN_TEXT =
  'MANDATORY during PRD authoring for any FR that expands a keyword/phrase list backed by `Array.prototype.some(kw => str.includes(kw))` or equivalent substring matchers: (1) list new keywords, (2) check each against existing entries for case-insensitive substring overlap, (3) drop entries fully subsumed by broader existing entries, (4) document the audit in the FR\'s acceptance_criteria.\n\n' +
  '### Why\n\n' +
  'validation-agent caught this on the "gates" entry during SD-LEO-INFRA-BUILDDEFAULTSMOKETESTSTEPS-KEYWORD-DETECTOR-001 PLAN: `gate` already substring-matches `gates`, `gateway`, `upgrade`. Adding `gates` was structural noise. Generic to any keyword-list expansion (codeKeywords, riskKeywords, schemaKeywords).\n\n' +
  '### Anti-Pattern Example\n\n' +
  'Adding `protocol gates` alongside existing `protocol`. Either drop the longer entry, or replace `protocol` with the more specific term and explicitly accept the broadening.\n\n' +
  '### How to Apply\n\n' +
  'For every keyword-list FR expansion, include in acceptance_criteria: "Substring-redundancy audit applied: each new entry checked against all existing + sibling new entries for substring containment; redundant entries dropped with rationale."';

const RULE_EXEC_TEXT =
  'MANDATORY during EXEC for changes that add/remove DB columns or JSONB fields consumed by gates, change shared function signatures, or modify shared metadata schemas: (1) identify ALL writers AND consumers of the affected state, (2) modify writer + consumer + sibling-writers in the SAME atomic INSERT (or migration / PR), (3) add a regression test exercising both paths.\n\n' +
  '### Why\n\n' +
  'PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 has been witnessed 5 times (SD-LEO-INFRA-CLAIM-DUAL-COLUMN-001 sibling release functions, SD-LEO-INFRA-CROSS-REPO-MERGE-001 PR_MERGE_VERIFICATION scope, SD-LEO-INFRA-LEO-CREATE-CROSS-001 --target-repos, SD-LEO-INFRA-BUILDDEFAULTSMOKETESTSTEPS-KEYWORD-DETECTOR-001 plan-file path, SD-LEO-FEAT-STAGE-REJECT-KILL-001 heal-87 floor). When a writer evolves and a sibling consumer is missed, gate behavior diverges silently — usually surfacing only when a downstream SD trips the asymmetry.\n\n' +
  '### Anti-Pattern Example\n\n' +
  'Adding `metadata.target_repos[]` at SD creation but only updating one of two gate consumers. Surface: gate passes for the new SD but fails for an older one with the same metadata shape, or vice versa.\n\n' +
  '### Atomic INSERT Specific Application\n\n' +
  'When you see `UPDATE-immediately-after-INSERT` in the same script (especially for fields downstream helpers read at INSERT time), default to threading the field through the INSERT call. The plan-file path of leo-create-sd.js was a textbook case until PR #3578.\n\n' +
  '### Cross-References\n\n' +
  '- migration_script_pattern\n' +
  '- PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001\n\n' +
  '### How to Apply\n\n' +
  'Before EXEC apply, grep for the field/function name across all callers. List every writer + consumer in PR description. Add a regression test that mutates the writer and asserts every consumer behaves correctly.';

const ROW_SPECS = [
  {
    section_type: 'lead_testing_agent_harness_fix_cadence',
    title: 'Default Sub-Agent Invocation Cadence for Harness-Fix SDs',
    target_file: 'CLAUDE_LEAD.md',
    order_index: 2410,
    context_tier: 'PHASE_LEAD',
    priority: 'STANDARD',
    anchor_topic: 'sub_agent_phase_guidance_lead',
    content: RULE_LEAD_TEXT,
  },
  {
    section_type: 'plan_keyword_list_substring_audit',
    title: 'Substring-Redundancy Audit for Keyword-List Expansions',
    target_file: 'CLAUDE_PLAN.md',
    order_index: 2510,
    context_tier: 'PHASE_PLAN',
    priority: 'STANDARD',
    anchor_topic: 'prd_template_scaffold',
    content: RULE_PLAN_TEXT,
  },
  {
    section_type: 'exec_atomic_insert_writer_consumer_pattern',
    title: 'Atomic INSERT Pattern for Writer/Consumer Asymmetry Fixes',
    target_file: 'CLAUDE_EXEC.md',
    order_index: 2530,
    context_tier: 'PHASE_EXEC',
    priority: 'STANDARD',
    anchor_topic: 'migration_script_pattern',
    content: RULE_EXEC_TEXT,
  },
];

function fail(stage, message, extra) {
  console.error('\n❌ APPLY FAILED at stage: ' + stage);
  console.error('   ' + message);
  if (extra) console.error('   ' + JSON.stringify(extra, null, 2));
  process.exit(1);
}

function logStep(label) {
  console.log('\n— ' + label + ' —');
}

async function getActiveProtocolId(sb) {
  const { data, error } = await sb
    .from('leo_protocols')
    .select('id, version, status')
    .eq('status', 'active');
  if (error) fail('protocol-resolution', 'leo_protocols query failed: ' + error.message);
  if (!data || data.length === 0) fail('protocol-resolution', 'No active protocol found in leo_protocols');
  if (data.length > 1) fail('protocol-resolution', 'Multiple active protocols — ambiguous: ' + JSON.stringify(data.map(d => d.id)));
  return data[0].id;
}

async function preInsertValidate(sb, protocolId) {
  // Per-row content length
  for (const [i, row] of ROW_SPECS.entries()) {
    const len = (row.content || '').trim().length;
    if (len < 50) {
      fail('pre-insert-validate', `FR-1 row ${i + 1} (${row.section_type}): content too short (${len} chars, min 50)`);
    }
    if (/^##\s/.test(row.content)) {
      fail('pre-insert-validate', `FR-1 row ${i + 1} (${row.section_type}): content body starts with '## ' — formatSection prepends heading; would double-render`);
    }
  }
  console.log('  ✓ All 3 content bodies >= 50 chars and do not start with ##');

  // (protocol_id, target_file, section_type) collisions
  for (const row of ROW_SPECS) {
    const { data, error } = await sb
      .from('leo_protocol_sections')
      .select('id, section_type, target_file')
      .eq('protocol_id', protocolId)
      .eq('target_file', row.target_file)
      .eq('section_type', row.section_type);
    if (error) fail('pre-insert-validate', 'collision check query failed: ' + error.message);
    if (data && data.length > 0) {
      fail('pre-insert-validate',
        `Section_type collision: (${protocolId}, ${row.target_file}, ${row.section_type}) already exists as id=${data[0].id}. Already applied — aborting cleanly per FR-5.`);
    }
  }
  console.log('  ✓ No (protocol_id, target_file, section_type) collisions');

  // (target_file, order_index) collisions on active protocol
  for (const row of ROW_SPECS) {
    const { data, error } = await sb
      .from('leo_protocol_sections')
      .select('id, section_type, order_index')
      .eq('protocol_id', protocolId)
      .eq('target_file', row.target_file)
      .eq('order_index', row.order_index);
    if (error) fail('pre-insert-validate', 'order collision check failed: ' + error.message);
    if (data && data.length > 0) {
      fail('pre-insert-validate',
        `order_index collision: (${row.target_file}, ${row.order_index}) already used by id=${data[0].id} (${data[0].section_type}). Choose a different order_index.`);
    }
  }
  console.log('  ✓ No (target_file, order_index) collisions');
}

async function insertRows(sb, protocolId) {
  const rowsToInsert = ROW_SPECS.map(r => ({
    protocol_id: protocolId,
    section_type: r.section_type,
    title: r.title,
    content: r.content,
    target_file: r.target_file,
    order_index: r.order_index,
    context_tier: r.context_tier,
    priority: r.priority,
    anchor_topic: r.anchor_topic,
    metadata: {
      source_retrospective_id: SOURCE_RETRO_ID,
      witness_count: 5,
      added_by_sd: PRD_ID,
      added_at: new Date().toISOString(),
    },
  }));

  const { data, error } = await sb
    .from('leo_protocol_sections')
    .insert(rowsToInsert)
    .select('id, section_type, target_file, order_index');

  if (error) fail('insert', 'leo_protocol_sections INSERT failed: ' + error.message, { error });
  console.log('  ✓ Inserted 3 rows:');
  data.forEach(r => console.log(`     id=${r.id} | ${r.target_file} | ${r.section_type} | order=${r.order_index}`));
  return data.map(r => r.id);
}

async function rollbackRows(sb, rowIds) {
  if (!rowIds || rowIds.length === 0) return;
  console.error('  Rolling back ' + rowIds.length + ' INSERT(s)...');
  const { error } = await sb.from('leo_protocol_sections').delete().in('id', rowIds);
  if (error) console.error('  Rollback DELETE failed: ' + error.message + ' — manual cleanup needed for IDs: ' + rowIds.join(', '));
  else console.error('  Rolled back ' + rowIds.length + ' rows');
}

function updateMappingJson() {
  const raw = fs.readFileSync(MAPPING_JSON_PATH, 'utf8');
  const mapping = JSON.parse(raw);

  const targets = [
    { file: 'CLAUDE_LEAD.md', key: 'lead_testing_agent_harness_fix_cadence' },
    { file: 'CLAUDE_PLAN.md', key: 'plan_keyword_list_substring_audit' },
    { file: 'CLAUDE_EXEC.md', key: 'exec_atomic_insert_writer_consumer_pattern' },
  ];

  for (const t of targets) {
    if (!mapping[t.file]) throw new Error(`section-file-mapping.json missing key ${t.file}`);
    if (!Array.isArray(mapping[t.file].sections)) throw new Error(`${t.file}.sections is not an array`);
    if (mapping[t.file].sections.includes(t.key)) {
      throw new Error(`${t.file}.sections already contains ${t.key} — collision; aborting`);
    }
    mapping[t.file].sections.push(t.key);
  }

  // Preserve 2-space indent + trailing newline (matches existing format)
  fs.writeFileSync(MAPPING_JSON_PATH, JSON.stringify(mapping, null, 2) + '\n', 'utf8');
  console.log('  ✓ Added 3 section keys to scripts/section-file-mapping.json');
}

function regenerateClaudeFiles() {
  try {
    execSync('node scripts/generate-claude-md-from-db.js', {
      cwd: REPO_ROOT,
      stdio: 'inherit',
    });
  } catch (err) {
    throw new Error('generate-claude-md-from-db.js failed: ' + err.message);
  }
  console.log('  ✓ CLAUDE_*.md files regenerated');
}

function runVitest() {
  try {
    execSync('npx vitest run tests/unit/protocol-codification.test.js', {
      cwd: REPO_ROOT,
      stdio: 'inherit',
    });
  } catch (err) {
    throw new Error('vitest failed: ' + err.message);
  }
  console.log('  ✓ vitest 3/3 passed');
}

(async () => {
  console.log('═════════════════════════════════════════════════════════');
  console.log('  EXEC apply: codify protocol rules into leo_protocol_sections');
  console.log('  Sequence: validate → INSERT → JSON → regen → vitest');
  console.log('═════════════════════════════════════════════════════════');

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  logStep('Step 0: Resolve active protocol_id');
  const protocolId = await getActiveProtocolId(sb);
  console.log('  ✓ active protocol_id = ' + protocolId);

  logStep('Step 1: Pre-INSERT validation (FR-5)');
  await preInsertValidate(sb, protocolId);

  logStep('Step 2: INSERT 3 rows into leo_protocol_sections (FR-1)');
  const insertedIds = await insertRows(sb, protocolId);

  logStep('Step 3: Update scripts/section-file-mapping.json (FR-2)');
  try {
    updateMappingJson();
  } catch (err) {
    console.error('  ❌ JSON update failed: ' + err.message);
    await rollbackRows(sb, insertedIds);
    fail('json-update', err.message);
  }

  logStep('Step 4: Regenerate CLAUDE_*.md files (FR-3)');
  try {
    regenerateClaudeFiles();
  } catch (err) {
    console.error('  ❌ Regen failed. INSERTed row IDs: ' + insertedIds.join(', '));
    console.error('  Manual recovery: revert section-file-mapping.json change AND DELETE these rows.');
    fail('regen', err.message);
  }

  logStep('Step 5: Run vitest (FR-4)');
  try {
    runVitest();
  } catch (err) {
    console.error('  ❌ vitest failed. Apply state: DB INSERTed + JSON updated + regen done.');
    console.error('  Recovery: review failing assertions; markdown content may need refinement.');
    fail('vitest', err.message);
  }

  console.log('\n═════════════════════════════════════════════════════════');
  console.log('  ✅ APPLY COMPLETE');
  console.log('  - 3 leo_protocol_sections rows: ' + insertedIds.join(', '));
  console.log('  - section-file-mapping.json: 3 new keys');
  console.log('  - CLAUDE_*.md files regenerated');
  console.log('  - tests/unit/protocol-codification.test.js: 3/3 PASS');
  console.log('  Next: stage + commit (manual)');
  console.log('═════════════════════════════════════════════════════════');
})();
