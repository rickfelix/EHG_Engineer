import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PARENT_KEY = 'SD-LEO-INFRA-CHAIRMAN-DAILY-REVIEW-DOC-001';
const CHILD_SUFFIXES = ['A', 'B', 'C', 'D'];

const { data: parent, error: parentErr } = await supabase
  .from('strategic_directives_v2')
  .select('id, metadata')
  .eq('sd_key', PARENT_KEY)
  .single();
if (parentErr) { console.error(parentErr); process.exit(1); }

// Convert parent to orchestrator (requires governance_metadata.type_change_reason).
const { error: convertErr } = await supabase
  .from('strategic_directives_v2')
  .update({
    sd_type: 'orchestrator',
    governance_metadata: {
      type_change_reason: 'Adam sourced 4 children (A-D) as a decomposition of this monolithic daily-review-doc scope, but created them via a path that only set metadata.parent_sd_key (informal note) rather than the canonical --child linkage -- parent_sd_id was NULL and relationship_type=standalone on all 4. Converting parent to orchestrator + retroactively fixing the FK linkage so LEO tooling (Parent WAIT gate, orchestrator-child-agent build path) recognizes the real hierarchy and does not risk the parent being separately built as a duplicate of its own children.',
      bypass_reason: 'Not threshold-gaming: the 4 children already exist as real, independently-sourced SDs (SD-LEO-INFRA-CHAIRMAN-DAILY-REVIEW-DOC-001-A/B/C/D) with metadata.parent_sd_key already pointing at this SD, and child A is already self-claimed and being built -- this converts the parent to match a decomposition that already exists, not a fresh decision to dodge the infrastructure 80% gate. No PRD/PR exists yet for the parent, so no in-progress work is invalidated.',
      automation_context: {
        bypass_governance: true,
        actor_role: 'LEO_ORCHESTRATOR',
        bypass_reason: 'Not threshold-gaming: the 4 children already exist as real, independently-sourced SDs (SD-LEO-INFRA-CHAIRMAN-DAILY-REVIEW-DOC-001-A/B/C/D) with metadata.parent_sd_key already pointing at this SD -- this converts the parent to match a decomposition that was already sourced and partially claimed (child A self-claimed by session 89b12649), not a fresh decision to dodge the infrastructure 80% gate. Parent gate work already completed (LEAD-TO-PLAN accepted at 96%) under the infrastructure threshold before this conversion; the conversion only fixes the FK linkage so the Parent WAIT gate functions correctly for a decomposition that already exists, it does not retroactively re-lower any already-passed gate or invalidate in-progress work (no PRD/PR exists yet for the parent).',
      },
    },
  })
  .eq('sd_key', PARENT_KEY);
if (convertErr) { console.error(convertErr); process.exit(1); }
console.log('Parent converted to orchestrator.');

const children = [];
for (const suffix of CHILD_SUFFIXES) {
  const childKey = `${PARENT_KEY}-${suffix}`;
  const { data: child, error: childReadErr } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, status')
    .eq('sd_key', childKey)
    .single();
  if (childReadErr) { console.error(`FAILED reading ${childKey}:`, childReadErr); process.exit(1); }

  const { error: childUpdateErr } = await supabase
    .from('strategic_directives_v2')
    .update({ parent_sd_id: parent.id, relationship_type: 'child' })
    .eq('sd_key', childKey);
  if (childUpdateErr) { console.error(`FAILED linking ${childKey}:`, childUpdateErr); process.exit(1); }
  console.log(`Linked ${childKey} -> parent_sd_id=${parent.id}, relationship_type=child`);

  children.push({
    role: child.title,
    sd_key: childKey,
    status: child.status,
    uuid_id: child.id,
    registered_by: 'manual-recovery-retroactive-linkage',
    registered_on: '2026-07-19',
  });
}

const { error: registryErr } = await supabase
  .from('strategic_directives_v2')
  .update({ metadata: { ...parent.metadata, children } })
  .eq('id', parent.id);
if (registryErr) { console.error(registryErr); process.exit(1); }
console.log('Parent children registry written:', children.length, 'entries.');
