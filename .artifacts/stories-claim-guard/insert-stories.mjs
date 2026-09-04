/**
 * STORIES sub-agent — user story generation for
 * SD-LEO-INFRA-CLAIM-GUARD-BRANCH-DERIVED-001 (PLAN_PRD phase).
 *
 * Writes 8 user stories (FR-1..FR-5) into user_stories with rich
 * implementation_context (technical_approach / files / dependencies / effort),
 * then records STORIES evidence via the canonical storeSubAgentResults path.
 */
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';

const SD_UUID = '11f9e1ac-a769-47f1-82b4-950a32a0d977';
const SD_KEY = 'SD-LEO-INFRA-CLAIM-GUARD-BRANCH-DERIVED-001';
const PRD_ID = 'PRD-11f9e1ac-a769-47f1-82b4-950a32a0d977';

const ctx = ({ approach, create = [], modify = [], deps = [], effort, risk }) => [
  '## Implementation Context',
  '',
  '**Technical approach:**',
  approach.trim(),
  '',
  `**Files to create:** ${create.length ? '' : '(none)'}`,
  ...create.map((f) => `- ${f}`),
  '',
  `**Files to modify:** ${modify.length ? '' : '(none)'}`,
  ...modify.map((f) => `- ${f}`),
  '',
  '**Dependencies:**',
  ...deps.map((d) => `- ${d}`),
  '',
  `**Estimated effort:** ${effort}`,
  ...(risk ? ['', `**Risk / gotcha:** ${risk}`] : []),
].join('\n');

