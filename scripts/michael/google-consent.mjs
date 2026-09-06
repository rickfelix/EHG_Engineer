#!/usr/bin/env node
// scripts/michael/google-consent.mjs — THE re-consent runbook for the chairman's Google grant (spec §4, D4 8e6ac764).
// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-C (FR-4).
//
// Runbook (host only, one command):   node scripts/michael/google-consent.mjs
//   Pre-flights, in order and all BEFORE the browser opens: host venue (no GITHUB_ACTIONS/CI),
//   MICHAEL_ENCRYPTION_KEY present and 64 hex, GOOGLE_CLIENT_ID/SECRET present, michael_credentials
//   applied. Then a state+PKCE consent on 127.0.0.1:3456 for gmail.modify, calendar.readonly,
//   drive.readonly, stored as ciphertext. Re-run whenever michael-oauth-health warns (child G).
//   --status   print the non-secret row (never the blob) with health and hours_to_expiry
//   --json     one JSON object on stdout
//   Every refusal exits 2 with a code; success exits 0.
// Key provisioning (once): node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
//   then MICHAEL_ENCRYPTION_KEY=<hex> in the host .env; back it up with the .env; never commit; never GHA.
// Host scheduling precedent for child D's feeders: scripts/setup-alarm-cron-tasks.mjs registering a
//   scripts/cron/*.cmd wrapper through scripts/cron/run-hidden.vbs (spec §5 line 105 names two paths
//   that do not exist; these are the live ones).
import 'dotenv/config';
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { createMichaelClient, parseArgs, refusal, emit } from '../../lib/michael/db.mjs';
import {
  assertHostVenue, readHostKey, keyFingerprint, readCredentialRow, runConsentFlow, oauthHealth, hoursToExpiry, STATUS_COLUMNS, CREDENTIAL_IDENTIFIER,
} from '../../lib/integrations/google/chairman-oauth.js';

/** Pure: the non-secret status object. Never includes encrypted_blob or encryption_metadata. */
export function statusOf(row, hostFingerprint, now = Date.now()) {
  return {
    identifier: CREDENTIAL_IDENTIFIER,
    present: !!row,
    scopes: row ? row.scopes : [],
    expires_at: row ? row.expires_at : null,
    last_refreshed_at: row ? row.last_refreshed_at : null,
    last_error: row ? row.last_error : null,
    key_fingerprint: row ? row.key_fingerprint : null,
    host_key_fingerprint: hostFingerprint,
    key_matches: !!(row && row.key_fingerprint && row.key_fingerprint === hostFingerprint),
    hours_to_expiry: hoursToExpiry(row, now),
    health: oauthHealth(row, now),
  };
}

/** Pure: the human rendering of --status (DESIGN D-2), one field per line. */
export function renderStatus(s) {
  return [
    `grant:            ${s.identifier} (${s.present ? 'present' : 'absent'})`,
    `health:           ${s.health}`,
    `scopes:           ${(s.scopes || []).join(', ') || '-'}`,
    `expires_at:       ${s.expires_at || '-'} (${s.hours_to_expiry == null ? '-' : s.hours_to_expiry + 'h'})`,
    `last_refreshed:   ${s.last_refreshed_at || '-'}`,
    `last_error:       ${s.last_error || '-'}`,
    `key_fingerprint:  ${s.key_fingerprint || '-'} (host ${s.host_key_fingerprint}${s.key_matches ? ', matches' : s.present ? ', MISMATCH' : ''})`,
  ].join('\n');
}

/** The verb. deps: { sb, env, argv, now, consent }. Never throws. */
export async function runGoogleConsent({ sb, env = process.env, argv = [], now = Date.now(), consent = runConsentFlow } = {}) {
  const a = parseArgs(argv);
  try {
    assertHostVenue(env);
    const hostFp = keyFingerprint(readHostKey(env));
    if (a.status) {
      const row = await readCredentialRow(sb || createMichaelClient(), STATUS_COLUMNS);
      return { ok: true, status: statusOf(row, hostFp, now) };
    }
    const out = await consent({ sb, env });
    return { ok: true, consented: true, ...out };
  } catch (e) {
    return refusal((e && e.code) || 'CONSENT_FAILED', (e && e.message) || String(e));
  }
}

if (isMainModule(import.meta.url)) {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  const r = await runGoogleConsent({ argv });
  if (r.ok && r.status && !json) console.log(renderStatus(r.status));
  else emit(r, { json });
  process.exit(r.ok ? 0 : 2);
}
