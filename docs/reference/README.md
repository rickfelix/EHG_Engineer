# Issues Documentation


## Table of Contents

- [Purpose](#purpose)
- [File Naming Convention](#file-naming-convention)
- [Severity Levels](#severity-levels)
- [Issue Document Structure](#issue-document-structure)
- [Description](#description)
- [Steps to Reproduce](#steps-to-reproduce)
- [Impact](#impact)
- [Root Cause](#root-cause)
- [Workaround](#workaround)
- [Resolution](#resolution)
- [Prevention](#prevention)
- [Issue Lifecycle](#issue-lifecycle)
- [Integration with SD System](#integration-with-sd-system)
- [Tracking](#tracking)
- [Related Documentation](#related-documentation)
- [Quick Issue Template](#quick-issue-template)
- [Description](#description)
- [Impact](#impact)
- [Workaround](#workaround)
- [Files](#files)

This directory contains documented issues, bugs, and known problems.

## Purpose

Issue documentation tracks:
- **Bugs**: Defects and incorrect behavior
- **Technical debt**: Code quality issues
- **Blockers**: Issues preventing progress
- **Workarounds**: Temporary solutions

## File Naming Convention

```
{SEVERITY}_{COMPONENT}_{DESCRIPTION}.md
```

**Examples**:
- `CRITICAL_DATABASE_RLS_POLICY_BYPASS.md`
- `HIGH_API_RATE_LIMITING_ISSUE.md`
- `MEDIUM_UI_LAYOUT_SHIFT.md`

## Severity Levels

| Level | Description | Response Time |
|-------|-------------|---------------|
| **CRITICAL** | System down, data loss | Immediate |
| **HIGH** | Major feature broken | < 24 hours |
| **MEDIUM** | Feature degraded | < 1 week |
| **LOW** | Minor issue, cosmetic | Backlog |

## Issue Document Structure

```markdown
# [Severity] - [Component] - [Issue Title]

**Created**: YYYY-MM-DD
**Status**: [Open/In Progress/Resolved]
**Severity**: [Critical/High/Medium/Low]
**Component**: [Affected system/feature]
**Related SD/PRD**: [If applicable]

## Description
[Clear description of the issue]

## Steps to Reproduce
1. Step 1
2. Step 2
3. Expected vs Actual behavior

## Impact
- Users affected: [count/percentage]
- Features affected: [list]
- Business impact: [description]

## Root Cause
[If identified, describe root cause]

## Workaround
[Temporary solution if available]

## Resolution
[Permanent fix description]

## Prevention
[How to prevent in future]
```

## Issue Lifecycle

1. **Open**: Issue reported and documented
2. **Triaged**: Severity assigned, owner identified
3. **In Progress**: Fix being developed
4. **Resolved**: Fix implemented and tested
5. **Closed**: Verified in production

## Integration with SD System

Critical and high severity issues may trigger:
- Emergency Strategic Directive
- Hotfix implementation
- Post-mortem retrospective

## Tracking

Issues can also be tracked in:
- **GitHub Issues**: For public visibility
- **Database**: `issues` table (if exists)
- **This directory**: For detailed documentation

## Related Documentation

- `/docs/analysis/` - Root cause analysis documents
- `/docs/retrospectives/` - Post-mortem reviews
- `/docs/troubleshooting/` - Common problems and solutions

## Quick Issue Template

```bash
# Create new issue document
cat > docs/issues/SEVERITY_COMPONENT_ISSUE.md << 'EOF'
# [Severity] - [Component] - [Issue Title]

**Created**: $(date +%Y-%m-%d)
**Status**: Open
**Severity**:
**Component**:

## Description


## Impact


## Workaround

EOF
```

---

*Part of LEO Protocol v4.3.3 - Issue Management*
*Updated: 2025-12-29*

## Files

- [Agent Subagent Backstory System](agent-subagent-backstory-system.md)
- [Agent Team Collaboration Guide](agent-team-collaboration-guide.md)
- [Agents Observability](agents-observability.md)
- [Always Check Existing Patterns First](always-check-existing-patterns-first.md)
- [Auto Learning Capture Hooks](auto-learning-capture-hooks.md)
- [Best Practices](best-practices.md)
- [Boundary Examples](boundary-examples.md)
- [Boundary Enforcement Example](boundary_enforcement_example.md)
- [Central Planner](central-planner.md)
- [Claude Generation Readme](claude-generation-readme.md)
- [Claude Md Optimization](claude-md-optimization.md)
- [Claude Prompts Readme](claude-prompts-readme.md)
- [Cli Readme](cli-readme.md)
- [Context Tracking System](context-tracking-system.md)
- [CONTEXT OPTIMIZATION GUIDE](context-optimization-guide.md)
- [Contract Patterns](contract-patterns.md)
- [Database Agent Anti Patterns](database-agent-anti-patterns.md)
- [Database Agent First Responder](database-agent-first-responder.md)
- [Database Migration Application Pattern](database-migration-application-pattern.md)
- [Database Query Best Practices](database-query-best-practices.md)
- [Design Subagent Application Expertise](design-subagent-application-expertise.md)
- [DISK IO QUICK START](disk-io-quick-start.md)
- [Docs Info Architecture](docs-info-architecture.md)
- [Documentation Platform](documentation-platform.md)
- [EVA MANIFESTO V1](eva-manifesto-v1.md)
- [Exec Context](exec-context.md)
- [Feedback Resolution Enforcement Schema](feedback-resolution-enforcement-schema.md)
- [File Warning](file-warning.md)
- [Genesis Codebase Guide](genesis-codebase-guide.md)
- [Github Safety Enhancements](github-safety-enhancements.md)
- [Guide](guide.md)
- [Handoff Resolution Lifecycle Pattern](handoff-resolution-lifecycle-pattern.md)
- [ISSUE PATTERN PRD INTEGRATION](issue-pattern-prd-integration.md)
- [Keyword Management Process](keyword-management-process.md)
- [Leo Assist Command](leo-assist-command.md)
- [Leo Hook Feedback System](leo-hook-feedback-system.md)
- [MIGRATION AGENT METRICS](migration-agent-metrics.md)
- [MODEL VERSION UPGRADE RUNBOOK](model-version-upgrade-runbook.md)
- [Oiv Verification Patterns](oiv-verification-patterns.md)
- [Overflow Prevention Patterns](overflow-prevention-patterns.md)
- [Parent Prd Derivation Guide](parent-prd-derivation-guide.md)
- [PATTERN EXTRACTION ISSUE](pattern-extraction-issue.md)
- [Pattern Lifecycle](pattern-lifecycle.md)
- [Plan Mode Integration](plan-mode-integration.md)
- [Prd Inline Schema](prd-inline-schema.md)
- [Prd Prevention Implementation](prd-prevention-implementation.md)
- [Preventing Missed Subagents](preventing-missed-subagents.md)
- [Protocol Improvements Readme](protocol-improvements-readme.md)
- [PROTOCOL SELF IMPROVEMENT DOCUMENTATION SUMMARY](protocol-self-improvement-documentation-summary.md)
- [QF 20251120 702 Python None Strip Error](qf-20251120-702-python-none-strip-error.md)
- [QUALITY LIFECYCLE README](quality-lifecycle-readme.md)
- [Rca Auto Proceed Empty Metrics 2026 01 30](rca-auto-proceed-empty-metrics-2026-01-30.md)
- [Rca Multi Expert Collaboration](rca-multi-expert-collaboration.md)
- [Rca Skill Rename 2026 01 26](rca-skill-rename-2026-01-26.md)
- [Rca Trigger Sdk](rca-trigger-sdk.md)
- [Retrospective Signals Api](retrospective-signals-api.md)
- [Sd Completion Critical Fields](sd-completion-critical-fields.md)
- [Sd Evaluation Checklist](sd-evaluation-checklist.md)
- [Sd Hierarchy Schema Guide](sd-hierarchy-schema-guide.md)
- [Sd Type Classification](sd-type-classification.md)
- [Sd Workflow Templates](sd-workflow-templates.md)
- [Server Architecture Guide](server-architecture-guide.md)
- [Session Summary Feature](session-summary-feature.md)
- [Severity Weighted Pattern Prioritization](severity-weighted-pattern-prioritization.md)
- [Skip And Continue Pattern](skip-and-continue-pattern.md)
- [Strategic Directives V2 Schema Mapping](strategic-directives-v2-schema-mapping.md)
- [Supabase Migration Manual Pattern](supabase-migration-manual-pattern.md)
- [Synchronization Report](synchronization-report.md)
- [Trigger Disable Pattern](trigger-disable-pattern.md)
- [TROUBLESHOOTING](troubleshooting.md)
- [User Story E2e Mapping](user-story-e2e-mapping.md)
- [User Story Validation Gap](user-story-validation-gap.md)
- [User Story Validation Monitoring](user-story-validation-monitoring.md)
- [Validation Enforcement Patterns](validation-enforcement-patterns.md)
- [Validation Gate Registry](validation-gate-registry.md)
- [Verification Report Template](verification-report-template.md)
- [Vision Visualization Readme](vision-visualization-readme.md)
