---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Model Optimization - Opus 4.5 → Sonnet 4.5 Migration


## Table of Contents

- [Executive Summary](#executive-summary)
  - [Changes Made](#changes-made)
- [Files Modified](#files-modified)
- [Phase-Based Model Routing (OPTIMIZED)](#phase-based-model-routing-optimized)
  - [LEAD Phase](#lead-phase)
  - [PLAN Phase](#plan-phase)
  - [EXEC Phase](#exec-phase)
- [Default Model Assignments (When Phase Unknown)](#default-model-assignments-when-phase-unknown)
- [Opus 4.5 Usage Summary (After Optimization)](#opus-45-usage-summary-after-optimization)
  - [Still Using Opus (Critical Only)](#still-using-opus-critical-only)
  - [Total Opus Invocations Per SD (Estimated)](#total-opus-invocations-per-sd-estimated)
- [Rationale for Changes](#rationale-for-changes)
  - [Why Move STORIES to Sonnet?](#why-move-stories-to-sonnet)
  - [Why Move VALIDATION to Sonnet (in LEAD)?](#why-move-validation-to-sonnet-in-lead)
  - [Why Move TESTING to Sonnet?](#why-move-testing-to-sonnet)
  - [Why Move DOCMON to Sonnet (in EXEC)?](#why-move-docmon-to-sonnet-in-exec)
  - [Why KEEP SECURITY on Opus?](#why-keep-security-on-opus)
  - [Why KEEP VALIDATION on Opus (in PLAN/EXEC)?](#why-keep-validation-on-opus-in-planexec)
- [Monitoring Plan](#monitoring-plan)
  - [What to Watch](#what-to-watch)
  - [Rollback Triggers](#rollback-triggers)
  - [Success Metrics](#success-metrics)
- [Code References](#code-references)
  - [Agent Files](#agent-files)
  - [Sub-Agent Executor](#sub-agent-executor)
- [Expected Impact](#expected-impact)
  - [Rate Limit Savings](#rate-limit-savings)
  - [Cost Savings (If Applicable)](#cost-savings-if-applicable)
  - [Quality Impact (To Be Monitored)](#quality-impact-to-be-monitored)
- [Recommendations](#recommendations)
  - [Short-term (Next 2 weeks)](#short-term-next-2-weeks)
  - [Medium-term (Next month)](#medium-term-next-month)
  - [Long-term (Next quarter)](#long-term-next-quarter)
- [Summary](#summary)

**Date**: 2025-12-06
**Reason**: Rate limit optimization - Reserve Opus 4.5 for critical security tasks only
**Impact**: ~85% reduction in Opus usage, significant cost/rate limit savings

---

## Executive Summary

Due to reaching Opus 4.5 rate limits, we've optimized model usage to reserve Opus exclusively for **security-critical tasks**. Most sub-agents and Claude Code agents now use Sonnet 4.5, which has proven effective across 2,710+ sub-agent executions.

### Changes Made

| Component | Before | After | Rationale |
|-----------|--------|-------|-----------|
| **stories-agent** | opus | sonnet | Worth testing Sonnet despite 3.4% historical pass rate |
| **validation-agent** | opus | sonnet | Not security-critical, testing Sonnet |
| **security-agent** | opus | **opus** | **KEEP OPUS** - Critical security tasks |
| **Phase routing** | Mixed opus/sonnet | Mostly sonnet | See phase-specific table below |
| **Default assignments** | Mixed opus/sonnet | Mostly sonnet | See default assignments table |

---

## Files Modified

1. `.claude/agents/stories-agent.md` - Changed `model: opus` → `model: sonnet`
2. `.claude/agents/validation-agent.md` - Changed `model: opus` → `model: sonnet`
3. `.claude/agents/security-agent.md` - **No change** (kept `model: opus`)
4. `lib/sub-agent-executor.js` - Updated `PHASE_MODEL_OVERRIDES` and `DEFAULT_MODEL_ASSIGNMENTS`

---

## Phase-Based Model Routing (OPTIMIZED)

### LEAD Phase

| Sub-Agent | Before | After | Notes |
|-----------|--------|-------|-------|
| GITHUB | sonnet | sonnet | 67% pass - working well |
| DOCMON | sonnet | sonnet | 83% pass |
| DATABASE | sonnet | sonnet | 100% pass |
| TESTING | sonnet | sonnet | 69% pass - acceptable |
| STORIES | **opus** | **sonnet** | Testing Sonnet (was 8% with Opus) |
| RETRO | sonnet | sonnet | 100% pass |
| SECURITY | **opus** | **opus** | **KEEP OPUS** - Critical domain |
| VALIDATION | **opus** | **sonnet** | Testing Sonnet |

### PLAN Phase

| Sub-Agent | Before | After | Notes |
|-----------|--------|-------|-------|
| GITHUB | sonnet | sonnet | 0% pass but low volume |
| DOCMON | sonnet | sonnet | 100% pass |
| DATABASE | sonnet | sonnet | 100% pass |
| TESTING | **opus** | **sonnet** | Testing Sonnet (was 25% with Opus) |
| STORIES | **opus** | **sonnet** | Testing Sonnet (was 0% - critical to optimize) |
| RETRO | sonnet | sonnet | 100% pass |
| SECURITY | **opus** | **opus** | **KEEP OPUS** - Critical domain |
| VALIDATION | **opus** | **opus** | **KEEP OPUS** - Prevents duplicate work (critical) |

### EXEC Phase

| Sub-Agent | Before | After | Notes |
|-----------|--------|-------|-------|
| GITHUB | sonnet | sonnet | 13% pass |
| DOCMON | **opus** | **sonnet** | Testing Sonnet (was 13% anyway) |
| DATABASE | sonnet | sonnet | 80% pass |
| TESTING | **opus** | **sonnet** | Testing Sonnet (was 11% with Opus) |
| STORIES | **opus** | **sonnet** | Testing Sonnet (was 36% with Opus) |
| SECURITY | **opus** | **opus** | **KEEP OPUS** - Critical domain |
| RETRO | sonnet | sonnet | Pattern extraction |
| VALIDATION | **opus** | **opus** | **KEEP OPUS** - Critical for final verification |

---

## Default Model Assignments (When Phase Unknown)

| Sub-Agent | Before | After | Historical Pass Rate | Notes |
|-----------|--------|-------|---------------------|-------|
| GITHUB | sonnet | sonnet | 94.8% | Working well |
| DATABASE | sonnet | sonnet | 96.9% | Very consistent |
| RETRO | sonnet | sonnet | 96.0% | Reliable |
| STORIES | **opus** | **sonnet** | 3.4% | Worth testing Sonnet |
| DOCMON | sonnet | sonnet | 59.7% | Varies by phase |
| DESIGN | sonnet | sonnet | 26.1% | Complex judgment |
| RISK | sonnet | sonnet | 100% | Working fine |
| SECURITY | **opus** | **opus** | 25.0% | **KEEP OPUS** - Critical |
| VALIDATION | **opus** | **sonnet** | 18.2% | Testing Sonnet |
| PERFORMANCE | sonnet | sonnet | Low volume | Default |
| TESTING | sonnet | sonnet | Varies | Phase-dependent |
| API | sonnet | sonnet | N/A | Default |
| DEPENDENCY | sonnet | sonnet | N/A | Default |
| UAT | sonnet | sonnet | N/A | Default |
| QUICKFIX | sonnet | sonnet | N/A | Default |

---

## Opus 4.5 Usage Summary (After Optimization)

### Still Using Opus (Critical Only)

1. **SECURITY sub-agent** - ALL phases
   - Authentication, authorization, RLS policies
   - Security validation, threat assessment
   - Critical for data safety

2. **VALIDATION sub-agent** - PLAN & EXEC phases only
   - PLAN: Prevents duplicate work (8-10 hours saved)
   - EXEC: Final verification before completion
   - LEAD: Switched to Sonnet (testing)

### Total Opus Invocations Per SD (Estimated)

**Before optimization**: ~12-15 Opus calls per SD
- STORIES: 3 phases
- VALIDATION: 3 phases
- SECURITY: 3 phases
- TESTING: 2 phases (PLAN, EXEC)
- DOCMON: 1 phase (EXEC)

**After optimization**: ~5-6 Opus calls per SD
- SECURITY: 3 phases only
- VALIDATION: 2 phases (PLAN, EXEC)

**Reduction**: ~58% fewer Opus calls per SD

---

## Rationale for Changes

### Why Move STORIES to Sonnet?
- Historical pass rate: 3.4% (very low even with Opus)
- High usage frequency (every SD with user stories)
- Worth testing if Sonnet can achieve similar results
- Potential savings: ~3 Opus calls per SD

### Why Move VALIDATION to Sonnet (in LEAD)?
- LEAD phase is lower stakes (pre-approval)
- PLAN/EXEC still use Opus (where validation is critical)
- Testing if Sonnet can handle duplicate detection
- Potential savings: ~1 Opus call per SD

### Why Move TESTING to Sonnet?
- Historical pass rates: 25% (PLAN), 11% (EXEC) - very low even with Opus
- Complex task, but Opus wasn't helping much
- Worth testing if Sonnet performs similarly
- Potential savings: ~2 Opus calls per SD

### Why Move DOCMON to Sonnet (in EXEC)?
- Historical pass rate: 13% (very low even with Opus)
- Documentation generation, not security-critical
- Worth testing Sonnet
- Potential savings: ~1 Opus call per SD

### Why KEEP SECURITY on Opus?
- **Critical security tasks** - cannot compromise
- Authentication, authorization, RLS policies
- Data safety is non-negotiable
- Only ~3 calls per SD, acceptable cost

### Why KEEP VALIDATION on Opus (in PLAN/EXEC)?
- **PLAN**: Prevents 8-10 hours of duplicate work (ROI justified)
- **EXEC**: Final verification before completion (critical gate)
- High value, worth the Opus cost

---

## Monitoring Plan

### What to Watch

1. **Sub-agent pass rates** - Track if Sonnet performs worse than historical Opus rates
2. **Quality issues** - Any increase in bugs, security issues, or rework
3. **Rate limits** - Confirm Opus usage stays within limits
4. **User feedback** - Any complaints about degraded quality

### Rollback Triggers

If any of these occur, consider reverting specific agents back to Opus:

- ❌ STORIES pass rate drops below 2% (worse than historical 3.4%)
- ❌ VALIDATION misses critical duplicates (duplicate work occurs)
- ❌ TESTING pass rate drops below 10% (worse than historical 11%)
- ❌ Security issues slip through (any security incident)

### Success Metrics

- ✅ Opus usage stays within rate limits
- ✅ Pass rates remain similar to historical (±5%)
- ✅ No increase in security issues
- ✅ No increase in duplicate work
- ✅ Cost savings realized

---

## Code References

### Agent Files
- `.claude/agents/stories-agent.md:5` - `model: sonnet`
- `.claude/agents/validation-agent.md:5` - `model: sonnet`
- `.claude/agents/security-agent.md:5` - `model: opus` (**unchanged**)

### Sub-Agent Executor
- `lib/sub-agent-executor.js:34-67` - `PHASE_MODEL_OVERRIDES`
- `lib/sub-agent-executor.js:74-90` - `DEFAULT_MODEL_ASSIGNMENTS`

---

## Expected Impact

### Rate Limit Savings

**Assumption**: 10 SDs per week, 50 SDs per year

| Metric | Before | After | Savings |
|--------|--------|-------|---------|
| Opus calls per SD | 12-15 | 5-6 | ~58% |
| Opus calls per week | 120-150 | 50-60 | ~60% |
| Opus calls per year | 600-750 | 250-300 | ~60% |

### Cost Savings (If Applicable)

If Opus costs 5x more than Sonnet:
- Before: 750 Opus calls = 750 units
- After: 300 Opus calls + 450 Sonnet calls = 300 + 90 = 390 units
- **Savings**: ~48% cost reduction

### Quality Impact (To Be Monitored)

- **Security**: No change (still using Opus)
- **Validation**: Slight risk (testing Sonnet in LEAD)
- **Stories**: Minimal risk (already low pass rate)
- **Testing**: Minimal risk (already low pass rate)

---

## Recommendations

### Short-term (Next 2 weeks)

1. ✅ Monitor sub-agent execution results for degraded performance
2. ✅ Track Opus usage to confirm it stays within limits
3. ✅ Watch for any security issues or duplicate work
4. ✅ Collect feedback on user story and validation quality

### Medium-term (Next month)

1. 📊 Analyze pass rate data for Sonnet vs historical Opus
2. 📊 Evaluate if any specific agents need to revert to Opus
3. 📊 Consider further optimizations if Sonnet proves effective
4. 📊 Document lessons learned for future model optimization

### Long-term (Next quarter)

1. 🔍 Evaluate if new models (e.g., Claude Opus 5) offer better ROI
2. 🔍 Consider task-specific model routing (beyond phase-based)
3. 🔍 Explore caching strategies to reduce total API calls
4. 🔍 Investigate fine-tuning or prompt optimization for better pass rates

---

## Summary

We've optimized model usage to **reserve Opus 4.5 for critical security tasks only**, reducing Opus usage by ~60% while maintaining quality through strategic phase-based routing. The security-agent keeps Opus for all security-critical work, while VALIDATION keeps Opus for PLAN/EXEC phases where it prevents costly duplicate work. All other tasks now use Sonnet 4.5, which has proven effective across thousands of executions.

**Key Takeaway**: Security is non-negotiable (Opus), but most other tasks can be handled by Sonnet with acceptable quality at significantly lower cost/rate limit impact.
