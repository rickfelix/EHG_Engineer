---
category: reference
status: approved
version: 1.0.0
author: SD-LEO-INFRA-PURE-GUARD-UNWIRED-001
last_updated: 2026-07-28
tags: [reference, governance, guards, testing, verification]
---

# Self-Gating Guard Detectors

| Field | Value |
|-------|-------|
| **Category** | Reference |
| **Status** | Approved |
| **Version** | 1.0.0 |
| **Last Updated** | 2026-07-28 |
| **Source SD** | SD-LEO-INFRA-PURE-GUARD-UNWIRED-001 |
| **Modules** | `lib/governance/guard-wiring-registry.js`, `guard-sustained-zero.js`, `predicate-self-test.js`, `inactive-reason-consumer.js` |

## Overview

**A check that cannot see its subject returns the permissive answer, and the permissive answer is
indistinguishable from a passing one.**

A pure, correct, well-documented guard that self-gates to permissive when its caller supplies no
data looks exactly like a guard that evaluated and passed. The defect is not the permissive branch —
inverting these to fail closed would trade a silent permit for a silent outage. The defect is that
**nothing tells you which branch you got**.

This page describes four detectors for that class and, equally important, the four ways the class
evaded each of them during development.

## The three shapes

Enumerating the shapes matters because a detector for one is blind to the others:

| Shape | Description | Live example |
|-------|-------------|--------------|
| 1. No caller at all | Function exists, nothing executable calls it | `enforceSweepBudget` — ten repo-wide occurrences, zero executable callers; the only caller-shaped reference is a **prompt string** |
| 2. Caller wired, data never produced | The call site exists and looks correct, but no producer ever sets the field it gates on | `capabilityGapTerm` — gaps are injected, but nothing sets `candidate.capability` |
| 3. Input supplied as a stub | The input is present to any syntactic check and inert at runtime | `runPreShipGate(brief, { getForecast: () => undefined })`, beneath a comment reading "Real runs inject the Solomon forecast accessor" — which that run is |

Shape 3 is the most deceptive: it passes a grep, passes review, and passes any check that asks only
"is the input supplied".

## The four detectors

### 1. Wiring — `lib/governance/guard-wiring-registry.js`

Answers the one mechanical question a grep cannot: **does a production caller actually _feed_ this
guard the input it gates on?**

```js
import { GUARD_REGISTRY, knownUnwired, isProductionCallSite, suppliesGatedInput, isStubbedInput }
  from './lib/governance/guard-wiring-registry.js';
```

- `isProductionCallSite(path)` — a prompt, doc, test, mock, fixture or archive is **not** wiring.
- `suppliesGatedInput(callText, input)` — distinguishes `f({ spent })` from `f({})`.
- `isStubbedInput(callText, input)` — shape 3.
- `GUARD_REGISTRY` — each entry names `definedAt` (file:line, resolved by a test), `gatedInput`, and
  `permissiveMeans`: what the permissive branch actually grants. A reader deciding whether an entry
  matters needs the consequence, not just the name.

The test (`tests/unit/governance/guard-wiring.test.js`) prints the unwired inventory on every run
and asserts the baseline may **shrink** but never **grow** — a permanently red suite gets muted,
which recreates the silence it exists to break.

### 2. Sustained zero — `lib/governance/guard-sustained-zero.js`

**A gate that has never blocked anything is not a passing gate, it is an unplugged one.**

Four states, because collapsing them manufactures false alarms:

| State | Meaning |
|-------|---------|
| `HEALTHY` | Blocked at least once in the window. It demonstrably can. |
| `SUSPECT` | Observed, ran, blocked zero times. **This is the alarm.** |
| `UNKNOWN` | No observations, or observed zero times. Not an alarm and **not health**. |
| `INERT` | Zero blocks *and* a self-test proving the predicate cannot produce its blocking verdict. |

`UNKNOWN` is the load-bearing state: an alarm that cannot *see* blocking events reports diligence as
neglect. `SUSPECT` means "go find out why this never fired"; `INERT` means "it could not have fired;
fix the predicate" — a different and much shorter job.

Counts are emitted unconditionally, zeros included. A counter that appears only when non-zero renders
measured-and-empty identically to not-measured.

### 3. Predicate self-test — `lib/governance/predicate-self-test.js`

**A check that has never been shown to fail cannot be cited.**

