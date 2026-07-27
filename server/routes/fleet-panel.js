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
import { getAccountUsage, allUnavailable } from '../../lib/fleet/account-usage-reader.cjs';
import { isLiveEnabled } from '../../lib/fleet/spawn-control.js';

const router = Router();

// A session counts as live if it heartbeat within this window. Generous on purpose: the point is
// to drop months-dead rows, not to hide a session that went briefly quiet. Live sessions observed
// at 3s-15m; dead ones at 4000h+, so anything in this range separates them cleanly.
const LIVE_WINDOW_SECONDS = 3600;

// Explicit cap so a truncated page is reported rather than mistaken for the true total
// (PostgREST silently defaults to 1000, which is exactly what made the old list look complete).
const PANEL_ROW_CAP = 500;

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
/**
 * A session carries an identity if it is a named fleet worker OR a known role session
 * (coordinator / adam / solomon). Rows with NONE of these are ghosts: dead processes whose
 * rows are still being heartbeated. Observed 2026-07-25 — four such rows heartbeating every
 * few seconds whose entire metadata was the audit trail of an is_alive repair-then-revert,
 * with no role, callsign, model or effort. Heartbeat recency cannot separate them, because
 * they heartbeat; the absence of ANY identity is what distinguishes them.
 */
function sessionIdentityKind(meta = {}) {
  if (meta.fleet_identity?.callsign) return 'worker';
  if (meta.is_coordinator) return 'coordinator';
  if (meta.role) return String(meta.role);
  if (meta.model) return 'unstamped';   // real session, identity not yet assigned
  return null;                          // no identity at all -> ghost
}

