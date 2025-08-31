# EHG_Engineer Hook Configuration

## Overview
This directory contains minimal hook wrappers that **intentionally disable** hook execution for the EHG_Engineer project.

## Why Hooks are Disabled

1. **Built-in LEO Protocol Integration**: The EHG_Engineer platform has LEO Protocol v3.1.5.9 integration built directly into the codebase through:
   - Vision QA System (`lib/testing/vision-qa-agent.js`)
   - Agent workflow templates (`templates/agent-workflows/`)
   - Decision helpers (`scripts/vision-qa-decision.js`)

2. **Prevents Cross-Project Interference**: Disabling hooks prevents errors from the ehg-replit project hooks trying to run in the wrong context.

3. **Simplified Architecture**: The LEO Protocol agents (LEAD, PLAN, EXEC) determine their own roles and workflows without needing external hook detection.

## How LEO Protocol Works Without Hooks

Instead of hooks, the EHG_Engineer platform uses:

- **Explicit Role Declaration**: Agents declare their role in communication headers
- **Built-in Verification**: Vision QA and other verification tools are called directly by agents
- **Template-Based Workflows**: Agents follow workflow templates in `templates/agent-workflows/`
- **Smart Decision Helpers**: Tools like `vision-qa-decision.js` help agents determine when to use Vision QA

## Configuration

See `.claude-code-config.json` for the project configuration that explicitly disables hooks.

## If You Need Hooks

If you later decide you need hooks for specific automation:

1. Update `.claude-code-config.json` to enable hooks
2. Replace the minimal wrappers with actual hook logic
3. Ensure hooks don't interfere with built-in LEO Protocol features

## Related Documentation

- LEO Protocol: `docs/03_protocols_and_standards/leo_protocol_v3.1.5.md`
- Vision QA Integration: `docs/03_protocols_and_standards/leo_vision_qa_integration.md`
- Agent Workflows: `templates/agent-workflows/`