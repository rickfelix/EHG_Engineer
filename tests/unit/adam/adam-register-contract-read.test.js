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

describe('adam-register contract-read verification', () => {
  let tmp;
  let prevOverride;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'adam-contract-test-'));
    // Force the session-state resolver onto the legacy path (no session registry)
    prevOverride = process.env.CLAUDE_SESSIONS_DIR_OVERRIDE;
    process.env.CLAUDE_SESSIONS_DIR_OVERRIDE = path.join(tmp, 'no-sessions');
  });

  afterEach(() => {
    if (prevOverride === undefined) delete process.env.CLAUDE_SESSIONS_DIR_OVERRIDE;
    else process.env.CLAUDE_SESSIONS_DIR_OVERRIDE = prevOverride;
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

  it('refuses to call a legacy-array read of an OVER-CAP contract complete — it cannot know', () => {
    // THE CASE THIS SD EXISTS FOR. The bare filename list records only THAT the file was read,
    // never how much, so on a contract past the 25k-token cap it cannot distinguish a full read
    // from a silently truncated one. Absence of a partial flag is not evidence of a complete read.
    fs.writeFileSync(path.join(tmp, CONTRACT_FILE), 'x'.repeat(60000)); // > SINGLE_READ_SAFE_BYTES
    writeState({ protocolFilesRead: [CONTRACT_FILE] });
    const c = checkContractRead(tmp);
    expect(c.contract_read).toBe(true);
    expect(c.contract_read_partial).toBe(true);
    expect(c.contract_read_basis).toBe('legacy_array_no_evidence');
    expect(contractReadBanner(c)).toContain('PARTIAL');
  });

  it('does not promote a harness-truncated read of an over-cap contract to "fully read"', () => {
    // A no-offset Read of an over-cap file is truncated by the harness: it carries no limit/offset,
    // so it never enters ranges[], and lastReadWasPartial is false — the read that did the LEAST
    // used to be recorded complete. With no delivered-line evidence the verdict must fall through
    // to "cannot say", never to "complete".
    fs.writeFileSync(path.join(tmp, CONTRACT_FILE), 'x'.repeat(60000));
    writeState({
      protocolFileReadStatus: {
        [CONTRACT_FILE]: { readCount: 1, lastReadAt: new Date().toISOString(), lastReadWasPartial: false },
      },
    });
    const c = checkContractRead(tmp);
    expect(c.contract_read).toBe(true);
    expect(c.contract_read_partial).toBe(true);
    expect(c.contract_read_basis).toBe('unknown_coverage');
  });

  it('sees a truncated read through DELIVERED LINES, and reports how much was covered', () => {
    // The signal that survives: tool_response numLines/totalLines. 176 of 492 lines is the real
    // measurement taken on CLAUDE_ADAM.md, and it must read as 36% covered, not as a full read.
    fs.writeFileSync(path.join(tmp, CONTRACT_FILE), 'x'.repeat(60000));
    writeState({
      protocolFileReadStatus: {
        [CONTRACT_FILE]: {
          readCount: 1,
          lastReadAt: new Date().toISOString(),
          lastReadWasPartial: false,
          lastDelivered: { startLine: 1, numLines: 176, totalLines: 492, coveredWholeFile: false },
        },
      },
    });
    const c = checkContractRead(tmp);
    expect(c.contract_read_partial).toBe(true);
    expect(c.contract_read_basis).toBe('delivered_lines');
    expect(c.contract_coverage_pct).toBe(36);
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
