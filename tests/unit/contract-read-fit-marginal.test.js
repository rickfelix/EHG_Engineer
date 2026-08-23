// SD-LEO-INFRA-CONTRACT-READ-FIT-001 — a marginal fit prediction must read UNKNOWN, never PARTIAL.
//
// The defect: singleReadFit predicted CLAUDE_SOLOMON.md at 25,236 tokens (0.94% over the 25,000 cap,
// inside the byte model's own documented 6.80% max error) and returned a hard fits:false. The three
// role-activation consumers collapsed that to contract_read_partial = !verdict.fully_read, so every
// /solomon full read banner-ed "was PARTIAL (offset/limit used)" for a file that reads clean in one
// no-offset call — a prediction asserted as a measurement of the reader's behavior.
//
// These are BEHAVIORAL tests: they drive singleReadFit / contractReadVerdict directly, and the real
// solomon-register.checkContractRead + contractReadBanner end-to-end against temp project dirs. No
// source-pin slices (a positional slice is a guard whose subject moves).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');

const cov = require(path.join(repoRoot, 'lib/protocol/contract-read-coverage.cjs'));
const {
  singleReadFit, contractReadVerdict, SINGLE_READ_MARGIN_TOKENS, SINGLE_READ_TOKEN_CAP,
} = cov;
const scale = require(path.join(repoRoot, 'lib/protocol/harness-token-scale.cjs'));
const solomon = require(path.join(repoRoot, 'scripts/solomon-register.cjs'));

// Force the session-state resolver onto the LEGACY per-project path so the temp-dir tests are
// deterministic regardless of any ~/.claude-sessions registry on the running machine.
let prevSessionsOverride;
let tmpDirs = [];
beforeAll(() => {
  prevSessionsOverride = process.env.CLAUDE_SESSIONS_DIR_OVERRIDE;
  process.env.CLAUDE_SESSIONS_DIR_OVERRIDE = fs.mkdtempSync(path.join(os.tmpdir(), 'crf-empty-sessions-'));
});
afterAll(() => {
  if (prevSessionsOverride === undefined) delete process.env.CLAUDE_SESSIONS_DIR_OVERRIDE;
  else process.env.CLAUDE_SESSIONS_DIR_OVERRIDE = prevSessionsOverride;
  for (const d of tmpDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } }
});

/** Build a temp project dir with a CLAUDE_SOLOMON.md of the given byte size and a recorded read. */
function makeProjectDir(contractBytes, status) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crf-proj-'));
  tmpDirs.push(dir);
  // Prose-like filler so the density veto (cl100k on raw) stays well under the cap and the BYTE
  // prediction is what decides — the exact path this SD is about.
  const line = 'The coordinator reviews the contract and records the verdict for the fleet. ';
  let body = '';
  while (Buffer.byteLength(body, 'utf8') < contractBytes) body += line;
  fs.writeFileSync(path.join(dir, 'CLAUDE_SOLOMON.md'), body.slice(0, contractBytes), 'utf8');
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.claude', 'unified-session-state.json'),
    JSON.stringify({ protocolFileReadStatus: { 'CLAUDE_SOLOMON.md': status } }),
    'utf8',
  );
  return dir;
}

describe('FR-1: the fit predictor margin-bands near-cap predictions to fits:null', () => {
  it('a near-cap contract (the original 25,236-token defect size) reads fits:null with basis predicted_marginal, not a confident boolean', () => {
    // SD-LEO-INFRA-SOLOMON-ROLE-CONTRACT-001 (FR-6, second pass): this used to read the LIVE repo's
    // CLAUDE_SOLOMON.md directly — a fact-pin on that file's then-current size, not a test of the
    // predictor's behavior (PAT-TEST-PINS-FACT-NOT-BEHAVIOUR-001: would fail the moment the file it
    // pins moved, on EITHER side of the band, whether or not the predictor still behaves correctly).
    // Switched to the same synthetic-fixture pattern the rest of this file already uses, sized to the
    // file's own documented defect value (61013 B ~ 25,236 tokens, matching line ~140 below) so the
    // marginal band is exercised deterministically regardless of the live contract's real size.
    const dir = makeProjectDir(61013, { readCount: 1, lastReadWasPartial: false });
    const r = singleReadFit(dir, 'CLAUDE_SOLOMON.md');
    expect(r.fits).toBeNull();
    expect(r.basis).toBe('predicted_marginal');
    expect(r.evidence).toBe('predicted');
    // it is genuinely near the cap — the whole justification for calling it unknown
    expect(Math.abs(r.tokens - SINGLE_READ_TOKEN_CAP)).toBeLessThanOrEqual(SINGLE_READ_MARGIN_TOKENS);
  });

  it('a clearly-under contract (CLAUDE_PLAN.md) still reads fits:true', () => {
    const r = singleReadFit(repoRoot, 'CLAUDE_PLAN.md');
    expect(r.fits).toBe(true);
    expect(Math.abs(r.tokens - SINGLE_READ_TOKEN_CAP)).toBeGreaterThan(SINGLE_READ_MARGIN_TOKENS);
  });

  it('a genuinely-oversized contract still reads fits:false (the band does not swallow real over-cap)', () => {
    // ~75KB of prose -> ~31k predicted tokens, well past cap + band.
    const dir = makeProjectDir(75000, { readCount: 1, lastReadWasPartial: false });
    const r = singleReadFit(dir, 'CLAUDE_SOLOMON.md');
    expect(r.fits).toBe(false);
    expect(r.tokens - SINGLE_READ_TOKEN_CAP).toBeGreaterThan(SINGLE_READ_MARGIN_TOKENS);
  });

  it('the margin band is derived from the scale error fraction, not a hand-picked literal', () => {
    expect(SINGLE_READ_MARGIN_TOKENS).toBeCloseTo(SINGLE_READ_TOKEN_CAP * scale.HARNESS_TOKEN_MAX_ERROR_FRACTION, 6);
  });
});

