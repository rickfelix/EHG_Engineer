/**
 * /api/michael routes — SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-C (FR-6) creates this file; child E extends it.
 *
 * Mount pattern (server/index.js): app.use('/api/michael', requireAuth, requireAdminRole, michaelRoutes)
 *   — chairman-scope data, the same two-guard shape as /api/admin/protocol-lint (SECURITY S-7).
 *
 * GET /oauth/status   non-secret columns of michael_credentials + hours_to_expiry + health.
 *                     NEVER selects encrypted_blob or encryption_metadata and never decrypts.
 *                     404 NO_CREDENTIAL when no grant is stored; 503 TABLES_ABSENT while the
 *                     child B migration is unapplied. Error bodies: { error, message, code }.
 */
import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { readCredentialRow, oauthHealth, hoursToExpiry, STATUS_COLUMNS, CREDENTIAL_IDENTIFIER } from '../../lib/integrations/google/chairman-oauth.js';

export const RECONSENT_COMMAND = 'node scripts/michael/google-consent.mjs';

function defaultSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  return createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

/** Pure: the response body. Only non-secret fields can ever appear here. */
export function statusPayload(row, now = Date.now()) {
  return {
    identifier: CREDENTIAL_IDENTIFIER,
    scopes: row.scopes || [],
    expires_at: row.expires_at || null,
    last_refreshed_at: row.last_refreshed_at || null,
    last_error: row.last_error || null,
    key_fingerprint: row.key_fingerprint || null,
    hours_to_expiry: hoursToExpiry(row, now),
    health: oauthHealth(row, now),
    reconsent: RECONSENT_COMMAND,
  };
}

export function createMichaelRouter({ getSupabase = defaultSupabase, now = () => Date.now() } = {}) {
  const router = Router();
  router.get('/oauth/status', async (_req, res) => {
    try {
      const row = await readCredentialRow(getSupabase(), STATUS_COLUMNS);
      if (!row) return res.status(404).json({ error: 'Not Found', message: `No Google grant stored; run ${RECONSENT_COMMAND} on the chairman host`, code: 'NO_CREDENTIAL' });
      return res.json(statusPayload(row, now()));
    } catch (e) {
      if (e && e.code === 'TABLES_ABSENT') return res.status(503).json({ error: 'Service Unavailable', message: 'michael_credentials is not applied yet (child B migration, chairman-gated)', code: 'TABLES_ABSENT' });
      return res.status(500).json({ error: 'Internal Server Error', message: (e && e.message) || 'status failed', code: (e && e.code) || 'STATUS_FAILED' });
    }
  });
  return router;
}

export default createMichaelRouter();
