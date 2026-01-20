# LEO Protocol Documentation Hub

Central documentation for the LEO (LEAD-EXEC-OPS) Protocol system.

## Overview

The LEO Protocol is a structured software development governance framework that enforces quality through:
- **LEAD Phase**: Strategic directive approval and scoping
- **PLAN Phase**: PRD generation and gate validation
- **EXEC Phase**: Implementation with quality enforcement

## Quick Start

| I want to... | Go to... |
|--------------|----------|
| Understand LEO phases | [Phases Overview](phases/README.md) |
| Learn the gate system | [Gates Documentation](gates/README.md) |
| Use sub-agents | [Sub-Agent System](sub-agents/README.md) |
| Create handoffs | [Handoff Guide](handoffs/README.md) |
| Run commands | [Command Reference](commands/README.md) |
| Call the API | [API Documentation](api/README.md) |

## Documentation Structure

```
docs/leo/
├── README.md                    # This file - Central index
├── protocol/                    # Protocol specifications
│   └── README.md
├── phases/                      # Phase documentation
│   └── README.md
├── gates/                       # Gate system
│   ├── README.md
│   └── gates.md
├── api/                         # API reference
│   ├── README.md
│   └── api.md
├── handoffs/                    # Handoff system
│   └── README.md
├── sub-agents/                  # Sub-agent documentation
│   └── README.md
├── commands/                    # Command reference
│   └── README.md
└── operational/                 # Operational docs
    └── README.md
```

## Key Concepts

### The Three Phases

1. **LEAD (Leadership & Direction)**
   - SD approval workflow
   - Complexity assessment
   - Risk evaluation

2. **PLAN (Planning & Design)**
   - PRD generation
   - Gate validation (2A, 2B, 2C, 2D, 3)
   - Sub-agent coordination

3. **EXEC (Execution & Delivery)**
   - Implementation
   - Testing
   - Quality enforcement

### Gate System

Quality gates enforce standards before implementation:

| Gate | Focus | Threshold |
|------|-------|-----------|
| 2A | Architecture & Interfaces | 85% |
| 2B | Design & Database | 85% |
| 2C | Security & Risk | 85% |
| 2D | NFR & Test Plan | 85% |
| 3 | Final Verification | Varies by SD type |

See [Gates Documentation](gates/README.md) for details.

### Sub-Agents

Specialized agents handle domain-specific validation:

| Agent | Domain |
|-------|--------|
| SECURITY | Authentication, authorization, OWASP |
| DATABASE | Schema, migrations, RLS |
| TESTING | Coverage, E2E, test plans |
| DESIGN | UI/UX, accessibility |
| PERFORMANCE | Load, optimization |

See [Sub-Agent System](sub-agents/README.md) for the complete list.

## Related Documentation

| Location | Content |
|----------|---------|
| `/CLAUDE_LEAD.md` | Auto-generated LEAD phase context |
| `/CLAUDE_PLAN.md` | Auto-generated PLAN phase context |
| `/CLAUDE_EXEC.md` | Auto-generated EXEC phase context |
| `/docs/03_protocols_and_standards/` | Protocol version specifications |
| `/docs/archive/protocols/` | Legacy protocol versions |

## Common Commands

```bash
# SD Queue Management
npm run sd:next          # Show intelligent SD queue
npm run sd:status        # Progress vs baseline

# Gate Validation
npm run gate:run 2A      # Run specific gate
npm run gate:all         # Run all gates

# Sub-Agent Execution
npm run subagent:execute SECURITY <SD-ID>

# Documentation
node scripts/generate-claude-md-from-db.js  # Regenerate CLAUDE.md
```

## Getting Help

- **Protocol Questions**: See [Protocol Overview](protocol/README.md)
- **Implementation Issues**: Check [Handoff Known Issues](handoffs/known-issues.md)
- **Command Usage**: See [Command Ecosystem](commands/command-ecosystem.md)

---

*LEO Protocol Version: 4.3.3*
*Last Updated: 2026-01-20*
