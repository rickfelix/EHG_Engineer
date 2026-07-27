// SD-LEO-INFRA-BLOCKED-WORKER-SELF-RECHECK-001 — blocked workers must re-check their OWN blocker.
//
// WHY THIS EXISTS. Two workers sat blocked 5h23m (Alpha-4, sd-start.js RESYNC_REQUIRED) and 9h41m
// (Charlie, same gate + three peer-dirty files) on conditions that had CLEARED HOURS EARLIER. Both
// escalated correctly and both refused to route around the gate, so the entire ~15 worker-hour cost
// landed on the workers doing the right thing. A coordinator-side notify-loop was proposed and
// KILLED BY MEASUREMENT: both seats were AWAKE the whole time — 66 and 74 coordination rows, largest
// silence gaps 32 and 58 minutes — and re-checked their own blocker on NONE of those ticks. When the
// blocked party is live, self-recheck is strictly cheaper than any notify mechanism.
//
// WHAT THIS TEST IS, STATED HONESTLY (PRD TR-2): a DRIFT GUARD, not behavioural verification. It
// proves the rule text is present and consistent across the surfaces that carry it. It cannot prove
// any worker obeys it — that is the live fleet drill in TS-6. A green here means the directive says
// the right thing in every place it is said, which is exactly the failure mode that bit us before:
// three hand-synced surfaces drifting apart silently.
//
// THE THREE SURFACES (leo_protocol_sections row 603 self-declares this sync obligation):
//   1. row 603 (DB SSOT)  -> rendered into CLAUDE_CORE.md + CLAUDE_EXEC.md by generate-claude-md-from-db.js
//   2. docs/protocol/fleet-worker-loop-directive.md  -> HAND-maintained; the generator NEVER touches it
//   3. scripts/hooks/session-role-orient.cjs         -> hardcoded [ROLE] strings; never DB-reads the text
// We assert the GENERATED renders rather than querying the DB directly: the vitest `unit` project
// deliberately has no DB credentials, and the renders transitively pin the row. The DB-vs-render
// direction is already covered by check-claude-md-drift.cjs in claude-md-drift.yml.
//
// Modelled on tests/unit/same-turn-next-claim.test.js, which does the same parity job for step 6.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');

const DIRECTIVE = 'docs/protocol/fleet-worker-loop-directive.md';
const ROLE_HOOK = 'scripts/hooks/session-role-orient.cjs';
const RENDERS = ['CLAUDE_CORE.md', 'CLAUDE_EXEC.md'];

// The clause must be findable by a human grepping for it, so match on the load-bearing phrase
// rather than incidental wording. Kept deliberately loose on punctuation/case.
const SELF_RECHECK = /re-?run your own blocker check/i;
const RE_REPORT_ON_CHANGE = /only.{0,40}materially changed|materially changed.{0,60}re-?report/i;

describe('blocked-worker self-recheck clause — 3-surface parity (FR-1, FR-3)', () => {
  it('all surfaces exist where the sync contract says they do', () => {
    for (const p of [DIRECTIVE, ROLE_HOOK, ...RENDERS]) {
      expect(existsSync(resolve(root, p)), `${p} missing`).toBe(true);
    }
  });

  it('the hand-maintained directive requires re-running your OWN blocker check', () => {
    expect(read(DIRECTIVE)).toMatch(SELF_RECHECK);
  });

  it('the [ROLE] hook block requires it too — it never DB-reads the directive, so it drifts silently', () => {
    expect(read(ROLE_HOOK)).toMatch(SELF_RECHECK);
  });

  it('the generated CLAUDE renders carry it, which transitively pins leo_protocol_sections row 603', () => {
    for (const p of RENDERS) {
      expect(read(p), `${p} lacks the self-recheck clause`).toMatch(SELF_RECHECK);
    }
  });
});

describe('re-report only on material change (FR-2) — the do_not_accept guard, made executable', () => {
  // The SD explicitly forbids a naive "re-check before re-reporting" that re-reports an UNCHANGED
  // condition every tick — that just relocates the noise. This is not hypothetical: a live stuck row
  // opens "RE-SEND PER YOUR 30-MINUTE RULE", and no 30-minute rule is codified anywhere in the repo.
  // Someone invented a re-send timer in a chat message. If a future edit drops this constraint, this
  // test goes red rather than the fleet quietly re-acquiring the timer habit.
  it('the directive states an unchanged blocker is NOT re-reported', () => {
    expect(read(DIRECTIVE)).toMatch(RE_REPORT_ON_CHANGE);
  });

  it('the generated renders state it as well', () => {
    for (const p of RENDERS) {
      expect(read(p), `${p} lacks the re-report-on-change constraint`).toMatch(RE_REPORT_ON_CHANGE);
    }
  });
});

describe('scope guards — the change must stay inside exit-mode (4b)', () => {
  it('the clause lives in the blocked-claim exit mode (4b), not a new numbered step', () => {
    // (4b) is the blocked-claim exit mode. LEAD measurement established it as the correct anchor:
    // 4b ALREADY mandates a per-wakeup re-poll — of the INBOX for a coordinator reply — and the gap
    // is that nothing re-checks the worker's OWN blocker. Amend in place; do not append a step 8.
    //
    // NOTE ON SURFACE: (4b) is a row-603 construct and appears in the GENERATED renders, not in the
    // hand-maintained directive file, which numbers its steps 1-7 without exit-mode lettering. An
    // earlier draft of this test asserted (4b) against the directive and was wrong about which
    // surface carries it — corrected here rather than loosened, so the anchor stays pinned.
    for (const p of RENDERS) {
      expect(read(p), `${p} lost the (4b) blocked-claim exit mode`).toMatch(/\(4b\)/);
    }
    // The self-recheck clause must sit inside 4b, not float elsewhere in the section.
    for (const p of RENDERS) {
      const body = read(p);
      const at4b = body.indexOf('(4b)');
      const at4c = body.indexOf('(4c)', at4b);
      const clause = at4c > at4b ? body.slice(at4b, at4c) : body.slice(at4b, at4b + 2000);
      expect(clause, `${p}: self-recheck clause is not inside (4b)`).toMatch(SELF_RECHECK);
    }
    // And the hand-maintained directive must not have grown an 8th numbered step.
    expect(read(DIRECTIVE)).not.toMatch(/^\s*8[).]\s/m);
  });

  it('does NOT introduce a coordinator-side re-check loop — rejected on measurement', () => {
    // Both blocked seats were awake and ticking. A central loop would have been a coordinator-side
    // solution to a problem the worker was awake to solve locally sixty-plus times.
    const d = read(DIRECTIVE);
    expect(d).not.toMatch(/coordinator[- ]side (re-?check|notify) loop (is|shall|must) (added|introduced)/i);
  });

  it('the fingerprint helper the directive leans on still exports fingerprint()', () => {
    // Guards the pointer from rotting. fingerprint() behaviour itself is covered by the
    // signal-router suite and is deliberately not duplicated here.
    expect(read('lib/shared/content-fingerprint.cjs')).toMatch(/module\.exports\s*=\s*\{[\s\S]*fingerprint/);
  });
});
