## QF-20260903-379 — gate verdicts can now name what they measured

> Four gates returned confidently wrong verdicts on correct work in one night, each by a different mechanism, and none of them looked wrong from its own output.

### Premise re-verified before touching anything
All four named-instance defects this row cites were already fixed individually by the time it was picked up:

| Defect | Shipped as | Status |
|---|---|---|
| Wrong field (serialised object substring-matched) | QF-20260903-722 | `completed`, PR #8148 |
| Wrong phase (help-text) | QF-20260903-020 | `completed`, PR #8149 |
| Wrong artifact (derived cache) | QF-20260903-822 | `closed`, escalated to SD `626ba643` |
| Wrong entry point (raw validator bypassing the wrapper) | QF-20260903-239 → `SD-LEO-FIX-GATE-PLAN-EXEC-001` | `completed` |

What this row actually asks for — **deliberately not a fifth instance repair** — is still unaddressed: establish whether any verdict surface already carries enough provenance to identify what was measured from its own output. It doesn't.

### The fix (additive, fail-open, one canonical choke point)
The mirror of the already-ratified input-side rule (chairman-ratified 2026-09-02, `6c263823`: no gate may accept evidence without producer/run/hash). This is the output side: a gate verdict should name what it measured.

- `ValidatorRegistry.normalizeResult()` (`core.js`) now passes through an **optional** `measured: { subject, producer }` field when a validator supplies one. Every other gate is unchanged — this is not a retrofit of every gate, which would repeat the "fix instances, not the class" mistake.
- One exemplar: `prdQualityValidation` (`gate-1-plan-to-exec.js`) — the same gate family `QF-20260903-722` fixed after a prior version substring-matched a serialised object instead of prose — now names its subject (the PRD content actually scored) and producer (`validatePRDQuality`).
- The PLAN-TO-EXEC precheck display (`HandoffOrchestrator.js`'s "GATE SCORES" loop) prints the measured line when present, via a small pure, testable helper (`lib/governance/verdict-measured-provenance.js`) — the point is an operator reading **that console line**, not the source.

### Tests
15 new/updated cases: direct coverage of the new helper module; `normalizeResult` pass-through / omission / null-safety; the exemplar gate's verdict carries `measured.subject`/`measured.producer`. 124 tests across the 6 other suites touching the 3 changed files pass unchanged.

Two pre-existing, unrelated `no-unused-vars` lint findings were confirmed via `git stash` to predate this change (lines far from anything touched here) — left untouched, out of scope.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
