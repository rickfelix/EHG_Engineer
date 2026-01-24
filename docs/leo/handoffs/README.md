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

## Documentation Files

| File | Description |
|------|-------------|
| [handoff-system-guide.md](handoff-system-guide.md) | Complete handoff system reference with gate patterns |
| [field-reference.md](field-reference.md) | Handoff field reference |
| [known-issues.md](known-issues.md) | Known issues and troubleshooting |

## Key Concepts

- **Gates**: Validation checkpoints executed during handoffs
- **Executors**: Phase-specific handoff handlers (LeadToPlanExecutor, etc.)
- **SD-Type-Aware Validation**: Different SD types have different validator requirements (Section 9 of guide)
- **SKIPPED Status**: Non-applicable validators are automatically skipped with traceability

---

*Back to [LEO Hub](../README.md)*
