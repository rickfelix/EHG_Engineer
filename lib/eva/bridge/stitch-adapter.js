/**
 * Stitch Adapter - Provider-Agnostic Facade
 * SD-LEO-FIX-GOOGLE-STITCH-PIPELINE-001-C
 *
 * Wraps stitch-client.js behind a provider-agnostic interface with:
 * - Kill switch (stitch_enabled flag) checking
 * - Structured event logging at every joint
 * - Graceful fallback when Stitch is unavailable
 *
 * All consumers MUST import from this module, never from stitch-client directly.
 *
 * @module eva/bridge/stitch-adapter
 * @version 1.0.0
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ---------------------------------------------------------------------------
// Kill Switch
// ---------------------------------------------------------------------------

async function isStitchEnabled() {
  try {
    const { data } = await supabase
      .from('chairman_dashboard_config')
      .select('taste_gate_config')
      .limit(1)
      .single();
    return data?.taste_gate_config?.stitch_enabled === true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Structured Event Logger
// ---------------------------------------------------------------------------

function logStitchEvent({ event, ventureId, stage, status, error }) {
  const entry = {
    event,
    venture_id: ventureId || null,
    stage: stage || null,
    status,
    timestamp: new Date().toISOString(),
  };
  if (error) entry.error = typeof error === 'string' ? error : error.message || String(error);

  if (status === 'success') {
    console.log(`[stitch-adapter] ${JSON.stringify(entry)}`);
  } else {
    console.error(`[stitch-adapter] ${JSON.stringify(entry)}`);
  }

  // Promote fallback/error events to ehg_alerts (SD-EVA-FIX-WIREFRAME-CONTRACT-AND-SILENT-DEGRADATION-001)
  const isAlertWorthy = status === 'error' || status === 'fallback_ascii' ||
    status === 'fallback_skip_export' || event === 's15_fallback' || event === 's17_fallback';
  if (isAlertWorthy && ventureId) {
    const severity = status === 'error' ? 'high' : 'medium';
    supabase.from('ehg_alerts').insert({
      alert_type: `stitch_${event}`,
      severity,
      title: `Stitch ${event} — ${status} (Stage ${stage || '?'})`,
      message: `Venture ${ventureId}: Stitch event=${event}, status=${status}${entry.error ? ', error=' + entry.error : ''}`,
      entity_type: 'venture',
      entity_id: ventureId,
    }).then(({ error: insertErr }) => {
      if (insertErr) console.warn(`[stitch-adapter] Alert insert failed: ${insertErr.message}`);
    });
  }

  return entry;
}

// ---------------------------------------------------------------------------
// Client Loader (delegates to stitch-client.js)
// ---------------------------------------------------------------------------

let _client = null;
let _clientLoader = null;

export function setClientLoader(loader) {
  _clientLoader = loader;
  _client = null;
}

async function getClient() {
  if (_client) return _client;
  if (_clientLoader) {
    _client = await _clientLoader();
    return _client;
  }
  const mod = await import('./stitch-client.js');
  _client = mod;
  return _client;
}

// ---------------------------------------------------------------------------
// Public API — Provider-Agnostic Facade
// ---------------------------------------------------------------------------

/**
 * Provision a Stitch design project (S15 joint).
 * Fallback: returns { status: 'unavailable' } when disabled or errored.
 */
export async function provision(ventureId, stage11Artifacts, stage15Artifacts, options = {}) {
  const enabled = await isStitchEnabled();
  if (!enabled) {
    logStitchEvent({ event: 'provision', ventureId, stage: 15, status: 'skipped_disabled' });
    return { status: 'unavailable', reason: 'stitch_disabled' };
  }

  try {
    // QF-20260412-273: Idempotency guard — reuse existing project
    const { data: existing } = await supabase
      .from('venture_artifacts')
      .select('artifact_data')
      .eq('venture_id', ventureId)
      .in('artifact_type', ['stitch_curation', 'stitch_project'])
      .not('artifact_data->>project_id', 'is', null)
      .limit(1)
      .maybeSingle();

    if (existing?.artifact_data?.project_id) {
      logStitchEvent({ event: 'provision', ventureId, stage: 15, status: 'reused_existing' });
      return { status: 'success', project_id: existing.artifact_data.project_id };
    }

    const client = await getClient();
    const result = await client.createProject({
      name: options.ventureName || 'Venture',
      ventureId,
    });
    logStitchEvent({ event: 'provision', ventureId, stage: 15, status: 'success' });
    return { status: 'success', ...result };
  } catch (err) {
    logStitchEvent({ event: 'provision', ventureId, stage: 15, status: 'error', error: err });
    return { status: 'unavailable', reason: 'provision_failed', error: err.message };
  }
}

