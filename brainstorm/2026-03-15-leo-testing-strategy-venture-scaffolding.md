# Brainstorm: LEO Testing Strategy Redesign & Modular Venture Scaffolding

## Metadata
- **Date**: 2026-03-15
- **Domain**: Protocol
- **Phase**: Discovery
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Board of Directors (6/6 seats)
- **Related Ventures**: All active ventures (Elysian, AdSonix, ListingLens AI, MindStack AI, CodeShift, LegacyAI, LexiGuard)

---

## Problem Statement

The LEO protocol's testing infrastructure is compliance theater. 57 "E2E" test files (~19K LOC) exist in EHG_Engineer, but they're almost entirely database integration tests — no real browser clicks through user interfaces. The testing-agent declares PASS based on database state, and gate validators check stale coverage JSON files without actually executing tests. This means SDs ship through EXEC-TO-PLAN with an unvalidated "tested" stamp.

The chairman's requirement is clear: if there's a UI, a real browser must interact with it as a user would. Additionally, as each of the 8 ventures gets its own repo, there needs to be modular scaffolding that bootstraps testing (and eventually other concerns) into every new venture repo from day one.

## Discovery Summary

### Current State Findings
- **57 spec files, ~19K LOC** — labeled E2E but operate at the database layer via `supabase.insert()`, not browser navigation
- **Gate validator (`test-coverage-quality.js`)** reads `coverage/coverage-summary.json` — does NOT execute `npx playwright test`
- **53 of 57 tests skip** when preconditions aren't met (missing tables, no auth)
- **Testing-agent (401 lines)** references "MCP browser automation" aspirationally but doesn't drive browsers
- **Playwright IS installed** with 5 browser targets, trace/video capture, HAR recording
- **CI workflow exists** (`e2e-human-like.yml`) as `workflow_call` but isn't triggered on every push
- **Real UI lives in `ehg` repo** (port 8080), not `EHG_Engineer` (protocol/backend, port 3000)
- **7 working fixtures**: accessibility (axe-core), chaos-saboteur, visual-oracle, keyboard-oracle, LLM-ux-oracle, console-capture, stringency-resolver

### User's Core Concerns
1. "Tested" must mean a browser clicked through the UI as a user would — not just DB operations
2. Claude Code says "we're done" without actually testing from user perspective (context window limitations)
3. Scaffolding should be modular — testing is the first module, but structure should support CI/CD, linting, component libraries later
4. Each venture will eventually have its own repo — scaffolding needs to work across N repos

## Analysis

### Arguments For
- Every SD that ships through a hollow gate accumulates unvalidated risk — compounds across 8 ventures
- Solo operator with no QA team — Claude Code is the only tester. If it doesn't click through the UI, nobody does
- Most infrastructure already exists — Playwright installed, fixtures built, CI parameterized. CTO estimates 200-300 LOC to wire together
- Queue is light (baseline just completed 1,000 SDs) — right moment for infrastructure work
- Scaffolding ROI pays back at venture #3 — manual setup takes 2-4 hours, scaffolding reduces to minutes

### Arguments Against
- Most ventures have no UI to test yet — full Playwright is premature spend for initiation-stage ventures
- Ongoing cost: 15-25% increase in per-SD token cost (~$40-100/month at 20 SDs/month)
- Flaky test risk on Windows/WSL2 — solo operator can't afford phantom failure debug cycles
- Premature abstraction danger — designing scaffolding for 8 repos before second repo exists
- Cross-repo credential isolation is non-trivial (CISO concerns)

### Protocol: Friction/Value/Risk Analysis

| Dimension | Score | Notes |
|-----------|-------|-------|
| Friction Reduction | 8/10 | Current: every UI-touching SD has unvalidated "tested" stamp. Fix eliminates manual spot-checking and post-ship bug discovery |
| Value Addition | 9/10 | Direct: catches UI bugs before users. Compound: scaffolding accelerates every future venture repo setup |
| Risk Profile | 4/10 | Gate validator changes could break in-flight SDs; flaky tests can block velocity |
| **Decision** | **Implement** | (Friction 8 + Value 9) = 17 > Risk 4 × 2 = 8 |

