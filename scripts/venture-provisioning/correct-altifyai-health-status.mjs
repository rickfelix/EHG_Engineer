#!/usr/bin/env node
/**
 * One-off correction: AltifyAI's health_status was stamped 'healthy' by
 * checkDeploymentHealth(), which verifies shell reachability + referenced
 * asset resolution only (no JS execution, no auth-path check). It cannot
 * detect the client-side-rendered Clerk auth Configuration error the
 * chairman found via console diagnosis (QF-187; SD-LEO-FIX-ALTIFYAI-LIVE-SITE-001
 * is in flight to fix it). Per coordinator directive 1201fa34, correcting to
 * 'warning' and annotating the persisted artifact so a reader does not
 * conclude the product is functional.
 *
 * Looks up the CURRENT is_current=true launch_deployment_runbook row dynamically
 * rather than a hardcoded artifact ID -- a hardcoded ID goes stale the next time
 * recordProvisioningReadiness() runs and supersedes it (this bit once already:
 * the first version of this script hardcoded 89dd383a, which was superseded
 * before this correction's own carry-forward fix landed in exec-boundary-readiness.js,
 * silently reapplying to a row nothing read anymore).
 */
import dotenv from 'dotenv';
import { createSupabaseServiceClient } from '../../lib/supabase-connection.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

dotenv.config();

const VENTURE_ID = '50763b6a-1fad-4e1e-b2fc-296a1d66ebf9';
const ARTIFACT_TYPE = 'launch_deployment_runbook';

/**
 * Core correction logic, injectable supabase client for testability.
 * @param {{ supabase: object, ventureId?: string, artifactType?: string, now?: () => string }} params
 * @returns {Promise<{ ok: boolean, artifactId?: string, reason?: string }>}
 */
export async function correctHealthStatus({ supabase, ventureId = VENTURE_ID, artifactType = ARTIFACT_TYPE, now = () => new Date().toISOString() }) {
  const { data: vRows, error: vErr } = await supabase
    .from('ventures')
    .update({ health_status: 'warning' })
    .eq('id', ventureId)
    .select('id, health_status');
  if (vErr || !vRows?.length) {
    return { ok: false, reason: `ventures correction failed: ${vErr?.message || 'zero rows matched'}` };
  }

  const { data: artifact, error: readErr } = await supabase
    .from('venture_artifacts')
    .select('id, artifact_data')
    .eq('venture_id', ventureId)
    .eq('artifact_type', artifactType)
    .eq('is_current', true)
    .single();
  if (readErr) {
    return { ok: false, reason: `artifact read failed: ${readErr.message}` };
  }

  const correctedData = {
    ...artifact.artifact_data,
    health_status_correction: {
      corrected_at: now(),
      corrected_by: 'SD-FDBK-ENH-EHG-OPERATING-COMPANY-001-A worker, per coordinator directive 1201fa34',
      from: 'healthy',
      to: 'warning',
      reason: "checkDeploymentHealth() verifies shell reachability + referenced JS/CSS asset resolution ONLY (no headless browser, no JS execution, no auth-path check -- see module docstring). It cannot detect a client-side-rendered Clerk auth Configuration error. Chairman console diagnosis (QF-187) already found Clerk auth broken on this exact deploy; SD-LEO-FIX-ALTIFYAI-LIVE-SITE-001 is in flight to fix it. assetsVerified:true is accurate (the JS bundle byte-loaded) but does not mean the product is functional -- reachable-not-functional, same class as this SD's own earlier fence-stamp correction.",
      known_defect_ref: 'SD-LEO-FIX-ALTIFYAI-LIVE-SITE-001',
    },
  };

  const { data: updated, error: updErr } = await supabase
    .from('venture_artifacts')
    .update({ artifact_data: correctedData })
    .eq('id', artifact.id)
    .select('id');
  if (updErr || !updated?.length) {
    return { ok: false, reason: `artifact annotation failed: ${updErr?.message || 'zero rows matched'}` };
  }

  return { ok: true, artifactId: artifact.id };
}

if (isMainModule(import.meta.url)) {
  (async () => {
    const supabase = await createSupabaseServiceClient('engineer', { verbose: false });
    const result = await correctHealthStatus({ supabase });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  })().catch((err) => { console.error('Fatal error:', err.message); process.exit(1); });
}
