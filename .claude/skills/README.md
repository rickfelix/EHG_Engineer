# .claude/skills/ — Reference Library (NOT Command Registration)

This directory contains **reference skill documents** used by sub-agents and internal
systems. Files here are NOT automatically registered as `/slash` commands.

## To register a new slash command

Create the file in **`.claude/commands/`** instead. That is the directory Claude Code
reads for user-invocable `/` commands.

## What belongs here

- EVA skill definitions (eva-*.skill.md) — used as reference by the EVA agent
- Agent-specific skill docs (testing-agent.md, schema-design.skill.md) — used by sub-agents
- Support/reference material that informs agent behavior but isn't a user command

## Common mistake

If you create a new interactive skill (like `/prove`, `/heal`, `/brainstorm`),
the definition MUST go in `.claude/commands/<name>.md`. Putting it only here means
the command won't be recognized by Claude Code.
