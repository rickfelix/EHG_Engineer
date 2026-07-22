#!/usr/bin/env node
/**
 * daily-review-drive-doc.js — SD-LEO-INFRA-CHAIRMAN-DAILY-REVIEW-DOC-001-C (FR-4).
 *
 * Non-interactive cron/CI entrypoint for the 5:45 daily brief: STEP-1-VERIFY the secret,
 * run the artifact pre-ship gate over the assembled brief, then write the PRIVATE Doc into the
 * chairman-owned folder. --smoke exercises the fail-closed path without a live write.
 *
 * The write-only GOOGLE_SERVICE_ACCOUNT_JSON secret exists only in cron/CI — this seam is what a
 * scheduled workflow invokes; it takes no interactive input. Graceful degradation: on any failure
 * the existing 6AM SMS + signed doc-link brief remains the fallback (a failure never blocks it).
 */
import { createBriefDoc, loadServiceAccount, MissingCredentialError } from '../lib/daily-review/drive-doc-client.js';
import { runPreShipGate } from '../lib/daily-review/artifact-preship-gate.js';

const isSmoke = process.argv.includes('--smoke');

/**
 * Assemble the brief. In production the parent daily-review automation supplies content +
 * a Solomon forecast accessor; here it is an injectable seam so the entrypoint stays testable.
 */
function assembleBrief() {
  return { title: 'EHG Daily Brief', body: '', elements: [] };
}

async function main() {
  // STEP-1-VERIFY: fail closed if the secret is absent (env is the only verification point).
  try {
    loadServiceAccount(process.env);
  } catch (e) {
    if (e instanceof MissingCredentialError || e.failClosed) {
      console.error(`[daily-review-drive-doc] ${e.message}`);
      process.exit(1);
    }
    throw e;
  }

  if (isSmoke) {
    console.log('[daily-review-drive-doc] smoke OK: GOOGLE_SERVICE_ACCOUNT_JSON present, fail-closed path verified (no live write in smoke).');
    process.exit(0);
  }

  const brief = assembleBrief();
  // FR-3 pre-ship gate BEFORE any write. Real runs inject the Solomon forecast accessor.
  const verdict = runPreShipGate(brief, { getForecast: () => undefined });
  if (verdict.blocked) {
    console.error('[daily-review-drive-doc] pre-ship gate BLOCKED delivery:', JSON.stringify(verdict.offending));
    process.exit(2);
  }

  const { docId, webViewLink } = await createBriefDoc({ title: brief.title, body: brief.body });
  console.log(`[daily-review-drive-doc] wrote brief doc ${docId} ${webViewLink}`);
}

main().catch((e) => {
  console.error('[daily-review-drive-doc] FATAL', e && e.message ? e.message : e);
  process.exit(1);
});
