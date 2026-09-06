/**
 * SD-LEO-INFRA-LOOP-LIVENESS-DISCRIMINATOR-001 FR-7 — preventive exit predicate.
 *
 * Mirrors the established census-test convention (tests/unit/session-coordination-consumption-
 * census.test.js, tests/unit/session-cleanup-entry-point-census.test.js): pin TODAY's baseline
 * set of claude_sessions.heartbeat_at readers as an explicit allowlist; a NEW reader appearing
 * outside it fails CI, forcing an explicit choice (route it through FR-1's classifyLoopLiveness/
 * classifyLoopLivenessStrict, or extend the allowlist with a stated reason) instead of silently
 * re-introducing the "heartbeat used as a loop-liveness proxy" defect class a fourth time.
 *
 * DELIBERATELY NOT a copy of session-coordination-consumption-census.test.js's own scanner:
 * PLAN-phase prospective TESTING evidence (2026-09-06) measured that scanner as .cjs-only and
 * non-recursive, which across THIS FR's scope would find only ~half of the real readers and be
 * blind to lib/fleet/genuine-worker.mjs and lib/adam/outbound-silence-watchdog.js -- the two
 * files FR-1 and FR-3 themselves modify. This scanner is recursive and covers .js/.mjs/.cjs, and
 * the first test below is a non-zero-yield self-check naming those two files specifically so a
 * future scope-narrowing regression fails loudly instead of silently scanning nothing.
 *
 * Baseline measured 2026-09-06 at the tip of this SD's own FR-1/FR-2/FR-3 commits (the allowlist
 * intentionally reflects the CORRECTED reader set, not the pre-fix one).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

const SCAN_EXTS = ['.js', '.mjs', '.cjs'];
const TEST_FILE_RE = /\.(test|spec)\.[cm]?js$/;

// The 61 production files measured to reference heartbeat_at under this FR's scope, 2026-09-06
// (57 at initial FR-7 authoring + 4 added post-adversarial-review, see scanCandidates above).
// Not individually classified decision-vs-telemetry (that per-file audit is future work this
// census enables, not a prerequisite for it) -- this is a DRIFT-DETECTION baseline: it fails
// loudly on any NEW reader, which is the preventive contract FR-7 exists to provide. Two entries
// carry an explicit stated reason because they were specifically named in the SD/PRD scope note:
const ALLOWED_READERS = new Set([
  'lib/adam/outbound-silence-watchdog.js',
  'lib/coordinator/adam-identity.cjs',
  'lib/coordinator/charter-audit-detectors.mjs',
  'lib/coordinator/coordination-events.cjs',
  'lib/coordinator/detectors.cjs',
  'lib/coordinator/dispatch.cjs',
  'lib/coordinator/kill-switch-writer.cjs',
  'lib/coordinator/michael-identity.cjs',
  'lib/coordinator/presence-grounding-signals.cjs',
  'lib/coordinator/receipts.cjs',
  'lib/coordinator/resolve.cjs',
  'lib/coordinator/role-comms-guard.cjs',
  'lib/coordinator/role-seat-liveness.cjs',
  'lib/coordinator/self-id-handshake.cjs',
  'lib/coordinator/singleton-refresh-sequencer.cjs',
  'lib/coordinator/solomon-identity.cjs',
  'lib/fleet/claim-boundary-probe.cjs',
  'lib/fleet/claim-release-guard.cjs',
  'lib/fleet/claimant-liveness.cjs',
  'lib/fleet/console-reaper.mjs',
  'lib/fleet/daemon-census.cjs',
  'lib/fleet/db-clock.cjs',
  'lib/fleet/dormancy-watchdog.cjs',
  'lib/fleet/fr3-idle-consolidation-differential.mjs',
  'lib/fleet/freeze-detector.cjs',
  'lib/fleet/genuine-worker.mjs',
  'lib/fleet/live-fleet-sessions.cjs',
  'lib/fleet/reboot-respawn-runner.js',
  'lib/fleet/release-work-item.mjs',
  'lib/fleet/seat-idle-predicate.mjs',
  'lib/fleet/self-wake-escalation.cjs',
  // RECORD-TRUTH-001-E: explicitly required in the allowlist. isSessionAlive is its own
  // independent alive/not-alive OR-ladder SSOT, not migrated to FR-1 by this SD.
  'lib/fleet/session-liveness.cjs',
  'lib/fleet/session-predicates.mjs',
  'lib/fleet/session-watchdog.js',
  'lib/fleet/stuck-seat-population.cjs',
  'lib/fleet/stuck-seat-predicate.cjs',
  'lib/fleet/tier-backlog.cjs',
  'lib/fleet/tier-ladder.cjs',
  'lib/fleet/worker-status.cjs',
  'scripts/adam-coordinator-health.mjs',
  'scripts/adam-exec-summary.mjs',
  'scripts/adam-quiet-tick.mjs',
  'scripts/adam-register.cjs',
  'scripts/adam-self-adherence-review.mjs',
  'scripts/adam-startup-check.mjs',
  'scripts/coordinator-audit.mjs',
  'scripts/coordinator-capacity-forecast.mjs',
  'scripts/coordinator-charter-audit.mjs',
  'scripts/coordinator-cold-recovery.cjs',
  'scripts/coordinator-comms-check.mjs',
  'scripts/coordinator-email-summary.mjs',
  'scripts/coordinator-hourly-review.cjs',
  'scripts/coordinator-idle-qf-hint.mjs',
  'scripts/coordinator-self-review.mjs',
  'scripts/coordinator-stale-qf-disposition-sweep.mjs',
  'scripts/coordinator-startup-check.mjs',
  // Named explicitly (FR-7 scope-gap correction, PLAN-phase TESTING evidence): does not match
  // any of the five directory/glob patterns above, so it would be silently missed by a
  // glob-only matcher. Its heartbeat_at reads are outside the five named scope buckets by
  // filename alone, which is exactly why this file adds it as a literal path.
  'scripts/session-tick.cjs',
  // Added post-adversarial-review (deep-tier /ship gate): scripts/lib/ is now recursively
  // scanned (see scanCandidates' doc comment) and these two fleet-*.mjs scripts are named
  // explicitly -- both are real heartbeat_at liveness readers this SD's own FR-6 wired
  // stampLastFired() into, previously invisible to this census.
  'scripts/lib/capacity-inputs.mjs',
  'scripts/lib/engagement-buckets.mjs',
  'scripts/fleet-down-alert.mjs',
  'scripts/fleet-worker-pulse.mjs',
]);

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      walk(full, out);
    } else if (SCAN_EXTS.some((ext) => e.name.endsWith(ext)) && !TEST_FILE_RE.test(e.name)) {
      out.push(full);
    }
  }
}

/**
 * All candidate files in FR-7's scope, recursive, .js/.mjs/.cjs, production files only.
 *
 * Adversarial review finding (deep-tier /ship gate, pre-merge): FR-7's literal wording
 * ("scripts/adam-*, scripts/coordinator-*") made the census structurally blind to
 * scripts/lib/engagement-buckets.mjs (FR-2's own target -- lives under a DIFFERENT scripts/lib/
 * directory, not any of the three recursively-scanned lib/ roots) and to
 * scripts/fleet-down-alert.mjs / scripts/fleet-worker-pulse.mjs (both real heartbeat_at readers,
 * both just wired with FR-6's own stampLastFired() calls by this same SD) -- a preventive census
 * that cannot see the very files its own SD touches defeats its purpose. scripts/lib/ is now
 * recursively scanned alongside the three lib/ roots, and the two fleet-*.mjs scripts are named
 * explicitly, matching the existing scripts/session-tick.cjs precedent.
 */
