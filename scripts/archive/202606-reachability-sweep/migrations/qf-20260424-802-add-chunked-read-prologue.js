#!/usr/bin/env node
/**
 * QF-20260424-802: Add item #9 to CLAUDE.md Session Prologue surfacing the
 * chunked-read rule so sessions see it BEFORE loading CLAUDE_CORE.md (where
 * the detailed rule lives at lines 98-112). Idempotent: only appends when
 * the marker "**Chunked reads allowed**" is not already present.
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const RULE_ADDITION = `
9. **Chunked reads allowed** — \`Read\` has a 25k-token per-call cap (hard-coded Claude Code limit, NOT context exhaustion). Paginate with \`offset\`/\`limit\` or invoke \`/read-full <path>\`; use \`*_DIGEST.md\` for phase docs. Never \`cat\` via Bash (tighter ~30k char cap).
> Why: The 25k cap is per Read call (Claude Code issues #40357/#14888/#15687), independent of the 1M context window. Misinterpreting it as "context too small" causes silent partial-reads of protocol files — the leading cause of LEO compliance drift in long sessions.`;

const MARKER = '**Chunked reads allowed**';

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data, error } = await supabase
    .from('leo_protocol_sections')
    .select('id, content')
    .eq('section_type', 'session_prologue')
    .eq('protocol_id', 'leo-v4-3-3-ui-parity')
    .single();

  if (error) throw error;
  if (data.content.includes(MARKER)) {
    console.log(`[qf-802] Already present; no change. id=${data.id}`);
    return;
  }

  const updated = data.content.trimEnd() + '\n' + RULE_ADDITION + '\n';
  const { error: updErr } = await supabase
    .from('leo_protocol_sections')
    .update({ content: updated })
    .eq('id', data.id);

  if (updErr) throw updErr;
  console.log(`[qf-802] Appended rule #9 to section id=${data.id} (now ${updated.length} chars)`);
}

main().catch((e) => {
  console.error('[qf-802] FAILED:', e.message);
  process.exit(1);
});
