# LEO Handoff System

Documentation for the LEO Protocol handoff system.

## Handoff Overview

Handoffs enable context transfer between:
- Sessions (same user, different time)
- Phases (LEAD → PLAN → EXEC)
- Agents (sub-agent coordination)

## Creating Handoffs

```bash
# Create handoff via script
node scripts/handoff.js create --sd SD-XXX-001

# Execute handoff
node scripts/handoff.js execute LEAD-TO-PLAN SD-XXX-001
```

## Handoff Types

| Handoff | From | To | Purpose |
|---------|------|-----|---------|
| LEAD-TO-PLAN | LEAD | PLAN | Approved SD ready for PRD |
| PLAN-TO-EXEC | PLAN | EXEC | PRD approved, ready to implement |
| EXEC-TO-PLAN | EXEC | PLAN | Implementation complete, verify |
| PLAN-TO-LEAD | PLAN | LEAD | Final approval |

## Database Tables

| Table | Purpose |
|-------|---------|
| `sd_phase_handoffs` | Handoff records |
| `leo_handoff_executions` | Execution logs |

---

*Back to [LEO Hub](../README.md)*
