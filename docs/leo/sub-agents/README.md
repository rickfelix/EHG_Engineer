# LEO Sub-Agent System

Documentation for the LEO Protocol sub-agent system.

## Sub-Agent Overview

Sub-agents are specialized agents that handle domain-specific validation and execution within the LEO Protocol.

## Available Sub-Agents

| Code | Name | Domain |
|------|------|--------|
| SECURITY | Security Agent | Authentication, authorization, OWASP |
| DATABASE | Database Agent | Schema, migrations, RLS policies |
| TESTING | Testing Agent | Coverage, E2E, test generation |
| DESIGN | Design Agent | UI/UX, accessibility, components |
| PERFORMANCE | Performance Agent | Load testing, optimization |
| API | API Agent | REST/GraphQL design, endpoints |
| GITHUB | GitHub Agent | CI/CD, workflows, deployments |
| RISK | Risk Agent | Risk assessment, mitigation |
| RETRO | Retrospective Agent | Lessons learned, improvement |
| REGRESSION | Regression Agent | Backward compatibility |
| VALIDATION | Validation Agent | Duplicate detection |
| UAT | UAT Agent | User acceptance testing |
| STORIES | Stories Agent | User story context |
| DOCMON | Documentation Monitor | Doc updates, triggers |
| RCA | Root Cause Analysis | Defect diagnosis |

## Invoking Sub-Agents

### Via Task Tool

```
Use Task tool with subagent_type="SECURITY"
```

### Via Script

```bash
npm run subagent:execute SECURITY <SD-ID>
```

### Via Trigger Keywords

Sub-agents are automatically triggered by keywords in user queries. See CLAUDE.md for the complete trigger keyword list.

## Sub-Agent Lifecycle

```
PENDING → RUNNING → PASS/FAIL/ERROR/TIMEOUT
```

Terminal states cannot transition further.

---

*Back to [LEO Hub](../README.md)*
