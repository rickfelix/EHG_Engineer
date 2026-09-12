#!/usr/bin/env node
// QF-20260911-848: CLAUDE_MICHAEL.md section 6 (leo_protocol_sections.section_type=
// michael_role_contract) documents `brief-assemble.mjs --inline`, a flag the script does
// not expose (scripts/michael/brief-assemble.mjs only supports --apply, --et-date, --json).
// The offer described ("assemble the brief now" when today's row is absent/unverified)
// requires a live write, so the real invocation is --apply. One-off, run once with --apply.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const WRONG = 'offer `brief-assemble.mjs --inline`';
const RIGHT = 'offer `brief-assemble.mjs --apply`';

async function main() {
  const { data, error } = await supabase
    .from('leo_protocol_sections')
    .select('id, content')
    .eq('section_type', 'michael_role_contract')
    .single();
  if (error || !data) {
    console.error('[qf-848] could not read michael_role_contract section:', error?.message);
    process.exit(1);
  }
  if (!data.content.includes(WRONG)) {
    console.log(`[qf-848] "${WRONG}" not found — already fixed or content changed. No-op.`);
    return;
  }
  const fixed = data.content.split(WRONG).join(RIGHT);
  const apply = process.argv.includes('--apply');
  if (!apply) {
    console.log('[qf-848] DRY-RUN. Would replace:');
    console.log(`  - ${WRONG}`);
    console.log(`  + ${RIGHT}`);
    console.log('Re-run with --apply to write.');
    return;
  }
  const { error: updateError } = await supabase
    .from('leo_protocol_sections')
    .update({ content: fixed })
    .eq('id', data.id);
  if (updateError) {
    console.error('[qf-848] update failed:', updateError.message);
    process.exit(1);
  }
  console.log(`[qf-848] michael_role_contract (id=${data.id}) updated: "${WRONG}" -> "${RIGHT}"`);
}

if (isMainModule(import.meta.url)) {
  main();
}
