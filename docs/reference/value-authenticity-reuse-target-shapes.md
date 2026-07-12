---
category: reference
status: approved
version: 1.0.0
author: QF-20260712-009
last_updated: 2026-07-12
tags: [reference, value-authenticity, apa, reuse-verification]
---

# Value-authenticity family — verified reuse-target return shapes

Retro follow-up (`retrospectives.id=fb075344-dd76-45b5-af15-14f352956364`,
SD-LEO-INFRA-VALUE-AUTHENTICITY-SPEC-002): "verify reuse-target return shapes
before scoping L1/APA FRs against SSOT assumptions" — SPEC-002 lost EXEC time
because `research-engine.js` did not match its assumed "cited source" shape.
This doc grepped the ACTUAL exports/return shapes of every capability
`docs/design/value-authenticity-system-design.md` names as reusable, so a
future value-authenticity-family PLAN phase can consult it directly instead
of re-discovering these shapes from scratch. (At time of writing, both
downstream SDs the original action item targeted —
`SD-LEO-INFRA-VALUE-AUTHENTICITY-APA-001`, L1 — and the coupled spec-gate
half, `SD-LEO-INFRA-VALUE-AUTHENTICITY-SPEC-001`, L2 — are already shipped;
this doc is written for whatever family work comes next, e.g. L5.)

## `lib/research/research-engine.js` — `runResearch({question, context, constraints, deep})`

Confirmed **no citation/provenance field of any kind** in the actual return
object:

```js
{
  executive_takeaways: string[],
  options: [{ name, description, pros: string[], cons: string[] }],
  tradeoffs: string[],
  risks: string[],
  recommended_path: string,
  confidence_score: number,       // 0.0-1.0
  consensus: 'strong'|'moderate'|'weak'|'insufficient_data'|'insufficient_providers',
}
```

No `sources`, `citations`, `urls`, or `primarySource` field. Any caller that
needs a structurally-verified citation (e.g. a bounded-iterative-review
termination condition) must supply/track it independently —
`lib/value-authenticity/panel-assembly.js` already does this correctly
(explicit caller-supplied `reviewState.primarySource: {url, checkedAt}`,
never inferred from `runResearch()`'s output). A real citation-yielding
research upgrade remains a tracked-but-unscoped follow-up per that SD's
retrospective action item #2.

## `lib/apa/value-authenticity-t0.mjs` — `checkSourceExists({modulePath, sourceText})`

Static, zero-live-dependency AST/grep probe. Returns
`{finding: boolean, reason: string}`. Throws on empty/missing `sourceText`.
Matches its JSDoc exactly.

## `lib/apa/value-authenticity-t1.mjs` — `checkSourceReached({productLevelClaim, instrumentedCallSite, evidenceBundle})`

Returns `{finding: boolean, reason: string}`. **Caveat for reuse**: this is
probe/predicate LOGIC only, run against an **injected synthetic**
`evidenceBundle: {claimsPresented: string[], observedCallSites: string[]}` —
**not** a live sandbox observation. Live instrumentation (actually observing
a running APA Child A instance) is explicitly deferred to Child A
integration; the module defines the contract live wiring will eventually
satisfy, but does not itself observe anything live yet. A future SD assuming
T1 already does live call-site observation would be scoping against a false
assumption.

## `lib/apa/value-authenticity-t2.mjs` — `checkMetamorphicMonotonicity(...)` / `checkNaiveInputSensitivity(...)`

`checkMetamorphicMonotonicity` returns
`{finding: boolean, reason: string, values: number[], violations: number}`
(has extra fields beyond the T0/T1 shape — direction/ordering trend data, not
just a finding). Matches its JSDoc exactly. Net-new probe backend, explicitly
NOT a `Child-B` transport-interception extension.

## `lib/apa/value-authenticity-ladder.mjs` — `aggregateVerdict(supabase, findings)`

Async; returns
`{verdict: 'PASS'|'FAIL', hardFindings: ProbeFinding[], softFindings: ProbeFinding[], weakestLinkGrade: string|null}`.
`hard_catcher` tiering is looked up live from the criteria library per
finding, never re-derived in code. Matches its JSDoc exactly. Throws if a
finding cites an unknown `criterionId` (round-trip-SSOT violation).

## Summary

Of the five reuse targets checked, four (`T0`, `T2`, ladder aggregation, and
`T1`'s own documented contract) match their JSDoc/SSOT-doc description
exactly. The one genuine drift — `research-engine.js` lacking any
citation/provenance field — was already discovered and correctly worked
around during SPEC-002's EXEC; this doc makes that finding discoverable
ahead of time for the next family SD instead of requiring a second
independent re-discovery.
