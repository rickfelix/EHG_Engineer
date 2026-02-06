# Hierarchical Swarm Architecture for LEO Protocol

**Created**: 2026-02-02
**Status**: Design Ready (awaiting Claude Code Swarm release)
**Depends On**: [Swarm Mode Readiness Rubric](./swarm-mode-readiness-rubric.md)

## Executive Summary

This document designs a **hierarchical swarm architecture** where:
1. **Board of Directors**: Each critic persona (Skeptic, Pragmatist, Visionary) becomes a lead agent orchestrating their own specialist swarm
2. **Sub-Agents**: High-frequency sub-agents (DATABASE, TESTING, RCA, VALIDATION) each orchestrate domain-specific micro-swarms

The result: **Swarms within swarms** - dramatically increasing intelligence depth at critical decision points.

---

## Current Architecture (Single-Agent Model)

```
Board of Directors (3 Critic Personas)
├── Skeptic      → Single model, single perspective
├── Pragmatist   → Single model, single perspective
└── Visionary    → Single model, single perspective

Sub-Agents (30+)
├── DATABASE     → Single agent, broad scope
├── TESTING      → Single agent, broad scope
├── RCA          → Single agent, sequential analysis
├── VALIDATION   → Single agent, linear search
└── ...
```

**Limitations**:
- Each persona has a single viewpoint (no internal debate)
- Sub-agents are generalists covering broad domains
- Context pollution from switching between specialties
- Sequential processing bottlenecks

---

## Proposed Architecture: Hierarchical Swarms

### Level 1: Board of Directors Swarms

Each critic persona becomes a **Lead Agent** orchestrating specialist advisors:

```
BOARD OF DIRECTORS
│
├── THE SKEPTIC (Lead Agent)
│   │   Focus: Safety, risks, unintended consequences
│   │
│   ├── Security Analyst
│   │   └── Threat modeling, vulnerability assessment
│   │
│   ├── Failure Mode Analyst
│   │   └── Edge cases, cascading failures, FMEA
│   │
│   ├── Evidence Auditor
│   │   └── Claims verification, source validation
│   │
│   └── Regression Specialist
│       └── Breaking changes, backward compatibility
│
├── THE PRAGMATIST (Lead Agent)
│   │   Focus: Feasibility, implementation, value delivery
│   │
│   ├── Resource Estimator
│   │   └── LOC estimates, time complexity, dependencies
│   │
│   ├── Technical Debt Analyst
│   │   └── Maintenance burden, code health impact
│   │
│   ├── Integration Specialist
│   │   └── System boundaries, API contracts, migrations
│   │
│   └── Incremental Delivery Planner
│       └── MVP scoping, phase breakdown, milestones
│
└── THE VISIONARY (Lead Agent)
    │   Focus: Strategic alignment, innovation, long-term impact
    │
    ├── Strategic Alignment Analyst
    │   └── Business goals, roadmap fit, priority alignment
    │
    ├── Innovation Scout
    │   └── Novel approaches, emerging patterns, industry trends
    │
    ├── Systemic Impact Modeler
    │   └── Ripple effects, ecosystem changes, network effects
    │
    └── Future-Proofing Advisor
        └── Extensibility, scalability, evolution paths
```

### Level 2: Sub-Agent Swarms

Each high-frequency sub-agent becomes a **Lead Agent** with domain specialists:

```
DATABASE SUB-AGENT SWARM
│
├── Schema Architect (Lead)
│   └── Table design, normalization, relationships
│
├── Migration Specialist
│   └── ALTER statements, rollback plans, zero-downtime
│
├── RLS Policy Expert
│   └── Row-level security, policy composition, testing
│
├── Query Optimizer
│   └── Index design, query plans, N+1 detection
│
└── Data Integrity Analyst
    └── Constraints, triggers, consistency checks

---

TESTING SUB-AGENT SWARM
│
├── Test Strategy Lead (Lead)
│   └── Coverage planning, test pyramid, risk-based selection
│
├── Unit Test Specialist
│   └── Jest patterns, mocking, isolation
│
├── Integration Test Expert
│   └── API testing, database tests, service boundaries
│
├── E2E Automation Engineer
│   └── Playwright flows, user journeys, visual regression
│
├── Test Data Engineer
│   └── Fixtures, factories, data generation
│
└── Coverage Analyst
    └── Gap detection, mutation testing, branch analysis

---

RCA SUB-AGENT SWARM
│
├── Investigation Lead (Lead)
│   └── Coordinates analysis, synthesizes findings
│
├── Log Analyst
│   └── Log parsing, timeline reconstruction, correlation
│
├── Pattern Matcher
│   └── Similar incidents, known issues, historical patterns
│
├── 5-Whys Facilitator
│   └── Causal chain analysis, root cause drilling
│
├── Timeline Reconstructor
│   └── Event sequencing, state transitions, trigger points
│
└── CAPA Generator
    └── Corrective actions, preventive measures, verification

---

VALIDATION SUB-AGENT SWARM
│
├── Codebase Analyst (Lead)
│   └── Coordinates search, prioritizes findings
│
├── Duplicate Detector
│   └── Similar code patterns, near-duplicates, copy-paste
│
├── Conflict Analyzer
│   └── Naming conflicts, import collisions, merge issues
│
├── Integration Verifier
│   └── Cross-module dependencies, interface contracts
│
└── Implementation Auditor
    └── Existing solutions, library availability, reuse opportunities
```

