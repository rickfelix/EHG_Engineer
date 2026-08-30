/**
 * static-prefix-audit.mjs — SD-LEO-INFRA-STATIC-PREFIX-DIET-001 (burn-lever A4).
 *
 * Per-seat static-prefix composition audit: measures bytes + calibrated harness-tokens
 * (via lib/protocol/harness-token-scale.cjs) for each component a seat pays as its static
 * cache-write prefix on session start. This is the AUDIT half of the diet — it selects
 * candidates by measurement, never intuition, and it is the sole basis PLAN's PRD requires
 * for choosing what to move behind on-demand reads.
 *
 * FR-1: reuse resolveMemoryDir() from scripts/modules/memory/reindex.mjs for the MEMORY.md
 * path (never author a rival resolver — TESTING sub-agent found 3 divergent ones already
 * in-repo, including a hardcoded literal).
 *
 * FR-2: MEMORY.md must fail loud when unresolvable, never silently report 0 bytes for it —
 * it is the largest hand-maintained component and lives OUTSIDE this repo (per-seat path
 * under the user's Claude Code projects dir), invisible to git ls-files.
 */
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { resolveMemoryDir } from '../../scripts/modules/memory/reindex.mjs';

const require = createRequire(import.meta.url);
const { harnessTokensFromBytes, SINGLE_READ_TOKEN_CAP } = require('./harness-token-scale.cjs');

/**
 * Per-seat file lists. "at least an Adam seat and a worker seat" per SD scope.
 * A worker seat's static prefix is CLAUDE.md + CLAUDE_CORE.md + its current phase file;
 * an Adam seat additionally carries its own role file + digest.
 */
export const SEAT_PROFILES = {
  worker: ['CLAUDE.md', 'CLAUDE_CORE.md'],
  adam: ['CLAUDE.md', 'CLAUDE_ADAM.md', 'CLAUDE_ADAM_DIGEST.md'],
};

/**
 * Measures a single repo-relative file. Returns null (never 0) when the file does not
 * exist, so a missing/misnamed file is visibly absent from a total rather than silently
 * contributing zero.
 */
export function measureRepoFile(repoRoot, relPath) {
  const abs = join(repoRoot, relPath);
  if (!existsSync(abs)) return null;
  const bytes = statSync(abs).size;
  return { component: relPath, bytes, harnessTokens: harnessTokensFromBytes(bytes) };
}

/**
 * Measures the per-seat MEMORY.md via the canonical resolver. Throws (never returns a
 * 0-byte measurement) when the resolved directory or MEMORY.md itself does not exist —
 * FR-2's fail-loud requirement.
 */
export function measureMemoryMd({ memoryDir, opts = {} } = {}) {
  const dir = resolveMemoryDir(memoryDir, opts);
  const abs = join(dir, 'MEMORY.md');
  if (!existsSync(abs)) {
    throw new Error(`MEMORY_MD_UNRESOLVABLE: resolved memory dir "${dir}" has no MEMORY.md — refusing to report 0 bytes for the largest hand-maintained prefix component`);
  }
  const bytes = statSync(abs).size;
  return { component: 'MEMORY.md', path: abs, bytes, harnessTokens: harnessTokensFromBytes(bytes) };
}

/**
 * Aggregates a list of { component, bytes, harnessTokens|null } measurements into a total.
 * FR-2 hardening: a null (unmeasurable) harnessTokens NEVER silently contributes 0 to the
 * total — it is surfaced in `unmeasurable`, and the caller decides whether to proceed.
 */
export function aggregateComponents(measurements) {
  const present = measurements.filter(Boolean);
  const unmeasurable = present.filter((m) => m.harnessTokens == null).map((m) => m.component);
  const totalBytes = present.reduce((sum, m) => sum + m.bytes, 0);
  const totalHarnessTokens = present.reduce((sum, m) => sum + (m.harnessTokens || 0), 0);
  return { components: present, totalBytes, totalHarnessTokens, unmeasurable };
}

/**
 * Runs the full per-seat audit: named repo files for the seat profile + MEMORY.md.
 * Repo-file components that don't exist are silently OMITTED from the list (not reported as
 * 0) — a missing file is a config-drift bug the caller should notice from the components
 * list being short, not from a phantom zero-byte row.
 */
export function auditSeat(seat, { repoRoot, memoryDir, memoryOpts = {} } = {}) {
  const profile = SEAT_PROFILES[seat];
  if (!profile) throw new Error(`UNKNOWN_SEAT_PROFILE: "${seat}" — known profiles: ${Object.keys(SEAT_PROFILES).join(', ')}`);
  const repoMeasurements = profile.map((rel) => measureRepoFile(repoRoot, rel)).filter(Boolean);
  const memoryMeasurement = measureMemoryMd({ memoryDir, opts: memoryOpts });
  const totals = aggregateComponents([...repoMeasurements, memoryMeasurement]);
  return { seat, ...totals };
}

/**
 * FR-5: destination-file single-read-cap check. A file receiving moved content must itself
 * still fit the Read tool's hard cap after the move — moving content INTO an already-
 * over-cap file silently truncates it on read while the diet still books its reduction.
 */
export function checkDestinationFits(bytes) {
  const tokens = harnessTokensFromBytes(bytes);
  return { bytes, harnessTokens: tokens, fits: tokens != null && tokens <= SINGLE_READ_TOKEN_CAP };
}
