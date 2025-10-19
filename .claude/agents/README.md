# Claude Code Sub-Agents

This directory contains specialized sub-agent definitions for Claude Code AI assistant.

## Purpose

Sub-agents are specialized AI agents with focused responsibilities and domain expertise. They are automatically invoked based on task keywords and patterns.

## Agent Types

### Core LEO Protocol Agents
- **LEAD Agent** - Strategic validation, directive approval, simplicity enforcement
- **PLAN Agent** - PRD creation, validation gates, pre-EXEC verification
- **EXEC Agent** - Implementation, dual testing (unit + E2E), code execution

### Specialized Sub-Agents
- **docmon-agent** - Documentation generation, workflow docs, information architecture
- **design-agent** - UI/UX validation, component sizing, accessibility
- **dependency-agent** - npm updates, CVE scanning, dependency conflicts
- **database-agent** - Schema design, migrations, RLS policies, SQL validation
- **api-agent** - REST/GraphQL design, API architecture, versioning
- **testing-agent** - E2E testing, test generation, coverage validation
- **security-agent** - Authentication, authorization, security validation
- **github-agent** - CI/CD pipelines, GitHub Actions, workflow validation
- **validation-agent** - Codebase audits, duplicate detection, systems analysis
- **retro-agent** - Retrospective generation, lesson extraction
- **performance-agent** - Performance validation, optimization, load testing
- **uat-agent** - User acceptance testing, journey validation

## Agent File Structure

Each agent is defined in a markdown file with:

```markdown
# Agent Name

## Trigger Keywords
[List of keywords that invoke this agent]

## Responsibilities
[What this agent does]

## Tools Available
[Which tools the agent can use]

## Invocation Pattern
[When to proactively invoke this agent]
```

## Proactive Invocation

Agents marked "MUST BE USED PROACTIVELY" are automatically invoked when:
1. **Keyword detected** in user request
2. **Error pattern** matches agent expertise
3. **Task type** aligns with agent specialty

## Agent Communication

Sub-agents communicate via:
- **Handoffs**: Structured inter-agent communication (7-element format)
- **Reports**: Final deliverables returned to orchestrator
- **Context**: Shared via database and session state

## Creating New Agents

1. **Create markdown file**: `new-agent-name.md`
2. **Define triggers**: Keywords and patterns
3. **Specify tools**: Available tool permissions
4. **Document responsibilities**: Clear scope and boundaries
5. **Test invocation**: Verify trigger patterns work

## Agent Execution Modes

- **Synchronous**: Block until agent completes (default)
- **Parallel**: Multiple agents run concurrently
- **Background**: Agent runs async, retrieve results later

## Best Practices

1. **Single responsibility**: Each agent has one clear purpose
2. **Clear triggers**: Unambiguous keyword patterns
3. **Tool restrictions**: Only grant necessary tool access
4. **Bounded scope**: Agents don't overlap responsibilities
5. **Handoff protocol**: Use standardized handoff format

## Monitoring Agents

```bash
# List running agents
/agents

# View agent output
/agent-output <agent-id>

# Stop agent
/stop-agent <agent-id>
```

## Related Documentation

- `/docs/guides/INVISIBLE_SUBAGENT_SYSTEM_GUIDE.md` - Sub-agent architecture
- `/docs/guides/hybrid-sub-agent-workflow.md` - Hybrid workflow patterns
- `/docs/reference/sub-agent-compression.md` - Context optimization
- `/.claude/agent-responsibilities.md` - Agent responsibility matrix

---

*Part of LEO Protocol v4.2.0 - Multi-Agent Orchestration*
