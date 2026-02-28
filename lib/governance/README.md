# lib/governance — Governance & Decision Enforcement

Protocol governance enforcement layer. Provides the Decision Filter Engine (DFE), chairman escalation routing, guardrail registry, budget enforcement, and manifesto-mode controls.

---

## Entry Point

```js
import { evaluateDecision } from './decision-filter-engine.js';
import { createEscalationRecord, persistEscalation } from './chairman-escalation.js';
import { GuardrailRegistry } from './guardrail-registry.js';
```

---

## Modules

| File | Purpose |
|------|---------|
| `decision-filter-engine.js` | Core DFE: evaluates SD/gate context and returns AUTO_PROCEED, ESCALATE, or STOP decisions with confidence scoring |
| `chairman-escalation.js` | Routes DFE `ESCALATE` decisions to `chairman_decisions` table for governance oversight; supports dependency injection for testability |
| `guardrail-registry.js` | Registry of governance guardrails; evaluated before gate transitions to enforce protocol constraints |
| `budget-check.js` | Token/cost budget enforcement; returns usage percentage and remaining budget |
| `four-oaths-enforcement.js` | Enforces the Four Oaths protocol constraints on SD execution |
| `manifesto-mode.js` | Manifesto-mode activation and enforcement (elevated governance posture) |
| `hard-halt-protocol.js` | Hard halt triggers: conditions that force immediate execution stop |
| `semantic-diff-validator.js` | Validates semantic equivalence between two versions of a document or spec |
| `compute-posture.js` | Determines compute posture (aggressive/standard/conservative) based on system state |
| `portfolio-calibrator.js` | Calibrates portfolio-level governance thresholds across ventures |

---

## DFE Decision Flow

```
Gate/Stage input
       │
       ▼
decision-filter-engine.js
  ├── AUTO_PROCEED  → continue execution automatically
  ├── ESCALATE      → chairman-escalation.js → chairman_decisions table
  └── STOP          → hard-halt-protocol.js → execution stopped
```

### Chairman Escalation Record

When DFE returns `ESCALATE`, `createEscalationRecord()` produces:

```js
{
  decision_type: 'dfe_escalation',
  status: 'pending',           // pending → reviewed → approved/rejected
  blocking: false,             // advisory by default
  priority: 'medium',
  title: 'DFE Escalation: confidence 0.42',
  context: {
    confidence: 0.42,
    gate_type: 'PLAN-TO-EXEC',
    sd_id: '...',
    sd_key: 'SD-XXX-001',
    source: 'decision-filter-engine',
  }
}
```

---

## Guardrail Registry

`guardrail-registry.js` maintains a set of named guardrails evaluated at gate boundaries. Each guardrail has:
- `id` — unique identifier
- `evaluate(context)` — returns `{ passed, reason }`
- `blocking` — whether failure blocks execution or just warns

---

## Recent Changes

- **SD-MAN-FEAT-CORRECTIVE-VISION-GAP-067**: `chairman-escalation.js` and `guardrail-registry.js` added. GR-GOVERNANCE-CASCADE guardrail made blocking; bidirectional OKR cascade validation added.
- **SD-MAN-FEAT-CORRECTIVE-VISION-GAP-072**: Governance audit trail, HANDOFF_NEXT_CMD signal, bypass-proof sequence enforcement.

---

*Part of LEO Protocol v4.3.3 — Governance & Decision Enforcement*
