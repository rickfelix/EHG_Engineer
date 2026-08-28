import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-FEAT-YOUTUBE-INGESTION-CREDENTIAL-001';

const { data: sd, error: fetchErr } = await supabase
  .from('strategic_directives_v2')
  .select('id, exploration_summary')
  .eq('sd_key', SD_KEY)
  .maybeSingle();

if (fetchErr || !sd) { console.log('FETCH_FAILED', fetchErr?.message); process.exit(1); }

const filesExplored = [
  { file_path: 'lib/integrations/youtube/playlist-sync.js', finding: 'No non-OAuth code path; discovers the "For Processing" playlist by NAME via oauth-manager.js getAuthenticatedClient()+playlists.list({mine:true}) -- no playlist ID configured anywhere.' },
  { file_path: 'lib/integrations/youtube/oauth-manager.js', finding: 'SCOPES (line 28) is a single shared constant = full read+write https://www.googleapis.com/auth/youtube. Tokens now encrypted at rest (AES-256-GCM) in eva_sync_state.source_metadata -- prior plaintext exposure already purged/confirmed dead.' },
  { file_path: 'lib/integrations/youtube/subscription-scanner.js', finding: 'Line 25: credential-free RSS via feeds/videos.xml?channel_id=<id> -- proven live in production, but channel-based, NOT playlist-based as the SD plan implied.' },
  { file_path: 'lib/integrations/youtube/post-processor.js', finding: 'One of 6 production call sites (lines 183, 262, 277) exercising the WRITE half of the shared OAuth scope -- narrowing oauth-manager.js SCOPES to youtube.readonly would break this disposal path.' },
  { file_path: 'lib/integrations/youtube/strategy-extract-core.js', finding: 'Another set of production call sites (lines 271, 302, 329) also exercising the write half of the shared OAuth scope -- confirms scope narrowing needs a two-client design, not a one-line edit.' },
  { file_path: 'lib/integrations/youtube/video-metadata.js', finding: 'Line 48: an existing, working YOUTUBE_API_KEY read-only call already in production for per-video metadata -- a closer precedent for the credential-free branch than the RSS pattern the plan led with.' },
  { file_path: '.github/workflows/eva-idea-sync-cron.yml', finding: 'No environment: key or GitHub-Environment-scoped secrets wired for YouTube yet (only SUPABASE_URL/SERVICE_ROLE_KEY/TODOIST_API_TOKEN as bare repo secrets) -- clean slate for whichever branch this SD ships.' },
  { file_path: '.github/workflows/youtube-subscription-digest.yml', finding: 'Line 32: YOUTUBE_API_KEY wired as a bare repo secret (not Environment-scoped) for the unrelated subscription-digest feature -- a live precedent for the API-key pattern, but not itself Environment-scoped (a gap this SD should not copy for the "For Processing" credential).' },
];

const explorationSummary = {
  files_explored: filesExplored,
  performed_by: 'Hotel-2 (via Explore agent + validation-agent, LEAD phase)',
  performed_at: '2026-08-26T19:0X',
  note: 'Exploration surfaced 4 defects in the plan\'s original mechanism claims (see metadata.lead_diligence_validation_agent for full findings) -- both implementation branches need real rework beyond what the plan describes.',
};

const { data: updated, error: updateErr } = await supabase
  .from('strategic_directives_v2')
  .update({ exploration_summary: explorationSummary })
  .eq('id', sd.id)
  .select('id');

console.log(JSON.stringify({ updated, updateErr: updateErr?.message }, null, 2));
