import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-DEMAND-ENGINE-FAIL-001';
const VERIFIER = 'Alpha-2 (Explore sub-agent pass, evidence row 6e993c86-01fc-46ef-aafb-c0c295490b11)';

const { data: current, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('metadata')
  .eq('sd_key', SD_KEY)
  .single();
if (readErr) { console.error('READ ERROR:', readErr.message); process.exit(1); }

const newVerifications = [
  { verified_by: VERIFIER, verified_at: 'lib/marketing/autonomy-gate.js:308', note: 'shouldEnforceBlock() call site; autonomyState branch begins line 325' },
  { verified_by: VERIFIER, verified_at: 'lib/governance/stage-gate-predicate.js:309', note: 'shouldEnforceBlock() export' },
  { verified_by: VERIFIER, verified_at: 'lib/marketing/ai/email-campaigns.js:60', note: 'sendEmail() factory method, ungated; processStep() at line 129 is gated and calls sendEmail() at line 179' },
  { verified_by: VERIFIER, verified_at: 'lib/marketing/publisher/index.js:117', note: 'dry-run branch returns {dryRun:true} on missing credentials, no mode field' },
  { verified_by: VERIFIER, verified_at: 'lib/marketing/content-pipeline.js:136', note: 'reads only pubResult.success, never .dryRun, before incrementing totalPublished' },
  { verified_by: VERIFIER, verified_at: 'lib/marketing/owned-audience-content-loop.js:173', note: 'writes marketing_content_queue.status=posted on any success:true, including a dry-run publish' },
  { verified_by: VERIFIER, verified_at: 'lib/services/sovereign-alert.js:174', note: 'pushToDiscord() ungated webhook; excluded from mirror sites as operator/chairman emergency alerting, not customer outreach' },
  { verified_by: VERIFIER, verified_at: 'src/services/CalibrationService.js:340', note: 'production call site invoking SovereignAlert.fireCalibrationEmergency' },
  { verified_by: VERIFIER, verified_at: 'lib/eva/launch-mode.js:228', note: 'sole write path setting ventures.launch_mode; launch_mode_audit has 0 rows lifetime' },
  { verified_by: VERIFIER, verified_at: 'lib/marketing/venture-consent.js:76', note: 'resolveSendPermission() is the mirror-site consent gate for this file' },
];

const existing = Array.isArray(current.metadata?.mechanism_verifications) ? current.metadata.mechanism_verifications : [];
const merged = [...existing, ...newVerifications];

const newMetadata = { ...(current.metadata || {}), mechanism_verifications: merged };

const { error: updateErr } = await supabase
  .from('strategic_directives_v2')
  .update({ metadata: newMetadata })
  .eq('sd_key', SD_KEY);

if (updateErr) { console.error('UPDATE ERROR:', updateErr.message); process.exit(1); }
console.log(`mechanism_verifications written: ${merged.length} total entries (${newVerifications.length} new).`);