// QF-20260726-642: exported (additively, no behaviour change) so the per-session account fields
// below are unit-testable. An emitted field with no test is how element 5 got dropped the first time.
export function formatSessionRow(row) {
  const meta = row.metadata || {};
  const identity = meta.fleet_identity || {};
  const model = meta.model || '--';
  const effort = meta.effort || '--';
  const kind = sessionIdentityKind(meta);
  return {
    session_id: row.session_id,
    // Fall back to the role name so the coordinator/Adam/Solomon rows read as themselves
    // instead of as blanks. Fleet callsign still wins when present.
    callsign: identity.callsign || (kind && kind !== 'unstamped' ? kind : null),
    identity_kind: kind,
    color: identity.color || null,
    role: identity.role || null,
    account: identity.accountUuid8 || null,
    // QF-20260726-642 element 5 — the per-session ACCOUNT the chairman named. The published
    // artifact renders a NAME ("Deep Soul Sessions", "Rick Felix 2000"), so the display value is
    // account_org_name FIRST and account_email only as a fallback; `account` above is an
    // accountUuid8 fragment and was never a name. Written per session by
    // scripts/hooks/session-register.cjs (QF-20260726-514, merged 13:22Z), resolved via
    // CLAUDE_CONFIG_DIR — deliberately NOT .account-identity-last.json, which is host-global and
    // last-writer-wins and would render every row identically.
    //
    // NULL IS EXPECTED, NOT BROKEN: the field stamps at SessionStart with no backfill, so every
    // session that predates the merge reports null until it restarts. The UI must render that as
    // "not captured" rather than a blank — a session predating the writer is not an account-less
    // session. No placeholder is invented here; null is passed through honestly.
    account_email: meta.account_email || null,
    account_org_name: meta.account_org_name || null,
    model_effort: `${model}/${effort}`,
    status: row.computed_status || 'unknown',
    sd_key: row.sd_key || null,
    heartbeat_age_human: row.heartbeat_age_human || null,
    // SD-LEO-FEAT-FLEET-COLD-START-UX-001 FR-3. The numeric age was already SELECTed and used for
    // ordering and the LIVE_WINDOW_SECONDS filter, but never emitted — so the client had only
    // heartbeat_age_human, a DISPLAY STRING ('5s ago'). The cold-start control needs to tell a
    // LIVE coordinator from a STALE one, and the live window is a generous 3600s while heartbeat
    // is known to keep advancing on dead processes. Without this field that distinction could only
    // be tested against a fabricated row — a guaranteed mock-pass. Emitted so the client compares a
    // number rather than parsing prose. Null-safe: `?? null` not `|| null`, because 0 is a
    // legitimate age and the falsy form would report a just-heartbeated session as unknown.
    heartbeat_age_seconds: row.heartbeat_age_seconds ?? null,
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

  // v_active_sessions is "active" in name only — it carries every session ever registered
  // (measured 2026-07-25: 1000 rows returned, 6 with a heartbeat under 1h, oldest ~234 days).
  // Default the panel to genuinely-live sessions; ?all=1 restores the full history, so this
  // FILTERS the view without destroying the signal behind it.
  const showAll = String(req?.query?.all ?? '') === '1';
  const windowSeconds = Number.parseInt(req?.query?.windowSeconds, 10) || LIVE_WINDOW_SECONDS;

  // Order by the NUMERIC age, not heartbeat_age_human — that column is display text
  // ("6s ago", "15m ago", "4500h ago") and sorting it lexicographically scrambled the list.
  let query = supabase
    .from('v_active_sessions')
    .select('session_id, sd_key, computed_status, metadata, heartbeat_age_human, heartbeat_age_seconds')
    .order('heartbeat_age_seconds', { ascending: true })
    .limit(PANEL_ROW_CAP);

  if (!showAll) query = query.lt('heartbeat_age_seconds', windowSeconds);

  const { data: sessionRows, error: sessionsError } = await query;

  const allRows = sessionsError || !sessionRows ? [] : sessionRows.map(formatSessionRow);
  // Drop identity-less ghosts from the default view (they heartbeat, so the recency filter
  // above cannot catch them). ?all=1 still shows everything.
  const sessions = showAll ? allRows : allRows.filter((r) => r.identity_kind !== null);
  const ghostsHidden = allRows.length - sessions.length;

  // Surface truncation rather than silently returning a capped page (PostgREST defaults to 1000,
  // which reads as a real total). Callers can tell "that is all of them" from "there are more".
  const truncated = !sessionsError && Array.isArray(sessionRows) && sessionRows.length >= PANEL_ROW_CAP;

  // FR-1/FR-2: three named-account capacity chips (mockup-1) — always exactly 3, even when the
  // capacity store is empty/partial (unmatched accounts render 'wk --%').
  const accountChips = buildNamedAccountChips(loadStore());

  // SD-LEO-FEAT-ACCOUNT-USAGE-STRIP-001 (FR-4): live per-account quota usage, read server-side.
  // ADDITIVE — deliberately a NEW field rather than a richer accountChips: that field is consumed
  // by the standalone vanilla panel (server/public/fleet-ui/fleet-panel.js) and reshaping it would
  // break a live surface. Follows the same boundary as accountChips above — the server reads
  // privileged local state and the browser receives only a computed percentage, never a token.
  // GUARDED, matching getAttentionFlaggedSessions below: this is the only await in the handler that
  // reaches an external service, and an unguarded throw here would 500 the WHOLE endpoint — the
  // session list, the chips, everything — not just the strip. getAccountUsage is written never to
  // throw, so this is defense in depth rather than a known path; the fallback still names every
  // account, because a silently absent strip is the invisible failure this SD exists to prevent.
  // ?refreshUsage=1 bypasses the reader's 60s cache. The cache exists to stop the page's 15s POLL
  // from hammering an undocumented endpoint — it was never meant to block a DELIBERATE re-read.
  // This is the path behind the strip's Refresh control: after an operator re-authenticates an
  // account they need to confirm it NOW, and being told to wait out a cache would undercut the
  // whole point of showing them the failure.
  const refreshUsage = String(req?.query?.refreshUsage ?? '') === '1';

  let accountUsage;
  try {
    accountUsage = await getAccountUsage(refreshUsage ? { noCache: true } : {});
  } catch {
    accountUsage = allUnavailable('unreachable');
  }

  // QF-20260726-575: the RESOLVED spawn live-state, so "is the live OS spawn armed on this host"
  // is answerable by OBSERVATION instead of by reading a static docblock that cannot track an env
  // var. spawn-control.js opened "STAGED / INERT BY DEFAULT" on a host where the flag was SET, so a
  // reader got the wrong answer in the PERMISSIVE direction — and a bare process.env read is the
  // same error by a second route, because FLEET_SPAWN_CONTROL_LIVE lives in .env and reads as
  // undefined until it is loaded. This server always has env loaded, which is what makes it the
  // authoritative answer. Calls the SAME exported predicate the verbs gate on — deliberately not a
  // re-implemented env read, which would be free to drift from the thing it claims to describe.
  const spawnControl = { live: isLiveEnabled() };

  let attentionStrip = [];
  try {
    attentionStrip = await getAttentionFlaggedSessions({ supabase });
  } catch {
    attentionStrip = [];
  }

  res.json({
    sessions,
    accountChips,
    accountUsage,
    spawnControl,
    attentionStrip,
    filter: { liveOnly: !showAll, windowSeconds, truncated, ghostsHidden },
  });
}

router.get('/', getFleetPanel);

export default router;
