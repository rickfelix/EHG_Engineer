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
const { SINGLE_READ_TOKEN_CAP, SINGLE_READ_TOKEN_BUDGET } = createRequire(import.meta.url)('../../../lib/protocol/contract-read-coverage.cjs');

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
    // ALL THREE roles appear, each with an EXPLICIT verdict. That is the whole point of the table:
    // a disarmed role is PRINTED rather than left to inference from a green coordinator line.
    //
    // *** DELIBERATELY ASSERTS THE SHAPE, NOT WHICH ROLES ARE ARMED TODAY. *** An earlier version
    // required `adam : disarmed` and `solomon : ARMED` against the live contracts. Both are true
    // right now and neither is a requirement: SD-LEO-INFRA-ADAM-CONTRACT-READABLE-001 exists to
    // bring CLAUDE_ADAM.md under the budget, and on the day it succeeds adam arms CORRECTLY and the
    // old assertion fails with nothing wrong. This is the fourth time that shape has appeared in
    // this SD — including in the very sibling file cleaned up this round, which is how it survived:
    // the cleanup was applied to one file and not the other.
    for (const role of ['coordinator', 'adam', 'solomon']) {
      expect(out).toMatch(new RegExp(`${role}\\s+: (ARMED|disarmed) — .+`));
    }
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
  /**
   * Inject a single-read fit per file; anything unnamed is over budget.
   *
   * *** USES THE BUDGET, NOT THE CAP, AND THAT WAS THE SIXTH FACT-PINNED DEFECT IN THIS SD. ***
   * This injector previously computed `fits: tokens <= SINGLE_READ_TOKEN_CAP` (25,000) while
   * production `singleReadFit` uses SINGLE_READ_TOKEN_BUDGET (22,500) — a 2,500-token divergence.
   * So the block below modelled a boundary the code does not have, and the file carried TWO arming
   * boundaries for one concept, the correct one appearing twenty lines later.
   *
   * It survived five review rounds because the previous five pins were on FILE SIZES; this one is a
   * pin on a CONSTANT — the same class one level of indirection up, which is not what anyone was
   * scanning for.
   */
  const fits = (m) => (file) => {
    const tokens = file in m ? m[file] : SINGLE_READ_TOKEN_BUDGET * 2;
    return { fits: tokens <= SINGLE_READ_TOKEN_BUDGET, tokens, bytes: tokens * 4, basis: 'measured_tokens' };
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

  it('roleArmingStates passes a fit verdict through faithfully, in both directions', () => {
    /**
     * *** RENAMED, BECAUSE THE OLD TITLE — "the boundary is exact and shared, not a second copy" —
     * WAS FALSE OF THIS TEST. *** It injected the boundary it then asserted, so it was tautological
     * with respect to the real bound and could never have detected a production change. That is
     * exactly why the BUDGET->CAP mutant survived every test until the synthetic band test was added
     * in the sibling file.
     *
     * What this CAN honestly prove is narrower and still worth having: roleArmingStates neither
     * inverts nor overrides a fit verdict handed to it. The bound itself is tested where it can be
     * tested for real — "THE MARGIN IS APPLIED" in tests/unit/protocol/contract-read-coverage.test.js,
     * which builds a contract into the band between budget and cap and measures it.
     */
    const at = roleArmingStates(REPO, fits({ 'CLAUDE_SOLOMON.md': SINGLE_READ_TOKEN_BUDGET }));
    const over = roleArmingStates(REPO, fits({ 'CLAUDE_SOLOMON.md': SINGLE_READ_TOKEN_BUDGET + 1 }));
    expect(at.find((s) => s.role === 'solomon').armed).toBe(true);
    expect(over.find((s) => s.role === 'solomon').armed).toBe(false);

    // MUTATION: ignore fit.fits and re-derive arming here -> a second bound appears and one of these
    // two fails. The point of the pair is that BOTH directions are carried through untouched.
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

  it('REAL FILES: every role is measured, and armed follows the measurement', () => {
    /**
     * *** ASSERTS THE RULE, NOT TODAY'S ANSWERS. *** This test previously required
     * `solomon.armed === true`, `solomon.bytes > 60000` and `adam.armed === false` against the live
     * contracts. All three are true today and none is a requirement — trimming either contract is
     * desirable, and one is an active sibling SD, so the test would have failed on success.
     *
     * What must hold forever is that `armed` is DERIVED from the measurement rather than stated:
     * every role reports a real token count, and its armed flag agrees with that count against the
     * budget. If a contract shrinks, the role arms and this still passes.
     */
    for (const s of roleArmingStates(REPO)) {
      expect(s.tokens).toBeGreaterThan(0);
      expect(s.armed).toBe(s.tokens <= SINGLE_READ_TOKEN_BUDGET);
      expect(s.reason).toContain('token');
    }

    // MUTATION: hardcode any role's verdict, or compare bytes instead of tokens -> armed stops
    // agreeing with tokens and this fails.
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
