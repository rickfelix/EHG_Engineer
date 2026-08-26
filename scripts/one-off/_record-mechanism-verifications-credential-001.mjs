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

const mechanismVerifications = [
  {
    verified_by: 'validation-agent (evidence row 1412ec49-aa14-4c97-a348-0373889d5843)',
    verified_at: 'lib/integrations/youtube/oauth-manager.js:28',
    note: 'SCOPES constant confirmed as single shared read+write scope, not narrowed to youtube.readonly.',
  },
  {
    verified_by: 'validation-agent (evidence row 1412ec49-aa14-4c97-a348-0373889d5843)',
    verified_at: 'lib/integrations/youtube/post-processor.js:183',
    note: 'One of 6 production call sites that exercise the write half of the shared OAuth scope (disposal path) -- confirms narrowing SCOPES would break this.',
  },
  {
    verified_by: 'validation-agent (evidence row 1412ec49-aa14-4c97-a348-0373889d5843)',
    verified_at: 'lib/integrations/youtube/strategy-extract-core.js:271',
    note: 'Another of the 6 production call sites exercising the write half of the shared OAuth scope.',
  },
  {
    verified_by: 'Explore agent + validation-agent (evidence row 1412ec49-aa14-4c97-a348-0373889d5843)',
    verified_at: 'lib/integrations/youtube/playlist-sync.js:294',
    note: 'getAuthenticatedClient() call confirmed -- playlist-sync.js has no non-OAuth code path; findTargetPlaylist() discovers by NAME via playlists.list, not by a configured ID.',
  },
  {
    verified_by: 'Explore agent + validation-agent (evidence row 1412ec49-aa14-4c97-a348-0373889d5843)',
    verified_at: 'lib/integrations/youtube/subscription-scanner.js:25',
    note: 'Confirmed channel_id-based RSS feed URL, credential-free, running in production -- NOT playlist_id-based as the plan implied; playlist_id variant live-probed separately by validation-agent (HTTP 200 but 15-entry cap, no playlistItem id).',
  },
];

const { data: updated, error: updateErr } = await supabase
  .from('strategic_directives_v2')
  .update({
    metadata: {
      ...sd.metadata,
      mechanism_verifications: mechanismVerifications,
    },
  })
  .eq('id', sd.id)
  .select('id');

console.log(JSON.stringify({ updated, updateErr: updateErr?.message }, null, 2));
