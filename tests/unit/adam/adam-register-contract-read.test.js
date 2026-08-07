// Contract-read verification on /adam startup (chairman directive 2026-06-10):
// adam-register.cjs must verify CLAUDE_ADAM.md was read THIS session via the same
// session-state the protocol-file-tracker hook writes for CLAUDE_LEAD/PLAN/EXEC,
// report the verdict in its JSON output, and print a READ REQUIRED banner when the
// read is missing or partial — WITHOUT ever blocking the role-tag write (an
// untagged Adam re-enters fleet accounting, the worse failure).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  checkContractRead,
  contractReadBanner,
  CONTRACT_FILE,
} = require('../../../scripts/adam-register.cjs');
const { contractReadVerdict, SINGLE_READ_SAFE_BYTES } = require('../../../lib/protocol/contract-read-coverage.cjs');

describe('adam-register contract-read verification', () => {
  let tmp;
  let prevOverride;

  let prevProjectDir;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'adam-contract-test-'));
    // Force the session-state resolver onto the legacy path (no session registry)
    prevOverride = process.env.CLAUDE_SESSIONS_DIR_OVERRIDE;
    process.env.CLAUDE_SESSIONS_DIR_OVERRIDE = path.join(tmp, 'no-sessions');

    // PIN THE PROJECT DIR TO THE FIXTURE, OR THESE TESTS READ THE REAL CONTRACT.
    // checkContractRead falls back to CLAUDE_PROJECT_DIR || process.cwd() for any path it does not
    // take from its argument. That fallback was harmless while the real CLAUDE_ADAM.md was 106KB —
    // comfortably over SINGLE_READ_SAFE_BYTES, so an over-cap fixture and the real file agreed.
    // SD-LEO-INFRA-ADAM-CONTRACT-READABLE-001 shrank it to ~45KB, which is UNDER that threshold, so
    // the two now disagree and the over-cap cases flip to "fits in one read" wherever the fallback
    // wins. It passed locally (CLAUDE_PROJECT_DIR set by the harness) and failed in CI (unset) —
    // an ambient-environment dependency that only became visible once the contract got small.
    prevProjectDir = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = tmp;
  });

  afterEach(() => {
    if (prevOverride === undefined) delete process.env.CLAUDE_SESSIONS_DIR_OVERRIDE;
    else process.env.CLAUDE_SESSIONS_DIR_OVERRIDE = prevOverride;
    if (prevProjectDir === undefined) delete process.env.CLAUDE_PROJECT_DIR;
    else process.env.CLAUDE_PROJECT_DIR = prevProjectDir;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const writeState = (state) => {
    const dir = path.join(tmp, '.claude');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'unified-session-state.json'), JSON.stringify(state));
  };

  it('reports missing contract file with a regenerate banner', () => {
    const c = checkContractRead(tmp);
    expect(c.contract_exists).toBe(false);
    expect(c.contract_read).toBe(false);
    expect(contractReadBanner(c)).toMatch(/regenerate/);
  });

  it('reports unread contract with a no-record banner', () => {
    fs.writeFileSync(path.join(tmp, CONTRACT_FILE), '# contract');
    const c = checkContractRead(tmp);
    expect(c.contract_exists).toBe(true);
    expect(c.contract_read).toBe(false);
    expect(contractReadBanner(c)).toMatch(/No record/);
  });

  it('passes (no banner) on a full read recorded in protocolFileReadStatus', () => {
    fs.writeFileSync(path.join(tmp, CONTRACT_FILE), '# contract');
    writeState({
      protocolFileReadStatus: {
        [CONTRACT_FILE]: { readCount: 1, lastReadAt: '2026-06-10T00:00:00Z', lastReadWasPartial: false },
      },
    });
    const c = checkContractRead(tmp);
    expect(c.contract_read).toBe(true);
    expect(c.contract_read_partial).toBe(false);
    expect(c.contract_last_read_at).toBe('2026-06-10T00:00:00Z');
    expect(contractReadBanner(c)).toBeNull();
  });

  it('flags a partial read with a PARTIAL banner', () => {
    fs.writeFileSync(path.join(tmp, CONTRACT_FILE), '# contract');
    writeState({
      protocolFileReadStatus: {
        [CONTRACT_FILE]: { readCount: 2, lastReadAt: '2026-06-10T00:00:00Z', lastReadWasPartial: true },
      },
    });
    const c = checkContractRead(tmp);
    expect(c.contract_read).toBe(true);
    expect(c.contract_read_partial).toBe(true);
    expect(contractReadBanner(c)).toMatch(/PARTIAL/);
  });

  // ── Legacy protocolFilesRead array: credit is CONDITIONED ON SIZE ──────────────────
  // These two cases were one test asserting "legacy array always means UNKNOWN completeness"
  // (SD-LEO-INFRA-ADAM-CONTRACT-READABLE-001 FR-0). That assertion did not survive review by the
  // sibling SD-LEO-INFRA-ROLE-CONTRACT-READ-GATE-001, and it was right to lose: marking a legacy
  // read of a SMALL contract partial fires a warning that can never be cleared, and a warning that
  // always fires gets demoted to noise — trading a false positive for a false negative is not a fix.
  // The invariant that actually matters is preserved below, and it is the over-cap case.

  it('credits a legacy-array read of a contract that fits in ONE Read as complete', () => {
    fs.writeFileSync(path.join(tmp, CONTRACT_FILE), '# contract');
    writeState({ protocolFilesRead: [CONTRACT_FILE] });
    const c = checkContractRead(tmp);
    expect(c.contract_read).toBe(true);
    expect(c.contract_read_partial).toBe(false);
    expect(c.contract_read_basis).toBe('legacy_array_single_read_safe');
    expect(contractReadBanner(c)).toBeNull();
  });

  // ── OVER-CAP VERDICT LOGIC — TESTED AGAINST THE PURE FUNCTION, DELIBERATELY ────────────────
  // These three previously went through checkContractRead(), which resolves a project dir AND a
  // session-state path from the environment. They passed locally and failed in CI with values that
  // matched neither fixture — coverage 35% where the fixture says 176/492 = 36% — i.e. the resolver
  // was reading REAL session state, not the temp one. That is ambient coupling, and it only became
  // visible when this SD shrank the real contract below SINGLE_READ_SAFE_BYTES so fixture and
  // reality stopped agreeing.
  //
  // The logic under test is contractReadVerdict, which is PURE. Calling it directly removes the
  // filesystem and the session-state resolver from cases that were never about either, and the
  // assertions get sharper rather than weaker. The file/state plumbing stays covered by the
  // checkContractRead cases above and below.
  const OVER_CAP = SINGLE_READ_SAFE_BYTES + 10000;

  it('refuses to call a legacy-array read of an OVER-CAP contract complete — it cannot know', () => {
    // The bare filename list records only THAT the file was read, never how much, so on a contract
    // past the cap it cannot distinguish a full read from a silently truncated one.
    const c = checkContractRead(tmp);
    expect(c.contract_read).toBe(false); // no state at all -> not read (sanity on the harness)

    const v = contractReadVerdict({ readCount: 1, lastReadWasPartial: false }, null, { sizeBytes: OVER_CAP });
    expect(v.read).toBe(true);
    expect(v.fully_read).toBe(false);
    expect(v.basis).toBe('unknown_coverage');
  });

  it('does not promote a harness-truncated read of an over-cap contract to "fully read"', () => {
    // A no-offset Read of an over-cap file carries no limit/offset, so it never enters ranges[] and
    // lastReadWasPartial is false — the read that did the LEAST once recorded as complete. With no
    // delivered evidence the verdict must fall through to "cannot say", never to "complete".
    const v = contractReadVerdict({ readCount: 1, lastReadWasPartial: false }, null, { sizeBytes: OVER_CAP });
    expect(v.fully_read).toBe(false);
    expect(v.basis).toBe('unknown_coverage');
  });

  it('sees a truncated read through DELIVERED LINES, and reports how much was covered', () => {
    // 176 of 492 lines is the real measurement taken on CLAUDE_ADAM.md before this SD shortened it,
    // and it must read as 36% covered rather than as a full read.
    const v = contractReadVerdict(
      { readCount: 1, lastReadWasPartial: false, lastDelivered: { startLine: 1, numLines: 176, totalLines: 492, coveredWholeFile: false } },
      null,
      { sizeBytes: OVER_CAP },
    );
    expect(v.fully_read).toBe(false);
    expect(v.basis).toBe('delivered_lines');
    // ROUNDING IS NOT THE SUBJECT. 176/492 is 35.77%, and this asserted toBe(36) — which pinned
    // Math.round. SD-LEO-INFRA-ROLE-CONTRACT-READ-GATE-001 has since rewritten this library to
    // floor, so the same correct behaviour now yields 35 and the test failed on the one detail it
    // never meant to constrain. What matters is that a third of a file does not read as complete.
    expect(v.coverage_pct).toBeGreaterThanOrEqual(35);
    expect(v.coverage_pct).toBeLessThanOrEqual(36);
  });

  it('a contract that FITS in one read is complete on the same evidence that is inconclusive over-cap', () => {
    // The discriminator is size, and this SD moved the real contract across it. Same status object,
    // opposite verdict — which is why the over-cap cases had to stop depending on the real file.
    const v = contractReadVerdict({ readCount: 1, lastReadWasPartial: false }, null, { sizeBytes: SINGLE_READ_SAFE_BYTES - 1 });
    expect(v.fully_read).toBe(true);
    expect(v.basis).toBe('single_read_safe_size');
  });

  it('fails open (not read, no throw) on corrupt session state', () => {
    fs.writeFileSync(path.join(tmp, CONTRACT_FILE), '# contract');
    const dir = path.join(tmp, '.claude');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'unified-session-state.json'), '{not json');
    const c = checkContractRead(tmp);
    expect(c.contract_read).toBe(false);
  });

  it('protocol-file-tracker tracks CLAUDE_ADAM.md (the producer side of this contract)', () => {
    const trackerSrc = fs.readFileSync(
      path.join(__dirname, '../../../scripts/hooks/protocol-file-tracker.cjs'),
      'utf8'
    );
    expect(trackerSrc).toMatch(/'CLAUDE_ADAM\.md'/);
  });

  it('adam-register never blocks the tag on the read check (no process.exit in checkContractRead path)', () => {
    const registerSrc = fs.readFileSync(
      path.join(__dirname, '../../../scripts/adam-register.cjs'),
      'utf8'
    );
    // The clean-shutdown contract: sockets closed, natural drain, no bare exit after I/O
    expect(registerSrc).toMatch(/getGlobalDispatcher\(\)\.close\(\)/);
    // checkContractRead is fail-open by construction — verify it is not wired to throw/exit
    expect(registerSrc).not.toMatch(/checkContractRead[\s\S]{0,200}process\.exit/);
  });
});
