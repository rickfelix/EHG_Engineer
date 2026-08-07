/**
 * FR-3 precondition capture for SD-FDBK-INFRA-SPAWN-SOURCE-CURRENCY-001.
 *
 * FR-3 AC-2 requires the live-root demonstration to RECORD its measured preconditions — behind
 * count, tracked-dirty count, untracked count — "so a reviewer can confirm the root was genuinely
 * dirty and not cleaned first". Hand-typing those three numbers into a completion note is the
 * shape that lets a demonstration claim a precondition it never had, which is the defect class
 * this whole SD belongs to. So they get captured mechanically, from the live root, in one command.
 *
 * The window FR-3 needs is TRANSIENT: it requires the root to be BEHIND origin/main while carrying
 * mixed dirt. The root is only behind between someone else's merge and someone's ff-pull. A seat
 * that can run a real spawn should run this first; if `window_open` is true, the demonstration is
 * runnable RIGHT NOW and the JSON below is its precondition evidence.
 *
 * READ-ONLY with one exception: it runs `git fetch` so the behind-count is against a fresh
 * origin/main. Fetch touches remote-tracking refs only — never the working tree, never a local
 * branch — so it cannot perturb the very dirt it is measuring. Pass --no-fetch to skip it, at the
 * cost of a behind-count that can only UNDERSTATE (and so can only hide an open window, never
 * fabricate one).
 */
import { execFileSync } from 'child_process';
import path from 'path';
import { createRequire } from 'module';

const argv = process.argv.slice(2);
const noFetch = argv.includes('--no-fetch');
const asJson = argv.includes('--json');

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/**
 * Resolve the MAIN repo root, not the worktree root. Same reasoning as resolveMainRepoRoot in
 * lib/fleet/spawn-control.js: `--show-toplevel` returns whichever worktree you are standing in,
 * which for this script would measure the SD worktree (always clean) instead of the shared root
 * (the thing under test) — a measurement that would read as a pass while asserting nothing.
 */
function resolveMainRoot(fromDir) {
  const common = git(['rev-parse', '--path-format=absolute', '--git-common-dir'], fromDir);
  if (!common) return null;
  return path.dirname(common);
}

const root = resolveMainRoot(process.cwd());
if (!root) {
  console.error('could not resolve main repo root — refusing to guess');
  process.exit(2);
}

if (!noFetch) {
  try {
    git(['fetch', 'origin', 'main'], root);
  } catch (e) {
    console.error(`fetch failed (${e.message.split('\n')[0]}) — behind-count may understate; continuing`);
  }
}

const behind = Number(git(['rev-list', '--count', 'HEAD..origin/main'], root));
const ahead = Number(git(['rev-list', '--count', 'origin/main..HEAD'], root));
const trackedRaw = git(['status', '--porcelain', '--untracked-files=no'], root);
const trackedPaths = trackedRaw ? trackedRaw.split('\n').map((l) => l.slice(3).trim()) : [];
const untrackedCount = git(['status', '--porcelain', '--untracked-files=all'], root)
  .split('\n')
  .filter((l) => l.startsWith('??')).length;

/**
 * FR-3's rationale asserts the tracked dirt is RECURRENT because it is generated protocol output
 * that prologue item 7 tells every session to regenerate. That premise was measured false on
 * 2026-08-02: commit 058f1109664 committed the full generator output, so regeneration is now
 * byte-identical and all 18 CLAUDE*.md plus the manifest sit CLEAN. The classifier stays because
 * the distinction still decides the design — dirt that a generator recreates is fixable by
 * committing its output, and dirt that is peer WIP is not.
 */
const GENERATED = /^(CLAUDE.*\.md|claude-generation-manifest\.json|\.claude\/\.protocol-sync)$/;
const generated = trackedPaths.filter((p) => GENERATED.test(p));
const peerWip = trackedPaths.filter((p) => !GENERATED.test(p));

const windowOpen = behind > 0 && trackedPaths.length > 0 && untrackedCount > 0;

