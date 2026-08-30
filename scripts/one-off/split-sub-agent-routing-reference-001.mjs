#!/usr/bin/env node
/**
 * SD-LEO-INFRA-STATIC-PREFIX-DIET-001 (burn-lever A4) — split leo_protocol_sections id=538
 * (sub_agent_routing_reference) into the binding rules (stay in CLAUDE_CORE.md: "Always use
 * Sonnet never Haiku", "invoke immediately, no manual workarounds", error-routing rule, and
 * the MCP read/write split + apply_migration block) and the 16-row keyword-to-agent lookup
 * table + invocation pattern (moves to CLAUDE_CORE_MANUAL.md — the section's own text already
 * calls it "a quick reference" for a table whose canonical source is config/agent-keywords-
 * routing.json, so this is genuinely reference material, not a behavioral rule).
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const { data: row, error: e0 } = await supabase.from('leo_protocol_sections').select('*').eq('id', 538).single();
  if (e0) throw e0;
  if (row.section_type !== 'sub_agent_routing_reference') throw new Error(`unexpected row: ${JSON.stringify(row.section_type)}`);

  const tableStart = row.content.indexOf('| Agent | Trigger Keywords');
  const invocEnd = row.content.indexOf('### MCP Read/Write Split');
  if (tableStart < 0 || invocEnd < 0) throw new Error('split markers not found — content may have changed since this script was authored');

  const head = row.content.slice(0, tableStart).replace(/\s+$/, '');
  const movedTable = row.content.slice(tableStart, invocEnd).trim();
  const tail = row.content.slice(invocEnd);

  const newHead = `${head}\n\n> Full agent/keyword lookup table + invocation pattern: see CLAUDE_CORE_MANUAL.md (canonical routing source is \`config/agent-keywords-routing.json\`; this pointer is a convenience, not a new source of truth).\n\n${tail}`;

  const { data: maxRow, error: e1 } = await supabase.from('leo_protocol_sections').select('order_index').order('order_index', { ascending: false }).limit(1).single();
  if (e1) throw e1;
  const newOrderIndex = maxRow.order_index + 1;

  const { error: eUpdate } = await supabase.from('leo_protocol_sections').update({ content: newHead }).eq('id', 538);
  if (eUpdate) throw eUpdate;

  const { data: inserted, error: eInsert } = await supabase.from('leo_protocol_sections').insert({
    protocol_id: row.protocol_id,
    section_type: 'sub_agent_routing_table_detail',
    title: 'Sub-Agent Keyword Routing Table',
    content: `## Sub-Agent Keyword Routing Table\n\n${movedTable}`,
    order_index: newOrderIndex,
    context_tier: 'REFERENCE',
    target_file: null,
    priority: 'STANDARD',
    metadata: {
      category: 'reference',
      source_sd: 'SD-LEO-INFRA-STATIC-PREFIX-DIET-001',
      split_from_section_id: 538,
      publication_note: 'Routed via section-file-mapping by section_type.',
      publication_status: 'file',
    },
  }).select('id').single();
  if (eInsert) throw eInsert;

  console.log('Split complete. New row id:', inserted.id, 'order_index:', newOrderIndex);
  console.log('Head new length:', newHead.length, '(was', row.content.length, ')');
  console.log('Moved table length:', movedTable.length);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
