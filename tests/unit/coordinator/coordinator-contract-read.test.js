/**
 * SD-LEO-INFRA-ROLE-CONTRACT-READ-GATE-001 — FR-2 / TS-5.
 *
 * The coordinator was the only role whose contract fits in one read and the only role with NO
 * verifier of any kind; its priming requirement terminated in a self-attestation nothing checked.
 *
 * *** EVERY TEST HERE NAMES THE MUTATION THAT MUST BREAK IT. *** A check that can only ever report
 * "not read" is exactly as useless as one that can only report "read", so both directions are
 * asserted — the negative case alone would pass against a function that returns false unconditionally.
 */
import { describe, it, expect } from 'vitest';
import {
  checkCoordinatorContractRead,
  renderContractRead,
  COORDINATOR_CONTRACT_FILE,
} from '../../../scripts/coordinator-startup-check.mjs';

const REPO = process.cwd();

/** Inject session state directly rather than touching the real state file. */
const stateWith = (status) => () => ({ protocolFileReadStatus: { [COORDINATOR_CONTRACT_FILE]: status } });

describe('checkCoordinatorContractRead', () => {
  it('reports NOT read when session state has no record', () => {
    const c = checkCoordinatorContractRead(REPO, () => ({ protocolFileReadStatus: {} }));
    expect(c.contract_read).toBe(false);
    expect(c.contract_exists).toBe(true); // the file is really on disk in this repo

    // MUTATION: return contract_read true unconditionally -> fails.
  });

  it('reports READ when the tracker recorded a full read', () => {
    const c = checkCoordinatorContractRead(REPO, stateWith({ readCount: 1, lastReadWasPartial: false, lastReadAt: '2026-07-29T00:00:00Z' }));
    expect(c.contract_read).toBe(true);
    expect(c.contract_read_partial).toBe(false);
    expect(c.contract_last_read_at).toBe('2026-07-29T00:00:00Z');

    // MUTATION: return contract_read false unconditionally -> fails. This is the direction a
    // check-that-never-passes would silently break, and the negative test above cannot catch it.
  });

  it('distinguishes a PARTIAL read from a full one', () => {
    const c = checkCoordinatorContractRead(REPO, stateWith({ readCount: 1, lastReadWasPartial: true }));
    expect(c.contract_read).toBe(true);
    expect(c.contract_read_partial).toBe(true);

    // MUTATION: drop the lastReadWasPartial read -> partial collapses into "read", fails.
  });

  it('honours the legacy protocolFilesRead array shape', () => {
    const c = checkCoordinatorContractRead(REPO, () => ({ protocolFilesRead: [COORDINATOR_CONTRACT_FILE] }));
    expect(c.contract_read).toBe(true);
  });

  it('NEVER THROWS — startup must not be blocked by a broken state file', () => {
    // Fail-open is a hard contract here: a gate that stops a coordinator from starting because it
    // has not read the contract it is starting in order to read is a deadlock. The script's own
    // documented contract is "exit code is ALWAYS 0".
    expect(() => checkCoordinatorContractRead(REPO, () => { throw new Error('corrupt state'); })).not.toThrow();
    expect(checkCoordinatorContractRead(REPO, () => { throw new Error('corrupt'); }).contract_read).toBe(false);
    expect(() => checkCoordinatorContractRead(REPO, () => null)).not.toThrow();
    expect(() => checkCoordinatorContractRead(REPO, () => ({}))).not.toThrow();

    // MUTATION: remove the try/catch -> the throwing reader propagates and this fails.
  });
});

describe('renderContractRead', () => {
  it('says NO RECORD when unread', () => {
    const out = renderContractRead(REPO, { contract_file: COORDINATOR_CONTRACT_FILE, contract_exists: true, contract_read: false, contract_read_partial: false, contract_last_read_at: null });
    expect(out).toContain('NO RECORD');
    expect(out).not.toContain('✅ CLAUDE_COORDINATOR.md read');
  });

  it('confirms the read when present', () => {
    const out = renderContractRead(REPO, { contract_file: COORDINATOR_CONTRACT_FILE, contract_exists: true, contract_read: true, contract_read_partial: false, contract_last_read_at: '2026-07-29T00:00:00Z' });
    expect(out).toContain('✅');
    expect(out).not.toContain('NO RECORD');
  });

  it('flags a missing contract file distinctly from an unread one', () => {
    const out = renderContractRead(REPO, { contract_file: COORDINATOR_CONTRACT_FILE, contract_exists: false, contract_read: false, contract_read_partial: false, contract_last_read_at: null });
    expect(out).toContain('not found');
    expect(out).not.toContain('NO RECORD');

    // MUTATION: collapse the not-found branch into the unread branch -> "regenerate the file" advice
    // is replaced by "go read it", which is unactionable when it does not exist. Fails.
  });

  it('RENDERS the disarmed roles rather than leaving coverage to inference', () => {
    // Per-role arming's one real risk is someone assuming uniform coverage. The mitigation is that
    // the disarmed roles are printed, not implied.
    const out = renderContractRead(REPO, { contract_file: COORDINATOR_CONTRACT_FILE, contract_exists: true, contract_read: true, contract_read_partial: false, contract_last_read_at: null });
    expect(out).toContain('coordinator : ARMED');
    expect(out).toContain('adam        : disarmed');
    expect(out).toContain('solomon     : disarmed');

    // MUTATION: drop the per-role table -> a reader sees a green coordinator check and reasonably
    // infers all three roles are covered. Fails.
  });
});

describe('PROTOCOL_FILES tracking prerequisite', () => {
  it('the tracker knows about CLAUDE_COORDINATOR.md', async () => {
    // Without this the whole feature is inert: the coordinator could read its contract and the hook
    // would record nothing, leaving the check with nothing to consult. Verified end-to-end during
    // EXEC by driving the real hook and watching the banner flip from NO RECORD to read.
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../../../scripts/hooks/protocol-file-tracker.cjs', import.meta.url), 'utf8');
    expect(src).toContain("'CLAUDE_COORDINATOR.md'");

    // MUTATION: remove it from PROTOCOL_FILES -> reads go untracked and the check can never pass.
  });
});