---

## Swarm Communication Patterns

### Pattern 1: Fire-and-Forget (Board Advisors)

```
Skeptic Lead
    │
    ├──► Security Analyst ────┐
    ├──► Failure Mode Analyst ──┼──► Parallel Execution
    ├──► Evidence Auditor ──────┤
    └──► Regression Specialist ─┘
                                │
                                ▼
                        Skeptic Lead Merges Results
                                │
                                ▼
                        Skeptic's Final Assessment
```

**Coordination**: Shared task board, no inter-advisor messaging
**Merge Strategy**: Lead synthesizes all advisor outputs into unified critique

### Pattern 2: Progressive Refinement (RCA Swarm)

```
Investigation Lead
    │
    ├──► Log Analyst ────────────┐
    │                            │
    │   [Findings from logs]     │
    │         ▼                  │
    ├──► Timeline Reconstructor ─┤
    │                            │
    │   [Sequenced events]       │
    │         ▼                  │
    ├──► Pattern Matcher ────────┤
    │                            │
    │   [Similar incidents]      │
    │         ▼                  │
    └──► 5-Whys Facilitator ─────┘
                │
                ▼
        Investigation Lead
                │
                ▼
        CAPA Generator
                │
                ▼
        Final RCA Report
```

**Coordination**: Sequential handoffs with context enrichment
**Merge Strategy**: Each stage builds on previous findings

### Pattern 3: Competitive Analysis (Validation Swarm)

```
Codebase Analyst Lead
    │
    ├──► Duplicate Detector ─────┬──► Race to find matches
    ├──► Implementation Auditor ─┤
    └──► Integration Verifier ───┘
              │
              ▼
    First 3 Findings Win
              │
              ▼
    Conflict Analyzer (validates)
              │
              ▼
    Final Validation Report
```

**Coordination**: Parallel search, early termination on match
**Merge Strategy**: First N valid findings, deduplicated

---

## Intelligence Amplification Analysis

### Board of Directors: Before vs After

| Aspect | Current (Single Agent) | With Swarm (4 Advisors Each) |
|--------|----------------------|------------------------------|
| Perspectives | 1 per persona | 4 per persona |
| Depth | Generalist | Domain specialists |
| Context | Shared, polluted | Isolated, focused |
| Speed | Sequential | Parallel |
| Blind spots | Many | Reduced (multiple viewpoints) |

**Intelligence Multiplier**: ~4x deeper analysis per persona = **12x total for board**

### Sub-Agents: Before vs After

| Sub-Agent | Current Depth | With Swarm | Intelligence Gain |
|-----------|--------------|------------|-------------------|
| DATABASE | 1 generalist | 5 specialists | 5x |
| TESTING | 1 generalist | 6 specialists | 6x |
| RCA | 1 sequential | 6 parallel | 4x (depth + speed) |
| VALIDATION | 1 linear | 5 parallel | 3x (speed) + 2x (coverage) |

---

## Implementation Priority

### Phase 1: Board of Directors Swarms (Highest Impact)

**Why First**: Governance decisions affect all SDs. Smarter board = better filtering.

| Persona | Advisors | Implementation Order |
|---------|----------|---------------------|
| Skeptic | Security, Failure Mode, Evidence, Regression | 1st (safety-critical) |
| Pragmatist | Resource, Tech Debt, Integration, Incremental | 2nd (feasibility) |
| Visionary | Strategic, Innovation, Systemic, Future-Proof | 3rd (strategy) |

**Expected Outcome**:
- Fewer false positives (bad proposals approved)
- Fewer false negatives (good proposals rejected)
- Richer feedback for proposal refinement

