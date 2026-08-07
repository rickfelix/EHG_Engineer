/**
 * SD-LEO-INFRA-ROLE-CONTRACT-READ-GATE-001 — FR-1 regression guard.
 *
 * *** THIS FILE EXISTS BECAUSE THE HIGHEST-SEVERITY FIX IN THE SD HAD NO TEST THAT COULD CATCH ITS
 * REGRESSION. *** TESTING re-ran my mutations independently and found that restoring
 * markProtocolFileRead() in the PASS_FALLBACK branch — reintroducing the exact self-falsifying defect
 * FR-1 fixes — produced ZERO failures across every reachable test. Two compounding reasons:
 *
 *   1. tests/unit/protocol-file-read-gate.test.js is QUARANTINED (order-dependent flake, unrelated to
 *      this SD) and skips SILENTLY even when named directly on the CLI — `vitest run <that file>`
 *      reports "No test files found". A regression net that cannot run is not a net.
 *   2. Its closest case ("fallback-pass then tracked-pass") calls markProtocolFileRead ITSELF before
 *      asserting, so it cannot distinguish the gate writing the record from the test writing it.
 *
 * WHAT THIS TEST IS, STATED PLAINLY: a source-level assertion, not a behavioural one. That is weaker
 * than driving the gate, and it is deliberate — the behavioural path is quarantined and this file
 * lives outside that manifest so it actually executes. It catches the specific regression that
 * matters: someone re-adding the write to the fallback branch. It would NOT catch a semantically
 * equivalent write introduced by another name, and I am not claiming otherwise.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const GATE = new URL('../../../scripts/modules/handoff/gates/protocol-file-read-gate.js', import.meta.url);
const src = readFileSync(GATE, 'utf8');

/**
 * Strip comments before checking for a call.
 *
 * *** THE FIRST VERSION OF THIS GUARD FAILED ON ITS OWN FIX. *** It matched the COMMENT explaining
 * that markProtocolFileRead used to be called here — decoration, not code. A check that cannot tell
 * an explanation from an invocation is not a check. That false failure was still useful: reading why
 * it fired surfaced a SECOND site with the identical real defect, in the cross-mode branch.
 */
function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/** The PASS_FALLBACK branch: from the fileExists check to the cross-mode section. */
function fallbackBranch() {
  const start = src.indexOf('if (fileExists) {');
  expect(start, 'PASS_FALLBACK branch not found — this guard is anchored to it').toBeGreaterThan(-1);
  const end = src.indexOf('// SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-030', start);
  expect(end, 'end of PASS_FALLBACK branch not found').toBeGreaterThan(start);
  return stripComments(src.slice(start, end));
}

/** The cross-mode DIGEST fallback — the second site, missed on the first pass. */
function crossModeBranch() {
  const start = src.indexOf('if (fullFileExists) {');
  expect(start, 'cross-mode fallback not found').toBeGreaterThan(-1);
  const end = src.indexOf('PASS_CROSS_MODE_FALLBACK', start);
  return stripComments(src.slice(start, end + 400));
}

describe('FR-1: the fallback must not write a read record it never observed', () => {
  it('PASS_FALLBACK does NOT call markProtocolFileRead', () => {
    // The defect: a file that was never read got stamped as read, so every later handoff passed
    // legitimately on evidence the gate had manufactured — and the failure could not be reproduced,
    // because the first run destroyed its own precondition.
    expect(fallbackBranch()).not.toContain('markProtocolFileRead');

    // MUTATION THAT MUST BREAK THIS: re-add markProtocolFileRead(requiredFile) inside the
    // `if (fileExists)` branch. TESTING verified that mutation is caught by nothing else.
  });

  it('the fallback still records that no read was observed', () => {
    const branch = fallbackBranch();
    // Passing without a read is acceptable; passing SILENTLY, or recording a read, is not.
    expect(branch).toContain('read_observed: false');
    expect(branch).toContain('session_state_written: false');
    expect(branch).toMatch(/NO READ OBSERVED/);

    // MUTATION: drop the read_observed flag -> a log consumer can no longer separate "passed on a
    // read" from "passed without one", which is the whole point of leaving the pass in place.
  });

  it('markProtocolFileRead still exists and is still used elsewhere', () => {
    // Guards against the lazy fix: deleting the function entirely rather than removing this one
    // call. It is legitimately used on the real read path.
    expect(src).toContain('markProtocolFileRead');
  });
});

describe('FR-1 SECOND SITE: the cross-mode DIGEST fallback had the identical defect', () => {
  /**
   * Missed on the first pass. I fixed PASS_FALLBACK and shipped, leaving the same self-falsifying
   * stamp one screen down in the cross-mode branch — arguably worse there, because it marks the
   * DIGEST file as read on the strength of the FULL file merely existing, so the record names a file
   * nobody opened in either form. Surfaced only because the guard above failed for the WRONG reason
   * and I read why instead of adjusting the anchor.
   */
  it('PASS_CROSS_MODE_FALLBACK does NOT call markProtocolFileRead', () => {
    expect(crossModeBranch()).not.toContain('markProtocolFileRead');

    // MUTATION: re-add markProtocolFileRead(requiredFile) to the fullFileExists branch -> fails.
  });
});