/**
 * The guard's OWN verdict on these numbers, which is stronger evidence than the numbers alone —
 * it is the thing that actually decides whether a spawn is refused, rather than my reading of it.
 *
 * assessTreeCurrency is used deliberately, NOT enforceTreeCurrency. assess is read-only (it runs
 * only fetch / rev-parse / status / rev-list). enforce is the one that self-heals with
 * `git pull --ff-only` at tree-currency.cjs:236 — calling it here to "just check" would MUTATE the
 * shared root, i.e. destroy the very precondition being captured. Verified by reading both bodies,
 * not inferred from their names.
 *
 * The refusal predicate is enforce's own: it throws TreeStaleError when !current && !selfHealable.
 */
const require_ = createRequire(import.meta.url);
let assessment = null;
let refusesNow = null;
try {
  const { assessTreeCurrency } = require_(path.join(root, 'lib/fleet/tree-currency.cjs'));
  assessment = assessTreeCurrency({ dir: root });
  refusesNow = assessment.current === false && assessment.selfHealable === false;
} catch (e) {
  assessment = { error: String(e && e.message).split('\n')[0] };
}

const capture = {
  fr: 'FR-3',
  sd: 'SD-FDBK-INFRA-SPAWN-SOURCE-CURRENCY-001',
  measured_at_utc: new Date().toISOString(),
  root,
  head: git(['rev-parse', '--short', 'HEAD'], root),
  origin_main: git(['rev-parse', '--short', 'origin/main'], root),
  fetched: !noFetch,
  behind_origin_main: behind,
  ahead_of_origin_main: ahead,
  tracked_dirty_count: trackedPaths.length,
  untracked_count: untrackedCount,
  tracked_dirty_paths: trackedPaths,
  tracked_dirty_generated_artifacts: generated,
  tracked_dirty_peer_wip: peerWip,
  window_open: windowOpen,
  window_predicate: 'behind_origin_main > 0 AND tracked_dirty_count > 0 AND untracked_count > 0',
  guard_assessment: assessment,
  spawn_refused_in_this_state: refusesNow,
  refusal_predicate: 'enforceTreeCurrency throws TreeStaleError when !current && !selfHealable',
  why_not_open: windowOpen
    ? null
    : [
        behind === 0 ? 'root is CURRENT (behind=0) — AC-1 requires it to be behind origin/main' : null,
        trackedPaths.length === 0 ? 'no tracked dirt — AC-1 requires mixed dirt' : null,
        untrackedCount === 0 ? 'no untracked dirt — AC-1 requires mixed dirt' : null,
      ].filter(Boolean),
  NOT_SUFFICIENT_ALONE:
    'This capture is the PRECONDITION half of FR-3. AC-1 also requires an actual spawn observed ' +
    'succeeding against this root in this state. A capture with window_open=true and no spawn is ' +
    'evidence the window existed, NOT evidence the SD works — recording it as the latter is the ' +
    'fixture-only pass FR-3 exists to forbid.',
};

if (asJson) {
  console.log(JSON.stringify(capture, null, 2));
} else {
  console.log(`FR-3 precondition capture — ${capture.measured_at_utc}`);
  console.log(`  root:            ${root}`);
  console.log(`  HEAD/origin:     ${capture.head} / ${capture.origin_main}`);
  console.log(`  behind:          ${behind}`);
  console.log(`  tracked-dirty:   ${trackedPaths.length}  (generated: ${generated.length}, peer-WIP: ${peerWip.length})`);
  console.log(`  untracked:       ${untrackedCount}`);
  console.log('');
  console.log(`  guard verdict:   current=${assessment?.current} selfHealable=${assessment?.selfHealable} reason=${assessment?.reason}`);
  console.log(`  spawn refused:   ${refusesNow}`);
  console.log('');
  console.log(`  WINDOW ${windowOpen ? 'OPEN — run the live spawn NOW and record this capture with it' : 'CLOSED'}`);
  if (!windowOpen) for (const r of capture.why_not_open) console.log(`    - ${r}`);
  console.log('');
  console.log(`  ${capture.NOT_SUFFICIENT_ALONE}`);
}
