/**
 * Unit tests — SD-LEO-INFRA-SESSION-COORDINATION-LANE-002
 *
 * Regression guard for the consumption-semantics census (clause e, session_coordination row
 * 09189ed9): every scripts/*.cjs or lib/coordinator/*.cjs write to session_coordination's
 * read_at/acknowledged_at columns must be one of the 12 sites already classified and cited in
 * docs/protocol/coordinator-adam-comms.md. A NEW write site appearing outside this allowlist
 * means either a fresh (un-classified) drift, or the census doc needs updating alongside the
 * new site — this test forces that choice to be explicit rather than silent.
 *
 * Static/structural only — no DB, no imports of the scanned files (avoids side effects from
 * their top-level require() calls).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// The 12 write sites classified in docs/protocol/coordinator-adam-comms.md's
// "Consumption-semantics census" section (2026-07-11). Relative to REPO_ROOT, POSIX separators.
const ALLOWED_WRITE_FILES = new Set([
  'scripts/adam-advisory.cjs',
  'scripts/solomon-advisory.cjs',
  'scripts/coordinator-ack-signal.cjs',
  'scripts/fleet-dashboard.cjs',
  'scripts/worker-checkin.cjs',
  'scripts/worker-signal.cjs',
  'scripts/fleet-coaching.cjs',
  'scripts/stale-session-sweep.cjs',
  'scripts/hooks/coordination-inbox.cjs',
  'lib/coordinator/relay-queue.cjs',
  'lib/coordinator/signal-router.cjs',
]);

// Matches both the inline-literal style (.update({ read_at: now })) and the dynamic-assembly
// style (upd.read_at = now; ...; .update(upd)) — scripts/hooks/coordination-inbox.cjs uses the
// latter (builds the update object from a `verdict`, one property per stage).
const INLINE_UPDATE_PATTERN = /\.update\(\{[^}]*(read_at|acknowledged_at)/;
// (?!=) excludes equality comparisons (== / ===), which must not count as writes.
const PROPERTY_ASSIGN_PATTERN = /\.(read_at|acknowledged_at)\s*=(?!=)/;
const WRITE_PATTERN = {
  test: (text) => INLINE_UPDATE_PATTERN.test(text) || PROPERTY_ASSIGN_PATTERN.test(text),
};

function listCjsFiles(relDir) {
  const abs = path.join(REPO_ROOT, relDir);
  let entries;
  try {
    entries = readdirSync(abs, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const e of entries) {
    if (e.isDirectory()) continue; // shallow scan — matches the census's own grep scope
    if (e.name.endsWith('.cjs')) files.push(path.posix.join(relDir, e.name));
  }
  return files;
}

function findWriteSites() {
  const candidates = [
    ...listCjsFiles('scripts'),
    ...listCjsFiles('scripts/hooks'),
    ...listCjsFiles('lib/coordinator'),
  ];
  const sites = [];
  for (const rel of candidates) {
    const text = readFileSync(path.join(REPO_ROOT, rel), 'utf8');
    if (WRITE_PATTERN.test(text)) sites.push(rel);
  }
  return sites;
}

describe('session_coordination read_at/acknowledged_at write-site census (allowlist regression guard)', () => {
  it('every discovered write site is one of the 12 already-classified sites', () => {
    const found = findWriteSites();
    const unclassified = found.filter((f) => !ALLOWED_WRITE_FILES.has(f));
    expect(unclassified, `New/unclassified write site(s) found — classify in docs/protocol/coordinator-adam-comms.md's census section before merging: ${unclassified.join(', ')}`).toEqual([]);
  });

  it('every allowlisted site still exists and still writes read_at/acknowledged_at (allowlist not stale)', () => {
    for (const rel of ALLOWED_WRITE_FILES) {
      const text = readFileSync(path.join(REPO_ROOT, rel), 'utf8');
      expect(WRITE_PATTERN.test(text), `${rel} no longer writes read_at/acknowledged_at — remove from the allowlist and update the census doc`).toBe(true);
    }
  });

  it('scripts/archive/** is excluded from the census scope (dead code, not live drift)', () => {
    const found = findWriteSites();
    expect(found.some((f) => f.startsWith('scripts/archive/'))).toBe(false);
  });
});