Runs a predicate against an input known to trigger it and one known to be clean, and rejects it
unless it produces *both* verdicts. Rejects: constant answers, unconditional blocks, throwing
predicates, and async predicates (a returned Promise cannot be judged synchronously and previously
read as the *passing* verdict).

The founding instance: a regex intended as `\b` that was shell-mangled into a literal **backspace
character**. It ran, never threw, answered honestly, and reported 0/3 for 27 consecutive passes
while the underlying state demonstrably changed. One test against a known-matching string would have
caught it.

### 4. Inactive-reason consumer — `lib/governance/inactive-reason-consumer.js`

**An emit with no behavioural consumer is not a signal.**

Folds a batch of term results into the observation record the sustained-zero alarm consumes, and
separates two findings that must never collapse:

- **no-data** — the guard never got its input, so it could not have blocked; "why didn't it fire" is
  answered, not open.
- **evaluated** — it had real data and declined.

All seven live reasons are no-data. `EVALUATED_REASONS` is deliberately the empty set (documented as
empty, not merely unpopulated). An **unrecognised** reason counts as no-data *and* is surfaced
separately: treating it as "not no-data" would let a new emit silently stop contributing, which is
the permissive answer arriving quietly.

Wired in production at `lib/adam/rationale-bar.js` (`selectAdvisory`), read by
`scripts/adam-opportunity-scan.cjs` into `.adam-scan-ledger.json` as
`guard_health: {summary, missing:[{guard, missing_input, observations}]}`.

## How the class evaded its own detectors

Recorded because every one of these passed a green suite, and because the same shape recurred four
times, one hop further out each round:

1. **The consumer did not exist.** FR-4's module was imported by nothing but its own test; its link
   to the emit sites was a docblock comment — a reference that looks like wiring and executes
   nothing, which is exactly what detector 1 exists to catch.
2. **The caller never read the result.** The consumer ran on the production path and its output was
   discarded, so the ledger row was byte-identical to the 21 before it.
3. **The read was untested.** Both *ends* were tested by direct call with literals; the argument
   connecting them lived in an unexported `main()` and could be deleted with no test signal.
4. **The "loud inventory" printed nothing.** `tests/setup.unit.js` replaces `global.console` with
   `vi.fn()` stubs, so `console.warn` from any unit test is swallowed — including in the two sibling
   guards whose pattern was copied. Use `process.stderr.write` for anything a unit test must
   actually emit.

**The rule:** test the *terminal artifact* — the ledger row, the stdout line, the thing a human or a
downstream system actually reads — not the last function you wrote. Every hop short of it can be
green while the thing that matters is unchanged.

**The mechanical tell:** when both ends of a connection are tested by direct call with literals, the
connection is the untested part. Literals at both ends are the signature.

**The generalisation:** this defect class applies to verification as readily as to production
guards — *a test that cannot fail is a guard that cannot fire.* Mutation testing found all four of
the above; careful reading did not. Verify each mutation landed **on disk** before trusting a green
run: two mutations silently no-opped during this work and reported green, which is indistinguishable
from "the test caught nothing".

## Known limits

Stated rather than implied, because a claim that stops the next person looking is the same defect one
level up:

- **`isProductionCallSite` is path-level and the call-site scan is text-level**, so neither can tell a
  call inside a **string literal** from a real one. `scripts/solomon-startup-check.mjs` — the
  motivating example — is a production file whose reference is a prompt string, and it is separated
  only because that prompt happens not to also contain the gated input. Closing this needs a parser.
- **The final hop into an unexported `main()` cannot be closed behaviourally** without a
  process-level test that runs the CLI. It *is* statically guarded by `suppliesGatedInput`, which
  catches deletion, omission and null-stubbing — but a static check cannot prove the value passed is
  the right one.
- **`predicate-self-test.js` currently has no production importer**, so `GUARD_HEALTH.INERT` is
  unreachable live. By this page's own thesis that is worth naming rather than leaving implicit.
- **0 of 6 registered guards has a wired production call site**, so the registry baseline can only be
  shrunk by wiring one — there is nothing to delete today.

## Related

- [`transitive-hook-spawn-target-guard.md`](./transitive-hook-spawn-target-guard.md)
- [`e2e-route-mount-method-guard.md`](./e2e-route-mount-method-guard.md)