const stories = [
  // ------------------------------------------------------------------ FR-1a
  {
    n: 1,
    fr: 'FR-1',
    title: 'Derive a worktree\'s target key from its checked-out branch with an anchored, slug-stopping pattern',
    user_role: 'harness maintainer',
    user_want:
      'a pure deriveWorktreeKey({branch, marker, filePath}) function in scripts/hooks/worktree-claim-decision.cjs that returns {key, source} and resolves a git branch name to an SD/QF key using the ANCHORED pattern from lib/ship/work-key-derivation.mjs (not the unanchored keyFromBranch copies)',
    user_benefit:
      'so that a worktree reused under a stale directory name is identified by the work it actually holds, and a slug-carrying branch can never produce a truthy-but-garbage key that would relocate the false block instead of removing it',
    points: 2,
    priority: 'critical',
    ac: [
      {
        scenario: 'Seam exists and is unit-testable without a live worktree',
        given: 'scripts/hooks/worktree-claim-decision.cjs (CJS, already exporting shouldBlockWorktreeEdit and isQuickFixWorktree)',
        when: 'a test does require("scripts/hooks/worktree-claim-decision.cjs")',
        then: 'deriveWorktreeKey is present on module.exports and is callable with plain strings only — no git process, no filesystem and no live worktree are required to exercise it',
      },
      {
        scenario: 'Anchored match stops before a lowercase slug',
        given: 'the branch name "feat/SD-X-001-close-paths"',
        when: 'deriveWorktreeKey({ branch: "feat/SD-X-001-close-paths" }) is called',
        then: 'it returns { key: "SD-X-001", source: "branch" } — never "SD-X-001-close-paths", which is what lib/worktree-reaper/detectors.js:40 and scripts/safe-worktree-remove.mjs:46 would have returned',
      },
      {
        scenario: 'Orchestrator child key is not truncated to its parent',
        given: 'the branch name "feat/SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-B" (the live specimen from Golf\'s block)',
        when: 'deriveWorktreeKey is called with that branch',
        then: 'it returns key "SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-B" in full — the -B child suffix is uppercase so the (?=-[a-z]|$) anchor does not stop on it, and the parent prefix SD-LEO-ORCH-CAPA-RECORD-TRUTH-002 is NOT returned (hazard already documented at lib/git/branch-owner.test.js:90)',
      },
      {
        scenario: 'QF branches resolve on the QF pattern',
        given: 'the branch name "qf/QF-20260903-188"',
        when: 'deriveWorktreeKey is called with that branch',
        then: 'it returns { key: "QF-20260903-188", source: "branch" }, so isQuickFixWorktree() still classifies the target correctly and the qfHeld tri-state path is reached unchanged',
      },
      {
        scenario: 'Total return-shape contract',
        given: 'any combination of branch/marker/filePath inputs including null, undefined and non-strings',
        when: 'deriveWorktreeKey is called',
        then: 'it always returns an object of shape { key: string|null, source: "branch"|"marker"|"path"|null } and never throws — a guard helper that can throw would defeat the fail-open contract it is being wired into',
      },
    ],
    dod: [
      'deriveWorktreeKey exported from scripts/hooks/worktree-claim-decision.cjs',
      'QF_PATTERN / SD_PATTERN / BRANCH_KEY_PATTERN re-implemented inline as CJS with a comment naming lib/ship/work-key-derivation.mjs:23 as the source of truth and stating WHY it is duplicated rather than imported',
      'Unit specimens for all 5 acceptance criteria pass',
      'No import of any ESM module added to the CJS hook chain',
    ],
    ctx: ctx({
      approach: `Add deriveWorktreeKey({ branch, marker, filePath }) to scripts/hooks/worktree-claim-decision.cjs (currently 37 lines, CJS, module.exports = { shouldBlockWorktreeEdit, isQuickFixWorktree }).
Re-implement the anchored pattern inline as CJS constants — pre-tool-enforce.cjs is CommonJS and CANNOT require() the ESM lib/ship/work-key-derivation.mjs:

  const QF_PATTERN = 'QF-\\\\d{8}-\\\\d+';
  const SD_PATTERN = 'SD-[A-Z0-9]+(?:-[A-Z0-9]+)*';
  const BRANCH_KEY_PATTERN = new RegExp(\`^(\${QF_PATTERN}|\${SD_PATTERN})(?=-[a-z]|$)\`);

Take the LAST slash-separated segment first (branchName.slice(branchName.lastIndexOf('/') + 1)) exactly as deriveWorkKeyFromBranch does, then match. The (?=-[a-z]|$) lookahead is the entire point: it stops the capture before a lowercase slug while allowing an UPPERCASE child suffix (-B) to be absorbed by SD_PATTERN's (?:-[A-Z0-9]+)* tail.
Return { key, source } rather than a bare string so the call site can thread the provenance into the audit row and the block message without re-deriving it.
Order inside the function: branch -> marker -> filePath, each source falling through on a non-match (see US-004 for the fall-through contract itself).`,
      create: [],
      modify: ['scripts/hooks/worktree-claim-decision.cjs (+~45 LOC)'],
      deps: [
        'lib/ship/work-key-derivation.mjs:23 — BRANCH_KEY_PATTERN is the reference implementation being mirrored (read-only dependency; NOT imported)',
        'ANTI-dependency: lib/worktree-reaper/detectors.js:40 and scripts/safe-worktree-remove.mjs:46 keyFromBranch — byte-identical UNANCHORED copies that must NOT be used here',
        'Downstream consumer: scripts/hooks/pre-tool-enforce.cjs ENFORCEMENT-4 (US-002)',
      ],
      effort: '~2h, ~45 LOC production',
      risk:
        'validation-agent flagged this HIGH-severity at LEAD-TO-PLAN (evidence 2c68e858-4630-47e3-8b1f-76d3b873500a): shouldBlockWorktreeEdit blocks on Boolean(claimedSdKey) && claimedSdKey !== worktreeKey, so an unanchored capture returns a truthy garbage key and NEWLY false-blocks every slug-carrying branch — relocating the defect rather than fixing it.',
    }),
    arch: [
      'scripts/hooks/worktree-claim-decision.cjs — the pure-predicate module this extends (QF-20260804-087 established the "extract a pure predicate so the guard is unit-testable" pattern)',
      'lib/ship/work-key-derivation.mjs:16-28 — anchored BRANCH_KEY_PATTERN + last-segment-first parsing, the exact shape to mirror',
      'lib/git/branch-owner.test.js:90 — pre-existing documentation of the orchestrator-child-key truncation hazard',
    ],
    code: [
      "const BRANCH_KEY_PATTERN = new RegExp(`^(${QF_PATTERN}|${SD_PATTERN})(?=-[a-z]|$)`); // lib/ship/work-key-derivation.mjs:16",
      "const afterSlash = branch.includes('/') ? branch.slice(branch.lastIndexOf('/') + 1) : branch;",
      "module.exports = { shouldBlockWorktreeEdit, isQuickFixWorktree, deriveWorktreeKey };",
    ],
    tests: [
      { id: 'TS-3', file: 'tests/unit/claim/test-seams-fr9.test.js', scenario: 'feat/SD-X-001-close-paths -> SD-X-001 (anchored)', type: 'unit' },
      { id: 'TS-1a', file: 'tests/unit/claim/test-seams-fr9.test.js', scenario: 'feat/SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-B -> full child key', type: 'unit' },
    ],
  },

  // ------------------------------------------------------------------ FR-1b
  {
    n: 2,
    fr: 'FR-1',
    title: 'Thread branch-first derivation into ENFORCEMENT-4 ahead of the directory-name fallback',
    user_role: 'fleet worker on a reused worktree',
    user_want:
      'ENFORCEMENT-4 in scripts/hooks/pre-tool-enforce.cjs to resolve the tree\'s checked-out branch via execFileSync git and pass the branch-derived key into shouldBlockWorktreeEdit, using the WORKTREE_PATH_RE directory name only as the last resort',
    user_benefit:
      'so that editing a tree whose branch names my own DB-confirmed claim is allowed, and I stop being taught to bypass the guard with raw node fs writes',
    points: 2,
    priority: 'critical',
    ac: [
      {
        scenario: 'Branch is read with execFileSync, never a shell string',
        given: 'an Edit or Write tool call whose file_path matches WORKTREE_PATH_RE',
        when: 'ENFORCEMENT-4 resolves the target worktree root and reads its branch',
        then: 'it calls child_process.execFileSync("git", ["-C", treeRoot, "rev-parse", "--abbrev-ref", "HEAD"], { timeout: 5000 }) — argv form with a bounded timeout, never execSync or a shell-interpolated string (the tree path is attacker-adjacent input)',
      },
      {
        scenario: 'Branch-derived key wins over the directory name',
        given: 'file .worktrees/QF-20260903-188/scripts/x.js and that tree\'s branch checked out as feat/SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-B',
        when: 'shouldBlockWorktreeEdit is evaluated',
        then: 'worktreeKey is "SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-B" (source=branch); the WORKTREE_PATH_RE capture "QF-20260903-188" is used only if branch AND marker both fail to yield a key',
      },
      {
        scenario: 'Reused tree naming the session\'s own claim is allowed',
        given: 'the above tree and a session whose DB-confirmed claim is SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-B',
        when: 'the Edit tool call is evaluated by the hook',
        then: 'the hook exits 0 (allow) — this is Golf\'s exact 18:40Z specimen, which blocks today',
      },
      {
        scenario: 'Block message states the derivation, not just the keys',
        given: 'a genuine cross-claim edit that still blocks',
        when: 'the CLAIM GUARD (PAT-CLMMULTI-002) message is written to stderr',
        then: 'it names the derived key, the source (branch|marker|path), the observed branch string, and the session\'s DB-confirmed claim — so a worker can tell a stale-directory false block apart from a real one without reading the hook source',
      },
      {
        scenario: 'qfHeld tri-state is computed from the DERIVED key',
        given: 'a tree whose directory says QF-A but whose branch says QF-B',
        when: 'isQuickFixWorktree / sessionHoldsQuickFixClaim run',
        then: 'they are passed the derived key (QF-B), not the directory capture — the QF-20260804-087 tri-state semantics are otherwise untouched',
      },
    ],
    dod: [
      'ENFORCEMENT-4 (pre-tool-enforce.cjs:1002-1039) calls deriveWorktreeKey before shouldBlockWorktreeEdit',
      'execFileSync imported/used in argv form with a 5s timeout',
      'Block message and audit row both carry derivedKey + source + branch',
      'Existing try/catch fail-open envelope still wraps the whole block',
    ],
    ctx: ctx({
      approach: `Rewrite scripts/hooks/pre-tool-enforce.cjs ENFORCEMENT-4 (:1002-1039). Today it is:

  const match = filePath.match(WORKTREE_PATH_RE);      // :368 regex, first .worktrees/<name> segment
  if (match && match[1] !== 'qf') { const worktreeSdKey = match[1]; ... }

New shape, inside the SAME try/catch:
  1. derive treeRoot from filePath by slicing at the WORKTREE_PATH_RE match end (the .worktrees/<seg> boundary; for the 'qf' container the root is .worktrees/qf/<seg>).
  2. branch = try { execFileSync('git', ['-C', treeRoot, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding:'utf8', timeout:5000 }).trim() } catch { null }
  3. marker = best-effort read of the FR-2 marker at treeRoot (US-003)
  4. const { key: worktreeSdKey, source } = deriveWorktreeKey({ branch, marker, filePath })
  5. skip entirely when worktreeSdKey is null (US-004 AC-4) — do NOT pass null into shouldBlockWorktreeEdit
  6. qfHeld = isQuickFixWorktree(worktreeSdKey) ? await sessionHoldsQuickFixClaim(_SESSION_ID, worktreeSdKey) : false
  7. audit metadata: { worktreeSdKey, claimedSdKey, derivedKey: worktreeSdKey, source, branch }  (US-007)

Keep the existing 'qf' container skip: match[1] === 'qf' means the capture is the container directory, not a key — under the new order that is simply one more reason the PATH source yields null, and the branch source is consulted first anyway.`,
      create: [],
      modify: [
        'scripts/hooks/pre-tool-enforce.cjs — ENFORCEMENT-4 block at lines 1002-1039 (~+30 / -8 LOC)',
      ],
      deps: [
        'US-001 (deriveWorktreeKey must exist and be exported)',
        'US-003 (marker reader — the marker source is optional at the call site; wire it once US-003 lands)',
        'US-004 (null-key skip + fail-open ordering)',
        'scripts/hooks/pre-tool-enforce.cjs:368 WORKTREE_PATH_RE (retained as the terminal fallback)',
        'resolveSessionClaimedSdKey / sessionHoldsQuickFixClaim / auditPermissionDecision — all already in this file',
      ],
      effort: '~1.5h, ~30 LOC net',
      risk:
        'This is the LIVE fleet-wide enforcement hook. tests/unit/claim/test-seams-fr9.test.js:92-110 exists precisely because a broken edit here looks identical to a guard with nothing to block; the two-sided ALLOW+BLOCK assertions must stay green.',
    }),
    arch: [
      'scripts/hooks/pre-tool-enforce.cjs:1002-1039 — the ENFORCEMENT-4 block being rewritten',
      'scripts/hooks/pre-tool-enforce.cjs:368 — WORKTREE_PATH_RE, now the terminal (not primary) source',
      'lib/sub-agent-executor/results-storage.js:394-405 resolveEvaluatedCommitSha — the codebase convention for a bounded, never-throwing execFileSync git call',
    ],
    code: [
      "const branch = (() => { try { return execFileSync('git', ['-C', treeRoot, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8', timeout: 5000 }).trim() || null; } catch { return null; } })();",
      "const { key: worktreeSdKey, source } = deriveWorktreeKey({ branch, marker, filePath });",
      "auditPermissionDecision(_SESSION_ID, TOOL_NAME, 'PAT-CLMMULTI-002', 'Worktree claim guard (DB-corroborated)', 'block', { worktreeSdKey, claimedSdKey, derivedKey: worktreeSdKey, source, branch });",
    ],
    tests: [
      { id: 'TS-1', file: 'tests/unit/claim/test-seams-fr9.test.js', scenario: 'Reused tree, branch names own claim -> exit 0, source=branch', type: 'integration' },
      { id: 'TS-2', file: 'tests/unit/claim/test-seams-fr9.test.js', scenario: 'True cross-claim -> exit 2 naming SD-X and SD-Y', type: 'unit' },
    ],
  },

  // ------------------------------------------------------------------ FR-2
  {
    n: 3,
    fr: 'FR-2',
    title: 'Write a gitignored, reap-safe reuse marker as the second-priority key source',
    user_role: 'coordinator running the slot-free worktree reuse directive',
    user_want:
      'a best-effort writeReuseMarker(treePath, { key, writerSession }) helper that drops a gitignored .worktree-reuse.json naming the new key, the writer seat and the time',
    user_benefit:
      'so that a tree reused onto a branch that is not key-shaped (e.g. a shared main or a ceremony branch) still declares what it holds, without the marker itself making the tree look dirty to the reaper',
    points: 2,
    priority: 'high',
    ac: [
      {
        scenario: 'Marker is written with the established shape',
        given: 'a writable worktree root and { key: "SD-Z-001", writerSession: "sess-abc" }',
        when: 'writeReuseMarker(treePath, fields) is called',
        then: '.worktree-reuse.json exists at the tree root containing { key, writer_session, marked_at } and the call returns { written: true, markerPath, error: null } — mirroring lib/worktree-reaper/reap-eligible-marker.js:26-40',
      },
      {
        scenario: 'Best-effort: never throws',
        given: 'a tree path that does not exist or is not writable',
        when: 'writeReuseMarker is called',
        then: 'it returns { written: false, markerPath: null, error: "<message>" } and throws nothing — a marker-write failure must never fail the reuse operation that called it',
      },
      {
        scenario: 'Marker is invisible to git',
        given: 'a clean worktree in which only .worktree-reuse.json has been written',
        when: '`git status --porcelain` runs in that tree',
        then: 'it prints nothing, because the marker filename is listed in .gitignore — the marker can therefore never be committed and never inflates a dirty-file count',
      },
      {
        scenario: 'Marker does not mask genuine work from the reaper',
        given: 'a tree carrying a fresh marker AND one unrelated modified TRACKED file',
        when: 'scripts/worktree-reaper.mjs evaluates the tree for removal eligibility',
        then: 'the tree is still classified ineligible, and the reason is attributed to the tracked file — the specimen distinguishes marker-caused-dirty (must not exist) from genuine-work-dirty (must still block removal), closing the QF-20260903-092 concern with zero reaper code change',
      },
      {
        scenario: 'Corrupt or absent marker reads as absent',
        given: 'a tree with no marker, or one containing invalid JSON',
        when: 'the marker reader is called',
        then: 'it returns null rather than throwing, so ENFORCEMENT-4 falls through to the path source (US-004)',
      },
    ],
    dod: [
      'writeReuseMarker + reader exported from a module the CJS hook can require()',
      '.gitignore updated with the marker filename',
      'Reaper-safety specimen passes with NO change to scripts/worktree-reaper.mjs',
    ],
    ctx: ctx({
      approach: `Mirror lib/worktree-reaper/reap-eligible-marker.js exactly — same best-effort try/catch, same {written, markerPath, error} return, same "reader returns null on absent/corrupt" contract:

  const MARKER_FILENAME = '.worktree-reuse.json';
  function writeReuseMarker(wtPath, { key, writerSession } = {}) {
    try { fs.writeFileSync(path.join(wtPath, MARKER_FILENAME),
      JSON.stringify({ key: key ?? null, writer_session: writerSession ?? process.env.CLAUDE_SESSION_ID ?? null, marked_at: new Date().toISOString() }, null, 2), 'utf8');
      return { written: true, markerPath, error: null }; }
    catch (e) { return { written: false, markerPath: null, error: e?.message || String(e) }; }
  }

PLACEMENT MATTERS: the reader is consumed by ENFORCEMENT-4 in a CJS hook, so the reader must be CJS-reachable. Put both the reader and MARKER_FILENAME in scripts/hooks/worktree-claim-decision.cjs (or a sibling .cjs) and let the ESM coordinator tooling require() / import the same file. Do NOT put the reader in lib/worktree-reaper/ (ESM) — that is the exact require()-across-module-systems wall FR-1 already had to route around.

REAPER SAFETY IS BY CONSTRUCTION, NOT BY CODE: git status --porcelain does not list gitignored paths, so a gitignored marker cannot enter the reaper's dirty check. The FR-2 work is therefore (a) the .gitignore line and (b) a specimen that PINS that property, not a reaper change.`,
      create: ['(marker helpers colocated in scripts/hooks/worktree-claim-decision.cjs, ~35 LOC)'],
      modify: ['.gitignore (+1 line: .worktree-reuse.json)', 'scripts/hooks/worktree-claim-decision.cjs'],
      deps: [
        'lib/worktree-reaper/reap-eligible-marker.js — the shape being mirrored (best-effort marker convention)',
        'scripts/worktree-reaper.mjs — read-only: its git-status-based dirty check is what the specimen pins',
        'Consumed by US-002 (ENFORCEMENT-4 marker source) and by the coordinator slot-free reuse directive ac2c8602',
      ],
      effort: '~1.5h, ~35 LOC + 1 gitignore line + 1 specimen',
      risk:
        'Explore confirmed NO reuse-marker convention exists today; the only adjacent mechanism is the unrelated push-based PRESERVE-stage git-ref from SD-LEO-INFRA-WORKTREE-REAPER-PRESERVE-001. Do not conflate the two. Also: SD-FDBK-INFRA-ORPHAN-WORKTREE-STRANDING-001-B showed a STALE marker licensing the deletion of unrelated work — this marker feeds a guard (fail-open) and never a deletion, which is why staleness here is safe; state that in the header so nobody later wires it to a destructive path.',
    }),
    arch: [
      'lib/worktree-reaper/reap-eligible-marker.js:17-56 — MARKER_FILENAME / write / read / has trio being mirrored',
      'lib/worktree-reaper/reap-eligible-marker.js:63+ — the marker-revalidation incident (2026-07-31) explaining why a marker must never authorize destruction',
      'scripts/worktree-reaper.mjs — the git-status dirty check the specimen pins',
    ],
    code: [
      "export const MARKER_FILENAME = '.reap-eligible.json'; // shape being mirrored -> '.worktree-reuse.json'",
      "catch (e) { return { written: false, markerPath: null, error: e?.message || String(e) }; } // best-effort, never throws",
    ],
    tests: [
      { id: 'TS-5', file: 'tests/unit/claim/test-seams-fr9.test.js', scenario: 'Non-key-shaped branch + valid marker -> allow, source=marker', type: 'unit' },
      { id: 'TS-7', file: 'tests/unit/claim/test-seams-fr9.test.js', scenario: 'Marker alone does not count as reaper-blocking dirt', type: 'integration' },
    ],
  },

  // ------------------------------------------------------------------ FR-3
  {
    n: 4,
    fr: 'FR-3',
    title: 'Preserve fail-open exactly: every failed source falls through, and a garbage key never reaches the comparison',
    user_role: 'fleet worker',
    user_want:
      'a git error, an unparseable branch and a missing marker to each fall through to the next source, with a null terminal key skipping the claim comparison entirely rather than being compared',
    user_benefit:
      'so that the guard still never blocks on its own failure — and so the new derivation cannot invent a truthy key that turns Boolean(claimedSdKey) && claimedSdKey !== worktreeKey into a NEW class of false block',
    points: 1,
    priority: 'critical',
    ac: [
      {
        scenario: 'git unavailable is indistinguishable from today',
        given: 'the hook child process runs with git removed from PATH, a tree directory naming SD-X, and a session claiming SD-Y',
        when: 'the Edit tool call is evaluated',
        then: 'the branch source yields null, derivation falls through to marker then path, and the verdict (exit 2, naming SD-X) is byte-identical to the pre-FR-1 path-only guard',
      },
      {
        scenario: 'A non-key-shaped branch produces no partial key',
        given: 'branch "main" or "chore/cleanup" (neither matches the anchored pattern)',
        when: 'deriveWorktreeKey runs',
        then: 'the branch source returns null — never a partial capture such as "chore" or "cleanup" — and derivation continues to the marker source',
      },
      {
        scenario: 'A missing or unreadable marker falls through, it does not fail',
        given: 'a non-key-shaped branch and no marker file (or an unparseable one)',
        when: 'deriveWorktreeKey runs',
        then: 'the marker source returns null and the terminal WORKTREE_PATH_RE source decides, exactly as the guard behaves today',
      },
      {
        scenario: 'A null terminal key SKIPS the comparison — it is not compared',
        given: 'all three sources yield null (e.g. a .worktrees/qf container path with git unavailable and no marker)',
        when: 'ENFORCEMENT-4 reaches the verdict step',
        then: 'it returns without calling shouldBlockWorktreeEdit at all — mirroring today\'s `if (match && match[1] !== "qf")` guard. Passing null in would make Boolean(claimedSdKey) && claimedSdKey !== null evaluate TRUE and block every claim-holding session: the fail-open contract lives in the CALL SITE, not in the predicate',
      },
      {
        scenario: 'No new uncaught throw path',
        given: 'the rewritten ENFORCEMENT-4 block',
        when: 'the source is inspected and the specimens run',
        then: 'the existing try { ... } catch { /* fail-open */ } envelope still wraps the derivation, the git call, and the marker read; no added code can throw out of ENFORCEMENT-4 uncaught',
      },
    ],
    dod: [
      'Fall-through order branch -> marker -> path asserted in unit specimens for each failure mode',
      'Null-key early-return present at the ENFORCEMENT-4 call site and pinned by a specimen',
      'Verdict parity with pre-FR-1 behavior demonstrated for the git-unavailable case',
    ],
    ctx: ctx({
      approach: `This story is the CONTRACT, and it is mostly assertions over US-001 + US-002 code — but it carries one real production line: the null-key early return at the ENFORCEMENT-4 call site.

  const { key: worktreeSdKey, source } = deriveWorktreeKey({ branch, marker, filePath });
  if (!worktreeSdKey) return;   // <-- fail-open lives HERE, not in shouldBlockWorktreeEdit

WHY: shouldBlockWorktreeEdit (worktree-claim-decision.cjs:29) returns Boolean(claimedSdKey) && claimedSdKey !== worktreeKey. With worktreeKey === null and any real claim, that is TRUE. Today the null case is unreachable because the whole block sits behind if (match && match[1] !== 'qf'). Replacing that condition with a derivation WITHOUT restoring the equivalent early return converts the guard's fail-open default into a fleet-wide fail-CLOSED block. Do not "simplify" the early return away.

Each source is wrapped individually so one failing source cannot short-circuit the next:
  branch  -> try/catch around execFileSync, plus a pattern non-match
  marker  -> try/catch around readFileSync + JSON.parse
  path    -> the existing WORKTREE_PATH_RE match (may itself be null)`,
      create: [],
      modify: [
        'scripts/hooks/worktree-claim-decision.cjs (per-source try/catch inside deriveWorktreeKey)',
        'scripts/hooks/pre-tool-enforce.cjs (null-key early return in ENFORCEMENT-4)',
      ],
      deps: ['US-001', 'US-002', 'US-003 (marker reader)', 'scripts/hooks/worktree-claim-decision.cjs:23-30 shouldBlockWorktreeEdit — unchanged by this SD'],
      effort: '~1h, ~10 LOC production + specimens',
      risk:
        'Highest-blast-radius line in the SD: getting the null case wrong turns a fail-open guard into a fail-closed one on the LIVE hook, blocking every Edit/Write fleet-wide. Assert it explicitly rather than reasoning about it.',
    }),
    arch: [
      'scripts/hooks/worktree-claim-decision.cjs:23-30 — shouldBlockWorktreeEdit, the positive-mismatch invariant this must not disturb',
      'scripts/hooks/pre-tool-enforce.cjs:1035-1037 — the existing catch {} fail-open envelope',
      'QF-20260804-087 — the qfHeld tri-state, an earlier fix in the same "collapsing a null into false re-blocks the worker" family',
    ],
    code: [
      "return Boolean(claimedSdKey) && claimedSdKey !== worktreeKey; // null worktreeKey + truthy claim => TRUE => must never be reached",
      "if (!worktreeSdKey) return; // terminal null: skip the comparison, matching today's `if (match && match[1] !== 'qf')`",
    ],
    tests: [
      { id: 'TS-4', file: 'tests/unit/claim/test-seams-fr9.test.js', scenario: 'git unavailable -> path fallback, verdict parity', type: 'unit' },
      { id: 'TS-3b', file: 'tests/unit/claim/test-seams-fr9.test.js', scenario: '"main" / "chore/cleanup" produce no partial key', type: 'unit' },
    ],
  },

  // ------------------------------------------------------------------ FR-4a
  {
    n: 5,
    fr: 'FR-4',
    title: 'Add the four claim-guard specimens to the existing test-seams-fr9 suite',
    user_role: 'reviewer of the claim guard',
    user_want:
      'the reused-tree ALLOW, true cross-claim BLOCK, QF-held regression and git-unavailable specimens added to tests/unit/claim/test-seams-fr9.test.js using its existing execFileSync-spawns-the-real-hook pattern',
    user_benefit:
      'so that the fix is asserted two-sided against the real hook binary rather than argued, and no fifth parallel claim-guard test file is created',
    points: 3,
    priority: 'high',
    ac: [
      {
        scenario: '(a) Reused tree ALLOW — the live specimen',
        given: 'a temp worktree directory named QF-20260903-188 with branch feat/SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-B checked out, and a session whose DB claim is SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-B',
        when: 'runHook({ tool_name: "Edit", tool_input: { file_path: "<that tree>/x.js" } }) is invoked',
        then: 'it returns exit 0 and the derived key recorded is the FULL child key SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-B with source=branch — not the parent SD-LEO-ORCH-CAPA-RECORD-TRUTH-002 and not the directory QF-20260903-188',
      },
      {
        scenario: '(b) True cross-claim BLOCK',
        given: 'a tree whose directory AND branch both name SD-X, and a session whose DB claim is SD-Y',
        when: 'the same Edit payload is run through the hook',
        then: 'it returns exit 2 and stderr names SD-X as the derived target (source=branch) and SD-Y as the session claim — proving the guard still blocks, which an allow-only specimen could never show',
      },
      {
        scenario: '(c) QF-held tri-state regression, unmodified',
        given: 'the QF-20260804-087 case: a QF worktree the session holds via sessionHoldsQuickFixClaim',
        when: 'tests/unit/worktree-claim-decision-qf087.test.js is run WITHOUT modification',
        then: 'it passes — confirming the qfHeld !== false short-circuit at worktree-claim-decision.cjs:26 is byte-for-byte untouched by this SD',
      },
      {
        scenario: '(d) git unavailable falls back to the path regex',
        given: 'the hook child process spawned with PATH stripped of git, a directory naming SD-X and a session claiming SD-Y',
        when: 'the Edit payload is evaluated',
        then: 'the verdict is identical to pre-FR-1 behavior (exit 2, source=path) — asserted against the recorded pre-change verdict, not merely "it still blocks"',
      },
      {
        scenario: 'No new test file; existing pattern reused',
        given: 'the FR-4 changes',
        when: 'the repository is inspected',
        then: 'all four specimens live in tests/unit/claim/test-seams-fr9.test.js and use its existing runHook(payload) helper (execFileSync node HOOK with JSON stdin, returning e.status) — no fifth claim-guard test file is added',
      },
    ],
    dod: [
      'All four specimens pass under `npx vitest run tests/unit/claim/test-seams-fr9.test.js`',
      'The pre-existing two-sided ALLOW/BLOCK seam tests (:94-102) still pass',
      'tests/unit/worktree-claim-decision-qf087.test.js passes with a zero-line diff',
    ],
    ctx: ctx({
      approach: `Extend tests/unit/claim/test-seams-fr9.test.js (111 lines today) with a new describe block. Reuse its module-scope helpers verbatim:

  const runHook = (payload) => { try { execFileSync('node', [HOOK], { input: JSON.stringify(payload), encoding: 'utf8', timeout: 60000 }); return 0; } catch (e) { return e.status; } };

FIXTURE STRATEGY. Each specimen needs a real directory under a .worktrees/<name> path with a real git branch, because the hook shells out to git. Build them in os.tmpdir() with 'git init' + 'git checkout -b <branch>' + an empty commit, and construct the file_path so WORKTREE_PATH_RE matches (i.e. the temp root must contain a literal .worktrees/<name> segment). Clean up in afterAll.

SESSION CLAIM. resolveSessionClaimedSdKey is a DB lookup. Either seed a claim row for a throwaway session id and pass it via the hook's session env, or exercise deriveWorktreeKey + shouldBlockWorktreeEdit directly for the pure cases and reserve full-hook spawns for (a) and (d). Prefer the full spawn for (a) — it is the specimen the SD exists for.

git-UNAVAILABLE (d): spawn the hook with env: { ...process.env, PATH: '' } (or a PATH pointing at an empty dir). Record the pre-change verdict first and assert equality against it, so "parity with today" is a measured constant in the test rather than a claim in a comment.`,
      create: [],
      modify: ['tests/unit/claim/test-seams-fr9.test.js (+~90 LOC)'],
      deps: [
        'US-001, US-002, US-003, US-004 — all four specimens exercise the shipped derivation',
        'tests/unit/worktree-claim-decision-qf087.test.js — must remain UNMODIFIED (that is the assertion)',
        'vitest; scripts/hooks/pre-tool-enforce.cjs is spawned out-of-process (see the file\'s :76-83 note — requiring the hook in-process under vitest HANGS the worker 180s+)',
      ],
      effort: '~2.5h, ~90 LOC of test',
      risk:
        'Do NOT require() pre-tool-enforce.cjs in-process from vitest: the file documents at :76-83 that load-time side effects open handles that never drain, hanging the runner with no obvious cause. Every hook assertion must go through runHook or `node -e require(...)`.',
    }),
    arch: [
      'tests/unit/claim/test-seams-fr9.test.js:22-27 — the runHook helper to reuse',
      'tests/unit/claim/test-seams-fr9.test.js:76-83 — why the hook must be reached out-of-process',
      'tests/unit/claim/test-seams-fr9.test.js:92-102 — the two-sided ALLOW+BLOCK doctrine these specimens extend',
      'tests/unit/worktree-claim-decision-qf087.test.js — the untouched regression baseline',
    ],
    code: [
      "const runHook = (payload) => { try { execFileSync('node', [HOOK], { input: JSON.stringify(payload), encoding: 'utf8', timeout: 60000 }); return 0; } catch (e) { return e.status; } };",
      "expect(runHook({ tool_name: 'Edit', tool_input: { file_path: reusedTreeFile } })).toBe(0);",
    ],
    tests: [
      { id: 'TS-1', file: 'tests/unit/claim/test-seams-fr9.test.js', scenario: '(a) reused tree ALLOW', type: 'integration' },
      { id: 'TS-2', file: 'tests/unit/claim/test-seams-fr9.test.js', scenario: '(b) cross-claim BLOCK', type: 'unit' },
      { id: 'TS-6', file: 'tests/unit/worktree-claim-decision-qf087.test.js', scenario: '(c) QF-held unchanged', type: 'unit' },
      { id: 'TS-4', file: 'tests/unit/claim/test-seams-fr9.test.js', scenario: '(d) git unavailable', type: 'unit' },
    ],
  },

  // ------------------------------------------------------------------ FR-4b
  {
    n: 6,
    fr: 'FR-4',
    title: 'Update the ENFORCEMENT-4 static source pins that FR-1 invalidates',
    user_role: 'CI pipeline',
    user_want:
      'scripts/hooks/__tests__/pre-tool-enforce-clmmulti-002.test.js\'s static source-string pins updated in the SAME PR that rewrites the ENFORCEMENT-4 block',
    user_benefit:
      'so that the PR is not red on arrival, and the pins keep asserting that enforcement is PRESENT rather than merely that some text exists',
    points: 1,
    priority: 'high',
    ac: [
      {
        scenario: 'Pins match the rewritten block',
        given: 'FR-1/FR-2 have rewritten pre-tool-enforce.cjs:1002-1039',
        when: 'npx vitest run scripts/hooks/__tests__/pre-tool-enforce-clmmulti-002.test.js is executed',
        then: 'every source-string pin matches the new text and the suite is green — this is budgeted, required LOC, not optional cleanup (validation-agent finding)',
      },
      {
        scenario: 'Pins assert the NEW invariant, not just new text',
        given: 'the updated pins',
        when: 'the pins are read',
        then: 'at least one pins the branch-first derivation call (deriveWorktreeKey being invoked before shouldBlockWorktreeEdit), not only the surviving WORKTREE_PATH_RE reference — a pin updated to match new text without asserting the new behavior is a pin that verifies nothing',
      },
      {
        scenario: 'Pins still fail on a deleted guard',
        given: 'a local experiment that removes or disables the ENFORCEMENT-4 block',
        when: 'the pin suite runs',
        then: 'it fails — proving the pins were re-anchored rather than loosened to pass',
      },
      {
        scenario: 'Both suites green together',
        given: 'the full change set',
        when: 'both scripts/hooks/__tests__/pre-tool-enforce-clmmulti-002.test.js and tests/unit/claim/test-seams-fr9.test.js run in one vitest invocation',
        then: 'both pass',
      },
    ],
    dod: [
      'pre-tool-enforce-clmmulti-002.test.js updated and green',
      'At least one pin references the derivation call',
      'Negative check performed locally (guard removed -> pins fail) and noted in the PR body',
    ],
    ctx: ctx({
      approach: `scripts/hooks/__tests__/pre-tool-enforce-clmmulti-002.test.js (85 lines) reads pre-tool-enforce.cjs as a string and asserts regexes over the ENFORCEMENT-4 slice. FR-1 rewrites exactly that slice, so these pins go red mechanically.

Procedure: run the suite FIRST against the FR-1 branch to enumerate the failing pins, then re-anchor each one. Re-anchor to the INVARIANT, not to the incidental wording — e.g. pin /deriveWorktreeKey\\(/ appearing before /shouldBlockWorktreeEdit\\(/ in the source slice, rather than pinning a comment sentence that will drift again on the next edit.

The negative check (AC-3) is a manual local step: comment out the ENFORCEMENT-4 body, confirm the suite goes red, restore. Record the result in the PR body — a pin suite that passes on a deleted guard is exactly the failure mode tests/unit/claim/test-seams-fr9.test.js:8-11 warns about.`,
      create: [],
      modify: ['scripts/hooks/__tests__/pre-tool-enforce-clmmulti-002.test.js (~15 LOC changed)'],
      deps: ['US-002 (must land in the same PR — the pins break the moment ENFORCEMENT-4 is rewritten)'],
      effort: '~0.5h, ~15 LOC changed',
      risk:
        'Unbudgeted-but-required LOC flagged by validation-agent at LEAD-TO-PLAN. Omitting it makes the FR-1 PR red on arrival and invites a "just relax the pin" fix, which silently disables the assertion.',
    }),
    arch: [
      'scripts/hooks/__tests__/pre-tool-enforce-clmmulti-002.test.js — the pin suite being re-anchored',
      'tests/unit/claim/test-seams-fr9.test.js:8-11 — "a guard whose decision cannot be unit-tested gets verified by source pins that pass whether or not the behaviour is right"',
    ],
    code: [
      "const src = fs.readFileSync(HOOK, 'utf8'); expect(src.indexOf('deriveWorktreeKey(')).toBeLessThan(src.indexOf('shouldBlockWorktreeEdit('));",
    ],
    tests: [
      { id: 'TS-9', file: 'scripts/hooks/__tests__/pre-tool-enforce-clmmulti-002.test.js', scenario: 'Pins match rewritten ENFORCEMENT-4 and still fail on a removed guard', type: 'unit' },
    ],
  },

  // ------------------------------------------------------------------ FR-5a
  {
    n: 7,
    fr: 'FR-5',
    title: 'Enrich the PAT-CLMMULTI-002 audit row and assert zero path-derived false blocks in CI',
    user_role: 'CI pipeline enforcing the SD exit predicate',
    user_want:
      'permission_audit_log.metadata to carry derivedKey, source, branch and claimedSdKey on every PAT-CLMMULTI-002 block, and a scripts/ci/ script that counts blocks where source=path while the branch named the session\'s own claim',
    user_benefit:
      'so that the exit predicate ratified under 49656c8c is computable from recorded data instead of inferred from source, and a regression is caught by a number rather than by a worker hitting it',
    points: 3,
    priority: 'high',
    ac: [
      {
        scenario: 'Audit metadata is sufficient to compute the predicate',
        given: 'a PAT-CLMMULTI-002 block after this SD ships',
        when: 'the permission_audit_log row is read',
        then: 'metadata contains derivedKey, source ∈ (branch|marker|path), branch (the observed string, or null WITH a reason code such as git_error|not_a_repo|empty), and claimedSdKey — today it carries only { worktreeSdKey, claimedSdKey }, which makes the predicate uncomputable (validation-agent C3 finding)',
      },
      {
        scenario: 'The CI script computes the ratified predicate',
        given: 'permission_audit_log rows written since this SD\'s merge commit',
        when: 'the script runs',
        then: 'it selects PAT-CLMMULTI-002 rows with decision=block AND metadata.source=\'path\', re-derives metadata.branch under the anchored pattern, and counts those whose re-derived key equals metadata.claimedSdKey — asserting that count is 0',
      },
      {
        scenario: 'It prints its predicate and never a hardcoded expectation',
        given: 'any run',
        when: 'the script writes output',
        then: 'it prints the exact predicate (window start commit/timestamp, filters, re-derivation rule) alongside the count; it contains no hardcoded expected count, so it can never report a number it did not take',
      },
      {
        scenario: 'Deterministic over unchanged data',
        given: 'two runs against an unchanged table',
        when: 'the counts are compared',
        then: 'they are identical — the window is anchored to the merge commit, not to a rolling "last N hours"',
      },
      {
        scenario: 'Exit code carries the verdict',
        given: 'a count of 0 versus a count >= 1',
        when: 'the script exits',
        then: '0 exits 0; >=1 exits non-zero and prints the offending row ids, their branch, derivedKey and claimedSdKey',
      },
    ],
    dod: [
      'auditPermissionDecision call in ENFORCEMENT-4 passes the four new metadata fields',
      'scripts/ci/claim-guard-path-source-false-block-count.mjs created and runnable against the live table',
      'Script output includes the literal predicate text; no hardcoded expected count anywhere in the file',
      'Re-derivation inside the script uses the SAME anchored pattern as deriveWorktreeKey (imported or pinned by a shared-literal test)',
    ],
    ctx: ctx({
      approach: `Two parts.

(a) AUDIT WRITE — one-line change at the ENFORCEMENT-4 auditPermissionDecision call (US-002 already threads derivedKey/source/branch to that point):
  ..., 'block', { worktreeSdKey, claimedSdKey, derivedKey, source, branch: branch ?? null, branch_reason: branch ? null : branchReason }
permission_audit_log.metadata is free-form JSONB, so no migration is required.

(b) CI SCRIPT — scripts/ci/claim-guard-path-source-false-block-count.mjs, following the existing scripts/ci/ convention (audit-log-parity-check.mjs, red-merge-detector.mjs):
  - resolve the window start from the SD's merge commit (git log --format=%cI -1 <sha>), not a rolling clock
  - supabase.from('permission_audit_log').select(...).eq('pattern','PAT-CLMMULTI-002').eq('decision','block').gte('created_at', windowStart)
  - filter in JS: metadata.source === 'path' && deriveWorktreeKey({ branch: metadata.branch }).key === metadata.claimedSdKey
  - print the predicate verbatim, print the count, exit 0/1

SHARED-LITERAL DISCIPLINE: the script must re-derive with the SAME anchored pattern the hook uses. Import it from worktree-claim-decision.cjs (createRequire in an .mjs) rather than copying the regex — a second copy is how lib/worktree-reaper/detectors.js:40 and scripts/safe-worktree-remove.mjs:46 came to differ from work-key-derivation.mjs in the first place, which is the root cause this whole SD is fixing.`,
      create: ['scripts/ci/claim-guard-path-source-false-block-count.mjs (~80 LOC)'],
      modify: ['scripts/hooks/pre-tool-enforce.cjs — auditPermissionDecision metadata argument (~3 LOC)'],
      deps: [
        'US-001 (anchored pattern, imported not copied)',
        'US-002 (derivedKey/source/branch in scope at the audit call)',
        'permission_audit_log table (metadata JSONB, free-form — no migration needed)',
        'scripts/ci/audit-log-parity-check.mjs — the naming/exit-code convention to follow',
        'lib/supabase-client.js createSupabaseServiceClient',
      ],
      effort: '~2.5h, ~85 LOC',
      risk:
        'A guard may decline to run, but must never report a number it did not take: if the window start or the table read fails, the script must exit non-zero with an explicit "could not measure" message — never print 0.',
    }),
    arch: [
      'scripts/hooks/pre-tool-enforce.cjs — auditPermissionDecision call inside ENFORCEMENT-4',
      'scripts/ci/audit-log-parity-check.mjs — sibling CI predicate script (structure, exit codes, output shape)',
      'scripts/ci/red-merge-detector.mjs — second sibling for the scripts/ci/ convention',
      'Ratification 49656c8c — the FOUNDATION CAPA exit-predicate requirement this satisfies',
    ],
    code: [
      "await supabase.from('permission_audit_log').select('id, created_at, metadata').eq('pattern', 'PAT-CLMMULTI-002').eq('decision', 'block').gte('created_at', windowStart);",
      "const { createRequire } = await import('node:module'); const { deriveWorktreeKey } = createRequire(import.meta.url)('../hooks/worktree-claim-decision.cjs');",
    ],
    tests: [
      { id: 'TS-8', file: 'scripts/ci/claim-guard-path-source-false-block-count.mjs', scenario: 'Two runs over unchanged data return the identical count and print the predicate', type: 'integration' },
    ],
  },

  // ------------------------------------------------------------------ FR-5b
  {
    n: 8,
    fr: 'FR-5',
    title: 'Lint against any other hook deriving an SD key from a directory name alone',
    user_role: 'harness maintainer',
    user_want:
      'a scripts/lint/ check that statically fails any hook OTHER than worktree-claim-decision.cjs which derives an SD key from a bare .worktrees/<name> directory match with no branch or marker precedence',
    user_benefit:
      'so that the class of defect is closed across the hook surface rather than only at the one site that happened to bite Golf today',
    points: 2,
    priority: 'medium',
    ac: [
      {
        scenario: 'The lint scans the hook surface for the defect shape',
        given: 'scripts/hooks/**',
        when: 'the lint runs',
        then: 'it flags any file that matches a .worktrees/<segment> capture and uses the capture as an SD key without a preceding branch- or marker-derived source',
      },
      {
        scenario: 'It is green on the shipped tree',
        given: 'the repository after this SD merges',
        when: 'the lint runs',
        then: 'it exits 0 — worktree-claim-decision.cjs is the single sanctioned derivation site and is allowlisted with a reason string, following the scripts/lint/*-allowlist.json convention',
      },
      {
        scenario: 'It fails on a synthetic regression',
        given: 'a fixture hook that does `const key = filePath.match(WORKTREE_PATH_RE)[1]` and compares it to a claim',
        when: 'the lint runs against it',
        then: 'it exits non-zero and names the offending file and line — proving the lint detects the pattern rather than merely passing on a tree that happens to be clean',
      },
      {
        scenario: 'It follows the established lint convention',
        given: 'the new file',
        when: 'it is compared to scripts/lint/*-lint.mjs siblings',
        then: 'it uses the same shape: an .mjs entrypoint, a JSON allowlist with per-entry reasons, an exit code carrying the verdict, and output naming file:line for every finding',
      },
    ],
    dod: [
      'scripts/lint/claim-key-directory-derivation-lint.mjs created',
      'Companion allowlist JSON with worktree-claim-decision.cjs and a reason string',
      'Positive (clean tree exits 0) AND negative (fixture exits non-zero) both demonstrated',
      'Wired into the lint entry the sibling *-lint.mjs scripts use',
    ],
    ctx: ctx({
      approach: `Follow the dominant scripts/lint/ shape (e.g. no-literal-home-path-lint.mjs + no-literal-home-path-allowlist.json, ismainmodule-classguard-lint.mjs + allowlist):

  1. glob scripts/hooks/**/*.{js,cjs,mjs}
  2. for each file, find occurrences of a .worktrees path capture — the literal /\\.worktrees[/\\\\]([^/\\\\]+)/ regex, or a 'match(WORKTREE_PATH_RE)' call
  3. flag when the captured group is subsequently used as an SD key (assigned to an identifier matching /sd[_-]?key|worktreeKey|derivedKey/i, or passed to shouldBlockWorktreeEdit) and the file does NOT also reference a branch/marker source (rev-parse --abbrev-ref, deriveWorktreeKey, or the marker filename)
  4. skip allowlisted paths; print file:line for every finding; process.exit(findings.length ? 1 : 0)

Static-grep scope is deliberate — this is a convention lint, not a dataflow analyser. Keep the heuristic narrow enough that it cannot false-positive on the sanctioned site (which is allowlisted anyway) and loud enough to catch a copy-paste of today's ENFORCEMENT-4 into a new hook.

Negative-case proof: keep a fixture under the lint's own test (or a temp file written by the test) rather than a permanently-broken file in scripts/hooks/, so the lint's own CI run stays green.`,
      create: [
        'scripts/lint/claim-key-directory-derivation-lint.mjs (~70 LOC)',
        'scripts/lint/claim-key-directory-derivation-allowlist.json (~10 LOC)',
      ],
      modify: ['(lint runner wiring, wherever the sibling *-lint.mjs scripts are invoked)'],
      deps: [
        'scripts/lint/no-literal-home-path-lint.mjs + allowlist — the convention being followed',
        'scripts/lint/ismainmodule-classguard-lint.mjs + allowlist — second reference for allowlist shape',
        'US-001/US-002 (the sanctioned site must exist and be branch-first before the allowlist entry is truthful)',
      ],
      effort: '~2h, ~80 LOC',
      risk:
        'A lint that only ever passes is indistinguishable from a lint that never runs. The negative fixture (AC-3) is the load-bearing acceptance criterion, not the green run.',
    }),
    arch: [
      'scripts/lint/no-literal-home-path-lint.mjs + no-literal-home-path-allowlist.json — canonical lint+allowlist pair',
      'scripts/lint/ismainmodule-classguard-lint.mjs + ismainmodule-classguard-allowlist.json — second reference',
      'scripts/hooks/pre-tool-enforce.cjs:368 WORKTREE_PATH_RE — the literal the lint hunts for outside the sanctioned site',
    ],
    code: [
      "const WORKTREE_CAPTURE_RE = /\\.worktrees\\[\\/\\\\\\\\\\]\\(\\[\\^\\/\\\\\\\\\\]\\+\\)/; // the defect shape, matched as source text",
      "process.exit(findings.length ? 1 : 0);",
    ],
    tests: [
      { id: 'TS-10', file: 'scripts/lint/claim-key-directory-derivation-lint.mjs', scenario: 'Clean tree exits 0; synthetic bare-directory-derivation fixture exits non-zero naming file:line', type: 'unit' },
    ],
  },
];

