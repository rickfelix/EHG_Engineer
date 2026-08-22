#!/usr/bin/env node
/**
 * dispatch-suggestion-override.mjs — SD-LEO-INFRA-INTELLIGENT-ROUTING-RANK-001 (FR-4).
 *
 * The coordinator's overrule-logging entry point: when a coordinator acts against a
 * dispatch_suggestion's top-ranked candidate (informed disagreement, per FR-4's "carries its WHY
 * so the coordinator can overrule with information"), this records that decision as a
 * session_coordination row (payload.kind='dispatch_override') referencing the original
 * suggestion — the training-signal FR-4 exists to accumulate. scripts/dispatch-suggestion-report.mjs
 * is the reader that keeps this from becoming a write-only dead table.
 *
 * Usage:
 *   node scripts/dispatch-suggestion-override.mjs <suggestion_row_id> "<reason>"
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';
import { isMainModule } from '../lib/utils/is-main-module.js';

const require = createRequire(import.meta.url);
// Canonical choke point (SD-LEO-INFRA-INTELLIGENT-ROUTING-RANK-001 correction): a raw
// .from('session_coordination').insert() both fails the repo's no-raw-session-coordination-insert
// ESLint rule AND violates the table's `subject` NOT NULL + `valid_target` CHECK constraints.
const { insertCoordinationRow } = require('../lib/coordinator/dispatch.cjs');

export async function recordOverride(supabase, suggestionId, reason) {
  if (!suggestionId) throw new Error('recordOverride: missing suggestionId');
  if (!reason || !String(reason).trim()) throw new Error('recordOverride: missing reason — an unreasoned override is not training signal');

  const { data: suggestion, error: readErr } = await supabase
    .from('session_coordination')
    .select('id, payload')
    .eq('id', suggestionId)
    .maybeSingle();
  if (readErr) throw new Error(`recordOverride: lookup failed: ${readErr.message}`);
  if (!suggestion || !suggestion.payload || suggestion.payload.kind !== 'dispatch_suggestion') {
    throw new Error(`recordOverride: ${suggestionId} is not a dispatch_suggestion row`);
  }

  const trimmedReason = String(reason).trim();
  const res = await insertCoordinationRow(supabase, {
    sender_type: 'system',
    target_session: 'broadcast',
    message_type: 'INFO',
    subject: `[DISPATCH_OVERRIDE] ${suggestion.payload.sd_key || suggestionId}`,
    body: `Coordinator overrule of suggestion ${suggestionId}: ${trimmedReason}`,
    payload: {
      kind: 'dispatch_override',
      suggestion_id: suggestionId,
      sd_key: suggestion.payload.sd_key,
      reason: trimmedReason,
      overridden_at: new Date().toISOString(),
    },
  }, { select: 'id', single: true });
  if (!res || res.error) throw new Error(`recordOverride: insert failed: ${(res && res.error && res.error.message) || 'unknown error'}`);
  return res.data ? res.data.id : null;
}

async function main() {
  const [suggestionId, ...rest] = process.argv.slice(2);
  const reason = rest.join(' ');
  if (!suggestionId || !reason) {
    console.log('Usage: node scripts/dispatch-suggestion-override.mjs <suggestion_row_id> "<reason>"');
    process.exit(1);
  }
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('[dispatch-suggestion-override] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required');
    process.exit(1);
  }
  const supabase = createClient(url, key);
  try {
    const id = await recordOverride(supabase, suggestionId, reason);
    console.log(`✓ override recorded: ${id}`);
  } catch (e) {
    console.error(`✗ ${e.message}`);
    process.exit(1);
  }
}

if (isMainModule(import.meta.url)) {
  main();
}
