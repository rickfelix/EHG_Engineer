#!/usr/bin/env node
/**
 * Enrich SD-LEO-INFRA-CODIFY-PROTOCOL-RULES-001 with full scope, key_changes,
 * description, and success_criteria. Sourced from retrospective
 * 8bb9fe0a-2202-4bd1-b395-7d672c3794aa protocol_improvements array.
 */
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SD_KEY = 'SD-LEO-INFRA-CODIFY-PROTOCOL-RULES-001';
const SOURCE_RETRO_ID = '8bb9fe0a-2202-4bd1-b395-7d672c3794aa';

const description = [
  'Lift three lessons-learned from retrospective ' + SOURCE_RETRO_ID + ' (5th SD of the harness-fix campaign)',
  'into the binding protocol layer. The lessons currently live only in MEMORY.md (operator-local) and the',
  'retrospective row (read-only, not consulted at gate time). This SD persists them as new rows in',
  'leo_protocol_sections so they regenerate into CLAUDE_LEAD.md / CLAUDE_PLAN.md / CLAUDE_EXEC.md and become',
  'mandatory reading for every future LEAD/PLAN/EXEC phase, not just my future sessions. The three rules:',
  '(1) testing-agent prospective at LEAD before PRD authoring for harness-fix SDs that touch call-site',
  'signature changes, narrow-keyword detectors, or shared-scope writer/consumer pairs',
  '(2) substring-redundancy audit for keyword-list expansions backed by Array.prototype.some(includes)',
  '(3) atomic INSERT pattern for writer/consumer asymmetry (PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001).'
].join(' ');

const scope = [
  'IN-SCOPE:',
  '1. Add 3 new rows to leo_protocol_sections (one per phase: LEAD, PLAN, EXEC) with proper section_type, target_file, order_index, priority, anchor_topic, content, and metadata fields.',
  '2. Update scripts/section-file-mapping.json to register the 3 new section keys under their respective CLAUDE_*.md files (CLAUDE_LEAD.md / CLAUDE_PLAN.md / CLAUDE_EXEC.md).',
  '3. Run scripts/generate-claude-md-from-db.js to regenerate the 5 CLAUDE_*.md files.',
  '4. Add static-source-code regression tests asserting the 3 rule headings and key phrases appear in their respective CLAUDE_*.md files (read via fs.readFileSync, regex-match — pattern from action_items #3 of source retro).',
  '',
  'OUT-OF-SCOPE:',
  '- Audit of sibling buildDefault* helpers (action_items #1, low priority — separate SD).',
  '- Retrofitting other createSD callers with createOptions.scope threading (action_items #2, low priority — only when defect emerges).',
  '- Single-step PRD INSERT canonical script (action_items #4, medium priority — orthogonal concern, separate SD).',
  '- Editing CLAUDE_*.md markdown directly (would be overwritten by next regen; DB-first is the only correct path).'
].join('\n');

const keyChanges = [
  { change: 'Insert leo_protocol_sections row: testing-agent prospective LEAD cadence rule', impact: 'Future LEAD phases see the rule and invoke testing-agent before PRD authoring on harness fixes' },
  { change: 'Insert leo_protocol_sections row: substring-redundancy audit for keyword list expansions', impact: 'Future PLAN phases catch substring-contained keyword entries during PRD authoring (e.g., gates ⊃ gate)' },
  { change: 'Insert leo_protocol_sections row: atomic INSERT pattern for writer/consumer asymmetry', impact: 'Future EXEC phases default to threading fields through INSERT instead of UPDATE-after-INSERT' },
  { change: 'Update scripts/section-file-mapping.json to route 3 new sections to LEAD/PLAN/EXEC files', impact: 'Generator picks up new sections in next CLAUDE_*.md regen' },
  { change: 'Regenerate CLAUDE_*.md files via scripts/generate-claude-md-from-db.js', impact: 'Phase digests + full files contain new rules — binding from next session onward' },
  { change: 'Add 3 static-source-code regression tests asserting rule presence in regenerated CLAUDE_*.md', impact: 'Pin invariants — future regen drift fails test loudly instead of silently dropping rules' }
];

