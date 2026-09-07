// QF-20260907-188: three seats independently carried a wrong note that quick_fixes has no key
// column and must be joined by title -- the schema fact (id IS the key) had no authoritative
// home, so each seat carried its own private note and three got it wrong the same way. This
// inserts the fact where every seat reads it: a new leo_protocol_sections row, wired into
// CLAUDE_CORE.md, CLAUDE_ADAM.md, CLAUDE_SOLOMON.md, CLAUDE_COORDINATOR.md via
// scripts/section-file-mapping.json (SHARED section, referenced by section_type).
//
// Run once: node scripts/one-off/qf-20260907-188-quick-fixes-schema-traps.mjs
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SECTION_TYPE = 'quick_fixes_schema_traps';

const content = `**quick_fixes**: \`id\` IS the key and holds the literal string \`QF-YYYYMMDD-NNN\` (e.g. \`QF-20260907-188\`) -- there is no \`qf_key\` column. Filter dedup/lookup queries on \`id\`; use \`title\`/\`description\` via \`ilike\` for fuzzy SEARCH only, never as a join/match key. A query selecting a nonexistent \`qf_key\` column errors at PostgREST, the client sees \`data: null\`, and a bare \`if (data && data.length)\` guard prints nothing -- reading as "no existing QF" while the query never ran. (\`lib/learning/feedback-clusterer.js\`'s title-similarity clustering is a deliberate exception -- it groups by title for clustering, not for keying, and must not be "fixed".)

**quick_fixes.disposition** IN (\`premise_resolved\`, \`premise_unverified_stale\`, \`duplicate_of\`, \`re_verified\`, \`promoted\`).

**adam_task_ledger.status** IN (\`open\`, \`in_progress\`, \`blocked\`, \`done\`, \`cancelled\`) -- there is no \`closed\` value.

**chairman_ratifications.id** is a UUID column -- Postgres has no \`ilike\`/\`~~*\` operator for \`uuid\`, so an \`ilike\` filter on it errors ("operator does not exist: uuid ~~* unknown"). Match on \`id\` via \`eq\` (full UUID) or read rows and filter client-side by string prefix for a short-form citation.`;

async function main() {
  const { data: existing, error: existingErr } = await supabase
    .from('leo_protocol_sections')
    .select('id')
    .eq('section_type', SECTION_TYPE)
    .maybeSingle();
  if (existingErr) throw existingErr;
  if (existing) {
    console.log(`Section already exists (id=${existing.id}) -- not inserting a duplicate.`);
    return;
  }

  const { data, error } = await supabase
    .from('leo_protocol_sections')
    .insert({
      protocol_id: 'leo-v4-3-3-ui-parity',
      section_type: SECTION_TYPE,
      title: 'Schema Key & Constraint Traps (quick_fixes / adam_task_ledger / chairman_ratifications)',
      content,
      order_index: 2700,
      context_tier: 'REFERENCE',
      priority: 'STANDARD',
      metadata: {
        category: 'reference',
        source_qf: 'QF-20260907-188',
        publication_note: 'Routed via section-file-mapping by section_type.',
        publication_status: 'file',
      },
    })
    .select('id')
    .single();
  if (error) throw error;
  console.log(`Inserted leo_protocol_sections row id=${data.id}, section_type=${SECTION_TYPE}`);
}

main().catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});
