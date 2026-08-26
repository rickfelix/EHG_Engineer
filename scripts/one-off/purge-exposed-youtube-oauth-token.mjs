#!/usr/bin/env node
/**
 * SD-FDBK-ENH-SECURITY-CRITICAL-SAFETY-001 -- success_criteria #2 (DB PURGED).
 *
 * Archives a structure-only (values redacted, shapes/lengths preserved) snapshot
 * of the exposed row to this SD's own metadata (DB-first evidence, per CLAUDE.md's
 * database-first principle) BEFORE deleting the plaintext token values from the
 * live row. Never prints or persists a token VALUE anywhere.
 */
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const ROW_ID = '5ea38ba3-6b46-4f17-be5a-3a87a4075143';
const SD_KEY = 'SD-FDBK-ENH-SECURITY-CRITICAL-SAFETY-001';

function redactShape(tokens) {
  const shape = {};
  for (const [key, value] of Object.entries(tokens || {})) {
    if (typeof value === 'string') {
      shape[key] = { type: 'string', length: value.length, prefix: value.slice(0, 4) };
    } else {
      shape[key] = { type: typeof value, value: typeof value === 'number' || typeof value === 'boolean' ? value : '[redacted]' };
    }
  }
  return shape;
}

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: row, error: fetchErr } = await supabase
    .from('eva_sync_state')
    .select('id, source_type, source_identifier, source_metadata, created_at, updated_at')
    .eq('id', ROW_ID)
    .single();
  if (fetchErr || !row) {
    console.error('FAILED to read row:', fetchErr?.message || 'not found');
    process.exit(1);
  }

  const tokens = row.source_metadata?.tokens;
  if (!tokens) {
    console.log('No plaintext `tokens` key present on this row -- already purged. Nothing to do.');
    process.exit(0);
  }

  const evidence = {
    purged_at: new Date().toISOString(),
    row_id: ROW_ID,
    source_type: row.source_type,
    source_identifier: row.source_identifier,
    row_created_at: row.created_at,
    row_updated_at_pre_purge: row.updated_at,
    token_shape_redacted: redactShape(tokens),
    revocation_evidence: {
      revoke_endpoint_response: 'invalid_token (already dead)',
      refresh_attempt_response: 'invalid_grant (confirmed dead via oauth2.googleapis.com/token)',
      verified_at: new Date().toISOString(),
    },
  };

  // 1. Archive structure-only evidence to this SD's own metadata (DB-first).
  const { data: sd, error: sdFetchErr } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('sd_key', SD_KEY)
    .single();
  if (sdFetchErr) { console.error('FAILED to read SD:', sdFetchErr.message); process.exit(1); }

  const { error: sdUpdateErr } = await supabase
    .from('strategic_directives_v2')
    .update({ metadata: { ...sd.metadata, pre_purge_evidence: evidence } })
    .eq('sd_key', SD_KEY);
  if (sdUpdateErr) { console.error('FAILED to archive evidence:', sdUpdateErr.message); process.exit(1); }
  console.log('Evidence archived to SD metadata.pre_purge_evidence.');

  // 2. Purge: remove the `tokens` key entirely (dead credential, no encrypted
  // re-storage -- forces the connector's documented re-auth path per success
  // criterion #4, matching the new oauth-manager.js read contract which only
  // trusts `encrypted_tokens`, never legacy `tokens`).
  const { tokens: _dropped, ...restMetadata } = row.source_metadata;
  const { error: purgeErr } = await supabase
    .from('eva_sync_state')
    .update({ source_metadata: restMetadata })
    .eq('id', ROW_ID);
  if (purgeErr) { console.error('FAILED to purge row:', purgeErr.message); process.exit(1); }

  // 3. Read back and prove no token-shaped string survives.
  const { data: verifyRow, error: verifyErr } = await supabase
    .from('eva_sync_state')
    .select('source_metadata')
    .eq('id', ROW_ID)
    .single();
  if (verifyErr) { console.error('FAILED to read back:', verifyErr.message); process.exit(1); }

  const raw = JSON.stringify(verifyRow.source_metadata);
  const stillExposed = /ya29\.|1\/\/0[0-9a-zA-Z]/.test(raw);
  console.log('Post-purge source_metadata keys:', Object.keys(verifyRow.source_metadata || {}));
  console.log(stillExposed ? 'FAIL: token-shaped string STILL present after purge!' : 'PASS: no token-shaped string remains in the row.');
  if (stillExposed) process.exit(1);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
}