function scanCandidates() {
  const files = [];
  for (const dir of ['lib/adam', 'lib/coordinator', 'lib/fleet', 'scripts/lib']) {
    walk(path.join(REPO_ROOT, dir), files);
  }
  const scriptsDir = path.join(REPO_ROOT, 'scripts');
  for (const e of readdirSync(scriptsDir, { withFileTypes: true })) {
    if (e.isDirectory()) continue;
    if (/^(adam|coordinator)-.+\.(js|mjs|cjs)$/.test(e.name)) files.push(path.join(scriptsDir, e.name));
  }
  // Named explicitly (each documented above / at ALLOWED_READERS): none match the
  // scripts/adam-*|coordinator-* glob or a recursively-scanned lib/ root by path alone.
  for (const rel of ['session-tick.cjs', 'fleet-down-alert.mjs', 'fleet-worker-pulse.mjs']) {
    files.push(path.join(scriptsDir, rel));
  }
  return [...new Set(files)].filter((f) => {
    try { readFileSync(f); return true; } catch { return false; }
  });
}

/** Candidate files whose text contains the literal column name 'heartbeat_at'. */
function findReaders() {
  return scanCandidates()
    .map((f) => ({ abs: f, rel: path.relative(REPO_ROOT, f).split(path.sep).join('/') }))
    .filter(({ abs }) => readFileSync(abs, 'utf8').includes('heartbeat_at'))
    .map(({ rel }) => rel);
}

describe('claude_sessions.heartbeat_at reader census (FR-7 preventive exit predicate)', () => {
  it('non-zero-yield self-check: the scanner finds the two files FR-1/FR-3 themselves modify, proving it is not scoped to nothing', () => {
    const found = new Set(findReaders());
    expect(found.has('lib/fleet/genuine-worker.mjs')).toBe(true);
    expect(found.has('lib/adam/outbound-silence-watchdog.js')).toBe(true);
  });

  it('scripts/session-tick.cjs (outside all five directory/glob patterns) is detected, not silently missed', () => {
    expect(new Set(findReaders()).has('scripts/session-tick.cjs')).toBe(true);
  });

  it('lib/fleet/session-liveness.cjs is present in the allowlist per RECORD-TRUTH-001-E', () => {
    expect(ALLOWED_READERS.has('lib/fleet/session-liveness.cjs')).toBe(true);
  });

  it('every discovered reader is one of the allowlisted baseline sites', () => {
    const found = findReaders();
    const unallowed = found.filter((f) => !ALLOWED_READERS.has(f));
    expect(
      unallowed,
      'New/unclassified claude_sessions.heartbeat_at reader(s) found -- route the liveness ' +
      'decision through lib/fleet/genuine-worker.mjs\'s classifyLoopLiveness/' +
      'classifyLoopLivenessStrict, or add to ALLOWED_READERS in this test with a stated reason ' +
      `if it is genuinely pure telemetry: ${unallowed.join(', ')}`
    ).toEqual([]);
  });

  it('every allowlisted site still exists and still references heartbeat_at (allowlist not stale)', () => {
    const found = new Set(findReaders());
    const stale = [...ALLOWED_READERS].filter((f) => !found.has(f));
    expect(stale, `Allowlist entries no longer reference heartbeat_at -- remove from ALLOWED_READERS: ${stale.join(', ')}`).toEqual([]);
  });
});
