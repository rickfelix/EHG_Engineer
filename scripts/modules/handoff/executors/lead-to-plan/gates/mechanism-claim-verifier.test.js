/**
 * QF-20260727-982 — an endorsement chain is not evidence.
 *
 * The founding case, reproduced as the first test: a spine asserting a mechanism about
 * lib/worktree-quota.js / countActiveWorktrees(), carrying four endorsements and zero citations.
 * That SD passed acceptance. It should not have.
 */
import { describe, it, expect } from 'vitest';
import { validateMechanismClaims, findMechanismClaims, createMechanismClaimVerifierGate } from './mechanism-claim-verifier.js';

const THE_CLAIM =
  'countActiveWorktrees() in lib/worktree-quota.js counts directories, so the quota ratchets one '
  + 'direction only and every EPERM reap permanently burns a slot that nothing can reclaim.';

describe('the founding case: four endorsements, zero citations', () => {
  it('FAILS a spine that names a file and a function with no verifier', () => {
    // Backwards, as it happens — the function returns git REGISTRATIONS, not directories. Nobody
    // had opened it. This gate does not know the claim is wrong; it knows nobody cited reading it.
    const r = validateMechanismClaims({ description: THE_CLAIM });
    expect(r.pass).toBe(false);
    expect(r.issues[0]).toMatch(/MECHANISM_CLAIM_UNVERIFIED/);
    expect(r.issues[0]).toMatch(/worktree-quota\.js/);
  });

  it('PASSES once a name and a file:line are recorded', () => {
    const r = validateMechanismClaims({
      description: THE_CLAIM,
      metadata: { mechanism_verifications: [{ verified_by: 'Adam', verified_at: 'lib/worktree-quota.js:47' }] }
    });
    expect(r.pass).toBe(true);
  });

  it('accepts the inline prose form, so citing needs no metadata edit', () => {
    const r = validateMechanismClaims({
      description: `${THE_CLAIM} — verified at lib/worktree-quota.js:47 by Adam`
    });
    expect(r.pass).toBe(true);
  });
});

describe('a boolean is a convention with extra steps — it is not accepted', () => {
  it('REJECTS verified_by/verified_at set to booleans', () => {
    // The whole point of demanding a file:line. Anyone can set true; almost nobody invents a
    // plausible line number for a function they never opened.
    const r = validateMechanismClaims({
      description: THE_CLAIM,
      metadata: { mechanism_verifications: [{ verified_by: true, verified_at: true }] }
    });
    expect(r.pass).toBe(false);
  });

  it('REJECTS a name with no citation — that is an endorsement, the thing that failed', () => {
    const r = validateMechanismClaims({
      description: THE_CLAIM,
      metadata: { mechanism_verifications: [{ verified_by: 'Solomon', verified_at: 'lib/worktree-quota.js' }] }
    });
    expect(r.pass).toBe(false); // a bare filename is not proof anyone opened it
  });

  it('REJECTS a citation with no name — nobody is accountable for it', () => {
    const r = validateMechanismClaims({
      description: THE_CLAIM,
      metadata: { mechanism_verifications: [{ verified_by: '   ', verified_at: 'lib/worktree-quota.js:47' }] }
    });
    expect(r.pass).toBe(false);
  });
});

describe('scoped to spines that actually assert a mechanism', () => {
  it('leaves an SD alone when it names no file+function — nothing to cite', () => {
    const r = validateMechanismClaims({ description: 'Improve onboarding copy and tighten the empty state.' });
    expect(r.pass).toBe(true);
    expect(r.details.claims).toHaveLength(0);
  });

  it('does NOT treat a file and a distant function as one claim', () => {
    // Proximity is the discriminator. Whole-text co-occurrence would fire on any long SD that
    // happens to mention a path somewhere and a call somewhere else — the false-positive that
    // would get this gate switched off within a week.
    const far = `We will touch lib/worktree-quota.js this quarter.${' filler.'.repeat(80)}Then callSomething() later.`;
    expect(findMechanismClaims(far)).toHaveLength(0);
  });

  it('reads the whole spine, not just description', () => {
    const r = validateMechanismClaims({ key_changes: [THE_CLAIM] });
    expect(r.pass).toBe(false);
  });
});

describe('grandfather cutoff: teeth for new spines, a warning for the standing backlog', () => {
  // Measured, not assumed: 17 of 28 live SDs assert a mechanism and ZERO cite one. Blocking on day
  // one would have wedged 61% of the active population — and a gate that bricks the fleet on
  // landing gets switched off permanently, which buys nothing.
  const CUTOFF = Date.parse('2026-07-28T00:00:00Z');

  it('WARNS but does not block an SD authored before the cutoff', () => {
    const r = validateMechanismClaims({ description: THE_CLAIM, created_at: '2026-07-01T00:00:00Z' });
    expect(r.pass).toBe(true);
    expect(r.details.grandfathered).toBe(true);
    expect(r.warnings[0]).toMatch(/MECHANISM_CLAIM_UNVERIFIED/); // still says it, still visible
  });

  it('BLOCKS an SD authored after the cutoff — same predicate, different verdict', () => {
    const r = validateMechanismClaims({ description: THE_CLAIM, created_at: '2026-08-01T00:00:00Z' });
    expect(r.pass).toBe(false);
    expect(r.details.grandfathered).toBe(false);
  });

  it('BLOCKS when created_at is absent — an undated spine is not grandfathered by default', () => {
    // Fail-closed on the rollout axis too: missing provenance must not buy an exemption.
    expect(validateMechanismClaims({ description: THE_CLAIM }).pass).toBe(false);
  });

  it('a cited pre-cutoff SD passes cleanly, not merely grandfathered', () => {
    const r = validateMechanismClaims({
      description: `${THE_CLAIM} — verified at lib/worktree-quota.js:47 by Adam`,
      created_at: '2026-07-01T00:00:00Z'
    });
    expect(r.pass).toBe(true);
    expect(r.details.grandfathered).toBeUndefined(); // passed on evidence, not on age
    expect(CUTOFF).toBeGreaterThan(0);
  });
});

describe('gate wiring', () => {
  it('is BLOCKING — acceptance is where the record becomes load-bearing', () => {
    expect(createMechanismClaimVerifierGate().required).toBe(true);
  });

  it('honours the kill-switch so a bad heuristic cannot wedge the fleet', async () => {
    const gate = createMechanismClaimVerifierGate();
    process.env.LEO_DISABLE_MECHANISM_VERIFIER_GATE = '1';
    try {
      const r = await gate.validator({ sd: { description: THE_CLAIM } });
      expect(r.pass).toBe(true);
      expect(r.warnings[0]).toMatch(/BYPASSED/);
    } finally {
      delete process.env.LEO_DISABLE_MECHANISM_VERIFIER_GATE;
    }
  });

  it('still fails after the kill-switch is cleared — the bypass is not sticky', async () => {
    const r = await createMechanismClaimVerifierGate().validator({ sd: { description: THE_CLAIM } });
    expect(r.pass).toBe(false);
  });
});
