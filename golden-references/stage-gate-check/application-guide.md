# Application guide — stage-gate check

Template-shaped for a delegate-tier session. You adapt `gate-check.mjs` to a new
stage decision; you do not need estate context beyond this folder.

## Inputs

- **Decision name** — what stage question this gate answers (one gate = one question).
- **Required inputs** — the explicit fields the decision reads (names + types).
  Every field the decision touches goes in `REQUIRED_INPUTS`.
- **Decision rules** — the task's thresholds/conditions, each producing a reason
  string and an evidence entry.
- **Evidence sink** — where the emitter writes (injected; the task says what shape).

## Adaptation points

1. Rename `evaluateGate` to `evaluate<Decision>` — still exactly ONE `evaluate*`
   export in the module.
2. Replace `REQUIRED_INPUTS` with the decision's explicit input names.
3. Replace the decision rules; every negative path returns
   `{allowed:false, reason, evidence}` with a human-readable reason.
4. Keep the evidence entries parallel to the rules (one check entry per rule).
5. Adapt the emitter's record shape to the task's sink contract.

## Invariants

These are never legal adaptations — each has a WHY in the reference:

- **Pure predicate** — the decision reads only its explicit inputs: no clock,
  randomness, network, DB, or async inside `evaluate*`. Same inputs, same verdict.
- **Fail-closed on missing inputs** — presence validated FIRST with `== null`
  (0 is a present value; truthiness lies); missing names go in the reason.
- **Separated emission** — the emitter takes the verdict and never influences
  it; I/O lives at the sink boundary, injected not imported.
- **One predicate source** — one authoritative decision function per decision.
  Consulting a data source with a disclosed fallback INSIDE it is fine; a
  batch/compose wrapper (`evaluate<X>Batch`) that DELEGATES to the primary is
  fine. A second *different* predicate deciding the same question elsewhere is
  the schism class (the forbidden thing).
- **Total, exception-safe verdict** — any exception during evaluation resolves
  to `{allowed:false, internal_error:true, reason:'evaluation error: ...'}`.
  `internal_error` is load-bearing: it makes a code-bug BLOCK distinguishable
  from a policy BLOCK, so a consumer ALERTS on it rather than treating a
  TypeError as a legitimate gate decision. Throw is never pass; the flag is the
  alarm (a swallowed error is never silent). A policy BLOCK never carries the
  flag.
- **Binary shape used only when the decision is binary** — this verdict is
  `{allowed, reason, evidence}` (+ `internal_error?`). The estate's decision
  engines are NON-binary on purpose (`lib/eva/decision-filter-engine.js`
  action enum; `lib/governance/decision-filter-engine.js` `GO|ESCALATE|BLOCK`).
  If your gate needs an ESCALATE / present-to-chairman state, adopt the
  tri-state — do NOT collapse it to this boolean.

## Acceptance (both directions)

Judge your adapted module with the same checks that judge the canonical.
Textual locks (`judgeSource` from `acceptance-locks.mjs`) are necessary but
WEAK — the behavioral contract is the real enforcement, and it runs against
YOUR module when you point the runner at it:

```
GOLDEN_REF_MODULE=<abs path to your gate-check.mjs> \
GOLDEN_REF_SRC=<abs path to your source> \
npx vitest run tests/unit/golden-references/stage-gate-acceptance.test.js
```

The behavioral suite then CALLS your adapted `evaluateGate` (determinism,
fail-closed, totality+internal_error, separated emission) — not just the
pristine original. Both directions:

- **Miss direction**: a copy with any doctrine violated — clock in the
  predicate, missing-input guard removed, a second `evaluate*` export, a catch
  that returns pass — fails the named lock or behavioral assertion.
- **Pass direction**: your adapted module passes every lock, and behaviorally:
  empty-inputs call BLOCKS naming the missing fields; happy inputs ALLOW with
  evidence; double-call is deep-equal; a poisoned input (throwing getter)
  resolves to BLOCK, not a throw.
