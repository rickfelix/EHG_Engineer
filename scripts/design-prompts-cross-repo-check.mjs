#!/usr/bin/env node
/**
 * design-prompts-cross-repo-check — advisory cross-repo parity gate.
 * SD-LEO-INFRA-UNIFY-STAGE-DESIGN-001 (Phase 3, advisory)
 *
 * The shared design-prompt bodies (the 3 design audits + the Feedback page) are
 * vendored byte-equivalent into BOTH repos — S17 (ehg UI:
 * src/components/stage17/gvos/shared-design-prompts.json) and S19 (here:
 * lib/eva/bridge/shared-design-prompts.json). This compares THIS repo's canonical
 * checksum against the sibling copy (path passed as argv[2]) and exits non-zero on
 * divergence, so the twinned CI workflow can flag drift. A twin script + workflow
 * live in rickfelix/ehg.
 *
 * Uses the same canonicalChecksum the freshness gate uses (parse + NFC + compact
 * stringify + sha256) so the comparison is apples-to-apples across repos.
 *
 * Advisory for now (the CI job runs continue-on-error: true). Flip to blocking by
 * removing that line + adding the check to required status checks once the
 * false-positive rate is confirmed ~0.
 *
 *   node scripts/design-prompts-cross-repo-check.mjs <path-to-sibling-shared-json>
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { canonicalChecksum } from './design-prompts-sync.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const LOCAL = join(here, '..', 'lib', 'eva', 'bridge', 'shared-design-prompts.json');
const siblingPath = process.argv[2];

if (!siblingPath) {
  console.error('usage: design-prompts-cross-repo-check.mjs <sibling-shared-design-prompts.json>');
  process.exit(2);
}

const local = canonicalChecksum(readFileSync(LOCAL, 'utf8'));
let sibling;
try {
  sibling = canonicalChecksum(readFileSync(siblingPath, 'utf8'));
} catch (e) {
  console.error(`::warning ::cannot read sibling shared design-prompts at ${siblingPath}: ${e.message}`);
  process.exit(2);
}

if (local !== sibling) {
  console.log(`::warning ::S17/S19 shared design-prompts DIVERGED — this repo ${local} vs sibling ${sibling}. The 3 audits + Feedback page are out of sync across repos; re-vendor the shared JSON into both and run \`npm run design-prompts:sync\`. (advisory — will block once promoted)`);
  process.exit(1);
}
console.log(`[design-prompts cross-repo] OK — S17 == S19 — ${local}`);
