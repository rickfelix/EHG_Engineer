import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-FEAT-YOUTUBE-INGESTION-CREDENTIAL-001';

const { data: sd, error: fetchErr } = await supabase
  .from('strategic_directives_v2')
  .select('id, metadata')
  .eq('sd_key', SD_KEY)
  .maybeSingle();

if (fetchErr || !sd) {
  console.log('FETCH_FAILED', fetchErr?.message);
  process.exit(1);
}

const leadDiligence = {
  performed_at: '2026-08-26T18:26:00Z',
  performed_by: 'Hotel-2',
  findings: [
    {
      claim: "Plan states an unrevoked plaintext OAuth refresh_token for this playlist is a live security exposure motivating urgency.",
      verified: false,
      correction: "STALE. Separately resolved by SD-FDBK-ENH-SECURITY-CRITICAL-SAFETY-001: the flagged token (eva_sync_state id 5ea38ba3) was confirmed dead (revoke->invalid_token, refresh-grant->invalid_grant) and purged; source_metadata for that row is now empty (verified live 2026-08-26T18:2X). Storage mechanism now encrypts tokens at rest (AES-256-GCM via lib/security/encryption.cjs) rather than plaintext. No live credential risk currently exists. This decision is now a pure architecture-simplification choice, not a security-urgency one.",
    },
    {
      claim: "Plan states the RSS credential-free pattern (feeds/videos.xml?playlist_id=<id>) is 'already running green in production' via subscription-scanner.js.",
      verified: 'partial',
      correction: "subscription-scanner.js's production RSS usage is channel_id-based (?channel_id=<id>), confirmed live in lib/integrations/youtube/subscription-scanner.js:25. The playlist_id variant of the same YouTube feed endpoint (?playlist_id=<id>) is a real, documented YouTube feature but is NOT the variant proven in this codebase's production traffic. If the chairman approves Unlisted, the playlist_id RSS variant needs its own small verification step (a manual curl/fetch against the real playlist once Unlisted) before being trusted as equivalent to the channel_id precedent -- do not assume parity.",
    },
    {
      claim: "oauth-manager.js SCOPES still needs narrowing from full read+write to youtube.readonly (fallback path only).",
      verified: true,
      correction: null,
    },
  ],
  chairman_decision_filed: {
    id: 'a94f88c8-bf97-4c04-a11a-084817cdc185',
    status_at_filing: 'pending',
    blocking: true,
    escalated_via: 'email (SMS gate held -- context did not match structured SMS rubric, non-blocking since email escalation is the guaranteed channel)',
    corrected_at: '2026-08-26T18:2X (same session, before any answer -- stale urgency claim fixed in place)',
  },
  sd_status: 'GENUINELY BLOCKED on chairman answer per this SD\'s own plan ("Do not start either branch until the chairman answers"). Claim held, not released, per fleet ANTI-WIND-DOWN policy -- this is a logged, verified blocker, not a scope/context-length rationalization.',
};

const { data: updated, error: updateErr } = await supabase
  .from('strategic_directives_v2')
  .update({
    metadata: {
      ...sd.metadata,
      lead_diligence: leadDiligence,
    },
  })
  .eq('id', sd.id)
  .select('id');

console.log(JSON.stringify({ updated, updateErr: updateErr?.message }, null, 2));
