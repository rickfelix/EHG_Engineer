<!-- Archived from: tmp/capability-plans/sd1-deanchor.md -->
<!-- SD Key: SD-LEO-INFRA-ANCHOR-SIMPLE-VENTURE-001 -->
<!-- Archived at: 2026-05-29T14:08:42.521Z -->

# Plan: De-anchor Simple Venture Finder and make discovery capability anchoring explicit per-strategy

## Type
infrastructure

## Priority
high

## Target Application
EHG_Engineer

## Summary
The Stage-0 "Simple Venture Finder" discovery strategy produces venture candidates that disproportionately cluster around CRON/scheduling/automation micro-SaaS. Root cause: `runSimpleVentureFinder()` in `lib/eva/stage-zero/paths/discovery-mode.js` injects an "EHG Capability Ledger (Internal Strengths)" block via `getCapabilityContextBlock(supabase, 'simple_venture')`. Because `'simple_venture'` is not present in the `formatters` map in `lib/capabilities/scanner-context.js`, it silently falls through to the `formatForOverhang` default, which dumps EHG's internal scheduling/pipeline/queue infrastructure (pipeline-scheduler, pipeline-executor, dead-letter-queue, circuit-breaker) into the prompt with an instruction to "find ventures where EHG has an existing capability advantage." The LLM then proposes scheduling/cron tooling.

Capability anchoring (injecting the capability ledger into a discovery prompt) is currently an implicit, silent default applied via a fallback formatter rather than a deliberate per-strategy decision. This SD makes capability anchoring an EXPLICIT, opt-in property of each discovery strategy and removes it from Simple Venture Finder, whose charter ("low-complexity ventures to test the build pipeline") does not benefit from capability anchoring.

Goal: Simple Venture Finder generates diverse low-complexity candidates with no internal-infrastructure bias; capability anchoring becomes an explicit per-strategy configuration with a safe default of OFF for unmapped strategies. This is the immediate, independent "stop the bleeding" fix for the observed cron bias.

## Success Criteria
- [ ] `getCapabilityContextBlock` no longer falls through to `formatForOverhang` for unmapped scanner types; an unmapped or unknown type returns an empty block instead of leaking internal infrastructure.
- [ ] Capability anchoring is an explicit per-strategy flag or allowlist, not an implicit default.
- [ ] `simple_venture` does NOT inject the capability ledger; its assembled prompt contains no "EHG Capability Ledger / Internal Strengths" block.
- [ ] The existing four scanners (trend_scanner, democratization_finder, capability_overhang, nursery_reeval) retain their current capability blocks with no behavioral regression.
- [ ] A regression test asserts: simple_venture prompt contains no capability block; unmapped strategy returns empty; mapped strategies still inject their block.
- [ ] Verification: a Simple Venture Finder run no longer returns a cron/scheduling-dominated candidate set.

## Scope
| File | Action | Purpose |
|------|--------|---------|
| `lib/capabilities/scanner-context.js` | MODIFY | Remove unsafe formatForOverhang fallback for unmapped types; return empty string for unmapped/unknown scanner types |
| `lib/eva/stage-zero/paths/discovery-mode.js` | MODIFY | Make capability-block injection explicit per strategy; drop the capability block from runSimpleVentureFinder |
| `tests/unit/capabilities/scanner-context.test.js` | ADD | Regression tests for anchoring on/off per strategy |
