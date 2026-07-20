#!/usr/bin/env node
/**
 * corrective-triage.mjs
 *
 * Operator-facing CLI for triaging corrective findings recorded by
 * corrective-sd-generator. Subcommands:
 *   list                       List open corrective findings
 *   promote <feedback-id>      Promote a finding to a real SD
 *   dismiss <feedback-id>      Mark a finding as wont_fix
 *   bulk-dismiss --class <c>   Mark all matching findings wont_fix
 *
 * Replaces the prior pattern where corrective-sd-generator emitted draft SDs
 * directly. SD creation now happens deliberately via this CLI.
 *
 * Part of: SD-LEO-INFRA-CORRECTIVE-FINDING-REDIRECT-001 (PR4 of 5)
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { publishVisionEvent, VISION_EVENTS } from '../lib/eva/event-bus/vision-events.js';
import { createSD } from './leo-create-sd.js';
import { fetchAllPaginated } from '../lib/db/fetch-all-paginated.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../.env') });

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key);
}

function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { flags[key] = next; i++; }
      else { flags[key] = true; }
    }
  }
  return flags;
}

export async function listFindings(supabase, { class: cls, status = 'new', ageGt = null } = {}) {
  const cutoff = ageGt ? new Date(Date.now() - Number(ageGt) * 86400000).toISOString() : null;
  // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: feedback is an unbounded growing
  // table and bulkDismiss (below) ACTS on every row this returns — paginate to completion. Error
  // policy preserved: throw with the same "list failed: ..." message the original produced.
  const buildQuery = () => {
    let q = supabase.from('feedback')
      .select('id, title, status, severity, corrective_class, source_gate, gate_run_id, promoted_to_sd_id, created_at, metadata')
      .eq('category', 'corrective_finding')
      .eq('status', status);
    if (cls) q = q.eq('corrective_class', cls);
    if (cutoff) q = q.lt('created_at', cutoff);
    return q.order('created_at', { ascending: false }).order('id', { ascending: true }); // unique tiebreaker (FR-6)
  };
  try {
    return await fetchAllPaginated(buildQuery);
  } catch (e) {
    throw new Error(`list failed: ${e.message}`);
  }
}

export async function promoteFinding(supabase, feedbackId, { promotedBy = 'corrective-triage-cli' } = {}) {
  const { data: row, error } = await supabase.from('feedback')
    .select('id, title, description, status, promoted_to_sd_id, corrective_class, source_gate, gate_run_id, metadata')
    .eq('id', feedbackId)
    .single();
  if (error || !row) throw new Error(`feedback ${feedbackId} not found: ${error?.message}`);
  if (row.promoted_to_sd_id) {
    return { promoted: false, reason: 'already_promoted', sdKey: row.promoted_to_sd_id, feedbackId };
  }
  if (row.status === 'wont_fix' || row.status === 'resolved') {
    return { promoted: false, reason: `feedback status=${row.status}; cannot promote`, feedbackId };
  }

  const payload = row.metadata?.promote_payload;
  if (!payload) throw new Error(`feedback ${feedbackId} has no metadata.promote_payload — generated before redirect; cannot promote`);

  const sourceSdId = row.metadata?.source_sd_id ?? null;
  const dims = row.metadata?.dimensions ?? [];

  const newSD = await createSD({
    title: row.title,
    description: row.description,
    type: payload.sdType,
    priority: payload.priority,
    category: payload.category,
    parentId: payload.parentId,
    rationale: payload.rationale,
    strategic_objectives: payload.strategic_objectives,
    success_criteria: payload.success_criteria,
    success_metrics: payload.success_metrics,
    key_principles: payload.key_principles,
    metadata: {
      source: 'corrective_triage_promotion',
      promoted_from_feedback_id: feedbackId,
      source_sd_id: sourceSdId,
      gate_run_id: row.gate_run_id,
      action_tier: row.metadata?.tier ?? null,
      dimensions: dims,
      gate_exemptions: ['GATE_VISION_SCORE'],
      intelligence_priority: row.metadata?.intelligence_priority ?? null,
    },
  });

  if (row.gate_run_id) {
    await supabase.from('eva_vision_scores')
      .update({ generated_sd_ids: [newSD.id] })
      .eq('id', row.gate_run_id);
  }

  await supabase.from('feedback')
    .update({
      status: 'in_progress',
      promoted_to_sd_id: newSD.sd_key,
      promoted_at: new Date().toISOString(),
      promoted_by: promotedBy,
    })
    .eq('id', feedbackId);

  publishVisionEvent(VISION_EVENTS.CORRECTIVE_PROMOTED_TO_SD, {
    originSdKey: sourceSdId,
    feedbackId,
    correctiveSdKey: newSD.sd_key,
    promotedBy,
  });

  return { promoted: true, sdKey: newSD.sd_key, sdId: newSD.id, feedbackId };
}

export async function dismissFinding(supabase, feedbackId, { reason = 'dismissed via corrective-triage CLI' } = {}) {
  const { data: row } = await supabase.from('feedback').select('id, status').eq('id', feedbackId).single();
  if (!row) throw new Error(`feedback ${feedbackId} not found`);
  if (row.status === 'wont_fix' || row.status === 'resolved') {
    return { dismissed: false, reason: `feedback already in terminal status=${row.status}`, feedbackId };
  }
  const { error } = await supabase.from('feedback')
    .update({
      status: 'wont_fix',
      resolution_type: 'wont_fix',
      resolution_notes: reason,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', feedbackId);
  if (error) throw new Error(`dismiss failed: ${error.message}`);
  return { dismissed: true, feedbackId, reason };
}

export async function bulkDismiss(supabase, { class: cls, ageGt = null, reason = 'bulk-dismissed via corrective-triage CLI' } = {}) {
  if (!cls) throw new Error('bulkDismiss requires --class filter');
  const findings = await listFindings(supabase, { class: cls, ageGt });
  const dismissed = [];
  for (const f of findings) {
    try {
      const r = await dismissFinding(supabase, f.id, { reason });
      if (r.dismissed) dismissed.push(f.id);
    } catch (e) {
      console.warn(`[bulk-dismiss] ${f.id}: ${e.message}`);
    }
  }
  return { dismissed: dismissed.length, ids: dismissed };
}

function formatRow(r) {
  const ageMin = Math.round((Date.now() - new Date(r.created_at).getTime()) / 60000);
  const dims = (r.metadata?.dimensions || []).join(',');
  const tier = r.metadata?.tier || '?';
  const score = r.metadata?.score ?? '?';
  return `  ${r.id}  ${(r.corrective_class || '?').padEnd(16)} ${r.source_gate?.padEnd(22) || '?'} t=${tier.padEnd(11)} score=${String(score).padEnd(5)} dims=${dims.padEnd(20)} age=${ageMin}m  ${r.title.slice(0, 60)}`;
}

const argv1 = process.argv[1];
const isMain = argv1 && (
  import.meta.url === `file://${argv1}` ||
  import.meta.url === `file:///${argv1.replace(/\\/g, '/')}`
);

if (isMain) {
  const [, , cmd, ...rest] = process.argv;
  const flags = parseFlags(rest);
  const positional = rest.filter(a => !a.startsWith('--') && rest[rest.indexOf(a) - 1]?.slice(0, 2) !== '--' || rest[rest.indexOf(a) - 1]?.startsWith('--') === false);
  const sb = getSupabase();

  try {
    if (cmd === 'list') {
      const findings = await listFindings(sb, { class: flags.class, status: flags.status, ageGt: flags['age-gt'] });
      console.log(`\n${findings.length} finding(s) [class=${flags.class || 'any'}, status=${flags.status || 'new'}]:\n`);
      findings.forEach(r => console.log(formatRow(r)));
      console.log('');
    } else if (cmd === 'promote') {
      const id = process.argv[3];
      if (!id) { console.error('Usage: corrective-triage promote <feedback-id>'); process.exit(1); }
      const r = await promoteFinding(sb, id, { promotedBy: process.env.CLAUDE_SESSION_ID || 'manual' });
      console.log(JSON.stringify(r, null, 2));
    } else if (cmd === 'dismiss') {
      const id = process.argv[3];
      if (!id) { console.error('Usage: corrective-triage dismiss <feedback-id> [--reason "<text>"]'); process.exit(1); }
      const r = await dismissFinding(sb, id, { reason: flags.reason });
      console.log(JSON.stringify(r, null, 2));
    } else if (cmd === 'bulk-dismiss') {
      const r = await bulkDismiss(sb, { class: flags.class, ageGt: flags['age-gt'], reason: flags.reason });
      console.log(JSON.stringify(r, null, 2));
    } else {
      console.log(`Usage:
  corrective-triage list [--class <c>] [--status <s>] [--age-gt <days>]
  corrective-triage promote <feedback-id>
  corrective-triage dismiss <feedback-id> [--reason "<text>"]
  corrective-triage bulk-dismiss --class <c> [--age-gt <days>] [--reason "<text>"]

Classes: vision_gap, arch_gap, lifecycle_feature, cli_validation, code_quality, other_gap
Statuses: new, in_progress, backlog, resolved, wont_fix`);
      process.exit(cmd ? 1 : 0);
    }
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}
