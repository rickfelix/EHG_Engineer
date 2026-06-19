/**
 * lib/operator/cash-sources/bank-read-service.js
 *
 * SD-EHG-OPERATOR-CASH-BANK-FEED-001 — FR-1/FR-4: Teller.io bank-READ service
 * (Plaid is the compliance alternative). Reads cash-on-hand + categorized
 * non-AI business burn from the chairman's enrolled bank accounts.
 *
 * HARD CONTRACT:
 *   - CHAIRMAN-GATED / INERT BY DEFAULT (FR-4): with no vaulted token this returns
 *     null and makes NO connection attempt. The actual connection only exists once
 *     the chairman enrolls (storeBankReadToken) — this SD connects nothing.
 *   - READ-ONLY (TR-2): only account/balance/transaction READS; the service exposes
 *     and uses no transfer / payment / payout capability.
 *   - The decrypted token is held ONLY here, passed ONLY to the injected read
 *     client, never logged, never returned, never written to the substrate row.
 *
 * The Teller client is provided via `tellerClientFactory` (wired at enrollment).
 * Absent a factory the service stays inert rather than guess a transport — so the
 * module ships and is fully testable with zero live bank credentials or SDK deps.
 */

import { loadBankReadToken } from './token-vault.js';

/**
 * Read the bank cash slice (+ optional categorized non-AI burn). INERT (null) when
 * the chairman has not enrolled or no read client is wired.
 *
 * @param {object} [opts]
 * @param {function} [opts.loadToken] - async () => token|null (tests); defaults to the vault
 * @param {function} [opts.tellerClientFactory] - (token) => readClient with
 *        listAccounts() and getBalance(accountId); only READ methods are used
 * @returns {Promise<{usd:number, other_burn_usd:(number|null), source:'bank'}|null>}
 */
export async function readBankCashSlice({ loadToken = loadBankReadToken, tellerClientFactory } = {}) {
  const token = await loadToken();
  if (!token) return null; // INERT — chairman has not enrolled; connect nothing
  // Greenfield: the read transport is wired at enrollment. Without it, stay inert
  // rather than fabricate a connection.
  if (typeof tellerClientFactory !== 'function') return null;
  try {
    const client = tellerClientFactory(token); // token never leaves this scope
    const accounts = (await client.listAccounts()) || []; // READ
    let cashUsd = 0;
    for (const acct of accounts) {
      const bal = await client.getBalance(acct.id); // READ
      if (String(bal?.currency || 'USD').toUpperCase() === 'USD') {
        cashUsd += Number(bal?.available || 0);
      }
    }
    // Categorized non-AI burn (FR-2 part-b) is derived from transaction
    // categorization when the connection exposes it; null until then.
    const otherBurnUsd =
      typeof client.getCategorizedBurnUsd === 'function'
        ? Number((await client.getCategorizedBurnUsd()) || 0)
        : null;
    return {
      usd: Number(cashUsd.toFixed(2)),
      other_burn_usd: otherBurnUsd == null ? null : Number(otherBurnUsd.toFixed(2)),
      source: 'bank',
    };
  } catch {
    return null; // fail-soft
  }
}
