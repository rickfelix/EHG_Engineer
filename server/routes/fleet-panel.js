/**
 * Fleet panel API route — SD-LEO-INFRA-LEO-LAUNCHER-SHELL-001-A
 *
 * Structured (non-console) data-provider for the fleet-panel view (mockup #1): manifest-table
 * rows, per-account capacity chips, and the attention strip. Reuses the existing pure formatters
 * (lib/fleet/fleet-view-badges.cjs) and read-only helpers (lib/fleet/attention-flag-writer.js) --
 * scripts/fleet-dashboard.cjs's printWorkers()/printAttentionStrip() are console-only renderers
 * (return undefined, tied to a module-level supabase singleton) and are deliberately NOT reused.
 */

import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { computeSessionBadge } from '../../lib/fleet/fleet-view-badges.cjs';
import { getAttentionFlaggedSessions } from '../../lib/fleet/attention-flag-writer.js';
import { loadStore, buildNamedAccountChips } from '../../lib/fleet/account-capacity-gauge.cjs';

const router = Router();

// Resolve a service-role Supabase client. Prefers an injected client
// (req.app.locals.supabase) so route tests can supply a mock; falls back to a
// fresh service-role client for the running server. Mirrors server/routes/ventures.js.
function resolveServiceClient(req) {
  return (
    req?.app?.locals?.supabase ||
    createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    )
  );
}

/** Format a session row from v_active_sessions into the manifest-table shape. */
function formatSessionRow(row) {
  const meta = row.metadata || {};
  const identity = meta.fleet_identity || {};
  const model = meta.model || '--';
  const effort = meta.effort || '--';
  return {
    session_id: row.session_id,
    callsign: identity.callsign || null,
    color: identity.color || null,
    role: identity.role || null,
    account: identity.accountUuid8 || null,
    model_effort: `${model}/${effort}`,
    status: row.computed_status || 'unknown',
    sd_key: row.sd_key || null,
    heartbeat_age_human: row.heartbeat_age_human || null,
    badge: computeSessionBadge({
      loopState: meta.loop_state,
      pAlive: meta.p_alive,
      isSilent: meta.is_silent,
      failCount: meta.fail_count,
      computedStatus: row.computed_status,
      role: identity.role,
      model,
      effort,
    }),
  };
}

/**
 * GET /api/fleet-panel handler — structured fleet-panel state: sessions[], accountChips[],
 * attentionStrip[]. Never throws on missing/partial data (matches fleet-dashboard.cjs's own
 * defensive posture). Exported separately (not just registered on the router) so unit tests
 * can call it directly with mock req/res, without needing supertest or Router internals.
 */
export async function getFleetPanel(req, res) {
  const supabase = resolveServiceClient(req);

  const { data: sessionRows, error: sessionsError } = await supabase
    .from('v_active_sessions')
    .select('session_id, sd_key, computed_status, metadata, heartbeat_age_human')
    .order('heartbeat_age_human', { ascending: true });

  const sessions = sessionsError || !sessionRows ? [] : sessionRows.map(formatSessionRow);

  // FR-1/FR-2: three named-account capacity chips (mockup-1) — always exactly 3, even when the
  // capacity store is empty/partial (unmatched accounts render 'wk --%').
  const accountChips = buildNamedAccountChips(loadStore());

  let attentionStrip = [];
  try {
    attentionStrip = await getAttentionFlaggedSessions({ supabase });
  } catch {
    attentionStrip = [];
  }

  res.json({ sessions, accountChips, attentionStrip });
}

router.get('/', getFleetPanel);

export default router;
