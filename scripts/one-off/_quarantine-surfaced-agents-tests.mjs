#!/usr/bin/env node
/**
 * SD-LEO-INFRA-FLEET-WIDE-VITEST-001 — register the two RED test files that FR-3 surfaced.
 *
 * FR-3 narrowed SHARED_EXCLUDE's agents glob (aimed at the lib/agents source tree) so it stopped
 * swallowing the tests/unit/agents tree. 12 files became collected for the first time; 10 pass, 2 do
 * not. They were red all along — nothing could see them.
 *
 * QUARANTINE, NOT RE-EXCLUSION, and the difference is the whole point of this SD. Re-excluding
 * would return them to invisibility: no record, no count, suite green, nobody knows. The
 * manifest is the repo's DECLARED debt register (vitest.config.js:283-284), the membership
 * guard treats quarantine as a NAMED category, and every entry carries its real error and a
 * linked feedback row. The debt stays counted.
 *
 * Fixing the underlying product drift is OUT of this SD's scope — that is a separate ticket.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MANIFEST = path.join(REPO, 'tests/quarantine-manifest.json');
const SESSION = 'cff8013c-93e3-41d2-bea1-f511c2189051';
const LINKED = 'feedback:16fe70aa-ecc9-439f-b050-7b8c930103bb';
const NOW = '2026-08-09T03:35:00.000Z';

const ENTRIES = [
  {
    file: 'tests/unit/agents/venture-state-machine-jit-check.test.js',
    reason_class: 'assertion-drift',
    error_signature: "TypeError: stateMachine._approveHandoff is not a function // 4 tests; also \"TypeError: Cannot destructure property 'data' of '(intermediate value)' as it is undefined\". The suite targets a method that no longer exists on VentureStateMachine — the implementation moved on while the test could not fail, because vitest never collected it.",
    linked_ref: LINKED,
    quarantined_at: NOW,
    quarantined_by: SESSION,
    triage_note: 'NEVER COLLECTED until SD-LEO-INFRA-FLEET-WIDE-VITEST-001 FR-3 narrowed SHARED_EXCLUDE \'**/agents/**\' (aimed at lib/agents/**, it also swallowed tests/unit/agents/**). Not a new regression — a pre-existing red that nothing could observe. Quarantined rather than re-excluded so it stays counted in the declared register and visible to the membership guard. De-quarantine by realigning the suite with the current VentureStateMachine API, or delete it if the behaviour it asserts is gone.',
  },
  {
    file: 'tests/unit/agents/agent-registry.test.js',
    reason_class: 'timeout',
    error_signature: 'Unknown Error: TypeError: fetch failed // a live network call inside a unit test; the unit tier pins a nonexistent spawn root and synthetic credentials, so any real fetch fails by design.',
    linked_ref: LINKED,
    quarantined_at: NOW,
    quarantined_by: SESSION,
    triage_note: 'NEVER COLLECTED until SD-LEO-INFRA-FLEET-WIDE-VITEST-001 FR-3, same cause as the sibling entry. reason_class set to the registered "timeout" class; the precise cause is an unmocked network call (TypeError: fetch failed) per error_signature. De-quarantine when the fetch is injected or mocked so the suite is genuinely a unit test.',
  },
];

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const before = manifest.quarantined.length;
for (const e of ENTRIES) {
  if (manifest.quarantined.some((q) => q.file === e.file)) { console.log(`already present, skipping: ${e.file}`); continue; }
  manifest.quarantined.push(e);
}
fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

// Read back from disk — not from the in-memory object I just mutated.
const back = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
console.log(`quarantined: ${before} -> ${back.quarantined.length}`);
for (const e of ENTRIES) {
  const found = back.quarantined.find((q) => q.file === e.file);
  console.log(`  ${found ? 'OK  ' : 'MISS'} ${e.file}${found ? ` (${found.reason_class})` : ''}`);
  if (!found) process.exitCode = 1;
}
