/**
 * SD-LEO-INFRA-ROLE-PARTNERSHIP-CONTRACT-001 — codify the Coordinator<->Adam autonomous
 * partnership ONCE as a governed shared leo_protocol_sections row (section_type=
 * 'role_partnership_contract'), and REMOVE the interim AUTONOMOUS-PARTNERSHIP-2026-06-22
 * hand-edit blocks from sections 601 (adam_role_contract) + 605 (coordinator_role_contract).
 *
 * DRY-RUN by default (prints the plan, mutates nothing). Pass --apply to execute.
 * Reversible: the interim block text is printed before removal; the new row is removable by
 * section_type. Idempotent: skips the INSERT if a role_partnership_contract row already exists,
 * and skips the strip if the marker is already absent.
 *
 * DB writes use the supabase SERVICE client (MCP apply_migration is read-only; the service
 * client writes leo_protocol_sections like any table — same path used for strategic_directives_v2).
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const APPLY = process.argv.includes('--apply');
const MARKER = 'AUTONOMOUS-PARTNERSHIP-2026-06-22';
const MARKER_COMMENT = `<!-- ${MARKER} -->`;

const PARTNERSHIP_TITLE = 'Coordinator ↔ Adam Autonomous Partnership (shared role contract)';
const PARTNERSHIP_CONTENT =
  "**Coordinator ↔ Adam autonomous partnership (shared)** — On harness/sourcing work the " +
  "COORDINATOR is the decider/manager for work-shaping, scope, tiering, dedup, and dispatch; " +
  "ADAM authors the DRAFT SDs/QFs (DOC-001 — sourcing is Adam's lane) and routes shaping/scope/" +
  "dispatch decisions to the coordinator, NOT up to the chairman. The two form a JOINT RATIONALE " +
  "and PROCEED autonomously — operational calls are never bounced to the operator. Escalate to " +
  "the chairman/operator ONLY for genuine AUTHORITY (vision, revenue, policy) or IRREVERSIBLE/" +
  "destructive actions. (Unchanged: the chairman may direct either role directly.) Role-agnostic — " +
  "a future role-session (e.g. Solomon) inherits this posture by inclusion.\n\n" +
  "_Single governed source of truth (section_type=role_partnership_contract), included — not " +
  "copied — into the Adam and Coordinator role files via section-file-mapping.json; supersedes " +
  "the interim hand-edits formerly in the two role contracts and the Adam private-memory note " +
  "(SD-LEO-INFRA-ROLE-PARTNERSHIP-CONTRACT-001)._";

function stripInterim(content) {
  const pos = content.indexOf(MARKER_COMMENT);
  if (pos === -1) return { changed: false, next: content, removed: '' };
  const next = content.slice(0, pos).replace(/\s+$/, '');
  return { changed: true, next, removed: content.slice(pos) };
}

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
  const s = createClient(url, key);

  console.log(`\n=== role_partnership_contract section ${APPLY ? '(APPLY)' : '(DRY-RUN — pass --apply to execute)'} ===\n`);

  // ── FR-1: INSERT the shared section (idempotent) ──
  const { data: existing, error: exErr } = await s
    .from('leo_protocol_sections').select('id').eq('section_type', 'role_partnership_contract');
  if (exErr) { console.error('lookup failed:', exErr.message); process.exit(1); }

  if (existing && existing.length > 0) {
    console.log(`FR-1: role_partnership_contract already exists (id=${existing.map(r => r.id).join(',')}) — skip INSERT.`);
  } else {
    // id is hand-assigned on this table (no usable default → pkey collision on bare insert).
    const { data: maxRow, error: maxErr } = await s
      .from('leo_protocol_sections').select('id').order('id', { ascending: false }).limit(1).single();
    if (maxErr) { console.error('max(id) lookup failed:', maxErr.message); process.exit(1); }
    const nextId = maxRow.id + 1;
    const row = {
      id: nextId,
      section_type: 'role_partnership_contract',
      title: PARTNERSHIP_TITLE,
      content: PARTNERSHIP_CONTENT,
      protocol_id: 'leo-v4-3-3-ui-parity',
      context_tier: 'REFERENCE',
      order_index: 2630,
      priority: 'STANDARD',
      target_file: null,
      metadata: { shared: true, sd: 'SD-LEO-INFRA-ROLE-PARTNERSHIP-CONTRACT-001', supersedes: ['interim blocks in 601+605', 'memory feedback-adam-lean-on-coordinator-not-chairman'] },
    };
    console.log('FR-1: INSERT row =>', JSON.stringify({ ...row, content: row.content.slice(0, 80) + '…' }, null, 2));
    if (APPLY) {
      const { data, error } = await s.from('leo_protocol_sections').insert(row).select('id').single();
      if (error) { console.error('INSERT failed:', error.message); process.exit(1); }
      console.log(`  ✓ inserted id=${data.id}`);
    }
  }

  // ── FR-3: strip interim blocks from 601 + 605 ──
  for (const id of [601, 605]) {
    const { data, error } = await s.from('leo_protocol_sections').select('content').eq('id', id).single();
    if (error) { console.error(`read ${id} failed:`, error.message); process.exit(1); }
    const { changed, next, removed } = stripInterim(data.content);
    if (!changed) { console.log(`FR-3: id=${id} — no ${MARKER} block (already clean).`); continue; }
    console.log(`FR-3: id=${id} — strip ${removed.length} chars (len ${data.content.length} -> ${next.length}). Removed head: ${removed.slice(0, 90).replace(/\n/g, ' ')}…`);
    if (APPLY) {
      const { error: upErr } = await s.from('leo_protocol_sections').update({ content: next }).eq('id', id);
      if (upErr) { console.error(`update ${id} failed:`, upErr.message); process.exit(1); }
      console.log(`  ✓ stripped id=${id}`);
    }
  }

  console.log(`\n${APPLY ? '✅ APPLIED' : 'DRY-RUN complete — re-run with --apply'}\n`);
}

main().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
