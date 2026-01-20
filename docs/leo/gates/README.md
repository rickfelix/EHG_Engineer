# LEO Gate System

Quality gate documentation and specifications.

## Contents

| Document | Description |
|----------|-------------|
| [gates.md](gates.md) | Complete gate specifications |

## Gate Overview

Gates enforce quality standards before implementation. Each gate must score at or above the SD type threshold to pass.

## Gate Summary

| Gate | Name | Focus | Weight Breakdown |
|------|------|-------|------------------|
| 2A | Architecture | ADRs, Interfaces, Tech Design | 35%/35%/30% |
| 2B | Design & DB | Design Artifacts, Schema | 50%/50% |
| 2C | Security & Risk | Security Scan, Risk Spikes | 60%/40% |
| 2D | NFR & Testing | Performance, Coverage, Test Plan | 30%/30%/40% |
| 3 | Final | Supervisor Verification | 100% |

## Thresholds by SD Type

| SD Type | Threshold |
|---------|-----------|
| feature | 85% |
| database | 75% |
| infrastructure | 80% |
| security | 90% |
| documentation | 60% |
| orchestrator | 70% |
| refactor | 80% |
| bugfix | 80% |
| performance | 85% |

## Running Gates

```bash
# Run individual gate
PRD_ID="PRD-SD-001" npx tsx tools/gates/gate2a.ts

# Run all gates
npm run gate:all PRD-SD-001
```

## Gate Dependencies

```
2A (Architecture) ──┐
2B (Design)      ───┼──→ Gate 3 (Final) → Implementation
2C (Security)    ───┤
2D (NFR/Test)    ───┘
```

---

*Back to [LEO Hub](../README.md)*
