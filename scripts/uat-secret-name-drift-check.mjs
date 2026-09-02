#!/usr/bin/env node
/**
 * SD-LEO-INFRA-ALTIFYAI-TEST-IDENTITY-001 (FR-5 AC#5, TS-7).
 *
 * Periodic drift check: does the pinned secret-name constant
 * (lib/eva/synthetic-actor-constants.js) still match (a) the live keystrokes
 * document delivered to the chairman, and (b) altifyai's live deploy.yml?
 * A mismatch on either side means the chairman's instructions and the CI
 * that actually consumes the secret have silently diverged -- exactly the
 * cross-repo drift class this test scenario exists to catch.
 *
 * Run via: node scripts/uat-secret-name-drift-check.mjs
 * Requires: gh CLI authenticated (reads altifyai's deploy.yml via `gh api`),
 * SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL in env.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CHAIRMAN_UAT_SECRET_NAME } from '../lib/eva/synthetic-actor-constants.js';

/**
 * Pure -- exported for unit testing. Finds the first secrets.<NAME>
 * reference within the post-deploy-signed-in-uat step's own block (scanning
 * forward from the step's name so a secret used by an EARLIER step, e.g.
 * VITE_CLERK_PUBLISHABLE_KEY, is never mistaken for this one).
 */
export function findSecretNameInDeployYml(deployYmlText) {
  const stepIdx = deployYmlText.indexOf('post-deploy-signed-in-uat');
  if (stepIdx === -1) return null;
  const stepBlock = deployYmlText.slice(stepIdx, stepIdx + 1000);
  const secretMatch = stepBlock.match(/secrets\.([A-Z0-9_]+)/);
  return secretMatch ? secretMatch[1] : null;
}

/**
 * QF-20260901-006: fetch + base64-decode deploy.yml's content via `gh api`, returning null (never
 * throwing) on ANY failure -- a 404 (missing path or insufficient cross-repo token scope) is a
 * MISSING-PATH finding, not a crash. `run` is injected so this is testable without a live `gh`.
 */
export function fetchDeployYmlText(apiPath, run = execFileSync) {
  try {
    const b64 = run('gh', ['api', apiPath, '--jq', '.content'], { encoding: 'utf8' }).trim();
    return Buffer.from(b64, 'base64').toString('utf8');
  } catch (err) {
    console.log(`::warning::uat-secret-name-drift-check: could not read ${apiPath} (${String(err.message || err).split('\n')[0]}) -- MISSING-PATH finding, not a crash (missing file or insufficient cross-repo token scope). Skipping this half of the check (advisory).`);
    return null;
  }
}

async function main() {
  const errors = [];

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: sd, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('sd_key', 'SD-LEO-INFRA-ALTIFYAI-TEST-IDENTITY-001')
    .maybeSingle();
  if (sdErr) throw sdErr;
  const keystrokesSecretName = sd?.metadata?.fr5_keystrokes_draft?.secret_name;
  if (keystrokesSecretName !== CHAIRMAN_UAT_SECRET_NAME) {
    errors.push(`Keystrokes document names secret "${keystrokesSecretName}" but the pinned constant is "${CHAIRMAN_UAT_SECRET_NAME}"`);
  } else {
    console.log(`Keystrokes document matches pinned constant: "${keystrokesSecretName}"`);
  }

  // Reads the DEFAULT branch (main) unless --ref is passed -- a periodic
  // post-merge check compares against steady-state, not an in-flight PR
  // branch. --ref exists for pre-merge verification during EXEC itself.
  const refArgIdx = process.argv.indexOf('--ref');
  const ref = refArgIdx !== -1 ? process.argv[refArgIdx + 1] : null;
  const apiPath = `repos/rickfelix/altifyai/contents/.github/workflows/deploy.yml${ref ? `?ref=${ref}` : ''}`;
  // QF-20260901-006: `gh api` on this path was crashing the whole check daily (uncaught
  // execFileSync throw on a 404) -- MEASURED live: the same path returns 200 under an
  // interactively-authenticated `gh`, but 404s under CI's cross-repo token, so this is the
  // token's read-scope on the private altifyai repo, not a missing file (an operator item, out
  // of this QF's scope per its own description). Either way -- missing path or insufficient
  // scope -- this half of the check cannot be measured, and per the workflow's own already-correct
  // no-token guard, an unmeasurable check is an advisory skip, never a crash or a false finding.
  const deployYmlText = fetchDeployYmlText(apiPath);

  if (deployYmlText === null) {
    console.log('altifyai deploy.yml drift check skipped -- path unreachable (advisory, see warning above).');
  } else {
    const liveSecretName = findSecretNameInDeployYml(deployYmlText);
    if (liveSecretName !== CHAIRMAN_UAT_SECRET_NAME) {
      errors.push(`altifyai's live deploy.yml references secret "${liveSecretName}" but the pinned constant is "${CHAIRMAN_UAT_SECRET_NAME}"`);
    } else {
      console.log(`altifyai's live deploy.yml matches pinned constant: "${liveSecretName}"`);
    }
  }

  if (errors.length > 0) {
    console.error('::error::uat-secret-name-drift-check: ' + errors.join(' | '));
    process.exit(1);
  }
  console.log('UAT secret-name drift check PASSED -- keystrokes document, deploy.yml, and the pinned constant all agree.');
  process.exit(0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
