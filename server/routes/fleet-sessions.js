/**
 * Session View API routes (SD-LEO-INFRA-LEO-LAUNCHER-SHELL-001-B).
 *
 * Wraps lib/fleet/spawn-control.js attach() and lib/fleet/browser-control.js
 * requestBrowserSession/signalTakeover/signalHandBack for the graphical Session
 * View pane (mockup #2). No changes to those modules -- consumed only.
 *
 * PER-SESSION-FRESH-FETCH DISCIPLINE (PRD FR-3): every handler re-queries
 * claude_sessions for the target row itself; no handler accepts or caches a
 * session snapshot across requests.
 *
 * SECURITY (PLAN review, sub_agent_execution_results bc990563): requestBrowserSession
 * is NEVER called with client-supplied opts -- opts.baseDir/host/port are the only
 * sandbox-escape vector in that function, so this route always omits opts entirely,
 * letting it fall back to the server-configured FLEET_BROWSER_PROFILES_DIR/127.0.0.1.
 */
import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { attach } from '../../lib/fleet/spawn-control.js';
import {
  requestBrowserSession,
  signalTakeover,
  signalHandBack,
  isPaused,
  isBrowserMcpEnabled,
} from '../../lib/fleet/browser-control.js';
import { buildSessionDetailView, mapAttachState } from '../../lib/fleet/session-detail-view.js';

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Fresh, per-request session fetch -- never reused across handlers or requests (PRD FR-3). */
async function fetchFreshSession(supabase, sessionId) {
  const { data, error } = await supabase
    .from('claude_sessions')
    .select('session_id, status, current_tool, last_tool_at, last_activity_kind, expected_silence_until, metadata')
    .eq('session_id', sessionId)
    .maybeSingle();
  if (error) throw new Error(`fetchFreshSession: ${error.message}`);
  return data;
}

const router = Router();

router.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// GET /:id -- fresh view-model for the pane (telemetry, resting attach state, pause/gate flags).
router.get('/:id', async (req, res) => {
  const supabase = getSupabase();
  try {
    const session = await fetchFreshSession(supabase, req.params.id);
    if (!session) return res.status(404).json({ ok: false, reason: 'session_not_found' });
    const view = buildSessionDetailView(session);
    res.json({ ...view, paused: isPaused(session), browserMcpEnabled: isBrowserMcpEnabled(session) });
  } catch (error) {
    console.error('[fleet-sessions] GET /:id failed:', error.message);
    res.status(500).json({ ok: false, reason: 'internal_error', message: error.message });
  }
});

// POST /:id/attach -- FR-1: brings the session's terminal window to OS-level foreground focus.
router.post('/:id/attach', async (req, res) => {
  const supabase = getSupabase();
  try {
    const result = await attach(req.params.id, { supabaseClient: supabase, by: 'session_id' });
    res.json({ ...result, ...mapAttachState(result) });
  } catch (error) {
    console.error('[fleet-sessions] attach failed:', error.message);
    res.status(500).json({ ok: false, reason: 'internal_error', message: error.message });
  }
});

// POST /:id/browser-session -- FR-2: resolves sandboxed launch options; never launches a browser itself.
router.post('/:id/browser-session', async (req, res) => {
  const supabase = getSupabase();
  try {
    const session = await fetchFreshSession(supabase, req.params.id);
    if (!session) return res.status(404).json({ ok: false, reason: 'session_not_found' });
    // opts intentionally omitted -- never forward client-supplied baseDir/host/port (SECURITY review).
    res.json(requestBrowserSession(session));
  } catch (error) {
    console.error('[fleet-sessions] browser-session failed:', error.message);
    res.status(500).json({ ok: false, reason: 'internal_error', message: error.message });
  }
});

// POST /:id/takeover -- FR-4: pauses agent-driven actions. Persistence failure propagates as 500 by design.
router.post('/:id/takeover', async (req, res) => {
  const supabase = getSupabase();
  try {
    const session = await fetchFreshSession(supabase, req.params.id);
    if (!session) return res.status(404).json({ ok: false, reason: 'session_not_found' });
    await signalTakeover(supabase, req.params.id, req.body?.sdKey ?? null);
    res.json({ ok: true, paused: true });
  } catch (error) {
    console.error('[fleet-sessions] takeover failed:', error.message);
    res.status(500).json({ ok: false, reason: 'internal_error', message: error.message });
  }
});

// POST /:id/hand-back -- FR-4: resumes agent-driven actions. Persistence failure propagates as 500 by design.
router.post('/:id/hand-back', async (req, res) => {
  const supabase = getSupabase();
  try {
    const session = await fetchFreshSession(supabase, req.params.id);
    if (!session) return res.status(404).json({ ok: false, reason: 'session_not_found' });
    await signalHandBack(supabase, req.params.id, req.body?.sdKey ?? null);
    res.json({ ok: true, paused: false });
  } catch (error) {
    console.error('[fleet-sessions] hand-back failed:', error.message);
    res.status(500).json({ ok: false, reason: 'internal_error', message: error.message });
  }
});

export default router;
