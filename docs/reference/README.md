# Reference Documentation Index

> **DATABASE-FIRST (LEO Protocol v4.3.3)**: This index helps navigate the reference directory.
> For live protocol data, query the database tables directly.

This directory contains quick reference guides, patterns, and technical specifications.

---

## LEO Documentation Hub

**Many LEO Protocol-specific documents have been moved to the centralized LEO hub.**

See **[/docs/leo/README.md](../leo/README.md)** for:
- Handoff documentation → `/docs/leo/handoffs/`
- Sub-agent documentation → `/docs/leo/sub-agents/`
- Command documentation → `/docs/leo/commands/`
- Operational documentation → `/docs/leo/operational/`
- Phase documentation → `/docs/leo/phases/`
- Gate documentation → `/docs/leo/gates/`

---

---

## Quick Navigation

| Category | Files | Description |
|----------|-------|-------------|
| [Database & Schema](#database-schema) | 12 | Database patterns, schemas, migrations |
| [Sub-Agents](#sub-agents) | 14 | Sub-agent patterns and guides |
| [Validation & Testing](#validation-testing) | 9 | Validation patterns, testing reference |
| [LEO Protocol](#leo-protocol) | 14 | Protocol reference, context management, hooks |
| [Patterns & Best Practices](#patterns-best-practices) | 12 | Development patterns |
| [Quick References](#quick-references) | 12 | Cheat sheets and quick guides |
| [Other](#other-references) | 7 | Miscellaneous references |

**Total References**: 80

---

## Database & Schema

| Reference | Description |
|-----------|-------------|
| [strategic-directives-v2-schema.md](strategic-directives-v2-schema.md) | SD table schema documentation |
| [strategic-directives-v2-schema-mapping.md](strategic-directives-v2-schema-mapping.md) | Schema field mapping |
| [sd-hierarchy-schema-guide.md](sd-hierarchy-schema-guide.md) | SD hierarchy patterns |
| [database-schema-overview.md](database-schema-overview.md) | Database overview |
| [database-best-practices.md](database-best-practices.md) | Database best practices |
| [database-query-best-practices.md](database-query-best-practices.md) | Query optimization |
| [database-first-enforcement-expanded.md](database-first-enforcement-expanded.md) | Database-first enforcement |
| [database-agent-patterns.md](database-agent-patterns.md) | Database agent patterns |
| [database-agent-anti-patterns.md](database-agent-anti-patterns.md) | Anti-patterns to avoid |
| [database-agent-first-responder.md](database-agent-first-responder.md) | First responder patterns |
| [database-migration-application-pattern.md](database-migration-application-pattern.md) | Migration patterns |
| [supabase-operations.md](supabase-operations.md) | Supabase operations |

---

## Sub-Agents

| Reference | Description |
|-----------|-------------|
| [sub-agent-system.md](../leo/sub-agents/sub-agent-system.md) | Complete sub-agent system reference |
| [sub-agents.md](../leo/sub-agents/sub-agents.md) | Sub-agent overview |
| [sub-agent-patterns-guide.md](agent-patterns-guide.md) | Sub-agent patterns |
| [sub-agent-compression.md](sub-agent-compression.md) | Context compression |
| [agent-subagent-backstory-system.md](agent-subagent-backstory-system.md) | Backstory system |
| [agent-patterns-guide.md](agent-patterns-guide.md) | Agent patterns guide |
| [native-sub-agent-invocation.md](native-sub-agent-invocation.md) | Native invocation |
| [generic-sub-agent-executor-framework.md](generic-sub-agent-executor-framework.md) | Executor framework |
| [preventing-missed-subagents.md](preventing-missed-subagents.md) | Prevent missing sub-agents |
| [qa-director-guide.md](qa-director-guide.md) | QA Director guide |
| [design-sub-agent-guide.md](../leo/sub-agents/design-sub-agent-guide.md) | Design sub-agent |
| [design-subagent-application-expertise.md](design-subagent-application-expertise.md) | Design expertise |
| [retro-sub-agent-guide.md](../leo/sub-agents/retro-sub-agent-guide.md) | Retrospective agent |
| [root-cause-agent.md](root-cause-agent.md) | Root cause agent |

---

## Validation & Testing

| Reference | Description |
|-----------|-------------|
| [validation-enforcement.md](validation-enforcement.md) | Validation enforcement framework |
| [validation-enforcement-patterns.md](validation-enforcement-patterns.md) | Enforcement patterns |
| [validation-agent-proactive-gates.md](validation-agent-proactive-gates.md) | Proactive validation gates |
| [sd-type-applicability-policy-api.md](sd-type-applicability-policy-api.md) | SD-type-aware validation policy API |
| [e2e-testing-mode-configuration.md](e2e-testing-mode-configuration.md) | E2E test configuration |
| [user-story-e2e-mapping.md](user-story-e2e-mapping.md) | User story to E2E mapping |
| [test-timeout-handling.md](test-timeout-handling.md) | Test timeout handling |
| [verification-report-template.md](verification-report-template.md) | Verification templates |
| [leo-protocol-testing-improvements-2025-10-12.md](leo-protocol-testing-improvements-2025-10-12.md) | Testing improvements |

---

## LEO Protocol

| Reference | Description |
|-----------|-------------|
| [claude-code-hooks.md](claude-code-hooks.md) | **⭐ NEW v2.0** Claude Code hooks reference + unified context preservation system |
| [claude-md-router-architecture.md](claude-md-router-architecture.md) | CLAUDE.md router architecture |
| [context-monitoring.md](context-monitoring.md) | Context monitoring reference |
| [context-tracking-system.md](context-tracking-system.md) | Context tracking (token measurement) + unified state integration |
| [overflow-prevention-patterns.md](overflow-prevention-patterns.md) | Context overflow prevention |
| [agentic-context-engineering-v3.md](agentic-context-engineering-v3.md) | Context engineering |
| [claude-code-session-continuation.md](claude-code-session-continuation.md) | Session continuation |
| [exec-context.md](exec-context.md) | EXEC phase context |
| [handoff-system-guide.md](../leo/handoffs/handoff-system-guide.md) | Handoff system reference |
| [leo-hook-feedback-system.md](leo-hook-feedback-system.md) | Hook feedback system |
| [protocol-self-improvement.md](protocol-self-improvement.md) | Protocol self-improvement |
| [session-start-gate-implementation.md](session-start-gate-implementation.md) | SESSION_START gate implementation + state structure mismatch fix |
| [session-summary-feature.md](session-summary-feature.md) | **⭐ NEW** Session summary at orchestrator completion (AUTO-PROCEED SD-08) |
| [skip-and-continue-pattern.md](skip-and-continue-pattern.md) | **⭐ NEW** Skip-and-continue for validation gate failures (AUTO-PROCEED D16) |

---

## Patterns & Best Practices

| Reference | Description |
|-----------|-------------|
| [best-practices.md](best-practices.md) | General best practices |
| [boundary-examples.md](boundary-examples.md) | Boundary examples |
| [checkpoint-pattern.md](checkpoint-pattern.md) | Checkpoint patterns |
| [contract-patterns.md](contract-patterns.md) | Contract patterns |
| [pattern-lifecycle.md](pattern-lifecycle.md) | Pattern lifecycle |
| [parallel-execution-patterns.md](parallel-execution-patterns.md) | Parallel execution |
| [parallel-execution-opportunities.md](parallel-execution-opportunities.md) | Parallel opportunities |
| [refactoring-patterns.md](refactoring-patterns.md) | Refactoring patterns |
| [retrospective-patterns-skill-content.md](retrospective-patterns-skill-content.md) | Retrospective patterns |
| [trigger-disable-pattern.md](trigger-disable-pattern.md) | Trigger disable patterns |
| [prd-prevention-implementation.md](prd-prevention-implementation.md) | PRD prevention |
| [progressive-learning-format.md](progressive-learning-format.md) | Progressive learning |

---

## Quick References

| Reference | Description |
|-----------|-------------|
| [quick-reference.md](quick-reference.md) | General quick reference |
| [guide.md](guide.md) | Quick start guide |
| [script-creation-guidelines.md](script-creation-guidelines.md) | **NEW**: SD/PRD script creation policy |
| [sd-completion-critical-fields.md](sd-completion-critical-fields.md) | SD completion fields |
| [sd-evaluation-checklist.md](sd-evaluation-checklist.md) | SD evaluation checklist |
| [sd-type-classification.md](sd-type-classification.md) | SD type classification module reference |
| [sd-key-generator-guide.md](sd-key-generator-guide.md) | SD key generation patterns |
| [sd-validation-profiles.md](sd-validation-profiles.md) | Validation rules per SD type |
| [exec-component-recommendations-guide.md](exec-component-recommendations-guide.md) | EXEC component recommendations |
| [component-registry.md](component-registry.md) | Component registry |
| [file-warning.md](file-warning.md) | File warning reference |
| [MODEL-ALLOCATION-STRATEGY.md](MODEL-ALLOCATION-STRATEGY.md) | Model allocation |

---

## Other References

| Reference | Description |
|-----------|-------------|
| [documentation-platform.md](documentation-platform.md) | Documentation platform |
| [github-safety-enhancements.md](github-safety-enhancements.md) | GitHub safety |
| [server-architecture-guide.md](server-architecture-guide.md) | Server architecture |
| [researcher-agent-workflow.md](researcher-agent-workflow.md) | Researcher agent |
| [audit-format-spec.md](audit-format-spec.md) | Audit format specification |
| [audit-to-sd-pipeline.md](audit-to-sd-pipeline.md) | Audit to SD pipeline |
| [PROTOCOL-SELF-IMPROVEMENT-DOCUMENTATION-SUMMARY.md](PROTOCOL-SELF-IMPROVEMENT-DOCUMENTATION-SUMMARY.md) | Protocol improvement summary |

---

## Getting Started

**Looking for patterns?**
1. [best-practices.md](best-practices.md) - Start here
2. [boundary-examples.md](boundary-examples.md) - Understand boundaries

**Database work?**
1. [database-best-practices.md](database-best-practices.md) - Best practices
2. [database-agent-patterns.md](database-agent-patterns.md) - Agent patterns

**Sub-agent development?**
1. [sub-agent-system.md](../leo/sub-agents/sub-agent-system.md) - Complete reference
2. [sub-agent-patterns-guide.md](agent-patterns-guide.md) - Patterns

**Creating SDs or PRDs?**
1. [script-creation-guidelines.md](script-creation-guidelines.md) - **CRITICAL**: Script creation policy
2. [../guides/prd-creation-process.md](../guides/prd-creation-process.md) - PRD creation workflow

---

## Subdirectories

| Directory | Description |
|-----------|-------------|
| `/docs/reference/schema/` | Database schema documentation |

---

## Related Documentation

- `/CLAUDE.md` - LEO Protocol context router
- `/docs/guides/` - How-to guides
- `/docs/troubleshooting/` - Problem resolution

---

*Part of LEO Protocol v4.3.3 - Reference Index*
*Updated: 2026-01-25*
*Comprehensive index of 80 reference documents*
