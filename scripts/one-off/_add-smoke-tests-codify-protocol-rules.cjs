#!/usr/bin/env node
/**
 * Add smoke_test_steps to SD-LEO-INFRA-CODIFY-PROTOCOL-RULES-001.
 * The SD was created when the local main was 6 commits behind origin/main —
 * before SD #4's detector expansion (10→23 keywords) had been pulled locally.
 * Now that we're caught up, populate smoke_test_steps directly.
 */
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SD_KEY = 'SD-LEO-INFRA-CODIFY-PROTOCOL-RULES-001';

const TITLE = 'Codify 3 protocol rules from harness campaign retro 8bb9fe0a into leo_protocol_sections';

const smokeTestSteps = [
  {
    step_number: 1,
    instruction: 'Run scripts/generate-claude-md-from-db.js after the 3 INSERTs are applied to leo_protocol_sections (LEAD/PLAN/EXEC sections) and section-file-mapping.json is updated.',
    expected_outcome: 'Generator exits 0; CLAUDE.md, CLAUDE_CORE.md, CLAUDE_LEAD.md, CLAUDE_PLAN.md, CLAUDE_EXEC.md (and DIGEST variants) are written without error.'
  },
  {
    step_number: 2,
    instruction: 'Read the regenerated CLAUDE_LEAD.md, CLAUDE_PLAN.md, CLAUDE_EXEC.md and confirm each contains the new section heading and key phrase: testing-agent prospective LEAD cadence (LEAD), substring-redundancy keyword audit (PLAN), atomic INSERT for writer/consumer asymmetry (EXEC).',
    expected_outcome: 'All 3 rule headings + key phrases present in the corresponding markdown files (verifiable via grep / static-source-code regression tests).'
  },
  {
    step_number: 3,
    instruction: 'Confirm no regression in existing CLAUDE_*.md content via git diff — only additions for the 3 new sections, no deletions or modifications to pre-existing sections. Run vitest for the static-source-code regression tests added by this SD.',
    expected_outcome: 'git diff shows additive-only changes to CLAUDE_*.md; vitest run passes 3/3 protocol-codification assertions; mutating any one CLAUDE_*.md file in test fails the corresponding assertion.'
  }
];

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: before, error: getErr } = await sb
    .from('strategic_directives_v2')
    .select('id, sd_key, title, smoke_test_steps')
    .eq('sd_key', SD_KEY)
    .single();

  if (getErr) { console.error('Failed to load SD:', getErr); process.exit(1); }
  console.log('Before — smoke_test_steps:', JSON.stringify(before.smoke_test_steps));
  console.log('Before — count:', (before.smoke_test_steps || []).length);

  const { error: updErr } = await sb
    .from('strategic_directives_v2')
    .update({ smoke_test_steps: smokeTestSteps })
    .eq('sd_key', SD_KEY);

  if (updErr) { console.error('Update failed:', updErr); process.exit(1); }

  const { data: after } = await sb
    .from('strategic_directives_v2')
    .select('smoke_test_steps')
    .eq('sd_key', SD_KEY)
    .single();

  console.log('---');
  console.log('After — count:', after.smoke_test_steps.length);
  console.log('After — steps:');
  after.smoke_test_steps.forEach(s => console.log('  ', s.step_number, '|', s.instruction.slice(0, 80) + '...'));
  console.log('OK');
}

main().catch(err => { console.error(err); process.exit(1); });
