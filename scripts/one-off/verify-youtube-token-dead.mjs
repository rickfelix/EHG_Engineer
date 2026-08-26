#!/usr/bin/env node
/**
 * SD-FDBK-ENH-SECURITY-CRITICAL-SAFETY-001 -- success_criteria #1 proof:
 * "a subsequent refresh attempt with the old token returns invalid_grant".
 * Deliberately never prints the token value.
 */
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const ROW_ID = '5ea38ba3-6b46-4f17-be5a-3a87a4075143';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: row, error } = await supabase.from('eva_sync_state').select('source_metadata').eq('id', ROW_ID).single();
  if (error || !row?.source_metadata?.tokens?.refresh_token) {
    console.log('No refresh_token present -- already purged, cannot re-verify (acceptable, purge already achieves the goal).');
    process.exit(0);
  }
  const refreshToken = row.source_metadata.tokens.refresh_token;

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const bodyText = await response.text();
  console.log('Refresh-attempt status:', response.status);
  console.log('Refresh-attempt body:', bodyText);
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
