#!/usr/bin/env node
/**
 * record-fr-descope — approver-gated descope of a functional requirement.
 * SD-LEO-INFRA-HARDEN-LEO-COMPLETION-001.
 *
 * Writes an entry to strategic_directives_v2.metadata.descoped_frs so the FR delivery gate
 * (fr-delivery-classifier.js) counts the FR as satisfied-by-descope INSTEAD of UNDELIVERED.
 * A descope is honored ONLY when approved_by is a non-empty approver identity (and, at the
 * gate, not the requester's own session). This makes scope cuts explicit and attributable
 * rather than silent worker self-descopes. No migration — metadata is jsonb.
 *
 * Usage:
 *   node scripts/record-fr-descope.js <SD-KEY> <FR-ID> --approved-by "<approver>" --reason "<why>"
 *
 * Example:
 *   node scripts/record-fr-descope.js SD-FOO-001 FR-005 --approved-by chairman --reason "deferred to follow-on"
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--approved-by') { out.approvedBy = argv[++i]; }
    else if (a === '--reason') { out.reason = argv[++i]; }
    else if (a === '--approved-at') { out.approvedAt = argv[++i]; }
    else out._.push(a);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [sdKey, frId] = args._;
  if (!sdKey || !frId) {
    console.error('Usage: node scripts/record-fr-descope.js <SD-KEY> <FR-ID> --approved-by "<approver>" [--reason "<why>"]');
    process.exit(2);
  }
  if (!args.approvedBy || !String(args.approvedBy).trim()) {
    console.error('ERROR: --approved-by "<approver>" is REQUIRED. A descope without a named approver is ignored by the FR delivery gate.');
    process.exit(2);
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: sd, error: e1 } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, metadata')
    .eq('sd_key', sdKey)
    .maybeSingle();
  if (e1) { console.error('DB error:', e1.message); process.exit(1); }
  if (!sd) { console.error(`SD not found: ${sdKey}`); process.exit(1); }

  const metadata = sd.metadata && typeof sd.metadata === 'object' ? sd.metadata : {};
  const list = Array.isArray(metadata.descoped_frs) ? metadata.descoped_frs.slice() : [];
  const entry = {
    fr_id: frId,
    approved_by: String(args.approvedBy).trim(),
    reason: args.reason || null,
    approved_at: args.approvedAt || new Date().toISOString(),
  };
  const existingIdx = list.findIndex((d) => d && (d.fr_id === frId || d.id === frId));
  if (existingIdx >= 0) list[existingIdx] = entry; else list.push(entry);
  metadata.descoped_frs = list;

  const { error: e2 } = await supabase
    .from('strategic_directives_v2')
    .update({ metadata })
    .eq('id', sd.id);
  if (e2) { console.error('Update failed:', e2.message); process.exit(1); }

  console.log(`✅ Recorded FR descope: ${sdKey} / ${frId} approved_by="${entry.approved_by}"${entry.reason ? ` reason="${entry.reason}"` : ''}`);
  console.log(`   descoped_frs now has ${list.length} entr${list.length === 1 ? 'y' : 'ies'}.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
