#!/usr/bin/env node
/**
 * SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-D FR-D4: print the committed LEAD-FINAL-APPROVAL gate
 * census -- every registered gate's required/registered/env-flag disposition, generated live from
 * getRequiredGates() so it cannot drift from the code the way a hand-maintained SD/PRD list did.
 *
 * Usage: node scripts/gate-census-lead-final-approval.mjs [--json]
 */
import { buildGateCensus } from './modules/handoff/executors/lead-final-approval/gate-census.js';
import { isMainModule } from '../lib/utils/is-main-module.js';

export function printCensus(census, { json = false } = {}) {
  if (json) {
    console.log(JSON.stringify(census, null, 2));
    return;
  }
  const requiredCount = census.filter((g) => g.required).length;
  console.log(`\nLEAD-FINAL-APPROVAL gate census (${census.length} registered, ${requiredCount} required:true)\n`);
  console.log('NAME'.padEnd(38) + 'REQUIRED'.padEnd(10) + 'ENV FLAG'.padEnd(42) + 'DISPOSITION');
  console.log('-'.repeat(140));
  for (const g of census) {
    console.log(
      g.name.padEnd(38)
      + String(g.required).padEnd(10)
      + `${g.env_flag || '-'} `.padEnd(42)
      + (g.env_flag_disposition || (g.env_flag ? `enforced=${g.env_flag_enforced}` : '-'))
    );
  }
  console.log('');
}

async function main() {
  const json = process.argv.includes('--json');
  const census = buildGateCensus({}, {}, { sd_key: 'CENSUS-CLI', sd_type: 'bugfix' });
  printCensus(census, { json });
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e.message);
    process.exit(1);
  });
}
