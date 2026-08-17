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
 */
import dotenv from 'dotenv';
import { createSupabaseServiceClient } from '../../lib/supabase-connection.js';

dotenv.config();

const VENTURE_ID = '50763b6a-1fad-4e1e-b2fc-296a1d66ebf9';
const ARTIFACT_ID = '89dd383a-5163-4b57-8514-40929bdbd907';

async function main() {
  const supabase = await createSupabaseServiceClient('engineer', { verbose: false });

  const { data: vRows, error: vErr } = await supabase
    .from('ventures')
    .update({ health_status: 'warning' })
    .eq('id', VENTURE_ID)
    .select('id, health_status');
  console.log('ventures correction:', JSON.stringify({ vRows, vErr }));
  if (vErr || !vRows?.length) { console.error('ventures correction FAILED'); process.exit(1); }

  const { data: artifact, error: readErr } = await supabase
    .from('venture_artifacts')
    .select('artifact_data')
    .eq('id', ARTIFACT_ID)
    .single();
  if (readErr) { console.error('artifact read error:', JSON.stringify(readErr)); process.exit(1); }

  const correctedData = {
    ...artifact.artifact_data,
    health_status_correction: {
      corrected_at: new Date().toISOString(),
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
    .eq('id', ARTIFACT_ID)
    .select('id');
  console.log('artifact annotation:', JSON.stringify({ updated, updErr }));
  if (updErr || !updated?.length) { console.error('artifact annotation FAILED'); process.exit(1); }

  console.log('DONE');
}

main().catch((err) => { console.error('Fatal error:', err.message); process.exit(1); });
