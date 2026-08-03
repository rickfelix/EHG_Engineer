// SD-LEO-INFRA-SIGNAL-ROUTER-AUTO-001 — WIRING ASSERTIONS for the two ack-writers.
//
// WHY THIS FILE HAD TO EXIST. The exclusion in stale-session-sweep.cjs carries a comment saying
// "WITHOUT THIS THE ROUTER FIX IS INERT" — and deleting that line reddened NOTHING. The most
// load-bearing line in the change had zero regression protection, which is the same defect class
// the SD is about (a mechanism that looks enforced and is not), one level up.
//
// These are source assertions rather than behavioural ones because both call sites build a
// PostgREST query against a live table and this repo has no designated non-production database
// (the vitest `db` project is gated off). A source assertion is weaker than executing the query —
// it proves the guard is PRESENT, not that it FILTERS — so the filtering half is proven
// separately in promotion-ack.test.js against crafted row shapes. Neither half alone is enough.
//
// The pattern follows tests/unit/fleet/outstanding-signals.test.js:172-180, which pins wiring the
// same way.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (p) => readFileSync(path.join(REPO, p), 'utf8');

const sweep = read('scripts/stale-session-sweep.cjs');
const converge = read('lib/retention/session-coordination-ack-convergence.js');
const router = read('lib/coordinator/signal-router.cjs');
const detectors = read('lib/coordinator/detectors.cjs');

describe('every writer that stamps acknowledged_at excludes promotion-marked rows', () => {
  // Both passes are called from the same main() ~100 lines apart. The first was found at PLAN;
  // the second only because a reviewer enumerated the writers rather than assuming the first was
  // the only one. Guarding one and not the other leaves the fix self-reverting on a longer fuse.

  it('the STUCK-drain excludes them (one-hour fuse)', () => {
    expect(sweep).toContain('PROMOTION_ACK_KEY');
    expect(sweep).toMatch(/\.is\(`payload->>\$\{PROMOTION_ACK_KEY\}`, null\)/);
  });

  it('the STUCK-drain imports the key rather than re-spelling it', () => {
    // A literal string here would drift silently the day the key is renamed.
    expect(sweep).toMatch(/require\(['"]\.\.\/lib\/coordinator\/promotion-ack\.cjs['"]\)/);
    expect(sweep).not.toMatch(/\.is\(['"]payload->>promotion_ack['"]/);
  });

  it('the TTL convergence pass excludes them (fourteen-day fuse)', () => {
    expect(converge).toContain('PROMOTION_ACK_KEY');
    expect(converge).toMatch(/\.is\(`payload->>\$\{PROMOTION_ACK_KEY\}`, null\)/);
  });

  it('the TTL pass imports the key rather than re-spelling it', () => {
    expect(converge).toMatch(/promotion-ack\.cjs/);
    expect(converge).not.toMatch(/\.is\(['"]payload->>promotion_ack['"]/);
  });
});

describe('the router records provenance and does not dispose', () => {
  it('stampRouted does not write acknowledged_at', () => {
    // The behavioural proof is in signal-router.test.js (SR-16 asserts the update shape). This
    // catches the narrower regression of someone re-adding the column write to this function.
    const fn = router.slice(router.indexOf('async function stampRouted('), router.indexOf('async function aggregateSignals('));
    expect(fn).not.toMatch(/acknowledged_at/);
    expect(fn).toContain('buildPromotionAckPayload');
  });

  it('stampRouted still writes routed_to_feedback_id via the shared builder', () => {
    // Dropping the dedup key would re-promote every signal on every tick. The builder owns it,
    // so assert the builder is used rather than re-asserting the key here.
    expect(router).toMatch(/require\(['"]\.\/promotion-ack\.cjs['"]\)/);
  });

  it('the starvation gauge carves promotion-marked rows out of "answered"', () => {
    expect(detectors).toContain('isPromotionAcked');
    expect(detectors).toMatch(/routed_to_feedback_id\s*\)\s*&&\s*!isPromotionAcked\(sig\)/);
  });

  it('the docblock states the carve-out, so the contract is not documented-false', () => {
    // The stated contract used to read "answered = acknowledged_at set OR routed_to_feedback_id
    // set". Leaving that while changing the code would be worse than no docblock, because the
    // next reader trusts it.
    const doc = detectors.slice(detectors.indexOf('REPLY_STARVATION'), detectors.indexOf('function detectReplyStarvation'));
    expect(doc).toMatch(/promotion/i);
  });
});
