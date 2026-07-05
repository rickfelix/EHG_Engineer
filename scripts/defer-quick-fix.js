#!/usr/bin/env node

/**
 * Defer Quick-Fix (durable time-gated defer)
 * SD-LEO-FIX-QUICK-FIXES-NEEDS-001
 *
 * Sets quick_fixes.not_before for a QF so it stops being claimable/auto-startable
 * until the given timestamp passes -- without hand-written SQL. Both worker-checkin.cjs
 * self-claim picker paths (via isAutoStartableQF) and the sd:next display surface
 * (classifyQuickFixes) honor this column.
 *
 * Usage:
 *   node scripts/defer-quick-fix.js QF-20260704-348 --not-before 2026-07-05T21:00:00Z
 *   node scripts/defer-quick-fix.js QF-20260704-348 --not-before 2026-07-05T21:00:00Z --reopen
 *
 * --reopen also sets status='open' on the row (use when re-opening a QF previously
 * held via status='escalated' as a manual defer workaround).
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { isMainModule } from '../lib/utils/is-main-module.js';

dotenv.config();

export function parseDeferArgs(argv) {
  const args = argv.slice();
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    return { showHelp: true };
  }
  const qfId = args[0];
  let notBefore = null;
  let reopen = false;
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--not-before') {
      notBefore = args[i + 1];
      i++;
    } else if (args[i] === '--reopen') {
      reopen = true;
    }
  }
  return { showHelp: false, qfId, notBefore, reopen };
}

export function validateNotBefore(value) {
  if (!value) return { valid: false, error: '--not-before <ISO-timestamp> is required' };
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return { valid: false, error: `--not-before: could not parse "${value}" as a timestamp (expected ISO-8601, e.g. 2026-07-05T21:00:00Z)` };
  }
  return { valid: true, iso: new Date(parsed).toISOString() };
}

function displayHelp() {
  console.log(`
Defer Quick-Fix — durable time-gated defer (SD-LEO-FIX-QUICK-FIXES-NEEDS-001)

Usage:
  node scripts/defer-quick-fix.js <QF-ID> --not-before <ISO-timestamp> [--reopen]

Options:
  --not-before <ts>   Required. ISO-8601 timestamp. The QF is not claimable/
                      auto-startable by any picker until this time passes.
  --reopen            Also set status='open' (use when clearing a manual
                      status='escalated' defer workaround).

Example:
  node scripts/defer-quick-fix.js QF-20260704-348 --not-before 2026-07-05T21:00:00Z --reopen
`);
}

export async function deferQuickFix(qfId, notBefore, { reopen = false, supabaseClient = null } = {}) {
  const validation = validateNotBefore(notBefore);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const supabase = supabaseClient || createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const update = { not_before: validation.iso };
  if (reopen) update.status = 'open';

  const { data, error } = await supabase
    .from('quick_fixes')
    .update(update)
    .eq('id', qfId)
    .select('id, status, not_before')
    .single();

  if (error) {
    throw new Error(`Failed to defer ${qfId}: ${error.message}`);
  }
  if (!data) {
    throw new Error(`Quick-fix not found: ${qfId}`);
  }

  return data;
}

async function main() {
  const parsed = parseDeferArgs(process.argv.slice(2));
  if (parsed.showHelp) {
    displayHelp();
    process.exit(0);
  }

  try {
    const result = await deferQuickFix(parsed.qfId, parsed.notBefore, { reopen: parsed.reopen });
    console.log(`✅ ${result.id}: not_before=${result.not_before}, status=${result.status}`);
    process.exitCode = 0;
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exitCode = 1;
  }
}

if (isMainModule(import.meta.url)) {
  main();
}
