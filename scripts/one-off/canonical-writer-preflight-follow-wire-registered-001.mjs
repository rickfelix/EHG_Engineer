// SD-LEO-INFRA-FOLLOW-WIRE-REGISTERED-001 / FR-4 (FR-3a).
//
// STATIC pre-apply preflight for the canonical-writer choke's guard-apply ceremony. Unlike a live
// call to sd_canonical_writer_policy(NULL) -- impossible pre-apply, since that function does not
// exist in pg_proc until the choke file (which creates it) is itself applied (TESTING finding F3,
// evidence 142015b2) -- this reads the actual SOURCE of each of the 18 registered writers directly,
// so it works correctly with the guard still fully unapplied.
//
// Two writer classes, two verification methods:
//   - 13 script/lib writers (FR-1): read the live file, look for the literal
//     `lifecycle_write_token` stamp assignment with the writer's OWN registry identity.
//   - 5 db_function writers (FR-2): the amendment lands INSIDE the chairman-gated choke file's own
//     section 4 (the one sanctioned exception to "never edit that file") -- checked there first;
//     if not yet present (e.g. the amendment is still pending chairman/coordinator sign-off), falls
//     back to the prepared database/evidence/canonical-writer-choke/<name>.after.sql artifact and
//     reports that distinctly from "wired" -- prepared-but-not-landed still BLOCKS the ceremony,
//     since the live choke file does not have the stamp yet.
//
// Exit code 0 = all 18 wired (in the choke file itself, not just prepared). Exit code 1 = blocked.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CHOKE_FILE = path.join(REPO_ROOT, 'database/chairman-gated/20260824_strategic_directives_canonical_writer_choke.sql');
const EVIDENCE_DIR = path.join(REPO_ROOT, 'database/evidence/canonical-writer-choke');

const SCRIPT_LIB_WRITERS = [
  { identity: 'sd:cancel', file: 'scripts/cancel-sd.js' },
  { identity: 'sd:reactivate', file: 'scripts/reactivate-sd.js' },
  { identity: 'sd:recover', file: 'scripts/sd-recover.js' },
  { identity: 'sd:verify', file: 'scripts/sd-verify.js' },
  { identity: 'sd-park.js', file: 'lib/sd-park.js' },
  { identity: 'leo:continuous', file: 'scripts/leo-continuous.js' },
  { identity: 'stale-session-sweep.cjs', file: 'scripts/stale-session-sweep.cjs' },
  { identity: 'sd-revert.js', file: 'lib/sd/revert.js' },
  { identity: 'release-work-item.mjs', file: 'lib/fleet/release-work-item.mjs' },
  { identity: 'reap-orphaned-provisioning.js', file: 'lib/eva/bridge/reap-orphaned-provisioning.js' },
  { identity: 'lifecycle-sd-bridge.js', file: 'lib/eva/lifecycle-sd-bridge.js' },
  { identity: 'orchestrator-child-completion.js', file: 'lib/utils/orchestrator-child-completion.js' },
  { identity: 'SDGitStateReconciler.js', file: 'scripts/modules/shipping/SDGitStateReconciler.js' },
];

const DB_FUNCTION_WRITERS = [
  'complete_business_evaluation',
  'request_business_evaluation',
  'fn_rollback_sd_hierarchy',
  'delete_venture',
  'kill_venture',
];

function readLF(p) {
  return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
}

function stampPatternFor(identity) {
  // Multi-line/raw-pg-aware: the stamp key and value may be separated across lines (object
  // literals) or share a line (raw pg SET clauses) -- match either, per TESTING's finding that a
  // same-line-only regex has a documented ~0%-recall defect on exactly this class of writer.
  const escaped = identity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`lifecycle_write_token\\s*[:=]\\s*'${escaped}'`);
}

function checkScriptLibWriters() {
  const results = [];
  for (const { identity, file } of SCRIPT_LIB_WRITERS) {
    const fullPath = path.join(REPO_ROOT, file);
    let wired = false;
    let error = null;
    try {
      const content = readLF(fullPath);
      wired = stampPatternFor(identity).test(content);
    } catch (err) {
      error = err.message;
    }
    results.push({ identity, file, wired, error });
  }
  return results;
}

function checkDbFunctionWriters() {
  const choke = fs.existsSync(CHOKE_FILE) ? readLF(CHOKE_FILE) : '';
  const results = [];
  for (const identity of DB_FUNCTION_WRITERS) {
    const inChoke = stampPatternFor(identity).test(choke);
    let preparedOnly = false;
    if (!inChoke) {
      const afterPath = path.join(EVIDENCE_DIR, `${identity}.after.sql`);
      if (fs.existsSync(afterPath)) {
        preparedOnly = stampPatternFor(identity).test(readLF(afterPath));
      }
    }
    results.push({ identity, wired: inChoke, preparedOnly });
  }
  return results;
}

