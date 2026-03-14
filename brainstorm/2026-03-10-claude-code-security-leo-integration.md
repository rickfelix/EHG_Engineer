# Brainstorm: Claude Code Security Integration into LEO Protocol

## Metadata
- **Date**: 2026-03-10
- **Domain**: Protocol
- **Phase**: Discovery
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: ListingLens AI, MindStack AI (shared Supabase backend affected)
- **Source**: https://www.anthropic.com/news/claude-code-security

---

## Problem Statement

LEO's current 5-layer security system (sub-agent, GitHub Actions, plan supervisor gates, npm audit observer, baseline tracking) is robust for pattern-based vulnerability detection — SQL injection, hardcoded secrets, missing RLS policies, eval usage. However, it cannot reason about business logic vulnerabilities: authentication bypass through state manipulation, IDOR via predictable IDs, race conditions in concurrent SD execution, or privilege escalation through the chairman gate workflow. These context-dependent vulnerabilities require human-like reasoning that pattern matching fundamentally cannot provide.

Anthropic's Claude Code Security — announced 2026-03-10 in limited research preview — fills exactly this gap: AI-powered static analysis that reads and reasons about code like a human security researcher. Anthropic found 500+ vulnerabilities in production open-source codebases using this approach.

## Discovery Summary

### Current Security Stack
| Layer | What It Does | Gap |
|-------|-------------|-----|
| Security sub-agent (5-phase) | Auth, authz, input validation, secrets, RLS pattern checks | Pattern-based only — no reasoning about logic flows |
| security-review.yml | PR-level security scan, inline comments | Same pattern engine, applied at PR boundary |
| credential-scan.yml | Scans for leaked credentials | Narrow scope — only credentials |
| rls-verification.yml | Validates RLS policy presence/syntax | Syntax, not semantics — can't detect policy gaps from joins |
| npm audit observer | Auto-proposes SDs for dependency vulns | Third-party deps only, not first-party code |

### Claude Code Security Capabilities
- AI reasoning-based static analysis (not pattern matching)
- Attempts to prove/disprove findings (reduces false positives)
- Severity and confidence ratings per finding
- Targeted patch suggestions for human review
- No changes without human approval

### Integration Scope
User selected: **All phases** — EXEC (during implementation), gate boundaries (handoff checks), and periodic full-codebase scans.

## Analysis

### Arguments For
1. **Fills the reasoning gap** — Business logic vulnerabilities (IDOR, auth bypass, race conditions) require human-like reasoning. Current checks are pattern-based and miss these entirely.
2. **Security attestation as enterprise asset** — Signed security records per SD create auditable trails for ventures seeking investment or enterprise customers.
3. **RLS drift detection** — Multi-venture shared Supabase backend means RLS complexity compounds. AI reasoning catches semantic policy gaps (e.g., foreign key join implicit write paths) that syntax checks miss.
4. **Low marginal implementation cost** — LEO has the scaffolding (sub-agent framework, gate pipeline, GitHub Actions). Estimated ~5-6 days of engineering once API access is granted.

### Arguments Against
1. **Preview-stage API stability** — LEO's automated handoff system needs deterministic tooling. Preview API may change output schemas between releases.
2. **Gate deadlock risk** — AI-reasoning findings in AUTO-PROCEED mode create a failure mode with no existing remediation path. Sessions hold claims, can't auto-resolve, and SDs enter stale loops.
3. **Finding attribution gap** — No database schema for security findings as first-class records. Dismissed findings have no audit trail.
4. **Alert fatigue from duplication** — Without dedup logic between 5-phase sub-agent and Claude Code Security, engineers see the same issues flagged multiple times.

## Friction/Value/Risk Analysis

| Dimension | Score | Details |
|-----------|-------|---------|
| Friction Reduction | 7/10 | Pattern tools have diminishing returns (see: 16 linter findings SD). Manual review is only backstop for novel vulns. Affects 40-60% of SDs. |
| Value Addition | 8/10 | Novel vuln detection in multi-tenant Supabase. Security attestations for enterprise sales. Institutional memory via findings table. |
| Risk Profile | 5/10 | Preview API instability. Gate deadlock scenario. Dedup complexity. Claim system doesn't model async scans. |
| **Decision** | **(7+8)=15 > (5×2)=10** | **IMPLEMENT — phased rollout** |

