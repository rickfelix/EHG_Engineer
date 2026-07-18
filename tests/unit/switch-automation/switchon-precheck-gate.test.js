/**
 * SD-LEO-INFRA-INTELLIGENT-SWITCH-AUTOMATION-001-B — switch-on authorization gate tests.
 *
 * Two mandatory proofs:
 *   GUARDRAIL-1 (WHAT is blocked): every NEVER_AUTO_CLASSES action + the 3 named
 *     irreversible production actions are hard-stopped + chairman-routed.
 *   GUARDRAIL-2 (that the block is STRUCTURAL, not advisory): a caller harness that
 *     only auto-proceeds when authorized===true never fires for a NEVER-AUTO request,
 *     DOES fire for a reversible request (positive control), and cannot be flipped by
 *     any opts permutation (no observe/advisory escape hatch).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  authorizeSwitchOn,
} from '../../../lib/switch-automation/switchon-precheck-gate.js';
import {
  NEVER_AUTO_CLASSES,
  SWITCHON_VERDICT,
} from '../../../lib/switch-automation/reversibility-classifier.js';

/** The 3 chairman-named irreversible production actions (GUARDRAIL-1 parity guard). */
const NAMED_IRREVERSIBLE_ACTIONS = [
  'live-venture-deploy',
  'live-payment-account-creation',
  'dns-mutation',
];

/** A fully-classified, mechanism-reversible, in-role, non-live-money request. */
function reversibleRequest() {
  return {
    component: 'ops-scheduler',
    action: 'enable-scheduler',
    reversible: true,
    inRole: true,
    isReversibleByMechanism: true,
  };
}

describe('authorizeSwitchOn — verdict → authorization mapping (FR-1 / TS-1)', () => {
  it('reversible request → authorized:true, route_to_chairman:false', () => {
    const r = authorizeSwitchOn(reversibleRequest());
    expect(r.authorized).toBe(true);
    expect(r.route_to_chairman).toBe(false);
    expect(r.verdict).toBe(SWITCHON_VERDICT.REVERSIBLE);
    expect(r.neverAuto).toBe(false);
  });

  it('consequential (rubric escalate, live-money) → authorized:false + route_to_chairman', () => {
    const r = authorizeSwitchOn({
      component: 'billing', action: 'enable-billing',
      reversible: true, inRole: true, isReversibleByMechanism: true, isLiveMoney: true,
    });
    expect(r.authorized).toBe(false);
    expect(r.route_to_chairman).toBe(true);
    expect(r.verdict).toBe(SWITCHON_VERDICT.CONSEQUENTIAL);
    expect(r.reason).toBe('consequential');
    expect(r.neverAuto).toBe(false);
  });

  it('unknown (missing action) → fail-closed: authorized:false + route_to_chairman', () => {
    const r = authorizeSwitchOn({ component: 'ops-scheduler' });
    expect(r.authorized).toBe(false);
    expect(r.route_to_chairman).toBe(true);
    expect(r.verdict).toBe(SWITCHON_VERDICT.UNKNOWN);
    expect(r.reason).toBe('fail-closed-unknown');
  });

  it('empty request object → fail-closed unknown (never auto-proceeds on no input)', () => {
    const r = authorizeSwitchOn({});
    expect(r.authorized).toBe(false);
    expect(r.route_to_chairman).toBe(true);
  });

  it('undefined request → fail-closed (total function, no throw)', () => {
    const r = authorizeSwitchOn(undefined);
    expect(r.authorized).toBe(false);
    expect(r.route_to_chairman).toBe(true);
  });
});

describe('GUARDRAIL-1 — every NEVER-AUTO action is hard-stopped + chairman-routed (FR-2 / TS-2)', () => {
  it('NEVER_AUTO_CLASSES is imported from the classifier (single SSOT, no hard-coded copy)', () => {
    // Sanity: the list is non-empty and includes the 3 named actions so the loop below
    // is genuinely exercising the chairman-ratified set, not an empty array.
    expect(Array.isArray(NEVER_AUTO_CLASSES)).toBe(true);
    expect(NEVER_AUTO_CLASSES.length).toBeGreaterThan(0);
    for (const named of NAMED_IRREVERSIBLE_ACTIONS) {
      expect(NEVER_AUTO_CLASSES).toContain(named);
    }
  });

  // Parity: iterate the FULL imported list so adding a class to child A's list is
  // automatically enforced here (regresses if any never-auto class ever authorizes).
  for (const action of NEVER_AUTO_CLASSES) {
    it(`NEVER-AUTO class "${action}" → authorized:false + route_to_chairman:true`, () => {
      // Deliberately pass otherwise-reversible signals — the NEVER-AUTO class must win.
      const r = authorizeSwitchOn({
        component: 'x', action,
        reversible: true, inRole: true, isReversibleByMechanism: true,
      });
      expect(r.authorized).toBe(false);
      expect(r.route_to_chairman).toBe(true);
      expect(r.neverAuto).toBe(true);
      expect(r.reason).toBe('never-auto');
    });
  }

  // Explicit parity guard for the 3 chairman-named actions (matches child A's
  // chairman-switchon-policy-migration.test.js GUARDRAIL-1 parity test): a silent
  // removal of a named class from NEVER_AUTO_CLASSES fails HERE.
  for (const action of NAMED_IRREVERSIBLE_ACTIONS) {
    it(`named irreversible action "${action}" is explicitly hard-stopped`, () => {
      const r = authorizeSwitchOn({
        component: 'x', action,
        reversible: true, inRole: true, isReversibleByMechanism: true,
      });
      expect(r.authorized).toBe(false);
      expect(r.route_to_chairman).toBe(true);
      expect(r.neverAuto).toBe(true);
    });
  }
});

