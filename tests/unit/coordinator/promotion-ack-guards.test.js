// SD-LEO-INFRA-SIGNAL-ROUTER-AUTO-001 — WIRING ASSERTIONS for the two ack-writers.
//
// WHY THIS FILE HAD TO EXIST. The exclusion in stale-session-sweep.cjs carries a comment saying
// "WITHOUT THIS THE ROUTER FIX IS INERT" — and deleting that line reddened NOTHING. The most
// load-bearing line in the change had zero regression protection, which is the same defect class
// the SD is about (a mechanism that looks enforced and is not), one level up.
//
// WHAT A SOURCE ASSERTION ACTUALLY PROVES — corrected, because the first version of this header
// overclaimed and that overclaim is the same documented-false shape the SD exists to close.
// It does NOT prove the guard is "present" in any operational sense. It proves CHARACTERS APPEAR
// IN A FILE. A reviewer defeated the first version four ways while these tests stayed green:
// comment the line out; delete the guard and bolt an identical `.is()` onto an unrelated query
// elsewhere in the same file; or leave the asserted line byte-identical and re-bind the import
// (`{ PROMOTION_ACK_SOURCE_KEY: PROMOTION_ACK_KEY }`) so it filters the WRONG KEY. A grep also
// cannot see the runtime death of the line it greps for.
//
// So the real proof moved: convergeAckTTL takes an injectable client and is now asserted
// BEHAVIOURALLY in tests/unit/retention/session-coordination-ack-convergence.test.js, which
// observes the filters actually applied. What remains here is the residue — call sites buried
// inside main() with no injection point — and for those the assertions now (a) strip comments,
// and (b) scope to the enclosing query block rather than matching file-globally.
//
// Pattern follows tests/unit/fleet/outstanding-signals.test.js:172-180.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
/**
 * Read source with COMMENT LINES STRIPPED.
 *
 * The first version of this file matched raw source, so commenting a guard out left the test
 * green — the regex happily matched the commented text. Stripping line comments closes that and
 * the "assert on the real line, not on prose describing it" property is what makes these
 * assertions mean anything at all.
 */
const read = (p) => readFileSync(path.join(REPO, p), 'utf8')
  .split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
/**
 * Raw source, comments intact — for the ONE assertion that is legitimately about prose.
 * Stripping comments is right for guard lines (a commented-out guard must not pass) and wrong for
 * a docblock-contract check, which has nothing but comments to assert on. Using the stripped
 * reader for both made the docblock test unsatisfiable; that is the reader, not the contract.
 */
const readRaw = (p) => readFileSync(path.join(REPO, p), 'utf8');

const sweep = read('scripts/stale-session-sweep.cjs');
const converge = read('lib/retention/session-coordination-ack-convergence.js');
const deadLetter = read('scripts/drain-dead-letter-coordination.mjs');
const router = read('lib/coordinator/signal-router.cjs');
const detectors = read('lib/coordinator/detectors.cjs');

describe('every writer that stamps acknowledged_at excludes promotion-marked rows', () => {
  // Both passes are called from the same main() ~100 lines apart. The first was found at PLAN;
  // the second only because a reviewer enumerated the writers rather than assuming the first was
  // the only one. Guarding one and not the other leaves the fix self-reverting on a longer fuse.

  it('the STUCK-drain excludes them (one-hour fuse), IN ITS OWN QUERY BLOCK', () => {
    // Scoped with slice() rather than matched file-globally: a file-global match is satisfied by
    // an identical .is() bolted onto any of the ~3800 other lines, which is how the first version
    // of this test was defeated.
    const block = sweep.slice(sweep.indexOf("eq('payload->>signal_type', 'stuck')"));
    const query = block.slice(0, block.indexOf('order('));
    expect(query).toMatch(/\.is\(`payload->>\$\{PROMOTION_ACK_KEY\}`, null\)/);
  });

  it('the STUCK-drain BINDS the real key, not just any identifier named like it', () => {
    // Asserting the import STATEMENT is not enough — `{ PROMOTION_ACK_SOURCE_KEY:
    // PROMOTION_ACK_KEY }` satisfies that while pointing the guard at the wrong column. Assert
    // the destructured NAME matches the exported name.
    expect(sweep).toMatch(/\{\s*PROMOTION_ACK_KEY\s*\}\s*=\s*require\([^)]*promotion-ack\.cjs[^)]*\)/);
    expect(sweep).not.toMatch(/\.is\(['"]payload->>promotion_ack['"]/);
  });

  it('the dead-letter drain excludes them (manual, but it stamps read_at too)', () => {
    // The worst of the three: one write blinds the inbox, the sender view, isRouterSwallowed
    // (needs !read_at) AND the starvation gauge (no auto_acked marker, so it reads as a HUMAN
    // answer). Manual-only is not a guard.
    expect(deadLetter).toMatch(/\{\s*PROMOTION_ACK_KEY\s*\}\s*=\s*createRequire\([^)]*\)\([^)]*promotion-ack\.cjs[^)]*\)/);
    expect(deadLetter).toMatch(/\.is\(`payload->>\$\{PROMOTION_ACK_KEY\}`, null\)/);
  });

  it('every guarded site binds the key from the single module', () => {
    // The count is knowledge, not a closed set — it said TWO until a reviewer found the third.
    for (const [name, src] of [['sweep', sweep], ['converge', converge], ['deadLetter', deadLetter]]) {
      expect(src, `${name} must import PROMOTION_ACK_KEY`).toMatch(/PROMOTION_ACK_KEY/);
    }
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
    const raw = readRaw('lib/coordinator/detectors.cjs');
    const doc = raw.slice(raw.indexOf('REPLY_STARVATION'), raw.indexOf('function detectReplyStarvation'));
    expect(doc).toMatch(/promotion/i);
  });
});