### Phase 2: High-Frequency Sub-Agent Swarms

**Why Second**: These agents are invoked most often.

| Sub-Agent | Frequency | Swarm Priority |
|-----------|-----------|----------------|
| TESTING | Every EXEC | P0 |
| DATABASE | Every schema change | P0 |
| VALIDATION | Every new SD | P1 |
| RCA | Every failure | P1 |

### Phase 3: Remaining Sub-Agents

Extend swarm pattern to other sub-agents based on usage metrics.

---

## Database Schema Extensions

### New Tables for Swarm Tracking

```sql
-- Track swarm compositions
CREATE TABLE swarm_compositions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_agent_type TEXT NOT NULL,  -- 'board_skeptic', 'subagent_database', etc.
  lead_agent_id TEXT NOT NULL,
  composition JSONB NOT NULL,  -- Array of advisor configs
  version TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Track individual advisor executions
CREATE TABLE swarm_advisor_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  swarm_composition_id UUID REFERENCES swarm_compositions(id),
  execution_context_id UUID,  -- Links to proposal_id, sd_id, etc.
  advisor_role TEXT NOT NULL,
  model_used TEXT NOT NULL,
  input_context JSONB,
  output JSONB,
  execution_time_ms INTEGER,
  tokens_used INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Aggregate swarm results
CREATE TABLE swarm_synthesis_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  swarm_composition_id UUID REFERENCES swarm_compositions(id),
  execution_context_id UUID,
  lead_agent_synthesis JSONB,  -- Lead's merged output
  advisor_outputs JSONB[],      -- Array of individual outputs
  consensus_score INTEGER,
  total_execution_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Views for Swarm Analytics

```sql
-- Swarm effectiveness by lead agent type
CREATE VIEW v_swarm_effectiveness AS
SELECT
  sc.lead_agent_type,
  COUNT(DISTINCT ssr.id) as total_executions,
  AVG(ssr.consensus_score) as avg_consensus,
  AVG(ssr.total_execution_time_ms) as avg_execution_time,
  COUNT(DISTINCT sae.advisor_role) as avg_advisors_used
FROM swarm_compositions sc
JOIN swarm_synthesis_results ssr ON sc.id = ssr.swarm_composition_id
JOIN swarm_advisor_executions sae ON sc.id = sae.swarm_composition_id
GROUP BY sc.lead_agent_type;
```

---

## Swarm Prompts: Board Advisor Templates

### Skeptic's Security Analyst Prompt

```markdown
You are the **Security Analyst** advisor to The Skeptic on the LEO Protocol Board.

**Your Focus**: Identify security vulnerabilities, threat vectors, and attack surfaces.

**Context Provided**:
- Proposal summary and scope
- Affected components list
- Risk level assessment

**Your Task**:
1. Identify potential security risks in the proposal
2. Assess authentication/authorization implications
3. Check for data exposure risks
4. Evaluate input validation requirements
5. Consider supply chain risks (dependencies)

**Output Format**:
```json
{
  "security_risks": [
    { "risk": "...", "severity": "critical|high|medium|low", "mitigation": "..." }
  ],
  "requires_security_review": true|false,
  "confidence": 0-100
}
```

**Constraints**:
- Focus ONLY on security aspects
- Do not evaluate business value or feasibility
- Be thorough but avoid false positives
```

### Pragmatist's Resource Estimator Prompt

```markdown
You are the **Resource Estimator** advisor to The Pragmatist on the LEO Protocol Board.

**Your Focus**: Estimate implementation resources, complexity, and timeline.

**Context Provided**:
- Proposal summary and scope
- Technical approach (if available)
- Affected components

**Your Task**:
1. Estimate lines of code (LOC)
2. Identify required skills/expertise
3. Assess dependency complexity
4. Estimate calendar time (with caveats)
5. Flag resource constraints or blockers

**Output Format**:
```json
{
  "loc_estimate": { "min": N, "max": N, "confidence": "high|medium|low" },
  "complexity": "trivial|simple|moderate|complex|very_complex",
  "required_skills": ["...", "..."],
  "dependencies": ["...", "..."],
  "blockers": ["...", "..."],
  "confidence": 0-100
}
```

**Constraints**:
- Focus ONLY on resource/feasibility aspects
- Do not evaluate security or strategic value
- Provide ranges, not point estimates
```

---

## Swarm Prompts: Sub-Agent Advisor Templates

### Database Swarm: RLS Policy Expert Prompt

```markdown
You are the **RLS Policy Expert** in the DATABASE sub-agent swarm.

**Your Focus**: Row-Level Security policy design and validation.

