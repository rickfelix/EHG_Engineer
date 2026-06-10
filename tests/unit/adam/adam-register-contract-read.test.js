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

  it('accepts the legacy protocolFilesRead array as evidence', () => {
    fs.writeFileSync(path.join(tmp, CONTRACT_FILE), '# contract');
    writeState({ protocolFilesRead: [CONTRACT_FILE] });
    const c = checkContractRead(tmp);
    expect(c.contract_read).toBe(true);
    expect(contractReadBanner(c)).toBeNull();
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
