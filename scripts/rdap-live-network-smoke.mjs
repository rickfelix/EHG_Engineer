#!/usr/bin/env node
// QF-20260912-463: a genuine live-network check that rdap.org does not 403 the descriptive
// user-agent added in lib/venture-domains/availability.js. Deliberately NOT a vitest test --
// tests/setup.unit.js's unitTierNetworkFence structurally refuses every non-loopback fetch in
// the 'unit' vitest project (the only project whose globs match anything under tests/unit/),
// so a vitest-based version of this check would always self-skip and never assert anything
// for real. This script runs outside that fence and self-skips (exit 0) only on a genuine
// network failure -- it never fails the build for an environment with no internet access.
import { checkDomainAvailability } from '../lib/venture-domains/availability.js';
import { isMainModule } from '../lib/utils/is-main-module.js';

export async function runRdapLiveSmoke({ fetchImpl = fetch, domain = 'google.com' } = {}) {
  const result = await checkDomainAvailability(domain, { fetch: fetchImpl });
  if (/^fetch_failed/.test(result.reason || '')) {
    return { status: 'SKIPPED', reason: 'network unreachable', result };
  }
  if (result.reason === 'rdap_status_403') {
    return { status: 'FAIL', reason: 'rdap.org 403d the descriptive user-agent', result };
  }
  if (result.verdict !== 'taken') {
    return { status: 'FAIL', reason: `expected verdict 'taken' for a known-registered domain, got '${result.verdict}'`, result };
  }
  return { status: 'PASS', result };
}

async function main() {
  const outcome = await runRdapLiveSmoke();
  console.log(JSON.stringify(outcome, null, 2));
  process.exitCode = outcome.status === 'FAIL' ? 1 : 0;
}

if (isMainModule(import.meta.url)) {
  main();
}
