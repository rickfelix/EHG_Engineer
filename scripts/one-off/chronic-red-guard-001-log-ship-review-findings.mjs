#!/usr/bin/env node
/**
 * SD-LEO-INFRA-CHRONIC-RED-GUARD-001 — /ship Step 5.5.6: log the deep-tier
 * adversarial review findings for PR #7534's audit trail.
 */
import fs from 'node:fs';
import { logFindings } from '../../lib/ship/review-findings-logger.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const { owner, name } = JSON.parse(fs.readFileSync('.claude-work/ship-repo-resolved.json', 'utf8'));

const findings = [
  { type: 'WARNING', description: 'CRIT-003 lookbehind over-excluded imperative-verb compounds like auth_disable() — fixed and mutation-tested (commit 54a4f57486a)' },
  { type: 'INFO', description: 'CRIT-006 lookbehind only excludes one whitespace char between key and client — narrow, accurate as documented, not fixed' },
  { type: 'INFO', description: 'isPatternDefinitionPath() path match was unanchored, allowing a nested same-named file to inherit the exemption — fixed and mutation-tested (commit 54a4f57486a)' },
  { type: 'INFO', description: 'security-hygiene-rls-searchpath.test.js FR-2b 3rd test only asserts static manifest content, not runtime isExemptTable() behavior — not fixed, candidate for a future SD' },
  { type: 'INFO', description: 'docs/audits/sentinel-finding-dispositions.json has no code consumer or entry-enforcement mechanism — honestly scoped per its own _meta, not fixed' },
  { type: 'INFO', description: 'scripts/seed-migration-dispositions.mjs readGapBodies() keys by basename, collides across dirs with the same basename — not reachable today, not fixed' },
];

async function main() {
  const result = await logFindings({
    prNumber: 7534,
    reviewTier: 'deep',
    riskScore: 1,
    findings,
    verdict: 'pass',
    sdKey: 'SD-LEO-INFRA-CHRONIC-RED-GUARD-001',
    branch: 'feat/SD-LEO-INFRA-CHRONIC-RED-GUARD-001',
    multiAgent: true,
    repo: `${owner}/${name}`,
  });
  console.log('logFindings result:', JSON.stringify(result));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error('❌', err.message);
    process.exit(1);
  });
}
