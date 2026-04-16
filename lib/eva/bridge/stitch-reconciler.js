/**
 * Stitch Screen ID Reconciler
 *
 * Decoupled from the provisioner so it survives the abort guard.
 * Polls get_project to discover screen IDs for screens that were fired
 * but didn't return IDs (GFE 60s timeout). Updates the stitch_curation
 * artifact with confirmed_screen_names and generation_results.
 *
 * Can be called:
 *   1. At the end of generateScreens() (inline poll phase)
 *   2. By stage-execution-worker after S15 provisioner completes/times out
 *   3. Manually via backend API
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Reconcile screen IDs for a venture by polling get_project.
 * Reads the stitch_curation artifact at S15, discovers screens via get_project,
 * and updates the artifact with confirmed_screen_names.
 *
 * @param {string} ventureId - Venture ID
 * @param {Object} [options]
 * @param {number} [options.maxWaitMs=300000] - Max time to poll (default 5 min)
 * @param {number} [options.pollIntervalMs=30000] - Poll interval (default 30s)
 * @returns {Promise<{confirmed: number, total: number, screenIds: string[]}>}
 */
export async function reconcileScreenIds(ventureId, options = {}) {
  const maxWaitMs = options.maxWaitMs ?? 300_000;
  const pollIntervalMs = options.pollIntervalMs ?? 30_000;

  // Load stitch_curation artifact at S15
  const { data: artifact } = await supabase
    .from('venture_artifacts')
    .select('id, artifact_data')
    .eq('venture_id', ventureId)
    .eq('artifact_type', 'stitch_curation')
    .eq('lifecycle_stage', 15)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!artifact?.artifact_data?.project_id) {
    console.info('[stitch-reconciler] No stitch_curation artifact with project_id — skipping');
    return { confirmed: 0, total: 0, screenIds: [] };
  }

  const { project_id: projectId, screen_prompts: prompts = [] } = artifact.artifact_data;
  const expectedCount = prompts.length;

  if (expectedCount === 0) {
    console.info('[stitch-reconciler] No screen_prompts in artifact — skipping');
    return { confirmed: 0, total: 0, screenIds: [] };
  }

  // Load SDK
  let sdk;
  try {
    const modPath = '@google/stitch-sdk';
    const mod = await import(/* @vite-ignore */ modPath);
    sdk = mod.default || mod;
  } catch (err) {
    console.warn(`[stitch-reconciler] Cannot load Stitch SDK: ${err.message}`);
    return { confirmed: 0, total: expectedCount, screenIds: [] };
  }

  const apiKey = process.env.STITCH_API_KEY;
  if (!apiKey) {
    console.warn('[stitch-reconciler] STITCH_API_KEY not set — skipping');
    return { confirmed: 0, total: expectedCount, screenIds: [] };
  }

  console.info(`[stitch-reconciler] Reconciling ${expectedCount} screens for project ${projectId}...`);

  // Poll get_project for screen IDs
  const pollStart = Date.now();
  let screenIds = [];

  while (Date.now() - pollStart < maxWaitMs) {
    const toolClient = new sdk.StitchToolClient({ apiKey, timeout: 30_000 });
    try {
      const result = await toolClient.callTool('get_project', {
        name: `projects/${projectId}`
      });
      const instances = result?.screenInstances || [];
      console.info(`[stitch-reconciler] get_project raw: ${instances.length} screenInstances`);
      // Match stitch-client.js filter: include anything with an id, exclude design system instances
      const filtered = instances.filter(s => s.id && s.type !== 'DESIGN_SYSTEM_INSTANCE');
      if (instances.length !== filtered.length) {
        console.info(`[stitch-reconciler] Filtered out ${instances.length - filtered.length} non-screen instances`);
      }

      // Multi-signal completion detection: log rich completion signals so operators
      // can see which screens have thumbnails, source screens, etc.
      const withThumbnails = filtered.filter(s => s.thumbnailScreenshot?.downloadUrl || s.thumbnail?.downloadUrl);
      const withSourceScreen = filtered.filter(s => s.sourceScreen);
      if (filtered.length > 0) {
        console.info(`[stitch-reconciler] Signals: ${filtered.length} ids | ${withThumbnails.length} thumbnails | ${withSourceScreen.length} sourceScreen`);
      }

      screenIds = filtered.map(s => s.id);
    } catch (err) {
      const errType = /abort/i.test(err.message) ? 'AbortError' : /socket|fetch failed/i.test(err.message) ? 'TransportError' : 'Unknown';
      console.warn(`[stitch-reconciler] get_project failed (${errType}): ${err.message}`);
    } finally {
      try { await toolClient.close(); } catch { /* ignore */ }
    }

    if (screenIds.length >= expectedCount) {
      console.info(`[stitch-reconciler] All ${expectedCount} screens confirmed`);
      break;
    }

    const elapsed = Math.round((Date.now() - pollStart) / 1000);
    console.info(`[stitch-reconciler] ${screenIds.length}/${expectedCount} screens after ${elapsed}s, waiting...`);
    await new Promise(r => setTimeout(r, pollIntervalMs));
  }

  // Build confirmed_screen_names from prompts matched to discovered screens
  const confirmedNames = prompts
    .slice(0, screenIds.length)
    .map(p => p.screen_name || p.name || 'Unknown');

  // Build generation_results array
  const generationResults = prompts.map((p, i) => ({
    prompt: (typeof p === 'string' ? p : p.prompt || p.text || '').slice(0, 60),
    status: i < screenIds.length ? 'confirmed' : 'pending',
    screen_id: screenIds[i] || null,
    deviceType: p.deviceType || null,
  }));

  // Update the artifact
  const updatedData = {
    ...artifact.artifact_data,
    confirmed_screen_names: confirmedNames,
    generation_results: generationResults,
    reconciled_at: new Date().toISOString(),
    reconciled_screen_count: screenIds.length,
  };

  const { error } = await supabase
    .from('venture_artifacts')
    .update({ artifact_data: updatedData })
    .eq('id', artifact.id);

  if (error) {
    console.error(`[stitch-reconciler] Failed to update artifact: ${error.message}`);
  } else {
    console.info(`[stitch-reconciler] Updated artifact: ${screenIds.length}/${expectedCount} confirmed`);
  }

  // Update stitch_generation_metrics: change 'fired' OR 'error' → 'confirmed' for
  // reconciled screens. Recovery semantics:
  // - 'fired' → 'confirmed': normal happy path (GFE timeout, screen completed server-side)
  // - 'error' → 'confirmed': RECOVERY path (e.g., a 502/503 occurred but Stitch still
  //   generated the screen — proven by it appearing in get_project). Common scenarios:
  //     • 502 server errors that pre-PR-#3100 were classified as 'sdk_error'
  //     • Future unknown error categories where the screen actually generated
  //   We trust get_project as the source of truth: if the screen exists, it's confirmed.
  //
  // Metrics store the full prompt text truncated to 30 chars (e.g. "Design a Landing Page for Aeth")
  // while prompts store the short screen name (e.g. "Landing Page"). Use ilike contains match.
  for (let i = 0; i < screenIds.length; i++) {
    const prompt = prompts[i];
    if (!prompt) continue;
    const screenName = prompt.screen_name || prompt.name || 'unknown';
    const deviceType = prompt.deviceType || null;

    // Build query: match by screen_name contains + device_type + status IN (fired, error)
    let query = supabase
      .from('stitch_generation_metrics')
      .select('id, status, error_category')
      .eq('venture_id', ventureId)
      .ilike('screen_name', `%${screenName}%`)
      .in('status', ['fired', 'error']);
    if (deviceType) query = query.eq('device_type', deviceType);
    const { data: metric } = await query.limit(1).maybeSingle();

    if (metric) {
      // Preserve diagnostic info: if recovering from an 'error', tag the original
      // error_category so we can audit which errors were actually transient.
      const updates = { status: 'confirmed' };
      if (metric.status === 'error' && metric.error_category) {
        updates.error_category = `${metric.error_category}_recovered`;
      }
      await supabase
        .from('stitch_generation_metrics')
        .update(updates)
        .eq('id', metric.id);
      const recoveryNote = metric.status === 'error' ? ` (recovered from ${metric.error_category || 'error'})` : '';
      console.info(`[stitch-reconciler] Metric confirmed: ${screenName} [${deviceType || '?'}]${recoveryNote}`);
    }
  }

  return { confirmed: screenIds.length, total: expectedCount, screenIds };
}