**Context Provided**:
- Table schema changes
- Existing RLS policies (if any)
- User roles and access patterns

**Your Task**:
1. Design RLS policies for new tables
2. Validate policy completeness (SELECT, INSERT, UPDATE, DELETE)
3. Check for policy bypasses or gaps
4. Ensure multi-tenancy isolation
5. Verify admin override paths

**Output Format**:
```json
{
  "policies_needed": [
    { "table": "...", "operation": "...", "policy_sql": "..." }
  ],
  "gaps_identified": ["..."],
  "security_score": 0-100,
  "recommendations": ["..."]
}
```

**Constraints**:
- Focus ONLY on RLS and access control
- Do not design schema or write migrations
- Consider Supabase-specific patterns
```

### Testing Swarm: E2E Automation Engineer Prompt

```markdown
You are the **E2E Automation Engineer** in the TESTING sub-agent swarm.

**Your Focus**: End-to-end test design using Playwright.

**Context Provided**:
- User stories / acceptance criteria
- Page/component structure
- Existing E2E test patterns

**Your Task**:
1. Design E2E test scenarios for new features
2. Identify happy path and error path tests
3. Define test data requirements
4. Consider cross-browser requirements
5. Flag flaky test risks

**Output Format**:
```json
{
  "test_scenarios": [
    {
      "name": "...",
      "user_story_ref": "US-XXX",
      "steps": ["..."],
      "assertions": ["..."],
      "test_data": {...}
    }
  ],
  "coverage_gaps": ["..."],
  "flaky_risks": ["..."],
  "estimated_test_count": N
}
```

**Constraints**:
- Focus ONLY on E2E Playwright tests
- Do not write unit or integration tests
- Follow existing test patterns in codebase
```

---

## Cost-Benefit Analysis

### Cost Factors

| Factor | Single Agent | Swarm (4 advisors) |
|--------|-------------|-------------------|
| API calls per invocation | 1 | 5 (1 lead + 4 advisors) |
| Tokens per invocation | ~4K | ~8K (smaller contexts each) |
| Latency | Sequential | Parallel (similar wall time) |

**Estimated Cost Increase**: 2-3x per invocation

### Benefit Factors

| Benefit | Value |
|---------|-------|
| Reduced false positives | Fewer bad proposals approved → less rework |
| Reduced false negatives | Fewer good proposals rejected → faster innovation |
| Deeper analysis | Specialists catch issues generalists miss |
| Parallel execution | No latency increase despite more agents |
| Context isolation | Cleaner reasoning, fewer hallucinations |

**Estimated Benefit**: 4-6x improvement in decision quality

### ROI Calculation

```
Cost: 2.5x API cost increase
Benefit: 5x decision quality improvement

Net ROI: 2x (benefit outweighs cost)
```

---

## Implementation Checklist

### Phase 1: Board of Directors Swarms

- [ ] Design Skeptic advisor prompts (4 advisors)
- [ ] Design Pragmatist advisor prompts (4 advisors)
- [ ] Design Visionary advisor prompts (4 advisors)
- [ ] Create swarm_compositions table
- [ ] Implement lead-advisor communication pattern
- [ ] Implement synthesis/merge logic
- [ ] Update board-vetting.js to use swarm
- [ ] Test with sample proposals
- [ ] Measure quality improvement

### Phase 2: Sub-Agent Swarms (DATABASE, TESTING)

- [ ] Design DATABASE advisor prompts (5 advisors)
- [ ] Design TESTING advisor prompts (6 advisors)
- [ ] Extend swarm infrastructure
- [ ] Update sub-agent entry points
- [ ] Implement progressive refinement pattern
- [ ] Test with real SDs
- [ ] Measure coverage improvement

### Phase 3: Sub-Agent Swarms (RCA, VALIDATION)

- [ ] Design RCA advisor prompts (6 advisors)
- [ ] Design VALIDATION advisor prompts (5 advisors)
- [ ] Implement competitive analysis pattern
- [ ] Test with real failures
- [ ] Measure resolution time improvement

---

## Related Documents

- [Swarm Mode Readiness Rubric](./swarm-mode-readiness-rubric.md)
- [Board Vetting Migration](../../database/migrations/20260202_model_families_board_vetting.sql)
- [Vetting Engine](../../lib/sub-agents/vetting/index.js)
- [Debate Orchestrator](../../lib/sub-agents/vetting/debate-orchestrator.js)

---

## Changelog

| Date | Change |
|------|--------|
| 2026-02-02 | Initial hierarchical swarm architecture design |

