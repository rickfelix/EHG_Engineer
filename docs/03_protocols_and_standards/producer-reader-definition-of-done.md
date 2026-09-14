# Producer/Reader Definition of Done

**Category**: Protocol
**Status**: Approved
**Version**: 1.0.0
**Author**: SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-C
**Last Updated**: 2026-09-14
**Tags**: wiring-gate, quality-model, activation-test, root-cause-b

## Why this exists

Chairman ratification `0afc86e4` (the Venture Quality Review Programme) named root
cause B: a producer/reader split with no wiring gate. A directive that says "add a
new producer" ships value only once something actually reads what it produces --
and until now, nothing in the LEO Protocol required a reader or a test proving the
chain works before a producer directive counted as done.

This convention closes that gap for every SD that adds a new producer (an
analysis step, a stage artifact, a registry entry -- any code that writes
something intended for later consumption).

## The rule

A producer directive is **not complete** until:

1. **Its reader is wired** -- some other piece of code imports, consumes, or acts
   on the producer's output. A producer with zero consumers is dead code with
   extra steps.
2. **An activation test exists** asserting the full chain: producer emits ->
   dispatch/wiring mechanism carries it -> reader consumes it. The test must run
   in the **default unit/integration tier**, using **injected fakes** (mock
   filesystem state, fixture data, stub functions) -- it must NOT require a live
   database connection, a service-role key, or any flag resembling
   `VITEST_DB_ALLOW_REF`.

## Why the unit tier, with injected fakes, deliberately

An earlier gate in this same family -- `GATE_ACTIVATION_INVARIANT`
(`scripts/modules/handoff/executors/lead-final-approval/gates/activation-invariant-gate.js`,
from SD-LEO-INFRA-REQUIRE-END-END-001) -- ties its activation-test requirement to
a TESTING-row limb that needs a live Supabase ref. No CI workflow provisions
`VITEST_DB_ALLOW_REF` today, so that gate's own sanctioned path
(`ACTIV-CHAIN-DEFERRED`) is, in practice, a bypass token rather than a genuine
proof of wiring. A RISK sub-agent review of this SD (evidence row
`c185874e-f8ed-4afc-9ae2-5480f032bb4d`) flagged this as a trap the new
convention must not inherit.

This convention deliberately does not extend or reuse `GATE_ACTIVATION_INVARIANT`.
Instead: prove the wiring with a pure, fast, fake-driven unit test that asserts
the same thing a live end-to-end run would -- the producer's output reaches the
reader -- without needing any infrastructure a CI runner might not have.

## Reference example (this SD's own P2.2 work)

`lib/eva/stage-templates/dispatch-registry.js` is the producer: it declares which
analysis-step files are dispatched, and by what mechanism.
`scripts/modules/handoff/executors/lead-final-approval/gates/wire-check-gate.js`'s
`dispatchRegistryAdvisoriesForNewFiles()` is the reader: it consumes the registry
to advise on newly-added analysis-step files with no registry entry.

The activation test lives in
`tests/unit/gates/wire-check-gate.test.js` (describe block `"P2.2:
dispatchRegistryAdvisoriesForNewFiles (advisory-only, never blocking)"`). It
asserts the full chain -- a fake added-file list flows through the reader
function, which consults the real registry, and produces (or withholds) an
advisory -- entirely in the default unit tier, with no database, no
`VITEST_DB_ALLOW_REF`, and no network call. `tests/unit/eva/stage-templates/dispatch-registry.test.js`
covers the producer side (the registry's own two check functions) the same way.

## Enforcement

This is a documented authoring convention, not (yet) a standalone blocking gate.
PLAN reviewers and PRD authors are expected to name, for every new producer FR,
which reader consumes it and where its activation test lives, following the
pattern above.