/**
 * A thin caller harness representing the decision-path seam (child D's real op-co
 * fence-clearing will look like this): it ONLY invokes the auto-proceed callback when
 * authorizeSwitchOn(...).authorized === true. This is what makes the proof STRUCTURAL —
 * it asserts on the caller's observable outcome, not on the pure classifier verdict.
 */
function driveSwitchOn(request, autoProceedCb, opts) {
  const decision = authorizeSwitchOn(request, opts);
  if (decision.authorized === true) {
    autoProceedCb(request);
  }
  return decision;
}

describe('GUARDRAIL-2 — structural enforcement at the caller / anti-test-masking (FR-3)', () => {
  it('NEVER-AUTO request: auto-proceed callback is NEVER invoked (TS-3)', () => {
    const autoProceed = vi.fn();
    const decision = driveSwitchOn(
      { component: 'venture', action: 'live-venture-deploy', reversible: true, inRole: true, isReversibleByMechanism: true },
      autoProceed,
    );
    // Observable side effect absent — the switch-on did NOT proceed / fence NOT cleared.
    expect(autoProceed).not.toHaveBeenCalled();
    // And the gate return would fail this test if it had been ignored/logged-and-continued.
    expect(decision.authorized).toBe(false);
    expect(decision.route_to_chairman).toBe(true);
  });

  it('every named irreversible action is structurally hard-stopped at the caller', () => {
    for (const action of NAMED_IRREVERSIBLE_ACTIONS) {
      const autoProceed = vi.fn();
      driveSwitchOn(
        { component: 'x', action, reversible: true, inRole: true, isReversibleByMechanism: true },
        autoProceed,
      );
      expect(autoProceed, `auto-proceed must not fire for ${action}`).not.toHaveBeenCalled();
    }
  });

  it('POSITIVE CONTROL: reversible request DOES invoke auto-proceed (gate is load-bearing, not always-false) (TS-4)', () => {
    const autoProceed = vi.fn();
    const decision = driveSwitchOn(reversibleRequest(), autoProceed);
    expect(autoProceed).toHaveBeenCalledTimes(1);
    expect(decision.authorized).toBe(true);
  });

  it('NO opts/flag permutation flips a NEVER-AUTO request to authorized / auto-proceed (TS-5)', () => {
    // Throw every plausible "advisory/observe/off/bypass" flag shape at the gate.
    const optsPermutations = [
      undefined,
      {},
      { mode: 'off' },
      { mode: 'observe' },
      { mode: 'enforce' },
      { enforce: false },
      { advisory: true },
      { bypass: true },
      { override: true },
      { force: true },
      { authorized: true },
      { route_to_chairman: false },
      { neverAuto: false },
      { allow: true, skip_chairman: true },
    ];
    for (const action of NAMED_IRREVERSIBLE_ACTIONS) {
      for (const opts of optsPermutations) {
        const autoProceed = vi.fn();
        const decision = driveSwitchOn(
          { component: 'x', action, reversible: true, inRole: true, isReversibleByMechanism: true },
          autoProceed,
          opts,
        );
        const label = `${action} + opts=${JSON.stringify(opts)}`;
        expect(decision.authorized, `authorized must stay false for ${label}`).toBe(false);
        expect(decision.route_to_chairman, `must route to chairman for ${label}`).toBe(true);
        expect(autoProceed, `auto-proceed must not fire for ${label}`).not.toHaveBeenCalled();
      }
    }
  });

  it('opts cannot flip a fail-closed UNKNOWN request to authorized either', () => {
    for (const opts of [{ mode: 'off' }, { bypass: true }, { authorized: true }]) {
      const autoProceed = vi.fn();
      const decision = driveSwitchOn({ component: 'x' /* action missing */ }, autoProceed, opts);
      expect(decision.authorized).toBe(false);
      expect(autoProceed).not.toHaveBeenCalled();
    }
  });
});

