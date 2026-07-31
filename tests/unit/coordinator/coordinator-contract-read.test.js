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
  roleArmingStates,
  COORDINATOR_CONTRACT_FILE,
} from '../../../scripts/coordinator-startup-check.mjs';
import { createRequire } from 'node:module';
const { SINGLE_READ_TOKEN_CAP } = createRequire(import.meta.url)('../../../lib/protocol/contract-read-coverage.cjs');

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
    // ALL THREE roles appear, each with an explicit verdict. The point is that a disarmed role is
    // PRINTED rather than left to inference from a green coordinator line.
    for (const role of ['coordinator', 'adam', 'solomon']) expect(out).toContain(role);
    expect(out).toContain('coordinator : ARMED');
    expect(out).toContain('adam        : disarmed');  // genuinely over cap, by ~569 tokens
    expect(out).toContain('solomon     : ARMED');     // 67KB but 15,965 tokens — it fits

    // *** THIS ASSERTION USED TO READ 'solomon : disarmed', AND THAT IS THE BUG IT WAS HIDING. ***
    // The byte proxy called a 67,501-byte contract unreadable; measured, it is 15,965 tokens and
    // reads in one call. The test had encoded the proxy's error as a REQUIREMENT, so the only way to
    // make the measurement correct was to change a test that was passing. A green test asserting a
    // false fact is worse than no test.
    //
    // MUTATION: drop the per-role table -> a reader sees a green coordinator check and reasonably
    // infers all three roles are covered. Fails.
    //
    // STILL NOT SUFFICIENT ON ITS OWN: it pins today's real files, so it would pass against a
    // hardcoded string table too. The arming CONDITION is proved by the roleArmingStates block
    // below, where the measurements are injected and the verdict is required to move.
  });
});

/**
 * SD success criterion: "Arming policy is decided and encoded as a condition, not as prose", with an
 * explicit NEGATIVE TEST that an over-cap contract leaves its role un-gated.
 *
 * Every test here INJECTS sizes. That is the whole point: a test that reads the real files can only
 * ever confirm today, and today is the one state a hardcoded table already gets right.
 */