/**
 * Every writer_identity string named in the choke file's own registry VALUES clause, live-parsed
 * from the source text rather than trusted as a hardcoded JS list -- CANNOT be re-derived by
 * calling sd_canonical_writer_policy(NULL) pre-apply (TESTING F3: the function does not exist in
 * pg_proc yet), so this is the only source-of-truth read available before the ceremony.
 */
function parseChokeRegistryIdentities(choke) {
  const identities = [];
  const re = /\(\s*'((?:[^'\\]|\\.)*)'::text\s*,|\(\s*'((?:[^'\\]|\\.)*)'\s*,\s*\n\s*'\{"surface"/g;
  let m;
  while ((m = re.exec(choke)) !== null) {
    identities.push(m[1] ?? m[2]);
  }
  return identities;
}

/**
 * Single-representation guard (TESTING re-verification, evidence c7d16286, finding F2): the
 * hardcoded SCRIPT_LIB_WRITERS/DB_FUNCTION_WRITERS lists above and the choke file's own registry
 * are two representations of the same fact (which identities are registered) and could drift --
 * e.g. a 19th writer added to the registry without a matching preflight entry would silently
 * report "18/18 wired" and greenlight the ceremony. This cross-checks them and THROWS on any
 * mismatch rather than silently trusting the hardcoded list.
 */
function assertRegistryMatchesHardcodedList(choke) {
  if (!choke) return; // choke file unreadable -- checkDbFunctionWriters already reports this per-writer
  const registryIdentities = new Set(parseChokeRegistryIdentities(choke));
  if (registryIdentities.size === 0) {
    throw new Error('REGISTRY PARSE FAILURE: parsed 0 writer_identity entries from the choke file -- the parser regex has drifted from the file\'s actual format. Refusing to trust a stale hardcoded list.');
  }
  const hardcoded = new Set([...SCRIPT_LIB_WRITERS.map((w) => w.identity), ...DB_FUNCTION_WRITERS]);
  // Any registry identity marked stamp_wired:false that ISN'T in our hardcoded lists is a drift
  // this preflight doesn't know about -- already-true entries are fine to be absent from our
  // lists (they're the pre-existing, already-wired writers this SD didn't touch).
  const unknownUnwired = [];
  for (const id of registryIdentities) {
    if (hardcoded.has(id)) continue;
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const entryMatch = choke.match(new RegExp(`\\('${escaped}'[\\s\\S]{0,300}?"stamp_wired":(true|false)`));
    if (entryMatch && entryMatch[1] === 'false') unknownUnwired.push(id);
  }
  if (unknownUnwired.length > 0) {
    throw new Error(`REGISTRY DRIFT: the choke file names ${unknownUnwired.length} unwired writer(s) this preflight does not know about (${unknownUnwired.join(', ')}) -- update SCRIPT_LIB_WRITERS/DB_FUNCTION_WRITERS above before trusting this preflight's result.`);
  }
}

function main() {
  const choke = fs.existsSync(CHOKE_FILE) ? readLF(CHOKE_FILE) : '';
  assertRegistryMatchesHardcodedList(choke);

  const scriptLibResults = checkScriptLibWriters();
  const dbFunctionResults = checkDbFunctionWriters();

  const unwired = [
    ...scriptLibResults.filter((r) => !r.wired).map((r) => `${r.identity} (${r.file}${r.error ? `, ERROR: ${r.error}` : ''})`),
    ...dbFunctionResults.filter((r) => !r.wired).map((r) => `${r.identity}${r.preparedOnly ? ' (PREPARED, not yet in the choke file -- pending chairman/coordinator sign-off)' : ' (NOT PREPARED)'}`),
  ];

  const total = SCRIPT_LIB_WRITERS.length + DB_FUNCTION_WRITERS.length;
  console.log(`canonical-writer preflight: ${total - unwired.length}/${total} wired`);
  if (unwired.length === 0) {
    console.log('PREFLIGHT PASS: all 18 registered writers are wired in code. Ceremony may proceed.');
    return 0;
  }
  console.log(`PREFLIGHT BLOCKED: ${unwired.length} writer(s) not wired:`);
  for (const line of unwired) console.log(`  - ${line}`);
  return 1;
}

if (isMainModule(import.meta.url)) {
  process.exit(main());
}

export {
  checkScriptLibWriters,
  checkDbFunctionWriters,
  parseChokeRegistryIdentities,
  assertRegistryMatchesHardcodedList,
  SCRIPT_LIB_WRITERS,
  DB_FUNCTION_WRITERS,
};
