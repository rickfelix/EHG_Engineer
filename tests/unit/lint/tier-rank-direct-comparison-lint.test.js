/**
 * SD-LEO-INFRA-TIER-FLOOR-PROVENANCE-001 (FR-2 acceptance criterion) -- unit coverage for the
 * tier-rank direct-comparison lint (cloned from tests/unit/lint/gemini-pin-lint.test.js's proven
 * template for this lint family).
 */
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function libFile(dir, name, content) {
  const libDir = join(dir, 'lib');
  mkdirSync(libDir, { recursive: true });
  const p = join(libDir, name);
  writeFileSync(p, content);
  return p;
}

const LINT_SCRIPT = join(process.cwd(), 'scripts/lint/tier-rank-direct-comparison-lint.mjs');

describe('tier-rank-direct-comparison-lint: full-sweep sanity against the real repo', () => {
  it('reports 0 unallowlisted violations (the SSOT is the only place doing this comparison)', () => {
    const output = execSync(`node "${LINT_SCRIPT}" --all`, { encoding: 'utf8', cwd: process.cwd() });
    expect(output).toMatch(/0 unallowlisted violations/);
  });
});

describe('tier-rank-direct-comparison-lint: fixture detection (isolated tmp repo, RED-first proof)', () => {
  it('flags a NEW hand-rolled min_tier_rank comparison outside the SSOT, and passes once removed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tier-rank-lint-fixture-'));
    const fixturePath = libFile(dir, 'reintroduced_comparison.js', `
function claimable(sd, workerRank) {
  return sd.metadata.min_tier_rank > workerRank ? 'blocked' : 'ok';
}
`);

    let redOutput = '';
    let redFailed = false;
    try {
      execSync(`node "${LINT_SCRIPT}" --all`, { encoding: 'utf8', cwd: dir });
    } catch (err) {
      redFailed = true;
      redOutput = err.stdout?.toString() || err.message;
    }
    expect(redFailed).toBe(true);
    expect(redOutput).toMatch(/unallowlisted violation/);
    expect(redOutput).toMatch(/reintroduced_comparison\.js/);

    writeFileSync(fixturePath, `
// comparison removed -- delegate to tierRankVerdict()/tierBlocks() instead.
`);
    const greenOutput = execSync(`node "${LINT_SCRIPT}" --all`, { encoding: 'utf8', cwd: dir });
    rmSync(dir, { recursive: true, force: true });

    expect(greenOutput).toMatch(/0 unallowlisted violations/);
  });

  it('does NOT flag lib/fleet/tier-ladder.cjs itself (the SSOT), regardless of comparisons it holds', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tier-rank-lint-fixture-ssot-'));
    const fleetDir = join(dir, 'lib', 'fleet');
    mkdirSync(fleetDir, { recursive: true });
    writeFileSync(join(fleetDir, 'tier-ladder.cjs'), `
function tierRankVerdict(workerTierRank, minTierRank) {
  if (minTierRank > workerTierRank) return 'above_worker_tier';
  return null;
}
`);

    const output = execSync(`node "${LINT_SCRIPT}" --all`, { encoding: 'utf8', cwd: dir });
    rmSync(dir, { recursive: true, force: true });

    expect(output).toMatch(/0 unallowlisted violations/);
  });

  it('does NOT flag a bare property read/coercion of min_tier_rank with no comparison operator', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tier-rank-lint-fixture-bare-read-'));
    libFile(dir, 'reader.js', `
const minRank = Number(row.metadata && row.metadata.min_tier_rank);
const sd = { sd_key: 'X', metadata: { min_tier_rank: 4 } };
`);

    const output = execSync(`node "${LINT_SCRIPT}" --all`, { encoding: 'utf8', cwd: dir });
    rmSync(dir, { recursive: true, force: true });

    expect(output).toMatch(/0 unallowlisted violations/);
  });

  it('does NOT flag a line that calls tierRankVerdict( even if it also mentions min_tier_rank in the same statement', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tier-rank-lint-fixture-callsite-'));
    libFile(dir, 'caller.js', `
const verdict = tierRankVerdict(ctx.worker_tier_rank, row.metadata.min_tier_rank, { hasProvenance });
`);

    const output = execSync(`node "${LINT_SCRIPT}" --all`, { encoding: 'utf8', cwd: dir });
    rmSync(dir, { recursive: true, force: true });

    expect(output).toMatch(/0 unallowlisted violations/);
  });

  it('does NOT flag postgrest ->/->> arrows or JS => arrow functions mentioning min_tier_rank', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tier-rank-lint-fixture-arrows-'));
    libFile(dir, 'arrows.js', `
const q = sb.from('x').or('metadata->>min_tier_rank.not.is.null');
const todo = rows.filter((sd) => !(sd.metadata && Number.isFinite(Number(sd.metadata.min_tier_rank))));
`);

    const output = execSync(`node "${LINT_SCRIPT}" --all`, { encoding: 'utf8', cwd: dir });
    rmSync(dir, { recursive: true, force: true });

    expect(output).toMatch(/0 unallowlisted violations/);
  });

  it('does NOT flag a comment referencing min_tier_rank comparisons in prose', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tier-rank-lint-fixture-comment-'));
    libFile(dir, 'comment_only.js', `
// This used to compare min_tier_rank > workerRank directly -- now delegates to tierRankVerdict.
`);

    const output = execSync(`node "${LINT_SCRIPT}" --all`, { encoding: 'utf8', cwd: dir });
    rmSync(dir, { recursive: true, force: true });

    expect(output).toMatch(/0 unallowlisted violations/);
  });

  it('respects the inline disable pragma for a single intentional line', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tier-rank-lint-fixture-pragma-'));
    libFile(dir, 'pragma.js', `
const blocked = sd.metadata.min_tier_rank > workerRank; // tier-rank-comparison-lint-disable-line
`);

    const output = execSync(`node "${LINT_SCRIPT}" --all`, { encoding: 'utf8', cwd: dir });
    rmSync(dir, { recursive: true, force: true });

    expect(output).toMatch(/0 unallowlisted violations/);
  });

  it('a fixture allowlist entry suppresses its exact file:line', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tier-rank-lint-fixture-allowlist-'));
    libFile(dir, 'grandfathered.js', `
const blocked = sd.metadata.min_tier_rank > workerRank;
`);
    const scriptsLintDir = join(dir, 'scripts', 'lint');
    mkdirSync(scriptsLintDir, { recursive: true });
    writeFileSync(join(scriptsLintDir, 'tier-rank-direct-comparison-allowlist.json'), JSON.stringify({
      entries: [{ file: 'lib/grandfathered.js', line: 2, note: 'fixture' }],
    }));

    const output = execSync(`node "${LINT_SCRIPT}" --all --json`, { encoding: 'utf8', cwd: dir });
    const parsed = JSON.parse(output);
    rmSync(dir, { recursive: true, force: true });

    expect(parsed.violations).toEqual([]);
  });
});
