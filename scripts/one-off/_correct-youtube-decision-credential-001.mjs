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

if (fetchErr || !existing) {
  console.log('FETCH_FAILED', fetchErr?.message);
  process.exit(1);
}
if (existing.status !== 'pending') {
  console.log('REFUSING_UPDATE: status is no longer pending (', existing.status, ') -- do not touch a decided/answered row');
  process.exit(1);
}

const correctedRecommendation = "Yes, switch to Unlisted -- eliminates the OAuth credential custody problem entirely (no token to store/rotate/revoke) rather than merely relocating it to a GitHub secret, and matches the credential-free pattern already running green in production for subscription-scanner.js. CORRECTION (2026-08-26T18:2X): my original recommendation cited a live unrevoked plaintext refresh_token as urgent security rationale -- that has since been resolved by a separate SD (SD-FDBK-ENH-SECURITY-CRITICAL-SAFETY-001): the flagged token (eva_sync_state id 5ea38ba3) was confirmed DEAD (revoke attempt returned invalid_token, confirmed via failed refresh-grant exchange returning invalid_grant), has been PURGED (source_metadata is now empty), and the storage mechanism itself now encrypts tokens at rest (AES-256-GCM) rather than plaintext. There is currently NO live credential risk sitting in the DB. This decision is no longer urgent/security-driven -- it is a normal architecture-simplification choice: Unlisted removes an entire credential-management surface (rotation, encryption-key custody, scope minimization) for a low/zero cost (the playlist becomes discoverable via direct link, not searchable, and not linked from any public channel).";

const correctedContext = {
  ...existing.brief_data?.context,
  correction_note: "2026-08-26: original decision request cited a live unrevoked plaintext refresh_token as urgency rationale. That finding was resolved by a different SD before this decision was answered -- see corrected recommendation for details. The underlying yes/no question (playlist visibility) is unchanged; only the urgency framing was stale.",
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
  .eq('status', 'pending') // belt-and-suspenders: only touch if still pending at write time
  .select('id, status, updated_at');

console.log(JSON.stringify({ updated, updateErr: updateErr?.message }, null, 2));
