#!/usr/bin/env node
/**
 * SD-LEO-INFRA-STATIC-PREFIX-DIET-001 (burn-lever A4) — split leo_protocol_sections id=444
 * (migration_execution_protocol) into a short binding rule (stays in CLAUDE_CORE.md) and a
 * long reference tail (the Tiered Auto-Apply Policy mechanics, moves to CLAUDE_CORE_MANUAL.md
 * as a new section_type: migration_tier_policy_detail).
 *
 * The binding rule kept inline: "INVOKE the DATABASE sub-agent rather than writing execution
 * scripts yourself" + its Why + the sub-agent's automatic-blocker handling + the invocation
 * snippet. This is what a worker needs on EVERY turn that might touch a migration.
 *
 * The moved tail: TIER-1/TIER-2 classifier definitions, feature-flag polarity detail, the
 * Adam-delegated-apply scope-check nuance — consulted only when actually classifying a
 * migration's risk tier or auditing the flag, not on every turn.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const MARKER = '---\n\n## Tiered Auto-Apply Policy';

async function main() {
  const { data: row, error: e0 } = await supabase.from('leo_protocol_sections').select('*').eq('id', 444).single();
  if (e0) throw e0;
  if (row.section_type !== 'migration_execution_protocol') throw new Error(`unexpected row: ${JSON.stringify(row.section_type)}`);

  const idx = row.content.indexOf(MARKER);
  if (idx < 0) throw new Error('split marker not found — content may have changed since this script was authored');

  const head = row.content.slice(0, idx).replace(/\s+$/, '');
  const tail = row.content.slice(idx + '---\n\n'.length);

  const newHead = `${head}\n\n> Full tiered auto-apply policy mechanics (TIER-1/TIER-2 definitions, feature-flag polarity, Adam-delegated-apply scope check): see CLAUDE_CORE_MANUAL.md.\n`;

  const { data: maxRow, error: e1 } = await supabase.from('leo_protocol_sections').select('order_index').order('order_index', { ascending: false }).limit(1).single();
  if (e1) throw e1;
  const newOrderIndex = maxRow.order_index + 1;

  const tailTitle = 'Tiered Auto-Apply Policy (SD-LEO-INFRA-MIGRATION-TIER-CLASSIFIER-001)';

  const { error: eUpdate } = await supabase.from('leo_protocol_sections').update({ content: newHead }).eq('id', 444);
  if (eUpdate) throw eUpdate;

  const { data: inserted, error: eInsert } = await supabase.from('leo_protocol_sections').insert({
    protocol_id: row.protocol_id,
    section_type: 'migration_tier_policy_detail',
    title: tailTitle,
    content: tail,
    order_index: newOrderIndex,
    context_tier: 'REFERENCE',
    target_file: null,
    priority: 'STANDARD',
    metadata: {
      category: 'reference',
      source_sd: 'SD-LEO-INFRA-STATIC-PREFIX-DIET-001',
      split_from_section_id: 444,
      publication_note: 'Routed via section-file-mapping by section_type.',
      publication_status: 'file',
    },
  }).select('id').single();
  if (eInsert) throw eInsert;

  console.log('Split complete. New row id:', inserted.id, 'order_index:', newOrderIndex);
  console.log('Head new length:', newHead.length, '(was', row.content.length, ')');
  console.log('Tail (new row) length:', tail.length);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
