#!/usr/bin/env node
/**
 * SD-LEO-INFRA-PILOT-VENTURE-GUARD-001 — FR-1 / FR-3 / FR-4
 *
 * Enforce the Vision-1/Vision-2 boundary at the venture level (one-time, idempotent):
 *   FR-1  Mark DataDistill as the SOLE active pilot/test-fixture (ventures.is_scaffolding=true).
 *   FR-3  Retire the 5 OTHER pilot ventures (status='cancelled', kill_reason, killed_at) — NEVER deleted.
 *   FR-4  Cancel the 26 deferred CronGenius build SDs via the CANONICAL cancel-sd.js path,
 *         then assert the 3 chairman-retained infra SDs remain status='deferred' (untouched).
 *
 * SAFETY:
 *   - Targets EXPLICIT ids / keys only — no wildcard, so it cannot retire DataDistill or
 *     cancel the protected infra SDs.
 *   - Idempotent: re-running is a no-op (already-marked venture / already-cancelled SD are skipped).
 *   - Never hard-deletes (rows stay queryable).
 *   - DRY-RUN by default; pass --apply to perform the writes.
 *
 * Usage:
 *   node scripts/eva/retire-pilot-ventures.mjs            # preview (dry-run)
 *   node scripts/eva/retire-pilot-ventures.mjs --apply    # execute
 */

import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

const APPLY = process.argv.includes('--apply');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CANCEL_SD_JS = path.resolve(__dirname, '..', 'cancel-sd.js');

const REASON =
  'SD-LEO-INFRA-PILOT-VENTURE-GUARD-001: pilot/test-fixture venture build-out gated (V1/V2 boundary). ' +
  'DataDistill is the sole active pilot; chairman-ruled venture set (CONST-002).';

// FR-1: the venture KEPT as the sole pilot (marker set, NOT retired).
const DATADISTILL_ID = '510177ba-435f-4dd7-bfa5-6154cc8cf54b';

// FR-3: the 5 OTHER pilot ventures to retire (explicit ids — verified active 2026-06-15).
const RETIRE_VENTURES = [
  { id: '6e23ad2b-2f6c-45b2-8ee9-e9e69a32bb66', name: 'CronGenius' },
  { id: '58da89fa-46b5-4d50-8ce2-16a7c8bb57a5', name: 'Test Venture for Financial Engine' },
  { id: '47779713-aa1f-4bd3-bb78-38b4a58bc91e', name: 'Test Venture for Marketing' },
  { id: 'a979e562-4eef-48c2-a1a6-952720267b79', name: 'Test Venture for Producer Binding' },
  { id: '1ab354b0-50c6-44bd-93fc-3e70bb6884d2', name: 'Canary Venture Probe' },
];

// FR-4: the 26 deferred CronGenius build SDs — SPRINT-UNKNOWN-001 + 25 children.
const CRONGENIUS_BASE = 'SD-CRONGENIUS-LEO-ORCH-SPRINT-UNKNOWN-001';
const CRONGENIUS_SD_KEYS = [
  CRONGENIUS_BASE,
  ...['A', 'B', 'C', 'D', 'E'].flatMap((g) => [`${CRONGENIUS_BASE}-${g}`, ...[1, 2, 3, 4].map((n) => `${CRONGENIUS_BASE}-${g}${n}`)]),
];

// FR-4 / FR-5 of the SD scope (part 5): these are OUT OF SCOPE and must remain untouched.
const PROTECTED_INFRA_SDS = [
  'SD-LEO-INFRA-PLATFORM-HARDENING-POSTGRES-001',
  'SD-LEO-INFRA-UNBLOCK-PORTFOLIO-WIDE-001',
  'SD-LEO-INFRA-ENABLE-TRI-PARTY-001',
];

const supabase = createSupabaseServiceClient();

function log(...a) { console.log(...a); }

async function readVenture(id) {
  const { data, error } = await supabase.from('ventures').select('id,name,status,is_scaffolding').eq('id', id).maybeSingle();
  if (error) throw new Error(`read venture ${id}: ${error.message}`);
  return data;
}

async function readInfraStatuses() {
  const { data, error } = await supabase.from('strategic_directives_v2').select('sd_key,status').in('sd_key', PROTECTED_INFRA_SDS);
  if (error) throw new Error(`read infra SDs: ${error.message}`);
  return Object.fromEntries((data || []).map((r) => [r.sd_key, r.status]));
}

