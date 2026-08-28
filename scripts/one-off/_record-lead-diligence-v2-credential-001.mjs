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

if (fetchErr || !sd) { console.log('FETCH_FAILED', fetchErr?.message); process.exit(1); }

const validationFindings = {
  performed_at: '2026-08-26T18:5X',
  performed_by: 'validation-agent (via Hotel-2, LEAD phase)',
  evidence_row_id: '1412ec49-aa14-4c97-a348-0373889d5843',
  verdict: 'CONDITIONAL_PASS (confidence 90)',
  supersedes: 'my own preliminary lead_diligence findings above where noted',
  findings: [
    {
      id: 'F1',
      severity: 'critical',
      claim: "Fallback branch narrows oauth-manager.js SCOPES to youtube.readonly.",
      finding: "SCOPES is a single shared constant also used read+write by 6 production call sites across post-processor.js and strategy-extract-core.js (the disposal/post-processing path). Narrowing it would silently break disposal. Needs a two-client design (separate read-only client for the sync path), not a one-line scope change.",
    },
    {
      id: 'F2',
      severity: 'high',
      claim: "Preferred branch re-points playlist-sync.js to a credential-free read of the same playlist.",
      finding: "playlist-sync.js currently discovers the target playlist by NAME via the OAuth playlists.list({mine:true}) call being removed -- there is no playlist ID configured anywhere in the codebase. Either branch needs a one-time captured playlist ID added to config first.",
    },
    {
      id: 'F3',
      severity: 'high',
      claim: "RSS and YOUTUBE_API_KEY playlistItems.list are interchangeable credential-free options.",
      finding: "They are NOT interchangeable. RSS yields no playlistItem id, which is populated on 284/284 current rows and consumed by 3 modules for playlistItems.delete-based disposal -- RSS would strand every new row. YOUTUBE_API_KEY playlistItems.list preserves playlistItem id and is the corrected recommended implementation, not RSS.",
    },
    {
      id: 'F5',
      severity: 'medium',
      claim: "Success criterion #2 (verify a real pull via workflow_dispatch) is achievable once a branch ships.",
      finding: "The sync's circuit breaker is already latched open (consecutive_failures=3) and syncYouTube() early-returns skipped:true before any state update -- it cannot self-heal. Needs a manual reset before either branch can be verified working end-to-end, independent of this SD's own decision.",
    },
    {
      id: 'RSS_PARITY_MEASURED',
      severity: 'info',
      finding: "Live-probed (not just inferred): feeds/videos.xml?playlist_id=<id> returns HTTP 200, byte-identical shape to the proven channel_id feed -- so the fetch/parse code transfers directly as a primitive. But it has a 15-entry hard cap with no pagination and no playlistItem id/duration/tags -- confirms it's not a drop-in per F3, closing the 'unverified precedent' gap my first-pass diligence had left open.",
    },
    {
      id: 'REUSE_CANDIDATE',
      severity: 'info',
      finding: "lib/integrations/youtube/video-metadata.js:48 already runs a working YOUTUBE_API_KEY read-only path in production for per-video metadata -- a closer, already-proven precedent for the preferred branch than the RSS pattern the plan leads with.",
    },
  ],
  duplicate_check: 'PASS -- 68 YouTube-mentioning SDs swept, only 5 name the specific lib files, all others completed with disjoint scope. Carve-out from the parent SD is legitimate.',
  blocked_status_reconfirmed: "GENUINELY BLOCKED, independently reconfirmed. Decision a94f88c8 is the only match across all 730 chairman_decisions rows (server-side filter), status=pending, updated_at===created_at (untouched since filing).",
  impact_on_chairman_decision: "Decision a94f88c8's recommendation text was corrected a 2nd time to reflect that BOTH branches now have real, non-trivial engineering work -- this does not change the underlying yes/no question, but changes the effort estimate PLAN phase will scope.",
};

const { data: updated, error: updateErr } = await supabase
  .from('strategic_directives_v2')
  .update({
    metadata: {
      ...sd.metadata,
      lead_diligence_validation_agent: validationFindings,
    },
  })
  .eq('id', sd.id)
  .select('id');

console.log(JSON.stringify({ updated, updateErr: updateErr?.message }, null, 2));
