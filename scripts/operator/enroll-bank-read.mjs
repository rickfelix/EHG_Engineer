#!/usr/bin/env node
/**
 * scripts/operator/enroll-bank-read.mjs
 *
 * SD-LEO-INFRA-OPERATOR-RUNWAY-TRUTHFULNESS-001 — FR-1: the chairman enrollment CLI
 * for the bank-read token + Teller mTLS client certificate. Ships the MECHANISM;
 * does NOT self-enroll a live token — running this IS the chairman's own enrollment
 * action.
 *
 * SECURITY CONTRACT (row d3074dd7, TR-6 — all fail-closed):
 *   1. Refuses to run in a CI/fleet/automated context (isCIContext(), reused from
 *      lib/payments/stripe-client.js) UNLESS BANK_READ_ENROLL_CONFIRM=true is ALSO
 *      set — an explicit, positive, human-set confirmation, not just "not detected
 *      as CI".
 *   2. Reads the ENTIRE credential payload (token + Teller cert PEM + Teller key
 *      PEM) as ONE JSON object from STDIN ONLY — never process.argv (argv is
 *      visible in `ps`/shell history/process listings).
 *   3. Never echoes, logs, or includes the token/cert/key in any output or thrown
 *      error message.
 *   4. Refuses to overwrite an existing vault entry unless --reenroll is passed.
 *   5. Emits a best-effort audit_log row (who/when/reenroll flag) — NEVER the
 *      secret values.
 *
 * Usage:
 *   echo '{"token":"...","certPem":"-----BEGIN CERTIFICATE-----\n...","keyPem":"-----BEGIN PRIVATE KEY-----\n..."}' \
 *     | BANK_READ_ENROLL_CONFIRM=true node scripts/operator/enroll-bank-read.mjs [--reenroll]
 */

import 'dotenv/config';
import { fileURLToPath, pathToFileURL } from 'node:url';
import os from 'node:os';
import { isCIContext } from '../../lib/payments/stripe-client.js';
import { storeBankReadToken, loadBankReadToken, storeTellerCertPair, loadTellerCertPair } from '../../lib/operator/cash-sources/token-vault.js';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';

const REENROLL = process.argv.includes('--reenroll');

/** Read the full stdin stream to completion (no size assumption; credentials are small). */
function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
    // No TTY means stdin is piped (the only supported invocation shape); a TTY with
    // no piped input would hang forever waiting for EOF the user never sends.
    if (process.stdin.isTTY) {
      reject(new Error('enroll-bank-read requires the credential JSON piped via stdin (no TTY input supported) — see the file header for usage'));
    }
  });
}

async function main() {
  // MUST 1: fail-closed CI/fleet gate, requires an EXPLICIT positive override.
  // (Explicit `return` after every process.exit() below: in production exit() never
  // returns, but a test harness mocking it as a no-op must not fall through to the
  // next gate/stdin-read as if the refusal never happened.)
  if (isCIContext() && process.env.BANK_READ_ENROLL_CONFIRM !== 'true') {
    console.error(
      '[enroll-bank-read] REFUSED: detected a CI/fleet/automated context. ' +
      'This is a one-time chairman enrollment action, never an autonomous one. ' +
      'Set BANK_READ_ENROLL_CONFIRM=true only if a human is deliberately running this.'
    );
    process.exit(1);
    return;
  }

  // MUST 4: overwrite guard.
  const existingToken = await loadBankReadToken();
  const { certPem: existingCert } = await loadTellerCertPair();
  if ((existingToken || existingCert) && !REENROLL) {
    console.error('[enroll-bank-read] REFUSED: a bank-read credential is already enrolled. Pass --reenroll to intentionally replace it.');
    process.exit(1);
    return;
  }

  // MUST 2: stdin only, never argv.
  let payload;
  try {
    const raw = await readStdin();
    payload = JSON.parse(raw);
  } catch {
    // Deliberately generic — V8's JSON.parse SyntaxError embeds a fragment of the offending
    // input in err.message (e.g. a chairman mistakenly piping a raw token instead of the JSON
    // envelope would leak its first ~10 chars into this log line otherwise). Never interpolate
    // the caught error here (SECURITY finding, adversarial review).
    console.error('[enroll-bank-read] REFUSED: could not read/parse the credential JSON from stdin — expected {"token":"...","certPem":"...","keyPem":"..."}.');
    process.exit(1);
    return;
  }

  const { token, certPem, keyPem } = payload || {};
  if (!token || !certPem || !keyPem) {
    console.error('[enroll-bank-read] REFUSED: stdin payload must be JSON with non-empty "token", "certPem", and "keyPem" fields.');
    process.exit(1);
    return;
  }

  await storeBankReadToken(token);
  await storeTellerCertPair({ certPem, keyPem });

  // MUST 5: best-effort audit event — never the secret values.
  try {
    const supabase = createSupabaseServiceClient();
    await supabase.from('audit_log').insert({
      event_type: 'BANK_READ_ENROLLMENT',
      entity_type: 'operator_cash_source',
      entity_id: 'bank_read',
      severity: 'info',
      created_by: os.userInfo().username,
      metadata: { at: new Date().toISOString(), reenroll: REENROLL },
    });
  } catch (err) {
    console.warn(`[enroll-bank-read] WARN audit_log write failed (enrollment still succeeded, non-blocking): ${err.message}`);
  }

  console.log(`[enroll-bank-read] Bank-read token + Teller mTLS cert pair enrolled successfully${REENROLL ? ' (re-enrollment)' : ''}. Nothing was logged or echoed.`);
}

// Entrypoint guard: only run main() as a CLI, never on static import.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(() => process.exit(0)).catch((e) => { console.error('[enroll-bank-read] FATAL', e.message); process.exit(1); });
}

export { main, readStdin };
