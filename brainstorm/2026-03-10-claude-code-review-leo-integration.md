# Brainstorm: Claude Code Review Integration into LEO Protocol

## Metadata
- **Date**: 2026-03-10
- **Domain**: Protocol
- **Phase**: Discovery
- **Mode**: Conversational
- **Outcome Classification**: Needs Triage (plan tier blocker — see Post-Discovery Finding)
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: All (cross-cutting protocol improvement)

---

## Problem Statement

LEO's current pipeline has no dedicated *code quality review* step. The `testing-agent` validates test results, `validation-agent` checks gate compliance, and `security-agent` is invoked ad hoc — but nobody systematically reviews PR diffs for bugs, logic errors, or code quality issues before merge. The existing `claude-agentic-review.yml` workflow checks LEO process compliance (SD linkage, boundary analysis, test coverage) but does not perform semantic code review.

With high SD cadence, parallel sessions, and AUTO-PROCEED enabled, PRs merge rapidly — often within seconds of creation. The user is the sole reviewer, creating a bottleneck that increases with pipeline velocity.

Anthropic's Claude Code Review (research preview, **Team/Enterprise plans only**) deploys multiple agents in parallel per PR, catches bugs, verifies findings to eliminate false positives (<1% false positive rate), ranks by severity, and delivers results as inline annotations. Cost: ~$15-25/PR average, scaling with complexity.

