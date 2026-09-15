# Organization Acceptance Suite

SD-LEO-INFRA-ORGANIZATION-ACCEPTANCE-SUITE-001. Source design: Solomon's AI AGENT ORGANIZATION
ARCHITECTURE v2 (`feedback` row `20b858dc-30fc-4e14-a8a9-951ce5a988d5`, section 5, A1-A6).

## What this is

A versioned, CI-runnable suite (`run-suite.mjs`) that evaluates an "organization" object against
a set of checks and returns `{suite_version, run_id, content_hash, pass_rate, catch_rate,
findings[]}` (A4: "the organization never grades itself; results carry suite version, run id and
content hash").

The suite is seeded with 14 broken-organization fixtures derived from the MAST multi-agent
failure taxonomy (arxiv 2503.13657) and must catch (fail) every one of them -- proving its own
checks are non-vacuous (A3: "the suite is tested too").

## Suite version

Current: `1.0.0` (see `run-suite.mjs`'s `SUITE_VERSION`). Bump this whenever a check is added,
removed, or its pass/fail logic changes (A5: "stricter is free, looser needs a record").

## What is implemented

- **14 MAST-derived checks** (`checks/mast/fm-*.mjs`) and their corresponding broken-organization
  fixtures (`fixtures/mast/fm-*.mjs`), covering all 14 modes in the published taxonomy:
  FC1 System Design (FM-1.1-1.5), FC2 Inter-Agent Misalignment (FM-2.1-2.6), FC3 Task
  Verification (FM-3.1-3.3).
- **The mock venture** (`fixtures/mock-venture.mjs`): the suite's clean passing-control fixture,
  built via the real `resolveVentureRoles()` resolver (`lib/org/role-registry-resolver.mjs`), not
  a hand-typed literal.
- **2 currently-enforceable A2 integrity checks** (`checks/integrity/*.mjs`), pinning already-live
  schema facts from `SD-LEO-INFRA-VERSIONED-ROLE-REGISTRY-001`: `org_role_base_versions` has no
  `venture_id` column and is RLS-restricted to `service_role`; `org_role_venture_overlays` has no
  `norms` column at all.

## Organization object shape

`{ceo, executives[], crews[], budget_distribution}` are REAL fields, taken verbatim from
`resolveVentureRoles()`'s output. Each role entry is a FLAT object carrying only the 11 fields in
`ROLE_FIELD_KEYS` (`role-registry-resolver.mjs`) -- there is no live nested
`{structure, function, norms}` shape on a resolved role, and no live task or handoff table.

`tasks[]`, `handoffs[]`, and `conversation_log[]` are a **SYNTHETIC EXTENSION** this suite defines
-- no live table or runtime backs them. They exist only within suite fixtures/checks so that MAST
modes about tasks, handoffs, and conversations (which the design's own taxonomy requires) have
*something* concrete to check, given the live substrate has no task/handoff/session concept yet.
Every fixture's docblock states which fields it uses are real (resolver-sourced) vs. synthetic
(fixture-only extension).

## Direct vs. proxy representations

Most of the 14 MAST checks are **direct** representations: the failure mode maps onto a concrete,
checkable structural property of the (real + synthetic) organization object today. Three are
**proxy** representations, because their failure mode is fundamentally a live-runtime behavior
that no current substrate can produce or observe:

| Code | Mode | Proxy reason | Real substrate pending |
|---|---|---|---|
| FM-1.3 | step repetition | no execution-step trace exists | `SD-LEO-INFRA-DUTY-LEDGER-TRACING-001` (P4) |
| FM-1.4 | context truncation | no runtime context window exists | `SD-LEO-INFRA-AGENT-MEMORY-WORKING-001` (P3) |
| FM-2.1 | conversation reset | no session/conversation state exists | `SD-LEO-INFRA-AGENT-MEMORY-WORKING-001` (P3) |

Each proxy check's own docblock and `proxyReason` export state this explicitly. A proxy check is
never presented as a full behavioral reproduction -- only as the closest definitional stand-in
available before its owning substrate lands.

## Deferred (not implemented by this SD)

Per A5 ("stricter is free, looser needs a record"), every A2/A3 item this SD does not implement is
named here rather than silently omitted:

| Item | Owning SD | Status (as of this SD's completion) |
|---|---|---|
| "no instantiation for a nonexistent venture" (A2 integrity) | `SD-LEO-INFRA-INSTANTIATEVENTURE-REFUSES-VENTURE-001` | draft/LEAD |
| "a change without evidence and a regression probe is refused" (A2 learning) | `SD-LEO-INFRA-REGRESSION-GATED-SELF-001` | draft/LEAD |
| Full runtime behavior for FM-1.3/FM-1.4/FM-2.1 (see proxy table above) | `SD-LEO-INFRA-AGENT-MEMORY-WORKING-001`, `SD-LEO-INFRA-DUTY-LEDGER-TRACING-001` | draft/LEAD |
| "the ten questions" per-seat definitional lint (A2) | `SD-LEO-INFRA-DEFINITION-HANDOFF-ASSURANCE-001` | draft/LEAD |

As each owning SD lands, extend this suite with the newly-testable check rather than opening a
parallel mechanism -- A1 ("run... on every change") makes this suite the one place organization
quality is proven.

## E6 is a future commissioning-time predicate, not this SD's completion criterion

Design section 8's exit predicate **E6** ("on the clean-slate venture the organization passes the
acceptance suite with a 100% catch rate on the 14 MAST fixtures") is a **Phase-2 commissioning**
event, gated on the clean-slate test venture (chairman ratification `3c4a6781`) actually being
created. As of this SD's completion, that ratification has **not** been executed -- `AltifyAI` and
`ApexNiche AI` are still live in the `ventures` table.

This SD's own completion criterion is the "Before then" clause of its `success_criteria`: the
suite catches every seeded MAST fixture **on the mock venture**, asserted in CI. **E6 is not
claimed as met by this SD** -- it is a future, separate verification event to run once the
clean-slate venture exists, most likely by re-invoking this same suite against that venture's real
`resolveVentureRoles()` output.

## Running the suite

```js
import { runSuite } from './run-suite.mjs';
import { MAST_CHECKS } from './checks/mast/index.mjs';
import { buildMockVentureOrganization } from './fixtures/mock-venture.mjs';

const result = await runSuite({
  organization: buildMockVentureOrganization(),
  checks: MAST_CHECKS,
});
// result.pass_rate === 100, result.catch_rate === null (no seeded-broken cases in this call)
```

See `tests/unit/org/acceptance-suite/` for the full self-test (all 14 broken fixtures + the mock
venture in one battery, computing both `pass_rate` and `catch_rate` together per A3).