## Board of Directors Deliberation

### Round 1: Board Positions

| Seat | Standing Question | Position Summary |
|------|------------------|-----------------|
| CSO | Does this move EHG forward or sideways? | **Forward** — but scope ruthlessly. Current gates are "compliance theater." Fix it once now before 8 repos inherit the hollow pattern. Build concrete for one venture first, scaffold second. |
| CRO | What's the blast radius if this fails? | **Current state: CRITICAL.** System reports PASS without user-facing validation. Blast radius if unfixed: broken UI ships to customer within 90 days (near certainty across 8 ventures). Proposed change: MODERATE risk with mitigations. |
| CTO | What do we already have? What's the real build cost? | **80% built, 20% wired correctly.** Reuse: Playwright config, 7 fixtures, venture-smoke template, CI workflow. Build: gate wrapper to execute tests, scaffolding CLI, cross-repo orchestration. Cost: 3 SDs + 1 QF, ~200-300 LOC. |
| COO | Can we actually deliver this given current load? | **Yes — queue is light, velocity is high** (835 commits in 15 days). Recommend 5-SD orchestrator: audit → scaffold template → gate fixes → CI module. ~10 working days. Ship gate fixes on single worker while others continue features. |
| CFO | What does this cost and what's the return? | **Scaffolding: APPROVED** (clear ROI at venture #3). **Full Playwright: NOT YET** — smoke tests get 80% of value at 20% of cost. Ongoing Playwright adds 15-25% per-SD cost. Tiered testing by SD type recommended. |
| CISO | What attack surface does this create? | **Scaffolding is an attack surface amplifier** — one template vulnerability = N vulnerable repos. Red lines: no service role keys in browser contexts, dedicated test Supabase projects, no production DB from test environments, per-repo secret approval gates. |

### Key Rebuttals (Round 2 synthesis)
- **CFO vs CSO/CRO**: CFO argues "smoke tests only" but CSO counters that deferring real testing until ventures have users means discovering the testing gap 8 separate times. CRO adds that a solo operator has no fallback if bugs reach users.
- **CTO vs COO on scope**: CTO says 3 SDs (wire existing pieces). COO says 5 SDs (includes audit child). Resolution: the audit is valuable but could be a pre-work QF rather than a full SD child.
- **CISO vs all**: Nobody else addressed credential isolation for cross-repo testing. CISO's requirements are non-negotiable and must be designed in from Phase 1, not bolted on in Phase 2.

### Judiciary Verdict
- **Board Consensus**: Fix the lying gates immediately. Build real browser testing for one venture first. Extract into scaffolding second. CISO's credential isolation is non-negotiable from day one.
- **Key Tensions**: Smoke-only vs. full-journey testing scope (CFO dissents from majority). Resolved by tiered approach: smoke tests mandatory for all UI SDs, full journey tests for critical paths.
- **Recommendation**: Two-phase delivery. Phase 1: gate fixes + real browser testing for ehg app (3 SDs). Phase 2: modular scaffolding with credential isolation (2 SDs). Total: 5 SDs as orchestrator.
- **Escalation**: No — chairman override not needed. Board reaches consensus on direction; scope tension resolved by tiering.

## Open Questions
1. Should the `@ehg/test-utils` shared package be an npm workspace or a published package?
2. How does the scaffolding template propagate security patches — Renovate-style PRs or manual sync?
3. What's the flaky test quarantine policy? (3-retry-then-quarantine suggested by CRO)
4. Should test Supabase projects be per-venture or shared staging?
5. When does "smoke test" graduate to "full journey test" for a given venture? (User count threshold? Revenue threshold?)

## Suggested Next Steps
1. Register vision and architecture documents in EVA
2. Create orchestrator SD with phased children
3. Start with Phase 1: gate validator fix + ehg app browser testing
