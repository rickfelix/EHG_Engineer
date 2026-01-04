# Triangulation Synthesis: Scaffolding Remediation Strategic Directives

**Date**: 2026-01-04
**Status**: Chairman Approved
**Participants**: OpenAI (ChatGPT), AntiGravity (Gemini), Claude (Opus 4.5)

---

## Executive Summary

Three AI models independently reviewed 8 proposed Strategic Directives for scaffolding remediation. The triangulation identified significant consensus on priorities, revealed divergent views on scope, and resulted in a refined SD structure approved by the Chairman.

**Key Outcome**: LEO Protocol v4.4.0 was implemented during this session to prevent future scaffolding by requiring human-verifiable outcomes for feature SDs.

---

## The Three Perspectives

| Model | Overall Stance | Key Insight |
|-------|----------------|-------------|
| **OpenAI** | Structurally sound, needs guardrails | "Add Execution Contracts SD to prevent re-scaffolding" |
| **Gemini** | Necessary and correct, trim scope | "Focus on logic, not UI - buy vs build consideration" |
| **Claude** | Too much scaffolding-to-fix-scaffolding | "Build only what's needed NOW, delete the rest" |

---

## Points of Consensus (All 3 Agree)

### 1. P0 Foundation Work is Correct
All three agree: fix foundations before building features.
- ✅ Cleanup/Truth-Labeling should be P0
- ✅ Sub-agent audit is critical

### 2. SD-FINANCIAL-ENGINE-001 is the Real Venture Opportunity

| Model | Assessment |
|-------|------------|
| OpenAI | "Highest venture potential if you build for auditability" |
| Gemini | "YES. High potential. Founders love idea/build, hate finance." |
| Claude | "HIGH - This is the one SD to build with productization in mind" |

**CONSENSUS**: Financial Engine is P1-HIGH, build with venture mindset

### 3. Legal Generator is High Risk

| Model | Recommendation |
|-------|----------------|
| OpenAI | "Research First, leaning defer. Template assembly, not generation." |
| Gemini | "Use Termly or Iubenda APIs. Saves 4 weeks of high-risk dev." |
| Claude | "Don't build this. Use Clerky or an actual lawyer." |

**CONSENSUS**: High liability risk - needs research before committing

### 4. Third-Party APIs Will Dominate Timelines
All three warn about integration maintenance burden for solo operator.

### 5. Effort Estimates are Optimistic

| SD | Original | OpenAI | Gemini | Claude |
|----|----------|--------|--------|--------|
| Content Forge | 6 weeks | Optimistic | Pessimistic (reduce to 3) | Fantasy |
| Sub-Agent Audit | 2 weeks | Optimistic | Optimistic | Wildly optimistic |
| Financial Engine | 4 weeks | Optimistic | Optimistic | Achievable if constrained |

### 6. Split Marketing Automation
All three recommend splitting Scheduler from ROI Dashboard.

---

## Points of Divergence

### 1. Content Forge Priority

| Model | Priority | Reasoning |
|-------|----------|-----------|
| OpenAI | P1, but vertical slice first | Build V0 in 5-10 days |
| Gemini | P1, but reduce scope to 3 weeks | "Could use Custom GPT instead" |
| Claude | P2 or Research First | "Which venture needs this TODAY?" |

**Chairman Decision**: **P1** - "The whole purpose of EHG is to be a venture factory. I want all factory components in place before building ventures."

### 2. Naming Engine Venture Potential

| Model | Assessment |
|-------|------------|
| OpenAI | "Underestimated venture potential" |
| Gemini | "LOW - market saturated (Namelix). Keep internal." |
| Claude | "LOW - saturated market, one-time use" |

**Chairman Decision**: Keep at P1. "Easy win as a proof of concept pilot test, not a committed venture."

### 3. Marketing Automation Approach

