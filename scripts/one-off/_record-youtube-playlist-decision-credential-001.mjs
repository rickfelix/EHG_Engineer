import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { recordPendingDecision } from '../../lib/chairman/record-pending-decision.mjs';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const result = await recordPendingDecision(supabase, {
  title: "YouTube 'For Processing' playlist: can it be switched from Private to Unlisted?",
  decisionType: 'session_question',
  blocking: true,
  raisedBy: 'Hotel-2',
  recommendation: "Yes, switch to Unlisted -- eliminates the OAuth credential custody problem entirely (no token to store/rotate/revoke) rather than merely relocating it to a GitHub secret. Also closes out a live security exposure: an unrevoked plaintext OAuth refresh_token for this exact playlist was found in eva_sync_state.source_metadata during SD-LEO-FEAT-IDEATION-INGESTION-CONNECTORS-001's LEAD review (2026-08-26T06:56Z signal). If Unlisted is acceptable, playlist-sync.js re-points to the same credential-free RSS/API-key pattern already running green in production for subscription-scanner.js, and the OAuth path can be fully retired.",
  context: {
    sd_key: 'SD-LEO-FEAT-YOUTUBE-INGESTION-CREDENTIAL-001',
    parent_sd_key: 'SD-LEO-FEAT-IDEATION-INGESTION-CONNECTORS-001',
    question: "Can the 'For Processing' YouTube playlist be switched from Private to Unlisted?",
    if_yes: "Re-point lib/integrations/youtube/playlist-sync.js to a credential-free read (RSS feed https://www.youtube.com/feeds/videos.xml?playlist_id=<id>, or a plain YOUTUBE_API_KEY playlistItems.list call) and remove the oauth-manager.js dependency from the sync path entirely.",
    if_no: "Chairman must: (1) publish the Google OAuth consent screen to Production in Google Cloud Console, (2) re-consent with scope narrowed to youtube.readonly (down from the current over-broad youtube read+write scope), (3) provide the resulting refresh_token + GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET as named, GitHub-Environment-scoped secrets (not bare repo secrets -- this repo is public with 210+ workflows). Code-side: oauth-manager.js's DB read/write of tokens to eva_sync_state.source_metadata must be removed entirely (env-var only, no DB fallback).",
    prior_signal_history: [
      '2026-08-26T06:56Z -- Golf-5 flagged a live plaintext OAuth refresh_token for this exact playlist in eva_sync_state.source_metadata as a CRITICAL security finding (unrevoked, could mint fresh access tokens).',
      '2026-08-26T08:54Z -- Golf-5 signaled this same playlist-visibility question to the coordinator as a feedback signal (id 4bb94967) while proceeding with non-credential-path EXEC work on the parent SD.',
      '2026-08-26T16:44Z -- coordinator dispositioned that signal (routing/administrative closure only -- NOT a chairman answer; confirmed via chairman_decisions table search finding zero prior rows on this question).',
      'This child SD (SD-LEO-FEAT-YOUTUBE-INGESTION-CREDENTIAL-001) was carved out specifically to carry this undecided question forward; its own plan explicitly states "Do not start either branch until the chairman answers."'
    ],
  },
});

console.log(JSON.stringify(result, null, 2));
