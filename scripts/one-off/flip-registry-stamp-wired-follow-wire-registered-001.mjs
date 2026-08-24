// SD-LEO-INFRA-FOLLOW-WIRE-REGISTERED-001 / FR-2.
//
// Flips the 18 stamp_wired:false registry literals in the canonical-writer choke's
// sd_canonical_writer_policy() VALUES clause to true, now that FR-1 (13 script/lib writers) and
// FR-2 (5 db_function writers, see section 4 amendments) have landed. Exact-once anchor matching
// per writer identity, same discipline as the function-body generators -- throws on drift rather
// than silently mismatching.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainModule } from '../../lib/utils/is-main-module.js';

// Anchored to REPO_ROOT rather than cwd (SECURITY re-verification, evidence e9545112, finding S4) --
// matches the convention in the sibling canonical-writer-preflight script, so this only ever
// touches the repo's own choke file regardless of the caller's working directory.
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CHOKE_FILE = path.join(REPO_ROOT, 'database/chairman-gated/20260824_strategic_directives_canonical_writer_choke.sql');

const WRITERS = [
  'complete_business_evaluation',
  'request_business_evaluation',
  'fn_rollback_sd_hierarchy',
  'delete_venture',
  'kill_venture',
  'sd:cancel',
  'sd:reactivate',
  'sd:recover',
  'sd:verify',
  'sd-park.js',
  'leo:continuous',
  'stale-session-sweep.cjs',
  'sd-revert.js',
  'release-work-item.mjs',
  'reap-orphaned-provisioning.js',
  'lifecycle-sd-bridge.js',
  'orchestrator-child-completion.js',
  'SDGitStateReconciler.js',
];

function main() {
  let content = fs.readFileSync(CHOKE_FILE, 'utf8');
  const flipped = [];

  for (const writer of WRITERS) {
    // Anchor: the tuple's opening literal through its stamp_wired:false flag. Escaping regex
    // metacharacters in the identity (":" and "." are literal here, "(" none present).
    const escaped = writer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(\\('${escaped}'[^)]*?"stamp_wired":)false`, 's');
    const matches = content.match(new RegExp(pattern.source, 'gs'));
    if (!matches || matches.length !== 1) {
      throw new Error(`ANCHOR DRIFT for ${writer}: expected exactly 1 match, found ${matches ? matches.length : 0}`);
    }
    content = content.replace(pattern, '$1true');
    flipped.push(writer);
  }

  // Also drop the now-stale "NOT YET WIRED" phrase from each of these 18 writers' notes text.
  // Scoped to the exact phrase (with or without a leading " -- "), left as a plain removal so the
  // rest of each note's prose (which describes the writer, not its wiring status) is preserved.
  content = content.replace(/ -- see the PRE-APPLY BLOCKER note above\./g, '.');
  content = content.replace(/ NOT YET WIRED\.?/g, '');
  content = content.replace(/ -- applying before this is wired takes sd:cancel offline\./g, '.');

  fs.writeFileSync(CHOKE_FILE, content);
  console.log(`Flipped ${flipped.length} writers to stamp_wired:true:\n${flipped.join(', ')}`);
}

if (isMainModule(import.meta.url)) {
  main();
}
