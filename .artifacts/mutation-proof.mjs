/**
 * MUTATION PROOF for SD-LEO-INFRA-ONE-SYNTHETIC-ROW-001-A (FR-3 / TS-6).
 *
 * A test that still passes when the thing it tests is neutered is not a test. This script breaks
 * each predicate in turn and asserts the suite goes RED, then restores the file and asserts GREEN.
 *
 * TWO DIRECTIONS, deliberately. Under-detection mutations (predicate always false) prove the
 * POSITIVE arms are load-bearing. The final mutation goes the other way — it makes the
 * periodic_process_registry predicate reuse the canonical FIXTURE_KEY_RE, reproducing the exact
 * over-eating defect this SD exists to prevent. If THE CONTROL block is real, that must go red too.
 * A one-directional mutation proof would leave the over-eating direction unverified, which is the
 * direction that destroys real data.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const MODULE = 'lib/governance/fixture-exclusion.mjs';
const SUITES = 'tests/unit/governance/fixture-exclusion-per-table.test.js tests/unit/governance/fixture-exclusion.test.js';
const ORIGINAL = readFileSync(MODULE, 'utf8');

const MUTATIONS = [
  {
    name: 'isFixtureProcessKey -> always false',
    direction: 'under-detection',
    from: 'return typeof processKey === \'string\' && processKey.startsWith(FIXTURE_PROCESS_KEY_PREFIX);',
    to: 'return false;',
  },
  {
    name: 'isFixtureHealthSnapshot -> always false',
    direction: 'under-detection',
    from: 'return hasFixtureMarker(row.metadata);',
    to: 'return false;',
  },
  {
    name: 'isFixtureCoordinationRow -> always false',
    direction: 'under-detection',
    from: 'return hasFixtureMarker(row.payload);',
    to: 'return false;',
  },
  {
    name: 'isFixtureQfByCreatedBy -> always false',
    direction: 'under-detection',
    from: 'return qf.created_by === FIXTURE_CREATED_BY;',
    to: 'return false;',
  },
  {
    // The opt-in boundary itself is load-bearing: folding created_by back into isFixtureQf would
    // expose five live consumers (incl. the dispatch queue) to a one-column suppression vector.
    name: 'created_by folded back into isFixtureQf (THE OPT-IN BOUNDARY BREACH)',
    direction: 'over-detection — re-exposes an anon-writable suppression vector',
    from: '  if (typeof qf.id === \'string\' && /^QF-(TEST|DEMO)\\b/i.test(qf.id)) return true;',
    to: '  if (typeof qf.id === \'string\' && /^QF-(TEST|DEMO)\\b/i.test(qf.id)) return true;\n  if (qf.created_by === FIXTURE_CREATED_BY) return true;',
  },
  {
    name: 'isFixtureVenture is_demo branch removed',
    direction: 'under-detection',
    from: '  if (v.is_demo === true) return true;\n',
    to: '',
  },
  {
    name: 'hasFixtureMarker accepts truthy instead of strict true',
    direction: 'over-detection',
    from: 'return carrier.is_fixture === true || carrier.synthetic === true;',
    to: 'return Boolean(carrier.is_fixture) || Boolean(carrier.synthetic);',
  },
  {
    // THE ONE THAT MATTERS MOST: reintroduce the over-eating defect.
    name: 'isFixtureProcessKey reuses canonical FIXTURE_KEY_RE (THE OVER-EATING DEFECT)',
    direction: 'OVER-EATING — would destroy 5 real production rows',
    from: 'return typeof processKey === \'string\' && processKey.startsWith(FIXTURE_PROCESS_KEY_PREFIX);',
    to: 'return typeof processKey === \'string\' && FIXTURE_KEY_RE.test(processKey);',
  },
];

function suiteIsGreen() {
  try {
    execSync(`npx vitest run ${SUITES}`, { stdio: 'pipe', encoding: 'utf8' });
    return true;
  } catch {
    return false;
  }
}

console.log('Baseline (unmutated) ...');
if (!suiteIsGreen()) {
  console.error('BASELINE IS RED — cannot run a mutation proof against a failing suite.');
  process.exit(2);
}
console.log('  baseline GREEN\n');

let survivors = 0;
for (const m of MUTATIONS) {
  if (!ORIGINAL.includes(m.from)) {
    console.error(`SKIP (anchor not found — mutation is vacuous): ${m.name}`);
    survivors++;
    continue;
  }
  writeFileSync(MODULE, ORIGINAL.replace(m.from, m.to));
  const green = suiteIsGreen();
  writeFileSync(MODULE, ORIGINAL); // restore before anything else can read it
  const verdict = green ? 'SURVIVED — TEST IS VACUOUS' : 'killed';
  console.log(`  [${green ? 'FAIL' : ' OK '}] ${m.name}\n         direction: ${m.direction}\n         ${verdict}`);
  if (green) survivors++;
}

// Restore-and-verify: never leave a mutated module behind, and prove the restore by re-reading
// from disk rather than trusting the write.
writeFileSync(MODULE, ORIGINAL);
const restored = readFileSync(MODULE, 'utf8') === ORIGINAL;
console.log(`\nmodule restored (re-read from disk): ${restored ? 'yes' : 'NO — MANUAL FIX REQUIRED'}`);
console.log(`final suite: ${suiteIsGreen() ? 'GREEN' : 'RED — MANUAL FIX REQUIRED'}`);
console.log(survivors === 0
  ? `\nALL ${MUTATIONS.length} MUTATIONS KILLED — every predicate is load-bearing.`
  : `\n${survivors} MUTATION(S) SURVIVED — those tests do not test what they claim.`);
process.exitCode = survivors === 0 && restored ? 0 : 1;