async function main() {
  log(`\n=== retire-pilot-ventures (${APPLY ? 'APPLY' : 'DRY-RUN'}) ===\n`);

  // Snapshot the protected infra SDs BEFORE any writes (FR-4 assertion baseline).
  const infraBefore = await readInfraStatuses();
  log('Protected infra SDs (before):', JSON.stringify(infraBefore));
  for (const k of PROTECTED_INFRA_SDS) {
    if (!(k in infraBefore)) throw new Error(`SAFETY ABORT: protected infra SD missing from DB: ${k}`);
  }

  // ── FR-1: mark DataDistill as the sole pilot ──────────────────────────────
  const dd = await readVenture(DATADISTILL_ID);
  if (!dd) throw new Error(`SAFETY ABORT: DataDistill (${DATADISTILL_ID}) not found`);
  if (dd.name !== 'DataDistill') throw new Error(`SAFETY ABORT: id ${DATADISTILL_ID} is '${dd.name}', not DataDistill`);
  if (dd.is_scaffolding === true) {
    log(`FR-1: DataDistill already is_scaffolding=true (no-op).`);
  } else if (APPLY) {
    const { error } = await supabase.from('ventures').update({ is_scaffolding: true }).eq('id', DATADISTILL_ID);
    if (error) throw new Error(`FR-1 mark DataDistill: ${error.message}`);
    log(`FR-1: DataDistill is_scaffolding -> true ✓`);
  } else {
    log(`FR-1: would set DataDistill is_scaffolding=true (currently ${dd.is_scaffolding}).`);
  }

  // ── FR-3: retire the 5 other pilot ventures ───────────────────────────────
  for (const v of RETIRE_VENTURES) {
    const row = await readVenture(v.id);
    if (!row) { log(`FR-3: SKIP ${v.name} (${v.id}) — not found.`); continue; }
    if (row.name !== v.name) throw new Error(`SAFETY ABORT: id ${v.id} is '${row.name}', expected '${v.name}'`);
    if (row.id === DATADISTILL_ID) throw new Error('SAFETY ABORT: DataDistill in the retire list');
    if (row.status === 'cancelled') { log(`FR-3: ${v.name} already cancelled (no-op).`); continue; }
    if (APPLY) {
      const { error } = await supabase.from('ventures')
        .update({ status: 'cancelled', kill_reason: REASON, killed_at: new Date().toISOString() })
        .eq('id', v.id);
      if (error) throw new Error(`FR-3 retire ${v.name}: ${error.message}`);
      log(`FR-3: ${v.name} status -> cancelled ✓`);
    } else {
      log(`FR-3: would retire ${v.name} (status ${row.status} -> cancelled).`);
    }
  }

  // ── FR-4: cancel the 26 CronGenius build SDs via the canonical path ────────
  if (CRONGENIUS_SD_KEYS.length !== 26) throw new Error(`SAFETY ABORT: expected 26 CronGenius keys, built ${CRONGENIUS_SD_KEYS.length}`);
  let cancelled = 0, alreadyCancelled = 0;
  for (const key of CRONGENIUS_SD_KEYS) {
    const { data: sd } = await supabase.from('strategic_directives_v2').select('sd_key,status').eq('sd_key', key).maybeSingle();
    if (!sd) { log(`FR-4: SKIP ${key} — not found.`); continue; }
    if (sd.status === 'cancelled') { alreadyCancelled++; continue; }
    if (sd.status === 'completed') throw new Error(`SAFETY ABORT: ${key} is completed — refusing to cancel`);
    if (APPLY) {
      // Canonical cancel path (idempotent, writes audit_log, resets patterns, releases claim).
      execFileSync(process.execPath, [CANCEL_SD_JS, key, '--reason', REASON], { stdio: 'pipe' });
      cancelled++;
    } else {
      log(`FR-4: would cancel ${key} (status ${sd.status} -> cancelled).`);
    }
  }
  if (APPLY) log(`FR-4: cancelled ${cancelled} CronGenius SD(s); ${alreadyCancelled} already cancelled.`);
  else log(`FR-4: ${alreadyCancelled} already cancelled; the rest would be cancelled.`);

  // ── FR-4 assertion: protected infra SDs untouched ─────────────────────────
  const infraAfter = await readInfraStatuses();
  for (const k of PROTECTED_INFRA_SDS) {
    if (infraAfter[k] !== infraBefore[k]) {
      throw new Error(`SAFETY VIOLATION: protected infra SD ${k} changed status ${infraBefore[k]} -> ${infraAfter[k]}`);
    }
  }
  log('Protected infra SDs (after, unchanged):', JSON.stringify(infraAfter));

  log(`\n=== done (${APPLY ? 'APPLIED' : 'DRY-RUN — re-run with --apply to execute'}) ===\n`);
}

main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
