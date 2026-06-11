<!-- Archived from: tmp/capability-plans/sd4-maturity-weighted.md -->
<!-- SD Key: SD-LEO-INFRA-MATURITY-WEIGHTED-PORTFOLIO-001 -->
<!-- Archived at: 2026-05-29T14:09:09.439Z -->

# Plan: Maturity-weighted portfolio-aware discovery capability anchoring

## Type
infrastructure

## Priority
medium

## Target Application
EHG_Engineer

## Summary
"Use our existing capabilities" is an exploit strategy. Applied to an immature portfolio with few proven, scored capabilities, it is degenerate — it echoes the trunk's internal infrastructure back as venture ideas (the original cron-bias symptom). The capability block injected into Stage-0 discovery prompts is currently flat: always on for anchored strategies and equally weighted regardless of how mature or large the portfolio is. There is no notion of explore-early / exploit-late.

This SD makes capability anchoring maturity-weighted and portfolio-aware. A portfolio-maturity signal (count of production-grade / high-extraction capabilities, total reuse events, number of shipped ventures — available once SD-2 and SD-3 land) modulates how heavily the capability ledger influences discovery: low influence when the portfolio is immature (favor latent capability and market opportunity), rising influence as proven, reusable capability accumulates. It also lets discovery draw on the portfolio-wide graph rather than EHG_Engineer only.

Goal: Discovery capability anchoring scales with portfolio maturity — exploratory early, exploitative as the capability graph fills — so the compounding effect is realized at maturity without producing degenerate (cron-biased) output at immaturity.

## Success Criteria
- [ ] A portfolio-maturity signal is computed from the populated capability graph (production-grade count, reuse volume, venture count).
- [ ] The strength/weight of capability injection into discovery prompts is a function of portfolio maturity (low at immaturity, high at maturity).
- [ ] At current (immature) maturity, capability-anchored strategies favor latent capability and market opportunity over the proven ledger.
- [ ] Anchored strategies draw from the portfolio-wide graph (platform + application + venture), not EHG_Engineer-only.
- [ ] Tests assert weighting monotonicity: higher maturity yields higher capability influence, with documented thresholds.

## Scope
| File | Action | Purpose |
|------|--------|---------|
| `lib/eva/stage-zero/strategic-context-loader.js` | MODIFY | Add a portfolio-maturity signal to strategic context |
| `lib/capabilities/scanner-context.js` | MODIFY | Weight the capability block by portfolio maturity |
| `lib/eva/stage-zero/paths/discovery-mode.js` | MODIFY | Apply maturity-weighted anchoring per strategy |
| `tests/unit/capabilities/maturity-weighting.test.js` | ADD | Monotonicity and threshold tests |

Depends on SD-2 (real scores) and SD-3 (portfolio-wide graph).