| Model | Recommendation |
|-------|----------------|
| OpenAI | Split into two SDs, defer posting APIs |
| Gemini | Build generator, manual posting first |
| Claude | Cut entirely, use Buffer |

**Chairman Decision**: **P1 + Research Needed**. Evaluate: copy/paste vs API vs computer-use automation.

---

## Unique Insights (Only One Model Raised)

### OpenAI Only
- **Artifact store concept**: Where do generated outputs live? Versioning? Audit trail?
- **CI/CD truth enforcement**: Automated checks preventing scaffold-only merges
- **Break Genesis into primitives**: Artifact lifecycle, decision gates, workflow runner

### Gemini Only
- **Buy vs Build for Content Forge**: Custom GPT with Brand Genome uploaded = 2 days
- **Buy vs Build for Legal**: Termly/Iubenda = $10/mo, saves 4 weeks
- **Manual approval first for Scheduler**: Don't auto-post, build review queue only
- **Customer Support agent missing**: Plans focus on building, not operating

### Claude Only
- **Customer zero problem**: Which venture will USE these features?
- **Maintenance burden**: Solo operator can't maintain 10 integrations
- **Rollback plan**: If Content Forge ships badly, can we remove it?

---

## LEO Protocol v4.4.0 Implementation

During this triangulation session, a critical gap was identified: **the LEO Protocol optimized for gate pass rate, not working software**.

### Problem Identified
> "The current plan optimizes for completing SDs rather than delivering working software. Every SD should have a smoke test that a non-technical person could run to verify it works."

### Solution Implemented

| Phase | Who | Gate | Tool |
|-------|-----|------|------|
| Specification | Claude (LEAD) | SMOKE_TEST_SPECIFICATION | Blocks if smoke_test_steps empty |
| Execution | UAT Agent (EXEC) | HUMAN_VERIFICATION_GATE | Playwright MCP + LLM UX Oracle |

### SD Type Configuration

| SD Type | Requires Verification | Type |
|---------|----------------------|------|
| feature | ✅ YES | ui_smoke_test |
| bugfix | ✅ YES | ui_smoke_test |
| security | ✅ YES | api_test |
| database | ✅ YES | api_test |
| performance | ✅ YES | api_test |
| infrastructure | ❌ NO | - |
| documentation | ❌ NO | - |
| refactor | ❌ NO | - |
| orchestrator | ❌ NO | - |

**Key Principle**: Scaffolding blocked at LEAD, not discovered at EXEC.

---

## Final SD Structure (Chairman Approved)

### P0 - Immediate (Foundation)

| SD | Title | Effort | Notes |
|----|-------|--------|-------|
| SD-TRUTH-LABELING-001 | Platform Truth Labeling & Documentation | 2-3 days | Renamed from CLEANUP. Goal is honesty. |
| SD-SUBAGENT-AUDIT-001 | Sub-Agent Audit & Deprecation | 3-5 days | Audit only. Delete by default. |

### P1 - Factory Components

| SD | Title | Effort | Notes |
|----|-------|--------|-------|
| SD-CONTENT-FORGE-IMPL-001 | Content Forge API Implementation | 6 weeks | Factory must be complete. LLM: OpenAI + Gemini. |
| SD-MARKETING-AUTOMATION-001 | Marketing Content Distribution | 4 weeks | Pending research on approach. |
| SD-NAMING-ENGINE-001 | Venture Naming Generation Engine | 4 weeks | Internal use + pilot venture test. |
| SD-FINANCIAL-ENGINE-001 | Financial Modeling Engine | 4 weeks | HIGH venture potential. Build with productization mindset. |

### Research First

| SD | Title | Research Question |
|----|-------|-------------------|
| SD-LEGAL-GENERATOR-001 | Legal Document Generator | Is this our problem to solve? |

### Not Creating Yet

| SD | Reason |
|----|--------|
| SD-GENESIS-STAGES-001 | Wait until factory components are proven |

---