const successCriteria = [
  { criterion: 'leo_protocol_sections has 3 new rows (LEAD, PLAN, EXEC) with the 3 rule contents', measure: 'SELECT COUNT(*) FROM leo_protocol_sections WHERE anchor_topic IN (...) returns 3' },
  { criterion: 'CLAUDE_LEAD.md contains heading and key phrase for testing-agent prospective LEAD cadence rule', measure: 'fs.readFileSync(CLAUDE_LEAD.md).match(/testing-agent prospective.*harness-fix/) is truthy' },
  { criterion: 'CLAUDE_PLAN.md contains heading and key phrase for substring-redundancy audit rule', measure: 'fs.readFileSync(CLAUDE_PLAN.md).match(/substring-redundancy.*keyword/) is truthy' },
  { criterion: 'CLAUDE_EXEC.md contains heading and key phrase for atomic INSERT pattern rule', measure: 'fs.readFileSync(CLAUDE_EXEC.md).match(/atomic INSERT.*writer.consumer/) is truthy' },
  { criterion: 'scripts/section-file-mapping.json lists 3 new section keys under correct files', measure: 'JSON.parse(...).CLAUDE_LEAD.md.sections.includes(new-key) for each phase' },
  { criterion: 'Static regression tests pass and would fail if any rule heading/phrase is missing', measure: 'vitest run on new test file: 3/3 pass; mutate one CLAUDE_*.md file in test → 1/3 fail' },
  { criterion: 'No regression in existing CLAUDE_*.md content', measure: 'git diff CLAUDE_*.md shows only additions (3 new sections), no deletions/modifications to existing sections' },
  { criterion: '0 bypass quota consumed across all 5 handoffs', measure: 'audit_log no bypass entries for this SD' }
];

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: before, error: getErr } = await sb
    .from('strategic_directives_v2')
    .select('id, sd_key, title, status, description, scope, key_changes, success_criteria, metadata')
    .eq('sd_key', SD_KEY)
    .single();

  if (getErr) { console.error('Failed to load SD:', getErr); process.exit(1); }
  console.log('Before — description word count:', (before.description || '').split(/\s+/).filter(Boolean).length);
  console.log('Before — scope length:', (before.scope || '').length);
  console.log('Before — key_changes count:', (before.key_changes || []).length);
  console.log('Before — success_criteria count:', (before.success_criteria || []).length);

  const newMetadata = {
    ...(before.metadata || {}),
    source_retrospective_id: SOURCE_RETRO_ID,
    source_retro_protocol_improvements_count: 3,
    eat_own_dogfood: true,
    eat_own_dogfood_note: 'This SD applies rule #1 (testing-agent prospective at LEAD) to itself.'
  };

  const { error: updErr } = await sb
    .from('strategic_directives_v2')
    .update({
      description,
      scope,
      key_changes: keyChanges,
      success_criteria: successCriteria,
      metadata: newMetadata
    })
    .eq('sd_key', SD_KEY);

  if (updErr) { console.error('Update failed:', updErr); process.exit(1); }

  const { data: after } = await sb
    .from('strategic_directives_v2')
    .select('description, scope, key_changes, success_criteria, metadata')
    .eq('sd_key', SD_KEY)
    .single();

  console.log('---');
  console.log('After — description word count:', after.description.split(/\s+/).filter(Boolean).length);
  console.log('After — scope length:', after.scope.length);
  console.log('After — key_changes count:', after.key_changes.length);
  console.log('After — success_criteria count:', after.success_criteria.length);
  console.log('After — metadata keys:', Object.keys(after.metadata));
  console.log('OK');
}

main().catch(err => { console.error(err); process.exit(1); });