describe('FR-2: contractReadVerdict.confirmed_partial is disproof-only, not mere inability-to-confirm', () => {
  const fitMarginal = { fits: null, basis: 'predicted_marginal', tokens: 25236 };
  const fitOver = { fits: false, basis: 'predicted_bytes', tokens: 31000 };

  it('a marginal fit with only a >=95% REQUESTED union reads unconfirmed, not confirmed_partial', () => {
    const status = { readCount: 2, lastReadWasPartial: false, ranges: [{ offset: 1, limit: 400 }], lastDelivered: null };
    const v = contractReadVerdict(status, 400, { singleReadFit: fitMarginal });
    expect(v.basis).toBe('requested_ranges_unconfirmed');
    expect(v.fully_read).toBe(false);
    expect(v.confirmed_partial).toBe(false);
  });

  it('a sub-95% REQUESTED union is positive disproof: confirmed_partial true', () => {
    const status = { readCount: 1, lastReadWasPartial: true, ranges: [{ offset: 1, limit: 100 }], lastDelivered: null };
    const v = contractReadVerdict(status, 400, { singleReadFit: fitOver });
    expect(v.basis).toBe('requested_ranges_incomplete');
    expect(v.confirmed_partial).toBe(true);
  });

  it('a no-offset read of a marginal contract lands in unknown_coverage, confirmed_partial false', () => {
    const status = { readCount: 1, lastReadWasPartial: false }; // no ranges, no delivered
    const v = contractReadVerdict(status, 400, { singleReadFit: fitMarginal });
    expect(v.basis).toBe('unknown_coverage');
    expect(v.confirmed_partial).toBe(false);
  });

  it('lastReadWasPartial === true is positive disproof even with no range evidence (offset/limit was used)', () => {
    // The reader deliberately used offset/limit. That flag is reliable in the TRUE direction (only a
    // silent truncation is unreliable, and that records FALSE), so it is confirmed_partial.
    const status = { readCount: 1, lastReadWasPartial: true };
    const v = contractReadVerdict(status, 400, { singleReadFit: fitMarginal });
    expect(v.basis).toBe('unknown_coverage');
    expect(v.confirmed_partial).toBe(true);
  });

  it('measured short delivery (delivered_ranges < 95%) is confirmed_partial true', () => {
    const status = {
      readCount: 1, lastReadWasPartial: false,
      deliveredRanges: [{ offset: 1, limit: 100 }], lastDelivered: { totalLines: 400, numLines: 100 },
    };
    const v = contractReadVerdict(status, 400, { singleReadFit: fitOver });
    expect(v.confirmed_partial).toBe(true);
  });
});

describe('FR-2 end-to-end: solomon-register stops asserting PARTIAL on the marginal file, still flags oversized', () => {
  it('a full no-offset read of the real-size (near-cap) CLAUDE_SOLOMON.md yields no PARTIAL banner', () => {
    const dir = makeProjectDir(61013, { readCount: 1, lastReadWasPartial: false, lastReadAt: '2026-08-10T00:00:00Z' });
    const check = solomon.checkContractRead(dir);
    expect(check.contract_read).toBe(true);
    expect(check.contract_read_partial).toBe(false);
    expect(solomon.contractReadBanner(check)).toBeNull();
  });

  it('a full no-offset read of a genuinely oversized CLAUDE_SOLOMON.md STILL banners (criterion #2)', () => {
    const dir = makeProjectDir(75000, { readCount: 1, lastReadWasPartial: false, lastReadAt: '2026-08-10T00:00:00Z' });
    const check = solomon.checkContractRead(dir);
    expect(check.contract_read).toBe(true);
    expect(check.contract_read_partial).toBe(true);
    expect(solomon.contractReadBanner(check)).toContain('READ REQUIRED');
  });
});
