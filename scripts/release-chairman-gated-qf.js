#!/usr/bin/env node

/**
 * Release a chairman-gated QF back to the worker-facing open-work lane.
 * SD-LEO-INFRA-EXCLUDE-CHAIRMAN-GATED-001 (FR-3/FR-4)
 *
 * Counterpart to the gated-hold marker (owner='chairman' + release_condition — set via
 * scripts/defer-quick-fix.js --owner chairman --release-condition "<text>"). Clears the
 * marker and stamps WHO/WHEN/WHY into verification_notes so the release is auditable,
 * mirroring the clear-coordinator-review.mjs pattern. The QF re-admits to the worker
 * lane (sd:next Track C + worker-checkin self-claim) on the next queue refresh.
 *
 * REFUSES (non-zero exit) on a row without the marker — a silent no-op would mask a
 * typo'd QF id or a double-release.
 *
 * Usage:
 *   node scripts/release-chairman-gated-qf.js QF-20260713-970 --reason "chairman approved (verbal, 2026-08-01)"
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { createRequire } from 'module';
import { isMainModule } from '../lib/utils/is-main-module.js';

dotenv.config();
const require = createRequire(import.meta.url);
const { isChairmanGatedQF } = require('../lib/fleet/qf-gated-hold.cjs');

export function parseReleaseArgs(argv) {
  const args = argv.slice();
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') return { showHelp: true };
  const qfId = args[0];
  let reason = null;
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--reason') { reason = args[i + 1]; i++; }
  }
  return { showHelp: false, qfId, reason };
}

export async function releaseChairmanGatedQf(qfId, { reason, releasingSessionId, supabaseClient = null } = {}) {
  if (!reason || !String(reason).trim()) {
    throw new Error('--reason "<why released>" is required — the release stamp is the audit trail');
  }
  const supabase = supabaseClient || createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: row, error: readErr } = await supabase
    .from('quick_fixes')
    .select('id, status, owner, release_condition, verification_notes')
    .eq('id', qfId)
    .maybeSingle();
  if (readErr) throw new Error(`read failed for ${qfId}: ${readErr.message}`);
  if (!row) throw new Error(`Quick-fix not found: ${qfId}`);
  if (!isChairmanGatedQF(row)) {
    throw new Error(`${qfId} does not carry the chairman-gated-hold marker (owner='chairman' + release_condition) — nothing to release`);
  }

  const stamp = `[GATED-RELEASE ${new Date().toISOString()}] by session ${releasingSessionId || '(unknown)'}: ${String(reason).trim()} (was: ${String(row.release_condition).replace(/\n/g, ' ').slice(0, 200)})`;
  const notes = row.verification_notes ? `${row.verification_notes}\n${stamp}` : stamp;

  // Adversarial-review fix (PR #6178): condition the update on the marker still being
  // present so a concurrent double-release can't both succeed and double-append stamps
  // (read-then-update is otherwise non-atomic). Zero rows updated ⇒ someone else released
  // between our read and write — surface that instead of a silent success.
  const { data, error } = await supabase
    .from('quick_fixes')
    .update({ owner: null, release_condition: null, verification_notes: notes })
    .eq('id', qfId)
    .not('release_condition', 'is', null)
    .select('id, status, owner, release_condition')
    .maybeSingle();
  if (error) throw new Error(`release failed for ${qfId}: ${error.message}`);
  if (!data) throw new Error(`${qfId} was released concurrently by another session — no double-stamp written`);
  return data;
}

async function main() {
  const parsed = parseReleaseArgs(process.argv.slice(2));
  if (parsed.showHelp) {
    console.log('Usage: node scripts/release-chairman-gated-qf.js <QF-ID> --reason "<why released>"');
    return;
  }
  try {
    const data = await releaseChairmanGatedQf(parsed.qfId, {
      reason: parsed.reason,
      releasingSessionId: process.env.CLAUDE_SESSION_ID || null,
    });
    console.log(`✓ ${data.id} released to the worker lane (status=${data.status}) — release stamped in verification_notes`);
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  }
}

if (isMainModule(import.meta.url)) {
  main();
}