// ---------------------------------------------------------------------------
async function main() {
  const supabase = createSupabaseServiceClient();

  const rows = stories.map((s) => ({
    story_key: `${SD_KEY}:US-${String(s.n).padStart(3, '0')}`,
    prd_id: PRD_ID,
    sd_id: SD_UUID,
    title: s.title,
    user_role: s.user_role,
    user_want: s.user_want,
    user_benefit: s.user_benefit,
    story_points: s.points,
    priority: s.priority,
    status: 'ready',
    acceptance_criteria: s.ac,
    definition_of_done: s.dod,
    depends_on: s.deps_on || [],
    blocks: [],
    technical_notes: JSON.stringify({
      generated_by: 'STORIES sub-agent v2.0.0',
      source_fr: s.fr,
      sd_type: 'infrastructure',
      invest_checked: true,
    }),
    implementation_approach: s.ctx,
    implementation_context: s.ctx,
    architecture_references: s.arch,
    example_code_patterns: s.code,
    testing_scenarios: s.tests,
    test_scenarios: s.tests,
    given_when_then: s.ac,
    e2e_test_status: 'skipped',
    validation_status: 'pending',
    implementation_status: 'pending',
    created_by: 'STORIES_SUBAGENT',
    metadata: {
      fr_id: s.fr,
      e2e_exemption:
        "sd_type=infrastructure -> sd_type_validation_profiles.requires_e2e_tests=false; story_e2e_guidance directs CLI/CI verification. Validation is by the unit specimens named in testing_scenarios (tests/unit/claim/test-seams-fr9.test.js) plus the FR-5 CI predicate script.",
      unit_test_paths: [...new Set(s.tests.map((t) => t.file))],
      invest: {
        independent: true,
        negotiable: true,
        valuable: true,
        estimable: true,
        small: s.ac.length <= 5,
        testable: true,
      },
      context_quality: 'gold',
    },
  }));

  const { data, error } = await supabase.from('user_stories').insert(rows).select('id, story_key, implementation_context');
  if (error) {
    console.error('INSERT FAILED:', JSON.stringify(error, null, 2));
    process.exit(1);
  }

  const withCtx = data.filter((r) => r.implementation_context && r.implementation_context.length > 50).length;
  const coverage = Math.round((withCtx / data.length) * 100);
  console.log(`INSERTED ${data.length} stories`);
  data.forEach((r) => console.log(`  ${r.story_key}  ctx_len=${r.implementation_context?.length ?? 0}`));
  console.log(`CONTEXT_COVERAGE: ${withCtx}/${data.length} = ${coverage}%`);
  console.log(`TOTAL_POINTS: ${stories.reduce((a, s) => a + s.points, 0)}`);
  console.log(`TOTAL_AC: ${stories.reduce((a, s) => a + s.ac.length, 0)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