> **Post-Discovery Finding (2026-03-10):** Claude Code Review is **not available on the Max plan**. It requires a Team ($30/user/mo) or Enterprise plan, plus per-review token costs. The current setup is Max plan (individual). This makes the managed Code Review service inaccessible without a plan change. However, the free open-source [Claude Code GitHub Action](https://github.com/anthropics/claude-code-action) — which already powers the existing `claude-agentic-review.yml` workflow — remains available and can be enhanced to add semantic code review capabilities.

## Discovery Summary

### Current State
- **Existing review infrastructure**: `claude-agentic-review.yml` + `github-review-coordinator.js` already trigger on every PR (opened/synchronize). These check SD/PRD linkage, boundary analysis, test coverage, and activate sub-agents (security, database, performance, testing). This is *process compliance*, not *code quality review*.
- **No semantic review**: No system inspects the actual diff for logical bugs, error handling gaps, concurrency issues, or subtle regressions.
- **Sole reviewer bottleneck**: User is the only human reviewer. With 21+ PRs/day (832 in February), thorough review is impractical.
- **Small PR advantage**: LEO targets ≤100 LOC PRs, which limits blast radius and should reduce per-review cost.

### Integration Surface
- **Natural hook point**: `/ship` command (Step 4: PR creation, Step 6: auto-merge)
- **Complementary to existing coordinator**: Claude Code Review handles code quality; existing coordinator handles LEO process compliance. Both run on the same GitHub Actions trigger.
- **Zero-code option**: Enable Claude Code Review on the repo + set as required status check in branch protection. The `/ship` auto-merge via `gh pr merge` naturally respects required checks.

### Viable Alternative: Enhance Existing GitHub Action
Since the managed Code Review product requires Team/Enterprise, the **practical path** is to enhance the existing `claude-agentic-review.yml` + `github-review-coordinator.js` to add semantic code review:
- The open-source Claude Code GitHub Action already runs on every PR
- Add a **code quality review step** to the coordinator that analyzes the diff for logical bugs, error handling gaps, and code patterns
- Uses Max plan API credits (already paid for) rather than separate per-review billing
- Maintains LEO's "database is source of truth" by writing findings to `agentic_reviews` table
- Full control over review prompts, severity thresholds, and SD-type-specific review profiles

## Analysis

### Arguments For
1. **Fills the only quality gap in the pipeline** — LEO gates check process compliance (PRD exists, tests pass, stories complete) but nothing checks the code itself. This is the missing layer.
2. **Low implementation difficulty** — Existing `claude-agentic-review.yml` infrastructure, GitHub Actions triggers, and branch protection mechanics are already in place. Enabling Claude Code Review could be as simple as a repo setting.
3. **Feeds the learning system** — Review findings can pipe into `issue_patterns` and `root_cause_records` tables, creating a pre-merge quality signal that accumulates institutional knowledge.
4. **Small PRs = cost advantage** — LEO's ≤100 LOC target means cheaper reviews (31% finding rate for <50 LOC vs 84% for 1000+ LOC).
5. **Enables confidence-based auto-merge** — Clean PRs (no findings) merge instantly via AUTO-PROCEED; flagged PRs get routed to specialist sub-agents for remediation.

### Arguments Against
1. **Cost at volume** — 21+ PRs/day = 630+/month. At $15-25/PR = $9,450-$15,750/month at full volume. Even with path filtering (30-40% reduction), still $5,700-$11,000/month.
2. **AUTO-PROCEED timing conflict** — `/ship` currently creates PR and merges within seconds. Review runs asynchronously and takes minutes. Either merge blocks (stalls pipeline) or review completes after merge (useless).
3. **"Claude reviewing Claude" correlation risk** — AI-generated code has different defect patterns. Review agents from the same model family may share blind spots with the generation agent, creating false confidence.
4. **Gate fatigue** — With 22+ EXEC-TO-PLAN gates already, adding another review gate increases the chance of dismissing warnings without reading them.

## Protocol: Friction/Value/Risk Analysis

| Dimension | Sub-dimension | Score | Rationale |
|-----------|--------------|-------|-----------|
| **Friction Reduction** | Current friction level | 4/5 | Sole reviewer bottleneck on 21+ PRs/day |
| | Friction breadth | 4/5 | Affects every code-producing SD |
| | **Subtotal** | **8/10** | |
| **Value Addition** | Direct value | 4/5 | Catches bugs pre-merge, reduces rework |
| | Compound value | 4/5 | Feeds learning system, builds issue pattern library |
| | **Subtotal** | **8/10** | |
| **Risk Profile** | Breaking change risk | 1/5 | Additive — existing coordinator stays untouched |
| | Regression risk | 3/5 | AUTO-PROCEED flow needs careful handling |
| | **Subtotal** | **4/10** | |
| **Decision** | **(8 + 8) > 4 × 2 → 16 > 8** | | **IMPLEMENT** |

## Team Perspectives

### Challenger
- **Blind Spots**:
  1. No `EXEC_REVIEW` or `EXEC_REWORK` phase in the valid `current_phase` enum — rework loops have no state machine representation
  2. Two independent multi-agent systems (LEO sub-agents + Code Review agents) with overlapping concerns and no authority hierarchy — violates "database is source of truth" when findings split between Supabase and GitHub comments
  3. AUTO-PROCEED expects instant forward progress; review delays create an unrepresented "PR submitted, review pending" state
- **Assumptions at Risk**:
  1. $15-25/PR assumes normal PRs — LEO's high-context, low-LOC changes (migrations, RLS policies, schema modifications) may cost more
  2. <1% false positive rate measured on human-written code — Claude reviewing Claude-generated code may have correlated blind spots
  3. "No quality gate" overstates the gap — existing gates, test suites, pre-commit hooks, and PR size limits may already suppress most defect classes
- **Worst Case**: Review becomes a mandatory gate that intermittently blocks the pipeline, AUTO-PROCEED stalls, costs accrue per-PR regardless of value, and "Claude reviewing Claude" creates false confidence that displaces the imperfect-but-uncorrelated human reviewer

### Visionary
- **Opportunities**:
  1. Introduce a `review-agent` sub-agent type wrapping Claude Code Review — slots into existing rejection-subagent-mapping with `CODE_REVIEW_FAILED` and `CODE_QUALITY_BELOW_THRESHOLD` rejection codes
  2. Pipe findings into `issue_patterns` and `root_cause_records` tables — pre-merge quality signal that builds project-specific institutional knowledge per SD type
  3. Enable confidence-based auto-merge: clean PRs (review score >95%) merge instantly, flagged PRs auto-route to specialist sub-agents
- **Synergies**: Cross-SD quality accumulation via `sd_type_validation_profiles`, HEAL loop amplification (review findings as evidence for heal scoring), security-agent consolidation (continuous vs point-in-time), multi-session visibility (review results in DB visible across parallel sessions)
- **Upside Scenario**: Fully autonomous quality pipeline within 60 days — zero human-reviewed PRs for Tier 1/2 work, 200+ issue patterns generated from actual findings, review-triggered SD creation for recurring code quality issues

### Pragmatist
- **Feasibility**: 3/10 difficulty — existing `claude-agentic-review.yml` and `github-review-coordinator.js` are the integration surface; hardest part is already done
- **Resource Requirements**: 2-4 hours engineering (enable + path filters), 4-8 hours protocol (gate auto-merge on review status), Team/Enterprise Claude plan required
- **Constraints**:
  1. Volume-driven cost (~630 PRs/month at current velocity)
  2. AUTO-PROCEED instant-merge conflicts with async review
  3. False positive impact on velocity (~6 false blocks/month at <1% rate)
- **Recommended Path**: 4-step rollout over 3 weeks:
  1. Day 1: Enable Claude Code Review on repo (zero code changes)
  2. Day 1-2: Add path filters to reduce review volume 30-40%
  3. Day 3-5: Set review as required status check in branch protection
  4. Week 2+: Evaluate after ~140 PRs, decide blocking vs advisory mode

### Synthesis
- **Consensus Points**: All three agree `/ship` is the natural integration point, AUTO-PROCEED timing is the critical design decision, and cost-at-volume is the primary constraint
- **Tension Points**: Challenger warns "Claude reviewing Claude" has correlated blind spots vs Visionary's fully autonomous pipeline; Challenger says existing gates may suffice vs Visionary identifying semantic code quality as the biggest pipeline gap; Pragmatist rates 3/10 difficulty vs Challenger implying state machine changes make it harder
- **Composite Risk**: Medium — implementation is easy but cost management and AUTO-PROCEED reconciliation require careful design

## Open Questions
1. ~~**Plan tier**: Is the current Claude plan Team/Enterprise? (Required for Code Review access)~~ **RESOLVED: Max plan — Code Review not available.**
2. **Cost tolerance**: What monthly budget is acceptable for automated review? (Moot if using existing GitHub Action — covered by Max plan)
3. **Blocking vs advisory**: Should review findings block merge (higher quality, slower pipeline) or be advisory-only (maintains velocity, lower enforcement)?
4. **Scope filtering**: Which file paths should trigger review? (Code only? Include migrations? Exclude config/docs?)
5. **GitHub Action review quality**: Can the open-source Claude Code GitHub Action achieve comparable semantic review quality to the managed Code Review product?

## Suggested Next Steps (Revised)

### Path A: Enhance Existing Review Infrastructure (Recommended)
1. **Audit `github-review-coordinator.js`** — map current checks (linkage, boundaries, coverage) and identify where to add semantic code review
2. **Add code quality review step** to the coordinator — analyze diff for logical bugs, error handling, security patterns using the Claude Code GitHub Action
3. **Create `review-agent` sub-agent** — wraps the enhanced coordinator, adds `CODE_REVIEW_FAILED` rejection code to existing sub-agent routing
4. **Pipe findings to `issue_patterns`** — build institutional knowledge from review findings
5. **Create SD** for the enhancement work

### Path B: Upgrade to Team Plan (If Budget Allows)
1. **Upgrade to Claude Team plan** ($30/user/mo + per-review token costs)
2. **Enable managed Code Review** on the repo
3. Follow original integration plan (advisory → blocking → learning loop)
4. **Estimated additional cost**: $30/mo subscription + $3K-8K/mo reviews = $3K-8K/mo total

### Recommendation
**Path A** — the existing infrastructure is already 80% there, uses credits already paid for, and gives full control over review behavior. Path B only makes sense if Team plan is needed for other reasons.
