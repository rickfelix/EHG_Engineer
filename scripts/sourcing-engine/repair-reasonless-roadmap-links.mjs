#!/usr/bin/env node
// Repair the live NON-TERMINAL reasonless metadata.roadmap_link_exception rows.
// SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-D FR-1.
//
// TWO DEFECT SHAPES measured live 2026-09-06:
//   (a) bare_string  — a real reason was written as a plain string (e.g. by a hand-authored
//       one-off such as .artifacts/michael-002-fences-20260905.mjs:30), not through the canonical
//       builder. The strict reader (countRoadmapLinkExceptions, reason_supplied===true) cannot see
//       it, so a real reason reads as "without_reason". Repair: rebuild through the canonical
//       builder using the SAME text as operator_reason (nothing is invented), recorded_at falls
//       back to the SD's created_at since the string carried no timestamp.
//   (b) no_reason_marker / malformed_object — a genuine no-reason mint, or an object missing
//       reason_supplied entirely. Repair: an EXPLICIT backfill reason naming this SD and the
//       plan_linkage bucket, so the count reaches zero WITHOUT pretending the minter supplied a
//       reason they did not.
//
// DRY-RUN BY DEFAULT. Pass --apply to write. --revert restores the prior value from
// metadata.roadmap_link_exception_repair.prior for one or more --sd-key <KEY> (repeatable), or
// every repaired row when no --sd-key is given. Idempotent: a second --apply run finds zero
// candidates (every reasonless non-terminal row now has reason_supplied:true).
//
// Usage:
//   node scripts/sourcing-engine/repair-reasonless-roadmap-links.mjs             # dry-run, print plan
//   node scripts/sourcing-engine/repair-reasonless-roadmap-links.mjs --apply     # write
//   node scripts/sourcing-engine/repair-reasonless-roadmap-links.mjs --revert [--sd-key <KEY> ...]

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'url';
import { fetchAllPaginated } from '../../lib/db/fetch-all-paginated.mjs';
import {
  buildRoadmapLinkException,
  classifyExceptionShape,
  TERMINAL_SD_STATUSES,
} from '../../lib/sourcing-engine/roadmap-link-exception.js';

export const REPAIRED_BY = 'SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-D:scripts/sourcing-engine/repair-reasonless-roadmap-links.mjs';

/** Build the honest backfill reason for a no-reason mint. Never claims the minter supplied it. */
export function buildBackfillReason(row) {
  const bucket = row?.metadata?.plan_linkage?.unlinked_reason || 'none';
  const title = row?.title || row?.sd_key;
  return `backfilled by SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-D: minted without --roadmap-link-reason; plan_linkage bucket=${bucket}; ${title}`;
}

/**
 * Pure core: given rows carrying {sd_key, status, created_at, title, metadata}, compute the
 * repair plan for every NON-TERMINAL row whose roadmap_link_exception is reasonless.
 * Returns [{ sd_key, shape, prior, next, recorded_at_source }].
 */
export function planRepairs(rows, { nowIso = new Date().toISOString(), terminalStatuses = TERMINAL_SD_STATUSES } = {}) {
  const terminalSet = new Set(terminalStatuses);
  const plan = [];
  for (const row of rows || []) {
    if (!row || terminalSet.has(row.status)) continue;
    const prior = row.metadata && row.metadata.roadmap_link_exception;
    if (!prior) continue;
    const shape = classifyExceptionShape(prior);
    if (shape === 'canonical_reasoned') continue;

    let reasonText;
    let recordedAt;
    let recordedAtSource;
    if (shape === 'bare_string') {
      reasonText = prior;
      recordedAt = row.created_at || nowIso;
      recordedAtSource = row.created_at ? 'sd.created_at' : 'now (sd.created_at missing)';
    } else {
      // no_reason_marker or malformed_object — honest backfill, never fabricated as the minter's own.
      reasonText = buildBackfillReason(row);
      const priorRecordedAt = prior && typeof prior === 'object' ? prior.recorded_at : null;
      recordedAt = priorRecordedAt || row.created_at || nowIso;
      recordedAtSource = priorRecordedAt ? 'prior.recorded_at' : (row.created_at ? 'sd.created_at' : 'now');
    }

    const next = buildRoadmapLinkException(row.sd_key, reasonText, recordedAt);
    // A sanitized bare_string could theoretically collapse to empty (e.g. control chars only) —
    // never let that silently produce reason_supplied:false; fall back to the honest backfill.
    const finalNext = next.reason_supplied ? next
      : buildRoadmapLinkException(row.sd_key, buildBackfillReason(row), recordedAt);

    plan.push({ sd_key: row.sd_key, status: row.status, shape, prior, next: finalNext, recorded_at_source: recordedAtSource });
  }
  return plan;
}