## Research Topics Queued

### 1. Marketing Automation Approach
**Question**: What's the best way to distribute content to social platforms?

| Option | Description |
|--------|-------------|
| A | Generate content → Chairman copy/paste manually |
| B | Direct API integration to platforms |
| C | Computer use automation (Claude) |
| D | Third-party tool API (Buffer) |

### 2. Naming Engine Trademark Liability
**Question**: How do we provide trademark guidance without creating liability?

| Option | Description |
|--------|-------------|
| A | Disclaimer-only ("consult a lawyer") |
| B | Pre-screen with explicit limitations |
| C | Partner with trademark search service |
| D | Skip trademark entirely, domain-only |

### 3. Legal Generator Scope
**Question**: Is legal document generation even our problem to solve?

| Option | Description |
|--------|-------------|
| A | Skip entirely - ventures use Clerky/Stripe Atlas |
| B | Template library only (no generation) |
| C | Partner with legal service provider |
| D | Build minimal with heavy disclaimers |

---

## Triangulation Response Archives

### OpenAI Response Summary

**Top 3 Concerns**:
1. You'll repeat the scaffolding mismatch unless you add enforcement
2. Third-party integrations will dominate timelines
3. Large SDs without vertical slices create long feedback loops

**Top 3 Strengths**:
1. Clear prioritization of foundation work before features
2. Good dependency awareness
3. Explicit recognition of research-first domains

**Key Recommendation**: Add "Execution Contracts & Anti-Scaffolding Guardrails" SD (P0)

### Gemini Response Summary

**Top 3 Concerns**:
1. Hidden complexity of sub-agent consolidation
2. Content Forge scope creep
3. Third-party API maintenance

**Top 3 Strengths**:
1. Honest grounding - admits scaffolding is not code
2. Financial Engine strategy identification
3. Clear deferral of Genesis 11-25

**Key Recommendation**: Buy vs build analysis for Content Forge, Legal Generator

### Claude Response Summary

**Top 3 Concerns**:
1. Building 6 weeks of scaffolding to replace scaffolding
2. "Research First" is procrastination for Legal
3. Sub-agent "completion" is wrong goal - should delete unknown agents

**Top 3 Strengths**:
1. Financial Engine identification as real venture opportunity
2. P0 foundation before features is correct
3. Honest assessment of scaffolding problem

**Key Recommendation**: Customer zero for every feature; maintenance burden consideration

---

## Chairman Decisions Log

| Topic | Triangulation Recommendation | Chairman Decision | Rationale |
|-------|------------------------------|-------------------|-----------|
| Content Forge Priority | P2 (defer) | **P1** | Factory must be complete before ventures |
| Marketing Automation | Skip or manual | **P1 + Research** | Important, but need to evaluate approach |
| Naming Engine | P1, low venture potential | **P1** | Easy pilot test venture, not committed |
| Legal Generator | Skip entirely | **Research First** | May not be our problem |
| Genesis Stages | P2/Defer | **No SD yet** | Wait until factory proven |
| Sub-Agent Completion | Split audit from completion | **Agreed** | Audit only at P0, complete when needed |

---

## Next Steps

1. ✅ Save triangulation synthesis (this document)
2. ⏳ Add approved SDs to database via database sub-agent
3. ⏳ Create research prompts for 3 topics needing triangulation
4. ⏳ Execute P0 SDs (Truth-Labeling, Sub-Agent Audit)

---

## Appendix: Full AI Responses

Full responses archived separately:
- `docs/research/triangulation-scaffolding-openai-response.md`
- `docs/research/triangulation-scaffolding-gemini-response.md`
- `docs/research/triangulation-scaffolding-claude-response.md`

---

*Document generated: 2026-01-04*
*Triangulation Method: Independent analysis → Synthesis → Chairman approval*
*LEO Protocol Version: 4.4.0 (Human-Verifiable Outcomes)*