/**
 * Export design screens from a Stitch project (S17 joint).
 * Fallback: returns { status: 'unavailable' } when disabled or errored.
 */
export async function exportScreens(ventureId, projectId, options = {}) {
  const enabled = await isStitchEnabled();
  if (!enabled) {
    logStitchEvent({ event: 'export', ventureId, stage: 17, status: 'skipped_disabled' });
    return { status: 'unavailable', reason: 'stitch_disabled' };
  }

  try {
    const client = await getClient();
    const screens = await client.listScreens(projectId);
    if (!screens || screens.length === 0) {
      logStitchEvent({ event: 'export', ventureId, stage: 17, status: 'skipped_no_screens' });
      return { status: 'unavailable', reason: 'no_screens' };
    }

    const results = [];
    for (const screen of screens) {
      const html = await client.exportScreenHtml(screen.screen_id, projectId);
      results.push({ screen_id: screen.screen_id, name: screen.name, html });
    }
    logStitchEvent({ event: 'export', ventureId, stage: 17, status: 'success' });
    return { status: 'success', screens: results };
  } catch (err) {
    logStitchEvent({ event: 'export', ventureId, stage: 17, status: 'error', error: err });
    return { status: 'unavailable', reason: 'export_failed', error: err.message };
  }
}

/**
 * Provision triggered by taste gate ESCALATE verdict.
 * Fallback: logs warning and returns no-op.
 */
export async function tasteGateProvision(ventureId, stage11Artifacts, stage15Artifacts, options = {}) {
  const enabled = await isStitchEnabled();
  if (!enabled) {
    logStitchEvent({ event: 'taste_gate_provision', ventureId, stage: options.stage || null, status: 'skipped_disabled' });
    return { status: 'unavailable', reason: 'stitch_disabled' };
  }

  try {
    // QF-20260412-273: Idempotency guard — reuse existing project
    const { data: existing } = await supabase
      .from('venture_artifacts')
      .select('artifact_data')
      .eq('venture_id', ventureId)
      .in('artifact_type', ['stitch_curation', 'stitch_project'])
      .not('artifact_data->>project_id', 'is', null)
      .limit(1)
      .maybeSingle();

    if (existing?.artifact_data?.project_id) {
      logStitchEvent({ event: 'taste_gate_provision', ventureId, stage: options.stage || null, status: 'reused_existing' });
      return { status: 'success', project_id: existing.artifact_data.project_id };
    }

    const client = await getClient();
    const result = await client.createProject({
      name: options.ventureName || 'Venture',
      ventureId,
    });
    logStitchEvent({ event: 'taste_gate_provision', ventureId, stage: options.stage || null, status: 'success' });
    return { status: 'success', ...result };
  } catch (err) {
    logStitchEvent({ event: 'taste_gate_provision', ventureId, stage: options.stage || null, status: 'error', error: err });
    return { status: 'unavailable', reason: 'taste_gate_provision_failed', error: err.message };
  }
}

/**
 * Check health of the Stitch API.
 */
export async function healthCheck() {
  const enabled = await isStitchEnabled();
  if (!enabled) {
    return { healthy: false, reason: 'stitch_disabled' };
  }

  try {
    const client = await getClient();
    return await client.healthCheck();
  } catch (err) {
    logStitchEvent({ event: 'health_check', ventureId: null, stage: null, status: 'error', error: err });
    return { healthy: false, reason: err.message };
  }
}

/**
 * Check curation status for a venture's Stitch project.
 */
export async function checkCurationStatus(ventureId) {
  const enabled = await isStitchEnabled();
  if (!enabled) {
    return { ready: false, reason: 'stitch_disabled' };
  }

  try {
    const { checkCurationStatus: check } = await import('./stitch-provisioner.js');
    return await check(ventureId);
  } catch (err) {
    logStitchEvent({ event: 'curation_check', ventureId, stage: null, status: 'error', error: err });
    return { ready: false, reason: err.message };
  }
}

/**
 * Get generation budget for a venture.
 */
export async function getGenerationBudget(ventureId) {
  try {
    const client = await getClient();
    return await client.getGenerationBudget(ventureId);
  } catch (err) {
    return { used: 0, limit: 0, remaining: 0, error: err.message };
  }
}

// Re-export for testing
export { logStitchEvent, isStitchEnabled };
