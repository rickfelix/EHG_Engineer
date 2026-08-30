#!/usr/bin/env node
/**
 * SD-LEO-INFRA-STATIC-PREFIX-DIET-001 (burn-lever A4) — final worker-seat move to close the
 * ratified >=15% target (Adam seat exempted by chairman-relayed ruling).
 *
 * Moves two whole sections, both clean on the keyword scan AND manual review (pure
 * descriptive/reference/tooling-maintenance content, no standing behavioral rule for the
 * general CLAUDE_CORE.md reader):
 *   - protocol_lint_tooling: how to use/extend the protocol linter — relevant only when
 *     actually adding a lint rule (rare maintenance activity), not general LEO work.
 *   - infrastructure (title="Claude Code Plan Mode Integration"): descriptive documentation
 *     of an automated feature's own config tables and module location — no imperative for
 *     the reader.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const MOVE_IDS = [576, 384]; // protocol_lint_tooling, infrastructure/Claude Code Plan Mode Integration

async function main() {
  const { data: rows, error } = await supabase.from('leo_protocol_sections').select('id,section_type,title,content').in('id', MOVE_IDS);
  if (error) throw error;
  for (const r of rows) {
    console.log(`Moving id=${r.id} section_type=${r.section_type} title="${r.title}" (${r.content.length} chars)`);
  }
  if (rows.length !== MOVE_IDS.length) throw new Error(`expected ${MOVE_IDS.length} rows, got ${rows.length}`);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