/**
 * COND-2 (TESTING) — the 3 DEFENSIVE fail-closed branches of authorizeSwitchOn are
 * unreachable through the real (total) classifier, so we force them by mocking
 * classifySwitchOn. These are the gate's error-safety net; they MUST fail closed.
 *
 * The gate imports classifySwitchOn via a static ESM import, so we mock the classifier
 * MODULE with vi.doMock (non-hoisted, scoped) + vi.resetModules and load the gate via a
 * fresh dynamic import per case. A PARTIAL mock (importActual) keeps SWITCHON_VERDICT and
 * NEVER_AUTO_CLASSES real so the gate's switch/case labels stay defined — only
 * classifySwitchOn's behavior is overridden. The top-of-file static-import tests above are
 * unaffected: vi.doMock only intercepts imports issued AFTER it, and resetModules is undone
 * in afterEach — so the prior 66 tests keep using the real classifier.
 */
const CLASSIFIER_PATH = '../../../lib/switch-automation/reversibility-classifier.js';

describe('COND-2 — defensive fail-closed branches (classifier mocked to force them)', () => {
  afterEach(() => {
    vi.doUnmock(CLASSIFIER_PATH);
    vi.resetModules();
    vi.restoreAllMocks();
  });

  // Load a fresh gate whose classifySwitchOn is replaced by `impl`; SWITCHON_VERDICT and
  // NEVER_AUTO_CLASSES remain the real exports (partial mock).
  async function loadGateWithClassifier(impl) {
    vi.resetModules();
    vi.doMock(CLASSIFIER_PATH, async () => {
      const actual = await vi.importActual(CLASSIFIER_PATH);
      return { ...actual, classifySwitchOn: impl, default: impl };
    });
    const mod = await import('../../../lib/switch-automation/switchon-precheck-gate.js');
    return mod.authorizeSwitchOn;
  }

  // Caller-harness proof (GUARDRAIL-2 pattern): auto-proceed fires only on authorized===true.
  function driveWith(authorize, request) {
    const autoProceed = vi.fn();
    const decision = authorize(request);
    if (decision.authorized === true) autoProceed(request);
    return { decision, autoProceed };
  }

  it('classifier THROWS → fail-closed-error, hard-stop, no auto-proceed (try/catch path)', async () => {
    const authorize = await loadGateWithClassifier(() => { throw new Error('boom'); });
    const { decision, autoProceed } = driveWith(authorize, { component: 'x', action: 'enable-scheduler' });
    expect(decision.authorized).toBe(false);
    expect(decision.route_to_chairman).toBe(true);
    expect(decision.reason).toBe('fail-closed-error');
    expect(autoProceed).not.toHaveBeenCalled();
  });

  it('classifier returns MALFORMED result (no string verdict) → fail-closed-error, no auto-proceed', async () => {
    for (const bad of [{}, { verdict: 123 }, null, undefined]) {
      const authorize = await loadGateWithClassifier(() => bad);
      const { decision, autoProceed } = driveWith(authorize, { component: 'x', action: 'enable-scheduler' });
      expect(decision.authorized, `malformed=${JSON.stringify(bad)}`).toBe(false);
      expect(decision.route_to_chairman).toBe(true);
      expect(decision.reason).toBe('fail-closed-error');
      expect(autoProceed).not.toHaveBeenCalled();
      vi.doUnmock(CLASSIFIER_PATH);
    }
  });

  it('classifier returns UNEXPECTED verdict string → fail-closed hard-stop, no auto-proceed (switch default)', async () => {
    const authorize = await loadGateWithClassifier(() => ({ verdict: 'bogus-verdict', neverAuto: false }));
    const { decision, autoProceed } = driveWith(authorize, { component: 'x', action: 'enable-scheduler' });
    expect(decision.authorized).toBe(false);
    expect(decision.route_to_chairman).toBe(true);
    expect(decision.reason).toBe('fail-closed-error');
    expect(autoProceed).not.toHaveBeenCalled();
  });

  it('SANITY: with the real classifier restored, a reversible request still authorizes (mock did not leak)', async () => {
    vi.resetModules();
    const mod = await import('../../../lib/switch-automation/switchon-precheck-gate.js');
    const r = mod.authorizeSwitchOn({
      component: 'ops-scheduler', action: 'enable-scheduler',
      reversible: true, inRole: true, isReversibleByMechanism: true,
    });
    expect(r.authorized).toBe(true);
  });
});
