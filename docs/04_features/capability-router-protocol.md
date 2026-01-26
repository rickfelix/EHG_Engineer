# Capability Router Protocol


## Metadata
- **Category**: Protocol
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-19
- **Tags**: database, api, testing, migration

**SD**: SD-LIFECYCLE-GAP-004 - Multi-Venture Portfolio Coordination
**Created**: 2026-01-19
**Status**: Active
**Part of**: Venture Lifecycle Gap Remediation (SD-LIFECYCLE-GAP-000)

---

## Overview

The Capability Router Protocol defines how ventures within the EHG portfolio discover, share, and reuse capabilities across the 25-stage venture lifecycle. This protocol addresses the gap identified in the 40-stage to 25-stage consolidation where multi-venture coordination was implicit but not explicit.

## Secondary Output Requirement

Every venture stage produces a **Primary Output** (the stage deliverable) and a **Secondary Output** (capability artifact for the Capability Library).

### Stage Secondary Outputs by Phase

#### Phase 1: Ideation (Stages 1-5)

| Stage | Primary Output | Secondary Output |
|-------|---------------|------------------|
| 1. Problem Discovery | Problem Statement | Market Research Template |
| 2. Solution Ideation | Solution Concepts | Ideation Workshop Framework |
| 3. Market Validation | Market Analysis | Competitive Analysis Template |
| 4. Business Model | Business Model Canvas | Revenue Model Patterns |
| 5. Feasibility Assessment | Feasibility Report | Technical Feasibility Checklist |

#### Phase 2: Validation (Stages 6-10)

| Stage | Primary Output | Secondary Output |
|-------|---------------|------------------|
| 6. MVP Definition | MVP Specification | Feature Prioritization Matrix |
| 7. Prototype Development | Working Prototype | Rapid Prototyping Patterns |
| 8. User Testing | Test Results | User Testing Playbook |
| 9. Iteration Cycles | Refined Product | A/B Testing Framework |
| 10. Validation Metrics | Validation Report | Metric Dashboard Template |

#### Phase 3: Development (Stages 11-15)

| Stage | Primary Output | Secondary Output |
|-------|---------------|------------------|
| 11. Architecture Design | System Architecture | Architecture Decision Records |
| 12. Core Development | Core Features | Code Patterns Library |
| 13. Integration | Integrated System | API Integration Guides |
| 14. Quality Assurance | QA Sign-off | Test Automation Suite |
| 15. Launch Preparation | Launch Plan | Launch Checklist Template |

#### Phase 4: Scaling (Stages 16-20)

| Stage | Primary Output | Secondary Output |
|-------|---------------|------------------|
| 16. Growth Strategy | Growth Plan | Growth Playbook |
| 17. Market Expansion | Expansion Results | Market Entry Templates |
| 18. Team Scaling | Scaled Team | Hiring & Onboarding Guides |
| 19. Process Optimization | Optimized Processes | SOP Library |
| 20. Partnership Development | Partner Network | Partnership Agreement Templates |

#### Phase 5: Exit (Stages 21-25)

| Stage | Primary Output | Secondary Output |
|-------|---------------|------------------|
| 21. Exit Strategy | Exit Plan | Exit Planning Framework |
| 22. Financial Preparation | Financial Package | Due Diligence Checklist |
| 23. Buyer/Acquirer Search | Qualified Prospects | Buyer Outreach Templates |
| 24. Negotiation | Term Sheet | Negotiation Playbook |
| 25. Transaction Completion | Completed Exit | Post-Exit Knowledge Base |

## Capability Library Structure

```
capability-library/
├── templates/           # Reusable document templates
├── frameworks/          # Decision-making frameworks
├── playbooks/           # Step-by-step guides
├── patterns/            # Code and architecture patterns
├── checklists/          # Validation checklists
└── knowledge-base/      # Lessons learned repository
```

## Capability Sharing Protocol

### 1. Capability Registration

When a venture completes a stage:
1. Primary output → Venture milestone
2. Secondary output → Capability Library submission
3. Capability metadata captured (type, tags, venture source, stage)

### 2. Capability Discovery

Ventures discover existing capabilities via:
- **Semantic Search**: Natural language queries
- **Tag Filtering**: Filter by capability type, phase, vertical
- **Reuse Recommendations**: AI-suggested capabilities based on current stage

### 3. Capability Adoption

When adopting a capability:
1. Fork from Capability Library
2. Customize for venture context
3. Track reuse metrics (source venture, adoption date)
4. Contribute improvements back to Library

### 4. Capability Evolution

Capabilities evolve through:
- Version control (semantic versioning)
- Deprecation notices
- Migration guides for breaking changes

## Portfolio Coordination Touchpoints

Explicit points where cross-venture coordination is evaluated:

| Touchpoint | Trigger | Coordination Action |
|------------|---------|---------------------|
| Stage Completion | Venture completes any stage | Secondary output submission required |
| Quarterly Review | Every 90 days | Cross-venture synergy assessment |
| Resource Allocation | Before major investment | Portfolio impact analysis |
| Exit Planning | Stage 21+ | Dependency analysis across portfolio |
| Capability Request | Any time | Check Library before building new |

## Capability Taxonomy

Capabilities are classified using the following taxonomy:

### Categories

1. **AI & Automation** (Plane 1 weight: 1.5x)
   - Agents, crews, tools, skills, prompts

2. **Infrastructure** (Plane 1 weight: 1.2x)
   - Database schemas, functions, RLS policies, migrations

3. **Application** (Plane 1 weight: 1.0x)
   - API endpoints, components, hooks, services

4. **Integration** (Plane 1 weight: 1.1x)
   - Workflows, webhooks, external integrations

5. **Governance** (Plane 1 weight: 1.3x)
   - Validation rules, quality gates, protocols

### Reuse Metrics

- **Reuse Count**: Number of ventures using capability
- **Reuse Velocity**: Rate of adoption over time
- **Ecosystem Lift**: Value multiplier from reuse
- **Health Status**: THRIVING / HEALTHY / DEVELOPING / NASCENT

## Integration with Existing Systems

### sd_capabilities Table

Capabilities are tracked in `sd_capabilities` with:
- `capability_type`: From taxonomy
- `plane1_score`: Maturity + extraction + centrality
- `reuse_count`, `reused_by_sds`: Adoption tracking
- `depends_on`, `depended_by`: Dependency graph

### Multi-Repo Awareness

The protocol integrates with multi-repo intelligence:
- EHG (Frontend): UI capabilities
- EHG_Engineer (Backend): Infrastructure capabilities
- Cross-repo capabilities tagged appropriately

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Capability Reuse Rate | >20% | Capabilities reused / total capabilities |
| Cross-Venture Dependency Coverage | 100% | Active ventures with tracked dependencies |
| Portfolio Coordination Checkpoint Compliance | >90% | Ventures passing coordination gates |
| Secondary Output Submission Rate | 100% | Stages with secondary output / total stages |

## Implementation References

- `lib/capabilities/capability-taxonomy.js` - Type definitions
- `lib/capabilities/capability-reuse-tracker.js` - Reuse tracking
- `lib/governance/portfolio-calibrator.js` - Portfolio calibration
- `database/migrations/20260108_capability_ledger_v2.sql` - Database schema

---

*Protocol defined as part of SD-LIFECYCLE-GAP-004 to address multi-venture coordination gap in 25-stage venture lifecycle model.*
