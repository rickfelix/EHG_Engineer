/**
 * /api/michael routes — SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-C (FR-6) creates this file;
 * SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-E extends it with the brief endpoints.
 *
 * Mount pattern (server/index.js): app.use('/api/michael', requireAuth, requireAdminRole, michaelRoutes)
 *   — chairman-scope data, the same two-guard shape as /api/admin/protocol-lint (SECURITY S-7).
 *
 * GET /oauth/status          non-secret columns of michael_credentials + hours_to_expiry + health.
 *                            NEVER selects encrypted_blob or encryption_metadata and never decrypts.
 *                            404 NO_CREDENTIAL when no grant is stored; 503 TABLES_ABSENT while the
 *                            child B migration is unapplied. Error bodies: { error, message, code }.
 *
 * GET /brief/latest          the most recent michael_brief_runs row.
 * GET /brief/:date           the row for that ET date (YYYY-MM-DD).
 *                            Content negotiation: ?format=html or an Accept header preferring text/html
 *                            returns rendered_html as text/html; otherwise JSON with EXACTLY
 *                            { data_json, verified, enriched_at, assembled_at } — never another column
 *                            (never rendered_html/brief_md in the JSON body; never a secret, there are
 *                            none on this table). 404 NO_BRIEF when no row exists for the date; 503
 *                            TABLES_ABSENT while the child B migration is unapplied.
 */
import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { readCredentialRow, oauthHealth, hoursToExpiry, STATUS_COLUMNS, CREDENTIAL_IDENTIFIER } from '../../lib/integrations/google/chairman-oauth.js';
import { readRows } from '../../lib/michael/db.mjs';

const BRIEF_COLUMNS = 'et_date,data_json,rendered_html,verified,verify_notes,assembled_at,enriched_at';
const ET_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

/** Pure: the JSON body for a brief row — EXACTLY these four fields, never rendered_html/brief_md. */
export function briefJsonPayload(row) {
  return { data_json: row.data_json, verified: row.verified, enriched_at: row.enriched_at || null, assembled_at: row.assembled_at || null };
}

/** Pure: does this request want HTML? ?format= wins; otherwise the Accept header's best match. */
export function wantsHtml(req) {
  if (req.query && req.query.format) return String(req.query.format).toLowerCase() === 'html';
  return typeof req.accepts === 'function' && req.accepts(['html', 'json']) === 'html';
}

function sendBrief(req, res, row) {
  if (wantsHtml(req)) return res.type('html').send(row.rendered_html || '');
  return res.json(briefJsonPayload(row));
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

  router.get('/brief/latest', async (req, res) => {
    const r = await readRows(getSupabase(), 'michael_brief_runs', (q) => q.order('et_date', { ascending: false }).limit(1), { select: BRIEF_COLUMNS });
    if (r.tables_absent) return res.status(503).json({ error: 'Service Unavailable', message: 'michael_brief_runs is not applied yet (child B migration, chairman-gated)', code: 'TABLES_ABSENT' });
    if (r.error) return res.status(500).json({ error: 'Internal Server Error', message: r.error, code: 'BRIEF_READ_FAILED' });
    const row = r.rows[0];
    if (!row) return res.status(404).json({ error: 'Not Found', message: 'no michael_brief_runs row exists yet', code: 'NO_BRIEF' });
    return sendBrief(req, res, row);
  });

  router.get('/brief/:date', async (req, res) => {
    const date = req.params.date;
    if (!ET_DATE_RE.test(date)) return res.status(400).json({ error: 'Bad Request', message: '--date must be YYYY-MM-DD', code: 'ET_DATE_INVALID' });
    const r = await readRows(getSupabase(), 'michael_brief_runs', (q) => q.eq('et_date', date).limit(1), { select: BRIEF_COLUMNS });
    if (r.tables_absent) return res.status(503).json({ error: 'Service Unavailable', message: 'michael_brief_runs is not applied yet (child B migration, chairman-gated)', code: 'TABLES_ABSENT' });
    if (r.error) return res.status(500).json({ error: 'Internal Server Error', message: r.error, code: 'BRIEF_READ_FAILED' });
    const row = r.rows[0];
    if (!row) return res.status(404).json({ error: 'Not Found', message: `no michael_brief_runs row for ${date}`, code: 'NO_BRIEF' });
    return sendBrief(req, res, row);
  });

  return router;
}

export default createMichaelRouter();
