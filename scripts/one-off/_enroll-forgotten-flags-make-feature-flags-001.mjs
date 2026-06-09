#!/usr/bin/env node
/**
 * SD-LEO-INFRA-MAKE-FEATURE-FLAGS-001 / FR-2 — retroactive enrollment of the forgotten flags.
 *
 * The operator's repeatedly-flagged "ship-it-off-and-forget" trap: three flags are sitting OFF
 * and untracked (2026-06-09). This enrolls them into the governed registry so the new stale-OFF
 * escalation (lib/feature-flags/governance-review.js classifyFlag 'stale-off-pending') can SEE
 * them and nag once they go stale:
 *   - ADAM_GOVERNANCE_HEARTBEAT_V1 — NOT registered anywhere → register (draft, off).
 *   - ADAM_SELF_SCORE_CADENCE, COORD_REVIEW_EVERY — registered but rolled_out_at IS NULL, so the
 *     "shipped default-OFF, pending enablement" clock never started → stamp rolled_out_at.
 *
 * Stamping rolled_out_at = created_at marks "this default-OFF rollout shipped at creation"; the
 * stale clock then runs from there (STALE_PENDING_OFF_DAYS=7). NEVER flips is_enabled — turning a
 * flag ON stays a deliberate SD/operator action (plan risk note). Fully idempotent.
 */

import 'dotenv/config';
import { createFlag, getFlag } from '../../lib/feature-flags/registry.js';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';

const NEW_FLAG = 'ADAM_GOVERNANCE_HEARTBEAT_V1';
const STAMP_ROLLED_OUT = ['ADAM_SELF_SCORE_CADENCE', 'COORD_REVIEW_EVERY', NEW_FLAG];

(async () => {
  const sb = createSupabaseServiceClient();

  // 1) Register the net-new orphan flag (idempotent).
  const existing = await getFlag(NEW_FLAG).catch(() => null);
  if (existing) {
    console.log(`• ${NEW_FLAG} already registered — skipping create.`);
  } else {
    await createFlag({
      flagKey: NEW_FLAG,
      displayName: 'Adam governance heartbeat (proactive multi-scope scan)',
      description: 'Gates whether Adam runs the proactive governance-heartbeat scan (scope rotation: harness/platform/per-venture; one-advisory-per-tick cap) defined in the Adam Role Contract (leo_protocol_sections id=601, SD-LEO-INFRA-ADAM-GOVERNANCE-HEARTBEAT-001). Shipped default-OFF; enrolled here so it cannot be silently forgotten.',
      isEnabled: false,
      changedBy: 'SD-LEO-INFRA-MAKE-FEATURE-FLAGS-001',
      ownerType: 'team',
      ownerId: 'adam',
      riskTier: 'low',
      isTemporary: false,
    });
    console.log(`• Registered ${NEW_FLAG} (draft, is_enabled=false, owner=team:adam).`);
  }

  // 2) Stamp rolled_out_at on any of the three that lack it (only where NULL — idempotent), using
  //    created_at as the rollout timestamp. enablement_criteria backfilled when empty so the
  //    review digest can show WHY the flag is OFF.
  for (const key of STAMP_ROLLED_OUT) {
    const { data: row, error: selErr } = await sb
      .from('leo_feature_flags')
      .select('flag_key, is_enabled, lifecycle_state, rolled_out_at, created_at, enablement_criteria')
      .eq('flag_key', key)
      .maybeSingle();
    if (selErr || !row) { console.log(`• ${key}: not found (${selErr?.message || 'no row'}) — skipping.`); continue; }
    const patch = {};
    if (!row.rolled_out_at) patch.rolled_out_at = row.created_at || new Date().toISOString();
    if (!row.enablement_criteria) {
      patch.enablement_criteria = 'Intended steady-state: ON. Enable when its consuming automation is wired and stable. Until then this is a tracked pending-enablement flag (stale-OFF nag escalates past STALE_PENDING_OFF_DAYS).';
    }
    if (Object.keys(patch).length === 0) { console.log(`• ${key}: already enrolled (rolled_out_at + criteria set) — no-op.`); continue; }
    const { error: updErr } = await sb.from('leo_feature_flags').update(patch).eq('flag_key', key);
    console.log(updErr
      ? `• ${key}: UPDATE failed: ${updErr.message}`
      : `• ${key}: stamped {${Object.keys(patch).join(', ')}} (is_enabled left ${row.is_enabled} — no auto-flip).`);
  }

  console.log('Retroactive enrollment complete. The stale-OFF nag will escalate these once past STALE_PENDING_OFF_DAYS.');
})().catch((e) => { console.error('enrollment failed:', e.message); process.exit(1); });