## Team Perspectives

### Challenger
- **Blind Spots**:
  1. Handoff gate sequencing — AI findings aren't binary pass/fail; LEO gates assume deterministic checks with 2-retry logic
  2. Claim system collision — periodic scans have no SD boundary, can analyze mid-commit code held by another session
  3. Novel vulnerability attribution — no audit trail for dismissed findings; no `sd_phase_handoffs` column for security findings
- **Assumptions at Risk**:
  1. Pattern-matching and AI reasoning coverage may overlap significantly, not be purely additive
  2. Preview API stability insufficient for LEO's automated handoff contract
  3. Full-codebase scan findings don't map to workable SDs without classification/routing logic
- **Worst Case**: Gate deadlock — AI finding blocks handoff, AUTO-PROCEED can't resolve, claim held permanently, SD enters stale loop

### Visionary
- **Opportunities**:
  1. Security as handoff gate with ERR_SECURITY_REQUIRED rejection code and self-healing remediation
  2. RLS drift detection as scheduled CronJob diffing policies against SD-completion baselines
  3. Cross-SD security continuity via `security_findings_v1` table linked to sd_key and file paths
- **Synergies**:
  - Chairman governance: security posture as named dimension in advisory_data JSONB
  - Stage audit backlog: unified prioritization (UX debt + attack surface)
  - EVA intake: preliminary security review at venture proposal stage
- **Upside Scenario**: Security becomes a continuous protocol property. Every SD produces a signed attestation. Chairman gates include auditable security clearance. EHG produces machine-generated audit trails as enterprise sales differentiator.

### Pragmatist
- **Feasibility**: 4/10 (moderate — mostly blocked by external API access, not technical complexity)
- **Resource Requirements**: ~5-6 days engineering, 1 new Supabase table, 1 new env var, no new infrastructure
- **Constraints**:
  1. API access is external dependency — don't start implementation until confirmed
  2. AI-reasoning scan adds 30-120s latency to handoffs if run synchronously — need timeout/async strategy
  3. Dedup strategy must be decided upfront: replace specific sub-agent phases or augment with dedup logic
- **Recommended Path**:
  1. Request preview access (this week)
  2. Spike against PLAN-TO-EXEC handoff gate as advisory-only (week 1-2 post-access)
  3. Promote to hard-fail + add EXEC hook (week 3-4)
  4. Periodic full-codebase scan via CronCreate (week 5)

### Synthesis
- **Consensus Points**: API access is the gate; dedup with existing sub-agent is critical; periodic scans need SD routing
- **Tension Points**: Speed of rollout (phased vs all-at-once), replace vs augment existing phases, hard-fail vs advisory gate model
- **Composite Risk**: Medium

## Out of Scope
- Replacing the existing security sub-agent entirely (augment first, evaluate later)
- Building a custom vulnerability scanner (leverage Anthropic's tool, don't compete with it)
- Changing the chairman governance model (consume security signal, don't restructure governance)
- Security scanning of the EHG app frontend codebase (separate repo, separate SD)

## Open Questions
1. What is the actual API contract for Claude Code Security? (Blocked on preview access)
2. What is the pricing model? (Needed for cost-benefit at scale with periodic scans)
3. Can open-source maintainer access apply to EHG ventures? (Potentially free expedited access)
4. How does the tool handle Supabase-specific patterns (RLS, Edge Functions, pg_net)? Need to evaluate coverage.
5. What is the false-positive rate in a codebase already protected by pattern-based tools?

## Suggested Next Steps
1. **Apply for preview access** at claude.com/contact-sales/security (or open-source maintainer path)
2. **Create DRAFT SD** (`SD-LEO-INFRA-CLAUDE-CODE-SECURITY-001`) to reserve work slot
3. **Design `security_findings_v1` table schema** — linked to sd_key, file paths, session, with severity/confidence/status
4. **Define dedup strategy** — map existing 5-phase sub-agent checks to Claude Code Security coverage areas
5. **Prototype advisory gate** — once access granted, run against recent PRs to measure signal quality before enforcement
