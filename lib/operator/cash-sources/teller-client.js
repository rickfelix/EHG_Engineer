/**
 * lib/operator/cash-sources/teller-client.js
 *
 * SD-LEO-INFRA-OPERATOR-RUNWAY-TRUTHFULNESS-001 — FR-1/TR-4: a minimal, READ-ONLY
 * Teller.io API client, hand-rolled over Node's built-in `https` module rather than
 * an external "Teller SDK" package. No verified, trustworthy first-party Teller SDK
 * exists on npm to add as a dependency without fabricating one; a small first-party
 * module implementing exactly the two READ endpoints this feature needs has a
 * smaller supply-chain surface than an unaudited third-party package, and is fully
 * unit-testable via dependency injection (the same tellerClientFactory seam
 * bank-read-service.js already exposes).
 *
 * HARD CONTRACT (TR-2, TS-6b):
 *   - This module implements ONLY listAccounts() and getBalance() — Teller's REST
 *     API also exposes transfer/payment endpoints, but no code path to them exists
 *     anywhere in this file, by construction (the static + behavioral guards in
 *     tests/unit/operator/cash-bank-feed.test.js assert this).
 *   - Teller auth is mutual TLS (a chairman-enrolled client cert + private key)
 *     PLUS HTTP Basic Auth (the access token as username, blank password) — both
 *     credentials come from the caller; this module never reads a vault directly.
 *   - The token/cert/key never appear in a log line or thrown error message.
 */

import https from 'node:https';

const TELLER_API_HOST = 'api.teller.io';
const REQUEST_TIMEOUT_MS = 15000;

function tellerGet({ certPem, keyPem, token, path }) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: TELLER_API_HOST,
        path,
        method: 'GET',
        cert: certPem,
        key: keyPem,
        auth: `${token}:`, // HTTP Basic Auth: access token as username, blank password
        headers: { Accept: 'application/json' },
        timeout: REQUEST_TIMEOUT_MS,
        // Explicit defense-in-depth (SECURITY finding, adversarial review): a process-global
        // NODE_TLS_REJECT_UNAUTHORIZED=0 would otherwise silently disable certificate
        // verification for this bank-credential client. Setting it here overrides that env var.
        rejectUnauthorized: true,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode == null || res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`Teller API ${path} returned status ${res.statusCode}`));
            return;
          }
          try {
            resolve(body ? JSON.parse(body) : null);
          } catch {
            reject(new Error(`Teller API ${path} returned unparseable JSON`));
          }
        });
      }
    );
    req.on('error', (err) => reject(new Error(`Teller API ${path} request failed: ${err.message}`)));
    req.on('timeout', () => req.destroy(new Error(`Teller API ${path} request timed out`)));
    req.end();
  });
}

/**
 * A READ-ONLY Teller.io API client. Exposes exactly two methods, matching
 * bank-read-service.js's tellerClientFactory contract:
 *   - listAccounts()          -> GET /accounts
 *   - getBalance(accountId)   -> GET /accounts/:id/balances, normalized to
 *                                { currency: 'USD', available: number } (Teller
 *                                only supports US bank accounts).
 * @param {{token: string, certPem: string, keyPem: string}} creds
 */
export function createTellerClient({ token, certPem, keyPem }) {
  if (!token || typeof token !== 'string') throw new Error('createTellerClient requires a non-empty token');
  if (!certPem || typeof certPem !== 'string') throw new Error('createTellerClient requires a non-empty certPem');
  if (!keyPem || typeof keyPem !== 'string') throw new Error('createTellerClient requires a non-empty keyPem');

  return {
    async listAccounts() {
      const accounts = await tellerGet({ certPem, keyPem, token, path: '/accounts' });
      return Array.isArray(accounts) ? accounts : [];
    },
    async getBalance(accountId) {
      const balance = await tellerGet({ certPem, keyPem, token, path: `/accounts/${encodeURIComponent(accountId)}/balances` });
      return { currency: 'USD', available: Number(balance?.available ?? 0) };
    },
  };
}

export default { createTellerClient };
