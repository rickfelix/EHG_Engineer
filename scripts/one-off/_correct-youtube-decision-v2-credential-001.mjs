import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DECISION_ID = 'a94f88c8-bf97-4c04-a11a-084817cdc185';

const { data: existing, error: fetchErr } = await supabase
  .from('chairman_decisions')
  .select('brief_data, status')
  .eq('id', DECISION_ID)
  .maybeSingle();

if (fetchErr || !existing) { console.log('FETCH_FAILED', fetchErr?.message); process.exit(1); }
if (existing.status !== 'pending') {
  console.log('REFUSING_UPDATE: status is no longer pending (', existing.status, ')');
  process.exit(1);
}

const correctedRecommendation = "Yes, switch to Unlisted is still my recommendation -- it remains the lower-total-effort path and permanently retires the OAuth credential-custody problem class. BUT (2nd correction, from an independent VALIDATION sub-agent pass): neither branch is a simple flip -- both need real engineering work regardless of your answer. If YES (Unlisted/credential-free): playlist-sync.js currently discovers the playlist by NAME via the OAuth playlists.list call being removed -- there is no playlist ID configured anywhere, so the credential-free path needs a one-time captured playlist ID (trivial) PLUS a choice between plain RSS (loses the playlistItem id that 3 modules use to mark items processed/deleted -- would strand new rows) or a YOUTUBE_API_KEY playlistItems.list call (preserves playlistItem id, so this is now the recommended concrete implementation, not RSS). If NO (stay private, OAuth fallback): oauth-manager.js's OAuth scope is a SINGLE SHARED CONSTANT also used read+write by 6 production call sites in two other modules (post-processing/disposal) -- naively narrowing it to youtube.readonly would break those, so the fallback branch needs a two-client design (a read-only client for this sync path, keeping the existing read+write client for disposal), not a one-line scope change. Additionally, the sync's circuit breaker is already latched open (3 consecutive failures) independent of this decision -- it will need a manual reset before either branch can be verified working. None of this changes the underlying yes/no question or my recommendation; it changes the estimated effort (now realistically similar on both branches, not 'trivial vs a whole OAuth flow') and the concrete plan PLAN-phase will author.";

const correctedContext = {
  ...existing.brief_data?.context,
  correction_note_2: "2026-08-26: independent VALIDATION sub-agent pass found the plan's PREFERRED (credential-free) branch was written against a playlist ID that doesn't exist in config (playlist-sync.js discovers by NAME via the OAuth call being removed), and that plain RSS loses the playlistItem id 3 modules depend on for marking items processed -- a YOUTUBE_API_KEY playlistItems.list call is the corrected recommended implementation instead of RSS. Also found the FALLBACK branch's OAuth scope is shared read+write with 6 other production call sites (post-processing/disposal) -- narrowing it needs a two-client design, not a one-line edit. Also found the sync's circuit breaker is already latched open (3 consecutive failures), independent of this decision, and will need a manual reset before either branch can be verified working end-to-end.",
};

const { data: updated, error: updateErr } = await supabase
  .from('chairman_decisions')
  .update({
    brief_data: {
      ...existing.brief_data,
      recommendation: correctedRecommendation,
      context: correctedContext,
    },
  })
  .eq('id', DECISION_ID)
  .eq('status', 'pending')
  .select('id, status, updated_at');

console.log(JSON.stringify({ updated, updateErr: updateErr?.message }, null, 2));
