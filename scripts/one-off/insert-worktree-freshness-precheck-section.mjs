#!/usr/bin/env node
/**
 * SD-LEO-FIX-PAYMENT-RAIL-RETRO-001 / FR-1
 *
 * Adds a standing EXEC-phase pre-check: verify worktree freshness against
 * origin/main before concluding referenced code is missing. Sourced from the
 * SD-LEO-INFRA-PAYMENT-RAIL-ATTRIBUTION-002 retrospective — a 9-minute-stale
 * worktree made another session's in-flight PR #5783 (landing the exact
 * function that SD's rationale depended on) look like a phantom-completed
 * sibling SD instead of a routine staleness gap in the heavily-parallel fleet.
 *
 * Idempotent: deletes any prior row with the same section_type before insert.
 *
 * Run once: node scripts/one-off/insert-worktree-freshness-precheck-section.mjs
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const content = `## Worktree Freshness Pre-Check (Before Declaring Code Missing)

**Before concluding that referenced code, a function, or a sibling SD's deliverable is missing or phantom-incomplete**, verify your worktree is current against \`origin/main\` first:

\`\`\`bash
git fetch origin main
git log origin/main --oneline -10 -- <suspected-missing-path>
\`\`\`

If the merges show recent activity on the path in question, the "missing" code may simply be behind an unmerged/unpulled commit from another session — a routine staleness gap, not a real defect or an incomplete sibling SD.

> Why: In a heavily-parallel multi-session fleet, merges land every few minutes. A 9-minute-stale worktree once made another session's in-flight PR (#5783, landing the exact function an SD's rationale depended on) look like a phantom-completed sibling SD, costing real investigation time chasing a non-issue. This pre-check is cheap (one \`git fetch\` + \`git log\`) relative to the cost of a false "code is missing" conclusion driving wrong downstream decisions (SD-LEO-FIX-PAYMENT-RAIL-RETRO-001).`;

const SECTION_TYPE = 'worktree_freshness_precheck';

await supabase.from('leo_protocol_sections').delete().eq('section_type', SECTION_TYPE);

const { data, error } = await supabase.from('leo_protocol_sections').insert({
  protocol_id: 'leo-v4-3-3-ui-parity',
  section_type: SECTION_TYPE,
  title: 'Worktree Freshness Pre-Check (Before Declaring Code Missing)',
  content,
  order_index: 2540,
  context_tier: 'PHASE_EXEC',
  priority: 'STANDARD',
  target_file: 'CLAUDE_EXEC.md',
  metadata: { sd_key: 'SD-LEO-FIX-PAYMENT-RAIL-RETRO-001', source_retro_sd: 'SD-LEO-INFRA-PAYMENT-RAIL-ATTRIBUTION-002', incident: 'PR #5783 stale-worktree false-phantom-sibling' },
}).select('id').single();

if (error) { console.error('INSERT ERR:', error.message); process.exit(1); }
console.log('Inserted id:', data.id);

const { data: check } = await supabase.from('leo_protocol_sections').select('content').eq('id', data.id).single();
console.log('HAS "git fetch origin main":', check.content.includes('git fetch origin main'));
console.log('LEN:', check.content.length);
