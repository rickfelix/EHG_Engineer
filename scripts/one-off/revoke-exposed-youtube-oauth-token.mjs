#!/usr/bin/env node
/**
 * SD-FDBK-ENH-SECURITY-CRITICAL-SAFETY-001 — PRIMARY remediation action.
 *
 * Revokes the live Google OAuth refresh_token found plaintext in
 * eva_sync_state.source_metadata (row 5ea38ba3-6b46-4f17-be5a-3a87a4075143,
 * source_identifier=youtube_oauth) via the programmatic revoke endpoint
 * (oauth2.googleapis.com/revoke), per this SD's success_criteria #1 (primary
 * path, no chairman console dependency).
 *
 * Deliberately does NOT print the token value to stdout/logs anywhere.
 */
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const ROW_ID = '5ea38ba3-6b46-4f17-be5a-3a87a4075143';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: row, error } = await supabase
    .from('eva_sync_state')
    .select('id, source_metadata')
    .eq('id', ROW_ID)
    .single();
  if (error || !row) {
    console.error('FAILED to read row:', error?.message || 'not found');
    process.exit(1);
  }

  const refreshToken = row.source_metadata?.tokens?.refresh_token;
  if (!refreshToken) {
    console.log('No refresh_token present on this row (already purged?) -- nothing to revoke.');
    process.exit(0);
  }

  const params = new URLSearchParams({ token: refreshToken });
  const response = await fetch('https://oauth2.googleapis.com/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const bodyText = await response.text();
  console.log('Revoke response status:', response.status);
  console.log('Revoke response body:', bodyText); // Google's revoke response never echoes the token
  console.log(response.ok
    ? 'RESULT: token revoked (or was already invalid -- Google returns 200 for that too in most cases).'
    : 'RESULT: non-2xx response -- check body above for error (e.g. invalid_token means already revoked/expired, which is an acceptable terminal state for this SD).');
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