describe('roleArmingStates — arming is measured, not asserted', () => {
  /** Inject a single-read fit per file; anything unnamed is over cap. */
  const fits = (m) => (file) => {
    const tokens = file in m ? m[file] : SINGLE_READ_TOKEN_CAP * 2;
    return { fits: tokens <= SINGLE_READ_TOKEN_CAP, tokens, bytes: tokens * 4, basis: 'measured_tokens' };
  };

  it('NEGATIVE: a role whose contract is over cap is NOT armed', () => {
    // The load-bearing negative from the SD's success criteria.
    const states = roleArmingStates(REPO, fits({ 'CLAUDE_ADAM.md': SINGLE_READ_TOKEN_CAP + 1 }));
    const adam = states.find((s) => s.role === 'adam');
    expect(adam.armed).toBe(false);
    expect(adam.reason).toContain('exceeds a single read');
    // The dependency is NAMED, so a reader knows what would change it.
    expect(adam.reason).toContain('SD-LEO-INFRA-ADAM-CONTRACT-READABLE-001');

    // MUTATION: treat fits!==true as armed / drop the cap -> arms an unreadable contract, fails.
  });

  it('POSITIVE: the same role ARMS ONCE ITS CONTRACT FITS — no code change, no redeploy', () => {
    // *** THE TEST THE OLD PROSE TABLE COULD NEVER HAVE PASSED. *** When
    // SD-LEO-INFRA-ADAM-CONTRACT-READABLE-001 lands and CLAUDE_ADAM.md drops under the cap, adam
    // must arm on its own. The previous implementation would have kept printing "disarmed" forever
    // and its test would have kept passing.
    const states = roleArmingStates(REPO, fits({ 'CLAUDE_ADAM.md': 1000 }));
    expect(states.find((s) => s.role === 'adam').armed).toBe(true);

    // MUTATION: restore the hardcoded 'adam : disarmed' string -> fails. This assertion is the
    // difference between a condition and a comment.
  });

  it('the boundary is exact and shared, not a second copy', () => {
    // Exactly at the cap arms; one token over does not.
    const at = roleArmingStates(REPO, fits({ 'CLAUDE_SOLOMON.md': SINGLE_READ_TOKEN_CAP }));
    const over = roleArmingStates(REPO, fits({ 'CLAUDE_SOLOMON.md': SINGLE_READ_TOKEN_CAP + 1 }));
    expect(at.find((s) => s.role === 'solomon').armed).toBe(true);
    expect(over.find((s) => s.role === 'solomon').armed).toBe(false);
  });

  it('an UNMEASURABLE contract is disarmed, never armed by default', () => {
    // Absence of evidence must not be promoted to compliance — the defect this SD exists to remove.
    // `fits: null` is the specific case: measurable file, unmeasurable readability.
    for (const bad of [null, undefined, { fits: null, tokens: null, bytes: null, basis: 'unmeasurable' }]) {
      const s = roleArmingStates(REPO, () => bad).find((x) => x.role === 'coordinator');
      expect(s.armed).toBe(false);
      expect(s.reason).toContain('cannot establish readability');
    }
    // A throwing fitter must also disarm rather than propagate: this is a fail-open startup path.
    const thrown = roleArmingStates(REPO, () => { throw new Error('stat failed'); });
    expect(thrown.every((s) => s.armed === false)).toBe(true);

    // MUTATION: default `armed` to true when the fit is unknown -> fails all four.
  });

  it('REAL FILES: arming follows measured TOKENS, not bytes — solomon fits despite being 67KB', () => {
    // *** THE REGRESSION THAT CAUGHT THE BYTE PROXY. *** CLAUDE_SOLOMON.md is 67,501 bytes — 2.7x
    // the old 25,000-ish byte bound — but only 15,965 tokens, so it reads in ONE call. The byte
    // proxy disarmed a role that could already comply. Asserted on the real files, because the
    // whole point is that the byte and token answers DISAGREE here.
    const byRole = Object.fromEntries(roleArmingStates(REPO).map((s) => [s.role, s]));
    expect(byRole.solomon.armed).toBe(true);
    expect(byRole.solomon.bytes).toBeGreaterThan(60000);   // big in bytes...
    expect(byRole.solomon.tokens).toBeLessThan(SINGLE_READ_TOKEN_CAP); // ...small in tokens
    expect(byRole.coordinator.armed).toBe(true);
    expect(byRole.adam.armed).toBe(false); // genuinely over, by ~569 tokens

    // MUTATION: revert to comparing bytes against any bound that admits the 25,587-byte coordinator
    // contract -> solomon (67,501 B) disarms and this fails. That was the shipped behaviour.
  });

  it('the RENDERED table reflects injected measurements rather than a fixed string', () => {
    // Closes the loop: the render path itself must be driven by the measurement, not merely
    // accompanied by it.
    const out = renderContractRead(
      REPO,
      { contract_file: COORDINATOR_CONTRACT_FILE, contract_exists: true, contract_read: true, contract_read_partial: false, contract_last_read_at: null },
      { fitter: fits({ 'CLAUDE_ADAM.md': 1000, 'CLAUDE_SOLOMON.md': 1000, 'CLAUDE_COORDINATOR.md': 999999 }) }
    );
    expect(out).toContain('adam        : ARMED');
    expect(out).toContain('solomon     : ARMED');
    expect(out).toContain('coordinator : disarmed'); // inverted vs reality, proving it is measured
  });
});

describe('SEC-F1 — the legacy-array branch must MEASURE, not assert', () => {
  /**
   * The branch used to hardcode basis 'legacy_array_single_read_safe' and leave
   * contract_read_partial at false, with a comment claiming parity with adam-register that did not
   * hold. A basis string NAMING a size check nobody ran. True only because the coordinator contract
   * happens to fit — the same defect removed one function below, reintroduced by the fix for it.
   */
  const legacy = () => () => ({ protocolFilesRead: [COORDINATOR_CONTRACT_FILE] });

  it('a legacy record for a contract that FITS is accepted as a full read', () => {
    const c = checkCoordinatorContractRead(REPO, legacy());
    expect(c.contract_read).toBe(true);
    expect(c.contract_read_partial).toBe(false);
    expect(c.contract_read_basis).toBe('legacy_array_single_read_safe');
  });

  it('the SAME legacy record is NOT a full read once the contract no longer fits', () => {
    // The discriminating half. Proved by differential execution in SECURITY review: on a synthetic
    // 100,000-byte contract the coordinator returned a green "read" while adam correctly returned
    // legacy_array_no_evidence for identical input.
    const c = checkCoordinatorContractRead(REPO, legacy(), { fit: { fits: false, tokens: 99999, bytes: 400000, basis: 'measured_tokens' } });
    expect(c.contract_read).toBe(true);           // a read did happen
    expect(c.contract_read_partial).toBe(true);   // ...but it cannot be called complete
    expect(c.contract_read_basis).toBe('legacy_array_no_evidence');

    // MUTATION: restore the hardcoded basis -> an over-cap contract reports green, fails.
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