const SELECT_COLS = 'sd_key, status, created_at, title, metadata';

async function fetchCandidateRows(sb) {
  return fetchAllPaginated(() => sb
    .from('strategic_directives_v2')
    .select(SELECT_COLS)
    .not('metadata->roadmap_link_exception', 'is', null)
    .order('sd_key', { ascending: true }));
}

async function applyOne(sb, entry, nowIso) {
  // TR-3: re-read fresh immediately before writing — metadata is a shared JSONB bag written
  // concurrently by claim guards / dispatch ranking / the coordinator. Never spread a stale
  // snapshot; merge only the two exception keys.
  const { data: fresh, error: readErr } = await sb
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('sd_key', entry.sd_key)
    .single();
  if (readErr) throw new Error(`${entry.sd_key}: re-read failed: ${readErr.message}`);

  const metadata = {
    ...(fresh.metadata || {}),
    roadmap_link_exception: entry.next,
    roadmap_link_exception_repair: { prior: entry.prior, repaired_at: nowIso, repaired_by: REPAIRED_BY },
  };
  const { data: updated, error: updateErr } = await sb
    .from('strategic_directives_v2')
    .update({ metadata })
    .eq('sd_key', entry.sd_key)
    .select('sd_key, metadata')
    .single();
  if (updateErr) throw new Error(`${entry.sd_key}: update failed: ${updateErr.message}`);
  return updated;
}

async function revertOne(sb, sdKey) {
  const { data: fresh, error: readErr } = await sb
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('sd_key', sdKey)
    .single();
  if (readErr) throw new Error(`${sdKey}: re-read failed: ${readErr.message}`);
  const repair = fresh.metadata && fresh.metadata.roadmap_link_exception_repair;
  if (!repair) return { sd_key: sdKey, skipped: 'no roadmap_link_exception_repair recorded' };
  const metadata = { ...fresh.metadata, roadmap_link_exception: repair.prior };
  delete metadata.roadmap_link_exception_repair;
  const { error: updateErr } = await sb.from('strategic_directives_v2').update({ metadata }).eq('sd_key', sdKey);
  if (updateErr) throw new Error(`${sdKey}: revert failed: ${updateErr.message}`);
  return { sd_key: sdKey, reverted: true };
}

function parseArgs(argv) {
  const out = { apply: false, revert: false, sdKeys: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--apply') out.apply = true;
    else if (argv[i] === '--revert') out.revert = true;
    else if (argv[i] === '--sd-key') out.sdKeys.push(argv[++i]);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error(JSON.stringify({ status: 'error', error: 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required' }));
    process.exitCode = 1;
    return;
  }
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
  const nowIso = new Date().toISOString();

  if (args.revert) {
    let sdKeys = args.sdKeys;
    if (sdKeys.length === 0) {
      const rows = await fetchCandidateRows(sb);
      sdKeys = rows.filter((r) => r.metadata && r.metadata.roadmap_link_exception_repair).map((r) => r.sd_key);
    }
    const results = [];
    for (const key of sdKeys) results.push(await revertOne(sb, key));
    console.log(JSON.stringify({ status: 'reverted', count: results.length, results }, null, 2));
    return;
  }

  const rows = await fetchCandidateRows(sb);
  const plan = planRepairs(rows, { nowIso });

  if (!args.apply) {
    console.log(JSON.stringify({
      status: 'dry_run',
      candidates: plan.length,
      plan: plan.map((p) => ({
        sd_key: p.sd_key, status: p.status, shape: p.shape,
        would_write: { operator_reason: p.next.operator_reason, reason_supplied: p.next.reason_supplied, recorded_at: p.next.recorded_at },
        recorded_at_source: p.recorded_at_source,
      })),
      note: 'No writes performed. Re-run with --apply to write.',
    }, null, 2));
    return;
  }

  const results = [];
  for (const entry of plan) {
    // Sequential by design (TR-3): each row is re-read immediately before its own write, never
    // batched, so a concurrent writer's update to a DIFFERENT metadata key is never clobbered by
    // a stale snapshot from an earlier read.
    const updated = await applyOne(sb, entry, nowIso);
    results.push({ sd_key: entry.sd_key, shape: entry.shape, operator_reason: updated.metadata.roadmap_link_exception.operator_reason });
  }
  console.log(JSON.stringify({ status: 'applied', repaired: results.length, results }, null, 2));
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((e) => {
    console.error(JSON.stringify({ status: 'error', error: e.message }));
    process.exitCode = 1;
  });
}
